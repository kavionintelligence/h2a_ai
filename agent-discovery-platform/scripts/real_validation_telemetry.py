"""Export genuine OpenTelemetry SDK spans to Census's bounded OTLP JSON receiver.

Usage::

    provider, tracer, exporter = make_tracer(
        "repository-agent", agent_url, census_url, ingest_token, output_dir
    )
    with tracer.start_as_current_span("bedrock.converse") as span:
        response = provider_client.converse(...)  # Actual provider operation.
        span.set_attribute("gen_ai.operation.name", "chat")
        span.set_attribute("gen_ai.request.model", response.model)
        span.set_attribute("gen_ai.provider.name", "aws.bedrock")
        span.set_attribute("agent_census.llm_location", "external")
    provider.force_flush()

The caller instruments actual successful operations and observed model decisions. This
module creates no spans or behavior events. Project extensions are documented in
``parse_otlp``; they are not asserted to be standard GenAI conventions. Prompts, tool
arguments/results, exception messages, and request headers are never serialized.
Only the same sanitized OTLP JSON bytes sent to Census and minimal ingestion receipts
are saved. Provider responses must be recorded separately without credentials.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter, SpanExportResult

from agent_census.detection import NORMALIZED_EVENT_TYPES, OTLP_ATTRIBUTES
from agent_census.models import Candidate
from agent_census.security import redact


def _attributes(attributes: Any) -> list[dict[str, Any]]:
    return [
        {"key": key, "value": {"stringValue": value}}
        for key, value in (attributes or {}).items()
        if key in OTLP_ATTRIBUTES and isinstance(value, str)
    ]


def serialize_spans(spans: Sequence[ReadableSpan]) -> dict[str, Any]:
    """Convert SDK objects to the receiver's OTLP subset without inventing observations."""
    resources = []
    for span in spans:
        context = span.get_span_context()
        if context is None:
            continue
        serialized: dict[str, Any] = {
            "traceId": f"{context.trace_id:032x}",
            "spanId": f"{context.span_id:016x}",
            "startTimeUnixNano": str(span.start_time),
            "endTimeUnixNano": str(span.end_time),
            "attributes": _attributes(span.attributes),
            "status": {"code": span.status.status_code.value},
            "events": [
                {
                    "name": event.name,
                    "timeUnixNano": str(event.timestamp),
                    "attributes": _attributes(event.attributes),
                }
                for event in span.events
                if event.name.startswith("agent_census.")
                and event.name.removeprefix("agent_census.") in NORMALIZED_EVENT_TYPES
            ],
        }
        # Runtime-controlled names may contain user payloads; omit those names entirely.
        if re.fullmatch(r"[A-Za-z0-9_.:-]{1,120}", span.name):
            serialized["name"] = span.name
        if span.parent:
            serialized["parentSpanId"] = f"{span.parent.span_id:016x}"
        scope = span.instrumentation_scope
        resources.append(
            {
                "resource": {"attributes": _attributes(span.resource.attributes)},
                "scopeSpans": [
                    {
                        "scope": {"name": scope.name, "version": scope.version or ""}
                        if scope
                        else {},
                        "spans": [serialized],
                    }
                ],
            }
        )
    return {"resourceSpans": resources}


class CensusJSONSpanExporter(SpanExporter):
    """Synchronous, credential-safe SDK exporter with exact transmitted evidence files."""

    def __init__(self, census_url: str, ingest_token: str, output_dir: Path):
        Candidate.safe_endpoint(census_url)
        self._url = census_url.rstrip("/") + "/v1/traces"
        self._token = ingest_token
        self._client = httpx.Client(timeout=20, trust_env=False)
        self._lock = threading.Lock()
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.receipts: list[dict[str, Any]] = []
        self.accepted = 0
        self.failures = 0
        self._sequence = 0

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        if not spans:
            return SpanExportResult.SUCCESS
        payload = redact(serialize_spans(spans), (self._token,))
        body = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode()
        with self._lock:
            self._sequence += 1
            filename = f"batch-{self._sequence:06d}.json"
            (self.output_dir / filename).write_bytes(body)
            receipt: dict[str, Any] = {
                "batch": filename,
                "sha256": hashlib.sha256(body).hexdigest(),
                "span_count": len(spans),
                "trace_ids": sorted(
                    {f"{span.context.trace_id:032x}" for span in spans if span.context}
                ),
                "exported_at": datetime.now(UTC).isoformat(),
            }
            succeeded = False
            try:
                response = self._client.post(
                    self._url,
                    content=body,
                    headers={
                        "Authorization": "Bearer " + self._token,
                        "Content-Type": "application/json",
                    },
                )
                receipt["http_status"] = response.status_code
                count = response.headers.get("x-census-accepted", "")
                receipt["accepted"] = int(count) if count.isdecimal() else None
                succeeded = response.status_code == 200 and receipt["accepted"] is not None
                if succeeded:
                    self.accepted += receipt["accepted"]
            except Exception as exc:
                # Never store request/response bodies, URLs from errors or credentials.
                receipt["error_type"] = type(exc).__name__
            receipt["success"] = succeeded
            self.failures += int(not succeeded)
            self.receipts.append(receipt)
            (self.output_dir / "receipts.json").write_text(
                json.dumps(self.receipts, indent=2) + "\n", encoding="utf-8"
            )
            return SpanExportResult.SUCCESS if succeeded else SpanExportResult.FAILURE

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True  # SimpleSpanProcessor exports synchronously.

    def shutdown(self) -> None:
        self._client.close()


def make_tracer(
    service_name: str,
    endpoint: str,
    census_url: str,
    ingest_token: str,
    output_dir: str | Path,
    framework: str = "custom-openai-responses",
) -> tuple[TracerProvider, Any, CensusJSONSpanExporter]:
    """Create a separate SDK provider per real workload without changing global tracing."""
    Candidate.safe_endpoint(endpoint)
    resource = Resource.create(
        {
            "service.name": service_name,
            "service.namespace": "real-validation",
            "agent_census.endpoint": endpoint,
            "agent_census.framework": framework,
        }
    )
    provider = TracerProvider(resource=resource)
    slug = re.sub(r"[^A-Za-z0-9_-]", "_", service_name)[:100]
    exporter = CensusJSONSpanExporter(census_url, ingest_token, Path(output_dir) / "otlp" / slug)
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    return provider, provider.get_tracer("agent-census.real-validation", "1.0"), exporter
