import {
  Bot,
  DatabaseZap,
  Fingerprint,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Network,
  Settings,
  BadgeCheck,
  ShieldCheck,
  UsersRound
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { GuidedWorkflowAction, OperatorNotification, OperatorSession, SystemStatus } from '@h2a/contracts';
import type { PresentationMode } from '@h2a/contracts';
import { PresentationModeSwitch } from './PresentationModeSwitch';

export type AppRoute = 'command-floor' | 'human-proof' | 'people-authority' | 'authority-inbox' | 'mandates' | 'context-broker' | 'federation' | 'evidence' | 'demo-gate' | 'settings';

interface AppShellProps {
  route: AppRoute;
  status: SystemStatus;
  runtimeMode: string;
  runtimeTrust: string;
  workspaceState: 'loading' | 'ready' | 'error';
  presentationMode: PresentationMode;
  modeChangePending: boolean;
  onPresentationModeChange(mode: PresentationMode): void;
  onRouteChange(route: AppRoute): void;
  workflowDetour?: GuidedWorkflowAction;
  onReturnToWorkflow(): void;
  operatorSession?: OperatorSession;
  notifications: OperatorNotification[];
  onNotificationRoute(route: string): void;
  children: React.ReactNode;
}

const navigation: Array<{ id: AppRoute; label: string; icon: LucideIcon }> = [
  { id: 'command-floor', label: 'Command Floor', icon: LayoutDashboard },
  { id: 'human-proof', label: 'Human Proof', icon: Fingerprint },
  { id: 'people-authority', label: 'People & Authority', icon: UsersRound },
  { id: 'authority-inbox', label: 'Authority Inbox', icon: Inbox },
  { id: 'mandates', label: 'Mandates', icon: KeyRound },
  { id: 'context-broker', label: 'Context Broker', icon: DatabaseZap },
  { id: 'federation', label: 'Federation', icon: Network },
  { id: 'evidence', label: 'Evidence', icon: ShieldCheck },
  { id: 'demo-gate', label: 'Demo Gate', icon: BadgeCheck },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export function AppShell({ route, status, runtimeMode, runtimeTrust, workspaceState, presentationMode, modeChangePending, onPresentationModeChange, onRouteChange, workflowDetour, onReturnToWorkflow, operatorSession, notifications, onNotificationRoute, children }: AppShellProps): React.JSX.Element {
  const mainRef = useRef<HTMLElement>(null);
  const evidenceState = workspaceState === 'loading'
    ? { label: 'Checking evidence', tone: 'approval' }
    : workspaceState === 'error'
      ? { label: 'Evidence unavailable', tone: 'danger' }
      : status.evidenceIntegrity === 'verified'
        ? { label: 'Evidence verified', tone: 'verified' }
        : status.evidenceIntegrity === 'warning'
          ? { label: 'Evidence warning', tone: 'approval' }
          : { label: 'Evidence failed', tone: 'danger' };

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <PresentationModeSwitch mode={presentationMode} disabled={modeChangePending} onModeChange={onPresentationModeChange} />
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><Bot size={20} /></span>
          <span className="brand-name">H2A</span>
          <span className="brand-env">LOCAL</span>
        </div>

        <nav className="nav-list">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${route === id ? 'nav-item-active' : ''}`}
              key={id}
              type="button"
              aria-label={label}
              aria-current={route === id ? 'page' : undefined}
              title={label}
              onClick={() => onRouteChange(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <div className="status-row">
            <span className={`status-indicator status-indicator-${evidenceState.tone}`} aria-hidden="true" />
            <span>{evidenceState.label}</span>
          </div>
          <div className="sidebar-meta">{status.agentMode}</div>
          <div className="sidebar-meta">v{status.appVersion}</div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">HUMAN-BOUND AGENT OPERATIONS</p>
            <h1>{navigation.find((item) => item.id === route)?.label}</h1>
          </div>
          <div className="topbar-context" aria-label="Runtime status">
            <span className="context-key">Mode</span>
            <span className="context-value">{runtimeMode}</span>
            <span className="context-divider" aria-hidden="true" />
            <span className="context-key">Trust</span>
            <span className="context-value">{runtimeTrust}</span>
            <span className="context-divider" aria-hidden="true" />
            <span className={`status-indicator status-indicator-${evidenceState.tone}`} aria-hidden="true" />
            <span className="context-value">{evidenceState.label}</span>
            <span className="context-divider" aria-hidden="true" />
            <span className="context-key">Session</span>
            <span className="context-value">{operatorSession?.status ?? 'recovering'} · cursor {operatorSession?.last_confirmed_cursor ?? 0}</span>
          </div>
        </header>
        {notifications.length > 0 && <div className="operator-notification-strip" aria-label="Actionable notifications">{notifications.slice(0, 3).map((item) => item.route && item.action_label ? <button key={item.notification_id} type="button" className={`operator-notification operator-notification-${item.severity}`} onClick={() => onNotificationRoute(item.route!)}><strong>{item.title}</strong><span>{item.detail}</span><small>{item.action_label}</small></button> : <div key={item.notification_id} className={`operator-notification operator-notification-${item.severity}`}><strong>{item.title}</strong><span>{item.detail}</span></div>)}</div>}
        {workflowDetour && <div className="workflow-detour-banner" role="status">
          <span><strong>Guided step:</strong> {workflowDetour.reason}</span>
          <button type="button" className="secondary-button" disabled={modeChangePending} onClick={onReturnToWorkflow}>Return to Office workflow</button>
        </div>}
        <main id="main-content" ref={mainRef} tabIndex={-1} aria-busy={workspaceState === 'loading'}>{children}</main>
      </div>
    </div>
  );
}
