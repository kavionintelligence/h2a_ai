import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  connectorDeliveryResultSchema,
  connectorFrameSchema,
  type ConnectorDeliveryResult,
  type ConnectorFrame
} from '@h2a/contracts';
import type { ConnectorTransport } from './messageBroker';

export interface McpConnectorTransportOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  toolName?: string;
  timeoutMs?: number;
}

export class McpConnectorTransport implements ConnectorTransport {
  private client?: Client;
  private transport?: StdioClientTransport;

  public constructor(private readonly options: McpConnectorTransportOptions) {}

  public async deliver(frame: ConnectorFrame, brokerPublicKeyPem: string, authorize: (request: ConnectorFrame) => Promise<ConnectorFrame>): Promise<ConnectorDeliveryResult> {
    await this.ensureConnected();
    const first = await this.call({ phase: 'task', frame, broker_public_key_pem: brokerPublicKeyPem });
    if (first.type === 'completed') return connectorDeliveryResultSchema.parse({ result: first.result, acknowledgement: first.acknowledgement });
    if (first.type !== 'context-request') throw new Error('MCP connector did not request bounded context.');
    const contextResponse = await authorize(connectorFrameSchema.parse(first.frame));
    const completed = await this.call({ phase: 'context-response', frame: contextResponse });
    if (completed.type !== 'completed') throw new Error('MCP connector did not complete the signed exchange.');
    return connectorDeliveryResultSchema.parse({ result: completed.result, acknowledgement: completed.acknowledgement });
  }

  public async close(): Promise<void> {
    if (this.client) await this.client.close();
    this.client = undefined;
    this.transport = undefined;
  }

  private async ensureConnected(): Promise<void> {
    if (this.client) return;
    this.transport = new StdioClientTransport({
      command: this.options.command,
      args: this.options.args,
      cwd: this.options.cwd,
      env: { ...minimumEnvironment(), ...this.options.env },
      stderr: 'pipe'
    });
    this.client = new Client({ name: 'h2a-mcp-gateway', version: '1.0.0' });
    await this.client.connect(this.transport);
  }

  private async call(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.client!.callTool(
      { name: this.options.toolName ?? 'h2a_exchange', arguments: payload },
      undefined,
      { timeout: this.options.timeoutMs ?? 10_000 }
    );
    if (result.isError) throw new Error(`MCP connector rejected the exchange: ${extractText(result.content)}`);
    const structured = result.structuredContent;
    if (structured && typeof structured === 'object' && !Array.isArray(structured)) return structured as Record<string, unknown>;
    const text = extractText(result.content);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('MCP connector returned invalid structured content.');
    return parsed as Record<string, unknown>;
  }
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content.filter((item): item is { type: 'text'; text: string } => Boolean(item && typeof item === 'object' && (item as { type?: string }).type === 'text' && typeof (item as { text?: unknown }).text === 'string')).map((item) => item.text).join('\n');
}

function minimumEnvironment(): Record<string, string> {
  const allowed = ['PATH', 'SystemRoot', 'ComSpec', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'LANG'];
  return Object.fromEntries(allowed.flatMap((key) => process.env[key] ? [[key, process.env[key] as string]] : []));
}
