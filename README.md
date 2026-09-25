# ByoSync

ByoSync is a CISO workspace for discovering AI, classifying authorized and shadow entities, binding agents to accountable humans, issuing signed Agent Passports, assigning bounded mandates, governing collaboration, requiring exact-action approval, publishing reviewed company memory, and inspecting the complete identity trace.

This product combines two existing engines:

- **Agent Census** discovers and classifies AI from configured A2A, MCP, API, manifest, telemetry, Docker, and Kubernetes sources.
- **H2A** provides signed identity, human ownership, mandates, approvals, containment, persistence, and a hash-linked evidence ledger.

The local connected workspace shows collected records and unconfigured systems as such. The default hospital presentation is a separate, explicitly labelled simulator with synthetic company activity; its records are not live telemetry.

## Hospital presentation and Vercel

Open the application to see the blue-and-white ByoSync sign-in screen. Use the public sample account **`varun` / `ByoSync@123`**. This is a presentation gate, not secure authentication; never enter a real password.

The next screen welcomes Varun and offers three workspaces: **Joon’s Hospital — Ready**, **Sarvodaya Hospital — In progress**, and **Deplomact Dental Clinic — Work in progress**. Only Joon’s opens. Use **Back to hospitals** or **Sign out** from the workspace bar. Session state survives refresh in the same tab; passwords are not stored.

Import `varunROS/h2a-ai` into Vercel with **Root Directory `.`**, **Framework Other**, and **Node.js 22.x**. The committed `vercel.json` supplies the installation/build commands and `hosted-dist` output. No API keys are needed. See [Vercel setup and limits](docs/VERCEL_HOSTING.md).

The hosted build includes the interactive simulator, not the device collector, local governance server or Claude/Codex CLI. The local `?mode=workspace` route remains available with the local backend; it is disabled in hosted builds.

Hospital identity matches have not yet been confirmed, so the selector uses generic hospital/clinic icons rather than potentially unrelated businesses’ logos. Existing AI and company-tool product logos remain bundled.

```sh
npm run install:hosted
npm run build:hosted
```

Run the install command in a fresh checkout: it replaces that checkout’s nested dependencies with the committed lockfile versions. For local browser verification after building, run `node --test tests/access-portal-browser.test.mjs`.

## Real CLI rooms and endpoint discovery

The product now also includes registry-driven endpoint collection, the actual Claw Hunter collector, and approval-gated Claude Code/Codex CLI execution using the vendored Claw Orchestrator process executor. Room participants can request a build, review proposed files, publish/download them, and propose reviewed knowledge for subsequent work. Generated code is not automatically executed or deployed.

Named-user credentials support admin, builder, reviewer and viewer roles with room membership checks. Shared provider execution still uses the server's CLI account; this is not enterprise SSO or tenant isolation. Mem0 and Langfuse adapters require separately configured services.

Read [setup, source reuse and limits](docs/REAL_ROOMS_AND_DISCOVERY.md) and [the actual live verification results](docs/LIVE_VERIFICATION.md). A real Codex run was verified; Claude Code still requires sign-in on this device.

## Start

Prerequisites: Node.js 22.12+, npm, and Python 3.11+.

```powershell
cd C:\Users\khatr\Downloads\H2A_mvp\ByoSync
npm.cmd run setup
npm.cmd run dev
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787). Press `q` then Enter, or `Ctrl+C`, to stop the owned services.

Use `BYOSYNC_PYTHON` when the desired Python executable is not on `PATH`. Product data is stored under `integration-data` unless `BYOSYNC_DATA_DIR` is set.

## Configure discovery

Configure real discovery sources in `agent-discovery-platform/.env`, following `.env.example`. For example:

```dotenv
CENSUS_ALLOWED_ORIGINS=https://agents.example.com,https://tools.example.com
CENSUS_DISCOVERY_SOURCES={"a2a":[{"url":"https://agents.example.com/.well-known/agent-card.json"}],"mcp":[{"url":"https://tools.example.com/mcp"}]}
```

Provider credentials remain in the Census backend. They are never exposed in the browser.

## Configure the operator

The default installation runs as one explicitly identified local operator. It does not claim enterprise SSO or biometric proof. These variables change the displayed local operator:

```powershell
$env:BYOSYNC_OPERATOR_ID = "HUM-CISO-001"
$env:BYOSYNC_OPERATOR_NAME = "Security Operator"
$env:BYOSYNC_OPERATOR_TEAM = "CISO Office"
$env:BYOSYNC_ORGANIZATION = "Example Company"
```

Enterprise identity and external enforcement must be connected before shared production deployment. The Administration screen reports these limitations directly.

## Portable CISO-room access

Loopback remains the safe default. To open the product from another laptop on the same trusted network, bind to all interfaces:

```powershell
$env:BYOSYNC_HOST = "0.0.0.0"
npm.cmd run dev
```

When named users are not configured, the launcher generates a shared access token and prints device-specific login URLs. Opening one sets a 12-hour HttpOnly, SameSite browser session. With `BYOSYNC_USERS_FILE`, people instead use their personal credentials at `/login`. Non-loopback mode requires one of these authentication configurations. Use a TLS reverse proxy before sharing credentials over a network; enterprise SSO/MFA remain separate production requirements.

## Collector and runtime intake

The backend accepts real collector and runtime evidence without requiring the candidate repositories' portals:

- `POST /api/adapters/claw-hunter` — native Claw Hunter JSON.
- `POST /api/adapters/shadow-ai-guard` — one or more native Shadow AI Guard findings.
- `POST /api/source-reports` — normalized endpoint/platform source reports.
- `POST /api/telemetry/ingest` — bounded normalized agent runtime events.
- `GET /api/agents/:id/identity-trace` — joined authority and runtime history.
- `GET /api/platform/status` — honest component, connector, storage and intake status.

When portable token mode is active, machine clients use `Authorization: Bearer <BYOSYNC_ACCESS_TOKEN>`. See [the backend audit and build plan](docs/BACKEND_SOURCE_AUDIT_AND_BUILD_PLAN.md) for repository-by-repository decisions and production gaps.

## Real local operations

After a Census entity is registered, the operator can bind ownership, issue a signed Passport, assign a mandate, and create a governed room. The included controls operate on actual persisted workspace state:

- Generate an AI estate report.
- Verify the hash-linked evidence ledger.
- Request and approve an evidence-pack export. The JSON pack is written under the configured ByoSync data directory.
- Attempt a CRM write to prove the mandate denies unauthorized work and records the denial.
- Suspend or reactivate a mandate to contain authority.
- Create durable room work, move it through controlled states, and record outcomes under the assigned agent and mandate.
- Send a bounded agent-to-agent handoff that records sender, recipient, mandate, trace, routing metadata, and a body hash without implying authority transfer.
- Propose company memory only from a completed governed action, then require human review before publication.

See [source integration](docs/SOURCE_INTEGRATION.md) for the exact Census and H2A services behind the product surface.

## Product navigation

- **Overview** — decisions, work in progress, changes, and assurance truth.
- **Decisions** — exact-action human approvals.
- **AI estate** — discovered, shadow, registered, owned, and governed AI.
- **Assurance** — findings, control state, coverage, and connector truth.
- **Records** — tasks, rooms, reviewed memory, and evidence packs.
- **Administration** — connections, operator assurance, integrity, and deployment boundaries.

## Build and verify

```powershell
npm.cmd run build
npm.cmd run typecheck
```

The inherited repositories contain additional suites, but the two commands above are the focused release checks for this ByoSync surface.
