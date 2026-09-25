import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, GitBranch, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AgentIdentityState, AgentRuntimeSummary, AuthorityApprovalState, ProjectDeliveryState, ProjectRegistration } from '@h2a/contracts';

const empty: ProjectDeliveryState = { projects: [], goals: [], assignments: [], worktrees: [], sources: [], messages: [], validations: [], runs: [], review_bundles: [], integrations: [], trust_ceiling: 'connected-observed' };

export function ProjectDeliveryPanel({ agents, identity, approvals, canonicalState, onStateChange, onApprovalRequested }: { agents: AgentRuntimeSummary[]; identity: AgentIdentityState; approvals: AuthorityApprovalState; canonicalState: ProjectDeliveryState; onStateChange(state: ProjectDeliveryState): void; onApprovalRequested(state: AuthorityApprovalState): void }): React.JSX.Element {
  const api = window.h2a;
  const [state, setState] = useState<ProjectDeliveryState>(empty);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [root, setRoot] = useState(''); const [name, setName] = useState('Website delivery');
  const [objective, setObjective] = useState('Design and implement a polished website with researched, source-backed content.');
  const [selectedProject, setSelectedProject] = useState(''); const [selectedGoal, setSelectedGoal] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState(''); const [assignmentKind, setAssignmentKind] = useState<'edit' | 'research' | 'integration'>('edit');
  const [agentId, setAgentId] = useState(''); const [paths, setPaths] = useState('src/**'); const [hosts, setHosts] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [researchUrl, setResearchUrl] = useState('');
  const [showRegistration, setShowRegistration] = useState(false);
  const [approvalEventId, setApprovalEventId] = useState(''); const [effectHash, setEffectHash] = useState('');
  const [approvalPolicyId, setApprovalPolicyId] = useState('');
  const project = state.projects.find((item) => item.project_id === selectedProject) ?? state.projects[0];
  const goal = state.goals.find((item) => item.goal_id === selectedGoal) ?? state.goals.find((item) => item.project_id === project?.project_id);

  async function run(operation: () => Promise<ProjectDeliveryState>): Promise<void> { setBusy(true); setError(''); try { const next = await operation(); setState(next); onStateChange(next); setSelectedProject((current) => current || next.projects.at(-1)?.project_id || ''); setSelectedGoal((current) => current || next.goals.at(-1)?.goal_id || ''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Project operation failed.'); } finally { setBusy(false); } }
  useEffect(() => { setState(canonicalState); }, [canonicalState]);
  useEffect(() => { if (!approvalPolicyId) setApprovalPolicyId(approvals.policies.find((item) => item.status === 'active')?.approval_policy_id ?? ''); }, [approvalPolicyId, approvals.policies]);
  useEffect(() => {
    if (!goal) return; const bundle = [...state.review_bundles].reverse().find((item) => item.goal_id === goal.goal_id); if (!bundle) return;
    setEffectHash(bundle.effect_hash); const request = [...approvals.requests].reverse().find((item) => item.requested_effect_hash === bundle.effect_hash); if (request) setApprovalEventId(request.approval_request_id);
  }, [approvals.requests, goal, state.review_bundles]);
  const selectedAgent = useMemo(() => agents.find((item) => item.id === agentId) ?? agents[0], [agentId, agents]);

  async function register(): Promise<void> {
    if (!api) return;
    setBusy(true); setError('');
    try {
      const next = await api.registerProject({ display_name: name, root_path: root, protected_paths: ['.git/**', '.env', '.env.*', 'secrets/**'], network_hosts: split(hosts), allowed_commands: [
        { command_id: 'lint', executable: 'pnpm', args: ['lint'] }, { command_id: 'typecheck', executable: 'pnpm', args: ['typecheck'] }, { command_id: 'test', executable: 'pnpm', args: ['test', '--', '--run'] }, { command_id: 'build', executable: 'pnpm', args: ['build'] }
      ] });
      const registered = next.projects.at(-1);
      setState(next); onStateChange(next); setSelectedProject(registered?.project_id ?? ''); setSelectedGoal(''); setShowRegistration(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Project registration failed.'); }
    finally { setBusy(false); }
  }
  async function createGoal(): Promise<void> { if (!api || !project) return; await run(() => api.createProjectGoal({ project_id: project.project_id, objective, expected_outputs: ['Reviewed website diff', 'Source package', 'Passing validation', 'Approved Git integration'], created_by: 'h2a-project-operator', trace_id: `tr_project_${project.project_id}` })); }
  async function createAssignment(): Promise<void> {
    if (!api || !project || !goal || !selectedAgent) return; const binding = identity.bindings.find((item) => item.binding_id === selectedAgent.id); const runtimeSessionId = binding?.live_session_id; if (!runtimeSessionId) { setError('Selected agent needs an active runtime session.'); return; }
    await run(() => api.createProjectAssignment({ goal_id: goal.goal_id, project_id: project.project_id, title: assignmentTitle, objective: assignmentTitle, output_contract: assignmentKind === 'research' ? ['Signed source package with URLs and hashes'] : ['Repository diff within allowed paths'], tool_contract: assignmentKind === 'research' ? ['governed-fetch'] : ['read', 'edit', 'write'], allowed_paths: assignmentKind === 'research' ? [] : split(paths), network_hosts: assignmentKind === 'research' ? split(hosts) : [], validation_commands: assignmentKind === 'research' ? [] : project.allowed_commands.map((item) => item.command_id), depends_on: dependsOn, agent_id: selectedAgent.id, passport_id: selectedAgent.passportId, runtime_session_id: runtimeSessionId, mandate_id: selectedAgent.mandateId, provider: projectProvider(selectedAgent.provider), kind: assignmentKind }));
  }
  async function runConcurrentProviders(): Promise<void> {
    if (!api || !goal) return;
    const eligible = state.assignments.filter((assignment) => assignment.goal_id === goal.goal_id && assignment.kind !== 'research' && state.worktrees.some((lease) => lease.assignment_id === assignment.assignment_id && ['active', 'dirty'].includes(lease.status)) && !state.runs.some((record) => record.assignment_id === assignment.assignment_id && record.status === 'running'));
    await run(async () => { await Promise.all(eligible.map((assignment) => api.runProjectAssignment({ assignment_id: assignment.assignment_id }))); return api.getProjectDeliveryState(); });
  }
  async function prepareEffectHash(): Promise<void> {
    if (!api || !goal) return; setBusy(true); setError('');
    try { setEffectHash(await api.getProjectIntegrationEffectHash(goal.goal_id, state.assignments.filter((item) => item.goal_id === goal.goal_id && item.kind !== 'research').map((item) => item.assignment_id))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Integration effect preparation failed.'); }
    finally { setBusy(false); }
  }
  async function routeIntegrationApproval(): Promise<void> {
    if (!api || !goal || !approvalPolicyId) return; setBusy(true); setError('');
    try {
      const assignmentIds = state.assignments.filter((item) => item.goal_id === goal.goal_id && item.kind !== 'research').map((item) => item.assignment_id);
      const next = await api.requestProjectIntegrationApproval({ goal_id: goal.goal_id, assignment_ids: assignmentIds, approval_policy_id: approvalPolicyId });
      const request = [...next.requests].reverse().find((item) => item.task_id === assignmentIds[0]); if (!request) throw new Error('Project integration approval request was not persisted.');
      setEffectHash(request.requested_effect_hash); setApprovalEventId(request.approval_request_id); onApprovalRequested(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Project approval routing failed.'); }
    finally { setBusy(false); }
  }

  return <section className="project-delivery" aria-labelledby="project-delivery-title">
    <header><div><p className="section-kicker">PHASE 40 / GOVERNED DELIVERY</p><h2 id="project-delivery-title">Multi-agent project delivery</h2><p>Signed goals, isolated Git worktrees, bounded research, validation receipts, and human-approved integration.</p></div><div className="project-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setShowRegistration(true)}><Plus size={16} /> New project</button><button data-control-id="project.refresh" className="icon-button" type="button" aria-label="Refresh project delivery" title="Refresh project delivery" disabled={busy || !api} onClick={() => api && void run(() => api.getProjectDeliveryState())}><RefreshCw size={17} /></button></div></header>
    <div className="project-trust"><ShieldCheck size={16} /><span>Trust</span><strong>Connected-observed ceiling</strong><span>{state.projects.length} projects · {state.assignments.length} assignments</span></div>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {showRegistration || !project ? <form className="project-form" onSubmit={(event) => event.preventDefault()}><label>Project name<input value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="wide">Canonical local Git root<input value={root} onChange={(event) => setRoot(event.target.value)} placeholder="C:\projects\website" required /></label><label>Approved research hosts<input value={hosts} onChange={(event) => setHosts(event.target.value)} placeholder="example.com, hp.com" /></label><div className="project-actions">{project && <button className="secondary-button" type="button" onClick={() => setShowRegistration(false)}>Cancel</button>}<button data-control-id="project.register" className="primary-button" disabled={busy || !name.trim() || !root.trim()} type="button" onClick={() => void register()}><Plus size={16} /> Register project</button></div></form> : <>
      {state.projects.length > 1 && <label className="project-selector">Project<select value={project.project_id} onChange={(event) => { setSelectedProject(event.target.value); setSelectedGoal(''); }} >{state.projects.map((item) => <option key={item.project_id} value={item.project_id}>{item.display_name}</option>)}</select></label>}
      <ProjectSummary project={project} />
      {!goal ? <form className="project-form" onSubmit={(event) => event.preventDefault()}><label className="wide">Root goal<textarea value={objective} onChange={(event) => setObjective(event.target.value)} /></label><button data-control-id="project.goal.sign" className="primary-button" disabled={busy || !objective.trim()} type="button" onClick={() => void createGoal()}><GitBranch size={16} /> Sign root goal</button></form> : <>
        <div className="project-goal"><strong>{goal.objective}</strong><code>{goal.signature.canonicalHash}</code></div>
        <form className="project-form" onSubmit={(event) => { event.preventDefault(); void createAssignment(); }}>
          <label>Assignment title<input value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} required /></label>
          <label>Kind<select value={assignmentKind} onChange={(event) => setAssignmentKind(event.target.value as typeof assignmentKind)}><option value="edit">UI/content editing</option><option value="research">Content research</option><option value="integration">Content integration</option></select></label>
          <label>Agent<select value={selectedAgent?.id ?? ''} onChange={(event) => setAgentId(event.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.provider}</option>)}</select></label>
          {assignmentKind === 'research' ? <label>Approved hosts<input value={hosts} onChange={(event) => setHosts(event.target.value)} /></label> : <label>Allowed paths<input value={paths} onChange={(event) => setPaths(event.target.value)} /></label>}
          {assignmentKind !== 'research' && <label className="wide">Source dependencies<select multiple value={dependsOn} onChange={(event) => setDependsOn([...event.currentTarget.selectedOptions].map((option) => option.value))}>{state.assignments.filter((item) => item.goal_id === goal.goal_id && item.kind === 'research').map((item) => <option key={item.assignment_id} value={item.assignment_id}>{item.title}</option>)}</select></label>}
          <button data-control-id="project.assignment.sign" className="secondary-button" disabled={busy || agents.length === 0} type="submit"><Plus size={16} /> Add signed assignment</button>
        </form>
        {state.assignments.filter((assignment) => assignment.goal_id === goal.goal_id && assignment.kind !== 'research' && state.worktrees.some((lease) => lease.assignment_id === assignment.assignment_id && ['active', 'dirty'].includes(lease.status))).length >= 2 && <div className="project-batch-actions"><button data-control-id="project.providers.run-concurrent" className="primary-button" type="button" disabled={busy} onClick={() => void runConcurrentProviders()}>Run ready providers concurrently</button><span>Each provider remains isolated in its assignment-owned worktree.</span></div>}
        <div className="project-assignment-list">{state.assignments.filter((item) => item.goal_id === goal.goal_id).map((assignment) => {
          const lease = state.worktrees.find((item) => item.assignment_id === assignment.assignment_id); const sources = state.sources.filter((item) => item.assignment_id === assignment.assignment_id);
          const receipts = state.validations.filter((item) => item.assignment_id === assignment.assignment_id);
          const runs = state.runs.filter((item) => item.assignment_id === assignment.assignment_id);
          return <article key={assignment.assignment_id}><div><span className={`status-chip status-${assignment.status}`}>{assignment.status}</span><h3>{assignment.title}</h3><code>{assignment.provider} · {assignment.assignment_id}</code></div><dl><div><dt>Scope</dt><dd>{assignment.allowed_paths.join(', ') || 'No filesystem write'}</dd></div><div><dt>Worktree</dt><dd>{lease?.status ?? 'Not leased'}</dd></div><div><dt>Changed</dt><dd>{lease?.changed_files.length ?? 0}</dd></div><div><dt>Evidence</dt><dd>{sources.length} sources · {receipts.filter((item) => item.status === 'passed').length} validations</dd></div></dl>{lease?.changed_files.length ? <ul className="project-file-list">{lease.changed_files.map((file) => <li key={file}><code>{file}</code></li>)}</ul> : null}{sources.map((source) => <div className="project-receipt" key={source.source_id}><strong>{source.title}</strong><a href={source.url} target="_blank" rel="noreferrer">{source.host}</a><code>{source.content_hash}</code></div>)}{runs.map((runRecord) => <div className="project-receipt" key={runRecord.run_id}><strong>Provider run · {runRecord.status}</strong><code>{runRecord.output_hash ?? runRecord.prompt_hash}</code>{runRecord.reason_code && <span>{runRecord.reason_code}</span>}</div>)}{receipts.map((receipt) => <div className="project-receipt" key={receipt.receipt_id}><strong>{receipt.command_id} · {receipt.status}</strong><code>{receipt.output_hash}</code></div>)}<div className="project-actions">
            {api && assignment.kind !== 'research' && !lease && <button data-control-id="project.worktree.lease" className="secondary-button" type="button" disabled={busy} onClick={() => void run(() => api.createProjectWorktree(assignment.assignment_id))}>Lease worktree</button>}
            {api && lease && <button data-control-id="project.worktree.inspect" className="secondary-button" type="button" disabled={busy} onClick={() => void run(() => api.refreshProjectWorktree(assignment.assignment_id))}>Inspect Git</button>}
            {api && lease && assignment.kind !== 'research' && !runs.some((item) => item.status === 'running') && <button data-control-id="project.provider.run" className="primary-button" type="button" disabled={busy || !['active', 'dirty'].includes(lease.status)} onClick={() => void run(() => api.runProjectAssignment({ assignment_id: assignment.assignment_id }))}>Run provider</button>}
            {api && runs.filter((item) => item.status === 'running').map((runRecord) => <button data-control-id="project.provider.cancel" key={runRecord.run_id} className="danger-button" type="button" onClick={() => void run(() => api.cancelProjectRun({ run_id: runRecord.run_id, reason: 'Operator cancelled project assignment' }))}>Cancel run</button>)}
            {api && lease?.status === 'integrated' && <button data-control-id="project.worktree.cleanup" className="secondary-button" type="button" disabled={busy} onClick={() => void run(() => api.cleanupProjectWorktree(assignment.assignment_id))}>Clean integrated worktree</button>}
            {api && lease && assignment.validation_commands.map((command) => <button data-control-id="project.validation.run" key={command} className="secondary-button" type="button" disabled={busy} onClick={() => void run(() => api.runProjectValidation({ assignment_id: assignment.assignment_id, command_id: command }))}>{command}</button>)}
            {api && assignment.kind === 'research' && <><input aria-label={`Research URL for ${assignment.title}`} value={researchUrl} onChange={(event) => setResearchUrl(event.target.value)} placeholder="https://approved-source.example/page" /><button data-control-id="project.research.fetch" className="secondary-button" type="button" disabled={busy || !researchUrl} onClick={() => void run(() => api.fetchProjectResearch({ assignment_id: assignment.assignment_id, url: researchUrl, classification: 'public' }))}><ExternalLink size={15} /> Fetch source</button></>}
          </div></article>;
        })}</div>
        {state.messages.some((item) => item.goal_id === goal.goal_id) && <section className="project-mailbox"><h3>Signed collaboration mailbox</h3>{state.messages.filter((item) => item.goal_id === goal.goal_id).map((item) => <div key={item.message_id}><span>{item.kind}</span><strong>{item.subject}</strong><code>{item.body_hash}</code></div>)}</section>}
        {state.integrations.some((item) => item.goal_id === goal.goal_id) && <section className="project-mailbox"><h3>Accepted integration</h3>{state.integrations.filter((item) => item.goal_id === goal.goal_id).map((item) => <div key={item.integration_id}><span>{item.status}</span><strong><code>{item.integrated_commit}</code></strong><code>{item.signature.canonicalHash}</code></div>)}</section>}
        {api && state.worktrees.some((item) => state.assignments.some((assignment) => assignment.goal_id === goal.goal_id && assignment.assignment_id === item.assignment_id)) && <form className="project-integration" onSubmit={(event) => event.preventDefault()}><div><p className="section-kicker">HUMAN INTEGRATION GATE</p><h3>Approve exact repository effect</h3><p>A signed review bundle binds current Git diffs and validation receipts to the independent Authority Inbox decision.</p></div><button data-control-id="project.integration.prepare" className="secondary-button" type="button" disabled={busy} onClick={() => void prepareEffectHash()}>Prepare exact effect</button><label>Approval policy<select value={approvalPolicyId} onChange={(event) => setApprovalPolicyId(event.target.value)}><option value="">Select active policy</option>{approvals.policies.filter((item) => item.status === 'active').map((policy) => <option key={policy.approval_policy_id} value={policy.approval_policy_id}>{policy.name}</option>)}</select></label><button data-control-id="project.integration.route-approval" className="secondary-button" type="button" disabled={busy || !approvalPolicyId} onClick={() => void routeIntegrationApproval()}>Route exact approval</button><label>Approval request ID<input value={approvalEventId} readOnly placeholder="Route through Authority Inbox" /></label><label>Expected effect hash<input value={effectHash} readOnly placeholder="Prepare from current diffs" /></label><button data-control-id="project.integration.approve" className="primary-button" type="button" disabled={busy || !approvalEventId || !/^sha256:[0-9a-f]{64}$/u.test(effectHash)} onClick={() => void run(() => api.integrateProject({ goal_id: goal.goal_id, assignment_ids: state.assignments.filter((item) => item.goal_id === goal.goal_id && item.kind !== 'research').map((item) => item.assignment_id), approval_event_id: approvalEventId, expected_effect_hash: effectHash }))}><ShieldCheck size={16} /> Verify approval and integrate</button></form>}
      </>}
    </>}
  </section>;
}

function ProjectSummary({ project }: { project: ProjectRegistration }): React.JSX.Element { return <div className="project-summary"><div><span>Project</span><strong>{project.display_name}</strong><code title={project.canonical_root}>{project.canonical_root}</code></div><div><span>Repository</span><strong>{project.repository_mode}</strong><code>{project.base_branch ?? 'No branch'} · {project.base_revision?.slice(0, 12) ?? 'No revision'}</code></div><div><span>Boundaries</span><strong>{project.protected_paths.length} protected</strong><code>{project.allowed_commands.length} allowed commands</code></div>{project.repository_mode === 'read-only-non-git' && <div className="project-warning"><CheckCircle2 size={16} /> Read-only fallback</div>}</div>; }
function split(value: string): string[] { return value.split(',').map((item) => item.trim()).filter(Boolean); }
function projectProvider(provider: AgentRuntimeSummary['provider']): 'claude-code' | 'openai-codex' | 'gemini-antigravity' | 'custom-cli' { return provider === 'claude-code' || provider === 'openai-codex' || provider === 'gemini-antigravity' ? provider : 'custom-cli'; }

export function ProjectDeliveryOfficeSummary({ state }: { state: ProjectDeliveryState }): React.JSX.Element {
  const active = state.assignments.filter((item) => ['ready', 'working', 'review', 'blocked'].includes(item.status));
  return <section className="office-project-summary" aria-label="Governed project delivery"><div><GitBranch size={17} /><strong>Project delivery</strong><span>{state.projects.length === 0 ? 'No registered project' : `${active.length} active assignments`}</span></div><div>{active.slice(0, 4).map((item) => <span key={item.assignment_id} className={`status-chip status-${item.status}`}>{item.title}: {item.status}</span>)}</div></section>;
}
