"""The discovery pipeline; persisted decisions retain their supporting evidence."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import timedelta
from typing import Any, Literal
from uuid import uuid4

from opentelemetry import trace
from sqlalchemy import delete
from sqlalchemy.engine import Connection

from .config import Settings
from .detection import (
    classify,
    fingerprint,
    infer_capabilities,
    required_capabilities,
    resolve_identity,
    runtime_candidates,
    shadow_decision,
)
from .discovery import run_adapters
from .models import AgentRecord, Candidate, Evidence, RuntimeEvent, TaskRequest, utcnow
from .security import SafeHTTP, redact, safe_metadata
from .storage import Store, events

logger = logging.getLogger("agent_census")
tracer = trace.get_tracer("agent_census.pipeline", "0.1.0")
BEHAVIOR = {
    "llm_call",
    "tool_call",
    "agent_call",
    "delegation",
    "memory_access",
    "external_api_call",
    "autonomous_action",
    "planning",
    "multi_step",
}


class CensusService:
    def __init__(self, store: Store, settings: Settings, transport: SafeHTTP):
        self.store, self.settings, self.transport = store, settings, transport
        self.local_health_check: Callable[[str], bool] | None = None
        self.secrets = tuple(
            x for x in (settings.admin_token, settings.reader_token, settings.ingest_token) if x
        )

    def clean_candidate(self, candidate: Candidate) -> Candidate:
        values = candidate.model_dump(mode="json")
        values["metadata"] = safe_metadata(values["metadata"])
        candidate = Candidate.model_validate(redact(values, self.secrets))
        if candidate.observed_at > utcnow() + timedelta(minutes=5):
            raise ValueError("observation timestamp is too far in the future")
        return candidate

    def _active(self, candidates: list[Candidate]) -> list[Candidate]:
        cutoff = utcnow() - timedelta(seconds=self.settings.event_window_seconds)
        ceiling = utcnow() + timedelta(minutes=5)
        active = []
        for candidate in candidates:
            evidence = [e for e in candidate.evidence if cutoff <= e.observed_at <= ceiling]
            values: dict[str, Any] = {"evidence": evidence}
            if candidate.observed_at < cutoff:
                values.update(skills=[], tools=[], protocols=[], model=None)
            elif candidate.source == "runtime":
                values["tools"] = sorted(
                    {e.value for e in evidence if e.kind == "tool_call" and e.value}
                )
                values["model"] = next(
                    (e.value for e in reversed(evidence) if e.kind == "llm_call" and e.value), None
                )
            active.append(candidate.model_copy(update=values))
        return active

    def _project(
        self,
        agent_id: str,
        candidates: list[Candidate],
        prior: AgentRecord | None,
        registered: bool = False,
    ) -> AgentRecord:
        active_candidates = self._active(candidates)
        # Keep historical evidence in identity/classification projections. Age affects
        # availability, not whether an observed entity disappears from the registry.
        fp = fingerprint(candidates)
        verdict = classify(fp, candidates)
        # Explicit declarations precede telemetry when choosing display/interface fields.
        ordered = sorted(
            candidates,
            key=lambda c: (c.source not in {"manual", "a2a"}, -c.observed_at.timestamp()),
        )

        def observed(field: str) -> Any:
            return next((getattr(c, field) for c in ordered if getattr(c, field) is not None), None)

        endpoint = observed("endpoint")
        same_endpoint = prior is not None and prior.endpoint == endpoint
        runtime_observations = [c.observed_at for c in candidates if c.source == "runtime"]
        activity_observed_at = max(runtime_observations, default=max(c.observed_at for c in candidates))
        now = utcnow()
        evidence_age_seconds = max(0, int((now - activity_observed_at).total_seconds()))
        activity_status: Literal["active", "stale"] = (
            "active"
            if evidence_age_seconds <= self.settings.event_window_seconds
            else "stale"
        )
        retain_stale_identity = verdict.is_agent or verdict.entity_type == "mcp_server"
        projection_candidates = (
            candidates
            if activity_status == "stale" and retain_stale_identity
            else active_candidates
        )
        capability_candidates = (
            candidates
            if activity_status == "stale" and verdict.is_agent
            else active_candidates
        )
        capabilities = infer_capabilities(capability_candidates)
        fp.agent_confidence = verdict.confidence
        fp.capabilities = sorted({c.name for c in capabilities})
        record = AgentRecord(
            agent_id=agent_id,
            name=ordered[0].name,
            provider=observed("provider"),
            framework=observed("framework"),
            model=observed("model"),
            version=observed("version"),
            description=observed("description"),
            skills=sorted({s for c in projection_candidates for s in c.skills}),
            capabilities=capabilities,
            tools=sorted({s for c in projection_candidates for s in c.tools}),
            endpoint=endpoint,
            protocols=sorted({s for c in projection_candidates for s in c.protocols}),
            auth_type=observed("auth_type"),
            owner=observed("owner"),
            environment=observed("environment"),
            trust_status=prior.trust_status if same_endpoint and prior else "unverified",
            health_status=prior.health_status if same_endpoint and prior else "unknown",
            health_checked_at=prior.health_checked_at if same_endpoint and prior else None,
            discovery_sources=sorted(
                {c.source for c in candidates if c.source != "runtime"}
                | {e.source for c in candidates if c.source == "runtime" for e in c.evidence}
            ),
            first_seen=min(
                [c.observed_at for c in candidates] + ([prior.first_seen] if prior else [])
            ),
            last_seen=max(c.observed_at for c in candidates),
            confidence=verdict.confidence,
            evidence=fp.evidence,
            fingerprint=fp,
            classification=verdict,
            activity_status=activity_status,
            evidence_age_seconds=evidence_age_seconds,
            registered=registered or bool(prior and prior.registered),
            created_at=prior.created_at if prior else utcnow(),
            identity_decisions=prior.identity_decisions[-49:] if prior else [],
        )
        record.fingerprint.trust_information = record.trust_status
        record.shadow = shadow_decision(record)
        if (
            record.health_checked_at
            and (utcnow() - record.health_checked_at).total_seconds()
            > self.settings.health_ttl_seconds
        ):
            record.health_status = "stale"
        if record.activity_status == "stale":
            record.health_status = "stale"
        elif record.health_status == "stale":
            record.health_status = "unknown"
        return record

    def _upsert(
        self,
        candidate: Candidate,
        conn: Connection,
        correlation_id: str,
        registered: bool = False,
        actor: str = "system",
    ) -> AgentRecord:
        candidate = self.clean_candidate(candidate)
        pairs = self.store.observation_pairs(conn)
        previous_pair = next(
            (
                (aid, c)
                for aid, c in pairs
                if (c.source, c.candidate_id) == (candidate.source, candidate.candidate_id)
            ),
            None,
        )
        previous_snapshot = previous_pair[1] if previous_pair else None
        if previous_snapshot and previous_snapshot.observed_at > candidate.observed_at:
            candidate = previous_snapshot
        decision = resolve_identity(candidate, pairs)
        if previous_pair and decision.canonical_agent_id != previous_pair[0]:
            # Reassigning a stable source key would steal the old observation
            # and orphan its entity. Conflicting updates require explicit review.
            raise ValueError("source identity cannot be reassigned to another entity")
        agent_id = decision.canonical_agent_id or f"AGT-{uuid4().hex[:16]}"
        decision.canonical_agent_id = agent_id
        prior = self.store.get(agent_id, conn)
        candidates = [
            c
            for aid, c in pairs
            if aid == agent_id
            and (c.source, c.candidate_id) != (candidate.source, candidate.candidate_id)
        ] + [candidate]
        record = self._project(agent_id, candidates, prior, registered)
        record.identity_decisions.append(decision)
        self.store.save(record, conn)
        self.store.put_observation(agent_id, candidate, conn)
        self.store.update_graph(record, conn)
        self.store.set_alert(record, conn)
        self.store.log(
            "AGENT_REGISTERED" if registered else "CANDIDATE_UPDATED",
            actor,
            agent_id,
            correlation_id,
            conn,
            source=candidate.source,
            is_agent=record.classification.is_agent,
            shadow=record.shadow,
        )
        for stage in (
            "CANDIDATE_FOUND",
            "FINGERPRINT_CREATED",
            "CLASSIFICATION_COMPLETED",
            "IDENTITY_MATCHED",
            "CAPABILITY_INFERRED",
            "REGISTRY_UPDATED",
        ):
            logger.info(
                stage,
                extra={
                    "stage": stage,
                    "correlation_id": correlation_id,
                    "agent_id": agent_id,
                    "source": candidate.source,
                },
            )
        if record.shadow and not (prior and prior.shadow):
            logger.info(
                "SHADOW_AGENT_DETECTED",
                extra={
                    "stage": "SHADOW_AGENT_DETECTED",
                    "correlation_id": correlation_id,
                    "agent_id": agent_id,
                },
            )
        return record

    def register(self, candidate: Candidate, correlation_id: str) -> AgentRecord:
        candidate = candidate.model_copy(
            update={
                "source": "manual",
                "evidence": candidate.evidence
                + [
                    Evidence(
                        kind="manual_registration", source="manual", value="operator registration"
                    )
                ],
            }
        )
        with self.store.transaction() as conn:
            return self._upsert(candidate, conn, correlation_id, registered=True, actor="admin")

    def discover(
        self, sources: dict[str, list[dict[str, Any]]], correlation_id: str
    ) -> dict[str, Any]:
        with tracer.start_as_current_span("discovery.run"):
            logger.info(
                "DISCOVERY_STARTED",
                extra={"stage": "DISCOVERY_STARTED", "correlation_id": correlation_id},
            )
            result = run_adapters(sources, self.transport)
            ids: set[str] = set()
            for candidate in result.candidates:
                try:
                    with self.store.transaction() as conn:
                        ids.add(
                            self._upsert(candidate, conn, correlation_id, actor="admin").agent_id
                        )
                except (ValueError, TypeError) as exc:
                    result.errors.append(
                        {
                            "source": candidate.source,
                            "code": "candidate_invalid",
                            "message": type(exc).__name__,
                        }
                    )
            # Refresh relationship resolution after every candidate in this batch exists.
            with self.store.transaction() as conn:
                for record in self.store.list(conn):
                    self.store.update_graph(record, conn)
            return {
                "agents": [self.store.get(aid) for aid in sorted(ids)],
                "errors": result.errors,
                "correlation_id": correlation_id,
            }

    def ingest(self, batch: list[RuntimeEvent], correlation_id: str) -> dict[str, Any]:
        now = utcnow()
        cutoff = now - timedelta(seconds=self.settings.event_window_seconds)
        if any(e.timestamp > now + timedelta(minutes=5) or e.timestamp < cutoff for e in batch):
            raise ValueError(
                "events must fall within the configured window and at most five minutes in the future"
            )
        accepted = 0
        with tracer.start_as_current_span("runtime.ingest"), self.store.transaction() as conn:
            for value in batch:
                data = value.model_dump(mode="json")
                data["metadata"] = safe_metadata(data["metadata"])
                event = RuntimeEvent.model_validate(redact(data, self.secrets))
                accepted += self.store.add_event(event, conn)
            # Bounded temporal retention; expired payloads are removed, summaries are retained.
            conn.execute(delete(events).where(events.c.timestamp < cutoff.isoformat()))
            retained = [e for e in self.store.events(conn) if e.timestamp >= cutoff]
            candidates = runtime_candidates(retained)
            ids = {
                self._upsert(c, conn, correlation_id, actor="ingest").agent_id for c in candidates
            }
            for record in self.store.list(conn):
                self.store.update_graph(record, conn)
            return {
                "agents": [self.store.get(aid, conn) for aid in sorted(ids)],
                "accepted": accepted,
                "correlation_id": correlation_id,
            }

    def refresh(self, correlation_id: str, probe: bool = False) -> dict[str, Any]:
        errors: list[dict[str, str]] = []
        with self.store.transaction() as conn:
            pairs = self.store.observation_pairs(conn)
            for prior in self.store.list(conn):
                candidates = [c for aid, c in pairs if aid == prior.agent_id]
                record = self._project(prior.agent_id, candidates, prior)
                if probe and record.endpoint and record.trust_status == "approved":
                    try:
                        if record.endpoint.startswith("local://"):
                            if self.local_health_check is None or not self.local_health_check(
                                record.endpoint
                            ):
                                raise ValueError("Local callable is not installed")
                        else:
                            self.transport.request(
                                "GET", record.endpoint.rstrip("/") + "/health", retry=True
                            )
                        record.health_status = "healthy"
                    except Exception as exc:
                        record.health_status = "unhealthy"
                        errors.append(
                            {
                                "agent_id": record.agent_id,
                                "code": getattr(exc, "code", "health_failed"),
                            }
                        )
                    record.health_checked_at = utcnow()
                self.store.save(record, conn)
                self.store.set_alert(record, conn)
                self.store.update_graph(record, conn)
            if probe:
                self.store.log(
                    "HEALTH_SCAN", "system", None, correlation_id, conn, errors=len(errors)
                )
        return {"agents": self.store.list(), "errors": errors, "correlation_id": correlation_id}

    def search(self, query: str, include_non_agents: bool = False) -> list[dict[str, Any]]:
        required = required_capabilities(query)
        normalized = query.lower().strip()
        results = []
        for record in self.store.list():
            if not include_non_agents and not record.classification.is_agent:
                continue
            matched = [
                cap
                for cap in record.capabilities
                if cap.name in required or (normalized and normalized in cap.name.lower())
            ]
            protocol_match = "mcp" in normalized and bool(record.fingerprint.mcp_connections)
            external_match = (
                "external" in normalized
                and "llm" in normalized
                and any(e.kind == "llm_location" and e.value == "external" for e in record.evidence)
                and record.fingerprint.llm_interaction
            )
            name_match = normalized and normalized in record.name.lower()
            if matched or protocol_match or external_match or name_match:
                results.append(
                    {
                        "agent": record,
                        "capability": matched,
                        "evidence": record.evidence
                        if not matched
                        else [e for c in matched for e in c.evidence],
                        "confidence": record.confidence,
                        "endpoint": record.endpoint,
                        "protocol": record.protocols,
                        "health_status": record.health_status,
                    }
                )
        return results

    def match(self, request: TaskRequest) -> dict[str, Any]:
        required = request.required_capabilities or required_capabilities(request.task)
        if not required:
            return {
                "required_capabilities": [],
                "matches": [],
                "excluded": [],
                "reason": "No supported capability identified; supply required_capabilities explicitly",
            }
        matches: list[dict[str, Any]] = []
        excluded: list[dict[str, Any]] = []
        now = utcnow()
        for record in self.store.list():
            caps = {c.name for c in record.capabilities}
            if not set(required) <= caps or (
                request.agent_id and request.agent_id != record.agent_id
            ):
                continue
            reasons = []
            if not record.classification.is_agent:
                reasons.append("not classified as an agent")
            if record.trust_status != "approved":
                reasons.append("operator trust approval required")
            if (
                record.health_status != "healthy"
                or record.health_checked_at is None
                or (now - record.health_checked_at).total_seconds()
                > self.settings.health_ttl_seconds
            ):
                reasons.append("recent healthy probe required")
            if (now - record.last_seen).total_seconds() > self.settings.event_window_seconds:
                reasons.append("observations are stale")
            if record.auth_type not in {None, "none", "public"}:
                reasons.append("outbound authentication adapter not configured")
            if not record.endpoint:
                reasons.append("no observable endpoint")
            if request.protocol and request.protocol not in record.protocols:
                reasons.append("requested protocol is unavailable")
            if reasons:
                excluded.append({"agent_id": record.agent_id, "reasons": reasons})
                continue
            support = [c for c in record.capabilities if c.name in required]
            rationale = [
                f"{c.basis} capability: {c.name}; evidence: "
                + ", ".join(e.kind + ":" + e.value for e in c.evidence)
                for c in support
            ]
            rationale.extend(["operator approved", "recently healthy", "recent observation"])
            score = sum(
                max(c.confidence for c in support if c.name == name) for name in required
            ) / len(required)
            matches.append({"agent": record, "score": round(score, 4), "match_reason": rationale})
        matches.sort(key=lambda match: (-match["score"], match["agent"].agent_id))
        return {"required_capabilities": required, "matches": matches, "excluded": excluded}
