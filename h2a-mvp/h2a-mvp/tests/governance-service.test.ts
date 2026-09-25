import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { createCensusProvider, GovernanceService } from '../apps/governance/service';
import { createGovernanceServer } from '../apps/governance/server';
import type { CensusEntity, DiscoveryScan } from '../apps/governance/contracts';

const roots: string[] = [];
afterEach(async () => { for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
// Test-only Census contract fixtures. Production discovery has no fixture fallback.
const observedAt = '2026-09-24T10:00:00.000Z';
const entity: CensusEntity = {
  agent_id: 'AGT-MARKETING', name: 'Marketing Research Agent', framework: 'CrewAI', model: 'source-model', provider: 'source-provider',
  endpoint: 'https://census-observed.example/agent', protocols: ['a2a'], tools: ['inventory_report'],
  capabilities: [{ name: 'research', basis: 'observed', confidence: 0.8, evidence: [{ source: 'runtime', value: 'tool-call' }] }],
  fingerprint: { identity: 'fingerprint-source-value', model_extension: { unknown_field: 'preserved' } },
  classification: { is_agent: true, classification: 'confirmed_agent', confidence: 0.9, entity_type: 'AI agent', reasons: ['Source evidence'], evidence: [{ source: 'a2a', value: 'agent-card' }] },
  registered: false, shadow: true, discovery_sources: ['a2a', 'runtime'], first_seen: observedAt, last_seen: observedAt,
  activity_status: 'active', evidence_age_seconds: 0, confidence: 0.9,
  evidence: [{ source: 'a2a', value: { nested: ['complete', 'evidence'] } }], identity_decisions: [{ merged: false, conflicts: [] }], unknown_source_field: { keep: true },
  discovery_history: [{ id: 1, timestamp: observedAt, action: 'DISCOVERED', actor: 'a2a', subject: 'AGT-MARKETING', correlation_id: 'SOURCE-SCAN', details: { shadow: true, is_agent: true } }]
};
const scanResult = (): DiscoveryScan => ({
  scan_id: 'SCAN-TEST', started_at: observedAt, completed_at: observedAt, correlation_id: 'TEST-CORRELATION',
  agents: [structuredClone(entity)], errors: [], discovery_sources: ['a2a', 'runtime'], observed_agent_ids: [entity.agent_id], configured_source_count: 2
});
async function ungovernedFixture(result = scanResult()) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-governance-service-')); roots.push(root);
  const provider = { configured: true, endpoint: 'test://agent-census', scan: vi.fn(async () => structuredClone(result)) };
  const service = new GovernanceService(root, provider); await service.initialize();
  return { root, provider, service };
}
async function fixture() {
  const { root, provider, service } = await ungovernedFixture();
  const scan = await service.discoverAgents();
  const imported = await service.importAgent(entity.agent_id, scan.scan_id);
  const agentId = imported.agents[0].agent_id;
  await service.bind(agentId, 'HUM-LOCAL-OPERATOR'); await service.issuePassport(agentId); await service.assignMandate(agentId);
  const state = await service.createRoom(agentId);
  return { root, provider, service, agentId, roomId: state.rooms[0].room_id };
}

describe('Integrated governance native service boundary', () => {
  it('keeps scans separate from the registry and preserves all Census fields including stale and non-agent entities', async () => {
    const source = scanResult();
    source.agents.push({ ...structuredClone(entity), agent_id: 'SERVICE-TEST', name: 'Ordinary API', shadow: false, activity_status: 'stale', evidence_age_seconds: 9000,
      classification: { ...entity.classification, is_agent: false, classification: 'confirmed_non_agent' } });
    source.errors.push({ source: 'mcp', code: 'connection_failed', message: 'MCP source unavailable' });
    const { service, provider } = await ungovernedFixture(source);
    expect((await service.getState()).agents).toEqual([]);
    const scan = await service.discoverAgents();
    expect(provider.scan).toHaveBeenCalledOnce();
    expect(scan).toEqual(source);
    expect(scan.agents[1].activity_status).toBe('stale');
    expect(scan.errors[0].source).toBe('mcp');
    expect((await service.getState()).agents).toEqual([]);
    expect((await service.getState()).events).toEqual([]);
    await expect(service.importAgent('SERVICE-TEST', scan.scan_id)).rejects.toThrow('neither a behavior-classified agent');
    await expect(service.importAgent('AGT-UNKNOWN', scan.scan_id)).rejects.toThrow('not present');
    await expect(service.importAgent(entity.agent_id, 'SCAN-MISSING')).rejects.toThrow('Run a new scan');
    await expect(service.bind(entity.agent_id, 'HUM-LOCAL-OPERATOR')).rejects.toThrow('not registered');
    await expect(service.issuePassport(entity.agent_id)).rejects.toThrow('not registered');
  });

  it('imports explicitly, freezes complete evidence, maps one canonical identity and remains idempotent across concurrency and restart', async () => {
    const { service, provider, root } = await ungovernedFixture();
    const scan = await service.discoverAgents();
    // Browser-returned data is not an import authority and cannot modify the server's scan cache.
    scan.agents[0].fingerprint = { identity: 'browser-tamper' };
    const [first, replay] = await Promise.all([service.importAgent(entity.agent_id, scan.scan_id), service.importAgent(entity.agent_id, scan.scan_id)]);
    const imported = first.agents[0];
    expect(imported.agent_id).toMatch(/^H2A-AGENT-/u);
    expect(imported.agent_id).not.toBe(entity.agent_id);
    expect(imported).toMatchObject({ census_agent_id: entity.agent_id, governance_status: 'Registered', discovery_snapshot: entity, evidence: entity.evidence });
    expect(replay.agents).toHaveLength(1);
    expect(replay.events.filter(event => event.event_type === 'AGENT_REGISTERED_IN_H2A')).toHaveLength(1);
    expect(replay.events[0].metadata).toMatchObject({ census_agent_id: entity.agent_id, source_shadow: true, scan_id: scan.scan_id });
    await service.bind(imported.agent_id, 'HUM-LOCAL-OPERATOR'); await service.issuePassport(imported.agent_id);
    const changed = scanResult(); changed.scan_id = 'SCAN-LATER'; changed.agents[0].activity_status = 'stale'; changed.agents[0].evidence_age_seconds = 600;
    provider.scan.mockResolvedValueOnce(changed);
    expect((await service.discoverAgents()).agents[0].activity_status).toBe('stale');
    const after = await service.getState();
    expect(after.agents[0]).toMatchObject({ agent_id: imported.agent_id, governance_status: 'Managed', discovery_snapshot: entity });
    expect(after.agents[0].discovery_snapshot?.shadow).toBe(true);
    const restarted = new GovernanceService(root, provider); await restarted.initialize();
    const persisted = await restarted.importAgent(entity.agent_id);
    expect(persisted.agents).toHaveLength(1);
    expect(persisted.agents[0]).toEqual(after.agents[0]);
  });

  it('returns an unavailable error without fake results, registry mutation or leaked upstream details', async () => {
    const { service, provider } = await ungovernedFixture();
    provider.scan.mockRejectedValueOnce(new Error('upstream-secret-token'));
    await expect(service.discoverAgents()).rejects.toMatchObject({ message: 'Agent Discovery service unavailable', status: 503 });
    expect((await service.getState()).agents).toEqual([]);
    const server = createGovernanceServer(service);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing port');
      provider.scan.mockRejectedValueOnce(new Error('upstream-secret-token'));
      const response = await fetch(`http://127.0.0.1:${address.port}/api/discovery/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'Agent Discovery service unavailable' });
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });

  it('calls only the native Census scan API with backend authorization and retains partial source errors', async () => {
    const seen: Array<{ path: string; method: string; authorization?: string }> = [];
    const result = scanResult(); result.errors.push({ source: 'github', code: 'unavailable', message: 'Repository source unavailable' });
    const upstream = createServer((request, response) => {
      seen.push({ path: request.url ?? '', method: request.method ?? '', authorization: request.headers.authorization });
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    try {
      const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('Missing port');
      const provider = createCensusProvider(`http://127.0.0.1:${address.port}`, 'server-only-token');
      expect(await provider.scan()).toEqual(result);
      expect(seen).toEqual([{ path: '/agents/scan', method: 'POST', authorization: 'Bearer server-only-token' }]);
      await expect(createCensusProvider('http://remote.example', 'server-only-token').scan()).rejects.toThrow('unavailable');
      await expect(createCensusProvider('https://user:password@remote.example', 'server-only-token').scan()).rejects.toThrow('unavailable');
      await expect(createCensusProvider('invalid configuration', 'server-only-token').scan()).rejects.toMatchObject({ message: 'Agent Discovery service unavailable', status: 503 });
      await expect(createCensusProvider(`http://127.0.0.1:${address.port}`, '').scan()).rejects.toThrow('unavailable');
      expect(seen).toHaveLength(1);
    } finally { await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve())); }
  });

  it('migrates old registry identities additively without rewriting passport signatures or source evidence', async () => {
    const { service, root, provider, agentId } = await fixture();
    const before = await service.getState();
    const path = join(root, 'byosync/state.json');
    const stored = JSON.parse(await readFile(path, 'utf8'));
    delete stored.data.agents[0].census_agent_id;
    delete stored.data.agents[0].discovery_snapshot;
    await writeFile(path, JSON.stringify(stored));
    const restarted = new GovernanceService(root, provider); await restarted.initialize();
    const after = await restarted.getState();
    expect(after.agents[0]).toMatchObject({ agent_id: agentId, census_agent_id: agentId, legacy_identity: true, governance_status: 'Managed' });
    expect(after.agents[0].evidence).toEqual(before.agents[0].evidence);
    expect(after.passports).toEqual(before.passports);
    expect(after.events).toEqual(before.events);
  });

  it('executes allowed actions once, persists pending approvals, rejects without executing and recovers across restart', async () => {
    const { agentId, root, provider, service, roomId } = await fixture();
    const state = await service.requestAction(roomId, agentId, 'inventory_report', 'once');
    expect(state.actions[0]).toMatchObject({ status: 'executed', execution_count: 1, result: { details: { registered_agents: 1 } } });
    const replay = await service.requestAction(roomId, agentId, 'inventory_report', 'once');
    expect(replay.actions).toHaveLength(1);
    const pending = await service.requestAction(roomId, agentId, 'evidence_export');
    const request = pending.approvals[0];
    expect(pending.actions[1]).toMatchObject({ status: 'pending', execution_count: 0 });
    const restarted = new GovernanceService(root, provider); await restarted.initialize();
    const rejected = await restarted.decideApproval(request.approval_id, 'reject');
    expect(rejected.actions[1]).toMatchObject({ status: 'rejected', execution_count: 0 });
    expect(rejected.approvals[0]).toMatchObject({ status: 'rejected', reviewed_by: 'HUM-LOCAL-OPERATOR' });
    expect(rejected.integrity.status).toBe('verified');
    const next = await restarted.requestAction(roomId, agentId, 'evidence_export');
    const approval = next.approvals.find(item => item.status === 'pending')!;
    const approved = await restarted.decideApproval(approval.approval_id, 'approve');
    const twice = await restarted.decideApproval(approval.approval_id, 'approve');
    expect(approved.actions[2]).toMatchObject({ status: 'executed', execution_count: 1 });
    expect(twice.events.filter(event => event.event_type === 'ACTION_EXECUTED' && event.approval_id === approval.approval_id)).toHaveLength(1);
  });

  it('does not execute an approved action after native mandate revocation', async () => {
    const { agentId, service, roomId } = await fixture();
    const pending = await service.requestAction(roomId, agentId, 'evidence_export');
    await service.policy.updateLifecycle({ mandateId: pending.approvals[0].mandate_id, action: 'revoke' });
    await expect(service.decideApproval(pending.approvals[0].approval_id, 'approve')).rejects.toThrow();
    const after = await service.getState();
    expect(after.actions[0].execution_count).toBe(0);
    expect(after.approvals[0].status).toBe('invalidated');
  });

  it('fails closed if a persisted passport signature is tampered before human approval', async () => {
    const { agentId, root, service, roomId } = await fixture();
    const pending = await service.requestAction(roomId, agentId, 'evidence_export');
    const path = join(root, 'passports/registry.json');
    const registry = JSON.parse(await readFile(path, 'utf8'));
    registry.data[0].role = 'Tampered role'; await writeFile(path, JSON.stringify(registry));
    await expect(service.decideApproval(pending.approvals[0].approval_id, 'approve')).rejects.toThrow('Passport signature');
    const after = await service.getState();
    expect(after.actions[0].execution_count).toBe(0);
    expect(after.agents.find(agent => agent.agent_id === agentId)?.governance_status).toBe('Owned');
    expect(after.assurance.findings.some(f=>f.finding_id===`FIND-PASSPORT-INVALID-${agentId}`)).toBe(true);
  });

  it('projects mandate expiry and surfaces expiration independently of its persisted status', async () => {
    const { agentId, root, service, provider } = await fixture();
    const before = await service.getState();
    expect(before.agents[0].mandate?.expires_at).toBeTruthy();
    const later = () => new Date(Date.now() + 31 * 86400000);
    const restarted = new GovernanceService(root, provider, later); await restarted.initialize();
    const after = await restarted.getState();
    expect(after.agents[0].passport?.status).toBe('active');
    expect(after.assurance.findings.some(f=>f.finding_id===`FIND-MANDATE-EXPIRED-${agentId}`)).toBe(true);
  });

  it('keeps the app inspectable and denies resumed execution if authority expired while stopped', async () => {
    const { agentId, root, service, provider, roomId } = await fixture();
    const pending = await service.requestAction(roomId, agentId, 'evidence_export');
    // Durable native approval exists, but simulate stopping before the orchestration executes.
    await service.policy.resolveApproval({ approvalRequestId: pending.approvals[0].approval_id, action: 'approve' });
    const later = () => new Date(Date.now() + 366 * 86400000);
    const restarted = new GovernanceService(root, provider, later); await restarted.initialize();
    const state = await restarted.getState();
    expect(state.actions[0]).toMatchObject({ status: 'denied', execution_count: 0, reason: 'AUTHORITY_UNAVAILABLE_ON_RESTART' });
    expect(state.integrity.status).toBe('verified');
    expect(state.events.at(-1)).toMatchObject({ event_type: 'POLICY_DENIED', metadata: { stage: 'restart-recovery' } });
  });

  it('requires researched evidence, preserves creator identity, and publishes only human-reviewed memory', async () => {
    const { agentId, service, roomId, root, provider } = await fixture();
    await expect(service.proposeMemory(roomId, agentId)).rejects.toThrow('Execute a governed action');
    await service.requestAction(roomId, agentId, 'inventory_report');
    const proposed = await service.proposeMemory(roomId, agentId);
    const memory = proposed.memories[0];
    expect(memory.status).toBe('proposed'); expect(memory.reviewed_by).toBeUndefined();
    const published = await service.reviewMemory(memory.memory_id, 'approve', 'Human corrected pricing interpretation.');
    expect(published.memories[0]).toMatchObject({ status: 'published', created_by_agent: agentId, reviewed_by: 'HUM-LOCAL-OPERATOR', content: 'Human corrected pricing interpretation.', sources: expect.any(Array) });
    expect(published.memories[0].content_hash).not.toBe(memory.content_hash);
    const restarted = new GovernanceService(root, provider); await restarted.initialize();
    expect((await restarted.getState()).memories).toEqual(published.memories);
    const trace = await restarted.trace(agentId);
    expect(trace.map(event => event.event_type)).toEqual(expect.arrayContaining(['AGENT_REGISTERED_IN_H2A', 'HUMAN_BOUND', 'PASSPORT_ISSUED', 'MANDATE_CREATED', 'ROOM_JOINED', 'ACTION_EXECUTED', 'MEMORY_PROPOSED', 'MEMORY_REVIEWED', 'MEMORY_PUBLISHED']));
    expect(trace.every(event => event.agent_id === agentId)).toBe(true);
  });

  it('recovers an interrupted execution audit append from the signed durable receipt without re-execution', async () => {
    const { agentId, service, root, provider, roomId } = await fixture();
    const append = service.ledger.append.bind(service.ledger);
    vi.spyOn(service.ledger, 'append').mockImplementation(event => {
      if (event.event_type === 'ACTION_EXECUTED') return Promise.reject(new Error('Simulated stop before execution audit append'));
      return append(event);
    });
    await expect(service.requestAction(roomId, agentId, 'inventory_report', 'interrupted-execution')).rejects.toThrow('Simulated stop');
    expect((await service.getState()).actions[0].execution_count).toBe(1);
    const restarted = new GovernanceService(root, provider); await restarted.initialize();
    const state = await restarted.getState();
    expect(state.actions[0].execution_count).toBe(1);
    expect(state.events.filter(event => event.event_type === 'ACTION_EXECUTED')).toEqual([expect.objectContaining({ room_id: roomId, metadata: expect.objectContaining({ recovered: true, execution_count: 1 }) })]);
    expect(state.integrity.status).toBe('verified');
  });

  it('correlates native request, policy, approval and execution receipts to their persisted room', async () => {
    const { agentId, service, roomId } = await fixture();
    const pending = await service.requestAction(roomId, agentId, 'evidence_export');
    const approvalId = pending.approvals[0].approval_id;
    await service.decideApproval(approvalId, 'approve');
    const trace = await service.trace(agentId);
    for (const eventType of ['ACTION_REQUESTED', 'HUMAN_APPROVAL_REQUIRED', 'HUMAN_APPROVED', 'ACTION_EXECUTED']) {
      const event = trace.find(item => item.event_type === eventType)!;
      expect(event).toMatchObject({ agent_id: agentId, room_id: roomId, mandate_id: pending.approvals[0].mandate_id, passport_id: pending.approvals[0].passport_id });
      if (eventType !== 'ACTION_REQUESTED') expect(event.approval_id).toBe(approvalId);
    }
  });

  it('rejects caller-supplied actors and cross-origin mutation at the actual HTTP boundary', async () => {
    const { agentId, service } = await fixture();
    const server = createGovernanceServer(service);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing server port');
      const url = `http://127.0.0.1:${address.port}/api/agents/${agentId}/bind`;
      const before = (await service.getState()).events.length;
      const spoof = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ human_id: 'HUM-LOCAL-OPERATOR', actor_id: 'HUM-ATTACKER' }) });
      expect(spoof.status).toBe(400);
      const crossOrigin = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify({ human_id: 'HUM-LOCAL-OPERATOR' }) });
      expect(crossOrigin.status).toBe(403);
      expect((await service.getState()).events).toHaveLength(before);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
