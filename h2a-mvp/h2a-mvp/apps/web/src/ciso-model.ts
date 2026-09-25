export type CisoPage = 'overview' | 'mesh' | 'inventory' | 'adoption' | 'flows' | 'licenses' | 'actions' | 'evidence';
export type EstateRisk = 'critical' | 'high' | 'medium' | 'low' | 'healthy';
export type EstateNodeType = 'organization' | 'workspace' | 'human' | 'managed-agent' | 'third-party' | 'data';

export interface EstateNode {
  id: string;
  label: string;
  subtitle: string;
  type: EstateNodeType;
  x: number;
  y: number;
  risk: EstateRisk;
  owner?: string;
  activity: string;
  scope: string;
}

export interface EstateEdge {
  from: string;
  to: string;
  type: 'membership' | 'admin' | 'active' | 'cross-workspace' | 'review' | 'blocked';
  label?: string;
}

export interface WorkspaceMesh {
  workspaceId: string;
  nodes: EstateNode[];
  edges: EstateEdge[];
}

export interface InventoryAgent {
  id: string;
  name: string;
  kind: 'H2A managed' | 'Company agent' | 'Approved third-party' | 'Custom MCP' | 'Shadow AI';
  provider: string;
  owner: string;
  calls: number;
  users: number;
  data: string;
  state: 'active' | 'idle' | 'review' | 'quarantined';
  risk: EstateRisk;
  spend: string;
  lastUsed: string;
}

export interface EstateAction {
  id: string;
  title: string;
  summary: string;
  risk: EstateRisk;
  category: 'Shadow AI' | 'Data movement' | 'Ownership' | 'Approval' | 'License waste';
  actor: string;
  target: string;
  data: string;
  workspace: string;
  detected: string;
  status: 'open' | 'contained' | 'approved' | 'assigned';
  recommended: string;
  evidenceId?: string;
}

export interface LicenseRecord {
  id: string;
  tool: string;
  provider: string;
  purchased: number;
  active: number;
  monthlyCost: number;
  trend: number[];
  owner: string;
  renewal: string;
}

export const estateNodes: EstateNode[] = [
  { id: 'hq', label: 'HP Enterprise', subtitle: 'Enterprise headquarters', type: 'organization', x: 50, y: 50, risk: 'low', owner: 'CISO Office', activity: '41 governed workspaces', scope: 'Enterprise' },
  { id: 'asha', label: 'Asha Mehta', subtitle: 'Workspace creator', type: 'human', x: 34, y: 32, risk: 'low', owner: 'Digital Commerce', activity: 'Creator · admin in 2 workspaces', scope: 'Digital experience' },
  { id: 'varun', label: 'Varun Khatr', subtitle: 'Workspace creator', type: 'human', x: 66, y: 32, risk: 'low', owner: 'Enterprise Security', activity: 'Creator · admin in 2 workspaces', scope: 'Security administration' },
  { id: 'maya', label: 'Maya Thompson', subtitle: 'Workspace creator', type: 'human', x: 66, y: 68, risk: 'low', owner: 'Finance Operations', activity: 'Creator · admin in 1 workspace', scope: 'Financial operations' },
  { id: 'priya', label: 'Priya Nair', subtitle: 'Workspace creator', type: 'human', x: 34, y: 68, risk: 'low', owner: 'People Operations', activity: 'Creator · admin in 1 workspace', scope: 'People operations' },
  { id: 'ws-commerce', label: 'Digital Commerce', subtitle: '74 people · 48 agents', type: 'workspace', x: 14, y: 18, risk: 'high', owner: 'Asha Mehta', activity: '8,421 calls today', scope: 'Customer experience' },
  { id: 'ws-security', label: 'Enterprise Security', subtitle: '62 people · 37 agents', type: 'workspace', x: 86, y: 18, risk: 'medium', owner: 'Varun Khatr', activity: '3,842 calls today', scope: 'Security operations' },
  { id: 'ws-finance', label: 'Finance Operations', subtitle: '41 people · 29 agents', type: 'workspace', x: 86, y: 82, risk: 'low', owner: 'Maya Thompson', activity: '2,191 calls today', scope: 'Corporate finance' },
  { id: 'ws-people', label: 'People Operations', subtitle: '56 people · 31 agents', type: 'workspace', x: 14, y: 82, risk: 'medium', owner: 'Priya Nair', activity: '1,640 calls today', scope: 'Employee operations' }
];

export const estateEdges: EstateEdge[] = [
  { from: 'hq', to: 'asha', type: 'membership' },
  { from: 'hq', to: 'varun', type: 'membership' },
  { from: 'hq', to: 'maya', type: 'membership' },
  { from: 'hq', to: 'priya', type: 'membership' },
  { from: 'asha', to: 'ws-commerce', type: 'membership', label: 'creator' },
  { from: 'varun', to: 'ws-security', type: 'membership', label: 'creator' },
  { from: 'maya', to: 'ws-finance', type: 'membership', label: 'creator' },
  { from: 'priya', to: 'ws-people', type: 'membership', label: 'creator' },
  { from: 'varun', to: 'ws-commerce', type: 'admin', label: 'admin' },
  { from: 'asha', to: 'ws-people', type: 'admin', label: 'admin' },
  { from: 'ws-commerce', to: 'ws-security', type: 'cross-workspace', label: 'active exchange' },
  { from: 'ws-commerce', to: 'ws-people', type: 'cross-workspace', label: 'data handoff' },
  { from: 'ws-security', to: 'ws-finance', type: 'cross-workspace', label: 'control feed' }
];

export const workspaceMeshes: Record<string, WorkspaceMesh> = {
  'ws-commerce': {
    workspaceId: 'ws-commerce',
    nodes: [
      { id: 'ws-commerce', label: 'Digital Commerce', subtitle: 'Workspace', type: 'workspace', x: 50, y: 50, risk: 'high', owner: 'Asha Mehta', activity: '74 people · 48 agents', scope: 'Customer experience' },
      { id: 'commerce-asha', label: 'Asha Mehta', subtitle: 'Creator · accountable owner', type: 'human', x: 27, y: 26, risk: 'low', owner: 'Digital Commerce', activity: '1,284 calls · 6 agents', scope: 'Workspace administrator' },
      { id: 'commerce-jordan', label: 'Jordan Brooks', subtitle: 'Product lead', type: 'human', x: 24, y: 71, risk: 'low', owner: 'Digital Commerce', activity: '642 calls · 3 agents', scope: 'Product delivery' },
      { id: 'commerce-elena', label: 'Elena Garcia', subtitle: 'Market intelligence', type: 'human', x: 52, y: 17, risk: 'medium', owner: 'Digital Commerce', activity: '418 calls · 2 agents', scope: 'Audience research' },
      { id: 'claude', label: 'Claude Design', subtitle: 'Anthropic · approved third-party', type: 'third-party', x: 77, y: 25, risk: 'low', owner: 'Asha Mehta', activity: '2,804 calls · active', scope: 'Design files and briefs' },
      { id: 'commerce-codex', label: 'Storefront Builder', subtitle: 'OpenAI Codex · H2A managed', type: 'managed-agent', x: 80, y: 68, risk: 'low', owner: 'Jordan Brooks', activity: '1,162 calls · active', scope: 'Storefront repository' },
      { id: 'campaign-agent', label: 'Campaign Analyst', subtitle: 'Gemini · approved third-party', type: 'third-party', x: 52, y: 84, risk: 'low', owner: 'Elena Garcia', activity: '1,604 calls · active', scope: 'Campaign analytics' },
      { id: 'windsurf', label: 'Windsurf Local', subtitle: 'Unmanaged third-party', type: 'third-party', x: 12, y: 48, risk: 'critical', owner: 'Unassigned', activity: '84 calls · review required', scope: 'Requested source code and customer data' }
    ],
    edges: [
      { from: 'ws-commerce', to: 'commerce-asha', type: 'membership', label: 'owner' },
      { from: 'ws-commerce', to: 'commerce-jordan', type: 'membership' },
      { from: 'ws-commerce', to: 'commerce-elena', type: 'membership' },
      { from: 'commerce-asha', to: 'claude', type: 'active', label: 'design brief' },
      { from: 'commerce-jordan', to: 'commerce-codex', type: 'active', label: 'build task' },
      { from: 'commerce-elena', to: 'campaign-agent', type: 'active', label: 'research task' },
      { from: 'commerce-asha', to: 'windsurf', type: 'review', label: 'unmanaged call' },
      { from: 'claude', to: 'commerce-codex', type: 'active', label: 'signed handoff' }
    ]
  },
  'ws-security': {
    workspaceId: 'ws-security',
    nodes: [
      { id: 'ws-security', label: 'Enterprise Security', subtitle: 'Workspace', type: 'workspace', x: 50, y: 50, risk: 'medium', owner: 'Varun Khatr', activity: '62 people · 37 agents', scope: 'Security operations' },
      { id: 'security-varun', label: 'Varun Khatr', subtitle: 'Creator · accountable owner', type: 'human', x: 27, y: 27, risk: 'low', owner: 'Enterprise Security', activity: '721 calls · 4 agents', scope: 'Workspace administrator' },
      { id: 'security-priya', label: 'Priya Nair', subtitle: 'Privacy counsel', type: 'human', x: 25, y: 71, risk: 'low', owner: 'Enterprise Security', activity: '284 reviews', scope: 'Policy approval' },
      { id: 'security-sam', label: 'Sam Chen', subtitle: 'SOC lead', type: 'human', x: 52, y: 18, risk: 'low', owner: 'Enterprise Security', activity: '534 calls · 3 agents', scope: 'Threat operations' },
      { id: 'codex', label: 'Codex Builder', subtitle: 'OpenAI Codex · H2A managed', type: 'managed-agent', x: 78, y: 27, risk: 'low', owner: 'Varun Khatr', activity: '1,904 calls · active', scope: 'Approved repositories' },
      { id: 'security-agent', label: 'Security Reviewer', subtitle: 'HP company agent', type: 'managed-agent', x: 79, y: 69, risk: 'low', owner: 'Varun Khatr', activity: '932 calls · active', scope: 'Policy metadata' },
      { id: 'vendor-scanner', label: 'Vendor Risk Scanner', subtitle: 'Microsoft · approved third-party', type: 'third-party', x: 51, y: 84, risk: 'medium', owner: 'Priya Nair', activity: '446 calls · approval pending', scope: 'Vendor evidence' }
    ],
    edges: [
      { from: 'ws-security', to: 'security-varun', type: 'membership', label: 'owner' },
      { from: 'ws-security', to: 'security-priya', type: 'membership' },
      { from: 'ws-security', to: 'security-sam', type: 'membership' },
      { from: 'security-varun', to: 'codex', type: 'active', label: 'remediation' },
      { from: 'security-varun', to: 'security-agent', type: 'active', label: 'policy review' },
      { from: 'security-priya', to: 'vendor-scanner', type: 'review', label: 'approval' },
      { from: 'vendor-scanner', to: 'security-agent', type: 'active', label: 'evidence' }
    ]
  },
  'ws-finance': {
    workspaceId: 'ws-finance',
    nodes: [
      { id: 'ws-finance', label: 'Finance Operations', subtitle: 'Workspace', type: 'workspace', x: 50, y: 50, risk: 'low', owner: 'Maya Thompson', activity: '41 people · 29 agents', scope: 'Corporate finance' },
      { id: 'finance-maya', label: 'Maya Thompson', subtitle: 'Creator · accountable owner', type: 'human', x: 28, y: 30, risk: 'low', owner: 'Finance Operations', activity: '488 calls · 2 agents', scope: 'Workspace administrator' },
      { id: 'finance-liam', label: 'Liam Wright', subtitle: 'Finance analyst', type: 'human', x: 26, y: 70, risk: 'low', owner: 'Finance Operations', activity: '342 calls · 2 agents', scope: 'Close operations' },
      { id: 'finance', label: 'Close Reconciler', subtitle: 'HP company agent', type: 'managed-agent', x: 76, y: 31, risk: 'low', owner: 'Maya Thompson', activity: '684 calls · idle', scope: 'Quarter-close records' },
      { id: 'forecast-agent', label: 'Forecast Assistant', subtitle: 'Microsoft · approved third-party', type: 'third-party', x: 76, y: 69, risk: 'low', owner: 'Liam Wright', activity: '526 calls · active', scope: 'Approved forecast data' }
    ],
    edges: [
      { from: 'ws-finance', to: 'finance-maya', type: 'membership', label: 'owner' },
      { from: 'ws-finance', to: 'finance-liam', type: 'membership' },
      { from: 'finance-maya', to: 'finance', type: 'active', label: 'close task' },
      { from: 'finance-liam', to: 'forecast-agent', type: 'active', label: 'forecast task' },
      { from: 'finance', to: 'forecast-agent', type: 'active', label: 'bounded handoff' }
    ]
  },
  'ws-people': {
    workspaceId: 'ws-people',
    nodes: [
      { id: 'ws-people', label: 'People Operations', subtitle: 'Workspace', type: 'workspace', x: 50, y: 50, risk: 'medium', owner: 'Priya Nair', activity: '56 people · 31 agents', scope: 'Employee operations' },
      { id: 'people-priya', label: 'Priya Nair', subtitle: 'Creator · accountable owner', type: 'human', x: 28, y: 28, risk: 'low', owner: 'People Operations', activity: '516 calls · 3 agents', scope: 'Workspace administrator' },
      { id: 'people-nina', label: 'Nina Patel', subtitle: 'Employee experience', type: 'human', x: 27, y: 71, risk: 'low', owner: 'People Operations', activity: '874 calls · 4 agents', scope: 'Employee support' },
      { id: 'onboarding-agent', label: 'Onboarding Guide', subtitle: 'HP company agent', type: 'managed-agent', x: 76, y: 29, risk: 'low', owner: 'Priya Nair', activity: '1,286 calls · active', scope: 'Onboarding records' },
      { id: 'support-agent', label: 'Employee Assistant', subtitle: 'Microsoft · approved third-party', type: 'third-party', x: 76, y: 70, risk: 'medium', owner: 'Nina Patel', activity: '2,104 calls · active', scope: 'Employee knowledge' }
    ],
    edges: [
      { from: 'ws-people', to: 'people-priya', type: 'membership', label: 'owner' },
      { from: 'ws-people', to: 'people-nina', type: 'membership' },
      { from: 'people-priya', to: 'onboarding-agent', type: 'active', label: 'onboarding' },
      { from: 'people-nina', to: 'support-agent', type: 'active', label: 'support task' },
      { from: 'onboarding-agent', to: 'support-agent', type: 'active', label: 'approved handoff' }
    ]
  }
};

export const inventoryAgents: InventoryAgent[] = [
  { id: 'codex', name: 'Codex Builder', kind: 'H2A managed', provider: 'OpenAI Codex', owner: 'Varun Khatr', calls: 1904, users: 38, data: 'Source code', state: 'active', risk: 'low', spend: '$4,820', lastUsed: 'Now' },
  { id: 'claude', name: 'Claude Design Partner', kind: 'Approved third-party', provider: 'Anthropic', owner: 'Asha Mehta', calls: 2804, users: 64, data: 'Design files', state: 'active', risk: 'low', spend: '$6,140', lastUsed: 'Now' },
  { id: 'research', name: 'Research Scout', kind: 'Custom MCP', provider: 'HP MCP Runtime', owner: 'Elena Garcia', calls: 1222, users: 31, data: 'Public web', state: 'active', risk: 'medium', spend: '$1,080', lastUsed: '2 min ago' },
  { id: 'security-agent', name: 'Security Reviewer', kind: 'Company agent', provider: 'HP Internal', owner: 'Varun Khatr', calls: 932, users: 22, data: 'Policy metadata', state: 'active', risk: 'healthy', spend: '$740', lastUsed: '4 min ago' },
  { id: 'copilot-sales', name: 'Sales Copilot', kind: 'Approved third-party', provider: 'Microsoft', owner: 'Jordan Brooks', calls: 3811, users: 118, data: 'CRM records', state: 'active', risk: 'medium', spend: '$9,420', lastUsed: 'Now' },
  { id: 'support-agent', name: 'Customer Support Agent', kind: 'Company agent', provider: 'HP Internal', owner: 'Nina Patel', calls: 4210, users: 84, data: 'Support cases', state: 'active', risk: 'low', spend: '$2,920', lastUsed: 'Now' },
  { id: 'finance', name: 'Close Reconciler', kind: 'Company agent', provider: 'HP Internal', owner: 'Maya Thompson', calls: 684, users: 12, data: 'Finance records', state: 'idle', risk: 'low', spend: '$630', lastUsed: '3 hr ago' },
  { id: 'gemini-marketing', name: 'Campaign Analyst', kind: 'Approved third-party', provider: 'Google Gemini', owner: 'Elena Garcia', calls: 1604, users: 47, data: 'Campaign analytics', state: 'active', risk: 'low', spend: '$3,180', lastUsed: '6 min ago' },
  { id: 'windsurf', name: 'Windsurf Local', kind: 'Shadow AI', provider: 'Windsurf', owner: 'Unassigned', calls: 84, users: 17, data: 'Source code, customer segments', state: 'review', risk: 'critical', spend: 'Unknown', lastUsed: '7 min ago' },
  { id: 'extractor-mcp', name: 'Bulk Data Extractor', kind: 'Custom MCP', provider: 'Local runtime', owner: 'Unassigned', calls: 37, users: 3, data: 'Customer exports', state: 'review', risk: 'high', spend: '$90', lastUsed: '26 min ago' },
  { id: 'legal-review', name: 'Contract Review Agent', kind: 'Company agent', provider: 'HP Internal', owner: 'Priya Nair', calls: 448, users: 19, data: 'Contracts', state: 'active', risk: 'low', spend: '$510', lastUsed: '18 min ago' },
  { id: 'legacy-bot', name: 'Legacy Pricing Bot', kind: 'Company agent', provider: 'HP Internal', owner: 'Former employee', calls: 0, users: 0, data: 'Pricing records', state: 'quarantined', risk: 'high', spend: '$280', lastUsed: '43 days ago' }
];

export const initialEstateActions: EstateAction[] = [
  { id: 'shadow-windsurf', title: 'Unmanaged Windsurf agent accessed two workspaces', summary: 'A local extension requested source code and customer-segment data outside an H2A mandate.', risk: 'critical', category: 'Shadow AI', actor: 'Asha Mehta', target: 'Windsurf Local', data: 'Source code · Customer segments', workspace: 'Digital Commerce + People Operations', detected: '7 min ago', status: 'open', recommended: 'Quarantine the connection and assign an accountable owner.' },
  { id: 'cross-space', title: 'Confidential context crossed workspace boundary', summary: 'Customer-segment context moved from Digital Commerce into People Operations.', risk: 'high', category: 'Data movement', actor: 'Asha Mehta', target: 'Customer segments', data: 'Confidential customer analytics', workspace: 'Digital Commerce → People Operations', detected: '11 min ago', status: 'open', recommended: 'Review the transfer purpose and restrict future forwarding.' },
  { id: 'unowned-extractor', title: 'Custom MCP agent has no accountable owner', summary: 'Bulk Data Extractor remains callable by three users without a current employee owner.', risk: 'high', category: 'Ownership', actor: '3 active users', target: 'Bulk Data Extractor', data: 'Customer exports', workspace: 'Revenue Operations', detected: '26 min ago', status: 'open', recommended: 'Assign an owner or quarantine the runtime.' },
  { id: 'publish-approval', title: 'Vendor finding requires independent approval', summary: 'Security Reviewer is paused before publishing a restricted procurement finding.', risk: 'medium', category: 'Approval', actor: 'Security Reviewer', target: 'Procurement record', data: 'Restricted vendor finding', workspace: 'Enterprise Security', detected: '34 min ago', status: 'open', recommended: 'Review the exact effect and approve once or deny.' },
  { id: 'license-waste', title: '214 AI coding seats have no 30-day activity', summary: 'Purchased Windsurf and Copilot seats exceed active adoption across Engineering.', risk: 'low', category: 'License waste', actor: 'Platform Engineering', target: 'AI coding licenses', data: 'Usage telemetry only', workspace: 'Enterprise', detected: 'Today', status: 'open', recommended: 'Reclaim dormant seats before renewal.' }
];

export const licenseRecords: LicenseRecord[] = [
  { id: 'copilot', tool: 'Microsoft Copilot', provider: 'Microsoft', purchased: 500, active: 318, monthlyCost: 15000, trend: [52, 55, 57, 60, 62, 64, 64], owner: 'Digital Workplace', renewal: 'Nov 18' },
  { id: 'windsurf-license', tool: 'Windsurf', provider: 'Codeium', purchased: 240, active: 117, monthlyCost: 7200, trend: [61, 58, 55, 53, 51, 49, 49], owner: 'Platform Engineering', renewal: 'Oct 02' },
  { id: 'claude-license', tool: 'Claude Enterprise', provider: 'Anthropic', purchased: 180, active: 162, monthlyCost: 10800, trend: [72, 76, 81, 84, 87, 89, 90], owner: 'Digital Experience', renewal: 'Dec 11' },
  { id: 'gemini-license', tool: 'Gemini Enterprise', provider: 'Google', purchased: 300, active: 226, monthlyCost: 9000, trend: [63, 65, 68, 70, 73, 74, 75], owner: 'Data & Analytics', renewal: 'Jan 09' },
  { id: 'internal-runtime', tool: 'HP Agent Runtime', provider: 'HP Internal', purchased: 420, active: 389, monthlyCost: 6340, trend: [81, 84, 86, 88, 90, 92, 93], owner: 'AI Platform', renewal: 'Internal' }
];

export const humanAdoption = [
  { name: 'Asha Mehta', team: 'Digital Commerce', calls: 1284, agents: 6, workspaces: 3, risk: 'Cross-workspace' },
  { name: 'Jordan Brooks', team: 'Platform Engineering', calls: 1109, agents: 8, workspaces: 4, risk: 'Healthy' },
  { name: 'Elena Garcia', team: 'Market Intelligence', calls: 986, agents: 3, workspaces: 2, risk: 'Review scope' },
  { name: 'Nina Patel', team: 'Customer Support', calls: 874, agents: 4, workspaces: 2, risk: 'Healthy' },
  { name: 'Varun Khatr', team: 'Enterprise Security', calls: 721, agents: 4, workspaces: 2, risk: 'Healthy' },
  { name: 'Maya Thompson', team: 'Corporate Finance', calls: 488, agents: 2, workspaces: 1, risk: 'Healthy' }
];

export const evidenceEvents = [
  { time: '10:42:18', actor: 'Asha Mehta', event: 'Invoked Windsurf Local from Digital Commerce', result: 'Observed', tone: 'warning' },
  { time: '10:42:19', actor: 'Windsurf Local', event: 'Requested source code and customer-segment context', result: 'Policy evaluated', tone: 'warning' },
  { time: '10:42:19', actor: 'Context broker', event: 'Released repository files; withheld credentials and employee PII', result: 'Bounded', tone: 'healthy' },
  { time: '10:42:21', actor: 'Asha Mehta', event: 'Attempted forwarding into People Operations', result: 'Escalated', tone: 'high' },
  { time: '10:42:21', actor: 'Policy engine', event: 'Blocked confidential customer segments at workspace boundary', result: 'Denied', tone: 'critical' },
  { time: '10:43:02', actor: 'H2A', event: 'Created containment recommendation and preserved the evidence chain', result: 'Action required', tone: 'warning' }
];
