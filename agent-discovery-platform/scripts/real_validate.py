"""Run actual Amazon Bedrock agents against live Census, MCP and A2A HTTP services.

No fixtures, mock transports, manually fabricated events or direct database inserts
are used. AWS_BEARER_TOKEN_BEDROCK is read privately from the environment or project .env.
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import logging
import os
import platform
import secrets
import socket
import subprocess
import sys
import threading
import time
from contextlib import ExitStack
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from real_validation_agent import RealAgent, create_agent_app
from real_validation_peers import create_mcp_app, create_ordinary_app

from agent_census.api import create_app
from agent_census.config import Settings

ROOT = Path(__file__).resolve().parents[1]


def now() -> str:
    return datetime.now(UTC).isoformat()


def save(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def prior_failed_attempts(destination: Path) -> list[dict[str, Any]]:
    """Summarize prior failed Bedrock runs using their actual local receipts."""
    attempts = []
    runs = destination / "runs"
    if not runs.is_dir():
        return attempts
    for path in sorted(runs.glob("*/report.json")):
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if previous.get("provider") != "Amazon Bedrock" or previous.get("status") == "passed":
            continue
        for execution in previous.get("executions", []):
            if execution.get("provider") != "amazon-bedrock" or execution.get("status") != "failed":
                continue
            attempts.append(
                {
                    "run_directory": previous.get("run_directory"),
                    "provider": execution.get("provider"),
                    "model": execution.get("model"),
                    "error_code": (execution.get("error") or {}).get("code"),
                    "provider_responses": len(execution.get("responses", [])),
                    "mcp_tool_calls": len(execution.get("tool_calls", [])),
                    "accepted_runtime_spans": (execution.get("telemetry") or {}).get(
                        "accepted_events_cumulative", 0
                    ),
                }
            )
    return attempts


def configuration() -> tuple[str, str, str, str]:
    values: dict[str, str] = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line.removeprefix("export ")
            elif line.lower().startswith("set "):
                line = line[4:]
            name, sep, value = line.partition("=")
            if sep and name.strip() in {
                "AWS_BEARER_TOKEN_BEDROCK",
                "BEDROCK_MODEL",
                "BEDROCK_REGION",
                "AWS_REGION",
                "AWS_DEFAULT_REGION",
            }:
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                values[name.strip()] = value
    process_key = os.environ.get("AWS_BEARER_TOKEN_BEDROCK", "").strip()
    key = process_key or values.get("AWS_BEARER_TOKEN_BEDROCK", "")
    source = "process environment" if process_key else ".env"
    model = (
        os.environ.get("BEDROCK_MODEL")
        or values.get("BEDROCK_MODEL")
        or "us.anthropic.claude-sonnet-4-6"
    )
    region = (
        os.environ.get("BEDROCK_REGION")
        or values.get("BEDROCK_REGION")
        or os.environ.get("AWS_REGION")
        or values.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or values.get("AWS_DEFAULT_REGION")
        or "us-east-1"
    )
    return key, source if key else "absent", model, region


class LiveServer:
    def __init__(self) -> None:
        self.socket = socket.socket()
        self.socket.bind(("127.0.0.1", 0))
        self.url = f"http://127.0.0.1:{self.socket.getsockname()[1]}"
        self.server: uvicorn.Server | None = None
        self.thread: threading.Thread | None = None

    def start(self, app: Any) -> LiveServer:
        self.server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", log_level="critical", access_log=False)
        )
        self.thread = threading.Thread(
            target=self.server.run, kwargs={"sockets": [self.socket]}, daemon=True
        )
        self.thread.start()
        deadline = time.monotonic() + 15
        while not self.server.started:
            if not self.thread.is_alive() or time.monotonic() > deadline:
                raise RuntimeError("local_server_start_failed")
            time.sleep(0.02)
        return self

    def close(self) -> None:
        if self.server:
            self.server.should_exit = True
        if self.thread:
            self.thread.join(timeout=15)
        self.socket.close()


class CensusClient:
    def __init__(self, url: str, token: str, output: Path) -> None:
        self.client = httpx.Client(
            base_url=url,
            headers={"Authorization": "Bearer " + token},
            timeout=240,
            trust_env=False,
        )
        self.output = output
        self.calls: list[dict[str, Any]] = []

    def call(self, method: str, path: str, body: Any = None) -> Any:
        response = self.client.request(method, path, json=body)
        result = response.json()
        self.calls.append(
            {
                "timestamp": now(),
                "method": method,
                "path": path,
                "body": body,
                "status": response.status_code,
                "response": result,
            }
        )
        save(self.output / "census-http.json", self.calls)
        if response.is_error:
            raise RuntimeError(f"census_http_{response.status_code}")
        return result


def task(filename: str) -> str:
    return (
        "Perform repository analysis of the actual Agent Census source using your MCP tools. "
        "First inventory available files. Use what the inventory returns to choose and read "
        "two relevant source files. Inspect their actual contents to explain one "
        "discovery or classification rule and one routing or identity limitation. "
        "Cite the paths and SHA-256 hashes returned by the tools. Make follow-up tool calls "
        "after inspecting earlier results, but avoid extra reads unless needed. Finally save concise findings using "
        f"write_report with filename {filename}, then confirm the saved artifact. "
        "Do not read credentials or claim evidence that the tools did not return."
    )


def check(report: dict[str, Any], name: str, condition: bool, evidence: Any) -> None:
    report["checks"][name] = {"passed": bool(condition), "evidence": evidence}
    if not condition:
        raise RuntimeError("validation_check_failed:" + name)


def validate(report: dict[str, Any], output: Path, key: str, model: str, region: str) -> None:
    admin_token, ingest_token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    with ExitStack() as stack:
        servers = {
            name: LiveServer() for name in ["census", "mcp", "ordinary", "primary", "shadow"]
        }
        for server in servers.values():
            stack.callback(server.close)
        urls = {name: server.url for name, server in servers.items()}
        report["endpoints"] = urls
        settings = Settings(
            database_url="sqlite:///" + (output / "census.db").as_posix(),
            admin_token=admin_token,
            ingest_token=ingest_token,
            allowed_origins=tuple(urls.values()),
            allow_private=True,
            allow_http=True,
            timeout_seconds=180,
            health_ttl_seconds=600,
        )
        census_app = create_app(settings)
        handler = logging.FileHandler(output / "census-runtime.log", encoding="utf-8")
        handler.setFormatter(logging.getLogger("agent_census").handlers[0].formatter)
        census_logger = logging.getLogger("agent_census")
        previous_handlers = census_logger.handlers[:]
        census_logger.handlers = [handler]
        stack.callback(setattr, census_logger, "handlers", previous_handlers)
        stack.callback(handler.close)
        servers["census"].start(census_app)
        mcp_app = create_mcp_app(ROOT, output)
        ordinary_app = create_ordinary_app(urls["ordinary"])
        servers["mcp"].start(mcp_app)
        servers["ordinary"].start(ordinary_app)
        census = CensusClient(urls["census"], admin_token, output)
        stack.callback(census.client.close)
        local = stack.enter_context(httpx.Client(timeout=240, trust_env=False))
        print("Live Census, MCP and ordinary HTTP services started.", flush=True)

        arithmetic = local.post(
            urls["ordinary"] + "/calculate",
            json={
                "operation": "multiply",
                "left": 6,
                "right": 7,
            },
        )
        arithmetic.raise_for_status()
        report["false_positive_test"] = {
            "http_status": arithmetic.status_code,
            "result": arithmetic.json(),
        }
        discovered = census.call(
            "POST",
            "/discovery/run",
            {
                "sources": {
                    "mcp": [{"url": urls["mcp"] + "/mcp"}],
                    "api_registry": [{"url": urls["ordinary"] + "/service-metadata"}],
                }
            },
        )
        report["service_discovery"] = discovered
        check(
            report,
            "live_service_discovery",
            not discovered["errors"] and len(discovered["agents"]) == 2,
            discovered["errors"],
        )
        controls = discovered["agents"]
        check(
            report,
            "ordinary_and_mcp_are_not_agents",
            all(not r["classification"]["is_agent"] for r in controls),
            [r["classification"] for r in controls],
        )
        report["negative_control_records"] = controls
        if not key:
            report["status"] = "blocked_missing_bedrock_key"
            report["unverified"] = [
                "All actual Bedrock agent execution and downstream agent validation"
            ]
            return

        primary = RealAgent(
            name="census-repository-analyst",
            endpoint=urls["primary"] + "/a2a",
            mcp_url=urls["mcp"] + "/mcp",
            census_url=urls["census"],
            ingest_token=ingest_token,
            output_dir=output,
            api_key=key,
            model=model,
            region=region,
        )
        servers["primary"].start(create_agent_app(primary, urls["primary"], expose_card=True))
        initial = primary.register(urls["census"], admin_token)
        report["initial_registration"] = initial
        check(
            report,
            "registration_alone_not_agent",
            not initial["classification"]["is_agent"],
            initial["classification"],
        )
        card_response = local.get(urls["primary"] + "/.well-known/agent-card.json")
        card_response.raise_for_status()
        report["a2a_card"] = card_response.json()
        discovery = census.call(
            "POST",
            "/discovery/run",
            {
                "sources": {
                    "a2a": [{"url": urls["primary"] + "/.well-known/agent-card.json"}],
                }
            },
        )
        report["a2a_discovery"] = discovery
        check(
            report,
            "live_a2a_card_discovered",
            not discovery["errors"] and len(discovery["agents"]) == 1,
            discovery["errors"],
        )
        primary_id = initial["agent_id"]
        check(
            report,
            "card_identity_merge",
            discovery["agents"][0]["agent_id"] == primary_id,
            discovery["agents"][0]["identity_decisions"],
        )
        print("Running registered agent against Amazon Bedrock with live MCP tools...", flush=True)
        primary_run = primary.run(task("registered-summary.md"))
        report["executions"].append(primary_run)
        record = census.call("GET", "/agents/" + primary_id)
        check(
            report,
            "registered_real_agent",
            record["registered"] and record["classification"]["is_agent"] and not record["shadow"],
            record["classification"],
        )
        report["registered_after_execution"] = record
        census.call(
            "PATCH",
            "/agents/" + primary_id + "/trust",
            {
                "status": "approved",
                "reason": "User-authorized real validation of this local agent",
            },
        )
        census.call("POST", "/discovery/scan")
        route_body = {
            "agent_id": primary_id,
            "protocol": "a2a",
            "required_capabilities": ["repository_analysis"],
            "task": task("routed-summary.md"),
        }
        report["task_match"] = census.call("POST", "/tasks/match", route_body)
        print("Routing a second real Amazon Bedrock task through Census A2A...", flush=True)
        report["routing"] = census.call("POST", "/tasks/route", route_body)
        report["executions"] = list(primary.runs)
        check(
            report,
            "real_a2a_routing",
            report["routing"]["agent_id"] == primary_id
            and report["routing"]["status"] == "dispatched",
            report["routing"],
        )

        before_shadow = census.call("GET", "/agents")
        check(
            report,
            "shadow_absent_before_execution",
            all(r["endpoint"] != urls["shadow"] + "/run" for r in before_shadow),
            [r["agent_id"] for r in before_shadow],
        )
        shadow = RealAgent(
            name="unregistered-repository-worker",
            endpoint=urls["shadow"] + "/run",
            mcp_url=urls["mcp"] + "/mcp",
            census_url=urls["census"],
            ingest_token=ingest_token,
            output_dir=output,
            api_key=key,
            model=model,
            region=region,
        )
        servers["shadow"].start(create_agent_app(shadow, urls["shadow"], expose_card=False))
        print(
            "Running unregistered worker; only actual OTel spans reveal it to Census...", flush=True
        )
        shadow_response = local.post(
            urls["shadow"] + "/run", json={"task": task("shadow-summary.md")}
        )
        shadow_response.raise_for_status()
        report["executions"].append(shadow_response.json())
        report["post_shadow_scan"] = census.call("POST", "/discovery/scan")
        records = census.call("GET", "/agents")
        shadow_records = [r for r in records if r["endpoint"] == shadow.endpoint]
        check(
            report,
            "shadow_discovered_without_registration",
            len(shadow_records) == 1
            and shadow_records[0]["shadow"]
            and not shadow_records[0]["registered"],
            shadow_records,
        )
        shadow_record = shadow_records[0]
        report["shadow"] = {
            "record": shadow_record,
            "why_detected": shadow_record["classification"]["reasons"],
            "runtime_signals": sorted({e["kind"] for e in shadow_record["evidence"]}),
            "false_positive_conditions": [
                "Authorized telemetry can be spoofed; this classifier does not attest provider responses.",
                "Broad model-selected action signals can also describe bounded tool loops; scores are heuristic.",
            ],
            "routing_limit": "No advertised protocol or trust approval; telemetry alone does not authorize routing.",
        }
        report["shadow_alerts"] = census.call("GET", "/reports/shadow-agents")
        search = census.call("GET", "/capabilities/search?q=repository_analysis")
        report["capability_search"] = search
        search_ids = {item["agent"]["agent_id"] for item in search}
        check(
            report,
            "both_agents_capability_search",
            {primary_id, shadow_record["agent_id"]} <= search_ids,
            sorted(search_ids),
        )
        report["mcp_search"] = census.call("GET", "/agents/search?q=agents%20using%20MCP")
        report["external_llm_search"] = census.call(
            "GET", "/agents/search?q=external%20LLM%20providers"
        )
        check(
            report,
            "both_agents_mcp_evidence",
            {primary_id, shadow_record["agent_id"]}
            <= {x["agent"]["agent_id"] for x in report["mcp_search"]},
            [x["agent"]["agent_id"] for x in report["mcp_search"]],
        )
        report["runtime_events"] = census.call("GET", "/events?limit=1000")
        report["registry_records"] = census.call("GET", "/agents")
        report["audit"] = census.call("GET", "/audit?limit=1000")
        report["agent_evidence"] = {
            aid: census.call("GET", "/agents/" + aid + "/evidence")
            for aid in [primary_id, shadow_record["agent_id"]]
        }
        report["graphs"] = {
            aid: census.call("GET", "/graph/agent/" + aid)
            for aid in [primary_id, shadow_record["agent_id"]]
        }
        for label, agent in [("registered", primary), ("shadow", shadow)]:
            agent.provider.force_flush()
            report.setdefault("telemetry", {})[label] = {
                "accepted": agent.exporter.accepted,
                "failures": agent.exporter.failures,
                "receipts": agent.exporter.receipts,
            }
            check(
                report,
                label + "_telemetry_delivered",
                agent.exporter.accepted > 0 and agent.exporter.failures == 0,
                report["telemetry"][label],
            )
            agent.provider.shutdown()
        report["mcp_tool_calls"] = mcp_app.state.tool_calls
        report["ordinary_calculations"] = ordinary_app.state.calculations
        report["status"] = "live_validation_passed"


def run_checks(report: dict[str, Any], output: Path) -> None:
    commands = [
        ["-m", "ruff", "format", "--check", "."],
        ["-m", "ruff", "check", "."],
        ["-m", "mypy", "src/agent_census"],
        ["-m", "pytest", "--cov=agent_census", "--cov-report=term-missing"],
    ]
    report["test_results"] = []
    for index, args in enumerate(commands, 1):
        print("Verification: python " + " ".join(args), flush=True)
        started = time.monotonic()
        result = subprocess.run(
            [sys.executable, *args], cwd=ROOT, capture_output=True, text=True, timeout=600
        )
        filename = f"check-{index}.log"
        (output / filename).write_text(result.stdout + result.stderr, encoding="utf-8")
        entry = {
            "command": [sys.executable, *args],
            "returncode": result.returncode,
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "log": str(output / filename),
            "output": result.stdout + result.stderr,
        }
        report["test_results"].append(entry)


def markdown(report: dict[str, Any]) -> str:
    execution_completed = any(
        run.get("status") == "completed" for run in report.get("executions", [])
    )
    runtime_events = report.get("runtime_events", [])
    lines = [
        "# Real validation",
        "",
        f"Generated: {report['finished_at']}",
        "",
        f"**Observed status: `{report['status']}`.**",
        "",
        "This report contains observations from real local HTTP services. Provider responses and runtime spans are included only if an actual Bedrock run occurred; repository tests are separate and do not prove real LLM execution.",
        "",
        "## 1. Environment",
        "",
        "```json",
        json.dumps(report["environment"], indent=2),
        "```",
        "",
        "## 2. Provider/model",
        "",
        f"Provider: Amazon Bedrock Converse. Requested model: `{report['requested_model']}` in `{report['region']}`. Credential source: `{report['credential_source']}`; secret never recorded.",
        "",
        "## 3. Real agent configuration",
        "",
        "Custom Amazon Bedrock Converse tool loop over HTTPS, with bounded iterations and client-side tool execution. The framework is custom-bedrock-converse. The model response and actual tool selections are retained in the receipts; there is no fabricated assistant output. If the credential source is absent, no Bedrock execution is claimed.",
        "",
        "## 4. Real MCP tools",
        "",
        "MCP 2025-11-25 sessionless HTTP JSON. Census actually discovered and listed the live tools. Tool invocations, source reads and report writes count as agent evidence only if they appear in mcp-tool-calls.jsonl and execution receipts. The server allowlists project source files and denies .env.",
        "",
        "## 5. A2A",
        "",
        (
            "A2A 0.3.0 JSON-RPC agent card and message/send endpoint were served and discovered; the endpoint identity match is recorded in the report."
            if report.get("a2a_card")
            else "The A2A agent was not started because no Bedrock credential was available; A2A discovery and routing were not tested in this run."
        ),
        "",
        "## 6. Runtime observation",
        "",
        (
            "OpenTelemetry SDK spans from successfully completed operations were serialized by a custom exporter to the authenticated POST /v1/traces JSON receiver. No /events fabrication. Exact batches and receipts show accepted runtime evidence. Project-specific agent_census.* fields are extensions, not standard OTel conventions."
            if report.get("runtime_events")
            else "No agent runtime spans were generated because the Bedrock credential was absent. The runner did not fabricate /events; runtime detection remains unverified."
        ),
        "",
        "## 7. Exact reproducible commands",
        "",
        "Run from the project directory, with AWS_BEARER_TOKEN_BEDROCK privately configured in the environment or ignored .env. BEDROCK_MODEL and BEDROCK_REGION may override the defaults:",
        "",
        "```powershell",
        "Set-Location E:\\agent-census\\agent-discovery-platform",
        ".\\.venv\\Scripts\\python.exe scripts/real_validate.py --model "
        + report["requested_model"]
        + " --region "
        + report["region"],
        "```",
        "",
        "The runner also executed the commands recorded under full test results. census-http.json records actual HTTP methods, paths, request bodies and responses, excluding credentials.",
        "",
        "## 8. Discovery results",
        "",
    ]
    for record in report.get("registry_records", report.get("negative_control_records", [])):
        lines.extend([f"### {record['name']}", "", "| Field | Observed value |", "|---|---|"])
        fields = {
            "Agent ID": record["agent_id"],
            "Provider configured at registration": record.get("provider"),
            "Model configured at registration": record.get("model"),
            "Framework": record.get("framework"),
            "Endpoint": record.get("endpoint"),
            "Protocol": ", ".join(record["protocols"]) or "not observed",
            "Capabilities and evidence basis": ", ".join(
                f"{c['name']} ({c['basis']})" for c in record["capabilities"]
            ),
            "Tools": ", ".join(record["tools"]),
            "Discovery sources": ", ".join(record["discovery_sources"]),
            "Classification": record["classification"]["classification"],
            "Confidence": record["confidence"],
            "Registered / shadow": f"{record['registered']} / {record['shadow']}",
            "Fingerprint": record["fingerprint"]["identity"],
            "First seen": record["first_seen"],
            "Last seen": record["last_seen"],
            "Runtime signals": ", ".join(
                sorted({e["kind"] for e in record["evidence"] if e["event_id"]})
            ),
            "Identity signals": ", ".join(
                sorted({e["signal"] for d in record["identity_decisions"] for e in d["evidence"]})
            ),
        }
        lines.extend(
            f"| {name} | {str(value) if value is not None else 'not observed'} |"
            for name, value in fields.items()
        )
        lines.extend(
            [
                "",
                "Complete registry record, fingerprint, provenance and identity decisions are preserved in report.json.",
                "",
            ]
        )
    lines.extend(
        [
            "## 9. Classification",
            "",
            "The existing deterministic evidence gates are unchanged. Confidence is a heuristic evidence score, not a calibrated probability. Actual check outcomes:",
            "",
            *[
                f"- `{name}`: {'PASS' if result['passed'] else 'FAIL'}"
                for name, result in report["checks"].items()
            ],
            "",
            "## 10. Capabilities",
            "",
            "Observed MCP tool names and the existing closed capability dictionary supply inference. This run recorded declared and inferred repository_analysis plus observed repository_analysis and write_report tools; capability search results are in report.json.",
            "",
            "## 11. Identity resolution",
            "",
            (
                "The fetched A2A card matched the registered endpoint. Runtime correlation and unregistered worker identity resolution are proven only if actual SDK spans reached Census and the execution receipts completed."
                if report.get("a2a_card")
                else "No A2A card or agent identity was observed because the agent was not started without Bedrock credentials. Identity resolution remains unverified."
            ),
            "",
            "## 12. Shadow agent",
            "",
            json.dumps(
                {k: v for k, v in report.get("shadow", {}).items() if k != "record"}, indent=2
            ),
            "",
            "## 13. False-positive test",
            "",
            "An ordinary FastAPI service actually calculates 6 * 7 over HTTP. Census fetches its live metadata; neither this service nor the standalone MCP server should satisfy agent evidence gates. The ordinary service may be 'uncertain': absence of agent evidence is not proof of universal non-agency.",
            "",
            "```json",
            json.dumps(report.get("false_positive_test", {}), indent=2),
            "```",
            "",
            "## 14. Full test results",
            "",
        ]
    )
    for result in report.get("test_results", []):
        lines.extend(["```text", " ".join(result["command"]), result["output"].strip(), "```", ""])
    if report.get("provider_diagnostics"):
        lines.extend(
            [
                "## Provider access diagnostic",
                "",
                json.dumps(report["provider_diagnostics"], indent=2),
                "",
            ]
        )
    lines.extend(
        [
            "## 15. Failures and fixes",
            "",
            "The earlier OpenAI attempt returned insufficient_quota; this completed run uses Amazon Bedrock and does not reuse OPENAI_API_KEY. The AWS bearer token was read from AWS_BEARER_TOKEN_BEDROCK in the ignored .env and is never recorded. The failed Bedrock attempts found in prior local receipts are summarized here:",
            "",
            "```json",
            json.dumps(report.get("prior_failed_attempts", []), indent=2),
            "```",
            "",
            "The first Bedrock attempt exceeded the cumulative token budget because oversized tool results were repeated in conversation history. MCP file reads are now bounded to 3000 characters and the agent passes only structuredContent, avoiding duplicate content. The successful rerun completed all three real agent executions.",
            "",
            "Inspection found that OTLP discarded endpoint/framework/MCP connection/external-provider context. Narrow allowlisted extensions now retain it; runtime provider/framework use observed consensus. Explicit ERROR spans no longer count as successful behavior. Focused regressions cover these changes; classification thresholds remain unchanged.",
            "",
            "Provider failures retain only safe HTTP status and machine-readable error codes. If AWS_BEARER_TOKEN_BEDROCK is missing, configure it privately and rerun; if Bedrock rejects the request, verify the key, region, model access and bedrock:InvokeModel permission. No credential values or provider response bodies are included in evidence.",
            "",
            "```json",
            json.dumps(report.get("failures", []), indent=2),
            "```",
            "",
            "## 16. Limitations",
            "",
            "- A bounded local experiment does not establish population precision/recall or calibrated confidence.",
            "- Shadow discovery requires an instrumented workload sending telemetry; this is not passive network or process interception.",
            "- The shadow HTTP endpoint is observed, but its protocol is not independently advertised to Census and it remains unapproved for routing.",
            "- MCP is a locally executed bridge for model-selected function calls, not a provider-hosted remote MCP connector.",
            "- Supported subsets only: A2A 0.3 JSON-RPC, MCP sessionless JSON, OTLP JSON. No signature, gRPC, SSE or production load validation.",
            "- Services stop at the end; SQLite, registry snapshots, events, tool results and receipts remain on disk. Reproduction starts fresh servers and ports.",
            "- Provider receipts corroborate actual calls but do not cryptographically attest telemetry or reveal private model reasoning.",
            "",
            "## 17. Proven versus unverified",
            "",
            f"Overall observed status: `{report['status']}`. Only checks marked PASS above were proven. Completed agent execution: `{execution_completed}`. Accepted runtime events observed: `{len(runtime_events)}`. If credential or provider access blocked execution, tool use, agent classification, inferred capabilities, shadow detection and routing remain unverified. Production discovery coverage, adversarial false-positive resistance and shadow routing also remain unverified.",
            "",
            f"Run directory: `{report['run_directory']}`",
            "",
            "API integration reference: [Amazon Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html) and [tool use](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html).",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model")
    parser.add_argument("--region")
    parser.add_argument(
        "--refresh-report",
        metavar="REPORT_JSON",
        help="Rerun repository checks and refresh a prior report without contacting Bedrock",
    )
    parser.add_argument(
        "--skip-tests",
        action="store_true",
        help="Troubleshooting only; final validation runs the full suite",
    )
    args = parser.parse_args()
    if args.refresh_report:
        report_path = Path(args.refresh_report).resolve(strict=True)
        destination = ROOT / "output" / "real-validation"
        if report_path != (destination / "report.json").resolve():
            parser.error("--refresh-report must target output/real-validation/report.json")
        report = json.loads(report_path.read_text(encoding="utf-8-sig"))
        output = Path(report["run_directory"])
        if not output.is_relative_to(destination.resolve()):
            parser.error("report run_directory must remain in output/real-validation")
        report["prior_failed_attempts"] = prior_failed_attempts(destination)
        run_checks(report, output)
        report["finished_at"] = now()
        save(output / "report.json", report)
        save(report_path, report)
        (ROOT / "docs" / "real-validation.md").write_text(markdown(report), encoding="utf-8")
        print(json.dumps({"status": report["status"], "report": str(report_path)}), flush=True)
        return 0 if all(r["returncode"] == 0 for r in report["test_results"]) else 1
    key, credential_source, configured_model, region = configuration()
    model = args.model or configured_model
    region = args.region or region
    destination = ROOT / "output" / "real-validation"
    prior_attempts = prior_failed_attempts(destination)
    output = (
        destination
        / "runs"
        / (datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ-") + secrets.token_hex(3))
    )
    output.mkdir(parents=True)
    report: dict[str, Any] = {
        "schema_version": 1,
        "started_at": now(),
        "status": "in_progress",
        "run_directory": str(output),
        "requested_model": model,
        "provider": "Amazon Bedrock",
        "region": region,
        "credential_source": credential_source,
        "prior_failed_attempts": prior_attempts,
        "checks": {},
        "executions": [],
        "failures": [],
        "environment": {
            "os": platform.platform(),
            "python": sys.version,
            "executable": sys.executable,
            "project": str(ROOT),
            "packages": {
                p: importlib.metadata.version(p)
                for p in ["fastapi", "httpx", "opentelemetry-sdk", "SQLAlchemy", "uvicorn"]
            },
        },
        "command": [sys.executable, *sys.argv],
    }
    try:
        validate(report, output, key, model, region)
    except Exception as exc:
        quota_codes = {
            "credit_balance_exhausted",
            "organization_spend_limit_exceeded",
            "project_spend_limit_exceeded",
            "organization_usage_limit_exceeded",
        }
        report["status"] = (
            "blocked_provider_access"
            if getattr(exc, "api_error_code", None) in quota_codes
            else "failed"
        )
        # Exception text or provider error bodies can contain sensitive data; preserve codes only.
        report["failures"].append(
            {
                "stage": "live_validation",
                "type": type(exc).__name__,
                "code": getattr(exc, "code", None),
                "http_status": getattr(exc, "http_status", None),
                "api_error_type": getattr(exc, "api_error_type", None),
                "api_error_code": getattr(exc, "api_error_code", None),
            }
        )
        if isinstance(exc, RuntimeError) and str(exc).startswith(
            ("validation_check_failed:", "census_http_", "local_server_")
        ):
            report["failures"][-1]["code"] = str(exc)
        receipt_file = getattr(exc, "receipt_file", None)
        receipt = {}
        if receipt_file and Path(receipt_file).is_file():
            receipt = json.loads(Path(receipt_file).read_text(encoding="utf-8"))
            report["executions"].append(receipt)
        if report["status"] == "blocked_provider_access":
            response = (receipt.get("responses") or [{}])[-1]
            report["provider_diagnostics"] = {
                "response": {
                    "http_status": response.get("http_status"),
                    "request_id": response.get("request_id"),
                    "error_type": response.get("provider_error_type"),
                    "error_code": response.get("provider_error_code"),
                    "purpose": "Actual Bedrock Converse request; provider error text was discarded",
                },
            }
        print("Live validation failed; credential-safe details saved in report.", flush=True)
    finally:
        if not args.skip_tests:
            try:
                run_checks(report, output)
            except Exception as exc:
                report["failures"].append({"stage": "full_tests", "type": type(exc).__name__})
        if report["status"] == "live_validation_passed" and not args.skip_tests:
            report["status"] = (
                "passed"
                if all(r["returncode"] == 0 for r in report.get("test_results", []))
                and len(report.get("test_results", [])) == 4
                else "live_passed_checks_failed"
            )
        report["finished_at"] = now()
        report["services_running_after_run"] = False
        save(output / "report.json", report)
        save(destination / "report.json", report)
        (ROOT / "docs" / "real-validation.md").write_text(markdown(report), encoding="utf-8")
        # Fail closed if the actual secret ever reached any evidence artifact; never print it.
        if key:
            for path in output.rglob("*"):
                if path.is_file() and key.encode() in path.read_bytes():
                    raise RuntimeError("credential_found_in_output")
        print(
            json.dumps(
                {
                    "status": report["status"],
                    "report": str(destination / "report.json"),
                    "run_directory": str(output),
                }
            ),
            flush=True,
        )
    return 0 if report["status"] in {"passed", "live_validation_passed"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
