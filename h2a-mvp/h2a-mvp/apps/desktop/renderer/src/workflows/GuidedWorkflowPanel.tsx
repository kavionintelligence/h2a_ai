import { ArrowRight, CheckCircle2, RotateCcw, Route } from 'lucide-react';
import type { GuidedWorkflowAction, GuidedWorkflowId, GuidedWorkflowState } from '@h2a/contracts';

interface Props {
  state: GuidedWorkflowState;
  disabled: boolean;
  onSelect(workflowId: GuidedWorkflowId): void;
  onContinue(action: GuidedWorkflowAction): void;
}

export function GuidedWorkflowPanel({ state, disabled, onSelect, onContinue }: Props): React.JSX.Element {
  const selected = state.workflows.find((workflow) => workflow.workflow_id === state.selected_workflow_id);
  const action = state.next_action;
  return (
    <div className="guided-workflow-dock" data-workflow-id={state.selected_workflow_id} data-step-id={state.active_step?.step_id ?? 'complete'}>
      <label className="guided-workflow-picker">
        <span>Guided workflow</span>
        <select aria-label="Guided workflow" value={state.selected_workflow_id} disabled={disabled} onChange={(event) => onSelect(event.target.value as GuidedWorkflowId)}>
          {state.workflows.map((workflow) => <option key={workflow.workflow_id} value={workflow.workflow_id}>{workflow.title} · {workflow.completed_steps}/{workflow.total_steps}</option>)}
        </select>
      </label>
      <div className="guided-workflow-next" role="status" aria-live="polite">
        {action && state.active_step ? <>
          <span className={`guided-step-state guided-step-state-${state.active_step.status}`}><Route size={15} aria-hidden="true" /> {state.active_step.title}</span>
          <strong>{action.reason}</strong>
          <small>Next destination: {destinationLabel(action.destination)} · {state.active_step.reason_code}</small>
        </> : <>
          <span className="guided-step-state guided-step-state-succeeded"><CheckCircle2 size={15} aria-hidden="true" /> Workflow complete</span>
          <strong>{selected?.title} is complete from persisted canonical state.</strong>
          <small>Select another workflow to continue the demonstration.</small>
        </>}
      </div>
      {action ? <button data-control-id="office.workflow.continue" className="guided-workflow-action" type="button" disabled={disabled} onClick={() => onContinue(action)}>
        {action.kind === 'retry' ? <RotateCcw size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
        <span>{action.label}</span>
      </button> : <span className="guided-workflow-complete" aria-label="Selected workflow complete"><CheckCircle2 size={20} /></span>}
    </div>
  );
}

function destinationLabel(destination: GuidedWorkflowAction['destination']): string {
  return destination.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
}
