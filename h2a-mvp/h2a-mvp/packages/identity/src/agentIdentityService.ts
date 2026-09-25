import { generateKeyPairSync, randomBytes, randomUUID, sign as signBytes, verify as verifyBytes } from 'node:crypto';
import { z } from 'zod';
import {
  agentIdentityStateSchema,
  agentPassportSchema,
  agentRuntimeBindingSchema,
  agentPassportV2Schema,
  agentPassportV2MigrationResultSchema,
  attestAgentRuntimeRequestSchema,
  createAgentRequestSchema,
  migrateAgentPassportsV1RequestSchema,
  passportLifecycleRequestSchema,
  runtimeAttestationSchema,
  runtimeLifecycleRequestSchema,
  runtimeSessionSchema,
  v2MigrationReceiptSchema,
  V2_CONTRACT_VERSION,
  type AgentIdentityState,
  type AgentPassport,
  type AgentPassportV2,
  type AgentPassportV2MigrationResult,
  type AgentRuntimeBinding,
  type AgentRuntimeSummary,
  type AttestAgentRuntimeRequest,
  type CreateAgentRequest,
  type HumanAuthorityContext,
  type MigrateAgentPassportsV1Request,
  type PassportLifecycleRequest,
  type RuntimeAttestation,
  type RuntimeLifecycleRequest,
  type RuntimeSession,
  type V2MigrationReceipt
} from '@h2a/contracts';
import { getProviderDefinition, providerCatalogue, type LocalProviderSecretStore } from '@h2a/agents';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository, type WorkplaceRepository } from '@h2a/storage';
import type { HumanProofService } from './humanProofService';

const signingKeySchema = z.object({
  algorithm: z.literal('Ed25519'),
  private_key_pem: z.string().startsWith('-----BEGIN PRIVATE KEY-----'),
  public_key_pem: z.string().startsWith('-----BEGIN PUBLIC KEY-----')
}).strict();

const workloadKeySchema = z.object({
  agent_id: z.string().min(1),
  private_key_pem: z.string().startsWith('-----BEGIN PRIVATE KEY-----'),
  created_at: z.string().datetime({ offset: true })
}).strict();
type WorkloadKey = z.infer<typeof workloadKeySchema>;

const runtimeChallengeSchema = z.object({
  challenge_id: z.string().min(1), passport_id: z.string().min(1), binding_id: z.string().min(1),
  nonce: z.string().min(32), issued_at: z.string().datetime({ offset: true }), expires_at: z.string().datetime({ offset: true }),
  used_at: z.string().datetime({ offset: true }).optional()
}).strict();
type RuntimeChallenge = z.infer<typeof runtimeChallengeSchema>;

const sessionKeySchema = z.object({
  runtime_session_id: z.string().min(1), private_key_pem: z.string().startsWith('-----BEGIN PRIVATE KEY-----'), created_at: z.string().datetime({ offset: true })
}).strict();
type SessionKey = z.infer<typeof sessionKeySchema>;

export interface SponsorAuthorityPort {
  authorizeProtectedOperation(context: HumanAuthorityContext | undefined, resource: string, action: string, requiredApprovalPower?: string): Promise<{ humanId: string; humanProofId: string }>;
}

export interface HumanProofStatePort {
  getState(subjectId?: string): ReturnType<HumanProofService['getState']>;
}

export class AgentIdentityService {
  private readonly passports: VersionedJsonRepository<'h2a.agents.passports', AgentPassport[]>;
  private readonly bindings: VersionedJsonRepository<'h2a.agents.runtime-bindings', AgentRuntimeBinding[]>;
  private readonly workloadKeys: VersionedJsonRepository<'h2a.agents.workload-keys', WorkloadKey[]>;
  private readonly signingKey: VersionedJsonRepository<'h2a.settings.signing-key', z.infer<typeof signingKeySchema>>;
  private readonly organizationSigningKey: VersionedJsonRepository<'h2a.v2.organization-signing-key', z.infer<typeof signingKeySchema>>;
  private readonly passportsV2: VersionedJsonRepository<'h2a.agents.passports-v2', AgentPassportV2[]>;
  private readonly attestations: VersionedJsonRepository<'h2a.agents.runtime-attestations-v2', RuntimeAttestation[]>;
  private readonly runtimeSessions: VersionedJsonRepository<'h2a.agents.runtime-sessions-v2', RuntimeSession[]>;
  private readonly runtimeChallenges: VersionedJsonRepository<'h2a.agents.runtime-challenges-v2', RuntimeChallenge[]>;
  private readonly sessionKeys: VersionedJsonRepository<'h2a.agents.session-keys-v2', SessionKey[]>;
  private readonly migrationReceipts: VersionedJsonRepository<'h2a.migrations.agent-passport-v2', V2MigrationReceipt[]>;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly humanProof: HumanProofStatePort,
    private readonly workplace: WorkplaceRepository,
    private readonly secrets: LocalProviderSecretStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly sponsorAuthority?: SponsorAuthorityPort
  ) {
    const store = new AtomicFileStore(dataPath);
    const options = { clock };
    this.passports = new VersionedJsonRepository(store, 'passports/registry.json', 'h2a.agents.passports', z.array(agentPassportSchema), { ...options, initialData: [] });
    this.bindings = new VersionedJsonRepository(store, 'workplace/runtime-bindings.json', 'h2a.agents.runtime-bindings', z.array(agentRuntimeBindingSchema), { ...options, initialData: [] });
    this.workloadKeys = new VersionedJsonRepository(store, 'passports/workload-keys.json', 'h2a.agents.workload-keys', z.array(workloadKeySchema), { ...options, initialData: [] });
    this.signingKey = new VersionedJsonRepository(store, 'settings/h2a-signing-key.json', 'h2a.settings.signing-key', signingKeySchema);
    this.organizationSigningKey = new VersionedJsonRepository(store, 'settings/organization-signing-key-v2.json', 'h2a.v2.organization-signing-key', signingKeySchema, { ...options, initialData: createSigningKey() });
    this.passportsV2 = new VersionedJsonRepository(store, 'passports/registry-v2.json', 'h2a.agents.passports-v2', z.array(agentPassportV2Schema), { ...options, initialData: [] });
    this.attestations = new VersionedJsonRepository(store, 'runtime/attestations-v2.json', 'h2a.agents.runtime-attestations-v2', z.array(runtimeAttestationSchema), { ...options, initialData: [] });
    this.runtimeSessions = new VersionedJsonRepository(store, 'runtime/sessions-v2.json', 'h2a.agents.runtime-sessions-v2', z.array(runtimeSessionSchema), { ...options, initialData: [] });
    this.runtimeChallenges = new VersionedJsonRepository(store, 'runtime/challenges-v2.json', 'h2a.agents.runtime-challenges-v2', z.array(runtimeChallengeSchema), { ...options, initialData: [] });
    this.sessionKeys = new VersionedJsonRepository(store, 'runtime/session-keys-v2.json', 'h2a.agents.session-keys-v2', z.array(sessionKeySchema), { ...options, initialData: [] });
    this.migrationReceipts = new VersionedJsonRepository(store, 'migrations/v2-agent-passport-receipts.json', 'h2a.migrations.agent-passport-v2', z.array(v2MigrationReceiptSchema), { ...options, initialData: [] });
  }

  public async initialize(): Promise<void> {
    await Promise.all([this.passports.read(), this.bindings.read(), this.workloadKeys.read(), this.signingKey.read(), this.organizationSigningKey.read(), this.passportsV2.read(), this.attestations.read(), this.runtimeSessions.read(), this.runtimeChallenges.read(), this.sessionKeys.read(), this.migrationReceipts.read(), this.secrets.initialize()]);
  }

  public getState(): Promise<AgentIdentityState> { return this.runExclusive(() => this.getStateUnlocked()); }

  public createAgent(request: CreateAgentRequest): Promise<AgentIdentityState> {
    return this.runExclusive(async () => {
      const input = createAgentRequestSchema.parse(request);
      let sponsor: { humanId: string; humanProofId: string; organizationId: string; membershipId: string; authorityCredentialId: string };
      if (this.sponsorAuthority) {
        if (!input.sponsorAuthority || !input.purpose || !input.riskTier || !input.connectorManifestId || !input.trustMode || !input.expiresAt || !input.attestationExpiresAt) {
          throw new Error('Passport V2 issuance requires sponsor authority, purpose, risk, connector, trust mode, and expiry.');
        }
        const authorized = await this.sponsorAuthority.authorizeProtectedOperation(toHumanAuthority(input.sponsorAuthority), 'agent-passport', 'issue');
        sponsor = { humanId: authorized.humanId, humanProofId: authorized.humanProofId, organizationId: input.sponsorAuthority.organizationId, membershipId: input.sponsorAuthority.membershipId, authorityCredentialId: input.sponsorAuthority.authorityCredentialId };
      } else {
        const proofState = await this.humanProof.getState('human_primary');
        const proof = proofState.activeProof;
        if (!proof || !proofState.identity || proofState.identity.status !== 'active' || new Date(proof.expires_at).getTime() <= this.clock().getTime()) {
          throw new Error('A current Human Proof is required before issuing an Agent Passport.');
        }
        sponsor = { humanId: proof.subject_id, humanProofId: proof.human_proof_id, organizationId: 'h2a-demo', membershipId: 'membership_legacy', authorityCredentialId: 'credential_legacy' };
      }
      const integrity = await this.evidence.verify();
      if (integrity.status !== 'verified') throw new Error('Agent issuance is blocked because evidence integrity is not verified.');

      const definition = getProviderDefinition(input.provider);
      if (!definition.models.some((model) => model.id === input.model)) throw new Error('The selected model is not part of the provider contract.');
      const existingPassports = await this.passports.read();
      if (existingPassports.some((passport) => passport.name.toLowerCase() === input.name.toLowerCase() && passport.status !== 'revoked')) {
        throw new Error('An active agent already uses this name.');
      }

      const now = this.clock().toISOString();
      const agentId = `agt_${randomUUID()}`;
      const passportId = `agtp_${randomUUID()}`;
      const bindingId = `arb_${randomUUID()}`;
      const workload = createWorkloadKey(agentId, now);
      const unsignedPassport = {
        passport_id: passportId,
        agent_id: agentId,
        name: input.name,
        role: input.role,
        owner_org: sponsor.organizationId,
        owner_human_id: sponsor.humanId,
        owner_human_proof_id: sponsor.humanProofId,
        runtime: definition.execution_mode === 'scripted-workplace' ? 'scripted' as const : definition.execution_mode === 'bedrock' ? 'bedrock' as const : 'live-cli' as const,
        capabilities: [...new Set(input.capabilities)],
        status: 'active' as const,
        workload_public_key: workload.publicKey,
        issued_at: now,
        expires_at: input.expiresAt,
        updated_at: now
      };
      const passport = agentPassportSchema.parse({ ...unsignedPassport, passport_signature: await this.sign(unsignedPassport) });
      const passportV2 = input.purpose && input.riskTier && input.connectorManifestId && input.expiresAt
        ? await this.createPassportV2({ passportId, agentId, sponsor, input, workloadPublicKey: workload.publicKey, issuedAt: now })
        : undefined;
      const credentialRef = input.credential ? `cred_${input.provider}` : undefined;
      if (input.credential) await this.secrets.set(input.provider, input.credential, this.clock());
      const binding = agentRuntimeBindingSchema.parse({
        binding_id: bindingId,
        agent_id: agentId,
        display_name: input.name,
        role: input.role,
        provider: input.provider,
        model: input.model,
        command: input.command ?? definition.default_command,
        cwd: input.workspace,
        status: 'idle',
        connection_state: definition.execution_mode === 'scripted-workplace' ? 'connected' : 'configured',
        current_action: 'Awaiting mandate assignment',
        progress: 0,
        credential_ref: credentialRef,
        created_at: now,
        last_seen_at: now
      });

      await this.workloadKeys.write([...(await this.workloadKeys.read()), workload.secret]);
      await this.passports.write([...existingPassports, passport]);
      if (passportV2) await this.passportsV2.write([...(await this.passportsV2.read()), passportV2]);
      await this.bindings.write([...(await this.bindings.read()), binding]);
      await this.addToWorkplace(passport, binding, definition.label);
      const boundEvent = await this.evidence.append({
        trace_id: input.ceremony?.trace_id ?? `tr_agent_${agentId}`,
        actor: { type: 'human', id: sponsor.humanId },
        subject: { type: 'agent_passport', id: passportId },
        event_type: 'AGENT_BOUND',
        payload: { agent_id: agentId, passport_id: passportId, human_proof_id: sponsor.humanProofId, authority_credential_id: sponsor.authorityCredentialId, role: input.role, capabilities: passport.capabilities, expires_at: passport.expires_at ?? null, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key }
      });
      await this.evidence.append({
        trace_id: input.ceremony?.trace_id ?? `tr_agent_${agentId}`,
        actor: { type: 'system', id: 'h2a-core' },
        subject: { type: 'runtime_binding', id: bindingId },
        parent_event_id: boundEvent.event_id,
        event_type: 'AGENT_RUNTIME_BOUND',
        payload: { agent_id: agentId, provider: input.provider, model: input.model, connection_state: binding.connection_state, credential_configured: Boolean(input.credential), ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key }
      });
      await this.prependWorkplaceEvent('AGENT_RUNTIME_BOUND', input.name, `${definition.label} runtime binding configured.`);
      if (passportV2) {
        await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_agent_${agentId}`, actor: { type: 'human', id: sponsor.humanId }, subject: { type: 'agent_passport', id: passportId }, parent_event_id: boundEvent.event_id, event_type: 'AGENT_PASSPORT_V2_ISSUED', payload: { organization_id: sponsor.organizationId, sponsor_membership_id: sponsor.membershipId, authority_credential_id: sponsor.authorityCredentialId, connector_manifest_id: passportV2.connector_manifest_id, risk_tier: passportV2.risk_tier, canonical_hash: passportV2.canonical_hash, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
        await this.attestRuntimeUnlocked({ passportId, bindingId, connectorManifestId: input.connectorManifestId!, adapterVersion: 'h2a-local-v1', trustMode: input.trustMode!, trustEvidenceRefs: [], expiresAt: input.attestationExpiresAt!, ceremony: input.ceremony });
      }
      return this.getStateUnlocked();
    });
  }

  public updatePassport(request: PassportLifecycleRequest): Promise<AgentIdentityState> {
    return this.runExclusive(async () => {
      const input = passportLifecycleRequestSchema.parse(request);
      const passports = await this.passports.read();
      const current = passports.find((passport) => passport.passport_id === input.passportId);
      if (!current) throw new Error('Agent Passport was not found.');
      if (this.sponsorAuthority) {
        if (!input.sponsorAuthority) throw new Error('Passport lifecycle changes require current sponsor authority.');
        await this.sponsorAuthority.authorizeProtectedOperation(toHumanAuthority(input.sponsorAuthority), 'agent-passport', input.action === 'reactivate' ? 'issue' : 'revoke');
      }
      if (current.status === 'revoked') throw new Error('A revoked Agent Passport cannot change lifecycle state.');
      const status = input.action === 'suspend' ? 'suspended' as const : input.action === 'reactivate' ? 'active' as const : 'revoked' as const;
      if (input.action === 'reactivate' && current.status !== 'suspended') throw new Error('Only a suspended Agent Passport can be reactivated.');
      const { passport_signature, ...currentUnsigned } = current;
      void passport_signature;
      const toSign = { ...currentUnsigned, status, updated_at: this.clock().toISOString() };
      const updated = agentPassportSchema.parse({ ...toSign, passport_signature: await this.sign(toSign) });
      await this.passports.write(passports.map((passport) => passport.passport_id === current.passport_id ? updated : passport));
      const passportsV2 = await this.passportsV2.read();
      const currentV2 = passportsV2.find((passport) => passport.passport_id === current.passport_id);
      if (currentV2) {
        const unsignedV2 = unsignedPassportV2({ ...currentV2, status });
        const updatedV2 = agentPassportV2Schema.parse({ ...unsignedV2, canonical_hash: hashCanonical(unsignedV2), organization_signature: await this.signOrganization(unsignedV2) });
        await this.passportsV2.write(passportsV2.map((passport) => passport.passport_id === current.passport_id ? updatedV2 : passport));
        if (status !== 'active') await this.updateSessionsForPassport(current.passport_id, status === 'suspended' ? 'suspended' : 'revoked');
      }
      await this.projectLifecycleToWorkplace(updated);
      const eventType = input.action === 'suspend' ? 'AGENT_PASSPORT_SUSPENDED' as const : input.action === 'reactivate' ? 'AGENT_PASSPORT_REACTIVATED' as const : 'AGENT_PASSPORT_REVOKED' as const;
      await this.evidence.append({ trace_id: `tr_agent_${current.agent_id}`, actor: { type: 'human', id: current.owner_human_id }, subject: { type: 'agent_passport', id: current.passport_id }, event_type: eventType, payload: { agent_id: current.agent_id, previous_status: current.status, status } });
      await this.prependWorkplaceEvent(eventType, current.name, `Agent Passport ${status}.`);
      return this.getStateUnlocked();
    });
  }

  public updateRuntime(request: RuntimeLifecycleRequest): Promise<AgentIdentityState> {
    return this.runExclusive(async () => {
      const input = runtimeLifecycleRequestSchema.parse(request);
      const bindings = await this.bindings.read();
      const current = bindings.find((binding) => binding.binding_id === input.bindingId);
      if (!current) throw new Error('Agent Runtime Binding was not found.');
      const passport = (await this.passports.read()).find((candidate) => candidate.agent_id === current.agent_id);
      if (input.action === 'reconnect' && passport?.status !== 'active') throw new Error('Runtime cannot reconnect while its Agent Passport is inactive.');
      const updated = agentRuntimeBindingSchema.parse({ ...current, connection_state: input.action === 'disconnect' ? 'disconnected' : 'connected', status: input.action === 'disconnect' ? 'offline' : 'idle', current_action: input.action === 'disconnect' ? 'Runtime disconnected' : 'Awaiting mandate assignment', last_seen_at: this.clock().toISOString() });
      await this.bindings.write(bindings.map((binding) => binding.binding_id === current.binding_id ? updated : binding));
      if (passport) await this.projectRuntimeToWorkplace(passport, updated);
      const eventType = input.action === 'disconnect' ? 'AGENT_RUNTIME_DISCONNECTED' as const : 'AGENT_RUNTIME_RECONNECTED' as const;
      await this.evidence.append({ trace_id: `tr_agent_${current.agent_id}`, actor: { type: 'system', id: 'h2a-core' }, subject: { type: 'runtime_binding', id: current.binding_id }, event_type: eventType, payload: { agent_id: current.agent_id, provider: current.provider, connection_state: updated.connection_state } });
      await this.prependWorkplaceEvent(eventType, current.display_name, `Runtime ${updated.connection_state}.`);
      if (input.action === 'disconnect') await this.updateSessionsForPassport(passport?.passport_id ?? '', 'stopped');
      return this.getStateUnlocked();
    });
  }

  public attestRuntime(request: AttestAgentRuntimeRequest): Promise<AgentIdentityState> {
    return this.runExclusive(async () => {
      await this.attestRuntimeUnlocked(attestAgentRuntimeRequestSchema.parse(request));
      return this.getStateUnlocked();
    });
  }

  public migrateV1Passports(request: MigrateAgentPassportsV1Request): Promise<AgentPassportV2MigrationResult> {
    return this.runExclusive(async () => {
      const input = migrateAgentPassportsV1RequestSchema.parse(request);
      if (!this.sponsorAuthority) throw new Error('Passport migration requires the organization authority service.');
      const authorized = await this.sponsorAuthority.authorizeProtectedOperation(toHumanAuthority(input.sponsorAuthority), 'agent-passport', 'issue');
      const [legacy, existingV2, keys, existingReceipts] = await Promise.all([this.passports.read(), this.passportsV2.read(), this.workloadKeys.read(), this.migrationReceipts.read()]);
      const nextPassports = [...existingV2];
      const nextReceipts = [...existingReceipts];
      for (const mapping of input.mappings) {
        const source = legacy.find((passport) => passport.passport_id === mapping.passportId);
        if (!source) throw new Error(`Legacy Agent Passport ${mapping.passportId} was not found.`);
        if (existingV2.some((passport) => passport.passport_id === source.passport_id)) continue;
        if (!keys.some((key) => key.agent_id === source.agent_id)) throw new Error(`Migration denied for ${source.passport_id}: workload private key is unavailable.`);
        const now = this.clock().toISOString();
        const unsigned = {
          schema_version: V2_CONTRACT_VERSION, passport_id: source.passport_id, agent_id: source.agent_id,
          organization_id: input.organizationId, sponsor_human_id: authorized.humanId,
          sponsor_membership_id: input.sponsorAuthority.membershipId, issuance_human_proof_id: authorized.humanProofId,
          issuance_authority_credential_id: input.sponsorAuthority.authorityCredentialId,
          connector_manifest_id: mapping.connectorManifestId, name: source.name, role: source.role,
          purpose: mapping.purpose, risk_tier: mapping.riskTier, capabilities: source.capabilities,
          workload_public_key: source.workload_public_key, status: source.status, issued_at: source.issued_at,
          expires_at: mapping.expiresAt
        };
        const target = agentPassportV2Schema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), organization_signature: await this.signOrganization(unsigned) });
        const receiptUnsigned = {
          migration_id: `mig_agent_${randomUUID()}`, source_schema_version: 1 as const, target_schema_version: V2_CONTRACT_VERSION,
          record_type: 'agent-passport' as const, source_record_id: source.passport_id, target_record_id: target.passport_id,
          organization_id: input.organizationId, status: 'migrated' as const, missing_fields: [], source_hash: hashCanonical(source),
          target_hash: target.canonical_hash, migrated_at: now
        };
        const receipt = v2MigrationReceiptSchema.parse({ ...receiptUnsigned, migration_signature: await this.signOrganization(receiptUnsigned) });
        nextPassports.push(target); nextReceipts.push(receipt);
        await this.evidence.append({ trace_id: `tr_agent_${source.agent_id}`, actor: { type: 'human', id: authorized.humanId }, subject: { type: 'agent_passport', id: source.passport_id }, event_type: 'AGENT_PASSPORT_V2_MIGRATED', payload: { organization_id: input.organizationId, migration_id: receipt.migration_id, source_hash: receipt.source_hash, target_hash: receipt.target_hash } });
      }
      await this.passportsV2.write(nextPassports);
      await this.migrationReceipts.write(nextReceipts);
      return agentPassportV2MigrationResultSchema.parse({ passports: nextPassports, receipts: nextReceipts });
    });
  }

  private async createPassportV2(input: {
    passportId: string;
    agentId: string;
    sponsor: { humanId: string; humanProofId: string; organizationId: string; membershipId: string; authorityCredentialId: string };
    input: CreateAgentRequest;
    workloadPublicKey: string;
    issuedAt: string;
  }): Promise<AgentPassportV2> {
    const unsigned = {
      schema_version: V2_CONTRACT_VERSION,
      passport_id: input.passportId,
      agent_id: input.agentId,
      organization_id: input.sponsor.organizationId,
      sponsor_human_id: input.sponsor.humanId,
      sponsor_membership_id: input.sponsor.membershipId,
      issuance_human_proof_id: input.sponsor.humanProofId,
      issuance_authority_credential_id: input.sponsor.authorityCredentialId,
      connector_manifest_id: input.input.connectorManifestId!,
      name: input.input.name,
      role: input.input.role,
      purpose: input.input.purpose!,
      risk_tier: input.input.riskTier!,
      capabilities: [...new Set(input.input.capabilities)],
      workload_public_key: input.workloadPublicKey,
      status: 'active' as const,
      issued_at: input.issuedAt,
      expires_at: input.input.expiresAt!
    };
    if (new Date(unsigned.expires_at).getTime() <= this.clock().getTime()) throw new Error('Agent Passport expiry must be in the future.');
    return agentPassportV2Schema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), organization_signature: await this.signOrganization(unsigned) });
  }

  private async attestRuntimeUnlocked(input: AttestAgentRuntimeRequest): Promise<void> {
    if (input.trustMode === 'governed') throw new Error('Governed trust is unavailable until Phase 16 containment and gateway integration pass.');
    if (input.trustMode === 'external-attested') throw new Error('External-attested trust requires a Phase 16/17 connector verifier.');
    const now = this.clock();
    if (new Date(input.expiresAt).getTime() <= now.getTime()) throw new Error('Runtime attestation expiry must be in the future.');
    const passport = (await this.passportsV2.read()).find((item) => item.passport_id === input.passportId);
    if (!passport || passport.status !== 'active' || new Date(passport.expires_at).getTime() <= now.getTime()) throw new Error('An active Passport V2 is required for runtime attestation.');
    if (!await this.verifyPassportV2(passport)) throw new Error('Agent Passport signature or canonical hash is invalid.');
    if (passport.connector_manifest_id !== input.connectorManifestId) throw new Error('Connector manifest does not match the Agent Passport.');
    if (new Date(input.expiresAt).getTime() > new Date(passport.expires_at).getTime()) throw new Error('Runtime attestation cannot outlive its Agent Passport.');
    const bindings = await this.bindings.read();
    const binding = bindings.find((item) => item.binding_id === input.bindingId && item.agent_id === passport.agent_id);
    if (!binding) throw new Error('Runtime binding does not belong to the Agent Passport.');
    const workloadKey = (await this.workloadKeys.read()).find((item) => item.agent_id === passport.agent_id);
    if (!workloadKey) throw new Error('Workload private key is unavailable; copied passport records cannot attest.');

    const issuedAt = now.toISOString();
    const challenge = runtimeChallengeSchema.parse({
      challenge_id: `wch_${randomUUID()}`, passport_id: passport.passport_id, binding_id: binding.binding_id,
      nonce: randomBytes(32).toString('base64url'), issued_at: issuedAt, expires_at: new Date(now.getTime() + 60_000).toISOString()
    });
    await this.runtimeChallenges.write([challenge, ...(await this.runtimeChallenges.read())].slice(0, 200));
    await this.evidence.append({ trace_id: `tr_agent_${passport.agent_id}`, actor: { type: 'system', id: 'h2a-runtime-supervisor' }, subject: { type: 'runtime_binding', id: binding.binding_id }, event_type: 'WORKLOAD_CHALLENGE_ISSUED', payload: { challenge_id: challenge.challenge_id, passport_id: passport.passport_id, expires_at: challenge.expires_at } });
    const challengeSignature = `ed25519:${signBytes(null, Buffer.from(challenge.nonce, 'utf8'), workloadKey.private_key_pem).toString('base64')}`;
    if (!verifyBytes(null, Buffer.from(challenge.nonce, 'utf8'), passport.workload_public_key, Buffer.from(challengeSignature.slice('ed25519:'.length), 'base64'))) {
      throw new Error('Workload-key challenge signature is invalid.');
    }

    const sessionPair = generateKeyPairSync('ed25519');
    const sessionId = `rts_${randomUUID()}`;
    const attestationId = `rta_${randomUUID()}`;
    const previousSessions = await this.runtimeSessions.read();
    const rotatedSessionIds = previousSessions.filter((item) => item.passport_id === passport.passport_id && !['stopped', 'revoked', 'failed'].includes(item.state)).map((item) => item.runtime_session_id);
    const rotated = previousSessions.map((item) => rotatedSessionIds.includes(item.runtime_session_id) ? runtimeSessionSchema.parse({ ...item, state: 'revoked', stopped_at: issuedAt, last_seen_at: issuedAt }) : item);
    const unsignedAttestation = {
      schema_version: V2_CONTRACT_VERSION, attestation_id: attestationId, passport_id: passport.passport_id,
      connector_manifest_id: input.connectorManifestId, provider: binding.provider, adapter_version: input.adapterVersion,
      executable_hash: input.executableHash, session_public_key: sessionPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      challenge_nonce: challenge.challenge_id, challenge_signature: challengeSignature, trust_mode: input.trustMode,
      trust_evidence_refs: input.trustEvidenceRefs, issued_at: issuedAt, expires_at: input.expiresAt
    };
    const attestation = runtimeAttestationSchema.parse({ ...unsignedAttestation, canonical_hash: hashCanonical(unsignedAttestation), organization_signature: await this.signOrganization(unsignedAttestation) });
    const session = runtimeSessionSchema.parse({
      schema_version: V2_CONTRACT_VERSION, runtime_session_id: sessionId, passport_id: passport.passport_id,
      connector_manifest_id: input.connectorManifestId, runtime_attestation_id: attestationId, trust_mode: input.trustMode,
      state: 'ready', started_at: issuedAt, last_seen_at: issuedAt, evidence_refs: [challenge.challenge_id, ...input.trustEvidenceRefs]
    });
    const secret = sessionKeySchema.parse({ runtime_session_id: sessionId, private_key_pem: sessionPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), created_at: issuedAt });
    await this.attestations.write([attestation, ...(await this.attestations.read())]);
    await this.runtimeSessions.write([session, ...rotated]);
    await this.sessionKeys.write([secret, ...(await this.sessionKeys.read())]);
    await this.runtimeChallenges.write((await this.runtimeChallenges.read()).map((item) => item.challenge_id === challenge.challenge_id ? { ...item, used_at: issuedAt } : item));
    const updatedBinding = agentRuntimeBindingSchema.parse({ ...binding, live_session_id: sessionId, connection_state: 'connected', status: 'idle', current_action: 'Runtime attested; awaiting mandate assignment', last_seen_at: issuedAt });
    await this.bindings.write(bindings.map((item) => item.binding_id === binding.binding_id ? updatedBinding : item));
    await this.projectRuntimeToWorkplace({ passport_id: passport.passport_id, agent_id: passport.agent_id, name: passport.name, role: passport.role, owner_org: passport.organization_id, owner_human_id: passport.sponsor_human_id, owner_human_proof_id: passport.issuance_human_proof_id, runtime: binding.provider === 'scripted' ? 'scripted' : 'live-cli', capabilities: passport.capabilities, status: passport.status, workload_public_key: passport.workload_public_key, issued_at: passport.issued_at, expires_at: passport.expires_at, updated_at: issuedAt, passport_signature: passport.organization_signature }, updatedBinding);
    if (rotatedSessionIds.length) await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_agent_${passport.agent_id}`, actor: { type: 'system', id: 'h2a-runtime-supervisor' }, subject: { type: 'runtime_session', id: sessionId }, event_type: 'RUNTIME_SESSION_ROTATED', payload: { previous_session_ids: rotatedSessionIds, runtime_session_id: sessionId, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
    await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_agent_${passport.agent_id}`, actor: { type: 'system', id: 'h2a-runtime-supervisor' }, subject: { type: 'runtime_attestation', id: attestationId }, event_type: 'RUNTIME_ATTESTED', payload: { passport_id: passport.passport_id, runtime_session_id: sessionId, connector_manifest_id: input.connectorManifestId, trust_mode: input.trustMode, canonical_hash: attestation.canonical_hash, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
  }

  private async updateSessionsForPassport(passportId: string, state: 'suspended' | 'stopped' | 'revoked'): Promise<void> {
    if (!passportId) return;
    const now = this.clock().toISOString();
    const sessions = await this.runtimeSessions.read();
    const affected = sessions.filter((item) => item.passport_id === passportId && !['stopped', 'revoked', 'failed'].includes(item.state));
    if (!affected.length) return;
    await this.runtimeSessions.write(sessions.map((item) => affected.some((candidate) => candidate.runtime_session_id === item.runtime_session_id) ? runtimeSessionSchema.parse({ ...item, state, last_seen_at: now, stopped_at: state === 'stopped' || state === 'revoked' ? now : item.stopped_at }) : item));
    for (const session of affected) await this.evidence.append({ trace_id: `tr_passport_${passportId}`, actor: { type: 'system', id: 'h2a-runtime-supervisor' }, subject: { type: 'runtime_session', id: session.runtime_session_id }, event_type: 'RUNTIME_SESSION_REVOKED', payload: { passport_id: passportId, previous_state: session.state, state } });
  }

  private async getStateUnlocked(): Promise<AgentIdentityState> {
    const [passports, bindings, credentials, proof, passportsV2, attestations, runtimeSessions, migrationReceipts] = await Promise.all([this.passports.read(), this.bindings.read(), this.secrets.listMetadata(), this.humanProof.getState('human_primary'), this.passportsV2.read(), this.attestations.read(), this.runtimeSessions.read(), this.migrationReceipts.read()]);
    const now = this.clock().getTime();
    const normalized = passports.map((passport) => passport.status === 'active' && passport.expires_at && new Date(passport.expires_at).getTime() <= now ? { ...passport, status: 'expired' as const } : passport);
    const normalizedV2 = passportsV2.map((passport) => passport.status === 'active' && new Date(passport.expires_at).getTime() <= now ? { ...passport, status: 'expired' as const } : passport);
    return agentIdentityStateSchema.parse({ passports: normalized, bindings, providers: providerCatalogue, credentials, humanProofRequired: this.sponsorAuthority ? false : !proof.activeProof, passportsV2: normalizedV2, attestations, runtimeSessions, migrationReceipts });
  }

  private async addToWorkplace(passport: AgentPassport, binding: AgentRuntimeBinding, providerLabel: string): Promise<void> {
    const snapshot = await this.workplace.getSnapshot();
    await this.workplace.replaceAgents([...snapshot.agents, toSummary(passport, binding, providerLabel)]);
  }

  private async projectLifecycleToWorkplace(passport: AgentPassport): Promise<void> {
    const snapshot = await this.workplace.getSnapshot();
    await this.workplace.replaceAgents(snapshot.agents.map((agent) => agent.passportId === passport.passport_id ? { ...agent, status: passport.status === 'active' ? 'ready' : passport.status === 'suspended' ? 'blocked' : 'offline', currentAction: `Passport ${passport.status}` } : agent));
  }

  private async projectRuntimeToWorkplace(passport: AgentPassport, binding: AgentRuntimeBinding): Promise<void> {
    const snapshot = await this.workplace.getSnapshot();
    await this.workplace.replaceAgents(snapshot.agents.map((agent) => {
      if (agent.passportId !== passport.passport_id) return agent;
      const runtime = toSummary(passport, binding, getProviderDefinition(binding.provider).label, agent.accent);
      if (agent.mandateId === 'mnd_unassigned') return runtime;
      return {
        ...runtime,
        status: agent.status,
        currentAction: agent.currentAction,
        mandateId: agent.mandateId,
        mandateLabel: agent.mandateLabel,
        progress: agent.progress
      };
    }));
  }

  private async prependWorkplaceEvent(type: string, actor: string, summary: string): Promise<void> {
    const snapshot = await this.workplace.getSnapshot();
    const event = { id: `evt_${randomUUID()}`, type, actor, summary, time: this.clock().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), integrity: 'verified' as const };
    await this.workplace.replaceRecentEvents([event, ...snapshot.events].slice(0, 8));
  }

  private async sign(value: unknown): Promise<string> {
    const key = await this.signingKey.read();
    return `ed25519:${signBytes(null, Buffer.from(canonicalize(value), 'utf8'), key.private_key_pem).toString('base64')}`;
  }

  private async signOrganization(value: unknown): Promise<string> {
    const key = await this.organizationSigningKey.read();
    return `ed25519:${signBytes(null, Buffer.from(canonicalize(value), 'utf8'), key.private_key_pem).toString('base64')}`;
  }

  private async verifyPassportV2(passport: AgentPassportV2): Promise<boolean> {
    const key = await this.organizationSigningKey.read();
    const unsigned = unsignedPassportV2(passport);
    if (hashCanonical(unsigned) !== passport.canonical_hash || !passport.organization_signature.startsWith('ed25519:')) return false;
    return verifyBytes(null, Buffer.from(canonicalize(unsigned), 'utf8'), key.public_key_pem, Buffer.from(passport.organization_signature.slice('ed25519:'.length), 'base64'));
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function createWorkloadKey(agentId: string, createdAt: string): { publicKey: string; secret: WorkloadKey } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    secret: { agent_id: agentId, private_key_pem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), created_at: createdAt }
  };
}

function createSigningKey(): z.infer<typeof signingKeySchema> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    algorithm: 'Ed25519',
    private_key_pem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    public_key_pem: publicKey.export({ format: 'pem', type: 'spki' }).toString()
  };
}

function toHumanAuthority(authority: NonNullable<CreateAgentRequest['sponsorAuthority']>): HumanAuthorityContext {
  return {
    organizationId: authority.organizationId,
    membershipId: authority.membershipId,
    humanProofId: authority.humanProofId,
    authorityCredentialId: authority.authorityCredentialId
  };
}

function unsignedPassportV2(passport: AgentPassportV2): Omit<AgentPassportV2, 'canonical_hash' | 'organization_signature'> {
  const { canonical_hash: _hash, organization_signature: _signature, ...unsigned } = passport;
  void _hash; void _signature;
  return unsigned;
}

function toSummary(passport: AgentPassport, binding: AgentRuntimeBinding, providerLabel: string, accent = colorFor(passport.agent_id)): AgentRuntimeSummary {
  const active = passport.status === 'active';
  return {
    id: binding.binding_id,
    passportId: passport.passport_id,
    name: passport.name,
    initials: initials(passport.name),
    role: passport.role,
    provider: binding.provider,
    providerLabel,
    model: binding.model,
    status: active ? binding.status === 'offline' ? 'offline' : 'ready' : passport.status === 'suspended' ? 'blocked' : 'offline',
    currentAction: active ? binding.current_action : `Passport ${passport.status}`,
    mandateId: 'mnd_unassigned',
    mandateLabel: 'Mandate required',
    progress: binding.progress,
    accent
  };
}

function initials(name: string): string { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function colorFor(value: string): string { const colors = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1']; let hash = 0; for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0; return colors[Math.abs(hash) % colors.length]; }
