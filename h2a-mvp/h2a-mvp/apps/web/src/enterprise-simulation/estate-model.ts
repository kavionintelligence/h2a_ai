import { DEPARTMENTS, DISCOVERIES, ORGANIZATION_NAME, allTasks, toolFor, type Department, type Person, type Playback, type Scenario, type SimAgent, type SimEvent, type SimTask } from './model';

export type EstateDevice = {
  id: string;
  name: string;
  kind: 'Laptop' | 'Shared runtime host';
  os: string;
  ownership: 'Company-owned' | 'BYOD';
  ownerId: string | null;
  ownerName: string;
  custodianId: string;
  department: Department;
  management: 'Managed endpoint' | 'Managed runtime host' | 'Work profile only';
  lastSeen: string;
  limits: string[];
  agentIds: string[];
};
export type AgentDeployment = {
  id: string;
  agentId: string;
  deviceId: string;
  runtime: SimAgent['runtime'];
  status: 'Approved';
  scope: SimAgent['kind'];
  accountableOwnerId: string;
};
export type ObservationStatus = 'Approved' | 'Waiting for approval' | 'Blocked' | 'Unverified';
export type SoftwareObservation = {
  id: string;
  name: string;
  product: typeof DISCOVERIES[number]['product'];
  department: Department;
  deviceId: string;
  status: ObservationStatus;
  source: string;
  reason: string;
  installationOnly: boolean;
  boundary: string;
  reviewOwnerId: string;
  linkedAgentId?: string;
};
export type EstateTool = { id: string; name: string; department: Department; permission: string; denied: string[] };
export type EstateAccess = {
  toolId: string;
  toolName: string;
  permission: string;
  entitlement: 'Mandate-scoped' | 'No entitlement';
  scope: string;
  denied: string[];
  observedOperations: number;
  modeledCalls: number;
  eventIds: string[];
  taskIds: string[];
  lastObserved?: string;
};
export type Estate = { devices: EstateDevice[]; deployments: AgentDeployment[]; observations: SoftwareObservation[]; tools: EstateTool[] };
export type AgentProof = {
  agent: SimAgent;
  owner: Person;
  device: EstateDevice;
  deployment: AgentDeployment;
  custodian: Person;
  counts: {
    originatedTasks: number;
    involvedTasks: number;
    completedTasks: number;
    completedInvolvedTasks: number;
    mandateEvaluations: number;
    humanApprovals: number;
    peerReviews: number;
    peerHumanApprovals: 0;
    blockedTasks: number;
    toolOperations: number;
    modeledCalls: number;
  };
  events: { mandateEvaluations: SimEvent[]; humanApprovals: SimEvent[]; peerReviews: SimEvent[]; blockedTasks: SimEvent[]; toolOperations: SimEvent[] };
  tasks: { originated: SimTask[]; involved: SimTask[]; completed: SimTask[]; blocked: SimTask[] };
  access: EstateAccess[];
};

export const DEFAULT_OBSERVATION_STATES: Readonly<Record<string, ObservationStatus>> = {
  'DISC-01': 'Waiting for approval',
  'DISC-02': 'Approved',
  'DISC-03': 'Blocked',
  'DISC-04': 'Unverified',
  'DISC-05': 'Blocked',
  'DISC-06': 'Unverified',
};

const DENIED = ['production.write', 'external.export', 'patient-records.read', 'credentials.read', 'unscoped.department.read'];
const laptopId = (personId: string) => `DEVICE-${personId}`;
const hostId = (department: Department) => `HOST-${DEPARTMENTS.indexOf(department)}`;
const knownDepartment = (value: Person['department']): value is Department => DEPARTMENTS.some(department => department === value);
const uniqueEvents = (events: SimEvent[]) => [...new Map(events.map(event => [event.id, event])).values()];
const uniqueTasks = (tasks: SimTask[]) => [...new Map(tasks.map(task => [task.id, task])).values()];

/** Device inventory is scenario data, not an endpoint scan. Device custody and agent accountability are separate relationships. */
export function buildEstate(scenario: Scenario, playback: Playback): Estate {
  const clock = Date.parse(`${scenario.anchor}T09:00:00Z`) + playback.tick * 60000;
  const devices: EstateDevice[] = scenario.people.filter(person => knownDepartment(person.department)).map((person, index) => {
    const department = person.department as Department;
    const byod = person.id === `H-${DEPARTMENTS.indexOf(department)}-5`;
    return {
      id: laptopId(person.id), name: `${person.name.split(' ')[0]}’s ${byod ? 'personal' : 'work'} laptop`, kind: 'Laptop',
      os: ['Windows 11', 'macOS', 'Ubuntu LTS'][index % 3], ownership: byod ? 'BYOD' : 'Company-owned',
      ownerId: byod ? person.id : null, ownerName: byod ? person.name : ORGANIZATION_NAME, custodianId: person.id, department,
      management: byod ? 'Work profile only' : 'Managed endpoint', lastSeen: new Date(clock - (byod ? 35 + index % 20 : 2 + index % 12) * 60000).toISOString(),
      limits: byod
        ? ['Visibility is limited to the enrolled work profile; private apps and files are not inventoried.', 'No whole-device remote wipe or company-wide containment is represented.', 'A personal agent is an identity scope, not proof of personal hardware.']
        : ['Inventory and management are modeled records, not a live collector attestation.', 'Installed software is not proof of active AI use or permission to act.'],
      agentIds: [],
    };
  });
  DEPARTMENTS.forEach((department, index) => devices.push({
    id: hostId(department), name: `${department} agent runtime`, kind: 'Shared runtime host', os: 'Ubuntu LTS', ownership: 'Company-owned',
    ownerId: null, ownerName: ORGANIZATION_NAME, custodianId: `H-${index}-2`, department, management: 'Managed runtime host',
    lastSeen: new Date(clock - (index + 1) * 60000).toISOString(),
    limits: ['Host custody does not grant agent authority; each deployment retains its human binding and mandate.', 'Five governed team identities share this modeled runtime host; software observations are not additional agents.'], agentIds: [],
  }));
  const deployments: AgentDeployment[] = scenario.agents.map(agent => ({
    id: `DEPLOY-${agent.id}`, agentId: agent.id, deviceId: agent.kind === 'Team' ? hostId(agent.department) : laptopId(agent.owner), runtime: agent.runtime,
    status: 'Approved', scope: agent.kind, accountableOwnerId: agent.owner,
  }));
  for (const device of devices) device.agentIds = deployments.filter(deployment => deployment.deviceId === device.id).map(deployment => deployment.agentId);
  const observationDevices: Record<string, string> = {
    'DISC-01': laptopId('H-0-3'), 'DISC-02': hostId('Technology'), 'DISC-03': laptopId('H-4-5'),
    'DISC-04': laptopId('H-2-4'), 'DISC-05': laptopId('H-3-5'), 'DISC-06': hostId('Management'),
  };
  const observations = DISCOVERIES.map(observation => {
    const override = playback.discovery[observation.id];
    const status: ObservationStatus = override === 'Authorized' ? 'Approved' : override === 'Contained' ? 'Blocked' : override === 'Unreviewed' ? 'Waiting for approval' : DEFAULT_OBSERVATION_STATES[observation.id] || 'Unverified';
    return {
      id: observation.id, name: observation.name, product: observation.product, department: observation.department,
      deviceId: observationDevices[observation.id] || hostId(observation.department), status, source: observation.source, reason: observation.reason,
      installationOnly: ['DISC-02', 'DISC-04'].includes(observation.id),
      boundary: status === 'Blocked'
        ? 'Scenario use is blocked; this is not a receipt proving a process or endpoint was stopped.'
        : observation.id === 'DISC-06'
          ? 'A missing heartbeat is a visibility gap, not proof that a worker stopped or is safe.'
          : observation.id === 'DISC-03'
            ? 'Only the enrolled work browser profile is represented; personal activity remains outside coverage.'
            : 'Software presence and approved use are separate from a governed agent identity and observed execution.',
      reviewOwnerId: `H-${DEPARTMENTS.indexOf(observation.department)}-2`,
      ...(observation.id === 'DISC-02' ? { linkedAgentId: 'AG-0-0' } : {}),
    };
  });
  const tools = DEPARTMENTS.map((department, index) => {
    const [name, permission] = toolFor(department).split(' / ');
    return { id: `TOOL-${index}`, name, department, permission, denied: [...DENIED] };
  });
  return { devices, deployments, observations, tools };
}

/** Counts are intentionally non-overlapping: runtime/software observations never inflate governed-agent totals. */
export function estateCounts(scenario: Scenario, playback: Playback) {
  const estate = buildEstate(scenario, playback);
  return {
    people: scenario.people.length, agents: scenario.agents.length, teamAgents: scenario.agents.filter(agent => agent.kind === 'Team').length,
    personalAgents: scenario.agents.filter(agent => agent.kind === 'Personal').length, devices: estate.devices.length,
    companyDevices: estate.devices.filter(device => device.ownership === 'Company-owned').length, byodDevices: estate.devices.filter(device => device.ownership === 'BYOD').length,
    laptops: estate.devices.filter(device => device.kind === 'Laptop').length, runtimeHosts: estate.devices.filter(device => device.kind === 'Shared runtime host').length,
    approvedAgents: estate.deployments.filter(deployment => deployment.status === 'Approved').length, softwareObservations: estate.observations.length,
    approvedSoftware: estate.observations.filter(observation => observation.status === 'Approved').length,
    waitingSoftware: estate.observations.filter(observation => observation.status === 'Waiting for approval').length,
    blockedSoftware: estate.observations.filter(observation => observation.status === 'Blocked').length,
    unverifiedSoftware: estate.observations.filter(observation => observation.status === 'Unverified').length,
  };
}

/** Proof counters count retained matching records, never estimates inferred from the task's current stage. */
export function agentProof(scenario: Scenario, playback: Playback, id: string): AgentProof | null {
  const agent = scenario.agents.find(item => item.id === id);
  if (!agent) return null;
  const estate = buildEstate(scenario, playback);
  const deployment = estate.deployments.find(item => item.agentId === id);
  const device = estate.devices.find(item => item.id === deployment?.deviceId);
  const owner = scenario.people.find(person => person.id === agent.owner);
  const custodian = scenario.people.find(person => person.id === device?.custodianId);
  if (!deployment || !device || !owner || !custodian) return null;
  const tasks = uniqueTasks(allTasks(scenario, playback));
  const originated = tasks.filter(task => task.agent === id);
  const involved = tasks.filter(task => task.agent === id || task.collaborator === id);
  const originatedIds = new Set(originated.map(task => task.id));
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const events = uniqueEvents([...scenario.events, ...playback.events]).filter(event => taskById.has(event.task));
  const mandateEvaluations = events.filter(event => originatedIds.has(event.task) && event.actor === id && event.authority === agent.mandate && event.operation === 'Authority evaluated');
  const humanApprovals = events.filter(event => originatedIds.has(event.task) && event.operation === 'Human approved exact action' && event.outcome === 'Approved' && event.target === event.task && event.actor === taskById.get(event.task)?.owner);
  const peerReviews = events.filter(event => {
    const task = taskById.get(event.task)!;
    return event.operation === 'A2A review returned' && event.outcome === 'Review returned' && event.actor === task.collaborator && event.target === task.agent && (event.actor === id || event.target === id);
  });
  const blockedEvents = events.filter(event => originatedIds.has(event.task) && event.actor === id && event.operation === 'Out-of-scope action blocked' && event.outcome === 'Blocked');
  const toolOperations = events.filter(event => originatedIds.has(event.task) && event.actor === id && event.operation === 'Approved tool operation' && event.outcome === 'Executing' && event.target === toolFor(taskById.get(event.task)!.department));
  const operationTaskIds = new Set(toolOperations.map(event => event.task));
  const completed = originated.filter(task => task.stage === 'Completed');
  const blocked = originated.filter(task => task.stage === 'Blocked');
  const access = estate.tools.map(tool => {
    const allowed = tool.department === agent.department;
    const observed = toolOperations.filter(event => event.target === `${tool.name} / ${tool.permission}`);
    const taskIds = [...new Set(observed.map(event => event.task))];
    return {
      toolId: tool.id, toolName: tool.name, permission: tool.permission, entitlement: allowed ? 'Mandate-scoped' as const : 'No entitlement' as const,
      scope: allowed ? `${agent.department} administrative records only; exact-action approval before execution.` : 'No direct system access. A cross-team draft review does not inherit the originating agent’s tool rights.',
      denied: [...tool.denied], observedOperations: observed.length, modeledCalls: taskIds.reduce((sum, taskId) => sum + (taskById.get(taskId)?.calls || 0), 0),
      eventIds: observed.map(event => event.id), taskIds, ...(observed.length ? { lastObserved: observed.map(event => event.timestamp).sort().at(-1)! } : {}),
    };
  });
  return {
    agent, owner, device, deployment, custodian,
    counts: {
      originatedTasks: originated.length, involvedTasks: involved.length, completedTasks: completed.length,
      completedInvolvedTasks: involved.filter(task => task.stage === 'Completed').length, mandateEvaluations: mandateEvaluations.length,
      humanApprovals: humanApprovals.length, peerReviews: peerReviews.length, peerHumanApprovals: 0,
      blockedTasks: blocked.length, toolOperations: toolOperations.length,
      modeledCalls: originated.filter(task => operationTaskIds.has(task.id)).reduce((sum, task) => sum + task.calls, 0),
    },
    events: { mandateEvaluations, humanApprovals, peerReviews, blockedTasks: blockedEvents, toolOperations },
    tasks: { originated, involved, completed, blocked }, access,
  };
}

export function personEstate(scenario: Scenario, playback: Playback, id: string) {
  const person = scenario.people.find(item => item.id === id);
  if (!person) return null;
  const estate = buildEstate(scenario, playback);
  const devices = estate.devices.filter(device => device.custodianId === id);
  const agents = scenario.agents.filter(agent => agent.owner === id);
  const agentIds = new Set(agents.map(agent => agent.id));
  const deployments = estate.deployments.filter(deployment => agentIds.has(deployment.agentId));
  const deviceIds = new Set(devices.map(device => device.id));
  const observations = estate.observations.filter(observation => deviceIds.has(observation.deviceId));
  const tasks = uniqueTasks(allTasks(scenario, playback)).filter(task => task.owner === id);
  const taskIds = new Set(tasks.map(task => task.id));
  const approvalEvents = uniqueEvents([...scenario.events, ...playback.events]).filter(event => taskIds.has(event.task) && event.operation === 'Human approved exact action' && event.outcome === 'Approved' && event.actor === id && event.target === event.task);
  return { person, devices, agents, deployments, observations, tasks, rooms: [...new Set(tasks.map(task => task.room))].sort(), approvalEvents };
}
