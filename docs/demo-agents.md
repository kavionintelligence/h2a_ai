# Local demo agents discovered through Agent Census

After the workspace dependencies are installed (`npm run setup`), start the optional local agent fleet from the workspace root:

```bash
npm run demo:agents
```

On Windows PowerShell, `npm.cmd run demo:agents` is equivalent if script execution policy blocks `npm.ps1`. If the demo is already running, stop that launcher with **Ctrl+C** (or **q**, then Enter) before switching profiles. Do not reset the data just to switch profiles.

Open [H2A](http://127.0.0.1:8787). The launcher starts Agent Census on port **8011**, the local fleet on **8020**, and H2A on **8787**. It waits for the fleet's initial runtime observations to reach Census before reporting ready.

The fleet contains four local demonstration services:

| Agent | Stable local identity slug |
| --- | --- |
| Marketing Research Agent | `marketing-research` |
| Product Intelligence Agent | `product-intelligence` |
| Customer Insights Agent | `customer-insights` |
| Compliance Review Agent | `compliance-review` |

These are explicitly simulated agent runtimes. They expose live local discovery endpoints and emit runtime observations; they do not call a real language model or run CrewAI, LangGraph, or another external framework. Any framework/provider/model labels are demonstration metadata, not a claim that those products executed. No cloud API credentials are required for this fleet.

## What Scan does

Opening Discovery still shows **Ready to scan**, with no automatically loaded inventory. Click **Scan** to invoke H2A's backend adapter, which invokes the native Agent Census scan API. Census makes real HTTP requests to the running fleet's discovery endpoints and applies its existing evidence, identity resolution, classification and fingerprinting logic. Fleet runtime observations use Census's authenticated ingestion API. The fleet does not write Census's database, and H2A does not manufacture discovery records.

The optional profile adds local discovery sources to existing backend configuration. It preserves existing source entries, origins and blocked hosts. Local HTTP/private-address access is enabled for this opt-in profile, while Census's exact origin allowlist and blocked-host checks still apply. Normal `npm run dev` does not launch or add the local fleet.

On a fresh data directory, all four begin as unregistered/shadow Census identities, with no H2A identity, human owner, passport or mandate. A scan alone does not import them. If these identities were already onboarded in a previous run, their persisted H2A governance remains intact.

## Present the complete workflow

1. In **Discovery**, click **Scan**. Inspect each agent's Census identity, endpoints, protocols, runtime metadata, evidence, fingerprint and first/last-seen timestamps. Source warnings remain visible if another configured source fails.
2. Open an agent with **Inspect**, then click **Register in H2A**. Click **View in Agent Registry**. The registry preserves the original Census ID and immutable source evidence beside its separate `H2A-AGENT-...` identity.
3. Under **Bring under governance**, select **Priya Sharma · Marketing Operations**, click **Bind human owner**, then **Issue passport**, then **Assign research mandate**. Repeat for all four agents. Their available governance actions use the same existing competitive-research mandate; the different agent names do not silently grant different permissions.
4. Select **Marketing Research Agent** in the registry and click **Continue to collaboration**. Select the other three agents under **Additional governed agents**, then **Create collaboration room**. The room is **Q4 Product Launch Research** and includes Priya plus all four agents. Onboard the peers before creating this room: an existing room is preserved, and creating it again does not replace its participants.
5. Click **Search competitor products**. The backend mandate permits the request, executes the existing simulated research operation and records its result in the room timeline.
6. Click **Attempt CRM write**. Verify the persisted action is denied with zero executions.
7. Click **Share competitor report externally**. Open **Human Approvals** and verify the pending request has zero executions. Click **Reject** and verify it remains unexecuted. Request a new external share from the room, then click **Approve Once**; only that approved request executes once.
8. Return to the room and click **Propose company memory**. The proposal remains **Proposed · Unreviewed**. In **Company Memory**, use **Approve**, **Edit & Approve** followed by **Save & Approve**, or **Reject**. Only an approved review publishes trusted company memory with its agent, reviewer, passport, mandate, room, source research and timestamps.
9. Open **Identity Trace**. Inspect preserved Census discovery history and the persisted H2A registration, owner, passport, mandate, room, action, approval and memory events. Refresh the browser and confirm the registry and governance records persist.

Governance decisions, approvals, signatures and persistence are real application behavior. Research content and external delivery are the existing simulated demo operations; this profile does not turn them into external product searches or real report delivery.

## Restart, freshness and reset

The optional profile uses the same `integration-data` directory as normal startup. Graceful stop/restart preserves Census records and H2A bindings, passports, mandates, rooms, approvals, memories and audit events. Repeated scans and repeated registration do not create another H2A identity for the same Census ID. Keep the fleet endpoint configuration stable when repeating an identity demonstration.

After stopping the fleet and restarting with `npm run dev`, Discovery again starts visually empty. Clicking **Scan** can still return prior Census observations. These are persisted evidence, not proof that the fleet is still running: Census reports evidence age and active/stale state according to its configured freshness window. Stale records remain visible, and their H2A registration and governance are not deleted.

For a deliberately fresh demonstration, stop the launcher, run `npm run demo:reset`, then `npm run demo:agents`. Reset archives the previous default `integration-data` directory rather than deleting it. It resets governance and discovery together; it is not required for ordinary restart or profile switching. Existing external-source configuration remains in the backend configuration, not in the archived demo data.

If Census is unavailable, H2A shows **Agent Discovery service unavailable** and **Retry**. If the fleet fails to become ready, inspect the launcher error; do not replace missing discovery output with fixture records. See the root [README](../README.md) for setup, configuration and integration tests, and [verification](verification.md) for the limits of the full native desktop test suite.
