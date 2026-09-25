import { ChevronRight, MessageSquareText } from 'lucide-react';
import type { AgentRuntimeSummary, AssignmentStatus, WorkAssignmentSummary } from '@h2a/contracts';
import { StatePanel } from '@h2a/ui';

interface WorkAssignmentKanbanProps {
  assignments: WorkAssignmentSummary[];
  agents: AgentRuntimeSummary[];
  selectedAssignmentId: string;
  onAssignmentSelect(id: string): void;
}

const columns: Array<{ status: AssignmentStatus; label: string }> = [
  { status: 'queued', label: 'Queued' },
  { status: 'active', label: 'Active' },
  { status: 'approval', label: 'Approval' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'complete', label: 'Complete' }
];

export function WorkAssignmentKanban({ assignments, agents, selectedAssignmentId, onAssignmentSelect }: WorkAssignmentKanbanProps): React.JSX.Element {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  return (
    <section className="assignment-board" aria-labelledby="assignment-title">
      <div className="panel-heading">
        <div><p className="section-kicker">WORK ASSIGNMENTS</p><h2 id="assignment-title">Collaboration ledger</h2></div>
        <span className="board-count">{assignments.length} assignments</span>
      </div>
      {assignments.length === 0 ? (
        <StatePanel
          title="No work assignments"
          description="The assignment ledger is empty for the current workplace snapshot."
          compact
        />
      ) : <div className="kanban-grid">
        {columns.map((column) => {
          const items = assignments.filter((assignment) => assignment.status === column.status);
          return (
            <div className="kanban-column" key={column.status}>
              <div className="kanban-heading"><span>{column.label}</span><span>{items.length}</span></div>
              <div className="kanban-stack">
                {items.map((assignment) => {
                  const agent = agentById.get(assignment.assigneeId);
                  return (
                    <button
                      type="button"
                      className={`assignment-card ${selectedAssignmentId === assignment.id ? 'assignment-card-selected' : ''}`}
                      key={assignment.id}
                      onClick={() => onAssignmentSelect(assignment.id)}
                    >
                      <span className={`risk-label risk-${assignment.risk}`}>{assignment.risk}</span>
                      <span className="assignment-card-title"><strong>{assignment.title}</strong><b>P{assignment.priority}</b></span>
                      <span className="assignment-objective">{assignment.objective}</span>
                      <span className="assignment-card-meta"><span className="mono">{assignment.id}</span><span><MessageSquareText size={12} />{assignment.messageCount + assignment.responseCount}</span></span>
                      <span className="assignment-assignee">
                        <span className="mini-avatar" style={{ '--agent-accent': agent?.accent ?? '#667085' } as React.CSSProperties}>{agent?.initials}</span>
                        <span>{agent?.name}</span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>}
    </section>
  );
}
