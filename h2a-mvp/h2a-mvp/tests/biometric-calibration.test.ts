import { describe, expect, it } from 'vitest';
import { BchFuzzyExtractor, evaluateBiometricCalibration } from '@h2a/biometrics';

describe('Phase 12 biometric policy calibration', () => {
  it('compares 1-of-N and stricter policies without claiming measured human accuracy', () => {
    const report = evaluateBiometricCalibration([
      { fixture_id: 'genuine-1', label: 'genuine', matched_record_count: 20 },
      { fixture_id: 'genuine-2', label: 'genuine', matched_record_count: 8 },
      { fixture_id: 'genuine-3', label: 'genuine', matched_record_count: 3 },
      { fixture_id: 'genuine-4', label: 'genuine', matched_record_count: 1 },
      { fixture_id: 'impostor-1', label: 'impostor', matched_record_count: 0 },
      { fixture_id: 'impostor-2', label: 'impostor', matched_record_count: 0 },
      { fixture_id: 'impostor-3', label: 'impostor', matched_record_count: 1 },
      { fixture_id: 'impostor-4', label: 'impostor', matched_record_count: 0 }
    ], 20, [1, 3, 5]);

    expect(report).toMatchObject({
      profile: 'synthetic-labeled-bch-fixtures',
      calibration_status: 'demo-unmeasured',
      production_claim_permitted: false,
      genuine_fixture_count: 4,
      impostor_fixture_count: 4
    });
    expect(report.policies).toEqual([
      expect.objectContaining({ required_matches: 1, false_accept_rate: 0.25, false_reject_rate: 0 }),
      expect.objectContaining({ required_matches: 3, false_accept_rate: 0, false_reject_rate: 0.25 }),
      expect.objectContaining({ required_matches: 5, false_accept_rate: 0, false_reject_rate: 0.5 })
    ]);
  });

  it('rejects unlabeled, duplicate, or out-of-range fixture sets', () => {
    expect(() => evaluateBiometricCalibration([], 20, [1])).toThrow('non-empty');
    expect(() => evaluateBiometricCalibration([
      { fixture_id: 'same', label: 'genuine', matched_record_count: 1 },
      { fixture_id: 'same', label: 'impostor', matched_record_count: 0 }
    ], 20, [1])).toThrow('unique');
    expect(() => evaluateBiometricCalibration([
      { fixture_id: 'genuine', label: 'genuine', matched_record_count: 21 },
      { fixture_id: 'impostor', label: 'impostor', matched_record_count: 0 }
    ], 20, [1])).toThrow('valid for the token set');
  });

  it('runs labeled synthetic genuine and impostor probes through the real BCH codec', async () => {
    const extractor = new BchFuzzyExtractor();
    const base = alternatingSample();
    const enrollment = await extractor.register(Array.from({ length: 20 }, (_, index) => flipBits(base, index + 1, index * 7)));
    const probes = [
      { fixture_id: 'bch-genuine-exact', label: 'genuine' as const, sample: base },
      { fixture_id: 'bch-genuine-low-variance', label: 'genuine' as const, sample: flipBits(base, 120, 300) },
      { fixture_id: 'bch-genuine-higher-variance', label: 'genuine' as const, sample: flipBits(base, 900, 900) },
      { fixture_id: 'bch-impostor-complement', label: 'impostor' as const, sample: base.map((bit) => bit === 0 ? 1 : 0) },
      { fixture_id: 'bch-impostor-leading-block', label: 'impostor' as const, sample: flipBits(base, 3000, 0) },
      { fixture_id: 'bch-impostor-trailing-block', label: 'impostor' as const, sample: flipBits(base, 3000, 1000) }
    ];
    const observations = [];
    for (const probe of probes) {
      const matches = await extractor.verify(probe.sample, enrollment);
      observations.push({
        fixture_id: probe.fixture_id,
        label: probe.label,
        matched_record_count: matches.filter((match) => match.matched).length
      });
    }
    const report = evaluateBiometricCalibration(observations, 20, [1, 3, 5]);
    expect(observations.filter((item) => item.label === 'genuine').map((item) => item.matched_record_count)).toEqual([20, 20, 20]);
    expect(observations.filter((item) => item.label === 'impostor').map((item) => item.matched_record_count)).toEqual([0, 0, 0]);
    expect(report.policies).toEqual(report.policies.map(() => expect.objectContaining({ false_accept_rate: 0, false_reject_rate: 0 })));
  }, 120_000);
});

function alternatingSample(): Array<0 | 1> {
  return Array.from({ length: 4096 }, (_, index) => (index % 2) as 0 | 1);
}

function flipBits(source: Array<0 | 1>, count: number, offset: number): Array<0 | 1> {
  const result = [...source];
  for (let index = 0; index < count; index += 1) {
    const position = (offset + index) % result.length;
    result[position] = result[position] === 0 ? 1 : 0;
  }
  return result;
}
