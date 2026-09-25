import { z } from 'zod';
import type { EnrollHumanV2Request, HumanIdentityV2State, VerifyHumanV2Request } from './v2';

const id = z.string().trim().min(1).max(160);
const time = z.string().datetime({ offset: true });
export const workspaceRoomSchema = z.object({
  room_id: id, organization_id: id, title: z.string().trim().min(2).max(160),
  owner_membership_id: id, member_ids: z.array(id).min(1).max(100),
  project_ids: z.array(id).max(100).optional(), goal_ids: z.array(id).max(200).optional(),
  department: z.string().min(1).max(120), revision: z.number().int().positive(),
  created_at: time, updated_at: time
}).strict();
export type WorkspaceRoom = z.infer<typeof workspaceRoomSchema>;
export const reviewedMemorySchema = z.object({
  memory_id: id, room_id: id, organization_id: id, author_membership_id: id,
  title: z.string().trim().min(2).max(160), body: z.string().trim().min(1).max(12000),
  revision: z.number().int().positive(), content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  status: z.enum(['draft', 'published', 'rejected', 'withdrawn']),
  reviewer_membership_id: id.optional(), review_proof_id: id.optional(),
  created_at: time, updated_at: time
}).strict();
export type ReviewedMemory = z.infer<typeof reviewedMemorySchema>;
export interface EmployeeSession {
  human_id: string; membership_id: string; organization_id: string;
  display_name: string; department: string; administrator: boolean;
  expires_at: string; assurance: 'high' | 'substantial'; renewal_credential_id?: string;
}
export interface EmployeeWorkspaceSnapshot {
  revision: number; session: EmployeeSession; rooms: WorkspaceRoom[]; memory: ReviewedMemory[];
  people: Array<{ membership_id: string; display_name: string; department: string }>;
}
export interface EmployeeChallenge {
  human_id: string; display_name: string; purpose: string;
  expires_at: string; liveness_mode: 'required' | 'demo-bypass';
}
export const workspaceMutationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create-room'), title: z.string().trim().min(2).max(160) }).strict(),
  z.object({ kind: z.literal('room-members'), room_id: id, revision: z.number().int().positive(), member_ids: z.array(id).min(1).max(100), proof_id: id }).strict(),
  z.object({ kind: z.literal('room-links'), room_id: id, revision: z.number().int().positive(), project_ids: z.array(id).max(100), goal_ids: z.array(id).max(200) }).strict(),
  z.object({ kind: z.literal('draft-memory'), room_id: id, title: z.string().trim().min(2).max(160), body: z.string().trim().min(1).max(12000) }).strict(),
  z.object({ kind: z.literal('review-memory'), memory_id: id, revision: z.number().int().positive(), content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/), decision: z.enum(['published', 'rejected']), proof_id: id }).strict(),
  z.object({ kind: z.literal('withdraw-memory'), memory_id: id, revision: z.number().int().positive() }).strict()
]);
export type WorkspaceMutation = z.infer<typeof workspaceMutationSchema>;
export interface EmployeeWorkspaceApi {
  setupStatus(): Promise<{ available: boolean; liveness_mode: 'required' | 'demo-bypass' }>;
  setupIdentity(): Promise<HumanIdentityV2State>;
  setupEnroll(request: EnrollHumanV2Request): Promise<HumanIdentityV2State>;
  setupVerify(request: VerifyHumanV2Request): Promise<HumanIdentityV2State>;
  setupCommit(request: { name: string; employee_id: string; department: string; proof_id: string }): Promise<void>;
  begin(humanId: string): Promise<EmployeeChallenge>;
  identity(): Promise<HumanIdentityV2State>;
  verify(request: VerifyHumanV2Request): Promise<HumanIdentityV2State>;
  login(proofId: string): Promise<EmployeeWorkspaceSnapshot>;
  hasSession(): Promise<boolean>;
  snapshot(): Promise<EmployeeWorkspaceSnapshot>;
  lookupMember(employeeId: string): Promise<{ membership_id: string; display_name: string; department: string }>;
  challenge(purpose: string): Promise<EmployeeChallenge>;
  mutate(request: WorkspaceMutation): Promise<EmployeeWorkspaceSnapshot>;
  renewAdministrator(proofId: string): Promise<EmployeeWorkspaceSnapshot>;
  logout(): Promise<void>;
}
