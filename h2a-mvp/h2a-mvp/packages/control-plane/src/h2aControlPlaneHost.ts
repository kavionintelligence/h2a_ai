import { createHash, randomUUID } from 'node:crypto';
import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  appearancePreferencesSchema,
  controlPlaneAttachRequestSchema,
  controlPlaneAttachResponseSchema,
  controlPlaneCanonicalStateSchema,
  controlPlaneCommandRequestSchema,
  controlPlaneEventEnvelopeSchema,
  controlPlaneLeaseRequestSchema,
  controlPlaneReplayRequestSchema,
  controlPlaneReplayResponseSchema,
  controlPlaneSnapshotSchema,
  type AppearancePreferences,
  type CapabilityManifest,
  type ControlPlaneAttachRequest,
  type ControlPlaneAttachResponse,
  type ControlPlaneCapability,
  type ControlPlaneCanonicalState,
  type ControlPlaneCommandRequest,
  type ControlPlaneEventEnvelope,
  type ControlPlaneLeaseRequest,
  type ControlPlaneReplayRequest,
  type ControlPlaneReplayResponse,
  type ControlPlaneSnapshot,
  type HumanProofChallenge,
  type OperatorNotification,
  type OperatorReadiness,
  type OperatorTransport,
  type UpdateAppearancePreferences
} from '@h2a/contracts';
import { OfficeProjectionService } from '@h2a/office';
import { ReadinessProjectionService } from '@h2a/operator-experience';

export interface ControlPlaneStateSource {
  load(): Promise<ControlPlaneCanonicalState>;
}

export interface ControlPlaneAppearanceStore {
  get(): Promise<AppearancePreferences>;
  update(request: UpdateAppearancePreferences): Promise<AppearancePreferences>;
}

interface Attachment {
  leaseId: string;
  clientId: string;
  generation: string;
  expiresAt: string;
  connected: boolean;
  lastConfirmedCursor: number;
  capabilities: Set<ControlPlaneCapability>;
}

interface ControlPlaneHostOptions {
  clock?: () => Date;
  replayLimit?: number;
  leaseDurationMs?: number;
  hostInstanceId?: string;
  workflowExecutor?: { execute(operationKey: string): Promise<void> };
  humanProofResolver?: { resolve(proofId: string): Promise<{ proof_id: string; human_id: string; purpose: string; verified_at: string; expires_at: string } | null> };
  continuationExecutor?: { execute(operationKey: string): Promise<void> };
  repairExecutor?: { execute(commandId: string, expectedGenerationHash: string, expectedReadiness: OperatorReadiness): Promise<void> };
}

type EventListener = (event: ControlPlaneEventEnvelope) => void;
const MAX_HUMAN_PROOF_CHALLENGES = 32;
const MAX_ATTACHMENTS = 256;
const MAX_ATTACHMENTS_PER_CLIENT = 8;

export class H2AControlPlaneHost {
  private readonly clock: () => Date;
  private readonly replayLimit: number;
  private readonly leaseDurationMs: number;
  private readonly hostInstanceId: string;
  private readonly projection = new OfficeProjectionService();
  private readonly readinessProjection = new ReadinessProjectionService();
  private readonly attachments = new Map<string, Attachment>();
  private readonly listeners = new Set<EventListener>();
  private readonly events: ControlPlaneEventEnvelope[] = [];
  private aggregateVersion = 0;
  private sequence = 0;
  private canonicalHash = '';
  private canonical: ControlPlaneCanonicalState | undefined;
  private appearance: AppearancePreferences | undefined;
  private readonly workflowExecutor: ControlPlaneHostOptions['workflowExecutor'];
  private readonly humanProofResolver: ControlPlaneHostOptions['humanProofResolver'];
  private readonly continuationExecutor: ControlPlaneHostOptions['continuationExecutor'];
  private readonly repairExecutor: ControlPlaneHostOptions['repairExecutor'];
  private readonly challengeQueue: HumanProofChallenge[] = [];
  private readonly completedContinuations = new Set<string>();
  private readonly pendingReadinessRepairs = new Map<string, OperatorReadiness>();
  private refreshQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly source: ControlPlaneStateSource,
    private readonly appearanceStore: ControlPlaneAppearanceStore,
    options: ControlPlaneHostOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.replayLimit = options.replayLimit ?? 128;
    this.leaseDurationMs = options.leaseDurationMs ?? 10 * 60 * 1000;
    this.hostInstanceId = options.hostInstanceId ?? `host_${randomUUID()}`;
    this.workflowExecutor = options.workflowExecutor;
    this.humanProofResolver = options.humanProofResolver;
    this.continuationExecutor = options.continuationExecutor;
    this.repairExecutor = options.repairExecutor;
  }

  public async initialize(): Promise<void> {
    await this.refresh('initialize', false);
  }

  public attach(input: ControlPlaneAttachRequest): ControlPlaneAttachResponse {
    const request = controlPlaneAttachRequestSchema.parse(input);
    for (const attachment of this.attachments.values()) {
      if (attachment.clientId === request.client_id) attachment.connected = false;
    }
    this.pruneAttachments(request.client_id);
    if (this.attachments.size >= MAX_ATTACHMENTS) throw new Error('CONTROL_PLANE_ATTACHMENT_LIMIT');
    const attachment: Attachment = {
      leaseId: `lease_${randomUUID()}`,
      clientId: request.client_id,
      generation: `generation_${randomUUID()}`,
      expiresAt: new Date(this.clock().getTime() + this.leaseDurationMs).toISOString(),
      connected: true,
      lastConfirmedCursor: this.sequence,
      capabilities: new Set(request.requested_capabilities)
    };
    this.attachments.set(attachment.leaseId, attachment);
    this.commitRuntime('attachment-changed', ['operator-session']);
    return controlPlaneAttachResponseSchema.parse({
      lease_id: attachment.leaseId,
      client_id: attachment.clientId,
      host_instance_id: this.hostInstanceId,
      expires_at: attachment.expiresAt,
      manifest: this.manifest(),
      granted_capabilities: [...attachment.capabilities],
      connection: this.connection(attachment)
    });
  }

  public detach(input: ControlPlaneLeaseRequest): void {
    const attachment = this.assertAttachment(controlPlaneLeaseRequestSchema.parse(input));
    attachment.connected = false;
    this.commitRuntime('attachment-changed', ['operator-session']);
  }

  public async getSnapshot(input: ControlPlaneLeaseRequest): Promise<ControlPlaneSnapshot> {
    const attachment = this.assertAttachment(controlPlaneLeaseRequestSchema.parse(input));
    this.assertCapability(attachment, 'workspace.observe');
    if (!this.canonical || !this.appearance) await this.refresh('snapshot', false);
    attachment.lastConfirmedCursor = this.sequence;
    return this.snapshot(attachment);
  }

  public replay(input: ControlPlaneReplayRequest): ControlPlaneReplayResponse {
    const request = controlPlaneReplayRequestSchema.parse(input);
    if (request.host_instance_id !== this.hostInstanceId) {
      return controlPlaneReplayResponseSchema.parse({ mode: 'snapshot-required', reason: 'host-restarted', latest_cursor: this.sequence });
    }
    const attachment = this.assertAttachment(request);
    this.assertCapability(attachment, 'workspace.observe');
    if (request.after_cursor > this.sequence) {
      return controlPlaneReplayResponseSchema.parse({ mode: 'snapshot-required', reason: 'cursor-ahead', latest_cursor: this.sequence });
    }
    const oldest = this.events[0]?.sequence ?? this.sequence + 1;
    if (request.after_cursor < oldest - 1) {
      return controlPlaneReplayResponseSchema.parse({ mode: 'snapshot-required', reason: 'cursor-too-old', latest_cursor: this.sequence });
    }
    const events = this.events.filter((event) => event.sequence > request.after_cursor);
    attachment.lastConfirmedCursor = this.sequence;
    return controlPlaneReplayResponseSchema.parse({ mode: 'events', events, latest_cursor: this.sequence });
  }

  public async execute(input: ControlPlaneCommandRequest): Promise<ControlPlaneSnapshot> {
    const request = controlPlaneCommandRequestSchema.parse(input);
    const attachment = this.assertAttachment(request);
    if (request.command.type === 'readiness.repair') {
      const repairRequest = request.command;
      this.assertCapability(attachment, 'workspace.control');
      this.assertInputOwner(attachment);
      if (!this.canonical || !this.appearance) await this.refresh('readiness-repair-prerequisite', false);
      if (!this.canonical || !this.appearance) throw new Error('READINESS_UNAVAILABLE');
      if (repairRequest.source_mode !== this.appearance.presentation_mode) throw new Error('READINESS_SOURCE_MODE_STALE');
      const readiness = this.readinessProjection.project({ canonical: this.canonical, connection: this.connection(attachment), now: this.clock() });
      const command = readiness.commands.find((item) => item.readiness_id === repairRequest.readiness_id);
      if (!command || command.generation_hash !== repairRequest.expected_generation_hash) throw new Error('READINESS_GENERATION_STALE');
      if (command.status === 'ready') throw new Error('READINESS_ALREADY_READY');
      const plan = this.readinessProjection.plan(command, this.clock());
      if (!plan) throw new Error('READINESS_REPAIR_PLAN_UNAVAILABLE');
      if (plan.status === 'blocked' || plan.status === 'external-action-required') {
        const first = plan.operations.find((item) => ['blocked', 'external-action-required'].includes(item.status));
        throw new Error(`READINESS_${plan.status.replaceAll('-', '_').toUpperCase()}:${first?.reason_code ?? 'PREREQUISITE_REQUIRED'}`);
      }
      const proof = plan.grouped_proof_purposes[0];
      if (!proof) {
        if (!this.repairExecutor) throw new Error('READINESS_REPAIR_EXECUTOR_UNAVAILABLE');
        await this.repairExecutor.execute(command.command_id, command.generation_hash, command);
        await this.refresh('readiness-repair', true);
      } else {
        const operationKey = `readiness-repair:${command.command_id}:${command.generation_hash}`;
        this.pendingReadinessRepairs.set(operationKey, command);
        this.requestHumanProof({
          type: 'human-proof.request', human_id: proof.human_id, purpose: proof.purpose, command: command.command_id,
          source_route: repairRequest.source_route, source_mode: repairRequest.source_mode, source_scroll_y: repairRequest.source_scroll_y,
          source_focus_id: repairRequest.source_focus_id, continuation_mode: 'exact-once',
          continuation_operation_key: operationKey, sensitivity: 'non-sensitive'
        });
      }
    } else if (request.command.type === 'human-proof.request') {
      this.assertCapability(attachment, 'human-proof.challenge');
      this.assertInputOwner(attachment);
      if (!this.appearance) await this.refresh('human-proof-prerequisite', false);
      if (request.command.source_mode !== this.appearance?.presentation_mode) throw new Error('HUMAN_PROOF_SOURCE_MODE_STALE');
      this.requestHumanProof(request.command);
    } else if (request.command.type === 'human-proof.complete') {
      this.assertCapability(attachment, 'human-proof.challenge');
      this.assertInputOwner(attachment);
      await this.completeHumanProof(request.command.challenge_id, request.command.proof_id, request.command.source_route, request.command.source_mode);
    } else if (request.command.type === 'human-proof.continue') {
      this.assertCapability(attachment, 'human-proof.challenge');
      this.assertInputOwner(attachment);
      await this.continueHumanProof(request.command.challenge_id, request.command.source_route, request.command.source_mode);
    } else if (request.command.type === 'human-proof.cancel') {
      this.assertCapability(attachment, 'human-proof.challenge');
      this.assertInputOwner(attachment);
      this.cancelHumanProof(request.command.challenge_id);
    } else if (request.command.type === 'human-proof.dismiss') {
      this.assertCapability(attachment, 'human-proof.challenge');
      this.assertInputOwner(attachment);
      this.dismissHumanProof(request.command.challenge_id);
    } else if (request.command.type === 'workflow.advance') {
      this.assertCapability(attachment, 'workspace.refresh');
      this.assertInputOwner(attachment);
      if (!this.canonical || !this.appearance) await this.refresh('workflow-prerequisite', false);
      if (!this.canonical || !this.appearance) throw new Error('CONTROL_PLANE_WORKFLOW_UNAVAILABLE');
      const workflow = this.projection.project(this.canonical, this.clock().toISOString(), this.appearance.selected_workflow_id).workflow;
      const action = workflow.next_action;
      if (workflow.selected_workflow_id !== request.command.workflow_id || workflow.active_step?.step_id !== request.command.step_id || action?.kind !== 'orchestrate') {
        throw new Error('WORKFLOW_STEP_STALE_OR_NOT_ORCHESTRATABLE');
      }
      if (!this.workflowExecutor) throw new Error('WORKFLOW_ORCHESTRATOR_UNAVAILABLE');
      await this.workflowExecutor.execute(action.operation_key);
      await this.refresh('guided-workflow', true);
    } else if (request.command.type === 'appearance.set' || request.command.type === 'workflow.select') {
      this.assertCapability(attachment, 'appearance.write');
      const update: UpdateAppearancePreferences = {};
      if (request.command.type === 'workflow.select') {
        update.selected_workflow_id = request.command.workflow_id;
      } else {
        if (request.command.presentation_mode !== undefined) update.presentation_mode = request.command.presentation_mode;
        if (request.command.reduced_motion !== undefined) update.reduced_motion = request.command.reduced_motion;
        if (request.command.camera_position !== undefined) update.camera_position = request.command.camera_position;
        if (request.command.zoom !== undefined) update.zoom = request.command.zoom;
        if (request.command.inspector_width !== undefined) update.inspector_width = request.command.inspector_width;
      }
      this.appearance = appearancePreferencesSchema.parse(await this.appearanceStore.update(update));
      await this.refresh('appearance', true, 'appearance-changed');
    } else {
      this.assertCapability(attachment, 'workspace.refresh');
      await this.refresh('operator-refresh', true);
    }
    attachment.lastConfirmedCursor = this.sequence;
    return this.snapshot(attachment);
  }

  public refresh(domain: string, emit = true, kind: ControlPlaneEventEnvelope['kind'] = 'snapshot-changed'): Promise<boolean> {
    const operation = this.refreshQueue.then(() => this.refreshOnce(domain, emit, kind));
    this.refreshQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async refreshOnce(domain: string, emit: boolean, kind: ControlPlaneEventEnvelope['kind']): Promise<boolean> {
    const canonical = controlPlaneCanonicalStateSchema.parse(await this.source.load());
    const appearance = appearancePreferencesSchema.parse(this.appearance ?? await this.appearanceStore.get());
    const hash = hashCanonical({ canonical, appearance });
    const changed = hash !== this.canonicalHash;
    this.canonical = canonical;
    this.appearance = appearance;
    if (!changed) return false;
    this.canonicalHash = hash;
    this.aggregateVersion += 1;
    if (emit) this.emit(kind, [domain]);
    return true;
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public manifest(): CapabilityManifest {
    return {
      protocol_version: CONTROL_PLANE_PROTOCOL_VERSION,
      capabilities: ['workspace.observe', 'workspace.refresh', 'workspace.control', 'appearance.read', 'appearance.write', 'human-proof.challenge'],
      transport: 'electron-ipc',
      trust_ceiling: 'connected-observed'
    };
  }

  private snapshot(attachment: Attachment): ControlPlaneSnapshot {
    if (!this.canonical || !this.appearance) throw new Error('Control plane has not initialized.');
    const generatedAt = this.clock().toISOString();
    return controlPlaneSnapshotSchema.parse({
      schema_version: 1,
      snapshot_id: `snapshot_${randomUUID()}`,
      host_instance_id: this.hostInstanceId,
      generated_at: generatedAt,
      aggregate_version: this.aggregateVersion,
      cursor: this.sequence,
      canonical_hash: this.canonicalHash,
      canonical: this.canonical,
      office: this.projection.project(this.canonical, generatedAt, this.appearance.selected_workflow_id),
      appearance: this.appearance,
      connection: this.connection(attachment),
      operator_session: this.operatorSession(attachment),
      transports: operatorTransports(),
      notifications: this.notifications(),
      readiness: this.readinessProjection.project({ canonical: this.canonical, connection: this.connection(attachment), now: this.clock() }),
      human_proof_challenge: this.activeChallenge()
    });
  }

  private emit(kind: ControlPlaneEventEnvelope['kind'], changedDomains: string[]): void {
    this.sequence += 1;
    const event = controlPlaneEventEnvelopeSchema.parse({
      schema_version: 1,
      event_id: `control_event_${randomUUID()}`,
      host_instance_id: this.hostInstanceId,
      sequence: this.sequence,
      aggregate_version: this.aggregateVersion,
      emitted_at: this.clock().toISOString(),
      kind,
      topic: kind === 'appearance-changed' ? 'appearance.preferences' : 'workspace.canonical',
      aggregate_id: 'h2a-control-plane',
      changed_domains: changedDomains,
      evidence_ref: null,
      canonical_hash: this.canonicalHash
    });
    this.events.push(event);
    if (this.events.length > this.replayLimit) this.events.splice(0, this.events.length - this.replayLimit);
    for (const listener of this.listeners) listener(event);
  }

  private assertAttachment(input: ControlPlaneLeaseRequest): Attachment {
    if (input.host_instance_id !== this.hostInstanceId) throw new Error('CONTROL_PLANE_HOST_RESTARTED');
    const attachment = this.attachments.get(input.lease_id);
    if (!attachment || attachment.clientId !== input.client_id) throw new Error('CONTROL_PLANE_ATTACHMENT_UNKNOWN');
    if (attachment.generation !== input.generation) throw new Error('CONTROL_PLANE_CONNECTION_STALE');
    if (!attachment.connected) throw new Error('CONTROL_PLANE_DISCONNECTED_READ_ONLY');
    if (new Date(attachment.expiresAt).getTime() <= this.clock().getTime()) {
      attachment.connected = false;
      throw new Error('CONTROL_PLANE_ATTACHMENT_EXPIRED');
    }
    return attachment;
  }

  private pruneAttachments(clientId: string): void {
    const removable = [...this.attachments.entries()].filter(([, attachment]) => !attachment.connected || new Date(attachment.expiresAt).getTime() <= this.clock().getTime());
    const sameClient = removable.filter(([, attachment]) => attachment.clientId === clientId);
    for (const [leaseId] of sameClient.slice(0, Math.max(0, sameClient.length - MAX_ATTACHMENTS_PER_CLIENT + 1))) this.attachments.delete(leaseId);
    const remainingRemovable = removable.filter(([leaseId]) => this.attachments.has(leaseId));
    for (const [leaseId] of remainingRemovable.slice(0, Math.max(0, this.attachments.size - MAX_ATTACHMENTS + 1))) this.attachments.delete(leaseId);
  }

  private connection(attachment: Attachment): { status: 'connected' | 'stale' | 'disconnected'; generation: string; read_only: boolean; last_confirmed_cursor: number } {
    const expired = new Date(attachment.expiresAt).getTime() <= this.clock().getTime();
    const connected = attachment.connected && !expired;
    return {
      status: connected ? 'connected' : expired ? 'stale' : 'disconnected',
      generation: attachment.generation,
      read_only: !connected,
      last_confirmed_cursor: attachment.lastConfirmedCursor
    };
  }

  private assertCapability(attachment: Attachment, capability: ControlPlaneCapability): void {
    if (!attachment.capabilities.has(capability)) throw new Error(`CONTROL_PLANE_CAPABILITY_DENIED:${capability}`);
  }

  private assertInputOwner(attachment: Attachment): void {
    if (this.inputOwner()?.leaseId !== attachment.leaseId) throw new Error('CONTROL_PLANE_INPUT_OWNER_REQUIRED');
  }

  private inputOwner(): Attachment | undefined {
    return [...this.attachments.values()].find((attachment) => attachment.connected
      && new Date(attachment.expiresAt).getTime() > this.clock().getTime()
      && attachment.capabilities.has('workspace.control'));
  }

  private operatorSession(attachment: Attachment) {
    const connection = this.connection(attachment);
    const owner = this.inputOwner();
    return {
      status: connection.status === 'stale' ? 'stale' as const
        : connection.status === 'disconnected' ? 'recovering' as const
          : owner?.leaseId === attachment.leaseId ? 'connected' as const : 'read-only' as const,
      host_instance_id: this.hostInstanceId,
      last_confirmed_cursor: attachment.lastConfirmedCursor,
      attached_observers: [...this.attachments.values()].filter((item) => item.connected && new Date(item.expiresAt).getTime() > this.clock().getTime()).length,
      input_owner_client_id: owner?.clientId ?? null
    };
  }

  private requestHumanProof(command: Extract<ControlPlaneCommandRequest['command'], { type: 'human-proof.request' }>): void {
    const now = this.clock();
    this.activeChallenge();
    const duplicate = this.challengeQueue.find((item) => item.status === 'pending'
      && item.human_id === command.human_id && item.purpose === command.purpose && item.command === command.command
      && item.source_route === command.source_route && item.source_mode === command.source_mode);
    if (duplicate) return;
    for (let index = this.challengeQueue.length - 1; index >= 0 && this.challengeQueue.length >= MAX_HUMAN_PROOF_CHALLENGES; index -= 1) {
      if (this.challengeQueue[index]?.status !== 'pending' && this.challengeQueue[index]?.status !== 'verified') this.challengeQueue.splice(index, 1);
    }
    if (this.challengeQueue.length >= MAX_HUMAN_PROOF_CHALLENGES) throw new Error('HUMAN_PROOF_QUEUE_FULL');
    const challenge: HumanProofChallenge = {
      schema_version: 1,
      challenge_id: `proof_challenge_${randomUUID()}`,
      human_id: command.human_id,
      purpose: command.purpose,
      command: command.command,
      source_route: command.source_route,
      source_mode: command.source_mode,
      source_scroll_y: command.source_scroll_y,
      source_focus_id: command.source_focus_id,
      continuation_mode: command.continuation_mode,
      continuation_operation_key: command.continuation_operation_key,
      sensitivity: command.sensitivity,
      status: 'pending', proof_id: null,
      requested_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      completed_at: null,
      version: 1
    };
    this.challengeQueue.push(challenge);
    this.commitRuntime('human-proof-changed', ['human-proof-challenge']);
  }

  private async completeHumanProof(challengeId: string, proofId: string, sourceRoute: string, sourceMode: HumanProofChallenge['source_mode']): Promise<void> {
    const challenge = this.requireActiveChallenge(challengeId, sourceRoute, sourceMode);
    if (challenge.status !== 'pending') throw new Error('HUMAN_PROOF_CHALLENGE_REPLAYED');
    if (!this.humanProofResolver) throw new Error('HUMAN_PROOF_RESOLVER_UNAVAILABLE');
    const proof = await this.humanProofResolver.resolve(proofId);
    const now = this.clock().getTime();
    if (!proof || proof.proof_id !== proofId || proof.human_id !== challenge.human_id || proof.purpose !== challenge.purpose) throw new Error('HUMAN_PROOF_BINDING_MISMATCH');
    if (new Date(proof.verified_at).getTime() < new Date(challenge.requested_at).getTime()) throw new Error('HUMAN_PROOF_STALE');
    if (new Date(proof.expires_at).getTime() <= now) throw new Error('HUMAN_PROOF_EXPIRED');
    if (challenge.continuation_mode === 'exact-once' && challenge.sensitivity === 'non-sensitive') await this.executeContinuation(challenge);
    challenge.status = 'verified';
    challenge.proof_id = proofId;
    challenge.completed_at = this.clock().toISOString();
    challenge.version += 1;
    await this.refresh('human-proof-verification', false);
    this.commitRuntime('human-proof-changed', ['human-proof-challenge', 'canonical-state']);
  }

  private async continueHumanProof(challengeId: string, sourceRoute: string, sourceMode: HumanProofChallenge['source_mode']): Promise<void> {
    const challenge = this.requireActiveChallenge(challengeId, sourceRoute, sourceMode);
    if (challenge.status !== 'verified' || challenge.sensitivity !== 'sensitive-confirm') throw new Error('HUMAN_PROOF_CONFIRMATION_NOT_ALLOWED');
    await this.executeContinuation(challenge);
    await this.refresh('human-proof-continuation', false);
    this.commitRuntime('human-proof-changed', ['human-proof-challenge', 'canonical-state']);
  }

  private async executeContinuation(challenge: HumanProofChallenge): Promise<void> {
    const operationKey = challenge.continuation_operation_key;
    if (!operationKey || challenge.continuation_mode !== 'exact-once') throw new Error('HUMAN_PROOF_CONTINUATION_NOT_ALLOWED');
    if (this.completedContinuations.has(challenge.challenge_id)) throw new Error('HUMAN_PROOF_CONTINUATION_REPLAYED');
    if (operationKey.startsWith('readiness-repair:')) {
      const match = /^readiness-repair:(.+):(sha256:[0-9a-f]{64})$/u.exec(operationKey);
      if (!match || !this.repairExecutor) throw new Error('READINESS_REPAIR_CONTINUATION_UNAVAILABLE');
      const expectedReadiness = this.pendingReadinessRepairs.get(operationKey);
      if (!expectedReadiness) throw new Error('READINESS_REPAIR_CONTEXT_SUPERSEDED');
      this.completedContinuations.add(challenge.challenge_id);
      try {
        await this.repairExecutor.execute(match[1]!, match[2]!, expectedReadiness);
        this.pendingReadinessRepairs.delete(operationKey);
      }
      catch (error) { this.completedContinuations.delete(challenge.challenge_id); throw error; }
      return;
    }
    if (!this.continuationExecutor) throw new Error('HUMAN_PROOF_CONTINUATION_UNAVAILABLE');
    this.completedContinuations.add(challenge.challenge_id);
    try { await this.continuationExecutor.execute(operationKey); }
    catch (error) { this.completedContinuations.delete(challenge.challenge_id); throw error; }
  }

  private cancelHumanProof(challengeId: string): void {
    const challenge = this.activeChallenge();
    if (!challenge || challenge.challenge_id !== challengeId || challenge.status !== 'pending') throw new Error('HUMAN_PROOF_CHALLENGE_NOT_CANCELLABLE');
    challenge.status = 'cancelled'; challenge.completed_at = this.clock().toISOString(); challenge.version += 1;
    this.commitRuntime('human-proof-changed', ['human-proof-challenge']);
  }

  private dismissHumanProof(challengeId: string): void {
    const index = this.challengeQueue.findIndex((item) => item.challenge_id === challengeId);
    if (index < 0 || this.challengeQueue[index]?.status === 'pending') throw new Error('HUMAN_PROOF_CHALLENGE_NOT_DISMISSIBLE');
    this.challengeQueue.splice(index, 1);
    this.commitRuntime('human-proof-changed', ['human-proof-challenge']);
  }

  private requireActiveChallenge(challengeId: string, sourceRoute: string, sourceMode: HumanProofChallenge['source_mode']): HumanProofChallenge {
    const challenge = this.activeChallenge();
    if (!challenge || challenge.challenge_id !== challengeId) throw new Error('HUMAN_PROOF_CHALLENGE_SUPERSEDED');
    if (challenge.source_route !== sourceRoute || challenge.source_mode !== sourceMode || this.appearance?.presentation_mode !== sourceMode) throw new Error('HUMAN_PROOF_SOURCE_BINDING_MISMATCH');
    if (new Date(challenge.expires_at).getTime() <= this.clock().getTime()) throw new Error('HUMAN_PROOF_CHALLENGE_EXPIRED');
    return challenge;
  }

  private activeChallenge(): HumanProofChallenge | null {
    for (const challenge of this.challengeQueue) {
      if (challenge.status === 'pending' && new Date(challenge.expires_at).getTime() <= this.clock().getTime()) {
        challenge.status = 'expired'; challenge.completed_at = this.clock().toISOString(); challenge.version += 1;
      }
    }
    return this.challengeQueue.find((item) => item.status === 'pending' || item.status === 'verified') ?? null;
  }

  private commitRuntime(kind: ControlPlaneEventEnvelope['kind'], domains: string[]): void {
    if (!this.canonical || !this.appearance) return;
    this.aggregateVersion += 1;
    this.emit(kind, domains);
  }

  private notifications(): OperatorNotification[] {
    if (!this.canonical) return [];
    const values: OperatorNotification[] = [];
    const challenge = this.activeChallenge();
    if (challenge?.status === 'pending') values.push(notification('human-proof', 'blocking', `Verify ${challenge.human_id}`, challenge.purpose, challenge.challenge_id, null, 'Verify now', challenge.requested_at));
    for (const request of this.canonical.approvals.requests.filter((item) => item.status === 'pending')) values.push(notification('approval', 'attention', 'Approval required', `${request.required_action} · ${request.required_resource}`, request.approval_request_id, 'authority-inbox', 'Review', request.requested_at));
    for (const lane of this.canonical.real_collaboration.lanes.filter((item) => item.health === 'authentication-required')) values.push(notification('provider-login', 'blocking', `${lane.title} needs sign-in`, lane.detail, lane.lane_id, 'command-floor', 'Open provider', this.canonical.real_collaboration.updated_at));
    for (const receipt of this.canonical.project_delivery.validations.filter((item) => item.status === 'failed')) values.push(notification('validation', 'blocking', 'Validation failed', receipt.command_id, receipt.receipt_id, 'command-floor', 'Inspect', receipt.completed_at));
    for (const lease of this.canonical.project_delivery.worktrees.filter((item) => item.status === 'conflicted')) values.push(notification('merge-conflict', 'blocking', 'Worktree conflict', lease.branch, lease.lease_id, 'command-floor', 'Inspect', lease.updated_at));
    for (const peer of this.canonical.federation.peers.filter((item) => item.status === 'revoked')) values.push(notification('revocation', 'attention', 'Federation peer revoked', peer.remote_node.display_name, peer.peer_id, 'federation', 'Inspect', peer.updated_at));
    for (const integration of this.canonical.project_delivery.integrations) values.push(notification('completion', 'success', 'Project integrated', integration.integrated_commit, integration.integration_id, 'command-floor', 'Inspect', integration.integrated_at));
    return values.sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 100);
  }
}

function notification(kind: OperatorNotification['kind'], severity: OperatorNotification['severity'], title: string, detail: string, sourceId: string, route: string | null, actionLabel: string | null, createdAt: string): OperatorNotification {
  return { notification_id: `notification_${kind}_${sourceId}`, kind, severity, title, detail, source_id: sourceId, route, action_label: actionLabel, created_at: createdAt };
}

function operatorTransports(): OperatorTransport[] {
  return [
    { transport_id: 'transport_electron_ipc', kind: 'electron-ipc', status: 'enabled', trust_boundary: 'trusted-host', carries_credentials: false, detail: 'Local renderer attachment through the Electron preload boundary.' },
    { transport_id: 'transport_loopback_a2a', kind: 'loopback-a2a', status: 'enabled', trust_boundary: 'signed-loopback', carries_credentials: false, detail: 'Signed federation envelopes over loopback; only minimized references cross nodes.' },
    { transport_id: 'transport_websocket_future', kind: 'websocket', status: 'disabled', trust_boundary: 'future-disabled', carries_credentials: false, detail: 'Reserved for a future authenticated operator transport.' },
    { transport_id: 'transport_remote_a2a_future', kind: 'remote-a2a', status: 'disabled', trust_boundary: 'future-disabled', carries_credentials: false, detail: 'Reserved for future TLS-pinned remote federation.' },
    { transport_id: 'transport_mobile_future', kind: 'mobile', status: 'disabled', trust_boundary: 'future-disabled', carries_credentials: false, detail: 'Reserved for a future mobile approval companion.' }
  ];
}

function hashCanonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(sortObject(value))).digest('hex')}`;
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'generatedAt' && key !== 'generated_at')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortObject(item)]));
  }
  return value;
}
