# H2A MVP

Local-first Human-to-Agent identity, mandate, collaboration, and evidence runtime.

## Development

```powershell
pnpm install
pnpm dev
```

For renderer-only browser inspection:

```powershell
pnpm dev:web
```

## Verification

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Executive Demonstration

Create a new isolated local session:

```powershell
pnpm demo:new-session
```

Run the local independently keyed federation proof:

```powershell
pnpm demo:federation
```

Run the returned `nextCommand`, then follow `docs/DEMO_OPERATOR_RUNBOOK.md`. Existing session data and evidence are never overwritten by the session command.

The authoritative product plan and project rules are located one directory above this application in `PLAN_OF_ACTION.md` and `rule.md`.
