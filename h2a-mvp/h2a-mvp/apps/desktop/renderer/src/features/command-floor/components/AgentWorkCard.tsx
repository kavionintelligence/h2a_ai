import { AlertCircle, CheckCircle2, LoaderCircle, Radio } from 'lucide-react';
import type { AgentRuntimeSummary } from '@h2a/contracts';

interface AgentWorkCardProps {
  agent: AgentRuntimeSummary;
  selected: boolean;
  onSelect(): void;
}

const statusDetails = {
  working: { label: 'Working', icon: LoaderCircle },
  ready: { label: 'Ready', icon: Radio },
  'approval-required': { label: 'Approval required', icon: AlertCircle },
  blocked: { label: 'Blocked', icon: AlertCircle },
  offline: { label: 'Offline', icon: CheckCircle2 }
} as const;

export function AgentWorkCard({ agent, selected, onSelect }: AgentWorkCardProps): React.JSX.Element {
  const status = statusDetails[agent.status];
  const StatusIcon = status.icon;

  return (
    <button
      type="button"
      className={`agent-card ${selected ? 'agent-card-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="agent-card-top">
        <span className="agent-avatar" style={{ '--agent-accent': agent.accent } as React.CSSProperties}>{agent.initials}</span>
        <span className={`agent-status agent-status-${agent.status}`}>
          <StatusIcon size={14} aria-hidden="true" /> {status.label}
        </span>
      </div>
      <div className="agent-identity">
        <strong>{agent.name}</strong>
        <span>{agent.role}</span>
      </div>
      <div className="provider-line"><span>{agent.providerLabel}</span><span>{agent.model}</span></div>
      <p className="agent-action">{agent.currentAction}</p>
      <div className="progress-track" aria-label={`${agent.progress}% complete`}>
        <span style={{ width: `${agent.progress}%`, backgroundColor: agent.accent }} />
      </div>
      <div className="agent-card-footer"><span>{agent.mandateId}</span><span>{agent.progress}%</span></div>
    </button>
  );
}
