export const OFFICE_TILE_SIZE = 32;
export const OFFICE_GRID_WIDTH = 30;
export const OFFICE_GRID_HEIGHT = 20;

export interface OfficePoint {
  x: number;
  y: number;
}

export interface OfficeStation {
  id: string;
  label: string;
  provider: string;
  desk: OfficePoint;
  seat: OfficePoint;
  accent: number;
}

export interface OfficeZoneDefinition {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  accent: number;
}

export const officePalette = {
  void: 0x07131d,
  wall: 0x1d3342,
  wallEdge: 0x3b5a6d,
  floorA: 0xc7d5d8,
  floorB: 0xb9c9cc,
  floorLine: 0xa6b9bd,
  carpet: 0x244d5d,
  carpetEdge: 0x397083,
  desk: 0x704d35,
  deskEdge: 0x3e2b23,
  screen: 0x0c1c25,
  screenReady: 0x56d79b,
  screenAttention: 0xf0b54c,
  screenDanger: 0xf06f68,
  white: 0xf4f8f7,
  ink: 0x0c1d27,
  plant: 0x377d57,
  plantLight: 0x65a96f
} as const;

export const officeZones: readonly OfficeZoneDefinition[] = [
  { id: 'zone-human-proof', label: 'Human Proof', x: 1, y: 1, width: 7, height: 5, accent: 0x2f75a9 },
  { id: 'zone-agent-operations', label: 'Agent Operations', x: 9, y: 1, width: 13, height: 11, accent: 0x28785b },
  { id: 'zone-authority', label: 'Authority', x: 23, y: 1, width: 6, height: 6, accent: 0xa46f2b },
  { id: 'zone-context', label: 'Context', x: 23, y: 8, width: 6, height: 5, accent: 0x765da3 },
  { id: 'zone-federation', label: 'Federation', x: 1, y: 14, width: 8, height: 5, accent: 0x4f6f83 },
  { id: 'zone-evidence', label: 'Evidence', x: 21, y: 14, width: 8, height: 5, accent: 0x32754d }
] as const;

export const officeStations: readonly OfficeStation[] = [
  { id: 'desk-claude', label: 'Claude', provider: 'claude-code', desk: { x: 11, y: 4 }, seat: { x: 11, y: 5 }, accent: 0xd68a55 },
  { id: 'desk-antigravity', label: 'Antigravity', provider: 'gemini-antigravity', desk: { x: 15, y: 4 }, seat: { x: 15, y: 5 }, accent: 0x4c8ee8 },
  { id: 'desk-framework', label: 'Framework', provider: 'custom-cli', desk: { x: 11, y: 9 }, seat: { x: 11, y: 10 }, accent: 0x8b6ec3 },
  { id: 'desk-codex', label: 'Codex', provider: 'openai-codex', desk: { x: 15, y: 9 }, seat: { x: 15, y: 10 }, accent: 0x36a875 },
  { id: 'desk-flex-a', label: 'Flex A', provider: 'scripted', desk: { x: 19, y: 4 }, seat: { x: 19, y: 5 }, accent: 0x5d7b8c },
  { id: 'desk-flex-b', label: 'Flex B', provider: 'bedrock', desk: { x: 19, y: 9 }, seat: { x: 19, y: 10 }, accent: 0x5d7b8c }
] as const;

export const officeSpawn: OfficePoint = { x: 5, y: 11 };

const blockedTiles = new Set<string>([
  ...officeStations.map((station) => `${station.desk.x},${station.desk.y}`),
  ...Array.from({ length: OFFICE_GRID_WIDTH }, (_, x) => `${x},0`),
  ...Array.from({ length: OFFICE_GRID_WIDTH }, (_, x) => `${x},${OFFICE_GRID_HEIGHT - 1}`),
  ...Array.from({ length: OFFICE_GRID_HEIGHT }, (_, y) => `0,${y}`),
  ...Array.from({ length: OFFICE_GRID_HEIGHT }, (_, y) => `${OFFICE_GRID_WIDTH - 1},${y}`)
]);

export function isOfficeTileWalkable(x: number, y: number): boolean {
  return x >= 1 && y >= 1 && x < OFFICE_GRID_WIDTH - 1 && y < OFFICE_GRID_HEIGHT - 1 && !blockedTiles.has(`${x},${y}`);
}

export function tileToWorld(point: OfficePoint): OfficePoint {
  return {
    x: point.x * OFFICE_TILE_SIZE + OFFICE_TILE_SIZE / 2,
    y: point.y * OFFICE_TILE_SIZE + OFFICE_TILE_SIZE / 2
  };
}
