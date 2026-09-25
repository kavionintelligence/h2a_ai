import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runLineProtocolAgent } from './index.ts';
import { LiveProviderAdapterRegistry } from '../../agents/src/liveProviderAdapters.ts';

const privateKeyPath = process.env.H2A_CONNECTOR_PRIVATE_KEY_PATH;
const brokerPublicKeyPath = process.env.H2A_BROKER_PUBLIC_KEY_PATH;
const connectorManifestId = process.env.H2A_CONNECTOR_MANIFEST_ID;
if (!privateKeyPath || !brokerPublicKeyPath || !connectorManifestId) throw new Error('Phase 27 connector environment is incomplete.');
const requestedFields = (process.env.H2A_REQUESTED_FIELDS ?? '').split(',').map((field) => field.trim()).filter(Boolean);
const provider = process.env.H2A_PHASE27_PROVIDER;
const workspace = process.env.H2A_PHASE27_WORKSPACE;
if (!provider || !workspace) throw new Error('Phase 27 provider binding is incomplete.');

runLineProtocolAgent({
  connectorManifestId,
  privateKeyPem: readFileSync(privateKeyPath, 'utf8'),
  brokerPublicKeyPem: readFileSync(brokerPublicKeyPath, 'utf8'),
  requestedFields: () => requestedFields,
  handleTask: async (task, context) => {
    const canonical = JSON.stringify(context, Object.keys(context).sort());
    const predecessorHashes = Array.isArray((task.output_contract as Record<string, unknown> | undefined)?.predecessor_hashes) ? (task.output_contract as Record<string, unknown>).predecessor_hashes : [];
    const prompt = `Complete only this authorized H2A task: ${String(task.objective)}\nAuthorized context projection: ${canonical}\nPredecessor output hashes: ${JSON.stringify(predecessorHashes)}\nReturn a concise result. Do not request undisclosed fields.`;
    let executionKind: 'official-provider-cli' | 'signed-framework-connector' = 'signed-framework-connector';
    let providerOutputHash = `sha256:${createHash('sha256').update(JSON.stringify({ framework: 'h2a-signed-connector', prompt_hash: createHash('sha256').update(prompt).digest('hex') })).digest('hex')}`;
    if (provider !== 'framework') {
      const adapter = new LiveProviderAdapterRegistry().get(provider as 'claude-code' | 'gemini-antigravity' | 'openai-codex');
      const invocation = adapter.buildInvocation({ provider: adapter.provider, agent_id: String(task.assigned_agent_id), passport_id: String(task.passport_id), binding_id: String(task.assigned_agent_id), runtime_session_id: 'phase27-proxy-session', mandate_id: String(task.mandate_id), trace_id: String(task.trace_id), workspace_path: workspace, prompt, timeout_seconds: 180 });
      const result = spawnSync(invocation.executable, invocation.args, { cwd: workspace, input: invocation.stdin, encoding: 'utf8', timeout: 180_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: process.env });
      if (result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT') throw new Error('Official provider execution timed out after 180 seconds.');
      if (result.error) throw new Error(`Official provider process could not run (${(result.error as NodeJS.ErrnoException).code ?? 'PROCESS_ERROR'}).`);
      if (result.status !== 0) throw new Error(`Official provider execution failed with exit code ${result.status ?? 'unknown'}.`);
      executionKind = 'official-provider-cli';
      providerOutputHash = `sha256:${createHash('sha256').update(result.stdout || result.stderr || '').digest('hex')}`;
    }
    return {
      context_projection_hash: `sha256:${createHash('sha256').update(canonical).digest('hex')}`,
      released_fields: Object.keys(context).sort(),
      projected_tokens: Math.ceil(canonical.length / 4),
      predecessor_hashes: predecessorHashes,
      execution_kind: executionKind,
      provider_output_hash: providerOutputHash,
      values_persisted: false
    };
  }
});
