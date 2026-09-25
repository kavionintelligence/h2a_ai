import { ORGANIZATION_NAME, personName, toolFor, type Department, type Scenario, type SimTask } from './model';

export type CompletedTaskOutput = {
  title: string;
  filename: string;
  markdown: string;
  sections: { heading: string; body: string }[];
};

type Deliverable = { purpose: string; recommendations: string[]; acceptance: string[] };
const DELIVERABLES: Record<string, Deliverable> = {
  'Prepare hospital staff portal release': {
    purpose: 'Release handoff for the hospital staff portal: staff navigation, administrative request routing and service status only.',
    recommendations: ['Keep the release limited to staff-facing administrative workflows; exclude clinical decision support.', 'Stage the portal release separately from production data changes and name the rollback owner in the change ticket.', 'Route access exceptions to Cybersecurity and unresolved navigation issues to Design.'],
    acceptance: ['Record the approved commit and change ticket before release.', 'Confirm staff-role access, keyboard navigation and rollback checks in the deployment environment.', 'Require a separate human deployment approval; this brief does not grant deployment authority.'],
  },
  'Review hospital service API changes': {
    purpose: 'Interface review for hospital administrative service APIs, covering contract compatibility and least-privilege access.',
    recommendations: ['Keep existing response fields stable; introduce incompatible fields behind a versioned contract.', 'Use department-scoped service identities and aggregate operational responses.', 'Do not expose patient records, credentials or personal staff details through the administrative API.'],
    acceptance: ['Attach contract comparison and authorization test results to the implementation review.', 'Reject wildcard scopes and ensure denied requests have an auditable reason.', 'Confirm downstream owners before deprecating an existing field.'],
  },
  'Investigate staff portal response time': {
    purpose: 'Investigation plan and operational handoff for staff portal response-time concerns.',
    recommendations: ['Compare request duration by route using aggregate timings, excluding request bodies.', 'Check service dependency latency, cache reuse and retry amplification before changing infrastructure.', 'Prioritize the slowest administrative route and assign follow-up to the Technology lead.'],
    acceptance: ['Capture a measured baseline and follow-up window in the actual environment.', 'Check error rate alongside latency so speed does not hide failed requests.', 'Do not label this artifact as a measured performance improvement.'],
  },
  'Create hospital platform migration readiness report': {
    purpose: 'Readiness report for an administrative platform migration with clear ownership and rollback gates.',
    recommendations: ['Separate configuration, metadata and sensitive-data migration workstreams.', 'Confirm source and destination access scopes with Cybersecurity before copying any records.', 'Schedule a non-production rehearsal and document the rollback trigger.'],
    acceptance: ['Verify backup restoration and record rehearsal evidence before production approval.', 'Reconcile approved record counts without exposing record contents.', 'Require the change owner to approve the cutover window.'],
  },
  'Draft hospital platform dependency upgrade plan': {
    purpose: 'Bounded dependency upgrade plan for the hospital platform codebase.',
    recommendations: ['Group low-impact library upgrades separately from runtime and authentication changes.', 'Review release notes and lockfile differences; never infer vulnerability clearance from version alone.', 'Assign application owners to compatibility checks and stage rollout in a non-production workspace.'],
    acceptance: ['Attach build, test and dependency-scan evidence when implementation is performed.', 'Keep a reviewed rollback commit and pin dependency versions.', 'Require human review before merge and production deployment.'],
  },
  'Investigate unusual hospital AI data access': {
    purpose: 'Investigation brief for unusual AI access to hospital administrative information.',
    recommendations: ['Resolve the runtime to an agent, accountable human, Passport and current mandate.', 'Compare the requested operation and destination with the exact approved action.', 'Preserve event identifiers and metadata; avoid copying sensitive content into investigation notes.'],
    acceptance: ['Distinguish observed access from a hypothesis and from confirmed disclosure.', 'Escalate unknown owners or destinations to the security reviewer.', 'Verify actual containment through the connected system before marking an incident contained.'],
  },
  'Review hospital agent privilege drift': {
    purpose: 'Privilege review comparing approved work with the agent’s observed administrative access.',
    recommendations: ['List system permissions alongside mandate-allowed operations.', 'Flag write access where the approved task only needs read access.', 'Retain separate approval for external exports and onward delegation.'],
    acceptance: ['Record the permission source and collection time.', 'Treat missing permission evidence as unknown, not compliant.', 'Verify a privilege reduction at the source system after its owner approves it.'],
  },
  'Assess staff portal release security controls': {
    purpose: 'Security review checklist for an administrative portal release.',
    recommendations: ['Review session handling, role boundaries and administrative API authorization.', 'Check that application logs exclude credentials and sensitive record contents.', 'Track unresolved findings with an owner and release-blocking decision.'],
    acceptance: ['Attach actual security test evidence before calling a control verified.', 'Require explicit risk acceptance for unresolved release-blocking issues.', 'Keep release approval separate from this completed assessment artifact.'],
  },
  'Triage unregistered hospital coding assistant': {
    purpose: 'Ownership and authorization triage for an observed coding assistant.',
    recommendations: ['Separate installation evidence from active execution and network activity.', 'Ask the responsible team lead to identify the user and intended repository scope.', 'Withhold trusted registration until ownership and permitted operations are reviewed.'],
    acceptance: ['Record discovery source, time, runtime identity and confidence.', 'Do not claim that an observed installation has been remotely stopped.', 'Require approved registration and a bounded mandate before room participation.'],
  },
  'Prepare hospital incident response evidence': {
    purpose: 'Evidence index for a hospital AI governance investigation.',
    recommendations: ['Preserve task IDs, original human identity, agent IDs and policy decisions in order.', 'Document collection gaps and identify which records are scenario-generated.', 'Restrict evidence sharing to the investigation room and named reviewers.'],
    acceptance: ['Keep source timestamps separate from collection timestamps.', 'Do not imply external attestation or tamper-proof storage without independent verification.', 'Confirm retention and export authorization with the evidence owner.'],
  },
  'Review staff onboarding accessibility': {
    purpose: 'Accessible staff onboarding handoff for the hospital administrative portal.',
    recommendations: ['Use explicit field labels and actionable validation messages.', 'Keep tab order aligned with the visual sequence and show a visible focus indicator.', 'Provide status text alongside red, amber and green indicators.'],
    acceptance: ['Verify keyboard-only completion and screen-reader announcements during implementation.', 'Check contrast at supported viewport sizes.', 'Do not substitute this design review for an accessibility conformance audit.'],
  },
  'Synthesize hospital staff usability research': {
    purpose: 'Research synthesis structure for staff administrative workflows without identifiable participant data.',
    recommendations: ['Group observations by navigation, task handoff and approval clarity.', 'Separate reported observations, design hypotheses and open validation questions.', 'Prioritize changes that reduce ambiguous ownership and repeated data entry.'],
    acceptance: ['Keep participant names and patient examples out of shared memory.', 'Link each research conclusion to its approved source when real research is added.', 'Validate proposed changes with authorized staff before broad rollout.'],
  },
  'Publish hospital portal interface handoff': {
    purpose: 'Implementation handoff for the hospital portal interface and its interaction states.',
    recommendations: ['Specify loading, empty, pending approval, denied and completed states.', 'Keep the primary task action visible and provide contextual evidence in a side panel.', 'Preserve navigation context when moving from company to team to room.'],
    acceptance: ['Include component names, interaction behavior and content ownership.', 'Support keyboard access and responsive layout at narrow widths.', 'Verify that UI labels reflect real backend capability rather than visual intent.'],
  },
  'Evaluate hospital operations dashboard usability': {
    purpose: 'Dashboard usability review focused on accountable operational decisions.',
    recommendations: ['Show action-required items before background activity.', 'Use counts derived from the same filtered dataset and label their time window.', 'Show the owner, evidence source and next action for every security concern.'],
    acceptance: ['Confirm that every metric reconciles with its drill-down.', 'Provide a clear back route from room and identity detail views.', 'Use text and icons as well as color to communicate state.'],
  },
  'Review hospital design-system adoption': {
    purpose: 'Design-system adoption plan for consistent hospital administrative interfaces.',
    recommendations: ['Consolidate status badges, table interactions and inspector patterns.', 'Use light-blue surfaces and navy text for the core workspace.', 'Reserve dark presentation for the company-brain visualization, with readable labels and focus states.'],
    acceptance: ['Check consistent component behavior across teams.', 'Remove decorative charts that do not answer an operational question.', 'Include responsive and keyboard checks in the implementation review.'],
  },
  'Prepare hospital partnership account brief': {
    purpose: 'Account planning brief for a prospective hospital service partnership.',
    recommendations: ['Summarize the partner’s administrative needs using approved account information.', 'Present service scope, accountable contacts and open diligence questions separately.', 'Route security and data-sharing questions to their named owners.'],
    acceptance: ['Exclude patient information and unapproved commercial commitments.', 'Confirm each externally shared claim with its business owner.', 'Require commercial approval before sending a proposal or quoting a price.'],
  },
  'Review hospital partner security questionnaire': {
    purpose: 'Response handoff for a partner security questionnaire.',
    recommendations: ['Distinguish implemented controls from planned controls and unanswered questions.', 'Reference approved evidence IDs rather than sharing raw security logs.', 'Escalate questions about certifications, containment and sensitive data to Cybersecurity.'],
    acceptance: ['Do not claim a certification or audit that has not been independently established.', 'Have the security owner approve externally shared responses.', 'Use the current evidence version and record its review date.'],
  },
  'Draft corporate wellness partnership renewal': {
    purpose: 'Administrative renewal outline for a corporate wellness partnership; not a medical or contractual recommendation.',
    recommendations: ['Separate service administration, scheduling responsibilities and reporting expectations.', 'Use only aggregate program reporting and approved service descriptions.', 'List changes requiring commercial, legal or security review.'],
    acceptance: ['Exclude participant health information and individual outcomes.', 'Keep pricing, commitments and signatures pending human approval.', 'Confirm the authorized recipient before external transmission.'],
  },
  'Analyze hospital partnership opportunity risks': {
    purpose: 'Opportunity risk register covering administrative, commercial and information-sharing boundaries.',
    recommendations: ['Track unconfirmed requirements, data destinations and contractual dependencies.', 'Assign a responsible owner to each open question.', 'Separate a potential risk from a confirmed incident.'],
    acceptance: ['Do not infer partner assurance from a logo or platform name.', 'Resolve sensitive data-sharing questions before commitment.', 'Require explicit approval for accepted commercial risk.'],
  },
  'Prepare hospital services presentation brief': {
    purpose: 'Presentation outline for hospital administrative service capabilities.',
    recommendations: ['Lead with approved service scope and responsible teams.', 'Use synthetic examples for workflow walkthroughs.', 'Show limits and outstanding integration requirements alongside capabilities.'],
    acceptance: ['Remove unsupported clinical outcome and security guarantees.', 'Review all externally shared slides with the commercial owner.', 'Avoid patient stories or identifiable case material.'],
  },
  'Review hospital outreach campaign claims': {
    purpose: 'Claims review for a hospital outreach campaign.',
    recommendations: ['Use factual service availability and contact information approved by the service owner.', 'Exclude guarantees about treatment outcomes or security certification.', 'Route clinical statements outside this administrative workflow for appropriate professional review.'],
    acceptance: ['Record the source and owner of every public factual claim.', 'Require human approval before publication.', 'Do not reuse an old approval for changed campaign wording.'],
  },
  'Draft hospital visitor information brief': {
    purpose: 'Plain-language outline for hospital visitor information.',
    recommendations: ['Organize the brief into arrival, reception, accessibility assistance and contact routes.', 'Use approved operational information and avoid medical advice.', 'Provide a clear route to staff assistance when information is incomplete.'],
    acceptance: ['Confirm opening times, contact details and location information with the hospital owner.', 'Review translated and accessible versions before publication.', 'Do not include patient-specific visit details.'],
  },
  'Analyze hospital outreach campaign performance': {
    purpose: 'Aggregate outreach reporting plan focused on engagement, not individual health behavior.',
    recommendations: ['Compare approved campaign-level visits and engagement by reporting period.', 'Use aggregated counts and suppress identifying audience detail.', 'Document attribution limits and avoid claiming clinical or causal outcomes.'],
    acceptance: ['Attach the real analytics source and window before publishing numeric performance claims.', 'Do not export row-level visitor identifiers.', 'Route any new data destination to the security owner.'],
  },
  'Prepare hospital service awareness messaging': {
    purpose: 'Messaging handoff for awareness of hospital administrative services.',
    recommendations: ['Use concise service descriptions, eligibility routes and contact instructions.', 'Keep claims consistent across the website, email and print materials.', 'Separate draft copy from approved published copy.'],
    acceptance: ['Obtain the relevant service owner’s factual review.', 'Exclude unverified availability promises and treatment outcome statements.', 'Require a fresh review when the copy or destination changes.'],
  },
  'Review hospital marketing data permissions': {
    purpose: 'Access-scope review for hospital marketing tools and aggregate reports.',
    recommendations: ['List each approved data source, purpose, destination and retention owner.', 'Limit the agent to approved aggregate reports.', 'Deny patient identifiers, unrestricted exports and unrelated department records.'],
    acceptance: ['Validate actual permissions with the system owner.', 'Treat missing permission evidence as an open review item.', 'Confirm that external sharing has an exact-action approval.'],
  },
  'Prepare hospital board AI oversight brief': {
    purpose: 'Board brief on accountable AI activity across the hospital’s six operating teams.',
    recommendations: ['Report actual modeled headcount, accountable agents and outstanding human decisions.', 'Separate collaboration activity from control assurance and external enforcement.', 'Highlight blind spots, unresolved ownership and evidence limitations.'],
    acceptance: ['Reconcile every displayed count with the underlying scenario records.', 'Identify which capabilities still require a production integration.', 'Keep risk acceptance and funding as named human decisions.'],
  },
  'Review hospital departmental delivery risks': {
    purpose: 'Cross-team administrative delivery risk review.',
    recommendations: ['Track delayed decisions, shared dependencies and unclear ownership.', 'Link each risk to the affected room and accountable lead.', 'Prioritize unresolved access or data-sharing questions before delivery acceleration.'],
    acceptance: ['Keep operational risks separate from confirmed security incidents.', 'Record next action and responsible owner for each open item.', 'Confirm changes with the affected team before altering a delivery commitment.'],
  },
  'Reconcile hospital quarterly operating priorities': {
    purpose: 'Operating-priority reconciliation across six hospital support teams.',
    recommendations: ['Group work into service reliability, governed access, staff experience and operational readiness.', 'Surface competing demands on shared reviewers and platform owners.', 'Link each proposed priority to a responsible team and approval route.'],
    acceptance: ['Do not infer financial approval from task completion.', 'Keep scope changes and funding decisions pending management approval.', 'Reuse reviewed context only within its approved team scope.'],
  },
  'Assess hospital cross-team resource requests': {
    purpose: 'Resource-request handoff for collaboration across hospital support teams.',
    recommendations: ['Define the requested contribution, expected output and accountable receiving lead.', 'Grant only the room-scoped information required for the subtask.', 'Preserve the originating human and deny onward delegation beyond the mandate.'],
    acceptance: ['Confirm receiving-team capacity with its manager.', 'Require separate approval for new data access or commercial spending.', 'Record the final allocation as a human decision.'],
  },
  'Compile hospital executive operating review': {
    purpose: 'Executive operating review covering work throughput, decisions, reusable knowledge and open controls.',
    recommendations: ['Show completed work alongside blocked and awaiting-approval work.', 'Explain modeled context reuse separately from measured operational savings.', 'Carry forward open assurance gaps with a named owner.'],
    acceptance: ['Use the same time window for related activity measures.', 'Do not equate a green workflow state with organization-wide security.', 'Keep an inspectable path from the summary to task, mandate and evidence.'],
  },
};

const DEPARTMENT_SUMMARIES: Record<Department, string> = {
  Technology: 'Administrative software and infrastructure; no autonomous production deployment.',
  Cybersecurity: 'Identity, access and evidence review; external containment requires source-system verification.',
  Design: 'Staff-facing experience and accessible interfaces; no patient research records.',
  Sales: 'Hospital partnerships and commercial coordination; no autonomous contractual commitments.',
  Marketing: 'Hospital information and aggregate outreach; no patient targeting or clinical claims.',
  Management: 'Operating priorities and accountable decisions; no autonomous funding or risk acceptance.',
};

/** Local sample deliverable, derived only from scenario records. Never substitutes for runtime output. */
export function completedTaskOutput(scenario: Scenario, task: SimTask): CompletedTaskOutput | null {
  if (task.stage !== 'Completed') return null;
  const agent = scenario.agents.find(item => item.id === task.agent);
  const collaborator = scenario.agents.find(item => item.id === task.collaborator);
  if (!agent || !collaborator) return null;
  const deliverable = DELIVERABLES[task.title] || {
    purpose: `Operational handoff for ${task.title}.`,
    recommendations: [DEPARTMENT_SUMMARIES[task.department], 'Keep follow-up within the approved room and mandate.'],
    acceptance: ['Review supporting evidence before taking a production action.'],
  };
  const bullets = (items: string[]) => items.map(item => `- ${item}`).join('\n');
  const sections = [
    { heading: 'Executive handoff', body: `${deliverable.purpose}\n\n${task.result}` },
    { heading: 'Recommended actions', body: bullets(deliverable.recommendations) },
    { heading: 'Acceptance and follow-up gates', body: bullets(deliverable.acceptance) },
    { heading: 'Accountability and authority', body: `| Responsibility | Recorded identity |\n| --- | --- |\n| Accountable human | ${personName(scenario, task.owner)} |\n| Producing agent | ${agent.name} (${agent.id}) |\n| Passport | ${agent.passport} |\n| Mandate | ${agent.mandate} |\n| Peer review | ${collaborator.name} · ${task.peer} |\n| Peer accountable owner | ${personName(scenario, collaborator.owner)} |\n| Collaboration room | ${task.room} |\n\nAllowed work: ${agent.allowed.join('; ')}.\n\nRestricted work: ${agent.denied.join('; ')}.` },
    { heading: 'Record and context', body: `Task: ${task.id}\n\nCompleted: ${task.updated}\n\nTool boundary: ${toolFor(task.department)}\n\nModeled tool calls: ${task.calls}; baseline: ${task.baseline}; reviewed-context reuse: ${task.reused}.\n\nContext references: ${task.memoryIds.length ? task.memoryIds.join(', ') : 'No reviewed records reused'}.\n\nMemory publication is a separate review decision; this task output does not grant future execution authority.` },
    { heading: 'Provenance', body: 'Scenario output · synthetic operational example. Contains no patient data. No external system execution, clinical advice or independent control verification is asserted.' },
  ];
  const title = `${task.title} — completed handoff`;
  const filename = `${task.id.toLowerCase()}-${task.department.toLowerCase()}-handoff.md`;
  const markdown = `# ${title}\n\n${ORGANIZATION_NAME} · ${task.department}\n\n${sections.map(section => `## ${section.heading}\n\n${section.body}`).join('\n\n')}\n`;
  return { title, filename, markdown, sections };
}
