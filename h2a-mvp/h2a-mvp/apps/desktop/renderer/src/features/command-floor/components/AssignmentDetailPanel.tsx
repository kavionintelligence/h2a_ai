import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, MessageSquareText, Send, Undo2 } from 'lucide-react';
import type { AgentRuntimeSummary, AssignmentResponse, AssignmentStatus, CollaborationMessage, CollaborationState, WorkAssignmentSummary } from '@h2a/contracts';

interface AssignmentDetailPanelProps {
  assignment?: WorkAssignmentSummary;
  agents: AgentRuntimeSummary[];
  messages: CollaborationMessage[];
  responses: AssignmentResponse[];
  onStateChange(state: CollaborationState): void;
}

const transitions: Record<AssignmentStatus, AssignmentStatus[]> = {
  queued: ['active', 'blocked'],
  active: ['approval', 'blocked', 'complete'],
  approval: ['active', 'blocked'],
  blocked: ['queued', 'active'],
  complete: ['active']
};

export function AssignmentDetailPanel({ assignment, agents, messages, responses, onStateChange }: AssignmentDetailPanelProps): React.JSX.Element {
  const [assigneeId, setAssigneeId] = useState(assignment?.assigneeId ?? '');
  const [response, setResponse] = useState('');
  const [toAgentId, setToAgentId] = useState('');
  const [messageAct, setMessageAct] = useState<'request' | 'inform' | 'propose' | 'query' | 'response' | 'handoff'>('inform');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const assignee = agents.find((agent) => agent.id === assignment?.assigneeId);
  const assignmentMessages = useMemo(() => messages.filter((item) => item.assignmentId === assignment?.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [assignment?.id, messages]);
  const assignmentResponses = useMemo(() => responses.filter((item) => item.assignmentId === assignment?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [assignment?.id, responses]);

  useEffect(() => {
    setAssigneeId(assignment?.assigneeId ?? '');
    setToAgentId((current) => agents.some((agent) => agent.id === current && agent.id !== assignment?.assigneeId) ? current : agents.find((agent) => agent.id !== assignment?.assigneeId && agent.status !== 'offline')?.id ?? '');
    setError('');
  }, [agents, assignment?.assigneeId, assignment?.id]);

  async function run(operation: () => Promise<CollaborationState>): Promise<void> {
    setBusy(true); setError('');
    try { onStateChange(await operation()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Collaboration update failed.'); }
    finally { setBusy(false); }
  }

  if (!assignment) return <div className="inspector-empty"><CheckCircle2 size={20} /><strong>Select an assignment</strong><span>Inspect its routing, responses, messages, and authority references.</span></div>;

  return (
    <div className="assignment-inspector-body">
      <div className="assignment-inspector-title"><div><span className={`risk-label risk-${assignment.risk}`}>{assignment.risk}</span><h3>{assignment.title}</h3></div><span className={`assignment-state assignment-state-${assignment.status}`}>{assignment.status}</span></div>
      <p className="assignment-objective-detail">{assignment.objective}</p>
      <dl className="assignment-facts">
        <div><dt>Assignment</dt><dd className="mono">{assignment.id}</dd></div>
        <div><dt>Mandate reference</dt><dd className="mono">{assignment.mandateId}</dd></div>
        <div><dt>Priority</dt><dd>P{assignment.priority}</dd></div>
        <div><dt>Updated</dt><dd>{formatTime(assignment.updatedAt)}</dd></div>
      </dl>
      <div className="authority-inline"><strong>{assignment.mandateId === 'mnd_unassigned' ? 'Mandate required' : 'Mandate reference present'}</strong><span>{assignment.mandateId === 'mnd_unassigned' ? 'Protected execution must remain blocked until Phase 7 issues authority.' : 'Reference is visible; policy validation arrives in Phase 7.'}</span></div>

      <section className="inspector-section"><div className="inspector-section-heading"><h4>Routing</h4><span>{assignee?.providerLabel}</span></div><div className="inline-control"><select aria-label="Assignment assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>{agents.filter((agent) => agent.status !== 'offline').map((agent) => <option value={agent.id} key={agent.id}>{agent.name} - {agent.role}</option>)}</select><button data-control-id="command-floor.assignment.update" type="button" disabled={busy || assigneeId === assignment.assigneeId || !window.h2a} onClick={() => void run(() => window.h2a!.updateAssignment({ assignmentId: assignment.id, assigneeId }))}>Reassign</button></div><div className="transition-row">{transitions[assignment.status].map((status) => <button data-control-id="command-floor.assignment.update" type="button" key={status} disabled={busy || !window.h2a} onClick={() => void run(() => window.h2a!.updateAssignment({ assignmentId: assignment.id, status }))}>{status === 'active' && assignment.status === 'complete' ? <Undo2 size={14} /> : <ArrowRight size={14} />}{status}</button>)}</div></section>

      <section className="inspector-section"><div className="inspector-section-heading"><h4>Responses</h4><span>{assignmentResponses.length}</span></div>{assignmentResponses.length === 0 ? <p className="compact-empty">No response has been recorded.</p> : <div className="response-history">{assignmentResponses.map((item) => <article key={item.id}><div><strong>{agentName(agents, item.agentId)}</strong><time>{formatTime(item.createdAt)}</time></div><p>{item.body}</p></article>)}</div>}<label className="form-field compact-field"><span>Record assigned-agent response</span><textarea rows={3} value={response} onChange={(event) => setResponse(event.target.value)} /></label><button data-control-id="command-floor.response.record" className="secondary-button full-command" type="button" disabled={busy || !window.h2a || response.trim().length === 0} onClick={() => void run(async () => { const state = await window.h2a!.recordAssignmentResponse({ assignmentId: assignment.id, agentId: assignment.assigneeId, body: response }); setResponse(''); return state; })}><MessageSquareText size={15} /> Record response</button></section>

      <section className="inspector-section"><div className="inspector-section-heading"><h4>Message thread</h4><span>{assignmentMessages.length}</span></div><div className="message-thread">{assignmentMessages.length === 0 ? <p className="compact-empty">No agent messages for this assignment.</p> : assignmentMessages.map((message) => <article key={message.id}><header><strong>{agentName(agents, message.fromAgentId)}</strong><ArrowRight size={13} /><span>{agentName(agents, message.toAgentId)}</span><time>{formatTime(message.createdAt)}</time></header><b>{message.act}: {message.subject}</b><p>{message.body}</p></article>)}</div><div className="message-composer"><div className="inline-fields"><label><span>To</span><select value={toAgentId} onChange={(event) => setToAgentId(event.target.value)}>{agents.filter((agent) => agent.id !== assignment.assigneeId && agent.status !== 'offline').map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></label><label><span>Intent</span><select value={messageAct} onChange={(event) => setMessageAct(event.target.value as typeof messageAct)}>{['request','inform','propose','query','response','handoff'].map((act) => <option value={act} key={act}>{act}</option>)}</select></label></div><label><span>Subject</span><input value={subject} maxLength={160} onChange={(event) => setSubject(event.target.value)} /></label><label><span>Message</span><textarea rows={3} value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} /></label><button data-control-id="command-floor.message.send" className="primary-button full-command" type="button" disabled={busy || !window.h2a || !toAgentId || !subject.trim() || !body.trim()} onClick={() => void run(async () => { const state = await window.h2a!.sendCollaborationMessage({ assignmentId: assignment.id, fromAgentId: assignment.assigneeId, toAgentId, act: messageAct, subject, body }); setSubject(''); setBody(''); return state; })}><Send size={15} /> Send message</button></div></section>
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
  );
}

function agentName(agents: AgentRuntimeSummary[], id: string): string {
  return agents.find((agent) => agent.id === id)?.name ?? id;
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
}
