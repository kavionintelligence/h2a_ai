# Phase 24 Guided Operator Test

Status: Complete on 2026-08-22 Asia/Calcutta.

Use the existing session `phase23-guided-20260821175015` and keep its current `H2A_DATA_PATH`.

1. Restart H2A so the Phase 24 build is loaded.
2. Open Demo Gate.
3. In `PHASE 24 / SHARED TRACE`, click **Create ceremony** once.
4. Confirm the panel shows one Ceremony ID, one Shared trace beginning `phase22_`, status `active`, and `Ceremony session created` as passed.
5. Click **Assess prerequisites**.
6. Confirm `Prerequisites assessed` becomes passed and every later step shows either ready or an exact blocker.
7. Record the Ceremony ID and Shared trace shown on screen.
8. Close H2A completely and launch it again with the same `H2A_DATA_PATH`.
9. Open Demo Gate and confirm the Ceremony ID, Shared trace, passed prerequisite step, blockers, and linked evidence counts are unchanged.
10. Do not click Create ceremony again during this test; doing so intentionally supersedes the active session and creates a new trace.

## Recorded Result

- Ceremony ID: `ceremony_c3ad55dc-a544-4b51-958a-0583c80b5902`
- Shared trace: `phase22_234eca22-ff97-4764-891b-763af7e2d82b`
- Status after restart: `active`
- `Ceremony session created`: `passed`, 1 linked evidence record
- `Prerequisites assessed`: `passed`, 2 linked evidence records
- The user closed H2A completely, H2A was restarted with the same `H2A_DATA_PATH`, and the user supplied a post-restart screenshot confirming the identifiers, statuses, linked evidence counts, and blockers were unchanged.

Phase 24 guided acceptance is complete.
