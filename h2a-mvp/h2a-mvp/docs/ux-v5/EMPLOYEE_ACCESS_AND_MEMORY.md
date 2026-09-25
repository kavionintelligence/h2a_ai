# Employee Access, Rooms, And Reviewed Memory

Date: 2026-09-06
Status: Implemented security foundation. Not full UX v5 or HP acceptance.

## What Changed

H2A now starts at employee sign-in. Enter the registered Employee ID or Human ID, then complete the named Human Proof dialog. The host binds the session to the actual Electron window, not a role selected in the renderer. A challenge is single-use, purpose-bound, and expires after five minutes. Sessions last at most thirty minutes and are not restored after restart.

Ordinary reads do not need a new camera check every five minutes. Membership termination, suspension, transfer, enrollment revocation/rotation, and session expiry invalidate access. Protected operations still need their own fresh exact-purpose proof.

Existing Office, Control, and the meeting-gallery workspace remain under **Administrator console**. Every retained IPC handler is behind a host-side administrator gate, not just hidden navigation. The retained console is restricted to single-organization roots because its DTOs are not tenant-filtered. Failed admission does not invoke its handler. An in-flight response is discarded if the session changes before completion. This does not claim that a command already dispatched was undone.

The employee workspace does not return the legacy canonical snapshot. It returns only authorized room records, permitted Memory, the authenticated employee, and profiles of members of those rooms. Exact Employee ID lookup resolves a minimal profile in the same organization; it is not a directory of biometrics or proofs.

## First Use And Expired Authority

- **Set up first administrator** is available only with no organization and at most one enrolled identity. Enrollment cannot overwrite that identity. The actual identity service issues proof for `create local organization authority`; bootstrap is bound to the window that obtained it. Existing organizations cannot use this path.
- First-use ownership is local installation provisioning, not SSO, domain ownership verification, or enterprise directory federation. The first credential lasts two hours.
- **Verify authority renewal** appears only for an eligible, latest expired administrator credential with a valid original signature and still-assigned active roles. It calls the existing exact-scope replacement service. It never renews a revoked credential or silently removes constraints. Replacement lasts no longer than the original duration or two hours, whichever is shorter.
- Roots with multiple existing unenrolled/unconfigured ownership candidates are not automatically assigned to the first person who clicks. Administrative migration is required; no evidence or identity is deleted to make setup pass.

## Rooms

1. Sign in as the room owner.
2. Enter **New room**, then **Create room**.
3. Under **Add a coworker**, enter their registered Employee ID and click **Find employee**.
4. Confirm the displayed person's name and department.
5. Click **Verify and add member** and verify the signed-in owner. The purpose names this exact room.
6. The other employee signs in on another window/session and sees the room after canonical refresh.
7. To remove a non-owner member, use their named remove button and verify the exact room change. New reads no longer include the removed room.

The owner cannot remove themselves through this operation. Requests include the expected room revision: a stale dialog fails instead of overwriting a newer roster. Administrator membership management still requires existing room membership. Administrator status alone does not reveal room contents through this employee API.

Room membership grants local room visibility only. It does not issue a Passport, lend an agent, expand a mandate, disclose Context Grant values, imply remote invitation acceptance, or enroll a remote employee. Admission/consent, remote room synchronization, and task-to-room association are unfinished.

## Memory

1. Select a room and open **Memory**.
2. Enter a title and non-secret reusable knowledge. Click **Submit draft**.
3. Other ordinary members cannot read that draft. Its author and authorized administrator reviewers already in the room can read it.
4. A different administrator signs in, joins only through an authorized room membership change, and opens the draft.
5. Click **Review and publish** or **Reject**. The named Human Proof is for that exact Memory record. The request binds its revision and content hash.
6. Self-review, stale revisions, mismatched content hashes, wrong-person proofs, and repeated decisions fail closed.
7. Published Memory is readable by current room members. **Withdraw** removes it from other members' reads; retained author/reviewer history remains visible with a withdrawn status.

This is explicit reviewed local knowledge, not automatic learning or model training. There is no automatic ingestion from provider responses or protected artifacts, no cross-room search, no provider injection, and no claim of source-grounded retrieval. Draft bodies are stored in the local signed workspace repository, not encrypted with safeStorage. Do not enter secrets or biometric material. Classification, encrypted content storage, expiry, source provenance and retrieval authorization remain work to do.

## Evidence And Persistence

- New repository: `workspace/employee-workspace-v1.json` under the selected H2A data root. It contains room and Memory revisions signed by the existing organization signer.
- Session material stays in the host process. No bearer session credential is handed to the renderer or written to this file.
- Room/Memory mutation first records an authorized proposal containing a state hash, not content. It writes the signed state and then appends a committed revision/hash receipt.
- Reads verify the ledger, record signature, Memory content hashes, and latest committed workspace revision. A valid but older signed snapshot is rejected as rollback.
- A crash between file commit and ledger commit is fail-closed, not automatically reported as successful recovery. Administrative reconciliation for that incomplete commit remains unimplemented.
- No proof captures, Memory bodies, private keys, or protected source values are put in these ledger payloads.
- Console and workspace command denials retain minimized receipts. A response discarded after dispatch is explicitly distinguished from a handler that never ran.

Use **Administrator console > Control > Evidence** to inspect `workspace.session.start`, room/Memory mutation proposals, `workspace.commit`, and denial records. Match the state hash and revision; do not use the proposal alone as completion evidence.

## Remote Containment Correction

The previously inspected remote work-graph cancellation/revocation path did not obtain receiver containment evidence. It could return an empty list or append a local revocation event and let the graph become terminal.

The host now refuses those remote operations with `REMOTE_CONTAINMENT_UNAVAILABLE` before that behavior. Both new and retained graph controls disable the unsupported remote stop/revoke action and explain why. Local cancellation/revocation continues through existing services.

This fixes a false-success path; it does NOT implement remote containment. A signed receiver command, exact remote assignment/mandate binding, actual process containment, durable signed result, retry/replay/offline behavior, and two-node tests remain required.

## Verification And Remaining Acceptance

Final automated result for this turn: 11 suites / 55 tests passed, including production Electron and restart; typecheck, production build and production-surface scan passed. Full repository lint still fails on 54 pre-existing demo-recorder/generated-demo global-variable errors; no new implementation file appears in that report. The complete historical release suite and control inventory are not certified for authenticated startup.

Automated tests use disposable roots. Domain tests use an explicitly test-only biometric port; the Electron test uses the real BCH implementation with test-generated feature vectors through production IPC. Neither is a camera, physical-person, liveness-model, provider, or HP acceptance ceremony.

Required operator checks:

1. Sign in as each actual employee using the approved current liveness policy. Confirm the dialog names the correct person and a wrong person's capture fails.
2. Confirm a staff session cannot enter Office/Control through navigation or direct API calls.
3. Confirm revoked/suspended authority cannot be renewed; test eligible expired exact-scope renewal separately.
4. Add and remove a real coworker from a disposable room. Confirm both windows update and no private room appears to a nonmember.
5. Submit, independently review, publish, and withdraw a non-secret Memory record. Confirm receipt hashes and visibility after restart.
6. Repeat keyboard/focus/camera-denial behavior, including cancellation while verification is active.
7. Rerun the carried Plan 4 Phase 44 / Plan 5 Phase 51 acceptance ceremony only after remaining product gaps are implemented.

Still not complete: department/record-type read-remit policy and CISO investigation screens; linking these ACL rooms to work graphs, cross-node membership/admission and agent lending; fully employee-scoped task execution and Records; encrypted/classified/source-grounded Memory retrieval; remote containment; complete control registry and migration of older Electron tests to authenticated startup; cumulative performance/accessibility/security/release verification; genuine human/provider/two-node acceptance.

The old Electron tests assumed an unrestricted first screen. They must exercise authenticated setup/sign-in now, not use a production bypass to restore that assumption. The previous release's passing screenshots are historical, not certification of this new boundary.

No external source, library, or dependency was added. Existing React, Zod, Electron, Ed25519 signing, atomic storage, evidence ledger, and lucide icons are reused. Trust remains **Connected-observed ceiling**.
