"""Run the existing Census API with its real configured collectors for H2A."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import uvicorn

from agent_census.governance_bridge import create_bridge


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8011)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument(
        "--env-file", type=Path, default=Path(__file__).resolve().parents[1] / ".env"
    )
    parser.add_argument("--demo-fleet-url", help="Opt in to four loopback demo A2A sources")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    token = os.getenv("GOVERNANCE_BRIDGE_TOKEN", "")
    if len(token) < 24:
        parser.error("GOVERNANCE_BRIDGE_TOKEN must contain at least 24 characters")
    app = create_bridge(
        args.data_dir, token, env_file=args.env_file, demo_fleet_url=args.demo_fleet_url
    )
    uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False)


if __name__ == "__main__":
    main()
