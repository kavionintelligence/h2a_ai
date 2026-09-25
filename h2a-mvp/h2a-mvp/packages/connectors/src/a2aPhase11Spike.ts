import {
  H2A_A2A_EXTENSION_URI,
  h2aA2aAuthorityEnvelopeSchema,
  type H2AA2AAuthorityEnvelope
} from '@h2a/contracts';
import {
  Role,
  type AgentCard,
  type Message,
  type SendMessageRequest
} from '@a2a-js/sdk';
import {
  ClientFactory,
  ClientFactoryOptions,
  JsonRpcTransportFactory,
  ServiceParameters,
  withA2AExtensions
} from '@a2a-js/sdk/client';
import {
  AgentEvent,
  DefaultRequestHandler,
  InMemoryTaskStore,
  JsonRpcTransportHandler,
  ServerCallContext,
  type AgentExecutor
} from '@a2a-js/sdk/server';

export interface A2APhase11SpikeResult {
  protocolVersion: '1.0';
  extensionUri: typeof H2A_A2A_EXTENSION_URI;
  extensionNegotiated: boolean;
  response: Message;
}

export async function runA2APhase11RoundTrip(
  authorityEnvelope: H2AA2AAuthorityEnvelope
): Promise<A2APhase11SpikeResult> {
  const envelope = h2aA2aAuthorityEnvelopeSchema.parse(authorityEnvelope);
  let receivedVersion = '';
  let receivedExtension = '';

  const agentCard: AgentCard = {
    name: 'H2A Phase 11 Conformance Agent',
    description: 'Local A2A 1.0 authority-envelope conformance endpoint.',
    supportedInterfaces: [{
      url: 'https://loopback.h2a.invalid/a2a/v1',
      protocolBinding: 'JSONRPC',
      protocolVersion: '1.0',
      tenant: ''
    }],
    provider: { organization: 'H2A', url: 'https://h2a.invalid' },
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [{
        uri: H2A_A2A_EXTENSION_URI,
        description: 'Signed H2A passport, mandate, context, runtime, and evidence references.',
        required: true,
        params: { extensionVersion: '1.0' }
      }]
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [],
    signatures: []
  };

  const executor: AgentExecutor = {
    async execute(context, eventBus) {
      const incoming = h2aA2aAuthorityEnvelopeSchema.parse(
        context.userMessage.metadata?.[H2A_A2A_EXTENSION_URI]
      );
      if (!context.context.requestedExtensions?.includes(H2A_A2A_EXTENSION_URI)) {
        throw new Error('Required H2A A2A extension was not negotiated.');
      }
      context.context.addActivatedExtension(H2A_A2A_EXTENSION_URI);
      eventBus.publish(AgentEvent.message({
        messageId: 'msg_h2a_phase11_response',
        contextId: context.contextId,
        taskId: '',
        role: Role.ROLE_AGENT,
        parts: [{
          content: { $case: 'data', value: { accepted: true, taskEnvelopeId: incoming.task_envelope_id } },
          metadata: undefined,
          filename: '',
          mediaType: 'application/json'
        }],
        metadata: { traceId: incoming.trace_id },
        extensions: [H2A_A2A_EXTENSION_URI],
        referenceTaskIds: []
      }));
    },
    async cancelTask(_taskId, eventBus) {
      eventBus.finished();
    }
  };

  const transportHandler = new JsonRpcTransportHandler(
    new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), executor)
  );
  const fetchImpl: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    receivedVersion = headers.get('A2A-Version') ?? '';
    receivedExtension = headers.get('A2A-Extensions') ?? '';
    const context = new ServerCallContext({
      requestedVersion: receivedVersion,
      requestedExtensions: receivedExtension.split(',').map((value) => value.trim()).filter(Boolean),
      state: new Map([['headers', Object.fromEntries(headers.entries())]])
    });
    const response = await transportHandler.handle(String(init?.body ?? ''), context);
    if (Symbol.asyncIterator in Object(response)) {
      throw new Error('The Phase 11 spike expects a non-streaming JSON-RPC response.');
    }
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'A2A-Extensions': context.activatedExtensions?.join(',') ?? ''
      }
    });
  };

  const factory = new ClientFactory(ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
    transports: [new JsonRpcTransportFactory({ fetchImpl })]
  }));
  const client = await factory.createFromAgentCard(agentCard);
  const request: SendMessageRequest = {
    tenant: '',
    message: {
      messageId: 'msg_h2a_phase11_request',
      contextId: '',
      taskId: '',
      role: Role.ROLE_USER,
      parts: [{
        content: { $case: 'data', value: { taskEnvelopeId: envelope.task_envelope_id } },
        metadata: undefined,
        filename: '',
        mediaType: 'application/json'
      }],
      metadata: { [H2A_A2A_EXTENSION_URI]: envelope },
      extensions: [H2A_A2A_EXTENSION_URI],
      referenceTaskIds: []
    },
    configuration: {
      acceptedOutputModes: ['application/json'],
      taskPushNotificationConfig: undefined,
      returnImmediately: false
    },
    metadata: undefined
  };
  const response = await client.sendMessage(request, {
    serviceParameters: ServiceParameters.create(withA2AExtensions(H2A_A2A_EXTENSION_URI))
  });
  if (!('role' in response) || response.role !== Role.ROLE_AGENT) {
    throw new Error('A2A server did not return an agent Message.');
  }

  return {
    protocolVersion: '1.0',
    extensionUri: H2A_A2A_EXTENSION_URI,
    extensionNegotiated: receivedVersion === '1.0' && receivedExtension === H2A_A2A_EXTENSION_URI,
    response
  };
}
