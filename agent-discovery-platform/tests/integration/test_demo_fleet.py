"""Discover the opt-in running demo services through native Census over real HTTP."""

import secrets
import socket
import threading
import time
from contextlib import contextmanager

import httpx
import pytest
import uvicorn
from fastapi.testclient import TestClient

from agent_census.config import Settings
from agent_census.demo_fleet import (
    DEMO_AGENTS,
    SIMULATED_FRAMEWORK,
    SIMULATED_MODEL,
    SIMULATED_SOURCE,
    DemoFleet,
    create_demo_fleet,
    demo_discovery_sources,
    loopback_base_url,
    with_demo_fleet,
)
from agent_census.governance_bridge import create_bridge


@contextmanager
def listener():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(128)
        yield sock, f"http://127.0.0.1:{sock.getsockname()[1]}"


@contextmanager
def serve(app, sock):
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    deadline = time.monotonic() + 8
    while not server.started:
        if not thread.is_alive() or time.monotonic() > deadline:
            raise RuntimeError("Test HTTP service did not start")
        time.sleep(0.01)
    try:
        yield
    finally:
        server.should_exit = True
        thread.join(timeout=8)
        assert not thread.is_alive(), "Test HTTP service did not stop"


def test_demo_source_merge_preserves_existing_operator_configuration():
    base = "http://127.0.0.1:8020"
    existing = {"a2a": [{"url": "https://real.example/card", "custom": "preserved"}],
                "api_registry": [{"url": "https://real.example/registry"}]}
    settings = Settings(admin_token=secrets.token_urlsafe(32), discovery_sources=existing,
                        allowed_origins=("https://real.example",), blocked_hosts=("blocked.example",))
    merged = with_demo_fleet(settings, base)
    twice = with_demo_fleet(merged, base)
    assert twice.discovery_sources == merged.discovery_sources
    assert len(merged.discovery_sources["a2a"]) == 5
    assert merged.discovery_sources["a2a"][0] == existing["a2a"][0]
    assert merged.discovery_sources["api_registry"] == existing["api_registry"]
    assert merged.allowed_origins == ("https://real.example", base)
    assert merged.blocked_hosts == settings.blocked_hosts
    assert merged.allow_http and merged.allow_private
    assert not settings.allow_http and not settings.allow_private
    assert settings.discovery_sources == existing


@pytest.mark.parametrize("url", [
    "https://remote.example:443", "http://127.0.0.1:8011/path",
    "http://user:secret@127.0.0.1:8011", "http://127.0.0.1:8011?secret=value",
    "http://127.0.0.1:8011#fragment", "http://localhost", "http://127.0.0.1:99999",
])
def test_demo_rejects_non_loopback_or_credential_bearing_origins(url):
    with pytest.raises(ValueError):
        loopback_base_url(url)


def test_runtime_steps_produce_explicit_simulation_evidence_and_results():
    fleet = DemoFleet("http://127.0.0.1:8020", "http://127.0.0.1:8011",
                      secrets.token_urlsafe(32), 30)
    result, events = fleet.execute("marketing-research", "Compare demo products")
    assert result["simulation"] and result["count"] == 5
    assert len(fleet.memory["marketing-research"]) == 1
    assert fleet.activity_counts["marketing-research"] == 1
    assert {event.event_type for event in events} == {
        "llm_call", "planning", "tool_call", "memory_access", "multi_step"
    }
    assert all(event.source == SIMULATED_SOURCE for event in events)
    assert events[0].model == SIMULATED_MODEL
    assert all(event.metadata["framework"] == SIMULATED_FRAMEWORK for event in events)


@pytest.mark.parametrize("body", [
    [], {"jsonrpc": "2.0", "method": "message/send", "params": []},
    {"jsonrpc": "2.0", "method": "message/send", "params": {"message": []}},
    {"jsonrpc": "2.0", "method": "message/send", "params": {"message": {"parts": {}}}},
    {"jsonrpc": "2.0", "method": "message/send", "params": {
        "message": {"parts": [{"kind": "text", "text": 42}]}}},
])
def test_malformed_a2a_messages_fail_without_executing_or_publishing(body):
    app = create_demo_fleet("http://127.0.0.1:8020", "http://127.0.0.1:8011",
                           secrets.token_urlsafe(32))
    client = TestClient(app)
    assert client.post("/marketing-research/a2a", json=body).status_code == 400
    assert client.post("/marketing-research/a2a", content=b"invalid-json").status_code == 400
    assert client.post("/marketing-research/a2a", content=b"x" * 32_001).status_code == 413
    assert sum(app.state.fleet.activity_counts.values()) == 0


def test_four_running_agents_are_discovered_as_shadow_with_stable_census_ids(tmp_path):
    token = secrets.token_urlsafe(32)
    with listener() as (census_socket, census_url), listener() as (fleet_socket, fleet_url):
        census = create_bridge(
            tmp_path, token, settings=Settings(admin_token=token), demo_fleet_url=fleet_url
        )
        fleet = create_demo_fleet(fleet_url, census_url, token, activity_interval=60)
        headers = {"Authorization": "Bearer " + token}
        with serve(census, census_socket), httpx.Client(timeout=8, trust_env=False) as client:
            assert client.get(census_url + "/agents", headers=headers).json() == []
            with serve(fleet, fleet_socket):
                deadline = time.monotonic() + 8
                while client.get(fleet_url + "/health").status_code != 200:
                    assert time.monotonic() < deadline, "Demo telemetry did not become ready"
                    time.sleep(0.03)
                first = client.post(census_url + "/agents/scan", headers=headers).json()
                assert first["errors"] == []
                assert first["configured_source_count"] == 4
                assert len(first["agents"]) == len(first["observed_agent_ids"]) == 4
                assert {a["name"] for a in first["agents"]} == {a.name for a in DEMO_AGENTS}
                for agent in first["agents"]:
                    assert agent["classification"]["is_agent"] and agent["shadow"]
                    assert not agent["registered"] and agent["owner"] is None
                    assert agent["framework"] == SIMULATED_FRAMEWORK
                    assert agent["model"] == SIMULATED_MODEL
                    assert agent["protocols"] == ["a2a"]
                    assert SIMULATED_SOURCE in agent["discovery_sources"]
                    assert {"agent_card", "planning", "tool_call", "memory_access"} <= {
                        item["kind"] for item in agent["evidence"]
                    }
                    assert agent["discovery_history"]
                for profile in DEMO_AGENTS:
                    response = client.post(f"{fleet_url}/{profile.slug}/a2a", json={
                        "jsonrpc": "2.0", "id": profile.slug, "method": "message/send",
                        "params": {"message": {"parts": [{"kind": "text", "text": "Demo review"}]}}
                    })
                    assert response.status_code == 200
                    result = response.json()["result"]["artifacts"][0]["parts"][0]["data"]
                    assert result["simulation"] and result["telemetry_published"]
                    assert result["count"] > 0
                again = client.post(census_url + "/agents/scan", headers=headers).json()
                assert {a["agent_id"] for a in first["agents"]} == {
                    a["agent_id"] for a in again["agents"]
                }
                status = client.get(fleet_url + "/health").json()
                assert set(status["card_requests"].values()) == {2}
                assert set(status["activity_counts"].values()) == {2}
                assert len(census.state.store.events()) == 40
                assert demo_discovery_sources(fleet_url) == census.state.settings.discovery_sources
