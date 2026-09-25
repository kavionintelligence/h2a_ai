export type DependencyNodeStatus = 'pending' | 'ready' | 'running' | 'succeeded' | 'approved' | 'acknowledged' | 'failed' | 'denied' | 'cancelled' | 'revoked';

export interface DependencyNode {
  node_id: string;
  status: DependencyNodeStatus;
}

export interface DependencyEdge {
  edge_id: string;
  predecessor_node_id: string;
  successor_node_id: string;
  condition: 'succeeded' | 'approved' | 'acknowledged';
  on_unsatisfied: 'wait' | 'deny';
}

export interface DependencyGraphAnalysis {
  valid: boolean;
  ready_node_ids: string[];
  waiting_node_ids: string[];
  blocked_node_ids: string[];
  missing_edge_ids: string[];
  denied_edge_ids: string[];
  cycle_node_ids: string[];
}

const terminalDenials = new Set<DependencyNodeStatus>(['failed', 'denied', 'cancelled', 'revoked']);

export function analyzeDependencyGraph(nodes: DependencyNode[], edges: DependencyEdge[]): DependencyGraphAnalysis {
  const byId = new Map(nodes.map((node) => [node.node_id, node]));
  const missing = edges.filter((edge) => !byId.has(edge.predecessor_node_id) || !byId.has(edge.successor_node_id)).map((edge) => edge.edge_id);
  const usableEdges = edges.filter((edge) => !missing.includes(edge.edge_id));
  const cycleNodes = findCycleNodes(nodes.map((node) => node.node_id), usableEdges);
  const deniedEdges = usableEdges.filter((edge) => edge.on_unsatisfied === 'deny' && terminalDenials.has(byId.get(edge.predecessor_node_id)!.status)).map((edge) => edge.edge_id);
  const blocked = new Set<string>(cycleNodes);
  for (const edge of usableEdges) if (deniedEdges.includes(edge.edge_id)) blocked.add(edge.successor_node_id);

  const ready: string[] = [];
  const waiting: string[] = [];
  for (const node of nodes) {
    if (blocked.has(node.node_id) || terminalDenials.has(node.status) || ['running', 'succeeded', 'approved', 'acknowledged'].includes(node.status)) continue;
    const incoming = usableEdges.filter((edge) => edge.successor_node_id === node.node_id);
    const satisfied = incoming.every((edge) => dependencySatisfied(byId.get(edge.predecessor_node_id)!.status, edge.condition));
    if (satisfied) ready.push(node.node_id);
    else waiting.push(node.node_id);
  }

  return {
    valid: missing.length === 0 && cycleNodes.length === 0,
    ready_node_ids: ready,
    waiting_node_ids: waiting,
    blocked_node_ids: [...blocked],
    missing_edge_ids: missing,
    denied_edge_ids: deniedEdges,
    cycle_node_ids: cycleNodes
  };
}

function dependencySatisfied(status: DependencyNodeStatus, condition: DependencyEdge['condition']): boolean {
  if (condition === 'succeeded') return status === 'succeeded';
  if (condition === 'approved') return status === 'approved' || status === 'succeeded';
  return status === 'acknowledged' || status === 'succeeded';
}

function findCycleNodes(nodeIds: string[], edges: DependencyEdge[]): string[] {
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.predecessor_node_id)?.push(edge.successor_node_id);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();
  const path: string[] = [];

  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      const start = path.lastIndexOf(nodeId);
      for (const cycleNode of path.slice(start)) cyclic.add(cycleNode);
      cyclic.add(nodeId);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    path.push(nodeId);
    for (const successor of adjacency.get(nodeId) ?? []) visit(successor);
    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of nodeIds) visit(nodeId);
  return [...cyclic].sort();
}

