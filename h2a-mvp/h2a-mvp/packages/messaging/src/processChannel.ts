import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';

/** One subprocess generation. A failed write is never replayed on another process. */
export class ProcessChannel {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly reader: Interface;
  private readonly started: Promise<void>;
  private readonly pending = new Set<(error: Error) => void>();
  private readonly messages: unknown[] = [];
  private receiver?: (message: unknown) => void;
  private failure?: Error;
  private stderr = '';
  private inputEnded = false;
  private exitDescription = 'Connector process closed before responding.';

  public constructor(
    command: string,
    args: string[],
    options: SpawnOptionsWithoutStdio,
    private readonly timeoutMs: number,
    private readonly onUnavailable: () => void
  ) {
    this.child = spawn(command, args, { ...options, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.started = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('Connector process startup timed out.')), timeoutMs);
      const failed = (error: Error) => { clearTimeout(timer); this.pending.delete(failed); reject(error); };
      this.pending.add(failed);
      this.child.once('spawn', () => { clearTimeout(timer); this.pending.delete(failed); resolve(); });
    });
    // Preserve the rejected promise for its caller while handling immediate spawn failures.
    void this.started.catch(() => {});
    this.reader = createInterface({ input: this.child.stdout });
    this.reader.on('line', (line) => {
      if (this.failure) return;
      try {
        const value = JSON.parse(line) as unknown;
        if (this.receiver) this.receiver(value); else this.messages.push(value);
      } catch { this.fail(new Error('Connector emitted non-JSON output.')); }
    });
    this.child.stderr.on('data', (data: Buffer) => { this.stderr = `${this.stderr}${data.toString()}`.slice(-2000); });
    this.child.on('error', (error) => this.fail(error));
    // Keep stream error listeners for late asynchronous EPIPE/EAGAIN after teardown.
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.stdout.on('error', (error) => this.fail(error));
    this.child.stderr.on('error', (error) => this.fail(error));
    this.child.stdin.on('close', () => {
      if (!this.inputEnded) this.fail(new Error('Connector process stdin closed.'));
    });
    this.child.on('exit', (code, signal) => {
      this.exitDescription = `Connector process exited (${signal ?? code ?? 'unknown'}). ${this.stderr}`.trim();
      this.onUnavailable();
    });
    // Exit may precede the last stdout bytes. Let readline drain before close.
    this.child.on('close', () => this.fail(new Error(this.exitDescription)));
  }

  public ready(): Promise<void> { return this.started; }

  public async write(value: unknown, end = false): Promise<void> {
    await this.started;
    const stdin = this.child.stdin;
    if (this.failure) throw this.failure;
    if (this.child.killed || this.child.exitCode !== null || this.child.signalCode !== null ||
        stdin.destroyed || stdin.closed || !stdin.writable || stdin.writableEnded || this.inputEnded) {
      const error = new Error('Connector process stdin is unavailable.');
      this.fail(error);
      throw error;
    }
    const payload = `${JSON.stringify(value)}\n`;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('Connector process write timed out.')), this.timeoutMs);
      const failed = (error: Error) => { clearTimeout(timer); this.pending.delete(failed); reject(error); };
      const written = (error?: Error | null) => {
        if (error) { this.fail(error); return; }
        clearTimeout(timer);
        this.pending.delete(failed);
        resolve();
      };
      this.pending.add(failed);
      try {
        if (end) { this.inputEnded = true; stdin.end(payload, written); }
        else stdin.write(payload, written);
        // A false write result is backpressure, not permission to resend the payload.
      } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  public nextMessage(): Promise<unknown> {
    if (this.messages.length) return Promise.resolve(this.messages.shift());
    if (this.failure) return Promise.reject(this.failure);
    if (this.receiver) return Promise.reject(new Error('Connector already has a pending response.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('Connector process response timed out.')), this.timeoutMs);
      const cleanup = () => { clearTimeout(timer); this.pending.delete(failed); this.receiver = undefined; };
      const failed = (error: Error) => { cleanup(); reject(error); };
      this.pending.add(failed);
      this.receiver = (message) => { cleanup(); resolve(message); };
    });
  }

  public close(): void { this.fail(new Error('Connector process transport closed.')); }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const reject of [...this.pending]) reject(error);
    this.pending.clear();
    this.receiver = undefined;
    this.onUnavailable();
    this.reader.close();
    this.child.stdin.destroy();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    if (!this.child.killed && this.child.exitCode === null && this.child.signalCode === null) this.child.kill();
  }
}
