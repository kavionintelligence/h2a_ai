import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import {
  liveProviderStatusSchema,
  type LiveProviderId,
  type LiveProviderStatus,
  type StartLiveRunRequest,
  type TerminalPurpose
} from '@h2a/contracts';

export interface ProviderInvocation {
  executable: string;
  args: string[];
  stdin?: string;
  argumentPolicy: string[];
  version?: string;
}

export interface LiveProviderAdapter {
  readonly provider: LiveProviderId;
  probe(): LiveProviderStatus;
  buildInvocation(request: StartLiveRunRequest): ProviderInvocation;
  buildInteractiveInvocation?(purpose: TerminalPurpose, workspace: string): ProviderInvocation;
  extractSummary(lines: string[]): string;
}

export interface LiveProviderRegistryPort {
  get(provider: LiveProviderId): LiveProviderAdapter;
  probe(provider?: LiveProviderId): LiveProviderStatus[];
}

export class LiveProviderAdapterRegistry implements LiveProviderRegistryPort {
  private readonly adapters = new Map<LiveProviderId, LiveProviderAdapter>();
  private cachedStatuses: LiveProviderStatus[] = [];
  private cacheExpiresAt = 0;

  public constructor(clock: () => Date = () => new Date()) {
    for (const adapter of [new ClaudeCodeAdapter(clock), new CodexCliAdapter(clock), new AntigravityCliAdapter(clock)]) {
      this.adapters.set(adapter.provider, adapter);
    }
  }

  public get(provider: LiveProviderId): LiveProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`Live provider is not allowlisted: ${provider}.`);
    return adapter;
  }

  public probe(provider?: LiveProviderId): LiveProviderStatus[] {
    if (Date.now() >= this.cacheExpiresAt || this.cachedStatuses.length === 0) {
      this.cachedStatuses = [...this.adapters.values()].map((adapter) => adapter.probe());
      this.cacheExpiresAt = Date.now() + 30_000;
    }
    return provider ? this.cachedStatuses.filter((status) => status.provider === provider) : this.cachedStatuses;
  }
}

class ClaudeCodeAdapter implements LiveProviderAdapter {
  public readonly provider = 'claude-code' as const;
  public constructor(private readonly clock: () => Date) {}

  public probe(): LiveProviderStatus {
    const executable = resolveExecutable('claude', [join(home(), '.local', 'bin', 'claude.exe')]);
    return probeExecutable(this.provider, executable, ['--version'], this.clock, 'Official Claude Code CLI found. Authentication is confirmed only by an opt-in live task.');
  }

  public buildInvocation(request: StartLiveRunRequest): ProviderInvocation {
    const status = this.probe();
    if (!status.executable) throw new Error(status.detail);
    const args = [
      '--print', request.prompt,
      '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'plan', '--tools', '',
      '--safe-mode', '--no-session-persistence'
    ];
    if (request.model) args.push('--model', request.model);
    return { executable: status.executable, args, argumentPolicy: ['print', 'stream-json', 'plan-permission', 'tools-disabled', 'safe-mode', 'no-session-persistence'], version: status.version };
  }

  public extractSummary(lines: string[]): string { return extractStructuredText(lines, ['result', 'text']); }

  public buildInteractiveInvocation(purpose: TerminalPurpose): ProviderInvocation {
    const status = this.probe();
    if (!status.executable) throw new Error(status.detail);
    const args = purpose === 'interactive-session'
      ? ['--permission-mode', 'plan', '--safe-mode']
      : [];
    return { executable: status.executable, args, argumentPolicy: purpose === 'interactive-session' ? ['interactive', 'plan-permission', 'safe-mode'] : ['interactive-login-consent'], version: status.version };
  }
}

class CodexCliAdapter implements LiveProviderAdapter {
  public readonly provider = 'openai-codex' as const;
  public constructor(private readonly clock: () => Date) {}

  public probe(): LiveProviderStatus {
    const script = join(appData(), 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    const node = resolveExecutable('node', [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe')]);
    if (!node || !existsSync(script)) return missing(this.provider, 'Official standalone Codex CLI package is not available.', this.clock());
    const result = spawnSync(node, [script, '--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true, env: diagnosticEnvironment() });
    return liveProviderStatusSchema.parse({
      provider: this.provider, health: result.status === 0 ? 'ready' : 'degraded', executable: node,
      version: firstLine(result.stdout), detail: result.status === 0 ? 'Official Codex CLI found. Authentication is confirmed only by an opt-in live task.' : cleanDiagnostic(result.stderr || result.stdout),
      trust_mode: 'connected-observed', checked_at: this.clock().toISOString()
    });
  }

  public buildInvocation(request: StartLiveRunRequest): ProviderInvocation {
    const status = this.probe();
    if (!status.executable) throw new Error(status.detail);
    const script = join(appData(), 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    const args = [script, 'exec', '--json', '--sandbox', 'read-only', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '-C', request.workspace_path];
    if (request.model) args.push('--model', request.model);
    args.push(request.prompt);
    return { executable: status.executable, args, argumentPolicy: ['official-node-entry', 'exec-json', 'read-only', 'ephemeral', 'ignore-user-config', 'workspace-bound'], version: status.version };
  }

  public extractSummary(lines: string[]): string { return extractStructuredText(lines, ['text', 'message']); }

  public buildInteractiveInvocation(purpose: TerminalPurpose, workspace: string): ProviderInvocation {
    const status = this.probe();
    if (!status.executable) throw new Error(status.detail);
    const script = join(appData(), 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    const args = purpose === 'login-consent'
      ? [script, 'login']
      : [script, '--sandbox', 'read-only', '--ask-for-approval', 'untrusted', '--no-alt-screen', '-C', workspace];
    return { executable: status.executable, args, argumentPolicy: purpose === 'login-consent' ? ['official-node-entry', 'login-consent'] : ['official-node-entry', 'interactive', 'read-only', 'approval-untrusted', 'inline-screen', 'workspace-bound'], version: status.version };
  }
}

class AntigravityCliAdapter implements LiveProviderAdapter {
  public readonly provider = 'gemini-antigravity' as const;
  public constructor(private readonly clock: () => Date) {}

  public probe(): LiveProviderStatus {
    const executable = resolveExecutable('agy', [join(localAppData(), 'Microsoft', 'WinGet', 'Links', 'agy.exe')]);
    if (!executable) return missing(this.provider, 'Official Antigravity CLI is not available in PATH or the verified WinGet location.', this.clock());
    const base = probeExecutable(this.provider, executable, ['--version'], this.clock, 'Official Antigravity CLI found. Authentication is confirmed only by an opt-in live task.');
    if (hasIncompatibleAntigravityHook()) {
      return liveProviderStatusSchema.parse({ ...base, health: 'degraded', detail: 'Antigravity is installed, but the enabled telemetry hook contains a Windows-incompatible command. User approval is required before changing that user-level plugin.' });
    }
    return base;
  }

  public buildInvocation(request: StartLiveRunRequest): ProviderInvocation {
    const status = this.probe();
    if (!status.executable) throw new Error(status.detail);
    const args = ['--print', request.prompt, '--output-format', 'stream-json', '--sandbox', '--disable-slash-commands', '--print-timeout', `${request.timeout_seconds}s`];
    if (request.model) args.push('--model', request.model);
    return { executable: status.executable, args, argumentPolicy: ['print', 'stream-json', 'sandbox', 'slash-commands-disabled', 'permission-gated'], version: status.version };
  }

  public extractSummary(lines: string[]): string { return extractStructuredText(lines, ['result', 'text', 'content']); }

  public buildInteractiveInvocation(purpose: TerminalPurpose): ProviderInvocation {
    const status = this.probe();
    if (!status.executable) throw new Error(status.detail);
    const args = purpose === 'interactive-session' ? ['--mode', 'plan', '--sandbox'] : [];
    return { executable: status.executable, args, argumentPolicy: purpose === 'interactive-session' ? ['interactive', 'plan-permission', 'sandbox'] : ['interactive-login-consent'], version: status.version };
  }
}

function probeExecutable(provider: LiveProviderId, executable: string | undefined, args: string[], clock: () => Date, readyDetail: string): LiveProviderStatus {
  if (!executable) return missing(provider, `Official ${provider} executable was not found.`, clock());
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 5000, windowsHide: true, env: diagnosticEnvironment() });
  return liveProviderStatusSchema.parse({
    provider, health: result.status === 0 ? 'ready' : 'degraded', executable,
    version: firstLine(result.stdout || result.stderr), detail: result.status === 0 ? readyDetail : cleanDiagnostic(result.stderr || result.stdout),
    trust_mode: 'connected-observed', checked_at: clock().toISOString()
  });
}

function missing(provider: LiveProviderId, detail: string, clock: Date): LiveProviderStatus {
  return liveProviderStatusSchema.parse({ provider, health: 'dependency-missing', detail, trust_mode: 'connected-observed', checked_at: clock.toISOString() });
}

function resolveExecutable(command: string, candidates: string[]): string | undefined {
  if (process.platform === 'win32') {
    const where = spawnSync('where.exe', [command], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    const match = (where.stdout ?? '').split(/\r?\n/u).map((value) => value.trim()).find((value) => value.toLowerCase().endsWith('.exe') && existsSync(value));
    if (match) return match;
  } else {
    const pathMatch = (process.env.PATH ?? '').split(delimiter).map((entry) => join(entry, command)).find((value) => existsSync(value));
    if (pathMatch) return pathMatch;
  }
  return candidates.find((candidate) => existsSync(candidate));
}

function extractStructuredText(lines: string[], keys: string[]): string {
  const candidates: string[] = [];
  for (const line of lines) {
    try { collectStrings(JSON.parse(line) as unknown, keys, candidates); }
    catch { if (line.trim()) candidates.push(line.trim()); }
  }
  return (candidates.filter(Boolean).at(-1) ?? 'Provider completed without a textual result.').slice(0, 4000);
}

function collectStrings(value: unknown, keys: string[], output: string[]): void {
  if (Array.isArray(value)) { for (const item of value) collectStrings(item, keys, output); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.includes(key) && typeof child === 'string' && child.trim()) output.push(child.trim());
    else collectStrings(child, keys, output);
  }
}

function hasIncompatibleAntigravityHook(): boolean {
  if (process.platform !== 'win32') return false;
  const path = join(home(), '.gemini', 'config', 'plugins', 'googlecloudtools.datacloud_telemetry', 'hooks.json');
  try { return readFileSync(path, 'utf8').includes('; exit 0'); } catch { return false; }
}

function diagnosticEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(['PATH', 'SystemRoot', 'ComSpec', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'].flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
}

function cleanDiagnostic(value: string): string {
  return value.replace(/[\r\n]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 1000) || 'Provider probe failed without diagnostic output.';
}

function firstLine(value: string): string | undefined { return value.trim().split(/\r?\n/u)[0]?.slice(0, 200) || undefined; }
function home(): string { return process.env.USERPROFILE ?? process.env.HOME ?? ''; }
function appData(): string { return process.env.APPDATA ?? join(home(), 'AppData', 'Roaming'); }
function localAppData(): string { return process.env.LOCALAPPDATA ?? join(home(), 'AppData', 'Local'); }
