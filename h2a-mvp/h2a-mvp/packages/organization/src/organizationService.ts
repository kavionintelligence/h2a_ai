import { generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { z } from 'zod';
import {
  V2_CONTRACT_VERSION,
  authorityCredentialLifecycleRequestSchema,
  authorityRoleSchema,
  bootstrapOrganizationRequestSchema,
  createAuthorityRoleRequestSchema,
  employmentMembershipSchema,
  evaluateHumanAuthorityRequestSchema,
  humanAuthorityCredentialSchema,
  humanAuthorityDecisionSchema,
  issueAuthorityCredentialRequestSchema,
  recoverAdministratorCredentialRequestSchema,
  repairAuthorityCredentialRequestSchema,
  joinMembershipRequestSchema,
  membershipLifecycleRequestSchema,
  organizationAuthorityStateSchema,
  organizationSchema,
  type AuthorityActor,
  type AuthorityCredentialLifecycleRequest,
  type AuthorityRole,
  type BootstrapOrganizationRequest,
  type CreateAuthorityRoleRequest,
  type EmploymentMembership,
  type EvaluateHumanAuthorityRequest,
  type HumanAuthorityCredential,
  type HumanAuthorityDecision,
  type HumanAuthorityReasonCode,
  type HumanIdentityV2State,
  type HumanAuthorityContext,
  type IssueAuthorityCredentialRequest,
  type RecoverAdministratorCredentialRequest,
  type RepairAuthorityCredentialRequest,
  type JoinMembershipRequest,
  type MembershipLifecycleRequest,
  type Organization,
  type OrganizationAuthorityState
} from '@h2a/contracts';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const signingKeySchema = z.object({
  algorithm: z.literal('Ed25519'),
  private_key_pem: z.string().startsWith('-----BEGIN PRIVATE KEY-----'),
  public_key_pem: z.string().startsWith('-----BEGIN PUBLIC KEY-----')
}).strict();
type SigningKey = z.infer<typeof signingKeySchema>;

export interface HumanIdentityV2StatePort {
  getState(selectedHumanId?: string): Promise<HumanIdentityV2State>;
}

export interface ProtectedHumanAuthorityPort {
  authorizeProtectedOperation(context: HumanAuthorityContext | undefined, resource: string, action: string, requiredApprovalPower?: string): Promise<{ humanId: string; humanProofId: string }>;
}

export interface OrganizationRecordSigner {
  signOrganizationRecord(value: unknown): Promise<{ canonicalHash: string; signature: string }>;
}

interface EvaluationOutcome {
  reason: HumanAuthorityReasonCode;
  matchedRoleIds: string[];
}

export class OrganizationAuthorityService {
  private readonly organizations: VersionedJsonRepository<'h2a.v2.organizations', Organization[]>;
  private readonly memberships: VersionedJsonRepository<'h2a.v2.memberships', EmploymentMembership[]>;
  private readonly roles: VersionedJsonRepository<'h2a.v2.authority-roles', AuthorityRole[]>;
  private readonly credentials: VersionedJsonRepository<'h2a.v2.human-authority-credentials', HumanAuthorityCredential[]>;
  private readonly decisions: VersionedJsonRepository<'h2a.v2.human-authority-decisions', HumanAuthorityDecision[]>;
  private readonly signingKey: VersionedJsonRepository<'h2a.v2.organization-signing-key', SigningKey>;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly humanIdentity: HumanIdentityV2StatePort,
    private readonly clock: () => Date = () => new Date()
  ) {
    const store = new AtomicFileStore(dataPath);
    const options = { clock, initialData: [] };
    this.organizations = new VersionedJsonRepository(store, 'organizations/registry-v2.json', 'h2a.v2.organizations', z.array(organizationSchema), options);
    this.memberships = new VersionedJsonRepository(store, 'organizations/memberships-v2.json', 'h2a.v2.memberships', z.array(employmentMembershipSchema), options);
    this.roles = new VersionedJsonRepository(store, 'authority/roles-v2.json', 'h2a.v2.authority-roles', z.array(authorityRoleSchema), options);
    this.credentials = new VersionedJsonRepository(store, 'authority/credentials-v2.json', 'h2a.v2.human-authority-credentials', z.array(humanAuthorityCredentialSchema), options);
    this.decisions = new VersionedJsonRepository(store, 'authority/decisions-v2.json', 'h2a.v2.human-authority-decisions', z.array(humanAuthorityDecisionSchema).max(200), options);
    this.signingKey = new VersionedJsonRepository(store, 'settings/organization-signing-key-v2.json', 'h2a.v2.organization-signing-key', signingKeySchema, { clock, initialData: createSigningKey() });
  }

  public async initialize(): Promise<void> {
    await Promise.all([
      this.organizations.read(), this.memberships.read(), this.roles.read(),
      this.credentials.read(), this.decisions.read(), this.signingKey.read()
    ]);
    await this.ensurePhase14AdministratorScopes();
    await this.expireCredentials();
  }

  public getState(): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      await this.expireCredentials();
      return this.getStateUnlocked();
    });
  }

  public async signOrganizationRecord(value: unknown): Promise<{ canonicalHash: string; signature: string }> {
    return { canonicalHash: hashCanonical(value), signature: await this.sign(value) };
  }

  public async getOrganizationPublicKey(): Promise<string> {
    return (await this.signingKey.read()).public_key_pem;
  }

  public bootstrap(request: BootstrapOrganizationRequest): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      const input = bootstrapOrganizationRequestSchema.parse(request);
      if ((await this.organizations.read()).some((item) => item.organization_id === input.organization_id)) {
        throw new Error('Organization already exists; bootstrap is one-time per organization.');
      }
      const proof = await this.requireProof(input.organization_id, input.membership_id, input.human_proof_id, input.human_id);
      const now = this.clock().toISOString();
      if (new Date(input.credential_expires_at).getTime() <= this.clock().getTime()) throw new Error('Credential expiry must be in the future.');
      const key = await this.signingKey.read();
      const organization = organizationSchema.parse({
        schema_version: V2_CONTRACT_VERSION,
        organization_id: input.organization_id,
        name: input.name,
        policy_version: input.policy_version,
        signing_root_key_id: `orgkey_${hashCanonical(key.public_key_pem).slice(7, 23)}`,
        status: 'active',
        created_at: now,
        updated_at: now
      });
      const adminRole = authorityRoleSchema.parse({
        schema_version: V2_CONTRACT_VERSION,
        role_id: 'role_authority_admin',
        organization_id: input.organization_id,
        name: 'Authority Administrator',
        description: 'Bootstraps and administers organization authority, credentials, and protected mandates.',
        authority_scopes: [
          { resource: 'organization', actions: ['manage'] },
          { resource: 'mandate', actions: ['issue', 'approve', 'revoke'] },
          { resource: 'agent-passport', actions: ['issue', 'revoke'] },
          { resource: 'runtime-attestation', actions: ['issue', 'revoke'] },
          { resource: 'context-artifact', actions: ['create'] },
          { resource: 'context-grant', actions: ['issue', 'revoke'] },
          { resource: 'project-work-graph', actions: ['approve'] },
          { resource: 'federation-node', actions: ['configure'] },
          { resource: 'federation-peer', actions: ['invite', 'join', 'approve', 'activate', 'revoke'] },
          { resource: 'federation-envelope', actions: ['listen', 'send'] }
        ],
        approval_powers: ['mandate.approve', 'context.grant.issue', 'federation.node.manage', 'federation.peer.invite', 'federation.peer.join', 'federation.peer.approve', 'federation.peer.revoke'],
        status: 'active',
        updated_at: now
      });
      const membership = employmentMembershipSchema.parse({
        schema_version: V2_CONTRACT_VERSION,
        membership_id: input.membership_id,
        organization_id: input.organization_id,
        human_id: input.human_id,
        employee_id: input.employee_id,
        department: input.department,
        role_ids: [adminRole.role_id],
        status: 'active',
        effective_from: now,
        updated_at: now
      });
      const credential = await this.createSignedCredential({
        organizationId: input.organization_id,
        membershipId: input.membership_id,
        roleIds: [adminRole.role_id],
        resourceConstraints: [],
        actionConstraints: [],
        approvalPolicyIds: [],
        expiresAt: input.credential_expires_at,
        issuedAt: now
      });
      await this.organizations.write([...(await this.organizations.read()), organization]);
      await this.roles.write([...(await this.roles.read()), adminRole]);
      await this.memberships.write([...(await this.memberships.read()), membership]);
      await this.credentials.write([...(await this.credentials.read()), credential]);
      await this.evidence.append({
        trace_id: input.ceremony?.trace_id ?? `tr_org_${organization.organization_id}`,
        actor: { type: 'human', id: proof.human_id },
        subject: { type: 'organization', id: organization.organization_id },
        event_type: 'ORGANIZATION_BOOTSTRAPPED',
        payload: { membership_id: membership.membership_id, role_id: adminRole.role_id, credential_id: credential.credential_id, policy_version: organization.policy_version, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key }
      });
      return this.getStateUnlocked();
    });
  }

  public createRole(request: CreateAuthorityRoleRequest): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      const input = createAuthorityRoleRequestSchema.parse(request);
      const actor = await this.requireAdministrator(input.actor, input.organization_id);
      const roles = await this.roles.read();
      if (roles.some((item) => item.organization_id === input.organization_id && item.role_id === input.role_id)) throw new Error('Role ID already exists in this organization.');
      const role = authorityRoleSchema.parse({
        schema_version: V2_CONTRACT_VERSION,
        role_id: input.role_id,
        organization_id: input.organization_id,
        name: input.name,
        description: input.description,
        authority_scopes: input.authority_scopes,
        approval_powers: input.approval_powers,
        status: 'active',
        updated_at: this.clock().toISOString()
      });
      await this.roles.write([...roles, role]);
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_role_${role.role_id}_${randomUUID()}`, actor: { type: 'human', id: actor.human_id }, subject: { type: 'authority_role', id: role.role_id }, event_type: 'AUTHORITY_ROLE_CREATED', payload: { organization_id: role.organization_id, scope_count: role.authority_scopes.length, approval_power_count: role.approval_powers.length, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.getStateUnlocked();
    });
  }

  public joinMembership(request: JoinMembershipRequest): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      const input = joinMembershipRequestSchema.parse(request);
      const actor = await this.requireAdministrator(input.actor, input.organization_id);
      const memberships = await this.memberships.read();
      if (memberships.some((item) => item.membership_id === input.membership_id || (item.organization_id === input.organization_id && item.employee_id === input.employee_id))) throw new Error('Membership or employee ID already exists.');
      const identityState = await this.humanIdentity.getState(input.human_id);
      const identity = identityState.identities.find((item) => item.human_id === input.human_id && item.organization_id === input.organization_id);
      if (!identity || identity.status !== 'active' || identity.active_membership_id !== input.membership_id) throw new Error('An active biometric identity bound to this organization and membership is required.');
      await this.requireRoles(input.organization_id, input.role_ids);
      this.requireManager(memberships, input.organization_id, input.membership_id, input.manager_membership_id);
      const now = this.clock().toISOString();
      const membership = employmentMembershipSchema.parse({
        schema_version: V2_CONTRACT_VERSION,
        membership_id: input.membership_id,
        organization_id: input.organization_id,
        human_id: input.human_id,
        employee_id: input.employee_id,
        department: input.department,
        manager_membership_id: input.manager_membership_id,
        role_ids: input.role_ids,
        status: 'active',
        effective_from: now,
        updated_at: now
      });
      await this.memberships.write([...memberships, membership]);
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_membership_${membership.membership_id}`, actor: { type: 'human', id: actor.human_id }, subject: { type: 'membership', id: membership.membership_id }, event_type: 'MEMBERSHIP_JOINED', payload: { organization_id: membership.organization_id, human_id: membership.human_id, employee_id: membership.employee_id, department: membership.department, role_ids: membership.role_ids, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.getStateUnlocked();
    });
  }

  public updateMembership(request: MembershipLifecycleRequest): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      const input = membershipLifecycleRequestSchema.parse(request);
      const memberships = await this.memberships.read();
      const current = memberships.find((item) => item.membership_id === input.membership_id);
      if (!current) throw new Error('Membership not found.');
      const actor = await this.requireAdministrator(input.actor, current.organization_id);
      if (current.status === 'terminated') throw new Error('Terminated memberships cannot be changed.');
      if (input.action === 'reactivate' && !['suspended', 'transferred'].includes(current.status)) throw new Error('Only suspended or transferred memberships can be reactivated.');
      if (input.action === 'transfer' || input.action === 'assign-roles') {
        await this.requireRoles(current.organization_id, input.role_ids ?? current.role_ids);
        if (input.action === 'transfer') this.requireManager(memberships, current.organization_id, current.membership_id, input.manager_membership_id);
      }
      const now = this.clock().toISOString();
      const status = input.action === 'suspend' ? 'suspended' : input.action === 'transfer' ? 'transferred' : input.action === 'terminate' ? 'terminated' : 'active';
      const updated = employmentMembershipSchema.parse({
        ...current,
        department: input.action === 'transfer' ? input.department : current.department,
        manager_membership_id: input.action === 'transfer' ? input.manager_membership_id : current.manager_membership_id,
        role_ids: input.action === 'transfer' || input.action === 'assign-roles' ? input.role_ids ?? current.role_ids : current.role_ids,
        status,
        effective_until: input.action === 'terminate' ? now : undefined,
        updated_at: now
      });
      await this.memberships.write(memberships.map((item) => item.membership_id === current.membership_id ? updated : item));
      if (!['reactivate', 'assign-roles'].includes(input.action)) await this.revokeMembershipCredentials(current.membership_id);
      const eventType = input.action === 'suspend' ? 'MEMBERSHIP_SUSPENDED' : input.action === 'transfer' ? 'MEMBERSHIP_TRANSFERRED' : input.action === 'terminate' ? 'MEMBERSHIP_TERMINATED' : input.action === 'assign-roles' ? 'MEMBERSHIP_ROLES_ASSIGNED' : 'MEMBERSHIP_REACTIVATED';
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_membership_${current.membership_id}_${randomUUID()}`, actor: { type: 'human', id: actor.human_id }, subject: { type: 'membership', id: current.membership_id }, event_type: eventType, payload: { organization_id: current.organization_id, previous_status: current.status, status, department: updated.department, role_ids: updated.role_ids, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.getStateUnlocked();
    });
  }

  public issueCredential(request: IssueAuthorityCredentialRequest): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      const input = issueAuthorityCredentialRequestSchema.parse(request);
      const actor = await this.requireAdministrator(input.actor, input.organization_id);
      const membership = (await this.memberships.read()).find((item) => item.membership_id === input.membership_id && item.organization_id === input.organization_id);
      if (!membership || membership.status !== 'active') throw new Error('An active membership is required for credential issuance.');
      if (!input.role_ids.every((roleId) => membership.role_ids.includes(roleId))) throw new Error('Credential roles must be assigned to the membership.');
      await this.requireRoles(input.organization_id, input.role_ids);
      if (new Date(input.expires_at).getTime() <= this.clock().getTime()) throw new Error('Credential expiry must be in the future.');
      const now = this.clock().toISOString();
      const credential = await this.createSignedCredential({ organizationId: input.organization_id, membershipId: input.membership_id, roleIds: input.role_ids, resourceConstraints: input.resource_constraints, actionConstraints: input.action_constraints, approvalPolicyIds: input.approval_policy_ids, issuedAt: now, expiresAt: input.expires_at });
      const credentials = (await this.credentials.read()).map((item) => item.membership_id === membership.membership_id && item.status === 'active' ? { ...item, status: 'revoked' as const } : item);
      await this.credentials.write([...credentials, credential]);
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_credential_${credential.credential_id}`, actor: { type: 'human', id: actor.human_id }, subject: { type: 'authority_credential', id: credential.credential_id }, event_type: 'AUTHORITY_CREDENTIAL_ISSUED', payload: { organization_id: credential.organization_id, membership_id: credential.membership_id, role_ids: credential.role_ids, expires_at: credential.expires_at, canonical_hash: credential.canonical_hash, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.getStateUnlocked();
    });
  }

  public recoverAdministratorCredential(request: RecoverAdministratorCredentialRequest): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      const input = recoverAdministratorCredentialRequestSchema.parse(request);
      await this.expireCredentials();
      const membership = (await this.memberships.read()).find((item) => item.membership_id === input.membership_id && item.organization_id === input.organization_id);
      if (!membership || membership.status !== 'active' || !membership.role_ids.includes('role_authority_admin')) throw new Error('An active administrator membership is required for credential recovery.');
      const proof = await this.requireProof(input.organization_id, input.membership_id, input.human_proof_id, membership.human_id);
      if (proof.purpose !== 'administer trusted federation peers') throw new Error('Credential recovery requires exact-purpose federation administrator Human Proof.');
      const credentials = await this.credentials.read();
      if (credentials.some((item) => item.membership_id === membership.membership_id && item.status === 'active' && new Date(item.expires_at).getTime() > this.clock().getTime())) throw new Error('An active administrator credential already exists.');
      const expiresAt = new Date(input.expires_at).getTime();
      const maximumExpiry = this.clock().getTime() + 120 * 60 * 1000;
      if (expiresAt <= this.clock().getTime() || expiresAt > maximumExpiry) throw new Error('Recovered administrator credentials must expire within 120 minutes.');
      await this.requireRoles(input.organization_id, ['role_authority_admin']);
      const credential = await this.createSignedCredential({ organizationId: input.organization_id, membershipId: input.membership_id, roleIds: ['role_authority_admin'], resourceConstraints: [], actionConstraints: [], approvalPolicyIds: [], issuedAt: this.clock().toISOString(), expiresAt: input.expires_at });
      await this.credentials.write([...credentials, credential]);
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_credential_recovery_${credential.credential_id}`, actor: { type: 'human', id: membership.human_id }, subject: { type: 'authority_credential', id: credential.credential_id }, event_type: 'AUTHORITY_CREDENTIAL_ISSUED', payload: { organization_id: credential.organization_id, membership_id: credential.membership_id, role_ids: credential.role_ids, expires_at: credential.expires_at, canonical_hash: credential.canonical_hash, recovery: 'exact-purpose-human-proof', purpose: proof.purpose, human_proof_id: proof.human_proof_id, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.getStateUnlocked();
    });
  }

  public repairCredentialExactScope(request: RepairAuthorityCredentialRequest): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      const input = repairAuthorityCredentialRequestSchema.parse(request);
      await this.expireCredentials();
      const membership = (await this.memberships.read()).find((item) => item.membership_id === input.membership_id && item.organization_id === input.organization_id);
      if (!membership || membership.status !== 'active') throw new Error('READINESS_MEMBERSHIP_INACTIVE');
      const proof = await this.requireProof(input.organization_id, input.membership_id, input.human_proof_id, membership.human_id);
      if (proof.purpose !== input.proof_purpose || !input.proof_purpose.startsWith('repair prerequisites for ')) throw new Error('READINESS_PROOF_PURPOSE_MISMATCH');
      const credentials = await this.credentials.read();
      const prior = credentials.find((item) => item.credential_id === input.replaces_credential_id && item.membership_id === membership.membership_id);
      if (!prior || prior.status !== 'expired') throw new Error('READINESS_CREDENTIAL_NOT_EXPIRED');
      if (credentials.some((item) => item.membership_id === membership.membership_id && item.status === 'active' && new Date(item.expires_at).getTime() > this.clock().getTime())) return this.getStateUnlocked();
      const originalDuration = new Date(prior.expires_at).getTime() - new Date(prior.issued_at).getTime();
      const requestedDuration = new Date(input.expires_at).getTime() - this.clock().getTime();
      if (requestedDuration <= 0 || requestedDuration > Math.min(originalDuration, 120 * 60 * 1000)) throw new Error('READINESS_CREDENTIAL_DURATION_BROADENED');
      const now = this.clock().toISOString();
      const replacement = await this.createSignedCredential({
        organizationId: prior.organization_id, membershipId: prior.membership_id, roleIds: prior.role_ids,
        resourceConstraints: prior.resource_constraints, actionConstraints: prior.action_constraints,
        approvalPolicyIds: prior.approval_policy_ids, issuedAt: now, expiresAt: input.expires_at
      });
      if (replacement.credential_id === prior.credential_id) throw new Error('READINESS_REPLACEMENT_ID_REUSED');
      await this.credentials.write([...credentials, replacement]);
      await this.evidence.append({
        trace_id: input.ceremony?.trace_id ?? `tr_readiness_${replacement.credential_id}`,
        actor: { type: 'human', id: membership.human_id }, subject: { type: 'authority_credential', id: replacement.credential_id },
        event_type: 'AUTHORITY_CREDENTIAL_ISSUED',
        payload: {
          repair_mode: 'exact-scope-replacement', replacement_for_id: prior.credential_id, proof_id: proof.human_proof_id, proof_purpose: proof.purpose,
          command_id: input.command_id, role_ids: replacement.role_ids, resource_constraints: replacement.resource_constraints,
          action_constraints: replacement.action_constraints, approval_policy_ids: replacement.approval_policy_ids,
          expires_at: replacement.expires_at, canonical_hash: replacement.canonical_hash,
          ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key
        }
      });
      return this.getStateUnlocked();
    });
  }

  public updateCredential(request: AuthorityCredentialLifecycleRequest): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      const input = authorityCredentialLifecycleRequestSchema.parse(request);
      await this.expireCredentials();
      const credentials = await this.credentials.read();
      const current = credentials.find((item) => item.credential_id === input.credential_id);
      if (!current) throw new Error('Authority credential not found.');
      const actor = await this.requireAdministrator(input.actor, current.organization_id);
      if (current.status === 'revoked' || current.status === 'expired') throw new Error('Revoked or expired credentials cannot be changed.');
      if (input.action === 'reactivate' && current.status !== 'suspended') throw new Error('Only suspended credentials can be reactivated.');
      const status = input.action === 'suspend' ? 'suspended' : input.action === 'revoke' ? 'revoked' : 'active';
      const unsigned = unsignedCredential({ ...current, status });
      const updated = humanAuthorityCredentialSchema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), organization_signature: await this.sign(unsigned) });
      await this.credentials.write(credentials.map((item) => item.credential_id === current.credential_id ? updated : item));
      const eventType = input.action === 'suspend' ? 'AUTHORITY_CREDENTIAL_SUSPENDED' : input.action === 'revoke' ? 'AUTHORITY_CREDENTIAL_REVOKED' : 'AUTHORITY_CREDENTIAL_REACTIVATED';
      await this.evidence.append({ trace_id: `tr_credential_${current.credential_id}_${randomUUID()}`, actor: { type: 'human', id: actor.human_id }, subject: { type: 'authority_credential', id: current.credential_id }, event_type: eventType, payload: { organization_id: current.organization_id, membership_id: current.membership_id, previous_status: current.status, status } });
      return this.getStateUnlocked();
    });
  }

  public evaluate(request: EvaluateHumanAuthorityRequest): Promise<OrganizationAuthorityState> {
    return this.runExclusive(async () => {
      const input = evaluateHumanAuthorityRequestSchema.parse(request);
      await this.expireCredentials();
      await this.recordDecision(input, await this.evaluateCore(input));
      return this.getStateUnlocked();
    });
  }

  public authorizeProtectedOperation(context: HumanAuthorityContext | undefined, resource: string, action: string, requiredApprovalPower?: string): Promise<{ humanId: string; humanProofId: string }> {
    return this.runExclusive(async () => {
      if (!context) throw new Error('Protected operation denied: HUMAN_AUTHORITY_REQUIRED.');
      const input = evaluateHumanAuthorityRequestSchema.parse({
        organization_id: context.organizationId,
        membership_id: context.membershipId,
        human_proof_id: context.humanProofId,
        authority_credential_id: context.authorityCredentialId,
        resource,
        action,
        required_approval_power: requiredApprovalPower,
        purpose: `${action} protected ${resource}`
      });
      await this.expireCredentials();
      const outcome = await this.evaluateCore(input);
      await this.recordDecision(input, outcome);
      if (outcome.reason !== 'AUTHORIZED') throw new Error(`Protected operation denied: ${outcome.reason}.`);
      const membership = (await this.memberships.read()).find((item) => item.membership_id === context.membershipId)!;
      return { humanId: membership.human_id, humanProofId: context.humanProofId };
    });
  }

  private async requireAdministrator(actor: AuthorityActor, organizationId: string) {
    const request = evaluateHumanAuthorityRequestSchema.parse({
      organization_id: organizationId,
      membership_id: actor.membership_id,
      human_proof_id: actor.human_proof_id,
      authority_credential_id: actor.authority_credential_id,
      resource: 'organization',
      action: 'manage',
      purpose: 'administer organization authority'
    });
    const outcome = await this.evaluateCore(request);
    await this.recordDecision(request, outcome);
    if (outcome.reason !== 'AUTHORIZED') throw new Error(`Organization administration denied: ${outcome.reason}.`);
    const membership = (await this.memberships.read()).find((item) => item.membership_id === actor.membership_id)!;
    return this.requireProof(organizationId, actor.membership_id, actor.human_proof_id, membership.human_id);
  }

  private async evaluateCore(input: EvaluateHumanAuthorityRequest): Promise<EvaluationOutcome> {
    const organization = (await this.organizations.read()).find((item) => item.organization_id === input.organization_id);
    if (!organization || organization.status !== 'active') return { reason: 'ORGANIZATION_UNAVAILABLE', matchedRoleIds: [] };
    const membership = (await this.memberships.read()).find((item) => item.membership_id === input.membership_id && item.organization_id === input.organization_id);
    if (!membership) return { reason: 'MEMBERSHIP_NOT_FOUND', matchedRoleIds: [] };
    if (membership.status !== 'active') return { reason: 'MEMBERSHIP_INACTIVE', matchedRoleIds: [] };
    const proofState = await this.humanIdentity.getState(membership.human_id);
    const proof = proofState.active_proofs.find((item) => item.human_proof_id === input.human_proof_id);
    if (!proof || new Date(proof.expires_at).getTime() <= this.clock().getTime()) return { reason: 'HUMAN_PROOF_REQUIRED', matchedRoleIds: [] };
    if (proof.organization_id !== input.organization_id || proof.membership_id !== membership.membership_id || proof.human_id !== membership.human_id) return { reason: 'HUMAN_PROOF_SUBJECT_MISMATCH', matchedRoleIds: [] };
    const credential = (await this.credentials.read()).find((item) => item.credential_id === input.authority_credential_id);
    if (!credential || credential.organization_id !== input.organization_id || credential.membership_id !== membership.membership_id) return { reason: 'CREDENTIAL_NOT_FOUND', matchedRoleIds: [] };
    if (new Date(credential.expires_at).getTime() <= this.clock().getTime()) return { reason: 'CREDENTIAL_EXPIRED', matchedRoleIds: [] };
    if (credential.status !== 'active') return { reason: 'CREDENTIAL_INACTIVE', matchedRoleIds: [] };
    if (!await this.verifyCredential(credential)) return { reason: 'CREDENTIAL_SIGNATURE_INVALID', matchedRoleIds: [] };
    if (credential.resource_constraints.length && !credential.resource_constraints.some((value) => matches(value, input.resource))) return { reason: 'RESOURCE_NOT_ALLOWED', matchedRoleIds: [] };
    if (credential.action_constraints.length && !credential.action_constraints.some((value) => matches(value, input.action))) return { reason: 'ACTION_NOT_ALLOWED', matchedRoleIds: [] };
    const roles = (await this.roles.read()).filter((role) => credential.role_ids.includes(role.role_id));
    if (!roles.length || roles.some((role) => role.status !== 'active')) return { reason: 'ROLE_INACTIVE', matchedRoleIds: [] };
    const resourceRoles = roles.filter((role) => role.authority_scopes.some((scope) => matches(scope.resource, input.resource)));
    if (!resourceRoles.length) return { reason: 'RESOURCE_NOT_ALLOWED', matchedRoleIds: [] };
    const actionScopes = resourceRoles.flatMap((role) => role.authority_scopes.filter((scope) => matches(scope.resource, input.resource) && scope.actions.some((action) => matches(action, input.action))).map((scope) => ({ role, scope })));
    if (!actionScopes.length) return { reason: 'ACTION_NOT_ALLOWED', matchedRoleIds: [] };
    const withinAmount = actionScopes.filter(({ scope }) => scope.max_amount === undefined || input.amount === undefined || input.amount <= scope.max_amount);
    if (!withinAmount.length) return { reason: 'AMOUNT_EXCEEDS_ROLE', matchedRoleIds: [] };
    const withinRecords = withinAmount.filter(({ scope }) => scope.max_records === undefined || input.records === undefined || input.records <= scope.max_records);
    if (!withinRecords.length) return { reason: 'RECORD_LIMIT_EXCEEDED', matchedRoleIds: [] };
    if (input.required_approval_power && !withinRecords.some(({ role }) => role.approval_powers.includes(input.required_approval_power!))) return { reason: 'APPROVAL_POWER_REQUIRED', matchedRoleIds: [] };
    return { reason: 'AUTHORIZED', matchedRoleIds: [...new Set(withinRecords.map(({ role }) => role.role_id))] };
  }

  private async recordDecision(input: EvaluateHumanAuthorityRequest, outcome: EvaluationOutcome): Promise<void> {
    const now = this.clock().toISOString();
    const membership = (await this.memberships.read()).find((item) => item.membership_id === input.membership_id);
    const decision = humanAuthorityDecisionSchema.parse({
      decision_id: `had_${randomUUID()}`,
      trace_id: `tr_human_authority_${randomUUID()}`,
      organization_id: input.organization_id,
      membership_id: input.membership_id,
      human_proof_id: input.human_proof_id,
      authority_credential_id: input.authority_credential_id,
      resource: input.resource,
      action: input.action,
      decision: outcome.reason === 'AUTHORIZED' ? 'ALLOW' : 'DENY',
      reason_code: outcome.reason,
      matched_role_ids: outcome.matchedRoleIds,
      evaluated_at: now
    });
    await this.decisions.write([decision, ...(await this.decisions.read())].slice(0, 200));
    await this.evidence.append({
      trace_id: decision.trace_id,
      actor: { type: 'human', id: membership?.human_id ?? input.membership_id },
      subject: { type: 'authority_credential', id: input.authority_credential_id },
      event_type: decision.decision === 'ALLOW' ? 'HUMAN_AUTHORITY_ALLOWED' : 'HUMAN_AUTHORITY_DENIED',
      payload: { organization_id: input.organization_id, membership_id: input.membership_id, resource: input.resource, action: input.action, decision: decision.decision, reason_code: decision.reason_code, matched_role_ids: decision.matched_role_ids }
    });
  }

  private async getStateUnlocked(): Promise<OrganizationAuthorityState> {
    const [organizations, memberships, roles, credentials, decisions, identityState] = await Promise.all([
      this.organizations.read(), this.memberships.read(), this.roles.read(), this.credentials.read(), this.decisions.read(), this.humanIdentity.getState()
    ]);
    const assurance = identityState.active_proofs
      .filter((proof) => new Date(proof.expires_at).getTime() > this.clock().getTime())
      .map((proof) => ({ human_id: proof.human_id, membership_id: proof.membership_id, human_proof_id: proof.human_proof_id, purpose: proof.purpose, expires_at: proof.expires_at }));
    return organizationAuthorityStateSchema.parse({ organizations, memberships, roles, credentials, assurance, decisions });
  }

  private async requireProof(organizationId: string, membershipId: string, proofId: string, humanId: string) {
    const state = await this.humanIdentity.getState(humanId);
    const proof = state.active_proofs.find((item) => item.human_proof_id === proofId);
    if (!proof || new Date(proof.expires_at).getTime() <= this.clock().getTime()) throw new Error('A current Human Proof is required.');
    if (proof.organization_id !== organizationId || proof.membership_id !== membershipId || proof.human_id !== humanId) throw new Error('Human Proof is not bound to the requested organization membership.');
    return proof;
  }

  private async requireRoles(organizationId: string, roleIds: string[]): Promise<void> {
    const roles = await this.roles.read();
    if (!roleIds.every((roleId) => roles.some((role) => role.organization_id === organizationId && role.role_id === roleId && role.status === 'active'))) throw new Error('Every assigned role must be active in the organization.');
  }

  private async ensurePhase14AdministratorScopes(): Promise<void> {
    const roles = await this.roles.read();
    let changed = false;
    const required = [
      { resource: 'agent-passport', actions: ['issue', 'revoke'] },
      { resource: 'runtime-attestation', actions: ['issue', 'revoke'] },
      { resource: 'context-artifact', actions: ['create'] },
      { resource: 'context-grant', actions: ['issue', 'revoke'] },
      { resource: 'project-work-graph', actions: ['approve'] },
      { resource: 'federation-node', actions: ['configure'] },
      { resource: 'federation-peer', actions: ['invite', 'join', 'approve', 'activate', 'revoke'] },
      { resource: 'federation-envelope', actions: ['listen', 'send'] }
    ];
    const updated = roles.map((role) => {
      if (role.role_id !== 'role_authority_admin') return role;
      let roleChanged = false;
      const authorityScopes = [...role.authority_scopes];
      for (const requiredScope of required) {
        const index = authorityScopes.findIndex((scope) => scope.resource === requiredScope.resource);
        if (index < 0) { authorityScopes.push(requiredScope); roleChanged = true; continue; }
        const missingActions = requiredScope.actions.filter((action) => !authorityScopes[index].actions.includes(action));
        if (missingActions.length) { authorityScopes[index] = { ...authorityScopes[index], actions: [...authorityScopes[index].actions, ...missingActions] }; roleChanged = true; }
      }
      const requiredPowers = ['context.grant.issue', 'federation.node.manage', 'federation.peer.invite', 'federation.peer.join', 'federation.peer.approve', 'federation.peer.revoke'];
      const missingPowers = requiredPowers.filter((power) => !role.approval_powers.includes(power));
      const approvalPowers = [...role.approval_powers, ...missingPowers];
      if (!roleChanged && !missingPowers.length) return role;
      changed = true;
      return authorityRoleSchema.parse({ ...role, authority_scopes: authorityScopes, approval_powers: approvalPowers, updated_at: this.clock().toISOString() });
    });
    if (changed) await this.roles.write(updated);
  }

  private requireManager(memberships: EmploymentMembership[], organizationId: string, membershipId: string, managerId?: string): void {
    if (!managerId) return;
    if (managerId === membershipId) throw new Error('An employee cannot manage their own membership.');
    const manager = memberships.find((item) => item.membership_id === managerId && item.organization_id === organizationId);
    if (!manager || manager.status !== 'active') throw new Error('Manager must be an active membership in the same organization.');
  }

  private async revokeMembershipCredentials(membershipId: string): Promise<void> {
    const credentials = await this.credentials.read();
    const next = credentials.map((item) => item.membership_id === membershipId && ['active', 'suspended'].includes(item.status) ? { ...item, status: 'revoked' as const } : item);
    await this.credentials.write(next);
  }

  private async expireCredentials(): Promise<void> {
    const credentials = await this.credentials.read();
    const next = credentials.map((item) => item.status !== 'revoked' && new Date(item.expires_at).getTime() <= this.clock().getTime() ? { ...item, status: 'expired' as const } : item);
    if (next.some((item, index) => item.status !== credentials[index]?.status)) await this.credentials.write(next);
  }

  private async createSignedCredential(input: { organizationId: string; membershipId: string; roleIds: string[]; resourceConstraints: string[]; actionConstraints: string[]; approvalPolicyIds: string[]; issuedAt: string; expiresAt: string }): Promise<HumanAuthorityCredential> {
    const unsigned = {
      schema_version: V2_CONTRACT_VERSION,
      credential_id: `hac_${randomUUID()}`,
      organization_id: input.organizationId,
      membership_id: input.membershipId,
      role_ids: input.roleIds,
      resource_constraints: input.resourceConstraints,
      action_constraints: input.actionConstraints,
      approval_policy_ids: input.approvalPolicyIds,
      issued_at: input.issuedAt,
      expires_at: input.expiresAt,
      status: 'active' as const
    };
    return humanAuthorityCredentialSchema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), organization_signature: await this.sign(unsigned) });
  }

  private async sign(value: unknown): Promise<string> {
    const key = await this.signingKey.read();
    return `ed25519:${sign(null, Buffer.from(canonicalize(value), 'utf8'), key.private_key_pem).toString('base64')}`;
  }

  public async verifyCredential(credential: HumanAuthorityCredential): Promise<boolean> {
    const key = await this.signingKey.read();
    const unsigned = unsignedCredential(credential);
    if (hashCanonical(unsigned) !== credential.canonical_hash || !credential.organization_signature.startsWith('ed25519:')) return false;
    return verify(null, Buffer.from(canonicalize(unsigned), 'utf8'), key.public_key_pem, Buffer.from(credential.organization_signature.slice('ed25519:'.length), 'base64'));
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function unsignedCredential(credential: HumanAuthorityCredential): Omit<HumanAuthorityCredential, 'canonical_hash' | 'organization_signature'> {
  return {
    schema_version: credential.schema_version,
    credential_id: credential.credential_id,
    organization_id: credential.organization_id,
    membership_id: credential.membership_id,
    role_ids: credential.role_ids,
    resource_constraints: credential.resource_constraints,
    action_constraints: credential.action_constraints,
    approval_policy_ids: credential.approval_policy_ids,
    issued_at: credential.issued_at,
    expires_at: credential.expires_at,
    status: credential.status
  };
}

function matches(constraint: string, value: string): boolean {
  return constraint === '*' || constraint === value || (constraint.endsWith('*') && value.startsWith(constraint.slice(0, -1)));
}

function createSigningKey(): SigningKey {
  const pair = generateKeyPairSync('ed25519');
  return {
    algorithm: 'Ed25519',
    private_key_pem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    public_key_pem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}
