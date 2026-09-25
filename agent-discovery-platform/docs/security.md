# Security model

The system is intended for an explicitly authorized environment. The offline demo accesses only loopback mock peers. It does not scan subnets, inspect secrets, open Docker sockets, read arbitrary local source trees, capture command lines, execute repository code, or send email. Synthetic tools named `secret_scanner` return predefined demonstration results.

## Authentication and authorization

All entity, graph, event and report endpoints require a bearer token. Admin can register, discover, approve, scan, delete and route; reader can inspect and match; ingest can submit normalized events and OTLP only. Token comparison is constant-time. Tokens must be distinct and at least 24 characters; `scripts/init_env.py` generates random tokens without printing them. `/health`, `/ready`, the HTML shell and OpenAPI schema contain no entity data and are public. No tokens are embedded in source or reports.

Static tokens identify roles, not individual users. Replace `StaticTokenAuthenticator` with audience/issuer-verified OIDC and explicit principal scopes before shared production deployment. Put the API behind TLS and an authenticated gateway with rate limits. This prototype binds loopback in documented local commands and containers expose only loopback host ports.

## Outbound policy and trust

Every network connection must match an exact configured origin (scheme, normalized hostname and port). An explicit blocklist overrides it. HTTPS certificate validation is always enabled. Private IPs and plaintext HTTP require separate local-policy flags. Link-local metadata, unspecified and multicast addresses are rejected even in local mode. Userinfo, query strings and fragments cannot appear in candidate endpoints.

The transport resolves DNS, checks all returned addresses, and pins the selected numeric address for the request while retaining the original Host and TLS SNI/certificate hostname. It does not inherit system proxy or credential settings, follow redirects, or forward Authorization/Cookie headers. It bounds time and decoded response bytes. Only GET/HEAD reads marked retryable receive short exponential retry; task POSTs are never automatically replayed.

An allowlisted origin is permission to connect, not proof of agent identity. Operator approval is a separate audited action. A2A signatures and workload certificates are not cryptographically verified; unknown identities remain unverified. Registration alone does not approve trust or health. Endpoint changes invalidate approval and health. Matching and the router enforce recent healthy checks and recent observations. Protected upstream authentication schemes are excluded until an outbound credential adapter exists.

## Sensitive data and telemetry

Adapters use metadata allowlists. Kubernetes secrets, env values, Docker environment and process command lines are not imported. OTLP extracts a small set of service/model/tool/operation identifiers and discards prompts, completions and arbitrary span payloads. Known configured tokens and common secret patterns are redacted before storage; request validation responses omit raw input. Logs use stage names and correlation/entity IDs, not task text or exception payloads. Audit records store decisions and sanitized reasons, not routed task payloads.

Redaction is not a guarantee that arbitrary free text cannot contain an unrecognized secret. Authorized callers should send identifiers and evidence categories, not secrets or user content. The database and report artifacts contain infrastructure metadata and need access control, encryption at rest, backup policy and retention appropriate to deployment. Never publish a populated `.env` or database.

Telemetry producers are trusted to report honestly. They cannot approve/register an agent using event fields, but can fabricate behavioral observations within their permitted service scope; this prototype has no cryptographic workload attestation or per-service ingest scopes. Cross-source corroboration means different reported collectors, not statistically independent or verified evidence. Shadow alerts request review, never automatic blocking or an accusation of maliciousness.

## Availability and operational limits

Request bodies, source item lists, returned pages, responses and event batches are bounded. API errors are structured; discovery continues after individual failures. HTTP/task failures are audited; continuous monitoring logs a failure and continues. The default event window is one hour. For sustained production volume, add rate limits, explicit database quotas, event partitions, durable jobs, tenant isolation and multi-process locking. A synchronous local callable must be trusted bounded code; Python cannot safely cancel arbitrary in-process execution.
