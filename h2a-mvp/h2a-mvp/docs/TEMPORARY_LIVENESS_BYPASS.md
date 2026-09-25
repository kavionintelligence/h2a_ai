# Temporary Liveness Bypass

Approved: 2026-08-21 by the product owner.

Status: Active for the local demonstration.

## Behavior

`settings/feature-config.json` now supports:

```json
"livenessMode": "demo-bypass"
```

In this mode, enrollment and verification still require exactly one face, image quality, distance policy, ArcFace extraction, BCH token registration/matching, nonce replay defense, lockout, signed Human Proof, and evidence. The anti-spoof model is not loaded or evaluated.

Bypassed proofs are issued with `assurance_level: "substantial"` and `verification_methods: ["face", "distance", "bch"]`. They do not claim liveness or high assurance and cannot satisfy a final acceptance gate that requires live high-assurance proof.

## Restore Liveness

Change the active session's `settings/feature-config.json` value to:

```json
"livenessMode": "required"
```

Then restart H2A. The existing anti-spoof model and threshold enforcement will load again for enrollment and verification. New high-assurance proofs will include `liveness`; existing substantial proofs retain their truthful original methods until expiry.
