import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CircleDot, KeyRound, Link2Off, Play, Power, RadioTower, RefreshCw, ShieldCheck, Square, TerminalSquare } from 'lucide-react';
import type { AgentActivity, AgentIdentityState, AgentRuntimeSummary, AuthorityEventSummary, CollaborationMessage, LiveProviderId, LiveRuntimeState } from '@h2a/contracts';
import { AttachedTerminal } from './AttachedTerminal';

type OperationsTab = 'identity' | 'activity' | 'runtime' | 'provider';

interface AgentOperationsPanelProps {
  agent?: AgentRuntimeSummary;
  identityState: AgentIdentityState;
  activity: AgentActivity[];
  messages: CollaborationMessage[];
  events: AuthorityEventSummary[];
  lifecycleBusy: boolean;
  lifecycleError: string;
  onPassportAction(action: 'suspend' | 'reactivate' | 'revoke'): void;
  onRuntimeAction(action: 'disconnect' | 'reconnect'): void;
  onRotateAttestation(): void;
}

export function AgentOperationsPanel({ agent, identityState, activity, messages, events, lifecycleBusy, lifecycleError, onPassportAction, onRuntimeAction, onRotateAttestation }: AgentOperationsPanelProps): React.JSX.Element {
  const [tab, setTab] = useState<OperationsTab>('identity');
  const [liveState, setLiveState] = useState<LiveRuntimeState>({ providers: [], runs: [], output: [] });
  const [livePrompt, setLivePrompt] = useState('Review the current assignment context and return a concise structured status report. Do not modify files.');
  const [liveTraceId, setLiveTraceId] = useState(() => `phase22_${crypto.randomUUID()}`);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [runtimeSurface, setRuntimeSurface] = useState<'structured' | 'attached'>('structured');
  const passport = identityState.passports.find((item) => item.passport_id === agent?.passportId);
  const binding = identityState.bindings.find((item) => item.binding_id === agent?.id);
  const passportV2 = identityState.passportsV2?.find((item) => item.passport_id === agent?.passportId);
  const runtimeSession = identityState.runtimeSessions?.find((item) => item.passport_id === agent?.passportId && item.runtime_session_id === binding?.live_session_id);
  const attestation = identityState.attestations?.find((item) => item.attestation_id === runtimeSession?.runtime_attestation_id);
  const provider = identityState.providers.find((item) => item.id === agent?.provider);
  const credential = identityState.credentials.find((item) => item.provider === agent?.provider);
  const agentActivity = useMemo(() => activity.filter((item) => item.agentId === agent?.id).slice(0, 20), [activity, agent?.id]);
  const agentMessages = useMemo(() => messages.filter((item) => item.fromAgentId === agent?.id || item.toAgentId === agent?.id).slice(-12).reverse(), [messages, agent?.id]);
  const liveProvider = isLiveProvider(agent?.provider) ? agent.provider : undefined;
  const providerStatus = liveState.providers.find((item) => item.provider === liveProvider);
  const latestRun = liveState.runs.find((item) => item.agent_id === agent?.id);
  const latestOutput = latestRun ? liveState.output.filter((item) => item.run_id === latestRun.run_id) : [];

  const refreshLiveState = useCallback(async () => {
    if (!window.h2a) return;
    setLiveState(await window.h2a.getLiveRuntimeState());
  }, []);

  useEffect(() => {
    if (tab !== 'runtime' || !window.h2a) return;
    void refreshLiveState();
    const timer = window.setInterval(() => { void refreshLiveState(); }, 1500);
    return () => window.clearInterval(timer);
  }, [refreshLiveState, tab]);

  async function startLiveRuntime(): Promise<void> {
    if (!window.h2a || !agent || !binding || !runtimeSession || !liveProvider) return;
    setLiveBusy(true); setLiveError('');
    try {
      setLiveState(await window.h2a.startLiveRun({
        provider: liveProvider, agent_id: agent.id, passport_id: agent.passportId,
        binding_id: binding.binding_id, runtime_session_id: runtimeSession.runtime_session_id,
        mandate_id: agent.mandateId, trace_id: liveTraceId,
        workspace_path: binding.cwd, prompt: livePrompt, timeout_seconds: 120
      }));
    } catch (error) { setLiveError(error instanceof Error ? error.message : 'Live provider execution failed.'); }
    finally { setLiveBusy(false); }
  }

  async function cancelLiveRuntime(): Promise<void> {
    if (!window.h2a || !latestRun) return;
    setLiveBusy(true); setLiveError('');
    try { setLiveState(await window.h2a.cancelLiveRun({ run_id: latestRun.run_id, reason: 'Stopped from Command Floor.' })); }
    catch (error) { setLiveError(error instanceof Error ? error.message : 'Live provider cancellation failed.'); }
    finally { setLiveBusy(false); }
  }

  if (!agent) return <aside className="operations-panel"><div className="inspector-empty"><Activity size={20} /><strong>Select an agent</strong><span>Identity, provider, activity, and runtime state will appear here.</span></div></aside>;

  return (
    <aside className="operations-panel" aria-label="Selected agent operations">
      <header className="operations-header"><div className="operations-agent"><span className="agent-avatar" style={{ '--agent-accent': agent.accent } as React.CSSProperties}>{agent.initials}</span><div><p className="section-kicker">SELECTED AGENT</p><h2>{agent.name}</h2><span>{agent.role}</span></div></div><span className={`agent-status agent-status-${agent.status}`}><CircleDot size={13} />{agent.status.replaceAll('-', ' ')}</span></header>
      <div className="operations-tabs" role="tablist" aria-label="Agent detail views">{(['identity','activity','runtime','provider'] as const).map((value) => <button type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}>{value === 'identity' ? <ShieldCheck size={15} /> : value === 'activity' ? <Activity size={15} /> : value === 'runtime' ? <TerminalSquare size={15} /> : <RadioTower size={15} />}{value}</button>)}</div>

      {tab === 'identity' && <div className="operations-body"><dl className="context-list"><Fact term="Agent Passport" value={agent.passportId} mono /><Fact term="Passport contract" value={passportV2 ? 'V2 organization-signed' : 'V1 compatibility'} /><Fact term="Human sponsor" value={passportV2?.sponsor_human_id ?? passport?.owner_human_id ?? 'seeded demonstration'} /><Fact term="Risk tier" value={passportV2?.risk_tier ?? 'not classified'} /><Fact term="Runtime trust" value={attestation?.trust_mode ?? 'not attested'} /><Fact term="Runtime session" value={runtimeSession?.state ?? 'none'} /><Fact term="Mandate reference" value={agent.mandateId} mono /></dl><div className={`authority-state ${runtimeSession?.state !== 'ready' ? 'authority-state-pending' : ''}`}><ShieldCheck size={18} /><div><strong>{runtimeSession?.state === 'ready' ? 'Workload key verified' : 'Runtime attestation required'}</strong><span>{runtimeSession?.state === 'ready' ? `${attestation?.trust_mode ?? 'unverified'} session bound to this passport.` : 'The runtime cannot claim a trusted session from the passport record alone.'}</span></div></div>{passport && binding ? <div className="identity-detail"><div className="identity-detail-heading"><div><p className="section-kicker">LIFECYCLE</p><h3>Passport and runtime</h3></div><span className={`lifecycle-status lifecycle-${passport.status}`}>{passport.status}</span></div><div className="identity-record"><span>Passport</span><strong className="mono">{passport.passport_id}</strong><small>{passport.capabilities.length} capabilities · signed Ed25519</small></div><div className="identity-actions">{passport.status === 'active' ? <button data-control-id="command-floor.passport.lifecycle" type="button" onClick={() => onPassportAction('suspend')} disabled={lifecycleBusy}>Suspend</button> : passport.status === 'suspended' ? <button data-control-id="command-floor.passport.lifecycle" type="button" onClick={() => onPassportAction('reactivate')} disabled={lifecycleBusy}><Power size={14} /> Reactivate</button> : null}<button data-control-id="command-floor.passport.lifecycle" className="danger-command" type="button" onClick={() => onPassportAction('revoke')} disabled={lifecycleBusy || passport.status === 'revoked'}>Revoke</button></div><div className="identity-record runtime-record"><span>Runtime binding</span><strong className="mono">{binding.binding_id}</strong><small>{binding.connection_state} · {binding.provider}</small></div><div className="identity-actions"><button data-control-id="command-floor.runtime.attest" type="button" onClick={onRotateAttestation} disabled={lifecycleBusy || passport.status !== 'active'}><KeyRound size={14} /> Rotate attestation</button>{binding.connection_state === 'disconnected' ? <button data-control-id="command-floor.runtime.lifecycle" type="button" onClick={() => onRuntimeAction('reconnect')} disabled={lifecycleBusy || passport.status !== 'active'}><Power size={14} /> Reconnect</button> : <button data-control-id="command-floor.runtime.lifecycle" type="button" onClick={() => onRuntimeAction('disconnect')} disabled={lifecycleBusy || binding.connection_state === 'revoked'}><Link2Off size={14} /> Disconnect</button>}</div></div> : <div className="seeded-record"><strong>Seeded demonstration identity</strong><span>Create a verified agent to manage durable passport and runtime lifecycles.</span></div>}{lifecycleError && <div className="inline-error" role="alert">{lifecycleError}</div>}<div className="event-list compact-event-list" aria-label="Recent authority events"><h3>Evidence context</h3>{events.slice(0, 4).map((event) => <div className="event-row" key={event.id}><span className="event-dot" /><div><strong>{event.type.replaceAll('_', ' ')}</strong><span>{event.summary}</span></div><time>{formatTime(event.time)}</time></div>)}</div></div>}

      {tab === 'activity' && <div className="operations-body"><div className="activity-summary"><span><strong>{agentActivity.length}</strong> activity records</span><span><strong>{agentMessages.length}</strong> messages</span></div><div className="activity-feed">{agentActivity.length === 0 ? <p className="compact-empty">No persisted activity for this agent.</p> : agentActivity.map((item) => <article className={`activity-entry activity-${item.level}`} key={item.id}><span className="activity-marker" /><div><header><strong>{item.summary}</strong><time>{formatTime(item.createdAt)}</time></header><span>{item.kind}{item.assignmentId ? ` · ${item.assignmentId}` : ''}</span>{item.detail && <p>{item.detail}</p>}</div></article>)}</div>{agentMessages.length > 0 && <div className="recent-message-list"><h3>Recent messages</h3>{agentMessages.map((message) => <article key={message.id}><header><strong>{message.fromAgentId === agent.id ? `To ${message.toAgentId}` : `From ${message.fromAgentId}`}</strong><time>{formatTime(message.createdAt)}</time></header><span>{message.act} · {message.subject}</span></article>)}</div>}</div>}

      {tab === 'runtime' && <div className="operations-body runtime-console"><div className="runtime-console-bar"><TerminalSquare size={15} /><span>{agent.provider === 'scripted' ? 'SCRIPTED ACTIVITY' : 'PROVIDER RUNTIME'}</span><b>{latestRun?.status ?? providerStatus?.health ?? binding?.connection_state ?? 'unavailable'}</b><button className="runtime-refresh" type="button" title="Refresh runtime state" aria-label="Refresh runtime state" onClick={() => void refreshLiveState()}><RefreshCw size={14} /></button></div>{liveProvider && <div className="runtime-surface-switch" role="tablist" aria-label="Runtime transport"><button type="button" role="tab" aria-selected={runtimeSurface === 'structured'} onClick={() => setRuntimeSurface('structured')}>Structured CLI</button><button type="button" role="tab" aria-selected={runtimeSurface === 'attached'} onClick={() => setRuntimeSurface('attached')}>Attached terminal</button></div>}{runtimeSurface === 'structured' && <>{liveProvider && <div className="live-runtime-controls"><label>Shared trace ID<input value={liveTraceId} maxLength={200} onChange={(event) => setLiveTraceId(event.target.value)} /></label><label>Task prompt<textarea value={livePrompt} rows={3} onChange={(event) => setLivePrompt(event.target.value)} /></label><div className="live-runtime-actions"><span className={`live-provider-health health-${providerStatus?.health ?? 'disabled'}`}>{providerStatus?.health ?? 'checking'}</span>{latestRun && ['starting','running'].includes(latestRun.status) ? <button data-control-id="command-floor.provider.cancel" className="danger-command" type="button" disabled={liveBusy} onClick={() => void cancelLiveRuntime()}><Square size={14} /> Stop process</button> : <button data-control-id="command-floor.provider.start" className="primary-button" type="button" disabled={liveBusy || liveTraceId.trim().length < 3 || !runtimeSession || runtimeSession.state !== 'ready' || providerStatus?.health === 'dependency-missing'} onClick={() => void startLiveRuntime()}><Play size={14} /> Run provider</button>}</div></div>}<div className="runtime-lines">{latestOutput.length === 0 ? (agentActivity.length === 0 ? <p>No runtime output has been persisted.</p> : [...agentActivity].reverse().map((item) => <p key={item.id}><time>{formatTime(item.createdAt)}</time><span className={`runtime-level runtime-level-${item.level}`}>{item.level}</span><b>{item.kind}</b><span>{item.summary}</span></p>)) : latestOutput.map((item) => <p key={item.output_id}><time>{formatTime(item.created_at)}</time><span className={`runtime-level runtime-level-${item.kind === 'stderr' ? 'attention' : item.kind === 'lifecycle' ? 'success' : 'info'}`}>{item.kind}</span><span>{item.content}</span></p>)}</div>{liveError && <div className="inline-error" role="alert">{liveError}</div>}<div className="runtime-boundary"><strong>{agent.provider === 'scripted' ? 'Deterministic runtime' : providerStatus?.trust_mode ?? 'No live trust claim'}</strong><span>{agent.provider === 'scripted' ? 'Persisted scenario activity remains available for repeatable offline recovery.' : providerStatus?.detail ?? 'The official provider CLI has not been detected by the trusted main process.'}</span></div></>}{runtimeSurface === 'attached' && liveProvider && binding && runtimeSession && <AttachedTerminal provider={liveProvider} agentId={agent.id} passportId={agent.passportId} bindingId={binding.binding_id} runtimeSessionId={runtimeSession.runtime_session_id} mandateId={agent.mandateId} traceId={liveTraceId} workspacePath={binding.cwd} authorityReady={runtimeSession.state === 'ready' || runtimeSession.state === 'working'} />}{runtimeSurface === 'attached' && (!liveProvider || !binding || !runtimeSession) && <div className="runtime-boundary"><strong>Attached terminal unavailable</strong><span>An active Passport, provider binding, and runtime session are required before H2A can open a PTY.</span></div>}</div>}

      {tab === 'provider' && <div className="operations-body provider-settings"><div className="provider-heading"><span className="provider-glyph"><RadioTower size={20} /></span><div><h3>{provider?.label ?? agent.providerLabel}</h3><span>{provider?.execution_mode ?? 'seeded'} · {provider?.availability ?? 'reference-only'}</span></div></div><dl className="provider-facts"><Fact term="Provider ID" value={agent.provider} mono /><Fact term="Model" value={binding?.model ?? agent.model} /><Fact term="Workspace" value={binding?.cwd ?? 'Seeded demonstration workspace'} /><Fact term="Runtime command" value={binding?.command ?? provider?.default_command ?? 'Managed by scripted adapter'} mono /><Fact term="Authentication" value={provider?.auth_mode ?? 'not applicable'} /></dl><div className="credential-state"><KeyRound size={17} /><div><strong>{credential?.configured ? 'Credential protected' : provider?.auth_mode === 'none' ? 'No credential required' : 'Credential not configured'}</strong><span>{credential?.configured ? `${credential.credential_mask ?? '****'} · stored ${credential.updated_at ? formatTime(credential.updated_at) : 'locally'}` : 'Credentials stay in the trusted main process and never enter renderer state.'}</span></div></div><div className="provider-contract"><strong>Adapter contract</strong><span>{provider?.description ?? 'This seeded provider demonstrates the shared workplace identity contract.'}</span></div></div>}
    </aside>
  );
}

function Fact({ term, value, mono = false }: { term: string; value: string; mono?: boolean }): React.JSX.Element {
  return <div><dt>{term}</dt><dd className={mono ? 'mono' : ''}>{value}</dd></div>;
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function isLiveProvider(value: string | undefined): value is LiveProviderId {
  return value === 'claude-code' || value === 'openai-codex' || value === 'gemini-antigravity';
}
