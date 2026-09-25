import {
  estateNodes as featuredEstateNodes,
  inventoryAgents as featuredInventoryAgents,
  workspaceMeshes as featuredWorkspaceMeshes,
  type EstateAction,
  type EstateEdge,
  type EstateNode,
  type EstateRisk,
  type InventoryAgent,
  type WorkspaceMesh
} from './ciso-model';

export interface EnterpriseEmployee {
  id: string;
  name: string;
  team: string;
  role: string;
  status: 'active' | 'away' | 'offline';
  agents: number;
  workspaces: number;
}

interface DemoWorkspace {
  id: string;
  name: string;
  team: string;
  owner: EnterpriseEmployee;
  people: number;
  agents: number;
  calls: number;
  risk: EstateRisk;
}

const firstNames = ['Asha', 'Varun', 'Maya', 'Priya', 'Jordan', 'Elena', 'Sam', 'Nina', 'Liam', 'Noah', 'Sofia', 'Arjun', 'Mei', 'David', 'Fatima', 'Lucas', 'Anika', 'Daniel', 'Sara', 'Owen'];
const lastNames = ['Mehta', 'Khatr', 'Thompson', 'Nair', 'Brooks', 'Garcia', 'Chen', 'Patel', 'Wright', 'Williams'];
const teams = ['Digital Commerce', 'Enterprise Security', 'Finance Operations', 'People Operations', 'Platform Engineering', 'Customer Support', 'Legal & Compliance', 'Market Intelligence', 'Supply Chain', 'Sales Operations'];
const roles = ['Program lead', 'Workspace administrator', 'Product manager', 'Security analyst', 'Data steward', 'Engineering lead', 'Operations manager', 'Risk reviewer'];
const initiatives = ['Command Center', 'Customer Journey', 'Policy Lab', 'Quarter Close', 'Vendor Review', 'Knowledge Hub', 'Automation Studio', 'Incident Room', 'Launch Program', 'Operations Desk'];

export const enterpriseEmployees: EnterpriseEmployee[] = Array.from({ length: 200 }, (_, index) => ({
  id: `employee-${String(index + 1).padStart(3, '0')}`,
  name: `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`,
  team: teams[index % teams.length],
  role: roles[(index * 3) % roles.length],
  status: index % 11 === 0 ? 'offline' : index % 7 === 0 ? 'away' : 'active',
  agents: 1 + (index % 4),
  workspaces: 1 + (index % 3)
}));

const featuredNames = ['Asha Mehta', 'Varun Khatr', 'Maya Thompson', 'Priya Nair', 'Jordan Brooks', 'Elena Garcia'];
featuredNames.forEach((name, index) => { enterpriseEmployees[index].name = name; });
const usedEmployeeNames = new Set<string>();
enterpriseEmployees.forEach((employee, index) => {
  if (usedEmployeeNames.has(employee.name)) {
    const [first, last] = employee.name.split(' ');
    employee.name = `${first} ${String.fromCharCode(65 + index % 26)}. ${last}`;
  }
  usedEmployeeNames.add(employee.name);
});

const workspaceIds = ['ws-commerce', 'ws-security', 'ws-finance', 'ws-people'];
const workspaceNames = ['Digital Commerce', 'Enterprise Security', 'Finance Operations', 'People Operations'];

export const enterpriseWorkspaces: DemoWorkspace[] = Array.from({ length: 100 }, (_, index) => {
  const team = teams[index % teams.length];
  const owner = enterpriseEmployees[index % 32];
  return {
    id: workspaceIds[index] ?? `ws-demo-${String(index + 1).padStart(3, '0')}`,
    name: workspaceNames[index] ?? `${team} · ${initiatives[Math.floor(index / 10)]}`,
    team,
    owner,
    people: 5 + ((index * 7) % 18),
    agents: 3 + ((index * 5) % 12),
    calls: 420 + ((index * 613) % 8900),
    risk: index % 29 === 0 ? 'high' : index % 13 === 0 ? 'medium' : 'low'
  };
});

const extraAgents: InventoryAgent[] = Array.from({ length: 318 - featuredInventoryAgents.length }, (_, index) => {
  const serial = index + featuredInventoryAgents.length + 1;
  const owner = enterpriseEmployees[(index * 7) % enterpriseEmployees.length];
  const slot = index % 10;
  const kind: InventoryAgent['kind'] = slot < 4 ? 'H2A managed' : slot < 7 ? 'Company agent' : slot < 9 ? 'Approved third-party' : 'Custom MCP';
  const provider = kind === 'Company agent' ? 'HP Internal' : kind === 'Approved third-party' ? ['Microsoft', 'Anthropic', 'Google Gemini'][index % 3] : kind === 'Custom MCP' ? 'HP MCP Runtime' : 'H2A Runtime';
  const capability = ['Research', 'Workflow', 'Code', 'Support', 'Policy', 'Finance', 'Content', 'Data', 'Sales', 'Review'][index % 10];
  return {
    id: `enterprise-agent-${String(serial).padStart(3, '0')}`,
    name: `${capability} Agent ${String(serial).padStart(3, '0')}`,
    kind,
    provider,
    owner: owner.name,
    calls: 90 + ((index * 197) % 5800),
    users: 1 + ((index * 11) % 64),
    data: ['Approved documents', 'Project metadata', 'Source code', 'Support cases', 'Policy records'][index % 5],
    state: index % 17 === 0 ? 'idle' : index % 23 === 0 ? 'review' : 'active',
    risk: index % 31 === 0 ? 'high' : index % 13 === 0 ? 'medium' : 'low',
    spend: `$${(180 + ((index * 83) % 4200)).toLocaleString()}`,
    lastUsed: index % 5 === 0 ? 'Now' : `${1 + (index % 28)} min ago`
  };
});

export const enterpriseInventoryAgents: InventoryAgent[] = [...featuredInventoryAgents, ...extraAgents];

const creatorEmployees = enterpriseEmployees.slice(0, 32);
const creatorNodes: EstateNode[] = creatorEmployees.map((employee, index) => {
  const angle = index / creatorEmployees.length * Math.PI * 2 - Math.PI / 2;
  return {
    id: `creator-${employee.id}`,
    label: employee.name,
    subtitle: 'Workspace creator',
    type: 'human',
    x: 50 + Math.cos(angle) * 17,
    y: 50 + Math.sin(angle) * 22,
    risk: 'low',
    owner: employee.team,
    activity: `Creator · ${employee.workspaces + 2} governed workspaces`,
    scope: employee.team
  };
});

const workspaceNodes: EstateNode[] = enterpriseWorkspaces.map((workspace, index) => {
  const inner = index < 40;
  const count = inner ? 40 : 60;
  const position = inner ? index : index - 40;
  const angle = position / count * Math.PI * 2 - Math.PI / 2 + (inner ? 0.04 : 0);
  return {
    id: workspace.id,
    label: workspace.name,
    subtitle: `${workspace.people} people · ${workspace.agents} agents`,
    type: 'workspace',
    x: 50 + Math.cos(angle) * (inner ? 31 : 45),
    y: 50 + Math.sin(angle) * (inner ? 38 : 47),
    risk: workspace.risk,
    owner: workspace.owner.name,
    activity: `${workspace.calls.toLocaleString()} calls today`,
    scope: workspace.team
  };
});

export const enterpriseEstateNodes: EstateNode[] = [
  { ...featuredEstateNodes[0], activity: '100 governed workspaces · 200 employees · 318 agents' },
  ...creatorNodes,
  ...workspaceNodes
];

const enterpriseEdges: EstateEdge[] = creatorNodes.map((creator) => ({ from: 'hq', to: creator.id, type: 'membership' }));
enterpriseWorkspaces.forEach((workspace, index) => {
  enterpriseEdges.push({ from: creatorNodes[index % creatorNodes.length].id, to: workspace.id, type: 'membership', label: 'creator' });
  if (index % 11 === 0) enterpriseEdges.push({ from: creatorNodes[(index + 7) % creatorNodes.length].id, to: workspace.id, type: 'admin', label: 'admin' });
  if (index % 7 === 0) enterpriseEdges.push({ from: workspace.id, to: enterpriseWorkspaces[(index + 13) % enterpriseWorkspaces.length].id, type: 'cross-workspace', label: 'active exchange' });
});
export const enterpriseEstateEdges = enterpriseEdges;

function createWorkspaceMesh(workspace: DemoWorkspace, workspaceIndex: number): WorkspaceMesh {
  const members = Array.from({ length: 6 }, (_, memberIndex) => enterpriseEmployees[(workspaceIndex * 2 + memberIndex * 17) % enterpriseEmployees.length]);
  if (!members.some((member) => member.id === workspace.owner.id)) members[0] = workspace.owner;
  const assignedAgents = Array.from({ length: 5 }, (_, agentIndex) => enterpriseInventoryAgents[(workspaceIndex * 5 + agentIndex * 29) % enterpriseInventoryAgents.length]);
  const humanPositions = [[25, 24], [16, 50], [25, 76], [45, 13], [45, 87], [62, 16]];
  const agentPositions = [[78, 25], [86, 50], [78, 75], [60, 84], [60, 50]];
  const root: EstateNode = { id: workspace.id, label: workspace.name, subtitle: 'Persistent enterprise workspace', type: 'workspace', x: 50, y: 50, risk: workspace.risk, owner: workspace.owner.name, activity: `${workspace.people} people · ${workspace.agents} agents`, scope: workspace.team };
  const humanNodes: EstateNode[] = members.map((member, index) => ({ id: `${workspace.id}-${member.id}`, label: member.name, subtitle: member.id === workspace.owner.id ? 'Creator · accountable owner' : member.role, type: 'human', x: humanPositions[index][0], y: humanPositions[index][1], risk: 'low', owner: workspace.name, activity: `${140 + ((workspaceIndex + index) * 97) % 1100} calls · ${member.agents} agents`, scope: member.team }));
  const agentNodes: EstateNode[] = assignedAgents.map((agent, index) => ({ id: `${workspace.id}-${agent.id}`, label: agent.name, subtitle: `${agent.provider} · ${agent.kind}`, type: agent.kind === 'Approved third-party' || agent.kind === 'Shadow AI' ? 'third-party' : 'managed-agent', x: agentPositions[index][0], y: agentPositions[index][1], risk: agent.risk, owner: agent.owner, activity: `${agent.calls.toLocaleString()} calls · ${agent.state}`, scope: agent.data }));
  const edges: EstateEdge[] = humanNodes.map((node, index) => ({ from: workspace.id, to: node.id, type: 'membership', label: index === 0 ? 'owner' : undefined }));
  agentNodes.forEach((node, index) => edges.push({ from: humanNodes[index % humanNodes.length].id, to: node.id, type: node.risk === 'high' || node.risk === 'critical' ? 'review' : 'active', label: node.risk === 'high' ? 'review' : 'active task' }));
  edges.push({ from: agentNodes[0].id, to: agentNodes[1].id, type: 'active', label: 'signed handoff' });
  return { workspaceId: workspace.id, nodes: [root, ...humanNodes, ...agentNodes], edges };
}

const generatedWorkspaceMeshes = Object.fromEntries(enterpriseWorkspaces.map((workspace, index) => [workspace.id, createWorkspaceMesh(workspace, index)]));
export const enterpriseWorkspaceMeshes: Record<string, WorkspaceMesh> = { ...generatedWorkspaceMeshes, ...featuredWorkspaceMeshes };

export const enterpriseStats = {
  employees: enterpriseEmployees.length,
  activeEmployees: enterpriseEmployees.filter((employee) => employee.status === 'active').length,
  workspaces: enterpriseWorkspaces.length,
  agents: enterpriseInventoryAgents.length,
  activeAgents: enterpriseInventoryAgents.filter((agent) => agent.state === 'active').length,
  companyAgents: enterpriseInventoryAgents.filter((agent) => agent.kind === 'Company agent').length,
  thirdPartyAgents: enterpriseInventoryAgents.filter((agent) => agent.kind === 'Approved third-party' || agent.kind === 'Shadow AI').length,
  crossWorkspaceFlows: enterpriseEstateEdges.filter((edge) => edge.type === 'cross-workspace').length
};

export type EnterpriseTaskStatus = 'running' | 'completed' | 'blocked' | 'awaiting-approval';

export interface EnterpriseEvidenceEvent {
  time: string;
  actor: string;
  event: string;
  result: string;
  tone: 'healthy' | 'warning' | 'high' | 'critical';
}

export interface EnterpriseTask {
  id: string;
  evidenceId: string;
  title: string;
  workspaceId: string;
  workspace: string;
  size: 'small' | 'standard' | 'major';
  status: EnterpriseTaskStatus;
  risk: EstateRisk;
  initiatedBy: string;
  initiatorRole: string;
  authorizedBy: string;
  humanReview: string;
  leadAgent: string;
  provider: string;
  purpose: string;
  apiCalls: number;
  apiEndpoint: string;
  released: string;
  withheld: string;
  destination: string;
  output: string;
  started: string;
  blockedReason?: string;
  remedy?: string;
  traceId: string;
  events: EnterpriseEvidenceEvent[];
}

const taskVerbs = ['Assess', 'Build', 'Reconcile', 'Review', 'Research', 'Classify', 'Prepare', 'Validate', 'Summarize', 'Monitor'];
const taskObjects = ['vendor posture', 'customer journey', 'policy exception', 'quarter-close package', 'support trends', 'launch brief', 'access request', 'incident evidence', 'contract changes', 'workspace controls'];
const releasedData = ['Approved project files', 'Policy metadata', 'Anonymized usage metrics', 'Reviewed knowledge records', 'Vendor evidence'];
const withheldData = ['Credentials · personal notes', 'Employee PII · payroll fields', 'Unrelated workspace data', 'Customer identifiers', 'Raw restricted source material'];
const apiEndpoints = ['POST /v1/responses', 'MCP tools/search', 'POST /agents/run', 'GET /knowledge/query', 'POST /policy/evaluate'];

export const enterpriseTasks: EnterpriseTask[] = Array.from({ length: 260 }, (_, index) => {
  const workspace = enterpriseWorkspaces[index % enterpriseWorkspaces.length];
  const employee = enterpriseEmployees[(index * 11) % enterpriseEmployees.length];
  const agent = enterpriseInventoryAgents[(index * 17) % enterpriseInventoryAgents.length];
  const status: EnterpriseTaskStatus = index % 17 === 0 ? 'blocked' : index % 13 === 0 ? 'awaiting-approval' : index % 4 === 0 ? 'running' : 'completed';
  const risk: EstateRisk = index % 47 === 0 ? 'critical' : index % 19 === 0 ? 'high' : index % 7 === 0 ? 'medium' : 'low';
  const evidenceId = `evidence-${String(index + 1).padStart(4, '0')}`;
  const title = `${taskVerbs[index % taskVerbs.length]} ${taskObjects[(index * 3) % taskObjects.length]}`;
  const humanReview = status === 'awaiting-approval' ? `${workspace.owner.name} · decision pending` : index % 5 === 0 ? `${workspace.owner.name} · reviewed` : 'Not required by current policy';
  const blockedReason = status === 'blocked' ? ['Expired access grant', 'Workspace boundary conflict', 'Independent review required', 'Provider permission needs renewal'][index % 4] : undefined;
  const remedy = blockedReason ? ['Renew the exact-purpose grant', 'Request a bounded cross-workspace share', 'Assign an independent approver', 'Reconnect the provider from this task'][index % 4] : undefined;
  const released = releasedData[index % releasedData.length];
  const withheld = withheldData[(index * 2) % withheldData.length];
  const started = `${1 + (index % 23)}:${String((index * 7) % 60).padStart(2, '0')} ${index % 2 ? 'PM' : 'AM'}`;
  const events: EnterpriseEvidenceEvent[] = [
    { time: started, actor: employee.name, event: `Created “${title}” inside ${workspace.name}.`, result: 'Intent recorded', tone: 'healthy' },
    { time: started, actor: workspace.owner.name, event: `Authorized ${agent.name} for the stated purpose and workspace boundary.`, result: 'Mandate active', tone: 'healthy' },
    { time: started, actor: 'Context broker', event: `Released ${released}; withheld ${withheld}.`, result: 'Least context', tone: 'healthy' },
    { time: started, actor: agent.name, event: `Called ${agent.provider} through ${apiEndpoints[index % apiEndpoints.length]}.`, result: `${1 + ((index * 7) % 23)} API calls`, tone: risk === 'critical' ? 'critical' : risk === 'high' ? 'high' : 'healthy' },
    { time: started, actor: 'Policy engine', event: `Evaluated destination ${index % 9 === 0 ? 'another workspace' : 'approved project boundary'}.`, result: status === 'blocked' ? 'Blocked' : 'Allowed', tone: status === 'blocked' ? 'critical' : 'healthy' },
    ...(humanReview !== 'Not required by current policy' ? [{ time: started, actor: workspace.owner.name, event: 'Reviewed the proposed effect and supporting evidence.', result: status === 'awaiting-approval' ? 'Decision pending' : 'Approved', tone: status === 'awaiting-approval' ? 'warning' as const : 'healthy' as const }] : []),
    { time: started, actor: 'Evidence service', event: `Sealed the action chain as ${evidenceId}.`, result: status === 'completed' ? 'Output accepted' : status, tone: status === 'blocked' ? 'critical' : status === 'awaiting-approval' ? 'warning' : 'healthy' }
  ];
  return {
    id: `task-${String(index + 1).padStart(4, '0')}`,
    evidenceId,
    title,
    workspaceId: workspace.id,
    workspace: workspace.name,
    size: index % 21 === 0 ? 'major' : index % 3 === 0 ? 'small' : 'standard',
    status,
    risk,
    initiatedBy: employee.name,
    initiatorRole: employee.role,
    authorizedBy: workspace.owner.name,
    humanReview,
    leadAgent: agent.name,
    provider: agent.provider,
    purpose: `${workspace.team} · ${taskObjects[(index * 3) % taskObjects.length]}`,
    apiCalls: 1 + ((index * 7) % 23),
    apiEndpoint: apiEndpoints[index % apiEndpoints.length],
    released,
    withheld,
    destination: index % 9 === 0 ? enterpriseWorkspaces[(index + 13) % enterpriseWorkspaces.length].name : workspace.name,
    output: status === 'completed' ? `Reviewed ${taskObjects[(index * 3) % taskObjects.length]} deliverable` : status === 'running' ? 'Output in progress' : 'No final output yet',
    started,
    blockedReason,
    remedy,
    traceId: `trace_h2a_${String(index + 1).padStart(4, '0')}_${(index * 7919).toString(16)}`,
    events
  };
});

const generatedActions: EstateAction[] = enterpriseTasks.filter((task) => task.status === 'blocked' || task.status === 'awaiting-approval' || task.risk === 'critical' || task.risk === 'high').slice(0, 43).map((task, index) => {
  const category: EstateAction['category'] = task.status === 'awaiting-approval' ? 'Approval' : index % 5 === 0 ? 'Shadow AI' : index % 4 === 0 ? 'Ownership' : 'Data movement';
  return {
    id: `estate-action-${String(index + 6).padStart(3, '0')}`,
    title: task.status === 'awaiting-approval' ? `Access request from ${task.workspace}` : task.blockedReason ? `${task.title} blocked in ${task.workspace}` : `${task.title} requires risk review`,
    summary: `${task.initiatedBy} initiated this ${task.size} task. ${task.leadAgent} requested ${task.released.toLowerCase()} through ${task.provider}.`,
    risk: task.risk === 'low' ? 'medium' : task.risk,
    category,
    actor: `${task.initiatedBy} · ${task.initiatorRole}`,
    target: `${task.leadAgent} · ${task.provider}`,
    data: `${task.released} · withheld ${task.withheld}`,
    workspace: task.destination === task.workspace ? task.workspace : `${task.workspace} → ${task.destination}`,
    detected: `${3 + index * 4} min ago`,
    status: index % 7 === 0 ? 'assigned' : index % 11 === 0 ? 'contained' : 'open',
    recommended: task.remedy ?? (task.status === 'awaiting-approval' ? `Review and approve only the exact ${task.purpose.toLowerCase()} purpose.` : 'Inspect the evidence chain and restrict the destination if the purpose is not valid.'),
    evidenceId: task.evidenceId
  };
});

export const enterpriseActions: EstateAction[] = [
  { id: 'shadow-windsurf', title: 'Unmanaged Windsurf agent accessed two workspaces', summary: 'A local extension requested source code and customer-segment data outside an H2A mandate.', risk: 'critical', category: 'Shadow AI', actor: 'Asha Mehta · Workspace administrator', target: 'Windsurf Local · unmanaged', data: 'Source code · Customer segments', workspace: 'Digital Commerce → People Operations', detected: '7 min ago', status: 'open', recommended: 'Quarantine the connection and assign an accountable owner.', evidenceId: enterpriseTasks[0].evidenceId },
  { id: 'cross-space', title: 'Confidential context crossed workspace boundary', summary: 'Customer-segment context moved from Digital Commerce into People Operations.', risk: 'high', category: 'Data movement', actor: 'Asha Mehta · Workspace administrator', target: 'Customer segments', data: 'Confidential customer analytics', workspace: 'Digital Commerce → People Operations', detected: '11 min ago', status: 'open', recommended: 'Review the transfer purpose and restrict future forwarding.', evidenceId: enterpriseTasks[9].evidenceId },
  { id: 'unowned-extractor', title: 'Custom MCP agent has no accountable owner', summary: 'Bulk Data Extractor remains callable by three users without a current employee owner.', risk: 'high', category: 'Ownership', actor: '3 active users', target: 'Bulk Data Extractor', data: 'Customer exports', workspace: 'Sales Operations', detected: '26 min ago', status: 'open', recommended: 'Assign an owner or quarantine the runtime.', evidenceId: enterpriseTasks[17].evidenceId },
  { id: 'publish-approval', title: 'Senior review required for vendor finding', summary: 'Security Reviewer is paused before publishing a restricted procurement finding.', risk: 'medium', category: 'Approval', actor: 'Varun Khatr · Security program lead', target: 'Security Reviewer', data: 'Restricted vendor finding', workspace: 'Enterprise Security', detected: '34 min ago', status: 'open', recommended: 'Review the exact effect and approve once or deny.', evidenceId: enterpriseTasks[13].evidenceId },
  { id: 'license-waste', title: '38 AI seats have no 30-day activity', summary: 'Purchased coding seats exceed active adoption across Engineering.', risk: 'low', category: 'License waste', actor: 'Platform Engineering', target: 'AI coding licenses', data: 'Usage telemetry only', workspace: 'Enterprise', detected: 'Today', status: 'open', recommended: 'Reclaim dormant seats before renewal.', evidenceId: enterpriseTasks[4].evidenceId },
  ...generatedActions
];

export interface EnterpriseDataFlow {
  id: string;
  from: string;
  to: string;
  actor: string;
  authorizedBy: string;
  agent: string;
  provider: string;
  data: string;
  volume: string;
  result: string;
  risk: EstateRisk;
  evidenceId: string;
}

export const enterpriseDataFlows: EnterpriseDataFlow[] = enterpriseEstateEdges.filter((edge) => edge.type === 'cross-workspace').map((edge, index) => {
  const from = enterpriseWorkspaces.find((workspace) => workspace.id === edge.from) ?? enterpriseWorkspaces[index];
  const to = enterpriseWorkspaces.find((workspace) => workspace.id === edge.to) ?? enterpriseWorkspaces[(index + 13) % enterpriseWorkspaces.length];
  const task = enterpriseTasks.find((item) => item.workspaceId === from.id) ?? enterpriseTasks[index];
  return {
    id: `flow-${String(index + 1).padStart(3, '0')}`,
    from: from.name,
    to: to.name,
    actor: task.initiatedBy,
    authorizedBy: task.authorizedBy,
    agent: task.leadAgent,
    provider: task.provider,
    data: task.released,
    volume: `${4 + index * 13} MB`,
    result: index % 7 === 0 ? 'Blocked' : index % 5 === 0 ? 'Review' : 'Purpose-bound',
    risk: index % 7 === 0 ? 'critical' : index % 5 === 0 ? 'high' : index % 3 === 0 ? 'medium' : 'low',
    evidenceId: task.evidenceId
  };
});

export type AuditEventCategory = 'intent' | 'authorization' | 'context' | 'provider-call' | 'policy' | 'human-review' | 'evidence';

export interface AtomicAuditEvent {
  id: string;
  evidenceId: string;
  taskId: string;
  traceId: string;
  sequence: number;
  timestamp: string;
  category: AuditEventCategory;
  actor: string;
  actorType: 'human' | 'agent' | 'control';
  action: string;
  result: string;
  tone: EnterpriseEvidenceEvent['tone'];
  workspace: string;
  source: string;
  destination: string;
  decision: 'recorded' | 'allowed' | 'withheld' | 'blocked' | 'pending' | 'sealed';
  policyRule: string;
  apiEndpoint: string;
  latencyMs: number;
  releasedFields: string;
  withheldFields: string;
  inputDigest: string;
  outputDigest: string;
  device: string;
}

const eventCategories: AuditEventCategory[] = ['intent', 'authorization', 'context', 'provider-call', 'policy', 'human-review', 'evidence'];
const policyRules = ['identity.employee-bound', 'mandate.purpose-match', 'context.minimum-release', 'provider.approved-route', 'workspace.forwarding-boundary', 'effect.human-review', 'evidence.append-only'];

export const enterpriseAuditEvents: AtomicAuditEvent[] = enterpriseTasks.flatMap((task, taskIndex) => task.events.map((event, eventIndex) => {
  const category = eventCategories[eventIndex === task.events.length - 1 ? 6 : eventIndex];
  const actorType: AtomicAuditEvent['actorType'] = event.actor === task.initiatedBy || event.actor === task.authorizedBy ? 'human' : event.actor === task.leadAgent ? 'agent' : 'control';
  const decision: AtomicAuditEvent['decision'] = category === 'intent' ? 'recorded' : category === 'context' ? 'withheld' : category === 'policy' && task.status === 'blocked' ? 'blocked' : category === 'human-review' && task.status === 'awaiting-approval' ? 'pending' : category === 'evidence' ? 'sealed' : 'allowed';
  const seed = taskIndex * 17 + eventIndex + 1;
  return {
    id: `audit-${String(taskIndex + 1).padStart(4, '0')}-${String(eventIndex + 1).padStart(2, '0')}`,
    evidenceId: task.evidenceId,
    taskId: task.id,
    traceId: task.traceId,
    sequence: eventIndex + 1,
    timestamp: `2026-09-${String(1 + taskIndex % 9).padStart(2, '0')}T${String((taskIndex + eventIndex) % 24).padStart(2, '0')}:${String((taskIndex * 7 + eventIndex * 3) % 60).padStart(2, '0')}:${String((taskIndex * 11 + eventIndex * 5) % 60).padStart(2, '0')}.${String((seed * 37) % 1000).padStart(3, '0')}Z`,
    category,
    actor: event.actor,
    actorType,
    action: event.event,
    result: event.result,
    tone: event.tone,
    workspace: task.workspace,
    source: category === 'provider-call' ? `${task.workspace} context broker` : task.initiatedBy,
    destination: category === 'provider-call' ? task.provider : task.destination,
    decision,
    policyRule: policyRules[eventIndex === task.events.length - 1 ? 6 : eventIndex],
    apiEndpoint: category === 'provider-call' ? task.apiEndpoint : 'Internal control-plane event',
    latencyMs: 8 + ((seed * 43) % 780),
    releasedFields: category === 'context' || category === 'provider-call' ? task.released : 'None at this event',
    withheldFields: category === 'context' || category === 'policy' ? task.withheld : 'No additional fields',
    inputDigest: `demo_sha256_in_${(seed * 104729).toString(16).padStart(12, '0')}`,
    outputDigest: `demo_sha256_out_${(seed * 130363).toString(16).padStart(12, '0')}`,
    device: actorType === 'human' ? `HP-managed device · employee-${String((taskIndex * 11) % 200 + 1).padStart(3, '0')}` : actorType === 'agent' ? `${task.provider} governed runtime` : 'H2A control plane'
  };
}));
