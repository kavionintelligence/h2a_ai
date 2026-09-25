"""Run a reproducible, entirely offline cross-source discovery workflow."""

from __future__ import annotations

import json
import secrets
import statistics
import time
from itertools import combinations
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from agent_census.mock_platform import AGENTS, MockPlatform
from agent_census.models import utcnow


def scenario(base_url: str) -> dict[str, Any]:
    """Explicit synthetic truth and observations, with no hidden live dependencies."""
    registrations = [
        {
            "candidate_id": f"operator-{key}",
            "name": AGENTS[key]["name"],
            "source": "manual",
            "endpoint": f"{base_url}/{key}",
            "skills": AGENTS[key]["skills"],
            "tools": AGENTS[key]["tools"],
            "protocols": ["a2a"],
            "service": key,
            "namespace": "demo",
            "deployment": key,
            "owner": "Synthetic Demo Team",
            "environment": "offline-demo",
            "entity_hint": "multi_agent_system" if key == "coordinator" else "autonomous_agent",
            "description": "Synthetic agent fixture; no real analysis is performed.",
            "metadata": {"synthetic": True},
        }
        for key in ("security", "research", "cv", "coordinator")
    ]
    discovery = {
        "sources": {
            "a2a": [
                {"url": f"{base_url}/{key}/.well-known/agent-card.json"}
                for key in ("security", "research", "cv", "coordinator")
            ],
            "mcp": [{"url": f"{base_url}/mcp"}],
            "kubernetes": [
                {
                    "items": [
                        {
                            "apiVersion": "apps/v1",
                            "kind": "Deployment",
                            "metadata": {
                                "name": "security",
                                "namespace": "demo",
                                "labels": {"app.kubernetes.io/name": "security"},
                                "annotations": {
                                    "agent-census.io/name": "Security Agent Kubernetes View",
                                    "agent-census.io/endpoint": f"{base_url}/security",
                                    "agent-census.io/protocol": "a2a",
                                    "agent-census.io/owner": "Synthetic Demo Team",
                                },
                            },
                            "spec": {
                                "template": {"spec": {"serviceAccountName": "security-agent"}}
                            },
                        }
                    ]
                }
            ],
            "api_registry": [
                {
                    "entries": [
                        {
                            "id": "normal-api",
                            "name": "Normal API Service",
                            "endpoint": f"{base_url}/normal-api",
                            "service": "normal-api",
                            "namespace": "demo",
                            "protocols": ["http"],
                            "entity_hint": "api",
                        },
                        {
                            "id": "llm-wrapper",
                            "name": "LLM Wrapper",
                            "endpoint": f"{base_url}/llm-wrapper",
                            "service": "llm-wrapper",
                            "namespace": "demo",
                            "protocols": ["http"],
                            "entity_hint": "llm_wrapper",
                        },
                        {
                            "id": "workflow",
                            "name": "Fixed Workflow",
                            "endpoint": f"{base_url}/workflow",
                            "service": "workflow",
                            "namespace": "demo",
                            "protocols": ["http"],
                            "entity_hint": "workflow",
                        },
                    ]
                }
            ],
        }
    }
    events: list[dict[str, Any]] = []
    timestamp = utcnow().isoformat()

    def event(service: str, kind: str, source: str = "opentelemetry", **extra: Any) -> None:
        events.append(
            {
                "event_id": f"demo-{service}-{len(events):03d}",
                "timestamp": timestamp,
                "source": source,
                "service": service,
                "namespace": "demo",
                "deployment": service,
                "endpoint": f"{base_url}/{service}",
                "event_type": kind,
                "trace_id": f"synthetic-trace-{service}",
                "metadata": {"synthetic": True},
                **extra,
            }
        )

    for key in ("security", "research", "cv", "coordinator", "child", "shadow"):
        event(key, "llm_call", model="synthetic-reasoner")
        event(key, "planning")
        event(
            key,
            "tool_call",
            tool={"research": "literature_search", "cv": "image_classifier"}.get(
                key, "secret_scanner"
            ),
        )
        event(
            key,
            "tool_call",
            source="application_audit",
            tool={"research": "paper_analyzer", "cv": "object_detector"}.get(
                key, "github.search_code"
            ),
        )
        event(key, "memory_access", source="application_audit")
        event(key, "multi_step")
        event(key, "autonomous_action", source="application_audit")
    event("coordinator", "delegation", target="child")
    event("coordinator", "agent_call", target="child")
    event("normal-api", "external_api_call")
    event("llm-wrapper", "llm_call", model="synthetic-text-model")
    event("workflow", "tool_call", tool="format_document")
    event("workflow", "multi_step")
    truth = [
        {
            "key": key,
            "endpoint": f"{base_url}/{key}",
            "agent": key not in {"normal-api", "mcp", "llm-wrapper", "workflow"},
            "shadow": key in {"shadow", "child"},
            "inferred_capabilities": {
                "research": ["literature_search", "paper_analysis"],
                "cv": ["image_classification", "object_detection"],
                "normal-api": [],
                "llm-wrapper": [],
                "workflow": [],
                "mcp": ["code_security", "secret_detection", "security_analysis"],
            }.get(
                key,
                [
                    "code_security",
                    "secret_detection",
                    "security_analysis",
                    "code_search",
                    "repository_analysis",
                ],
            ),
        }
        for key in (
            "security",
            "research",
            "cv",
            "coordinator",
            "child",
            "shadow",
            "normal-api",
            "mcp",
            "llm-wrapper",
            "workflow",
        )
    ]
    return {
        "registrations": registrations,
        "discovery": discovery,
        "subagent_creation": {
            "sources": {
                "api_registry": [
                    {
                        "entries": [
                            {
                                "id": "dynamic-child-instance",
                                "name": "Dynamic Review Subagent",
                                "endpoint": f"{base_url}/child",
                                "service": "child",
                                "namespace": "demo",
                                "deployment": "child",
                                "entity_hint": "dynamic_sub_agent",
                                "description": "Synthetic creation inventory for a transient delegated worker; subtype is declared.",
                            }
                        ]
                    }
                ]
            }
        },
        "events": events,
        "ground_truth": truth,
    }


def _ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 6) if denominator else None


def evaluate(report: dict[str, Any]) -> dict[str, Any]:
    """Compute measured metrics against explicitly supplied synthetic labels."""
    records = report["agents"]
    by_endpoint = {record["endpoint"]: record for record in records}
    truth = {row["endpoint"]: row for row in report["ground_truth"]}
    expected, actual = set(truth), set(by_endpoint)
    found, extra, missing = len(expected & actual), len(actual - expected), len(expected - actual)
    precision, recall = _ratio(found, found + extra), _ratio(found, found + missing)
    confusion = {
        "true_positives": 0,
        "false_positives": 0,
        "true_negatives": 0,
        "false_negatives": 0,
    }
    shadow_confusion = dict(confusion)
    capability_correct = capability_total = 0
    for endpoint, label in truth.items():
        record = by_endpoint.get(endpoint, {})
        predicted = record.get("classification", {}).get("is_agent", False)
        key = (
            ("true_positives" if predicted else "false_negatives")
            if label["agent"]
            else ("false_positives" if predicted else "true_negatives")
        )
        confusion[key] += 1
        shadow_predicted = bool(record.get("shadow", False))
        key = (
            ("true_positives" if shadow_predicted else "false_negatives")
            if label["shadow"]
            else ("false_positives" if shadow_predicted else "true_negatives")
        )
        shadow_confusion[key] += 1
        for capability in record.get("capabilities", []):
            if capability["basis"] == "inferred":
                capability_total += 1
                capability_correct += int(capability["name"] in label["inferred_capabilities"])
    pairs = list(combinations(report["identity_observations"], 2))
    duplicate_pairs = [(a, b) for a, b in pairs if a["endpoint"] == b["endpoint"]]
    nonduplicate_pairs = [(a, b) for a, b in pairs if a["endpoint"] != b["endpoint"]]
    correct_merges = sum(a["agent_id"] == b["agent_id"] for a, b in duplicate_pairs)
    false_merges = sum(a["agent_id"] == b["agent_id"] for a, b in nonduplicate_pairs)
    latency = report["timing"]
    return {
        "dataset": {
            "kind": "deterministic synthetic fixtures",
            "entities": len(truth),
            "events": report["event_count"],
            "limitations": "Small hand-designed scenarios; no statistical calibration or real-world accuracy claim.",
        },
        "discovery": {
            "unit": "explicitly targeted entities, including non-agents",
            "true_positives": found,
            "false_positives": extra,
            "false_negatives": missing,
            "precision": precision,
            "recall": recall,
            "f1": round(2 * precision * recall / (precision + recall), 6)
            if precision and recall
            else 0.0,
        },
        "classification": {
            **confusion,
            "precision": _ratio(
                confusion["true_positives"],
                confusion["true_positives"] + confusion["false_positives"],
            ),
            "recall": _ratio(
                confusion["true_positives"],
                confusion["true_positives"] + confusion["false_negatives"],
            ),
        },
        "identity_resolution": {
            "evaluated_duplicate_pairs": len(duplicate_pairs),
            "correct_merges": correct_merges,
            "duplicate_merge_accuracy": _ratio(correct_merges, len(duplicate_pairs)),
            "evaluated_nonduplicate_pairs": len(nonduplicate_pairs),
            "false_merges": false_merges,
        },
        "capability_inference": {
            "evaluated_inferred_capabilities": capability_total,
            "correct": capability_correct,
            "precision": _ratio(capability_correct, capability_total),
        },
        "shadow_detection": {
            **shadow_confusion,
            "precision": _ratio(
                shadow_confusion["true_positives"],
                shadow_confusion["true_positives"] + shadow_confusion["false_positives"],
            ),
            "false_positive_rate": _ratio(
                shadow_confusion["false_positives"],
                shadow_confusion["false_positives"] + shadow_confusion["true_negatives"],
            ),
            "detection_latency_seconds": latency["shadow_detection_seconds"],
            "latency_definition": "Wall time from synchronous event-ingestion start to shadow report retrieval.",
        },
        "performance": {
            "discovery_latency_seconds": latency["discovery_seconds"],
            "registry_query_median_seconds": statistics.median(latency["registry_query_seconds"]),
            "registry_query_samples": len(latency["registry_query_seconds"]),
            "runtime_event_ingestion_seconds": latency["runtime_seconds"],
            "runtime_events_per_second": report["event_count"] / latency["runtime_seconds"],
        },
    }


def _request(client: TestClient, method: str, path: str, **kwargs: Any) -> Any:
    response = client.request(method, path, **kwargs)
    if response.status_code >= 400:
        raise RuntimeError(
            f"Demo request failed: {method} {path}: {response.status_code} {response.text}"
        )
    return response.json()


def populate_demo(client: TestClient, platform: MockPlatform) -> dict[str, Any]:
    """Exercise the public API; caller owns client, application and mock lifetimes."""
    data = scenario(platform.base_url)
    registered = [
        _request(client, "POST", "/agents/register", json=registration)
        for registration in data["registrations"]
    ]
    started = time.perf_counter()
    discovery = _request(client, "POST", "/discovery/run", json=data["discovery"])
    discovery_seconds = time.perf_counter() - started
    identity_observations = [
        {"agent_id": row["agent_id"], "endpoint": row["endpoint"]}
        for row in registered + discovery["agents"]
    ]
    started = time.perf_counter()
    ingestion = _request(client, "POST", "/events", json={"events": data["events"]})
    runtime_seconds = time.perf_counter() - started
    shadows = _request(client, "GET", "/reports/shadow-agents")
    shadow_seconds = time.perf_counter() - started
    subagent_creation = _request(client, "POST", "/discovery/run", json=data["subagent_creation"])
    identity_observations.extend(
        {"agent_id": row["agent_id"], "endpoint": row["endpoint"]}
        for row in ingestion["agents"] + subagent_creation["agents"]
    )
    for record in registered:
        _request(
            client,
            "PATCH",
            f"/agents/{record['agent_id']}/trust",
            json={
                "status": "approved",
                "reason": "Operator approval for isolated synthetic demo",
            },
        )
    scan = _request(client, "POST", "/agents/scan")
    search = _request(client, "GET", "/agents/search", params={"q": "code security"})
    task = {
        "task": "Review a synthetic repository for code security",
        "required_capabilities": ["code_security"],
    }
    matches = _request(client, "POST", "/tasks/match", json=task)
    routed = _request(client, "POST", "/tasks/route", json={**task, "protocol": "a2a"})
    graph = _request(client, "GET", f"/graph/agent/{registered[3]['agent_id']}")
    query_times = []
    agents = []
    for _ in range(5):
        started = time.perf_counter()
        agents = _request(client, "GET", "/agents")
        query_times.append(time.perf_counter() - started)
    report = {
        "synthetic": True,
        "generated_at": utcnow().isoformat(),
        "description": "Offline real loopback HTTP peers; in-process registry API; no external model or credentials.",
        "ground_truth": data["ground_truth"],
        "event_count": len(data["events"]),
        "agents": agents,
        "discovery_errors": discovery["errors"] + subagent_creation["errors"],
        "runtime_ingestion": ingestion,
        "identity_observations": identity_observations,
        "shadow_agents": shadows,
        "health_scan": scan,
        "search": search,
        "task_matches": matches,
        "route": routed,
        "coordinator_graph": graph,
        "mock_calls": platform.app.state.calls,
        "timing": {
            "discovery_seconds": discovery_seconds,
            "runtime_seconds": runtime_seconds,
            "shadow_detection_seconds": shadow_seconds,
            "registry_query_seconds": query_times,
        },
    }
    report["evaluation"] = evaluate(report)
    return report


def run_demo(output_dir: Path = Path("output/reports")) -> dict[str, Any]:
    """Start mocks, discover evidence, approve, route, and save measured reports."""
    from agent_census.api import create_app
    from agent_census.config import Settings

    output_dir.mkdir(parents=True, exist_ok=True)
    admin_token = secrets.token_urlsafe(32)
    with MockPlatform() as platform:
        settings = Settings(
            database_url="sqlite://",
            admin_token=admin_token,
            allowed_origins=(platform.base_url,),
            allow_private=True,
            allow_http=True,
            monitor_interval_seconds=0,
        )
        with TestClient(
            create_app(settings), headers={"Authorization": f"Bearer {admin_token}"}
        ) as client:
            report = populate_demo(client, platform)
    (output_dir / "demo-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (output_dir / "evaluation.json").write_text(
        json.dumps(report["evaluation"], indent=2), encoding="utf-8"
    )
    (output_dir / "demo-report.md").write_text(_markdown(report), encoding="utf-8")
    return report


def _markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Offline Agent Census demonstration",
        "",
        "All peers and behavior are synthetic. No real code or secrets are scanned.",
        "",
        "| Entity | Classification | Registered | Shadow | Sources | Capabilities |",
        "|---|---|---|---|---|---|",
    ]
    for record in report["agents"]:
        lines.append(
            f"| {record['name']} | {record['classification']['classification']} | {record['registered']} | {record['shadow']} | "
            f"{', '.join(record['discovery_sources'])} | {', '.join(sorted({c['name'] for c in record['capabilities']}))} |"
        )
    lines.extend(
        [
            "",
            "## Measured synthetic evaluation",
            "",
            "```json",
            json.dumps(report["evaluation"], indent=2),
            "```",
            "",
            "## Routing result",
            "",
            "```json",
            json.dumps(report["route"], indent=2),
            "```",
            "",
            "## What to inspect",
            "",
            "The JSON report preserves classification reasons, original evidence, identity decisions, capability basis, task match reasons, and graph edges.",
            "",
            "Scores are rule-based evidence scores, not calibrated probabilities. This small fixture set cannot establish real-world accuracy.",
            "",
        ]
    )
    return "\n".join(lines)
