"""Relational graph and registry with one transaction per pipeline update."""

from __future__ import annotations

import builtins
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC
from threading import RLock
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    delete,
    event,
    insert,
    select,
    text,
)
from sqlalchemy.engine import Connection
from sqlalchemy.pool import StaticPool

from .models import AgentRecord, Candidate, RuntimeEvent, stable_id, utcnow

metadata = MetaData()
versions = Table("schema_versions", metadata, Column("version", Integer, primary_key=True))
entities = Table(
    "entities",
    metadata,
    Column("agent_id", String(64), primary_key=True),
    Column("name", String(160), nullable=False),
    Column("entity_type", String(80), nullable=False),
    Column("registered", Boolean, nullable=False),
    Column("shadow", Boolean, nullable=False),
    Column("body", JSON, nullable=False),
)
Index("ix_entities_type_registered", entities.c.entity_type, entities.c.registered)
observations = Table(
    "observations",
    metadata,
    Column("observation_key", String(64), primary_key=True),
    Column(
        "agent_id",
        String(64),
        ForeignKey("entities.agent_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    ),
    Column("source", String(80), nullable=False),
    Column("body", JSON, nullable=False),
)
events = Table(
    "runtime_events",
    metadata,
    Column("event_id", String(160), primary_key=True),
    Column("service", String(160), nullable=False, index=True),
    Column("timestamp", String(40), nullable=False, index=True),
    Column("body", JSON, nullable=False),
)
edges = Table(
    "graph_edges",
    metadata,
    Column("edge_id", String(64), primary_key=True),
    Column(
        "agent_id",
        String(64),
        ForeignKey("entities.agent_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    ),
    Column("relation", String(80), nullable=False),
    Column("target_type", String(80), nullable=False),
    Column("target", String(2048), nullable=False),
    Column("body", JSON, nullable=False),
)
alerts = Table(
    "alerts",
    metadata,
    Column(
        "agent_id",
        String(64),
        ForeignKey("entities.agent_id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("body", JSON, nullable=False),
)
audit = Table(
    "audit_log",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("timestamp", String(40), nullable=False),
    Column("action", String(80), nullable=False),
    Column("actor", String(80), nullable=False),
    Column("subject", String(160)),
    Column("correlation_id", String(80), nullable=False),
    Column("details", JSON, nullable=False),
)


class Store:
    def __init__(self, database_url: str):
        kwargs: dict[str, Any] = {}
        if database_url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False, "timeout": 20}
            if ":memory:" in database_url or database_url.rstrip("/") == "sqlite:":
                kwargs["poolclass"] = StaticPool
        self.engine = create_engine(database_url, **kwargs)
        self.lock = RLock()
        if database_url.startswith("sqlite"):

            @event.listens_for(self.engine, "connect")
            def configure_sqlite(dbapi_connection: Any, _: Any) -> None:
                dbapi_connection.execute("PRAGMA foreign_keys=ON")
                dbapi_connection.execute("PRAGMA journal_mode=WAL")

        self.migrate()

    def migrate(self) -> None:
        # Version 1 is an idempotent bootstrap migration; later versions must be explicit.
        metadata.create_all(self.engine)
        with self.engine.begin() as conn:
            version = conn.execute(select(versions.c.version)).scalar()
            if version is None:
                conn.execute(insert(versions).values(version=1))
            elif version != 1:
                raise RuntimeError("Unsupported schema version; run the matching migration")

    @contextmanager
    def transaction(self) -> Iterator[Connection]:
        # One API process is supported; multi-worker identity writes need DB advisory locks.
        with self.lock, self.engine.begin() as conn:
            yield conn

    def ready(self) -> bool:
        with self.engine.connect() as conn:
            return conn.execute(text("SELECT 1")).scalar() == 1

    def list(self, conn: Connection | None = None) -> builtins.list[AgentRecord]:
        if conn is None:
            with self.transaction() as db:
                return self.list(db)
        return [
            AgentRecord.model_validate(body)
            for body in conn.execute(select(entities.c.body)).scalars()
        ]

    def get(self, agent_id: str, conn: Connection | None = None) -> AgentRecord | None:
        if conn is None:
            with self.transaction() as db:
                return self.get(agent_id, db)
        value = conn.execute(
            select(entities.c.body).where(entities.c.agent_id == agent_id)
        ).scalar()
        return AgentRecord.model_validate(value) if value else None

    def save(self, record: AgentRecord, conn: Connection) -> None:
        values = dict(
            name=record.name,
            entity_type=record.classification.entity_type,
            registered=record.registered,
            shadow=record.shadow,
            body=record.model_dump(mode="json"),
        )
        if self.get(record.agent_id, conn):
            conn.execute(
                entities.update().where(entities.c.agent_id == record.agent_id).values(**values)
            )
        else:
            conn.execute(insert(entities).values(agent_id=record.agent_id, **values))

    def observation_pairs(self, conn: Connection) -> builtins.list[tuple[str, Candidate]]:
        return [
            (row.agent_id, Candidate.model_validate(row.body))
            for row in conn.execute(select(observations.c.agent_id, observations.c.body))
        ]

    def put_observation(self, agent_id: str, candidate: Candidate, conn: Connection) -> None:
        key = stable_id(candidate.source, candidate.candidate_id)
        conn.execute(delete(observations).where(observations.c.observation_key == key))
        conn.execute(
            insert(observations).values(
                observation_key=key,
                agent_id=agent_id,
                source=candidate.source,
                body=candidate.model_dump(mode="json"),
            )
        )

    def delete(self, agent_id: str, conn: Connection) -> bool:
        found = self.get(agent_id, conn) is not None
        # Cascades remove observations, graph and alerts; audit stays append-only.
        conn.execute(delete(entities).where(entities.c.agent_id == agent_id))
        return found

    def add_event(self, value: RuntimeEvent, conn: Connection) -> bool:
        if conn.execute(
            select(events.c.event_id).where(events.c.event_id == value.event_id)
        ).first():
            return False
        conn.execute(
            insert(events).values(
                event_id=value.event_id,
                service=value.service,
                timestamp=value.timestamp.astimezone(UTC).isoformat(),
                body=value.model_dump(mode="json"),
            )
        )
        return True

    def events(self, conn: Connection | None = None) -> builtins.list[RuntimeEvent]:
        if conn is None:
            with self.transaction() as db:
                return self.events(db)
        return [
            RuntimeEvent.model_validate(body)
            for body in conn.execute(select(events.c.body).order_by(events.c.timestamp)).scalars()
        ]

    def log(
        self,
        action: str,
        actor: str,
        subject: str | None,
        correlation_id: str,
        conn: Connection,
        **details: Any,
    ) -> None:
        conn.execute(
            insert(audit).values(
                timestamp=utcnow().isoformat(),
                action=action,
                actor=actor,
                subject=subject,
                correlation_id=correlation_id,
                details=details,
            )
        )

    def audits(self, limit: int = 100) -> builtins.list[dict[str, Any]]:
        with self.transaction() as conn:
            return [
                dict(row)
                for row in conn.execute(
                    select(audit).order_by(audit.c.id.desc()).limit(limit)
                ).mappings()
            ]

    def discovery_histories(self) -> dict[str, builtins.list[dict[str, Any]]]:
        """Persisted per-entity discovery decisions, including historical shadow state."""
        histories: dict[str, builtins.list[dict[str, Any]]] = {}
        with self.transaction() as conn:
            rows = conn.execute(
                select(audit).where(
                    audit.c.action.in_(["CANDIDATE_UPDATED", "AGENT_REGISTERED"])
                ).order_by(audit.c.id)
            ).mappings()
            for row in rows:
                if row.subject:
                    histories.setdefault(row.subject, []).append(dict(row))
        return histories

    def graph(self, agent_id: str) -> dict[str, Any]:
        with self.transaction() as conn:
            record = self.get(agent_id, conn)
            links = [
                row.body
                for row in conn.execute(select(edges.c.body).where(edges.c.agent_id == agent_id))
            ]
        nodes = [
            {
                "id": agent_id,
                "type": "Agent" if record and record.classification.is_agent else "Entity",
                "label": record.name if record else agent_id,
            }
        ]
        nodes.extend(
            {"id": link["target_id"], "type": link["target_type"], "label": link["target"]}
            for link in links
        )
        return {"nodes": list({n["id"]: n for n in nodes}.values()), "edges": links}

    def update_graph(self, record: AgentRecord, conn: Connection) -> None:
        conn.execute(delete(edges).where(edges.c.agent_id == record.agent_id))
        relations: builtins.list[tuple[str, str, str, builtins.list[dict[str, Any]]]] = []
        for tool in record.tools:
            proof = [e.model_dump(mode="json") for e in record.evidence if e.value == tool]
            relations.append(("USES", "Tool", tool, proof))
        for capability in record.capabilities:
            relations.append(
                (
                    "HAS_CAPABILITY",
                    "Capability",
                    capability.name,
                    [e.model_dump(mode="json") for e in capability.evidence],
                )
            )
        for relation, kind, value in [
            ("EXPOSES", "Endpoint", record.endpoint),
            ("OWNED_BY", "Owner", record.owner),
            ("OBSERVED_AT", "Deployment", record.fingerprint.deployment),
        ]:
            if value:
                relations.append((relation, kind, value, []))
        for model in record.fingerprint.models:
            relations.append(("USES", "Model", model, []))
        for endpoint in record.fingerprint.mcp_connections:
            relations.append(("USES", "MCPServer", endpoint, []))
        for e in record.evidence:
            if e.kind in {"delegation", "agent_call"} and e.value:
                # Target names remain explicitly unresolved until a unique service mapping exists.
                matches = {
                    aid
                    for aid, candidate in self.observation_pairs(conn)
                    if candidate.service == e.value
                }
                target = next(iter(matches)) if len(matches) == 1 else e.value
                relations.append(
                    (
                        "DELEGATES_TO" if e.kind == "delegation" else "DEPENDS_ON",
                        "Agent" if len(matches) == 1 else "UnresolvedService",
                        target,
                        [e.model_dump(mode="json")],
                    )
                )
        used: set[str] = set()
        for relation, kind, target, proof in relations:
            edge_id = stable_id(record.agent_id, relation, kind, target)
            if edge_id in used:
                continue
            used.add(edge_id)
            body = dict(
                source=record.agent_id,
                relation=relation,
                target_type=kind,
                target=target,
                target_id=target if kind == "Agent" else stable_id(kind, target),
                evidence=proof,
            )
            conn.execute(
                insert(edges).values(
                    edge_id=edge_id,
                    agent_id=record.agent_id,
                    relation=relation,
                    target_type=kind,
                    target=target,
                    body=body,
                )
            )

    def set_alert(self, record: AgentRecord, conn: Connection) -> None:
        conn.execute(delete(alerts).where(alerts.c.agent_id == record.agent_id))
        if record.shadow:
            body = dict(
                type="shadow_agent_detected",
                candidate_id=record.agent_id,
                confidence=record.confidence,
                evidence=[e.model_dump(mode="json") for e in record.evidence],
                inferred_capabilities=[c.model_dump(mode="json") for c in record.capabilities],
                recommended_action="review",
                first_seen=record.first_seen.isoformat(),
                last_seen=record.last_seen.isoformat(),
                sources=record.discovery_sources,
                corroborated=len(record.discovery_sources) >= 2,
            )
            conn.execute(insert(alerts).values(agent_id=record.agent_id, body=body))

    def alerts(self) -> builtins.list[dict[str, Any]]:
        with self.transaction() as conn:
            return list(conn.execute(select(alerts.c.body)).scalars())
