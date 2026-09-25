import { z } from 'zod';
import { providerCredentialMetadataSchema, providerIdSchema, type ProviderCredentialMetadata, type ProviderId } from '@h2a/contracts';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

export interface ProviderSecretProtector {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}

const secretRecordSchema = z.object({
  provider: providerIdSchema,
  ciphertext: z.string().min(1),
  last_four: z.string().max(4),
  updated_at: z.string().datetime({ offset: true })
}).strict();
type ProviderSecretRecord = z.infer<typeof secretRecordSchema>;

export class LocalProviderSecretStore {
  private readonly repository: VersionedJsonRepository<'h2a.settings.provider-secrets', ProviderSecretRecord[]>;

  public constructor(dataPath: string, private readonly protector: ProviderSecretProtector, clock: () => Date = () => new Date()) {
    this.repository = new VersionedJsonRepository(
      new AtomicFileStore(dataPath),
      'settings/provider-secrets.json',
      'h2a.settings.provider-secrets',
      z.array(secretRecordSchema),
      { initialData: [], clock }
    );
  }

  public async initialize(): Promise<void> { await this.repository.read(); }

  public async set(provider: ProviderId, secret: string, now = new Date()): Promise<void> {
    const records = await this.repository.read();
    const record: ProviderSecretRecord = {
      provider,
      ciphertext: await this.protector.encrypt(secret),
      last_four: secret.slice(-4),
      updated_at: now.toISOString()
    };
    await this.repository.write([...records.filter((item) => item.provider !== provider), record]);
  }

  public async get(provider: ProviderId): Promise<string | undefined> {
    const record = (await this.repository.read()).find((item) => item.provider === provider);
    return record ? this.protector.decrypt(record.ciphertext) : undefined;
  }

  public async listMetadata(): Promise<ProviderCredentialMetadata[]> {
    return (await this.repository.read()).map((record) => providerCredentialMetadataSchema.parse({
      provider: record.provider,
      configured: true,
      credential_mask: `****${record.last_four}`,
      updated_at: record.updated_at
    }));
  }
}
