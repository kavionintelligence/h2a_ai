import type { ControlPlaneCanonicalState, OrganizationAuthorityState, WorkGraph, WorkGraphNode } from '@h2a/contracts';

export type WorkspaceDepth = 'plain' | 'authority' | 'proof';
export type WorkspacePage = 'canvas' | 'workspaces' | 'people' | 'memory' | 'security';

export const providerNames: Record<WorkGraphNode['provider'], string> = {
  'claude-code': 'Claude', 'openai-codex': 'Codex', 'gemini-antigravity': 'Antigravity', 'custom-cli': 'Custom agent'
};

export function humanName(state: ControlPlaneCanonicalState, humanId: string): string {
  return state.guided_bootstrap.humans.find((human) => human.human_id === humanId)?.display_name
    ?? state.organization.memberships.find((member) => member.human_id === humanId)?.employee_id
    ?? humanId;
}

export function nodeStatus(node: WorkGraphNode, now: number): string {
  if (node.status === 'succeeded') return 'Work completed';
  if (node.status === 'revoked') return 'Permission withdrawn';
  if (node.status === 'cancelled') return 'Cancelled';
  if (node.status === 'running') return 'Working';
  if (node.status === 'draft') return 'Plan not approved';
  if (Date.parse(node.mandate_expires_at) <= now) return 'Permission expired';
  if (node.reason_code === 'REMOTE_TASK_ACCEPTED_WAITING_FOR_SIGNED_RESULT') return 'Received; result pending';
  return ({ ready: 'Ready to start', waiting: 'Waiting for a dependency', 'approval-required': 'Needs approval', failed: 'Could not finish', denied: 'Blocked by policy', 'replacement-required': 'Needs a replacement' } as Record<string, string>)[node.status] ?? node.status;
}

export function nodeCanRun(graph: WorkGraph, node: WorkGraphNode, now: number): boolean {
  if (!['approved', 'running', 'blocked'].includes(graph.status) || !graph.approved_by_human_id) return false;
  if (!['ready', 'failed', 'cancelled'].includes(node.status) || !(Date.parse(node.mandate_expires_at) > now)) return false;
  return graph.dependency_edges.filter((edge) => edge.successor_node_id === node.node_id).every((edge) => graph.nodes.find((predecessor) => predecessor.node_id === edge.predecessor_node_id)?.status === 'succeeded');
}

export function purposeActor(state: OrganizationAuthorityState, humanId: string, purpose: string, now: number) {
  const member = state.memberships.find((item) => item.human_id === humanId && item.status === 'active' && Date.parse(item.effective_from) <= now && (!item.effective_until || Date.parse(item.effective_until) > now));
  const proof = state.assurance.find((item) => item.membership_id === member?.membership_id && item.human_id === humanId && item.purpose === purpose && Date.parse(item.expires_at) > now);
  const credential = state.credentials.find((item) => item.membership_id === member?.membership_id && item.organization_id === member?.organization_id && item.status === 'active' && Date.parse(item.issued_at) <= now && Date.parse(item.expires_at) > now);
  return member && proof && credential ? { membership_id: member.membership_id, human_proof_id: proof.human_proof_id, authority_credential_id: credential.credential_id } : undefined;
}

export function timeRemaining(expiresAt: string, now: number): string {
  const milliseconds = Date.parse(expiresAt) - now;
  if (!Number.isFinite(milliseconds)) return 'Expiry unavailable';
  if (milliseconds <= 0) return 'Expired';
  const minutes = Math.ceil(milliseconds / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : `${minutes}m left`;
}

export function graphForGoal(state: ControlPlaneCanonicalState, goalId: string): WorkGraph | undefined {
  return state.goal_work_graph?.graphs.filter((graph) => graph.goal_id === goalId).sort((a, b) => b.revision - a.revision)[0];
}

export function workPriority(status: string): number {
  return ['blocked', 'draft', 'planned', 'approved', 'running', 'completed', 'cancelled'].indexOf(status);
}

export function roomDisclosures(state: ControlPlaneCanonicalState, graph: WorkGraph) {
  return state.context_broker.disclosures.filter((item) => graph.nodes.some((node) =>
    node.context_grant_id === item.context_grant_id
    && [node.workplace_assignment_id, node.project_assignment_id].includes(item.task_id)
    && node.agent_id === item.recipient_agent_id
    && node.passport_id === item.recipient_passport_id));
}
