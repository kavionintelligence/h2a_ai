import { FileUp, HardDrive, Network, RefreshCw, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ConnectorManifest, FrameworkConnectorState, SystemStatus } from '@h2a/contracts';
import { StatusBadge } from '@h2a/ui';
import { LocalPerformanceDiagnostics } from '../../components/LocalPerformanceDiagnostics';

export { HumanProofView } from '../human-proof/HumanProofView';

export function SettingsView({ status }: { status: SystemStatus }): React.JSX.Element {
  const [framework, setFramework] = useState<FrameworkConnectorState>({ declarations: [], protocol: { connectors: [], deliveries: [], dead_letter_count: 0 }, collaboration_runs: [] });
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const refresh = useCallback(async () => {
    if (!window.h2a) return;
    setLoading(true);
    try { setFramework(await window.h2a.getFrameworkConnectorState()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const cancel = async (deliveryId: string): Promise<void> => {
    if (!window.h2a) return;
    const protocol = await window.h2a.cancelConnectorDelivery({ delivery_id: deliveryId, reason: 'Cancelled by local operator.' });
    setFramework((current) => ({ ...current, protocol }));
  };

  const probe = async (): Promise<void> => {
    if (!window.h2a) return;
    setLoading(true);
    try { setFramework(await window.h2a.probeFrameworkConnectors({})); }
    finally { setLoading(false); }
  };

  return (
    <div className="system-page system-page-stack">
      <SystemSection icon={HardDrive} kicker="RUNTIME CONFIGURATION" title="Local MVP" status="Operational">
        <Row label="Storage mode" value={status.storageMode} mono />
        <Row label="Agent mode" value={status.agentMode} mono />
        <Row label="Human proof" value={status.humanProofMode} mono />
        <Row label="Liveness" value={status.livenessMode} mono />
        <Row label="Resource mode" value={status.resourceMode} mono />
        <Row label="Schema version" value={String(status.schemaVersion)} mono />
        <Row label="Data path" value={status.dataPath} mono />
      </SystemSection>
      <LocalPerformanceDiagnostics />
      <section className="system-panel connector-panel" aria-labelledby="connector-registry-title">
        <div className="system-panel-header">
          <span className="system-icon"><Network size={24} aria-hidden="true" /></span>
          <div><p className="section-kicker">PROTOCOL ADAPTERS</p><h2 id="connector-registry-title">Connector Registry</h2></div>
          <div className="system-panel-actions"><button data-control-id="settings.connector.import.open" className="secondary-button" type="button" disabled={loading || !window.h2a} onClick={() => setShowImport(true)}><FileUp size={16} aria-hidden="true" /> Import signed connector</button><button data-control-id="settings.framework.probe" className="icon-button" type="button" title="Probe connector dependencies" aria-label="Probe connector dependencies" disabled={loading || !window.h2a} onClick={() => void probe()}><RefreshCw size={16} aria-hidden="true" /></button></div>
        </div>
        <div className="connector-summary" aria-label="Connector delivery summary">
          <Metric label="Adapters" value={framework.declarations.length} />
          <Metric label="Imported" value={framework.protocol.connectors.length} />
          <Metric label="Ready" value={framework.declarations.filter((item) => item.health === 'ready').length} />
          <Metric label="Acknowledged" value={framework.protocol.deliveries.filter((item) => item.status === 'acknowledged').length} />
          <Metric label="Dead letter" value={framework.protocol.dead_letter_count} danger={framework.protocol.dead_letter_count > 0} />
        </div>
        <div className="connector-registry-list">
          {framework.declarations.length === 0 && <p className="connector-empty">Connector dependency probes require the local desktop runtime.</p>}
          {framework.declarations.map((connector) => (
            <div className="connector-registry-row" key={connector.connector_id}>
              <div><strong>{connector.name}</strong><span>{connector.kind} · {connector.protocol} · {connector.trust_ceiling}</span><small>{connector.detail}</small></div>
              <StatusBadge label={connector.health} tone={connector.health === 'ready' ? 'verified' : connector.health === 'disabled' ? 'neutral' : connector.health === 'degraded' ? 'danger' : 'approval'} />
            </div>
          ))}
        </div>
        {framework.protocol.connectors.length > 0 && <div className="connector-registry-list imported-connectors" aria-label="Imported connector manifests">{framework.protocol.connectors.map((connector) => <div className="connector-registry-row" key={connector.manifest.connector_manifest_id}><div><strong>{connector.manifest.name}</strong><span>{connector.manifest.protocol} · {connector.manifest.trust_ceiling}</span><small>{connector.manifest.connector_manifest_id}</small></div><StatusBadge label={connector.health} tone={connector.health === 'healthy' ? 'verified' : connector.health === 'disabled' ? 'neutral' : 'approval'} /></div>)}</div>}
        {framework.protocol.deliveries.length > 0 && (
          <div className="delivery-list" aria-label="Recent connector deliveries">
            {framework.protocol.deliveries.slice(-6).reverse().map((delivery) => (
              <div className="delivery-row" key={delivery.delivery_id}>
                <div><strong>{delivery.task.objective}</strong><span className="mono">{delivery.delivery_id} · attempt {delivery.attempts}/{delivery.max_attempts}</span></div>
                <StatusBadge label={delivery.status} tone={delivery.status === 'acknowledged' ? 'verified' : delivery.status === 'dead-letter' ? 'danger' : 'approval'} />
                {['queued', 'retrying', 'in-flight'].includes(delivery.status) && <button data-control-id="settings.delivery.cancel" className="icon-button" type="button" title="Cancel delivery" aria-label={`Cancel delivery ${delivery.delivery_id}`} onClick={() => void cancel(delivery.delivery_id)}><X size={16} aria-hidden="true" /></button>}
              </div>
            ))}
          </div>
        )}
      </section>
      {showImport && <ConnectorImportDialog onClose={() => setShowImport(false)} onImported={(protocol) => { setFramework((current) => ({ ...current, protocol })); setShowImport(false); }} />}
    </div>
  );
}

function ConnectorImportDialog({ onClose, onImported }: { onClose(): void; onImported(protocol: FrameworkConnectorState['protocol']): void }): React.JSX.Element {
  const [manifest, setManifest] = useState('');
  const [publisherKey, setPublisherKey] = useState('');
  const [runtimeKey, setRuntimeKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(): Promise<void> {
    if (!window.h2a) return;
    setBusy(true); setError('');
    try {
      const parsed = JSON.parse(manifest) as ConnectorManifest;
      onImported(await window.h2a.importConnector({ manifest: parsed, publisher_public_key_pem: publisherKey, runtime_public_key_pem: runtimeKey }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Signed connector import failed.');
    } finally { setBusy(false); }
  }
  return <div className="modal-scrim" role="presentation"><section className="authority-dialog connector-import-dialog" role="dialog" aria-modal="true" aria-labelledby="connector-import-title"><header><div><h2 id="connector-import-title">Import signed connector</h2><p>Publisher and runtime public keys are verified by the trusted process before registration.</p></div><button className="icon-button" type="button" aria-label="Close" title="Close" onClick={onClose}><X size={17} /></button></header><div className="authority-dialog-body"><label className="field"><span>Signed Connector Manifest JSON</span><textarea rows={10} value={manifest} onChange={(event) => setManifest(event.target.value)} /></label><label className="field"><span>Publisher public key PEM</span><textarea rows={4} value={publisherKey} onChange={(event) => setPublisherKey(event.target.value)} /></label><label className="field"><span>Runtime public key PEM</span><textarea rows={4} value={runtimeKey} onChange={(event) => setRuntimeKey(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}</div><footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button data-control-id="settings.connector.import" className="primary-button" type="button" disabled={busy || !manifest.trim() || !publisherKey.trim() || !runtimeKey.trim()} onClick={() => void submit()}><FileUp size={16} />{busy ? 'Verifying...' : 'Verify and import'}</button></footer></section></div>;
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }): React.JSX.Element {
  return <div><span>{label}</span><strong className={danger ? 'metric-danger' : ''}>{value}</strong></div>;
}

function SystemSection({ icon: Icon, kicker, title, status, statusTone = 'verified', children }: { icon: LucideIcon; kicker: string; title: string; status: string; statusTone?: 'neutral' | 'info' | 'verified' | 'approval' | 'danger'; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="system-panel">
        <div className="system-panel-header">
          <span className="system-icon"><Icon size={24} aria-hidden="true" /></span>
          <div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div>
          <StatusBadge label={status} tone={statusTone} />
        </div>
        <div className="system-list">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return <div className="system-row"><span className="system-row-label">{label}</span><span className={`system-row-value ${mono ? 'mono' : ''}`}>{value}</span></div>;
}
