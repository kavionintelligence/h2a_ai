# Live Credential, Privacy, And Isolation Runbook

## Credential Rules

- Authentication proves provider access, never H2A authority.
- Use only official CLI, OAuth/device flow, API, IAM or provider-supported integration.
- Do not copy browser cookies, session databases, OAuth tokens, API keys, recovery codes or `auth.json` into H2A records, logs, prompts or chat.
- The renderer receives only provider, configured state, masked hint, expiry and last validation time.
- A trusted `CredentialBroker` supplies a credential to one provider invocation or uses it on the agent's behalf. It removes unrelated environment variables.
- Redact commands, environment, stderr, evidence and exported bundles before persistence.
- Live tests are opt-in, isolated from normal CI, and skip with an explicit reason when auth is absent.

Current state: Claude and Codex completed real non-destructive probes using existing official sessions. No secret value was read or recorded. Gemini returned an explicit missing-auth error; no login was opened.

## Windows Isolation Checkpoint

Current host evidence (2026-08-21): WSL `2.7.12.0` is installed, Ubuntu and `docker-desktop` are running on WSL2, Docker Desktop `4.87.0` is active, and Linux Engine `29.7.2` responds from both the installed Windows CLI and Ubuntu. The Windows Docker CLI directory is not present in the current PowerShell `PATH`, so verification used its installed absolute path; Ubuntu resolves `/usr/bin/docker` normally.

Completed installation checkpoint:

1. WSL2 and Ubuntu are installed and initialized.
2. Docker Desktop is installed and running with the WSL2 Linux backend.
3. `wsl --version`, `wsl --list --verbose`, Docker client/server version, and Linux engine connectivity checks pass.

Remaining proof checkpoint:

1. Digest-pinned minimal Linux container smoke test completed with non-root execution, a read-only root filesystem, no network, all capabilities dropped, no privilege escalation, no Docker socket, and bounded CPU, memory, and process count.
2. Phase 11 isolation feasibility suite completed through `pnpm test:containment`; machine-readable evidence is stored in `docs/plan2/evidence/containment-proof.json`.

Docker Desktop licensing must be reviewed for the final demonstration environment. The H2A project does not infer enterprise license eligibility.

## Containment Proof Required For `governed`

The Phase 16 test container must prove:

- only the assigned workspace is mounted and writes outside it fail;
- the process runs non-root with dropped capabilities, read-only root filesystem and no Docker socket;
- only allowlisted environment values enter the container;
- provider credentials are invocation-scoped and absent from child tools;
- network egress is denied by default or constrained to required provider endpoints;
- CPU, memory, process count and execution time are bounded;
- cancellation and mandate/passport revocation terminate the process tree;
- no orphan process, mount, secret or network session survives termination;
- all protected tool/resource calls return through the H2A Gateway;
- evidence records the image digest, policy, mounts, network mode, process and termination result.

The Phase 11 feasibility suite proves the Docker-enforceable boundary using a synthetic credential sentinel and cancellation signal. Real provider credential brokering, H2A Gateway mediation, mandate/passport revocation wiring, and evidence-ledger integration remain Phase 16 tests. Until those integration items pass for a real session, the strongest allowed label for a real local CLI is `connected-observed`.

## Provider Login Checkpoints

- Claude: no action now; repeat auth only if the Phase 16 adapter reports an expired session.
- Codex: no action now; the standalone probe reused an official session. Never expose `~/.codex/auth.json`.
- Gemini: user must choose an official enterprise/API-key/Vertex/Antigravity-supported method. Individual Gemini CLI subscriptions may not be eligible. H2A will resume the structured probe after that choice.
- Bedrock and other APIs: credentials are requested only when their adapter reaches an opt-in live test.
