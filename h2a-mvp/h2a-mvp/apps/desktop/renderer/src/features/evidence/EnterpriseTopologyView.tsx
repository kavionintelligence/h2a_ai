import { useMemo, useState } from 'react';
import { Boxes, CheckCircle2, CircleDot, CloudCog, GitBranch, Network, ShieldQuestion } from 'lucide-react';
import type { EnterpriseEntityKind, EnterpriseOverviewState } from '@h2a/contracts';
import { StatusBadge } from '@h2a/ui';

type View = 'topology' | 'traces' | 'claims' | 'seams';

export function EnterpriseTopologyView({ state }: { state: EnterpriseOverviewState }): React.JSX.Element {
  const [view, setView] = useState<View>('topology');
  const [kind, setKind] = useState<EnterpriseEntityKind | 'all'>('all');
  const nodes = useMemo(() => kind === 'all' ? state.nodes : state.nodes.filter((node) => node.kind === kind), [kind, state.nodes]);
  const completeTraces = state.traces.filter((trace) => trace.resolution_status === 'complete').length;
  return <div className="enterprise-observability">
    <section className="enterprise-summary" aria-label="Enterprise control plane posture">
      <Summary label="Topology entities" value={state.nodes.length} detail={`${state.edges.length} verified relationships`} />
      <Summary label="Evidence traces" value={state.traces.length} detail={`${completeTraces} completely resolved`} />
      <Summary label="Healthy connectors" value={state.posture.healthy_connectors} detail={`${state.posture.live_processes} live processes`} />
      <Summary label="Trust ceiling" value={state.posture.trust_modes.governed} detail={`${state.posture.trust_modes['connected-observed']} connected-observed`} />
    </section>
    <div className="enterprise-tabs" role="tablist" aria-label="Enterprise evidence views">
      <button type="button" role="tab" aria-selected={view === 'topology'} className={view === 'topology' ? 'active' : ''} onClick={() => setView('topology')}><Network size={15} />Topology</button>
      <button type="button" role="tab" aria-selected={view === 'traces'} className={view === 'traces' ? 'active' : ''} onClick={() => setView('traces')}><GitBranch size={15} />Trace coverage</button>
      <button type="button" role="tab" aria-selected={view === 'claims'} className={view === 'claims' ? 'active' : ''} onClick={() => setView('claims')}><ShieldQuestion size={15} />Claim challenges</button>
      <button type="button" role="tab" aria-selected={view === 'seams'} className={view === 'seams' ? 'active' : ''} onClick={() => setView('seams')}><CloudCog size={15} />Replacement seams</button>
    </div>
    {view === 'topology' && <Topology state={state} nodes={nodes} kind={kind} onKindChange={setKind} />}
    {view === 'traces' && <TraceCoverage state={state} />}
    {view === 'claims' && <ClaimChallenges state={state} />}
    {view === 'seams' && <ReplacementSeams state={state} />}
  </div>;
}

export function EnterpriseCommandPosture({ state }: { state: EnterpriseOverviewState }): React.JSX.Element {
  const observed = state.posture.trust_modes['connected-observed'];
  return <section className="command-enterprise-posture" aria-label="Enterprise runtime posture">
    <div><span className={`posture-dot posture-${state.posture.evidence_integrity}`} /><p><strong>Evidence {state.posture.evidence_integrity}</strong><small>{state.posture.evidence_records} persisted records</small></p></div>
    <div><CircleDot size={15} /><p><strong>{state.posture.active_credentials} active credentials</strong><small>{state.posture.pending_approvals} approvals pending</small></p></div>
    <div><Boxes size={15} /><p><strong>{state.posture.healthy_connectors} connectors ready</strong><small>{state.posture.active_context_grants} active Context Grants</small></p></div>
    <div><Network size={15} /><p><strong>{state.posture.active_federation_peers} trusted peers</strong><small>{observed} observed / {state.posture.trust_modes.governed} governed</small></p></div>
  </section>;
}

function Topology({ state, nodes, kind, onKindChange }: { state: EnterpriseOverviewState; nodes: EnterpriseOverviewState['nodes']; kind: EnterpriseEntityKind | 'all'; onKindChange(value: EnterpriseEntityKind | 'all'): void }): React.JSX.Element {
  const kinds = [...new Set(state.nodes.map((node) => node.kind))].sort();
  return <section className="enterprise-workbench">
    <header><div><p className="section-kicker">LIVE CONTROL PLANE</p><h3>Identity, authority, runtime, and transport topology</h3></div><label><span>Entity type</span><select value={kind} onChange={(event) => onKindChange(event.target.value as EnterpriseEntityKind | 'all')}><option value="all">All entities</option>{kinds.map((value) => <option key={value} value={value}>{format(value)}</option>)}</select></label></header>
    <div className="topology-columns">
      {(['identity', 'authority', 'execution', 'transport'] as const).map((group) => <section key={group}><header><strong>{format(group)}</strong><span>{nodes.filter((node) => groupFor(node.kind) === group).length}</span></header><div>{nodes.filter((node) => groupFor(node.kind) === group).map((node) => <article className="topology-node" key={node.node_id}><span className={`entity-kind entity-${node.kind}`}><CircleDot size={13} /></span><div><strong>{node.label}</strong><small>{format(node.kind)} / {node.detail}</small>{node.trust_mode && <code>{node.trust_mode}</code>}</div><StatusBadge label={format(node.status)} tone={tone(node.status, node.trust_mode)} /></article>)}</div></section>)}
    </div>
    <footer><CheckCircle2 size={15} /><span>{state.edges.length} persisted relationships resolve only between known topology entities.</span></footer>
  </section>;
}

function TraceCoverage({ state }: { state: EnterpriseOverviewState }): React.JSX.Element { return <section className="enterprise-workbench trace-coverage"><header><div><p className="section-kicker">CROSS-DOMAIN RESOLUTION</p><h3>Evidence trace completeness</h3></div><span>{state.traces.filter((trace) => trace.resolution_status === 'complete').length} complete / {state.traces.length}</span></header><div className="enterprise-table"><div className="enterprise-table-head"><span>Trace</span><span>Events</span><span>Authority links</span><span>Coverage</span><span>Integrity</span></div>{state.traces.map((trace) => <article key={trace.trace_id}><div><code>{trace.trace_id}</code><small>{new Date(trace.updated_at).toLocaleString()}</small></div><strong>{trace.event_count}</strong><span>{Object.values(trace.references).reduce((sum, values) => sum + values.length, 0)}</span><div><StatusBadge label={format(trace.resolution_status)} tone={trace.resolution_status === 'complete' ? 'verified' : trace.resolution_status === 'partial' ? 'approval' : 'neutral'} />{trace.missing_links.length > 0 && <small>{trace.missing_links.join(', ')}</small>}</div><StatusBadge label={format(trace.integrity_status)} tone={trace.integrity_status === 'verified' ? 'verified' : 'danger'} /></article>)}</div></section>; }
function ClaimChallenges({ state }: { state: EnterpriseOverviewState }): React.JSX.Element { return <section className="claim-grid">{state.claims.map((claim) => <article key={claim.claim_id}><header><code>{claim.claim_id}</code><StatusBadge label={format(claim.status)} tone={claim.status === 'verified' ? 'verified' : claim.status === 'connected-observed' ? 'info' : claim.status === 'deferred' ? 'approval' : 'neutral'} /></header><h3>{claim.claim}</h3><p>{claim.challenge}</p><footer><span>{claim.matching_event_count} matching events</span><small>{claim.evidence_event_types.join(', ') || 'Architecture boundary'}</small></footer></article>)}</section>; }
function ReplacementSeams({ state }: { state: EnterpriseOverviewState }): React.JSX.Element { return <section className="enterprise-workbench seam-registry"><header><div><p className="section-kicker">BACKEND AND CLOUD PORTABILITY</p><h3>Replacement seam registry</h3></div></header><div>{state.replacement_seams.map((seam) => <article key={seam.seam_id}><div><strong>{seam.boundary}</strong><code>{seam.contract}</code></div><p><span>Local</span>{seam.local_implementation}</p><p><span>Enterprise</span>{seam.replacement_target}</p><StatusBadge label={format(seam.readiness)} tone={seam.readiness === 'ready' ? 'verified' : seam.readiness === 'partial' ? 'approval' : 'neutral'} /></article>)}</div></section>; }
function Summary({ label, value, detail }: { label: string; value: number; detail: string }): React.JSX.Element { return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function groupFor(kind: EnterpriseEntityKind): 'identity' | 'authority' | 'execution' | 'transport' { if (['organization', 'human', 'membership', 'human-proof'].includes(kind)) return 'identity'; if (['authority-credential', 'mandate', 'context-grant', 'approval'].includes(kind)) return 'authority'; if (['agent', 'passport', 'runtime', 'live-run', 'output'].includes(kind)) return 'execution'; return 'transport'; }
function format(value: string): string { return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/^./u, (letter) => letter.toUpperCase()); }
function tone(status: string, trust?: string): 'verified' | 'approval' | 'danger' | 'info' | 'neutral' { if (trust === 'connected-observed') return 'info'; if (trust === 'unverified') return 'approval'; if (['active', 'ready', 'verified', 'working', 'succeeded', 'governed'].includes(status)) return 'verified'; if (['revoked', 'failed', 'expired', 'terminated'].includes(status)) return 'danger'; if (['pending', 'degraded', 'offline', 'configuration-required'].includes(status)) return 'approval'; return 'neutral'; }
