import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, realpath, rm, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import {
  cancelProjectRunRequestSchema, createProjectAssignmentRequestSchema, createProjectGoalRequestSchema, fetchResearchSourceRequestSchema,
  integrateProjectRequestSchema, projectAssignmentSchema, projectDeliveryStateSchema, projectGoalSchema,
  projectIntegrationSchema, projectMailboxRecordSchema, projectProviderRunSchema, projectRegistrationSchema, projectSignatureSchema,
  projectReviewBundleSchema, projectValidationReceiptSchema, registerProjectRequestSchema, researchSourceSchema, runProjectValidationRequestSchema,
  runProjectAssignmentRequestSchema, worktreeLeaseSchema,
  type CancelProjectRunRequest, type CreateProjectAssignmentRequest, type CreateProjectGoalRequest, type FetchResearchSourceRequest,
  type IntegrateProjectRequest, type ProjectAssignment, type ProjectDeliveryState,
  type ProjectMailboxRecord, type ProjectRegistration, type ProjectSignature,
  type RegisterProjectRequest, type RunProjectAssignmentRequest, type RunProjectValidationRequest, type WorktreeLease
} from '@h2a/contracts';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
export * from './goalWorkGraphCoordinator';

const execFileAsync = promisify(execFile);
const emptyState: ProjectDeliveryState = { projects: [], goals: [], assignments: [], worktrees: [], sources: [], messages: [], validations: [], runs: [], review_bundles: [], integrations: [], trust_ceiling: 'connected-observed' };
const keySchema = z.object({ private_key_pem: z.string(), public_key_pem: z.string() }).strict();

export interface ProjectApprovalPort {
  assertApproved(input: { approval_event_id: string; effect_hash: string; project_id: string; goal_id: string }): Promise<void>;
}

export interface ProviderWorkspaceProfile {
  provider: ProjectAssignment['provider']; executable: string; args: string[]; cwd: string;
  approval_mode: 'provider-review' | 'framework-policy'; sandbox_mode: 'workspace-write'; trust_ceiling: 'connected-observed';
}

export function providerWorkspaceProfile(assignment: ProjectAssignment, lease: WorktreeLease): ProviderWorkspaceProfile {
  if (assignment.assignment_id !== lease.assignment_id || !['active', 'dirty'].includes(lease.status)) throw new Error('Provider workspace lease is not active for this assignment.');
  if (assignment.provider === 'openai-codex') return { provider: assignment.provider, executable: 'codex', args: ['exec', '--sandbox', 'workspace-write', '--ask-for-approval', 'untrusted', '--cd', lease.worktree_path], cwd: lease.worktree_path, approval_mode: 'provider-review', sandbox_mode: 'workspace-write', trust_ceiling: 'connected-observed' };
  if (assignment.provider === 'claude-code') return { provider: assignment.provider, executable: 'claude', args: ['--permission-mode', 'default', '--allowedTools', 'Read,Glob,Grep,Edit,Write'], cwd: lease.worktree_path, approval_mode: 'provider-review', sandbox_mode: 'workspace-write', trust_ceiling: 'connected-observed' };
  if (assignment.provider === 'gemini-antigravity') return { provider: assignment.provider, executable: 'agy', args: ['--sandbox'], cwd: lease.worktree_path, approval_mode: 'provider-review', sandbox_mode: 'workspace-write', trust_ceiling: 'connected-observed' };
  return { provider: assignment.provider, executable: 'h2a-framework-connector', args: ['--workspace', lease.worktree_path], cwd: lease.worktree_path, approval_mode: 'framework-policy', sandbox_mode: 'workspace-write', trust_ceiling: 'connected-observed' };
}

export class ProjectDeliveryRepository {
  private readonly state: VersionedJsonRepository<'h2a.project-delivery', ProjectDeliveryState>;
  private readonly key: VersionedJsonRepository<'h2a.project-signing-key', z.infer<typeof keySchema>>;
  public constructor(private readonly dataPath: string) {
    const store = new AtomicFileStore(dataPath);
    this.state = new VersionedJsonRepository(store, 'projects/project-delivery.json', 'h2a.project-delivery', projectDeliveryStateSchema, { initialData: emptyState });
    this.key = new VersionedJsonRepository(store, 'settings/project-signing-key.json', 'h2a.project-signing-key', keySchema, { initialData: createSigningKey() });
  }
  public initialize(): Promise<ProjectDeliveryState> { return this.state.read(); }
  public read(): Promise<ProjectDeliveryState> { return this.state.read(); }
  public write(value: ProjectDeliveryState): Promise<ProjectDeliveryState> { return this.state.write(projectDeliveryStateSchema.parse(value)); }
  public worktreeRoot(): string {
    const durableRoot = process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'H2A') : resolve(homedir(), '.h2a');
    return resolve(durableRoot, 'worktrees', compactHash(this.dataPath, 16));
  }
  public async sign(value: unknown, signedBy: string): Promise<ProjectSignature> {
    const key = await this.key.read();
    const canonical = canonicalize(value);
    return projectSignatureSchema.parse({ algorithm: 'Ed25519', signedBy, canonicalHash: hashCanonical(value), value: `ed25519:${sign(null, Buffer.from(canonical, 'utf8'), key.private_key_pem).toString('base64')}` });
  }
}

export class ProjectWorkspaceService {
  public constructor(private readonly repository: ProjectDeliveryRepository, private readonly evidence: EvidenceLedgerPort, private readonly clock: () => Date = () => new Date()) {}
  public async initialize(): Promise<ProjectDeliveryState> {
    const state = await this.repository.initialize(); const interrupted = state.runs.filter((run) => run.status === 'running');
    if (interrupted.length === 0) return state; const now = this.clock().toISOString();
    await Promise.all(interrupted.map(async (run) => { if (run.process_id) await terminateProcessTree(run.process_id); }));
    const next = { ...state, runs: state.runs.map((run) => run.status === 'running' ? projectProviderRunSchema.parse({ ...run, status: 'interrupted', reason_code: 'HOST_PROCESS_RESTARTED', process_id: null, completed_at: now }) : run), assignments: state.assignments.map((item) => interrupted.some((run) => run.assignment_id === item.assignment_id) ? projectAssignmentSchema.parse({ ...item, status: 'blocked', reason_code: 'HOST_PROCESS_RESTARTED', updated_at: now }) : item) };
    await this.repository.write(next); for (const run of interrupted) await this.evidence.append(projectEvent(run.run_id, 'PROJECT_PROVIDER_INTERRUPTED', { assignment_id: run.assignment_id, reason_code: 'HOST_PROCESS_RESTARTED' })); return this.repository.read();
  }
  public getState(): Promise<ProjectDeliveryState> { return this.repository.read(); }
  public async register(request: RegisterProjectRequest): Promise<ProjectDeliveryState> {
    const input = registerProjectRequestSchema.parse(request);
    const canonicalRoot = await canonicalDirectory(input.root_path);
    const state = await this.repository.read();
    const duplicate = state.projects.find((item) => samePath(item.canonical_root, canonicalRoot));
    if (duplicate) return state;
    const git = await inspectGit(canonicalRoot, input.base_branch);
    const project = projectRegistrationSchema.parse({
      project_id: `project_${randomUUID()}`, display_name: input.display_name, canonical_root: canonicalRoot,
      repository_mode: git ? 'git' : 'read-only-non-git', git_common_dir: git?.commonDir ?? null,
      base_branch: git?.branch ?? null, base_revision: git?.revision ?? null,
      protected_paths: normalizePatterns(input.protected_paths), allowed_commands: input.allowed_commands,
      network_hosts: [...new Set(input.network_hosts.map(normalizeHost))],
      fallback_limitations: git ? [] : ['Editing, worktree leasing, validation, commit, and integration are disabled until this root is a Git repository.'],
      registered_at: this.clock().toISOString()
    });
    await this.repository.write({ ...state, projects: [...state.projects, project] });
    await this.evidence.append(projectEvent(project.project_id, 'PROJECT_REGISTERED', { repository_mode: project.repository_mode, root_hash: hashCanonical(project.canonical_root), base_revision: project.base_revision }));
    return this.repository.read();
  }
}

export interface ProjectExecutionAuthorityPort { assertActive(assignment: ProjectAssignment): Promise<void>; }
export type ProjectInvocationBuilder = (profile: ProviderWorkspaceProfile, prompt: string) => { executable: string; args: string[] };

export class ProjectProviderExecutionService {
  private readonly children = new Map<string, ChildProcess>();
  private readonly cancelling = new Set<string>();
  public constructor(private readonly repository: ProjectDeliveryRepository, private readonly evidence: EvidenceLedgerPort, private readonly leases: WorktreeLeaseService, private readonly authority: ProjectExecutionAuthorityPort, private readonly clock: () => Date = () => new Date(), private readonly invocationBuilder: ProjectInvocationBuilder = providerInvocation) {}
  public async run(request: RunProjectAssignmentRequest): Promise<ProjectDeliveryState> {
    const input = runProjectAssignmentRequestSchema.parse(request); const state = await this.repository.read(); const assignment = requireAssignment(state, input.assignment_id); const goal = state.goals.find((item) => item.goal_id === assignment.goal_id); if (!goal) throw new Error('Signed project goal does not exist.');
    if (assignment.kind === 'research') throw new Error('Research assignments use the governed research connector, not an unrestricted provider process.');
    if (state.runs.some((item) => item.assignment_id === assignment.assignment_id && item.status === 'running')) throw new Error('Assignment already has a running provider process.');
    await this.authority.assertActive(assignment); const lease = requireLease(state, assignment.assignment_id); const profile = providerWorkspaceProfile(assignment, lease);
    const sources = state.sources.filter((source) => state.assignments.some((dependency) => assignment.depends_on.includes(dependency.assignment_id) && source.assignment_id === dependency.assignment_id));
    const prompt = buildProviderPrompt(goal.objective, assignment, sources.map((source) => ({ title: source.title, url: source.url, excerpt: source.excerpt, content_hash: source.content_hash })));
    const now = this.clock().toISOString(); const run = projectProviderRunSchema.parse({ run_id: `project_run_${randomUUID()}`, project_id: assignment.project_id, assignment_id: assignment.assignment_id, provider: assignment.provider, status: 'running', prompt_hash: sha256(prompt), output_hash: null, reason_code: null, process_id: null, started_at: now, completed_at: null });
    await this.repository.write({ ...state, runs: [...state.runs, run], assignments: replaceAssignment(state.assignments, assignment.assignment_id, { status: 'working', reason_code: null, updated_at: now }) });
    const invocation = this.invocationBuilder(profile, prompt); const child = spawn(invocation.executable, invocation.args, { cwd: profile.cwd, env: { ...process.env, H2A_PROJECT_ID: assignment.project_id, H2A_PROJECT_ASSIGNMENT_ID: assignment.assignment_id }, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    this.children.set(run.run_id, child); const chunks: Buffer[] = []; child.stdout.on('data', (value: Buffer) => chunks.push(value)); child.stderr.on('data', (value: Buffer) => chunks.push(value));
    const withPid = await this.repository.read(); await this.repository.write({ ...withPid, runs: withPid.runs.map((item) => item.run_id === run.run_id ? { ...item, process_id: child.pid ?? null } : item) });
    await this.evidence.append(projectEvent(run.run_id, 'PROJECT_PROVIDER_STARTED', { assignment_id: assignment.assignment_id, provider: assignment.provider, prompt_hash: run.prompt_hash, worktree_hash: hashCanonical(lease.worktree_path) }, goal.trace_id));
    const result = await new Promise<{ code: number; signal: NodeJS.Signals | null }>((resolveResult) => { child.once('error', () => resolveResult({ code: 1, signal: null })); child.once('close', (code, signal) => resolveResult({ code: code ?? 1, signal })); }); this.children.delete(run.run_id);
    const outputHash = sha256(Buffer.concat(chunks).toString('utf8')); let refreshed = await this.leases.refresh(assignment.assignment_id); const refreshedLease = requireLease(refreshed, assignment.assignment_id); const cancelled = result.signal !== null || this.cancelling.delete(run.run_id); const delivered = refreshedLease.changed_files.length > 0 && !['failed', 'conflicted'].includes(refreshedLease.status);
    const status = cancelled ? 'cancelled' as const : result.code === 0 && delivered ? 'succeeded' as const : 'failed' as const; const reason = cancelled ? 'OPERATOR_CANCELLED' : result.code !== 0 ? 'PROVIDER_EXIT_NONZERO' : !delivered ? 'NO_REPOSITORY_DELIVERY' : null; const completed = this.clock().toISOString();
    refreshed = await this.repository.write({ ...refreshed, runs: refreshed.runs.map((item) => item.run_id === run.run_id ? projectProviderRunSchema.parse({ ...item, status, output_hash: outputHash, reason_code: reason, process_id: null, completed_at: completed }) : item), assignments: replaceAssignment(refreshed.assignments, assignment.assignment_id, { status: status === 'succeeded' ? 'review' : status === 'cancelled' ? 'cancelled' : 'blocked', reason_code: reason, updated_at: completed }) });
    await this.evidence.append(projectEvent(run.run_id, status === 'succeeded' ? 'PROJECT_PROVIDER_DELIVERED' : 'PROJECT_PROVIDER_FAILED', { assignment_id: assignment.assignment_id, status, reason_code: reason, output_hash: outputHash, changed_file_hashes: refreshedLease.changed_files.map((file) => hashCanonical(file)) }, goal.trace_id)); return refreshed;
  }
  public async cancel(request: CancelProjectRunRequest): Promise<ProjectDeliveryState> {
    const input = cancelProjectRunRequestSchema.parse(request); const state = await this.repository.read(); const run = state.runs.find((item) => item.run_id === input.run_id && item.status === 'running'); if (!run) throw new Error('Running project provider process does not exist.'); const assignment = requireAssignment(state, run.assignment_id); await this.authority.assertActive(assignment); const child = this.children.get(run.run_id); if (!child?.pid) throw new Error('Provider process is not attached to this host generation.'); this.cancelling.add(run.run_id); await terminateProcessTree(child.pid); return this.repository.read();
  }
  public async shutdown(): Promise<void> {
    await Promise.all([...this.children.entries()].map(async ([runId, child]) => {
      if (!child.pid) return;
      this.cancelling.add(runId);
      await terminateProcessTree(child.pid);
    }));
  }
}

export class ProjectTaskCoordinator {
  public constructor(private readonly repository: ProjectDeliveryRepository, private readonly evidence: EvidenceLedgerPort, private readonly clock: () => Date = () => new Date()) {}
  public async createGoal(request: CreateProjectGoalRequest): Promise<ProjectDeliveryState> {
    const input = createProjectGoalRequestSchema.parse(request); const state = await this.repository.read();
    requireProject(state, input.project_id);
    const unsigned = { goal_id: `goal_${randomUUID()}`, project_id: input.project_id, objective: input.objective, expected_outputs: input.expected_outputs, created_by: input.created_by, trace_id: input.trace_id, created_at: this.clock().toISOString() };
    const goal = projectGoalSchema.parse({ ...unsigned, signature: await this.repository.sign(unsigned, input.created_by) });
    await this.repository.write({ ...state, goals: [...state.goals, goal] });
    await this.evidence.append(projectEvent(goal.goal_id, 'PROJECT_GOAL_SIGNED', { project_id: goal.project_id, goal_hash: goal.signature.canonicalHash }, goal.trace_id));
    return this.repository.read();
  }
  public async createAssignment(request: CreateProjectAssignmentRequest): Promise<ProjectDeliveryState> {
    const input = createProjectAssignmentRequestSchema.parse(request); const state = await this.repository.read();
    const project = requireProject(state, input.project_id); const goal = state.goals.find((item) => item.goal_id === input.goal_id && item.project_id === project.project_id);
    if (!goal) throw new Error('Signed project goal does not exist.');
    for (const dependency of input.depends_on) if (!state.assignments.some((item) => item.assignment_id === dependency && item.goal_id === goal.goal_id)) throw new Error('Assignment dependency is outside the signed goal.');
    const allowedPaths = normalizePatterns(input.allowed_paths);
    if (input.kind === 'edit' && allowedPaths.length === 0) throw new Error('Editing assignments require an explicit path scope.');
    if (allowedPaths.some((pattern) => project.protected_paths.some((protectedPath) => patternsOverlap(pattern, protectedPath)))) throw new Error('Assignment path scope intersects a protected path.');
    if (input.network_hosts.some((host) => !project.network_hosts.includes(normalizeHost(host)))) throw new Error('Assignment requests a network host outside project registration.');
    if (input.validation_commands.some((command) => !project.allowed_commands.some((allowed) => allowed.command_id === command))) throw new Error('Assignment requests a validation command outside project registration.');
    const now = this.clock().toISOString(); const unsigned = { ...input, allowed_paths: allowedPaths, network_hosts: input.network_hosts.map(normalizeHost), assignment_id: `project_assignment_${randomUUID()}`, status: 'ready' as const, reason_code: null, created_at: now, updated_at: now };
    const assignment = projectAssignmentSchema.parse({ ...unsigned, signature: await this.repository.sign(unsigned, input.agent_id) });
    await this.repository.write({ ...state, assignments: [...state.assignments, assignment] });
    await this.evidence.append(projectEvent(assignment.assignment_id, 'PROJECT_ASSIGNMENT_SIGNED', { goal_id: assignment.goal_id, assignment_hash: assignment.signature.canonicalHash, passport_id: assignment.passport_id, runtime_session_id: assignment.runtime_session_id, mandate_id: assignment.mandate_id }));
    return this.repository.read();
  }
  public async message(input: Omit<ProjectMailboxRecord, 'message_id' | 'created_at' | 'body_hash' | 'signature'> & { body: string }): Promise<ProjectDeliveryState> {
    const state = await this.repository.read(); const assignment = state.assignments.find((item) => item.assignment_id === input.assignment_id);
    if (!assignment || assignment.agent_id !== input.from_agent_id) throw new Error('Mailbox sender is not bound to the assignment.');
    if (input.to_assignment_id && !state.assignments.some((item) => item.assignment_id === input.to_assignment_id && item.goal_id === assignment.goal_id)) throw new Error('Mailbox destination is outside the signed goal.');
    const { body, ...envelope } = input;
    const unsigned = { ...envelope, message_id: `project_message_${randomUUID()}`, body_hash: hashCanonical(body), created_at: this.clock().toISOString() };
    const record = projectMailboxRecordSchema.parse({ ...unsigned, signature: await this.repository.sign(unsigned, input.from_agent_id) });
    await this.repository.write({ ...state, messages: [...state.messages, record] });
    await this.evidence.append(projectEvent(record.message_id, 'PROJECT_HANDOFF_RECORDED', { assignment_id: record.assignment_id, kind: record.kind, body_hash: record.body_hash, references: record.references }));
    return this.repository.read();
  }
}

export class WorktreeLeaseService {
  public constructor(private readonly repository: ProjectDeliveryRepository, private readonly evidence: EvidenceLedgerPort, private readonly clock: () => Date = () => new Date()) {}
  public async create(assignmentId: string): Promise<ProjectDeliveryState> {
    const state = await this.repository.read(); const assignment = requireAssignment(state, assignmentId); const project = requireProject(state, assignment.project_id);
    if (assignment.kind !== 'edit' && assignment.kind !== 'integration') throw new Error('Research-only assignments cannot acquire editing worktrees.');
    if (project.repository_mode !== 'git' || !project.base_revision) throw new Error('Git worktrees are unavailable for a non-Git project.');
    if (state.worktrees.some((item) => item.assignment_id === assignmentId && item.status !== 'cleaned')) throw new Error('Assignment already owns a retained worktree.');
    // Signed state retains the full IDs; compact filesystem names avoid the
    // Windows legacy path ceiling for deeply nested demonstration data roots.
    const projectKey = compactHash(project.project_id, 12);
    const assignmentKey = compactHash(assignment.assignment_id, 20);
    const worktreePath = resolve(this.repository.worktreeRoot(), `p-${projectKey}`, `a-${assignmentKey}`);
    const branch = `h2a/a-${assignmentKey}`;
    await mkdir(resolve(worktreePath, '..'), { recursive: true });
    await git(project.canonical_root, ['worktree', 'add', '-b', branch, worktreePath, project.base_revision]);
    const now = this.clock().toISOString(); const lease = worktreeLeaseSchema.parse({ lease_id: `lease_${randomUUID()}`, project_id: project.project_id, assignment_id: assignment.assignment_id, branch, worktree_path: await canonicalDirectory(worktreePath), base_revision: project.base_revision, status: 'active', changed_files: [], head_revision: project.base_revision, created_at: now, updated_at: now });
    await this.repository.write({ ...state, worktrees: [...state.worktrees, lease], assignments: replaceAssignment(state.assignments, assignment.assignment_id, { status: 'working', updated_at: now }) });
    await this.evidence.append(projectEvent(lease.lease_id, 'PROJECT_WORKTREE_LEASED', { assignment_id: assignment.assignment_id, base_revision: lease.base_revision, branch_hash: hashCanonical(branch), path_hash: hashCanonical(lease.worktree_path) }));
    return this.refresh(assignmentId);
  }
  public async refresh(assignmentId: string): Promise<ProjectDeliveryState> {
    const state = await this.repository.read(); const assignment = requireAssignment(state, assignmentId); const lease = requireLease(state, assignmentId);
    const changed = await changedFiles(lease.worktree_path);
    const violation = changed.find((file) => !assignment.allowed_paths.some((pattern) => matchesPattern(file, pattern)));
    const project = requireProject(state, assignment.project_id);
    const protectedViolation = changed.find((file) => project.protected_paths.some((pattern) => matchesPattern(file, pattern)));
    const conflict = await hasConflicts(lease.worktree_path);
    const status = violation || protectedViolation ? 'failed' : conflict ? 'conflicted' : changed.length > 0 ? 'dirty' : lease.status === 'integrated' ? 'integrated' : 'active';
    const nextLease = worktreeLeaseSchema.parse({ ...lease, changed_files: changed, status, head_revision: await revision(lease.worktree_path), updated_at: this.clock().toISOString() });
    const reason = protectedViolation ? 'PROTECTED_PATH_EDIT' : violation ? 'PATH_SCOPE_DENIED' : conflict ? 'GIT_CONFLICT' : null;
    const next = { ...state, worktrees: state.worktrees.map((item) => item.lease_id === lease.lease_id ? nextLease : item), assignments: reason ? replaceAssignment(state.assignments, assignment.assignment_id, { status: 'blocked', reason_code: reason, updated_at: this.clock().toISOString() }) : state.assignments };
    await this.repository.write(next);
    if (reason) await this.evidence.append(projectEvent(lease.lease_id, 'PROJECT_WRITE_DENIED', { assignment_id: assignmentId, reason_code: reason, file_hash: hashCanonical(protectedViolation ?? violation) }));
    return this.repository.read();
  }
  public async cleanup(assignmentId: string): Promise<ProjectDeliveryState> {
    const state = await this.refresh(assignmentId); const lease = requireLease(state, assignmentId);
    if (lease.status !== 'integrated' || lease.changed_files.length > 0) throw new Error('Unintegrated, dirty, conflicted, or failed worktrees are retained.');
    const project = requireProject(state, lease.project_id); await git(project.canonical_root, ['worktree', 'remove', lease.worktree_path]); await rm(lease.worktree_path, { recursive: true, force: true });
    const next = { ...state, worktrees: state.worktrees.map((item) => item.lease_id === lease.lease_id ? { ...item, status: 'cleaned' as const, updated_at: this.clock().toISOString() } : item) };
    await this.repository.write(next); await this.evidence.append(projectEvent(lease.lease_id, 'PROJECT_WORKTREE_CLEANED', { assignment_id: assignmentId })); return this.repository.read();
  }
}

export class ResearchConnectorService {
  public constructor(private readonly repository: ProjectDeliveryRepository, private readonly evidence: EvidenceLedgerPort, private readonly fetcher: typeof fetch = fetch, private readonly clock: () => Date = () => new Date()) {}
  public async fetch(request: FetchResearchSourceRequest): Promise<ProjectDeliveryState> {
    const input = fetchResearchSourceRequestSchema.parse(request); const state = await this.repository.read(); const assignment = requireAssignment(state, input.assignment_id); const project = requireProject(state, assignment.project_id);
    if (assignment.kind !== 'research') throw new Error('Only a research assignment may use the governed research connector.');
    const url = new URL(input.url); const host = normalizeHost(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(host))) throw new Error('Research retrieval requires HTTPS or an approved loopback test endpoint.');
    if (!assignment.network_hosts.includes(host) || !project.network_hosts.includes(host)) throw new Error('NETWORK_SCOPE_DENIED');
    const response = await this.fetcher(url, { redirect: 'error', headers: { 'User-Agent': 'H2A-Governed-Research/0.1' } });
    if (!response.ok) throw new Error(`Research source returned HTTP ${response.status}.`);
    const body = await response.text(); if (body.length > 2_000_000) throw new Error('Research source exceeds the 2 MB retrieval limit.');
    const title = body.match(/<title[^>]*>([^<]+)<\/title>/iu)?.[1]?.trim() || basename(url.pathname) || host;
    const excerpt = body.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 1200);
    const unsigned = { source_id: `source_${randomUUID()}`, assignment_id: assignment.assignment_id, url: url.toString(), host, retrieved_at: this.clock().toISOString(), content_hash: sha256(body), classification: input.classification, title: title.slice(0, 300), excerpt, delivered_fields: ['url', 'title', 'excerpt', 'content_hash', 'retrieved_at', 'classification'] as const };
    const source = researchSourceSchema.parse({ ...unsigned, delivered_fields: [...unsigned.delivered_fields], signature: await this.repository.sign(unsigned, assignment.agent_id) });
    const dependents = state.assignments.filter((item) => item.depends_on.includes(assignment.assignment_id));
    const handoffs: ProjectMailboxRecord[] = [];
    for (const dependent of dependents) {
      const message = { message_id: `project_message_${randomUUID()}`, project_id: project.project_id, goal_id: assignment.goal_id, assignment_id: assignment.assignment_id, from_agent_id: assignment.agent_id, to_assignment_id: dependent.assignment_id, kind: 'source-package' as const, subject: `Governed source package for ${dependent.title}`, body_hash: hashCanonical({ source_id: source.source_id, delivered_fields: source.delivered_fields, content_hash: source.content_hash }), references: [source.source_id], created_at: this.clock().toISOString() };
      handoffs.push(projectMailboxRecordSchema.parse({ ...message, signature: await this.repository.sign(message, assignment.agent_id) }));
    }
    await this.repository.write({ ...state, sources: [...state.sources, source], messages: [...state.messages, ...handoffs] });
    await this.evidence.append(projectEvent(source.source_id, 'PROJECT_RESEARCH_FETCHED', { assignment_id: assignment.assignment_id, url_hash: hashCanonical(source.url), content_hash: source.content_hash, classification: source.classification }));
    for (const handoff of handoffs) await this.evidence.append(projectEvent(handoff.message_id, 'PROJECT_HANDOFF_RECORDED', { assignment_id: assignment.assignment_id, to_assignment_id: handoff.to_assignment_id, body_hash: handoff.body_hash, references: handoff.references }));
    return this.repository.read();
  }
}

export class ProjectValidationService {
  public constructor(private readonly repository: ProjectDeliveryRepository, private readonly evidence: EvidenceLedgerPort, private readonly clock: () => Date = () => new Date()) {}
  public async run(request: RunProjectValidationRequest): Promise<ProjectDeliveryState> {
    const input = runProjectValidationRequestSchema.parse(request); const state = await this.repository.read(); const assignment = requireAssignment(state, input.assignment_id); const project = requireProject(state, assignment.project_id); const lease = requireLease(state, assignment.assignment_id);
    if (!assignment.validation_commands.includes(input.command_id)) throw new Error('COMMAND_SCOPE_DENIED');
    const command = project.allowed_commands.find((item) => item.command_id === input.command_id); if (!command) throw new Error('Validation command is not registered.');
    const started = this.clock().toISOString(); let exitCode = 0; let output = '';
    try { const result = await execFileAsync(command.executable, command.args, { cwd: lease.worktree_path, windowsHide: true, timeout: 300_000, maxBuffer: 4_000_000, shell: false }); output = `${result.stdout}\n${result.stderr}`; }
    catch (error) { exitCode = typeof error === 'object' && error && 'code' in error && typeof error.code === 'number' ? error.code : 1; output = error instanceof Error ? error.message : String(error); }
    const unsigned = { receipt_id: `validation_${randomUUID()}`, project_id: project.project_id, assignment_id: assignment.assignment_id, command_id: command.command_id, started_at: started, completed_at: this.clock().toISOString(), exit_code: exitCode, status: exitCode === 0 ? 'passed' as const : 'failed' as const, output_hash: sha256(output), output_excerpt: redact(output).slice(-1800) };
    const receipt = projectValidationReceiptSchema.parse({ ...unsigned, signature: await this.repository.sign(unsigned, 'h2a-project-validator') });
    await this.repository.write({ ...state, validations: [...state.validations, receipt] });
    await this.evidence.append(projectEvent(receipt.receipt_id, 'PROJECT_VALIDATION_RECORDED', { assignment_id: assignment.assignment_id, command_id: command.command_id, status: receipt.status, output_hash: receipt.output_hash })); return this.repository.read();
  }
}

export class ChangeIntegrationService {
  public constructor(private readonly repository: ProjectDeliveryRepository, private readonly evidence: EvidenceLedgerPort, private readonly approval: ProjectApprovalPort, private readonly clock: () => Date = () => new Date()) {}
  public async effectHash(goalId: string, assignmentIds: string[]): Promise<string> {
    return (await this.effectDetails(goalId, assignmentIds)).effectHash;
  }
  public async prepareReview(goalId: string, assignmentIds: string[]): Promise<{ state: ProjectDeliveryState; reviewBundleId: string; effectHash: string }> {
    const details = await this.effectDetails(goalId, assignmentIds); const state = await this.repository.read();
    const existing = [...state.review_bundles].reverse().find((item) => item.goal_id === goalId && item.effect_hash === details.effectHash);
    if (existing) return { state, reviewBundleId: existing.review_bundle_id, effectHash: existing.effect_hash };
    const validationReceiptIds = state.validations.filter((receipt) => assignmentIds.includes(receipt.assignment_id) && receipt.status === 'passed').map((receipt) => receipt.receipt_id).sort();
    const unsigned = { review_bundle_id: `project_review_${randomUUID()}`, project_id: details.projectId, goal_id: goalId, assignment_ids: details.assignmentIds, effect_hash: details.effectHash, diff_hashes: details.diffHashes, validation_receipt_ids: validationReceiptIds, created_at: this.clock().toISOString() };
    const bundle = projectReviewBundleSchema.parse({ ...unsigned, signature: await this.repository.sign(unsigned, 'h2a-project-review-broker') });
    const next = await this.repository.write({ ...state, review_bundles: [...state.review_bundles, bundle] });
    await this.evidence.append(projectEvent(bundle.review_bundle_id, 'PROJECT_REVIEW_BUNDLE_SIGNED', { goal_id: goalId, effect_hash: bundle.effect_hash, diff_hashes: bundle.diff_hashes, validation_receipt_ids: bundle.validation_receipt_ids }));
    return { state: next, reviewBundleId: bundle.review_bundle_id, effectHash: bundle.effect_hash };
  }
  public async integrate(request: IntegrateProjectRequest): Promise<ProjectDeliveryState> {
    const input = integrateProjectRequestSchema.parse(request); const state = await this.repository.read(); const goal = state.goals.find((item) => item.goal_id === input.goal_id); if (!goal) throw new Error('Signed project goal does not exist.'); const project = requireProject(state, goal.project_id);
    const assignments = input.assignment_ids.map((idValue) => requireAssignment(state, idValue));
    if (assignments.some((item) => item.goal_id !== goal.goal_id)) throw new Error('Integration assignment is outside the signed goal.');
    const leases = assignments.filter((item) => item.kind !== 'research').map((item) => requireLease(state, item.assignment_id));
    if (leases.some((lease) => ['conflicted', 'failed', 'retained', 'cleaned'].includes(lease.status))) throw new Error('A worktree is not eligible for integration.');
    if (leases.some((lease) => lease.changed_files.length === 0)) throw new Error('Provider completion without a matching repository diff is rejected.');
    const ownership = new Map<string, string>();
    for (const lease of leases) for (const file of lease.changed_files) {
      const existing = ownership.get(file);
      if (existing && existing !== lease.assignment_id) {
        const now = this.clock().toISOString();
        await this.repository.write({ ...state, worktrees: state.worktrees.map((item) => [existing, lease.assignment_id].includes(item.assignment_id) ? { ...item, status: 'conflicted' as const, updated_at: now } : item), assignments: state.assignments.map((item) => [existing, lease.assignment_id].includes(item.assignment_id) ? { ...item, status: 'blocked' as const, reason_code: 'GIT_CONFLICT', updated_at: now } : item) });
        await this.evidence.append(projectEvent(lease.lease_id, 'PROJECT_INTEGRATION_CONFLICT', { file_hash: hashCanonical(file), assignment_ids: [existing, lease.assignment_id] }));
        throw new Error('Concurrent assignment diffs overlap; integration is blocked without modifying the primary checkout.');
      }
      ownership.set(file, lease.assignment_id);
    }
    for (const assignment of assignments) for (const commandId of assignment.validation_commands) if (!state.validations.some((receipt) => receipt.assignment_id === assignment.assignment_id && receipt.command_id === commandId && receipt.status === 'passed')) throw new Error(`Validation ${commandId} has not passed for ${assignment.assignment_id}.`);
    const actualEffectHash = await this.effectHash(goal.goal_id, input.assignment_ids);
    if (actualEffectHash !== input.expected_effect_hash) throw new Error('Expected integration effect hash does not match the current repository diffs.');
    await this.approval.assertApproved({ approval_event_id: input.approval_event_id, effect_hash: actualEffectHash, project_id: project.project_id, goal_id: goal.goal_id });
    for (const lease of leases) {
      await git(lease.worktree_path, ['add', '--all']); await git(lease.worktree_path, ['commit', '-m', `H2A ${lease.assignment_id}`]);
      const commit = await revision(lease.worktree_path); await git(project.canonical_root, ['merge', '--no-ff', '--no-edit', commit]);
    }
    const integratedCommit = await revision(project.canonical_root); const unsigned = { integration_id: `integration_${randomUUID()}`, project_id: project.project_id, goal_id: goal.goal_id, assignment_ids: input.assignment_ids, approval_event_id: input.approval_event_id, expected_effect_hash: input.expected_effect_hash, integrated_commit: integratedCommit, status: 'integrated' as const, integrated_at: this.clock().toISOString() };
    const integration = projectIntegrationSchema.parse({ ...unsigned, signature: await this.repository.sign(unsigned, 'h2a-change-integrator') });
    const now = this.clock().toISOString(); await this.repository.write({ ...state, integrations: [...state.integrations, integration], assignments: state.assignments.map((item) => input.assignment_ids.includes(item.assignment_id) ? { ...item, status: 'integrated' as const, reason_code: null, updated_at: now } : item), worktrees: state.worktrees.map((item) => input.assignment_ids.includes(item.assignment_id) ? { ...item, status: 'integrated' as const, changed_files: [], head_revision: integratedCommit, updated_at: now } : item) });
    await this.evidence.append(projectEvent(integration.integration_id, 'PROJECT_CHANGE_INTEGRATED', { goal_id: goal.goal_id, approval_event_id: input.approval_event_id, integrated_commit: integration.integrated_commit, integration_hash: integration.signature.canonicalHash }, goal.trace_id)); return this.repository.read();
  }
  private async effectDetails(goalId: string, assignmentIds: string[]): Promise<{ projectId: string; assignmentIds: string[]; diffHashes: Array<{ assignment_id: string; diff_hash: string }>; effectHash: string }> {
    const state = await this.repository.read(); const goal = state.goals.find((item) => item.goal_id === goalId); if (!goal) throw new Error('Signed project goal does not exist.'); const project = requireProject(state, goal.project_id);
    const ids = [...new Set(assignmentIds)].sort(); if (ids.length === 0) throw new Error('At least one assignment is required for integration.');
    const diffHashes = await Promise.all(ids.map(async (assignmentId) => {
      const assignment = requireAssignment(state, assignmentId); if (assignment.goal_id !== goal.goal_id || assignment.project_id !== project.project_id || assignment.kind === 'research') throw new Error('Integration assignment is outside the signed edit goal.');
      const lease = requireLease(state, assignmentId); const diff = await git(lease.worktree_path, ['diff', '--binary', lease.base_revision, '--']); if (!diff.trim()) throw new Error(`Assignment ${assignmentId} has no repository diff to approve.`);
      return { assignment_id: assignmentId, diff_hash: sha256(diff) };
    }));
    return { projectId: project.project_id, assignmentIds: ids, diffHashes, effectHash: hashCanonical({ project_id: project.project_id, goal_id: goal.goal_id, assignments: diffHashes }) };
  }
}

function createSigningKey(): z.infer<typeof keySchema> { const pair = generateKeyPairSync('ed25519'); return { private_key_pem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), public_key_pem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() }; }
function projectEvent(subjectId: string, event: string, payload: Record<string, unknown>, traceId = `tr_project_${subjectId}`) { return { trace_id: traceId, actor: { type: 'system' as const, id: 'h2a-project-delivery' }, subject: { type: 'resource' as const, id: subjectId }, event_type: 'WORKFLOW_COMPLETED' as const, payload: { project_event_type: event, ...payload } }; }
function requireProject(state: ProjectDeliveryState, projectId: string): ProjectRegistration { const value = state.projects.find((item) => item.project_id === projectId); if (!value) throw new Error('Registered project does not exist.'); return value; }
function requireAssignment(state: ProjectDeliveryState, assignmentId: string): ProjectAssignment { const value = state.assignments.find((item) => item.assignment_id === assignmentId); if (!value) throw new Error('Signed project assignment does not exist.'); return value; }
function requireLease(state: ProjectDeliveryState, assignmentId: string): WorktreeLease { const value = state.worktrees.find((item) => item.assignment_id === assignmentId && item.status !== 'cleaned'); if (!value) throw new Error('Active assignment worktree does not exist.'); return value; }
function replaceAssignment(values: ProjectAssignment[], idValue: string, patch: Partial<ProjectAssignment>): ProjectAssignment[] { return values.map((item) => item.assignment_id === idValue ? projectAssignmentSchema.parse({ ...item, ...patch }) : item); }
async function canonicalDirectory(path: string): Promise<string> { if (!isAbsolute(path)) throw new Error('Project root must be absolute.'); const canonical = await realpath(path); if (!(await stat(canonical)).isDirectory()) throw new Error('Project root must be a directory.'); return canonical; }
async function inspectGit(root: string, requestedBranch?: string): Promise<{ commonDir: string; branch: string; revision: string } | null> { try { const commonDir = (await git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim(); const branch = requestedBranch ?? (await git(root, ['branch', '--show-current'])).trim(); if (!branch) throw new Error('Detached HEAD requires an explicit base branch.'); await git(root, ['show-ref', '--verify', `refs/heads/${branch}`]); const rev = (await git(root, ['rev-parse', `${branch}^{commit}`])).trim(); return { commonDir, branch, revision: rev }; } catch { return null; } }
async function git(cwd: string, args: string[]): Promise<string> { const result = await execFileAsync('git', ['-c', 'core.hooksPath=NUL', ...args], { cwd, windowsHide: true, shell: false, timeout: 120_000, maxBuffer: 8_000_000 }); return result.stdout; }
async function revision(root: string): Promise<string> { return (await git(root, ['rev-parse', 'HEAD'])).trim(); }
async function changedFiles(root: string): Promise<string[]> { const output = await git(root, ['status', '--porcelain=v1', '-z']); return output.split('\0').filter(Boolean).map((entry) => entry.slice(3).replaceAll('\\', '/')).sort(); }
async function hasConflicts(root: string): Promise<boolean> { return (await git(root, ['diff', '--name-only', '--diff-filter=U'])).trim().length > 0; }
function normalizePatterns(values: string[]): string[] { return [...new Set(values.map((value) => { const next = value.trim().replaceAll('\\', '/').replace(/^\.\//u, ''); if (!next || next.startsWith('/') || next.includes('../') || next === '..' || /^[A-Za-z]:/u.test(next)) throw new Error('Path scope must be repository-relative and cannot traverse.'); return next; }))]; }
function matchesPattern(file: string, pattern: string): boolean { const normalized = file.replaceAll('\\', '/'); if (pattern.endsWith('/**')) return normalized === pattern.slice(0, -3) || normalized.startsWith(pattern.slice(0, -2)); const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('[^/]*')}$`, 'u'); return regex.test(normalized); }
function patternsOverlap(left: string, right: string): boolean { const leftRoot = left.replace(/\/\*\*$/u, ''); const rightRoot = right.replace(/\/\*\*$/u, ''); return leftRoot === rightRoot || leftRoot.startsWith(`${rightRoot}/`) || rightRoot.startsWith(`${leftRoot}/`); }
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); }
function normalizeHost(value: string): string { return value.trim().toLowerCase().replace(/\.$/u, ''); }
function compactHash(value: string, length: number): string { return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, length); }
function samePath(left: string, right: string): boolean { return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right; }
function sha256(value: string): string { return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`; }
function redact(value: string): string { return value.replace(/(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s]+/giu, '[REDACTED]'); }
function buildProviderPrompt(goal: string, assignment: ProjectAssignment, sources: Array<{ title: string; url: string; excerpt: string; content_hash: string }>): string { return [`Root goal: ${goal}`, `Assignment: ${assignment.objective}`, `Required outputs: ${assignment.output_contract.join('; ')}`, `Allowed repository paths: ${assignment.allowed_paths.join(', ')}`, 'Do not edit outside the allowed paths. Do not access secrets. Make the requested repository changes and leave them uncommitted for H2A review.', sources.length ? `Approved minimized sources:\n${sources.map((source) => `- ${source.title} (${source.url}, ${source.content_hash}): ${source.excerpt}`).join('\n')}` : 'No source package is authorized for this assignment.'].join('\n\n'); }
function providerInvocation(profile: ProviderWorkspaceProfile, prompt: string): { executable: string; args: string[] } { if (profile.provider === 'openai-codex') return { executable: profile.executable, args: [...profile.args, '--json', prompt] }; if (profile.provider === 'claude-code') return { executable: profile.executable, args: [...profile.args, '--print', prompt, '--output-format', 'json'] }; if (profile.provider === 'gemini-antigravity') return { executable: profile.executable, args: [...profile.args, '--print', prompt, '--output-format', 'stream-json', '--disable-slash-commands', '--print-timeout', '300s'] }; throw new Error('Custom framework project execution requires a registered framework policy adapter.'); }
async function terminateProcessTree(pid: number): Promise<void> { if (process.platform === 'win32') { await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }).catch(() => undefined); return; } process.kill(-pid, 'SIGTERM'); }

export function assertPathInside(root: string, target: string): string { const candidate = resolve(root, target); const rel = relative(root, candidate); if (rel.startsWith('..') || isAbsolute(rel) || candidate === root) throw new Error('PATH_TRAVERSAL_DENIED'); if (!candidate.startsWith(`${resolve(root)}${sep}`)) throw new Error('PATH_TRAVERSAL_DENIED'); return candidate; }
