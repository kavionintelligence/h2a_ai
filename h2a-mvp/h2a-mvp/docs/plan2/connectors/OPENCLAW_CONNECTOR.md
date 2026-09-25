# OpenClaw Connector

## Boundary

`integrations/openclaw` is a typed OpenClaw plugin using `definePluginEntry` and `api.on`. It sends `before_agent_run`, `before_tool_call`, `agent_end`, `gateway_start`, and `gateway_stop` events to a loopback H2A policy endpoint.

The run gate uses OpenClaw's current `{ outcome: "block" }` contract. The tool gate uses `{ block: true }`. Missing, invalid, timed-out, or denied policy responses fail closed. Non-bundled plugins must enable `plugins.entries.h2a-authority.hooks.allowConversationAccess` for `before_agent_run` and `agent_end` to fire.

## Host Setup

1. Install a supported OpenClaw version at or above `2026.5.17`.
2. Link or install `integrations/openclaw` using the host's documented plugin command.
3. Set plugin `endpoint` to an H2A loopback policy URL and store any bearer token in plugin configuration.
4. Explicitly enable the plugin and conversation access, validate configuration, and restart the Gateway.
5. Prove an allowed run, denied run, allowed tool, denied tool, and lifecycle evidence before marking it accepted.

OpenClaw is not installed in the current workspace. Connector Health therefore reports `dependency-missing`; no compatibility claim is made against an untested host instance.

