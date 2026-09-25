"""Usage: python scripts/demo.py [--output output/reports]."""

import argparse
from pathlib import Path

from agent_census.demo import run_demo


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the complete offline Agent Census demonstration"
    )
    parser.add_argument("--output", type=Path, default=Path("output/reports"))
    args = parser.parse_args()
    report = run_demo(args.output)
    agents = report["agents"]
    print(
        f"Discovered {len(agents)} entities; {sum(a['classification']['is_agent'] for a in agents)} agents; "
        f"{sum(a['shadow'] for a in agents)} unregistered/shadow candidates."
    )
    print(f"Routed synthetic task through {report['route']['protocol']}.")
    print(f"Reports: {args.output / 'demo-report.md'} and {args.output / 'demo-report.json'}")


if __name__ == "__main__":
    main()
