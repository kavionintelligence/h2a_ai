import type { AgentRuntimeSummary } from '@h2a/contracts';
import { officeStations, type OfficeStation } from './officeTheme';

export interface AllocatedSeat {
  agent: AgentRuntimeSummary;
  station: OfficeStation;
}

export function allocateOfficeSeats(agents: readonly AgentRuntimeSummary[]): AllocatedSeat[] {
  const available = [...officeStations];
  return [...agents]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((agent) => {
      const preferredIndex = available.findIndex((station) => station.provider === agent.provider);
      const index = preferredIndex >= 0 ? preferredIndex : 0;
      const station = available.splice(index, 1)[0] ?? overflowStation(agent.id);
      return { agent, station };
    });
}

function overflowStation(agentId: string): OfficeStation {
  const hash = [...agentId].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 0);
  const slot = hash % 8;
  return {
    id: `desk-overflow-${slot}`,
    label: `Overflow ${slot + 1}`,
    provider: 'overflow',
    desk: { x: 10 + (slot % 4) * 3, y: 13 + Math.floor(slot / 4) * 3 },
    seat: { x: 10 + (slot % 4) * 3, y: 14 + Math.floor(slot / 4) * 3 },
    accent: 0x5d7b8c
  };
}
