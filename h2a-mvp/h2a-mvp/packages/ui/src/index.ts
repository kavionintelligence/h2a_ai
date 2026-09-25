export const h2aTheme = {
  color: {
    navigation: '#101922',
    navigationMuted: '#9dacbb',
    primary: '#2563eb',
    primarySoft: '#eaf1ff',
    verified: '#15803d',
    verifiedSoft: '#eaf7ee',
    approval: '#b45309',
    approvalSoft: '#fff4df',
    danger: '#b42318',
    dangerSoft: '#fff0ee',
    canvas: '#f4f6f8',
    surface: '#ffffff',
    surfaceSubtle: '#f8fafb',
    text: '#17212b',
    muted: '#667085',
    border: '#d9e0e7'
  },
  radius: {
    control: 6,
    panel: 8
  },
  motion: {
    fast: 160,
    standard: 220
  }
} as const;

export { DataTable, ModalDialog, StatePanel, StatusBadge, WorkspaceLoadingState } from './components';
export type { DataTableColumn, StatusTone } from './components';
