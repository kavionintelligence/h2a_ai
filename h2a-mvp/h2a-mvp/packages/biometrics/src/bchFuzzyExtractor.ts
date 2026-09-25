import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const BCH_M = 15;
const BCH_T = 1800;
const BCH_N = 2 ** BCH_M - 1;

interface BchModule {
  ccall(name: string, returnType: string, argumentTypes: string[], arguments_: number[]): number;
  _malloc(size: number): number;
  _free(pointer: number): void;
  HEAPU8: Uint8Array;
}

type BchModuleFactory = (options: { wasmBinary: Uint8Array }) => Promise<BchModule>;

export interface BiometricTemplateSecretRecord {
  record_id: string;
  helper: string;
  token: string;
  k2: string;
}

export interface BchRegistrationResult {
  salt: string;
  records: BiometricTemplateSecretRecord[];
}

export interface BchMatchResult {
  matched: boolean;
  correctedErrors: number;
}

export interface BchFuzzyExtractorPort {
  register(samples: number[][]): Promise<BchRegistrationResult>;
  verify(sample: number[], enrollment: BchRegistrationResult): Promise<BchMatchResult[]>;
}

export class BchFuzzyExtractor implements BchFuzzyExtractorPort {
  private module: BchModule | undefined;
  private control = 0;
  private dataBits = 0;
  private eccBits = 0;

  public constructor(private readonly assetRoot: string = join(process.cwd(), 'assets', 'biometric')) {}

  public async register(samples: number[][]): Promise<BchRegistrationResult> {
    await this.initialize();
    const salt = randomBytes(32).toString('hex');
    return {
      salt,
      records: samples.map((sample, index) => this.registerSample(sample, salt, index))
    };
  }

  public async verify(
    sample: number[],
    enrollment: BchRegistrationResult
  ): Promise<BchMatchResult[]> {
    await this.initialize();
    return enrollment.records.map((record) => this.verifySample(sample, enrollment.salt, record));
  }

  private async initialize(): Promise<void> {
    if (this.module && this.control) return;
    const require = createRequire(import.meta.url);
    const factory = require(join(this.assetRoot, 'bch_codec.cjs')) as BchModuleFactory;
    const { readFile } = await import('node:fs/promises');
    this.module = await factory({ wasmBinary: await readFile(join(this.assetRoot, 'bch_codec.wasm')) });
    this.control = this.module.ccall(
      'init_bch',
      'number',
      ['number', 'number', 'number'],
      [BCH_M, BCH_T, 0]
    );
    if (!this.control) throw new Error('BCH codec initialization failed.');
    this.eccBits = this.module.ccall('get_ecc_bits', 'number', ['number'], [this.control]);
    this.dataBits = BCH_N - this.eccBits;
  }

  private registerSample(sample: number[], salt: string, index: number): BiometricTemplateSecretRecord {
    const secret = randomBitArray(this.dataBits);
    const codeword = [...secret, ...this.encode(secret)];
    const biometric = alignBits(sample, BCH_N);
    const helper = codeword.map((bit, bitIndex) => bit ^ biometric[bitIndex]).join('');
    const secretHash = sha256(secret.join(''));
    const key = randomBytes(32).toString('hex');
    const k2 = xorHex(xorHex(secretHash, salt), key);
    return {
      record_id: `btr_${index + 1}`,
      helper,
      token: sha256(`${key}${secretHash}`),
      k2
    };
  }

  private verifySample(
    sample: number[],
    salt: string,
    record: BiometricTemplateSecretRecord
  ): BchMatchResult {
    const helper = [...record.helper].map((bit) => Number(bit));
    if (helper.length !== BCH_N) return { matched: false, correctedErrors: -1 };
    const biometric = alignBits(sample, BCH_N);
    const codeword = helper.map((bit, index) => bit ^ biometric[index]);
    const decoded = this.decode(codeword);
    if (decoded.correctedErrors < 0) return { matched: false, correctedErrors: decoded.correctedErrors };
    const recoveredHash = sha256(decoded.secret.join(''));
    const recoveredKey = xorHex(xorHex(recoveredHash, salt), record.k2);
    return {
      matched: sha256(`${recoveredKey}${recoveredHash}`) === record.token,
      correctedErrors: decoded.correctedErrors
    };
  }

  private encode(secret: number[]): number[] {
    const module = this.requiredModule();
    const dataPointer = module._malloc(secret.length);
    const eccPointer = module._malloc(this.eccBits);
    try {
      module.HEAPU8.set(secret, dataPointer);
      module.ccall(
        'encodebits_bch',
        'void',
        ['number', 'number', 'number'],
        [this.control, dataPointer, eccPointer]
      );
      return Array.from(module.HEAPU8.subarray(eccPointer, eccPointer + this.eccBits), (bit) => bit & 1);
    } finally {
      module._free(dataPointer);
      module._free(eccPointer);
    }
  }

  private decode(codeword: number[]): { secret: number[]; correctedErrors: number } {
    const module = this.requiredModule();
    const dataPointer = module._malloc(this.dataBits);
    const eccPointer = module._malloc(this.eccBits);
    const errorPointer = module._malloc(BCH_T * 4);
    try {
      module.HEAPU8.set(codeword.slice(0, this.dataBits), dataPointer);
      module.HEAPU8.set(codeword.slice(this.dataBits), eccPointer);
      const correctedErrors = module.ccall(
        'decodebits_bch',
        'number',
        ['number', 'number', 'number', 'number'],
        [this.control, dataPointer, eccPointer, errorPointer]
      );
      if (correctedErrors > 0) {
        module.ccall(
          'correctbits_bch',
          'void',
          ['number', 'number', 'number', 'number'],
          [this.control, dataPointer, errorPointer, correctedErrors]
        );
      }
      return {
        secret: Array.from(module.HEAPU8.subarray(dataPointer, dataPointer + this.dataBits), (bit) => bit & 1),
        correctedErrors
      };
    } finally {
      module._free(dataPointer);
      module._free(eccPointer);
      module._free(errorPointer);
    }
  }

  private requiredModule(): BchModule {
    if (!this.module) throw new Error('BCH codec is not initialized.');
    return this.module;
  }
}

function randomBitArray(length: number): number[] {
  const bytes = randomBytes(Math.ceil(length / 8));
  return Array.from({ length }, (_, index) => (bytes[Math.floor(index / 8)] >> (7 - (index % 8))) & 1);
}

function alignBits(bits: number[], length: number): number[] {
  if (bits.length >= length) return bits.slice(0, length);
  return [...bits, ...new Array<number>(length - bits.length).fill(0)];
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function xorHex(first: string, second: string): string {
  if (first.length !== second.length) throw new Error('BCH key material length mismatch.');
  let result = '';
  for (let index = 0; index < first.length; index += 2) {
    result += (Number.parseInt(first.slice(index, index + 2), 16) ^
      Number.parseInt(second.slice(index, index + 2), 16)).toString(16).padStart(2, '0');
  }
  return result;
}
