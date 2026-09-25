# Provider And Agent Transports

| Lane | Transport | Authentication observation | H2A control |
|---|---|---|---|
| Claude Code | Official CLI child process | Opt-in live task succeeds | Passport, runtime attestation, mandate, assignment, projected context, supervision, output hash |
| OpenAI Codex | Official CLI child process | Opt-in live task succeeds | Same chain; predecessor hashes replace response bodies between lanes |
| Antigravity | Official `agy` CLI child process | Opt-in live task succeeds | Same chain and bounded projection |
| MCP framework | Official MCP TypeScript SDK over stdio | Signed delivery acknowledged | Signed task envelope, connector manifest, timeout, acknowledgement hash |
| Custom CLI | Signed JSON-line/stdin contract | Connector-specific | Imported signed manifest and supervised process |
| A2A | Official A2A JavaScript SDK transport | Endpoint-specific | Signed H2A authority envelope and capability checks |
| Federation | Loopback HTTP for local demonstration | Pinned Ed25519 node keys | Sequence, nonce, expiry, capability, context limit, replay and revocation checks |

Provider output is never treated as proof of authority. Authority is evaluated before launch and recorded independently.
