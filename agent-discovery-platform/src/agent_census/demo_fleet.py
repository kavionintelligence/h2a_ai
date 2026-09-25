"""Opt-in, explicitly simulated local agents speaking the existing A2A profile.

These are running HTTP services, not Census records. Census discovers their cards
and consumes telemetry from their executed deterministic local simulation steps.
No real LLM, CrewAI installation, paid API, or production data is represented.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, replace
from typing import Any, Literal
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .config import Settings
from .models import RuntimeEvent, utcnow

SIMULATED_FRAMEWORK = "H2A Demo Runtime (simulated)"
SIMULATED_PROVIDER = "Local simulation"
SIMULATED_MODEL = "simulated:deterministic-planner"
SIMULATED_SOURCE = "demo_runtime_simulation"


@dataclass(frozen=True)
class DemoAgent:
    slug: str
    name: str
    capability: str
    tool: str
    default_task: str
    evidence: tuple[str, ...]


DEMO_AGENTS = (
    DemoAgent(
        "marketing-research", "Marketing Research Agent", "competitive_market_research",
        "demo_competitor_lookup", "Research competitor product positioning",
        ("Fictional Atlas: premium analytics", "Fictional Beacon: entry pricing",
         "Fictional Comet: team bundles", "Fictional Delta: enterprise support",
         "Fictional Ember: usage pricing"),
    ),
    DemoAgent(
        "product-intelligence", "Product Intelligence Agent", "product_analysis",
        "demo_product_catalog", "Compare product features for the launch",
        ("Demo feature: guided onboarding", "Demo feature: shared dashboards",
         "Demo feature: export controls", "Demo feature: usage reports"),
    ),
    DemoAgent(
        "customer-insights", "Customer Insights Agent", "customer_feedback_analysis",
        "demo_feedback_lookup", "Summarize fictional customer feedback",
        ("Fictional feedback: simpler setup", "Fictional feedback: clear pricing",
         "Fictional feedback: team permissions", "Fictional feedback: faster reports"),
    ),
    DemoAgent(
        "compliance-review", "Compliance Review Agent", "policy_review",
        "demo_policy_lookup", "Review the demonstration sharing checklist",
        ("Demo control: human review", "Demo control: source attribution",
         "Demo control: mandate enforcement", "Demo control: retention review"),
    ),
)
PROFILES = {agent.slug: agent for agent in DEMO_AGENTS}


def loopback_base_url(value: str) -> str:
    """Never send the backend telemetry credential to a non-loopback destination."""
    parsed = urlsplit(value)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or parsed.username or parsed.password or parsed.query or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError("Demo service URLs must be plain HTTP loopback origins")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Invalid demo service port") from exc
    if port is None or not 1 <= port <= 65535:
        raise ValueError("Demo service URLs require an explicit valid port")
    return value.rstrip("/")


def demo_discovery_sources(fleet_url: str) -> dict[str, list[dict[str, str]]]:
    base = loopback_base_url(fleet_url)
    return {"a2a": [{"url": f"{base}/{agent.slug}/.well-known/agent-card.json"}
                    for agent in DEMO_AGENTS]}


def with_demo_fleet(settings: Settings, fleet_url: str) -> Settings:
    """Append opt-in local targets without replacing the operator's Census config."""
    base = loopback_base_url(fleet_url)
    sources = {name: [dict(item) for item in items]
               for name, items in settings.discovery_sources.items()}
    a2a = sources.setdefault("a2a", [])
    seen = {item.get("url") for item in a2a}
    a2a.extend(item for item in demo_discovery_sources(base)["a2a"] if item["url"] not in seen)
    return replace(
        settings, discovery_sources=sources,
        allowed_origins=tuple(dict.fromkeys([*settings.allowed_origins, base])),
        allow_http=True, allow_private=True,
    )


class DemoFleet:
    def __init__(self, base_url: str, census_url: str, token: str, activity_interval: float):
        self.base_url = loopback_base_url(base_url)
        self.census_url = loopback_base_url(census_url)
        if len(token) < 24:
            raise ValueError("A backend telemetry token of at least 24 characters is required")
        if activity_interval <= 0:
            raise ValueError("Activity interval must be positive")
        self._token = token
        self.activity_interval = activity_interval
        self.memory: dict[str, deque[dict[str, Any]]] = {
            profile.slug: deque(maxlen=16) for profile in DEMO_AGENTS
        }
        self.telemetry_ready = False
        self.telemetry_error: str | None = None
        self.last_published_at: str | None = None
        self.card_requests: dict[str, int] = dict.fromkeys(PROFILES, 0)
        self.activity_counts: dict[str, int] = dict.fromkeys(PROFILES, 0)

    def card(self, slug: str) -> dict[str, Any]:
        profile = PROFILES[slug]
        return {
            "simulation": True, "framework": SIMULATED_FRAMEWORK, "model": SIMULATED_MODEL,
            "protocolVersion": "0.3.0", "name": profile.name,
            "description": "Local deterministic DEMO SIMULATION. No real LLM or CrewAI is used.",
            "url": f"{self.base_url}/{slug}/a2a", "version": "1.0.0",
            "provider": {"organization": SIMULATED_PROVIDER},
            "preferredTransport": "JSONRPC", "capabilities": {"streaming": False},
            "defaultInputModes": ["text/plain"], "defaultOutputModes": ["text/plain"],
            "skills": [{"id": profile.capability, "name": profile.capability,
                        "description": f"Simulated {profile.capability}",
                        "tags": ["demo", "simulation", profile.capability]}],
        }

    def execute(self, slug: str, task: str) -> tuple[dict[str, Any], list[RuntimeEvent]]:
        profile = PROFILES[slug]
        run_id = f"demo-{slug}-{uuid4().hex}"
        events: list[RuntimeEvent] = []

        def observed(kind: Literal["llm_call", "planning", "tool_call", "memory_access", "multi_step"]):
            events.append(RuntimeEvent(
                event_id=f"{run_id}-{kind}", source=SIMULATED_SOURCE,
                service=profile.name, namespace="h2a-demo-simulation", deployment=slug,
                endpoint=f"{self.base_url}/{slug}/a2a", event_type=kind, trace_id=run_id,
                model=SIMULATED_MODEL if kind == "llm_call" else None,
                tool=profile.tool if kind == "tool_call" else None,
                metadata={"framework": SIMULATED_FRAMEWORK, "llm_provider": SIMULATED_PROVIDER,
                          "llm_location": "local", "origin": "explicit_demo_simulation"},
            ))

        # This is an explicitly labelled model simulation, never a claimed real LLM call.
        simulated_plan = {"objective": task[:500], "capability": profile.capability,
                          "steps": [profile.tool, "retain_demo_report"]}
        observed("llm_call")
        plan = tuple(simulated_plan["steps"])
        observed("planning")
        source_evidence = [{"source": f"demo://{slug}/{index}", "text": text,
                            "simulation": True} for index, text in enumerate(profile.evidence, 1)]
        observed("tool_call")
        result = {
            "run_id": run_id, "agent_name": profile.name, "simulation": True,
            "notice": "Deterministic local demonstration; fictional data and simulated model.",
            "task": simulated_plan["objective"], "steps": plan, "tool": profile.tool,
            "framework": SIMULATED_FRAMEWORK, "model": SIMULATED_MODEL,
            "count": len(source_evidence), "sources": source_evidence,
            "timestamp": utcnow().isoformat(),
        }
        self.memory[slug].append(result)
        observed("memory_access")
        self.activity_counts[slug] += 1
        observed("multi_step")
        return result, events

    async def publish(self, events: list[RuntimeEvent]) -> bool:
        payload = {"events": [event.model_dump(mode="json") for event in events]}
        async with httpx.AsyncClient(timeout=3, trust_env=False, follow_redirects=False) as client:
            for attempt in range(3):
                try:
                    response = await client.post(
                        self.census_url + "/events", json=payload,
                        headers={"Authorization": "Bearer " + self._token},
                    )
                    if response.status_code == 200:
                        self.last_published_at = utcnow().isoformat()
                        self.telemetry_error = None
                        return True
                    self.telemetry_error = f"Census telemetry returned HTTP {response.status_code}"
                except httpx.HTTPError:
                    self.telemetry_error = "Census telemetry is temporarily unavailable"
                if attempt < 2:
                    await asyncio.sleep(0.2 * (attempt + 1))
        return False

    async def activity_loop(self) -> None:
        while True:
            events = []
            for profile in DEMO_AGENTS:
                _, observed = self.execute(profile.slug, profile.default_task)
                events.extend(observed)
            self.telemetry_ready = await self.publish(events)
            await asyncio.sleep(self.activity_interval if self.telemetry_ready else 2)


def create_demo_fleet(
    base_url: str, census_url: str, token: str, *, activity_interval: float = 30
) -> FastAPI:
    fleet = DemoFleet(base_url, census_url, token, activity_interval)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        background = asyncio.create_task(fleet.activity_loop())
        try:
            yield
        finally:
            background.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await background

    app = FastAPI(title="H2A local demo agent fleet (SIMULATED)", lifespan=lifespan)
    app.state.fleet = fleet

    @app.get("/health")
    def health():
        return JSONResponse({
            "status": "ok" if fleet.telemetry_ready else "preparing",
            "simulation": True, "agent_count": len(DEMO_AGENTS),
            "telemetry_ready": fleet.telemetry_ready, "telemetry_error": fleet.telemetry_error,
            "last_published_at": fleet.last_published_at,
            "card_requests": fleet.card_requests, "activity_counts": fleet.activity_counts,
        }, status_code=200 if fleet.telemetry_ready else 503)

    @app.get("/agents")
    def agents():
        return {"simulation": True, "agents": [
            {"slug": agent.slug, "name": agent.name, "framework": SIMULATED_FRAMEWORK,
             "card_url": f"{fleet.base_url}/{agent.slug}/.well-known/agent-card.json",
             "endpoint": f"{fleet.base_url}/{agent.slug}/a2a",
             "activity_count": fleet.activity_counts[agent.slug]}
            for agent in DEMO_AGENTS
        ]}

    def require_agent(slug: str) -> None:
        if slug not in PROFILES:
            raise HTTPException(404, "Unknown demonstration agent")

    @app.get("/{slug}/.well-known/agent-card.json")
    def card(slug: str):
        require_agent(slug)
        fleet.card_requests[slug] += 1
        return fleet.card(slug)

    @app.get("/{slug}/a2a/health")
    def agent_health(slug: str):
        require_agent(slug)
        return {"status": "ok", "simulation": True}

    @app.post("/{slug}/a2a")
    async def execute(slug: str, request: Request):
        require_agent(slug)
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 32_000:
                raise HTTPException(413, "Demo task is too large")
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeError) as exc:
            raise HTTPException(400, "Demo task must contain valid JSON") from exc
        if not isinstance(body, dict) or body.get("jsonrpc") != "2.0" or body.get("method") != "message/send":
            raise HTTPException(400, "Expected A2A 0.3 message/send JSON-RPC")
        params = body.get("params")
        if not isinstance(params, dict) or not isinstance(params.get("message"), dict):
            raise HTTPException(400, "Demo task requires a params.message object")
        parts = params["message"].get("parts")
        if not isinstance(parts, list) or len(parts) > 100 or any(
            not isinstance(part, dict)
            or (part.get("kind") == "text" and not isinstance(part.get("text"), str))
            for part in parts
        ):
            raise HTTPException(400, "Demo message parts must contain bounded text/data objects")
        task = " ".join(part["text"] for part in parts if part.get("kind") == "text")[:500]
        result, events = fleet.execute(slug, task or PROFILES[slug].default_task)
        published = await fleet.publish(events)
        result["telemetry_published"] = published
        artifact = json.dumps(result)
        return {"jsonrpc": "2.0", "id": body.get("id"), "result": {
            "kind": "task", "id": result["run_id"], "contextId": "demo-simulation",
            "status": {"state": "completed", "timestamp": result["timestamp"]},
            "artifacts": [{"artifactId": hashlib.sha256(artifact.encode()).hexdigest()[:16],
                           "parts": [{"kind": "data", "data": result}]}],
        }}

    return app
