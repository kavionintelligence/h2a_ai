# H2A Scenarios

The Phase 8 `governed-enterprise-review` scenario is defined by `packages/agents/src/scenarioService.ts` and persisted under `data/h2a-demo/scenarios/` at runtime.

It derives its participants from a signed root mandate and delegated descendants, creates real specialist and coordinator assignments, and executes every step through policy authorization, bounded resource disclosure, collaboration persistence, and hash-chained evidence. The supported deterministic outcomes are success, denial, Human Approval, provider failure, timeout, and revocation.

Scenario definitions contain no signed fixtures or fabricated provider output. `ScriptedWorkplaceRuntime` produces deterministic local execution results; live CLI and AWS Bedrock ports remain contract-compatible and explicitly disabled.

See `docs/SCRIPTED_MULTI_AGENT_RUNTIME.md` and `tests/scripted-scenario.test.ts`.

Phase 10 adds `executive-demo.json` as the operator-facing sequence and evidence manifest. Use `pnpm demo:new-session` to create a new isolated data root. The command never resets by deleting or rewriting an existing evidence directory.
