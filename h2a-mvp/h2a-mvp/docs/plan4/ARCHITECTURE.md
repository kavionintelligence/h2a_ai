# H2A Demonstration Architecture

## Runtime Boundary

H2A is a local Electron application. The main process owns canonical state, local persistence, process supervision, cryptographic signing, policy evaluation, and evidence. React Control and Pixi Office are two projections of the same main-process snapshot. Neither renderer owns identity, authority, success, or evidence state.

## Control Chain

Every protected effect resolves this chain: Human Proof -> organization membership and credential -> Agent Passport -> runtime attestation and session -> signed mandate -> assignment -> least-context grant -> provider or framework execution -> signed acknowledgement -> hash-linked evidence. Missing or inactive links deny the effect.

## Collaboration

Official Claude Code, Codex, and Antigravity CLIs run as supervised local child processes. Framework participation uses the official MCP TypeScript SDK. Cross-machine collaboration uses signed, sequence-checked, capability-limited envelopes over the federation transport. Only authorized field projections and predecessor hashes cross agent or node boundaries.

## Persistence And Replacement

Atomic versioned JSON/JSONL repositories are the MVP persistence implementation. Typed ports isolate future database, KMS/HSM, IdP, remote runtime, and SIEM adapters. This release does not claim those enterprise backends are deployed.

## Trust

The maximum demonstration claim is `connected-observed`. Local process supervision and evidence do not constitute container, VM, kernel, or cloud-workload governance.
