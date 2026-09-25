# Provider Surface Inventory

Date: 2026-08-21  
Purpose: preserve the verified local provider state and the exact Phase 16 integration boundary.

| Requested lane | Verified local state | H2A boundary | Current claim |
|---|---|---|---|
| Claude | Claude Code `2.1.216`; real H2A-supervised structured task passed | official CLI structured stream | integrated as `connected-observed`; not governed |
| ChatGPT / OpenAI | official Codex CLI `0.148.0`; real H2A-supervised JSON read-only task passed using an official OpenAI session | Codex CLI first, App Server later | integrated as `connected-observed`; direct ChatGPT browser automation prohibited |
| Antigravity | desktop and IDE `1.107.0`; official `agy` CLI `1.1.16`; real H2A-supervised structured task passed | official `agy` CLI with plan mode, stream JSON and sandbox | integrated as degraded `connected-observed`; tool-enabled acceptance remains blocked by the malformed Windows telemetry hook |
| Cursor | Cursor editor `3.16.17` installed | standalone `cursor-agent` headless CLI or ACP JSON-RPC | explicitly deferred by the user on 2026-08-21; editor installation is retained for later |
| Gemini | Gemini CLI `0.56.0` installed; structured probe fails closed without auth | official CLI/API/Vertex/GCA route | user action scheduled for Phase 16/22 |

## Locked Handling

- H2A never automates provider web sessions, copies browser cookies, or treats editor installation as agent connectivity.
- Provider login proves account access, not human identity, organizational authority, or mandate scope.
- A provider remains unavailable until its official programmable surface produces structured output through the H2A adapter.
- Cursor's official headless CLI supports text, JSON, stream-JSON and ACP stdio integration, but it is a separate installation from the verified editor command.
- Google's official Antigravity material distinguishes the desktop application, IDE, CLI and SDK. H2A will use the CLI or SDK boundary when it is installed and supported, not IDE UI automation.

## Antigravity CLI Checkpoint

- Winget package: `Google.AntigravityCLI` version `1.1.16`.
- Resolved executable: `%LOCALAPPDATA%/Microsoft/WinGet/Links/agy.exe`; the current PowerShell process requires direct resolution until its environment is refreshed.
- Exposed controls include non-interactive print mode, text/JSON/stream-JSON output, JSON Schema, plan mode, model selection, MCP, and sandbox mode.
- Model discovery succeeded and returned Gemini, Claude Sonnet 4.6, Claude Opus 4.6 Thinking, and GPT-OSS 120B choices.
- A real structured plan-mode turn generated the requested response, proving existing account/session access, but the CLI returned overall `ERROR` because the enabled `googlecloudtools.datacloud_telemetry` pre-tool hook contains a Windows-incompatible quoted command.
- The affected user-level file is `%USERPROFILE%/.gemini/config/plugins/googlecloudtools.datacloud_telemetry/hooks.json`. H2A did not edit or disable it.
- Phase 16 placed tool-free structured execution behind the H2A adapter and Process Supervisor without changing the hook. Repair or disable that user-level hook only with user approval, then rerun tool-enabled acceptance. Container/gateway execution remains required for `governed`.

## Deferred Surface

Cursor Agent installation, authentication, probing, and adapter work are deferred until the user reactivates that provider lane. Cursor is not a dependency of the current Phase 12 work or the initial Claude/Codex/Antigravity Phase 16 route.

## Official References

- Cursor CLI overview: <https://docs.cursor.com/en/cli/overview>
- Cursor headless mode: <https://docs.cursor.com/en/cli/headless>
- Cursor ACP: <https://prod.cursor.com/docs/cli/acp>
- Google Antigravity IDE codelab: <https://codelabs.developers.google.com/getting-started-agy-ide>
