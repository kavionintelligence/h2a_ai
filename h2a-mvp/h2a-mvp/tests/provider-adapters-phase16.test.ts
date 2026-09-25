import { describe, expect, it } from 'vitest';
import { LiveProviderAdapterRegistry } from '@h2a/agents';
import type { LiveProviderId, StartLiveRunRequest } from '@h2a/contracts';

describe('Phase 16 official provider command policies', () => {
  const registry = new LiveProviderAdapterRegistry();
  const workspace = process.cwd();

  it.each([
    ['claude-code', ['stream-json', 'plan-permission', 'tools-disabled', 'safe-mode']],
    ['openai-codex', ['exec-json', 'read-only', 'ephemeral', 'workspace-bound']],
    ['gemini-antigravity', ['stream-json', 'sandbox', 'slash-commands-disabled', 'permission-gated']]
  ] as Array<[LiveProviderId, string[]]>)('%s uses only its fixed restricted invocation', (provider, expectedPolicy) => {
    const invocation = registry.get(provider).buildInvocation(request(provider, workspace));
    expect(invocation.argumentPolicy).toEqual(expect.arrayContaining(expectedPolicy));
    expect(invocation.args.join(' ')).not.toMatch(/dangerously|skip.permissions|danger-full-access|yolo/iu);
    expect(invocation.executable.length).toBeGreaterThan(0);
  });

  it('reports each installed lane honestly and never upgrades host CLIs to governed', () => {
    const statuses = registry.probe();
    expect(statuses.map((status) => status.provider)).toEqual(['claude-code', 'openai-codex', 'gemini-antigravity']);
    expect(statuses.every((status) => status.trust_mode === 'connected-observed')).toBe(true);
    const antigravity = statuses.find((status) => status.provider === 'gemini-antigravity');
    expect(antigravity).toMatchObject({ trust_mode: 'connected-observed' });
    expect(['ready', 'degraded']).toContain(antigravity?.health);
    if (antigravity?.health === 'degraded') expect(antigravity.detail).toMatch(/telemetry hook|Windows-incompatible/iu);
  });
});

function request(provider: LiveProviderId, workspace: string): StartLiveRunRequest {
  return {
    provider, agent_id: 'agent_policy', passport_id: 'passport_policy', binding_id: 'binding_policy',
    runtime_session_id: 'session_policy', mandate_id: 'mandate_policy', trace_id: 'trace_policy',
    workspace_path: workspace, prompt: 'Return one bounded policy-test response.', timeout_seconds: 120
  };
}
