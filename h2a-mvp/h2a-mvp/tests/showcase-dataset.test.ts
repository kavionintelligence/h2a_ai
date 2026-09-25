import { execFile } from 'node:child_process';
import { verify } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  authorityEventRecordSchema,
  employmentMembershipSchema,
  goalWorkGraphStateSchema,
  humanIdentityV2Schema,
  mandateSchema,
  organizationSchema,
  projectDeliveryStateSchema,
  reviewedMemorySchema,
  workspaceRoomSchema
} from '@h2a/contracts';
import { canonicalize, hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execute = promisify(execFile);

describe('synthetic showcase dataset', () => {
  let temporaryRoot = '';
  let showcaseRoot = '';

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'h2a-showcase-'));
    showcaseRoot = path.join(temporaryRoot, 'dataset');
    await execute(process.execPath, [path.join(process.cwd(), 'scripts', 'create-showcase-demo.mjs'), '--target', showcaseRoot], {
      cwd: process.cwd(), maxBuffer: 1024 * 1024
    });
  }, 60_000);

  afterAll(async () => {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('creates a visibly synthetic multi-team workspace without acceptance claims', async () => {
    const manifest = await json('SHOWCASE.json');
    expect(manifest.synthetic).toBe(true);
    expect(manifest.acceptance_evidence).toBe(false);
    expect(manifest.counts).toEqual({
      synthetic_people: 14, rooms: 6, memory_records: 18, projects: 6,
      missions: 6, work_nodes: 24, mandates: 24, trace_events: 48
    });

    const organizations = (await json('organizations/registry-v2.json')).data.map((item: unknown) => organizationSchema.parse(item));
    const memberships = (await json('organizations/memberships-v2.json')).data.map((item: unknown) => employmentMembershipSchema.parse(item));
    const humans = (await json('humans/identities-v2.json')).data.map((item: unknown) => humanIdentityV2Schema.parse(item));
    expect(organizations[0].name).toContain('(Synthetic)');
    expect(memberships.filter((item: { membership_id: string }) => item.membership_id.startsWith('membership_demo')).length).toBe(14);
    expect(humans.filter((item: { display_name: string }) => item.display_name.startsWith('[DEMO]')).length).toBe(14);
  });

  it('validates signed rooms, reviewed memory, delivery records, graphs, and mandates', async () => {
    const publicKey = (await json('settings/organization-signing-key-v2.json')).data.public_key_pem;
    const workspace = (await json('workspace/employee-workspace-v1.json')).data;
    workspace.data.rooms.forEach((item: unknown) => workspaceRoomSchema.parse(item));
    workspace.data.memory.forEach((item: unknown) => reviewedMemorySchema.parse(item));
    expect(workspace.data.rooms).toHaveLength(6);
    expect(workspace.data.memory).toHaveLength(18);
    expect(workspace.data.memory.every((item: { title: string; body: string; content_hash: string }) =>
      item.content_hash === hashCanonical({ title: item.title, body: item.body })
    )).toBe(true);
    expect(workspace.data.rooms.every((room: { project_ids?: string[]; goal_ids?: string[] }) => room.project_ids?.length === 1 && room.goal_ids?.length === 1)).toBe(true);
    expect(workspace.canonicalHash).toBe(hashCanonical(workspace.data));
    expect(verify(null, Buffer.from(canonicalize(workspace.data)), publicKey, Buffer.from(workspace.signature.slice('ed25519:'.length), 'base64'))).toBe(true);
    const ledger = new LocalAuthorityEventLedger(showcaseRoot);
    expect(await ledger.verify()).toMatchObject({ status: 'verified' });
    const commit = (await ledger.list()).filter((event) => event.event_type === 'ACTION_EXECUTED' && event.payload.operation === 'workspace.commit').at(-1);
    expect(commit?.payload).toMatchObject({
      revision: workspace.data.revision,
      state_hash: workspace.canonicalHash,
      synthetic_showcase: true,
      acceptance_eligible: false
    });

    const delivery = projectDeliveryStateSchema.parse((await json('projects/project-delivery.json')).data);
    expect(delivery.projects).toHaveLength(6);
    expect(delivery.assignments).toHaveLength(24);
    expect(delivery.validations.length).toBeGreaterThanOrEqual(18);

    const graphState = goalWorkGraphStateSchema.parse({ ...(await json('projects/goal-work-graphs-v1.json')).data, candidates: [] });
    expect(graphState.graphs).toHaveLength(6);
    expect(graphState.graphs.flatMap((graph) => graph.nodes)).toHaveLength(24);
    expect(graphState.graphs.flatMap((graph) => graph.nodes).every((node) =>
      node.allowed_context_fields.every((field) => !node.withheld_context_fields.includes(field))
    )).toBe(true);
    expect(graphState.graphs.some((graph) => graph.status === 'blocked' && graph.approval_checkpoints.some((checkpoint) => checkpoint.status === 'pending'))).toBe(true);

    const mandates = (await json('mandates/registry.json')).data.map((item: unknown) => mandateSchema.parse(item));
    const showcaseMandates = mandates.filter((item: { mandateId: string }) => item.mandateId.startsWith('mnd_demo'));
    expect(showcaseMandates).toHaveLength(24);
    expect(showcaseMandates.every((item: { resources: string[]; prohibitedActions: string[] }) =>
      item.resources.length === 1 && item.resources[0].startsWith('showcase.project.') && item.prohibitedActions.includes('credential.read')
    )).toBe(true);
  });

  it('keeps every synthetic trace hash-chained and ineligible for acceptance', async () => {
    const traceFiles = (await readdir(path.join(showcaseRoot, 'traces'))).filter((name) => name.startsWith('tr_showcase_') && name.endsWith('.jsonl'));
    expect(traceFiles).toHaveLength(6);
    let total = 0;
    for (const traceFile of traceFiles) {
      const records = (await readFile(path.join(showcaseRoot, 'traces', traceFile), 'utf8')).trim().split('\n').map((line) => authorityEventRecordSchema.parse(JSON.parse(line)));
      expect(records).toHaveLength(8);
      let previousHash: string | null = null;
      for (const record of records) {
        const { event_hash: eventHash, ...unsigned } = record;
        expect(record.previous_hash).toBe(previousHash);
        expect(hashCanonical(unsigned)).toBe(eventHash);
        expect(record.payload.synthetic_showcase).toBe(true);
        expect(record.payload.acceptance_eligible).toBe(false);
        expect(['WORK_ASSIGNED', 'WORK_RESPONSE_RECORDED']).toContain(record.event_type);
        previousHash = eventHash;
        total += 1;
      }
    }
    expect(total).toBe(48);
  });

  // Fixture files intentionally cross several independently typed persistence envelopes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function json(relativePath: string): Promise<any> {
    return JSON.parse(await readFile(path.join(showcaseRoot, relativePath), 'utf8'));
  }
});
