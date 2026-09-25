import { useEffect, useMemo, useState } from 'react';
import { ClipboardPlus } from 'lucide-react';
import type { AgentRuntimeSummary, CollaborationState, WorkAssignmentSummary } from '@h2a/contracts';
import { ModalDialog } from '@h2a/ui';

interface CreateAssignmentDialogProps {
  open: boolean;
  agents: AgentRuntimeSummary[];
  assignments: WorkAssignmentSummary[];
  onClose(): void;
  onCreated(state: CollaborationState, assignmentId: string): void;
}

export function CreateAssignmentDialog({ open, agents, assignments, onClose, onCreated }: CreateAssignmentDialogProps): React.JSX.Element {
  const availableAgents = useMemo(() => agents.filter((agent) => agent.status !== 'offline'), [agents]);
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [risk, setRisk] = useState<'standard' | 'sensitive' | 'restricted'>('standard');
  const [priority, setPriority] = useState(3);
  const [requestedAction, setRequestedAction] = useState('');
  const [dependencyId, setDependencyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setAssigneeId((current) => availableAgents.some((agent) => agent.id === current) ? current : availableAgents[0]?.id ?? '');
    setError('');
  }, [availableAgents, open]);

  async function submit(): Promise<void> {
    if (!window.h2a) return;
    setBusy(true);
    setError('');
    try {
      const state = await window.h2a.createAssignment({
        title,
        objective,
        assigneeId,
        risk,
        priority,
        dependsOn: dependencyId ? [dependencyId] : [],
        requestedAction: requestedAction.trim() || undefined
      });
      const created = state.workplace.assignments.at(-1);
      setTitle('');
      setObjective('');
      setRequestedAction('');
      setDependencyId('');
      if (created) onCreated(state, created.id);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Assignment creation failed.');
    } finally {
      setBusy(false);
    }
  }

  const valid = title.trim().length >= 3 && objective.trim().length >= 8 && assigneeId.length > 0;

  return (
    <ModalDialog
      open={open}
      title="Create assignment"
      description="Add operational work to the local ledger and route it to a named agent."
      onClose={onClose}
      footer={<><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button data-control-id="command-floor.assignment.create" className="primary-button" type="button" disabled={!valid || busy || !window.h2a} onClick={() => void submit()}><ClipboardPlus size={16} />{busy ? 'Creating...' : 'Create assignment'}</button></>}
    >
      <div className="assignment-form">
        <label className="form-field form-field-wide"><span>Title</span><input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="form-field form-field-wide"><span>Objective</span><textarea value={objective} maxLength={1000} rows={4} onChange={(event) => setObjective(event.target.value)} /></label>
        <label className="form-field"><span>Assignee</span><select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>{availableAgents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name} - {agent.role}</option>)}</select></label>
        <label className="form-field"><span>Risk</span><select value={risk} onChange={(event) => setRisk(event.target.value as typeof risk)}><option value="standard">Standard</option><option value="sensitive">Sensitive</option><option value="restricted">Restricted</option></select></label>
        <label className="form-field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>P{value}{value === 1 ? ' - Critical' : value === 5 ? ' - Low' : ''}</option>)}</select></label>
        <label className="form-field"><span>Depends on</span><select value={dependencyId} onChange={(event) => setDependencyId(event.target.value)}><option value="">No dependency</option>{assignments.map((assignment) => <option value={assignment.id} key={assignment.id}>{assignment.title}</option>)}</select></label>
        <label className="form-field form-field-wide"><span>Requested action <small>optional</small></span><input value={requestedAction} maxLength={240} placeholder="document.read.public" onChange={(event) => setRequestedAction(event.target.value)} /></label>
        <div className="authority-notice form-field-wide"><strong>Operational routing only</strong><span>Phase 6 records and routes work. Phase 7 will evaluate mandate authority before protected execution.</span></div>
        {error && <div className="inline-error form-field-wide" role="alert">{error}</div>}
      </div>
    </ModalDialog>
  );
}
