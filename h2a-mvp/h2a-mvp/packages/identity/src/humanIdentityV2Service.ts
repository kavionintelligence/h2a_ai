import { generateKeyPairSync, randomUUID, sign as signBytes, verify as verifyBytes } from 'node:crypto';
import { z } from 'zod';
import {
  V2_CONTRACT_VERSION,
  activeBiometricModelSet,
  biometricEnrollmentLifecycleRequestSchema,
  biometricEnrollmentV2Schema,
  enrollHumanV2RequestSchema,
  humanIdentitySchema,
  humanIdentityV2Schema,
  humanIdentityV2MigrationRequestSchema,
  humanIdentityV2MigrationResultSchema,
  humanIdentityV2StateSchema,
  humanProofV2Schema,
  biometricEnrollmentSchema,
  v2MigrationReceiptSchema,
  verifyHumanV2RequestSchema,
  type BiometricEnrollmentLifecycleRequest,
  type BiometricEnrollmentV2,
  type BiometricTokenSetPolicy,
  type EnrollHumanV2Request,
  type HumanIdentityV2,
  type HumanIdentityV2MigrationRequest,
  type HumanIdentityV2MigrationResult,
  type HumanIdentityV2State,
  type HumanProofV2,
  type V2MigrationReceipt,
  type VerifyHumanV2Request
} from '@h2a/contracts';
import {
  BchFuzzyExtractor,
  type BchFuzzyExtractorPort
} from '@h2a/biometrics';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const secretRecordSchema = z.object({
  record_id: z.string().min(1),
  helper: z.string().min(1),
  token: z.string().min(1),
  k2: z.string().min(1)
}).strict();

const protectedTokenSetSchema = z.object({
  enrollment_id: z.string().min(1),
  organization_id: z.string().min(1),
  human_id: z.string().min(1),
  version: z.number().int().positive(),
  salt: z.string().min(1),
  records: z.array(secretRecordSchema).min(20).max(70),
  sample_hashes: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/)).min(20).max(70),
  status: z.enum(['active', 'revoked']),
  created_at: z.string().datetime({ offset: true })
}).strict();
type ProtectedTokenSet = z.infer<typeof protectedTokenSetSchema>;

const verificationAttemptV2Schema = z.object({
  attempt_id: z.string().min(1),
  organization_id: z.string().min(1),
  human_id: z.string().min(1),
  enrollment_id: z.string().min(1).optional(),
  purpose: z.string().min(2),
  nonce: z.string().min(1),
  decision: z.enum(['verified', 'rejected']),
  reason_code: z.string().min(1).optional(),
  matched_record_count: z.number().int().nonnegative(),
  attempted_at: z.string().datetime({ offset: true }),
  evidence_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/)
}).strict();
type VerificationAttemptV2 = z.infer<typeof verificationAttemptV2Schema>;

const signingKeySchema = z.object({
  algorithm: z.literal('Ed25519'),
  private_key_pem: z.string().startsWith('-----BEGIN PRIVATE KEY-----'),
  public_key_pem: z.string().startsWith('-----BEGIN PUBLIC KEY-----')
}).strict();
type SigningKey = z.infer<typeof signingKeySchema>;

const securityStateV2Schema = z.object({
  organization_id: z.string().min(1),
  human_id: z.string().min(1),
  failed_attempts: z.number().int().nonnegative(),
  locked_until: z.string().datetime({ offset: true }).nullable()
}).strict();
type SecurityStateV2 = z.infer<typeof securityStateV2Schema>;
type LivenessMode = 'required' | 'demo-bypass';

const MAX_FAILURES = 3;
const LOCKOUT_MS = 60_000;

export class HumanIdentityV2Service {
  private readonly identities: VersionedJsonRepository<'h2a.v2.human-identities', HumanIdentityV2[]>;
  private readonly enrollments: VersionedJsonRepository<'h2a.v2.biometric-enrollments', BiometricEnrollmentV2[]>;
  private readonly tokenSets: VersionedJsonRepository<'h2a.v2.protected-token-sets', ProtectedTokenSet[]>;
  private readonly proofs: VersionedJsonRepository<'h2a.v2.human-proofs', HumanProofV2[]>;
  private readonly attempts: VersionedJsonRepository<'h2a.v2.verification-attempts', VerificationAttemptV2[]>;
  private readonly security: VersionedJsonRepository<'h2a.v2.human-proof-security', SecurityStateV2[]>;
  private readonly migrationReceipts: VersionedJsonRepository<'h2a.v2.human-identity-migration-receipts', V2MigrationReceipt[]>;
  private readonly signingKey: VersionedJsonRepository<'h2a.v2.organization-signing-key', SigningKey>;
  private readonly store: AtomicFileStore;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly bch: BchFuzzyExtractorPort = new BchFuzzyExtractor(),
    private readonly clock: () => Date = () => new Date(),
    private readonly livenessMode: () => Promise<LivenessMode> = async () => 'required'
  ) {
    const store = new AtomicFileStore(dataPath);
    this.store = store;
    const options = { clock: this.clock };
    this.identities = new VersionedJsonRepository(store, 'humans/identities-v2.json', 'h2a.v2.human-identities', z.array(humanIdentityV2Schema), { ...options, initialData: [] });
    this.enrollments = new VersionedJsonRepository(store, 'biometric-enrollments/enrollments-v2.json', 'h2a.v2.biometric-enrollments', z.array(biometricEnrollmentV2Schema), { ...options, initialData: [] });
    this.tokenSets = new VersionedJsonRepository(store, 'biometric-secrets/token-sets-v2.json', 'h2a.v2.protected-token-sets', z.array(protectedTokenSetSchema), { ...options, initialData: [] });
    this.proofs = new VersionedJsonRepository(store, 'human-proofs/proofs-v2.json', 'h2a.v2.human-proofs', z.array(humanProofV2Schema), { ...options, initialData: [] });
    this.attempts = new VersionedJsonRepository(store, 'human-proof-attempts/attempts-v2.json', 'h2a.v2.verification-attempts', z.array(verificationAttemptV2Schema), { ...options, initialData: [] });
    this.security = new VersionedJsonRepository(store, 'human-proof-attempts/security-v2.json', 'h2a.v2.human-proof-security', z.array(securityStateV2Schema), { ...options, initialData: [] });
    this.migrationReceipts = new VersionedJsonRepository(store, 'migrations/v2-human-identity-receipts.json', 'h2a.v2.human-identity-migration-receipts', z.array(v2MigrationReceiptSchema), { ...options, initialData: [] });
    this.signingKey = new VersionedJsonRepository(store, 'settings/organization-signing-key-v2.json', 'h2a.v2.organization-signing-key', signingKeySchema, { ...options, initialData: createSigningKey() });
  }

  public async initialize(): Promise<void> {
    await Promise.all([
      this.identities.read(), this.enrollments.read(), this.tokenSets.read(),
      this.proofs.read(), this.attempts.read(), this.security.read(), this.migrationReceipts.read(), this.signingKey.read()
    ]);
  }

  public getState(selectedHumanId?: string): Promise<HumanIdentityV2State> {
    return this.runExclusive(() => this.getStateUnlocked(selectedHumanId));
  }

  public enroll(request: EnrollHumanV2Request): Promise<HumanIdentityV2State> {
    return this.runExclusive(async () => {
      const input = enrollHumanV2RequestSchema.parse(request);
      const livenessMode = await this.livenessMode();
      assertCaptureSet(input, livenessMode === 'required');
      const sampleHashes = input.captures.map((capture) => hashCanonical(capture.sample));
      if (new Set(sampleHashes).size !== sampleHashes.length) {
        throw new Error('Enrollment captures must be distinct; duplicate biometric samples were rejected.');
      }

      const existingEnrollments = await this.enrollments.read();
      const prior = existingEnrollments
        .filter((item) => item.organization_id === input.organization_id && item.human_id === input.human_id)
        .sort((left, right) => right.version - left.version)[0];
      const version = (prior?.version ?? 0) + 1;
      const enrollmentId = `ben2_${randomUUID()}`;
      const now = this.clock().toISOString();
      const registered = await this.bch.register(input.captures.map((capture) => capture.sample));
      const protectedRecords = registered.records.map((record, index) => ({ ...record, record_id: `${enrollmentId}_${index + 1}` }));
      const tokenSet: ProtectedTokenSet = protectedTokenSetSchema.parse({
        enrollment_id: enrollmentId,
        organization_id: input.organization_id,
        human_id: input.human_id,
        version,
        salt: registered.salt,
        records: protectedRecords,
        sample_hashes: sampleHashes,
        status: 'active',
        created_at: now
      });
      const unsignedEnrollment = {
        schema_version: V2_CONTRACT_VERSION,
        enrollment_id: enrollmentId,
        organization_id: input.organization_id,
        human_id: input.human_id,
        version,
        provider: 'local-face-bch' as const,
        modality: 'face' as const,
        model_set_hash: hashCanonical(activeBiometricModelSet),
        policy: input.policy,
        protected_record_refs: protectedRecords.map((record) => `trusted:${enrollmentId}:${record.record_id}`),
        public_record_hashes: protectedRecords.map((record) => hashCanonical(record)),
        status: 'active' as const,
        created_at: now,
        rotated_from_enrollment_id: prior?.enrollment_id
      };
      const enrollment = biometricEnrollmentV2Schema.parse({
        ...unsignedEnrollment,
        canonical_hash: hashCanonical(unsignedEnrollment),
        organization_signature: await this.sign(unsignedEnrollment)
      });

      const retiredEnrollments = existingEnrollments.map((item) =>
        item.organization_id === input.organization_id && item.human_id === input.human_id && item.status === 'active'
          ? { ...item, status: 'revoked' as const }
          : item);
      const tokenSets = (await this.tokenSets.read()).map((item) =>
        item.organization_id === input.organization_id && item.human_id === input.human_id && item.status === 'active'
          ? { ...item, status: 'revoked' as const }
          : item);
      const identities = await this.identities.read();
      const existingIdentity = identities.find((item) => item.organization_id === input.organization_id && item.human_id === input.human_id);
      const identity = humanIdentityV2Schema.parse({
        schema_version: V2_CONTRACT_VERSION,
        human_id: input.human_id,
        organization_id: input.organization_id,
        display_name: input.display_name,
        status: 'active',
        active_membership_id: input.membership_id,
        current_enrollment_id: enrollmentId,
        created_at: existingIdentity?.created_at ?? now,
        updated_at: now
      });

      await this.tokenSets.write([...tokenSets, tokenSet]);
      await this.enrollments.write([...retiredEnrollments, enrollment]);
      await this.identities.write([...identities.filter((item) => !(item.organization_id === input.organization_id && item.human_id === input.human_id)), identity]);
      await this.replaceSecurity({ organization_id: input.organization_id, human_id: input.human_id, failed_attempts: 0, locked_until: null });
      await this.evidence.append({
        trace_id: `tr_v2_enroll_${enrollmentId}`,
        actor: { type: 'human', id: input.human_id },
        subject: { type: 'human_proof', id: enrollmentId },
        event_type: prior ? 'BIOMETRIC_ENROLLMENT_ROTATED_V2' : 'BIOMETRIC_ENROLLED_V2',
        payload: {
          organization_id: input.organization_id,
          enrollment_version: version,
          token_set_size: input.policy.token_set_size,
          policy_id: input.policy.policy_id,
          liveness_mode: livenessMode,
          enrollment_hash: enrollment.canonical_hash
        }
      });
      return this.getStateUnlocked(input.human_id);
    });
  }

  public verify(request: VerifyHumanV2Request): Promise<HumanIdentityV2State> {
    return this.runExclusive(async () => {
      const input = verifyHumanV2RequestSchema.parse(request);
      const livenessMode = await this.livenessMode();
      const attempts = await this.attempts.read();
      if (attempts.some((attempt) => attempt.organization_id === input.organization_id && attempt.nonce === input.nonce)) {
        return this.reject(input, 'NONCE_REPLAY', 0);
      }
      const security = await this.getSecurity(input.organization_id, input.human_id);
      if (security.locked_until && new Date(security.locked_until).getTime() > this.clock().getTime()) {
        return this.reject(input, 'LOCKED_OUT', 0);
      }
      if (security.locked_until) {
        await this.replaceSecurity({ ...security, failed_attempts: 0, locked_until: null });
        await this.setIdentityStatus(input.organization_id, input.human_id, 'active');
      }
      const identity = (await this.identities.read()).find((item) => item.organization_id === input.organization_id && item.human_id === input.human_id);
      if (!identity || identity.status !== 'active') return this.reject(input, 'IDENTITY_UNAVAILABLE', 0);
      if (identity.active_membership_id !== input.membership_id) return this.reject(input, 'MEMBERSHIP_MISMATCH', 0);
      const enrollment = (await this.enrollments.read()).find((item) => item.enrollment_id === identity.current_enrollment_id && item.status === 'active');
      const tokenSet = (await this.tokenSets.read()).find((item) => item.enrollment_id === enrollment?.enrollment_id && item.status === 'active');
      if (!enrollment || !tokenSet) return this.reject(input, 'NO_ACTIVE_ENROLLMENT', 0);
      if (!capturePassesPolicy(input.capture.assessment, enrollment.policy, livenessMode === 'required')) return this.reject(input, 'CAPTURE_POLICY_FAILED', 0, enrollment.enrollment_id, true);

      const matches = await this.bch.verify(input.capture.sample, { salt: tokenSet.salt, records: tokenSet.records });
      const matchedCount = matches.filter((match) => match.matched).length;
      if (matchedCount < enrollment.policy.required_matches) {
        return this.reject(input, 'BIOMETRIC_MISMATCH', matchedCount, enrollment.enrollment_id, true);
      }

      await this.replaceSecurity({ organization_id: input.organization_id, human_id: input.human_id, failed_attempts: 0, locked_until: null });
      await this.setIdentityStatus(input.organization_id, input.human_id, 'active');
      const now = this.clock();
      const attempt = await this.recordAttempt(input, 'verified', matchedCount, undefined, enrollment.enrollment_id);
      const unsignedProof = {
        schema_version: V2_CONTRACT_VERSION,
        human_proof_id: `hp2_${randomUUID()}`,
        human_id: input.human_id,
        organization_id: input.organization_id,
        membership_id: input.membership_id,
        enrollment_id: enrollment.enrollment_id,
        enrollment_version: enrollment.version,
        policy_hash: hashCanonical(enrollment.policy),
        purpose: input.purpose,
        nonce: input.nonce,
        assurance_level: livenessMode === 'required' ? 'high' as const : 'substantial' as const,
        verification_methods: livenessMode === 'required' ? ['face', 'liveness', 'distance', 'bch'] as const : ['face', 'distance', 'bch'] as const,
        matched_record_count: matchedCount,
        verified_at: now.toISOString(),
        expires_at: new Date(now.getTime() + enrollment.policy.proof_ttl_seconds * 1000).toISOString(),
        provider_attestation_hash: attempt.evidence_hash
      };
      const proof = humanProofV2Schema.parse({
        ...unsignedProof,
        canonical_hash: hashCanonical(unsignedProof),
        organization_signature: await this.sign(unsignedProof)
      });
      const proofs = await this.proofs.read();
      await this.proofs.write([...proofs.filter((item) => !(item.organization_id === input.organization_id && item.human_id === input.human_id)), proof]);
      await this.evidence.append({
        trace_id: `tr_v2_proof_${attempt.attempt_id}`,
        actor: { type: 'human', id: input.human_id },
        subject: { type: 'human_proof', id: proof.human_proof_id },
        event_type: 'HUMAN_VERIFIED_V2',
        payload: {
          organization_id: input.organization_id,
          membership_id: input.membership_id,
          enrollment_id: enrollment.enrollment_id,
          enrollment_version: enrollment.version,
          purpose: input.purpose,
          nonce_hash: hashCanonical(input.nonce),
          matched_record_count: matchedCount,
          liveness_mode: livenessMode,
          assurance_level: proof.assurance_level,
          verification_methods: proof.verification_methods,
          proof_hash: proof.canonical_hash,
          expires_at: proof.expires_at
        }
      });
      return this.getStateUnlocked(input.human_id);
    });
  }

  public resolveVerifiedProof(proofId: string): Promise<HumanProofV2> {
    return this.runExclusive(async () => {
      const proof = (await this.proofs.read()).find(item => item.human_proof_id === proofId);
      if (!proof || Date.parse(proof.expires_at) <= this.clock().getTime() || Date.parse(proof.verified_at) > this.clock().getTime()) throw new Error('FRESH_SIGNED_HUMAN_PROOF_REQUIRED');
      const { canonical_hash, organization_signature, ...unsigned } = proof;
      const key = await this.signingKey.read();
      if (hashCanonical(unsigned) !== canonical_hash || !organization_signature.startsWith('ed25519:') || !verifyBytes(null, Buffer.from(canonicalize(unsigned)), key.public_key_pem, Buffer.from(organization_signature.slice(8), 'base64'))) throw new Error('HUMAN_PROOF_SIGNATURE_INVALID');
      const identity = (await this.identities.read()).find(item => item.human_id === proof.human_id && item.organization_id === proof.organization_id);
      const enrollment = (await this.enrollments.read()).find(item => item.enrollment_id === proof.enrollment_id && item.human_id === proof.human_id && item.organization_id === proof.organization_id);
      if (identity?.status !== 'active' || identity.active_membership_id !== proof.membership_id || identity.current_enrollment_id !== proof.enrollment_id || enrollment?.status !== 'active' || enrollment.version !== proof.enrollment_version) throw new Error('HUMAN_PROOF_BINDING_REVOKED');
      return proof;
    });
  }

  public updateEnrollment(request: BiometricEnrollmentLifecycleRequest): Promise<HumanIdentityV2State> {
    return this.runExclusive(async () => {
      const input = biometricEnrollmentLifecycleRequestSchema.parse(request);
      const enrollments = await this.enrollments.read();
      const target = enrollments.find((item) => item.enrollment_id === input.enrollment_id);
      if (!target) throw new Error('Biometric enrollment was not found.');
      await this.enrollments.write(enrollments.map((item) => item.enrollment_id === input.enrollment_id ? { ...item, status: 'revoked' as const } : item));
      await this.tokenSets.write((await this.tokenSets.read()).map((item) => item.enrollment_id === input.enrollment_id ? { ...item, status: 'revoked' as const } : item));
      await this.proofs.write((await this.proofs.read()).filter((item) => item.enrollment_id !== input.enrollment_id));
      await this.identities.write((await this.identities.read()).map((item) => item.current_enrollment_id === input.enrollment_id ? { ...item, current_enrollment_id: undefined, updated_at: this.clock().toISOString() } : item));
      await this.evidence.append({
        trace_id: `tr_v2_revoke_${input.enrollment_id}`,
        actor: { type: 'human', id: target.human_id },
        subject: { type: 'human_proof', id: input.enrollment_id },
        event_type: 'BIOMETRIC_ENROLLMENT_REVOKED_V2',
        payload: { organization_id: target.organization_id, enrollment_version: target.version }
      });
      return this.getStateUnlocked(target.human_id);
    });
  }

  public migrateV1(request: HumanIdentityV2MigrationRequest): Promise<HumanIdentityV2MigrationResult> {
    return this.runExclusive(async () => {
      const input = humanIdentityV2MigrationRequestSchema.parse(request);
      const [legacyIdentities, legacyEnrollments, currentIdentities, currentReceipts] = await Promise.all([
        this.readLegacyEnvelope('humans/identities.json', 'h2a.humans.identities', z.array(humanIdentitySchema)),
        this.readLegacyEnvelope('biometric-enrollments/enrollments.json', 'h2a.biometrics.enrollments', z.array(biometricEnrollmentSchema)),
        this.identities.read(),
        this.migrationReceipts.read()
      ]);
      const now = this.clock().toISOString();
      const memberships = new Map(input.memberships.map((membership) => [membership.human_id, membership.membership_id]));
      const identities = [...currentIdentities];
      const receipts: V2MigrationReceipt[] = [];
      const changedMigrationIds = new Set<string>();

      for (const legacy of legacyIdentities) {
        const membershipId = memberships.get(legacy.human_id);
        const existing = identities.find((identity) => identity.organization_id === input.organization_id && identity.human_id === legacy.human_id);
        let target = existing;
        if (!target && membershipId) {
          target = humanIdentityV2Schema.parse({
            schema_version: V2_CONTRACT_VERSION,
            human_id: legacy.human_id,
            organization_id: input.organization_id,
            display_name: legacy.display_name,
            status: legacy.status,
            active_membership_id: membershipId,
            created_at: legacy.enrolled_at,
            updated_at: legacy.last_verified_at ?? legacy.enrolled_at
          });
          identities.push(target);
        }
        const generatedReceipt = await this.createMigrationReceipt({
          recordType: 'human-identity',
          sourceId: legacy.human_id,
          targetId: legacy.human_id,
          organizationId: input.organization_id,
          status: target ? 'migrated' : 'requires-enrichment',
          missingFields: target ? [] : ['active_membership_id'],
          source: legacy,
          target,
          migratedAt: now
        });
        const existingReceipt = currentReceipts.find((receipt) => receipt.migration_id === generatedReceipt.migration_id);
        receipts.push(existingReceipt && sameMigrationOutcome(existingReceipt, generatedReceipt) ? existingReceipt : generatedReceipt);
        if (!existingReceipt || !sameMigrationOutcome(existingReceipt, generatedReceipt)) changedMigrationIds.add(generatedReceipt.migration_id);
      }

      for (const legacy of legacyEnrollments) {
        const generatedReceipt = await this.createMigrationReceipt({
          recordType: 'biometric-enrollment',
          sourceId: legacy.enrollment_id,
          targetId: `recapture_${legacy.enrollment_id}`,
          organizationId: input.organization_id,
          status: 'requires-enrichment',
          missingFields: ['capture_set_20_70', 'token_set_policy', 'protected_record_refs', 'enrollment_version'],
          source: legacy,
          migratedAt: now
        });
        const existingReceipt = currentReceipts.find((receipt) => receipt.migration_id === generatedReceipt.migration_id);
        receipts.push(existingReceipt && sameMigrationOutcome(existingReceipt, generatedReceipt) ? existingReceipt : generatedReceipt);
        if (!existingReceipt || !sameMigrationOutcome(existingReceipt, generatedReceipt)) changedMigrationIds.add(generatedReceipt.migration_id);
      }

      await this.identities.write(identities);
      const receiptIds = new Set(receipts.map((receipt) => receipt.migration_id));
      const mergedReceipts = [...currentReceipts.filter((receipt) => !receiptIds.has(receipt.migration_id)), ...receipts];
      await this.migrationReceipts.write(mergedReceipts);
      for (const receipt of receipts.filter((item) => changedMigrationIds.has(item.migration_id))) {
        await this.evidence.append({
          trace_id: `tr_${receipt.migration_id}`,
          actor: { type: 'system', id: 'h2a-v2-migration' },
          subject: { type: 'human_identity', id: receipt.target_record_id },
          event_type: 'V2_MIGRATION_RECORDED',
          payload: {
            organization_id: receipt.organization_id,
            record_type: receipt.record_type,
            source_hash: receipt.source_hash,
            target_hash: receipt.target_hash ?? null,
            status: receipt.status,
            missing_fields: receipt.missing_fields,
            migration_id: receipt.migration_id
          }
        });
      }
      return humanIdentityV2MigrationResultSchema.parse({ identities, receipts });
    });
  }

  private async reject(input: VerifyHumanV2Request, reason: NonNullable<HumanIdentityV2State['last_result']>['reason_code'], matchedCount: number, enrollmentId?: string, trackFailure = false): Promise<HumanIdentityV2State> {
    let effectiveReason = reason;
    if (trackFailure) {
      const current = await this.getSecurity(input.organization_id, input.human_id);
      const failedAttempts = current.failed_attempts + 1;
      if (failedAttempts >= MAX_FAILURES) {
        effectiveReason = 'LOCKED_OUT';
        await this.replaceSecurity({
          organization_id: input.organization_id,
          human_id: input.human_id,
          failed_attempts: failedAttempts,
          locked_until: new Date(this.clock().getTime() + LOCKOUT_MS).toISOString()
        });
        await this.setIdentityStatus(input.organization_id, input.human_id, 'locked');
      } else {
        await this.replaceSecurity({ ...current, failed_attempts: failedAttempts, locked_until: null });
      }
    }
    await this.recordAttempt(input, 'rejected', matchedCount, effectiveReason, enrollmentId);
    return this.getStateUnlocked(input.human_id);
  }

  private async getSecurity(organizationId: string, humanId: string): Promise<SecurityStateV2> {
    return (await this.security.read()).find((item) => item.organization_id === organizationId && item.human_id === humanId) ?? {
      organization_id: organizationId,
      human_id: humanId,
      failed_attempts: 0,
      locked_until: null
    };
  }

  private async replaceSecurity(state: SecurityStateV2): Promise<void> {
    const values = await this.security.read();
    await this.security.write([...values.filter((item) => !(item.organization_id === state.organization_id && item.human_id === state.human_id)), state]);
  }

  private async setIdentityStatus(organizationId: string, humanId: string, status: HumanIdentityV2['status']): Promise<void> {
    const identities = await this.identities.read();
    await this.identities.write(identities.map((identity) =>
      identity.organization_id === organizationId && identity.human_id === humanId
        ? { ...identity, status, updated_at: this.clock().toISOString() }
        : identity));
  }

  private async recordAttempt(input: VerifyHumanV2Request, decision: 'verified' | 'rejected', matchedCount: number, reason?: string, enrollmentId?: string): Promise<VerificationAttemptV2> {
    const base = {
      attempt_id: `hpa2_${randomUUID()}`,
      organization_id: input.organization_id,
      human_id: input.human_id,
      enrollment_id: enrollmentId,
      purpose: input.purpose,
      nonce: input.nonce,
      decision,
      reason_code: reason,
      matched_record_count: matchedCount,
      attempted_at: this.clock().toISOString()
    };
    const attempt = verificationAttemptV2Schema.parse({ ...base, evidence_hash: hashCanonical(base) });
    await this.attempts.write([...(await this.attempts.read()), attempt]);
    await this.evidence.append({
      trace_id: `tr_v2_attempt_${attempt.attempt_id}`,
      actor: { type: 'human', id: input.human_id },
      subject: { type: 'human_proof', id: attempt.attempt_id },
      event_type: 'HUMAN_PROOF_ATTEMPTED_V2',
      payload: {
        organization_id: input.organization_id,
        human_id: input.human_id,
        purpose: input.purpose,
        nonce_hash: hashCanonical(input.nonce),
        decision,
        reason_code: reason ?? null,
        matched_record_count: matchedCount,
        evidence_hash: attempt.evidence_hash
      }
    });
    return attempt;
  }

  private async getStateUnlocked(selectedHumanId?: string): Promise<HumanIdentityV2State> {
    const [identities, enrollments, proofs, attempts] = await Promise.all([
      this.identities.read(), this.enrollments.read(), this.proofs.read(), this.attempts.read()
    ]);
    const now = this.clock().getTime();
    const last = selectedHumanId
      ? attempts.filter((item) => item.human_id === selectedHumanId).at(-1)
      : attempts.at(-1);
    return humanIdentityV2StateSchema.parse({
      identities,
      enrollments,
      active_proofs: proofs.filter((proof) => new Date(proof.expires_at).getTime() > now),
      selected_human_id: selectedHumanId ?? null,
      last_result: last ? {
        human_id: last.human_id,
        decision: last.decision,
        reason_code: last.reason_code,
        matched_record_count: last.matched_record_count,
        attempted_at: last.attempted_at
      } : null
    });
  }

  private async sign(value: unknown): Promise<string> {
    const key = await this.signingKey.read();
    return `ed25519:${signBytes(null, Buffer.from(canonicalize(value), 'utf8'), key.private_key_pem).toString('base64')}`;
  }

  private async createMigrationReceipt(input: {
    recordType: V2MigrationReceipt['record_type'];
    sourceId: string;
    targetId: string;
    organizationId: string;
    status: V2MigrationReceipt['status'];
    missingFields: string[];
    source: unknown;
    target?: unknown;
    migratedAt: string;
  }): Promise<V2MigrationReceipt> {
    const sourceHash = hashCanonical(input.source);
    const unsigned = {
      migration_id: `mig2_${input.recordType.replaceAll('-', '_')}_${sourceHash.slice(7, 23)}`,
      source_schema_version: 1 as const,
      target_schema_version: V2_CONTRACT_VERSION,
      record_type: input.recordType,
      source_record_id: input.sourceId,
      target_record_id: input.targetId,
      organization_id: input.organizationId,
      status: input.status,
      missing_fields: input.missingFields,
      source_hash: sourceHash,
      target_hash: input.target === undefined ? undefined : hashCanonical(input.target),
      migrated_at: input.migratedAt
    };
    return v2MigrationReceiptSchema.parse({ ...unsigned, migration_signature: await this.sign(unsigned) });
  }

  private async readLegacyEnvelope<T>(relativePath: string, kind: string, dataSchema: z.ZodType<T>): Promise<T> {
    const contents = await this.store.read(relativePath);
    if (contents === undefined) return dataSchema.parse([]);
    const envelopeSchema = z.object({
      schemaVersion: z.literal(1),
      kind: z.literal(kind),
      updatedAt: z.string().datetime({ offset: true }),
      data: dataSchema
    }).strict();
    return envelopeSchema.parse(JSON.parse(contents) as unknown).data;
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function assertCaptureSet(input: EnrollHumanV2Request, requireLiveness: boolean): void {
  for (const capture of input.captures) {
    if (!capturePassesPolicy(capture.assessment, input.policy, requireLiveness)) {
      throw new Error(`Every enrollment capture must pass the active quality, distance and face-count policy${requireLiveness ? ', including liveness' : ''}.`);
    }
  }
}

function capturePassesPolicy(assessment: EnrollHumanV2Request['captures'][number]['assessment'], policy: BiometricTokenSetPolicy, requireLiveness = true): boolean {
  return assessment.face_count === 1 &&
    assessment.quality_score >= policy.quality_threshold &&
    (!requireLiveness || assessment.liveness_score >= policy.liveness_threshold) &&
    assessment.distance_cm >= policy.minimum_distance_cm &&
    assessment.distance_cm <= policy.maximum_distance_cm;
}

function createSigningKey(): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    algorithm: 'Ed25519',
    private_key_pem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    public_key_pem: publicKey.export({ format: 'pem', type: 'spki' }).toString()
  };
}

function sameMigrationOutcome(left: V2MigrationReceipt, right: V2MigrationReceipt): boolean {
  return left.source_hash === right.source_hash &&
    left.target_hash === right.target_hash &&
    left.status === right.status &&
    left.organization_id === right.organization_id &&
    left.target_record_id === right.target_record_id &&
    left.missing_fields.length === right.missing_fields.length &&
    left.missing_fields.every((field, index) => field === right.missing_fields[index]);
}
