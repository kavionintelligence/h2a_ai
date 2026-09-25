"""H2A uses the native Census API. No fixture discovery runs on startup or scan."""

import secrets

from fastapi.testclient import TestClient

from agent_census.config import Settings
from agent_census.governance_bridge import create_bridge


def test_empty_scan_never_seeds_synthetic_agents(tmp_path):
    token = secrets.token_urlsafe(32)
    headers = {"Authorization": f"Bearer {token}"}
    app = create_bridge(tmp_path, token, settings=Settings(admin_token=token))
    with TestClient(app, headers=headers) as client:
        assert client.get("/agents").json() == []
        scanned = client.post("/agents/scan")
        assert scanned.status_code == 200
        result = scanned.json()
        assert result["agents"] == []
        assert result["observed_agent_ids"] == []
        assert result["configured_source_count"] == 0
        assert result["errors"][0]["code"] == "no_sources_configured"
        assert app.state.store.events() == []
        assert client.post("/demo/discover").status_code == 404
        assert client.post("/demo/agents/AGT-any/register").status_code == 404
        assert any(a["action"] == "DISCOVERY_SCAN_COMPLETED" for a in app.state.store.audits())
    reopened = create_bridge(tmp_path, token, settings=Settings(admin_token=token))
    with TestClient(reopened, headers=headers) as client:
        assert client.get("/agents").json() == []


def test_bridge_requires_internal_token(tmp_path):
    token = secrets.token_urlsafe(32)
    app = create_bridge(tmp_path, token, settings=Settings(admin_token=token))
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/agents").status_code == 401
        assert client.post("/agents/scan").status_code == 401
        assert client.post("/agents/scan", headers={"Authorization": "Bearer incorrect"}).status_code == 401
        assert app.state.store.list() == []


def test_backend_environment_is_loaded_without_importing_provider_secrets(tmp_path, monkeypatch):
    token = secrets.token_urlsafe(32)
    monkeypatch.delenv("CENSUS_DISCOVERY_SOURCES", raising=False)
    monkeypatch.delenv("CENSUS_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("CENSUS_TIMEOUT_SECONDS", raising=False)
    monkeypatch.setenv("CENSUS_TIMEOUT_SECONDS", "7")
    config = tmp_path / "census.env"
    config.write_text(
        "OPENAI_API_KEY=must-not-be-loaded\n"
        "CENSUS_DATABASE_URL=sqlite:///old-validation-database.db\n"
        "CENSUS_TIMEOUT_SECONDS=2\n"
        "CENSUS_ALLOWED_ORIGINS=https://configured.example\n"
        "CENSUS_DISCOVERY_SOURCES='{" + '"a2a":[{"url":"https://configured.example/card"}]' + "}'\n",
        encoding="utf-8",
    )
    app = create_bridge(tmp_path / "new-census", token, env_file=config)
    settings = app.state.settings
    assert settings.timeout_seconds == 7
    assert settings.allowed_origins == ("https://configured.example",)
    assert settings.discovery_sources == {"a2a": [{"url": "https://configured.example/card"}]}
    assert "old-validation" not in settings.database_url
    assert app.state.store.list() == []
    app.state.store.engine.dispose()
