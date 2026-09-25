import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exec } from '../../../../vendor/claw-orchestrator/exec';
import { normalizeClawHunterReport } from './adapters';
import { DemoError } from './service';

/** Runs the actual vendored Claw Hunter, retaining only normalized metadata. */
export async function collectClawHunter(root: string) {
  const temporary = await mkdtemp(join(tmpdir(), 'byosync-claw-'));
  const output = join(temporary, 'report.json');
  try {
    const script = join(root, 'vendor/claw-hunter', process.platform === 'win32' ? 'claw-hunter.ps1' : 'claw-hunter.sh');
    const command = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    // Process-local policy only; no persistent execution-policy change, remote
    // upload, service installation or machine configuration changes.
    const args = process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '--json-path', output] : [script, '--json-path', output];
    const result = await exec(command, args, { timeoutMs: 90000, maxCaptureBytes: 4096 });
    if (result.timedOut || result.code === null || ![0, 1, 2].includes(result.code)) throw new DemoError('Claw Hunter failed; endpoint safety is unknown.', 503);
    const raw = JSON.parse((await readFile(output, 'utf8')).replace(/^\uFEFF/, ''));
    return normalizeClawHunterReport(raw);
  } finally {
    await unlink(output).catch(() => {});
    await rmdir(temporary).catch(() => {});
  }
}
