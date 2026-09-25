import { createHash } from 'node:crypto';
import { createServer as createHttpServer, request as httpRequest, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer, request as httpsRequest, type Server as HttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { TLSSocket } from 'node:tls';
import { federationEnvelopeSchema, federatedPayloadSchema, type FederatedPayload, type FederationEnvelope } from '@h2a/contracts';
import type { FederationService } from './federationService';

export interface FederationServerOptions {
  host?: string;
  port?: number;
  remoteEnabled?: boolean;
  tls?: { key: string | Buffer; cert: string | Buffer };
  maximumRequestBytes?: number;
}

export type FederationEnvelopeHandler = (envelope: FederationEnvelope) => Promise<FederatedPayload>;

export class FederationHttpServer {
  private server: HttpServer | HttpsServer | undefined;

  public constructor(
    private readonly service: FederationService,
    private readonly handler: FederationEnvelopeHandler,
    private readonly options: FederationServerOptions = {}
  ) {}

  public async start(): Promise<string> {
    if (this.server) throw new Error('Federation listener is already running.');
    const host = this.options.host ?? '127.0.0.1';
    const loopback = isLoopback(host);
    if (!this.options.remoteEnabled && !loopback) throw new Error('Federation listener is loopback-only by default.');
    if (!loopback && !this.options.tls) throw new Error('Remote federation listener requires TLS.');
    const listener = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('x-h2a-federation-version', '2');
      if (request.method !== 'POST' || request.url !== '/h2a/federation/v2/envelopes') { response.statusCode = 404; response.end(JSON.stringify({ error: 'NOT_FOUND' })); return; }
      try {
        const value = JSON.parse(await readRequest(request, this.options.maximumRequestBytes ?? 512_000)) as unknown;
        const envelope = await this.service.receiveEnvelope(value);
        const payload = federatedPayloadSchema.parse(await this.handler(envelope));
        const reply = await this.service.signEnvelope(envelope.peer_id, payload, {
          traceId: envelope.trace_id,
          taskId: envelope.task_id,
          mandateId: envelope.mandate_id,
          contextGrantId: envelope.context_grant_id
        });
        response.statusCode = 200;
        response.end(JSON.stringify(reply));
      } catch (error) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'FEDERATION_REQUEST_REJECTED' }));
      }
    };
    this.server = this.options.tls ? createHttpsServer(this.options.tls, (request, response) => { void listener(request, response); }) : createHttpServer((request, response) => { void listener(request, response); });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.options.port ?? 0, host, () => { this.server!.off('error', reject); resolve(); });
    });
    const address = this.server.address() as AddressInfo;
    return `${this.options.tls ? 'https' : 'http'}://${formatHost(address.address)}:${address.port}/h2a/federation/v2/envelopes`;
  }

  public async close(): Promise<void> {
    if (!this.server) return;
    const current = this.server;
    this.server = undefined;
    await new Promise<void>((resolve, reject) => current.close((error) => error ? reject(error) : resolve()));
  }
}

export interface FederationHttpClientOptions {
  endpoint: string;
  expectedTlsCertificateFingerprint?: string;
  timeoutMs?: number;
  maximumResponseBytes?: number;
}

export class FederationHttpClient {
  public constructor(private readonly localService: FederationService, private readonly options: FederationHttpClientOptions) {
    assertClientEndpoint(options.endpoint);
    if (options.expectedTlsCertificateFingerprint && !/^sha256:[0-9a-f]{64}$/u.test(options.expectedTlsCertificateFingerprint)) throw new Error('TLS certificate fingerprint must use SHA-256.');
  }

  public async exchange(envelope: FederationEnvelope): Promise<FederationEnvelope> {
    const body = JSON.stringify(federationEnvelopeSchema.parse(envelope));
    const responseText = await sendRequest(body, this.options);
    const response = federationEnvelopeSchema.parse(JSON.parse(responseText) as unknown);
    const accepted = await this.localService.receiveEnvelope(response);
    if (accepted.payload.type !== 'ack' || accepted.payload.acknowledged_envelope_id !== envelope.envelope_id) throw new Error('Federation response did not acknowledge the outbound envelope.');
    return accepted;
  }
}

async function sendRequest(body: string, options: FederationHttpClientOptions): Promise<string> {
  const endpoint = new URL(options.endpoint);
  const https = endpoint.protocol === 'https:';
  return new Promise<string>((resolve, reject) => {
    let pinned = !https || !options.expectedTlsCertificateFingerprint;
    const request = (https ? httpsRequest : httpRequest)({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-h2a-federation-version': '2' },
      timeout: options.timeoutMs ?? 10_000,
      ...(https ? { rejectUnauthorized: !options.expectedTlsCertificateFingerprint } : {})
    }, async (response) => {
      try {
        if (!pinned) throw new Error('Federation TLS certificate pin was not verified.');
        if (response.statusCode !== 200) throw new Error(`Federation endpoint returned ${response.statusCode ?? 0}: ${await readResponse(response, 16_000)}`);
        resolve(await readResponse(response, options.maximumResponseBytes ?? 512_000));
      } catch (error) { reject(error); }
    });
    request.on('socket', (socket) => {
      if (!https || !options.expectedTlsCertificateFingerprint || !(socket instanceof TLSSocket)) return;
      socket.once('secureConnect', () => {
        const certificate = socket.getPeerCertificate();
        const raw = certificate.raw;
        const actual = raw ? `sha256:${createHash('sha256').update(raw).digest('hex')}` : '';
        if (actual !== options.expectedTlsCertificateFingerprint) request.destroy(new Error('Federation TLS certificate pin mismatch.'));
        else pinned = true;
      });
    });
    request.once('timeout', () => request.destroy(new Error('Federation request timed out.')));
    request.once('error', reject);
    request.end(body);
  });
}

async function readRequest(request: IncomingMessage, maximum: number): Promise<string> {
  return readStream(request, maximum, 'Federation request');
}
async function readResponse(response: IncomingMessage, maximum: number): Promise<string> {
  const declared = Number(response.headers['content-length'] ?? 0);
  if (declared > maximum) throw new Error('Federation response exceeds the configured limit.');
  return readStream(response, maximum, 'Federation response');
}
async function readStream(stream: NodeJS.ReadableStream, maximum: number, label: string): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > maximum) throw new Error(`${label} exceeds the configured limit.`);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function assertClientEndpoint(value: string): void {
  const endpoint = new URL(value);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Federation endpoint must use HTTP or HTTPS.');
  if (endpoint.username || endpoint.password) throw new Error('Federation endpoint cannot contain credentials.');
  if (endpoint.protocol !== 'https:' && !isLoopback(endpoint.hostname)) throw new Error('Remote federation requires HTTPS.');
}
function isLoopback(host: string): boolean { return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host); }
function formatHost(host: string): string { return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host; }
