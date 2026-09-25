import { randomUUID } from 'node:crypto';
import {
  H2A_A2A_EXTENSION_URI,
  connectorDeliveryResultSchema,
  connectorFrameSchema,
  h2aA2aAuthorityEnvelopeSchema,
  taskEnvelopeSchema,
  type ConnectorDeliveryResult,
  type ConnectorFrame
} from '@h2a/contracts';
import { Role, type AgentCard, type Message, type SendMessageRequest } from '@a2a-js/sdk';
import {
  ClientFactory,
  ClientFactoryOptions,
  JsonRpcTransportFactory,
  ServiceParameters,
  withA2AExtensions
} from '@a2a-js/sdk/client';
import type { ConnectorTransport } from './messageBroker';

export interface A2AConnectorTransportOptions {
  agentCard: AgentCard;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class A2AConnectorTransport implements ConnectorTransport {
  public constructor(private readonly options: A2AConnectorTransportOptions) {
    const required = options.agentCard.capabilities?.extensions?.some((extension) => extension.uri === H2A_A2A_EXTENSION_URI && extension.required);
    if (!required) throw new Error('A2A connector must require the H2A authority extension.');
  }

  public async deliver(frame: ConnectorFrame, brokerPublicKeyPem: string, authorize: (request: ConnectorFrame) => Promise<ConnectorFrame>): Promise<ConnectorDeliveryResult> {
    const first = await this.send(frame, { phase: 'task', frame, broker_public_key_pem: brokerPublicKeyPem });
    if (first.type !== 'context-request') throw new Error('A2A connector did not request bounded context.');
    const response = await authorize(connectorFrameSchema.parse(first.frame));
    const completed = await this.send(frame, { phase: 'context-response', frame: response });
    if (completed.type !== 'completed') throw new Error('A2A connector did not complete the signed exchange.');
    return connectorDeliveryResultSchema.parse({ result: completed.result, acknowledgement: completed.acknowledgement });
  }

  private async send(taskFrame: ConnectorFrame, value: Record<string, unknown>): Promise<Record<string, unknown>> {
    const task = taskEnvelopeSchema.parse(taskFrame.payload.task);
    const authority = h2aA2aAuthorityEnvelopeSchema.parse({
      extension_uri: H2A_A2A_EXTENSION_URI,
      extension_version: '1.0',
      organization_id: task.organization_id,
      task_envelope_id: task.task_id,
      passport_id: task.passport_id,
      runtime_attestation_id: task.runtime_attestation_id,
      mandate_id: task.mandate_id,
      context_grant_id: task.context_grant_id,
      trace_id: task.trace_id,
      sequence: task.sequence,
      expires_at: task.expires_at,
      authority_bundle_hash: task.canonical_hash,
      sender_signature: task.organization_signature
    });
    const factory = new ClientFactory(ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory({ fetchImpl: this.options.fetchImpl })]
    }));
    const client = await factory.createFromAgentCard(this.options.agentCard);
    const request: SendMessageRequest = {
      tenant: '',
      message: {
        messageId: `msg_${randomUUID()}`, contextId: task.trace_id, taskId: task.task_id,
        role: Role.ROLE_USER,
        parts: [{ content: { $case: 'data', value }, metadata: undefined, filename: '', mediaType: 'application/json' }],
        metadata: { [H2A_A2A_EXTENSION_URI]: authority },
        extensions: [H2A_A2A_EXTENSION_URI], referenceTaskIds: task.dependency_task_ids
      },
      configuration: { acceptedOutputModes: ['application/json'], taskPushNotificationConfig: undefined, returnImmediately: false },
      metadata: undefined
    };
    const result = await client.sendMessage(request, {
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      serviceParameters: ServiceParameters.create(withA2AExtensions(H2A_A2A_EXTENSION_URI))
    });
    if (!('role' in result) || result.role !== Role.ROLE_AGENT) throw new Error('A2A connector did not return an agent message.');
    return dataValue(result);
  }
}

function dataValue(message: Message): Record<string, unknown> {
  for (const part of message.parts) {
    if (part.content?.$case === 'data' && part.content.value && typeof part.content.value === 'object' && !Array.isArray(part.content.value)) {
      return part.content.value as Record<string, unknown>;
    }
  }
  throw new Error('A2A connector response did not contain structured data.');
}
