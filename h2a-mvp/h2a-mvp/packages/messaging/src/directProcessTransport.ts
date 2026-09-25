import { connectorDeliveryResultSchema, type ConnectorDeliveryResult, type ConnectorFrame } from '@h2a/contracts';
import type { ConnectorTransport } from './messageBroker';
import { ProcessChannel } from './processChannel';

export interface DirectProcessTransportOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  connectorManifestId: string;
  runtimePrivateKeyPem: string;
  timeoutMs?: number;
}

export class DirectProcessTransport implements ConnectorTransport {
  private child?: ProcessChannel;
  private delivering = false;

  public constructor(private readonly options: DirectProcessTransportOptions) {}

  public async deliver(frame: ConnectorFrame, brokerPublicKeyPem: string): Promise<ConnectorDeliveryResult> {
    if (this.delivering) throw new Error('Framework subprocess already has an active delivery.');
    this.delivering = true;
    let channel: ProcessChannel | undefined;
    try {
      channel = new ProcessChannel(this.options.command, this.options.args, {
        cwd: this.options.cwd, env: { ...minimumEnvironment(), ...this.options.env }
      }, this.options.timeoutMs ?? 30_000, () => { if (this.child === channel) this.child = undefined; });
      this.child = channel;
      await channel.write({ type: 'execute', frame, broker_public_key_pem: brokerPublicKeyPem,
        connector_manifest_id: this.options.connectorManifestId, runtime_private_key_pem: this.options.runtimePrivateKeyPem }, true);
      const response = await channel.nextMessage();
      if (!response || typeof response !== 'object') throw new Error('Framework subprocess returned an invalid message.');
      const parsed = response as Record<string, unknown>;
      if (parsed.type === 'error') throw new Error(String(parsed.message));
      return connectorDeliveryResultSchema.parse({ result: parsed.result, acknowledgement: parsed.acknowledgement });
    } finally {
      channel?.close();
      if (this.child === channel) this.child = undefined;
      this.delivering = false;
    }
  }

  public async close(): Promise<void> {
    this.child?.close();
    this.child = undefined;
  }
}

function minimumEnvironment(): NodeJS.ProcessEnv {
  const allowed = ['PATH', 'SystemRoot', 'ComSpec', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'];
  return Object.fromEntries(allowed.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
}
