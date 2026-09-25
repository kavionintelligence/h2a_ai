export interface SceneActivityState {
  documentVisible: boolean;
  intersecting: boolean;
  reducedMotion: boolean;
  movingCharacters: number;
  activeSignals?: number;
}

export function shouldRunSceneTicker(state: SceneActivityState): boolean {
  return state.documentVisible && state.intersecting && !state.reducedMotion && (state.movingCharacters > 0 || (state.activeSignals ?? 0) > 0);
}

export interface ContextRecoveryController {
  attempts(): number;
  dispose(): void;
}

export function installOfficeContextRecovery(
  canvas: EventTarget,
  onRecover: (attempt: number) => void,
  onFailed: () => void,
  options: { maxAttempts?: number; delayMs?: number } = {}
): ContextRecoveryController {
  const maxAttempts = options.maxAttempts ?? 3;
  const delayMs = options.delayMs ?? 120;
  let attemptCount = 0;
  let disposed = false;

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    if (disposed) return;
    attemptCount += 1;
    if (attemptCount > maxAttempts) {
      disposed = true;
      onFailed();
      return;
    }
    globalThis.setTimeout(() => { if (!disposed) onRecover(attemptCount); }, delayMs);
  };

  canvas.addEventListener('webglcontextlost', onContextLost);
  return {
    attempts: () => attemptCount,
    dispose: () => {
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onContextLost);
    }
  };
}
