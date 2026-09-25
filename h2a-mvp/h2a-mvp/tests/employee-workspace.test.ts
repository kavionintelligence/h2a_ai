import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { employeeWorkspaceFixture } from './helpers/employeeWorkspaceFixture';
import { FirstAdministratorSetup } from '../packages/organization/src/firstAdministratorSetup';

const roots: string[] = [];
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'h2a-employee-access-')); roots.push(root); return employeeWorkspaceFixture(root); }
afterEach(async () => { for (const root of roots.splice(0)) if (resolve(root).startsWith(resolve(tmpdir()) + sep)) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

describe('Employee session and signed workspace boundary', () => {
  it('closes first-administrator enrollment and bootstrap on an existing organization', async () => {
    const f = await fixture();
    const setup = new FirstAdministratorSetup(f.identity, f.authority);
    expect(await setup.available()).toBe(false);
    await expect(setup.state()).rejects.toThrow('SETUP_CLOSED');
    await expect(setup.verify(1, f.verification(1, 'create local organization authority'))).rejects.toThrow('SETUP_CLOSED');
    await expect(setup.commit(1, { name: 'Replacement', department: 'Security', employee_id: 'TEST-1', proof_id: 'invented' })).rejects.toThrow('SETUP_CLOSED');
  });

  it('renews only an expired signed credential at the same scope, never a revoked credential', async () => {
    const f = await fixture();
    const original = (await f.authority.getState()).credentials.find(item => item.membership_id === 'member_1')!;
    f.advance(86401000);
    const logged = await f.login(1);
    expect(logged.session).toMatchObject({ administrator: false, renewal_credential_id: original.credential_id });
    await f.service.renewAdministrator(1, await f.proof(1, 'repair prerequisites for administrator console'));
    expect((await f.service.session(1)).administrator).toBe(true);
    const renewed = (await f.authority.getState()).credentials.find(item => item.membership_id === 'member_1' && item.status === 'active')!;
    expect(renewed.credential_id).not.toBe(original.credential_id);
    expect(renewed.role_ids).toEqual(original.role_ids);
    expect(renewed.resource_constraints).toEqual(original.resource_constraints);
    const proof = await f.proof(1, 'administer organization authority');
    await f.authority.updateCredential({ actor: { membership_id: 'member_1', human_proof_id: proof, authority_credential_id: renewed.credential_id }, credential_id: renewed.credential_id, action: 'revoke' });
    expect((await f.service.session(1)).renewal_credential_id).toBeUndefined();
    await expect(f.service.renewAdministrator(1, proof)).rejects.toThrow('EXPIRED_ADMINISTRATOR');
  });

  it('discards privileged responses that finish after logout', async () => {
    const f = await fixture(); await f.login(1);
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    let finish!: () => void; const waiting = new Promise<void>(resolve => { finish = resolve; });
    const command = f.service.administratorCommand(1, async () => { entered(); await waiting; return 'private result'; });
    await started; f.service.logout(1); finish();
    await expect(command).rejects.toThrow('SESSION_REQUIRED');
  });
  it('requires fresh sender-bound proof and never exposes other identities during login', async () => {
    const f = await fixture();
    await expect(f.service.snapshot(1)).rejects.toThrow('SESSION_REQUIRED');
    const challenge = await f.service.begin(1, 'human_1');
    const view = await f.service.identityForChallenge(1);
    expect(view.identities.map(item => item.human_id)).toEqual(['human_1']);
    expect(view.enrollments.every(item => item.human_id === 'human_1')).toBe(true);
    await expect(f.service.verifyChallenge(1, f.verification(2, challenge.purpose))).rejects.toThrow('SUBJECT_MISMATCH');
    const verified = await f.service.verifyChallenge(1, f.verification(1, challenge.purpose));
    const proofId = verified.active_proofs[0].human_proof_id;
    await expect(f.service.login(2, proofId)).rejects.toThrow('CHALLENGE_EXPIRED');
    expect((await f.service.login(1, proofId)).session.administrator).toBe(true);
    await expect(f.service.login(1, proofId)).rejects.toThrow('CHALLENGE_EXPIRED');
    f.service.logout(1);
    await expect(f.service.snapshot(1)).rejects.toThrow('SESSION_REQUIRED');
  });

  it('rejects forged proof bytes and an obsolete enrollment binding', async () => {
    const f = await fixture();
    const proofId = await f.proof(1, 'test signed resolution');
    expect((await f.identity.resolveVerifiedProof(proofId)).human_id).toBe('human_1');
    const path = join(f.root, 'human-proofs/proofs-v2.json');
    const original = await readFile(path, 'utf8');
    const forged = JSON.parse(original); forged.data.find((item: { human_proof_id: string }) => item.human_proof_id === proofId).purpose = 'forged purpose';
    await writeFile(path, JSON.stringify(forged));
    await expect(f.identity.resolveVerifiedProof(proofId)).rejects.toThrow('SIGNATURE_INVALID');
    await writeFile(path, original);
    const state = await f.identity.getState();
    await f.identity.updateEnrollment({ enrollment_id: state.identities.find(item => item.human_id === 'human_1')!.current_enrollment_id!, action: 'revoke' });
    await expect(f.identity.resolveVerifiedProof(proofId)).rejects.toThrow();
  });

  it('denies the legacy console to staff and invalidates sessions on expiry and enrollment revocation', async () => {
    const f = await fixture();
    expect((await f.login(3)).session).toMatchObject({ department: 'Finance', administrator: false });
    await expect(f.service.assertAdministrator(3)).rejects.toThrow('ADMINISTRATOR_CONSOLE_REQUIRED');
    await f.login(1);
    f.advance(301000);
    // Ordinary reads use the authenticated session; protected actions still require a new proof.
    expect((await f.service.snapshot(1)).session.human_id).toBe('human_1');
    const state = await f.identity.getState();
    await f.identity.updateEnrollment({ enrollment_id: state.identities[0].current_enrollment_id!, action: 'revoke' });
    await expect(f.service.snapshot(1)).rejects.toThrow('SESSION_REVOKED');
    f.advance(1800000);
    await expect(f.service.snapshot(3)).rejects.toThrow('SESSION_EXPIRED');
  });

  it('persists membership, denies nonmembers including administrators, and removes access immediately', async () => {
    const f = await fixture(); await f.login(1); await f.login(2); await f.login(3);
    let state = await f.service.mutate(1, { kind: 'create-room', title: 'Private technology room' });
    const roomId = state.rooms[0].room_id;
    expect(await f.service.lookupMember(1, 'TEST-2')).toEqual({ membership_id: 'member_2', display_name: 'Test Employee 2', department: 'Security' });
    await expect(f.service.lookupMember(1, 'UNKNOWN-EMPLOYEE')).rejects.toThrow('EMPLOYEE_UNAVAILABLE');
    expect((await f.service.snapshot(2)).rooms).toEqual([]);
    expect((await f.service.snapshot(2)).people).toEqual([]);
    expect((await f.service.snapshot(3)).rooms).toEqual([]);
    const proof_id = await f.proof(1, `change room membership ${roomId}`);
    state = await f.service.mutate(1, { kind: 'room-members', room_id: roomId, revision: 1, member_ids: ['member_1', 'member_2', 'member_3'], proof_id });
    expect((await f.service.snapshot(3)).rooms[0].room_id).toBe(roomId);
    expect((await f.service.snapshot(3)).people.map(person => person.display_name)).toEqual(['Test Employee 1', 'Test Employee 2', 'Test Employee 3']);
    await expect(f.service.mutate(3, { kind: 'room-members', room_id: roomId, revision: 2, member_ids: ['member_1', 'member_3'], proof_id })).rejects.toThrow('OWNER_REQUIRED');
    await f.service.mutate(1, { kind: 'room-members', room_id: roomId, revision: 2, member_ids: ['member_1', 'member_2'], proof_id });
    expect((await f.service.snapshot(3)).rooms).toEqual([]);
    const restarted = f.createService();
    await expect(restarted.snapshot(1)).rejects.toThrow('SESSION_REQUIRED');
    expect((await f.login(1, 1, restarted)).rooms[0]).toMatchObject({ room_id: roomId, revision: 3, member_ids: ['member_1', 'member_2'] });
  });

  it('persists only current project and mission links on an owned room', async () => {
    const f = await fixture(); await f.login(1); await f.login(3);
    let state = await f.service.mutate(1, { kind: 'create-room', title: 'Persistent delivery room' });
    const room = state.rooms[0];
    state = await f.service.mutate(1, { kind: 'room-links', room_id: room.room_id, revision: room.revision, project_ids: ['project_1'], goal_ids: ['goal_1', 'goal_2'] });
    expect(state.rooms[0]).toMatchObject({ project_ids: ['project_1'], goal_ids: ['goal_1', 'goal_2'], revision: 2 });
    await expect(f.service.mutate(1, { kind: 'room-links', room_id: room.room_id, revision: 2, project_ids: ['invented_project'], goal_ids: [] })).rejects.toThrow('ROOM_LINK_TARGET_UNAVAILABLE');
    await expect(f.service.mutate(3, { kind: 'room-links', room_id: room.room_id, revision: 2, project_ids: [], goal_ids: [] })).rejects.toThrow('ROOM_OWNER_REQUIRED');
    expect((await f.service.snapshot(1)).rooms[0].goal_ids).toEqual(['goal_1', 'goal_2']);
  });

  it('requires independent exact-content review and keeps drafts from other staff', async () => {
    const f = await fixture(); await f.login(1); await f.login(2); await f.login(3);
    let state = await f.service.mutate(1, { kind: 'create-room', title: 'Reviewed knowledge room' });
    const room_id = state.rooms[0].room_id;
    await f.service.mutate(1, { kind: 'room-members', room_id, revision: 1, member_ids: ['member_1', 'member_2', 'member_3'], proof_id: await f.proof(1, `change room membership ${room_id}`) });
    state = await f.service.mutate(1, { kind: 'draft-memory', room_id, title: 'Review checklist', body: 'Nonproduction test knowledge.' });
    const item = state.memory[0];
    expect((await f.service.snapshot(3)).memory).toEqual([]);
    const request = { kind: 'review-memory' as const, memory_id: item.memory_id, revision: 1, content_hash: item.content_hash, decision: 'published' as const };
    await expect(f.service.mutate(1, { ...request, proof_id: await f.proof(1, `review memory ${item.memory_id}`) })).rejects.toThrow('INDEPENDENT');
    const proof_id = await f.proof(2, `review memory ${item.memory_id}`);
    await expect(f.service.mutate(2, { ...request, content_hash: `sha256:${'0'.repeat(64)}`, proof_id })).rejects.toThrow('CONFLICT');
    await f.service.mutate(2, { ...request, proof_id });
    expect((await f.service.snapshot(3)).memory[0]).toMatchObject({ status: 'published', reviewer_membership_id: 'member_2' });
    await expect(f.service.mutate(2, { ...request, proof_id })).rejects.toThrow('REVISION_CONFLICT');
    await f.service.mutate(1, { kind: 'withdraw-memory', memory_id: item.memory_id, revision: 2 });
    expect((await f.service.snapshot(3)).memory).toEqual([]);
    expect(JSON.stringify(await f.ledger.list())).not.toContain('Nonproduction test knowledge.');
  });

  it('rejects tampered data and rollback to a correctly signed older revision', async () => {
    const f = await fixture(); await f.login(1);
    await f.service.mutate(1, { kind: 'create-room', title: 'First room' });
    const path = join(f.root, 'workspace/employee-workspace-v1.json');
    const first = await readFile(path, 'utf8');
    await f.service.mutate(1, { kind: 'create-room', title: 'Second room' });
    const latest = await readFile(path, 'utf8');
    await writeFile(path, first);
    await expect(f.service.snapshot(1)).rejects.toThrow('ROLLED_BACK');
    const tampered = JSON.parse(latest); tampered.data.data.rooms[0].member_ids.push('member_3');
    await writeFile(path, JSON.stringify(tampered));
    await expect(f.service.snapshot(1)).rejects.toThrow('SIGNATURE_INVALID');
  });
});
