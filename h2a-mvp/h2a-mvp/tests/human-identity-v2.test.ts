import { mkdtemp, rm } from 'node:fs/promises';
import { verify as verifyBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { activeBiometricModelSet, type BiometricTokenSetPolicy, type EnrollHumanV2Request } from '@h2a/contracts';
import { BchFuzzyExtractor, type BchFuzzyExtractorPort, type BchRegistrationResult } from '@h2a/biometrics';
import { canonicalize, LocalAuthorityEventLedger } from '@h2a/evidence';
import { HumanIdentityV2Service } from '@h2a/identity';
import { AtomicFileStore } from '@h2a/storage';

const temporaryDirectories: string[] = [];
const policy: BiometricTokenSetPolicy = {
  policy_id: 'demo-face-v2-20',
  token_set_size: 20,
  required_matches: 1,
  bch_error_tolerance: 1800,
  proof_ttl_seconds: 300,
  quality_threshold: 0.65,
  liveness_threshold: 0.75,
  minimum_distance_cm: 35,
  maximum_distance_cm: 85,
  calibration_status: 'demo-unmeasured'
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

describe('Phase 12 multi-human biometric identity V2', () => {
  it('keeps two protected token sets independent and rejects cross-human verification', async () => {
    const fixture = await createFixture();
    await fixture.service.enroll(enrollment('human_alice', 'membership_alice', 'Alice Operator', 1));
    await fixture.service.enroll(enrollment('human_bob', 'membership_bob', 'Bob Approver', 101));

    const alice = await fixture.service.verify(verification('human_alice', 'membership_alice', 1, 'nonce-alice-own'));
    expect(alice.active_proofs).toHaveLength(1);
    expect(alice.active_proofs[0]).toMatchObject({ human_id: 'human_alice', membership_id: 'membership_alice', enrollment_version: 1, matched_record_count: 1 });

    const crossed = await fixture.service.verify(verification('human_bob', 'membership_bob', 1, 'nonce-alice-against-bob'));
    expect(crossed.last_result).toMatchObject({ human_id: 'human_bob', decision: 'rejected', reason_code: 'BIOMETRIC_MISMATCH', matched_record_count: 0 });
    expect(crossed.active_proofs.some((proof) => proof.human_id === 'human_bob')).toBe(false);
    expect((await fixture.evidence.list()).find((event) => event.event_type === 'HUMAN_PROOF_ATTEMPTED_V2' && event.payload.reason_code === 'BIOMETRIC_MISMATCH')?.payload.human_id).toBe('human_bob');

    const publicState = JSON.stringify(crossed);
    expect(publicState).not.toContain('helper-');
    expect(publicState).not.toContain('token-');
    expect(publicState).not.toContain('secret-salt');
    const evidence = JSON.stringify(await fixture.evidence.list());
    expect(evidence).not.toContain('helper-');
    expect(evidence).not.toContain('token-');
    expect(evidence).not.toContain('secret-salt');
  });

  it('rotates and revokes token sets without reviving older versions', async () => {
    const fixture = await createFixture();
    await fixture.service.enroll(enrollment('human_alice', 'membership_alice', 'Alice Operator', 1));
    const rotated = await fixture.service.enroll(enrollment('human_alice', 'membership_alice', 'Alice Operator', 201));
    const versions = rotated.enrollments.filter((item) => item.human_id === 'human_alice').sort((left, right) => left.version - right.version);
    expect(versions.map((item) => [item.version, item.status])).toEqual([[1, 'revoked'], [2, 'active']]);
    expect(versions[1].rotated_from_enrollment_id).toBe(versions[0].enrollment_id);

    const oldCapture = await fixture.service.verify(verification('human_alice', 'membership_alice', 1, 'nonce-old-after-rotation'));
    expect(oldCapture.last_result?.reason_code).toBe('BIOMETRIC_MISMATCH');

    const current = await fixture.service.verify(verification('human_alice', 'membership_alice', 201, 'nonce-new-after-rotation'));
    expect(current.active_proofs[0]?.enrollment_version).toBe(2);
    const revoked = await fixture.service.updateEnrollment({ enrollment_id: versions[1].enrollment_id, action: 'revoke' });
    expect(revoked.active_proofs).toHaveLength(0);
    expect(revoked.identities[0]?.current_enrollment_id).toBeUndefined();

    const afterRevocation = await fixture.service.verify(verification('human_alice', 'membership_alice', 201, 'nonce-after-revocation'));
    expect(afterRevocation.last_result?.reason_code).toBe('NO_ACTIVE_ENROLLMENT');
  });

  it('rejects duplicate enrollment captures, membership mismatch, and nonce replay', async () => {
    const fixture = await createFixture();
    const duplicate = enrollment('human_alice', 'membership_alice', 'Alice Operator', 1);
    duplicate.captures = Array.from({ length: 20 }, () => duplicate.captures[0]);
    await expect(fixture.service.enroll(duplicate)).rejects.toThrow('distinct');

    await fixture.service.enroll(enrollment('human_alice', 'membership_alice', 'Alice Operator', 1));
    const wrongMembership = await fixture.service.verify(verification('human_alice', 'membership_bob', 1, 'nonce-membership'));
    expect(wrongMembership.last_result?.reason_code).toBe('MEMBERSHIP_MISMATCH');

    const accepted = await fixture.service.verify(verification('human_alice', 'membership_alice', 1, 'nonce-one-use'));
    expect(accepted.last_result?.decision).toBe('verified');
    const replayed = await fixture.service.verify(verification('human_alice', 'membership_alice', 1, 'nonce-one-use'));
    expect(replayed.last_result?.reason_code).toBe('NONCE_REPLAY');
  });

  it('migrates evidenced V1 identity metadata and requires a fresh V2 biometric ceremony', async () => {
    const fixture = await createFixture();
    const store = new AtomicFileStore(fixture.root);
    const enrolledAt = '2026-08-20T10:00:00.000Z';
    const legacyIdentity = {
      human_id: 'human_legacy',
      display_name: 'Legacy Employee',
      status: 'active' as const,
      enrolled_at: enrolledAt
    };
    const legacyEnrollment = {
      enrollment_id: 'ben_legacy',
      subject_id: 'human_legacy',
      provider: 'local-face-bch' as const,
      modality: 'face' as const,
      model_set: activeBiometricModelSet,
      salt_hash: digest('1'),
      template_records: Array.from({ length: 3 }, (_, index) => ({
        record_id: `legacy_record_${index + 1}`,
        helper_hash: digest('2'),
        token_hash: digest('3'),
        k2_hash: digest('4'),
        created_at: enrolledAt
      })),
      template_count: 3,
      enrollment_assessment: {
        qualityScore: 0.9,
        brightnessScore: 0.8,
        sharpnessScore: 0.85,
        distanceCm: 55,
        livenessScore: 0.94,
        faceCount: 1,
        capturedAt: enrolledAt
      },
      created_at: enrolledAt,
      updated_at: enrolledAt,
      h2a_signature: 'ed25519:legacy-signature'
    };
    await store.write('humans/identities.json', envelope('h2a.humans.identities', [legacyIdentity], enrolledAt));
    await store.write('biometric-enrollments/enrollments.json', envelope('h2a.biometrics.enrollments', [legacyEnrollment], enrolledAt));
    const legacyIdentityBefore = await store.read('humans/identities.json');
    const legacyEnrollmentBefore = await store.read('biometric-enrollments/enrollments.json');

    const pending = await fixture.service.migrateV1({ organization_id: 'org_hp_demo', memberships: [] });
    expect(pending.identities).toHaveLength(0);
    expect(pending.receipts.find((receipt) => receipt.record_type === 'human-identity')).toMatchObject({
      status: 'requires-enrichment',
      missing_fields: ['active_membership_id']
    });

    const migrated = await fixture.service.migrateV1({
      organization_id: 'org_hp_demo',
      memberships: [{ human_id: 'human_legacy', membership_id: 'membership_legacy' }]
    });
    expect(migrated.identities).toContainEqual(expect.objectContaining({
      human_id: 'human_legacy',
      organization_id: 'org_hp_demo',
      active_membership_id: 'membership_legacy'
    }));
    expect(migrated.identities[0]).not.toHaveProperty('current_enrollment_id');
    expect(migrated.receipts.find((receipt) => receipt.record_type === 'human-identity')).toMatchObject({ status: 'migrated', missing_fields: [] });
    expect(migrated.receipts.find((receipt) => receipt.record_type === 'biometric-enrollment')).toMatchObject({
      status: 'requires-enrichment',
      missing_fields: ['capture_set_20_70', 'token_set_policy', 'protected_record_refs', 'enrollment_version']
    });
    expect(migrated.receipts.find((receipt) => receipt.record_type === 'biometric-enrollment')).not.toHaveProperty('target_hash');
    expect(await store.read('humans/identities.json')).toBe(legacyIdentityBefore);
    expect(await store.read('biometric-enrollments/enrollments.json')).toBe(legacyEnrollmentBefore);
    const signingKeyEnvelope = JSON.parse((await store.read('settings/organization-signing-key-v2.json')) ?? '{}') as { data: { public_key_pem: string } };
    for (const receipt of migrated.receipts) {
      const { migration_signature: signature, ...unsigned } = receipt;
      expect(verifyBytes(
        null,
        Buffer.from(canonicalize(unsigned), 'utf8'),
        signingKeyEnvelope.data.public_key_pem,
        Buffer.from(signature.slice('ed25519:'.length), 'base64')
      )).toBe(true);
    }

    const repeated = await fixture.service.migrateV1({
      organization_id: 'org_hp_demo',
      memberships: [{ human_id: 'human_legacy', membership_id: 'membership_legacy' }]
    });
    expect(repeated.identities.filter((identity) => identity.human_id === 'human_legacy')).toHaveLength(1);
    expect(repeated.receipts).toHaveLength(2);
    expect((await fixture.evidence.list()).filter((event) => event.event_type === 'V2_MIGRATION_RECORDED')).toHaveLength(3);
  });

  it('uses the real BCH codec through the V2 service at 20, 45, and 70 records', async () => {
    const fixture = await createRealFixture();
    let expectedVersion = 0;
    for (const tokenSetSize of [20, 45, 70]) {
      expectedVersion += 1;
      const captures = Array.from({ length: tokenSetSize }, (_, index) => ({
        sample: realSample(index + 1),
        assessment: {
          quality_score: 0.92,
          liveness_score: 0.96,
          distance_cm: 56,
          face_count: 1,
          captured_at: new Date(Date.UTC(2026, 7, 21, 1, 0, index)).toISOString()
        }
      }));
      const enrolled = await fixture.service.enroll({
        organization_id: 'org_hp_demo',
        human_id: 'human_real_bch',
        membership_id: 'membership_real_bch',
        display_name: 'Real BCH Employee',
        policy: { ...policy, policy_id: `demo-face-v2-${tokenSetSize}`, token_set_size: tokenSetSize },
        captures
      });
      const activeEnrollment = enrolled.enrollments.find((item) => item.status === 'active');
      expect(activeEnrollment).toMatchObject({ version: expectedVersion, policy: { token_set_size: tokenSetSize } });
      expect(activeEnrollment?.protected_record_refs).toHaveLength(tokenSetSize);

      const verified = await fixture.service.verify({
        organization_id: 'org_hp_demo',
        human_id: 'human_real_bch',
        membership_id: 'membership_real_bch',
        purpose: `verify real BCH token set ${tokenSetSize}`,
        nonce: `nonce-real-bch-${tokenSetSize}`,
        capture: {
          sample: realSample(0),
          assessment: {
            quality_score: 0.93,
            liveness_score: 0.97,
            distance_cm: 55,
            face_count: 1,
            captured_at: new Date(Date.UTC(2026, 7, 21, 2, 0, tokenSetSize)).toISOString()
          }
        }
      });
      expect(verified.last_result).toMatchObject({ decision: 'verified', matched_record_count: tokenSetSize });
      expect(verified.active_proofs[0]).toMatchObject({ enrollment_version: expectedVersion, matched_record_count: tokenSetSize });
    }
  }, 180_000);

  it('locks a V2 identity after repeated biometric failures and recovers after expiry', async () => {
    let now = new Date('2026-08-21T03:00:00.000Z');
    const root = await mkdtemp(join(tmpdir(), 'h2a-human-v2-lockout-'));
    temporaryDirectories.push(root);
    const evidence = new LocalAuthorityEventLedger(root, 'traces/tr_platform.jsonl', () => now);
    const service = new HumanIdentityV2Service(root, evidence, new DeterministicBch(), () => now);
    await service.initialize();
    await service.enroll(enrollment('human_lockout', 'membership_lockout', 'Lockout Employee', 1));

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const rejected = await service.verify(verification('human_lockout', 'membership_lockout', 100, `nonce-lockout-${attempt}`));
      expect(rejected.last_result?.reason_code).toBe(attempt === 3 ? 'LOCKED_OUT' : 'BIOMETRIC_MISMATCH');
    }
    const locked = await service.verify(verification('human_lockout', 'membership_lockout', 1, 'nonce-while-locked'));
    expect(locked.last_result?.reason_code).toBe('LOCKED_OUT');
    expect(locked.identities[0]?.status).toBe('locked');

    now = new Date(now.getTime() + 61_000);
    const recovered = await service.verify(verification('human_lockout', 'membership_lockout', 1, 'nonce-after-lockout'));
    expect(recovered.last_result?.decision).toBe('verified');
    expect(recovered.identities[0]?.status).toBe('active');
  });

  it('supports an explicit demo liveness bypass without claiming liveness or high assurance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-human-v2-liveness-bypass-'));
    temporaryDirectories.push(root);
    const evidence = new LocalAuthorityEventLedger(root);
    const service = new HumanIdentityV2Service(root, evidence, new DeterministicBch(), undefined, async () => 'demo-bypass');
    await service.initialize();
    const lowLivenessEnrollment = enrollment('human_bypass', 'membership_bypass', 'Bypass Employee', 1);
    lowLivenessEnrollment.captures = lowLivenessEnrollment.captures.map((capture) => ({
      ...capture,
      assessment: { ...capture.assessment, liveness_score: 0 }
    }));
    await service.enroll(lowLivenessEnrollment);

    const request = verification('human_bypass', 'membership_bypass', 1, 'nonce-liveness-bypass');
    request.capture.assessment.liveness_score = 0;
    const verified = await service.verify(request);

    expect(verified.last_result?.decision).toBe('verified');
    expect(verified.active_proofs[0]).toMatchObject({
      assurance_level: 'substantial',
      verification_methods: ['face', 'distance', 'bch']
    });
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'h2a-human-v2-'));
  temporaryDirectories.push(root);
  const evidence = new LocalAuthorityEventLedger(root);
  const service = new HumanIdentityV2Service(root, evidence, new DeterministicBch());
  await service.initialize();
  return { root, service, evidence };
}

async function createRealFixture() {
  const root = await mkdtemp(join(tmpdir(), 'h2a-human-v2-real-bch-'));
  temporaryDirectories.push(root);
  const evidence = new LocalAuthorityEventLedger(root);
  const service = new HumanIdentityV2Service(root, evidence, new BchFuzzyExtractor());
  await service.initialize();
  return { root, service, evidence };
}

function enrollment(humanId: string, membershipId: string, displayName: string, seed: number): EnrollHumanV2Request {
  return {
    organization_id: 'org_hp_demo',
    human_id: humanId,
    membership_id: membershipId,
    display_name: displayName,
    policy,
    captures: Array.from({ length: 20 }, (_, index) => ({
      sample: sample(seed + index),
      assessment: {
        quality_score: 0.9,
        liveness_score: 0.94,
        distance_cm: 58,
        face_count: 1,
        captured_at: new Date(Date.UTC(2026, 7, 21, 0, 0, index)).toISOString()
      }
    }))
  };
}

function verification(humanId: string, membershipId: string, seed: number, nonce: string) {
  return {
    organization_id: 'org_hp_demo',
    human_id: humanId,
    membership_id: membershipId,
    purpose: 'authorize H2A command floor',
    nonce,
    capture: {
      sample: sample(seed),
      assessment: {
        quality_score: 0.91,
        liveness_score: 0.95,
        distance_cm: 56,
        face_count: 1,
        captured_at: '2026-08-21T00:05:00.000Z'
      }
    }
  };
}

function sample(seed: number): Array<0 | 1> {
  return Array.from({ length: 4096 }, (_, index) => (((index * 31) + seed * 17 + Math.floor(index / (seed + 1))) % 2) as 0 | 1);
}

class DeterministicBch implements BchFuzzyExtractorPort {
  public async register(samples: number[][]): Promise<BchRegistrationResult> {
    return {
      salt: 'secret-salt',
      records: samples.map((value, index) => ({
        record_id: `record-${index + 1}`,
        helper: `helper-${fingerprint(value)}`,
        token: `token-${fingerprint(value)}`,
        k2: `k2-${index + 1}`
      }))
    };
  }

  public async verify(sampleValue: number[], enrollmentValue: BchRegistrationResult) {
    const expected = `token-${fingerprint(sampleValue)}`;
    return enrollmentValue.records.map((record) => ({ matched: record.token === expected, correctedErrors: record.token === expected ? 0 : -1 }));
  }
}

function fingerprint(value: number[]): string {
  return value.join('').slice(0, 256);
}

function envelope(kind: string, data: unknown, updatedAt: string): string {
  return `${JSON.stringify({ schemaVersion: 1, kind, updatedAt, data }, null, 2)}\n`;
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function realSample(uniqueFlip: number): Array<0 | 1> {
  const value: Array<0 | 1> = Array.from({ length: 4096 }, (_, index) => (index % 2) as 0 | 1);
  if (uniqueFlip > 0) value[(uniqueFlip * 53) % value.length] = value[(uniqueFlip * 53) % value.length] === 0 ? 1 : 0;
  return value;
}
