import { z } from 'zod';
import { frameworkConnectorKindSchema } from './framework-connectors';
import { liveProviderIdSchema } from './live-runtime';

const id = z.string().trim().min(1).max(240);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const finalAcceptanceGateIdSchema = z.enum([
  'two-human-ceremony', 'organization-authority', 'workload-identity', 'shared-provider-task',
  'external-framework', 'context-minimization', 'authority-escalation', 'runtime-containment',
  'adversarial-controls', 'restart-recovery', 'evidence-reconstruction'
]);
export type FinalAcceptanceGateId = z.infer<typeof finalAcceptanceGateIdSchema>;

export const finalAcceptanceGateStatusSchema = z.enum(['passed', 'failed', 'pending', 'user-action-required']);
export type FinalAcceptanceGateStatus = z.infer<typeof finalAcceptanceGateStatusSchema>;

export const finalAcceptanceManifestSchema = z.object({
  schema_version: z.literal(2), manifest_id: id, session_id: id,
  trace_prefix: z.string().trim().min(3).max(100),
  required_providers: z.array(liveProviderIdSchema).length(3),
  accepted_frameworks: z.array(frameworkConnectorKindSchema).min(1),
  minimum_humans: z.literal(2), biometric_record_range: z.tuple([z.literal(20), z.literal(70)]),
  trust_ceiling: z.literal('connected-observed'), created_at: timestamp
}).strict();
export type FinalAcceptanceManifest = z.infer<typeof finalAcceptanceManifestSchema>;

export const finalAcceptanceGateSchema = z.object({
  gate_id: finalAcceptanceGateIdSchema, title: z.string().trim().min(2).max(160),
  status: finalAcceptanceGateStatusSchema, summary: z.string().trim().min(2).max(1000),
  evidence_refs: z.array(id).max(200), operator_action: z.string().trim().min(2).max(1000).optional()
}).strict();
export type FinalAcceptanceGate = z.infer<typeof finalAcceptanceGateSchema>;

export const finalAcceptanceAttackIdSchema = z.enum([
  'replay', 'forged-approval', 'over-broad-delegation', 'context-leakage', 'tamper', 'provider-failure'
]);
export type FinalAcceptanceAttackId = z.infer<typeof finalAcceptanceAttackIdSchema>;

export const finalAcceptanceAttackResultSchema = z.object({
  attack_id: finalAcceptanceAttackIdSchema,
  status: z.enum(['blocked', 'not-observed', 'control-failed']),
  reason_codes: z.array(id).max(50), evidence_refs: z.array(id).max(100)
}).strict();
export type FinalAcceptanceAttackResult = z.infer<typeof finalAcceptanceAttackResultSchema>;

export const finalAcceptanceStateSchema = z.object({
  schema_version: z.literal(2), generated_at: timestamp, manifest: finalAcceptanceManifestSchema,
  status: z.enum(['blocked', 'ready', 'passed', 'failed']), shared_trace_id: id.nullable(),
  completion: z.object({ passed: z.number().int().nonnegative(), total: z.number().int().positive() }).strict(),
  gates: z.array(finalAcceptanceGateSchema).length(11), attacks: z.array(finalAcceptanceAttackResultSchema).length(6),
  evidence_integrity: z.enum(['verified', 'warning', 'failed']),
  phase44_readiness: z.object({
    clean_session: z.boolean(),
    required_liveness_mode: z.boolean(),
    liveness_verified_human_ids: z.array(id).max(20),
    approval_withdrawal_evidence_ref: id.nullable(),
    project_integration_evidence_ref: id.nullable(),
    package_eligible: z.boolean()
  }).strict(),
  blockers: z.array(z.string().trim().min(2).max(1000)).max(50)
}).strict();
export type FinalAcceptanceState = z.infer<typeof finalAcceptanceStateSchema>;

export const finalAcceptancePackageSchema = z.object({
  schema_version: z.literal(3),
  kind: z.literal('h2a.final-acceptance.package'),
  export_id: id,
  created_at: timestamp,
  privacy_profile: z.literal('acceptance-minimized-v3'),
  source: z.object({ ledger_head_hash: sha256, ledger_record_count: z.number().int().positive() }).strict(),
  state: finalAcceptanceStateSchema,
  package_hash: sha256,
  signer: z.object({ algorithm: z.literal('Ed25519'), public_key_pem: z.string().includes('BEGIN PUBLIC KEY').max(4000), key_fingerprint: sha256 }).strict(),
  signature: z.string().regex(/^ed25519:[A-Za-z0-9+/]+={0,2}$/)
}).strict();
export type FinalAcceptancePackage = z.infer<typeof finalAcceptancePackageSchema>;

export const finalAcceptanceExportReceiptSchema = z.object({
  export_id: id, relative_path: z.string().trim().startsWith('exports/').max(300), created_at: timestamp,
  package_hash: sha256, status: z.enum(['blocked', 'ready', 'passed', 'failed']),
  passed_gates: z.number().int().nonnegative(), total_gates: z.number().int().positive(),
  signer_fingerprint: sha256,
  verifier_status: z.literal('verified')
}).strict();
export type FinalAcceptanceExportReceipt = z.infer<typeof finalAcceptanceExportReceiptSchema>;

export const verifyFinalAcceptancePackageRequestSchema = z.object({
  relative_path: z.string().trim().startsWith('exports/').endsWith('.json').max(300),
  operation_key: z.string().trim().min(1).max(240)
}).strict();
export type VerifyFinalAcceptancePackageRequest = z.infer<typeof verifyFinalAcceptancePackageRequestSchema>;

export const finalAcceptanceVerificationReceiptSchema = z.object({
  relative_path: z.string().trim().startsWith('exports/').endsWith('.json').max(300),
  package_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  status: z.literal('verified'),
  tamper_test: z.literal('rejected'),
  tamper_reason: z.string().trim().min(1).max(160),
  verification_evidence_ref: z.string().trim().min(1).max(240),
  tamper_evidence_ref: z.string().trim().min(1).max(240),
  verified_at: timestamp
}).strict();
export type FinalAcceptanceVerificationReceipt = z.infer<typeof finalAcceptanceVerificationReceiptSchema>;

export const phase44SessionReceiptSchema = z.object({
  session_id: z.string().regex(/^phase44-[0-9TZ-]+-[0-9a-f-]{36}$/),
  data_path: z.string().trim().min(1).max(1000),
  created_at: timestamp,
  liveness_mode: z.literal('required'),
  launch_command: z.string().trim().min(1).max(4000)
}).strict();
export type Phase44SessionReceipt = z.infer<typeof phase44SessionReceiptSchema>;
