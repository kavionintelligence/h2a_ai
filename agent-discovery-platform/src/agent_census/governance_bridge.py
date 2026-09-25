"""Launch the existing Census API for H2A; no alternate discovery implementation.

The separate SQLite database starts empty, then persists actual collector and
runtime observations. This module never loads validation reports or demo fixtures.
H2A registration is owned by H2A and does not rewrite Census discovery evidence.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from fastapi import FastAPI

from .api import create_app
from .config import Settings


def create_bridge(
    data_dir: str | Path,
    token: str,
    *,
    settings: Settings | None = None,
    env_file: str | Path | None = None,
    demo_fleet_url: str | None = None,
) -> FastAPI:
    directory = Path(data_dir).resolve()
    database_url = "sqlite:///" + (directory / "census.db").as_posix()
    configuration = (
        replace(settings, database_url=database_url, admin_token=token)
        if settings is not None
        else Settings.from_env(
            env_file,
            overrides={"CENSUS_ADMIN_TOKEN": token, "CENSUS_DATABASE_URL": database_url},
        )
    )
    if demo_fleet_url is not None:
        from .demo_fleet import with_demo_fleet

        configuration = with_demo_fleet(configuration, demo_fleet_url)
    # Validate role configuration before creating persistent state.
    directory.mkdir(parents=True, exist_ok=True)
    return create_app(configuration)
