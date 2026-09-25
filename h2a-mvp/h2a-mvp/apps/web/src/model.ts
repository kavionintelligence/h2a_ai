export type Page = 'home' | 'workspaces' | 'agents' | 'people' | 'memory' | 'reviews' | 'admin';
export type DetailLevel = 'simple' | 'authority' | 'proof';
export type WorkspaceTab = 'overview' | 'plan' | 'activity' | 'deliverables' | 'team' | 'authority';
export type WorkStatus = 'running' | 'waiting' | 'done' | 'blocked' | 'ready';

export interface Person {
  id: string;
  name: string;
  initials: string;
  role: string;
  team: string;
  status: 'online' | 'away' | 'offline';
  color: string;
  agents: number;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  provider: string;
  owner: string;
  status: 'working' | 'ready' | 'needs-attention' | 'offline';
  color: string;
  permissions: string[];
}

export interface WorkStep {
  id: string;
  title: string;
  summary: string;
  agentId: string;
  status: WorkStatus;
  dependsOn?: string;
  context: string[];
  withheld: string[];
  output?: string;
}

export interface MissionNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface SharedContext {
  id: string;
  name: string;
  audience: string;
  sharedBy: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  actor: string;
  body: string;
  createdAt: string;
  kind: 'message' | 'handoff' | 'output' | 'decision';
}

export interface Workspace {
  id: string;
  name: string;
  team: string;
  summary: string;
  progress: number;
  status: 'active' | 'review' | 'complete';
  updated: string;
  activeMission: string;
  missionCount: number;
  memberIds: string[];
  agentIds: string[];
  steps: WorkStep[];
  notes?: MissionNote[];
  sharedContext?: SharedContext[];
  activity?: ActivityEvent[];
}

export interface MemoryRecord {
  id: string;
  title: string;
  type: string;
  owner: string;
  used: string;
  access: string;
  x: string;
  y: string;
  tone: string;
  sourceWorkspace?: string;
  reviewedBy?: string;
}

export interface Review {
  id: string;
  title: string;
  workspaceId: string;
  requester: string;
  purpose: string;
  effect: string;
  due: string;
  status: 'pending' | 'approved' | 'denied';
}

export const people: Person[] = [
  { id: 'varun', name: 'Varun Khatr', initials: 'VK', role: 'Security program lead', team: 'Enterprise Security', status: 'online', color: '#0f766e', agents: 2 },
  { id: 'asha', name: 'Asha Mehta', initials: 'AM', role: 'Product design lead', team: 'Digital Experience', status: 'online', color: '#7c3aed', agents: 1 },
  { id: 'elena', name: 'Elena Garcia', initials: 'EG', role: 'Research director', team: 'Market Intelligence', status: 'online', color: '#2563eb', agents: 2 },
  { id: 'jordan', name: 'Jordan Brooks', initials: 'JB', role: 'Engineering manager', team: 'Platform Engineering', status: 'away', color: '#b45309', agents: 2 },
  { id: 'maya', name: 'Maya Thompson', initials: 'MT', role: 'Finance controller', team: 'Corporate Finance', status: 'offline', color: '#be123c', agents: 1 },
  { id: 'priya', name: 'Priya Nair', initials: 'PN', role: 'Privacy counsel', team: 'Legal & Compliance', status: 'online', color: '#475569', agents: 1 }
];

export const agents: Agent[] = [
  { id: 'research', name: 'Research Scout', role: 'Product and market research', provider: 'Custom MCP', owner: 'Elena Garcia', status: 'working', color: '#2563eb', permissions: ['Web research', 'Approved records'] },
  { id: 'claude', name: 'Claude Design Partner', role: 'Experience design and critique', provider: 'Claude', owner: 'Asha Mehta', status: 'working', color: '#7c3aed', permissions: ['Design files', 'Research summaries'] },
  { id: 'codex', name: 'Codex Builder', role: 'Implementation and integration', provider: 'OpenAI Codex', owner: 'Varun Khatr', status: 'ready', color: '#0f766e', permissions: ['Project workspace', 'Approved commands'] },
  { id: 'antigravity', name: 'Antigravity QA', role: 'Quality, security, and accessibility', provider: 'Gemini', owner: 'Jordan Brooks', status: 'needs-attention', color: '#b45309', permissions: ['Build output', 'Test runner'] },
  { id: 'security', name: 'Security Reviewer', role: 'Policy and data exposure review', provider: 'Company agent', owner: 'Varun Khatr', status: 'ready', color: '#be123c', permissions: ['Policy registry', 'Evidence metadata'] },
  { id: 'finance', name: 'Close Reconciler', role: 'Financial reconciliation', provider: 'Company agent', owner: 'Maya Thompson', status: 'offline', color: '#475569', permissions: ['Approved finance records'] }
];

const storefrontSteps: WorkStep[] = [
  { id: 'research-products', title: 'Research product story', summary: 'Create the audience, category, and merchandising brief.', agentId: 'research', status: 'done', context: ['Brand rules', 'Public product catalog', 'Audience brief'], withheld: ['Customer PII', 'Credentials'], output: 'Research brief · 12 sources · signed output hash' },
  { id: 'design-storefront', title: 'Design the storefront', summary: 'Translate the brief into a responsive shopping experience.', agentId: 'claude', status: 'running', dependsOn: 'research-products', context: ['Research summary', 'Brand rules', 'Audience needs'], withheld: ['Raw sources', 'Customer PII'], output: 'Wireframes and component decisions in progress' },
  { id: 'implement-storefront', title: 'Implement approved design', summary: 'Build the approved pages in an isolated project workspace.', agentId: 'codex', status: 'ready', dependsOn: 'design-storefront', context: ['Approved design', 'Repository scope', 'Build commands'], withheld: ['Research transcript', 'Production secrets'] },
  { id: 'validate-storefront', title: 'Validate quality and policy', summary: 'Run accessibility, security, and visual acceptance checks.', agentId: 'antigravity', status: 'blocked', dependsOn: 'implement-storefront', context: ['Build output', 'Acceptance checklist'], withheld: ['Source credentials', 'Private employee notes'] }
];

export const initialWorkspaces: Workspace[] = [
  { id: 'storefront', name: 'Digital Commerce Studio', team: 'Digital Commerce', summary: 'A persistent room for storefront launches, merchandising, design, implementation, and QA.', progress: 46, status: 'active', updated: '8 min ago', activeMission: 'Launch the autumn apparel storefront', missionCount: 6, memberIds: ['varun', 'asha', 'elena', 'jordan'], agentIds: ['research', 'claude', 'codex', 'antigravity'], steps: storefrontSteps },
  { id: 'vendor', name: 'Enterprise Security Reviews', team: 'Enterprise Security', summary: 'A shared room for vendor assessments, policy decisions, and restricted findings.', progress: 72, status: 'review', updated: '34 min ago', activeMission: 'Complete the Acme AI vendor assessment', missionCount: 11, memberIds: ['varun', 'priya', 'jordan'], agentIds: ['security', 'research'], steps: [
    { id: 'vendor-research', title: 'Collect vendor controls', summary: 'Review public security and privacy documentation.', agentId: 'research', status: 'done', context: ['Vendor domain', 'Review rubric'], withheld: ['Contract pricing'], output: '19 controls mapped' },
    { id: 'vendor-decision', title: 'Publish restricted findings', summary: 'Release the reviewed risk finding to the procurement record.', agentId: 'security', status: 'waiting', dependsOn: 'vendor-research', context: ['Control summary', 'Risk rubric'], withheld: ['Reviewer notes'], output: 'Awaiting Priya approval' }
  ] },
  { id: 'finance-close', name: 'Finance Operations', team: 'Corporate Finance', summary: 'Reconcile reporting packets while keeping business-unit data separated.', progress: 100, status: 'complete', updated: 'Yesterday', activeMission: 'Close Q3 reporting', missionCount: 14, memberIds: ['maya', 'varun'], agentIds: ['finance', 'security'], steps: [] },
  { id: 'onboarding', name: 'People Operations', team: 'People Operations', summary: 'Create role-specific onboarding plans from approved company knowledge.', progress: 18, status: 'active', updated: '2 days ago', activeMission: 'Refresh engineering onboarding', missionCount: 8, memberIds: ['asha', 'priya'], agentIds: ['claude', 'research'], steps: [] }
];

export const initialReviews: Review[] = [
  { id: 'review-publish', title: 'Publish restricted vendor findings', workspaceId: 'vendor', requester: 'Security Reviewer', purpose: 'Publish the approved vendor-risk summary to Procurement', effect: 'Create one immutable findings record', due: 'Due in 18 min', status: 'pending' },
  { id: 'review-deploy', title: 'Promote storefront preview', workspaceId: 'storefront', requester: 'Codex Builder', purpose: 'Deploy the approved storefront build to the internal preview environment', effect: 'Create one preview deployment', due: 'After QA passes', status: 'pending' }
];

export const initialMemoryRecords: MemoryRecord[] = [
  { id: 'research-playbook', title: 'Product research playbook', type: 'Playbook', owner: 'Market Intelligence', used: '12 missions', access: 'Digital Commerce + Research agents', x: '17%', y: '23%', tone: '#2563eb', sourceWorkspace: 'Digital Commerce Studio', reviewedBy: 'Elena Garcia' },
  { id: 'brand-system', title: 'HP experience principles', type: 'Policy', owner: 'Digital Experience', used: '9 missions', access: 'Company-wide read', x: '73%', y: '17%', tone: '#7c3aed', sourceWorkspace: 'People Operations', reviewedBy: 'Asha Mehta' },
  { id: 'vendor-lessons', title: 'Vendor review lessons', type: 'Learning', owner: 'Enterprise Security', used: '6 missions', access: 'Security team only', x: '82%', y: '57%', tone: '#b45309', sourceWorkspace: 'Enterprise Security Reviews', reviewedBy: 'Priya Nair' },
  { id: 'storefront-insight', title: 'Storefront accessibility insight', type: 'Insight', owner: 'Digital Commerce', used: '4 missions', access: 'Storefront room members', x: '62%', y: '77%', tone: '#0f766e', sourceWorkspace: 'Digital Commerce Studio', reviewedBy: 'Jordan Brooks' },
  { id: 'privacy-checklist', title: 'Customer privacy checklist', type: 'Checklist', owner: 'Legal & Compliance', used: '15 missions', access: 'Purpose-bound grant required', x: '23%', y: '72%', tone: '#be123c', sourceWorkspace: 'Enterprise Security Reviews', reviewedBy: 'Priya Nair' },
  { id: 'close-template', title: 'Quarter-close template', type: 'Template', owner: 'Corporate Finance', used: '8 missions', access: 'Finance team only', x: '8%', y: '50%', tone: '#475569', sourceWorkspace: 'Finance Operations', reviewedBy: 'Maya Thompson' }
];

export const providerCatalog = [
  { name: 'OpenAI Codex', category: 'Coding', detail: 'Repository work and implementation', color: '#0f766e' },
  { name: 'Claude', category: 'Design & review', detail: 'Design systems, critique, and content', color: '#7c3aed' },
  { name: 'Google Gemini', category: 'Research & QA', detail: 'Research, multimodal review, and validation', color: '#2563eb' },
  { name: 'Microsoft Copilot', category: 'Productivity', detail: 'Enterprise knowledge and Microsoft 365', color: '#b45309' },
  { name: 'Company agent', category: 'Internal', detail: 'Connect a governed in-house runtime', color: '#be123c' },
  { name: 'Custom MCP agent', category: 'Custom', detail: 'Bring a standards-based tool or agent', color: '#475569' }
];

export const authorityChain = [
  { label: 'Human Proof', value: 'Varun · verified for this action', state: 'verified' },
  { label: 'Employee authority', value: 'Enterprise Security · administrator', state: 'verified' },
  { label: 'Agent Passport', value: 'Codex Builder · runtime bound', state: 'verified' },
  { label: 'Mandate', value: 'Build storefront · narrow scope', state: 'verified' },
  { label: 'Context Grant', value: '3 released · 2 withheld', state: 'verified' },
  { label: 'Signed handoff', value: 'Predecessor hash carried forward', state: 'verified' },
  { label: 'Approval', value: 'Independent decision required', state: 'pending' },
  { label: 'Output', value: 'Hash recorded after execution', state: 'future' }
] as const;
