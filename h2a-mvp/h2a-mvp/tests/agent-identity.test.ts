import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { activeBiometricModelSet, demoWorkplaceSnapshot, type HumanProofState, type WorkplaceSnapshot } from '@h2a/contracts';
import { LocalProviderSecretStore, providerCatalogue, type ProviderSecretProtector } from '@h2a/agents';
import type { BchFuzzyExtractorPort, BchRegistrationResult } from '@h2a/biometrics';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { AgentIdentityService, HumanProofService, type HumanProofStatePort } from '@h2a/identity';
import type { WorkplaceRepository } from '@h2a/storage';

const temporaryDirectories: string[] = [];
const clock = () => new Date('2026-08-20T12:00:00.000Z');
const protector: ProviderSecretProtector = {
  encrypt: async (value) => `encrypted:${Buffer.from(value).toString('base64')}`,
  decrypt: async (value) => Buffer.from(value.replace('encrypted:', ''), 'base64').toString()
};

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 5 provider catalogue', () => {
  it('contains every approved provider lane', () => {
    expect(new Set(providerCatalogue.map((provider) => provider.id))).toEqual(new Set([
      'scripted', 'openai-codex', 'claude-code', 'gemini-antigravity', 'grok-cli', 'kimi-code',
      'qwen-cli', 'opencode', 'crush-cli', 'pi-cli', 'copilot-cli', 'bedrock', 'custom-cli'
    ]));
  });
});

describe('Agent Identity service', () => {
  it('fails closed when Agent Passport issuance has no current Human Proof', async () => {
    const fixture = await createFixture(false);
    await expect(fixture.service.createAgent(agentRequest())).rejects.toThrow('current Human Proof');
    expect(fixture.workplace.snapshot.agents).toHaveLength(4);
  });

  it('issues a signed passport and independent runtime binding without disclosing provider credentials', async () => {
    const fixture = await createFixture(true);
    const state = await fixture.service.createAgent(agentRequest());
    const passport = state.passports[0];
    const binding = state.bindings[0];

    expect(passport.passport_signature).toMatch(/^ed25519:/);
    expect(passport.owner_human_proof_id).toBe('hp_current');
    expect(passport.workload_public_key).toContain('BEGIN PUBLIC KEY');
    expect(binding.agent_id).toBe(passport.agent_id);
    expect(binding.provider).toBe('openai-codex');
    expect(state.credentials).toEqual([expect.objectContaining({ provider: 'openai-codex', credential_mask: '****7890' })]);
    expect(fixture.workplace.snapshot.agents.at(-1)).toMatchObject({ passportId: passport.passport_id, mandateId: 'mnd_unassigned', status: 'ready' });

    const secretFile = await readFile(join(fixture.root, 'settings', 'provider-secrets.json'), 'utf8');
    const passportFile = await readFile(join(fixture.root, 'passports', 'registry.json'), 'utf8');
    const events = await fixture.ledger.list();
    expect(secretFile).not.toContain('sk-phase5-1234567890');
    expect(passportFile).not.toContain('sk-phase5-1234567890');
    expect(events.map((event) => event.event_type)).toEqual(['AGENT_BOUND', 'AGENT_RUNTIME_BOUND']);
  });

  it('keeps passport and runtime lifecycle state independent', async () => {
    const fixture = await createFixture(true);
    let state = await fixture.service.createAgent(agentRequest());
    const passportId = state.passports[0].passport_id;
    const bindingId = state.bindings[0].binding_id;

    state = await fixture.service.updateRuntime({ bindingId, action: 'disconnect' });
    expect(state.passports[0].status).toBe('active');
    expect(state.bindings[0].connection_state).toBe('disconnected');

    state = await fixture.service.updatePassport({ passportId, action: 'suspend' });
    expect(state.passports[0].status).toBe('suspended');
    expect(state.bindings[0].connection_state).toBe('disconnected');
    await expect(fixture.service.updateRuntime({ bindingId, action: 'reconnect' })).rejects.toThrow('Passport is inactive');

    state = await fixture.service.updatePassport({ passportId, action: 'reactivate' });
    state = await fixture.service.updateRuntime({ bindingId, action: 'reconnect' });
    expect(state.passports[0].status).toBe('active');
    expect(state.bindings[0].connection_state).toBe('connected');

    state = await fixture.service.updatePassport({ passportId, action: 'revoke' });
    expect(state.passports[0].status).toBe('revoked');
    expect(state.bindings[0].connection_state).toBe('connected');
    expect(fixture.workplace.snapshot.agents.at(-1)?.status).toBe('offline');
  });
});

function agentRequest() {
  return {
    name: 'Vera', role: 'Compliance Analyst', provider: 'openai-codex' as const, model: 'gpt-5-codex',
    workspace: 'C:\\H2A\\workspace', capabilities: ['research.public', 'evidence.read'], credential: 'sk-phase5-1234567890'
  };
}

async function createFixture(hasProof: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-agent-'));
  temporaryDirectories.push(root);
  const ledger = new LocalAuthorityEventLedger(root, 'traces/agent-test.jsonl', clock);
  const signingInitializer = new HumanProofService(root, ledger, new NoopBch(), clock);
  await signingInitializer.initialize();
  const workplace = new MemoryWorkplace();
  const secrets = new LocalProviderSecretStore(root, protector, clock);
  const service = new AgentIdentityService(root, ledger, new FixedHumanProof(hasProof), workplace, secrets, clock);
  await service.initialize();
  return { root, ledger, workplace, service };
}

class FixedHumanProof implements HumanProofStatePort {
  public constructor(private readonly active: boolean) {}
  public async getState(): Promise<HumanProofState> {
    return {
      identity: { human_id: 'human_primary', display_name: 'Demo Principal', status: 'active', enrolled_at: '2026-08-20T10:00:00.000Z' },
      enrollment: null, recentAttempts: [], failedAttempts: 0, lockedUntil: null, modelSet: activeBiometricModelSet,
      activeProof: this.active ? { human_proof_id: 'hp_current', subject_id: 'human_primary', provider: 'local-face-bch', verification_methods: ['face', 'liveness'], assurance_level: 'high', verified_at: '2026-08-20T11:59:00.000Z', expires_at: '2026-08-20T12:05:00.000Z', provider_attestation_hash: `sha256:${'a'.repeat(64)}`, h2a_signature: 'ed25519:test' } : null
    };
  }
}

class NoopBch implements BchFuzzyExtractorPort {
  public async register(): Promise<BchRegistrationResult> { return { salt: 'a'.repeat(64), records: [] }; }
  public async verify() { return []; }
}

class MemoryWorkplace implements WorkplaceRepository {
  public snapshot: WorkplaceSnapshot = structuredClone(demoWorkplaceSnapshot);
  public async getSnapshot() { return structuredClone(this.snapshot); }
  public async replaceAgents(agents: WorkplaceSnapshot['agents']) { this.snapshot.agents = structuredClone(agents); }
  public async replaceAssignments(assignments: WorkplaceSnapshot['assignments']) { this.snapshot.assignments = structuredClone(assignments); }
  public async replaceRecentEvents(events: WorkplaceSnapshot['events']) { this.snapshot.events = structuredClone(events); }
}
