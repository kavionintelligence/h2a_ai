import { createHash } from 'node:crypto';
import {
  operatorReadinessSchema, operatorReadinessStateSchema, repairPlanSchema,
  type ControlPlaneCanonicalState, type ExactAuthorityScope, type OperatorPrerequisite,
  type OperatorPrerequisiteStatus, type OperatorReadiness, type OperatorReadinessState, type RepairOperation, type RepairPlan
} from '@h2a/contracts';

const EXPIRING_WINDOW_SECONDS = 10 * 60;
const CLOCK_SKEW_TOLERANCE_SECONDS = 30;
const EMPTY_SCOPE: ExactAuthorityScope = Object.freeze({ resources: [], actions: [], fields: [], paths: [], commands: [], capabilities: [], duration_seconds: null, quorum: null, policy_bindings: [] });

export interface ReadinessProjectionInput {
  canonical: ControlPlaneCanonicalState;
  connection: { status: 'connected' | 'stale' | 'disconnected'; read_only: boolean };
  now?: Date;
  activeRepairPlanId?: string | null;
}

export class ReadinessProjectionService {
  public project(input: ReadinessProjectionInput): OperatorReadinessState {
    const now = input.now ?? new Date();
    const commands = [
      ...input.canonical.real_collaboration.lanes.map((lane) => this.projectLane(input, lane.lane_id, lane.title, false, now)),
      ...input.canonical.least_context.lanes.map((lane) => this.projectLane(input, lane.lane_id, lane.title.replace('disclosure', 'handoff'), true, now)),
      this.projectFederation(input, now),
      this.projectApproval(input, now),
      this.projectProjectDelivery(input, now)
    ];
    return operatorReadinessStateSchema.parse({
      schema_version: 1,
      generated_at: now.toISOString(),
      clock_skew_tolerance_seconds: CLOCK_SKEW_TOLERANCE_SECONDS,
      commands,
      active_repair_plan_id: input.activeRepairPlanId ?? null
    });
  }

  public plan(command: OperatorReadiness, now = new Date()): RepairPlan | null {
    const unresolved = command.prerequisites.filter((item) => item.status !== 'ready');
    if (!unresolved.length) return null;
    const proofHuman = this.proofHuman(command);
    const purpose = `repair prerequisites for ${command.command_label}`;
    const operations: RepairOperation[] = [];
    const exactScopeRepairKinds = new Set<OperatorPrerequisite['kind']>([
      'human-proof', 'authority-credential', 'runtime-session', 'runtime-attestation', 'mandate', 'assignment', 'context-grant'
    ]);
    const needsExactScopeRepair = unresolved.some((item) => exactScopeRepairKinds.has(item.kind));
    const proofPrerequisite = command.prerequisites.find((item) => item.kind === 'human-proof');
    if (needsExactScopeRepair && proofPrerequisite) {
      const proofOperation = this.operationFor(proofPrerequisite, command, proofHuman, purpose, operations);
      if (proofOperation) operations.push(proofOperation);
    }
    const orderedKinds: OperatorPrerequisite['kind'][] = [
      'membership', 'authority-credential', 'agent-passport', 'runtime-session', 'runtime-attestation', 'mandate', 'assignment',
      'context-grant', 'provider', 'federation-peer', 'approval-policy', 'validation', 'evidence-integrity', 'control-plane'
    ];
    const mandateRepairRequired = unresolved.some((item) => item.kind === 'mandate' && ['expiring', 'expired'].includes(item.status));
    for (const kind of orderedKinds) {
      const prerequisite = unresolved.find((item) => item.kind === kind)
        ?? (kind === 'assignment' && mandateRepairRequired ? command.prerequisites.find((item) => item.kind === 'assignment') : undefined)
        ?? (kind === 'context-grant' && mandateRepairRequired ? command.prerequisites.find((item) => item.kind === 'context-grant') : undefined);
      if (!prerequisite) continue;
      const operation = this.operationFor(prerequisite, command, proofHuman, purpose, operations);
      if (operation) operations.push(operation);
    }
    if (!operations.length) return null;
    const proofOperations = operations.filter((item) => item.proof_human_id && item.proof_purpose);
    const hasExternalOperation = operations.some((item) => item.status === 'external-action-required');
    const hasProofOperation = operations.some((item) => item.status === 'operator-required');
    const status = operations.some((item) => item.status === 'blocked') ? 'blocked'
      : command.status === 'operator-action-required' ? 'external-action-required'
      : hasExternalOperation && hasProofOperation ? 'partial'
      : hasExternalOperation ? 'external-action-required'
      : proofOperations.length ? 'operator-required' : 'ready';
    return repairPlanSchema.parse({
      schema_version: 2,
      repair_plan_id: deterministicId('repair', `${command.readiness_id}:${command.generation_hash}`),
      readiness_id: command.readiness_id,
      readiness_generation_hash: command.generation_hash,
      command_id: command.command_id,
      status,
      operations,
      grouped_proof_purposes: proofHuman && proofOperations.length ? [{ human_id: proofHuman, purpose, operation_ids: proofOperations.map((item) => item.operation_id) }] : [],
      created_at: now.toISOString(), updated_at: now.toISOString(), completed_at: null
    });
  }

  private projectLane(input: ReadinessProjectionInput, laneId: string, title: string, includeGrant: boolean, now: Date): OperatorReadiness {
    const canonical = input.canonical;
    const real = canonical.real_collaboration.lanes.find((item) => item.lane_id === laneId);
    const least = canonical.least_context.lanes.find((item) => item.lane_id === laneId);
    const passport = canonical.agent_identity.passportsV2?.find((item) => item.passport_id === real?.passport_id);
    const session = canonical.agent_identity.runtimeSessions?.find((item) => item.runtime_session_id === real?.runtime_session_id);
    const attestation = canonical.agent_identity.attestations?.find((item) => item.attestation_id === session?.runtime_attestation_id);
    const mandate = canonical.mandates.mandates.find((item) => item.mandateId === real?.mandate_id);
    const assignment = canonical.collaboration.workplace.assignments.find((item) => item.id === real?.assignment_id);
    const membership = canonical.organization.memberships.find((item) => item.human_id === passport?.sponsor_human_id);
    const credential = selectAuthorityCredential(canonical.organization.credentials.filter((item) => item.membership_id === membership?.membership_id));
    const proof = canonical.guided_bootstrap.humans.find((item) => item.human_id === passport?.sponsor_human_id);
    const grant = includeGrant ? canonical.context_broker.grants.find((item) => item.grant.context_grant_id === least?.context_grant_id) : undefined;
    const controlId = includeGrant ? `phase27.${laneId}.run` : `phase26.${laneId}.run`;
    const route = includeGrant ? 'context-broker' as const : 'command-floor' as const;
    const prerequisites: OperatorPrerequisite[] = [
      this.connectionPrerequisite(input, controlId),
      this.recordPrerequisite('human-proof', proof?.proof_id ?? null, proof?.proof_status === 'fresh' ? 'active' : proof?.proof_status ?? 'missing', proof?.proof_expires_at ?? null, controlId, route, now, EMPTY_SCOPE, passport?.sponsor_human_id ?? null),
      this.recordPrerequisite('membership', membership?.membership_id ?? null, membership?.status ?? 'missing', membership?.effective_until ?? null, controlId, route, now, EMPTY_SCOPE),
      this.recordPrerequisite('authority-credential', credential?.credential_id ?? null, credential?.status ?? 'missing', credential?.expires_at ?? null, controlId, route, now, credential ? scope({ resources: credential.resource_constraints, actions: credential.action_constraints, policy_bindings: credential.approval_policy_ids }) : EMPTY_SCOPE),
      this.recordPrerequisite('agent-passport', passport?.passport_id ?? null, passport?.status ?? 'missing', passport?.expires_at ?? null, controlId, route, now, passport ? scope({ capabilities: passport.capabilities, duration_seconds: secondsBetween(passport.issued_at, passport.expires_at) }) : EMPTY_SCOPE),
      this.recordPrerequisite('runtime-session', session?.runtime_session_id ?? null, session?.state ?? 'missing', attestation?.expires_at ?? null, controlId, route, now, session ? scope({ capabilities: [session.trust_mode] }) : EMPTY_SCOPE),
      this.recordPrerequisite('runtime-attestation', attestation?.attestation_id ?? null, session?.state ?? 'missing', attestation?.expires_at ?? null, controlId, route, now, attestation ? scope({ capabilities: [attestation.trust_mode], duration_seconds: secondsBetween(attestation.issued_at, attestation.expires_at) }) : EMPTY_SCOPE),
      this.recordPrerequisite('mandate', mandate?.mandateId ?? null, mandate?.status ?? 'missing', mandate?.expiresAt ?? null, controlId, route, now, mandate ? scope({ resources: mandate.resources, actions: mandate.actions, fields: mandate.disclosure.allowedFields, duration_seconds: secondsBetween(mandate.issuedAt, mandate.expiresAt), policy_bindings: mandate.approvals.requiredActions }) : EMPTY_SCOPE),
      this.recordPrerequisite('assignment', assignment?.id ?? null, assignment ? (['cancelled', 'failed'].includes(assignment.status) ? 'revoked' : 'active') : 'missing', null, controlId, route, now, assignment ? scope({ actions: assignment.requestedAction ? [assignment.requestedAction] : [], commands: [assignment.objective] }) : EMPTY_SCOPE),
      this.providerPrerequisite(real?.provider ?? 'unknown-provider', real?.health ?? 'dependency-missing', real?.detail ?? 'Provider lane is unavailable.', controlId, route)
    ];
    if (includeGrant) prerequisites.push(this.recordPrerequisite('context-grant', grant?.grant.context_grant_id ?? null, grant?.status ?? 'missing', grant?.grant.expires_at ?? null, controlId, route, now, grant ? scope({ fields: grant.grant.allowed_fields, duration_seconds: secondsBetween(grant.grant.issued_at, grant.grant.expires_at) }) : EMPTY_SCOPE));
    return this.finalize(controlId, real?.agent_id ?? laneId, title, prerequisites, now);
  }

  private projectFederation(input: ReadinessProjectionInput, now: Date): OperatorReadiness {
    const peer = input.canonical.federation.peers.find((item) => item.status === 'active') ?? input.canonical.federation.peers[0];
    const controlId = 'phase29.send-task';
    const prerequisites = [
      this.connectionPrerequisite(input, controlId),
      this.recordPrerequisite('federation-peer', peer?.peer_id ?? null, peer?.status ?? 'missing', peer?.expires_at ?? null, controlId, 'federation', now, peer ? scope({ capabilities: peer.capabilities, fields: [`maximum:${peer.maximum_context_fields}`] }) : EMPTY_SCOPE)
    ];
    return this.finalize(controlId, peer?.peer_id ?? 'federation-peer', 'Send least-context task to trusted node', prerequisites, now);
  }

  private projectApproval(input: ReadinessProjectionInput, now: Date): OperatorReadiness {
    const policy = input.canonical.approvals.policies.find((item) => item.status === 'active') ?? input.canonical.approvals.policies[0];
    const pending = input.canonical.approvals.requests.find((item) => item.status === 'pending');
    const controlId = 'phase28.resume-once';
    const prerequisites = [
      this.connectionPrerequisite(input, controlId),
      this.recordPrerequisite('approval-policy', policy?.approval_policy_id ?? null, policy?.status ?? 'missing', null, controlId, 'authority-inbox', now, policy ? scope({ quorum: policy.quorum, policy_bindings: [policy.approval_policy_id], actions: policy.eligible_role_ids }) : EMPTY_SCOPE),
      this.recordPrerequisite('validation', pending?.approval_request_id ?? null, pending ? 'approval-required' : 'active', pending?.expires_at ?? null, controlId, 'authority-inbox', now, pending ? scope({ resources: [pending.required_resource], actions: [pending.required_action], policy_bindings: [pending.approval_policy_id] }) : EMPTY_SCOPE)
    ];
    return this.finalize(controlId, pending?.approval_request_id ?? 'phase28-approval', 'Resume independently approved effect', prerequisites, now);
  }

  private projectProjectDelivery(input: ReadinessProjectionInput, now: Date): OperatorReadiness {
    const assignment = input.canonical.project_delivery.assignments.find((item) => ['ready', 'working', 'review', 'approved'].includes(item.status)) ?? input.canonical.project_delivery.assignments[0];
    const validations = assignment ? input.canonical.project_delivery.validations.filter((item) => item.assignment_id === assignment.assignment_id) : [];
    const controlId = 'phase40.integrate-approved-result';
    const prerequisites = [
      this.connectionPrerequisite(input, controlId),
      this.recordPrerequisite('validation', validations[0]?.receipt_id ?? null, validations.length > 0 && validations.every((item) => item.status === 'passed') ? 'active' : 'missing', null, controlId, 'command-floor', now, assignment ? scope({ paths: assignment.allowed_paths, commands: assignment.validation_commands }) : EMPTY_SCOPE)
    ];
    return this.finalize(controlId, assignment?.assignment_id ?? 'project-assignment', 'Integrate validated project result', prerequisites, now);
  }

  private connectionPrerequisite(input: ReadinessProjectionInput, controlId: string): OperatorPrerequisite {
    return this.makePrerequisite('control-plane', input.connection.status === 'connected' && !input.connection.read_only ? 'control-plane-host' : null,
      input.connection.status === 'connected' && !input.connection.read_only ? 'ready' : 'disconnected-read-only', null, null,
      input.connection.status === 'connected' && !input.connection.read_only ? 'CONTROL_PLANE_ATTACHED' : 'CONTROL_PLANE_DISCONNECTED_READ_ONLY',
      input.connection.status === 'connected' && !input.connection.read_only ? 'Canonical command path is attached.' : 'Protected commands are read-only until the canonical control plane reconnects.',
      controlId, 'settings', EMPTY_SCOPE, input.connection.status === 'connected' && !input.connection.read_only ? { kind: 'none', label: 'No action required', route: null } : { kind: 'operator-action', label: 'Reconnect control plane', route: 'settings' }, null);
  }

  private recordPrerequisite(kind: OperatorPrerequisite['kind'], reference: string | null, rawStatus: string, expiresAt: string | null, controlId: string, route: OperatorPrerequisite['source_route'], now: Date, exactScope: ExactAuthorityScope, sponsorHuman: string | null = null): OperatorPrerequisite {
    const expiresIn = expiresAt ? Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000) : null;
    const status = kind === 'human-proof' && rawStatus === 'missing' && sponsorHuman !== null
      ? 'expired'
      : canonicalStatus(rawStatus, expiresIn);
    const reason = reasonCode(kind, status);
    const remediation = remediationFor(kind, status, route);
    return this.makePrerequisite(kind, reference, status, expiresAt, expiresIn, reason,
      impactFor(kind, status, expiresIn, sponsorHuman), controlId, route, exactScope, remediation, sponsorHuman);
  }

  private providerPrerequisite(reference: string, health: string, detail: string, controlId: string, route: OperatorPrerequisite['source_route']): OperatorPrerequisite {
    const status: OperatorPrerequisiteStatus = health === 'authentication-required' ? 'authentication-required' : health === 'dependency-missing' || health === 'disabled' || health === 'degraded' ? 'dependency-missing' : 'ready';
    return this.makePrerequisite('provider', reference, status, null, null, health === 'ready' ? 'PROVIDER_READY' : `PROVIDER_${health.replaceAll('-', '_').toUpperCase()}`, detail || 'Provider prerequisite is unavailable.', controlId, route, EMPTY_SCOPE,
      status === 'ready' ? { kind: 'none', label: 'No action required', route: null } : { kind: 'external-action', label: status === 'authentication-required' ? 'Authenticate provider' : 'Install or repair provider', route: 'settings' }, null);
  }

  private makePrerequisite(kind: OperatorPrerequisite['kind'], reference: string | null, status: OperatorPrerequisiteStatus, expiresAt: string | null, expiresIn: number | null, reason: string, impact: string, controlId: string, route: OperatorPrerequisite['source_route'], exactScope: ExactAuthorityScope, remediation: OperatorPrerequisite['remediation'], boundHumanId: string | null): OperatorPrerequisite {
    return {
      prerequisite_id: deterministicId('prereq', `${controlId}:${kind}:${reference ?? 'missing'}`), kind, canonical_reference_id: reference,
      bound_human_id: boundHumanId,
      replacement_for_id: null, status, expires_at: expiresAt, expires_in_seconds: expiresIn, reason_code: reason, impact,
      scope: exactScope, scope_hash: canonicalHash(exactScope), affected_control_ids: [controlId], evidence_refs: [], source_route: route, remediation
    };
  }

  private finalize(commandId: string, subjectId: string, label: string, prerequisites: OperatorPrerequisite[], now: Date): OperatorReadiness {
    const statuses = prerequisites.map((item) => item.status);
    const operatorLifecycle = prerequisites.some((item) => ['membership', 'agent-passport'].includes(item.kind) && ['expiring', 'expired'].includes(item.status));
    const hasExactScopeRepair = prerequisites.some((item) => ['human-proof', 'authority-credential', 'runtime-session', 'runtime-attestation', 'mandate', 'assignment', 'context-grant'].includes(item.kind) && ['expiring', 'expired'].includes(item.status));
    const hasExternalRequirement = statuses.some((item) => ['authentication-required', 'dependency-missing', 'approval-required'].includes(item));
    const status = statuses.some((item) => ['revoked', 'disconnected-read-only'].includes(item)) ? 'blocked'
      : hasExactScopeRepair && hasExternalRequirement ? 'partial-repair'
      : hasExternalRequirement ? 'external-action-required'
        : operatorLifecycle ? 'operator-action-required'
        : statuses.some((item) => ['expiring', 'expired'].includes(item)) ? 'repairable' : 'ready';
    const generationHash = canonicalHash(prerequisites.map((item) => ({ id: item.canonical_reference_id, status: item.status, expiry: item.expires_at, scope: item.scope_hash })));
    const readinessId = deterministicId('readiness', `${commandId}:${generationHash}`);
    return operatorReadinessSchema.parse({ schema_version: 2, readiness_id: readinessId, subject_id: subjectId, command_id: commandId, command_label: label, status, prerequisites, repair_plan_id: status === 'ready' ? null : deterministicId('repair', `${readinessId}:${generationHash}`), trust_ceiling: 'connected-observed', evaluated_at: now.toISOString(), generation_hash: generationHash });
  }

  private proofHuman(command: OperatorReadiness): string | null {
    const passport = command.prerequisites.find((item) => item.kind === 'agent-passport');
    const proof = command.prerequisites.find((item) => item.kind === 'human-proof');
    return proof?.bound_human_id ?? (passport?.canonical_reference_id ? command.subject_id : null);
  }

  private operationFor(prerequisite: OperatorPrerequisite, command: OperatorReadiness, proofHuman: string | null, purpose: string, previous: RepairOperation[]): RepairOperation | null {
    const kindByPrerequisite: Partial<Record<OperatorPrerequisite['kind'], RepairOperation['kind']>> = {
      'human-proof': 'refresh-human-proof', 'authority-credential': 'replace-authority-credential', 'runtime-session': 'rotate-runtime-session',
      'runtime-attestation': 'replace-runtime-attestation', mandate: 'replace-mandate', assignment: 'rebind-assignment',
      'context-grant': 'renew-context-grant', provider: prerequisite.status === 'authentication-required' ? 'authenticate-provider' : 'install-dependency',
      'federation-peer': 'replace-federation-peer', 'approval-policy': 'obtain-independent-approval', validation: 'obtain-independent-approval', 'control-plane': 'reattach-control-plane'
    };
    const kind = kindByPrerequisite[prerequisite.kind];
    if (!kind) return null;
    const external = ['authenticate-provider', 'install-dependency', 'obtain-independent-approval', 'replace-federation-peer'].includes(kind);
    const blocked = prerequisite.status === 'revoked' || prerequisite.status === 'disconnected-read-only';
    const needsProof = !external && kind !== 'reattach-control-plane';
    const dependencyKinds: RepairOperation['kind'][] = kind === 'replace-authority-credential' ? ['refresh-human-proof']
      : kind === 'rotate-runtime-session' ? ['refresh-human-proof']
        : kind === 'replace-runtime-attestation' ? ['refresh-human-proof', 'rotate-runtime-session']
        : kind === 'replace-mandate' ? ['refresh-human-proof', 'replace-authority-credential']
          : kind === 'rebind-assignment' ? ['replace-mandate'] : kind === 'renew-context-grant' ? ['replace-mandate', 'rebind-assignment'] : [];
    return {
      operation_id: deterministicId('repair_op', `${command.readiness_id}:${kind}:${prerequisite.canonical_reference_id ?? prerequisite.prerequisite_id}`), kind,
      target_reference_id: prerequisite.canonical_reference_id ?? prerequisite.prerequisite_id, replacement_reference_id: null, replacement_for_id: null,
      exact_scope: prerequisite.scope, exact_scope_hash: prerequisite.scope_hash,
      proof_human_id: needsProof ? proofHuman : null, proof_purpose: needsProof ? purpose : null,
      dependency_ids: previous.filter((item) => dependencyKinds.includes(item.kind)).map((item) => item.operation_id),
      status: blocked ? 'blocked' : external ? 'external-action-required' : needsProof ? 'operator-required' : 'eligible',
      reason_code: prerequisite.reason_code, impact: prerequisite.impact, evidence_refs: prerequisite.evidence_refs
    };
  }
}

function canonicalStatus(raw: string, expiresIn: number | null): OperatorPrerequisiteStatus {
  if (raw === 'revoked' || raw === 'cancelled' || raw === 'invalidated') return 'revoked';
  if (raw === 'approval-required' || raw === 'pending') return 'approval-required';
  if (raw === 'inactive') return 'expired';
  if (raw === 'missing' || raw === 'failed' || raw === 'blocked' || raw === 'stopped' || raw === 'suspended' || raw === 'locked') return 'dependency-missing';
  if (raw === 'expired' || raw === 'stale' || (expiresIn !== null && expiresIn < -CLOCK_SKEW_TOLERANCE_SECONDS)) return 'expired';
  if (expiresIn !== null && expiresIn <= EXPIRING_WINDOW_SECONDS) return 'expiring';
  return 'ready';
}

function selectAuthorityCredential(credentials: ControlPlaneCanonicalState['organization']['credentials']): ControlPlaneCanonicalState['organization']['credentials'][number] | undefined {
  const rank = (status: string): number => status === 'active' ? 0 : status === 'expired' ? 1 : status === 'suspended' ? 2 : status === 'revoked' ? 3 : 4;
  return [...credentials].sort((left, right) => {
    const statusDifference = rank(left.status) - rank(right.status);
    if (statusDifference !== 0) return statusDifference;
    return new Date(right.issued_at).getTime() - new Date(left.issued_at).getTime();
  })[0];
}

function remediationFor(kind: OperatorPrerequisite['kind'], status: OperatorPrerequisiteStatus, route: OperatorPrerequisite['source_route']): OperatorPrerequisite['remediation'] {
  const ownerRoute = owningRoute(kind, route);
  if (status === 'ready') return { kind: 'none', label: 'No action required', route: null };
  if (status === 'authentication-required') return { kind: 'external-action', label: 'Authenticate provider', route: 'settings' };
  if (status === 'dependency-missing') return { kind: 'external-action', label: 'Resolve missing dependency', route: ownerRoute };
  if (status === 'approval-required') return { kind: 'operator-action', label: 'Complete independent approval', route: 'authority-inbox' };
  if (status === 'disconnected-read-only') return { kind: 'operator-action', label: 'Reconnect control plane', route: 'settings' };
  if (status === 'revoked') return { kind: 'operator-action', label: kind === 'federation-peer' ? 'Pair a replacement peer' : 'Create an authorized replacement', route: ownerRoute };
  if (kind === 'membership') return { kind: 'operator-action', label: 'Renew organization membership', route: 'people-authority' };
  if (kind === 'agent-passport') return { kind: 'operator-action', label: 'Issue replacement Passport', route: 'command-floor' };
  return { kind: 'automatic-after-proof', label: 'Repair exact scope', route: ownerRoute };
}

function owningRoute(kind: OperatorPrerequisite['kind'], fallback: OperatorPrerequisite['source_route']): OperatorPrerequisite['source_route'] {
  if (['membership', 'authority-credential'].includes(kind)) return 'people-authority';
  if (kind === 'human-proof') return 'human-proof';
  if (['mandate', 'assignment'].includes(kind)) return 'mandates';
  if (kind === 'context-grant') return 'context-broker';
  if (kind === 'federation-peer') return 'federation';
  if (['approval-policy', 'validation'].includes(kind)) return 'authority-inbox';
  if (kind === 'provider' || kind === 'control-plane') return 'settings';
  return fallback;
}

function impactFor(kind: OperatorPrerequisite['kind'], status: OperatorPrerequisiteStatus, seconds: number | null, humanId: string | null): string {
  if (status === 'ready') return `${kind.replaceAll('-', ' ')} is current.`;
  if (status === 'expiring') return `${kind.replaceAll('-', ' ')} expires in ${formatCountdown(seconds ?? 0)}; affected commands will stop.`;
  if (kind === 'human-proof' && status === 'expired' && seconds === null) return `No current Human Proof is available${humanId ? ` for ${humanId}` : ''}; one exact-purpose verification is required.`;
  if (status === 'expired') return `${kind.replaceAll('-', ' ')} expired ${formatCountdown(Math.abs(seconds ?? 0))} ago; affected commands are blocked before launch.`;
  if (status === 'revoked') return `${kind.replaceAll('-', ' ')} is revoked and immutable; a new replacement relationship is required.`;
  if (status === 'approval-required') return 'An eligible independent human must approve this exact effect.';
  if (status === 'authentication-required') return 'Provider login or consent is required and cannot be automated.';
  if (status === 'disconnected-read-only') return 'The canonical host is disconnected; protected commands remain read-only.';
  return `${kind.replaceAll('-', ' ')} is unavailable${humanId ? ` for ${humanId}` : ''}.`;
}

function reasonCode(kind: string, status: string): string { return `${kind}_${status}`.replaceAll('-', '_').toUpperCase(); }
function formatCountdown(seconds: number): string { const value = Math.max(0, seconds); const minutes = Math.floor(value / 60); return minutes > 0 ? `${minutes}m ${value % 60}s` : `${value}s`; }
function secondsBetween(start: string, end: string): number { return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)); }
function scope(partial: Partial<ExactAuthorityScope>): ExactAuthorityScope { return { ...EMPTY_SCOPE, ...partial }; }
function deterministicId(prefix: string, value: string): string { return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`; }
function canonicalHash(value: unknown): `sha256:${string}` { return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`; }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value); }
