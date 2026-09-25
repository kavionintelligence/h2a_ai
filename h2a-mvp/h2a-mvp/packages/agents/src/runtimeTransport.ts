import type { IPty } from 'node-pty';
import * as nodePty from 'node-pty';
import type { RuntimeTransportKind } from '@h2a/contracts';

export interface RuntimeTransportDescriptor {
  kind: RuntimeTransportKind;
  available: boolean;
  detail: string;
}

export interface PtySpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

export interface PtyProcessPort {
  readonly pid: number;
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface PtyFactoryPort {
  spawn(executable: string, args: string[], options: PtySpawnOptions): PtyProcessPort;
}

class NodePtyFactory implements PtyFactoryPort {
  public spawn(executable: string, args: string[], options: PtySpawnOptions): PtyProcessPort {
    return nodePty.spawn(executable, args, options) as IPty;
  }
}

export class RuntimeTransportRegistry {
  public constructor(public readonly pty: PtyFactoryPort = new NodePtyFactory()) {}

  public descriptors(): RuntimeTransportDescriptor[] {
    return [
      { kind: 'structured-cli', available: true, detail: 'Governed default using fixed provider arguments, bounded structured output, and persisted evidence.' },
      { kind: 'framework-stdio', available: true, detail: 'Signed framework delivery remains available through the existing MCP/A2A stdio connector boundary.' },
      { kind: 'interactive-pty', available: true, detail: 'Explicit attached terminal using node-pty; host execution remains connected-observed.' }
    ];
  }
}
