import type { AgentRuntimeSummary, OfficeEntity, OfficeState } from '@h2a/contracts';
import { allocateOfficeSeats, type AllocatedSeat } from './seatAllocation';
import { officeStations, officeZones } from './officeTheme';

export type OfficeEntityKind = 'zone' | 'station' | 'agent' | 'operational';

export interface AccessibleOfficeEntity {
  id: string;
  kind: OfficeEntityKind;
  label: string;
  detail: string;
  agentId?: string;
  officeEntityId?: string;
  officeEntityKind?: OfficeEntity['kind'];
  status?: OfficeEntity['status'];
  activity?: OfficeEntity['activity'];
}

export interface SceneAgentAllocation extends AllocatedSeat {
  officeEntity?: OfficeEntity;
}

export interface OfficeSceneModel {
  generatedAt: string;
  agents: SceneAgentAllocation[];
  entities: AccessibleOfficeEntity[];
}

export function buildOfficeSceneModel(office: OfficeState, agents: readonly AgentRuntimeSummary[]): OfficeSceneModel {
  const allocations = allocateOfficeSeats(agents);
  const officeEntityByAgent = new Map(office.entities.filter((entity) => entity.selectable_agent_id && (entity.kind === 'agent' || entity.kind === 'framework-agent')).map((entity) => [entity.selectable_agent_id!, entity]));
  const sceneAgents = allocations.map((allocation) => ({ ...allocation, officeEntity: officeEntityByAgent.get(allocation.agent.id) }));
  const countByZone = new Map<string, string>([
    ['zone-human-proof', `${office.counts.humans} active humans`],
    ['zone-agent-operations', `${office.counts.agents} registered agents`],
    ['zone-authority', `${office.counts.pending_approvals} pending approvals`],
    ['zone-context', `${office.counts.active_context_grants} active grants`],
    ['zone-federation', `${office.counts.active_federation_peers} active peers`],
    ['zone-evidence', `${office.acceptance.passed} of ${office.acceptance.total} acceptance gates`]
  ]);

  return {
    generatedAt: office.generated_at,
    agents: sceneAgents,
    entities: [
      ...officeZones.map((zone) => ({
        id: zone.id,
        kind: 'zone' as const,
        label: zone.label,
        detail: countByZone.get(zone.id) ?? 'No canonical count'
      })),
      ...officeStations.map((station) => ({
        id: station.id,
        kind: 'station' as const,
        label: `${station.label} station`,
        detail: allocations.some((allocation) => allocation.station.id === station.id) ? 'Assigned' : 'Available'
      })),
      ...allocations.map(({ agent, station }) => ({
        id: `entity-${agent.id}`,
        kind: 'agent' as const,
        label: agent.name,
        detail: `${agent.providerLabel}; ${agent.status}; ${station.label} station`,
        agentId: agent.id,
        officeEntityId: officeEntityByAgent.get(agent.id)?.entity_id,
        officeEntityKind: officeEntityByAgent.get(agent.id)?.kind,
        status: officeEntityByAgent.get(agent.id)?.status,
        activity: officeEntityByAgent.get(agent.id)?.activity
      })),
      ...office.entities.filter((entity) => entity.kind !== 'agent' && entity.kind !== 'framework-agent').map((entity) => ({
        id: `operational-${entity.entity_id}`,
        kind: 'operational' as const,
        label: entity.label,
        detail: `${entity.kind.replaceAll('-', ' ')}; ${entity.status}; ${entity.detail}`,
        officeEntityId: entity.entity_id,
        officeEntityKind: entity.kind,
        status: entity.status,
        activity: entity.activity
      }))
    ]
  };
}
