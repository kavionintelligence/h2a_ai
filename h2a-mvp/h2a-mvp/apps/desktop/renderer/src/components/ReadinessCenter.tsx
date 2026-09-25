import { ChevronRight, Clock3, ExternalLink, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { OperatorReadiness, OperatorReadinessState } from '@h2a/contracts';
import type { AppRoute } from './AppShell';
import { primaryReadinessPrerequisite } from './readinessPresentation';

interface ReadinessCenterProps {
  state: OperatorReadinessState;
  mode: 'office' | 'control';
  route?: AppRoute;
  busy: boolean;
  error?: string;
  onRepair(command: OperatorReadiness): void;
  onRoute(route: AppRoute): void;
}

const routeAliases: Partial<Record<AppRoute, string[]>> = {
  'command-floor': ['command-floor'], 'authority-inbox': ['authority-inbox'], 'context-broker': ['context-broker'],
  federation: ['federation'], settings: ['settings'], evidence: ['evidence'], 'demo-gate': ['demo-gate']
};

export function ReadinessCenter({ state, mode, route, busy, error, onRepair, onRoute }: ReadinessCenterProps): React.JSX.Element | null {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const commands = useMemo(() => {
    const unresolved = state.commands.filter((item) => item.status !== 'ready');
    if (mode === 'office') return unresolved.slice(0, 6);
    const aliases = route ? routeAliases[route] ?? [route] : [];
    const local = unresolved.filter((item) => item.prerequisites.some((prerequisite) => aliases.includes(prerequisite.source_route)));
    return (local.length ? local : unresolved).slice(0, 4);
  }, [mode, route, state.commands]);
  if (!commands.length) return null;

  return (
    <section className={`readiness-center readiness-center-${mode}`} aria-labelledby={`readiness-title-${mode}`} data-readiness-generation={state.generated_at}>
      <header>
        <div><p className="eyebrow">COMMAND READINESS</p><h2 id={`readiness-title-${mode}`}>Repair before run</h2></div>
        <span>{commands.length} affected command{commands.length === 1 ? '' : 's'}</span>
      </header>
      {error && <div className="readiness-repair-error" role="alert"><ShieldAlert size={17} aria-hidden="true" /><span>{error}</span></div>}
      <div className="readiness-command-list">
        {commands.map((command) => <ReadinessCommand key={command.readiness_id} command={command} now={tick} busy={busy} onRepair={onRepair} onRoute={onRoute} />)}
      </div>
    </section>
  );
}

function ReadinessCommand({ command, now, busy, onRepair, onRoute }: { command: OperatorReadiness; now: number; busy: boolean; onRepair(command: OperatorReadiness): void; onRoute(route: AppRoute): void }): React.JSX.Element {
  const unresolved = command.prerequisites.filter((item) => item.status !== 'ready');
  const primary = primaryReadinessPrerequisite(command);
  const route = primary.remediation.route as AppRoute | null;
  const isRepairable = command.status === 'repairable' || command.status === 'partial-repair';
  return (
    <article className={`readiness-command readiness-command-${command.status}`} data-command-id={command.command_id} data-readiness-status={command.status}>
      <div className="readiness-command-main">
        <span className="readiness-command-icon" aria-hidden="true">{isRepairable ? <Clock3 size={17} /> : command.status === 'blocked' ? <ShieldAlert size={17} /> : <ExternalLink size={17} />}</span>
        <div><strong>{command.command_label}</strong><span>{primary.impact}</span><small><code>{primary.reason_code}</code> · {unresolved.length} prerequisite{unresolved.length === 1 ? '' : 's'}</small></div>
      </div>
      <div className="readiness-command-actions">
        {isRepairable ? <button data-control-id="readiness.repair" type="button" className="primary-button" disabled={busy} onClick={() => onRepair(command)}><RefreshCw size={16} aria-hidden="true" /> Repair prerequisites</button>
          : route ? <button data-control-id="readiness.remediation.open" type="button" className="secondary-button" disabled={busy} onClick={() => onRoute(route)}>{primary.remediation.label}<ChevronRight size={16} aria-hidden="true" /></button>
            : <span className="readiness-blocked-label"><ShieldCheck size={15} aria-hidden="true" /> Protected</span>}
      </div>
      <details className="readiness-technical">
        <summary>Technical details</summary>
        <div className="readiness-technical-grid">
          {unresolved.map((item) => <dl key={item.prerequisite_id}>
            <div><dt>Prerequisite</dt><dd>{item.kind.replaceAll('-', ' ')}</dd></div>
            <div><dt>Status</dt><dd>{item.status.replaceAll('-', ' ')}</dd></div>
            <div><dt>Record</dt><dd><code>{item.canonical_reference_id ?? 'not available'}</code></dd></div>
            <div><dt>Expiry</dt><dd>{item.expires_at ? `${countdown(item.expires_at, now)} · ${new Date(item.expires_at).toLocaleString()}` : 'Not applicable'}</dd></div>
            <div><dt>Scope</dt><dd><code>{scopeSummary(item.scope)}</code></dd></div>
            <div><dt>Scope hash</dt><dd><code>{item.scope_hash}</code></dd></div>
          </dl>)}
        </div>
      </details>
    </article>
  );
}

function countdown(expiresAt: string, now: number): string {
  const seconds = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
  const absolute = Math.abs(seconds); const minutes = Math.floor(absolute / 60); const remainder = absolute % 60;
  return seconds >= 0 ? `${minutes}m ${remainder}s remaining` : `expired ${minutes}m ${remainder}s ago`;
}

function scopeSummary(scope: OperatorReadiness['prerequisites'][number]['scope']): string {
  const values = [scope.resources.length && `${scope.resources.length} resources`, scope.actions.length && `${scope.actions.length} actions`, scope.fields.length && `${scope.fields.length} fields`, scope.paths.length && `${scope.paths.length} paths`, scope.commands.length && `${scope.commands.length} commands`, scope.capabilities.length && `${scope.capabilities.length} capabilities`, scope.quorum && `quorum ${scope.quorum}`].filter(Boolean);
  return values.join(' · ') || 'identity binding only';
}
