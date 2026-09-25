# Phase 15 - Connector Protocol And SDK Foundation

Status: complete

## Purpose

Phase 15 establishes the provider-neutral trust and delivery boundary between H2A and an external agent process. It does not make a provider session governed. Phase 16 owns supervised provider execution; Phase 19 owns production Context Grant resolution and minimization.

## Components

| Component | Responsibility |
|---|---|
| `packages/contracts/src/connector-protocol.ts` | Strict protocol, registry, health, delivery, context, result, acknowledgement, and cancellation schemas. |
| `packages/connectors/src/connectorRegistry.ts` | Verify publisher-signed Connector Manifests, bind runtime public keys, persist registry and health, and emit evidence. |
| `packages/messaging/src/messageBroker.ts` | Verify organization-signed tasks, sign outbound frames, persist queue state, enforce idempotency/sequence/expiry, retry, cancel, dead-letter, verify results, and record evidence. |
| `packages/messaging/src/localProcessTransport.ts` | Maintain a real child-process JSON-line channel and mediate bounded context requests. |
| `packages/sdk-typescript/src/index.ts` | Verify broker frames, sign agent frames, request context, cache idempotent results, and run the line protocol. |
| `packages/sdk-python/h2a_sdk/__init__.py` | Dependency-free canonical hashing, frame verification contract, and idempotency store with injected approved Ed25519 verification. |
| Settings / Connector Registry | Read-only health, queue metrics, recent delivery status, refresh, and cancellation controls through typed IPC. |

## Signed Import

1. A publisher canonicalizes and signs the frozen V2 `ConnectorManifest` with Ed25519.
2. Import supplies the publisher public key and the connector runtime public key.
3. The trusted registry recomputes the canonical hash and verifies the publisher signature.
4. A valid manifest and runtime key are stored in `connectors/registry.json`; tampered imports fail before persistence.
5. `CONNECTOR_MANIFEST_IMPORTED` records the manifest ID, provider, protocol, and canonical hash without private material.

## Delivery Workflow

1. The broker validates the frozen `TaskEnvelope`, expiry, canonical hash, and organization signature.
2. Duplicate task idempotency keys return the existing delivery instead of creating new work.
3. The broker creates and signs a protocol `task` frame with task, trace, passport, runtime-attestation, mandate, and Context Grant references inherited from the envelope.
4. The transport sends the frame to the external process and does not acknowledge queue state on send alone.
5. The SDK verifies the broker signature and requests named fields under the exact Context Grant reference.
6. The trusted authorization port returns an allow/deny `context-response`; the process receives only granted fields.
7. The SDK executes once, signs a typed `result` and `acknowledgement`, and caches both by idempotency key.
8. H2A verifies runtime signatures, payload hashes, expiry, sequence, connector/task/trace/idempotency references, then marks delivery acknowledged.
9. Transport failure schedules exponential retry. The final bounded failure becomes dead-letter. Operator cancellation is terminal before acknowledgement.

## Durability And Replay

- Queue state is atomically persisted in `messaging/deliveries.json`.
- Broker Ed25519 material is local trusted-process state in `messaging/broker-key.json`.
- Connector runtime private keys remain outside H2A registry state.
- Sequence numbers are monotonic per connector delivery stream.
- Result and acknowledgement frames must advance beyond the task frame and match all authority references.
- At-least-once transport combines with SDK idempotency to provide once-only task execution for retries within the connector process lifetime.
- Durable connector-side idempotency across process replacement is an SDK adapter responsibility and is required for production connectors in Phase 17.

## Conformance Evidence

`tests/connector-protocol-phase15.test.ts` launches `sampleExternalAgent.ts` as a separate Node process. The test intentionally discards the first successful acknowledgement. H2A retries the same signed task against the still-running process; the SDK returns its cached signed result and `execution_count` remains `1`. The suite also proves manifest-tamper rejection, bounded dead-lettering, cancellation, broker restart persistence, evidence linkage, and Python SDK syntax.

## Truthful Boundaries

- The Electron runtime binds a fail-closed authorization port returning `CONTEXT_BROKER_NOT_BOUND`; Phase 19 will replace it with the production Context Broker.
- No live Claude, Codex, Antigravity, Gemini, n8n, LangGraph, OpenClaw, or MCP process is integrated by this phase.
- The local process transport is connected-observed. It is not governed until Phase 16 proves isolation, credential brokering, tool/network enforcement, revocation, and cancellation against actual provider processes.
- A2A 1.0 feasibility from Phase 11 remains valid; durable remote A2A/federation transport is Phase 20.

## Munder-Difflin Adaptation

The implementation reuses no Munder-Difflin source code. It reimplements these MIT-licensed design concepts in H2A-owned modules:

- per-recipient outbox/inbox lifecycle and atomic file persistence from `src/main/hive.ts`;
- bounded hop/delivery failure handling, adapted into signed sequence and dead-letter rules;
- acknowledge-only-after-success semantics from `src/renderer/src/hooks/queueDelivery.ts` and `test/queue-delivery.test.cjs`.

Munder's messages are coordination records, not authority records. H2A replaces them with signed tasks and frames carrying explicit passport, runtime-attestation, mandate, Context Grant, expiry, sequence, idempotency, acknowledgement, and evidence references.

