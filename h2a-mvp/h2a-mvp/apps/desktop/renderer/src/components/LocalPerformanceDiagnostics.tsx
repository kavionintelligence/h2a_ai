import { Gauge } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ChromiumPerformanceMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface DiagnosticsSnapshot {
  sampledAt: string;
  framesPerSecond: number | null;
  frameP95Ms: number | null;
  heapUsedMb: number | null;
  heapLimitMb: number | null;
  domNodes: number;
  canvases: number;
  officeTicker: string;
  visibility: DocumentVisibilityState;
}

export function LocalPerformanceDiagnostics(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot>(() => readSnapshot(null, null));

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let frame = 0;

    const sample = (): void => {
      if (document.hidden) {
        setSnapshot(readSnapshot(null, null));
        timer = window.setTimeout(sample, 5000);
        return;
      }
      const intervals: number[] = [];
      let previous = performance.now();
      const capture = (now: number): void => {
        if (cancelled) return;
        intervals.push(now - previous);
        previous = now;
        if (intervals.length < 30) {
          frame = window.requestAnimationFrame(capture);
          return;
        }
        const sorted = [...intervals].sort((left, right) => left - right);
        const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
        setSnapshot(readSnapshot(Math.round(1000 / average), sorted[Math.floor(sorted.length * 0.95)] ?? null));
        timer = window.setTimeout(sample, 5000);
      };
      frame = window.requestAnimationFrame(capture);
    };

    sample();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const health = snapshot.visibility === 'hidden'
    ? 'Paused while hidden'
    : snapshot.framesPerSecond !== null && snapshot.framesPerSecond < 30
      ? 'Renderer under load'
      : 'Local sampler active';

  return (
    <section className="system-panel local-diagnostics" aria-labelledby="local-diagnostics-title" data-diagnostics-telemetry="disabled" data-diagnostics-health={health}>
      <div className="system-panel-header">
        <span className="system-icon"><Gauge size={24} aria-hidden="true" /></span>
        <div><p className="section-kicker">LOCAL PERFORMANCE</p><h2 id="local-diagnostics-title">Renderer diagnostics</h2></div>
        <span className="diagnostics-local-badge">Local only</span>
      </div>
      <p className="diagnostics-disclosure">Ephemeral browser measurements only. No telemetry endpoint, persistence, or export is configured.</p>
      <div className="diagnostics-grid" role="status" aria-live="polite">
        <Diagnostic label="Frame rate" value={snapshot.framesPerSecond === null ? '--' : `${snapshot.framesPerSecond} fps`} />
        <Diagnostic label="Frame p95" value={snapshot.frameP95Ms === null ? '--' : `${snapshot.frameP95Ms.toFixed(1)} ms`} />
        <Diagnostic label="JS heap" value={snapshot.heapUsedMb === null ? 'Unavailable' : `${snapshot.heapUsedMb.toFixed(1)} / ${snapshot.heapLimitMb?.toFixed(0)} MB`} />
        <Diagnostic label="DOM nodes" value={String(snapshot.domNodes)} />
        <Diagnostic label="Canvas" value={String(snapshot.canvases)} />
        <Diagnostic label="Office ticker" value={snapshot.officeTicker} />
      </div>
      <div className="diagnostics-footer"><span>{health}</span><time dateTime={snapshot.sampledAt}>{snapshot.sampledAt ? new Date(snapshot.sampledAt).toLocaleTimeString() : 'Sampling'}</time></div>
    </section>
  );
}

function readSnapshot(framesPerSecond: number | null, frameP95Ms: number | null): DiagnosticsSnapshot {
  const memory = (performance as Performance & { memory?: ChromiumPerformanceMemory }).memory;
  const officeCanvas = document.querySelector<HTMLElement>('[data-ticker-state]');
  return {
    sampledAt: new Date().toISOString(), framesPerSecond, frameP95Ms,
    heapUsedMb: memory ? bytesToMb(memory.usedJSHeapSize) : null,
    heapLimitMb: memory ? bytesToMb(memory.jsHeapSizeLimit) : null,
    domNodes: document.querySelectorAll('*').length,
    canvases: document.querySelectorAll('canvas').length,
    officeTicker: officeCanvas?.dataset.tickerState ?? 'not-mounted',
    visibility: document.visibilityState
  };
}

function bytesToMb(value: number): number { return value / (1024 * 1024); }

function Diagnostic({ label, value }: { label: string; value: string }): React.JSX.Element {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
