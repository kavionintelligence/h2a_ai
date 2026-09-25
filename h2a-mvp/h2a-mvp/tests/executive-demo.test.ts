import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activeBiometricModelSet,
  defaultEvidenceQuery,
  type CaptureAssessment,
  type CreateAgentRequest
} from '@h2a/contracts';
import {
  AgentCollaborationService,
  LocalProviderSecretStore,
  ScriptedScenarioService,
  type ProviderSecretProtector
} from '@h2a/agents';
import type { BchFuzzyExtractorPort, BchRegistrationResult } from '@h2a/biometrics';
import { EvidenceAuditService, LocalAuthorityEventLedger } from '@h2a/evidence';
import { AgentIdentityService, HumanProofService } from '@h2a/identity';
import { MandateService } from '@h2a/mandates';
import { LocalWorkplaceRepository } from '@h2a/storage';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const now = new Date('2026-08-20T14:00:00.000Z');
const clock = () => now;
const sample = Array.from({ length: 4096 }, (_, index) => index % 3 === 0 ? 1 as const : 0 as const);
const assessment: CaptureAssessment = {
  qualityScore: 0.94,
  brightnessScore: 0.9,
  sharpnessScore: 0.92,
  distanceCm: 54,
  livenessScore: 0.97,
  faceCount: 1,
  capturedAt: now.toISOString()
};
const protector: ProviderSecretProtector = {
  encrypt: async (value) => `protected:${Buffer.from(value).toString('base64')}`,
  decrypt: async (value) => Buffer.from(value.replace('protected:', ''), 'base64').toString()
};

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 10 clean executive demonstration', () => {
  it('runs the complete human-to-agent security narrative through persisted services', async () => {
    const root = await temporaryRoot('h2a-executive-');
    const ledger = new LocalAuthorityEventLedger(root, 'traces/executive.jsonl', clock);
    const workplace = new LocalWorkplaceRepository(root, clock);
    await Promise.all([workplace.replaceAgents([]), workplace.replaceAssignments([]), workplace.replaceRecentEvents([])]);

    const humanProof = new HumanProofService(root, ledger, new DeterministicBch(), clock);
    await humanProof.initialize();
    await humanProof.enroll({ subjectId: 'human_primary', displayName: 'HP Demo Principal', assessment, modelSet: activeBiometricModelSet, samples: [sample, sample, sample] });
    const proofState = await humanProof.verify({ subjectId: 'human_primary', purpose: 'Authorize the executive demonstration', assessment, modelSet: activeBiometricModelSet, sample });
    expect(proofState.activeProof).toMatchObject({ assurance_level: 'high', provider: 'local-face-bch' });

    const secrets = new LocalProviderSecretStore(root, protector, clock);
    const identities = new AgentIdentityService(root, ledger, humanProof, workplace, secrets, clock);
    await identities.initialize();
    const teamRequests: CreateAgentRequest[] = [
      agent('Maya', 'Program Coordinator', 'scripted', 'coordinator-v0', ['records.read', 'report.consolidate', 'record.export']),
      agent('Aria', 'Policy Analyst', 'openai-codex', 'gpt-5-codex', ['records.read']),
      agent('Noah', 'Security Reviewer', 'claude-code', 'claude-sonnet-4-5', ['records.read', 'record.export']),
      agent('Isha', 'Research Specialist', 'gemini-antigravity', 'gemini-3.1-pro-high', ['records.read'])
    ];
    for (const request of teamRequests) await identities.createAgent(request);
    const identityState = await identities.getState();
    expect(new Set(identityState.bindings.map((binding) => binding.provider))).toEqual(new Set(['scripted', 'openai-codex', 'claude-code', 'gemini-antigravity']));
    expect(identityState.passports.every((passport) => passport.passport_signature.startsWith('ed25519:'))).toBe(true);

    const collaboration = new AgentCollaborationService(root, ledger, workplace, clock);
    const mandates = new MandateService(root, ledger, humanProof, workplace, clock);
    await Promise.all([collaboration.initialize(), mandates.initialize()]);
    const ids = Object.fromEntries(identityState.passports.map((passport) => [passport.name, passport.agent_id]));
    let authority = await mandates.create(rootMandate(ids.Maya, [ids.Aria, ids.Noah, ids.Isha]));
    const rootMandateId = authority.mandates[0].mandateId;
    authority = await mandates.delegate(childMandate(rootMandateId, ids.Maya, ids.Aria, ['records.read'], []));
    authority = await mandates.delegate(childMandate(rootMandateId, ids.Maya, ids.Noah, ['records.read', 'record.export'], ['record.export']));
    authority = await mandates.delegate(childMandate(rootMandateId, ids.Maya, ids.Isha, ['records.read'], []));
    expect(authority.delegations).toHaveLength(3);
    expect(authority.mandates.every((mandate) => mandate.signature.value.startsWith('ed25519:'))).toBe(true);

    const scenarios = new ScriptedScenarioService(root, ledger, workplace, collaboration, mandates, undefined, undefined, clock);
    await scenarios.initialize();
    let scenarioState = await scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId, outcome: 'normal' });
    expect(scenarioState.runs[0]).toMatchObject({ status: 'succeeded', requestedOutcome: 'normal' });

    scenarioState = await scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId, outcome: 'denied' });
    expect(scenarioState.runs[0]).toMatchObject({ status: 'denied', requestedOutcome: 'denied' });

    scenarioState = await scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId, outcome: 'approval' });
    const paused = scenarioState.runs[0];
    expect(paused.status).toBe('approval-required');
    const approvalId = paused.steps[paused.currentStepIndex].approvalRequestId;
    await mandates.resolveApproval({ approvalRequestId: approvalId!, action: 'approve' });
    scenarioState = await scenarios.resume({ runId: paused.runId });
    expect(scenarioState.runs[0]).toMatchObject({ status: 'succeeded', requestedOutcome: 'approval' });

    await mandates.updateLifecycle({ mandateId: rootMandateId, action: 'revoke' });
    scenarioState = await scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId, outcome: 'revocation' });
    expect(scenarioState.runs[0]).toMatchObject({ status: 'revoked', requestedOutcome: 'revocation' });

    const audit = new EvidenceAuditService(root, ledger, workplace, clock);
    await audit.initialize();
    const explorer = await audit.getState(defaultEvidenceQuery);
    const exportReceipt = await audit.exportBundle(defaultEvidenceQuery);
    const exported = await readFile(join(root, exportReceipt.relativePath), 'utf8');
    const eventTypes = new Set((await ledger.list()).map((event) => event.event_type));

    expect((await ledger.verify()).status).toBe('verified');
    expect(explorer.events.some((record) => record.resolutionStatus === 'complete')).toBe(true);
    expect(explorer.events.some((record) => record.identityChain.delegationPath.length > 0)).toBe(true);
    expect(exportReceipt).toMatchObject({ privacyProfile: 'audit-minimized-v1' });
    expect(exported).not.toContain('private_key_pem');
    for (const eventType of [
      'BIOMETRIC_ENROLLED', 'HUMAN_VERIFIED', 'AGENT_BOUND', 'MANDATE_CREATED', 'MANDATE_SIGNED', 'DELEGATION_CREATED',
      'POLICY_ALLOWED', 'POLICY_DENIED', 'HUMAN_APPROVAL_REQUIRED', 'HUMAN_APPROVED',
      'MANDATE_REVOKED', 'WORKFLOW_COMPLETED', 'AUDIT_BUNDLE_EXPORTED'
    ] as const) expect(eventTypes.has(eventType)).toBe(true);
  }, 30_000);

  it('creates an isolated clean session without overwriting another evidence root', async () => {
    const parent = await temporaryRoot('h2a-session-');
    const target = join(parent, 'executive-session');
    const script = resolve(process.cwd(), 'scripts', 'new-demo-session.mjs');
    const { stdout } = await execFileAsync(process.execPath, [script, '--root', target, '--session', 'quality-gate']);
    const result = JSON.parse(stdout) as { sessionId: string; dataPath: string };
    const fleet = JSON.parse(await readFile(join(target, 'workplace', 'fleet.json'), 'utf8')) as { data: unknown[] };

    expect(result).toMatchObject({ sessionId: 'quality-gate', dataPath: target });
    expect(fleet.data).toEqual([]);
    await expect(execFileAsync(process.execPath, [script, '--root', target, '--session', 'duplicate'])).rejects.toThrow();
  });
});

function agent(name: string, role: string, provider: CreateAgentRequest['provider'], model: string, capabilities: string[]): CreateAgentRequest {
  return { name, role, provider, model, workspace: 'C:\\H2A\\executive-demo', capabilities, expiresAt: '2026-08-20T16:00:00.000Z' };
}

function rootMandate(agentId: string, allowedAgentIds: string[]) {
  return {
    agentId,
    objective: 'Produce an evidence-backed enterprise supplier security review',
    resources: ['enterprise.review'],
    actions: ['records.read', 'report.consolidate', 'record.export'],
    prohibitedActions: ['records.delete'],
    limits: { maxAmount: 1000, maxRecords: 20, maxDurationMinutes: 60, parameterEquals: { tenant: 'hp-demo' } },
    allowedFields: ['recordId', 'controlId', 'finding', 'risk'],
    approvalActions: ['record.export'],
    delegation: { allowed: true, allowedAgentIds, maxDepth: 1 },
    expiresAt: '2026-08-20T16:00:00.000Z'
  };
}

function childMandate(parentMandateId: string, fromAgentId: string, agentId: string, actions: string[], approvalActions: string[]) {
  return {
    parentMandateId,
    fromAgentId,
    agentId,
    objective: 'Produce an evidence-backed enterprise supplier security review',
    resources: ['enterprise.review'],
    actions,
    prohibitedActions: ['records.delete'],
    limits: { maxAmount: 100, maxRecords: 5, maxDurationMinutes: 20, parameterEquals: { tenant: 'hp-demo' } },
    allowedFields: ['recordId', 'controlId'],
    approvalActions,
    delegation: { allowed: false, allowedAgentIds: [], maxDepth: 1 },
    expiresAt: '2026-08-20T15:30:00.000Z'
  };
}

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
}

class DeterministicBch implements BchFuzzyExtractorPort {
  public async register(samples: number[][]): Promise<BchRegistrationResult> {
    return {
      salt: 'a'.repeat(64),
      records: samples.map((_, index) => ({ record_id: `btr_${index}`, helper: `${index % 2}`.repeat(32767), token: `${index + 1}`.repeat(64), k2: `${index + 4}`.repeat(64) }))
    };
  }

  public async verify(_sample: number[], enrollment: BchRegistrationResult) {
    return enrollment.records.map(() => ({ matched: true, correctedErrors: 0 }));
  }
}
