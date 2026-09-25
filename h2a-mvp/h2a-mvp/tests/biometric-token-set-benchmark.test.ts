import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { BchFuzzyExtractor } from '@h2a/biometrics';

const sample: Array<0 | 1> = Array.from({ length: 4096 }, (_, index) => (index % 2) as 0 | 1);

describe('Plan 2 BCH token-set feasibility', () => {
  it('measures exact-match verification at 20, 45, and 70 protected records', async () => {
    const extractor = new BchFuzzyExtractor();
    const registrationStarted = performance.now();
    const enrollment = await extractor.register(Array.from({ length: 70 }, () => sample));
    const registrationMs = performance.now() - registrationStarted;
    const measurements: Array<{ records: number; verificationMs: number; matched: number }> = [];

    for (const records of [20, 45, 70]) {
      const started = performance.now();
      const matches = await extractor.verify(sample, {
        salt: enrollment.salt,
        records: enrollment.records.slice(0, records)
      });
      measurements.push({
        records,
        verificationMs: Number((performance.now() - started).toFixed(2)),
        matched: matches.filter((match) => match.matched).length
      });
    }

    console.info('H2A_BCH_BENCHMARK', JSON.stringify({
      registration70Ms: Number(registrationMs.toFixed(2)),
      measurements
    }));
    expect(enrollment.records).toHaveLength(70);
    expect(measurements.map((measurement) => measurement.matched)).toEqual([20, 45, 70]);
  }, 120_000);
});
