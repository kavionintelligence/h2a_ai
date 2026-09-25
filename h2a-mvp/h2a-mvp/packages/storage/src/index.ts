import {
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  CURRENT_SCHEMA_VERSION,
  agentRuntimeSummarySchema,
  authorityEventSummarySchema,
  createVersionedEnvelopeSchema,
  defaultFeatureConfig,
  appearancePreferencesSchema,
  h2aFeatureConfigSchema,
  workAssignmentSummarySchema,
  type AgentRuntimeSummary,
  type AuthorityEventSummary,
  type H2AFeatureConfig,
  type AppearancePreferences,
  type UpdateAppearancePreferences,
  type VersionedEnvelope,
  type WorkAssignmentSummary,
  type WorkplaceSnapshot
} from '@h2a/contracts';

const fleetSchema = z.array(agentRuntimeSummarySchema);
const assignmentsSchema = z.array(workAssignmentSummarySchema);
const eventSummariesSchema = z.array(authorityEventSummarySchema);

export class LocalDataError extends Error {
  public constructor(
    message: string,
    public readonly relativePath: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'LocalDataError';
  }
}

export interface KeyValueStoragePort {
  read(relativePath: string): Promise<string | undefined>;
  write(relativePath: string, contents: string): Promise<void>;
}

export class AtomicFileStore implements KeyValueStoragePort {
  private static readonly writeQueues = new Map<string, Promise<void>>();
  public readonly rootPath: string;

  public constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
  }

  public async read(relativePath: string): Promise<string | undefined> {
    const targetPath = this.resolvePath(relativePath);
    try {
      return await readFile(targetPath, 'utf8');
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return undefined;
      throw new LocalDataError(`Unable to read local data file: ${relativePath}`, relativePath, {
        cause: error
      });
    }
  }

  public write(relativePath: string, contents: string): Promise<void> {
    const targetPath = this.resolvePath(relativePath);
    const previous = AtomicFileStore.writeQueues.get(targetPath) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(() => this.writeAtomic(relativePath, targetPath, contents));
    AtomicFileStore.writeQueues.set(targetPath, operation);
    return operation.finally(() => {
      if (AtomicFileStore.writeQueues.get(targetPath) === operation) AtomicFileStore.writeQueues.delete(targetPath);
    });
  }

  private async writeAtomic(relativePath: string, targetPath: string, contents: string): Promise<void> {
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    const backupPath = `${targetPath}.bak`;
    await mkdir(dirname(targetPath), { recursive: true });

    let handle;
    try {
      handle = await open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;

      const current = await this.read(relativePath);
      if (current !== undefined) await copyFile(targetPath, backupPath);
      await renameWithContentionRetry(temporaryPath, targetPath);
    } catch (error) {
      if (handle) await handle.close();
      await rm(temporaryPath, { force: true });
      throw new LocalDataError(`Unable to atomically write local data file: ${relativePath}`, relativePath, {
        cause: error
      });
    }
  }

  public resolvePath(relativePath: string): string {
    const targetPath = resolve(this.rootPath, relativePath);
    if (targetPath === this.rootPath || !targetPath.startsWith(`${this.rootPath}${sep}`)) {
      throw new LocalDataError('Local data path escapes the configured repository root.', relativePath);
    }
    return targetPath;
  }
}

async function renameWithContentionRetry(source: string, target: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { await rename(source, target); return; }
    catch (error) {
      const retryable = isNodeError(error) && (error.code === 'EPERM' || error.code === 'EBUSY');
      if (!retryable || attempt === 9) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50 * (attempt + 1)));
    }
  }
}

interface VersionedJsonRepositoryOptions<T> {
  initialData?: T;
  migrateLegacyData?: boolean;
  clock?: () => Date;
}

export class VersionedJsonRepository<K extends string, T> {
  private readonly envelopeSchema: z.ZodType<VersionedEnvelope<K, T>>;
  private readonly clock: () => Date;

  public constructor(
    private readonly store: KeyValueStoragePort,
    public readonly relativePath: string,
    private readonly kind: K,
    private readonly dataSchema: z.ZodType<T>,
    private readonly options: VersionedJsonRepositoryOptions<T> = {}
  ) {
    this.envelopeSchema = createVersionedEnvelopeSchema(kind, dataSchema);
    this.clock = options.clock ?? (() => new Date());
  }

  public async read(): Promise<T> {
    const contents = await this.store.read(this.relativePath);
    if (contents === undefined) {
      if (this.options.initialData === undefined) {
        throw new LocalDataError(`Required local data file is missing: ${this.relativePath}`, this.relativePath);
      }
      return this.write(this.options.initialData);
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(contents) as unknown;
    } catch (error) {
      throw new LocalDataError(`Local data file is not valid JSON: ${this.relativePath}`, this.relativePath, {
        cause: error
      });
    }

    const envelope = this.envelopeSchema.safeParse(decoded);
    if (envelope.success) return envelope.data.data;

    if (this.options.migrateLegacyData) {
      const legacy = this.dataSchema.safeParse(decoded);
      if (legacy.success) return this.write(legacy.data);
    }

    throw new LocalDataError(
      `Local data file failed schema validation: ${this.relativePath}; ${z.prettifyError(envelope.error)}`,
      this.relativePath,
      { cause: envelope.error }
    );
  }

  public async write(data: T): Promise<T> {
    const validated = this.dataSchema.parse(data);
    const envelope: VersionedEnvelope<K, T> = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      kind: this.kind,
      updatedAt: this.clock().toISOString(),
      data: validated
    };
    await this.store.write(this.relativePath, `${JSON.stringify(envelope, null, 2)}\n`);
    return validated;
  }
}

export class LocalJsonlRepository<T> {
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly store: KeyValueStoragePort,
    public readonly relativePath: string,
    private readonly recordSchema: z.ZodType<T>
  ) {}

  public async list(): Promise<T[]> {
    const contents = await this.store.read(this.relativePath);
    if (contents === undefined || contents.trim().length === 0) return [];

    return contents
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0)
      .map((line, index) => {
        try {
          return this.recordSchema.parse(JSON.parse(line) as unknown);
        } catch (error) {
          throw new LocalDataError(
            `Local JSONL record ${index + 1} failed validation: ${this.relativePath}`,
            this.relativePath,
            { cause: error }
          );
        }
      });
  }

  public append(record: T): Promise<T> {
    const operation = this.writeQueue.then(async () => {
      const validated = this.recordSchema.parse(record);
      const current = await this.store.read(this.relativePath) ?? '';
      await this.store.write(this.relativePath, `${current}${JSON.stringify(validated)}\n`);
      return validated;
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

export interface WorkplaceRepository {
  getSnapshot(): Promise<WorkplaceSnapshot>;
  replaceAgents(agents: AgentRuntimeSummary[]): Promise<void>;
  replaceAssignments(assignments: WorkAssignmentSummary[]): Promise<void>;
  replaceRecentEvents(events: AuthorityEventSummary[]): Promise<void>;
}

export class LocalWorkplaceRepository implements WorkplaceRepository {
  public readonly dataPath: string;
  private readonly fleet: VersionedJsonRepository<'h2a.workplace.fleet', AgentRuntimeSummary[]>;
  private readonly assignments: VersionedJsonRepository<
    'h2a.workplace.assignments',
    WorkAssignmentSummary[]
  >;
  private readonly recentEvents: VersionedJsonRepository<
    'h2a.evidence.recent-events',
    AuthorityEventSummary[]
  >;

  public constructor(dataPath: string, clock: () => Date = () => new Date()) {
    this.dataPath = resolve(dataPath);
    const store = new AtomicFileStore(this.dataPath);
    const options = { migrateLegacyData: true, clock };
    this.fleet = new VersionedJsonRepository(
      store,
      'workplace/fleet.json',
      'h2a.workplace.fleet',
      fleetSchema,
      options
    );
    this.assignments = new VersionedJsonRepository(
      store,
      'workplace/assignments.json',
      'h2a.workplace.assignments',
      assignmentsSchema,
      options
    );
    this.recentEvents = new VersionedJsonRepository(
      store,
      'evidence/recent-events.json',
      'h2a.evidence.recent-events',
      eventSummariesSchema,
      options
    );
  }

  public async getSnapshot(): Promise<WorkplaceSnapshot> {
    const [agents, assignments, events] = await Promise.all([
      this.fleet.read(),
      this.assignments.read(),
      this.recentEvents.read()
    ]);
    return { generatedAt: new Date().toISOString(), agents, assignments, events };
  }

  public async replaceAgents(agents: AgentRuntimeSummary[]): Promise<void> {
    await this.fleet.write(agents);
  }

  public async replaceAssignments(assignments: WorkAssignmentSummary[]): Promise<void> {
    await this.assignments.write(assignments);
  }

  public async replaceRecentEvents(events: AuthorityEventSummary[]): Promise<void> {
    await this.recentEvents.write(events);
  }
}

export interface FeatureConfigRepository {
  get(): Promise<H2AFeatureConfig>;
  set(config: H2AFeatureConfig): Promise<H2AFeatureConfig>;
}

export class LocalFeatureConfigRepository implements FeatureConfigRepository {
  private readonly repository: VersionedJsonRepository<'h2a.settings.feature-config', H2AFeatureConfig>;

  public constructor(dataPath: string, clock: () => Date = () => new Date()) {
    this.repository = new VersionedJsonRepository(
      new AtomicFileStore(dataPath),
      'settings/feature-config.json',
      'h2a.settings.feature-config',
      h2aFeatureConfigSchema,
      { initialData: defaultFeatureConfig, migrateLegacyData: true, clock }
    );
  }

  public get(): Promise<H2AFeatureConfig> {
    return this.repository.read();
  }

  public set(config: H2AFeatureConfig): Promise<H2AFeatureConfig> {
    return this.repository.write(config);
  }
}

export interface AppearancePreferencesRepository {
  get(): Promise<AppearancePreferences>;
  update(request: UpdateAppearancePreferences): Promise<AppearancePreferences>;
}

export class LocalAppearancePreferencesRepository implements AppearancePreferencesRepository {
  private readonly repository: VersionedJsonRepository<'h2a.settings.appearance-preferences', AppearancePreferences>;
  private readonly clock: () => Date;

  public constructor(dataPath: string, clock: () => Date = () => new Date()) {
    this.clock = clock;
    this.repository = new VersionedJsonRepository(
      new AtomicFileStore(dataPath),
      'settings/appearance-preferences.json',
      'h2a.settings.appearance-preferences',
      appearancePreferencesSchema,
      {
        initialData: {
          schema_version: 1,
          presentation_mode: 'office',
          reduced_motion: false,
          camera_position: { x: 0, y: 0 },
          zoom: 1,
          inspector_width: 360,
          selected_workflow_id: 'set-up-people',
          updated_at: this.clock().toISOString()
        },
        migrateLegacyData: true,
        clock
      }
    );
  }

  public get(): Promise<AppearancePreferences> {
    return this.repository.read();
  }

  public async update(request: UpdateAppearancePreferences): Promise<AppearancePreferences> {
    const current = await this.get();
    return this.repository.write({
      ...current,
      ...request,
      schema_version: 1,
      updated_at: this.clock().toISOString()
    });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
