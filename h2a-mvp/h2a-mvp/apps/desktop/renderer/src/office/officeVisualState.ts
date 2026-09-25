import type { OfficeEntity, OfficeEntityStatus } from '@h2a/contracts';
import type { OfficePoint } from './officeTheme';

export interface OfficeVisualState {
  color: number;
  label: string;
  target: 'seat' | 'authority' | 'context' | 'evidence';
  pulse: boolean;
  envelope: boolean;
  denial: boolean;
  realWork: boolean;
}

const statusVisuals: Record<OfficeEntityStatus, Omit<OfficeVisualState, 'envelope' | 'realWork'>> = {
  idle: { color: 0x78909c, label: 'IDLE', target: 'seat', pulse: false, denial: false },
  ready: { color: 0x56d79b, label: 'READY', target: 'seat', pulse: false, denial: false },
  queued: { color: 0x6aa5e8, label: 'QUEUE', target: 'seat', pulse: false, denial: false },
  working: { color: 0x4ec4e8, label: 'WORK', target: 'seat', pulse: true, denial: false },
  waiting: { color: 0xf0b54c, label: 'WAIT', target: 'authority', pulse: true, denial: false },
  blocked: { color: 0xf06f68, label: 'DENY', target: 'evidence', pulse: false, denial: true },
  succeeded: { color: 0x65d891, label: 'DONE', target: 'evidence', pulse: true, denial: false },
  failed: { color: 0xee5b55, label: 'FAIL', target: 'evidence', pulse: true, denial: true },
  revoked: { color: 0xb55252, label: 'REVOKE', target: 'evidence', pulse: false, denial: true },
  offline: { color: 0x65737d, label: 'OFF', target: 'seat', pulse: false, denial: false },
  warning: { color: 0xd7963c, label: 'CHECK', target: 'evidence', pulse: false, denial: false }
};

export function visualStateForEntity(entity: OfficeEntity | undefined): OfficeVisualState {
  const status = entity?.status ?? 'idle';
  const base = statusVisuals[status];
  const envelope = entity?.activity === 'canonical-handoff';
  return {
    ...base,
    target: envelope ? 'context' : base.target,
    envelope,
    realWork: entity?.activity_basis !== 'decorative'
  };
}

export function visualTarget(target: OfficeVisualState['target'], seat: OfficePoint): OfficePoint {
  if (target === 'authority') return { x: 25, y: 6 };
  if (target === 'context') return { x: 25, y: 12 };
  if (target === 'evidence') return { x: 23, y: 17 };
  return seat;
}
