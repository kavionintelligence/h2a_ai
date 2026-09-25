import { providerDefinitionSchema, type ProviderDefinition, type ProviderId } from '@h2a/contracts';

const definitions: ProviderDefinition[] = [
  provider('scripted', 'H2A Scripted', 'Deterministic local workplace runtime for repeatable demonstrations.', 'scripted-workplace', 'none', 'active-demo', undefined, [['coordinator-v0', 'Coordinator V0'], ['specialist-v0', 'Specialist V0']]),
  provider('openai-codex', 'OpenAI / Codex', 'Official Codex exec JSONL adapter; host probing and live trust state are enforced by the Phase 16 supervisor.', 'live-cli', 'subscription', 'adapter-ready', 'codex', [['gpt-5-codex', 'GPT-5 Codex'], ['gpt-5', 'GPT-5']]),
  provider('claude-code', 'Claude Code', 'Official Claude structured-stream adapter with tools disabled, safe mode, and supervised lifecycle.', 'live-cli', 'subscription', 'adapter-ready', 'claude', [['claude-sonnet-4-5', 'Claude Sonnet 4.5'], ['claude-opus-4-1', 'Claude Opus 4.1']]),
  provider('gemini-antigravity', 'Gemini / Antigravity', 'Official Antigravity stream adapter with plan mode, sandboxing, and honest hook/authentication health.', 'live-cli', 'subscription', 'adapter-ready', 'agy', [['gemini-3.1-pro-high', 'Gemini 3.1 Pro High'], ['gemini-2.5-pro', 'Gemini 2.5 Pro']]),
  provider('grok-cli', 'Grok / xAI', 'Grok CLI provider lane with lifecycle adapter support.', 'live-cli', 'api-key', 'adapter-ready', 'grok', [['grok-code-fast-1', 'Grok Code Fast 1']]),
  provider('kimi-code', 'Kimi Code', 'Kimi coding CLI provider lane.', 'live-cli', 'api-key', 'adapter-ready', 'kimi', [['kimi-k2', 'Kimi K2']]),
  provider('qwen-cli', 'Qwen Code', 'Qwen CLI provider lane for local or compatible endpoints.', 'live-cli', 'api-key', 'adapter-ready', 'qwen', [['qwen3-coder-plus', 'Qwen3 Coder Plus']]),
  provider('opencode', 'OpenCode', 'OpenCode provider lane with configurable model routing.', 'live-cli', 'api-key', 'adapter-ready', 'opencode', [['anthropic/claude-sonnet-4-5', 'Claude Sonnet 4.5'], ['local/qwen3-coder', 'Local Qwen3 Coder']]),
  provider('crush-cli', 'Crush', 'Charmbracelet Crush CLI provider lane.', 'live-cli', 'api-key', 'adapter-ready', 'crush', [['openai/gpt-4o', 'OpenAI GPT-4o']]),
  provider('pi-cli', 'Pi', 'Pi coding-agent provider lane.', 'live-cli', 'api-key', 'adapter-ready', 'pi', [['anthropic/claude-sonnet-4-5', 'Claude Sonnet 4.5']]),
  provider('copilot-cli', 'GitHub Copilot CLI', 'GitHub Copilot CLI provider lane.', 'live-cli', 'subscription', 'adapter-ready', 'copilot', [['claude-sonnet-4.5', 'Claude Sonnet 4.5'], ['gpt-5', 'GPT-5']]),
  provider('bedrock', 'AWS Bedrock', 'Future managed model execution through the Bedrock adapter.', 'bedrock', 'aws-credentials', 'adapter-ready', undefined, [['anthropic.claude-sonnet-4-5-v1:0', 'Claude Sonnet 4.5'], ['amazon.nova-pro-v1:0', 'Amazon Nova Pro']]),
  provider('custom-cli', 'Custom CLI', 'Locally installed agent command behind the live CLI contract.', 'live-cli', 'custom', 'adapter-ready', undefined, [['custom-runtime', 'Custom runtime']])
];

export const providerCatalogue = definitions.map((definition) => providerDefinitionSchema.parse(definition));

export function getProviderDefinition(providerId: ProviderId): ProviderDefinition {
  const definition = providerCatalogue.find((candidate) => candidate.id === providerId);
  if (!definition) throw new Error(`Unsupported provider: ${providerId}`);
  return definition;
}

function provider(
  id: ProviderId,
  label: string,
  description: string,
  executionMode: ProviderDefinition['execution_mode'],
  authMode: ProviderDefinition['auth_mode'],
  availability: ProviderDefinition['availability'],
  defaultCommand: string | undefined,
  models: Array<[string, string]>
): ProviderDefinition {
  return {
    id, label, description, execution_mode: executionMode, auth_mode: authMode, availability,
    default_command: defaultCommand,
    models: models.map(([modelId, modelLabel], index) => ({ id: modelId, label: modelLabel, recommended: index === 0 }))
  };
}
