import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { EnrollHumanV2Request, VerifyHumanV2Request } from '@h2a/contracts';
import type { HumanIdentityV2Service } from '../../identity/src/humanIdentityV2Service';
import type { OrganizationAuthorityService } from './organizationService';

const setupRequest = z.object({ name: z.string().trim().min(2).max(160), employee_id: z.string().trim().min(1).max(160), department: z.string().trim().min(1).max(120), proof_id: z.string().min(1).max(160) }).strict();
export const firstAdministratorPurpose = 'create local organization authority';

// Local first-use ownership only. Never an alternative entrance into an existing organization.
export class FirstAdministratorSetup {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly verified = new Map<number, string>();
  public constructor(private readonly identity: HumanIdentityV2Service, private readonly authority: OrganizationAuthorityService, private readonly clock = () => new Date()) {}
  public async available(): Promise<boolean> {
    return (await this.authority.getState()).organizations.length === 0 && (await this.identity.getState()).identities.length <= 1;
  }
  public async state() { await this.requireEmptyOrganization(); return this.identity.getState(); }
  public enroll(request: EnrollHumanV2Request) {
    return this.exclusive(async () => {
      await this.requireEmptyOrganization();
      if ((await this.identity.getState()).identities.length !== 0) throw new Error('FIRST_ADMINISTRATOR_ALREADY_ENROLLED');
      return this.identity.enroll(request);
    });
  }
  public verify(sender: number, request: VerifyHumanV2Request) {
    return this.exclusive(async () => {
      await this.requireEmptyOrganization();
      const human = (await this.identity.getState()).identities[0];
      if (!human || human.human_id !== request.human_id || human.organization_id !== request.organization_id || human.active_membership_id !== request.membership_id || request.purpose !== firstAdministratorPurpose) throw new Error('FIRST_ADMINISTRATOR_SUBJECT_MISMATCH');
      this.verified.delete(sender);
      const result = await this.identity.verify({ ...request, nonce: randomUUID() });
      const proof = result.active_proofs.find(item => item.human_id === human.human_id && item.purpose === firstAdministratorPurpose);
      if (result.last_result?.decision === 'verified' && proof) this.verified.set(sender, proof.human_proof_id);
      return result;
    });
  }
  public commit(sender: number, request: z.infer<typeof setupRequest>): Promise<void> {
    return this.exclusive(async () => {
      await this.requireEmptyOrganization();
      const input = setupRequest.parse(request);
      if (this.verified.get(sender) !== input.proof_id) throw new Error('FIRST_ADMINISTRATOR_VERIFICATION_REQUIRED');
      const proof = await this.identity.resolveVerifiedProof(input.proof_id);
      if (proof.purpose !== firstAdministratorPurpose) throw new Error('FIRST_ADMINISTRATOR_PURPOSE_MISMATCH');
      this.verified.delete(sender);
      await this.authority.bootstrap({ organization_id: proof.organization_id, name: input.name, policy_version: 'workspace-initial-authority-v1', human_id: proof.human_id,
        membership_id: proof.membership_id, human_proof_id: proof.human_proof_id, employee_id: input.employee_id, department: input.department,
        credential_expires_at: new Date(this.clock().getTime() + 120 * 60000).toISOString() });
    });
  }
  public forget(sender: number): void { this.verified.delete(sender); }
  private async requireEmptyOrganization(): Promise<void> { if (!await this.available()) throw new Error('FIRST_ADMINISTRATOR_SETUP_CLOSED'); }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> { const result = this.queue.then(operation, operation); this.queue = result.catch(() => undefined); return result; }
}
