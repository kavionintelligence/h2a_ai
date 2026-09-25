import { createHash, sign, verify } from 'node:crypto';
import { z } from 'zod';
import { canonicalize } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const signingKeySchema = z.object({
  algorithm: z.literal('Ed25519'),
  private_key_pem: z.string().startsWith('-----BEGIN PRIVATE KEY-----'),
  public_key_pem: z.string().startsWith('-----BEGIN PUBLIC KEY-----')
}).strict();

export interface AuthoritySignature {
  algorithm: 'Ed25519';
  signedBy: string;
  canonicalHash: string;
  value: string;
}

export class AuthoritySignatureService {
  private readonly key: VersionedJsonRepository<'h2a.settings.signing-key', z.infer<typeof signingKeySchema>>;

  public constructor(dataPath: string) {
    this.key = new VersionedJsonRepository(
      new AtomicFileStore(dataPath),
      'settings/h2a-signing-key.json',
      'h2a.settings.signing-key',
      signingKeySchema
    );
  }

  public async initialize(): Promise<void> {
    await this.key.read();
  }

  public async sign(value: unknown, signedBy: string): Promise<AuthoritySignature> {
    const key = await this.key.read();
    const canonical = canonicalize(value);
    return {
      algorithm: 'Ed25519',
      signedBy,
      canonicalHash: `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`,
      value: `ed25519:${sign(null, Buffer.from(canonical, 'utf8'), key.private_key_pem).toString('base64')}`
    };
  }

  public async verify(value: unknown, signature: AuthoritySignature): Promise<boolean> {
    const key = await this.key.read();
    const canonical = canonicalize(value);
    const hash = `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
    if (hash !== signature.canonicalHash || !signature.value.startsWith('ed25519:')) return false;
    return verify(
      null,
      Buffer.from(canonical, 'utf8'),
      key.public_key_pem,
      Buffer.from(signature.value.slice('ed25519:'.length), 'base64')
    );
  }
}
