import { z } from 'zod';

const id = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(4000);
const iso = z.string().datetime({ offset: true });
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const projectSignatureSchema = z.object({
  algorithm: z.literal('Ed25519'), signedBy: id, canonicalHash: hash, value: z.string().startsWith('ed25519:')
}).strict();
export type ProjectSignature = z.infer<typeof projectSignatureSchema>;

export const projectRegistrationSchema = z.object({
  project_id: id,
  display_name: z.string().trim().min(1).max(120),
  canonical_root: z.string().trim().min(1).max(1000),
  repository_mode: z.enum(['git', 'read-only-non-git']),
  git_common_dir: z.string().trim().min(1).max(1000).nullable(),
  base_branch: id.nullable(),
  base_revision: z.string().regex(/^[0-9a-f]{40}$/u).nullable(),
  protected_paths: z.array(z.string().trim().min(1).max(300)).max(100),
  allowed_commands: z.array(z.object({ command_id: id, executable: id, args: z.array(z.string().max(300)).max(40) }).strict()).max(30),
  network_hosts: z.array(z.string().trim().min(1).max(253)).max(100),
  fallback_limitations: z.array(z.string().trim().min(1).max(500)).max(20),
  registered_at: iso
}).strict();
export type ProjectRegistration = z.infer<typeof projectRegistrationSchema>;

export const projectGoalSchema = z.object({
  goal_id: id, project_id: id, objective: text,
  expected_outputs: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  created_by: id, trace_id: id, created_at: iso, signature: projectSignatureSchema
}).strict();
export type ProjectGoal = z.infer<typeof projectGoalSchema>;

export const projectAssignmentSchema = z.object({
  assignment_id: id, goal_id: id, project_id: id, title: z.string().trim().min(1).max(160), objective: text,
  output_contract: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  tool_contract: z.array(z.string().trim().min(1).max(120)).max(30),
  allowed_paths: z.array(z.string().trim().min(1).max(300)).max(100),
  network_hosts: z.array(z.string().trim().min(1).max(253)).max(100),
  validation_commands: z.array(id).max(30), depends_on: z.array(id).max(30),
  agent_id: id, passport_id: id, runtime_session_id: id, mandate_id: id,
  provider: z.enum(['claude-code', 'openai-codex', 'gemini-antigravity', 'custom-cli']),
  kind: z.enum(['edit', 'research', 'integration']),
  status: z.enum(['proposed', 'ready', 'working', 'blocked', 'review', 'approved', 'integrated', 'failed', 'cancelled', 'revoked']),
  reason_code: id.nullable(), created_at: iso, updated_at: iso, signature: projectSignatureSchema
}).strict();
export type ProjectAssignment = z.infer<typeof projectAssignmentSchema>;

export const worktreeLeaseSchema = z.object({
  lease_id: id, project_id: id, assignment_id: id, branch: id, worktree_path: z.string().trim().min(1).max(1000),
  base_revision: z.string().regex(/^[0-9a-f]{40}$/u), status: z.enum(['active', 'dirty', 'conflicted', 'failed', 'integrated', 'retained', 'cleaned']),
  changed_files: z.array(z.string().max(500)).max(2000), head_revision: z.string().regex(/^[0-9a-f]{40}$/u).nullable(),
  created_at: iso, updated_at: iso
}).strict();
export type WorktreeLease = z.infer<typeof worktreeLeaseSchema>;

export const researchSourceSchema = z.object({
  source_id: id, assignment_id: id, url: z.string().url(), host: id, retrieved_at: iso, content_hash: hash,
  classification: z.enum(['public', 'internal-approved']), title: z.string().trim().min(1).max(300), excerpt: z.string().max(2000),
  delivered_fields: z.array(z.enum(['url', 'title', 'excerpt', 'content_hash', 'retrieved_at', 'classification'])).min(1), signature: projectSignatureSchema
}).strict();
export type ResearchSource = z.infer<typeof researchSourceSchema>;

export const projectMailboxRecordSchema = z.object({
  message_id: id, project_id: id, goal_id: id, assignment_id: id, from_agent_id: id, to_assignment_id: id.nullable(),
  kind: z.enum(['question', 'proposal', 'dependency', 'source-package', 'completion', 'rejection']),
  subject: z.string().trim().min(1).max(200), body_hash: hash, references: z.array(id).max(100), created_at: iso, signature: projectSignatureSchema
}).strict();
export type ProjectMailboxRecord = z.infer<typeof projectMailboxRecordSchema>;

export const projectValidationReceiptSchema = z.object({
  receipt_id: id, project_id: id, assignment_id: id, command_id: id, started_at: iso, completed_at: iso,
  exit_code: z.number().int(), status: z.enum(['passed', 'failed', 'cancelled']), output_hash: hash, output_excerpt: z.string().max(2000), signature: projectSignatureSchema
}).strict();
export type ProjectValidationReceipt = z.infer<typeof projectValidationReceiptSchema>;

export const projectProviderRunSchema = z.object({
  run_id: id, project_id: id, assignment_id: id, provider: z.enum(['claude-code', 'openai-codex', 'gemini-antigravity', 'custom-cli']),
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled', 'revoked', 'interrupted']), prompt_hash: hash,
  output_hash: hash.nullable(), reason_code: id.nullable(), process_id: z.number().int().positive().nullable(),
  started_at: iso, completed_at: iso.nullable()
}).strict();
export type ProjectProviderRun = z.infer<typeof projectProviderRunSchema>;

export const projectReviewBundleSchema = z.object({
  review_bundle_id: id, project_id: id, goal_id: id, assignment_ids: z.array(id).min(1), effect_hash: hash,
  diff_hashes: z.array(z.object({ assignment_id: id, diff_hash: hash }).strict()).min(1),
  validation_receipt_ids: z.array(id), created_at: iso, signature: projectSignatureSchema
}).strict();
export type ProjectReviewBundle = z.infer<typeof projectReviewBundleSchema>;

export const projectIntegrationSchema = z.object({
  integration_id: id, project_id: id, goal_id: id, assignment_ids: z.array(id).min(1), approval_event_id: id,
  expected_effect_hash: hash, integrated_commit: z.string().regex(/^[0-9a-f]{40}$/u), status: z.literal('integrated'), integrated_at: iso,
  signature: projectSignatureSchema
}).strict();
export type ProjectIntegration = z.infer<typeof projectIntegrationSchema>;

export const projectDeliveryStateSchema = z.object({
  projects: z.array(projectRegistrationSchema), goals: z.array(projectGoalSchema), assignments: z.array(projectAssignmentSchema),
  worktrees: z.array(worktreeLeaseSchema), sources: z.array(researchSourceSchema), messages: z.array(projectMailboxRecordSchema),
  validations: z.array(projectValidationReceiptSchema), runs: z.array(projectProviderRunSchema), review_bundles: z.array(projectReviewBundleSchema).default([]), integrations: z.array(projectIntegrationSchema),
  trust_ceiling: z.literal('connected-observed')
}).strict();
export type ProjectDeliveryState = z.infer<typeof projectDeliveryStateSchema>;

export const registerProjectRequestSchema = z.object({
  display_name: z.string().trim().min(1).max(120), root_path: z.string().trim().min(1).max(1000), base_branch: id.optional(),
  protected_paths: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  allowed_commands: z.array(z.object({ command_id: id, executable: id, args: z.array(z.string().max(300)).max(40) }).strict()).max(30),
  network_hosts: z.array(z.string().trim().min(1).max(253)).max(100).default([])
}).strict();
export type RegisterProjectRequest = z.infer<typeof registerProjectRequestSchema>;

export const createProjectGoalRequestSchema = z.object({ project_id: id, objective: text, expected_outputs: z.array(z.string().trim().min(1).max(500)).min(1).max(30), created_by: id, trace_id: id }).strict();
export type CreateProjectGoalRequest = z.infer<typeof createProjectGoalRequestSchema>;

export const createProjectAssignmentRequestSchema = projectAssignmentSchema.omit({ assignment_id: true, status: true, reason_code: true, created_at: true, updated_at: true, signature: true }).strict();
export type CreateProjectAssignmentRequest = z.infer<typeof createProjectAssignmentRequestSchema>;

export const fetchResearchSourceRequestSchema = z.object({ assignment_id: id, url: z.string().url(), classification: z.enum(['public', 'internal-approved']).default('public') }).strict();
export type FetchResearchSourceRequest = z.infer<typeof fetchResearchSourceRequestSchema>;

export const runProjectValidationRequestSchema = z.object({ assignment_id: id, command_id: id }).strict();
export type RunProjectValidationRequest = z.infer<typeof runProjectValidationRequestSchema>;

export const integrateProjectRequestSchema = z.object({ goal_id: id, assignment_ids: z.array(id).min(1), approval_event_id: id, expected_effect_hash: hash }).strict();
export type IntegrateProjectRequest = z.infer<typeof integrateProjectRequestSchema>;

export const requestProjectIntegrationApprovalSchema = z.object({ goal_id: id, assignment_ids: z.array(id).min(1), approval_policy_id: id }).strict();
export type RequestProjectIntegrationApproval = z.infer<typeof requestProjectIntegrationApprovalSchema>;

export const runProjectAssignmentRequestSchema = z.object({ assignment_id: id }).strict();
export type RunProjectAssignmentRequest = z.infer<typeof runProjectAssignmentRequestSchema>;
export const cancelProjectRunRequestSchema = z.object({ run_id: id, reason: z.string().trim().min(2).max(500) }).strict();
export type CancelProjectRunRequest = z.infer<typeof cancelProjectRunRequestSchema>;
