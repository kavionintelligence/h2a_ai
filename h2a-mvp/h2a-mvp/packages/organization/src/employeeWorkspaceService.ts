import { randomUUID, verify } from 'node:crypto';
import { z } from 'zod';
import type { HumanIdentityV2State, HumanProofV2, OrganizationAuthorityState, RepairAuthorityCredentialRequest, VerifyHumanV2Request } from '@h2a/contracts';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import {
  reviewedMemorySchema, workspaceRoomSchema, workspaceMutationSchema,
  type EmployeeChallenge, type EmployeeSession, type EmployeeWorkspaceSnapshot,
  type WorkspaceMutation
} from '../../contracts/src/employeeWorkspace';

interface IdentityPort {
  getState(humanId?: string): Promise<HumanIdentityV2State>;
  verify(request: VerifyHumanV2Request): Promise<HumanIdentityV2State>;
  resolveVerifiedProof(proofId: string): Promise<HumanProofV2>;
}
interface AuthorityPort {
  getState(): Promise<OrganizationAuthorityState>;
  verifyCredential(credential: OrganizationAuthorityState['credentials'][number]): Promise<boolean>;
  signOrganizationRecord(value: unknown): Promise<{ canonicalHash: string; signature: string }>;
  getOrganizationPublicKey(): Promise<string>;
  repairCredentialExactScope(request: RepairAuthorityCredentialRequest): Promise<OrganizationAuthorityState>;
}
interface WorkspaceReferences { projectIds: string[]; goalIds: string[] }
const dataSchema = z.object({ revision: z.number().int().nonnegative(), rooms: z.array(workspaceRoomSchema).max(2000), memory: z.array(reviewedMemorySchema).max(10000) }).strict();
const signedSchema = z.object({ data: dataSchema, canonicalHash: z.string(), signature: z.string() }).strict();
type StoredSession = { humanId: string; membershipId: string; enrollmentId: string; enrollmentVersion: number; expiresAt: number; assurance: 'high' | 'substantial' };
type Challenge = EmployeeChallenge & { membership_id: string; organization_id: string; started_at: number; nonce: string; consumed: boolean };

// Sender keys are supplied by the Electron host, never by an IPC request body.
export class EmployeeWorkspaceService {
  private readonly sessions = new Map<number, StoredSession>();
  private readonly challenges = new Map<number, Challenge>();
  private readonly pendingLogins = new Set<number>();
  private readonly repository: VersionedJsonRepository<'h2a.employee-workspace.v1', z.infer<typeof signedSchema> | null>;
  private queue: Promise<unknown> = Promise.resolve();

  public constructor(dataPath: string, private readonly identity: IdentityPort, private readonly authority: AuthorityPort,
    private readonly evidence: EvidenceLedgerPort, private readonly liveness: () => Promise<'required' | 'demo-bypass'>,
    private readonly clock: () => Date = () => new Date(), private readonly workspaceReferences?: () => Promise<WorkspaceReferences>) {
    this.repository = new VersionedJsonRepository(new AtomicFileStore(dataPath), 'workspace/employee-workspace-v1.json', 'h2a.employee-workspace.v1', signedSchema.nullable(), { initialData: null, clock });
  }

  public async begin(sender: number, humanId: string): Promise<EmployeeChallenge> {
    const existing = this.challenges.get(sender);
    if (existing && this.clock().getTime() - existing.started_at < 2000) throw new Error('LOGIN_RETRY_TOO_SOON');
    const state = await this.identity.getState();
    const organization = await this.authority.getState();
    const matches = state.identities.filter(item => item.status === 'active' && (item.human_id === humanId || organization.memberships.some(member => member.human_id === item.human_id && member.employee_id === humanId && member.organization_id === item.organization_id)));
    const human = matches.length === 1 ? matches[0] : undefined;
    if (!human?.active_membership_id) throw new Error('EMPLOYEE_UNAVAILABLE: ask the administrator to enroll this employee.');
    const nonce = randomUUID();
    const purpose = `sign in to H2A workspace ${nonce}`;
    const now = this.clock().getTime();
    const challenge: Challenge = { human_id: human.human_id, display_name: human.display_name, membership_id: human.active_membership_id,
      organization_id: human.organization_id, purpose, nonce, started_at: now, consumed: false,
      expires_at: new Date(now + 300000).toISOString(), liveness_mode: await this.liveness() };
    this.challenges.set(sender, challenge);
    return this.publicChallenge(challenge);
  }

  public async challenge(sender: number, purpose: string): Promise<EmployeeChallenge> {
    const session = await this.session(sender);
    if (!/^(change room membership|review memory) [a-zA-Z0-9_-]+$/.test(purpose) && purpose !== 'repair prerequisites for administrator console') throw new Error('WORKSPACE_PURPOSE_NOT_ALLOWED');
    const challenge = await this.begin(sender, session.human_id);
    this.challenges.get(sender)!.purpose = purpose;
    return { ...challenge, purpose };
  }

  public async identityForChallenge(sender: number): Promise<HumanIdentityV2State> {
    const challenge = this.requireChallenge(sender);
    return this.scopedIdentity(await this.identity.getState(challenge.human_id), challenge.human_id);
  }

  public async verifyChallenge(sender: number, request: VerifyHumanV2Request): Promise<HumanIdentityV2State> {
    const challenge = this.requireChallenge(sender);
    if (request.human_id !== challenge.human_id || request.membership_id !== challenge.membership_id || request.organization_id !== challenge.organization_id || request.purpose !== challenge.purpose) throw new Error('CHALLENGE_SUBJECT_MISMATCH');
    if (challenge.consumed) throw new Error('CHALLENGE_ALREADY_USED');
    challenge.consumed = true;
    const result = await this.identity.verify({ ...request, nonce: challenge.nonce });
    return this.scopedIdentity(result, challenge.human_id);
  }

  public async login(sender: number, proofId: string): Promise<EmployeeWorkspaceSnapshot> {
    if (this.pendingLogins.has(sender)) throw new Error('LOGIN_IN_PROGRESS');
    this.pendingLogins.add(sender);
    try {
      const challenge = this.requireChallenge(sender);
      if (!challenge.purpose.startsWith('sign in to H2A workspace ') || !challenge.consumed) throw new Error('LOGIN_CHALLENGE_REQUIRED');
      const proof = await this.identity.resolveVerifiedProof(proofId);
      if (proof.human_id !== challenge.human_id || proof.membership_id !== challenge.membership_id || proof.organization_id !== challenge.organization_id || proof.purpose !== challenge.purpose || proof.nonce !== challenge.nonce || Date.parse(proof.verified_at) < challenge.started_at) throw new Error('LOGIN_PROOF_MISMATCH');
      const candidate: StoredSession = { humanId: proof.human_id, membershipId: proof.membership_id, enrollmentId: proof.enrollment_id,
        enrollmentVersion: proof.enrollment_version, expiresAt: this.clock().getTime() + 30 * 60000, assurance: proof.assurance_level };
      await this.resolve(candidate);
      await this.evidence.append({ trace_id: `tr_workspace_login_${randomUUID()}`, actor: { type: 'human', id: proof.human_id }, event_type: 'POLICY_ALLOWED', payload: { operation: 'workspace.session.start', membership_id: proof.membership_id, proof_id: proofId, assurance: proof.assurance_level } });
      if (this.challenges.get(sender) !== challenge) throw new Error('LOGIN_CHALLENGE_INVALIDATED');
      this.challenges.delete(sender);
      this.sessions.set(sender, candidate);
      return await this.snapshot(sender);
    } finally { this.pendingLogins.delete(sender); }
  }

  public logout(sender: number): void { this.sessions.delete(sender); this.challenges.delete(sender); }

  public hasSession(sender: number): boolean { return this.sessions.has(sender); }

  public async session(sender: number): Promise<EmployeeSession> {
    const stored = this.sessions.get(sender);
    if (!stored) throw new Error('EMPLOYEE_SESSION_REQUIRED');
    try { return await this.resolve(stored); }
    catch (error) { this.logout(sender); throw error; }
  }

  public async assertAdministrator(sender: number): Promise<void> {
    if (!(await this.session(sender)).administrator) throw new Error('ADMINISTRATOR_CONSOLE_REQUIRED');
    // The retained operator console has no tenant-filtered DTOs.
    if ((await this.authority.getState()).organizations.length !== 1) throw new Error('LEGACY_CONSOLE_REQUIRES_SINGLE_ORGANIZATION');
  }

  public async administratorCommand<T>(sender: number, operation: () => Promise<T> | T, channel = 'administrator-console'): Promise<T> {
    const lease = this.sessions.get(sender);
    let invoked = false;
    try {
      await this.assertAdministrator(sender);
      if (this.sessions.get(sender) !== lease) throw new Error('EMPLOYEE_SESSION_CHANGED');
      invoked = true;
      const result = await operation();
      await this.assertAdministrator(sender);
      if (this.sessions.get(sender) !== lease) throw new Error('EMPLOYEE_SESSION_CHANGED');
      return result;
    } catch (error) {
      await this.evidence.append({ trace_id: `tr_workspace_denial_${randomUUID()}`, actor: lease ? { type: 'human', id: lease.humanId } : { type: 'system', id: 'unauthenticated-workspace' }, event_type: 'POLICY_DENIED', payload: { operation: channel, boundary: 'administrator-console', reason_code: reasonCode(error), handler_invoked: invoked, decision_scope: invoked ? 'response-not-released-or-operation-failed' : 'command-not-invoked' } });
      throw error;
    }
  }

  public async renewAdministrator(sender: number, proofId: string): Promise<EmployeeWorkspaceSnapshot> {
    const session = await this.session(sender);
    if (!session.renewal_credential_id) throw new Error('EXPIRED_ADMINISTRATOR_CREDENTIAL_REQUIRED');
    const purpose = 'repair prerequisites for administrator console';
    await this.requirePurpose(session, proofId, purpose);
    const state = await this.authority.getState();
    const prior = state.credentials.find(item => item.credential_id === session.renewal_credential_id)!;
    await this.authority.repairCredentialExactScope({ organization_id: session.organization_id, membership_id: session.membership_id, human_proof_id: proofId,
      replaces_credential_id: prior.credential_id, proof_purpose: purpose, command_id: 'administrator-console',
      expires_at: new Date(this.clock().getTime() + Math.min(120 * 60000, Date.parse(prior.expires_at) - Date.parse(prior.issued_at))).toISOString() });
    return this.snapshot(sender);
  }

  public snapshot(sender: number): Promise<EmployeeWorkspaceSnapshot> {
    return this.queue.then(() => this.snapshotUnlocked(sender));
  }

  public async lookupMember(sender: number, employeeId: string): Promise<EmployeeWorkspaceSnapshot['people'][number]> {
    if (typeof employeeId !== 'string' || !employeeId.trim() || employeeId.length > 160) throw new Error('EMPLOYEE_ID_REQUIRED');
    const lease = this.sessions.get(sender);
    const session = await this.session(sender);
    const organization = await this.authority.getState();
    const matches = organization.memberships.filter(member => member.organization_id === session.organization_id && this.activeMember(member) && [member.employee_id, member.membership_id].includes(employeeId.trim()));
    if (matches.length !== 1) throw new Error('EMPLOYEE_UNAVAILABLE');
    const member = matches[0];
    const human = (await this.identity.getState(member.human_id)).identities.find(item => item.human_id === member.human_id && item.organization_id === session.organization_id && item.status === 'active');
    if (!human) throw new Error('EMPLOYEE_UNAVAILABLE');
    if (this.sessions.get(sender) !== lease) throw new Error('EMPLOYEE_SESSION_CHANGED');
    return { membership_id: member.membership_id, display_name: human.display_name, department: member.department };
  }

  private async snapshotUnlocked(sender: number): Promise<EmployeeWorkspaceSnapshot> {
    const lease = this.sessions.get(sender);
    const session = await this.session(sender);
    const data = await this.read();
    // Administrative command access does not implicitly disclose room content.
    const rooms = data.rooms.filter(room => room.organization_id === session.organization_id && room.member_ids.includes(session.membership_id));
    const memory = data.memory.filter(item => rooms.some(room => room.room_id === item.room_id) && (item.status === 'published' || item.author_membership_id === session.membership_id || session.administrator));
    const organization = await this.authority.getState();
    const identities = await this.identity.getState();
    const people = organization.memberships.filter(member => member.organization_id === session.organization_id && rooms.some(room => room.member_ids.includes(member.membership_id))).map(member => ({ membership_id: member.membership_id,
      display_name: identities.identities.find(human => human.human_id === member.human_id && human.organization_id === member.organization_id)?.display_name ?? member.employee_id, department: member.department }));
    if (this.sessions.get(sender) !== lease) throw new Error('EMPLOYEE_SESSION_CHANGED');
    return { revision: data.revision, session, rooms, memory, people };
  }

  public mutate(sender: number, request: WorkspaceMutation): Promise<EmployeeWorkspaceSnapshot> {
    const operation = this.queue.then(async () => {
      const input = workspaceMutationSchema.parse(request);
      const session = await this.session(sender);
      const data = await this.read();
      const now = this.clock().toISOString();
      let subject: string;
      let proofId: string | undefined;
      if (input.kind === 'create-room') {
        subject = `room_${randomUUID()}`;
        data.rooms.push({ room_id: subject, organization_id: session.organization_id, title: input.title,
          department: session.department, owner_membership_id: session.membership_id, member_ids: [session.membership_id], revision: 1, created_at: now, updated_at: now });
      } else if (input.kind === 'room-members') {
        const room = data.rooms.find(item => item.room_id === input.room_id && item.organization_id === session.organization_id && item.member_ids.includes(session.membership_id));
        if (!room || (!session.administrator && room.owner_membership_id !== session.membership_id)) throw new Error('ROOM_OWNER_REQUIRED');
        if (room.revision !== input.revision) throw new Error('ROOM_REVISION_CONFLICT');
        await this.requirePurpose(session, input.proof_id, `change room membership ${room.room_id}`);
        const members = new Set(input.member_ids);
        if (members.size !== input.member_ids.length || !members.has(room.owner_membership_id)) throw new Error('ROOM_OWNER_AND_UNIQUE_MEMBERS_REQUIRED');
        const organization = await this.authority.getState();
        if (![...members].every(id => organization.memberships.some(member => member.membership_id === id && member.organization_id === session.organization_id && this.activeMember(member)))) throw new Error('ROOM_MEMBER_UNAVAILABLE');
        room.member_ids = [...members]; room.revision++; room.updated_at = now;
        subject = room.room_id; proofId = input.proof_id;
      } else if (input.kind === 'room-links') {
        const room = data.rooms.find(item => item.room_id === input.room_id && item.organization_id === session.organization_id && item.member_ids.includes(session.membership_id));
        if (!room || (!session.administrator && room.owner_membership_id !== session.membership_id)) throw new Error('ROOM_OWNER_REQUIRED');
        if (room.revision !== input.revision) throw new Error('ROOM_REVISION_CONFLICT');
        const available = await this.workspaceReferences?.();
        if (!available || !input.project_ids.every(id => available.projectIds.includes(id)) || !input.goal_ids.every(id => available.goalIds.includes(id))) throw new Error('ROOM_LINK_TARGET_UNAVAILABLE');
        room.project_ids = [...new Set(input.project_ids)]; room.goal_ids = [...new Set(input.goal_ids)]; room.revision++; room.updated_at = now;
        subject = room.room_id;
      } else if (input.kind === 'draft-memory') {
        const room = data.rooms.find(item => item.room_id === input.room_id && item.organization_id === session.organization_id && item.member_ids.includes(session.membership_id));
        if (!room) throw new Error('ROOM_ACCESS_DENIED');
        subject = `memory_${randomUUID()}`;
        data.memory.push({ memory_id: subject, room_id: room.room_id, organization_id: session.organization_id, author_membership_id: session.membership_id,
          title: input.title, body: input.body, revision: 1, content_hash: hashCanonical({ title: input.title, body: input.body }), status: 'draft', created_at: now, updated_at: now });
      } else {
        const item = data.memory.find(item => item.memory_id === input.memory_id && item.organization_id === session.organization_id);
        if (!item || !data.rooms.some(room => room.room_id === item.room_id && room.member_ids.includes(session.membership_id))) throw new Error('MEMORY_ACCESS_DENIED');
        if (item.revision !== input.revision) throw new Error('MEMORY_REVISION_CONFLICT');
        if (input.kind === 'review-memory') {
          if (!session.administrator || item.author_membership_id === session.membership_id) throw new Error('INDEPENDENT_MEMORY_REVIEWER_REQUIRED');
          if (item.status !== 'draft' || item.content_hash !== input.content_hash) throw new Error('MEMORY_REVIEW_CONFLICT');
          await this.requirePurpose(session, input.proof_id, `review memory ${item.memory_id}`);
          item.status = input.decision; item.reviewer_membership_id = session.membership_id; item.review_proof_id = input.proof_id; proofId = input.proof_id;
        } else {
          if (item.author_membership_id !== session.membership_id && !session.administrator) throw new Error('MEMORY_WITHDRAWAL_DENIED');
          if (item.status === 'withdrawn') throw new Error('MEMORY_ALREADY_WITHDRAWN');
          item.status = 'withdrawn';
        }
        item.revision++; item.updated_at = now; subject = item.memory_id;
      }
      data.revision++;
      const signed = { data: dataSchema.parse(data), ...await this.authority.signOrganizationRecord(data) };
      // Receipt precedes commit; a receipt describes the authorized proposal, never a fabricated completion.
      await this.evidence.append({ trace_id: `tr_workspace_${subject}`, actor: { type: 'human', id: session.human_id }, subject: { type: 'resource', id: subject }, event_type: 'POLICY_ALLOWED', payload: { operation: input.kind, stage: 'authorized-proposal', membership_id: session.membership_id, revision: data.revision, state_hash: signed.canonicalHash, ...(proofId ? { proof_id: proofId } : {}) } });
      await this.session(sender);
      await this.repository.write(signed);
      await this.evidence.append({ trace_id: `tr_workspace_${subject}`, actor: { type: 'human', id: session.human_id }, subject: { type: 'resource', id: subject }, event_type: 'ACTION_EXECUTED', payload: { operation: 'workspace.commit', mutation: input.kind, revision: data.revision, state_hash: signed.canonicalHash } });
      return this.snapshotUnlocked(sender);
    });
    const audited = operation.catch(async error => {
      const session = this.sessions.get(sender);
      await this.evidence.append({ trace_id: `tr_workspace_denial_${randomUUID()}`, actor: session ? { type: 'human', id: session.humanId } : { type: 'system', id: 'unauthenticated-workspace' }, event_type: 'POLICY_DENIED', payload: { operation: 'workspace.mutation', reason_code: reasonCode(error), decision_scope: 'command-failed-no-success-response' } });
      throw error;
    });
    this.queue = audited.catch(() => undefined);
    return audited;
  }

  private async requirePurpose(session: EmployeeSession, proofId: string, purpose: string): Promise<void> {
    const proof = await this.identity.resolveVerifiedProof(proofId);
    if (proof.human_id !== session.human_id || proof.membership_id !== session.membership_id || proof.organization_id !== session.organization_id || proof.purpose !== purpose) throw new Error('EXACT_EMPLOYEE_PROOF_REQUIRED');
  }

  private activeMember(member: OrganizationAuthorityState['memberships'][number]): boolean {
    const now = this.clock().getTime();
    return member.status === 'active' && Date.parse(member.effective_from) <= now && (!member.effective_until || Date.parse(member.effective_until) > now);
  }

  private async resolve(stored: StoredSession): Promise<EmployeeSession> {
    if (stored.expiresAt <= this.clock().getTime()) throw new Error('EMPLOYEE_SESSION_EXPIRED');
    const identity = await this.identity.getState(stored.humanId);
    const human = identity.identities.find(item => item.human_id === stored.humanId && item.status === 'active' && item.active_membership_id === stored.membershipId && item.current_enrollment_id === stored.enrollmentId);
    const enrollment = identity.enrollments.find(item => item.enrollment_id === stored.enrollmentId && item.status === 'active' && item.version === stored.enrollmentVersion);
    const organization = await this.authority.getState();
    const member = organization.memberships.find(item => item.membership_id === stored.membershipId && item.human_id === stored.humanId && item.organization_id === human?.organization_id && this.activeMember(item));
    if (!human || !enrollment || !member || !organization.organizations.some(item => item.organization_id === member.organization_id && item.status === 'active')) throw new Error('EMPLOYEE_SESSION_REVOKED');
    let administrator = false;
    const now = this.clock().getTime();
    for (const credential of organization.credentials.filter(item => item.membership_id === member.membership_id && item.organization_id === member.organization_id && item.status === 'active' && Date.parse(item.issued_at) <= now && Date.parse(item.expires_at) > now)) {
      if (!await this.authority.verifyCredential(credential)) continue;
      const roleAllowed = organization.roles.some(role => member.role_ids.includes(role.role_id) && credential.role_ids.includes(role.role_id) && role.organization_id === member.organization_id && role.status === 'active' && role.authority_scopes.some(scope => scope.resource === 'organization' && scope.actions.includes('manage')));
      if (roleAllowed && (!credential.resource_constraints.length || credential.resource_constraints.includes('organization')) && (!credential.action_constraints.length || credential.action_constraints.includes('manage'))) administrator = true;
    }
    const latest = organization.credentials.filter(item => item.membership_id === member.membership_id && item.organization_id === member.organization_id).sort((a, b) => Date.parse(b.issued_at) - Date.parse(a.issued_at))[0];
    const renewable = !administrator && latest?.status === 'expired' && latest.role_ids.includes('role_authority_admin') && latest.role_ids.every(id => member.role_ids.includes(id) && organization.roles.some(role => role.role_id === id && role.organization_id === member.organization_id && role.status === 'active')) && await this.authority.verifyCredential({ ...latest, status: 'active' });
    return { human_id: human.human_id, membership_id: member.membership_id, organization_id: member.organization_id, display_name: human.display_name,
      department: member.department, administrator, expires_at: new Date(stored.expiresAt).toISOString(), assurance: stored.assurance, ...(renewable ? { renewal_credential_id: latest.credential_id } : {}) };
  }

  private async read(): Promise<z.infer<typeof dataSchema>> {
    const stored = await this.repository.read();
    if ((await this.evidence.verify()).status !== 'verified') throw new Error('WORKSPACE_LEDGER_INVALID');
    const committed = (await this.evidence.list()).filter(event => event.event_type === 'ACTION_EXECUTED' && event.payload.operation === 'workspace.commit').at(-1);
    if (!stored) {
      if (committed) throw new Error('WORKSPACE_ROLLBACK_DETECTED');
      return { revision: 0, rooms: [], memory: [] };
    }
    if (!committed || committed.payload.state_hash !== stored.canonicalHash || committed.payload.revision !== stored.data.revision) throw new Error('WORKSPACE_COMMIT_INCOMPLETE_OR_ROLLED_BACK');
    if (hashCanonical(stored.data) !== stored.canonicalHash || !stored.signature.startsWith('ed25519:') || !verify(null, Buffer.from(canonicalize(stored.data)), await this.authority.getOrganizationPublicKey(), Buffer.from(stored.signature.slice(8), 'base64'))) throw new Error('WORKSPACE_SIGNATURE_INVALID');
    for (const item of stored.data.memory) if (hashCanonical({ title: item.title, body: item.body }) !== item.content_hash) throw new Error('MEMORY_CONTENT_HASH_INVALID');
    return stored.data;
  }

  private requireChallenge(sender: number): Challenge {
    const challenge = this.challenges.get(sender);
    if (!challenge || Date.parse(challenge.expires_at) <= this.clock().getTime()) throw new Error('EMPLOYEE_CHALLENGE_EXPIRED');
    return challenge;
  }
  private publicChallenge(value: Challenge): EmployeeChallenge { return { human_id: value.human_id, display_name: value.display_name, purpose: value.purpose, expires_at: value.expires_at, liveness_mode: value.liveness_mode }; }
  private scopedIdentity(state: HumanIdentityV2State, humanId: string): HumanIdentityV2State {
    return { ...state, identities: state.identities.filter(item => item.human_id === humanId), enrollments: state.enrollments.filter(item => item.human_id === humanId), active_proofs: state.active_proofs.filter(item => item.human_id === humanId), selected_human_id: humanId, last_result: state.last_result?.human_id === humanId ? state.last_result : null };
  }
}

function reasonCode(error: unknown): string {
  return error instanceof Error ? error.message.match(/^([A-Z][A-Z0-9_]{1,80})(?=:|$)/)?.[1] ?? 'WORKSPACE_OPERATION_FAILED' : 'WORKSPACE_OPERATION_FAILED';
}
