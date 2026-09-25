import { readFileSync } from 'node:fs';
import { runLineProtocolAgent } from './index.ts';

const privateKeyPath = process.env.H2A_CONNECTOR_PRIVATE_KEY_PATH;
const brokerPublicKeyPath = process.env.H2A_BROKER_PUBLIC_KEY_PATH;
const connectorManifestId = process.env.H2A_CONNECTOR_MANIFEST_ID;
if (!privateKeyPath || !brokerPublicKeyPath || !connectorManifestId) throw new Error('Sample connector environment is incomplete.');

let executionCount = 0;
const requestedFields = (process.env.H2A_REQUESTED_FIELDS ?? 'supplier_name,risk_tier').split(',').map((field) => field.trim()).filter(Boolean);
runLineProtocolAgent({
  connectorManifestId,
  privateKeyPem: readFileSync(privateKeyPath, 'utf8'),
  brokerPublicKeyPem: readFileSync(brokerPublicKeyPath, 'utf8'),
  requestedFields: () => requestedFields,
  handleTask: async (task, context) => {
    executionCount += 1;
    return { execution_count: executionCount, objective: task.objective, authorized_context: context };
  }
});
