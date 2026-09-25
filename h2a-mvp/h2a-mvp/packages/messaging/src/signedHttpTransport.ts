import {
  connectorDeliveryResultSchema,
  connectorFrameSchema,
  type ConnectorDeliveryResult,
  type ConnectorFrame
} from '@h2a/contracts';
import type { ConnectorTransport } from './messageBroker';

export interface SignedHttpTransportOptions {
  endpoint: string;
  authorizationHeader?: string;
  timeoutMs?: number;
  allowRemoteHttp?: boolean;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
}

export class SignedHttpConnectorTransport implements ConnectorTransport {
  public constructor(private readonly options: SignedHttpTransportOptions) {
    assertEndpoint(options.endpoint, options.allowRemoteHttp ?? false);
  }

  public async deliver(frame: ConnectorFrame, brokerPublicKeyPem: string, authorize: (request: ConnectorFrame) => Promise<ConnectorFrame>): Promise<ConnectorDeliveryResult> {
    const first = await this.exchange({ phase: 'task', frame, broker_public_key_pem: brokerPublicKeyPem });
    if (first.type !== 'context-request') throw new Error('HTTP connector did not request bounded context.');
    const contextResponse = await authorize(connectorFrameSchema.parse(first.frame));
    const completed = await this.exchange({ phase: 'context-response', frame: contextResponse });
    if (completed.type !== 'completed') throw new Error('HTTP connector did not return a completed delivery.');
    return connectorDeliveryResultSchema.parse({ result: completed.result, acknowledgement: completed.acknowledgement });
  }

  private async exchange(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    try {
      const response = await (this.options.fetchImpl ?? fetch)(this.options.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-h2a-protocol-version': '1.0',
          ...(this.options.authorizationHeader ? { authorization: this.options.authorizationHeader } : {})
        },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP connector returned ${response.status}.`);
      const text = await readBounded(response, this.options.maxResponseBytes ?? 512_000);
      const value = JSON.parse(text) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HTTP connector returned an invalid object.');
      return value as Record<string, unknown>;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function assertEndpoint(endpoint: string, allowRemoteHttp: boolean): void {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP connector endpoint must use HTTP or HTTPS.');
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback && !allowRemoteHttp) throw new Error('Remote connector endpoints require HTTPS.');
  if (url.username || url.password) throw new Error('Connector credentials must not be embedded in the endpoint URL.');
}

async function readBounded(response: Response, maximum: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maximum) throw new Error('HTTP connector response exceeds the configured limit.');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new Error('HTTP connector response exceeds the configured limit.'); }
    chunks.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(combined);
}
