# Synthetic evaluation

The benchmark is executed by the offline demonstration and writes [evaluation.json](../output/reports/evaluation.json) plus the full [demo report](../output/reports/demo-report.json). It computes results from returned registry records and explicit ground truth; the numbers are not hardcoded success claims.

```bash
python scripts/demo.py
python scripts/evaluate.py
```

The demo starts real loopback HTTP mock peers and calls the registry through an in-process ASGI test client. It uses SQLite, synthetic behavior and no external LLM. Timing measures this configuration, not a distributed production deployment. Ground-truth labels and scenario generation are in `src/agent_census/demo.py`; the `evaluate(report)` function contains the metric implementation.

## Dataset and observed correctness

The delivered fixture set contains 10 explicitly targeted entities and 48 events. It includes registered security, research and vision agents, a coordinator, an unregistered shadow worker, a dynamically declared subagent, and four non-agent controls including an ordinary API, MCP server, LLM wrapper and static workflow. The dynamic subtype is declared by a synthetic creation inventory, not inferred merely because delegation occurred.

The report inspected while writing this document records:

| Measurement | Observed result | Denominator / meaning |
|---|---|---|
| Discovery | 10 TP, 0 FP, 0 FN; precision/recall/F1 = 1.0 | The 10 explicitly targeted endpoint-labeled entities, including non-agents. This is inventory recovery, not agent-only classification. |
| Agent classification | 6 TP, 0 FP, 4 TN, 0 FN; precision/recall = 1.0 | All 10 fixture labels. No probability calibration is evaluated. |
| Duplicate identity pairs | 16 correct merges / 16 expected duplicate pairs | Pairs of fixture observations that share the same known endpoint. |
| Nonduplicate identity pairs | 0 false merges / 215 different-entity pairs | Fixture observation pairs with different endpoints. These pairs are correlated, not independent statistical samples. |
| Inferred capabilities | 27 correct / 27 returned inferred capability records; precision = 1.0 | Returned `basis=inferred` entries checked against each entity's allowed ground-truth set. Declared/observed entries are excluded. Recall is not measured. |
| Shadow detection | 2 TP, 0 FP, 8 TN, 0 FN; precision = 1.0, false-positive rate = 0.0 | Unregistered behavioral positives among the 10 fixtures. |

These are a small set of deliberately designed regression scenarios. Perfect results here are not an estimate of performance on unseen applications. Identity labels use fixture endpoint equality, while separate unit tests exercise workload composites, name-only nonmatches, registration conflicts, ambiguous matches and namespace conflicts. The pairwise benchmark does not independently validate the resolver against changed endpoint ownership or shared gateway paths.

## Definitions

Discovery precision is recovered expected endpoints divided by all returned endpoints; recall is recovered expected endpoints divided by expected endpoints. F1 is the harmonic mean of precision and recall. The evaluator compares endpoint sets, so it is not a separate test of duplicate record multiplicity.

Classification compares `classification.is_agent` with the synthetic label. Missing positive entities count as false negatives. Shadow classification similarly compares the final `shadow` field with the shadow label. Precision is `TP / (TP + FP)` and shadow false-positive rate is `FP / (FP + TN)`. Where a ratio has no denominator, the helper returns `null` rather than pretending it was measured.

Duplicate merge accuracy is the fraction of endpoint-equal observation pairs assigned the same canonical ID. False merges count endpoint-different pairs assigned the same ID. Inferred-capability precision counts emitted inferred records whose name belongs to the ground-truth capability set; it does not test whether the mock could execute that capability successfully.

## Timing and throughput

The authoritative current values are stored in the generated JSON; they change on every run. One inspected development run recorded approximately 0.124 seconds for discovery, a 0.0242-second median registry query across five samples, 0.0457 seconds for ingesting 48 events (about 1,051 events/second), and 0.0651 seconds from ingestion start to shadow-report retrieval. These values were actually observed, but are examples from one local run and are not expected reproducibility thresholds.

Discovery latency measures the synchronous discovery request wall time. Registry latency measures five complete in-process client requests and reports their median. Ingestion throughput is batch event count divided by that single synchronous ingestion interval; it is not sustained concurrent throughput. Shadow latency starts at event-ingestion request initiation and ends after report retrieval. It excludes real producer delay, queueing, network transit to the collector and any periodic scan interval.

## Not evaluated

Real-provider/framework exporter integrations, production traffic, adversarial telemetry, model calibration, unseen capability generalization, long-running distributed ingestion, high-concurrency throughput, network discovery coverage, cryptographic workload identity, and real Kubernetes/Docker/PostgreSQL installations are **NOT EVALUATED** by this benchmark. See the delivery validation notes for any separately executed tests; do not infer external integration coverage from an installed package.

For a stronger evaluation, create independently labeled positive and difficult negative workloads, separate rule-development fixtures from held-out cases, report per-source missingness, add temporal identity changes, and measure repeated runs with confidence intervals. A learned classifier would require a separate training/calibration/test protocol.
