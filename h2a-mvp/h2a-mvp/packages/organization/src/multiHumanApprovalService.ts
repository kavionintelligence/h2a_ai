import { randomUUID, verify } from 'node:crypto';
import { z } from 'zod';
import {
  V2_CONTRACT_VERSION,
  approvalDecisionSchema,
  approvalMandateExtensionSchema,
  approvalPolicySchema,
  approvalRequestContextSchema,
  approvalRequestV2Schema,
  approvalResumeRecordSchema,
  authorityApprovalStateSchema,
  consumeApprovalResumeRequestSchema,
  createApprovalPolicyRequestSchema,
  requestAuthorityEscalationSchema,
  submitApprovalDecisionRequestSchema,
  withdrawApprovalRequestSchema,
  type ApprovalDecision,
  type ApprovalMandateExtension,
  type ApprovalPolicy,
  type ApprovalRequestContext,
  type ApprovalRequestV2,
  type ApprovalResumeRecord,
  type AuthorityApprovalState,
  type ConsumeApprovalResumeRequest,
  type CreateApprovalPolicyRequest,
  type HumanIdentityV2State,
  type OrganizationAuthorityState,
  type RequestAuthorityEscalation,
  type SubmitApprovalDecisionRequest,
  type WithdrawApprovalRequest
} from '@h2a/contracts';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import type { HumanIdentityV2StatePort, OrganizationAuthorityService, OrganizationRecordSigner } from './organizationService';

export interface ApprovalResumeExecutor {
  resume(input: {
    approvalRequestId: string;
    taskId: string;
    agentId: string;
    mandateId: string;
    resource: string;
    action: string;
    requestedEffectHash: string;
    idempotencyKey: string;
  }): Promise<unknown>;
}

export class MultiHumanApprovalService {
  private readonly policies: VersionedJsonRepository<'h2a.v2.approval-policies', ApprovalPolicy[]>;
  private readonly requests: VersionedJsonRepository<'h2a.v2.approval-requests', ApprovalRequestV2[]>;
  private readonly contexts: VersionedJsonRepository<'h2a.v2.approval-request-contexts', ApprovalRequestContext[]>;
  private readonly decisions: VersionedJsonRepository<'h2a.v2.approval-decisions', ApprovalDecision[]>;
  private readonly extensions: VersionedJsonRepository<'h2a.v2.approval-mandate-extensions', ApprovalMandateExtension[]>;
  private readonly resumes: VersionedJsonRepository<'h2a.v2.approval-resumes', ApprovalResumeRecord[]>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly identities: HumanIdentityV2StatePort,
    private readonly authority: OrganizationAuthorityService & OrganizationRecordSigner,
    private readonly executor: ApprovalResumeExecutor,
    private readonly clock: () => Date = () => new Date()
  ) {
    const store = new AtomicFileStore(dataPath);
    this.policies = repo(store, 'authority/approval-policies-v2.json', 'h2a.v2.approval-policies', approvalPolicySchema);
    this.requests = repo(store, 'authority/approval-requests-v2.json', 'h2a.v2.approval-requests', approvalRequestV2Schema);
    this.contexts = repo(store, 'authority/approval-request-contexts-v2.json', 'h2a.v2.approval-request-contexts', approvalRequestContextSchema);
    this.decisions = repo(store, 'authority/approval-decisions-v2.json', 'h2a.v2.approval-decisions', approvalDecisionSchema);
    this.extensions = repo(store, 'authority/approval-mandate-extensions-v2.json', 'h2a.v2.approval-mandate-extensions', approvalMandateExtensionSchema);
    this.resumes = repo(store, 'authority/approval-resumes-v2.json', 'h2a.v2.approval-resumes', approvalResumeRecordSchema);
  }

  public async initialize(): Promise<void> {
    await Promise.all([this.policies.read(), this.requests.read(), this.contexts.read(), this.decisions.read(), this.extensions.read(), this.resumes.read()]);
    await this.getState();
  }

  public getState(): Promise<AuthorityApprovalState> {
    return this.exclusive(async () => {
      await this.expire();
      return this.state();
    });
  }

  public async findActiveExtension(mandateId: string, agentId: string): Promise<ApprovalMandateExtension | undefined> {
    return (await this.extensions.read()).find((item) => item.mandate_id === mandateId && item.agent_id === agentId && item.status === 'active' && new Date(item.expires_at).getTime() > this.clock().getTime());
  }

  public recoverInterruptedResume(approvalRequestId: string, idempotencyKey: string, providerRunObserved: boolean): Promise<AuthorityApprovalState> {
    return this.exclusive(async () => {
      const resumes = await this.resumes.read();
      const resume = resumes.find((item) => item.approval_request_id === approvalRequestId && item.idempotency_key === idempotencyKey);
      if (!resume || resume.status !== 'executing') return this.state();
      if (providerRunObserved) {
        await this.resumes.write(resumes.map((item) => item.resume_id === resume.resume_id ? { ...item, status: 'failed' as const, error: 'Interrupted after provider launch; manual evidence reconciliation required.' } : item));
      } else {
        await this.resumes.write(resumes.map((item) => item.resume_id === resume.resume_id ? approvalResumeRecordSchema.parse({ ...item, status: 'ready', attempts: 0, started_at: undefined, error: undefined }) : item));
      }
      const context = (await this.contexts.read()).find((item) => item.approval_request_id === approvalRequestId);
      await this.event('APPROVAL_RESUME_RECOVERED', 'h2a-authority-router', approvalRequestId, { idempotency_key: idempotencyKey, provider_run_observed: providerRunObserved, outcome: providerRunObserved ? 'failed-closed' : 'ready' , ceremony_id: context?.ceremony_id }, context?.trace_id);
      return this.state();
    });
  }

  public createPolicy(request: CreateApprovalPolicyRequest): Promise<AuthorityApprovalState> {
    return this.exclusive(async () => {
      const input = createApprovalPolicyRequestSchema.parse(request);
      await this.authority.authorizeProtectedOperation({
        organizationId: input.organization_id,
        membershipId: input.actor.membership_id,
        humanProofId: input.actor.human_proof_id,
        authorityCredentialId: input.actor.authority_credential_id
      }, 'organization', 'manage');
      const policies = await this.policies.read();
      if (policies.some((item) => item.approval_policy_id === input.approval_policy_id)) throw new Error('Approval policy ID already exists.');
      const authority = await this.authority.getState();
      if (!input.eligible_role_ids.every((id) => authority.roles.some((role) => role.organization_id === input.organization_id && role.role_id === id && role.status === 'active'))) {
        throw new Error('Every eligible role must be active in the organization.');
      }
      const now = this.clock().toISOString();
      const policy = approvalPolicySchema.parse({ schema_version: V2_CONTRACT_VERSION, ...without(input, ['actor', 'ceremony']), status: 'active', updated_at: now });
      await this.policies.write([...policies, policy]);
      await this.event('APPROVAL_POLICY_CREATED', input.actor.membership_id, policy.approval_policy_id, { organization_id: input.organization_id, quorum: input.quorum, eligible_role_ids: input.eligible_role_ids, separation_of_duty: input.separation_of_duty, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key }, input.ceremony?.trace_id);
      return this.state();
    });
  }

  public requestEscalation(request: RequestAuthorityEscalation): Promise<AuthorityApprovalState> {
    return this.exclusive(async () => {
      const input = requestAuthorityEscalationSchema.parse(request);
      await this.expire();
      const requests = await this.requests.read();
      const contexts = await this.contexts.read();
      const existing = contexts.find((item) => item.idempotency_key === input.idempotency_key);
      if (existing) return this.state();
      const policy = (await this.policies.read()).find((item) => item.approval_policy_id === input.approval_policy_id && item.organization_id === input.organization_id && item.status === 'active');
      if (!policy) throw new Error('Active approval policy not found.');
      if (!policy.risk_tiers.includes(input.risk_tier)) throw new Error('Approval policy does not cover this risk tier.');
      const authority = await this.authority.getState();
      const requester = authority.memberships.find((item) => item.membership_id === input.requesting_membership_id && item.human_id === input.requesting_human_id && item.organization_id === input.organization_id && item.status === 'active');
      if (!requester) throw new Error('Requesting human does not hold the active organization membership.');
      const eligible = eligibleMemberships(authority, policy, input, this.clock());
      if (eligible.length < policy.quorum) throw new Error('Approval cannot be routed: eligible approvers are fewer than quorum.');
      const now = this.clock();
      const record = approvalRequestV2Schema.parse({
        schema_version: V2_CONTRACT_VERSION,
        approval_request_id: `apr_${randomUUID()}`,
        organization_id: input.organization_id,
        task_id: input.task_id,
        requesting_human_id: input.requesting_human_id,
        requesting_agent_id: input.requesting_agent_id,
        mandate_id: input.mandate_id,
        required_resource: input.required_resource,
        required_action: input.required_action,
        requested_effect_hash: input.requested_effect_hash,
        review_context_grant_id: input.review_context_grant_id,
        approval_policy_id: input.approval_policy_id,
        eligible_membership_ids: eligible,
        status: 'pending',
        requested_at: now.toISOString(),
        expires_at: new Date(now.getTime() + policy.decision_ttl_seconds * 1000).toISOString()
      });
      const context = approvalRequestContextSchema.parse({
        approval_request_id: record.approval_request_id,
        requesting_membership_id: input.requesting_membership_id,
        required_approval_power: input.required_approval_power,
        risk_tier: input.risk_tier,
        amount: input.amount,
        record_count: input.record_count,
        idempotency_key: input.idempotency_key,
        ceremony_id: input.ceremony?.ceremony_id,
        trace_id: input.ceremony?.trace_id
      });
      await this.requests.write([...requests, record]);
      await this.contexts.write([...contexts, context]);
      const ceremonyPayload = { ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key };
      await this.event('AUTHORITY_ESCALATION_REQUESTED', input.requesting_human_id, record.approval_request_id, { task_id: input.task_id, requesting_agent_id: input.requesting_agent_id, mandate_id: input.mandate_id, requested_effect_hash: input.requested_effect_hash, ...ceremonyPayload }, input.ceremony?.trace_id);
      await this.event('APPROVAL_ROUTED', 'h2a-authority-router', record.approval_request_id, { eligible_membership_ids: eligible, quorum: policy.quorum, review_context_grant_id: input.review_context_grant_id, ...ceremonyPayload }, input.ceremony?.trace_id);
      return this.state();
    });
  }

  public submitDecision(request: SubmitApprovalDecisionRequest): Promise<AuthorityApprovalState> {
    return this.exclusive(async () => {
      const input = submitApprovalDecisionRequestSchema.parse(request);
      await this.expire();
      const requests = await this.requests.read();
      const current = requests.find((item) => item.approval_request_id === input.approval_request_id);
      if (!current || current.status !== 'pending') throw new Error('Approval request is not pending.');
      if (!current.eligible_membership_ids.includes(input.approver.membership_id)) throw new Error('This employee is not an eligible approver.');
      const policy = required((await this.policies.read()).find((item) => item.approval_policy_id === current.approval_policy_id && item.status === 'active'), 'Approval policy is unavailable.');
      const context = required((await this.contexts.read()).find((item) => item.approval_request_id === current.approval_request_id), 'Approval context is unavailable.');
      if (policy.separation_of_duty && input.approver.membership_id === context.requesting_membership_id) throw new Error('Separation of duty prevents the requester from approving.');
      const decisions = await this.decisions.read();
      if (decisions.some((item) => item.approval_request_id === current.approval_request_id && item.approver_membership_id === input.approver.membership_id)) throw new Error('This membership has already decided the request.');
      const authorityBefore = await this.authority.getState();
      const member = required(authorityBefore.memberships.find((item) => item.membership_id === input.approver.membership_id && item.status === 'active'), 'Approver membership is inactive.');
      const proof = await this.requirePurposeProof(member.human_id, current.organization_id, input.approver.membership_id, input.approver.human_proof_id, policy.proof_purpose);
      const evaluated = await this.authority.evaluate({
        organization_id: current.organization_id,
        membership_id: input.approver.membership_id,
        human_proof_id: proof.human_proof_id,
        authority_credential_id: input.approver.authority_credential_id,
        resource: current.required_resource,
        action: current.required_action,
        amount: context.amount,
        records: context.record_count || undefined,
        required_approval_power: context.required_approval_power,
        purpose: policy.proof_purpose
      });
      if (evaluated.decisions[0]?.decision !== 'ALLOW') throw new Error(`Approver authority denied: ${evaluated.decisions[0]?.reason_code ?? 'UNKNOWN'}.`);
      const credential = required(evaluated.credentials.find((item) => item.credential_id === input.approver.authority_credential_id), 'Approver credential not found.');
      if (!credential.approval_policy_ids.includes(policy.approval_policy_id)) throw new Error('Approver credential is not bound to this approval policy.');
      const now = this.clock().toISOString();
      const unsigned = {
        schema_version: V2_CONTRACT_VERSION,
        approval_decision_id: `apd_${randomUUID()}`,
        approval_request_id: current.approval_request_id,
        organization_id: current.organization_id,
        approver_human_id: member.human_id,
        approver_membership_id: member.membership_id,
        human_proof_id: proof.human_proof_id,
        authority_credential_id: credential.credential_id,
        decision: input.decision === 'approve' ? 'approved' as const : 'rejected' as const,
        conditions: input.conditions,
        decided_at: now,
        expires_at: current.expires_at
      };
      const signed = await this.authority.signOrganizationRecord(unsigned);
      let decision = approvalDecisionSchema.parse({ ...unsigned, canonical_hash: signed.canonicalHash, approver_signature: signed.signature });
      const nextDecisions = [...decisions, decision];
      await this.decisions.write(nextDecisions);
      const ceremonyPayload = { ceremony_id: context.ceremony_id };
      await this.event('APPROVAL_DECISION_SIGNED', member.human_id, current.approval_request_id, { decision_id: decision.approval_decision_id, approver_membership_id: member.membership_id, human_proof_id: proof.human_proof_id, authority_credential_id: credential.credential_id, decision: decision.decision, ...ceremonyPayload }, context.trace_id);
      if (input.decision === 'reject') {
        await this.requests.write(requests.map((item) => item.approval_request_id === current.approval_request_id ? { ...item, status: 'rejected' as const } : item));
        await this.event('APPROVAL_REJECTED_V2', member.human_id, current.approval_request_id, { decision_id: decision.approval_decision_id, task_id: current.task_id, requesting_agent_id: current.requesting_agent_id, ...ceremonyPayload }, context.trace_id);
        return this.state();
      }
      const approvals = nextDecisions.filter((item) => item.approval_request_id === current.approval_request_id && item.decision !== 'rejected');
      if (approvals.length >= policy.quorum) {
        const extension = await this.issueExtension(current);
        const unsignedWithMandate = { ...unsigned, resulting_mandate_id: extension.mandate_id };
        const finalSignature = await this.authority.signOrganizationRecord(unsignedWithMandate);
        decision = approvalDecisionSchema.parse({ ...unsignedWithMandate, canonical_hash: finalSignature.canonicalHash, approver_signature: finalSignature.signature });
        await this.decisions.write(nextDecisions.map((item) => item.approval_decision_id === decision.approval_decision_id ? decision : item));
        await this.extensions.write([...(await this.extensions.read()), extension]);
        await this.resumes.write([...(await this.resumes.read()), approvalResumeRecordSchema.parse({ schema_version: V2_CONTRACT_VERSION, resume_id: `res_${randomUUID()}`, approval_request_id: current.approval_request_id, mandate_id: extension.mandate_id, idempotency_key: context.idempotency_key, status: 'ready', attempts: 0, created_at: now })]);
        await this.requests.write(requests.map((item) => item.approval_request_id === current.approval_request_id ? { ...item, status: 'approved' as const } : item));
        await this.event('APPROVAL_QUORUM_REACHED', member.human_id, current.approval_request_id, { quorum: policy.quorum, approver_human_ids: approvals.map((item) => item.approver_human_id), approver_membership_ids: approvals.map((item) => item.approver_membership_id), requesting_human_id: current.requesting_human_id, requesting_agent_id: current.requesting_agent_id, resulting_mandate_id: extension.mandate_id, ...ceremonyPayload }, context.trace_id);
      }
      return this.state();
    });
  }

  public proveForgedApproval(traceId: string): Promise<{ reasonCode: string; evidenceRef: string }> {
    return this.exclusive(async () => {
      const request = [...await this.requests.read()].reverse().find((item) => ['approved', 'rejected', 'expired', 'invalidated'].includes(item.status));
      if (!request) throw new Error('No persisted approval request is available for signature validation.');
      const publicKey = await this.authority.getOrganizationPublicKey();
      const forged = { approval_request_id: request.approval_request_id, decision: 'approved', nonce: randomUUID() };
      const accepted = verify(null, Buffer.from(canonicalize(forged), 'utf8'), publicKey, Buffer.alloc(64));
      if (accepted) throw new Error('The forged approval signature was unexpectedly accepted.');
      const reasonCode = 'APPROVAL_SIGNATURE_INVALID';
      const event = await this.evidence.append({ trace_id: traceId, actor: { type: 'system', id: 'h2a-approval-verifier' }, subject: { type: 'mandate', id: request.approval_request_id }, event_type: 'APPROVAL_INVALIDATED_V2', payload: { status: 'invalidated', reason_code: reasonCode, source: 'phase30-signature-verification-boundary' } });
      return { reasonCode, evidenceRef: event.event_id };
    });
  }

  public consumeResume(request: ConsumeApprovalResumeRequest): Promise<AuthorityApprovalState> {
    return this.exclusive(async () => {
      const input = consumeApprovalResumeRequestSchema.parse(request);
      await this.expire();
      const requests = await this.requests.read();
      const approval = required(requests.find((item) => item.approval_request_id === input.approval_request_id), 'Approval request not found.');
      const context = required((await this.contexts.read()).find((item) => item.approval_request_id === approval.approval_request_id), 'Approval context is unavailable.');
      const resumes = await this.resumes.read();
      const resume = required(resumes.find((item) => item.approval_request_id === approval.approval_request_id), 'Approved action is not ready.');
      if (resume.idempotency_key !== input.idempotency_key) throw new Error('Resume idempotency key does not match.');
      if (resume.status === 'completed') return this.state();
      if (resume.status !== 'ready' || approval.status !== 'approved') throw new Error('Approved action cannot be resumed.');
      await this.revalidateApprovals(approval);
      const extension = required((await this.extensions.read()).find((item) => item.mandate_id === resume.mandate_id && item.status === 'active'), 'Narrow approval mandate is unavailable.');
      const executing = approvalResumeRecordSchema.parse({ ...resume, status: 'executing', attempts: 1, started_at: this.clock().toISOString() });
      await this.resumes.write(resumes.map((item) => item.resume_id === resume.resume_id ? executing : item));
      try {
        const output = await this.executor.resume({ approvalRequestId: approval.approval_request_id, taskId: approval.task_id, agentId: approval.requesting_agent_id, mandateId: extension.mandate_id, resource: approval.required_resource, action: approval.required_action, requestedEffectHash: approval.requested_effect_hash, idempotencyKey: resume.idempotency_key });
        const completedAt = this.clock().toISOString();
        await this.resumes.write((await this.resumes.read()).map((item) => item.resume_id === resume.resume_id ? { ...item, status: 'completed' as const, completed_at: completedAt, output_hash: hashCanonical(output) } : item));
        await this.extensions.write((await this.extensions.read()).map((item) => item.mandate_id === extension.mandate_id ? { ...item, status: 'consumed' as const } : item));
        await this.event('APPROVED_ACTION_RESUMED', approval.requesting_agent_id, approval.approval_request_id, { task_id: approval.task_id, mandate_id: extension.mandate_id, requesting_human_id: approval.requesting_human_id, requesting_agent_id: approval.requesting_agent_id, approver_human_ids: (await this.decisions.read()).filter((item) => item.approval_request_id === approval.approval_request_id).map((item) => item.approver_human_id), output_hash: hashCanonical(output), ceremony_id: context.ceremony_id }, context.trace_id);
      } catch (error) {
        await this.resumes.write((await this.resumes.read()).map((item) => item.resume_id === resume.resume_id ? { ...item, status: 'failed' as const, error: message(error) } : item));
        throw error;
      }
      return this.state();
    });
  }

  public withdraw(request: WithdrawApprovalRequest): Promise<AuthorityApprovalState> {
    return this.exclusive(async () => {
      const input = withdrawApprovalRequestSchema.parse(request);
      const requests = await this.requests.read();
      const current = required(requests.find((item) => item.approval_request_id === input.approval_request_id), 'Approval request not found.');
      if (current.requesting_human_id !== input.requesting_human_id || !['pending', 'approved'].includes(current.status)) throw new Error('Only the requester can withdraw an open approval.');
      const context = required((await this.contexts.read()).find((item) => item.approval_request_id === current.approval_request_id), 'Approval context is unavailable.');
      await this.requirePurposeProof(current.requesting_human_id, current.organization_id, context.requesting_membership_id, input.human_proof_id, 'withdraw protected approval request');
      await this.invalidate(current, 'withdrawn');
      return this.state();
    });
  }

  private async issueExtension(request: ApprovalRequestV2): Promise<ApprovalMandateExtension> {
    const unsigned = {
      schema_version: V2_CONTRACT_VERSION,
      mandate_id: `mnd_approval_${randomUUID()}`,
      parent_mandate_id: request.mandate_id,
      approval_request_id: request.approval_request_id,
      organization_id: request.organization_id,
      task_id: request.task_id,
      agent_id: request.requesting_agent_id,
      resource: request.required_resource,
      action: request.required_action,
      requested_effect_hash: request.requested_effect_hash,
      delegation_depth_remaining: 0 as const,
      status: 'active' as const,
      issued_at: this.clock().toISOString(),
      expires_at: request.expires_at
    };
    const signed = await this.authority.signOrganizationRecord(unsigned);
    return approvalMandateExtensionSchema.parse({ ...unsigned, canonical_hash: signed.canonicalHash, organization_signature: signed.signature });
  }

  private async revalidateApprovals(request: ApprovalRequestV2): Promise<void> {
    const policy = required((await this.policies.read()).find((item) => item.approval_policy_id === request.approval_policy_id && item.status === 'active'), 'Approval policy is unavailable.');
    const context = required((await this.contexts.read()).find((item) => item.approval_request_id === request.approval_request_id), 'Approval context is unavailable.');
    const decisions = (await this.decisions.read()).filter((item) => item.approval_request_id === request.approval_request_id && item.decision !== 'rejected');
    if (decisions.length < policy.quorum) throw new Error('Approval quorum is no longer satisfied.');
    for (const decision of decisions) {
      await this.requirePurposeProof(decision.approver_human_id, request.organization_id, decision.approver_membership_id, decision.human_proof_id, policy.proof_purpose);
      const evaluated = await this.authority.evaluate({ organization_id: request.organization_id, membership_id: decision.approver_membership_id, human_proof_id: decision.human_proof_id, authority_credential_id: decision.authority_credential_id, resource: request.required_resource, action: request.required_action, amount: context.amount, records: context.record_count || undefined, required_approval_power: context.required_approval_power, purpose: policy.proof_purpose });
      if (evaluated.decisions[0]?.decision !== 'ALLOW') {
        await this.invalidate(request, 'invalidated');
        throw new Error('Approval was invalidated because an approver no longer has authority.');
      }
    }
  }

  private async requirePurposeProof(humanId: string, organizationId: string, membershipId: string, proofId: string, purpose: string) {
    const state: HumanIdentityV2State = await this.identities.getState(humanId);
    const proof = state.active_proofs.find((item) => item.human_proof_id === proofId);
    if (!proof || proof.human_id !== humanId || proof.organization_id !== organizationId || proof.membership_id !== membershipId || proof.purpose !== purpose || new Date(proof.expires_at).getTime() <= this.clock().getTime()) throw new Error(`Fresh Human Proof required for purpose: ${purpose}.`);
    return proof;
  }

  private async expire(): Promise<void> {
    const requests = await this.requests.read();
    const executingIds = new Set((await this.resumes.read()).filter((item) => item.status === 'executing').map((item) => item.approval_request_id));
    const expiredIds = new Set(requests.filter((item) => ['pending', 'approved'].includes(item.status) && !executingIds.has(item.approval_request_id) && new Date(item.expires_at).getTime() <= this.clock().getTime()).map((item) => item.approval_request_id));
    if (!expiredIds.size) return;
    await this.requests.write(requests.map((item) => expiredIds.has(item.approval_request_id) ? { ...item, status: 'expired' as const } : item));
    await this.extensions.write((await this.extensions.read()).map((item) => expiredIds.has(item.approval_request_id) && item.status === 'active' ? { ...item, status: 'expired' as const } : item));
    await this.resumes.write((await this.resumes.read()).map((item) => expiredIds.has(item.approval_request_id) && item.status === 'ready' ? { ...item, status: 'invalidated' as const, error: 'Approval expired before execution.' } : item));
    for (const id of expiredIds) await this.event('APPROVAL_EXPIRED_V2', 'h2a-authority-router', id, {});
  }

  private async invalidate(request: ApprovalRequestV2, status: 'withdrawn' | 'invalidated'): Promise<void> {
    await this.requests.write((await this.requests.read()).map((item) => item.approval_request_id === request.approval_request_id ? { ...item, status } : item));
    await this.extensions.write((await this.extensions.read()).map((item) => item.approval_request_id === request.approval_request_id && item.status === 'active' ? { ...item, status: 'revoked' as const } : item));
    await this.resumes.write((await this.resumes.read()).map((item) => item.approval_request_id === request.approval_request_id && item.status === 'ready' ? { ...item, status: 'invalidated' as const, error: `Approval ${status} before execution.` } : item));
    await this.event('APPROVAL_INVALIDATED_V2', request.requesting_human_id, request.approval_request_id, { status });
  }

  private async state(): Promise<AuthorityApprovalState> {
    const [policies, requests, request_contexts, decisions, mandate_extensions, resumes] = await Promise.all([this.policies.read(), this.requests.read(), this.contexts.read(), this.decisions.read(), this.extensions.read(), this.resumes.read()]);
    return authorityApprovalStateSchema.parse({ policies, requests, request_contexts, decisions, mandate_extensions, resumes });
  }

  private event(event_type: Parameters<EvidenceLedgerPort['append']>[0]['event_type'], actor: string, subject: string, payload: Record<string, unknown>, traceId?: string): Promise<unknown> {
    return this.evidence.append({ trace_id: traceId ?? `tr_approval_${randomUUID()}`, actor: { type: actor.startsWith('human_') ? 'human' : actor.startsWith('runtime') ? 'agent' : 'system', id: actor }, subject: { type: 'mandate', id: subject }, event_type, payload });
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(work);
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

function repo<K extends string, T>(store: AtomicFileStore, path: string, kind: K, schema: z.ZodType<T>): VersionedJsonRepository<K, T[]> {
  return new VersionedJsonRepository(store, path, kind, z.array(schema), { initialData: [] });
}

function eligibleMemberships(state: OrganizationAuthorityState, policy: ApprovalPolicy, request: RequestAuthorityEscalation, clock: Date): string[] {
  const now = clock.getTime();
  return state.memberships.filter((member) => {
    if (member.organization_id !== request.organization_id || member.status !== 'active') return false;
    if (policy.separation_of_duty && member.membership_id === request.requesting_membership_id) return false;
    const roleIds = member.role_ids.filter((roleId) => policy.eligible_role_ids.includes(roleId));
    const roles = state.roles.filter((role) => roleIds.includes(role.role_id) && role.status === 'active');
    const roleAllows = roles.some((role) => role.approval_powers.includes(request.required_approval_power) && role.authority_scopes.some((scope) =>
      matches(scope.resource, request.required_resource) &&
      scope.actions.some((action) => matches(action, request.required_action)) &&
      (scope.max_amount === undefined || request.amount === undefined || request.amount <= scope.max_amount) &&
      (scope.max_records === undefined || request.record_count === undefined || request.record_count <= scope.max_records)
    ));
    if (!roleAllows) return false;
    return state.credentials.some((credential) =>
      credential.membership_id === member.membership_id &&
      credential.organization_id === request.organization_id &&
      credential.status === 'active' &&
      new Date(credential.expires_at).getTime() > now &&
      credential.approval_policy_ids.includes(policy.approval_policy_id) &&
      credential.role_ids.some((roleId) => roleIds.includes(roleId)) &&
      (!credential.resource_constraints.length || credential.resource_constraints.some((value) => matches(value, request.required_resource))) &&
      (!credential.action_constraints.length || credential.action_constraints.some((value) => matches(value, request.required_action)))
    );
  }).map((member) => member.membership_id);
}

function matches(pattern: string, value: string): boolean {
  return pattern === '*' || pattern === value || (pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1)));
}
function required<T>(value: T | undefined, error: string): T { if (value === undefined) throw new Error(error); return value; }
function without<T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> { const clone = { ...value }; for (const key of keys) delete clone[key]; return clone; }
function message(error: unknown): string { return error instanceof Error ? error.message : 'Approved action failed.'; }
