import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('Phase 33 baseline reconciliation', () => {
  it('verifies the signed Control-view baseline and canonical Plan 3 status', async () => {
    const { stdout } = await execFileAsync(process.execPath, ['scripts/phase33-baseline.mjs', '--verify'], {
      cwd: process.cwd(),
      env: { ...process.env, H2A_DATA_PATH: 'data/demo-sessions/phase23-guided-20260821175015' },
    });

    expect(stdout).toContain('H2A_PHASE33_BASELINE_VERIFIED 41 files 10 phases sha256:');

    const report = JSON.parse(await readFile('docs/plan4/evidence/phase33/plan3-status.json', 'utf8'));
    expect(report.summary).toEqual({ complete: 8, in_progress: 2, plan3_complete: false });
    expect(report.phases.find((phase: { phase: number }) => phase.phase === 29)).toMatchObject({ status: 'complete' });
    expect(report.phases.find((phase: { phase: number }) => phase.phase === 31)).toMatchObject({ status: 'in-progress' });
    expect(report.phases.find((phase: { phase: number }) => phase.phase === 32)).toMatchObject({ status: 'in-progress' });
  });
});
