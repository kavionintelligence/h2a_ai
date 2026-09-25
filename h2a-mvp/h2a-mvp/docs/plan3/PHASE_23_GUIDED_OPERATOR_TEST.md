# Phase 23 Guided Operator Test

Status: Complete on 2026-08-21 Asia/Calcutta.

Use a clean session. This walkthrough does not require provider credentials or biometric enrollment.

1. Launch H2A and open each navigation item from Command Floor through Settings.
2. Confirm no preview employee, preview trace, fake key, or pre-populated success record appears.
3. Confirm the header says `Scripted rehearsal only` or the runtime mode actually present, and shows the current trust ceiling.
4. On Command Floor, open Add agent and close it. Do not submit without a real Human Proof and authority prerequisite.
5. On each route, open and close available dialogs, change visible tabs and filters, and use non-destructive refresh controls.
6. Confirm unavailable provider/framework controls state the missing dependency, configuration, or authentication prerequisite.
7. Confirm Demo Gate reports incomplete acceptance on a clean session and does not claim the HP ceremony passed.
8. Restart H2A on the same clean session and confirm preview data still does not appear.

Record any control that is enabled without a valid prerequisite, does nothing without an explanation, produces preview data, or claims a stronger trust level than its evidence. Phase 23 acceptance requires zero such controls.

## Operator Record

- [x] All navigation routes opened from Command Floor through Settings.
- [x] No preview employee, preview agent, preview trace, fake key, or pre-populated success record appeared.
- [x] The header reported `Scripted rehearsal only` and `Connected-observed ceiling`.
- [x] Add Agent opened and closed without submission; Command Floor remained empty.
- [x] Human Proof retained only the two operator-enrolled employees after restart.
- [x] Context Broker tabs and Add Artifact opened correctly. Issue Grant was correctly unavailable because no active protected artifact existed; the control now exposes that exact prerequisite.
- [x] Federation Join and Configure dialogs opened and closed. Invite remains correctly unavailable until the local federation node is configured and now exposes that exact prerequisite.
- [x] Evidence tabs, filters, and non-destructive controls worked without injecting preview traces.
- [x] Authority Inbox New Policy opened and closed. Escalate Action was correctly unavailable because no active approval policy existed; the control now exposes that exact prerequisite.
- [x] Settings refresh preserved explicit dependency, configuration, and authentication statuses.
- [x] H2A restarted against `phase23-guided-20260821175015` without introducing preview data.
- [x] Demo Gate remained incomplete and reported only the legitimately completed biometric gate as passed.

The operator supplied screenshots `Screenshot 2026-08-21 231331.png` through `Screenshot 2026-08-21 232442.png` and explicit confirmations for the Human Proof and restart checks. The post-fix production Electron gate independently verifies the three prerequisite-gated controls.
