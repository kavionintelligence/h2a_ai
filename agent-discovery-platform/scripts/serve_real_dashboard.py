"""Serve the dashboard from the latest successful real-validation database.

The server binds to loopback, loads only Census settings from .env, and never
prints role tokens or Bedrock credentials.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import uvicorn

from agent_census.api import create_app
from agent_census.config import Settings

ROOT = Path(__file__).resolve().parents[1]
ENV_NAMES = {
    "CENSUS_ADMIN_TOKEN",
    "CENSUS_READER_TOKEN",
    "CENSUS_INGEST_TOKEN",
    "CENSUS_ALLOWED_ORIGINS",
    "CENSUS_BLOCKED_HOSTS",
    "CENSUS_ALLOW_PRIVATE",
    "CENSUS_ALLOW_HTTP",
    "CENSUS_TIMEOUT_SECONDS",
    "CENSUS_HEALTH_TTL_SECONDS",
    "CENSUS_EVENT_WINDOW_SECONDS",
    "CENSUS_MAX_BODY_BYTES",
    "CENSUS_DISCOVERY_SOURCES",
}


def census_environment() -> dict[str, str]:
    """Read only API settings from environment/.env; never import Bedrock secrets."""
    values = {}
    path = ROOT / ".env"
    if path.is_file():
        for raw in path.read_text(encoding="utf-8-sig").splitlines():
            line = raw.strip()
            if line.startswith("export "):
                line = line[7:]
            elif line.lower().startswith("set "):
                line = line[4:]
            name, separator, value = line.partition("=")
            name = name.strip()
            if separator and name in ENV_NAMES:
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                values[name] = value
    return {name: os.environ.get(name) or values.get(name, "") for name in ENV_NAMES}


def latest_database() -> Path:
    report_path = ROOT / "output" / "real-validation" / "report.json"
    if not report_path.is_file():
        raise SystemExit("Run scripts/real_validate.py first; no real-validation report exists.")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("status") != "passed":
        raise SystemExit(
            "The latest real validation has not passed; refusing to serve its database."
        )
    runs = (ROOT / "output" / "real-validation" / "runs").resolve()
    run_dir = Path(report.get("run_directory", "")).resolve()
    if not run_dir.is_relative_to(runs):
        raise SystemExit("The reported run directory is outside output/real-validation/runs.")
    database = (run_dir / "census.db").resolve()
    if not database.is_relative_to(runs) or not database.is_file():
        raise SystemExit("The successful real-validation database is missing.")
    return database


def settings() -> Settings:
    values = census_environment()
    admin = values["CENSUS_ADMIN_TOKEN"]
    if not admin:
        raise SystemExit("Configure CENSUS_ADMIN_TOKEN in .env before serving the dashboard.")
    reader = values["CENSUS_READER_TOKEN"] or None
    ingest = values["CENSUS_INGEST_TOKEN"] or None
    database_url = "sqlite:///" + latest_database().as_posix()
    return Settings(
        database_url=database_url,
        admin_token=admin,
        reader_token=reader,
        ingest_token=ingest,
        allowed_origins=tuple(
            item.strip() for item in values["CENSUS_ALLOWED_ORIGINS"].split(",") if item.strip()
        ),
        blocked_hosts=tuple(
            item.strip().lower()
            for item in values["CENSUS_BLOCKED_HOSTS"].split(",")
            if item.strip()
        ),
        allow_private=values["CENSUS_ALLOW_PRIVATE"].lower() == "true",
        allow_http=values["CENSUS_ALLOW_HTTP"].lower() == "true",
        timeout_seconds=float(values["CENSUS_TIMEOUT_SECONDS"] or "5"),
        health_ttl_seconds=int(values["CENSUS_HEALTH_TTL_SECONDS"] or "120"),
        event_window_seconds=int(values["CENSUS_EVENT_WINDOW_SECONDS"] or "3600"),
        monitor_interval_seconds=0,
        max_body_bytes=int(values["CENSUS_MAX_BODY_BYTES"] or "2000000"),
        discovery_sources=json.loads(values["CENSUS_DISCOVERY_SOURCES"] or "{}"),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    app_settings = settings()
    database = latest_database()
    print(f"Real-validation dashboard: http://127.0.0.1:{args.port}/")
    print(f"Database: {database}")
    print("The loopback dashboard uses server-side Census configuration for Scan and Register Agent.")
    print("Tokens and provider credentials are not printed. Press Ctrl+C to stop.")
    uvicorn.run(
        create_app(app_settings),
        host="127.0.0.1",
        port=args.port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
