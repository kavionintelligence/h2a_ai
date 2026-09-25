# Identity resolution

Discovery records are observations, not automatically distinct agents. One workload may have a card, an infrastructure record and runtime events. The resolver checks these observations against existing canonical identities and returns an explicit merge decision with supporting signals.

## Accepted signals

| Signal | Requirement | Heuristic strength |
|---|---|---|
| Same source identity | Exact source and source-local candidate ID | 1.00 |
| Same endpoint | Exact normalized full endpoint | 0.95 |
| Same workload | All of namespace, service and deployment are nonempty and exactly equal | 0.95 |
| Same registration ID | Exact nonempty explicit registration identifier | 0.99 |

These strengths explain the policy; they are not probabilities or statistically learned weights. One of these strong signals is sufficient, subject to conflict checks. Name similarity, hostname equality, framework, model, owner, and tool similarity are insufficient on their own.

Endpoint normalization lowercases scheme and hostname, removes default HTTP/HTTPS ports and represents an empty root path as `/`. Nondefault ports and path case remain significant. `/service` and `/service/` remain separate: servers can treat those paths differently. Credentials, query strings and fragments are rejected by the candidate model rather than being stored or used for matching.

For runtime discovery, the source-local identity is a stable hash of service name, namespace and deployment. Individual trace IDs and collector sources do not become new workload identities. Evidence retains the original event's source. This means runtime discovery is workload-level: multiple independent agents inside one service require explicit separate metadata/identities or a future finer-grained runtime adapter.

## Conflicts and ambiguity

The resolver groups all observations belonging to each canonical entity before deciding. If a new observation carries registration ID B and any existing observation in that group carries a different ID A, the merge is blocked. An alias observation with no registration ID cannot bypass this check. Conflicting nonempty namespaces also block a merge.

If two canonical entities both satisfy accepted signals, the resolver returns `merged: false` with an ambiguity explanation. It never chooses whichever item appears first. The caller can retain a separate observation and surface the conflict for review; the resolver does not destructively merge the existing records.

Example explanation:

```json
{
  "merged": true,
  "canonical_agent_id": "AGT-example",
  "evidence": [{
    "signal": "same_workload",
    "strength": 0.95,
    "namespace": "demo",
    "service": "security-agent",
    "deployment": "security-agent"
  }],
  "conflicts": []
}
```

## Limits and security

Exact endpoints can be reassigned, and a shared proxy can expose multiple logical agents through one route. User-provided registration identifiers are assertions until authenticated and verified. These risks are not solved by exact string matching. Trust decisions must remain independent of identity merges; a matching endpoint does not approve a target or grant authorization.

Namespace scoping is a defensive boundary, not a complete multitenant identity system. A production integration should bind identifiers to tenant, deployment UID, service account and a verified workload credential, and support time-bounded endpoint ownership. V1 does not claim cryptographic verification or Bayesian correlation.

The unit suite exercises endpoint normalization, separate paths/ports, composite workload matching, same-name nonmatches, namespace conflicts, conflicting registrations across aliases and ambiguous matches.
