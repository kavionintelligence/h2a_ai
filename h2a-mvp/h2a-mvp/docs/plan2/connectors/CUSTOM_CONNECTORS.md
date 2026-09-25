# Custom CLI And HTTP Connectors

## Custom CLI

Use the TypeScript or Python SDK to implement the signed JSON-line protocol. The process must request bounded context, verify the broker signature, sign its context request/result/acknowledgement with the registered runtime key, and treat the idempotency key as exactly-once execution identity.

`LocalProcessTransport` supplies only a minimum host environment plus explicit connector references. It supports timeout and process closure; Phase 16 Process Supervisor owns stronger live-provider lifecycle controls.

## Custom HTTP

`SignedHttpConnectorTransport` sends the same two-phase contract over POST. Loopback HTTP is allowed for the local demo. Remote endpoints require HTTPS unless an operator explicitly enables the unsafe override for a controlled test. Redirects fail, response size is bounded, URL credentials are rejected, and the request has a timeout.

The HTTP worker must return either `{ type: "context-request", frame }` or `{ type: "completed", result, acknowledgement }`. Import its signed Connector Manifest/runtime key before delivery.

