import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = process.cwd();
const registryPath = join(root, 'docs', 'plan3', 'CONTROL_REGISTRY.json');
const outputPath = join(root, 'docs', 'plan5', 'evidence', 'phase45', 'operator-journey-baseline.json');
const registryText = await readFile(registryPath, 'utf8');
const registry = JSON.parse(registryText);

const journeys = [
  journey('set-up-people', 'Set up people', [
    command('office.workflow.continue'), route('shell.navigate'), proof('human-proof.enroll-or-verify'),
    proof('human-proof.enroll-or-verify'), route('shell.navigate'), command('office.workflow.continue'),
    route('shell.navigate'), command('organization.bootstrap'), command('organization.role.create'),
    command('organization.membership.join'), command('organization.credential.issue'), route('shell.navigate'),
    command('ceremony.prerequisites.assess')
  ]),
  journey('connect-agents', 'Connect agents', [
    command('office.workflow.continue'), route('shell.navigate'), command('ceremony.session.create'),
    command('bootstrap.run-step'), command('bootstrap.run-step'), route('shell.navigate'),
    refresh('phase26.refresh'), command('phase26.preflight')
  ]),
  journey('run-governed-task', 'Run governed task', [
    command('office.workflow.continue'), route('shell.navigate'), command('phase27.prepare'),
    proof('human-proof.enroll-or-verify'), command('phase27.lane.run'), command('phase27.lane.run'),
    command('phase27.lane.run'), command('phase27.lane.run'), route('shell.navigate'),
    command('phase26.lane.run'), command('phase26.lane.run'), command('phase26.lane.run'),
    command('phase26.lane.run')
  ], { create_and_start_commands: 11 }),
  journey('approve-protected-action', 'Approve protected action', [
    command('office.workflow.continue'), route('shell.navigate'), command('phase28.configure'),
    proof('phase28.requester.verify'), command('phase28.request'), proof('approval.decision.verify'),
    command('approval.decision.approve'), command('approval.resume')
  ]),
  journey('connect-friend-node', 'Connect friend node', [
    command('office.workflow.continue'), route('shell.navigate'), proof('federation.proof.request'),
    command('federation.node.configure'), command('federation.listener.start'),
    command('federation.invitation.create'), copy('manual.federation.invitation.copy'),
    command('federation.registration.create'), copy('manual.federation.registration.copy'),
    command('federation.registration.approve'), copy('manual.federation.acceptance.copy'),
    command('federation.acceptance.activate'), refresh('federation.operator.refresh'),
    command('federation.envelope.exchange'), command('federation.ack.send'),
    command('federation.heartbeat.send')
  ], { connect_commands: 10 }),
  journey('security-validation', 'Security and containment', [
    route('shell.navigate'), refresh('security.validation.refresh'), command('security.attack.run'),
    command('security.attack.run'), command('security.attack.run'), command('security.attack.run'),
    command('security.attack.run'), command('security.attack.run'), command('security.containment.run'),
    command('security.containment.run'), command('security.containment.run')
  ]),
  journey('project-delivery', 'Governed project delivery', [
    route('shell.navigate'), command('project.register'), command('project.goal.sign'),
    command('project.assignment.sign'), command('project.assignment.sign'), command('project.worktree.lease'),
    command('project.providers.run-concurrent'), command('project.validation.run'),
    command('project.integration.prepare'), command('project.integration.route-approval'),
    proof('approval.decision.verify'), command('project.integration.approve')
  ]),
  journey('final-acceptance', 'Final acceptance', [
    route('shell.navigate'), command('acceptance.phase44.prepare'), command('acceptance.liveness.require'),
    proof('human-proof.enroll-or-verify'), proof('human-proof.enroll-or-verify'),
    command('ceremony.session.create'), command('ceremony.prerequisites.assess'),
    refresh('acceptance.refresh'), route('shell.navigate'), refresh('evidence.refresh'),
    route('shell.navigate'), command('acceptance.export')
  ])
];

const controls = registry.controls.map((control) => ({
  control_id: control.control_id,
  route: control.route,
  classification: control.classification,
  source: control.source,
  domain: domainFor(control)
}));

const baseline = {
  schema_version: 1,
  phase: 45,
  generated_from: 'docs/plan3/CONTROL_REGISTRY.json',
  source_registry_sha256: sha256(registryText),
  measurement_rules: {
    operator_command: 'A deliberate command that requests a state transition or live effect.',
    route_change: 'A presentation change between Office and a Control destination.',
    proof_attempt: 'One submitted Human Proof capture; camera retries are reported separately.',
    manual_refresh: 'A user-triggered state reconciliation command.',
    copied_payload: 'One manual clipboard transfer of signed protocol JSON.',
    recovery: 'One explicit replacement or retry command after an unmet prerequisite.'
  },
  click_budgets: {
    connect_discovered_coworker: { operator_commands: 3, excluded_required_pauses: ['human-proof', 'mutual-trust-confirmation'] },
    create_and_start_governed_task: { operator_commands: 4, excluded_required_pauses: ['human-proof', 'independent-approval', 'provider-consent'] },
    repair_expired_prerequisites: { operator_commands: 1, excluded_required_pauses: ['minimum-required-human-proof'] },
    resume_interrupted_demonstration: { operator_commands: 1, excluded_required_pauses: [] },
    open_technical_evidence: { operator_commands: 1, excluded_required_pauses: [] }
  },
  control_inventory: controls,
  journeys,
  privacy: {
    telemetry_fields: ['control_id', 'action_kind', 'occurred_at'],
    excluded: ['form values', 'prompts', 'response bodies', 'protected context values', 'biometric data', 'credentials', 'private keys', 'clipboard payloads'],
    transport: 'none',
    storage: 'local-minimized'
  },
  non_claims: [
    'No global username or organization-directory lookup exists in the local MVP.',
    'Discovery names, node names, usernames, avatars, and IP addresses are not trust anchors.',
    'Secure LAN discovery is disabled by default and only available for signed presence from explicitly HTTPS-pinned nodes.',
    'Phase 48 automates canonical federation records while Control retains the complete manual technical handshake path.',
    'Trust remains connected-observed.'
  ]
};

const serialized = `${JSON.stringify(baseline, null, 2)}\n`;
if (process.argv.includes('--verify')) {
  const current = await readFile(outputPath, 'utf8');
  if (current !== serialized) throw new Error('PHASE45_BASELINE_CHANGED');
  process.stdout.write(`H2A_PHASE45_BASELINE_OK ${controls.length} controls ${journeys.length} journeys\n`);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, 'utf8');
  process.stdout.write(`H2A_PHASE45_BASELINE_WRITTEN ${controls.length} controls ${journeys.length} journeys\n`);
}

function journey(journey_id, title, events, legacy = {}) {
  const count = (kind) => events.filter((event) => event.action_kind === kind).length;
  return {
    journey_id,
    title,
    current_sequence: events.map((event, index) => ({ sequence: index + 1, ...event })),
    baseline: {
      operator_commands: count('command'),
      route_changes: count('route-change'),
      proof_attempts: count('proof-attempt'),
      manual_refreshes: count('manual-refresh'),
      copied_payloads: count('copied-payload'),
      recoveries: count('repair')
    },
    legacy_observation: legacy
  };
}

function command(control_id) { return { control_id, action_kind: 'command' }; }
function route(control_id) { return { control_id, action_kind: 'route-change' }; }
function proof(control_id) { return { control_id, action_kind: 'proof-attempt' }; }
function refresh(control_id) { return { control_id, action_kind: 'manual-refresh' }; }
function copy(control_id) { return { control_id, action_kind: 'copied-payload' }; }

function domainFor(control) {
  const id = control.control_id;
  if (id.startsWith('human-proof.') || id.startsWith('organization.') || id.startsWith('bootstrap.')) return 'people';
  if (id.startsWith('federation.')) return 'federation';
  if (id.startsWith('approval.') || id.startsWith('phase28.')) return 'approval';
  if (id.startsWith('security.')) return 'security';
  if (id.startsWith('project.')) return 'project-delivery';
  if (id.startsWith('acceptance.') || id.startsWith('ceremony.') || id.startsWith('evidence.')) return 'final-acceptance';
  if (id.startsWith('context.') || id.startsWith('phase27.') || id.startsWith('mandate')) return 'tasks';
  if (id.startsWith('agent.') || id.startsWith('command-floor.agent') || id.startsWith('command-floor.runtime') || id.startsWith('command-floor.provider') || id.startsWith('command-floor.terminal') || id.startsWith('phase26.')) return 'agents';
  if (id.startsWith('command-floor.') || id.startsWith('settings.')) return 'tasks';
  return 'platform';
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
