# Agent Identity And Provider Binding

## Purpose

Phase 5 establishes the durable identity layer between a verified human and every named agent shown on the H2A Command Floor. It deliberately separates who an agent is from the provider process that currently runs it. A provider session may disconnect or be replaced without destroying the Agent Passport, while a suspended or revoked passport prevents the runtime from being treated as operationally authorized.

This is a local-only demonstration implementation. Scripted execution is available now. CLI and AWS Bedrock entries are configuration-ready definitions; live execution remains disabled until the later runtime phase and approved credentials are supplied.

## Trust Boundaries

| Boundary | Responsibility |
|---|---|
| Renderer | Collects onboarding input and receives only validated public identity state and masked credential metadata. |
| Preload | Exposes four allowlisted, typed identity methods. |
| Electron main | Validates IPC, checks Human Proof, signs passports, protects credentials, persists state, and appends evidence. |
| Public local stores | Hold passports, runtime bindings, and workplace projections. |
| Private local stores | Hold workload private keys, provider credential ciphertext, and the H2A signing key; paths are ignored by Git. |

Raw provider credentials never return to the renderer. Electron `safeStorage` provides operating-system encryption for saved credentials and fails closed if encryption is unavailable.

## Core Records

### Agent Passport

The durable passport includes:

- passport and agent identifiers
- human owner and originating Human Proof identifiers
- name, role, and declared capabilities
- workload public key
- issued, expiry, and lifecycle timestamps
- active, suspended, expired, or revoked status
- H2A Ed25519 signature

The workload private key is stored separately in `data/h2a-demo/passports/workload-keys.json` and is never projected to UI state.

### Runtime Binding

The replaceable runtime binding includes:

- binding and passport identifiers
- provider, model, workspace, and optional command metadata
- connected or disconnected lifecycle state
- masked credential metadata only

Disconnecting a runtime does not suspend its passport. Suspending a passport does not delete or silently rewrite the binding. Reconnection fails closed while the passport is inactive.

## Provider Catalogue

`packages/agents/src/providerRegistry.ts` defines 13 stable providers:

- H2A Scripted
- OpenAI / Codex
- Claude Code
- Gemini / Antigravity
- Grok / xAI
- Kimi Code
- Qwen Code
- OpenCode
- Crush
- Pi
- GitHub Copilot CLI
- AWS Bedrock
- Custom CLI

Each definition declares execution mode, authentication mode, availability, model choices, and an optional default command. The catalogue is shared with the renderer as read-only build-time metadata. Provider execution remains behind runtime ports so Phase 8 can activate CLI or Bedrock adapters without changing passport contracts or onboarding UI.

## Workflow B

1. The operator opens **Add agent** from the Command Floor.
2. H2A requires a current, active, unexpired Human Proof with verified evidence.
3. The operator names the agent, assigns a role and capabilities, and selects provider, model, workspace, and runtime configuration.
4. The main process generates a workload Ed25519 keypair and signs the new passport with the H2A authority key.
5. Optional provider credentials are encrypted in the trusted process; only masked metadata is returned.
6. A separate runtime binding is created and linked to the passport.
7. H2A appends `AGENT_BOUND` and `AGENT_RUNTIME_BOUND` evidence records.
8. The named agent appears on the Command Floor with provider, model, role, passport state, and runtime state.
9. Until Phase 7 issues a mandate, the agent is explicitly shown as `mnd_unassigned` with **Mandate required** authority state.

## Lifecycle Operations

Passport actions:

- `suspend`: passport becomes inactive; the workplace projection becomes offline.
- `reactivate`: a suspended, unexpired passport becomes active again.
- `revoke`: passport becomes permanently revoked and cannot be reactivated.

Runtime actions:

- `disconnect`: binding becomes disconnected while passport state is preserved.
- `reconnect`: binding becomes connected only when its passport is active and unexpired.

Every transition appends a typed authority event with the affected passport or binding as its subject.

## Local Files

| Path | Contents | Renderer access |
|---|---|---|
| `data/h2a-demo/passports/registry.json` | Signed public Agent Passports | validated projection only |
| `data/h2a-demo/workplace/runtime-bindings.json` | Public runtime binding metadata | validated projection only |
| `data/h2a-demo/passports/workload-keys.json` | Workload private keys | none |
| `data/h2a-demo/settings/provider-secrets.json` | OS-encrypted provider credentials | masked metadata only |
| `data/h2a-demo/settings/h2a-signing-key.json` | H2A signing keypair | none |
| `data/h2a-demo/traces/tr_platform.jsonl` | Hash-linked authority evidence | validated evidence APIs only |

All repositories use the Phase 3 versioned envelope and atomic file store.

## IPC Surface

- `agents:get-identity-state`
- `agents:create`
- `agents:update-passport`
- `agents:update-runtime`

Requests and responses are parsed against shared Zod contracts in both the main process and preload-facing API.

## Munder Reference Use

The provider metadata shape and the structure of the add-agent flow were informed by:

- `munder-difflin-main/munder-difflin-main/src/shared/agentProvider.ts`
- `munder-difflin-main/munder-difflin-main/src/shared/integrations.ts`
- `munder-difflin-main/munder-difflin-main/src/renderer/src/components/AddAgentModal.tsx`

H2A uses its own schemas, services, UI components, visual language, security boundaries, and copy. No Munder branding, character assets, pixel-art assets, or live execution implementation is included.

## Verification

`tests/agent-identity.test.ts` verifies:

- all 13 provider definitions
- rejection when Human Proof is missing
- signed passport issuance and human ownership linkage
- separate runtime binding creation
- workload-key and credential isolation
- absence of raw credentials from persisted public and private JSON text
- masked credential projection
- workplace projection with no invented mandate
- lifecycle independence and fail-closed reconnection
- linked issuance and lifecycle evidence

The complete suite passes with 30 tests. Typecheck, lint, production build, Electron startup, and responsive desktop/mobile visual checks also pass.
