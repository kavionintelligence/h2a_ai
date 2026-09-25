# Phase 48 Security And Licensing

## Trust Boundary

- Discovery is non-authoritative. Display names, employee aliases, node IDs, IP addresses, and connection codes cannot select or activate trust.
- Signed presence validates both the outer presence signature and the nested federation node identity signature and public-key fingerprint.
- Pairing transport messages are signed, recipient-bound, short-lived, and deduplicated. They coordinate only; canonical trust is created by the existing federation invitation, registration, acceptance, and peer services.
- The comparison code binds both public-key fingerprints, both random nonces, organization ID, and transcript hash. A changed fingerprint, nonce, organization, capability, context limit, or transcript fails closed.
- Administrator actor references are persisted only to support restart-safe completion while proof remains valid. No proof image, biometric template, private key, or credential secret is stored in pairing records.
- Revoked peers become `replacement-required`; no repair path reactivates revoked trust.

## Discovery Scope

- Same-host discovery uses individual atomic files under the OS temporary directory or `H2A_DISCOVERY_PATH`. Presence expires after 45 seconds and pairing transport after 10 minutes.
- Secure LAN discovery uses Node.js built-in UDP multicast, is off unless `H2A_SECURE_LAN_DISCOVERY=1`, uses TTL 1, accepts only signed records, and requires an `https-required` node identity.
- Public internet discovery, global username lookup, NAT traversal, and a hosted directory are disabled and unclaimed.

## Privacy

Presence is minimized to signed node identity, search aliases, capability names, endpoint policy, key fingerprint, short code hint, and expiry. Pairing records contain signed protocol metadata and hashes, not biometric data, protected artifact values, provider responses, credentials, or private keys.

## Licensing

No third-party dependency, model, font, image, or external repository code was added. Same-host discovery uses Node.js filesystem APIs; secure LAN uses the Node.js built-in `node:dgram` module. The recorded provenance is `Node.js built-in / MIT`.
