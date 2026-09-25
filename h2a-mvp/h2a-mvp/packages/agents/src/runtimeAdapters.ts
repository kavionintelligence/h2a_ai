import {
  runtimeExecutionRequestSchema,
  runtimeExecutionResultSchema,
  type RuntimeAdapterDescriptor,
  type RuntimeExecutionRequest,
  type RuntimeExecutionResult
} from '@h2a/contracts';

export interface AgentRuntimePort {
  readonly descriptor: RuntimeAdapterDescriptor;
  execute(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult>;
}

export class RuntimeAdapterUnavailableError extends Error {
  public constructor(public readonly mode: RuntimeAdapterDescriptor['mode']) {
    super(`${mode} execution is disabled in the local MVP.`);
    this.name = 'RuntimeAdapterUnavailableError';
  }
}

export class ScriptedWorkplaceRuntime implements AgentRuntimePort {
  public readonly descriptor: RuntimeAdapterDescriptor = {
    mode: 'scripted-workplace',
    label: 'H2A deterministic runtime',
    available: true,
    requiresCredentials: false,
    description: 'Local deterministic execution through the same authority and evidence contracts as future providers.'
  };

  public constructor(private readonly clock: () => Date = () => new Date()) {}

  public async execute(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    const input = runtimeExecutionRequestSchema.parse(request);
    const startedAt = this.clock().toISOString();
    const virtualDurationMs = 240 + stableDuration(input.stepId);
    const status = input.profile === 'failure' ? 'failed' as const : input.profile === 'timeout' ? 'timed-out' as const : 'complete' as const;
    const resultCode = status === 'complete' ? 'SCRIPTED_EXECUTION_COMPLETE' : status === 'failed' ? 'SCRIPTED_EXECUTION_FAILED' : 'SCRIPTED_EXECUTION_TIMEOUT';
    const output = status === 'complete'
      ? `${input.agent.name} completed ${input.assignment.title}. Evaluated ${input.action} on ${input.resource} with ${Object.keys(input.disclosedContext).length} disclosed field(s).`
      : status === 'failed'
        ? `${input.agent.name} stopped after a deterministic provider failure while processing ${input.assignment.title}.`
        : `${input.agent.name} exceeded the deterministic ${virtualDurationMs} ms execution budget for ${input.assignment.title}.`;
    return runtimeExecutionResultSchema.parse({
      executionId: input.executionId,
      adapterMode: 'scripted-workplace',
      status,
      output,
      resultCode,
      startedAt,
      completedAt: this.clock().toISOString(),
      virtualDurationMs
    });
  }
}

export class DisabledLiveCliRuntime implements AgentRuntimePort {
  public readonly descriptor: RuntimeAdapterDescriptor = {
    mode: 'live-cli',
    label: 'Live CLI adapter',
    available: false,
    requiresCredentials: true,
    description: 'Contract-compatible CLI execution boundary; process launch remains disabled for V0.'
  };
  public async execute(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    runtimeExecutionRequestSchema.parse(request);
    throw new RuntimeAdapterUnavailableError(this.descriptor.mode);
  }
}

export class DisabledBedrockRuntime implements AgentRuntimePort {
  public readonly descriptor: RuntimeAdapterDescriptor = {
    mode: 'bedrock',
    label: 'AWS Bedrock adapter',
    available: false,
    requiresCredentials: true,
    description: 'Contract-compatible Bedrock execution boundary; AWS calls remain disabled for V0.'
  };
  public async execute(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    runtimeExecutionRequestSchema.parse(request);
    throw new RuntimeAdapterUnavailableError(this.descriptor.mode);
  }
}

function stableDuration(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 760;
}
