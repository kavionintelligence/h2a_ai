import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentRuntimeSummary, OfficeState } from '@h2a/contracts';
import { OfficeSceneEngine, type OfficeSceneStats } from './OfficeSceneEngine';
import { buildOfficeSceneModel } from './sceneModel';

interface PixelOfficeSceneProps {
  office: OfficeState;
  agents: readonly AgentRuntimeSummary[];
  selectedAgentId?: string;
  selectedEntityId?: string;
  reducedMotion: boolean;
  onAgentSelect(agentId: string): void;
  onEntitySelect(entityId: string): void;
}

const initialStats: OfficeSceneStats = {
  renderState: 'initializing',
  tickerState: 'idle',
  camera: { x: 0, y: 0, zoom: 1 },
  characterCount: 0,
  recoveryAttempts: 0
};

export function PixelOfficeScene({ office, agents, selectedAgentId, selectedEntityId, reducedMotion, onAgentSelect, onEntitySelect }: PixelOfficeSceneProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<OfficeSceneEngine | undefined>(undefined);
  const model = useMemo(() => buildOfficeSceneModel(office, agents), [agents, office]);
  const modelRef = useRef(model);
  const officeRef = useRef(office);
  const [generation, setGeneration] = useState(0);
  const [stats, setStats] = useState(initialStats);
  const [failure, setFailure] = useState('');
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const effectiveReducedMotion = reducedMotion || systemReducedMotion;

  modelRef.current = model;
  officeRef.current = office;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => setSystemReducedMotion(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    setFailure('');
    setStats((current) => ({ ...current, renderState: generation > 0 ? 'recovering' : 'initializing', recoveryAttempts: generation }));
    const engine = new OfficeSceneEngine({
      host,
      model: modelRef.current,
      reducedMotion: effectiveReducedMotion,
      onAgentActivate: (agentId) => {
        onAgentSelect(agentId);
        const entity = officeRef.current.entities.find((item) => item.selectable_agent_id === agentId);
        if (entity) onEntitySelect(entity.entity_id);
      },
      onStats: (next) => { if (!cancelled) setStats(next); },
      onRecoveryRequired: () => { if (!cancelled) setGeneration((current) => current + 1); },
      onFailure: (message) => { if (!cancelled) setFailure(message); }
    });
    engineRef.current = engine;
    void engine.mount();
    return () => {
      cancelled = true;
      if (engineRef.current === engine) engineRef.current = undefined;
      engine.destroy();
    };
  }, [effectiveReducedMotion, generation, onAgentSelect, onEntitySelect]);

  useEffect(() => {
    engineRef.current?.updateModel(model);
  }, [model]);

  return (
    <div className="pixel-office" data-render-state={stats.renderState} data-motion={effectiveReducedMotion ? 'reduced' : 'full'}>
      <div className="pixel-office-toolbar" role="toolbar" aria-label="Office camera">
        <button data-control-id="office.camera.zoom-in" type="button" className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={() => engineRef.current?.zoomIn()}><ZoomIn size={17} aria-hidden="true" /></button>
        <button data-control-id="office.camera.zoom-out" type="button" className="icon-button" aria-label="Zoom out" title="Zoom out" onClick={() => engineRef.current?.zoomOut()}><ZoomOut size={17} aria-hidden="true" /></button>
        <button data-control-id="office.camera.pan-left" type="button" className="icon-button" aria-label="Pan left" title="Pan left" onClick={() => engineRef.current?.panBy(64, 0)}><ArrowLeft size={17} aria-hidden="true" /></button>
        <button data-control-id="office.camera.pan-up" type="button" className="icon-button" aria-label="Pan up" title="Pan up" onClick={() => engineRef.current?.panBy(0, 64)}><ArrowUp size={17} aria-hidden="true" /></button>
        <button data-control-id="office.camera.pan-down" type="button" className="icon-button" aria-label="Pan down" title="Pan down" onClick={() => engineRef.current?.panBy(0, -64)}><ArrowDown size={17} aria-hidden="true" /></button>
        <button data-control-id="office.camera.pan-right" type="button" className="icon-button" aria-label="Pan right" title="Pan right" onClick={() => engineRef.current?.panBy(-64, 0)}><ArrowRight size={17} aria-hidden="true" /></button>
        <button data-control-id="office.camera.reset" type="button" className="icon-button" aria-label="Reset camera" title="Reset camera" onClick={() => engineRef.current?.resetCamera()}><LocateFixed size={17} aria-hidden="true" /></button>
      </div>

      <div className="pixel-office-viewport" role="img" aria-label="H2A pixel office floor">
        <div ref={hostRef} className="pixel-office-host" data-testid="pixel-office-host" />
        {stats.renderState !== 'ready' && !failure && <div className="pixel-office-state" role="status">Preparing office scene</div>}
        {failure && (
          <div className="pixel-office-state pixel-office-state-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{failure}</span>
          </div>
        )}
      </div>

      <div className="pixel-office-live-status" role="status" aria-live="polite">
        <span>{stats.renderState === 'ready' ? 'Office scene ready' : stats.renderState === 'failed' ? 'Office scene unavailable' : 'Office scene recovering'}</span>
        <span>{stats.characterCount} agents</span>
        <span>{stats.tickerState === 'idle' ? 'Low-power idle' : 'Movement active'}</span>
        <span>{Math.round(stats.camera.zoom * 100)}%</span>
      </div>

      <section className="office-entity-list" aria-labelledby="office-entity-list-title">
        <div className="office-entity-list-heading">
          <h2 id="office-entity-list-title">Office entities</h2>
          <span>{model.entities.length}</span>
        </div>
        <ul>
          {model.entities.map((entity) => (
            <li key={entity.id} className={entity.kind === 'zone' ? 'office-zone' : undefined} data-entity-kind={entity.kind} data-office-kind={entity.officeEntityKind} data-office-entity-id={entity.officeEntityId} data-entity-status={entity.status} data-entity-activity={entity.activity}>
              {entity.officeEntityId ? (
                <button data-control-id="office.entity.select" type="button" className={selectedEntityId === entity.officeEntityId ? 'selected' : undefined} aria-pressed={selectedEntityId === entity.officeEntityId} onClick={() => { onEntitySelect(entity.officeEntityId!); if (entity.agentId) onAgentSelect(entity.agentId); }}>
                  <strong>{entity.label}</strong><span>{entity.detail}</span>
                </button>
              ) : entity.agentId ? (
                <button data-control-id="office.agent.select" type="button" className={selectedAgentId === entity.agentId ? 'selected' : undefined} aria-pressed={selectedAgentId === entity.agentId} onClick={() => onAgentSelect(entity.agentId!)}>
                  <strong>{entity.label}</strong><span>{entity.detail}</span>
                </button>
              ) : (
                <div><strong>{entity.label}</strong><span>{entity.detail}</span></div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
