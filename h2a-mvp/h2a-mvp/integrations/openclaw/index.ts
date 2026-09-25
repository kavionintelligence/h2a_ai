import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

export default definePluginEntry({
  id: 'h2a-authority',
  name: 'H2A Authority Policy',
  register(api) {
    const decide = async (kind: string, payload: unknown, context: unknown) => {
      const config = (context as { pluginConfig?: { endpoint?: string; bearerToken?: string } })?.pluginConfig ?? {};
      const endpoint = new URL(config.endpoint ?? '');
      if (!['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname)) throw new Error('H2A OpenClaw policy endpoint must be loopback-only.');
      const response = await fetch(endpoint, {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/json', 'x-h2a-hook': kind, ...(config.bearerToken ? { authorization: `Bearer ${config.bearerToken}` } : {}) },
        body: JSON.stringify({ kind, payload })
      });
      if (!response.ok) throw new Error(`H2A policy endpoint returned ${response.status}.`);
      return await response.json() as { allowed?: boolean; reason?: string };
    };

    api.on('before_agent_run', async (event) => {
      const decision = await decide('before_agent_run', event, event.context);
      if (decision.allowed !== true) {
        return {
          outcome: 'block' as const,
          reason: decision.reason ?? 'H2A authority denied the run.',
          message: 'This agent run requires an active H2A mandate and verified authority.'
        };
      }
      return undefined;
    });
    api.on('before_tool_call', async (event) => {
      const decision = await decide('before_tool_call', event, event.context);
      if (decision.allowed !== true) return { block: true, blockReason: decision.reason ?? 'H2A mandate denied the tool.' };
      return undefined;
    }, { timeoutMs: 15_000 });
    api.on('agent_end', async (event) => { await decide('agent_end', event, event.context); });
    api.on('gateway_start', async (event) => { await decide('gateway_start', event, event.context); });
    api.on('gateway_stop', async (event) => { await decide('gateway_stop', event, event.context); }, { timeoutMs: 5_000 });
  }
});
