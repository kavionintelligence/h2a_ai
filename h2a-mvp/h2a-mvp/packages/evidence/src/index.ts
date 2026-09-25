import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  authorityEventInputSchema,
  authorityEventRecordSchema,
  type AuthorityEventInput,
  type AuthorityEventRecord,
  type IntegrityStatus
} from '@h2a/contracts';
import { AtomicFileStore } from '@h2a/storage';

export interface EvidenceVerificationResult {
  status: IntegrityStatus;
  recordCount: number;
  headHash: string | null;
  failedEventId?: string;
  reason?: string;
}

export interface EvidenceLedgerPort {
  append(event: AuthorityEventInput): Promise<AuthorityEventRecord>;
  list(): Promise<AuthorityEventRecord[]>;
  verify(): Promise<EvidenceVerificationResult>;
}

export { EvidenceAuditService, auditControls } from './auditService';
export { EnterpriseObservabilityService, type EnterpriseObservationPorts } from './enterpriseObservabilityService';
export { FinalAcceptanceService, type FinalAcceptancePorts } from './finalAcceptanceService';
export { DemonstrationConductorService, type DemonstrationConductorPorts } from './demonstrationConductorService';

export class EvidenceIntegrityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'EvidenceIntegrityError';
  }
}

export class LocalAuthorityEventLedger implements EvidenceLedgerPort {
  public readonly ledgerPath: string;
  private readonly store: AtomicFileStore;
  private readonly relativePath: string;
  private readonly clock: () => Date;
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    relativePath = 'traces/tr_platform.jsonl',
    clock: () => Date = () => new Date()
  ) {
    this.store = new AtomicFileStore(dataPath);
    this.relativePath = relativePath;
    this.ledgerPath = this.store.resolvePath(relativePath);
    this.clock = clock;
  }

  public append(event: AuthorityEventInput): Promise<AuthorityEventRecord> {
    const operation = this.writeQueue.then(() => this.appendUnlocked(event));
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  public async list(): Promise<AuthorityEventRecord[]> {
    const contents = await this.readLedger();
    if (contents.trim().length === 0) return [];

    return contents
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0)
      .map((line, index) => {
        let decoded: unknown;
        try {
          decoded = JSON.parse(line) as unknown;
        } catch (error) {
          throw new EvidenceIntegrityError(`Evidence line ${index + 1} is not valid JSON: ${String(error)}`);
        }

        const parsed = authorityEventRecordSchema.safeParse(decoded);
        if (!parsed.success) {
          throw new EvidenceIntegrityError(`Evidence line ${index + 1} failed schema validation.`);
        }
        return parsed.data;
      });
  }

  public async verify(): Promise<EvidenceVerificationResult> {
    let records: AuthorityEventRecord[];
    try {
      records = await this.list();
    } catch (error) {
      return {
        status: 'failed',
        recordCount: 0,
        headHash: null,
        reason: error instanceof Error ? error.message : 'Evidence ledger could not be read.'
      };
    }

    let previousHash: string | null = null;
    const eventIds = new Set<string>();
    for (const record of records) {
      if (eventIds.has(record.event_id)) {
        return failure(records, record, 'Duplicate event identifier detected.');
      }
      eventIds.add(record.event_id);

      if (record.previous_hash !== previousHash) {
        return failure(records, record, 'Previous hash does not match the preceding event.');
      }

      const unsignedRecord = { ...record, event_hash: undefined };
      const expectedHash = hashCanonical(unsignedRecord);
      if (record.event_hash !== expectedHash) {
        return failure(records, record, 'Event content does not match its recorded hash.');
      }
      previousHash = record.event_hash;
    }

    return {
      status: 'verified',
      recordCount: records.length,
      headHash: previousHash
    };
  }

  private async appendUnlocked(event: AuthorityEventInput): Promise<AuthorityEventRecord> {
    const verification = await this.verify();
    if (verification.status !== 'verified') {
      throw new EvidenceIntegrityError(
        `Refusing to append to an invalid evidence ledger: ${verification.reason ?? 'integrity failure'}`
      );
    }

    const input = authorityEventInputSchema.parse(event);
    const unsignedRecord = {
      ...input,
      event_id: `evt_${randomUUID()}`,
      timestamp: input.timestamp ?? this.clock().toISOString(),
      previous_hash: verification.headHash
    };
    const record = authorityEventRecordSchema.parse({
      ...unsignedRecord,
      event_hash: hashCanonical(unsignedRecord)
    });

    await mkdir(dirname(this.ledgerPath), { recursive: true });
    const handle = await open(this.ledgerPath, 'a', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    return record;
  }

  private async readLedger(): Promise<string> {
    try {
      return await readFile(this.ledgerPath, 'utf8');
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return '';
      throw error;
    }
  }
}

export function canonicalize(value: unknown): string {
  return serializeCanonical(value, new WeakSet<object>());
}

export function hashCanonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')}`;
}

function serializeCanonical(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON only supports finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError('Canonical JSON does not support circular values.');
    ancestors.add(value);
    const result = `[${value.map((item) => serializeCanonical(item ?? null, ancestors)).join(',')}]`;
    ancestors.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (ancestors.has(value)) throw new TypeError('Canonical JSON does not support circular values.');
    ancestors.add(value);
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serializeCanonical(record[key], ancestors)}`);
    ancestors.delete(value);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value} values.`);
}

function failure(
  records: AuthorityEventRecord[],
  record: AuthorityEventRecord,
  reason: string
): EvidenceVerificationResult {
  return {
    status: 'failed',
    recordCount: records.length,
    headHash: records.at(-1)?.event_hash ?? null,
    failedEventId: record.event_id,
    reason
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
