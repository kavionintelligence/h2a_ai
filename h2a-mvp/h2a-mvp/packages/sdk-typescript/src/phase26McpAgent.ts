import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { signFrame, verifyFrame, type ProtocolFrame } from './index.ts';

const privateKeyPath = process.env.H2A_CONNECTOR_PRIVATE_KEY_PATH;
const manifestId = process.env.H2A_CONNECTOR_MANIFEST_ID;
if (!privateKeyPath || !manifestId) throw new Error('Phase 26 MCP environment is incomplete.');
const privateKey = readFileSync(privateKeyPath, 'utf8');
const server = new McpServer({ name: 'h2a-phase26-mcp-participant', version: '1.0.0' });
server.registerTool('h2a_exchange', { inputSchema: { phase: z.enum(['task', 'context-response']), frame: z.record(z.string(), z.unknown()), broker_public_key_pem: z.string().optional() } }, async ({ phase, frame: value, broker_public_key_pem }) => {
  if (phase !== 'task' || !broker_public_key_pem) throw new Error('Phase 26 MCP accepts only an initial zero-disclosure task.');
  const taskFrame = verifyFrame(value as unknown as ProtocolFrame, broker_public_key_pem, 'task');
  if (taskFrame.connector_manifest_id !== manifestId) throw new Error('MCP task addressed to another connector.');
  const task = (taskFrame.payload.task ?? {}) as Record<string, unknown>;
  const base = { protocol_version: '1.0' as const, connector_manifest_id: manifestId, task_id: taskFrame.task_id, trace_id: taskFrame.trace_id, idempotency_key: taskFrame.idempotency_key, expires_at: taskFrame.expires_at };
  const result = signFrame({ ...base, kind: 'result', sequence: taskFrame.sequence + 1, causation_id: taskFrame.frame_id, payload: { status: 'succeeded', output: { framework: 'mcp', protocol: 'official-sdk-stdio', dependency_task_ids: task.dependency_task_ids ?? [], zero_disclosure: true } } }, privateKey);
  const acknowledgement = signFrame({ ...base, kind: 'acknowledgement', sequence: taskFrame.sequence + 2, causation_id: result.frame_id, payload: { accepted: true, result_frame_id: result.frame_id } }, privateKey);
  const response = { type: 'completed', result, acknowledgement };
  return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response };
});
await server.connect(new StdioServerTransport());
