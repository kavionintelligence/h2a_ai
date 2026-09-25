# Plan 2 Later Tasks

Updated: 2026-08-23 Asia/Calcutta

This register holds work the user explicitly scheduled for later. A deferred item does not count as accepted until its recorded exit evidence passes.

## Phase 12 Cross-Person Ceremony

Completed session: `data/demo-sessions/phase23-guided-20260821175015`

- [x] Select `human_employee_002`, let the person enrolled as `human_employee_001` face the camera, and verify. Attempt `hpa2_b5bb0f99-f115-4e2b-a884-f195ef990d99` was rejected with `BIOMETRIC_MISMATCH` and 0 matches.
- [x] Select `human_employee_001`, let the person enrolled as `human_employee_002` face the camera, and verify. Attempt `hpa2_05ed45da-ad1e-432d-962c-ffc531d783eb` was rejected with `BIOMETRIC_MISMATCH` and 0 matches.
- [x] Re-audit attempts, proofs, and the hash-linked platform trace. Both minimized rejection events are present and neither attempt issued a cross-bound proof.

The operator completed both physical cross-person BCH rejection checks on 2026-08-21 and confirmed which enrolled participant was at the camera. They ran under the explicitly approved `demo-bypass` liveness posture. The identity-matching evidence is complete, but final liveness-backed high-assurance acceptance still requires restoring `livenessMode: required` and repeating the required ceremony steps.

## Completed During Ceremony

- [x] Keyboard navigation and focus behavior checked.
- [x] Screen-reader announcements checked.
- [x] Camera-denial error state checked.
- [x] Retry and recovery behavior checked.

The completed accessibility checks are user-observed live Electron results reported on 2026-08-21; they are not inferred from repository data.

## Provider Follow-Up

- [ ] Authenticate and integrate the official Gemini programmable surface when the user reactivates that lane.
- [ ] Install, authenticate, probe, and adapt Cursor Agent when the user reactivates that lane.
- [ ] With explicit user approval, repair or disable the Windows-incompatible Antigravity telemetry hook and rerun the tool-enabled structured adapter proof.
- [ ] Move provider execution into the digest-pinned Docker/WSL boundary with H2A Gateway credential brokering and protected tool/network mediation before assigning `governed` trust.

Phase 16 completed real host CLI execution at `connected-observed`. These items are not needed to prove that supervised host execution works, but the isolation/gateway item is mandatory before any provider can be represented as `governed`.

## Phase 29 Replay-Specific Denial

Ceremony: `ceremony_c3ad55dc-a544-4b51-958a-0583c80b5902`

Shared trace: `phase22_234eca22-ff97-4764-891b-763af7e2d82b`

- [x] Real two-node task exchange and signed acknowledgement completed.
- [x] Signed heartbeat completed.
- [x] Revoked-peer traffic was blocked with `FEDERATION_PEER_INACTIVE`.
- [x] Establish a fresh active peer relationship, send a fresh signed envelope, and invoke **Prove replay denial** before its 60-second expiry.
- [x] Confirm the durable replay reason is `FEDERATION_SEQUENCE_REPLAY` or `FEDERATION_NONCE_REPLAY`, then confirm the final acceptance replay attack is `blocked`.

Phase 33 reconciliation found the earlier public two-node replay proof in both canonical ledgers: Node A event `evt_10f67850-b87a-4901-834b-f6756985037d` and the corresponding friend-node event `evt_54b8b991-5435-47de-a913-ab3e838609be`, both with `FEDERATION_SEQUENCE_REPLAY`. The later `FEDERATION_ENVELOPE_EXPIRED` attempt remains valid expiry evidence but does not replace or invalidate the earlier replay-specific proof.
