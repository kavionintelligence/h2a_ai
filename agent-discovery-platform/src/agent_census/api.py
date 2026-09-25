"""FastAPI factory. Bind to loopback by default; all data APIs require a role token."""

from __future__ import annotations

import asyncio
import contextlib
import ipaddress
import json
import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import Field

from .config import Settings
from .detection import parse_otlp
from .models import Candidate, Evidence, Model, RuntimeEvent, TaskRequest, TrustUpdate, utcnow
from .routing import Router
from .security import IntegrationError, SafeHTTP, StaticTokenAuthenticator, redact
from .service import CensusService
from .storage import Store


class EventBatch(Model):
    events: list[RuntimeEvent] = Field(max_length=500)


class DiscoveryBody(Model):
    sources: dict[str, list[dict[str, Any]]] = Field(max_length=12)


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "timestamp": utcnow().isoformat(),
                "level": record.levelname,
                "stage": getattr(record, "stage", record.getMessage()),
                "correlation_id": getattr(record, "correlation_id", None),
                "agent_id": getattr(record, "agent_id", None),
                "source": getattr(record, "source", None),
            }
        )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = Store(settings.database_url)
    transport = SafeHTTP(settings)
    service = CensusService(store, settings, transport)
    router = Router(transport, settings.health_ttl_seconds, settings.event_window_seconds)
    service.local_health_check = lambda endpoint: (
        endpoint.removeprefix("local://").rstrip("/") in router._local
    )
    authenticator = StaticTokenAuthenticator(settings)
    logger = logging.getLogger("agent_census")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

    async def monitor() -> None:
        while True:
            await asyncio.sleep(settings.monitor_interval_seconds)
            try:
                await asyncio.to_thread(service.refresh, str(uuid4()), True)
            except Exception:
                logger.error("MONITOR_FAILED", extra={"stage": "MONITOR_FAILED"})

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        background = asyncio.create_task(monitor()) if settings.monitor_interval_seconds else None
        yield
        if background:
            background.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await background
        store.engine.dispose()

    app = FastAPI(
        title="Agent Census",
        version="0.1.0",
        description="Evidence-based discovery, identity resolution and agent governance. Scores are heuristic.",
        lifespan=lifespan,
    )
    app.state.store, app.state.service, app.state.router = store, service, router
    app.state.settings = settings

    @app.middleware("http")
    async def boundary(request: Request, call_next: Any):
        cid = request.headers.get("x-correlation-id", "")
        request.state.correlation_id = (
            cid if re.fullmatch(r"[A-Za-z0-9_-]{1,80}", cid) else str(uuid4())
        )
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > settings.max_body_bytes:
                return JSONResponse(
                    {"error": {"code": "body_too_large", "message": "Request byte limit exceeded"}},
                    status_code=413,
                )
        # Starlette's cached request body is replayed to the downstream request.
        request._body = bytes(data)
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = request.state.correlation_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    bearer = HTTPBearer(auto_error=False)

    def require(*allowed: str):
        def check(
            request: Request,
            credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
        ) -> str:
            role = authenticator.authenticate(request.headers.get("authorization"))
            if role is None:
                raise HTTPException(
                    401, "Valid Bearer token required", headers={"WWW-Authenticate": "Bearer"}
                )
            if role not in allowed:
                with store.transaction() as conn:
                    store.log(
                        "AUTHORIZATION_DENIED", role, None, request.state.correlation_id, conn
                    )
                raise HTTPException(403, "Role is not authorized for this operation")
            return role

        return check

    read = Depends(require("admin", "reader"))
    admin = Depends(require("admin"))
    ingest_role = Depends(require("admin", "ingest"))

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return JSONResponse(
            {
                "error": {"code": "http_error", "message": exc.detail},
                "correlation_id": request.state.correlation_id,
            },
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(
            {
                "error": {
                    "code": "validation_error",
                    "fields": [list(e["loc"]) for e in exc.errors()],
                },
                "correlation_id": request.state.correlation_id,
            },
            status_code=422,
        )

    @app.exception_handler(IntegrationError)
    async def integration_error(request: Request, exc: IntegrationError):
        return JSONResponse(
            {
                "error": {"code": exc.code, "message": exc.message},
                "correlation_id": request.state.correlation_id,
            },
            status_code=502,
        )

    @app.exception_handler(ValueError)
    async def value_error(request: Request, exc: ValueError):
        return JSONResponse(
            {
                "error": {
                    "code": "invalid_input",
                    "message": "Input violates schema or observation window policy",
                },
                "correlation_id": request.state.correlation_id,
            },
            status_code=422,
        )

    def get_record(agent_id: str):
        record = store.get(agent_id)
        if record is None:
            raise HTTPException(404, "Entity not found")
        return record

    def require_local_dashboard(request: Request, *, mutation: bool = False) -> None:
        """Trust the dashboard only when reached directly from this machine and origin."""
        client = request.client
        try:
            loopback = client is not None and ipaddress.ip_address(client.host).is_loopback
        except ValueError:
            loopback = False
        host = urlsplit("//" + request.headers.get("host", "")).hostname
        if not loopback or host not in {"127.0.0.1", "localhost", "::1"}:
            raise HTTPException(403, "Dashboard API is available only on loopback")
        origin = request.headers.get("origin")
        expected = str(request.base_url).rstrip("/")
        if (mutation and not origin) or (origin and origin.rstrip("/") != expected):
            raise HTTPException(403, "Dashboard request origin is not trusted")

    def scan_inventory(correlation_id: str) -> dict[str, Any]:
        started_at = utcnow().isoformat()
        discovery = (
            service.discover(settings.discovery_sources, correlation_id)
            if settings.discovery_sources
            else {"agents": [], "errors": [], "correlation_id": correlation_id}
        )
        result = service.refresh(correlation_id, probe=True)
        # Local handlers are trusted application callables, never loaded from a request.
        with store.transaction() as conn:
            for record in store.list(conn):
                if (
                    record.endpoint
                    and record.endpoint.startswith("local://")
                    and record.trust_status == "approved"
                ):
                    name = record.endpoint.removeprefix("local://").rstrip("/")
                    record.health_status = "healthy" if name in router._local else "unhealthy"
                    record.health_checked_at = utcnow()
                    store.save(record, conn)
        result["agents"] = store.list()
        result["errors"] = [*discovery.get("errors", []), *result.get("errors", [])]
        result["discovery_sources"] = sorted(settings.discovery_sources)
        configured_count = sum(len(items) for items in settings.discovery_sources.values())
        if not configured_count:
            result["errors"].append(
                {
                    "source": "configuration",
                    "code": "no_sources_configured",
                    "message": (
                        "No discovery targets configured. Configure CENSUS_DISCOVERY_SOURCES "
                        "in the Census backend or send runtime telemetry to /v1/traces. "
                        "Any retained inventory below is prior evidence, not a new observation."
                    ),
                }
            )
        result.update(
            scan_id=correlation_id,
            started_at=started_at,
            completed_at=utcnow().isoformat(),
            configured_source_count=configured_count,
            observed_agent_ids=[record.agent_id for record in discovery["agents"]],
        )
        with store.transaction() as conn:
            store.log(
                "DISCOVERY_SCAN_COMPLETED", "admin", None, correlation_id, conn,
                configured_sources=result["discovery_sources"],
                observed_agent_ids=result["observed_agent_ids"],
                total_entities=len(result["agents"]), errors=result["errors"],
            )
        histories = store.discovery_histories()
        result["agents"] = [
            {**record.model_dump(mode="json"),
             "discovery_history": histories.get(record.agent_id, [])}
            for record in result["agents"]
        ]
        return result

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/ready")
    def ready():
        try:
            if store.ready():
                return {"status": "ready", "schema_version": 1}
        except Exception:
            pass
        raise HTTPException(503, "Database unavailable")

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    def dashboard():
        return Path(__file__).with_name("dashboard.html").read_text(encoding="utf-8")

    @app.get("/dashboard/api/agents", include_in_schema=False)
    def dashboard_agents(request: Request):
        require_local_dashboard(request)
        service.refresh(request.state.correlation_id)
        return store.list()

    @app.post("/dashboard/api/scan", include_in_schema=False)
    def dashboard_scan(request: Request):
        require_local_dashboard(request, mutation=True)
        return scan_inventory(request.state.correlation_id)

    @app.post("/dashboard/api/agents/{agent_id}/register", include_in_schema=False)
    def dashboard_register(agent_id: str, request: Request):
        require_local_dashboard(request, mutation=True)
        prior = get_record(agent_id)
        if not prior.classification.is_agent or prior.registered:
            raise HTTPException(409, "Only an unregistered classified agent can be registered")
        if not prior.endpoint:
            raise HTTPException(409, "Registration requires an observed endpoint for identity resolution")
        candidate = Candidate(
            candidate_id=f"dashboard-{prior.agent_id}",
            name=prior.name,
            source="manual",
            endpoint=prior.endpoint,
            provider=prior.provider,
            framework=prior.framework,
            model=prior.model,
            version=prior.version,
            description=prior.description,
            skills=prior.skills,
            tools=prior.tools,
            protocols=prior.protocols,
            input_types=prior.fingerprint.input_types,
            output_types=prior.fingerprint.output_types,
            owner=prior.owner,
            environment=prior.environment,
            auth_type=prior.auth_type,
            service=prior.name,
            deployment=getattr(prior, "deployment", None),
            service_account=getattr(prior, "service_account", None),
        )
        registered = service.register(candidate, request.state.correlation_id)
        return registered

    @app.post("/agents/register", dependencies=[admin])
    def register(candidate: Candidate, request: Request):
        return service.register(candidate, request.state.correlation_id)

    @app.get("/agents/search", dependencies=[read])
    @app.get("/capabilities/search", dependencies=[read])
    def search(
        request: Request,
        q: Annotated[str, Query(min_length=1, max_length=500)],
        include_non_agents: bool = False,
    ):
        service.refresh(request.state.correlation_id)
        return service.search(q, include_non_agents)

    @app.get("/agents", dependencies=[read])
    def agents(
        request: Request,
        limit: Annotated[int, Query(ge=1, le=1000)] = 200,
        offset: Annotated[int, Query(ge=0)] = 0,
        agents_only: bool = False,
    ):
        service.refresh(request.state.correlation_id)
        records = [
            record for record in store.list() if not agents_only or record.classification.is_agent
        ]
        return records[offset : offset + limit]

    @app.post("/agents/discover", dependencies=[admin])
    @app.post("/discovery/run", dependencies=[admin])
    def discover(body: DiscoveryBody, request: Request):
        return service.discover(body.sources, request.state.correlation_id)

    @app.post("/agents/scan", dependencies=[admin])
    @app.post("/discovery/scan", dependencies=[admin])
    def scan(request: Request):
        return scan_inventory(request.state.correlation_id)

    @app.get("/agents/{agent_id}", dependencies=[read])
    def agent(agent_id: str, request: Request):
        service.refresh(request.state.correlation_id)
        return get_record(agent_id)

    @app.delete("/agents/{agent_id}", dependencies=[admin])
    def delete_agent(agent_id: str, request: Request):
        get_record(agent_id)
        with store.transaction() as conn:
            store.delete(agent_id, conn)
            store.log("ENTITY_DELETED", "admin", agent_id, request.state.correlation_id, conn)
        return {"deleted": agent_id}

    @app.patch("/agents/{agent_id}/trust", dependencies=[admin])
    def trust(agent_id: str, update: TrustUpdate, request: Request):
        with store.transaction() as conn:
            record = store.get(agent_id, conn)
            if record is None:
                raise HTTPException(404, "Entity not found")
            if update.status == "approved":
                if not record.endpoint:
                    raise HTTPException(409, "Approval requires an observed endpoint")
                if not record.endpoint.startswith("local://"):
                    transport.validate(record.endpoint)
            record.trust_status = update.status
            record.fingerprint.trust_information = update.status
            record.updated_at = utcnow()
            store.save(record, conn)
            store.log(
                "TRUST_UPDATED",
                "admin",
                agent_id,
                request.state.correlation_id,
                conn,
                status=update.status,
                reason=redact(update.reason, service.secrets),
            )
        return record

    @app.get("/agents/{agent_id}/capabilities", dependencies=[read])
    def agent_capabilities(agent_id: str, request: Request):
        service.refresh(request.state.correlation_id)
        return get_record(agent_id).capabilities

    @app.get("/agents/{agent_id}/evidence", dependencies=[read])
    def agent_evidence(agent_id: str, request: Request):
        service.refresh(request.state.correlation_id)
        record = get_record(agent_id)
        return {
            "evidence": record.evidence,
            "classification": record.classification,
            "identity_decisions": record.identity_decisions,
        }

    @app.get("/agents/{agent_id}/history", dependencies=[read])
    def agent_history(agent_id: str):
        get_record(agent_id)
        return store.discovery_histories().get(agent_id, [])

    @app.get("/agents/{agent_id}/relationships", dependencies=[read])
    @app.get("/graph/agent/{agent_id}", dependencies=[read])
    def graph(agent_id: str, request: Request):
        service.refresh(request.state.correlation_id)
        get_record(agent_id)
        return store.graph(agent_id)

    @app.get("/capabilities", dependencies=[read])
    def capabilities(request: Request):
        service.refresh(request.state.correlation_id)
        return sorted({c.name for record in store.list() for c in record.capabilities})

    @app.post("/events", dependencies=[ingest_role])
    def ingest(body: EventBatch, request: Request):
        return service.ingest(body.events, request.state.correlation_id)

    @app.post("/v1/traces", dependencies=[ingest_role])
    def otlp(body: dict[str, Any], request: Request):
        parsed = parse_otlp(body)
        if len(parsed) > 500:
            raise HTTPException(413, "Maximum 500 normalized events per batch")
        result = service.ingest(parsed, request.state.correlation_id)
        return JSONResponse({}, headers={"X-Census-Accepted": str(result["accepted"])})

    @app.get("/events", dependencies=[read])
    def list_events(limit: Annotated[int, Query(ge=1, le=1000)] = 100):
        return store.events()[-limit:]

    @app.get("/reports/shadow-agents", dependencies=[read])
    def shadow_agents(request: Request):
        service.refresh(request.state.correlation_id)
        return store.alerts()

    @app.get("/audit", dependencies=[admin])
    def audit_log(limit: Annotated[int, Query(ge=1, le=1000)] = 100):
        return store.audits(limit)

    @app.post("/tasks/match", dependencies=[read])
    def match(body: TaskRequest, request: Request):
        service.refresh(request.state.correlation_id)
        return service.match(body)

    @app.post("/tasks/route", dependencies=[admin])
    def route(body: TaskRequest, request: Request):
        service.refresh(request.state.correlation_id)
        matched = service.match(body)
        if not matched["matches"]:
            raise HTTPException(409, {"message": "No eligible agent", "rationale": matched})
        selected = matched["matches"][0]["agent"]
        cid = request.state.correlation_id
        with store.transaction() as conn:
            store.log("ROUTE_ATTEMPT", "admin", selected.agent_id, cid, conn)
        try:
            result = router.route(
                selected,
                body.model_copy(update={"required_capabilities": matched["required_capabilities"]}),
            )
        except Exception as exc:
            with store.transaction() as conn:
                store.log(
                    "ROUTE_FAILED",
                    "admin",
                    selected.agent_id,
                    cid,
                    conn,
                    code=getattr(exc, "code", "execution_failed"),
                )
            if isinstance(exc, IntegrationError):
                raise
            raise IntegrationError(
                "execution_failed", "Execution adapter failed; task was not automatically retried"
            ) from exc
        with store.transaction() as conn:
            service._upsert(
                Candidate(
                    candidate_id=selected.agent_id,
                    name=selected.name,
                    source="router",
                    endpoint=selected.endpoint,
                    evidence=[
                        Evidence(
                            kind="route_execution",
                            source="router",
                            value="Protocol execution response observed; internal behavior not inferred",
                        )
                    ],
                ),
                conn,
                cid,
            )
            store.log("ROUTE_COMPLETED", "admin", selected.agent_id, cid, conn)
        return redact(result, service.secrets)

    return app
