import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Writable } from 'node:stream';

const retryDelayMs = 250;

/** Diagnostics must not turn a recoverable refresh failure into a main-process crash.
 * Every record is persisted independently of the launcher-owned stderr pipe.
 */
export class DurableDiagnostics {
  private detached = false;
  private waitingForDrain = false;
  private retryAt = 0;
  private persistenceError?: string;

  constructor(private readonly filePath: string, private readonly stream: Writable = process.stderr) {
    stream.on('error', this.onStreamError);
    stream.on('close', this.onClosed);
    stream.on('finish', this.onClosed);
    stream.on('drain', this.onDrain);
  }

  error(message: string, error?: unknown): void {
    const record = { timestamp: new Date().toISOString(), level: 'error', message: redact(message), error: describeError(error) };
    const line = `${JSON.stringify(record)}\n`;
    this.persist(line);
    if (!this.canWrite()) return;
    try {
      // A false return means accepted but backpressured: never repeat this write.
      let failed = false;
      const accepted = this.stream.write(line, (failure?: Error | null) => {
        if (failure) { failed = true; this.onStreamError(failure); }
      });
      if (!failed) this.waitingForDrain = !accepted;
    } catch (failure) { this.onStreamError(failure); }
  }

  getStatus(): { stderrDetached: boolean; backpressured: boolean; persistenceError?: string } {
    return { stderrDetached: this.detached, backpressured: this.waitingForDrain || Date.now() < this.retryAt, persistenceError: this.persistenceError };
  }

  dispose(): void {
    this.detached = true;
    this.stream.off('close', this.onClosed);
    this.stream.off('finish', this.onClosed);
    this.stream.off('drain', this.onDrain);
    // Keep the error listener: an in-flight stream write may fail after shutdown.
    // It never keeps a process alive and must not become an unhandled error event.
  }

  private canWrite(): boolean {
    if (this.detached) return false;
    if (this.stream.destroyed || this.stream.closed || this.stream.writableEnded || this.stream.writableFinished || !this.stream.writable) {
      this.detached = true; return false;
    }
    return !this.waitingForDrain && Date.now() >= this.retryAt;
  }

  private readonly onClosed = (): void => { this.detached = true; };
  private readonly onDrain = (): void => { this.waitingForDrain = false; };
  private readonly onStreamError = (failure: unknown): void => {
    const code = errorCode(failure);
    // EAGAIN is transient only if Node has not destroyed/ended the stream.
    // The next diagnostic may retry after cooldown; this message is already durable.
    if (code === 'EAGAIN' && !this.stream.destroyed && !this.stream.closed && !this.stream.writableEnded) {
      this.retryAt = Date.now() + retryDelayMs; this.waitingForDrain = false;
    } else {
      if (this.detached) return;
      this.detached = true;
    }
    this.persist(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: 'Diagnostic output pipe unavailable; original errors remain in this file.', error: describeError(failure) })}\n`);
  };

  private persist(line: string): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
      appendFileSync(this.filePath, line, { encoding: 'utf8', mode: 0o600 });
      this.persistenceError = undefined;
    } catch (failure) {
      // Do not recursively write to the same failing pipe while reporting a disk error.
      this.persistenceError = describeError(failure)?.message ?? 'Diagnostic persistence failed.';
    }
  }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

function describeError(error: unknown): { name: string; message: string; code?: string; stack?: string } | undefined {
  if (error === undefined) return undefined;
  if (error instanceof Error) return { name: error.name, message: redact(error.message), code: errorCode(error), stack: error.stack ? redact(error.stack) : undefined };
  let message: string;
  try { message = typeof error === 'string' ? error : JSON.stringify(error); } catch { message = 'Unserializable diagnostic error'; }
  return { name: 'Error', message: redact(message ?? 'Unknown error'), code: errorCode(error) };
}

function redact(value: string): string {
  return value
    .replace(/\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{12,})\b/gu, '[REDACTED_CREDENTIAL]')
    .replace(/\b(Bearer\s+)\S+/giu, '$1[REDACTED]')
    .replace(/\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|authorization)\s*[:=]\s*)[^\s,}"']+/giu, '$1[REDACTED]')
    .slice(0, 16000);
}
