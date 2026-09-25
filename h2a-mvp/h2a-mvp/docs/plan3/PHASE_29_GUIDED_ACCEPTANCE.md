# Phase 29 Guided Acceptance

## Administrator credential recovery

If biometric verification succeeds but Federation still reports that a verified administrator is required, the active administrator credential has expired or been revoked. On each node, verify the Administrator / Approver with the exact purpose `administer trusted federation peers`, return to Federation, and click **Renew administrator credential**. H2A issues an Ed25519-signed `role_authority_admin` credential valid for 120 minutes and records `AUTHORITY_CREDENTIAL_ISSUED`; it does not reactivate an old credential or broaden its roles.

## Preconditions

- Use the completed Phase 28 Node A root.
- Phase 27 Context minimization and Phase 28 Authority escalation remain ready on the active ceremony.
- Verify `vcbv` for `administer trusted federation peers` before protected federation actions.
- Trust must remain `Connected-observed ceiling`.

## Prepare Node B

From `C:\Users\khatr\Downloads\H2A_mvp\h2a-mvp`:

```powershell
$env:H2A_DATA_PATH='C:\Users\khatr\Downloads\H2A_mvp\h2a-mvp\data\demo-sessions\phase23-guided-20260821175015'
pnpm demo:phase29:provision
```

Record the generated Node B path. Build and launch both visible instances:

```powershell
pnpm build
pnpm demo:phase29:start -- --node-a "$env:H2A_DATA_PATH" --node-b "<generated Node B path>"
```

## Configure Independent Nodes

1. In Node A open **Federation**, click **Node settings**, set display name `H2A HP Control Node`, endpoint `http://127.0.0.1:43120/h2a/federation/v2/envelopes`, leave secure remote listener off, and save.
2. In Node B set display name `H2A Friend Agent Node`, endpoint `http://127.0.0.1:43121/h2a/federation/v2/envelopes`, leave secure remote listener off, and save.
3. Record both node IDs and key fingerprints. They must differ.
4. Start the listener on both nodes. Confirm each panel shows `running` and its exact endpoint.

## Complete The Signed Handshake

1. On Node A click **Invite node**. Set the invited organization to the organization ID shown by Node B, allow `task.receive`, `context.receive`, `message.receive`, `heartbeat`, `ack`, and `revocation`, and keep the field limit at `3`.
2. Open **Handshake**, copy the invitation JSON and separately record Node A's key fingerprint.
3. On Node B click **Join node**, paste the invitation, enter the exact Node A fingerprint, retain only the granted capabilities, and create the registration.
4. On Node B open **Handshake** and copy the registration JSON. Separately record Node B's key fingerprint.
5. On Node A open **Handshake**, click **Review registration**, paste the registration, compare its joining-node fingerprint with the separately recorded Node B fingerprint, and approve.
6. On Node A copy the resulting acceptance JSON.
7. On Node B click **Activate acceptance**, paste the acceptance, verify the host-node and key pins, and activate.
8. Confirm both peer registries show the same peer ID as `active` with the opposite node's pinned key.

## Exchange And Denial Proofs

1. On Node A select the active peer and an acknowledged Phase 27 lane. Click **Send task**.
2. Confirm Node A shows `acknowledged`, an envelope hash, and an acknowledgement hash. Confirm Node B shows the received task ID and payload hash.
3. On Node B select Node A and click **Acknowledge**. Confirm its signed acknowledgement is accepted.
4. Send a heartbeat in each direction and confirm accepted traffic receipts.
5. Before restarting, on Node A click **Prove replay denial**. Confirm it reports blocked with a sequence or nonce replay reason and Node B records a rejected receipt.
6. On Node A use the peer registry revoke control. Keep the revoked peer selected and click **Prove revoked peer**. Confirm new outbound signing is blocked before network launch.

## Restart Check

1. Close both H2A windows and rerun the same two-node launch command.
2. Confirm node IDs, key fingerprints, trust documents, peer lifecycle, accepted/rejected receipts, task/ack hashes, replay proof, and revocation proof persist.
3. Confirm both listeners truthfully return as `stopped`; start is an explicit operator action after every restart.
4. Open **Evidence** and resolve the shared trace. Confirm federation envelope records contain IDs, decisions, and hashes but no Phase 27 protected values.
5. Confirm the header still reads `Connected-observed ceiling`.

## Acceptance Boundary

Phase 29 is complete only after the two visible instances finish this procedure and the persisted records are inspected. Automated tests prove the implementation path, but do not substitute for the guided operator ceremony.
