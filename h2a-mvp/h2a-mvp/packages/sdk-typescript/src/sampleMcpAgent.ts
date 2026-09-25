import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { signFrame, verifyFrame, type ProtocolFrame } from './index.ts';

const privateKeyPath = process.env.H2A_CONNECTOR_PRIVATE_KEY_PATH;
const connectorManifestId = process.env.H2A_CONNECTOR_MANIFEST_ID;
if (!privateKeyPath || !connectorManifestId) throw new Error('MCP connector environment is incomplete.');
const privateKeyPem = readFileSync(privateKeyPath, 'utf8');
const pending = new Map<string, { taskFrame: ProtocolFrame; task: Record<string, unknown>; brokerPublicKeyPem: string }>();
const completed = new Map<string, { type: 'completed'; result: ProtocolFrame; acknowledgement: ProtocolFrame }>();

const server = new McpServer({ name: 'h2a-reference-mcp-agent', version: '1.0.0' });
server.registerTool('h2a_exchange', {
  title: 'H2A signed task exchange',
  description: 'Accepts H2A signed task/context frames and returns signed result and acknowledgement frames.',
  inputSchema: {
    phase: z.enum(['task', 'context-response']),
    frame: z.record(z.string(), z.unknown()),
    broker_public_key_pem: z.string().optional()
  }
}, async ({ phase, frame: frameValue, broker_public_key_pem: brokerPublicKeyPem }) => {
  const frame = frameValue as unknown as ProtocolFrame;
  if (phase === 'task') {
    if (!brokerPublicKeyPem) throw new Error('Broker public key is required for the initial task.');
    const taskFrame = verifyFrame(frame, brokerPublicKeyPem, 'task');
    if (taskFrame.connector_manifest_id !== connectorManifestId) throw new Error('Task addressed to another MCP connector.');
    const cached = completed.get(taskFrame.idempotency_key);
    if (cached) return response(cached);
    const task = (taskFrame.payload.task ?? {}) as Record<string, unknown>;
    pending.set(taskFrame.task_id, { taskFrame, task, brokerPublicKeyPem });
    return response({
      type: 'context-request',
      frame: signFrame({
        protocol_version: '1.0', kind: 'context-request', connector_manifest_id: connectorManifestId,
        task_id: taskFrame.task_id, trace_id: taskFrame.trace_id, sequence: taskFrame.sequence + 1,
        idempotency_key: taskFrame.idempotency_key, causation_id: taskFrame.frame_id,
        expires_at: taskFrame.expires_at,
        payload: { context_grant_id: String(task.context_grant_id), requested_fields: ['supplier_name', 'risk_tier'], purpose: String(task.objective) }
      }, privateKeyPem)
    });
  }

  const active = pending.get(frame.task_id);
  if (!active) throw new Error('No pending MCP task for this context response.');
  const contextResponse = verifyFrame(frame, active.brokerPublicKeyPem, 'context-response');
  if (contextResponse.payload.authorized !== true) throw new Error(`Context denied: ${String(contextResponse.payload.reason_code)}.`);
  const context = contextResponse.payload.granted_fields as Record<string, unknown>;
  const output = {
    framework: 'mcp',
    protocol: 'official-sdk-stdio',
    assessment: `${String(context.supplier_name)}:${String(context.risk_tier)}`,
    authorized_fields: Object.keys(context).sort()
  };
  const base = {
    protocol_version: '1.0' as const, connector_manifest_id: connectorManifestId,
    task_id: contextResponse.task_id, trace_id: contextResponse.trace_id,
    idempotency_key: contextResponse.idempotency_key, expires_at: contextResponse.expires_at
  };
  const result = signFrame({ ...base, kind: 'result', sequence: contextResponse.sequence + 1, causation_id: contextResponse.frame_id, payload: { status: 'succeeded', output } }, privateKeyPem);
  const acknowledgement = signFrame({ ...base, kind: 'acknowledgement', sequence: contextResponse.sequence + 2, causation_id: result.frame_id, payload: { accepted: true, result_frame_id: result.frame_id } }, privateKeyPem);
  const outcome = { type: 'completed' as const, result, acknowledgement };
  completed.set(contextResponse.idempotency_key, outcome);
  pending.delete(contextResponse.task_id);
  return response(outcome);
});

const transport = new StdioServerTransport();
await server.connect(transport);

function response(value: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value };
}
