"""Exercise the entire public workflow against real loopback HTTP peers."""

from pathlib import Path
from typing import Any

import pytest

from agent_census.demo import run_demo


@pytest.fixture(scope="module")
def report(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    return run_demo(tmp_path_factory.mktemp("offline-reports"))


def test_complete_discovery_to_routing(report: dict[str, Any]) -> None:
    assert report["discovery_errors"] == []
    assert len(report["agents"]) == 10
    assert report["route"]["protocol"] == "a2a"
    assert report["route"]["result"]["metadata"]["synthetic"] is True
    assert report["task_matches"]["matches"]
    assert report["task_matches"]["matches"][0]["match_reason"]
    assert any(call["method"] == "message/send" for call in report["mock_calls"])


def test_negative_controls_do_not_become_agents(report: dict[str, Any]) -> None:
    by_endpoint = {record["endpoint"].rsplit("/", 1)[-1]: record for record in report["agents"]}
    for key in ("normal-api", "mcp", "llm-wrapper", "workflow"):
        assert not by_endpoint[key]["classification"]["is_agent"], key
        assert not by_endpoint[key]["shadow"], key
    for key in ("security", "research", "cv", "coordinator", "child", "shadow"):
        assert by_endpoint[key]["classification"]["is_agent"], key
    assert by_endpoint["coordinator"]["classification"]["entity_type"] == "multi_agent_system"
    assert by_endpoint["child"]["classification"]["entity_type"] == "dynamic_sub_agent"


def test_cross_source_identity_and_explainable_shadow(report: dict[str, Any]) -> None:
    security = [record for record in report["agents"] if record["endpoint"].endswith("/security")]
    assert len(security) == 1
    assert {"manual", "a2a", "kubernetes", "opentelemetry", "application_audit"}.issubset(
        security[0]["discovery_sources"]
    )
    assert any(
        decision["merged"] and decision["evidence"]
        for decision in security[0]["identity_decisions"]
    )
    shadows = [record for record in report["agents"] if record["shadow"]]
    assert len(shadows) == 2
    for record in shadows:
        assert not record["registered"]
        assert {"llm_call", "tool_call", "planning", "memory_access", "autonomous_action"}.issubset(
            {item["kind"] for item in record["evidence"]}
        )
        assert record["classification"]["reasons"]
        assert all(capability["evidence"] for capability in record["capabilities"])
    child = next(record for record in shadows if record["endpoint"].endswith("/child"))
    assert any(
        edge["relation"] == "DELEGATES_TO"
        and edge["target_id"] == child["agent_id"]
        and edge["evidence"]
        for edge in report["coordinator_graph"]["edges"]
    )


def test_measured_evaluation_contains_ground_truth_and_no_false_positives(
    report: dict[str, Any],
) -> None:
    evaluation = report["evaluation"]
    assert evaluation["classification"]["true_positives"] == 6
    assert evaluation["classification"]["true_negatives"] == 4
    assert evaluation["classification"]["false_positives"] == 0
    assert evaluation["classification"]["false_negatives"] == 0
    assert evaluation["identity_resolution"]["evaluated_duplicate_pairs"] > 0
    assert evaluation["identity_resolution"]["duplicate_merge_accuracy"] == 1.0
    assert evaluation["identity_resolution"]["false_merges"] == 0
    assert evaluation["performance"]["runtime_events_per_second"] > 0
    assert evaluation["shadow_detection"]["true_positives"] == 2


def test_reports_are_reproducibly_written(tmp_path: Path) -> None:
    result = run_demo(tmp_path)
    for name in ("demo-report.json", "demo-report.md", "evaluation.json"):
        assert (tmp_path / name).is_file()
    assert result["synthetic"]
