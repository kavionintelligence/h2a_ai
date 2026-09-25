export interface HumanIdentityPort {
  verifyOwner(humanId: string): Promise<boolean>;
}

export interface AgentPassportPort {
  isActive(passportId: string): Promise<boolean>;
}

export * from './humanProofService';
export * from './humanIdentityV2Service';
export * from './agentIdentityService';
export * from './authoritySignatureService';
