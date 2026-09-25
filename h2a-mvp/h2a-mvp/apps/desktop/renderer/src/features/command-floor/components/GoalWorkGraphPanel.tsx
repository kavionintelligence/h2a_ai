import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, GitBranch, Play, RefreshCw, RotateCcw, ShieldCheck, X } from 'lucide-react';
import type { GoalWorkGraphState, OrganizationAuthorityState, ProjectDeliveryState, WorkGraph, WorkGraphAgentCandidate, WorkGraphNode } from '@h2a/contracts';

const emptyState: GoalWorkGraphState = { schema_version: 1, goals: [], graphs: [], diffs: [], candidates: [], generated_at: new Date(0).toISOString(), trust_ceiling: 'connected-observed' };

export function GoalWorkGraphPanel({ projects, organization, canonicalState, selectedGoalId, compact = false, onHumanProofRequired, onStateChange }: { projects: ProjectDeliveryState; organization: OrganizationAuthorityState; canonicalState?: GoalWorkGraphState; selectedGoalId?: string; compact?: boolean; onHumanProofRequired(): void; onStateChange?(state: GoalWorkGraphState): void }): React.JSX.Element {
  const api = window.h2a;
  const [state, setState] = useState(emptyState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState(projects.projects[0]?.project_id ?? '');
  const [title, setTitle] = useState('Launch governed storefront');
  const [outcome, setOutcome] = useState('A validated, reviewable website change with source-backed content.');
  const [objective, setObjective] = useState('Research, design, implement, and validate a polished clothing storefront.');
  const [constraints, setConstraints] = useState('No protected data in provider output\nNo writes outside approved paths');
  const [deadline, setDeadline] = useState('');
  const [sensitivity, setSensitivity] = useState<'public' | 'internal' | 'confidential' | 'restricted'>('internal');
  const [draft, setDraft] = useState<WorkGraph>();

  const goal = selectedGoalId ? state.goals.find((item) => item.goal_id === selectedGoalId) : state.goals.at(-1);
  const graph = state.graphs.find((item) => item.goal_id === goal?.goal_id) ?? (selectedGoalId ? undefined : state.graphs.at(-1));
  const latestDiff = state.diffs.filter((item) => item.graph_id === graph?.graph_id).at(-1);
  const activeOrganization = organization.organizations.find((item) => item.status === 'active');
  const actor = useMemo(() => resolveActor(organization), [organization]);

  useEffect(() => { if (canonicalState) setState(canonicalState); else if (api) void api.getGoalWorkGraphState().then(setState); }, [api, canonicalState]);
  useEffect(() => { setDraft(graph); }, [graph]);
  useEffect(() => { if (!projectId && projects.projects[0]) setProjectId(projects.projects[0].project_id); }, [projectId, projects.projects]);

  async function run(operation: () => Promise<GoalWorkGraphState>): Promise<GoalWorkGraphState | undefined> {
    setBusy(true); setError('');
    try { const next = await operation(); setState(next); onStateChange?.(next); return next; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Work graph operation failed.'); return undefined; }
    finally { setBusy(false); }
  }

  async function compose(): Promise<void> {
    if (!api || !activeOrganization || !projectId) return;
    const human = actor?.humanId ?? organization.memberships.find((item) => item.status === 'active')?.human_id;
    if (!human) { onHumanProofRequired(); return; }
    await run(() => api.composeCollaborativeGoal({ organization_id: activeOrganization.organization_id, project_id: projectId, title, objective, outcome, constraints: lines(constraints), deadline: deadline ? new Date(deadline).toISOString() : null, sensitivity, expected_outputs: ['Research brief', 'UI proposal', 'Repository change', 'Validation receipts'], created_by_human_id: human, trace_id: `tr_goal_${crypto.randomUUID()}` }));
  }

  async function propose(): Promise<void> { if (api && goal) await run(() => api.proposeWorkGraph({ goal_id: goal.goal_id })); }
  async function approve(): Promise<void> {
    if (!api || !draft) return;
    if (!actor) { onHumanProofRequired(); return; }
    await run(() => api.approveWorkGraph({ graph_id: draft.graph_id, expected_revision: draft.revision, actor: actor.authority }));
  }
  async function savePlan(): Promise<void> {
    if (!api || !draft) return;
    await run(() => api.editWorkGraph({ graph_id: draft.graph_id, expected_revision: draft.revision, nodes: draft.nodes, dependency_edges: draft.dependency_edges, approval_checkpoints: draft.approval_checkpoints }));
  }
  async function runReady(): Promise<void> {
    if (!api || !graph) return;
    let current = graph;
    for (let wave = 0; wave < current.nodes.length; wave += 1) {
      const runnable = current.nodes.filter((node) => ['ready', 'failed', 'cancelled'].includes(node.status) && dependencies(current, node.node_id).every((id) => current.nodes.find((item) => item.node_id === id)?.status === 'succeeded'));
      if (runnable.length === 0) break;
      if (runnable.some((node) => node.execution_target === 'paired-node') && !actor) { onHumanProofRequired(); return; }
      await Promise.all(runnable.map((node) => api.runWorkGraphNode({ graph_id: current.graph_id, node_id: node.node_id, actor: actor?.authority })));
      current = (await api.getGoalWorkGraphState()).graphs.find((item) => item.graph_id === current.graph_id) ?? current;
      if (runnable.some((node) => current.nodes.find((item) => item.node_id === node.node_id)?.status !== 'succeeded')) break;
    }
    const next = await api.getGoalWorkGraphState(); setState(next); onStateChange?.(next);
  }

  function assignCandidate(nodeId: string, candidate: WorkGraphAgentCandidate): void {
    if (!draft) return;
    setDraft({ ...draft, nodes: draft.nodes.map((node) => node.node_id === nodeId ? { ...node, human_owner_id: candidate.human_owner_id, agent_id: candidate.agent_id, runtime_binding_id: candidate.runtime_binding_id, execution_target: candidate.execution_target, remote_peer_id: candidate.remote_peer_id, passport_id: candidate.passport_id, runtime_session_id: candidate.runtime_session_id, runtime_attestation_id: candidate.runtime_attestation_id, provider: candidate.provider } : node) });
  }

  function setDependencies(nodeId: string, ids: string[]): void {
    if (!draft) return;
    const retained = draft.dependency_edges.filter((edge) => edge.successor_node_id !== nodeId);
    const added = ids.map((id) => ({ edge_id: `edge_${crypto.randomUUID()}`, predecessor_node_id: id, successor_node_id: nodeId, condition: 'succeeded' as const, on_unsatisfied: 'wait' as const }));
    setDraft({ ...draft, dependency_edges: [...retained, ...added] });
  }

  async function nodeCommand(node: WorkGraphNode, command: 'run' | 'cancel' | 'revoke'): Promise<void> {
    if (!api || !graph) return;
    if ((command === 'revoke' || node.execution_target === 'paired-node') && !actor) { onHumanProofRequired(); return; }
    const request = { graph_id: graph.graph_id, node_id: node.node_id, actor: actor?.authority };
    await run(() => command === 'run' ? api.runWorkGraphNode(request) : command === 'cancel' ? api.cancelWorkGraphNode(request) : api.revokeWorkGraphNode(request));
  }

  async function reassign(node: WorkGraphNode): Promise<void> {
    if (!api || !graph) return;
    const replacement = state.candidates.find((item) => item.status === 'ready' && (item.agent_id !== node.agent_id || item.remote_peer_id !== node.remote_peer_id) && node.allowed_tools.every((tool) => item.capabilities.includes(tool)));
    if (!replacement) { setError('No ready replacement has the exact required capabilities.'); return; }
    await run(() => api.reassignWorkGraphNode({ graph_id: graph.graph_id, node_id: node.node_id, candidate_id: replacement.candidate_id }));
  }

  async function renew(node: WorkGraphNode): Promise<void> {
    if (!api || !graph) return;
    if (!actor) { onHumanProofRequired(); return; }
    await run(() => api.renewWorkGraphNode({ graph_id: graph.graph_id, node_id: node.node_id, actor: actor.authority }));
  }

  return <section className={`goal-work-graph ${compact ? 'goal-work-graph-compact' : ''}`} aria-labelledby={`goal-work-graph-title-${compact ? 'office' : 'control'}`}>
    <header><div><p className="section-kicker">PHASE 49 / GOAL ORCHESTRATION</p><h2 id={`goal-work-graph-title-${compact ? 'office' : 'control'}`}>Collaborative work graph</h2><p>One human goal becomes editable, exact-scope work across local and paired-node agents.</p></div><button data-control-id="work-graph.refresh" className="icon-button" type="button" aria-label="Refresh collaborative work graph" title="Refresh" disabled={busy || !api} onClick={() => api && void run(() => api.getGoalWorkGraphState())}><RefreshCw size={17} /></button></header>
    <div className="work-graph-trust"><ShieldCheck size={16} /><strong>Connected-observed ceiling</strong><span>{state.candidates.filter((item) => item.status === 'ready').length} ready agents</span><span>{state.candidates.filter((item) => item.execution_target === 'paired-node').length} paired-node</span></div>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {!goal && <form className="work-graph-composer" onSubmit={(event) => { event.preventDefault(); void compose(); }}>
      <label>Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select registered project</option>{projects.projects.map((item) => <option key={item.project_id} value={item.project_id}>{item.display_name}</option>)}</select></label>
      <label>Goal<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="wide">Outcome<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label>
      <label className="wide">Objective<textarea value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
      <label className="wide">Constraints<textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} /></label>
      <label>Deadline<input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
      <label>Sensitivity<select value={sensitivity} onChange={(event) => setSensitivity(event.target.value as typeof sensitivity)}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label>
      <button data-control-id="work-graph.goal.compose" className="primary-button" type="submit" disabled={busy || !projectId || !title.trim() || !objective.trim()}>1. Compose goal</button>
    </form>}
    {goal && !graph && <div className="work-graph-next"><div><strong>{goal.title}</strong><span>{goal.outcome}</span></div><button data-control-id="work-graph.plan.propose" className="primary-button" type="button" disabled={busy} onClick={() => void propose()}><GitBranch size={16} /> 2. Propose graph</button></div>}
    {draft && <>
      <div className="work-graph-heading"><div><strong>{goal?.title}</strong><code>{draft.plan_hash}</code>{latestDiff && <small>Plan diff {latestDiff.from_revision} → {latestDiff.to_revision}: {latestDiff.changed_node_ids.length} changed, {latestDiff.added_node_ids.length} added, {latestDiff.removed_node_ids.length} removed</small>}</div><span className={`status-chip status-${draft.status}`}>{draft.status}</span><span>revision {draft.revision}</span></div>
      <div className="work-graph-list">{draft.nodes.map((node, index) => <article key={node.node_id} className={`work-node work-node-${node.status}`}>
        <div className="work-node-index">{index + 1}</div><div className="work-node-main"><div className="work-node-title"><div><h3>{node.title}</h3><span>{node.objective}</span></div><span className={`status-chip status-${node.status}`}>{Date.parse(node.mandate_expires_at) <= Date.now() && !['succeeded', 'revoked'].includes(node.status) ? 'permission expired' : node.status.replaceAll('-', ' ')}</span></div>
        <div className="work-node-grid"><label>Agent<select disabled={draft.status !== 'draft'} value={state.candidates.find((item) => item.agent_id === node.agent_id && item.remote_peer_id === node.remote_peer_id)?.candidate_id ?? ''} onChange={(event) => { const candidate = state.candidates.find((item) => item.candidate_id === event.target.value); if (candidate) assignCandidate(node.node_id, candidate); }}>{state.candidates.map((item) => <option key={item.candidate_id} value={item.candidate_id} disabled={item.status !== 'ready'}>{item.display_name} · {item.provider} · {item.execution_target}</option>)}</select></label><label>Depends on<select multiple disabled={draft.status !== 'draft'} value={dependencies(draft, node.node_id)} onChange={(event) => setDependencies(node.node_id, [...event.currentTarget.selectedOptions].map((option) => option.value))}>{draft.nodes.filter((item) => item.node_id !== node.node_id).map((item) => <option key={item.node_id} value={item.node_id}>{item.title}</option>)}</select></label></div>
        <dl className="work-node-facts"><Fact label="Human owner" value={node.human_owner_id} /><Fact label="Attribution" value={`${node.human_owner_id} → ${node.agent_id}`} /><Fact label="Provider" value={node.provider} /><Fact label="Target" value={node.execution_target} /><Fact label="Outputs" value={node.expected_outputs.join(', ')} /><Fact label="Tools" value={node.allowed_tools.join(', ') || 'None'} /><Fact label="Paths" value={node.allowed_paths.join(', ') || 'No writes'} /><Fact label="Hosts" value={node.allowed_network_hosts.join(', ') || 'None'} /><Fact label="Released" value={node.allowed_context_fields.join(', ') || 'None'} /><Fact label="Withheld" value={node.withheld_context_fields.join(', ') || 'None'} /><Fact label="Mandate" value={node.mandate_id ?? 'Created after approval'} /><Fact label="Authority ancestry" value={`${goal?.goal_id ?? 'goal'} → ${node.mandate_id ?? 'pending mandate'}`} /><Fact label="Expires" value={new Date(node.mandate_expires_at).toLocaleString()} /><Fact label="Validation" value={node.validation_commands.join(', ') || 'Output contract only'} /><Fact label="Reason" value={node.reason_code ?? 'No blocking reason'} /><Fact label="Final output" value={node.output_hash ?? 'Awaiting signed output'} /></dl>
        {node.evidence_refs.length > 0 && <div className="work-node-evidence">{node.evidence_refs.map((ref) => <code key={ref}>{ref}</code>)}</div>}
        {draft.status !== 'draft' && <div className="work-node-actions"><button data-control-id="work-graph.node.run" className="primary-button" type="button" disabled={busy || Date.parse(node.mandate_expires_at) <= Date.now() || !['ready', 'failed', 'cancelled', 'waiting'].includes(node.status)} onClick={() => void nodeCommand(node, 'run')}><Play size={15} /> {node.status === 'failed' ? 'Retry' : 'Run'}</button>{node.execution_target === 'local' && Date.parse(node.mandate_expires_at) <= Date.now() && !['succeeded', 'revoked', 'replacement-required'].includes(node.status) && <button data-control-id="work-graph.node.renew" className="secondary-button" type="button" disabled={busy} title="Issue a new signed mandate with identical scope" onClick={() => void renew(node)}><RotateCcw size={15} /> Renew permission</button>}<button data-control-id="work-graph.node.cancel" className="secondary-button" type="button" title={node.execution_target !== 'local' ? 'Remote containment is unavailable without a signed receiver receipt.' : 'Cancel assignment'} disabled={node.execution_target !== 'local' || busy || !['running', 'waiting'].includes(node.status)} onClick={() => void nodeCommand(node, 'cancel')}><X size={15} /> Cancel</button><button data-control-id="work-graph.node.reassign" className="secondary-button" type="button" disabled={busy || ['running', 'succeeded', 'revoked'].includes(node.status)} onClick={() => void reassign(node)}><RotateCcw size={15} /> Reassign</button><button data-control-id="work-graph.node.revoke" className="danger-button" type="button" title={node.execution_target !== 'local' ? 'Remote containment is unavailable without a signed receiver receipt.' : 'Revoke mandate'} disabled={node.execution_target !== 'local' || busy || ['revoked', 'succeeded'].includes(node.status)} onClick={() => void nodeCommand(node, 'revoke')}><Ban size={15} /> Revoke</button></div>}
        </div></article>)}</div>
      <div className="work-graph-primary-actions">{draft.status === 'draft' && <><button data-control-id="work-graph.plan.save" className="secondary-button" type="button" disabled={busy} onClick={() => void savePlan()}><Check size={16} /> Save edits</button><button data-control-id="work-graph.plan.approve" className="primary-button" type="button" disabled={busy} onClick={() => void approve()}><ShieldCheck size={16} /> 3. Approve exact plan</button></>}{['approved', 'running', 'blocked'].includes(draft.status) && <button data-control-id="work-graph.nodes.run-ready" className="primary-button" type="button" disabled={busy || !draft.nodes.some((node) => ['ready', 'failed', 'cancelled'].includes(node.status))} onClick={() => void runReady()}><Play size={16} /> 4. Run ready work</button>}{draft.status === 'blocked' && <button data-control-id="work-graph.plan.recover" className="secondary-button" type="button" disabled={busy} onClick={() => api && void run(() => api.getGoalWorkGraphState())}><RotateCcw size={16} /> Recheck lifecycle</button>}</div>
    </>}
  </section>;
}

function resolveActor(state: OrganizationAuthorityState): { humanId: string; authority: { membership_id: string; human_proof_id: string; authority_credential_id: string } } | undefined {
  const now = Date.now();
  for (const assurance of state.assurance) {
    const membership = state.memberships.find((item) => item.membership_id === assurance.membership_id && item.status === 'active');
    const credential = state.credentials.find((item) => item.membership_id === membership?.membership_id && item.status === 'active' && new Date(item.expires_at).getTime() > now);
    if (membership && credential) return { humanId: membership.human_id, authority: { membership_id: membership.membership_id, human_proof_id: assurance.human_proof_id, authority_credential_id: credential.credential_id } };
  }
  return undefined;
}
function dependencies(graph: WorkGraph, nodeId: string): string[] { return graph.dependency_edges.filter((edge) => edge.successor_node_id === nodeId).map((edge) => edge.predecessor_node_id); }
function lines(value: string): string[] { return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean); }
function Fact({ label, value }: { label: string; value: string }): React.JSX.Element { return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>; }
