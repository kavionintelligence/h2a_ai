import { describe, expect, it } from 'vitest';
import {
  H2A_A2A_EXTENSION_URI,
  biometricEnrollmentV2Schema,
  h2aA2aAuthorityEnvelopeSchema,
  humanProofV2Schema,
  runtimeTrustModeSchema
} from '@h2a/contracts';
import { runA2APhase11RoundTrip } from '../packages/connectors/src/a2aPhase11Spike';

const hash = `sha256:${'a'.repeat(64)}`;
const signature = `ed25519:${'b'.repeat(86)}`;
const now = '2026-08-20T18:00:00.000Z';
const later = '2026-08-20T18:10:00.000Z';

describe('Plan 2 frozen contracts', () => {
  it('requires 20-70 protected biometric records and policy-consistent counts', () => {
    const records = Array.from({ length: 20 }, (_, index) => `secret_record_${index + 1}`);
    const hashes = records.map(() => hash);
    expect(biometricEnrollmentV2Schema.parse({
      schema_version: 2,
      enrollment_id: 'enr_2',
      organization_id: 'org_hp_demo',
      human_id: 'human_operator',
      version: 1,
      provider: 'local-face-bch',
      modality: 'face',
      model_set_hash: hash,
      policy: {
        policy_id: 'bio_policy_demo_v1', token_set_size: 20, required_matches: 1,
        bch_error_tolerance: 1800, proof_ttl_seconds: 300, quality_threshold: 0.8,
        liveness_threshold: 0.85, minimum_distance_cm: 35, maximum_distance_cm: 90,
        calibration_status: 'demo-unmeasured'
      },
      protected_record_refs: records,
      public_record_hashes: hashes,
      status: 'active',
      created_at: now,
      canonical_hash: hash,
      organization_signature: signature
    }).policy.token_set_size).toBe(20);
    expect(() => biometricEnrollmentV2Schema.parse({
      schema_version: 2,
      protected_record_refs: Array.from({ length: 19 }, (_, index) => `record_${index}`)
    })).toThrow();
  });

  it('keeps reusable biometric material out of Human Proof and freezes trust labels', () => {
    const proof = humanProofV2Schema.parse({
      schema_version: 2,
      human_proof_id: 'proof_2', human_id: 'human_operator', organization_id: 'org_hp_demo',
      membership_id: 'membership_operator', enrollment_id: 'enr_2', enrollment_version: 1,
      policy_hash: hash, purpose: 'approve restricted action', nonce: 'nonce_1',
      assurance_level: 'high', verification_methods: ['face', 'liveness', 'distance', 'bch'],
      matched_record_count: 1, verified_at: now, expires_at: later,
      provider_attestation_hash: hash, canonical_hash: hash, organization_signature: signature
    });
    expect(Object.keys(proof)).not.toEqual(expect.arrayContaining(['helper', 'token', 'embedding', 'image']));
    expect(runtimeTrustModeSchema.options).toEqual([
      'governed', 'connected-observed', 'external-attested', 'unverified'
    ]);
  });
});

describe('A2A 1.0 H2A extension feasibility', () => {
  it('round-trips a validated H2A authority envelope through the official SDK', async () => {
    const envelope = h2aA2aAuthorityEnvelopeSchema.parse({
      extension_uri: H2A_A2A_EXTENSION_URI,
      extension_version: '1.0',
      organization_id: 'org_hp_demo',
      task_envelope_id: 'task_1',
      passport_id: 'passport_1',
      runtime_attestation_id: 'attestation_1',
      mandate_id: 'mandate_1',
      context_grant_id: 'grant_1',
      trace_id: 'trace_1',
      sequence: 1,
      expires_at: later,
      authority_bundle_hash: hash,
      sender_signature: signature
    });
    const result = await runA2APhase11RoundTrip(envelope);
    expect(result.protocolVersion).toBe('1.0');
    expect(result.extensionNegotiated).toBe(true);
    expect(result.response.extensions).toContain(H2A_A2A_EXTENSION_URI);
    expect(result.response.metadata?.traceId).toBe('trace_1');
  });
});
