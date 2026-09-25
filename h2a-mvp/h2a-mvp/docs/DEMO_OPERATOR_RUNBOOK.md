# H2A Executive Demo Operator Runbook

> Liveness is temporarily bypassed for the local demonstration. Do not perform or claim the liveness acceptance step until `livenessMode` is restored to `required` in the active session and H2A is restarted. See `docs/TEMPORARY_LIVENESS_BYPASS.md`.

## Audience And Goal

This runbook is for the operator presenting H2A to an HP CTO, CISO, security architect, or AI governance leader. The demonstration proves that one verified human can create provider-neutral agent identities, constrain them with signed authority, supervise sensitive work, contain revoked authority, and reconstruct the result from persisted evidence.

Expected duration: 20 to 30 minutes. The Electron desktop application is the functional demonstration surface. The browser preview is for layout inspection only.

## Before The Meeting

1. From `h2a-mvp`, run `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
2. Confirm the camera is available and no other application is using it.
3. Run `pnpm demo:new-session`. Record the returned `dataPath` and `nextCommand`.
4. Run the returned PowerShell command. It sets `H2A_DATA_PATH` to a new isolated session and launches H2A.
5. Confirm Settings reports local-file storage, scripted-workplace agent mode, local-face-bch Human Proof, sandbox resources, and verified evidence.

Never demonstrate against an unexplained prior session. A new session preserves prior evidence because no existing data directory is modified or deleted.

## Stage 1 - Establish The Human Root

1. Open Human Proof.
2. Select enrollment and capture the operator's face.
3. Show the live quality, distance, face-count, and liveness checks.
4. Complete enrollment, then verification.
5. Point out that the UI retains no raw image and that BCH helper material remains in trusted local storage.

Evidence to name: `BIOMETRIC_ENROLLED`, `HUMAN_PROOF_ATTEMPTED`, and `HUMAN_VERIFIED`.

## Stage 2 - Create The Provider-Neutral Team

Use Add Agent to create these identities. No live provider credential is required because execution remains on the approved deterministic runtime.

| Name | Role | Provider lane | Recommended model | Capabilities |
|---|---|---|---|---|
| Maya | Program Coordinator | H2A Scripted | Coordinator V0 | `records.read`, `report.consolidate`, `record.export` |
| Aria | Policy Analyst | OpenAI / Codex | GPT-5 Codex | `records.read` |
| Noah | Security Reviewer | Claude Code | Claude Sonnet 4.5 | `records.read`, `record.export` |
| Isha | Research Specialist | Gemini / Antigravity | Gemini 3.1 Pro High | `records.read` |

Use a local demonstration workspace path. Explain that the Passport is durable identity while the provider runtime binding is independently revocable. Provider labels show interoperability contracts; they do not claim live model calls.

Evidence to name: `AGENT_BOUND` and `AGENT_RUNTIME_BOUND`.

## Stage 3 - Issue Root And Child Authority

Re-verify Human Proof if the five-minute proof has expired.

Create a root mandate for Maya:

- objective: `Produce an evidence-backed enterprise supplier security review`
- resource: `enterprise.review`
- actions: `records.read`, `report.consolidate`, `record.export`
- prohibited action: `records.delete`
- allowed fields: `recordId`, `controlId`, `finding`, `risk`
- approval action: `record.export`
- limits: 20 records, 60 minutes, amount 1000, tenant `hp-demo`
- delegation: allow Aria, Noah, and Isha; maximum depth 1

Delegate narrower children with the same objective and resource:

- Aria: `records.read`, fields `recordId` and `controlId`, 5 records, 20 minutes.
- Noah: `records.read` and `record.export`; retain Human Approval for `record.export`.
- Isha: `records.read`, fields `recordId` and `controlId`, 5 records, 20 minutes.

Show the signed root, child scopes, and parent-to-child ancestry. Explain that changing the objective, broadening fields, increasing limits, or escaping the allowlist is rejected.

Evidence to name: `MANDATE_CREATED`, `MANDATE_SIGNED`, and `DELEGATION_CREATED`.

## Stage 4 - Run The Executive Outcomes

On the Command Floor, select the root mandate in Enterprise Scenario Runner.

1. Run Successful run. Inspect created specialist assignments, coordinator dependency, messages, responses, and completed workflow.
2. Run Policy denial. Show that `h2a.scope.escape` is denied before disclosure or runtime execution.
3. Run Human approval. Open Mandates, review the pending request, re-verify the human, approve it, then return and resume the same run.
4. Revoke the root mandate. Show descendants and affected work contained.
5. Run Authority revocation. Show that authorization fails before `RUNTIME_EXECUTION_STARTED`.

Optional resilience paths are provider failure and execution timeout. They produce blocked work and explicit failure evidence without external dependencies.

## Stage 5 - Conduct The CISO Investigation

1. Open Evidence.
2. Confirm the hash chain is verified.
3. Filter to Deny and inspect the reason code.
4. Select a protected action and trace Human Identity, Human Proof, Passport, runtime, mandate, delegation, decision, assignment, and outcome.
5. Open Controls and connect implemented controls to the visible evidence.
6. Export JSON and show the receipt, source head, and bundle hash.
7. State that private keys, credentials, biometric helper material, commands, sessions, and collaboration bodies are excluded from export.

## Recovery

| Condition | Recovery |
|---|---|
| Camera permission denied | Close H2A, release the camera from other applications, relaunch the same session, and retry Human Proof. |
| Human Proof expired | Return to Human Proof and verify again. Existing identities and evidence remain intact. |
| Wrong mandate configuration | Keep it as denial evidence or create a new corrected mandate. Do not edit persisted signed records. |
| Approval remains pending | Verify the human, resolve the request in Mandates, and resume the same scenario run. |
| Evidence integrity fails | Stop mutations, preserve the failed state with audit export, and switch to a new isolated session for the presentation. |
| Demo state is confusing | Close H2A, run `pnpm demo:new-session`, and launch the newly returned data path. Prior evidence remains untouched. |
| Electron fails to start | Run `pnpm build`, confirm `out/preload/index.cjs` exists, and run the returned session command again. |

## Closing Statement

H2A V0 demonstrates a local control plane, not a production certification. The scripted runtime executes real authorization, routing, disclosure, persistence, response, containment, and evidence behavior. Live CLI, Bedrock, remote storage, hardware-backed proof, external notarization, and enterprise IAM remain explicit adapter and production-hardening work.
