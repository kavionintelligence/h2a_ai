"""Validated, transport-independent contracts used by every pipeline stage."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import urlsplit
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


def utcnow() -> datetime:
    return datetime.now(UTC)


def stable_id(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:24]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class Evidence(Model):
    kind: str = Field(max_length=80)
    source: str = Field(max_length=80)
    value: str = Field(default="", max_length=500)
    observed_at: datetime = Field(default_factory=utcnow)
    event_id: str | None = None

    @field_validator("observed_at")
    @classmethod
    def aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        return value.astimezone(UTC)


class Candidate(Model):
    candidate_id: str = Field(max_length=160)
    name: str = Field(min_length=1, max_length=160)
    source: str = Field(max_length=80)
    endpoint: str | None = Field(default=None, max_length=2048)
    provider: str | None = None
    framework: str | None = None
    model: str | None = None
    version: str | None = None
    description: str | None = Field(default=None, max_length=2000)
    skills: list[str] = Field(default_factory=list, max_length=100)
    tools: list[str] = Field(default_factory=list, max_length=100)
    protocols: list[str] = Field(default_factory=list, max_length=20)
    input_types: list[str] = Field(default_factory=list)
    output_types: list[str] = Field(default_factory=list)
    owner: str | None = None
    environment: str | None = None
    auth_type: str | None = None
    service: str | None = None
    namespace: str | None = None
    deployment: str | None = None
    service_account: str | None = None
    registration_id: str | None = None
    entity_hint: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    evidence: list[Evidence] = Field(default_factory=list, max_length=2000)
    observed_at: datetime = Field(default_factory=utcnow)

    @field_validator("endpoint")
    @classmethod
    def safe_endpoint(cls, value: str | None) -> str | None:
        if value is None:
            return value
        p = urlsplit(value)
        if p.scheme not in {"http", "https", "local"} or not p.hostname:
            raise ValueError("endpoint requires http, https or local scheme and a host")
        if p.username or p.password or p.query or p.fragment:
            raise ValueError("endpoint must not contain credentials, query or fragment")
        return value

    @field_validator("observed_at")
    @classmethod
    def aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        return value.astimezone(UTC)


class RuntimeEvent(Model):
    event_id: str = Field(default_factory=lambda: str(uuid4()), max_length=160)
    timestamp: datetime = Field(default_factory=utcnow)
    source: str = Field(default="opentelemetry", max_length=80)
    service: str = Field(min_length=1, max_length=160)
    namespace: str | None = None
    deployment: str | None = None
    endpoint: str | None = None
    event_type: Literal[
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
    model: str | None = None
    tool: str | None = Field(default=None, max_length=160)
    target: str | None = Field(default=None, max_length=160)
    trace_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("timestamp")
    @classmethod
    def aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        return value.astimezone(UTC)

    @field_validator("endpoint")
    @classmethod
    def safe_endpoint(cls, value: str | None) -> str | None:
        return Candidate.safe_endpoint(value)


class AgentFingerprint(Model):
    identity: str
    endpoint: str | None = None
    provider: str | None = None
    framework: str | None = None
    models: list[str] = Field(default_factory=list)
    llm_interaction: bool | None = None
    planning: bool | None = None
    tool_usage: bool | None = None
    memory_usage: bool | None = None
    delegation: bool | None = None
    autonomous_actions: bool | None = None
    multi_step: bool | None = None
    mcp_connections: list[str] = Field(default_factory=list)
    a2a_connections: list[str] = Field(default_factory=list)
    input_types: list[str] = Field(default_factory=list)
    output_types: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    owner: str | None = None
    deployment: str | None = None
    first_seen: datetime
    last_seen: datetime
    trust_information: str = "unverified"
    discovery_sources: list[str] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    agent_confidence: float = 0.0


class Classification(Model):
    is_agent: bool
    confidence: float = Field(ge=0, le=1)
    classification: Literal[
        "confirmed_agent",
        "probable_agent",
        "uncertain",
        "probable_service",
        "confirmed_non_agent",
    ]
    entity_type: str
    evidence: list[Evidence]
    reasons: list[str]
    score_semantics: str = "heuristic evidence score; not a calibrated probability"


class Capability(Model):
    name: str
    basis: Literal["declared", "observed", "inferred"]
    confidence: float = Field(ge=0, le=1)
    evidence: list[Evidence]


class IdentityDecision(Model):
    merged: bool
    canonical_agent_id: str | None = None
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)


class AgentRecord(Model):
    agent_id: str
    name: str
    provider: str | None = None
    framework: str | None = None
    model: str | None = None
    version: str | None = None
    description: str | None = None
    skills: list[str] = Field(default_factory=list)
    capabilities: list[Capability] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    endpoint: str | None = None
    protocols: list[str] = Field(default_factory=list)
    auth_type: str | None = None
    trust_status: Literal["approved", "unverified", "blocked"] = "unverified"
    health_status: Literal["healthy", "unhealthy", "unknown", "stale"] = "unknown"
    activity_status: Literal["active", "stale"] = "stale"
    evidence_age_seconds: int = 0
    health_checked_at: datetime | None = None
    owner: str | None = None
    environment: str | None = None
    discovery_sources: list[str]
    first_seen: datetime
    last_seen: datetime
    confidence: float
    evidence: list[Evidence]
    fingerprint: AgentFingerprint
    classification: Classification
    identity_decisions: list[IdentityDecision] = Field(default_factory=list)
    registered: bool = False
    shadow: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AdapterResult(Model):
    candidates: list[Candidate] = Field(default_factory=list)
    errors: list[dict[str, str]] = Field(default_factory=list)


class DiscoveryRequest(Model):
    sources: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)


class TaskRequest(Model):
    task: str = Field(min_length=1, max_length=4000)
    required_capabilities: list[str] = Field(default_factory=list, max_length=20)
    agent_id: str | None = None
    protocol: Literal["a2a", "http", "mcp", "local"] | None = None
    tool: str | None = None
    arguments: dict[str, Any] = Field(default_factory=dict)


class TrustUpdate(Model):
    status: Literal["approved", "unverified", "blocked"]
    reason: str = Field(min_length=3, max_length=300)
