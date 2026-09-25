import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  connectorDeliveryResultSchema,
  connectorFrameSchema,
  type ConnectorDeliveryResult,
  type ConnectorFrame
} from '@h2a/contracts';
import type { ConnectorTransport } from './messageBroker';
import { ProcessChannel } from './processChannel';

interface LocalProcessTransportOptions {
  command: string;
  args: string[];
  connectorManifestId: string;
  connectorPrivateKeyPath: string;
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export class LocalProcessTransport implements ConnectorTransport {
  private child?: ProcessChannel;
  private temporaryDirectory?: string;
  private delivering = false;
  private generation = 0;

  public constructor(private readonly options: LocalProcessTransportOptions) {}

  public async deliver(frame: ConnectorFrame, brokerPublicKeyPem: string, authorize: (request: ConnectorFrame) => Promise<ConnectorFrame>): Promise<ConnectorDeliveryResult> {
    if (this.delivering) throw new Error('Connector process already has an active delivery.');
    this.delivering = true;
    let channel: ProcessChannel | undefined;
    try {
      channel = await this.ensureStarted(brokerPublicKeyPem);
      await channel.write({ type: 'deliver', frame });
      while (true) {
        const message = await channel.nextMessage();
        if (!message || typeof message !== 'object') throw new Error('Connector process returned an invalid message.');
        const record = message as Record<string, unknown>;
        if (record.type === 'error') throw new Error(`Connector process rejected delivery: ${String(record.message)}`);
        if (record.type === 'context-request') {
          const response = await authorize(connectorFrameSchema.parse(record.frame));
          await channel.write({ type: 'context-response', frame: response });
          continue;
        }
        if (record.type === 'completed') {
          return connectorDeliveryResultSchema.parse({ result: record.result, acknowledgement: record.acknowledgement });
        }
      }
    } catch (error) {
      channel?.close();
      throw error;
    } finally { this.delivering = false; }
  }

  public async close(): Promise<void> {
    this.generation += 1;
    this.child?.close();
    this.child = undefined;
    await this.cleanTemporaryDirectory();
  }

  private async ensureStarted(brokerPublicKeyPem: string): Promise<ProcessChannel> {
    if (this.child) return this.child;
    const generation = this.generation;
    await this.cleanTemporaryDirectory();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'h2a-connector-'));
    if (generation !== this.generation) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw new Error('Connector process transport closed during startup.');
    }
    this.temporaryDirectory = temporaryDirectory;
    const brokerKeyPath = join(temporaryDirectory, 'broker-public.pem');
    try {
      await writeFile(brokerKeyPath, brokerPublicKeyPem, { encoding: 'utf8', mode: 0o600 });
      if (generation !== this.generation) throw new Error('Connector process transport closed during startup.');
      const channel = new ProcessChannel(this.options.command, this.options.args, {
        cwd: this.options.cwd,
        env: {
          ...minimumEnvironment(), ...this.options.env,
          H2A_CONNECTOR_MANIFEST_ID: this.options.connectorManifestId,
          H2A_CONNECTOR_PRIVATE_KEY_PATH: this.options.connectorPrivateKeyPath,
          H2A_BROKER_PUBLIC_KEY_PATH: brokerKeyPath
        }
      }, this.options.timeoutMs ?? 5000, () => { if (this.child === channel) this.child = undefined; });
      this.child = channel;
      await channel.ready();
      return channel;
    } catch (error) {
      await this.cleanTemporaryDirectory();
      throw error;
    }
  }

  private async cleanTemporaryDirectory(): Promise<void> {
    const directory = this.temporaryDirectory;
    this.temporaryDirectory = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

function minimumEnvironment(): Record<string, string> {
  const allowed = ['PATH', 'SystemRoot', 'ComSpec', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'LANG'];
  return Object.fromEntries(allowed.flatMap((key) => process.env[key] ? [[key, process.env[key] as string]] : []));
}
