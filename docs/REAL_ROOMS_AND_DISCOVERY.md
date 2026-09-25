# Real discovery, CLI rooms and reviewed memory

This implementation adds actual endpoint collection and executable CLI-backed rooms. It is a **single-node, single-organization deployment**, not a claim of complete enterprise coverage or production certification.

## What is reused from the supplied repositories

| Repository | Executable integration in ByoSync | Boundary |
|---|---|---|
| Shadow AI Guard | Vendored `registry/registry.yaml` drives endpoint presence collection on every discovery scan | Current-user known paths, PATH, IDE extensions and process names. No configuration contents, credentials, browser history or cloud account inventory are collected. Process names may be ambiguous. |
| Claw Hunter | Actual vendored PowerShell/Bash collector runs from **Discovery → Inspect OpenClaw** | OpenClaw only. Temporary raw output is discarded; only normalized findings remain. “No findings” is not a statement that the endpoint is safe. |
| Claw Orchestrator | Actual MIT `src/kernel/exec.ts` is bundled into the runtime | ByoSync adaptation adds Windows process-tree termination, hidden windows and cancellation. It is the bounded process executor, not the whole upstream session manager. |
| Mem0 | Self-hosted `POST /memories` and `POST /search` adapter, using the supplied server contracts | Only reviewed memory is published, `infer=false`, scoped by room. Search results must match authoritative local memory IDs and content hashes. Requires a running Mem0 service and its embedding configuration. |
| Langfuse | Authenticated OTLP/HTTP JSON export using supplied `otel/attributes.ts` mappings | Run metadata and hashes only, no prompts/source content. Failed exports stay visible; local evidence is retained. The deprecated legacy ingestion route is not used. |
| AIOStack | Existing normalized report/telemetry intake remains available | Supplied repository primarily packages deployed observers; no claim that an eBPF engine was embedded or Kubernetes installed. |
| Forge Orchestrator | Not bundled | The supplied `LICENSE.md` says FSL-1.1-ALv2, not MIT. No Forge source copied. |

`vendor/manifest.json` records original hashes and local adaptation hashes. MIT and Apache licences/notices ship alongside the reused files. `scripts/vendor-integrations.mjs` will not overwrite local adaptations. No original source repository was edited.

## Real execution workflow

1. Run discovery, inspect tool evidence and register an identity. Installation does not prove autonomous agent behavior or authorization.
2. Bind a named human, issue a Passport, and assign an initial mandate.
3. Create a room, select its agents, and add its human members.
4. In **Operations → Runtime connections & authority**, bind each identity to Claude Code or Codex and grant a product-build mandate. This replaces an existing non-build mandate; pending requests against the old mandate become invalid.
5. Enter a concrete build objective and select agents in handoff order. Request the run.
6. A **different named reviewer** approves in Decisions. In explicit local-operator mode, self-approval is allowed and is recorded as non-independent.
7. The actual installed CLI is invoked. Each subsequent agent receives the previous output and only this room's already-published memory. Execution is limited to four sequential steps, two concurrent runs and three minutes per CLI step. Claude additionally receives a $1 per-step API budget; Codex has no portable dollar-cap guarantee.
8. Results must be structured, valid file bundles. Review their contents, publish to a new directory, and download the ZIP. Publication does not run, install, test or deploy generated code. Artifact validity does not prove software correctness.
9. Propose the run result as memory. A different named human reviews it before future runs can consume it. Optional Mem0 sync is explicit and separate from publication.

Request hashes, reviewer identity, authority references and output hashes are checked against the H2A ledger. Revoked/expired authority prevents a new step; active runs are checked every two seconds and cancellation terminates the owned process tree. This is not instantaneous containment of external agents or a hardened OS tenant sandbox. Host administrators and the CLI's installed binary remain trusted.

Runs interrupted by a server restart are marked `interrupted`; they are never automatically replayed. Graceful shutdown cancels child processes. After an abrupt host/process termination, inspect for orphaned CLI processes before restarting; persistent cross-process leases and Windows Job Objects are not implemented.

## Multiple named users

Provision credentials from the ByoSync folder (examples; use real people and appropriate roles):

```powershell
node scripts/provision-user.mjs integration-data/users.json admin "Security administrator" admin Security
node scripts/provision-user.mjs integration-data/users.json builder "Product engineer" builder Engineering
node scripts/provision-user.mjs integration-data/users.json reviewer "Security reviewer" reviewer Security
```

Each command displays a random personal credential once; only its SHA-256 hash is stored. Securely deliver each credential to its owner. Set `BYOSYNC_USERS_FILE` to the absolute path of this file, then restart. Open `/login`. No fabricated users are provisioned on normal startup.

- Admin: organization administration, agent bindings/mandates and room memberships; can inspect every room.
- Builder: request work and propose memory in joined rooms; cannot approve or grant authority.
- Reviewer: decide/publish in joined rooms; cannot initiate builds or review their own requests/memory.
- Viewer: read-only room access, including reviewed-memory search.

Inventory/ownership metadata is organization-wide. Room content, artifacts, runtime evidence and memory are membership-filtered. These credentials are not enterprise SSO, MFA or tenant isolation. Removing a user from the configuration requires restart. Use TLS termination and `BYOSYNC_PUBLIC_ORIGIN` for access beyond a trusted laptop; do not send personal credentials over ordinary HTTP on a shared network.

All CLI calls use the server's operating-system account and its provider login. Named browser users are authorized and attributed by ByoSync; they do not each receive an isolated provider account or OS execution identity. Use a dedicated service account for a shared deployment. Published memory is checked against its reviewed content hash and publication evidence before context reuse, search or Mem0 synchronization.

## Move to another laptop

Copy `ByoSync`, including `vendor`, source, manifests and lockfiles. Do **not** copy Python virtual environments or assume installed dependencies/binaries transfer across operating systems.

1. Install supported Node LTS (22.13+ or 24+) and Python 3.11+.
2. Run `npm run setup`, then `npm run doctor`.
3. Install and sign in to the standalone Claude Code and/or Codex CLI. A signed-in desktop application does not establish that its standalone CLI is signed in.
4. Copy `.env.example` to `.env` and configure paths/users/services. `BYOSYNC_CLAUDE_BIN` and `BYOSYNC_CODEX_BIN` may specify absolute binaries. Do not copy personal CLI credentials between people.
5. Run `npm start`. Default URL is `http://127.0.0.1:8787`.

The endpoint scan runs on the **server device**, not on a remote user's browser. To scan another endpoint, deploy a collector there and connect its evidence. Windows has been exercised here; macOS/Linux execution has not been verified in this change.

Mem0 and Langfuse are optional external/self-hosted services. Environment variable presence is never proof of connectivity. Setup of their databases, credentials, embedding provider and service availability remains the deployer's responsibility. No Docker services are silently installed.

## Verification and remaining gates

- `npm run typecheck`
- `npm run test:rooms`: isolated role, integrity, room membership, handoff, publication, memory and connector contract tests. Injected executor/HTTP fixtures are explicitly test-only.
- `npm test`: existing real HTTP governance lifecycle and restart regression, with test-only Census peers.
- `npm run test:portable`: existing cookie/bearer access regression.
- `npm run test:browser`: existing CISO flow plus new room request UI; does not start paid CLI execution.
- `agent-discovery-platform/.venv-runtime/Scripts/python.exe tests/endpoint-collector-test.py`: no credential/content collection and failure visibility.

Actual endpoint scan and Claw Hunter can be demonstrated without a model. A **successful real product build** still requires signed-in CLIs and must be verified with generated files and acceptance tests. Contract tests are not proof of live Mem0/Langfuse connectivity. No broad production-security claim is made: enterprise identity, database-backed scaling, cryptographic device enrollment, backup/recovery, deployment isolation and a security assessment remain separate gates.
