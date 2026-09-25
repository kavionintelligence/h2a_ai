# Troubleshooting

| Symptom | Explanation and action |
|---|---|
| Startup says admin token missing | Run `scripts/init_env.py`, load `.env` into the shell, then start the API. It does not silently permit unauthenticated writes. |
| No entities in dashboard | The persistent API starts empty. Use `scripts/serve_demo.py` for a populated ephemeral demonstration, or submit authorized observations. |
| 401 / 403 | Supply the correct Bearer role token. Ingest cannot read inventory; reader cannot register, approve, delete or route. |
| `endpoint_denied` | Add only the intended origin, including dynamic port, to `CENSUS_ALLOWED_ORIGINS`; blocklist wins. |
| Local HTTP is rejected | Local experiments need both `CENSUS_ALLOW_HTTP=true` and `CENSUS_ALLOW_PRIVATE=true`, plus the explicit origin. Demo code sets these for its own loopback port. |
| TLS validation fails | Fix the upstream certificate/trust chain. Do not turn certificate validation off. |
| Registered agent is uncertain | Registration is a declaration; supply actual behavioral evidence through the event/OTLP endpoint. |
| Search finds an entity but routing returns 409 | Search can surface unverified or unhealthy agents. Matching requires operator approval, recent health, recent behavior, compatible auth, all required capabilities and an endpoint. Read the exclusion reasons. |
| Agent loses agent/shadow status | The behavioral evidence window expired. Emit fresh telemetry. A health check alone does not prove internal agent behavior. |
| Event replay reports accepted=0 | Event IDs are idempotency keys during the retained window. Use one ID per actual event. |
| An event batch returns 422 | Inspect timezone, allowed event types and event-window timestamps. Malformed input isn't echoed for confidentiality. |
| Discovery returns partial errors | Inspect source/item/code, verify item schema and policy, fix only the failed collector and resubmit. Successful sources are already stored. |
| A2A/MCP target discovery works but execution is rejected | Check the supported version/binding/JSON transport profile and outbound authentication restrictions in `protocols.md`. |
| Health is unhealthy | The target must expose `<endpoint>/health` and return 2xx. Health logs avoid upstream payloads; use target-side operational telemetry. |
| pytest cannot write OS temp/cache | Run with `--basetemp ./output/test-temp -p no:cacheprovider` in a writable directory. Pytest may clean that chosen temp directory, so use a dedicated test-only directory. |
| PowerShell activation is blocked | Use `.venv\Scripts\python.exe` explicitly instead of changing machine execution policy. |
| Port 8000 is occupied | Stop your own conflicting service or pass another port to uvicorn. The one-shot demo allocates its mock port dynamically. |

The synthetic demo does not download model weights or call external providers. Initial package installation needs network access; runtime does not. `requirements.lock` includes hashes for reproducible dependencies across supported Python platforms. See `docs/validation.md` for the exact tested environment.
