import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = process.cwd();
const registryPath = join(root, 'docs/plan3/CONTROL_REGISTRY.json');
const outputPath = join(root, 'docs/plan5/evidence/phase51/click-budget.json');
const registryText = await readFile(registryPath, 'utf8');
const registry = JSON.parse(registryText);
const requiredControls = ['conductor.advance', 'conductor.cancel', 'conductor.proof.open', 'conductor.control.open'];
for (const controlId of requiredControls) {
  if (!registry.controls.some((control) => control.control_id === controlId)) throw new Error(`PHASE51_CONTROL_MISSING:${controlId}`);
}

const report = {
  schema_version: 1,
  phase: 51,
  generated_from: 'docs/plan3/CONTROL_REGISTRY.json',
  source_registry_sha256: `sha256:${createHash('sha256').update(registryText).digest('hex')}`,
  rules: {
    operator_command: 'One deliberate state-changing click.',
    excluded_required_pause: 'Camera capture, provider login or consent, mutual fingerprint confirmation, independent approval, physical participant action, and external-machine action are counted separately.',
    safe_sequence: 'One Start or Resume consumes every consecutive deterministic host-owned step and stops at the next real boundary.'
  },
  budgets: [
    { action: 'start_demonstration', maximum_operator_commands: 1, control_ids: ['conductor.advance'] },
    { action: 'resume_to_next_real_boundary', maximum_operator_commands: 1, control_ids: ['conductor.advance'] },
    { action: 'open_exact_required_control', maximum_operator_commands: 1, control_ids: ['conductor.control.open'] },
    { action: 'open_named_human_proof', maximum_operator_commands: 1, control_ids: ['conductor.proof.open'], excluded: ['camera capture attempts'] },
    { action: 'cancel_demonstration', maximum_operator_commands: 1, control_ids: ['conductor.cancel'] },
    { action: 'export_verify_and_tamper_negative_after_final_resume', maximum_operator_commands: 0, control_ids: ['conductor.advance'], note: 'Consecutive safe steps run in the same host command.' }
  ],
  prohibited: ['skip control', 'manual pass control', 'renderer-local completion', 'pre-populated success', 'manual JSON federation handshake in the simplified path'],
  automated_contract_status: 'passed',
  operator_measurement_status: 'required'
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes('--verify')) {
  if (await readFile(outputPath, 'utf8') !== serialized) throw new Error('PHASE51_CLICK_BUDGET_CHANGED');
  process.stdout.write(`H2A_PHASE51_CLICK_BUDGET_OK ${report.budgets.length} budgets\n`);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, 'utf8');
  process.stdout.write(`H2A_PHASE51_CLICK_BUDGET_WRITTEN ${report.budgets.length} budgets\n`);
}
