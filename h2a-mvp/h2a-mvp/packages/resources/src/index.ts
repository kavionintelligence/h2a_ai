export interface ResourceRequest {
  resourceId: string;
  action: string;
  fields: string[];
  traceId: string;
}

export * from './contextBrokerService';
export * from './contextRecipient';

export interface ResourceResult {
  status: 'complete' | 'denied' | 'failed';
  disclosedFields: string[];
  data?: Record<string, unknown>;
  reason?: string;
}

export interface ResourceAdapterPort {
  execute(request: ResourceRequest): Promise<ResourceResult>;
}

export class SandboxResourceAdapter implements ResourceAdapterPort {
  public async execute(request: ResourceRequest): Promise<ResourceResult> {
    const disclosedFields = [...new Set(request.fields)];
    return {
      status: 'complete',
      disclosedFields,
      data: Object.fromEntries(disclosedFields.map((field) => [field, `sandbox:${request.resourceId}:${field}`]))
    };
  }
}
