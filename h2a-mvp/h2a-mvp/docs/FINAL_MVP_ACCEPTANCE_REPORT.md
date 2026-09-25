# H2A V0 Final MVP Acceptance Report

> Current demonstration deviation (2026-08-21): liveness is temporarily configured as `demo-bypass` by owner approval. The implementation remains available, but new proofs are `substantial` face/distance/BCH proofs and do not substantiate a liveness/high-assurance claim until `livenessMode` is restored to `required` and H2A is restarted.

Date: 2026-08-20  
Decision: Accepted for local HP CTO/CISO demonstration

> Historical scope notice (2026-08-20): this report accepts only the scripted V0 control-plane demonstration. `PLAN_OF_ACTION_2.md` now governs live-product acceptance. Live provider collaboration, multi-human authority V2, context minimization, and governed runtime containment are incomplete and are not accepted by this report.

## Accepted Scope

H2A V0 demonstrates a human-bound control plane for a provider-neutral office of agents. It runs locally without a backend, performs real local face, liveness, distance, ArcFace, and BCH proof, issues signed Agent Passports and mandates, routes deterministic agent work, enforces disclosure and approval policy, contains revoked authority, and reconstructs activity through a verified evidence chain.

The demonstration uses scripted execution so it requires no third-party credentials or network calls. OpenAI Codex, Claude Code, Gemini/Antigravity, custom CLI, and AWS Bedrock are represented by truthful provider definitions and a shared runtime contract. Live execution remains disabled until an approved adapter is connected.

## Acceptance Results

| Gate | Result | Evidence |
|---|---|---|
| Clean executive session | Pass | additive session generator and overwrite-refusal test |
| Complete control workflow | Pass | `tests/executive-demo.test.ts` and `scenarios/executive-demo.json` |
| Unit, contract, and integration suite | Pass | 54 tests in 12 files |
| Type safety and lint | Pass | `pnpm typecheck`, `pnpm lint` |
| Production package build | Pass | `pnpm build` |
| Native desktop startup | Pass | isolated session, four healthy Electron processes, empty stderr |
| Responsive visual quality | Pass | desktop and mobile screenshot set plus prior intermediate viewport regression checks |
| Renderer trust boundary | Pass | forbidden-import scan and secure preload architecture |
| Requirements closure | Pass | R-001 through R-030 are `verified` |
| Runbook and recovery | Pass | `docs/DEMO_OPERATOR_RUNBOOK.md` |

## Executive Evidence Path

1. Enroll and verify a live human in Human Proof.
2. Issue signed passports for a scripted coordinator and OpenAI, Claude, and Gemini provider lanes.
3. Issue a root mandate and bounded specialist delegations.
4. Run the normal scenario and inspect routing, disclosures, decisions, responses, and evidence.
5. Run an out-of-scope request and show deterministic denial.
6. Run a protected action, pause it, re-verify the human, approve it, and resume.
7. Revoke authority and show descendant containment.
8. Reconstruct the chain in Evidence and export the minimized, hash-addressed JSON bundle.

## Demonstrable Claims

- local operation and persistence do not require a backend;
- raw camera frames and ArcFace embeddings are not retained by default;
- Agent Passport identity is separate from provider runtime binding;
- mandates are signed, scoped, attenuated, approval-aware, and revocable;
- scripted agents use real H2A policy, storage, routing, disclosure, and evidence services;
- the evidence ledger detects modification and identifies the first failed event;
- audit export is minimized, canonical, integrity-bound, and locally recorded;
- storage and runtime contracts preserve explicit backend, live CLI, and Bedrock replacement points.

## Non-Claims And Residual Work

- V0 is not a public, multi-tenant, compliance-certified production deployment.
- Provider-labelled scripted lanes do not claim live OpenAI, Anthropic, Google, or Bedrock model calls.
- Local hash chaining is tamper-evident, not external notarization or hardware-backed non-repudiation.
- Biometric suitability still requires enterprise model licensing, consent, retention, device, bias, and independent security review.
- Remote identity, database, key-management, observability, disaster recovery, and deployment controls remain production-phase integrations.

## Decision Basis

The product, tests, runbook, threat model, controls matrix, traceability matrix, and visual evidence agree on the same V0 boundary. No acceptance item is blocked, no requirement needs an exception, and no visible control claims live provider or backend behavior that is unavailable. H2A V0 is therefore complete for its stated demonstration purpose.
