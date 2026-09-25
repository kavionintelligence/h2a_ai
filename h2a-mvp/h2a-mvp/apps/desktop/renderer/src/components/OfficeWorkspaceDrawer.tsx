import { ExternalLink, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { OfficeState } from '@h2a/contracts';

export type OfficeWorkspaceId = 'organization' | 'agents' | 'tasks' | 'collaboration' | 'pairing' | 'approvals' | 'context' | 'delivery' | 'security' | 'evidence';

export const officeWorkspaceRoutes: Record<OfficeWorkspaceId, string> = {
  organization: 'people-authority',
  agents: 'command-floor',
  tasks: 'command-floor',
  collaboration: 'command-floor',
  pairing: 'federation',
  approvals: 'authority-inbox',
  context: 'context-broker',
  delivery: 'command-floor',
  security: 'demo-gate',
  evidence: 'evidence'
};

export const officeWorkspaceLabels: Record<OfficeWorkspaceId, string> = {
  organization: 'Live organization',
  agents: 'Agent roster',
  tasks: 'Tasks and work graph',
  collaboration: 'Active collaboration',
  pairing: 'Coworker pairing',
  approvals: 'Approvals',
  context: 'Context',
  delivery: 'Project delivery',
  security: 'Security',
  evidence: 'Evidence'
};

export function OfficeWorkspaceDrawer({ workspace, children, onClose, onTechnicalDetails }: { workspace: OfficeWorkspaceId; children: React.ReactNode; onClose(): void; onTechnicalDetails(): void }): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, workspace]);
  return <div className="office-workspace-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="office-workspace-drawer" role="dialog" aria-modal="true" aria-labelledby="office-workspace-title" data-office-workspace={workspace}>
      <header>
        <div><p className="eyebrow">OFFICE OPERATIONS</p><h2 id="office-workspace-title">{officeWorkspaceLabels[workspace]}</h2></div>
        <div className="office-workspace-actions"><button data-control-id="office.workspace.technical" className="secondary-button" type="button" onClick={onTechnicalDetails}><ExternalLink size={15} /> Technical details</button><button ref={closeRef} data-control-id="office.workspace.close" className="icon-button" type="button" aria-label={`Close ${officeWorkspaceLabels[workspace]}`} title="Close" onClick={onClose}><X size={18} /></button></div>
      </header>
      <div className="office-workspace-content">{children}</div>
    </section>
  </div>;
}

export function OfficeCollaborationWorkspace({ office, onOpenEvidence }: { office: OfficeState; onOpenEvidence(reference: string): void }): React.JSX.Element {
  return <section className="office-collaboration-workspace" aria-label="Canonical collaboration activity">
    <div className="office-workspace-summary"><strong>{office.collaboration.signals.length}</strong><span>signed signals</span><strong>{office.collaboration.portals.filter((item) => item.state === 'active').length}</strong><span>active remote boundaries</span><strong>{office.counts.assignments}</strong><span>persisted assignments</span></div>
    {office.collaboration.signals.length === 0 ? <p className="office-workspace-empty">No persisted collaboration signal is present.</p> : <div className="office-collaboration-table" role="table" aria-label="Signed handoffs and work graph activity">
      {office.collaboration.signals.map((signal) => <article key={signal.signal_id} role="row" className={`office-collaboration-record office-collaboration-record-${signal.status}`}>
        <header><div><span>{signal.kind.replaceAll('-', ' ')}</span><h3>{signal.title}</h3></div><strong>{signal.status}</strong></header>
        <dl><Fact label="Trace" value={signal.trace_id ?? 'No trace'} /><Fact label="From" value={signal.sender_id ?? 'System'} /><Fact label="To" value={signal.recipient_id ?? 'Not assigned'} /><Fact label="Reason" value={signal.reason_code ?? 'No blocking reason'} /><Fact label="Output" value={signal.output_hash ?? 'Awaiting output'} /><Fact label="Predecessors" value={signal.predecessor_hashes.join(', ') || 'None'} /><Fact label="Released" value={signal.released_fields.join(', ') || 'None'} /><Fact label="Withheld" value={signal.withheld_fields.join(', ') || 'None'} /></dl>
        {signal.evidence_refs.length > 0 && <div className="office-workspace-evidence">{signal.evidence_refs.map((reference) => <button data-control-id="office.collaboration.evidence" key={reference} type="button" onClick={() => onOpenEvidence(reference)}><code>{reference}</code><ExternalLink size={13} /></button>)}</div>}
      </article>)}
    </div>}
    <section className="office-remote-boundaries"><h3>Remote boundaries</h3>{office.collaboration.portals.length === 0 ? <p>No paired node is present.</p> : office.collaboration.portals.map((portal) => <div key={portal.peer_id}><span className={`office-boundary-state office-boundary-state-${portal.state}`} /><strong>{portal.label}</strong><code>{portal.key_fingerprint}</code><span>{portal.state.replaceAll('-', ' ')} · maximum {portal.maximum_context_fields} context fields</span>{portal.last_reason_code && <small>{portal.last_reason_code}</small>}</div>)}</section>
  </section>;
}

function Fact({ label, value }: { label: string; value: string }): React.JSX.Element { return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>; }
