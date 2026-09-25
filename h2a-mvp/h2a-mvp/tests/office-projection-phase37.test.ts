import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  officeEntitySchema,
  officeEntityStatusSchema,
  type ControlPlaneCanonicalState,
  type OfficeEntity,
  type OfficeEntityStatus
} from '@h2a/contracts';
import { H2AControlPlaneHost } from '@h2a/control-plane';
import { EvidenceAuditService, LocalAuthorityEventLedger } from '@h2a/evidence';
import { OfficeProjectionService } from '@h2a/office';
import { LocalAppearancePreferencesRepository, LocalWorkplaceRepository } from '@h2a/storage';
import { visualStateForEntity } from '../apps/desktop/renderer/src/office/officeVisualState';
import { phase34CanonicalState } from './fixtures/phase34-state';

const roots: string[] = [];
const now = '2026-08-26T12:00:00.000Z';
const outputHash = `sha256:${'7'.repeat(64)}`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Phase 37 truthful live office projection', () => {
  it('maps every OfficeEntityStatus to a stable visual state without treating idle decoration as work', () => {
    const statuses = officeEntityStatusSchema.options;
    const rendered = new Map<OfficeEntityStatus, ReturnType<typeof visualStateForEntity>>();
    for (const status of statuses) {
      const entity = entityForStatus(status);
      rendered.set(status, visualStateForEntity(entity));
    }
    expect([...rendered.keys()]).toEqual(statuses);
    expect(rendered.get('idle')).toMatchObject({ realWork: false, pulse: false });
    expect(rendered.get('working')).toMatchObject({ realWork: true, pulse: true });
    expect(rendered.get('waiting')).toMatchObject({ realWork: true, target: 'authority' });
    expect(rendered.get('blocked')).toMatchObject({ denial: true, target: 'evidence' });
    expect(rendered.get('succeeded')).toMatchObject({ realWork: true, target: 'evidence' });
  });

  it('requires persisted evidence before success, denial, or failure can animate', () => {
    expect(() => officeEntitySchema.parse({ ...entityForStatus('succeeded'), evidence_refs: [], activity_basis: 'canonical-state' })).toThrow();
    expect(() => officeEntitySchema.parse({ ...entityForStatus('failed'), evidence_refs: [], activity_basis: 'canonical-state' })).toThrow();
    expect(() => officeEntitySchema.parse({ ...entityForStatus('blocked'), evidence_refs: [], activity_basis: 'canonical-state' })).toThrow();
  });

  it('bounds display-only entity labels while retaining the full canonical value', () => {
    const canonical = phase34CanonicalState();
    const longTitle = `Governed storefront ${'with retained signed assignment detail '.repeat(8)}`;
    canonical.collaboration.workplace.assignments[0]!.title = longTitle;
    const office = new OfficeProjectionService().project(canonical, now);
    const projected = office.entities.find((entity) => entity.primary_id === canonical.collaboration.workplace.assignments[0]!.id);
    expect(projected?.label).toHaveLength(180);
    expect(projected?.label.endsWith('...')).toBe(true);
    expect(canonical.collaboration.workplace.assignments[0]!.title).toBe(longTitle);
  });

  it('projects persisted run, cancel, revoke, restart, and provider failure outcomes with exact evidence references', async () => {
    const state = await persistedCanonicalState();
    const office = new OfficeProjectionService().project(state, now);
    const byReason = (reason: string): OfficeEntity | undefined => office.entities.find((entity) => entity.reason_code === reason);

    expect(office.entities.find((entity) => entity.entity_id === 'assignment:wrk_104')).toMatchObject({
      status: 'succeeded', activity: 'persisted-success', activity_basis: 'persisted-evidence', output_hash: outputHash, trace_id: 'tr_success'
    });
    expect(office.entities.find((entity) => entity.entity_id === 'assignment:wrk_unproved')).toMatchObject({
      status: 'warning', activity: 'decorative-idle', output_hash: null, evidence_refs: []
    });
    expect(byReason('OPERATOR_CANCELLED')).toMatchObject({ status: 'blocked', activity: 'persisted-denial' });
    expect(byReason('RUNTIME_AUTHORITY_REVOKED')).toMatchObject({ status: 'revoked', activity: 'persisted-denial' });
    expect(byReason('HOST_PROCESS_RESTARTED')).toMatchObject({ status: 'failed', activity: 'persisted-failure' });
    expect(byReason('PROVIDER_FAILURE')).toMatchObject({ status: 'failed', activity: 'persisted-failure' });
    expect(office.alerts).toMatchObject({ total: 4, blocking: 4 });
    for (const alert of office.entities.filter((entity) => entity.kind === 'alert')) {
      expect(alert.evidence_refs).toHaveLength(1);
      expect(state.evidence.events.some((record) => record.event.event_id === alert.evidence_refs[0])).toBe(true);
    }
  });

  it('keeps Control and Office on identical canonical IDs, hashes, and reason codes across refresh and restart', async () => {
    const root = await temporaryRoot();
    let state = await persistedCanonicalState(root);
    const host = new H2AControlPlaneHost({ load: async () => state }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'phase37_host' });
    await host.initialize();
    const attachment = host.attach({ client_id: 'phase37_renderer', protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, requested_capabilities: ['workspace.observe', 'workspace.refresh', 'appearance.read', 'appearance.write'] });
    const request = { host_instance_id: attachment.host_instance_id, lease_id: attachment.lease_id, client_id: attachment.client_id, generation: attachment.connection.generation };
    const snapshot = await host.getSnapshot(request);
    assertParity(snapshot.canonical, snapshot.office.entities);

    state = { ...state, collaboration: { ...state.collaboration, workplace: { ...state.collaboration.workplace, generatedAt: '2026-08-26T12:01:00.000Z' } } };
    await host.refresh('collaboration');
    assertParity((await host.getSnapshot(request)).canonical, (await host.getSnapshot(request)).office.entities);

    const restarted = new H2AControlPlaneHost({ load: async () => state }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'phase37_restart' });
    await restarted.initialize();
    const next = restarted.attach({ client_id: 'phase37_after_restart', protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, requested_capabilities: ['workspace.observe'] });
    const recovered = await restarted.getSnapshot({ host_instance_id: next.host_instance_id, lease_id: next.lease_id, client_id: next.client_id, generation: next.connection.generation });
    assertParity(recovered.canonical, recovered.office.entities);
  });
});

function assertParity(canonical: ControlPlaneCanonicalState, entities: OfficeEntity[]): void {
  const trace = canonical.enterprise.traces.find((item) => item.trace_id === 'tr_success');
  const officeTrace = entities.find((item) => item.entity_id === 'trace:tr_success');
  expect(officeTrace).toMatchObject({ primary_id: trace?.trace_id, output_hash: trace?.references.output_hashes.at(-1), trace_id: trace?.trace_id });
  for (const entity of entities.filter((item) => item.reason_code && item.activity_basis === 'persisted-evidence')) {
    expect(canonical.evidence.events.some((record) => entity.evidence_refs.includes(record.event.event_id))).toBe(true);
  }
}

function entityForStatus(status: OfficeEntityStatus): OfficeEntity {
  const persisted = ['succeeded', 'blocked', 'failed', 'revoked'].includes(status);
  const activity = status === 'succeeded' ? 'persisted-success' : status === 'failed' ? 'persisted-failure' : status === 'blocked' || status === 'revoked' ? 'persisted-denial' : status === 'working' ? 'canonical-work' : status === 'waiting' || status === 'queued' ? 'canonical-wait' : status === 'offline' ? 'inactive' : 'decorative-idle';
  return officeEntitySchema.parse({
    entity_id: `alert:${status}`, kind: 'alert', primary_id: status, label: status, detail: `${status} test entity`, status,
    activity, activity_basis: persisted ? 'persisted-evidence' : activity.startsWith('canonical-') ? 'canonical-state' : 'decorative',
    source_domain: 'phase37-test', related_ids: [], authority_chain: [], context_fields: [], withheld_context_fields: [], predecessor_hashes: [], provider_health: null,
    output_hash: status === 'succeeded' ? outputHash : null, reason_code: persisted ? `${status.toUpperCase()}_TEST` : null,
    evidence_refs: persisted ? [`evt_${status}`] : [], trace_id: 'tr_status_matrix', selectable_agent_id: null, updated_at: now
  });
}

async function persistedCanonicalState(existingRoot?: string): Promise<ControlPlaneCanonicalState> {
  const root = existingRoot ?? await temporaryRoot();
  const ledger = new LocalAuthorityEventLedger(root, 'traces/tr_platform.jsonl', () => new Date(now));
  const events = [
    ['ACTION_EXECUTED', 'wrk_104', { output_hash: outputHash }],
    ['LIVE_RUNTIME_CANCELLED', 'run_cancel', { termination_reason: 'OPERATOR_CANCELLED' }],
    ['LIVE_RUNTIME_REVOKED', 'run_revoke', { termination_reason: 'RUNTIME_AUTHORITY_REVOKED' }],
    ['LIVE_RUNTIME_FAILED', 'run_restart', { termination_reason: 'HOST_PROCESS_RESTARTED' }],
    ['LIVE_RUNTIME_FAILED', 'run_provider_failure', { termination_reason: 'PROVIDER_FAILURE' }]
  ] as const;
  for (const [event_type, subjectId, payload] of events) {
    await ledger.append({ trace_id: event_type === 'ACTION_EXECUTED' ? 'tr_success' : `tr_${subjectId}`, actor: { type: 'system', id: 'h2a-runtime' }, subject: { type: event_type === 'ACTION_EXECUTED' ? 'assignment' : 'live_runtime_run', id: subjectId }, event_type, payload });
  }
  const workplace = new LocalWorkplaceRepository(root);
  await Promise.all([workplace.replaceAgents([]), workplace.replaceAssignments([]), workplace.replaceRecentEvents([])]);
  const evidence = await new EvidenceAuditService(root, ledger, workplace, () => new Date(now)).initialize();
  const base = phase34CanonicalState();
  const assignments = [...base.collaboration.workplace.assignments.map((assignment) => assignment.id === 'wrk_104' ? { ...assignment, traceId: 'tr_success' } : assignment), {
    id: 'wrk_unproved', title: 'Unproved completion', objective: 'Completed state without a durable output must remain visibly unproved.', status: 'complete' as const,
    assigneeId: 'runtime-isha', mandateId: 'mnd_research', risk: 'standard' as const, priority: 3, dependsOn: [], updatedAt: now, responseCount: 0, messageCount: 0
  }];
  return {
    ...base,
    collaboration: { ...base.collaboration, workplace: { ...base.collaboration.workplace, assignments } },
    evidence,
    enterprise: {
      ...base.enterprise,
      posture: { ...base.enterprise.posture, evidence_records: evidence.totalEvents, trust_modes: { ...base.enterprise.posture.trust_modes, 'connected-observed': 1 } },
      traces: [{
        trace_id: 'tr_success', started_at: now, updated_at: now, event_count: 1, actor_ids: ['h2a-runtime'], subject_ids: ['wrk_104'], event_types: ['ACTION_EXECUTED'],
        references: { human_ids: [], membership_ids: [], authority_credential_ids: [], human_proof_ids: [], passport_ids: [], runtime_ids: ['runtime-maya'], mandate_ids: ['mnd_supplier_review'], context_grant_ids: [], approval_ids: [], connector_ids: [], federation_node_ids: [], live_run_ids: [], output_hashes: [outputHash] },
        resolution_status: 'complete', missing_links: [], integrity_status: 'verified'
      }]
    }
  };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase37-'));
  roots.push(root);
  return root;
}
