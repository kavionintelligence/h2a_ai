"""Serve four opt-in simulated agents, with real HTTP discovery and runtime telemetry."""

from __future__ import annotations

import argparse
import os

import uvicorn

from agent_census.demo_fleet import create_demo_fleet


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8020)
    parser.add_argument("--census-url", default="http://127.0.0.1:8011")
    parser.add_argument("--activity-interval", type=float, default=30)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    token = os.getenv("CENSUS_API_TOKEN") or os.getenv("GOVERNANCE_BRIDGE_TOKEN", "")
    try:
        app = create_demo_fleet(
            f"http://127.0.0.1:{args.port}", args.census_url, token,
            activity_interval=args.activity_interval,
        )
    except ValueError as exc:
        parser.error(str(exc))
    uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False, log_level="warning")


if __name__ == "__main__":
    main()
