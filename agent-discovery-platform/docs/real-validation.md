# Real validation

Generated: 2026-09-24T11:25:33.763628+00:00

**Observed status: `passed`.**

This report contains observations from real local HTTP services. Provider responses and runtime spans are included only if an actual Bedrock run occurred; repository tests are separate and do not prove real LLM execution.

## 1. Environment

```json
{
  "os": "Windows-11-10.0.26200-SP0",
  "python": "3.12.10 (tags/v3.12.10:0cc8128, Apr  8 2025, 12:21:36) [MSC v.1943 64 bit (AMD64)]",
  "executable": "E:\\agent-census\\agent-discovery-platform\\.venv\\Scripts\\python.exe",
  "project": "E:\\agent-census\\agent-discovery-platform",
  "packages": {
    "fastapi": "0.135.1",
    "httpx": "0.28.1",
    "opentelemetry-sdk": "1.40.0",
    "SQLAlchemy": "2.0.48",
    "uvicorn": "0.41.0"
  }
}
```

## 2. Provider/model

Provider: Amazon Bedrock Converse. Requested model: `us.anthropic.claude-sonnet-4-6` in `us-east-1`. Credential source: `.env`; secret never recorded.

## 3. Real agent configuration

Custom Amazon Bedrock Converse tool loop over HTTPS, with bounded iterations and client-side tool execution. The framework is custom-bedrock-converse. The model response and actual tool selections are retained in the receipts; there is no fabricated assistant output. If the credential source is absent, no Bedrock execution is claimed.

## 4. Real MCP tools

MCP 2025-11-25 sessionless HTTP JSON. Census actually discovered and listed the live tools. Tool invocations, source reads and report writes count as agent evidence only if they appear in mcp-tool-calls.jsonl and execution receipts. The server allowlists project source files and denies .env.

## 5. A2A

A2A 0.3.0 JSON-RPC agent card and message/send endpoint were served and discovered; the endpoint identity match is recorded in the report.

## 6. Runtime observation

OpenTelemetry SDK spans from successfully completed operations were serialized by a custom exporter to the authenticated POST /v1/traces JSON receiver. No /events fabrication. Exact batches and receipts show accepted runtime evidence. Project-specific agent_census.* fields are extensions, not standard OTel conventions.

## 7. Exact reproducible commands

Run from the project directory, with AWS_BEARER_TOKEN_BEDROCK privately configured in the environment or ignored .env. BEDROCK_MODEL and BEDROCK_REGION may override the defaults:

```powershell
Set-Location E:\agent-census\agent-discovery-platform
.\.venv\Scripts\python.exe scripts/real_validate.py --model us.anthropic.claude-sonnet-4-6 --region us-east-1
```

The runner also executed the commands recorded under full test results. census-http.json records actual HTTP methods, paths, request bodies and responses, excluding credentials.

## 8. Discovery results

### real-repository-tools

| Field | Observed value |
|---|---|
| Agent ID | AGT-067f8da5051f4331 |
| Provider configured at registration | not observed |
| Model configured at registration | not observed |
| Framework | not observed |
| Endpoint | http://127.0.0.1:64043/mcp |
| Protocol | mcp |
| Capabilities and evidence basis | repository_analysis (inferred) |
| Tools | repository_analysis, write_report |
| Discovery sources | mcp |
| Classification | probable_service |
| Confidence | 0.0 |
| Registered / shadow | False / False |
| Fingerprint | 44640de3f7f470f2afedb111 |
| First seen | 2026-09-24T11:19:24.973480Z |
| Last seen | 2026-09-24T11:19:24.973480Z |
| Runtime signals |  |
| Identity signals |  |

Complete registry record, fingerprint, provenance and identity decisions are preserved in report.json.

### arithmetic-http-service

| Field | Observed value |
|---|---|
| Agent ID | AGT-d707d1ea7a8d40c9 |
| Provider configured at registration | not observed |
| Model configured at registration | not observed |
| Framework | FastAPI |
| Endpoint | http://127.0.0.1:64044/calculate |
| Protocol | http |
| Capabilities and evidence basis |  |
| Tools |  |
| Discovery sources | api_registry |
| Classification | uncertain |
| Confidence | 0.0 |
| Registered / shadow | False / False |
| Fingerprint | 7994bdd496a378dbe2f10146 |
| First seen | 2026-09-24T11:19:25.104916Z |
| Last seen | 2026-09-24T11:19:25.104916Z |
| Runtime signals |  |
| Identity signals |  |

Complete registry record, fingerprint, provenance and identity decisions are preserved in report.json.

### census-repository-analyst

| Field | Observed value |
|---|---|
| Agent ID | AGT-d7f95b01e91c45dc |
| Provider configured at registration | Amazon Bedrock |
| Model configured at registration | us.anthropic.claude-sonnet-4-6 |
| Framework | custom-bedrock-converse |
| Endpoint | http://127.0.0.1:64045/a2a |
| Protocol | a2a |
| Capabilities and evidence basis | repository_analysis (declared), repository_analysis (inferred), tool:repository_analysis (observed), tool:write_report (observed) |
| Tools | repository_analysis, write_report |
| Discovery sources | a2a, manual, opentelemetry, router |
| Classification | confirmed_agent |
| Confidence | 0.91 |
| Registered / shadow | True / False |
| Fingerprint | 3f66e5774b56dc90ce1c498f |
| First seen | 2026-09-24T11:19:25.405155Z |
| Last seen | 2026-09-24T11:20:54.300194Z |
| Runtime signals | autonomous_action, llm_call, llm_location, llm_provider, mcp_connection, multi_step, tool_call |
| Identity signals | same_endpoint, same_source_identity |

Complete registry record, fingerprint, provenance and identity decisions are preserved in report.json.

### unregistered-repository-worker

| Field | Observed value |
|---|---|
| Agent ID | AGT-33c1c3c836d24f05 |
| Provider configured at registration | aws.bedrock |
| Model configured at registration | us.anthropic.claude-sonnet-4-6 |
| Framework | custom-bedrock-converse |
| Endpoint | http://127.0.0.1:64046/run |
| Protocol | not observed |
| Capabilities and evidence basis | repository_analysis (inferred), tool:repository_analysis (observed), tool:write_report (observed) |
| Tools | repository_analysis, write_report |
| Discovery sources | opentelemetry |
| Classification | probable_agent |
| Confidence | 0.88 |
| Registered / shadow | False / True |
| Fingerprint | c8140734bdf6091185def668 |
| First seen | 2026-09-24T11:20:54.622224Z |
| Last seen | 2026-09-24T11:21:32.380607Z |
| Runtime signals | autonomous_action, llm_call, llm_location, llm_provider, mcp_connection, multi_step, tool_call |
| Identity signals | same_endpoint, same_source_identity |

Complete registry record, fingerprint, provenance and identity decisions are preserved in report.json.

## 9. Classification

The existing deterministic evidence gates are unchanged. Confidence is a heuristic evidence score, not a calibrated probability. Actual check outcomes:

- `live_service_discovery`: PASS
- `ordinary_and_mcp_are_not_agents`: PASS
- `registration_alone_not_agent`: PASS
- `live_a2a_card_discovered`: PASS
- `card_identity_merge`: PASS
- `registered_real_agent`: PASS
- `real_a2a_routing`: PASS
- `shadow_absent_before_execution`: PASS
- `shadow_discovered_without_registration`: PASS
- `both_agents_capability_search`: PASS
- `both_agents_mcp_evidence`: PASS
- `registered_telemetry_delivered`: PASS
- `shadow_telemetry_delivered`: PASS

## 10. Capabilities

Observed MCP tool names and the existing closed capability dictionary supply inference. This run recorded declared and inferred repository_analysis plus observed repository_analysis and write_report tools; capability search results are in report.json.

## 11. Identity resolution

The fetched A2A card matched the registered endpoint. Runtime correlation and unregistered worker identity resolution are proven only if actual SDK spans reached Census and the execution receipts completed.

## 12. Shadow agent

{
  "why_detected": [
    "observed autonomous_action",
    "observed llm_call",
    "observed multi_step",
    "observed tool_call",
    "LLM, tool, decision and continuation evidence gates satisfied"
  ],
  "runtime_signals": [
    "autonomous_action",
    "llm_call",
    "llm_location",
    "llm_provider",
    "mcp_connection",
    "multi_step",
    "tool_call"
  ],
  "false_positive_conditions": [
    "Authorized telemetry can be spoofed; this classifier does not attest provider responses.",
    "Broad model-selected action signals can also describe bounded tool loops; scores are heuristic."
  ],
  "routing_limit": "No advertised protocol or trust approval; telemetry alone does not authorize routing."
}

## 13. False-positive test

An ordinary FastAPI service actually calculates 6 * 7 over HTTP. Census fetches its live metadata; neither this service nor the standalone MCP server should satisfy agent evidence gates. The ordinary service may be 'uncertain': absence of agent evidence is not proof of universal non-agency.

```json
{
  "http_status": 200,
  "result": {
    "operation": "multiply",
    "left": 6.0,
    "right": 7.0,
    "result": 42.0,
    "observed_at": "2026-09-24T11:19:24.535452+00:00"
  }
}
```

## 14. Full test results

```text
E:\agent-census\agent-discovery-platform\.venv\Scripts\python.exe -m ruff format --check .
32 files already formatted
```

```text
E:\agent-census\agent-discovery-platform\.venv\Scripts\python.exe -m ruff check .
All checks passed!
```

```text
E:\agent-census\agent-discovery-platform\.venv\Scripts\python.exe -m mypy src/agent_census
Success: no issues found in 12 source files
```

```text
E:\agent-census\agent-discovery-platform\.venv\Scripts\python.exe -m pytest --cov=agent_census --cov-report=term-missing
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-9.0.2, pluggy-1.6.0
rootdir: E:\agent-census\agent-discovery-platform
configfile: pyproject.toml
testpaths: tests
plugins: anyio-4.12.1, cov-7.0.0
collected 100 items

tests\e2e\test_offline_demo.py .....                                     [  5%]
tests\integration\test_real_validation_telemetry.py .....                [ 10%]
tests\integration\test_registry_security.py ......                       [ 16%]
tests\integration\test_telemetry_monitor.py ...                          [ 19%]
tests\integration\test_workflow.py ...                                   [ 22%]
tests\unit\test_adapters.py .........                                    [ 31%]
tests\unit\test_detection.py ....................................        [ 67%]
tests\unit\test_regressions.py ..........                                [ 77%]
tests\unit\test_routing.py .............                                 [ 90%]
tests\unit\test_security.py ..........                                   [100%]

=============================== tests coverage ================================
______________ coverage: platform win32, python 3.12.10-final-0 _______________

Name                                Stmts   Miss  Cover   Missing
-----------------------------------------------------------------
src\agent_census\__init__.py            1      0   100%
src\agent_census\api.py               249     24    90%   75-76, 172, 205-210, 214, 260-263, 285, 288, 341, 356, 378-390
src\agent_census\config.py             33      5    85%   32, 34, 38-41
src\agent_census\demo.py              120      1    99%   332
src\agent_census\detection.py         293     18    94%   143, 152, 369, 573, 585, 596, 599-600, 615, 620, 623, 627, 630, 634, 636, 648, 651, 677
src\agent_census\discovery.py         277     29    90%   24, 30, 107, 121, 149, 159, 188, 241, 243, 281, 286, 288, 301, 314, 319, 367, 375-378, 444, 448-449, 501-502, 514-515, 566-574
src\agent_census\mock_platform.py      84      8    90%   74, 79, 126, 149, 152, 199-200, 209
src\agent_census\models.py            183      3    98%   37, 85, 118
src\agent_census\routing.py           111     15    86%   28, 34, 45, 72, 81, 87, 119, 129, 135, 152, 166, 171, 177, 179, 188
src\agent_census\security.py          129     15    88%   114, 117-118, 148-149, 151, 193, 235, 238, 243-246, 250-253
src\agent_census\service.py           202     14    93%   58, 148, 173, 263-264, 320-323, 329-331, 386, 414, 416, 418
src\agent_census\storage.py           134      4    97%   134-135, 144-145
-----------------------------------------------------------------
TOTAL                                1816    136    93%
============================ 100 passed in 10.40s =============================
```

## 15. Failures and fixes

The earlier OpenAI attempt returned insufficient_quota; this completed run uses Amazon Bedrock and does not reuse OPENAI_API_KEY. The AWS bearer token was read from AWS_BEARER_TOKEN_BEDROCK in the ignored .env and is never recorded. The failed Bedrock attempts found in prior local receipts are summarized here:

```json
[
  {
    "run_directory": "E:\\agent-census\\agent-discovery-platform\\output\\real-validation\\runs\\20260924T111630Z-1728ed",
    "provider": "amazon-bedrock",
    "model": "us.anthropic.claude-sonnet-4-6",
    "error_code": "token_budget_exceeded",
    "provider_responses": 4,
    "mcp_tool_calls": 6,
    "accepted_runtime_spans": 19
  }
]
```

The first Bedrock attempt exceeded the cumulative token budget because oversized tool results were repeated in conversation history. MCP file reads are now bounded to 3000 characters and the agent passes only structuredContent, avoiding duplicate content. The successful rerun completed all three real agent executions.

Inspection found that OTLP discarded endpoint/framework/MCP connection/external-provider context. Narrow allowlisted extensions now retain it; runtime provider/framework use observed consensus. Explicit ERROR spans no longer count as successful behavior. Focused regressions cover these changes; classification thresholds remain unchanged.

Provider failures retain only safe HTTP status and machine-readable error codes. If AWS_BEARER_TOKEN_BEDROCK is missing, configure it privately and rerun; if Bedrock rejects the request, verify the key, region, model access and bedrock:InvokeModel permission. No credential values or provider response bodies are included in evidence.

```json
[]
```

## 16. Limitations

- A bounded local experiment does not establish population precision/recall or calibrated confidence.
- Shadow discovery requires an instrumented workload sending telemetry; this is not passive network or process interception.
- The shadow HTTP endpoint is observed, but its protocol is not independently advertised to Census and it remains unapproved for routing.
- MCP is a locally executed bridge for model-selected function calls, not a provider-hosted remote MCP connector.
- Supported subsets only: A2A 0.3 JSON-RPC, MCP sessionless JSON, OTLP JSON. No signature, gRPC, SSE or production load validation.
- Services stop at the end; SQLite, registry snapshots, events, tool results and receipts remain on disk. Reproduction starts fresh servers and ports.
- Provider receipts corroborate actual calls but do not cryptographically attest telemetry or reveal private model reasoning.

## 17. Proven versus unverified

Overall observed status: `passed`. Only checks marked PASS above were proven. Completed agent execution: `True`. Accepted runtime events observed: `57`. If credential or provider access blocked execution, tool use, agent classification, inferred capabilities, shadow detection and routing remain unverified. Production discovery coverage, adversarial false-positive resistance and shadow routing also remain unverified.

Run directory: `E:\agent-census\agent-discovery-platform\output\real-validation\runs\20260924T111924Z-50edbf`

API integration reference: [Amazon Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html) and [tool use](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html).
