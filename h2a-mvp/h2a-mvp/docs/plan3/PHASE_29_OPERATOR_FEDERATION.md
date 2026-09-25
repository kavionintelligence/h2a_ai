# Phase 29 Operator-Driven Friend-Agent Federation

## Objective

Run two visible H2A desktop instances with separate data roots and independently generated Ed25519 node keys, complete the signed trust ceremony from the Federation UI, exchange one Phase 27 least-context task over the real loopback HTTP transport, and prove replay and revocation fail closed.

## Runtime Architecture

1. Node A and Node B use different `H2A_DATA_PATH` values and different Electron `userData` directories.
2. Each node creates and OS-protects its own federation private key. Public node identity exposes only the public key and SHA-256 fingerprint.
3. Invitation, registration, and acceptance documents are copied out of band. The operator must compare key fingerprints before each trust transition.
4. The active peer stores pinned node identity, key fingerprint, optional TLS certificate fingerprint, capabilities, field limit, sequence counters, expiry, heartbeat, and lifecycle status.
5. `FederationOperatorCoordinator` owns listener lifecycle and typed task, acknowledgement, heartbeat, replay-proof, and revocation-proof operations.
6. A task resolves its real Phase 27 assignment, Agent Passport V2, runtime session and attestation, mandate, and active Context Grant before signing.
7. Context Broker releases only the selected lane projection. The federation state, operator state, receipts, evidence, and renderer retain field names, IDs, decisions, and hashes, never protected values.
8. The remote node verifies peer binding, organization, capability, field count, expiry, sequence, nonce, payload hash, and envelope signature before returning a signed acknowledgement.

## Trust Boundary

- Loopback HTTP is allowed only for the two-node local demonstration.
- Any non-loopback endpoint requires HTTPS. A configured TLS fingerprint is pinned and verified by the client.
- Runtime trust remains `connected-observed`; a successful exchange does not raise the trust ceiling.
- The friend-root provisioning command creates a same-organization local replica so the completed ceremony context is available. It deletes all copied federation and Electron-local state. Node B must generate a fresh federation identity and key in the UI.
- Public internet federation, domain hosting, certificate operations, and independently administered external organizations are outside this local Phase 29 ceremony.

## Operator Surface

- Node settings, invitation, join, registration review, acceptance activation, and peer revocation.
- Start/stop loopback listener with visible bound endpoint and lifecycle state.
- Send a bounded task from one acknowledged Phase 27 lane.
- Send explicit acknowledgement and heartbeat envelopes.
- Resend the exact in-memory signed envelope to prove sequence/nonce replay denial.
- Attempt outbound signing after peer revocation to prove the provider transport cannot launch.

## Evidence

- Independent node IDs and key fingerprints.
- Signed invitation, registration, and acceptance records.
- Accepted task and acknowledgement envelope IDs and hashes.
- Minimized receipt records on both nodes.
- Replay rejection and revoked-peer rejection reason codes.
- Shared `phase22_` trace, ceremony ID, assignment, mandate, Passport, runtime attestation, and Context Grant references.
- Restarted operator state with the listener truthfully reset to stopped and prior hashes/proofs retained.

## Automated Verification

```powershell
pnpm test:phase29
```

This builds the production Electron application and runs the Phase 29 two-root transport test plus Phase 20 federation security, Phase 19 Context Broker privacy, and Phase 23 product-surface truth regressions.
