import type { OfficePoint } from './officeTheme';

export interface WalkableOfficeGrid {
  width: number;
  height: number;
  isWalkable(x: number, y: number): boolean;
}

const directions: readonly OfficePoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
];

const pointKey = (point: OfficePoint): string => `${point.x},${point.y}`;

export function findOfficePath(grid: WalkableOfficeGrid, start: OfficePoint, goal: OfficePoint): OfficePoint[] {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!grid.isWalkable(goal.x, goal.y)) return [];

  const queue: OfficePoint[] = [start];
  const visited = new Set([pointKey(start)]);
  const parent = new Map<string, OfficePoint>();

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = pointKey(next);
      if (visited.has(key) || !grid.isWalkable(next.x, next.y)) continue;
      visited.add(key);
      parent.set(key, current);
      if (next.x === goal.x && next.y === goal.y) return reconstructPath(parent, start, goal);
      queue.push(next);
    }
  }
  return [];
}

function reconstructPath(parent: Map<string, OfficePoint>, start: OfficePoint, goal: OfficePoint): OfficePoint[] {
  const path: OfficePoint[] = [];
  let current = goal;
  while (current.x !== start.x || current.y !== start.y) {
    path.unshift(current);
    const previous = parent.get(pointKey(current));
    if (!previous) return [];
    current = previous;
  }
  return path;
}
