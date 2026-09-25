"""Run a fresh offline experiment and print its measured synthetic metrics."""

import argparse
import json
from pathlib import Path

from agent_census.demo import run_demo


def main() -> None:
    parser = argparse.ArgumentParser(description="Measure the synthetic Agent Census experiment")
    parser.add_argument("--output", type=Path, default=Path("output/reports"))
    args = parser.parse_args()
    print(json.dumps(run_demo(args.output)["evaluation"], indent=2))


if __name__ == "__main__":
    main()
