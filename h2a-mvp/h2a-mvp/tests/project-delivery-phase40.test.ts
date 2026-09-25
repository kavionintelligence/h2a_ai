import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer, type Server } from 'node:http';
import { hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';
import {
  ChangeIntegrationService, ProjectDeliveryRepository, ProjectProviderExecutionService, ProjectTaskCoordinator, ProjectValidationService,
  ProjectWorkspaceService, ResearchConnectorService, WorktreeLeaseService, assertPathInside, providerWorkspaceProfile
} from '@h2a/projects';

const exec = promisify(execFile); const roots: string[] = []; const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase40-')); roots.push(root); const projectRoot = join(root, 'website'); const data = join(root, 'data');
  await mkdir(join(projectRoot, 'src'), { recursive: true }); await writeFile(join(projectRoot, 'src', 'index.html'), '<main>Base</main>\n'); await writeFile(join(projectRoot, 'package.json'), '{"scripts":{"build":"node -e \\"process.exit(0)\\"}}\n');
  await git(projectRoot, ['init', '-b', 'main']); await git(projectRoot, ['config', 'user.email', 'h2a@example.invalid']); await git(projectRoot, ['config', 'user.name', 'H2A Test']); await git(projectRoot, ['add', '.']); await git(projectRoot, ['commit', '-m', 'base']);
  const evidence = new LocalAuthorityEventLedger(data); const repository = new ProjectDeliveryRepository(data); roots.push(repository.worktreeRoot()); const workspace = new ProjectWorkspaceService(repository, evidence); const tasks = new ProjectTaskCoordinator(repository, evidence); const leases = new WorktreeLeaseService(repository, evidence); const research = new ResearchConnectorService(repository, evidence); const validation = new ProjectValidationService(repository, evidence);
  await workspace.initialize();
  const registered = await workspace.register({ display_name: 'Disposable website', root_path: projectRoot, protected_paths: ['package.json', '.env', '.git/**'], network_hosts: ['127.0.0.1'], allowed_commands: [{ command_id: 'node-check', executable: process.execPath, args: ['-e', 'process.exit(0)'] }] });
  const project = registered.projects[0]!; const goalState = await tasks.createGoal({ project_id: project.project_id, objective: 'Deliver a polished website with researched content.', expected_outputs: ['website diff', 'source package'], created_by: 'human_operator', trace_id: 'tr_phase40' }); const goal = goalState.goals[0]!;
  return { root, projectRoot, data, evidence, repository, workspace, tasks, leases, research, validation, project, goal };
}

async function assignment(f: Awaited<ReturnType<typeof fixture>>, input: { title: string; kind: 'edit' | 'research'; paths?: string[]; depends?: string[]; provider?: 'claude-code' | 'openai-codex' }) {
  const state = await f.tasks.createAssignment({ goal_id: f.goal.goal_id, project_id: f.project.project_id, title: input.title, objective: input.title, output_contract: ['verified output'], tool_contract: input.kind === 'research' ? ['governed-fetch'] : ['read', 'edit', 'write'], allowed_paths: input.paths ?? [], network_hosts: input.kind === 'research' ? ['127.0.0.1'] : [], validation_commands: input.kind === 'edit' ? ['node-check'] : [], depends_on: input.depends ?? [], agent_id: `agent_${input.title}`, passport_id: `passport_${input.title}`, runtime_session_id: `session_${input.title}`, mandate_id: `mandate_${input.title}`, provider: input.provider ?? 'openai-codex', kind: input.kind }); return state.assignments.at(-1)!;
}

describe('Phase 40 governed project delivery', () => {
  it('registers canonical Git identity and persists signed goals across restart', async () => {
    const f = await fixture(); expect(f.project.repository_mode).toBe('git'); expect(f.project.base_revision).toMatch(/^[0-9a-f]{40}$/u); expect(f.goal.signature.value).toMatch(/^ed25519:/u);
    const restarted = new ProjectDeliveryRepository(f.data); const state = await restarted.initialize(); expect(state.goals[0]?.signature.canonicalHash).toBe(f.goal.signature.canonicalHash); expect((await f.evidence.verify()).status).toBe('verified');
  });

  it('leases isolated worktrees, detects scoped diffs, and exposes safe provider profiles', async () => {
    const f = await fixture(); const edit = await assignment(f, { title: 'UI', kind: 'edit', paths: ['src/**'], provider: 'claude-code' }); let state = await f.leases.create(edit.assignment_id); const lease = state.worktrees[0]!;
    expect(lease.worktree_path).not.toBe(f.projectRoot); expect(lease.worktree_path).not.toContain(edit.assignment_id); expect(lease.worktree_path.length).toBeLessThan(180); await writeFile(join(lease.worktree_path, 'src', 'ui.css'), 'body { color: black; }\n'); state = await f.leases.refresh(edit.assignment_id); expect(state.worktrees[0]?.status).toBe('dirty'); expect(state.worktrees[0]?.changed_files).toEqual(['src/ui.css']);
    const profile = providerWorkspaceProfile(state.assignments[0]!, state.worktrees[0]!); expect(profile.cwd).toBe(lease.worktree_path); expect(profile.args.join(' ')).not.toMatch(/dangerously|bypass|yolo|never/iu); expect(profile.trust_ceiling).toBe('connected-observed');
  });

  it('fails closed on protected scope, traversal, unapproved network, commands, writes, and cleanup', async () => {
    const f = await fixture(); await expect(assignment(f, { title: 'bad', kind: 'edit', paths: ['package.json'] })).rejects.toThrow(/protected/iu);
    expect(() => assertPathInside(f.projectRoot, '../escape')).toThrow('PATH_TRAVERSAL_DENIED');
    await expect(f.tasks.createAssignment({ goal_id: f.goal.goal_id, project_id: f.project.project_id, title: 'bad net', objective: 'bad net', output_contract: ['none'], tool_contract: ['fetch'], allowed_paths: [], network_hosts: ['unapproved.example'], validation_commands: [], depends_on: [], agent_id: 'a', passport_id: 'p', runtime_session_id: 's', mandate_id: 'm', provider: 'openai-codex', kind: 'research' })).rejects.toThrow(/network host/iu);
    const edit = await assignment(f, { title: 'scope', kind: 'edit', paths: ['src/**'] }); let state = await f.leases.create(edit.assignment_id); const lease = state.worktrees[0]!; await writeFile(join(lease.worktree_path, 'README.md'), 'outside\n'); state = await f.leases.refresh(edit.assignment_id); expect(state.assignments[0]?.reason_code).toBe('PATH_SCOPE_DENIED'); await expect(f.leases.cleanup(edit.assignment_id)).rejects.toThrow(/retained/iu); await expect(f.validation.run({ assignment_id: edit.assignment_id, command_id: 'not-allowed' })).rejects.toThrow('COMMAND_SCOPE_DENIED');
  });

  it('retrieves a real approved source and signs only its minimized dependent handoff', async () => {
    const f = await fixture(); const research = await assignment(f, { title: 'Research', kind: 'research' }); const edit = await assignment(f, { title: 'Content', kind: 'edit', paths: ['src/**'], depends: [research.assignment_id] });
    const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<title>Primary source</title><p>Approved public fact.</p>'); }); servers.push(server); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing server address.');
    const state = await f.research.fetch({ assignment_id: research.assignment_id, url: `http://127.0.0.1:${address.port}/source`, classification: 'public' }); expect(state.sources[0]?.content_hash).toMatch(/^sha256:/u); expect(state.sources[0]?.signature.value).toMatch(/^ed25519:/u); expect(state.messages[0]?.to_assignment_id).toBe(edit.assignment_id); expect(state.messages[0]?.references).toEqual([state.sources[0]?.source_id]); expect(JSON.stringify(state.messages[0])).not.toContain('Approved public fact');
  });

  it('hashes mailbox content without persisting the body field', async () => {
    const f = await fixture(); const edit = await assignment(f, { title: 'Mailbox', kind: 'edit', paths: ['src/**'] });
    const body = JSON.stringify({ graph_id: 'graph_test', protected_values: 'excluded' });
    const state = await f.tasks.message({ project_id: f.project.project_id, goal_id: f.goal.goal_id, assignment_id: edit.assignment_id, from_agent_id: edit.agent_id, to_assignment_id: null, kind: 'proposal', subject: 'Approved work-graph route', references: [edit.passport_id, edit.runtime_session_id, edit.mandate_id], body });
    expect(state.messages[0]?.body_hash).toBe(hashCanonical(body));
    expect(state.messages[0]?.signature.value).toMatch(/^ed25519:/u);
    expect(Object.hasOwn(state.messages[0]!, 'body')).toBe(false);
    expect(JSON.stringify(state.messages[0])).not.toContain('graph_test');
  });

  it('persists validation receipts and requires exact human approval plus a real diff for integration', async () => {
    const f = await fixture(); const edit = await assignment(f, { title: 'UI', kind: 'edit', paths: ['src/**'] }); let state = await f.leases.create(edit.assignment_id); const lease = state.worktrees[0]!; await writeFile(join(lease.worktree_path, 'src', 'index.html'), '<main>Delivered</main>\n'); await f.leases.refresh(edit.assignment_id); state = await f.validation.run({ assignment_id: edit.assignment_id, command_id: 'node-check' }); expect(state.validations[0]?.status).toBe('passed');
    let approvalChecked = false; let effect = ''; const integration = new ChangeIntegrationService(f.repository, f.evidence, { assertApproved: async (input) => { approvalChecked = input.approval_event_id === 'evt_human_approval' && input.effect_hash === effect; if (!approvalChecked) throw new Error('approval mismatch'); } }); effect = await integration.effectHash(f.goal.goal_id, [edit.assignment_id]);
    const prepared = await integration.prepareReview(f.goal.goal_id, [edit.assignment_id]); expect(prepared.effectHash).toBe(effect); expect(prepared.reviewBundleId).toMatch(/^project_review_/u); expect(prepared.state.review_bundles[0]?.validation_receipt_ids).toEqual([state.validations[0]?.receipt_id]); expect((await new ProjectDeliveryRepository(f.data).initialize()).review_bundles[0]?.effect_hash).toBe(effect);
    await expect(integration.integrate({ goal_id: f.goal.goal_id, assignment_ids: [edit.assignment_id], approval_event_id: 'evt_human_approval', expected_effect_hash: hashCanonical('stale') })).rejects.toThrow(/does not match/iu);
    state = await integration.integrate({ goal_id: f.goal.goal_id, assignment_ids: [edit.assignment_id], approval_event_id: 'evt_human_approval', expected_effect_hash: effect }); expect(approvalChecked).toBe(true); expect(state.integrations[0]?.integrated_commit).toMatch(/^[0-9a-f]{40}$/u); expect(await readFile(join(f.projectRoot, 'src', 'index.html'), 'utf8')).toContain('Delivered');
  });

  it('supervises repository-backed provider delivery, cancellation, and authority expiry', async () => {
    const f = await fixture(); const edit = await assignment(f, { title: 'Provider', kind: 'edit', paths: ['src/**'] }); await f.leases.create(edit.assignment_id); let authorityActive = true;
    const execution = new ProjectProviderExecutionService(f.repository, f.evidence, f.leases, { assertActive: async () => { if (!authorityActive) throw new Error('MANDATE_EXPIRED'); } }, () => new Date(), () => ({ executable: process.execPath, args: ['-e', "require('fs').writeFileSync('src/provider.txt','real child process delivery\\n')"] }));
    let state = await execution.run({ assignment_id: edit.assignment_id }); expect(state.runs[0]?.status).toBe('succeeded'); expect(state.worktrees[0]?.changed_files).toContain('src/provider.txt'); expect(state.runs[0]?.output_hash).toMatch(/^sha256:/u);
    const second = await assignment(f, { title: 'Cancelled', kind: 'edit', paths: ['src/**'] }); await f.leases.create(second.assignment_id); const slow = new ProjectProviderExecutionService(f.repository, f.evidence, f.leases, { assertActive: async () => undefined }, () => new Date(), () => ({ executable: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'] })); const pending = slow.run({ assignment_id: second.assignment_id });
    let runningId = ''; for (let index = 0; index < 50 && !runningId; index += 1) { await new Promise((resolve) => setTimeout(resolve, 50)); runningId = (await f.repository.read()).runs.find((run) => run.assignment_id === second.assignment_id && run.status === 'running')?.run_id ?? ''; } expect(runningId).not.toBe(''); await slow.cancel({ run_id: runningId, reason: 'test cancellation' }); state = await pending; expect(state.runs.find((run) => run.run_id === runningId)?.status).toBe('cancelled');
    authorityActive = false; await expect(execution.run({ assignment_id: edit.assignment_id })).rejects.toThrow('MANDATE_EXPIRED');
  });

  it('rejects self-reported completion without a diff and blocks overlapping concurrent integration before merge', async () => {
    const f = await fixture(); const first = await assignment(f, { title: 'A', kind: 'edit', paths: ['src/**'] }); const second = await assignment(f, { title: 'B', kind: 'edit', paths: ['src/**'] }); await f.leases.create(first.assignment_id); let state = await f.leases.create(second.assignment_id); const firstLease = state.worktrees.find((item) => item.assignment_id === first.assignment_id)!; const secondLease = state.worktrees.find((item) => item.assignment_id === second.assignment_id)!;
    const integration = new ChangeIntegrationService(f.repository, f.evidence, { assertApproved: async () => undefined }); const effect = hashCanonical('effect'); await expect(integration.integrate({ goal_id: f.goal.goal_id, assignment_ids: [first.assignment_id], approval_event_id: 'evt_approval', expected_effect_hash: effect })).rejects.toThrow(/matching repository diff/iu);
    await writeFile(join(firstLease.worktree_path, 'src', 'index.html'), '<main>A</main>\n'); await writeFile(join(secondLease.worktree_path, 'src', 'index.html'), '<main>B</main>\n'); await f.leases.refresh(first.assignment_id); await f.leases.refresh(second.assignment_id); await f.validation.run({ assignment_id: first.assignment_id, command_id: 'node-check' }); await f.validation.run({ assignment_id: second.assignment_id, command_id: 'node-check' });
    await expect(integration.integrate({ goal_id: f.goal.goal_id, assignment_ids: [first.assignment_id, second.assignment_id], approval_event_id: 'evt_approval', expected_effect_hash: effect })).rejects.toThrow(/overlap/iu); expect(await readFile(join(f.projectRoot, 'src', 'index.html'), 'utf8')).toContain('Base'); state = await f.repository.read(); expect(state.worktrees.filter((item) => [first.assignment_id, second.assignment_id].includes(item.assignment_id)).every((item) => item.status === 'conflicted')).toBe(true);
  });
});

async function git(cwd: string, args: string[]): Promise<void> { await exec('git', args, { cwd, windowsHide: true }); }
