import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign as signBytes
} from 'node:crypto';
import { z } from 'zod';
import {
  activeBiometricModelSet,
  biometricEnrollmentRequestSchema,
  biometricEnrollmentSchema,
  biometricVerificationRequestSchema,
  captureAssessmentSchema,
  humanIdentitySchema,
  humanProofAttemptSchema,
  humanProofFailureRequestSchema,
  humanProofSchema,
  humanProofStateSchema,
  type BiometricEnrollment,
  type BiometricEnrollmentRequest,
  type BiometricReasonCode,
  type BiometricVerificationRequest,
  type CaptureAssessment,
  type HumanIdentity,
  type HumanProof,
  type HumanProofAttempt,
  type HumanProofFailureRequest,
  type HumanProofState
} from '@h2a/contracts';
import {
  BchFuzzyExtractor,
  type BchFuzzyExtractorPort,
  type BchRegistrationResult
} from '@h2a/biometrics';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const MIN_QUALITY = 0.65;
const MIN_LIVENESS = 0.75;
const MIN_DISTANCE_CM = 35;
const MAX_DISTANCE_CM = 85;
const MAX_FAILURES = 3;
const LOCKOUT_MS = 60_000;
const PROOF_TTL_MS = 5 * 60_000;
const REQUIRED_TEMPLATE_MATCHES = 1;

const secretRecordSchema = z.object({
  record_id: z.string().min(1),
  helper: z.string().regex(/^[01]{32767}$/),
  token: z.string().regex(/^[0-9a-f]{64}$/),
  k2: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();

const secretEnrollmentSchema = z.object({
  enrollment_id: z.string().min(1),
  subject_id: z.string().min(1),
  salt: z.string().regex(/^[0-9a-f]{64}$/),
  records: z.array(secretRecordSchema).min(3)
}).strict();
type SecretEnrollment = z.infer<typeof secretEnrollmentSchema>;

const securityStateSchema = z.object({
  subject_id: z.string().min(1),
  failed_attempts: z.number().int().nonnegative(),
  locked_until: z.string().datetime({ offset: true }).nullable()
}).strict();
type SecurityState = z.infer<typeof securityStateSchema>;

const signingKeySchema = z.object({
  algorithm: z.literal('Ed25519'),
  private_key_pem: z.string().startsWith('-----BEGIN PRIVATE KEY-----'),
  public_key_pem: z.string().startsWith('-----BEGIN PUBLIC KEY-----')
}).strict();
type SigningKey = z.infer<typeof signingKeySchema>;

export class HumanProofService {
  private readonly identities: VersionedJsonRepository<'h2a.humans.identities', HumanIdentity[]>;
  private readonly enrollments: VersionedJsonRepository<'h2a.biometrics.enrollments', BiometricEnrollment[]>;
  private readonly secrets: VersionedJsonRepository<'h2a.biometrics.secrets', SecretEnrollment[]>;
  private readonly attempts: VersionedJsonRepository<'h2a.human-proof.attempts', HumanProofAttempt[]>;
  private readonly proofs: VersionedJsonRepository<'h2a.human-proof.proofs', HumanProof[]>;
  private readonly security: VersionedJsonRepository<'h2a.human-proof.security', SecurityState[]>;
  private readonly signingKey: VersionedJsonRepository<'h2a.settings.signing-key', SigningKey>;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly bch: BchFuzzyExtractorPort = new BchFuzzyExtractor(),
    private readonly clock: () => Date = () => new Date()
  ) {
    const store = new AtomicFileStore(dataPath);
    const options = { clock: this.clock };
    this.identities = new VersionedJsonRepository(store, 'humans/identities.json', 'h2a.humans.identities', z.array(humanIdentitySchema), { ...options, initialData: [] });
    this.enrollments = new VersionedJsonRepository(store, 'biometric-enrollments/enrollments.json', 'h2a.biometrics.enrollments', z.array(biometricEnrollmentSchema), { ...options, initialData: [] });
    this.secrets = new VersionedJsonRepository(store, 'biometric-secrets/templates.json', 'h2a.biometrics.secrets', z.array(secretEnrollmentSchema), { ...options, initialData: [] });
    this.attempts = new VersionedJsonRepository(store, 'human-proof-attempts/attempts.json', 'h2a.human-proof.attempts', z.array(humanProofAttemptSchema), { ...options, initialData: [] });
    this.proofs = new VersionedJsonRepository(store, 'human-proofs/proofs.json', 'h2a.human-proof.proofs', z.array(humanProofSchema), { ...options, initialData: [] });
    this.security = new VersionedJsonRepository(store, 'human-proof-attempts/security.json', 'h2a.human-proof.security', z.array(securityStateSchema), { ...options, initialData: [] });
    this.signingKey = new VersionedJsonRepository(store, 'settings/h2a-signing-key.json', 'h2a.settings.signing-key', signingKeySchema, { ...options, initialData: createSigningKey() });
  }

  public async initialize(): Promise<void> {
    await Promise.all([
      this.identities.read(), this.enrollments.read(), this.secrets.read(),
      this.attempts.read(), this.proofs.read(), this.security.read(), this.signingKey.read()
    ]);
  }

  public getState(subjectId = 'human_primary'): Promise<HumanProofState> {
    return this.runExclusive(() => this.getStateUnlocked(subjectId));
  }

  public enroll(request: BiometricEnrollmentRequest): Promise<HumanProofState> {
    return this.runExclusive(async () => {
      const input = biometricEnrollmentRequestSchema.parse(request);
      assertModelSet(input.modelSet);
      const failure = assessCapture(input.assessment);
      if (failure) return this.recordFailureUnlocked({ subjectId: input.subjectId, purpose: 'biometric enrollment', reasonCode: failure, assessment: input.assessment });

      const registered = await this.bch.register(input.samples);
      const now = this.clock().toISOString();
      const enrollmentId = `ben_${randomUUID()}`;
      const secretEnrollment: SecretEnrollment = { enrollment_id: enrollmentId, subject_id: input.subjectId, ...registered };
      const unsignedEnrollment = {
        enrollment_id: enrollmentId,
        subject_id: input.subjectId,
        provider: 'local-face-bch' as const,
        modality: 'face' as const,
        model_set: input.modelSet,
        salt_hash: prefixedHash(registered.salt),
        template_records: registered.records.map((record) => ({
          record_id: record.record_id,
          helper_hash: prefixedHash(record.helper),
          token_hash: prefixedHash(record.token),
          k2_hash: prefixedHash(record.k2),
          created_at: now
        })),
        template_count: registered.records.length,
        enrollment_assessment: input.assessment,
        created_at: now,
        updated_at: now
      };
      const enrollment = biometricEnrollmentSchema.parse({
        ...unsignedEnrollment,
        h2a_signature: await this.sign(unsignedEnrollment)
      });
      const identity: HumanIdentity = {
        human_id: input.subjectId,
        display_name: input.displayName,
        status: 'active',
        enrolled_at: now
      };

      await this.replaceBySubject(this.secrets, secretEnrollment);
      await this.replaceBySubject(this.enrollments, enrollment);
      await this.replaceIdentity(identity);
      await this.replaceSecurity({ subject_id: input.subjectId, failed_attempts: 0, locked_until: null });
      await this.evidence.append({
        trace_id: `tr_enroll_${input.subjectId}`,
        actor: { type: 'human', id: input.subjectId },
        subject: { type: 'human_proof', id: enrollmentId },
        event_type: 'BIOMETRIC_ENROLLED',
        payload: {
          provider: 'local-face-bch',
          template_count: enrollment.template_count,
          model_set: enrollment.model_set,
          quality_score: input.assessment.qualityScore,
          distance_cm: input.assessment.distanceCm,
          liveness_score: input.assessment.livenessScore
        }
      });
      return this.getStateUnlocked(input.subjectId);
    });
  }

  public verify(request: BiometricVerificationRequest): Promise<HumanProofState> {
    return this.runExclusive(async () => {
      const input = biometricVerificationRequestSchema.parse(request);
      assertModelSet(input.modelSet);
      const lock = await this.getSecurity(input.subjectId);
      if (lock.locked_until && new Date(lock.locked_until).getTime() > this.clock().getTime()) {
        return this.recordAttempt(input.subjectId, input.purpose, 'LOCKED_OUT', input.assessment, 0, true);
      }
      const failure = assessCapture(input.assessment);
      if (failure) return this.recordFailureUnlocked({ subjectId: input.subjectId, purpose: input.purpose, reasonCode: failure, assessment: input.assessment });

      const enrollment = (await this.secrets.read()).find((item) => item.subject_id === input.subjectId);
      if (!enrollment) return this.recordFailureUnlocked({ subjectId: input.subjectId, purpose: input.purpose, reasonCode: 'BIOMETRIC_MISMATCH', assessment: input.assessment });
      const matches = await this.bch.verify(input.sample, enrollment as BchRegistrationResult);
      const matchedCount = matches.filter((match) => match.matched).length;
      if (matchedCount < REQUIRED_TEMPLATE_MATCHES) {
        return this.recordAttempt(input.subjectId, input.purpose, 'BIOMETRIC_MISMATCH', input.assessment, matchedCount, false);
      }

      await this.replaceSecurity({ subject_id: input.subjectId, failed_attempts: 0, locked_until: null });
      const now = this.clock();
      const attempt = await this.createAttempt(input.subjectId, input.assessment, matchedCount, 'verified');
      const unsignedProof = {
        human_proof_id: `hp_${randomUUID()}`,
        subject_id: input.subjectId,
        provider: 'local-face-bch' as const,
        verification_methods: ['face', 'liveness'] as const,
        assurance_level: 'high' as const,
        verified_at: now.toISOString(),
        expires_at: new Date(now.getTime() + PROOF_TTL_MS).toISOString(),
        provider_attestation_hash: attempt.evidence_hash
      };
      const proof = humanProofSchema.parse({ ...unsignedProof, h2a_signature: await this.sign(unsignedProof) });
      const proofs = await this.proofs.read();
      await this.proofs.write([...proofs.filter((item) => item.subject_id !== input.subjectId), proof]);
      const identities = await this.identities.read();
      await this.identities.write(identities.map((identity) => identity.human_id === input.subjectId ? { ...identity, status: 'active' as const, last_verified_at: now.toISOString() } : identity));
      const attemptEvent = await this.appendAttemptEvidence(attempt, input.purpose);
      await this.evidence.append({
        trace_id: `tr_proof_${attempt.attempt_id}`,
        actor: { type: 'human', id: input.subjectId },
        subject: { type: 'human_proof', id: proof.human_proof_id },
        parent_event_id: attemptEvent.event_id,
        event_type: 'HUMAN_VERIFIED',
        payload: { proof_id: proof.human_proof_id, expires_at: proof.expires_at, assurance_level: 'high' }
      });
      return this.getStateUnlocked(input.subjectId);
    });
  }

  public recordFailure(request: HumanProofFailureRequest): Promise<HumanProofState> {
    return this.runExclusive(() => this.recordFailureUnlocked(humanProofFailureRequestSchema.parse(request)));
  }

  private async recordFailureUnlocked(request: HumanProofFailureRequest): Promise<HumanProofState> {
    return this.recordAttempt(request.subjectId, request.purpose, request.reasonCode, request.assessment, 0, false);
  }

  private async recordAttempt(subjectId: string, purpose: string, reason: BiometricReasonCode, assessment: CaptureAssessment | undefined, matchedCount: number, alreadyLocked: boolean): Promise<HumanProofState> {
    const security = await this.getSecurity(subjectId);
    const failures = alreadyLocked ? security.failed_attempts : security.failed_attempts + 1;
    const locked = alreadyLocked || failures >= MAX_FAILURES;
    const lockedUntil = locked ? security.locked_until ?? new Date(this.clock().getTime() + LOCKOUT_MS).toISOString() : null;
    await this.replaceSecurity({ subject_id: subjectId, failed_attempts: failures, locked_until: lockedUntil });
    const attempt = await this.createAttempt(subjectId, assessment, matchedCount, locked ? 'locked' : 'rejected', locked ? 'LOCKED_OUT' : reason);
    await this.appendAttemptEvidence(attempt, purpose);
    return this.getStateUnlocked(subjectId);
  }

  private async createAttempt(subjectId: string, assessment: CaptureAssessment | undefined, matchedCount: number, decision: 'verified' | 'rejected' | 'locked', reason?: BiometricReasonCode): Promise<HumanProofAttempt> {
    const base = {
      attempt_id: `hpa_${randomUUID()}`,
      subject_id: subjectId,
      provider: 'local-face-bch' as const,
      requested_methods: ['face', 'liveness'] as const,
      assessment: assessment ? captureAssessmentSchema.parse(assessment) : undefined,
      matched_template_count: matchedCount,
      required_template_matches: REQUIRED_TEMPLATE_MATCHES,
      decision,
      reason_code: reason,
      created_at: this.clock().toISOString()
    };
    const attempt = humanProofAttemptSchema.parse({ ...base, evidence_hash: hashCanonical(base) });
    await this.attempts.write([...(await this.attempts.read()), attempt]);
    return attempt;
  }

  private appendAttemptEvidence(attempt: HumanProofAttempt, purpose: string) {
    return this.evidence.append({
      trace_id: `tr_proof_${attempt.attempt_id}`,
      actor: { type: 'human', id: attempt.subject_id },
      subject: { type: 'human_proof', id: attempt.attempt_id },
      event_type: 'HUMAN_PROOF_ATTEMPTED',
      payload: {
        purpose,
        decision: attempt.decision,
        reason_code: attempt.reason_code ?? null,
        matched_template_count: attempt.matched_template_count,
        assessment: attempt.assessment ?? null,
        evidence_hash: attempt.evidence_hash
      }
    });
  }

  private async getStateUnlocked(subjectId: string): Promise<HumanProofState> {
    const [identities, enrollments, attempts, proofs, security] = await Promise.all([
      this.identities.read(), this.enrollments.read(), this.attempts.read(), this.proofs.read(), this.security.read()
    ]);
    const now = this.clock().getTime();
    const lock = security.find((item) => item.subject_id === subjectId);
    const proof = proofs.find((item) => item.subject_id === subjectId && new Date(item.expires_at).getTime() > now) ?? null;
    return humanProofStateSchema.parse({
      identity: identities.find((item) => item.human_id === subjectId) ?? null,
      enrollment: enrollments.find((item) => item.subject_id === subjectId) ?? null,
      recentAttempts: attempts.filter((item) => item.subject_id === subjectId).slice(-5).reverse(),
      activeProof: proof,
      failedAttempts: lock?.failed_attempts ?? 0,
      lockedUntil: lock?.locked_until ?? null,
      modelSet: activeBiometricModelSet
    });
  }

  private async getSecurity(subjectId: string): Promise<SecurityState> {
    return (await this.security.read()).find((item) => item.subject_id === subjectId) ?? { subject_id: subjectId, failed_attempts: 0, locked_until: null };
  }

  private async replaceSecurity(state: SecurityState): Promise<void> {
    const items = await this.security.read();
    await this.security.write([...items.filter((item) => item.subject_id !== state.subject_id), state]);
  }

  private async replaceIdentity(identity: HumanIdentity): Promise<void> {
    const items = await this.identities.read();
    await this.identities.write([...items.filter((item) => item.human_id !== identity.human_id), identity]);
  }

  private async replaceBySubject<T extends { subject_id: string }, K extends string>(repository: VersionedJsonRepository<K, T[]>, value: T): Promise<void> {
    const items = await repository.read();
    await repository.write([...items.filter((item) => item.subject_id !== value.subject_id), value]);
  }

  private async sign(value: unknown): Promise<string> {
    const key = await this.signingKey.read();
    return `ed25519:${signBytes(null, Buffer.from(canonicalize(value), 'utf8'), key.private_key_pem).toString('base64')}`;
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function assessCapture(assessment: CaptureAssessment): BiometricReasonCode | undefined {
  if (assessment.faceCount === 0) return 'FACE_NOT_FOUND';
  if (assessment.faceCount > 1) return 'MULTIPLE_FACES';
  if (assessment.qualityScore < MIN_QUALITY) return 'LOW_QUALITY';
  if (assessment.distanceCm < MIN_DISTANCE_CM || assessment.distanceCm > MAX_DISTANCE_CM) return 'DISTANCE_OUT_OF_RANGE';
  if (assessment.livenessScore < MIN_LIVENESS) return 'LIVENESS_FAILED';
  return undefined;
}

function assertModelSet(modelSet: unknown): void {
  if (canonicalize(modelSet) !== canonicalize(activeBiometricModelSet)) throw new Error('Biometric model set does not match the active enrollment contract.');
}

function prefixedHash(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function createSigningKey(): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    algorithm: 'Ed25519',
    private_key_pem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    public_key_pem: publicKey.export({ format: 'pem', type: 'spki' }).toString()
  };
}
