import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LiveProviderAdapterRegistry, ProcessSupervisor } from '@h2a/agents';
import type { LiveProviderId, StartLiveRunRequest } from '@h2a/contracts';
import { hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';

const enabled = process.env.H2A_RUN_LIVE_PROVIDER_TESTS === '1';
const selected = (process.env.H2A_LIVE_PROVIDERS ?? 'claude-code,openai-codex,gemini-antigravity').split(',') as LiveProviderId[];

describe.skipIf(!enabled)('Phase 16 opt-in official provider proof', () => {
  const projectRoot = resolve('.');
  const proofRoot = resolve('data/live-provider-proof');
  const adapters = new LiveProviderAdapterRegistry();

  for (const provider of selected) {
    it(`${provider} returns real structured output through the supervisor`, async () => {
      const dataPath = resolve(proofRoot, provider);
      const workspace = resolve(dataPath, 'workspace');
      await mkdir(workspace, { recursive: true });
      const ledger = new LocalAuthorityEventLedger(dataPath);
      const supervisor = new ProcessSupervisor(dataPath, ledger, { assertActive: async () => undefined }, adapters, [workspace]);
      await supervisor.initialize();
      const started = await supervisor.start(liveRequest(provider, workspace, `live_${provider}`));
      const run = await waitForTerminal(supervisor, started.runs[0].run_id, 240_000);
      await supervisor.shutdown();
      expect(run.status, run.output_summary ?? run.termination_reason).toBe('succeeded');
      expect(run.output_summary?.length).toBeGreaterThan(0);
      await writeProof(provider, run, ledger, projectRoot);
    }, 260_000);
  }

  it('cancellation and revocation terminate official provider process trees', async () => {
    const provider = selected.includes('claude-code') ? 'claude-code' : selected[0];
    const dataPath = resolve(proofRoot, 'termination');
    const workspace = resolve(dataPath, 'workspace');
    await mkdir(workspace, { recursive: true });
    const ledger = new LocalAuthorityEventLedger(dataPath);
    const supervisor = new ProcessSupervisor(dataPath, ledger, { assertActive: async () => undefined }, adapters, [workspace]);
    await supervisor.initialize();

    const cancelled = await supervisor.start(liveRequest(provider, workspace, 'live_cancel'));
    await supervisor.cancel(cancelled.runs[0].run_id, 'Phase 16 live cancellation proof');
    expect((await supervisor.getState()).runs.find((run) => run.run_id === cancelled.runs[0].run_id)?.status).toBe('cancelled');

    const revoked = await supervisor.start({ ...liveRequest(provider, workspace, 'live_revoke'), runtime_session_id: 'session_revoke' });
    await supervisor.revokePassport('passport_live', 'PASSPORT_REVOKED_LIVE_PROOF');
    const state = await supervisor.getState();
    expect(state.runs.find((run) => run.run_id === revoked.runs[0].run_id)?.status).toBe('revoked');
    const integrity = await ledger.verify();
    await writeFile(resolve(projectRoot, 'docs/plan2/evidence/phase16-live-process-termination-proof.json'), `${JSON.stringify({
      generated_at: new Date().toISOString(), provider,
      cancellation: { run_id: cancelled.runs[0].run_id, status: state.runs.find((run) => run.run_id === cancelled.runs[0].run_id)?.status },
      revocation: { run_id: revoked.runs[0].run_id, status: state.runs.find((run) => run.run_id === revoked.runs[0].run_id)?.status },
      evidence_integrity: integrity
    }, null, 2)}\n`, 'utf8');
    await supervisor.shutdown();
  }, 60_000);
});

function liveRequest(provider: LiveProviderId, workspace: string, traceId: string): StartLiveRunRequest {
  return {
    provider, agent_id: 'agent_live', passport_id: 'passport_live', binding_id: 'binding_live',
    runtime_session_id: 'session_live', mandate_id: 'mandate_live', trace_id: traceId,
    workspace_path: workspace,
    prompt: 'Return a concise response containing exactly this fact: H2A live provider proof completed. Do not use tools and do not modify files.',
    timeout_seconds: 180
  };
}

async function waitForTerminal(supervisor: ProcessSupervisor, runId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await supervisor.getState();
    const run = state.runs.find((candidate) => candidate.run_id === runId);
    if (run && !['starting', 'running'].includes(run.status)) return run;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Live provider run ${runId} did not finish before timeout.`);
}

async function writeProof(provider: LiveProviderId, run: Awaited<ReturnType<typeof waitForTerminal>>, ledger: LocalAuthorityEventLedger, projectRoot: string): Promise<void> {
  const integrity = await ledger.verify();
  const target = resolve(projectRoot, 'docs/plan2/evidence', `phase16-${provider}-live-proof.json`);
  await writeFile(target, `${JSON.stringify({
    generated_at: new Date().toISOString(), provider, run_id: run.run_id, status: run.status,
    trust_mode: run.trust_mode, executable_version: run.executable_version,
    argument_policy: run.argument_policy, environment_keys: run.environment_keys,
    prompt_hash: run.prompt_hash, output_hash: hashCanonical(run.output_summary ?? ''),
    termination_reason: run.termination_reason, evidence_integrity: integrity
  }, null, 2)}\n`, 'utf8');
}
