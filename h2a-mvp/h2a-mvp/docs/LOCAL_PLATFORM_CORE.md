# H2A Local Platform Core

## Purpose

Phase 3 makes the local MVP operational without a backend while preserving typed replacement points for backend APIs, MongoDB, AWS services, Bedrock, live CLI agents, biometric providers, and enterprise resources.

The Electron main process is the only process that owns local persistence and evidence hashing. The sandboxed renderer can only request validated results through the allowlisted `window.h2a` preload API.

## Runtime Boundary

```text
React renderer
  -> window.h2a typed preload API
  -> allowlisted Electron IPC handlers
  -> configuration, repository, and evidence ports
  -> local JSON / append-only JSONL adapters
```

The active V0 feature configuration is stored in `data/h2a-demo/settings/feature-config.json`:

```json
{
  "storageMode": "local-file",
  "agentMode": "scripted-workplace",
  "humanProofMode": "local-face-bch",
  "resourceMode": "sandbox"
}
```

These values select adapters in trusted services through `AdapterRegistry`. They are not renderer implementation branches. Unsupported future modes fail closed with `UnsupportedAdapterModeError` until their adapters are registered.

## Versioned JSON Repositories

Every mutable JSON file uses this envelope:

```json
{
  "schemaVersion": 1,
  "kind": "h2a.workplace.fleet",
  "updatedAt": "2026-08-20T10:10:00.000Z",
  "data": []
}
```

`kind` prevents one valid file type from being read as another. `schemaVersion` selects a migration path. `updatedAt` records the successful repository write. Zod schemas reject malformed, incomplete, unknown, or out-of-range records before they enter the application.

Current repositories:

| Repository | Local path | Port / implementation |
|---|---|---|
| Agent roster | `workplace/fleet.json` | `WorkplaceRepository` / `LocalWorkplaceRepository` |
| Assignments | `workplace/assignments.json` | `WorkplaceRepository` / `LocalWorkplaceRepository` |
| Evidence summaries | `evidence/recent-events.json` | `WorkplaceRepository` / `LocalWorkplaceRepository` |
| Feature modes | `settings/feature-config.json` | `FeatureConfigRepository` / `LocalFeatureConfigRepository` |
| Authority events | `traces/tr_platform.jsonl` | `EvidenceLedgerPort` / `LocalAuthorityEventLedger` |

## Atomic Write And Recovery

`AtomicFileStore` performs a repository write in this order:

1. Resolve and verify that the target remains under the configured data root.
2. Create the parent directory if necessary.
3. Write a unique same-directory temporary file with owner-only permissions.
4. Flush the temporary file to disk.
5. Copy the current target to `<filename>.bak` when a prior version exists.
6. Rename the complete temporary file over the target.
7. Remove the temporary file if any step fails.

Reads distinguish a missing file from malformed or inaccessible data. Required files fail closed. Configuration may create its approved defaults when missing. No schema failure silently falls back to demo values.

## Migration Strategy

Schema version 1 is the current version. `VersionedJsonRepository` supports a controlled legacy migration for the original Phase 1 array files:

1. Attempt to parse the current versioned envelope.
2. If enabled for that repository, validate the unversioned value with the current data schema.
3. Persist the validated value in a version 1 envelope using the atomic writer.
4. Reject any value that matches neither format.

Future versions must add an explicit sequential migration, retain the pre-migration backup, validate the migrated result, and include fixture tests for both success and rejection paths. A future backend adapter must preserve these domain schemas at the API boundary even if its persistence representation differs.

## Hash-Linked Authority Ledger

The authority ledger is append-only JSONL. Every event follows the locked `AuthorityEvent` contract and includes `event_id`, `trace_id`, timestamp, actor, optional subject and mandate references, event type, payload, `previous_hash`, and `event_hash`.

Hash computation is:

```text
event_hash = "sha256:" + SHA-256(canonical JSON of every event field except event_hash)
```

Canonical JSON recursively sorts object keys, preserves array order, omits undefined object fields, and rejects circular or non-finite values. The first event has `previous_hash: null`; every later event points to the preceding `event_hash`.

Before an append, the complete existing chain is verified. The append is refused if JSON parsing, schema validation, event uniqueness, a previous-hash link, or event content hashing fails. The file handle uses append mode and is flushed before the call succeeds.

Local hash chaining is tamper evidence, not external notarization or hardware-backed non-repudiation.

## Adapter Ports

Phase 3 preserves these replacement boundaries:

| Concern | Port | V0 mode |
|---|---|---|
| Storage | `KeyValueStoragePort`, repository ports | repository-local files |
| Evidence | `EvidenceLedgerPort` | local hash-linked JSONL |
| Agent execution | `AgentRuntimePort` | `ScriptedAgentRuntimeAdapter` foundation; scenario engine is implemented in Phase 8 |
| Human proof | `HumanProofProvider` | local face/BCH is implemented in Phase 4 |
| Resources | `ResourceAdapterPort` | sandbox resource adapter is implemented with the protected workflow |

OpenAI/Codex, Claude Code, Gemini/Antigravity, custom CLI, Bedrock, biometric-token, WebAuthn, document-proof, external API, and backend storage modes remain contract-defined but disabled until their planned implementation phase. No provider secret or direct file capability crosses into the renderer.

## Failure Semantics

- Missing required workplace data: reject the IPC request and show the existing recoverable workspace error state.
- Invalid JSON or schema: reject; never substitute trusted-looking demo data.
- Path traversal: reject before filesystem access.
- Interrupted JSON write: retain the prior target and remove the incomplete temporary file where possible.
- Damaged evidence: return `failed`, identify the failed event when possible, and refuse further appends.
- Empty evidence ledger: valid empty chain with zero records and a null head hash; the UI must say it is empty.
- Unsupported feature mode: future service factories must fail closed until a matching adapter is registered.

## Verification

The Phase 3 contract suite covers atomic replacement, backups, path containment, missing-file behavior, legacy migration, invalid-schema rejection, configuration persistence, canonical serialization, linked appends, tamper detection, append refusal after tampering, and validation of the checked-in demo data and authority trace.
