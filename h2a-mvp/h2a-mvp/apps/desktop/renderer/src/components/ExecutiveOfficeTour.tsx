import { ExternalLink, Route } from 'lucide-react';
import type { OfficeEntityKind, OfficeState } from '@h2a/contracts';

interface Chapter {
  id: string;
  title: string;
  summary: string;
  kinds: OfficeEntityKind[];
}

const chapters: Chapter[] = [
  { id: 'identity', title: 'Human to agent', summary: 'Human, Passport, and runtime attribution', kinds: ['human', 'passport', 'agent'] },
  { id: 'authority', title: 'Bounded authority', summary: 'Mandates, assignment, and approval state', kinds: ['assignment', 'approval'] },
  { id: 'execution', title: 'Provider execution', summary: 'Official provider and framework processes', kinds: ['provider', 'framework-agent', 'runtime-session'] },
  { id: 'context', title: 'Least context', summary: 'Released fields and withheld material', kinds: ['context-grant', 'handoff'] },
  { id: 'collaboration', title: 'Signed handoffs', summary: 'Messages and predecessor hashes', kinds: ['message', 'handoff'] },
  { id: 'federation', title: 'Multi-node exchange', summary: 'Pinned peers and bounded envelopes', kinds: ['federation-peer', 'federation-envelope'] },
  { id: 'evidence', title: 'Evidence chain', summary: 'One trace across every control plane', kinds: ['trace', 'alert'] }
];

export function ExecutiveOfficeTour({ office, selectedEntityId, onSelect, onOpenTrace }: { office: OfficeState; selectedEntityId?: string; onSelect(entityId: string): void; onOpenTrace(traceId: string): void }): React.JSX.Element {
  const activeTrace = office.active_trace_id;
  return (
    <section className="executive-tour" aria-labelledby="executive-tour-title">
      <header><div><p className="eyebrow">EXECUTIVE TOUR</p><h2 id="executive-tour-title">One governed work story</h2></div><button data-control-id="office.tour.open-trace" type="button" className="secondary-button" disabled={!activeTrace} onClick={() => activeTrace && onOpenTrace(activeTrace)} title={activeTrace ? 'Open this trace in Control Evidence' : 'No active trace is available'}><ExternalLink size={14} /> Technical trace</button></header>
      <ol>{chapters.map((chapter, index) => {
        const entities = office.entities.filter((entity) => chapter.kinds.includes(entity.kind));
        const selected = entities.find((entity) => entity.entity_id === selectedEntityId) ?? entities.find((entity) => entity.trace_id === activeTrace) ?? entities[0];
        return <li key={chapter.id}><button data-control-id="office.tour.chapter" type="button" disabled={!selected} aria-current={selected?.entity_id === selectedEntityId ? 'step' : undefined} onClick={() => selected && onSelect(selected.entity_id)}><span>{index + 1}</span><div><strong>{chapter.title}</strong><small>{selected ? `${chapter.summary} · ${selected.status}` : `${chapter.summary} · prerequisite missing`}</small></div><Route size={14} aria-hidden="true" /></button></li>;
      })}</ol>
    </section>
  );
}
