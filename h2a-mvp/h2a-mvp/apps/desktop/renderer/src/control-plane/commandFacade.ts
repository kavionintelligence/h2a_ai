import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  controlPlaneEventEnvelopeSchema,
  controlPlaneSnapshotSchema,
  type ControlPlaneAttachResponse,
  type ControlPlaneEventEnvelope,
  type ControlPlaneSnapshot,
  type H2ADesktopApi,
  type OfficeCommand
} from '@h2a/contracts';

type ControlPlaneApi = Pick<H2ADesktopApi,
  'attachControlPlane' |
  'detachControlPlane' |
  'getControlPlaneSnapshot' |
  'getControlPlaneEvents' |
  'executeOfficeCommand' |
  'subscribeControlPlaneEvents'>;

type SnapshotListener = (snapshot: ControlPlaneSnapshot) => void;
type ConnectionListener = (state: 'connected' | 'stale' | 'disconnected') => void;

export class ControlPlaneCommandFacade {
  private readonly clientId = rendererClientId();
  private attachment: ControlPlaneAttachResponse | undefined;
  private snapshot: ControlPlaneSnapshot | undefined;
  private unsubscribeEvents: (() => void) | undefined;
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private recovery: Promise<void> = Promise.resolve();
  private pendingEvent: ControlPlaneEventEnvelope | undefined;
  private eventTimer: ReturnType<typeof setTimeout> | undefined;
  private connecting: Promise<ControlPlaneSnapshot> | undefined;
  private reconnecting: Promise<ControlPlaneSnapshot> | undefined;
  private explicitlyDisconnected = false;

  public constructor(private readonly api: ControlPlaneApi) {}

  public async connect(): Promise<ControlPlaneSnapshot> {
    this.explicitlyDisconnected = false;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectOnce();
    try {
      return await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async connectOnce(): Promise<ControlPlaneSnapshot> {
    if (this.attachment && this.snapshot?.connection.status !== 'connected') this.clearAttachment();
    if (!this.attachment) {
      this.attachment = await this.api.attachControlPlane({
        client_id: this.clientId,
        protocol_version: CONTROL_PLANE_PROTOCOL_VERSION,
        requested_capabilities: ['workspace.observe', 'workspace.refresh', 'workspace.control', 'appearance.read', 'appearance.write', 'human-proof.challenge']
      });
      this.unsubscribeEvents = this.api.subscribeControlPlaneEvents((event) => this.queueEvent(event));
    }
    const snapshot = controlPlaneSnapshotSchema.parse(await this.api.getControlPlaneSnapshot(this.lease()));
    return this.accept(snapshot);
  }

  public async refresh(): Promise<ControlPlaneSnapshot> {
    return this.execute({ type: 'workspace.refresh' });
  }

  public async execute(command: OfficeCommand): Promise<ControlPlaneSnapshot> {
    if (this.explicitlyDisconnected) throw new Error('CONTROL_PLANE_DISCONNECTED_READ_ONLY');
    if (!this.attachment || this.snapshot?.connection.status !== 'connected') await this.reconnect();
    try {
      return await this.executeOnce(command);
    } catch (error) {
      if (!isConnectionFailure(error)) throw error;
      this.markStale();
      await this.reconnect();
      return this.executeOnce(command);
    }
  }

  public current(): ControlPlaneSnapshot | undefined {
    return this.snapshot?.connection.status === 'connected' ? this.snapshot : undefined;
  }

  public subscribeSnapshots(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  public subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  public async disconnect(): Promise<void> {
    this.explicitlyDisconnected = true;
    if (this.attachment) {
      try { await this.api.detachControlPlane(this.lease()); } catch { /* Host teardown is already fail-closed. */ }
    }
    this.clearAttachment();
    this.markDisconnected();
  }

  private async executeOnce(command: OfficeCommand): Promise<ControlPlaneSnapshot> {
    const snapshot = controlPlaneSnapshotSchema.parse(await this.api.executeOfficeCommand({ ...this.lease(), command }));
    return this.accept(snapshot);
  }

  private async reconnect(): Promise<ControlPlaneSnapshot> {
    if (this.explicitlyDisconnected) throw new Error('CONTROL_PLANE_DISCONNECTED_READ_ONLY');
    if (this.reconnecting) return this.reconnecting;
    this.reconnecting = this.reconnectOnce();
    try {
      return await this.reconnecting;
    } finally {
      this.reconnecting = undefined;
    }
  }

  private async reconnectOnce(): Promise<ControlPlaneSnapshot> {
    this.clearAttachment();
    return this.connect();
  }

  private clearAttachment(): void {
    if (this.eventTimer) clearTimeout(this.eventTimer);
    this.eventTimer = undefined;
    this.pendingEvent = undefined;
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = undefined;
    this.attachment = undefined;
  }

  private queueEvent(input: ControlPlaneEventEnvelope): void {
    const event = controlPlaneEventEnvelopeSchema.parse(input);
    if (!this.pendingEvent || event.sequence > this.pendingEvent.sequence) this.pendingEvent = event;
    if (this.eventTimer) clearTimeout(this.eventTimer);
    this.eventTimer = setTimeout(() => {
      this.eventTimer = undefined;
      const latest = this.pendingEvent;
      this.pendingEvent = undefined;
      if (!latest) return;
      this.recovery = this.recovery.then(() => this.handleEvent(latest)).catch(() => this.markStale());
    }, 50);
  }

  private async handleEvent(event: ControlPlaneEventEnvelope): Promise<void> {
    if (!this.attachment || !this.snapshot) return;
    if (event.host_instance_id !== this.attachment.host_instance_id) {
      this.markStale();
      return;
    }
    if (event.sequence <= this.snapshot.cursor) return;
    if (event.sequence > this.snapshot.cursor + 1) {
      const replay = await this.api.getControlPlaneEvents({ ...this.lease(), after_cursor: this.snapshot.cursor });
      if (replay.mode === 'snapshot-required') {
        this.accept(controlPlaneSnapshotSchema.parse(await this.api.getControlPlaneSnapshot(this.lease())));
        return;
      }
      let expected = this.snapshot.cursor + 1;
      for (const recovered of replay.events) {
        if (recovered.sequence !== expected) {
          this.markStale();
          return;
        }
        expected += 1;
      }
    }
    this.accept(controlPlaneSnapshotSchema.parse(await this.api.getControlPlaneSnapshot(this.lease())));
  }

  private accept(snapshot: ControlPlaneSnapshot): ControlPlaneSnapshot {
    const current = this.snapshot;
    if (current?.host_instance_id === snapshot.host_instance_id) {
      const olderCursor = snapshot.cursor < current.cursor;
      const olderAggregate = snapshot.aggregate_version < current.aggregate_version;
      if (olderCursor || olderAggregate) return current;
      if (snapshot.cursor === current.cursor
        && snapshot.aggregate_version === current.aggregate_version
        && snapshot.canonical_hash !== current.canonical_hash) {
        this.markStale();
        throw new Error('CONTROL_PLANE_SNAPSHOT_CONFLICT');
      }
    }
    this.snapshot = snapshot;
    for (const listener of this.connectionListeners) listener(snapshot.connection.status);
    for (const listener of this.snapshotListeners) listener(snapshot);
    return snapshot;
  }

  private markStale(): void {
    if (this.snapshot) this.snapshot = { ...this.snapshot, connection: { ...this.snapshot.connection, status: 'stale', read_only: true } };
    for (const listener of this.connectionListeners) listener('stale');
  }

  private markDisconnected(): void {
    if (this.snapshot) this.snapshot = { ...this.snapshot, connection: { ...this.snapshot.connection, status: 'disconnected', read_only: true } };
    for (const listener of this.connectionListeners) listener('disconnected');
  }

  private lease(): { host_instance_id: string; lease_id: string; client_id: string; generation: string } {
    if (!this.attachment) throw new Error('CONTROL_PLANE_DISCONNECTED_READ_ONLY');
    return {
      host_instance_id: this.attachment.host_instance_id,
      lease_id: this.attachment.lease_id,
      client_id: this.attachment.client_id,
      generation: this.attachment.connection.generation
    };
  }
}

function rendererClientId(): string {
  const key = 'h2a.control-plane.client-id';
  if (typeof sessionStorage !== 'undefined') {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = `renderer_${crypto.randomUUID()}`;
    sessionStorage.setItem(key, created);
    return created;
  }
  return `renderer_${crypto.randomUUID()}`;
}

function isConnectionFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return ['CONTROL_PLANE_HOST_RESTARTED', 'CONTROL_PLANE_ATTACHMENT_UNKNOWN', 'CONTROL_PLANE_CONNECTION_STALE', 'CONTROL_PLANE_DISCONNECTED_READ_ONLY', 'CONTROL_PLANE_ATTACHMENT_EXPIRED'].some((code) => message.includes(code));
}

let facade: ControlPlaneCommandFacade | undefined;

export function getControlPlaneCommandFacade(api: ControlPlaneApi): ControlPlaneCommandFacade {
  facade ??= new ControlPlaneCommandFacade(api);
  return facade;
}
