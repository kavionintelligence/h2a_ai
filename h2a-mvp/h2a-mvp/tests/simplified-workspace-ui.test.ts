import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('simplified autonomous H2A workspace', () => {
  it('opens the canvas-first workspace by default while retaining the classic console', async () => {
    const source = await readFile(join(root, 'apps/desktop/renderer/src/App.tsx'), 'utf8');
    expect(source).toContain("get('experience') !== 'classic'");
    expect(source).toContain('<WorkspaceExperience');
    expect(source).toContain('h2a:proof-cancelled');
  });

  it('uses canonical workspace, employee, and trusted host command paths', async () => {
    const source = await readFile(join(root, 'apps/desktop/renderer/src/features/workspace/WorkspaceExperience.tsx'), 'utf8');
    for (const page of ['Agent canvas', 'Workspaces', 'People & agents', 'Company memory', 'Security map']) expect(source).toContain(page);
    expect(source).toContain('window.h2aEmployee?.snapshot()');
    expect(source).toContain('window.h2a!.approveWorkGraph');
    expect(source).toContain('window.h2a!.runWorkGraph');
    expect(source).toContain('workspace.plan.approve-run');
    expect(source).toContain('h2a:proof-cancelled');
    expect(source).not.toContain('data-control-id="workspace.node.run"');
  });

  it('renders real project folders, reviewed memory, and company authority views', async () => {
    const [source, styles] = await Promise.all([
      readFile(join(root, 'apps/desktop/renderer/src/features/workspace/WorkspaceExperience.tsx'), 'utf8'),
      readFile(join(root, 'apps/desktop/renderer/src/features/workspace/workspace.css'), 'utf8')
    ]);
    for (const marker of ['project_delivery.projects', 'employee?.rooms', 'employee?.memory', 'data.organization.memberships', 'data.evidence.integrity.status']) expect(source).toContain(marker);
    for (const selector of ['.ws-folder', '.ws-agent-canvas', '.ws-memory-stage', '.ws-security-map']) expect(styles).toContain(selector);
  });

  it('does not reopen the administrator workspace after an employee chooses their rooms', async () => {
    const source = await readFile(join(root, 'apps/desktop/renderer/src/features/workspace/EmployeeAccess.tsx'), 'utf8');
    expect(source).toContain('enteredAdministratorWorkspace');
    expect(source).toContain("window.addEventListener('h2a:employee-workspace'");
    expect(source).not.toContain('setConsoleOpen(next.session.administrator)');
  });
});
