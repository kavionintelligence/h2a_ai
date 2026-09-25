import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { activeBiometricModelSet, type CaptureAssessment } from '@h2a/contracts';
import { BchFuzzyExtractor, verifyBiometricAssetManifest, type BchFuzzyExtractorPort, type BchRegistrationResult } from '@h2a/biometrics';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { HumanProofService } from '@h2a/identity';

const temporaryDirectories: string[] = [];
const assessment: CaptureAssessment = {
  qualityScore: 0.88,
  brightnessScore: 0.86,
  sharpnessScore: 0.9,
  distanceCm: 58,
  livenessScore: 0.94,
  faceCount: 1,
  capturedAt: '2026-08-20T10:00:00.000Z'
};
const sample: Array<0 | 1> = Array.from({ length: 4096 }, (_, index) => (index % 2) as 0 | 1);

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

describe('real BCH fuzzy extractor', () => {
  it('verifies every biometric model and runtime binary against the locked manifest', async () => {
    await expect(verifyBiometricAssetManifest()).resolves.toBeUndefined();
  });

  it('registers and matches the same biometric bit vector with the supplied WASM codec', async () => {
    const extractor = new BchFuzzyExtractor(join(process.cwd(), 'assets', 'biometric'));
    const enrollment = await extractor.register([sample, sample, sample]);
    const matches = await extractor.verify(sample, enrollment);

    expect(enrollment.records).toHaveLength(3);
    expect(enrollment.records.every((record) => record.helper.length === 32767)).toBe(true);
    expect(matches.every((match) => match.matched)).toBe(true);
  }, 60_000);
});

describe('human proof service', () => {
  it('enrolls, verifies, signs proof, and keeps secret template material out of public evidence', async () => {
    const root = await createTempDirectory();
    const ledger = new LocalAuthorityEventLedger(root);
    const service = new HumanProofService(root, ledger, new DeterministicExtractor());
    await service.initialize();

    const enrolled = await service.enroll({ subjectId: 'human_primary', displayName: 'Demo Principal', assessment, modelSet: activeBiometricModelSet, samples: [sample, sample, sample] });
    expect(enrolled.enrollment?.template_count).toBe(3);
    expect(enrolled.enrollment?.h2a_signature).toMatch(/^ed25519:/);

    const verified = await service.verify({ subjectId: 'human_primary', purpose: 'authorize command floor', assessment, modelSet: activeBiometricModelSet, sample });
    expect(verified.activeProof?.assurance_level).toBe('high');
    expect(verified.recentAttempts[0].decision).toBe('verified');
    expect((await ledger.verify()).status).toBe('verified');

    const publicEnrollment = await readFile(join(root, 'biometric-enrollments', 'enrollments.json'), 'utf8');
    const evidence = await readFile(join(root, 'traces', 'tr_platform.jsonl'), 'utf8');
    const secretEnvelope = JSON.parse(await readFile(join(root, 'biometric-secrets', 'templates.json'), 'utf8')) as { data: Array<{ records: Array<{ helper: string }> }> };
    const helper = secretEnvelope.data[0].records[0].helper;
    expect(publicEnrollment).not.toContain(helper);
    expect(evidence).not.toContain(helper);
    expect(evidence).not.toContain(sample.join(''));
  });

  it('locks the principal after three rejected attempts', async () => {
    const root = await createTempDirectory();
    const service = new HumanProofService(root, new LocalAuthorityEventLedger(root), new DeterministicExtractor());
    await service.initialize();
    for (let index = 0; index < 3; index += 1) {
      await service.recordFailure({ subjectId: 'human_primary', purpose: 'authorize command floor', reasonCode: 'LIVENESS_FAILED', assessment });
    }
    const state = await service.getState();
    expect(state.failedAttempts).toBe(3);
    expect(state.lockedUntil).not.toBeNull();
    expect(state.recentAttempts[0].decision).toBe('locked');
  });
});

class DeterministicExtractor implements BchFuzzyExtractorPort {
  public async register(samples: number[][]): Promise<BchRegistrationResult> {
    return { salt: 'a'.repeat(64), records: samples.map((_, index) => ({ record_id: `btr_${index + 1}`, helper: `${'10'.repeat(16383)}1`, token: 'b'.repeat(64), k2: 'c'.repeat(64) })) };
  }

  public async verify(_sample: number[], enrollment: BchRegistrationResult) {
    return enrollment.records.map(() => ({ matched: true, correctedErrors: 0 }));
  }
}

async function createTempDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'h2a-proof-'));
  temporaryDirectories.push(path);
  return path;
}
