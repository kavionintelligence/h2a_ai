"""Explicit configuration; no network scan or unauthenticated write default."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./census.db"
    admin_token: str = ""
    reader_token: str | None = None
    ingest_token: str | None = None
    allowed_origins: tuple[str, ...] = ()
    blocked_hosts: tuple[str, ...] = ()
    allow_private: bool = False
    allow_http: bool = False
    timeout_seconds: float = 5.0
    health_ttl_seconds: int = 120
    event_window_seconds: int = 3600
    monitor_interval_seconds: int = 0
    max_body_bytes: int = 2_000_000
    discovery_sources: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if len(self.admin_token) < 24:
            raise ValueError("CENSUS_ADMIN_TOKEN must contain at least 24 characters")
        tokens = [x for x in (self.admin_token, self.reader_token, self.ingest_token) if x]
        if any(len(x) < 24 for x in tokens) or len(set(tokens)) != len(tokens):
            raise ValueError("configured role tokens must be distinct and at least 24 characters")
        if self.timeout_seconds <= 0 or self.health_ttl_seconds <= 0:
            raise ValueError("timeouts must be positive")
        if self.event_window_seconds <= 0 or self.monitor_interval_seconds < 0:
            raise ValueError("invalid monitoring interval")
        if not isinstance(self.discovery_sources, dict) or len(self.discovery_sources) > 12 or any(
            not isinstance(items, list) or any(not isinstance(item, dict) for item in items)
            for items in self.discovery_sources.values()
        ):
            raise ValueError("discovery sources must be a mapping of source names to object lists")

    @classmethod
    def from_env(
        cls,
        env_file: str | Path | None = None,
        *,
        overrides: Mapping[str, str] | None = None,
    ) -> Settings:
        # Read Census configuration only. Provider credentials never need to enter
        # the H2A process, and loading a file must not mutate the process environment.
        values: dict[str, str] = {}
        if env_file is not None and Path(env_file).is_file():
            for raw in Path(env_file).read_text(encoding="utf-8-sig").splitlines():
                line = raw.strip()
                if line.startswith("export "):
                    line = line[7:]
                elif line.lower().startswith("set "):
                    line = line[4:]
                name, separator, value = line.partition("=")
                name = name.strip()
                if separator and name.startswith("CENSUS_"):
                    value = value.strip()
                    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                        value = value[1:-1]
                    values[name] = value
        values.update({key: value for key, value in os.environ.items() if key.startswith("CENSUS_")})
        values.update(overrides or {})

        def get(name: str, default: str = "") -> str:
            return values.get(name, default)

        def boolean(name: str) -> bool:
            return get(name, "false").lower() == "true"

        raw_sources = get("CENSUS_DISCOVERY_SOURCES", "{}")
        try:
            discovery_sources = json.loads(raw_sources)
        except json.JSONDecodeError as exc:
            raise ValueError("CENSUS_DISCOVERY_SOURCES must contain valid JSON") from exc
        if not isinstance(discovery_sources, dict):
            raise ValueError("CENSUS_DISCOVERY_SOURCES must be a JSON object")

        return cls(
            database_url=get("CENSUS_DATABASE_URL", "sqlite:///./census.db"),
            admin_token=get("CENSUS_ADMIN_TOKEN"),
            reader_token=get("CENSUS_READER_TOKEN") or None,
            ingest_token=get("CENSUS_INGEST_TOKEN") or None,
            allowed_origins=tuple(
                x.strip() for x in get("CENSUS_ALLOWED_ORIGINS").split(",") if x.strip()
            ),
            blocked_hosts=tuple(
                x.strip().lower()
                for x in get("CENSUS_BLOCKED_HOSTS").split(",")
                if x.strip()
            ),
            allow_private=boolean("CENSUS_ALLOW_PRIVATE"),
            allow_http=boolean("CENSUS_ALLOW_HTTP"),
            timeout_seconds=float(get("CENSUS_TIMEOUT_SECONDS", "5")),
            health_ttl_seconds=int(get("CENSUS_HEALTH_TTL_SECONDS", "120")),
            event_window_seconds=int(get("CENSUS_EVENT_WINDOW_SECONDS", "3600")),
            monitor_interval_seconds=int(get("CENSUS_MONITOR_INTERVAL_SECONDS", "0")),
            max_body_bytes=int(get("CENSUS_MAX_BODY_BYTES", "2000000")),
            discovery_sources=discovery_sources,
        )
