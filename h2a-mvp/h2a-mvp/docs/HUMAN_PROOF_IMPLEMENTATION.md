# Human Proof Implementation

> Temporary demo configuration: liveness is currently set to `demo-bypass` by owner approval. Face count, quality, distance, ArcFace, BCH, lockout, signing, and evidence remain active. See `docs/TEMPORARY_LIVENESS_BYPASS.md`. Set `livenessMode` to `required` and restart before claiming liveness-backed high assurance.

## Status

Phase 4 is complete for the approved local, non-commercial demonstration. This implementation is not a production biometric certification or a commercial-use grant for the bundled model weights.

## Runtime Boundary

```text
Electron renderer
  camera frames (memory only)
  -> MediaPipe face landmarks
  -> quality + distance assessment
  -> temporal anti-spoofing inference
  -> five-point ArcFace alignment and embedding
  -> fixed 4,096-bit quantization
  -> typed IPC (bits + assessment only)

Electron main
  schema validation
  -> BCH fuzzy registration or matching
  -> isolated secret repository
  -> Ed25519-signed enrollment / Human Proof
  -> hash-linked evidence ledger
```

Raw frames, crops, and ArcFace embeddings are never written to disk, browser storage, IPC logs, evidence payloads, or public enrollment metadata.

## Local Files

Public metadata:

```text
data/h2a-demo/humans/identities.json
data/h2a-demo/biometric-enrollments/enrollments.json
data/h2a-demo/human-proof-attempts/attempts.json
data/h2a-demo/human-proof-attempts/security.json
data/h2a-demo/human-proofs/proofs.json
```

Private main-process material:

```text
data/h2a-demo/biometric-secrets/templates.json
data/h2a-demo/settings/h2a-signing-key.json
```

The private paths are excluded from source control. Public enrollment records expose SHA-256 hashes of helper/token/key material, not the values themselves.

## Policies

| Control | Value |
|---|---:|
| Minimum capture quality | 0.65 |
| Minimum liveness score | 0.75 |
| Accepted distance | 35-85 cm |
| Enrollment samples | 3 |
| Required template matches | 1 |
| Lockout | 3 failures for 60 seconds |
| Human Proof lifetime | 5 minutes |
| Signature | Ed25519 over canonical JSON |

The enrollment stores the complete capture assessment and immutable model hashes. Verification rejects a request whose model set differs from the active contract.

## Evidence

- `BIOMETRIC_ENROLLED` records model set, template count, and non-secret assessment scores.
- `HUMAN_PROOF_ATTEMPTED` records decision, reason, match count, assessment, and attempt evidence hash.
- `HUMAN_VERIFIED` is linked to the attempt event and records the signed proof ID, expiry, and assurance level.

The ledger remains append-only, hash-linked, and refuses writes after integrity failure.

## Recovery States

The UI and service explicitly handle camera denial/unavailability, timeout, no face, multiple faces, low quality, distance outside policy, liveness failure, model failure, mismatch, replay classification, retry, and lockout. Error text is announced through an ARIA live region, all actions are keyboard reachable, and motion respects reduced-motion preferences.

## Asset Integrity And Terms

`public/biometric/MODEL_MANIFEST.json` pins every model, BCH binary/loader, and active ONNX Runtime pair by SHA-256. Electron verifies the manifest before creating the application window. See `THIRD_PARTY_NOTICES.md` and the root biometric license audit for use restrictions and provenance findings.

## Future Adapter Boundary

The renderer-to-main API and `HumanProofProvider` contract preserve later replacement by an AWS-backed biometric token, WebAuthn, document proof, or another approved provider. Those adapters must produce the same short-lived Human Proof contract and cannot bypass mandate authorization.
