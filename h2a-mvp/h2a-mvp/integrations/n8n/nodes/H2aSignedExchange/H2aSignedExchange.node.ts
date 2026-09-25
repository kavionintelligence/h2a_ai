import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class H2aSignedExchange implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'H2A Signed Exchange',
    name: 'h2aSignedExchange',
    group: ['transform'],
    version: 1,
    description: 'Forwards an H2A signed task or context frame to a loopback H2A-compatible worker.',
    defaults: { name: 'H2A Signed Exchange' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      { displayName: 'Worker Endpoint', name: 'endpoint', type: 'string', default: 'http://127.0.0.1:8787/h2a/exchange', required: true },
      { displayName: 'Bearer Token', name: 'bearerToken', type: 'string', typeOptions: { password: true }, default: '' }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const output: INodeExecutionData[] = [];
    for (let index = 0; index < this.getInputData().length; index += 1) {
      const endpoint = new URL(this.getNodeParameter('endpoint', index) as string);
      if (endpoint.protocol !== 'https:' && !['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname)) {
        throw new NodeOperationError(this.getNode(), 'Remote H2A worker endpoints require HTTPS.', { itemIndex: index });
      }
      if (endpoint.username || endpoint.password) {
        throw new NodeOperationError(this.getNode(), 'Credentials must not be embedded in the endpoint URL.', { itemIndex: index });
      }
      const token = this.getNodeParameter('bearerToken', index) as string;
      const response = await this.helpers.httpRequest({
        method: 'POST', url: endpoint.toString(), json: true,
        headers: { 'x-h2a-protocol-version': '1.0', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: this.getInputData()[index].json,
        timeout: 10_000,
        returnFullResponse: false
      });
      if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new NodeOperationError(this.getNode(), 'H2A worker returned an invalid object.', { itemIndex: index });
      }
      output.push({ json: response as IDataObject, pairedItem: { item: index } });
    }
    return [output];
  }
}
