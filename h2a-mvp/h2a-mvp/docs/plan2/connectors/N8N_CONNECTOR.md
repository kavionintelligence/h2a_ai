# n8n Connector

## Reference Workflow

Use an n8n Webhook trigger to receive the signed H2A exchange, pass its JSON into the `H2A Signed Exchange` node, and return the node result with Respond to Webhook. The node forwards to a configured H2A-compatible worker and preserves the protocol version header.

The package is under `integrations/n8n`. Install it as a private/custom node package in the target n8n environment, restart n8n, then configure the worker endpoint. Loopback HTTP is permitted for this local demo; remote workers require HTTPS. Enter bearer material through the password control, never in the URL or workflow body.

The node passes strict TypeScript validation against official `n8n-workflow 2.16.0` types. Its package accepts supported n8n 2.x hosts through the `>=2.0.0 <3` peer range.

## Required Verification

Before changing health from `configuration-required` to accepted, prove both phases of one signed exchange, invalid-signature denial, timeout behavior, and that workflow execution logs contain no bearer or unrestricted context.

The n8n host is not installed in the current workspace, so Phase 17 ships the real node boundary and truthful dependency health without claiming live n8n-host acceptance.
