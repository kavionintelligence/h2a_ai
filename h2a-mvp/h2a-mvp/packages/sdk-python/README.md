# H2A Python Connector SDK

The zero-dependency module provides canonical hashing, frame validation, and an
idempotency store. Supply an approved Ed25519 verifier from the deployment's
cryptography provider to `verify_frame`; no private key material is handled by
the SDK itself.
