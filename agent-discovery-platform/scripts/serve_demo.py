"""Keep a populated synthetic catalog and its loopback peers available for inspection."""

from __future__ import annotations

import argparse
import os

import uvicorn
from fastapi.testclient import TestClient

from agent_census.api import create_app
from agent_census.config import Settings
from agent_census.demo import populate_demo
from agent_census.mock_platform import MockPlatform


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Serve an ephemeral, populated offline demo dashboard"
    )
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    token = os.getenv("CENSUS_ADMIN_TOKEN", "")
    if len(token) < 24:
        parser.error(
            "Set CENSUS_ADMIN_TOKEN to a secret of at least 24 characters before starting."
        )
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    with MockPlatform() as platform:
        app = create_app(
            Settings(
                database_url="sqlite://",
                admin_token=token,
                reader_token=os.getenv("CENSUS_READER_TOKEN") or None,
                allowed_origins=(platform.base_url,),
                allow_private=True,
                allow_http=True,
                monitor_interval_seconds=30,
            )
        )
        # Do not enter TestClient's lifespan: Uvicorn owns the one application
        # lifespan and the in-memory database must remain open after seeding.
        client = TestClient(app, headers={"Authorization": f"Bearer {token}"})
        try:
            report = populate_demo(client, platform)
        finally:
            client.close()
        print(f"Synthetic catalog ready: {len(report['agents'])} entities, 2 shadow candidates.")
        print(f"Dashboard: http://127.0.0.1:{args.port}/")
        print("Use your configured bearer token in the dashboard. The token is never printed here.")
        print("Press Ctrl+C to stop. This demo catalog is ephemeral and is rebuilt on each run.")
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
