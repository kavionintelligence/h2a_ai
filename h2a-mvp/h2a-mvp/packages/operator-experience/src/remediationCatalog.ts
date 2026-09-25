export interface RemediationDefinition {
  remediation_id: string;
  title: string;
  action: 'repair' | 'verify-human' | 'authenticate-provider' | 'replace-relationship' | 'open-technical-details';
  automatic: boolean;
  preserves_exact_scope: boolean;
  exposes_original_reason_code: true;
}

const definitions: Record<string, RemediationDefinition> = {
  HUMAN_PROOF_EXPIRED: remediation('refresh-human-proof', 'Refresh the named employee proof', 'verify-human'),
  FRESH_HUMAN_PROOF_REQUIRED: remediation('complete-human-proof', 'Verify the named employee for the exact purpose', 'verify-human'),
  CREDENTIAL_INACTIVE: remediation('replace-authority-credential', 'Replace the inactive credential with identical scope', 'repair'),
  RUNTIME_ATTESTATION_INACTIVE: remediation('rotate-runtime-attestation', 'Rotate the runtime attestation without changing scope', 'repair'),
  MANDATE_EXPIRED: remediation('replace-mandate', 'Replace the expired mandate with identical scope', 'repair'),
  CONTEXT_GRANT_EXPIRED: remediation('renew-context-grant', 'Renew the grant with identical recipient, purpose, fields, and budget', 'repair'),
  CONTEXT_GRANT_REVOKED: remediation('replace-revoked-grant', 'Create a new grant relationship; the revoked grant stays immutable', 'replace-relationship', false),
  FEDERATION_PEER_INACTIVE: remediation('replace-federation-peer', 'Create a new mutually confirmed peer relationship', 'replace-relationship', false),
  PROVIDER_AUTHENTICATION_REQUIRED: remediation('authenticate-provider', 'Complete official provider authentication', 'authenticate-provider', false),
  CONTROL_PLANE_DISCONNECTED_READ_ONLY: remediation('restore-control-plane', 'Reconnect and reconcile the canonical control plane', 'repair')
};

export function remediationForReasonCode(reasonCode: string): RemediationDefinition {
  return definitions[reasonCode] ?? remediation('inspect-technical-details', 'Inspect the original reason code and canonical evidence', 'open-technical-details', false);
}

export function remediationCatalog(): Readonly<Record<string, RemediationDefinition>> {
  return definitions;
}

function remediation(remediation_id: string, title: string, action: RemediationDefinition['action'], automatic = true): RemediationDefinition {
  return { remediation_id, title, action, automatic, preserves_exact_scope: true, exposes_original_reason_code: true };
}

