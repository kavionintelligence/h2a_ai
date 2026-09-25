import type { AgentRuntimeSummary } from '@h2a/contracts';

export function retainSelectedAgentId(current: string, agents: AgentRuntimeSummary[]): string {
  return agents.some((agent) => agent.id === current) ? current : agents[0]?.id ?? '';
}
