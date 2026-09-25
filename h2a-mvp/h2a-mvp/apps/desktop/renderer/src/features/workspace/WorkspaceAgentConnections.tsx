import { Bot, CheckCircle2, Link2, LoaderCircle, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { AgentIdentityState, OrganizationAuthorityState, ProviderId } from '@h2a/contracts';
import { AddAgentDialog } from '../command-floor/components/AddAgentDialog';

interface Props {
  identity: AgentIdentityState;
  organization: OrganizationAuthorityState;
  onStateChange(state: AgentIdentityState, bindingId?: string): void;
  onHumanProofRequired(): void;
}

export function WorkspaceAgentConnections({ identity, organization, onStateChange, onHumanProofRequired }: Props): React.JSX.Element {
  const [adding, setAdding] = useState(false);
  const [providerId, setProviderId] = useState<ProviderId>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');

  async function reconnect(bindingId: string): Promise<void> {
    if (!window.h2a) return;
    setBusy(bindingId); setError('');
    try { onStateChange(await window.h2a.updateAgentRuntime({ bindingId, action: 'reconnect' }), bindingId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The agent could not reconnect.'); }
    finally { setBusy(undefined); }
  }

  function open(provider?: ProviderId): void { setProviderId(provider); setAdding(true); }

  return <section className="ws-agent-connections-sheet">
    <div className="ws-catalog-intro"><Link2 size={23} /><div><strong>Connect an agent in one guided flow</strong><p>Choose a runtime, authenticate when required, name its human owner, and issue its real Passport. H2A does not mark it ready until the runtime and authority checks pass.</p></div><button className="ws-primary" onClick={() => open()}><Plus size={16} />Connect agent</button></div>
    {error && <div className="ws-blocker-message" role="alert"><ShieldCheck size={18} /><div><strong>This agent needs attention</strong><p>{error}</p></div></div>}
    <div className="ws-section-heading"><h2>Connected agents</h2><span>{identity.bindings.length} runtimes</span></div>
    <div className="ws-connected-agent-list">{identity.bindings.map((binding) => {
      const passport = identity.passports.find((item) => item.agent_id === binding.agent_id);
      const provider = identity.providers.find((item) => item.id === binding.provider);
      const ready = passport?.status === 'active' && binding.connection_state === 'connected';
      return <article key={binding.binding_id}><span className={`ws-provider-mark provider-${binding.provider}`}><Bot size={19} /></span><div><h3>{binding.display_name}</h3><p>{provider?.label ?? binding.provider} · {binding.role}</p><small>{ready ? 'Passport active and runtime connected' : `${passport?.status ?? 'Passport missing'} · ${binding.connection_state}`}</small></div><span className={`ws-status ${ready ? 'ready' : binding.connection_state}`}>{ready ? 'ready' : binding.connection_state}</span>{binding.connection_state === 'disconnected' || binding.connection_state === 'configured' ? <button className="ws-secondary" disabled={busy === binding.binding_id} onClick={() => void reconnect(binding.binding_id)}>{busy === binding.binding_id ? <LoaderCircle className="ws-spin" size={15} /> : <RefreshCw size={15} />}Reconnect</button> : <CheckCircle2 size={18} className="ws-connected-check" />}</article>;
    })}</div>
    {identity.bindings.length === 0 && <div className="ws-empty"><Bot size={27} /><h2>No connected agents</h2><p>Connect a native provider or a company-built adapter. Human ownership is bound during Passport issuance.</p><button className="ws-primary" onClick={() => open()}><Plus size={16} />Connect the first agent</button></div>}
    <div className="ws-provider-choices"><div className="ws-section-heading"><h2>Available runtime lanes</h2><span>Authentication is requested only when needed</span></div>{identity.providers.map((provider) => <button key={provider.id} onClick={() => open(provider.id)}><span className={`ws-provider-mark provider-${provider.id}`}><Bot size={18} /></span><span><strong>{provider.label}</strong><small>{provider.execution_mode} · {provider.auth_mode === 'none' ? 'No login' : provider.auth_mode}</small></span><span className={`ws-status ${provider.availability === 'active-demo' ? 'ready' : 'not-connected'}`}>{provider.availability === 'active-demo' ? 'available' : 'adapter ready'}</span></button>)}</div>
    <div className="ws-company-agent-row"><Bot size={21} /><div><strong>Company-built agent</strong><p>Connect a signed custom CLI, MCP/A2A adapter, REST endpoint, or webhook through the same ownership and Passport flow.</p></div><button className="ws-secondary" onClick={() => open('custom-cli')}>Configure adapter</button></div>
    <AddAgentDialog open={adding} guided initialProviderId={providerId} identityState={identity} organizationState={organization} onClose={() => setAdding(false)} onCreated={onStateChange} onHumanProofRequired={onHumanProofRequired} />
  </section>;
}
