import { createHash, randomUUID, sign } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { appendFile, cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

function signature(value, privateKey, signedBy) {
  const canonicalHash = hash(value);
  return {
    algorithm: 'Ed25519',
    signedBy,
    canonicalHash,
    value: `ed25519:${sign(null, Buffer.from(canonicalize(value)), privateKey).toString('base64')}`
  };
}

function organizationSignature(value, privateKey) {
  return `ed25519:${sign(null, Buffer.from(canonicalize(value)), privateKey).toString('base64')}`;
}

function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function envelope(kind, data, updatedAt) {
  return { schemaVersion: 1, kind, updatedAt, data };
}

async function readJson(root, relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function writeJson(root, relativePath, value) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function appendEvidence(root, input) {
  const ledgerPath = path.join(root, 'traces', 'tr_platform.jsonl');
  const contents = await readFile(ledgerPath, 'utf8');
  const lines = contents.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const previousHash = lines.length ? JSON.parse(lines.at(-1)).event_hash : null;
  const unsigned = {
    ...input,
    event_id: id('evt'),
    timestamp: input.timestamp ?? new Date().toISOString(),
    previous_hash: previousHash
  };
  await appendFile(ledgerPath, `${JSON.stringify({ ...unsigned, event_hash: hash(unsigned) })}\n`, 'utf8');
}

async function findLatestSource() {
  const roots = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (!entry.isDirectory()) continue;
      if (/^phase44-\d/u.test(entry.name)) {
        try {
          await stat(path.join(full, 'workspace', 'employee-workspace-v1.json'));
          roots.push(full);
        } catch {
          // Not a complete phase root.
        }
      } else if (!['node_modules', '.git', 'out'].includes(entry.name)) {
        await walk(full);
      }
    }
  }
  await walk(path.join(repoRoot, 'data', 'demo-sessions'));
  if (!roots.length) throw new Error('No complete Phase 44 data root was found. Pass --source explicitly.');
  const ranked = await Promise.all(roots.map(async (root) => ({ root, time: (await stat(root)).mtimeMs })));
  return ranked.sort((a, b) => b.time - a.time)[0].root;
}

const source = path.resolve(arg('--source') ?? await findLatestSource());
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const target = path.resolve(arg('--target') ?? path.join(repoRoot, 'data', 'demo-showcases', `hp-collaboration-showcase-${stamp}`));
const now = new Date();
const nowIso = now.toISOString();
const futureIso = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

try {
  await stat(target);
  throw new Error(`Target already exists: ${target}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await cp(source, target, {
  recursive: true,
  filter: (item) => {
    const relative = path.relative(source, item);
    if (!relative) return true;
    const normalized = relative.split(path.sep).join('/');
    return !normalized.startsWith('.electron-user-data/')
      && !normalized.startsWith('projects/worktrees/')
      && !normalized.startsWith('federation/')
      && !normalized.startsWith('contexts/private/')
      && normalized !== 'settings/provider-secrets.json';
  }
});

const orgFile = await readJson(target, 'organizations/registry-v2.json');
const membershipFile = await readJson(target, 'organizations/memberships-v2.json');
const humanFile = await readJson(target, 'humans/identities-v2.json');
const workspaceFile = await readJson(target, 'workspace/employee-workspace-v1.json');
const passportFile = await readJson(target, 'passports/registry-v2.json');
const bindingFile = await readJson(target, 'workplace/runtime-bindings.json');
const sessionFile = await readJson(target, 'runtime/sessions-v2.json');
const mandateFile = await readJson(target, 'mandates/registry.json');
const projectFile = await readJson(target, 'projects/project-delivery.json');
const graphFile = await readJson(target, 'projects/goal-work-graphs-v1.json');
const recentFile = await readJson(target, 'evidence/recent-events.json');
const organizationKey = (await readJson(target, 'settings/organization-signing-key-v2.json')).data.private_key_pem;
const projectKey = (await readJson(target, 'settings/project-signing-key.json')).data.private_key_pem;
const mandateKey = (await readJson(target, 'settings/h2a-signing-key.json')).data.private_key_pem;

const organization = orgFile.data[0];
organization.name = 'HP AI Collaboration Showcase (Synthetic)';
organization.updated_at = nowIso;

const existingPeople = new Map(humanFile.data.map((human) => [human.human_id, human]));
const syntheticPeople = [
  ['Maya Thompson', 'HP-DEMO-CEO-091', 'Executive Office', ['chief-executive']],
  ['Daniel Kim', 'HP-DEMO-CTO-092', 'Technology', ['chief-technology-officer']],
  ['Renee Foster', 'HP-DEMO-CISO-093', 'Security', ['chief-information-security-officer', 'approver']],
  ['Omar Haddad', 'HP-DEMO-CFO-094', 'Finance', ['chief-financial-officer', 'approver']],
  ['Grace Liu', 'HP-DEMO-COO-095', 'Operations', ['chief-operating-officer']],
  ['Ethan Cole', 'HP-DEMO-CDO-096', 'Data & Analytics', ['chief-data-officer']],
  ['Aisha Raman', 'HP-DEMO-SEC-101', 'Security', ['security-lead', 'approver']],
  ['Marcus Chen', 'HP-DEMO-FIN-102', 'Finance', ['finance-analyst']],
  ['Elena Garcia', 'HP-DEMO-MKT-103', 'Marketing', ['campaign-owner']],
  ['Jordan Brooks', 'HP-DEMO-SALES-104', 'Sales', ['sales-operations']],
  ['Priya Nair', 'HP-DEMO-DATA-105', 'Data & Analytics', ['data-steward']],
  ['Noah Williams', 'HP-DEMO-HR-106', 'People Operations', ['hr-partner']],
  ['Sofia Patel', 'HP-DEMO-OPS-107', 'Operations', ['operations-lead']],
  ['Liam Osei', 'HP-DEMO-ENG-108', 'Technology', ['engineer']]
].map(([name, employeeId, department, roles]) => {
  const humanId = id('human_demo');
  const membershipId = id('membership_demo');
  return {
    identity: {
      schema_version: 2, human_id: humanId, organization_id: organization.organization_id,
      display_name: `[DEMO] ${name}`, status: 'active', active_membership_id: membershipId,
      created_at: nowIso, updated_at: nowIso
    },
    membership: {
      schema_version: 2, membership_id: membershipId, organization_id: organization.organization_id,
      human_id: humanId, employee_id: employeeId, department, role_ids: roles,
      status: 'active', effective_from: nowIso, updated_at: nowIso
    }
  };
});
humanFile.data.push(...syntheticPeople.map((item) => item.identity));
membershipFile.data.push(...syntheticPeople.map((item) => item.membership));
for (const item of syntheticPeople) existingPeople.set(item.identity.human_id, item.identity);

const realMemberships = membershipFile.data.filter((item) => !item.membership_id.startsWith('membership_demo')).map((item) => item.membership_id);
const allSyntheticMemberships = syntheticPeople.map((item) => item.membership.membership_id);
const roomSpecs = [
  ['AI Storefront Delivery', 'Technology', [0, 1, 7, 9, 13]],
  ['Quarter-close Finance Controls', 'Finance', [0, 3, 8, 10]],
  ['Vendor Security Review', 'Security', [0, 2, 6, 10, 13]],
  ['Retail Campaign Studio', 'Marketing', [0, 8, 9, 10]],
  ['Employee Onboarding', 'People Operations', [0, 5, 11, 13]],
  ['Supply Chain Intelligence', 'Operations', [0, 4, 5, 10, 12]]
];
const rooms = roomSpecs.map(([title, department, memberIndexes], index) => ({
  room_id: `room_demo_${index + 1}_${randomUUID()}`,
  organization_id: organization.organization_id,
  title: `DEMO · ${title}`,
  owner_membership_id: realMemberships[index % realMemberships.length],
  member_ids: [...new Set([...realMemberships, ...memberIndexes.map((memberIndex) => allSyntheticMemberships[memberIndex])])],
  department,
  revision: 1,
  created_at: new Date(now.getTime() - (12 - index) * 24 * 60 * 60 * 1000).toISOString(),
  updated_at: nowIso
}));

const memoryTemplates = [
  ['Approved storefront voice and accessibility rules', 'Published decisions: direct language, WCAG AA contrast, keyboard-first checkout, and no customer PII in agent context.', 'published'],
  ['Research handoff summary', 'Synthetic summary of product categories, audience questions, source hashes, and fields withheld from downstream agents.', 'published'],
  ['Launch checklist revision', 'Draft checklist for content, implementation, QA, protected deployment approval, and rollback evidence.', 'draft'],
  ['Control exceptions for quarter close', 'Reviewed list of synthetic finance controls, evidence owners, exceptions, and independent approval boundaries.', 'published'],
  ['Unverified forecast assumptions', 'Rejected because the synthetic source package did not include a reproducible retrieval hash.', 'rejected'],
  ['Least-context finance glossary', 'Published definitions shared with agents without account numbers, credentials, payroll data, or customer records.', 'published'],
  ['Third-party risk findings', 'Reviewed synthetic findings with severity, control mapping, remediation owner, and a protected publication checkpoint.', 'published'],
  ['Vendor secrets handling', 'Withdrawn draft that attempted to include a token-like value; retained only as a governance lifecycle example.', 'withdrawn'],
  ['Threat-model decisions', 'Published boundary decisions for provider isolation, command allowlists, cancellation, and durable trace reconstruction.', 'published'],
  ['Campaign audience brief', 'Approved synthetic audience segments, brand constraints, campaign measures, and prohibited targeting attributes.', 'published'],
  ['Creative exploration notes', 'Draft concepts awaiting a human owner decision before agents receive the final visual direction.', 'draft'],
  ['Channel QA rubric', 'Published checks for claims, accessibility, localization, link integrity, and evidence retention.', 'published'],
  ['Onboarding policy summary', 'Published role-specific onboarding steps and minimum context required by HR, Security, and IT agents.', 'published'],
  ['Employee private-data exclusion', 'Reviewed rule: personal identifiers, biometrics, and compensation records remain outside shared agent context.', 'published'],
  ['Welcome-flow experiment', 'Rejected because the proposed automation exceeded the approved employee communication channel.', 'rejected'],
  ['Supplier briefing', 'Published synthetic supplier signals, delivery risks, and source provenance without contract-confidential fields.', 'published'],
  ['Demand scenario notes', 'Draft scenario comparison for the operations owner to review before downstream planning.', 'draft'],
  ['Escalation and cancellation playbook', 'Published steps showing how an employee pauses, cancels, or revokes agent work while preserving the evidence chain.', 'published']
];
const memories = memoryTemplates.map(([title, body, status], index) => {
  const room = rooms[Math.floor(index / 3)];
  const author = room.member_ids[index % room.member_ids.length];
  const record = {
    memory_id: `memory_demo_${index + 1}_${randomUUID()}`,
    room_id: room.room_id,
    organization_id: organization.organization_id,
    author_membership_id: author,
    title: `DEMO · ${title}`,
    body: `[SYNTHETIC SHOWCASE DATA] ${body}`,
    revision: 1,
    content_hash: '',
    status,
    created_at: new Date(now.getTime() - (18 - index) * 60 * 60 * 1000).toISOString(),
    updated_at: nowIso
  };
  record.content_hash = hash({ title: record.title, body: record.body });
  if (status !== 'draft') {
    record.reviewer_membership_id = realMemberships[(index + 1) % realMemberships.length];
    record.review_proof_id = `demo_review_not_acceptance_${index + 1}`;
  }
  return record;
});
const workspaceData = { revision: (workspaceFile.data.data.revision ?? 0) + 1, rooms, memory: memories };
workspaceFile.data = {
  data: workspaceData,
  canonicalHash: hash(workspaceData),
  signature: organizationSignature(workspaceData, organizationKey)
};

const agents = passportFile.data.slice(0, 4).map((passport) => {
  const binding = bindingFile.data.find((item) => item.agent_id === passport.agent_id);
  const session = sessionFile.data.find((item) => item.passport_id === passport.passport_id);
  if (!binding || !session) throw new Error(`Agent ${passport.agent_id} is missing a runtime binding or session.`);
  return { passport, binding, session };
});
if (agents.length < 4) throw new Error('The source root must contain four agent passports.');

const missionSpecs = [
  ['AI Storefront Delivery', 'Deliver an accessible commerce storefront from bounded research through QA.', 'completed', 'internal'],
  ['Quarter-close Control Review', 'Review synthetic finance controls and produce a traceable exception package.', 'completed', 'restricted'],
  ['Vendor Security Onboarding', 'Assess a synthetic vendor and stop before protected publication pending independent approval.', 'blocked', 'restricted'],
  ['Retail Campaign Launch', 'Create an evidence-backed campaign package with reviewed claims and channel QA.', 'completed', 'confidential'],
  ['Employee Onboarding Automation', 'Draft a governed onboarding flow and retain its operator cancellation history.', 'cancelled', 'confidential'],
  ['Supply Chain Risk Briefing', 'Research synthetic supplier risk and deliver an independently validated operations briefing.', 'completed', 'internal']
];
const nodeRoles = [
  ['Research', 'Collect bounded sources and produce a cited brief.', ['source.url', 'source.title', 'source.excerpt'], ['credentials', 'personal_data', 'private_notes']],
  ['Design', 'Translate the brief into a clear experience and decision proposal.', ['research.summary', 'brand.rules', 'audience.needs'], ['raw_sources', 'credentials', 'personal_data']],
  ['Implementation', 'Produce the bounded implementation or operational deliverable.', ['design.specification', 'approved.requirements', 'predecessor.hashes'], ['private_notes', 'credentials', 'unapproved_data']],
  ['QA', 'Validate quality, policy boundaries, and expected outputs.', ['output.hash', 'validation.criteria', 'predecessor.hashes'], ['response.bodies', 'credentials', 'personal_data']]
];
const projects = [];
const projectGoals = [];
const projectAssignments = [];
const projectSources = [];
const projectMessages = [];
const projectValidations = [];
const projectRuns = [];
const goals = [];
const graphs = [];
const mandates = [];
const traceEvents = [];

for (let missionIndex = 0; missionIndex < missionSpecs.length; missionIndex += 1) {
  const [missionTitle, objective, graphStatus, sensitivity] = missionSpecs[missionIndex];
  const slug = missionTitle.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
  const projectId = `project_demo_${missionIndex + 1}_${randomUUID()}`;
  const goalId = `goal_demo_${missionIndex + 1}_${randomUUID()}`;
  const graphId = `graph_demo_${missionIndex + 1}_${randomUUID()}`;
  const traceId = `tr_showcase_${missionIndex + 1}_${randomUUID()}`;
  const projectRoot = path.join(target, 'showcase-workspaces', slug);
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(projectRoot, 'README.md'), `# DEMO · ${missionTitle}\n\nSynthetic showcase workspace. Not acceptance evidence.\n`, 'utf8');
  projects.push({
    project_id: projectId, display_name: `DEMO · ${missionTitle}`, canonical_root: projectRoot,
    repository_mode: 'read-only-non-git', git_common_dir: null, base_branch: null, base_revision: null,
    protected_paths: ['**/.env', '**/secrets/**', '**/identity/**'], allowed_commands: [], network_hosts: [],
    fallback_limitations: ['Synthetic showcase workspace; provider execution and integration are disabled.'], registered_at: nowIso
  });
  rooms[missionIndex].project_ids = [projectId];
  rooms[missionIndex].goal_ids = [goalId];
  const projectGoalUnsigned = {
    goal_id: goalId, project_id: projectId, objective: `[SYNTHETIC SHOWCASE] ${objective}`,
    expected_outputs: ['Reviewed work package', 'Validation summary', 'Traceable output hashes'],
    created_by: 'human_employee_001', trace_id: traceId, created_at: nowIso
  };
  projectGoals.push({ ...projectGoalUnsigned, signature: signature(projectGoalUnsigned, projectKey, 'human_employee_001') });
  goals.push({
    schema_version: 1, goal_id: goalId, organization_id: organization.organization_id, project_id: projectId,
    title: `DEMO · ${missionTitle}`, objective: `[SYNTHETIC SHOWCASE] ${objective}`,
    outcome: graphStatus === 'completed' ? 'Synthetic work package completed with bounded context and durable hashes.' : graphStatus === 'blocked' ? 'Paused at a synthetic independent-approval checkpoint.' : 'Cancelled by the synthetic human owner; prior evidence remains.',
    constraints: ['Synthetic showcase only', 'Least context', 'No credentials or personal data', 'Human decision for protected effects'],
    deadline: null, sensitivity, expected_outputs: ['Bounded brief', 'Work product', 'QA evidence'],
    created_by_human_id: missionIndex % 2 ? 'human_employee_002' : 'human_employee_001', trace_id: traceId,
    status: graphStatus, created_at: new Date(now.getTime() - (missionIndex + 3) * 24 * 60 * 60 * 1000).toISOString(), updated_at: nowIso
  });

  const nodes = [];
  const edges = [];
  for (let nodeIndex = 0; nodeIndex < nodeRoles.length; nodeIndex += 1) {
    const [roleName, nodeObjective, allowedFields, withheldFields] = nodeRoles[nodeIndex];
    const agent = agents[nodeIndex];
    const assignmentId = `project_assignment_demo_${missionIndex + 1}_${nodeIndex + 1}_${randomUUID()}`;
    const mandateId = `mnd_demo_${missionIndex + 1}_${nodeIndex + 1}_${randomUUID()}`;
    const nodeId = `work_node_demo_${missionIndex + 1}_${nodeIndex + 1}_${randomUUID()}`;
    const cancelled = graphStatus === 'cancelled' && nodeIndex >= 2;
    const approvalRequired = graphStatus === 'blocked' && nodeIndex === 3;
    const waiting = graphStatus === 'blocked' && nodeIndex > 3;
    const nodeStatus = cancelled ? (nodeIndex === 2 ? 'cancelled' : 'revoked') : approvalRequired ? 'approval-required' : waiting ? 'waiting' : 'succeeded';
    const owner = syntheticPeople[(missionIndex + nodeIndex) % syntheticPeople.length].identity.human_id;
    const assignmentUnsigned = {
      assignment_id: assignmentId, goal_id: goalId, project_id: projectId,
      title: `DEMO · ${roleName}: ${missionTitle}`, objective: `[SYNTHETIC SHOWCASE] ${nodeObjective}`,
      output_contract: [`${roleName.toLowerCase()} summary`, 'Content hash', 'Evidence references'],
      tool_contract: nodeIndex === 0 ? ['governed-research'] : nodeIndex === 3 ? ['validation-read'] : ['workspace-read'],
      allowed_paths: [], network_hosts: [], validation_commands: [], depends_on: nodeIndex ? [projectAssignments[projectAssignments.length - 1].assignment_id] : [],
      agent_id: agent.passport.agent_id, passport_id: agent.passport.passport_id, runtime_session_id: agent.session.runtime_session_id,
      mandate_id: mandateId, provider: agent.binding.provider,
      kind: nodeIndex === 0 ? 'research' : nodeIndex === 2 ? 'integration' : 'edit',
      status: cancelled ? 'cancelled' : approvalRequired ? 'blocked' : 'approved',
      reason_code: cancelled ? 'DEMO_OPERATOR_CANCELLED' : approvalRequired ? 'DEMO_INDEPENDENT_APPROVAL_REQUIRED' : null,
      created_at: goals[goals.length - 1].created_at, updated_at: nowIso
    };
    projectAssignments.push({ ...assignmentUnsigned, signature: signature(assignmentUnsigned, projectKey, 'human_employee_001') });
    const mandateUnsigned = {
      mandateId, version: 1, depth: nodeIndex === 0 ? 0 : 1,
      ...(nodeIndex === 0 ? {} : { parentMandateId: mandates[mandates.length - nodeIndex].mandateId }),
      issuer: { humanId: missionIndex % 2 ? 'human_employee_002' : 'human_employee_001', humanProofId: `demo_proof_not_acceptance_${missionIndex + 1}` },
      subject: { agentId: agent.passport.agent_id, passportId: agent.passport.passport_id },
      objective: `[SYNTHETIC SHOWCASE] ${nodeObjective}`,
      resources: [`showcase.project.${slug}`], actions: [`showcase.${roleName.toLowerCase()}.read`, `showcase.${roleName.toLowerCase()}.produce`],
      prohibitedActions: ['credential.read', 'personal_data.read', 'system.modify'],
      limits: { maxRecords: 50, maxDurationMinutes: 120, parameterEquals: { dataset: 'synthetic-showcase' } },
      disclosure: { allowedFields }, approvals: { requiredActions: approvalRequired ? ['showcase.findings.publish'] : [] },
      delegation: { allowed: false, allowedAgentIds: [], maxDepth: 0 }, issuedAt: nowIso, expiresAt: futureIso,
      status: cancelled ? (nodeIndex === 2 ? 'expired' : 'revoked') : 'active'
    };
    mandates.push({ ...mandateUnsigned, signature: signature(mandateUnsigned, mandateKey, mandateUnsigned.issuer.humanId) });
    const outputHash = nodeStatus === 'succeeded' ? hash({ missionTitle, roleName, synthetic: true, revision: 1 }) : null;
    nodes.push({
      node_id: nodeId, title: `DEMO · ${roleName}`, objective: `[SYNTHETIC SHOWCASE] ${nodeObjective}`,
      human_owner_id: owner, agent_id: agent.passport.agent_id, runtime_binding_id: agent.binding.binding_id,
      execution_target: 'local', remote_peer_id: null, passport_id: agent.passport.passport_id,
      runtime_session_id: agent.session.runtime_session_id, runtime_attestation_id: agent.session.runtime_attestation_id,
      mandate_id: mandateId, context_grant_id: `grant_demo_${missionIndex + 1}_${nodeIndex + 1}`,
      project_assignment_id: assignmentId, workplace_assignment_id: `assignment_demo_${missionIndex + 1}_${nodeIndex + 1}`,
      worktree_lease_id: null, mailbox_route_id: `mailbox_demo_${missionIndex + 1}_${nodeIndex + 1}`,
      provider: agent.binding.provider, allowed_context_fields: allowedFields, withheld_context_fields: withheldFields,
      allowed_paths: [], allowed_tools: assignmentUnsigned.tool_contract, allowed_network_hosts: [],
      expected_outputs: assignmentUnsigned.output_contract, validation_commands: [],
      mandate_scope: { resources: mandateUnsigned.resources, actions: mandateUnsigned.actions, fields: allowedFields, paths: [], commands: [], capabilities: agent.passport.capabilities.slice(0, 6), duration_seconds: 7200, quorum: approvalRequired ? 1 : null, policy_bindings: approvalRequired ? ['policy_demo_independent_review'] : [] },
      mandate_expires_at: futureIso, approval_policy_ids: approvalRequired ? ['policy_demo_independent_review'] : [],
      replacement_for_node_id: null, status: nodeStatus, reason_code: assignmentUnsigned.reason_code,
      output_ref: outputHash ? `showcase-output://${traceId}/${nodeIndex + 1}` : null, output_hash: outputHash,
      evidence_refs: [`evt_demo_${missionIndex + 1}_${nodeIndex + 1}_assigned`, ...(outputHash ? [`evt_demo_${missionIndex + 1}_${nodeIndex + 1}_completed`] : [])]
    });
    if (nodeIndex) edges.push({ edge_id: `edge_demo_${missionIndex + 1}_${nodeIndex}`, predecessor_node_id: nodes[nodeIndex - 1].node_id, successor_node_id: nodeId, condition: 'succeeded', on_unsatisfied: 'wait' });
    if (nodeIndex === 0) {
      const sourceUnsigned = { source_id: `source_demo_${missionIndex + 1}`, assignment_id: assignmentId, url: `https://example.com/showcase/${slug}`, host: 'example.com', retrieved_at: nowIso, content_hash: hash({ missionTitle, source: 'synthetic' }), classification: 'public', title: `DEMO source package for ${missionTitle}`, excerpt: 'Synthetic source excerpt used only to populate the showcase interface.', delivered_fields: ['url', 'title', 'excerpt', 'content_hash', 'retrieved_at', 'classification'] };
      projectSources.push({ ...sourceUnsigned, signature: signature(sourceUnsigned, projectKey, agent.passport.agent_id) });
    }
    const messageUnsigned = { message_id: `message_demo_${missionIndex + 1}_${nodeIndex + 1}`, project_id: projectId, goal_id: goalId, assignment_id: assignmentId, from_agent_id: agent.passport.agent_id, to_assignment_id: nodeIndex < 3 ? `project_assignment_demo_target_${missionIndex + 1}_${nodeIndex + 2}` : null, kind: nodeStatus === 'succeeded' ? 'completion' : 'dependency', subject: `DEMO · ${roleName} handoff`, body_hash: hash({ missionTitle, roleName, note: 'synthetic mailbox body withheld' }), references: [mandateId, `grant_demo_${missionIndex + 1}_${nodeIndex + 1}`], created_at: nowIso };
    projectMessages.push({ ...messageUnsigned, signature: signature(messageUnsigned, projectKey, agent.passport.agent_id) });
    if (nodeStatus === 'succeeded') {
      const validationUnsigned = { receipt_id: `validation_demo_${missionIndex + 1}_${nodeIndex + 1}`, project_id: projectId, assignment_id: assignmentId, command_id: `demo-${roleName.toLowerCase()}-review`, started_at: nowIso, completed_at: nowIso, exit_code: 0, status: 'passed', output_hash: outputHash, output_excerpt: 'SYNTHETIC SHOWCASE: bounded output contract and evidence references validated.' };
      projectValidations.push({ ...validationUnsigned, signature: signature(validationUnsigned, projectKey, agent.passport.agent_id) });
      projectRuns.push({ run_id: `run_demo_${missionIndex + 1}_${nodeIndex + 1}`, project_id: projectId, assignment_id: assignmentId, provider: agent.binding.provider, status: 'succeeded', prompt_hash: hash({ objective: nodeObjective, synthetic: true }), output_hash: outputHash, reason_code: 'SYNTHETIC_SHOWCASE_HISTORY', process_id: null, started_at: nowIso, completed_at: nowIso });
    }
  }
  const checkpoints = graphStatus === 'blocked' ? [{ checkpoint_id: `checkpoint_demo_${missionIndex + 1}`, before_node_id: nodes[3].node_id, policy_id: 'policy_demo_independent_review', proof_purpose: 'DEMO independent approval before protected publication', status: 'pending', approval_request_id: `approval_demo_${missionIndex + 1}` }] : [];
  const planBody = { nodes, dependency_edges: edges, approval_checkpoints: checkpoints };
  graphs.push({
    schema_version: 1, graph_id: graphId, goal_id: goalId, trace_id: traceId, status: graphStatus,
    nodes, dependency_edges: edges, approval_checkpoints: checkpoints, revision: 1, plan_hash: hash(planBody),
    proposed_by: 'deterministic-h2a', provider_proposal_hash: null, approved_by_human_id: null, approved_human_proof_id: null,
    created_at: goals[goals.length - 1].created_at, updated_at: nowIso, trust_ceiling: 'connected-observed'
  });
  for (let eventIndex = 0; eventIndex < 8; eventIndex += 1) {
    traceEvents.push({ traceId, eventIndex, missionTitle, goalId, graphId, nodes });
  }
}

workspaceFile.data = {
  data: workspaceData,
  canonicalHash: hash(workspaceData),
  signature: organizationSignature(workspaceData, organizationKey)
};
projectFile.data = { projects, goals: projectGoals, assignments: projectAssignments, worktrees: [], sources: projectSources, messages: projectMessages, validations: projectValidations, runs: projectRuns, review_bundles: [], integrations: [], trust_ceiling: 'connected-observed' };
graphFile.data = { schema_version: 1, goals, graphs, diffs: [], generated_at: nowIso, trust_ceiling: 'connected-observed' };
mandateFile.data = [...mandateFile.data, ...mandates];

for (const mission of traceEvents.filter((item) => item.eventIndex === 0)) {
  let previousHash = null;
  const records = [];
  for (let eventIndex = 0; eventIndex < 8; eventIndex += 1) {
    const node = mission.nodes[Math.min(Math.floor(eventIndex / 2), 3)];
    const eventType = eventIndex % 2 === 0 ? 'WORK_ASSIGNED' : 'WORK_RESPONSE_RECORDED';
    const unsigned = {
      event_id: `evt_demo_${mission.traceId}_${eventIndex + 1}`,
      trace_id: mission.traceId,
      timestamp: new Date(now.getTime() - (8 - eventIndex) * 60 * 1000).toISOString(),
      actor: { type: eventIndex % 2 === 0 ? 'human' : 'agent', id: eventIndex % 2 === 0 ? node.human_owner_id : node.agent_id },
      subject: { type: 'assignment', id: node.project_assignment_id },
      mandate_id: node.mandate_id,
      event_type: eventType,
      payload: {
        synthetic_showcase: true, acceptance_eligible: false, mission: mission.missionTitle,
        graph_id: mission.graphId, node_id: node.node_id, context_grant_id: node.context_grant_id,
        output_hash: eventType === 'WORK_RESPONSE_RECORDED' ? node.output_hash : null,
        note: 'Synthetic showcase history; no provider response body is stored.'
      },
      previous_hash: previousHash
    };
    const record = { ...unsigned, event_hash: hash(unsigned) };
    records.push(record);
    previousHash = record.event_hash;
  }
  await writeFile(path.join(target, 'traces', `${mission.traceId}.jsonl`), `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
}

recentFile.data = traceEvents.slice(-20).reverse().map((item) => ({
  id: `evt_demo_recent_${item.traceId}_${item.eventIndex}`,
  type: item.eventIndex % 2 ? 'WORK_RESPONSE_RECORDED' : 'WORK_ASSIGNED',
  actor: item.eventIndex % 2 ? item.nodes[Math.min(Math.floor(item.eventIndex / 2), 3)].agent_id : item.nodes[Math.min(Math.floor(item.eventIndex / 2), 3)].human_owner_id,
  summary: `DEMO · ${item.missionTitle} · ${item.eventIndex % 2 ? 'bounded output recorded' : 'work assigned with mandate'}`,
  time: new Date(now.getTime() - item.eventIndex * 60 * 1000).toISOString(),
  integrity: 'verified'
}));

await writeJson(target, 'organizations/registry-v2.json', envelope(orgFile.kind, orgFile.data, nowIso));
await writeJson(target, 'organizations/memberships-v2.json', envelope(membershipFile.kind, membershipFile.data, nowIso));
await writeJson(target, 'humans/identities-v2.json', envelope(humanFile.kind, humanFile.data, nowIso));
await writeJson(target, 'workspace/employee-workspace-v1.json', envelope(workspaceFile.kind, workspaceFile.data, nowIso));
await appendEvidence(target, {
  trace_id: `tr_workspace_showcase_${randomUUID()}`,
  timestamp: nowIso,
  actor: { type: 'system', id: 'h2a-showcase-generator' },
  subject: { type: 'resource', id: 'synthetic-employee-workspace' },
  event_type: 'ACTION_EXECUTED',
  payload: {
    operation: 'workspace.commit', mutation: 'synthetic-showcase-generation',
    revision: workspaceFile.data.data.revision, state_hash: workspaceFile.data.canonicalHash,
    synthetic_showcase: true, acceptance_eligible: false
  }
});
await writeJson(target, 'projects/project-delivery.json', envelope(projectFile.kind, projectFile.data, nowIso));
await writeJson(target, 'projects/goal-work-graphs-v1.json', envelope(graphFile.kind, graphFile.data, nowIso));
await writeJson(target, 'mandates/registry.json', envelope(mandateFile.kind, mandateFile.data, nowIso));
await writeJson(target, 'evidence/recent-events.json', envelope(recentFile.kind, recentFile.data, nowIso));

let session = {};
try { session = await readJson(target, 'SESSION.json'); } catch { /* optional */ }
await writeJson(target, 'SESSION.json', {
  ...session,
  dataPath: target,
  purpose: 'Synthetic HP multi-team collaboration showcase. Not acceptance evidence.',
  showcase: true,
  acceptanceEvidence: false,
  createdAt: nowIso,
  sourceDataPath: source
});
await writeJson(target, 'SHOWCASE.json', {
  schema_version: 1,
  synthetic: true,
  acceptance_evidence: false,
  label: 'HP AI Collaboration Showcase (Synthetic)',
  warning: 'All DEMO-prefixed people, rooms, memories, missions, messages, runs, mandates, outputs, and events are synthetic presentation data. They must not be used for Phase 44 or Phase 51 acceptance.',
  retained_real_records: 'Existing enrolled humans and provider identities were copied only so the isolated root can be opened by the normal application. Live provider authentication and Human Proof remain operator-controlled.',
  intentionally_reset: ['federation transport state', 'sealed Context Broker payloads', 'provider secrets', 'Electron profile data'],
  source_data_path: source,
  created_at: nowIso,
  counts: {
    synthetic_people: syntheticPeople.length,
    rooms: rooms.length,
    memory_records: memories.length,
    projects: projects.length,
    missions: graphs.length,
    work_nodes: graphs.reduce((count, graph) => count + graph.nodes.length, 0),
    mandates: mandates.length,
    trace_events: traceEvents.length
  }
});

process.stdout.write(`${JSON.stringify({
  source,
  target,
  synthetic: true,
  acceptanceEvidence: false,
  counts: (await readJson(target, 'SHOWCASE.json')).counts,
  nextCommand: `$env:H2A_DATA_PATH='${target.replaceAll("'", "''")}'; & $pnpm dev`
}, null, 2)}\n`);
