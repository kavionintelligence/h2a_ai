import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Eye, Link, LogIn, PlugZap, Square, Unplug } from 'lucide-react';
import type { LiveProviderId, RuntimeAttachmentState, TerminalAttachmentLease, TerminalPurpose } from '@h2a/contracts';

interface AttachedTerminalProps {
  provider: LiveProviderId;
  agentId: string;
  passportId: string;
  bindingId: string;
  runtimeSessionId: string;
  mandateId: string;
  traceId: string;
  workspacePath: string;
  authorityReady: boolean;
}

const emptyState: RuntimeAttachmentState = {
  transports: [
    { kind: 'structured-cli', available: true, detail: 'Governed structured runtime.' },
    { kind: 'framework-stdio', available: true, detail: 'Signed framework stdio.' },
    { kind: 'interactive-pty', available: false, detail: 'Checking attached terminal transport.' }
  ],
  sessions: [], leases: [], events: [], trust_ceiling: 'connected-observed'
};

export function AttachedTerminal(props: AttachedTerminalProps): React.JSX.Element {
  const [state, setState] = useState<RuntimeAttachmentState>(emptyState);
  const [lease, setLease] = useState<TerminalAttachmentLease>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clientId = useRef(`terminal_renderer_${crypto.randomUUID()}`);
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | undefined>(undefined);
  const fit = useRef<FitAddon | undefined>(undefined);
  const cursor = useRef(0);
  const session = useMemo(() => state.sessions.find((item) => item.agent_id === props.agentId), [props.agentId, state.sessions]);
  const active = session && ['starting', 'running', 'awaiting-input'].includes(session.status);

  const refresh = useCallback(async () => {
    if (!window.h2a) return;
    setState(await window.h2a.getRuntimeAttachmentState());
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 1_000); return () => window.clearInterval(timer); }, [refresh]);

  useEffect(() => {
    if (!terminalHost.current || terminal.current) return;
    const next = new Terminal({
      convertEol: true, cursorBlink: true, scrollback: 500, fontSize: 12,
      fontFamily: 'Cascadia Mono, Consolas, monospace', theme: { background: '#0b1118', foreground: '#d9e5ef', cursor: '#62a4ff', selectionBackground: '#31577a' }
    });
    const nextFit = new FitAddon();
    next.loadAddon(nextFit);
    next.open(terminalHost.current);
    nextFit.fit();
    terminal.current = next;
    fit.current = nextFit;
    return () => { next.dispose(); terminal.current = undefined; fit.current = undefined; };
  }, []);

  useEffect(() => {
    const next = terminal.current;
    if (!next || !lease || !session || lease.session_id !== session.session_id || !window.h2a) return;
    const disposable = next.onData((data) => {
      if (!lease.capabilities.includes('interact')) return;
      void window.h2a?.writeTerminal({ ...leaseKey(lease), data }).catch((reason: unknown) => setError(message(reason)));
    });
    return () => disposable.dispose();
  }, [lease, session]);

  useEffect(() => {
    if (!lease || !session || !window.h2a) return;
    let disposed = false;
    const replay = async (): Promise<void> => {
      try {
        const response = await window.h2a!.getTerminalReplay({ ...leaseKey(lease), after_cursor: cursor.current });
        if (disposed) return;
        if (response.mode === 'snapshot-required') {
          terminal.current?.clear();
          terminal.current?.writeln('\r\n[Bounded terminal history was truncated. Replaying from the first retained cursor.]\r\n');
          cursor.current = Math.max(0, response.first_available_cursor - 1);
          return;
        }
        for (const event of response.events) {
          if (event.content) terminal.current?.write(event.content);
          cursor.current = Math.max(cursor.current, event.cursor);
        }
      } catch (reason) { if (!disposed) { setError(message(reason)); setLease(undefined); } }
    };
    void replay();
    const timer = window.setInterval(() => void replay(), 350);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [lease, session]);

  useEffect(() => {
    const host = terminalHost.current;
    if (!host || !lease || !window.h2a) return;
    const observer = new ResizeObserver(() => {
      fit.current?.fit();
      const current = terminal.current;
      if (!current) return;
      void window.h2a?.resizeTerminal({ ...leaseKey(lease), cols: current.cols, rows: current.rows }).catch(() => undefined);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [lease]);

  useEffect(() => () => { if (lease && window.h2a) void window.h2a.detachTerminal(leaseKey(lease)).catch(() => undefined); }, [lease]);

  useEffect(() => {
    if (!lease || !session || !window.h2a) return;
    const timer = window.setTimeout(() => {
      void window.h2a?.attachTerminal({
        session_id: session.session_id, client_id: clientId.current,
        requested_capabilities: lease.capabilities, ttl_seconds: 120
      }).then(setLease).catch((reason: unknown) => { setError(message(reason)); setLease(undefined); });
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [lease, session]);

  async function start(purpose: TerminalPurpose): Promise<void> {
    if (!window.h2a) return;
    setBusy(true); setError(''); cursor.current = 0; terminal.current?.reset();
    try {
      const next = await window.h2a.startTerminalSession({
        provider: props.provider, purpose, agent_id: props.agentId, passport_id: props.passportId,
        binding_id: props.bindingId, runtime_session_id: props.runtimeSessionId, mandate_id: props.mandateId,
        trace_id: props.traceId, workspace_path: props.workspacePath,
        cols: terminal.current?.cols ?? 100, rows: terminal.current?.rows ?? 28
      });
      setState(next);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function attach(capabilities: Array<'observe' | 'interact' | 'control'>): Promise<void> {
    if (!window.h2a || !session) return;
    setBusy(true); setError('');
    try {
      const next = await window.h2a.attachTerminal({ session_id: session.session_id, client_id: clientId.current, requested_capabilities: capabilities, ttl_seconds: 120 });
      cursor.current = 0;
      terminal.current?.reset();
      setLease(next);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function detach(): Promise<void> {
    if (!window.h2a || !lease) return;
    setBusy(true); setError('');
    try { await window.h2a.detachTerminal(leaseKey(lease)); setLease(undefined); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function stop(): Promise<void> {
    if (!window.h2a || !lease) return;
    setBusy(true); setError('');
    try { setState(await window.h2a.cancelTerminal({ ...leaseKey(lease), reason: 'Stopped from attached Command Floor terminal.' })); setLease(undefined); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  const ptyAvailable = state.transports.find((item) => item.kind === 'interactive-pty')?.available;
  return (
    <section className="attached-terminal" aria-label="Attached provider terminal">
      <div className="attached-terminal-heading">
        <div><strong>Attached provider terminal</strong><span>Explicit PTY attachment · host-provider authentication scope</span></div>
        <span className="terminal-trust">{state.trust_ceiling}</span>
      </div>
      <div className="terminal-session-facts">
        <span><b>Transport</b> interactive-pty</span><span><b>Session</b> {session?.session_id ?? 'not started'}</span>
        <span><b>Status</b> {session?.status ?? 'idle'}</span><span><b>Lease</b> {lease ? lease.capabilities.join(' + ') : 'detached'}</span>
      </div>
      <div ref={terminalHost} className="xterm-host" aria-label="Provider terminal output" />
      <div className="attached-terminal-actions">
        {!active && <><button data-control-id="command-floor.terminal.login" type="button" disabled={busy || !ptyAvailable || !props.authorityReady} onClick={() => void start('login-consent')}><LogIn size={14} /> Login / consent</button><button data-control-id="command-floor.terminal.start" className="primary-button" type="button" disabled={busy || !ptyAvailable || !props.authorityReady} onClick={() => void start('interactive-session')}><PlugZap size={14} /> Start session</button></>}
        {active && !lease && <><button data-control-id="command-floor.terminal.observe" type="button" disabled={busy} onClick={() => void attach(['observe'])}><Eye size={14} /> Observe</button><button data-control-id="command-floor.terminal.interact" className="primary-button" type="button" disabled={busy} onClick={() => void attach(['observe', 'interact', 'control'])}><Link size={14} /> Attach controls</button></>}
        {lease && <><button data-control-id="command-floor.terminal.detach" type="button" disabled={busy} onClick={() => void detach()}><Unplug size={14} /> Detach</button>{lease.capabilities.includes('control') && <button data-control-id="command-floor.terminal.cancel" className="danger-command" type="button" disabled={busy} onClick={() => void stop()}><Square size={14} /> Stop process</button>}</>}
      </div>
      <p className="terminal-boundary">Detach leaves the host process running. Stopping requires a current control lease and live runtime authority. No bypass or auto-approval flags are used.</p>
      {error && <div className="inline-error" role="alert">{error}</div>}
    </section>
  );
}

function leaseKey(lease: TerminalAttachmentLease): { lease_id: string; session_id: string; client_id: string; generation: string } {
  return { lease_id: lease.lease_id, session_id: lease.session_id, client_id: lease.client_id, generation: lease.generation };
}

function message(value: unknown): string { return value instanceof Error ? value.message : String(value); }
