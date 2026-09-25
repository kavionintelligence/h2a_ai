# Synthetic showcase dataset

`demo:showcase` creates an isolated, presentation-only H2A data root containing a populated multi-team organization. It is intended to make the product workflow visible before a live demonstration begins.

The generated root contains fourteen DEMO-prefixed coworkers, including six C-level profiles, six collaboration rooms, eighteen reviewed Memory records, six project folders, six room-linked missions, twenty-four work nodes, twenty-four narrow mandates, bounded context projections, output hashes, mailbox records, validation receipts, and forty-eight chained trace events.

## Safety boundary

- The source data root is copied and never modified.
- Every added person, room, memory, mission, message, output, mandate, and event is visibly marked `DEMO` or `SYNTHETIC SHOWCASE`.
- `SHOWCASE.json` declares `synthetic: true` and `acceptance_evidence: false`.
- The generator does not create Human Proof, live-provider success, independent approval, ceremony-pass, or final-acceptance events.
- Human Proof and provider authentication remain real operator actions.
- Federation transport state, sealed Context Broker payloads, provider secrets, and the Electron profile are intentionally reset so copied ciphertext cannot be mistaken for a usable live connection.
- Never use this data root for Phase 44 or Phase 51 acceptance.

## Create and open

From PowerShell in the repository:

```powershell
$pnpm = "$HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
& $pnpm demo:showcase
```

The command prints the generated path and the exact next command. Set `H2A_DATA_PATH` to that path, then start H2A:

```powershell
$env:H2A_DATA_PATH = '<GENERATED-TARGET-PATH>'
& $pnpm dev
```

Use the normal enrolled employee to enter the workspace. The synthetic coworkers are display-only and intentionally have no biometric enrollment.

## What to show

1. **Agent canvas**: six mission cards and their human-bound agent network.
2. **Workspaces**: persistent department rooms linked to project folders and missions across Security, Finance, Marketing, Technology, People Operations, Data, Sales, and Operations.
3. **People & agents**: switch between People, Teams, and Agent connections to show view-only executives, department membership, native provider lanes, and truthful configurable connector entries.
4. **Flow**: four distinct agent roles, predecessor links, human owners, and a blocked approval checkpoint.
5. **Context**: different released and withheld fields for every node.
6. **Outputs**: hashes and evidence references without stored provider response bodies.
7. **Decisions**: a pending independent-review checkpoint and cancellation history.
8. **Company Memory**: published, draft, rejected, and withdrawn reviewed-memory lifecycles.
9. **Security map**: people, agents, mandates, and context boundaries projected from the same canonical root.
10. **Control > Evidence**: `tr_showcase_*` chained records, each marked `acceptance_eligible: false`.

For a live claim, switch back to the canonical root and execute the real provider, Human Proof, approval, federation, cancellation, and acceptance workflows.
