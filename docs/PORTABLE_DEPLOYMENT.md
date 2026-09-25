# Portable deployment

## Supported showcase profile

The verified profile is a single Windows, macOS or Linux laptop with Node.js 22.12+ and Python 3.11+. State is durable on that machine, the browser and API are served from one Node process, and Agent Census runs as a loopback-only Python sidecar.

```powershell
npm.cmd run setup
npm.cmd run doctor
npm.cmd run build
npm.cmd start
```

The default URL is `http://127.0.0.1:8787`.

## Open from a second device

Use only on a trusted demo network:

```powershell
$env:BYOSYNC_HOST = "0.0.0.0"
npm.cmd start
```

The launcher generates a strong token, limits accepted Host headers to the local hostname and detected IPv4 addresses, and prints login links. The link establishes an HttpOnly, SameSite browser cookie. Agent Census remains bound to loopback and is not exposed to the network.

## Move to another laptop

Copy the full `ByoSync` directory. To preserve the governed identities and evidence, include `integration-data`; to start a clean estate, omit it. On the target laptop run `npm run setup`, then `npm run doctor`, then `npm start`. Signing keys are in the data directory, so protect the copied directory as sensitive material.

## Evidence intake

Machine collectors authenticate with the same bearer token in portable mode:

```http
Authorization: Bearer <BYOSYNC_ACCESS_TOKEN>
Content-Type: application/json
```

Use `/api/adapters/claw-hunter`, `/api/adapters/shadow-ai-guard`, `/api/source-reports`, or `/api/telemetry/ingest` depending on the producer. Intake schemas are strict and bounded; prompts, secret values and unbounded request bodies are not accepted.

## Boundaries

- This profile is for a portable, single-node CISO showcase and controlled evaluation.
- It is not a production multi-tenant deployment.
- LAN HTTP is not encrypted. Use a TLS reverse proxy before leaving an isolated demo network.
- Enterprise deployments still require SSO/RBAC, a server database, backups, key rotation, signed device enrolment, queueing/backpressure and operational monitoring.
