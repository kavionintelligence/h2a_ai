/** HTTP contract for the ByoSync governance workspace. */
export interface Human { human_id: string; name: string; team: string }
/** Census owns every field in this record. H2A preserves it without reclassification. */
export interface CensusEntity {
  agent_id: string; name: string; provider: string | null; model: string | null; framework: string | null;
  endpoint: string | null; protocols: string[]; tools: string[];
  capabilities: Array<{ name: string; basis: string; confidence: number; evidence: unknown[]; [key: string]: unknown }>;
  fingerprint: Record<string, unknown>;
  classification: { is_agent: boolean; classification: string; confidence: number; entity_type: string; reasons: string[]; evidence: unknown[]; [key: string]: unknown };
  registered: boolean; shadow: boolean; discovery_sources: string[];
  first_seen: string; last_seen: string; activity_status: 'active' | 'stale'; evidence_age_seconds: number;
  confidence: number; evidence: unknown[]; identity_decisions: unknown[];
  skills?: string[]; description?: string | null; version?: string | null; health_status?: string;
  owner?: string | null; environment?: string | null; trust_status?: string;
  created_at?: string; updated_at?: string;
  discovery_history?: Array<{ id: number; timestamp: string; action: string; actor: string; subject: string | null; correlation_id: string; details: Record<string, unknown> }>;
  [key: string]: unknown;
}
export interface DiscoveryScan {
  scan_id: string; started_at: string; completed_at: string; correlation_id: string;
  agents: CensusEntity[]; errors: Array<{ source: string; code: string; message: string; [key: string]: unknown }>;
  discovery_sources: string[]; observed_agent_ids: string[]; configured_source_count: number;
  [key: string]: unknown;
}
export interface DiscoveryAgent {
  agent_id: string; name: string; framework: string; discovery_status: 'discovered';
  census_agent_id?: string; discovery_snapshot?: CensusEntity;
  imported_at?: string; import_scan_id?: string; legacy_identity?: boolean;
  discovery_source?: string; evidence?: unknown;
}
export interface Binding { binding_id: string; agent_id: string; human_id: string; relationship: 'owner'; status: 'active'; created_at: string }
export interface Passport {
  passport_id: string; agent_id: string; binding_id: string; owner_human_id: string; status: string;
  issued_at: string; expires_at?: string; passport_signature: string;
}
export interface Mandate {
  mandate_id: string; agent_id: string; passport_id: string; purpose: string; status: string;
  expires_at?: string;
  allowed_actions: string[]; approval_required_actions: string[]; denied_actions: string[];
}
export interface Agent extends DiscoveryAgent {
  status: 'Registered' | 'Owned' | 'Managed'; governance_status: 'Registered' | 'Owned' | 'Managed';
  owner: Human | null; binding: Binding | null; passport: Passport | null; mandate: Mandate | null;
}
export interface Room {
  room_id: string; name: string; human_ids: string[]; agent_ids: string[]; created_at: string;
}
export interface Action {
  action_id: string; agent_id: string; passport_id: string; mandate_id: string; room_id: string;
  action: string; label: string; status: 'executed' | 'pending' | 'denied' | 'rejected' | 'failed';
  decision: 'ALLOWED' | 'REQUIRES_APPROVAL' | 'DENIED'; reason: string; approval_id?: string;
  requested_at: string; executed_at?: string; execution_count: number;
  result?: { summary: string; details?: Record<string, unknown>; artifact?: { name: string; path: string; content_hash: string } };
}
export interface Approval {
  approval_id: string; agent_id: string; passport_id: string; mandate_id: string; room_id: string; action_id: string;
  action: string; status: 'pending' | 'approved' | 'rejected' | 'invalidated'; requested_at: string;
  reviewed_by?: string; resolved_at?: string;
}
export interface Memory {
  memory_id: string; title: string; content: string; status: 'proposed' | 'published' | 'rejected';
  created_by_agent: string; agent_id: string; passport_id: string; mandate_id: string; room_id: string;
  source_action_id: string; sources: Array<{ title: string; url: string }>; content_hash: string;
  created_at: string; proposed_by?: string; reviewed_by?: string; reviewed_at?: string; review_note?: string;
}
export interface WorkAssignment {
  id: string; room_id: string; title: string; objective: string;
  status: 'queued' | 'active' | 'approval' | 'blocked' | 'complete';
  assigneeId: string; mandateId: string; risk: 'standard' | 'sensitive' | 'restricted'; priority: number;
  dependsOn: string[]; requestedAction?: string; traceId?: string; createdAt?: string; updatedAt: string;
  response?: string; responseCount: number; messageCount: number;
}
export interface CollaborationMessage {
  id: string; assignmentId: string; fromAgentId: string; toAgentId: string;
  act: 'request' | 'inform' | 'propose' | 'query' | 'response' | 'handoff';
  subject: string; body: string; mandateId: string; traceId: string; createdAt: string; deliveryStatus: 'delivered';
}
export interface CollaborationActivity {
  id: string; agentId: string; assignmentId?: string; kind: string; level: string; summary: string; detail?: string; createdAt: string;
}
export interface AuditEvent {
  event_id: string; event_type: string; timestamp: string; actor_type: string; actor_id: string;
  agent_id?: string; passport_id?: string; mandate_id?: string; room_id?: string; approval_id?: string;
  metadata: Record<string, unknown>; event_hash: string; previous_hash: string | null;
}
export interface AssuranceFinding {
  finding_id: string; title: string; severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'resolved'; subject_type: 'platform' | 'agent' | 'connector'; subject_id: string;
  summary: string; evidence_refs: string[]; capability: 'Inline enforced' | 'Connector controlled' | 'Observe only' | 'Not verified';
}
export interface Coverage {
  last_scan_at: string | null; configured_sources: number; observed_entities: number; scan_errors: number;
}
export interface ConnectionStatus {
  id: string; name: string; status: 'connected' | 'not-configured' | 'degraded';
  capability: 'Inline enforced' | 'Connector controlled' | 'Observe only' | 'Not verified'; detail: string;
}
export interface Snapshot {
  session: { human_id: string; name: string; team: string; mode: 'local-operator' | 'named-user'; role?: 'admin' | 'builder' | 'reviewer' | 'viewer'; assurance: string };
  humans: Human[]; agents: Agent[]; bindings: Binding[]; passports: Passport[]; mandates: Mandate[];
  rooms: Room[]; actions: Action[]; approvals: Approval[]; memories: Memory[]; events: AuditEvent[];
  collaboration: { assignments: WorkAssignment[]; messages: CollaborationMessage[]; activity: CollaborationActivity[] };
  integrity: { status: string; recordCount: number; headHash: string | null; reason?: string };
  assurance: { findings: AssuranceFinding[]; coverage: Coverage; connections: ConnectionStatus[] };
}
// GET /api/state and governance commands return Snapshot. Errors: { error: string }.
// POST /api/discovery/scan {} returns an ephemeral DiscoveryScan, never imports agents.
// POST /api/discovery/import { census_agent_id: string, scan_id?: string } returns Snapshot.
// POST /api/agents/:id/bind { human_id: string }
// POST /api/agents/:id/passport {}
// POST /api/agents/:id/mandate {}
// POST /api/agents/:id/mandate/lifecycle { action: 'suspend'|'reactivate'|'revoke' }
// POST /api/rooms { name?: string, agent_id: string, agent_ids?: string[] }
// POST /api/rooms/:id/work { agent_id, title, objective, risk, priority }
// POST /api/work/:id/status { status }
// POST /api/work/:id/handoff { from_agent_id, to_agent_id, act, subject, body }
// POST /api/work/:id/response { agent_id, body }
// POST /api/rooms/:id/actions { agent_id: string, action: 'inventory_report'|'verify_integrity'|'evidence_export'|'crm_write'|'purchase', idempotency_key?: string }
// POST /api/approvals/:id/decision { decision: 'approve'|'reject' }
// POST /api/rooms/:id/memories { agent_id: string, title?: string, content?: string }
// POST /api/memories/:id/review { decision: 'approve'|'reject', content?: string, note?: string }
// GET /api/agents/:id/trace returns AuditEvent[].
