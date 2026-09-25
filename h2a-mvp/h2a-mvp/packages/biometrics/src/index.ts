export * from './bchFuzzyExtractor';
export * from './assetManifest';
export * from './calibration';

export interface HumanProofRequest {
  humanId: string;
  purpose: string;
}

export interface HumanProofResult {
  verified: boolean;
  proofId?: string;
  reason?: string;
}

export interface HumanProofProvider {
  verify(request: HumanProofRequest): Promise<HumanProofResult>;
}
