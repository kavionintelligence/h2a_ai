# Provider API Connectors

## Status

OpenAI, Anthropic, Gemini, and AWS Bedrock are declared as provider API connectors with HTTPS-only endpoint policy and a `connected-observed` trust ceiling. The health probe checks only whether `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `AWS_REGION` exists. It does not read, display, log, or persist any value.

Credentials and provider consent are not configured as part of credential-free Phase 17 acceptance. A present environment name changes health only to `configuration-required`; it does not claim successful authentication or execution.

## Live Acceptance

Each provider adapter must use its official SDK, structured output, bounded tool surface, H2A-mediated context, timeout/cancellation, and minimized input/output receipts. Live acceptance requires a user-owned credential, one real result, denial/cancellation evidence, and confirmation that secret values are absent from local state and evidence.

Claude Code, Codex CLI, and Antigravity host-process execution remain covered by Phase 16. Gemini API setup and Cursor remain recorded as later work.

