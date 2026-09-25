import { operatorJourneySchema, type GuidedWorkflow, type OperatorJourney } from '@h2a/contracts';
import { remediationForReasonCode } from './remediationCatalog';

export const OPERATOR_VOCABULARY = Object.freeze({
  human: 'Employee',
  agent: 'Agent',
  assignment: 'Task',
  dependency: 'Waits for',
  mandate: 'Allowed work',
  contextGrant: 'Shared context',
  approval: 'Human decision',
  evidence: 'Technical details'
});

export class OperatorJourneyProjectionService {
  public project(workflow: GuidedWorkflow): OperatorJourney {
    return operatorJourneySchema.parse({
      schema_version: 1,
      journey_id: workflow.workflow_id,
      title: workflow.title,
      status: workflow.status,
      steps: workflow.steps.map((step) => ({
        step_id: step.step_id,
        title: step.title,
        status: normalizeStatus(step.status),
        dependency_ids: step.prerequisites,
        reason_code: step.reason_code,
        canonical_reference_ids: step.evidence_refs,
        remediation_id: step.status === 'succeeded' ? null : remediationForReasonCode(step.reason_code).remediation_id
      })),
      active_step_id: workflow.active_step_id,
      generated_at: workflow.updated_at
    });
  }
}

function normalizeStatus(status: GuidedWorkflow['steps'][number]['status']): OperatorJourney['steps'][number]['status'] {
  if (status === 'awaiting-human' || status === 'awaiting-approval' || status === 'awaiting-configuration') return 'paused';
  return status;
}

