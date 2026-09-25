import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { census, h2a, root, pythonCommand, run } from './demo-runtime.mjs';
await mkdir(join(root, '.test-artifacts'), { recursive: true });
await run(pythonCommand(), ['-m', 'pytest', '-q', '-p', 'no:cacheprovider', '--basetemp', join(root, '.test-artifacts', `pytest-${randomUUID()}`)], { cwd: census });
await run(process.execPath, [join(h2a, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/agent-identity.test.ts', 'tests/mandate-policy.test.ts', 'tests/employee-workspace.test.ts', 'tests/evidence-audit.test.ts', 'tests/storage-concurrency.test.ts', 'tests/multi-human-approval.test.ts', '--maxWorkers=1'], { cwd: h2a });
