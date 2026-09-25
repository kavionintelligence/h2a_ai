"""API boundaries, partial integration failure, and transport execution tests."""

import secrets
from typing import Any

from fastapi.testclient import TestClient

from agent_census.config import Settings
from agent_census.demo import scenario
from agent_census.mock_platform import MockPlatform
from agent_census.models import AgentRecord, Evidence, TaskRequest, utcnow


def test_failed_discovery_source_preserves_successful_candidates() -> None:
    from agent_census.api import create_app

    token = secrets.token_urlsafe(32)
    app = create_app(Settings(database_url="sqlite://", admin_token=token))
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as client:
        result = client.post(
            "/discovery/run",
            json={
                "sources": {
                    "a2a": [{"card": {"name": "Invalid card"}}],
                    "api_registry": [
                        {
                            "entries": [
                                {
                                    "id": "api",
                                    "name": "Ordinary API",
                                    "endpoint": "https://example.invalid/api",
                                }
                            ]
                        }
                    ],
                }
            },
        )
        assert result.status_code == 200, result.text
        assert len(result.json()["errors"]) == 1
        assert len(result.json()["agents"]) == 1
        assert result.json()["agents"][0]["classification"]["is_agent"] is False
        assert len(client.get("/agents").json()) == 1


def test_unapproved_agents_cannot_route_and_bearer_is_required() -> None:
    from agent_census.api import create_app

    token = secrets.token_urlsafe(32)
    app = create_app(Settings(database_url="sqlite://", admin_token=token))
    with TestClient(app) as client:
        assert client.get("/agents").status_code == 401
        client.headers["Authorization"] = f"Bearer {token}"
        data = scenario("https://example.invalid")
        registered = client.post("/agents/register", json=data["registrations"][0]).json()
        response = client.post(
            "/tasks/route", json={"task": "code security", "agent_id": registered["agent_id"]}
        )
        assert response.status_code >= 400


def test_real_http_mcp_and_trusted_local_transports() -> None:
    from agent_census.api import create_app

    token = secrets.token_urlsafe(32)
    with MockPlatform() as mock:
        app = create_app(
            Settings(
                database_url="sqlite://",
                admin_token=token,
                allowed_origins=(mock.base_url,),
                allow_http=True,
                allow_private=True,
            )
        )
        with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as client:
            data = scenario(mock.base_url)
            response = client.post("/agents/register", json=data["registrations"][0])
            assert response.status_code < 300, response.text
            agent_id = response.json()["agent_id"]
            response = client.post(
                "/events",
                json={
                    "events": [event for event in data["events"] if event["service"] == "security"]
                },
            )
            assert response.status_code < 300, response.text
            response = client.get(f"/agents/{agent_id}")
            record = AgentRecord.model_validate(response.json())
            record.trust_status = "approved"
            record.health_status = "healthy"
            record.health_checked_at = utcnow()
            record.endpoint, record.protocols = f"{mock.base_url}/http", ["http"]
            routed = app.state.router.route(
                record, TaskRequest(task="synthetic transport check", protocol="http")
            )
            assert routed["result"]["synthetic"] is True

            record.endpoint, record.protocols = f"{mock.base_url}/mcp", ["mcp"]
            record.evidence.append(
                Evidence(kind="protocol_version", source="mcp", value="2025-11-25")
            )
            routed = app.state.router.route(
                record,
                TaskRequest(
                    task="synthetic transport check", protocol="mcp", tool="secret_scanner"
                ),
            )
            assert routed["result"]["isError"] is False
            assert any(call["method"] == "tools/call" for call in mock.app.state.calls)

            def local_handler(task: TaskRequest) -> dict[str, Any]:
                return {"synthetic": True, "task": task.task}

            app.state.router.register_local("fixture", local_handler)
            record.endpoint, record.protocols = "local://fixture", ["local"]
            routed = app.state.router.route(
                record, TaskRequest(task="trusted local fixture", protocol="local")
            )
            assert routed["result"] == {"synthetic": True, "task": "trusted local fixture"}
