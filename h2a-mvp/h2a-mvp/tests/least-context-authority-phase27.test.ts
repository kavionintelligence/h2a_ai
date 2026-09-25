import { describe, expect, it } from 'vitest';
import type { OrganizationAuthorityState } from '@h2a/contracts';
import { resolveLeastContextActor } from '../apps/desktop/renderer/src/features/context/leastContextAuthority';

describe('Phase 27 renderer authority resolution', () => {
  it('selects a freshly loaded administrator proof instead of the first operator proof', () => {
    const state = {
      assurance: [
        { membership_id: 'membership_operator', human_proof_id: 'proof_operator' },
        { membership_id: 'membership_admin', human_proof_id: 'proof_admin' }
      ],
      credentials: [
        { credential_id: 'credential_operator', membership_id: 'membership_operator', role_ids: ['role_operator'], status: 'active' },
        { credential_id: 'credential_admin', membership_id: 'membership_admin', role_ids: ['role_admin'], status: 'active' }
      ],
      roles: [
        { role_id: 'role_operator', status: 'active', authority_scopes: [{ resource: 'context-artifact', actions: ['create'] }], approval_powers: [] },
        { role_id: 'role_admin', status: 'active', authority_scopes: [{ resource: 'context-artifact', actions: ['create'] }, { resource: 'context-grant', actions: ['issue'] }], approval_powers: ['context.grant.issue'] }
      ]
    } as OrganizationAuthorityState;

    expect(resolveLeastContextActor(state)).toEqual({
      membership_id: 'membership_admin',
      human_proof_id: 'proof_admin',
      authority_credential_id: 'credential_admin'
    });
  });
});
