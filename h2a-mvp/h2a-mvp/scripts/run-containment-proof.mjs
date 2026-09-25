import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidencePath = join(projectRoot, 'docs', 'plan2', 'evidence', 'containment-proof.json');
const image = 'alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc';
const dockerPath = await findDocker();
const dockerBin = resolve(dockerPath, '..');
const executionId = `h2a-containment-${randomUUID()}`;
const workspace = await mkdtemp(join(tmpdir(), 'h2a-containment-workspace-'));
const containerName = `${executionId}-cancel`;
const startedAt = new Date().toISOString();
const checks = [];

try {
  await ensureImage();
  await proveRestrictedInvocation();
  await provePolicyAndCancellation();

  const evidence = {
    schema_version: 1,
    kind: 'h2a.phase11.containment-proof',
    execution_id: executionId,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    result: 'pass',
    trust_effect: 'isolation-feasibility-only',
    image,
    docker: await dockerEvidence(),
    policy: {
      user: '65534:65534',
      root_filesystem: 'read-only',
      capabilities: 'all-dropped',
      no_new_privileges: true,
      network_mode: 'none',
      workspace_mount: '/workspace:rw',
      docker_socket_mounted: false,
      memory_bytes: 67_108_864,
      nano_cpus: 500_000_000,
      pids_limit: 32,
      credential_transport: 'stdin-once',
      environment_allowlist: ['H2A_ALLOWED_CONTEXT']
    },
    checks,
    deferred_integration_proofs: [
      'real provider credential broker integration',
      'H2A Gateway protected-tool mediation',
      'mandate and passport revocation wiring',
      'runtime evidence-ledger append'
    ]
  };

  await mkdir(resolve(evidencePath, '..'), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8' });
  process.stdout.write(`H2A_CONTAINMENT_PROOF_OK ${evidencePath}\n`);
} catch (error) {
  await writeFailureEvidence(error);
  throw error;
} finally {
  await docker(['rm', '--force', containerName], { allowFailure: true });
  await rm(workspace, { recursive: true, force: true });
}

async function proveRestrictedInvocation() {
  const sentinel = randomUUID();
  const marker = await docker([
    'run', '--rm', '--interactive',
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--user', '65534:65534',
    '--pids-limit', '32',
    '--memory', '64m',
    '--cpus', '0.5',
    '--mount', `type=bind,source=${workspace},target=/workspace`,
    '--env', 'H2A_ALLOWED_CONTEXT=phase11-isolation-proof',
    image,
    'sh', '-ec', restrictedInvocationScript()
  ], {
    input: `${sentinel}\n`,
    environment: { H2A_FORBIDDEN_HOST_SECRET: `host-${randomUUID()}` }
  });

  assert(marker.stdout.includes('H2A_RESTRICTED_INVOCATION_OK'), 'restricted invocation marker missing');
  assert((await readFile(join(workspace, 'allowed-write.txt'), 'utf8')).trim() === 'workspace-only', 'assigned workspace write missing');
  pass('assigned-workspace-only', 'The assigned workspace was writable while root and host paths remained unavailable.');
  pass('non-root-read-only-no-socket', 'The process ran as UID 65534 with read-only root, dropped capabilities and no Docker socket.');
  pass('environment-allowlist', 'Only the explicitly allowlisted H2A environment value entered the container.');
  pass('stdin-scoped-credential', 'A one-use credential sentinel entered through stdin and was absent from the child environment and remaining stdin.');
  pass('network-deny-default', 'Outbound network access failed under Docker network mode none.');
}

async function provePolicyAndCancellation() {
  const created = await docker([
    'create', '--name', containerName,
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--user', '65534:65534',
    '--pids-limit', '32',
    '--memory', '64m',
    '--cpus', '0.5',
    '--mount', `type=bind,source=${workspace},target=/workspace`,
    image,
    'sh', '-ec', 'sleep 300 & wait'
  ]);
  assert(created.stdout.trim().length > 0, 'container creation returned no ID');

  const inspect = JSON.parse((await docker(['inspect', containerName])).stdout)[0];
  const workspaceMounts = inspect.Mounts.filter((mount) => mount.Destination === '/workspace');
  assert(inspect.Config.User === '65534:65534', 'container user policy mismatch');
  assert(inspect.HostConfig.ReadonlyRootfs === true, 'root filesystem is not read-only');
  assert(inspect.HostConfig.Privileged === false, 'container is privileged');
  assert(inspect.HostConfig.NetworkMode === 'none', 'network mode is not none');
  assert(inspect.HostConfig.Memory === 67_108_864, 'memory limit mismatch');
  assert(inspect.HostConfig.NanoCpus === 500_000_000, 'CPU limit mismatch');
  assert(inspect.HostConfig.PidsLimit === 32, 'PID limit mismatch');
  assert(inspect.HostConfig.CapDrop?.includes('ALL'), 'ALL capabilities were not dropped');
  assert(inspect.HostConfig.SecurityOpt?.includes('no-new-privileges'), 'no-new-privileges is absent');
  assert(workspaceMounts.length === 1 && workspaceMounts[0].RW === true, 'assigned workspace mount mismatch');
  assert(inspect.Mounts.length === 1, 'unexpected container mount detected');
  pass('inspect-policy-match', 'Docker inspect matched every declared user, mount, privilege, network and resource control.');

  await docker(['start', containerName]);
  const running = JSON.parse((await docker(['inspect', containerName])).stdout)[0];
  assert(running.State.Running === true, 'cancellation fixture did not start');
  const processList = (await docker(['top', containerName, '-eo', 'pid,comm'])).stdout;
  assert(processList.includes('sleep'), 'child process was not present before cancellation');

  await docker(['stop', '--time', '1', containerName]);
  const stopped = JSON.parse((await docker(['inspect', containerName])).stdout)[0];
  assert(stopped.State.Running === false, 'container remained running after cancellation');
  await docker(['rm', containerName]);
  const residue = await docker(['ps', '--all', '--quiet', '--filter', `name=^/${containerName}$`]);
  assert(residue.stdout.trim() === '', 'container residue remained after cancellation');
  pass('cancellation-process-tree-cleanup', 'Docker stop terminated the process namespace and removal left no container residue.');
}

function restrictedInvocationScript() {
  return [
    'test "$(id -u)" = 65534',
    'echo H2A_STEP_IDENTITY_OK',
    'test "${H2A_ALLOWED_CONTEXT:-}" = "phase11-isolation-proof"',
    'test -z "${H2A_FORBIDDEN_HOST_SECRET:-}"',
    'test "$(env | grep -c "^H2A_")" = 1',
    'echo H2A_STEP_ENVIRONMENT_OK',
    'test ! -S /var/run/docker.sock',
    'printf "workspace-only\\n" > /workspace/allowed-write.txt',
    'if touch /blocked-root 2>/dev/null; then exit 20; fi',
    'echo H2A_STEP_FILESYSTEM_OK',
    'if wget -q -T 2 -O - https://example.com >/dev/null 2>&1; then exit 21; fi',
    'echo H2A_STEP_NETWORK_OK',
    'IFS= read -r provider_token',
    'test -n "$provider_token"',
    'unset provider_token',
    "sh -ec 'test -z \"${provider_token:-}\"; ! env | grep -q PROVIDER; if IFS= read -r unexpected; then exit 22; fi'",
    'echo H2A_STEP_CREDENTIAL_OK',
    'echo H2A_RESTRICTED_INVOCATION_OK'
  ].join('\n');
}

async function ensureImage() {
  const local = await docker(['image', 'inspect', image], { allowFailure: true });
  if (local.code !== 0) {
    await docker(['pull', image]);
  }
  const inspected = JSON.parse((await docker(['image', 'inspect', image])).stdout)[0];
  assert(inspected.RepoDigests?.includes(image), 'local image digest does not match the approved pin');
  pass('immutable-image-pin', `Container image resolved to ${image}.`);
}

async function dockerEvidence() {
  const version = JSON.parse((await docker(['version', '--format', '{{json .}}'])).stdout);
  return {
    cli_path: dockerPath,
    client_version: version.Client.Version,
    server_version: version.Server.Version,
    platform: version.Server.Os,
    architecture: version.Server.Arch
  };
}

async function findDocker() {
  const candidates = process.platform === 'win32'
    ? [
        join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
        join(process.env.ProgramFiles ?? '', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe')
      ]
    : ['/usr/bin/docker', '/usr/local/bin/docker'];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next approved installation location.
    }
  }
  throw new Error('Docker CLI was not found in an approved installation location.');
}

async function docker(args, options = {}) {
  const environment = {
    ...process.env,
    PATH: `${dockerBin}${delimiter}${process.env.PATH ?? ''}`,
    ...options.environment
  };

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(dockerPath, args, { env: environment, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      const result = { code: code ?? 1, stdout, stderr };
      if (result.code === 0 || options.allowFailure) {
        resolvePromise(result);
        return;
      }
      const diagnostic = [stderr.trim(), stdout.trim()].filter(Boolean).join(' | ');
      rejectPromise(new Error(`Docker command failed (${args.slice(0, 3).join(' ')}): ${diagnostic || 'no output'}`));
    });
    child.stdin.end(options.input ?? '');
  });
}

function pass(id, detail) {
  checks.push({ id, result: 'pass', detail });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function writeFailureEvidence(error) {
  const evidence = {
    schema_version: 1,
    kind: 'h2a.phase11.containment-proof',
    execution_id: executionId,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    result: 'fail',
    image,
    checks,
    failure: error instanceof Error ? error.message : String(error)
  };
  await mkdir(resolve(evidencePath, '..'), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8' });
}
