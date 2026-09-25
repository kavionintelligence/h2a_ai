"""Explainable classification and correlation; no model calls or hidden inference."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any, Literal, cast
from urllib.parse import urlsplit, urlunsplit

from .models import (
    AgentFingerprint,
    AgentRecord,
    Candidate,
    Capability,
    Classification,
    Evidence,
    IdentityDecision,
    RuntimeEvent,
    stable_id,
)

EventType = Literal[
    "llm_call",
    "tool_call",
    "agent_call",
    "delegation",
    "memory_access",
    "external_api_call",
    "autonomous_action",
    "planning",
    "multi_step",
]
ClassificationState = Literal[
    "confirmed_agent",
    "probable_agent",
    "uncertain",
    "probable_service",
    "confirmed_non_agent",
]

BEHAVIOR_FIELDS = {
    "llm_call": "llm_interaction",
    "planning": "planning",
    "tool_call": "tool_usage",
    "memory_access": "memory_usage",
    "delegation": "delegation",
    "autonomous_action": "autonomous_actions",
    "multi_step": "multi_step",
}
DECLARATIONS = {"a2a_card", "agent_card", "declared_agent", "manual_registration", "registration"}

# An intentionally closed mapping: a novel tool name never acquires a guessed skill.
TOOL_CAPABILITIES: dict[str, tuple[str, ...]] = {
    "secret_scanner": ("code_security", "secret_detection", "security_analysis"),
    "secret_detection": ("secret_detection", "code_security"),
    "code_security": ("code_security",),
    "github.search_code": ("code_search", "repository_analysis"),
    "github.get_repository": ("repository_analysis",),
    "repository_analysis": ("repository_analysis",),
    "literature_search": ("literature_search",),
    "paper_search": ("literature_search",),
    "paper_analyzer": ("paper_analysis",),
    "paper_analysis": ("paper_analysis",),
    "image_classifier": ("image_classification",),
    "image_classification": ("image_classification",),
    "object_detector": ("object_detection",),
    "object_detection": ("object_detection",),
    "send_email": ("email_delivery",),
    "email.send": ("email_delivery",),
    "email_delivery": ("email_delivery",),
}

TASK_PATTERNS: dict[str, tuple[str, ...]] = {
    "code_security": (
        r"code security",
        r"security (?:analysis|review|scan)",
        r"(?:audit|scan|review) (?:the )?code",
        r"code_security",
    ),
    "secret_detection": (
        r"secret(?:s)? (?:detection|scan|scanning)",
        r"(?:detect|find|scan for) (?:secrets|credentials)",
        r"secret_detection",
    ),
    "repository_analysis": (
        r"github repositor(?:y|ies)",
        r"analy[sz]e repositor(?:y|ies)",
        r"repository analysis",
        r"repository_analysis",
    ),
    "code_search": (r"code search", r"search (?:for )?code", r"code_search"),
    "literature_search": (
        r"literature search",
        r"(?:find|search)(?: for)? (?:research )?papers",
        r"literature_search",
    ),
    "paper_analysis": (r"paper analysis", r"analy[sz]e (?:a |the )?papers?", r"paper_analysis"),
    "image_classification": (
        r"image classification",
        r"classify (?:an? |the )?images?",
        r"image_classification",
    ),
    "object_detection": (r"object detection", r"detect objects?", r"object_detection"),
    "email_delivery": (r"send (?:an? |the )?e?mails?", r"email delivery", r"email_delivery"),
}


def _evidence(candidates: list[Candidate]) -> list[Evidence]:
    """Deduplicate retransmissions without discarding evidence provenance."""
    found: dict[tuple[Any, ...], Evidence] = {}
    for candidate in candidates:
        for item in candidate.evidence:
            key = (
                (item.source, item.event_id, item.kind)
                if item.event_id
                else (item.source, item.kind, item.value, item.observed_at.isoformat())
            )
            previous = found.get(key)
            if previous is None or item.observed_at < previous.observed_at:
                found[key] = item
    return sorted(
        found.values(),
        key=lambda item: (
            item.observed_at,
            item.source,
            item.kind,
            item.event_id or "",
            item.value,
        ),
    )


def _consensus(values: list[str | None]) -> str | None:
    observed = {value for value in values if value}
    return next(iter(observed)) if len(observed) == 1 else None


def _endpoint(value: str) -> str:
    parts = urlsplit(value)
    hostname = (parts.hostname or "").lower()
    if ":" in hostname:
        hostname = f"[{hostname}]"
    port = parts.port
    if port and (parts.scheme.lower(), port) not in {("https", 443), ("http", 80)}:
        hostname += f":{port}"
    return urlunsplit((parts.scheme.lower(), hostname, parts.path or "/", "", ""))


def fingerprint(candidates: list[Candidate]) -> AgentFingerprint:
    if not candidates:
        raise ValueError("a fingerprint requires at least one observation")
    evidence = _evidence(candidates)
    kinds = {item.kind for item in evidence}
    anchors = sorted(
        {candidate.registration_id for candidate in candidates if candidate.registration_id}
    )
    if not anchors:
        anchors = sorted(
            {_endpoint(candidate.endpoint) for candidate in candidates if candidate.endpoint}
        )
    if not anchors:
        anchors = sorted(f"{candidate.source}:{candidate.candidate_id}" for candidate in candidates)
    models = {candidate.model for candidate in candidates if candidate.model}
    models.update(item.value for item in evidence if item.kind == "llm_call" and item.value)
    timestamps = [candidate.observed_at for candidate in candidates]
    timestamps.extend(item.observed_at for item in evidence)
    return AgentFingerprint(
        identity=stable_id("identity", anchors[0]),
        endpoint=_consensus([candidate.endpoint for candidate in candidates]),
        provider=_consensus([candidate.provider for candidate in candidates]),
        framework=_consensus([candidate.framework for candidate in candidates]),
        models=sorted(models),
        owner=_consensus([candidate.owner for candidate in candidates]),
        deployment=_consensus([candidate.deployment for candidate in candidates]),
        mcp_connections=sorted(
            {item.value for item in evidence if item.kind == "mcp_connection" and item.value}
        ),
        a2a_connections=sorted(
            {
                item.value
                for item in evidence
                if item.kind in {"agent_call", "delegation"} and item.value
            }
        ),
        input_types=sorted({value for candidate in candidates for value in candidate.input_types}),
        output_types=sorted(
            {value for candidate in candidates for value in candidate.output_types}
        ),
        capabilities=sorted({cap.name for cap in infer_capabilities(candidates)}),
        first_seen=min(timestamps),
        last_seen=max(timestamps),
        discovery_sources=sorted(
            {candidate.source for candidate in candidates} | {item.source for item in evidence}
        ),
        evidence=evidence,
        llm_interaction=True if "llm_call" in kinds else None,
        planning=True if "planning" in kinds else None,
        tool_usage=True if "tool_call" in kinds else None,
        memory_usage=True if "memory_access" in kinds else None,
        delegation=True if "delegation" in kinds else None,
        autonomous_actions=True if "autonomous_action" in kinds else None,
        multi_step=True if "multi_step" in kinds else None,
    )


def classify(fp: AgentFingerprint, candidates: list[Candidate]) -> Classification:
    kinds = {item.kind for item in fp.evidence}
    observed = kinds.intersection(BEHAVIOR_FIELDS)
    declared = bool(kinds & DECLARATIONS or any(c.registration_id for c in candidates))
    # These gates are independent of the score and resist repeated weak observations.
    decision = bool(fp.planning or fp.autonomous_actions or fp.delegation)
    continuation = bool(fp.memory_usage or fp.multi_step or fp.autonomous_actions or fp.delegation)
    positive = bool(fp.llm_interaction and fp.tool_usage and decision and continuation)
    reasons = [f"observed {kind}" for kind in sorted(observed)]
    hints = {candidate.entity_hint for candidate in candidates if candidate.entity_hint}
    label: ClassificationState
    if positive:
        score = min(0.97, 0.72 + 0.04 * len(observed) + (0.03 if declared else 0))
        label = "confirmed_agent" if declared and score >= 0.9 else "probable_agent"
        entity_type = "autonomous_agent"
        if "multi_agent_system" in hints and fp.delegation:
            entity_type = "multi_agent_system"
        elif hints.intersection(
            {"sub_agent", "dynamic_sub_agent", "dynamically_created_sub_agent"}
        ):
            entity_type = "dynamic_sub_agent"
        reasons.append("LLM, tool, decision and continuation evidence gates satisfied")
        if declared:
            reasons.append("agent declaration corroborates observed behavior")
    else:
        score = min(0.69, 0.12 * len(observed) + (0.08 if declared else 0))
        label = "uncertain"
        entity_type = "unknown_entity"
        if "workflow" in hints or "workflow" in kinds:
            entity_type = "workflow"
        elif fp.llm_interaction:
            entity_type = "ai_enabled_application" if fp.tool_usage else "llm_wrapper"
        elif any("mcp" in c.protocols for c in candidates) or "mcp_server" in hints:
            entity_type, label = "mcp_server", "probable_service"
        elif hints.intersection({"api", "normal_api", "ordinary_api"}):
            entity_type, label = "api", "probable_service"
        elif hints.intersection(
            {"service", "normal_service", "microservice", "traditional_microservice"}
        ):
            entity_type, label = "traditional_microservice", "probable_service"
        if declared:
            reasons.append("declaration alone does not demonstrate autonomous behavior")
        if not fp.llm_interaction:
            reasons.append("no observed LLM interaction")
        if not fp.tool_usage:
            reasons.append("no observed tool invocation")
        if not decision:
            reasons.append("no planning, autonomous action or delegation evidence")
        if not continuation:
            reasons.append("no memory, multistep, autonomous action or delegation evidence")
    return Classification(
        is_agent=positive,
        confidence=round(score, 2),
        classification=label,
        entity_type=entity_type,
        evidence=fp.evidence,
        reasons=reasons,
    )


def infer_capabilities(candidates: list[Candidate]) -> list[Capability]:
    results: dict[tuple[str, str], Capability] = {}

    def add(
        name: str,
        basis: Literal["declared", "observed", "inferred"],
        score: float,
        evidence: Evidence,
    ) -> None:
        key = name, basis
        if key not in results:
            results[key] = Capability(name=name, basis=basis, confidence=score, evidence=[evidence])
        else:
            record = results[key]
            record.confidence = max(record.confidence, score)
            if evidence not in record.evidence:
                record.evidence.append(evidence)

    for candidate in candidates:
        for skill in sorted(set(candidate.skills)):
            add(
                skill,
                "declared",
                0.75,
                Evidence(
                    kind="declared_skill",
                    source=candidate.source,
                    value=skill,
                    observed_at=candidate.observed_at,
                ),
            )
        for tool in sorted(set(candidate.tools)):
            evidence = Evidence(
                kind="tool_available",
                source=candidate.source,
                value=tool,
                observed_at=candidate.observed_at,
            )
            for name in TOOL_CAPABILITIES.get(tool, ()):
                add(name, "inferred", 0.5, evidence)
    for evidence in _evidence(candidates):
        if evidence.kind == "tool_call" and evidence.value:
            add(f"tool:{evidence.value}", "observed", 0.9, evidence)
            for name in TOOL_CAPABILITIES.get(evidence.value, ()):
                add(name, "inferred", 0.85, evidence)
    return [results[key] for key in sorted(results)]


def resolve_identity(
    candidate: Candidate, existing: list[tuple[str, Candidate]]
) -> IdentityDecision:
    groups: dict[str, list[Candidate]] = defaultdict(list)
    for canonical_id, observation in existing:
        groups[canonical_id].append(observation)
    matches: dict[str, list[dict[str, Any]]] = {}
    conflicts: list[str] = []
    for canonical_id, observations in groups.items():
        signals: list[dict[str, Any]] = []
        for observation in observations:
            if (
                candidate.source == observation.source
                and candidate.candidate_id == observation.candidate_id
            ):
                signals.append(
                    {
                        "signal": "same_source_identity",
                        "strength": 1.0,
                        "source": candidate.source,
                        "candidate_id": candidate.candidate_id,
                    }
                )
            if (
                candidate.endpoint
                and observation.endpoint
                and _endpoint(candidate.endpoint) == _endpoint(observation.endpoint)
            ):
                signals.append(
                    {
                        "signal": "same_endpoint",
                        "strength": 0.95,
                        "endpoint": _endpoint(candidate.endpoint),
                    }
                )
            composite = (candidate.namespace, candidate.service, candidate.deployment)
            if all(composite) and composite == (
                observation.namespace,
                observation.service,
                observation.deployment,
            ):
                signals.append(
                    {
                        "signal": "same_workload",
                        "strength": 0.95,
                        "namespace": candidate.namespace,
                        "service": candidate.service,
                        "deployment": candidate.deployment,
                    }
                )
            if (
                candidate.registration_id
                and candidate.registration_id == observation.registration_id
            ):
                signals.append(
                    {
                        "signal": "same_registration_id",
                        "strength": 0.99,
                        "registration_id": candidate.registration_id,
                    }
                )
        if not signals:
            continue
        registrations = {item.registration_id for item in observations if item.registration_id}
        if (
            candidate.registration_id
            and registrations
            and registrations != {candidate.registration_id}
        ):
            conflicts.append(f"{canonical_id}: conflicting explicit registration IDs")
            continue
        namespaces = {item.namespace for item in observations if item.namespace}
        if candidate.namespace and namespaces and candidate.namespace not in namespaces:
            conflicts.append(f"{canonical_id}: conflicting namespaces")
            continue
        matches[canonical_id] = [
            item for idx, item in enumerate(signals) if item not in signals[:idx]
        ]
    if len(matches) == 1:
        canonical_id, signals = next(iter(matches.items()))
        return IdentityDecision(
            merged=True, canonical_agent_id=canonical_id, evidence=signals, conflicts=conflicts
        )
    if len(matches) > 1:
        conflicts.append(
            "ambiguous observations match multiple canonical identities; review required"
        )
    return IdentityDecision(merged=False, conflicts=conflicts)


def runtime_candidates(events: list[RuntimeEvent]) -> list[Candidate]:
    groups: dict[tuple[str, str | None, str | None], dict[tuple[str, str], RuntimeEvent]] = (
        defaultdict(dict)
    )
    for event in events:
        key = event.service, event.namespace, event.deployment
        event_key = event.source, event.event_id
        previous = groups[key].get(event_key)
        if previous is None or event.timestamp < previous.timestamp:
            groups[key][event_key] = event
    candidates: list[Candidate] = []
    for (service, namespace, deployment), unique_events in sorted(
        groups.items(), key=lambda item: str(item[0])
    ):
        observations = sorted(
            unique_events.values(), key=lambda event: (event.timestamp, event.event_id)
        )
        evidence = []
        for event in observations:
            value = ""
            if event.event_type == "tool_call":
                value = event.tool or ""
            elif event.event_type == "llm_call":
                value = event.model or ""
            elif event.event_type in {"agent_call", "delegation"}:
                value = event.target or ""
            evidence.append(
                Evidence(
                    kind=event.event_type,
                    source=event.source,
                    value=value,
                    observed_at=event.timestamp,
                    event_id=event.event_id,
                )
            )
            if event.event_type == "llm_call":
                provider = event.metadata.get("llm_provider") or event.metadata.get(
                    "gen_ai.provider.name"
                )
                if isinstance(provider, str) and provider:
                    evidence.append(
                        Evidence(
                            kind="llm_provider",
                            source=event.source,
                            value=provider[:500],
                            observed_at=event.timestamp,
                            event_id=event.event_id,
                        )
                    )
                # Externality must be explicitly reported for this LLM event.
                # A separate external API call does not prove the model was remote.
                location = event.metadata.get("llm_location")
                if isinstance(location, str) and location in {"local", "external"}:
                    evidence.append(
                        Evidence(
                            kind="llm_location",
                            source=event.source,
                            value=location,
                            observed_at=event.timestamp,
                            event_id=event.event_id,
                        )
                    )
            if event.event_type == "tool_call" and isinstance(
                event.metadata.get("mcp_server"), str
            ):
                server = event.metadata["mcp_server"]
                Candidate.safe_endpoint(server)
                evidence.append(
                    Evidence(
                        kind="mcp_connection",
                        source=event.source,
                        value=server[:500],
                        observed_at=event.timestamp,
                        event_id=event.event_id,
                    )
                )
        candidates.append(
            Candidate(
                candidate_id=stable_id("runtime", service, namespace or "", deployment or ""),
                name=service,
                source="runtime",
                service=service,
                namespace=namespace,
                deployment=deployment,
                service_account=_consensus(
                    [
                        account_value
                        if isinstance(
                            account_value := event.metadata.get("k8s.serviceaccount.name"), str
                        )
                        else None
                        for event in observations
                    ]
                ),
                endpoint=_consensus([event.endpoint for event in observations]),
                provider=_consensus(
                    [
                        provider
                        if isinstance(
                            provider := event.metadata.get("llm_provider")
                            or event.metadata.get("gen_ai.provider.name"),
                            str,
                        )
                        else None
                        for event in observations
                        if event.event_type == "llm_call"
                    ]
                ),
                framework=_consensus(
                    [
                        framework
                        if isinstance(framework := event.metadata.get("framework"), str)
                        else None
                        for event in observations
                    ]
                ),
                model=_consensus([event.model for event in observations]),
                tools=sorted(
                    {
                        event.tool
                        for event in observations
                        if event.event_type == "tool_call" and event.tool
                    }
                ),
                evidence=evidence,
                observed_at=max(event.timestamp for event in observations),
            )
        )
    return candidates


OTLP_ATTRIBUTES = {
    "service.name",
    "service.namespace",
    "service.instance.id",
    "k8s.namespace.name",
    "k8s.deployment.name",
    "k8s.pod.name",
    "k8s.serviceaccount.name",
    "gen_ai.operation.name",
    "gen_ai.request.model",
    "gen_ai.tool.name",
    "gen_ai.agent.id",
    "gen_ai.agent.name",
    "gen_ai.provider.name",
    "agent_census.endpoint",
    "agent_census.framework",
    "agent_census.llm_location",
    "agent_census.mcp_server",
}
OPERATIONS: dict[str, EventType] = {
    "chat": "llm_call",
    "text_completion": "llm_call",
    "generate_content": "llm_call",
    "execute_tool": "tool_call",
    "invoke_agent": "agent_call",
    "plan": "planning",
    "search_memory": "memory_access",
    "create_memory": "memory_access",
    "update_memory": "memory_access",
    "upsert_memory": "memory_access",
    "delete_memory": "memory_access",
}
NORMALIZED_EVENT_TYPES = set(BEHAVIOR_FIELDS) | {"agent_call", "external_api_call"}


def _attributes(values: Any) -> dict[str, str]:
    if not isinstance(values, list):
        raise ValueError("OTLP attributes must be a list")
    result: dict[str, str] = {}
    for item in values:
        if not isinstance(item, dict) or item.get("key") not in OTLP_ATTRIBUTES:
            continue
        key = item["key"]
        value = item.get("value")
        if isinstance(value, dict) and isinstance(value.get("stringValue"), str):
            if key in result:
                raise ValueError("duplicate OTLP identity or behavior attribute")
            endpoint_attribute = key in {"agent_census.endpoint", "agent_census.mcp_server"}
            if endpoint_attribute and len(value["stringValue"]) > 2048:
                raise ValueError("OTLP attribute exceeds its allowed length")
            result[key] = value["stringValue"] if endpoint_attribute else value["stringValue"][:160]
    return result


def _time(value: Any) -> datetime:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError("relevant OTLP spans require a Unix nanosecond timestamp")
    try:
        nanoseconds = int(value)
        if nanoseconds < 0:
            raise ValueError("negative OTLP timestamp")
        seconds, nanos = divmod(nanoseconds, 1_000_000_000)
        return datetime.fromtimestamp(seconds, tz=UTC).replace(microsecond=nanos // 1000)
    except (ValueError, OverflowError, OSError) as exc:
        raise ValueError("invalid OTLP timestamp") from exc


def parse_otlp(payload: dict[str, Any]) -> list[RuntimeEvent]:
    """Read a bounded OTLP/HTTP JSON traces subset; omit message bodies entirely.

    Custom span events named ``agent_census.<RuntimeEvent.event_type>`` are explicit
    extensions. They are not represented as standardized OTel GenAI conventions.
    The project-specific attributes ``agent_census.endpoint``, ``agent_census.framework``,
    ``agent_census.llm_location`` and ``agent_census.mcp_server`` preserve an instrumented
    workload's endpoint, framework, model location and actual MCP connection. Endpoint
    values pass the same validation as normalized events; none grant registration or trust.
    """
    resource_spans = payload.get("resourceSpans")
    if not isinstance(resource_spans, list):
        raise ValueError("OTLP JSON requires resourceSpans")
    results: dict[str, RuntimeEvent] = {}
    span_count = 0
    for resource_span in resource_spans:
        if not isinstance(resource_span, dict):
            raise ValueError("invalid OTLP resourceSpans entry")
        resource = resource_span.get("resource", {})
        if not isinstance(resource, dict):
            raise ValueError("invalid OTLP resource")
        resource_attributes = _attributes(resource.get("attributes", []))
        scope_spans = resource_span.get("scopeSpans", [])
        if not isinstance(scope_spans, list):
            raise ValueError("OTLP scopeSpans must be a list")
        for scope in scope_spans:
            if not isinstance(scope, dict) or not isinstance(scope.get("spans", []), list):
                raise ValueError("invalid OTLP scopeSpans entry")
            for span in scope.get("spans", []):
                span_count += 1
                if span_count > 10_000:
                    raise ValueError("OTLP batch exceeds 10000 spans")
                if not isinstance(span, dict):
                    raise ValueError("invalid OTLP span")
                if isinstance(span.get("status"), dict) and span["status"].get("code") == 2:
                    # An attempted provider/tool operation is not evidence of successful use.
                    continue
                attributes = _attributes(span.get("attributes", []))
                combined = {**resource_attributes, **attributes}
                selected: list[tuple[EventType, Any, str, dict[str, str]]] = []
                operation = OPERATIONS.get(attributes.get("gen_ai.operation.name", ""))
                if operation:
                    selected.append((operation, span.get("startTimeUnixNano"), "span", combined))
                span_events = span.get("events", [])
                if not isinstance(span_events, list):
                    raise ValueError("OTLP span events must be a list")
                for idx, event in enumerate(span_events):
                    if not isinstance(event, dict):
                        continue
                    name = event.get("name", "")
                    if isinstance(name, str) and name.startswith("agent_census."):
                        event_type = name.removeprefix("agent_census.")
                        if event_type in NORMALIZED_EVENT_TYPES:
                            event_attributes = {
                                **combined,
                                **_attributes(event.get("attributes", [])),
                            }
                            selected.append(
                                (
                                    cast(EventType, event_type),
                                    event.get("timeUnixNano"),
                                    f"event:{idx}",
                                    event_attributes,
                                )
                            )
                if not selected:
                    continue
                trace_id, span_id = span.get("traceId"), span.get("spanId")
                if not isinstance(trace_id, str) or not re.fullmatch(r"[0-9a-fA-F]{32}", trace_id):
                    raise ValueError("relevant OTLP spans require a 32-character hex traceId")
                if not isinstance(span_id, str) or not re.fullmatch(r"[0-9a-fA-F]{16}", span_id):
                    raise ValueError("relevant OTLP spans require a 16-character hex spanId")
                service = resource_attributes.get("service.name")
                if not service:
                    raise ValueError("relevant OTLP spans require resource service.name")
                for event_type, timestamp, suffix, attrs in selected:
                    event_id = f"otlp:{trace_id.lower()}:{span_id.lower()}:{suffix}"
                    metadata = {
                        key: value
                        for key, value in attrs.items()
                        if key
                        in {
                            "service.instance.id",
                            "k8s.pod.name",
                            "k8s.serviceaccount.name",
                            "gen_ai.provider.name",
                            "gen_ai.agent.id",
                            "gen_ai.agent.name",
                        }
                    }
                    if attrs.get("agent_census.framework"):
                        metadata["framework"] = attrs["agent_census.framework"]
                    location = attrs.get("agent_census.llm_location")
                    if event_type == "llm_call" and location in {"local", "external"}:
                        metadata["llm_location"] = location
                    mcp_server = attrs.get("agent_census.mcp_server")
                    if event_type == "tool_call" and mcp_server:
                        Candidate.safe_endpoint(mcp_server)
                        metadata["mcp_server"] = mcp_server
                    results[event_id] = RuntimeEvent(
                        event_id=event_id,
                        timestamp=_time(timestamp),
                        service=service,
                        namespace=resource_attributes.get("k8s.namespace.name")
                        or resource_attributes.get("service.namespace"),
                        deployment=resource_attributes.get("k8s.deployment.name"),
                        endpoint=attrs.get("agent_census.endpoint"),
                        event_type=event_type,
                        model=attrs.get("gen_ai.request.model"),
                        tool=attrs.get("gen_ai.tool.name") if event_type == "tool_call" else None,
                        target=attrs.get("gen_ai.agent.id")
                        if event_type in {"agent_call", "delegation"}
                        else None,
                        trace_id=trace_id.lower(),
                        metadata=metadata,
                    )
    return list(results.values())


def required_capabilities(task: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", task.casefold()).strip()
    return [
        name
        for name, patterns in TASK_PATTERNS.items()
        if any(re.search(rf"(?<!\w)(?:{pattern})(?!\w)", normalized) for pattern in patterns)
    ]


def shadow_decision(record: AgentRecord) -> bool:
    if record.registered or not record.classification.is_agent:
        return False
    kinds = {item.kind for item in record.evidence}
    return bool(
        "llm_call" in kinds
        and "tool_call" in kinds
        and kinds.intersection({"planning", "autonomous_action", "delegation"})
        and len(kinds.intersection(BEHAVIOR_FIELDS)) >= 3
    )
