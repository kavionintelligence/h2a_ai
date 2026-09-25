import { verify } from 'node:crypto';
import {
  connectorImportRequestSchema,
  registeredConnectorSchema,
  type ConnectorHealth,
  type ConnectorImportRequest,
  type ConnectorProtocolState,
  type RegisteredConnector
} from '@h2a/contracts';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import { z } from 'zod';

const registrySchema = z.array(registeredConnectorSchema);

export class ConnectorRegistry {
  private readonly repository: VersionedJsonRepository<'h2a.connectors.registry', RegisteredConnector[]>;

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.repository = new VersionedJsonRepository(
      new AtomicFileStore(dataPath),
      'connectors/registry.json',
      'h2a.connectors.registry',
      registrySchema,
      { initialData: [], clock }
    );
  }

  public list(): Promise<RegisteredConnector[]> {
    return this.repository.read();
  }

  public async import(request: ConnectorImportRequest): Promise<RegisteredConnector> {
    const input = connectorImportRequestSchema.parse(request);
    const unsigned: Record<string, unknown> = { ...input.manifest };
    delete unsigned.canonical_hash;
    delete unsigned.publisher_signature;
    if (hashCanonical(unsigned) !== input.manifest.canonical_hash) {
      throw new Error('Connector Manifest canonical hash is invalid.');
    }
    if (!verify(
      null,
      Buffer.from(canonicalize(unsigned), 'utf8'),
      input.publisher_public_key_pem,
      Buffer.from(input.manifest.publisher_signature.slice('ed25519:'.length), 'base64')
    )) {
      throw new Error('Connector Manifest publisher signature is invalid.');
    }

    const now = this.clock().toISOString();
    const connector = registeredConnectorSchema.parse({
      manifest: input.manifest,
      publisher_public_key_pem: input.publisher_public_key_pem,
      runtime_public_key_pem: input.runtime_public_key_pem,
      imported_at: now,
      health: input.manifest.status === 'disabled' ? 'disabled' : 'healthy',
      last_health_detail: 'Signed manifest accepted and runtime key registered.',
      last_health_at: now
    });
    const current = await this.repository.read();
    const next = [...current.filter((item) => item.manifest.connector_manifest_id !== input.manifest.connector_manifest_id), connector];
    await this.repository.write(next);
    await this.evidence.append({
      trace_id: input.ceremony?.trace_id ?? `tr_connector_${input.manifest.connector_manifest_id}`,
      actor: { type: 'system', id: 'h2a-connector-registry' },
      subject: { type: 'connector_manifest', id: input.manifest.connector_manifest_id },
      event_type: 'CONNECTOR_MANIFEST_IMPORTED',
      payload: { provider: input.manifest.provider, protocol: input.manifest.protocol, canonical_hash: input.manifest.canonical_hash, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key }
    });
    return connector;
  }

  public async require(connectorManifestId: string): Promise<RegisteredConnector> {
    const connector = (await this.repository.read()).find((item) => item.manifest.connector_manifest_id === connectorManifestId);
    if (!connector) throw new Error('Connector is not registered.');
    if (connector.health === 'disabled') throw new Error('Connector is disabled.');
    return connector;
  }

  public async updateHealth(connectorManifestId: string, health: ConnectorHealth, detail: string): Promise<RegisteredConnector> {
    const current = await this.repository.read();
    const index = current.findIndex((item) => item.manifest.connector_manifest_id === connectorManifestId);
    if (index < 0) throw new Error('Connector is not registered.');
    const next = registeredConnectorSchema.parse({ ...current[index], health, last_health_detail: detail, last_health_at: this.clock().toISOString() });
    current[index] = next;
    await this.repository.write(current);
    return next;
  }

  public async project(deliveries: ConnectorProtocolState['deliveries']): Promise<ConnectorProtocolState> {
    return {
      connectors: await this.list(),
      deliveries,
      dead_letter_count: deliveries.filter((item) => item.status === 'dead-letter').length
    };
  }
}
