import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Bot, CheckCircle2, Clock3, Database, FileJson, Fingerprint, Layers3, Loader2, Search, ShieldQuestion, ShieldX, X } from 'lucide-react';
import type { CensusEntity, DiscoveryScan, Snapshot } from '../../governance/contracts';

type Request = <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
type Props = { snapshot: Snapshot; request: Request; onImported: (snapshot: Snapshot) => void; onRegistry: (agentId: string) => void };
const pretty = (value: unknown): string => typeof value === 'string' ? value : value === undefined || value === null ? 'Not reported' : JSON.stringify(value, null, 2);
const timestamp = (value: unknown): string => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }) : 'Not reported';
function CensusBadge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`g-badge ${tone}`}>{children}</span>; }
function Datum({ label, value }: { label: string; value: unknown }) { return <div className="g-field"><dt>{label}</dt><dd>{pretty(value)}</dd></div>; }
function RawData({ title, value, open = false }: { title: string; value: unknown; open?: boolean }) { return <details className="g-census-raw" open={open}><summary><FileJson size={14} />{title}</summary><pre>{JSON.stringify(value ?? null, null, 2)}</pre></details>; }

/** Scan results are intentionally scoped to this mounted Discovery visit. */
export function CensusDiscovery({ snapshot, request, onImported, onRegistry }: Props): React.JSX.Element {
  const [scan, setScan] = useState<DiscoveryScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [classification, setClassification] = useState('all');
  const [freshness, setFreshness] = useState('all');
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current?.abort(); }; }, []);
  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selected]);

  async function runScan(): Promise<void> {
    if (scanning || importing) return;
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
    setScanning(true); setUnavailable(false); setScan(null); setSelected(null); setImportError(null); setNotice(null);
    setQuery(''); setClassification('all'); setFreshness('all');
    try { const result = await request<DiscoveryScan>('/api/discovery/scan', {}, controller.signal); if (mounted.current) setScan(result); }
    catch (error) { if (mounted.current && !(error instanceof Error && error.name === 'AbortError')) setUnavailable(true); }
    finally { if (mounted.current) setScanning(false); }
  }
  async function importEntity(entity: CensusEntity): Promise<void> {
    if (!scan || importing || scanning) return;
    setImporting(entity.agent_id); setImportError(null); setNotice(null);
    try {
      const updated = await request<Snapshot>('/api/discovery/import', { census_agent_id: entity.agent_id, scan_id: scan.scan_id });
      onImported(updated);
      if (mounted.current) setNotice(`${entity.name} is registered in H2A. Open Agent Registry to bind a human owner.`);
    } catch (error) { if (mounted.current) setImportError(error instanceof Error ? error.message : 'Registration failed. Please try again.'); }
    finally { if (mounted.current) setImporting(null); }
  }
  const inspected = scan?.agents.find((entity) => entity.agent_id === selected);
  const inventory = scan?.agents ?? [];
  const filtered = inventory.filter((entity) => {
    const matchesText = [entity.name, entity.agent_id, entity.provider, entity.model, entity.framework, entity.endpoint, ...entity.protocols].some((value) => value?.toLowerCase().includes(query.toLowerCase()));
    return matchesText && (classification === 'all' || entity.classification.classification === classification) && (freshness === 'all' || entity.activity_status === freshness);
  });
  const groups = [...new Set(inventory.map((entity) => entity.classification.classification))].sort();
  const imported = (id: string) => snapshot.agents.find((agent) => agent.census_agent_id === id);

  function Registration({ entity, compact = false }: { entity: CensusEntity; compact?: boolean }): React.JSX.Element {
    const identity = imported(entity.agent_id);
    if (identity) return <button className={`g-button secondary ${compact ? 'compact' : ''}`} data-testid={`view-registry-${entity.agent_id}`} onClick={() => onRegistry(identity.agent_id)}>View in Agent Registry<ArrowRight size={14} /></button>;
    return <button className={`g-button primary ${compact ? 'compact' : ''}`} data-testid={`register-h2a-${entity.agent_id}`} disabled={!entity.classification.is_agent || !!importing || scanning} title={!entity.classification.is_agent ? 'Census has not classified this entity as an agent.' : undefined} onClick={() => void importEntity(entity)}>{importing === entity.agent_id ? <Loader2 size={14} className="g-spin" /> : <Fingerprint size={14} />}{importing === entity.agent_id ? 'Registering…' : 'Register in H2A'}</button>;
  }

  return <div className="g-census" data-testid="census-discovery">
    <section className="g-card g-census-controls">
      <div className="g-section-heading"><div><span className="g-eyebrow">POWERED BY AGENT CENSUS</span><h2>Agent Discovery</h2><p>Scan configured sources, inspect Census evidence, and explicitly register agents in H2A.</p></div><button className="g-button primary" data-testid="run-discovery" disabled={scanning || !!importing} onClick={() => void runScan()}>{scanning ? <Loader2 size={16} className="g-spin" /> : <Search size={16} />}{scanning ? 'Scanning…' : 'Scan'}</button></div>
      <div className="g-census-boundary"><Database size={15} /><p><strong>Census is the discovery source.</strong> Scanning reads the real discovery inventory. H2A registration is a separate, explicit operation.</p></div>
    </section>

    {unavailable ? <section className="g-card g-census-outage" role="alert" data-testid="discovery-unavailable"><ShieldX size={28} /><h2>Agent Discovery service unavailable</h2><p>Restore the Agent Census connection and retry the scan.</p><button className="g-button primary" data-testid="retry-discovery" disabled={scanning} onClick={() => void runScan()}>Retry</button></section> : null}
    {scanning ? <section className="g-card g-loading" role="status"><Loader2 size={27} className="g-spin" /><h2>Scanning configured sources</h2><p>Waiting for Agent Census to complete discovery and return its evidence.</p></section> : !scan && !unavailable ? <section className="g-card g-empty" data-testid="discovery-ready"><Search size={35} /><h2>Ready to scan</h2><p>Run a scan to load the current Agent Census inventory. No discovery results have been loaded for this visit.</p><div className="g-census-ready-tags"><CensusBadge>Live source adapters</CensusBadge><CensusBadge>Evidence-based classification</CensusBadge><CensusBadge>Explicit H2A registration</CensusBadge></div></section> : null}
    {importError ? <div role="alert" className="g-alert error"><ShieldX size={18} /><span>{importError}</span><button onClick={() => setImportError(null)} aria-label="Dismiss registration error">Dismiss</button></div> : null}
    {notice ? <div role="status" className="g-alert success"><CheckCircle2 size={18} /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss registration confirmation">Dismiss</button></div> : null}

    {scan ? <>
      <div className="g-census-run"><span><CheckCircle2 size={15} />Scan completed {timestamp(scan.completed_at)}</span><code data-testid="scan-id">{scan.scan_id}</code><CensusBadge tone={scan.errors.length ? 'amber' : 'green'}>{scan.errors.length ? 'Partial scan · source warnings' : 'Scan complete'}</CensusBadge></div>
      <div className="g-census-metrics" aria-label="Discovery summary">
        <ScanMetric label="Total entities" count={inventory.length} />
        <ScanMetric label="Agents" count={inventory.filter((entity) => entity.classification.is_agent).length} />
        <ScanMetric label="Confirmed agents" count={inventory.filter((entity) => entity.classification.classification === 'confirmed_agent').length} />
        <ScanMetric label="Probable agents" count={inventory.filter((entity) => entity.classification.classification === 'probable_agent').length} />
        <ScanMetric label="Census shadow" count={inventory.filter((entity) => entity.shadow).length} />
        <ScanMetric label="Census registered" count={inventory.filter((entity) => entity.registered).length} />
        <ScanMetric label="Non-agent entities" count={inventory.filter((entity) => !entity.classification.is_agent).length} />
        <ScanMetric label="Stale observations" count={inventory.filter((entity) => entity.activity_status === 'stale').length} />
      </div>
      <div className="g-census-overview"><Distribution title="Provider distribution" values={inventory.map((entity) => entity.provider ?? 'Not reported')} /><Distribution title="Model distribution" values={inventory.map((entity) => entity.model ?? 'Not reported')} /><section className="g-card"><div className="g-section-heading"><div><h2>Discovery sources</h2><p>{scan.configured_source_count} configured source entries</p></div><Layers3 size={19} /></div><div className="g-census-chips">{scan.discovery_sources.map((source) => <CensusBadge key={source}>{source}</CensusBadge>)}</div>{scan.discovery_sources.length === 0 ? <p className="g-muted">No sources reported by this scan.</p> : null}<p className="g-census-note">{scan.observed_agent_ids.length} entities observed in this scan. Persisted stale entities remain visible with their freshness information.</p></section></div>
      {scan.errors.length > 0 ? <section className="g-card g-source-warnings" data-testid="source-warnings"><div className="g-section-heading"><div><h2>Source warnings</h2><p>Some sources did not complete. Inventory below contains the results returned by Agent Census.</p></div><CensusBadge tone="amber">{scan.errors.length} warnings</CensusBadge></div><ul>{scan.errors.map((error, index) => <li key={`${error.source}-${index}`}><strong>{error.source}</strong><code>{error.code}</code><p>{error.message}</p>{error.item ? <small>{pretty(error.item)}</small> : null}</li>)}</ul></section> : null}
      <section className="g-card"><div className="g-section-heading"><div><h2>Discovered inventory</h2><p>Census classification, registration, shadow status, and freshness are shown independently of H2A governance.</p></div><CensusBadge>{filtered.length} / {inventory.length} entities</CensusBadge></div>
        <div className="g-census-filters"><label><span>Search inventory</span><input aria-label="Search discovered inventory" placeholder="Name, provider, model, endpoint, or ID" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label><span>Census classification</span><select aria-label="Filter Census classification" value={classification} onChange={(event) => setClassification(event.target.value)}><option value="all">All classifications</option>{groups.map((group) => <option key={group} value={group}>{group}</option>)}</select></label><label><span>Freshness</span><select aria-label="Filter evidence freshness" value={freshness} onChange={(event) => setFreshness(event.target.value)}><option value="all">All observations</option><option value="active">Active</option><option value="stale">Stale</option></select></label></div>
        <div className="g-table-wrap"><table className="g-table g-census-table" data-testid="census-inventory"><thead><tr><th>Discovered entity</th><th>Provider / model</th><th>Census classification</th><th>Census status</th><th>Freshness</th><th>H2A registry</th><th>Action</th></tr></thead><tbody>{filtered.map((entity) => {
          const identity = imported(entity.agent_id);
          return <tr key={entity.agent_id} data-testid={`census-row-${entity.agent_id}`}><td><button className="g-agent-select" data-testid={`inspect-${entity.agent_id}`} onClick={() => setSelected(entity.agent_id)}><span className="g-agent-icon small">{entity.classification.is_agent ? <Bot size={18} /> : <Layers3 size={18} />}</span><span><strong>{entity.name}</strong><small>{entity.framework ?? 'Framework not reported'}</small></span></button><code>{entity.agent_id}</code><div className="g-census-chips">{entity.protocols.map((protocol) => <CensusBadge key={protocol}>{protocol}</CensusBadge>)}</div></td><td><strong>{entity.provider ?? 'Not reported'}</strong><small>{entity.model ?? 'Model not reported'}</small></td><td><CensusBadge tone={entity.classification.is_agent ? 'teal' : ''}>{entity.classification.classification}</CensusBadge><small>{entity.classification.entity_type}</small><small>Confidence: {entity.classification.confidence}</small></td><td><div className="g-census-chips"><CensusBadge tone={entity.shadow ? 'amber' : ''}>{entity.shadow ? 'Shadow' : 'Not shadow'}</CensusBadge><CensusBadge tone={entity.registered ? 'green' : ''}>{entity.registered ? 'Registered' : 'Unregistered'}</CensusBadge></div></td><td><CensusBadge tone={entity.activity_status === 'stale' ? 'amber' : 'green'}>{entity.activity_status}</CensusBadge><small>{entity.evidence_age_seconds}s evidence age</small></td><td>{identity ? <><CensusBadge tone={identity.governance_status === 'Managed' ? 'green' : 'teal'}>{identity.governance_status}</CensusBadge><code>{identity.agent_id}</code></> : <span className="g-muted">Not imported</span>}</td><td><div className="g-census-row-actions"><button className="g-button secondary compact" onClick={() => setSelected(entity.agent_id)}>Inspect</button><Registration entity={entity} compact /></div></td></tr>;
        })}</tbody></table></div>
        {inventory.length === 0 ? <div className="g-empty" data-testid="discovery-no-results"><Search size={28} /><h2>No entities returned</h2><p>Agent Census completed the scan without returning inventory. Inspect source warnings and the configured discovery scope.</p></div> : filtered.length === 0 ? <p className="g-census-no-match">No entities match the current filters.</p> : null}
        <div className="g-card-note"><ShieldQuestion size={15} />Confidence is Census's heuristic evidence score, not a calibrated probability. Non-agent and stale records remain visible.</div>
      </section>
      <details className="g-card g-technical"><summary>Scan provenance and raw response</summary><dl className="g-details columns"><Datum label="Correlation ID" value={scan.correlation_id} /><Datum label="Started" value={timestamp(scan.started_at)} /><Datum label="Completed" value={timestamp(scan.completed_at)} /></dl><RawData title="Full scan response" value={scan} /></details>
    </> : null}

    {inspected ? <div className="g-census-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="g-census-inspector" role="dialog" aria-modal="true" aria-labelledby="census-inspector-title" data-testid="census-inspector" onKeyDown={(event) => { if (event.key === 'Escape') setSelected(null); if (event.key === 'Tab') { const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), summary, input, select, textarea, a[href]')]; const first = controls[0]; const last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><header><div><span className="g-eyebrow">AGENT CENSUS · ENTITY INSPECTOR</span><h2 id="census-inspector-title">{inspected.name}</h2><code>{inspected.agent_id}</code></div><button className="g-icon-button" autoFocus aria-label="Close entity inspector" onClick={() => setSelected(null)}><X size={18} /></button></header><div className="g-census-inspector-body">
      <div className="g-census-chips"><CensusBadge tone={inspected.classification.is_agent ? 'teal' : ''}>{inspected.classification.classification}</CensusBadge><CensusBadge>{inspected.classification.entity_type}</CensusBadge><CensusBadge tone={inspected.shadow ? 'amber' : ''}>Census {inspected.shadow ? 'Shadow' : 'not shadow'}</CensusBadge><CensusBadge tone={inspected.registered ? 'green' : ''}>Census {inspected.registered ? 'registered' : 'unregistered'}</CensusBadge><CensusBadge tone={inspected.activity_status === 'stale' ? 'amber' : 'green'}>{inspected.activity_status}</CensusBadge></div>
      <section><h3><Fingerprint size={16} />Identity and runtime</h3><dl className="g-details columns"><Datum label="Census identity" value={inspected.agent_id} /><Datum label="Provider" value={inspected.provider} /><Datum label="Model" value={inspected.model} /><Datum label="Framework" value={inspected.framework} /><Datum label="Endpoint" value={inspected.endpoint} /><Datum label="Protocols" value={inspected.protocols.join(', ') || 'None reported'} /><Datum label="Environment" value={inspected.environment} /><Datum label="Owner reported by Census" value={inspected.owner} /><Datum label="Trust / health" value={`${inspected.trust_status} / ${inspected.health_status}`} /><Datum label="H2A identity" value={imported(inspected.agent_id)?.agent_id ?? 'Not imported'} /><Datum label="H2A governance" value={imported(inspected.agent_id)?.governance_status ?? 'Not imported'} /></dl>{inspected.description ? <p>{inspected.description}</p> : null}</section>
      <section><h3><ShieldQuestion size={16} />Classification and confidence</h3><dl className="g-details columns"><Datum label="Census is_agent" value={inspected.classification.is_agent} /><Datum label="Classification" value={inspected.classification.classification} /><Datum label="Confidence" value={inspected.classification.confidence} /></dl><p className="g-help">Heuristic evidence score; not a calibrated probability. Values and reasons are returned by Agent Census.</p><ul className="g-census-reasons">{inspected.classification.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul><RawData title="Classification evidence" value={inspected.classification.evidence} /></section>
      <section><h3><Layers3 size={16} />Capabilities, tools, and connections</h3>{inspected.capabilities.length ? <div className="g-census-capabilities">{inspected.capabilities.map((capability, index) => <div key={`${capability.name}-${index}`}><strong>{capability.name}</strong><CensusBadge>{capability.basis}</CensusBadge><span>Confidence: {capability.confidence}</span><RawData title="Capability evidence" value={capability.evidence} /></div>)}</div> : <p>No capabilities reported.</p>}<dl className="g-details columns"><Datum label="Tools" value={inspected.tools.join(', ') || 'None reported'} /><Datum label="Skills" value={(inspected.skills ?? []).join(', ') || 'None reported'} /><Datum label="Protocols" value={inspected.protocols.join(', ') || 'None reported'} /></dl><RawData title="Fingerprint, models, MCP and A2A connections" value={inspected.fingerprint} open /></section>
      <section><h3><Clock3 size={16} />Freshness and discovery history</h3><dl className="g-details columns"><Datum label="First seen" value={timestamp(inspected.first_seen)} /><Datum label="Last seen" value={timestamp(inspected.last_seen)} /><Datum label="Activity" value={inspected.activity_status} /><Datum label="Evidence age (seconds)" value={inspected.evidence_age_seconds} /><Datum label="Record created" value={timestamp(inspected.created_at)} /><Datum label="Record updated" value={timestamp(inspected.updated_at)} /><Datum label="Observed in this scan" value={scan?.observed_agent_ids.includes(inspected.agent_id)} /><Datum label="Discovery sources" value={inspected.discovery_sources.join(', ') || 'None reported'} /></dl><RawData title="Persisted Census discovery history" value={inspected.discovery_history ?? []} open /><RawData title="Identity resolution history" value={inspected.identity_decisions} /></section>
      <section><h3><FileJson size={16} />Source evidence</h3><RawData title="Raw evidence" value={inspected.evidence} open /><RawData title="Complete Census entity record" value={inspected} /></section>
    </div><footer><div><strong>{imported(inspected.agent_id) ? 'Imported identity is available in H2A.' : inspected.classification.is_agent ? 'Eligible for explicit H2A registration.' : 'Census has not classified this entity as an agent.'}</strong><p>H2A governance does not replace Census classification or freshness.</p></div><Registration entity={inspected} /></footer></section></div> : null}
  </div>;
}

function ScanMetric({ label, count }: { label: string; count: number }): React.JSX.Element { return <div className="g-metric"><div><span>{label}</span><strong>{count}</strong></div></div>; }
function Distribution({ title, values }: { title: string; values: string[] }): React.JSX.Element {
  const entries = [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return <section className="g-card"><div className="g-section-heading"><h2>{title}</h2><CensusBadge>{entries.length}</CensusBadge></div>{entries.length ? <ul className="g-census-distribution">{entries.map(([value, count]) => <li key={value}><span>{value}</span><b>{count}</b></li>)}</ul> : <p className="g-muted">No entities to summarize.</p>}</section>;
}
