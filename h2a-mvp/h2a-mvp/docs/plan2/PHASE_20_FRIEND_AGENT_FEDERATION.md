# Phase 20 Friend-Agent Federation

## Decision

Phase 20 implements a local-first, signed federation boundary between independently keyed H2A nodes. The default listener posture is loopback-only. Remote endpoints are accepted only over HTTPS with an explicitly enabled remote posture and a pinned SHA-256 certificate fingerprint.

This phase does not turn provider host processes into `governed` runtimes. Their Phase 16/17 trust ceiling remains `connected-observed`. Federation governs node admission and envelope exchange; container or gateway enforcement remains a separate control.

## Trust Workflow

1. A verified authority administrator configures a node. H2A generates an Ed25519 key pair, stores the private key through Electron `safeStorage`, and publishes only the signed node identity and fingerprint.
2. The host creates a short-lived, one-use invitation containing the inviter identity, target organization, allowed capabilities, maximum context fields, nonce, expiry, hash, and node signature.
3. The joining administrator imports the invitation and confirms the inviter fingerprint through an independent channel. The joining node returns a signed registration with its own independently generated key.
4. The host administrator approves the registration. H2A consumes the invitation, pins the joining node key and optional TLS certificate, attenuates capabilities/context limits, and returns a signed acceptance.
5. The joining administrator activates the acceptance and pins the host node. Both nodes now share one peer identifier while retaining separate private keys and organizations.
6. Tasks, governed messages, heartbeats, acknowledgements, and revocations travel only in signed H2A Federation V2 envelopes. Recipient node, sender node, origin organization, peer, capability, task authority references, context field limit, payload hash, sequence, nonce, expiry, and signature are checked before acceptance.
7. Durable minimized receipts retain routing identifiers, hashes, decisions, sequence, nonce, and reason codes. Context projections, task bodies, credentials, and private keys are not persisted in federation receipts or evidence.

## Implementation

- `packages/contracts/src/federation.ts` owns strict node, invitation, registration, acceptance, peer, payload, envelope, receipt, state, and command contracts.
- `packages/federation/src/federationService.ts` owns key generation/protection, authority gates, invitation lifecycle, key pinning, capability attenuation, envelope signing/verification, replay defense, heartbeat/offline state, revocation, and minimized evidence.
- `packages/federation/src/federationHttp.ts` owns bounded HTTP/HTTPS transport, loopback defaults, TLS certificate pinning, timeout, response validation, and signed acknowledgement exchange.
- `apps/desktop/main/index.ts` composes OS key protection and typed IPC. `apps/desktop/preload/index.ts` exposes only lifecycle commands and public federation state.
- `apps/desktop/renderer/src/features/federation/FederationView.tsx` provides node posture, peer health, copy/import handshake documents, approval/activation/revocation actions, and minimized traffic inspection.
- `tests/federation-phase20.test.ts` proves independently keyed node handshake, bounded task projection, signed acknowledgement, HTTPS pinning, invitation/envelope replay denial, forgery denial, credential denial, restart persistence, heartbeat, revocation, and remote HTTP denial.

## Local Two-Node Demonstration

Run `pnpm demo:federation`. The proof creates separate data roots, evidence ledgers, protected node keys, organizations, node identities, and peer state. Two live service instances complete the full invitation-registration-acceptance handshake and exchange a signed task projection and acknowledgement over the real bounded transport. The TLS lane uses a checked-in test-only loopback certificate and rejects an incorrect fingerprint before accepting the pinned certificate.

The Electron Federation view supports the same signed handshake documents for two separately launched local H2A installations. No shared database, organization-wide context, provider credential, or private key is transferred.

## Remote Deployment Design

Public federation remains disabled until an operator supplies a domain, trusted TLS certificate, firewall policy, and explicit remote-listener configuration. A production deployment should terminate TLS at the H2A node or an organization-controlled gateway, retain certificate pinning or managed mTLS, place private keys in KMS/HSM-backed protection, restrict inbound paths to `/h2a/federation/v2/envelopes`, apply rate limits, and export minimized evidence to enterprise retention.

Remote HTTP, URL credentials, redirects, unpinned self-signed certificates, oversized messages, expired invitations/envelopes, non-monotonic sequences, reused nonces, key changes, organization spoofing, over-broad capabilities, excessive context fields, and credential-shaped payloads fail closed.

## Persistence

- `federation/local-node-v2.json`: signed public node identity.
- `federation/private/node-key-v2.json`: OS-protected private key envelope only.
- `federation/invitations-v2.json`: signed invitation lifecycle.
- `federation/registrations-v2.json`: signed joining-node requests.
- `federation/acceptances-v2.json`: signed host decisions.
- `federation/peers-v2.json`: pinned peers, capabilities, limits, sequences, heartbeat, expiry, and revocation.
- `federation/envelope-receipts-v2.json`: bounded minimized replay and decision records.
- `traces/tr_platform.jsonl`: hash-linked federation lifecycle evidence.

## Acceptance And Non-Claims

Phase 20 verifies P2-017 for local independently keyed node federation. It does not claim a public deployment, production CA/mTLS operation, backend synchronization, cloud KMS/HSM custody, provider credential delegation, containerized execution governance, or completed cross-provider/cross-human final acceptance. Those remain Phase 21/22 or production deployment work.
