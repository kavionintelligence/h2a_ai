import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, advance, classifyObservation, initialPlayback, makeScenario } from '../apps/web/src/enterprise-simulation/model';
import { agentProof, buildEstate, estateCounts, personEstate } from '../apps/web/src/enterprise-simulation/estate-model';

const scenario = makeScenario('2026-09-25');
const playback = initialPlayback(scenario);

describe('hospital estate inventory', () => {
  it('reconciles people, devices, identities and software without double counting', () => {
    const count = estateCounts(scenario, playback);
    expect(count).toEqual({ people:42, agents:48, teamAgents:30, personalAgents:18, devices:48, companyDevices:42, byodDevices:6, laptops:42, runtimeHosts:6, approvedAgents:48, softwareObservations:6, approvedSoftware:1, waitingSoftware:1, blockedSoftware:2, unverifiedSoftware:2 });
    expect(count.teamAgents + count.personalAgents).toBe(count.agents);
    expect(count.companyDevices + count.byodDevices).toBe(count.devices);
    expect(count.approvedSoftware + count.waitingSoftware + count.blockedSoftware + count.unverifiedSoftware).toBe(count.softwareObservations);
    expect(buildEstate(scenario, playback)).toEqual(buildEstate(scenario, playback));
  });

  it('gives every person one laptop and each team a shared host with valid custody', () => {
    const estate = buildEstate(scenario, playback);
    expect(new Set(estate.devices.map(device => device.id)).size).toBe(48);
    for (const person of scenario.people) expect(estate.devices.filter(device => device.kind === 'Laptop' && device.custodianId === person.id)).toHaveLength(1);
    DEPARTMENTS.forEach((department, index) => {
      const host = estate.devices.find(device => device.kind === 'Shared runtime host' && device.department === department)!;
      expect(host.custodianId).toBe(`H-${index}-2`);
      expect(host.agentIds).toHaveLength(5);
      expect(host.ownerId).toBeNull();
      expect(host.ownership).toBe('Company-owned');
      const byod = estate.devices.filter(device => device.department === department && device.ownership === 'BYOD');
      expect(byod).toHaveLength(1);
      expect(byod[0].ownerId).toBe(`H-${index}-5`);
      expect(byod[0].limits.join(' ')).toContain('private apps and files are not inventoried');
    });
    for (const device of estate.devices) {
      expect(scenario.people.some(person => person.id === device.custodianId)).toBe(true);
      expect(Date.parse(device.lastSeen)).toBeLessThanOrEqual(Date.parse(`${scenario.anchor}T09:00:00Z`));
    }
  });

  it('deploys each identity once and does not equate a personal agent with BYOD hardware', () => {
    const estate = buildEstate(scenario, playback);
    expect(new Set(estate.deployments.map(deployment => deployment.agentId)).size).toBe(48);
    for (const agent of scenario.agents) {
      const deployment = estate.deployments.find(item => item.agentId === agent.id)!;
      const device = estate.devices.find(item => item.id === deployment.deviceId)!;
      expect(deployment.accountableOwnerId).toBe(agent.owner);
      expect(deployment.runtime).toBe(agent.runtime);
      expect(deployment.status).toBe('Approved');
      expect(device.agentIds).toContain(agent.id);
      expect(device.department).toBe(agent.department);
      expect(device.kind).toBe(agent.kind === 'Team' ? 'Shared runtime host' : 'Laptop');
      if (agent.kind === 'Personal') expect(device.custodianId).toBe(agent.owner);
    }
    const personalDeviceIds = estate.deployments.filter(item => item.scope === 'Personal').map(item => item.deviceId);
    expect(estate.devices.filter(device => personalDeviceIds.includes(device.id) && device.ownership === 'Company-owned')).toHaveLength(12);
    expect(estate.devices.filter(device => personalDeviceIds.includes(device.id) && device.ownership === 'BYOD')).toHaveLength(6);
  });

  it('uses scenario decisions to override software states without changing governed identities', () => {
    const before = structuredClone(playback);
    const authorized = classifyObservation(scenario, playback, 'DISC-03', 'Authorized');
    expect(buildEstate(scenario, authorized).observations.find(item => item.id === 'DISC-03')?.status).toBe('Approved');
    const contained = classifyObservation(scenario, authorized, 'DISC-02', 'Contained');
    expect(buildEstate(scenario, contained).observations.find(item => item.id === 'DISC-02')?.status).toBe('Blocked');
    const unreviewed = { ...playback, discovery: { ...playback.discovery, 'DISC-02': 'Unreviewed' as const } };
    expect(buildEstate(scenario, unreviewed).observations.find(item => item.id === 'DISC-02')?.status).toBe('Waiting for approval');
    expect(estateCounts(scenario, contained).agents).toBe(48);
    expect(estateCounts(scenario, contained).approvedAgents).toBe(48);
    expect(playback).toEqual(before);
    const estate = buildEstate(scenario, playback);
    for (const observation of estate.observations) {
      expect(estate.devices.some(device => device.id === observation.deviceId)).toBe(true);
      expect(scenario.people.some(person => person.id === observation.reviewOwnerId)).toBe(true);
      if (observation.linkedAgentId) expect(scenario.agents.some(agent => agent.id === observation.linkedAgentId)).toBe(true);
    }
    expect(estate.observations.find(item => item.id === 'DISC-04')?.installationOnly).toBe(true);
    expect(estate.observations.find(item => item.id === 'DISC-06')?.boundary).toContain('visibility gap');
  });
});

describe('agent authority proof', () => {
  it('separates approved entitlements, recorded operations and modeled calls', () => {
    const allEvents = [...scenario.events, ...playback.events];
    for (const agent of scenario.agents) {
      const proof = agentProof(scenario, playback, agent.id)!;
      expect(proof.access).toHaveLength(6);
      expect(proof.access.filter(entry => entry.entitlement === 'Mandate-scoped')).toHaveLength(1);
      expect(proof.access.filter(entry => entry.entitlement === 'No entitlement').every(entry => entry.observedOperations === 0 && entry.modeledCalls === 0)).toBe(true);
      expect(proof.access.reduce((sum, entry) => sum + entry.observedOperations, 0)).toBe(proof.counts.toolOperations);
      expect(proof.access.reduce((sum, entry) => sum + entry.modeledCalls, 0)).toBe(proof.counts.modeledCalls);
      for (const access of proof.access) {
        expect(access.denied).toContain('production.write');
        expect(access.denied).toContain('external.export');
        expect(access.eventIds.every(id => allEvents.some(event => event.id === id && event.operation === 'Approved tool operation' && event.actor === agent.id))).toBe(true);
      }
    }
  });

  it('counts proof from exact event records, never turns A2A reviews into human approvals', () => {
    for (const agent of scenario.agents) {
      const proof = agentProof(scenario, playback, agent.id)!;
      expect(proof.counts.peerHumanApprovals).toBe(0);
      expect(proof.counts.mandateEvaluations).toBe(proof.events.mandateEvaluations.length);
      expect(proof.counts.humanApprovals).toBe(proof.events.humanApprovals.length);
      expect(proof.counts.peerReviews).toBe(proof.events.peerReviews.length);
      expect(proof.counts.blockedTasks).toBe(proof.tasks.blocked.length);
      expect(proof.events.humanApprovals.every(event => event.operation === 'Human approved exact action' && scenario.people.some(person => person.id === event.actor))).toBe(true);
      expect(proof.events.peerReviews.every(event => event.operation === 'A2A review returned' && scenario.agents.some(peer => peer.id === event.actor))).toBe(true);
      expect(proof.deployment.status).toBe('Approved');
      expect(proof.counts.involvedTasks).toBeGreaterThanOrEqual(proof.counts.originatedTasks);
    }
    const blankScenario = { ...scenario, events: [] };
    const blankPlayback = { ...playback, events: [] };
    const proof = agentProof(blankScenario, blankPlayback, 'AG-0-0')!;
    expect(proof.counts.completedTasks).toBeGreaterThan(0);
    expect(proof.counts.humanApprovals).toBe(0);
    expect(proof.counts.peerReviews).toBe(0);
    expect(proof.counts.toolOperations).toBe(0);
    expect(proof.counts.modeledCalls).toBe(0);
    expect(proof.counts.mandateEvaluations).toBe(0);
    expect(proof.access.find(entry => entry.entitlement === 'Mandate-scoped')?.observedOperations).toBe(0);
  });

  it('deduplicates event references and excludes mismatched approval claims', () => {
    const agent = scenario.agents[0];
    const task = scenario.tasks.find(item => item.agent === agent.id && item.stage === 'Completed')!;
    const approval = scenario.events.find(event => event.task === task.id && event.operation === 'Human approved exact action')!;
    const original = agentProof(scenario, playback, agent.id)!;
    const changed = { ...scenario, events: [...scenario.events, approval, { ...approval, id:'INVALID-APPROVAL', actor:task.collaborator }, { ...approval, id:'WRONG-TARGET', target:'unrelated-task' }] };
    expect(agentProof(changed, playback, agent.id)?.counts.humanApprovals).toBe(original.counts.humanApprovals);
  });

  it('keeps per-person custody and agent accountability distinct and linked', () => {
    const lead = personEstate(scenario, playback, 'H-0-2')!;
    expect(lead.devices).toHaveLength(2);
    expect(lead.agents).toHaveLength(5);
    expect(lead.deployments.every(deployment => deployment.deviceId === 'HOST-0')).toBe(true);
    const member = personEstate(scenario, playback, 'H-0-3')!;
    expect(member.devices).toHaveLength(1);
    expect(member.agents).toHaveLength(1);
    const executive = personEstate(scenario, playback, 'H-0-C')!;
    expect(executive.devices).toHaveLength(1);
    expect(executive.agents).toHaveLength(0);
    expect(executive.tasks).toHaveLength(0);
    for (const event of lead.approvalEvents) expect(event.actor).toBe('H-0-2');
    expect(personEstate(scenario, playback, 'missing')).toBeNull();
    expect(agentProof(scenario, playback, 'missing')).toBeNull();
  });

  it('advances last-seen timestamps with the scenario clock, not the wall clock', () => {
    const next = advance(scenario, playback, false);
    const originalDevice = buildEstate(scenario, playback).devices[0];
    const nextDevice = buildEstate(scenario, next).devices[0];
    expect(Date.parse(nextDevice.lastSeen) - Date.parse(originalDevice.lastSeen)).toBe(60000);
  });
});
