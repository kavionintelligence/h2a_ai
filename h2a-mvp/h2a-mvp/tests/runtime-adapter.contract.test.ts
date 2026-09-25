import { describe, expect, it } from 'vitest';
import {
  DisabledBedrockRuntime,
  DisabledLiveCliRuntime,
  RuntimeAdapterUnavailableError,
  ScriptedWorkplaceRuntime,
  type AgentRuntimePort
} from '../packages/agents/src/runtimeAdapters';
import {
  AdapterRegistry,
  UnsupportedAdapterModeError,
  demoWorkplaceSnapshot,
  runtimeExecutionResultSchema,
  type RuntimeExecutionRequest
} from '@h2a/contracts';

const assignment = demoWorkplaceSnapshot.assignments[0];
const request: RuntimeExecutionRequest = {
  executionId: 'exec_contract_test',
  scenarioRunId: 'run_contract_test',
  stepId: 'step_contract_test',
  traceId: 'trace_contract_test',
  agent: {
    runtimeId: demoWorkplaceSnapshot.agents[0].id,
    passportId: demoWorkplaceSnapshot.agents[0].passportId,
    name: demoWorkplaceSnapshot.agents[0].name,
    role: demoWorkplaceSnapshot.agents[0].role,
    provider: demoWorkplaceSnapshot.agents[0].provider,
    model: demoWorkplaceSnapshot.agents[0].model
  },
  assignment,
  mandateId: assignment.mandateId,
  action: assignment.requestedAction ?? 'records.read',
  resource: 'sandbox.enterprise-records',
  disclosedContext: { recordId: 'sandbox:record-1' },
  profile: 'success'
};

function assertSharedContract(runtime: AgentRuntimePort): void {
  expect(runtime.descriptor.mode).toMatch(/scripted-workplace|live-cli|bedrock/);
  expect(typeof runtime.execute).toBe('function');
}

describe('agent runtime port contract', () => {
  it('executes the deterministic adapter without credentials', async () => {
    const runtime = new ScriptedWorkplaceRuntime(() => new Date('2026-08-20T12:00:00.000Z'));
    assertSharedContract(runtime);

    const result = await runtime.execute(request);
    expect(runtime.descriptor).toMatchObject({ available: true, requiresCredentials: false });
    expect(runtimeExecutionResultSchema.parse(result)).toMatchObject({
      executionId: request.executionId,
      adapterMode: 'scripted-workplace',
      status: 'complete',
      resultCode: 'SCRIPTED_EXECUTION_COMPLETE'
    });
  });

  it.each([
    ['live-cli', new DisabledLiveCliRuntime()],
    ['bedrock', new DisabledBedrockRuntime()]
  ] as const)('keeps the %s port contract-compatible and truthfully disabled', async (_mode, runtime) => {
    assertSharedContract(runtime);
    expect(runtime.descriptor).toMatchObject({ available: false, requiresCredentials: true });
    await expect(runtime.execute(request)).rejects.toBeInstanceOf(RuntimeAdapterUnavailableError);
  });
});

describe('feature mode adapter registry', () => {
  it('selects a registered adapter without changing its consumer contract', () => {
    const registry = new AdapterRegistry<'local-file' | 'backend-api', string, { root: string }>()
      .register('local-file', ({ root }) => `local:${root}`);

    expect(registry.create('local-file', { root: 'data/h2a-demo' })).toBe('local:data/h2a-demo');
    expect(() => registry.create('backend-api', { root: 'unused' })).toThrow(UnsupportedAdapterModeError);
  });
});
