import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { buildDemo } from '../scripts/build-demo.mjs';
import { root, h2a, census, pythonRuntime, waitFor, stopChild } from '../scripts/demo-runtime.mjs';

const fleetAgents = [
  ['marketing-research', 'Marketing Research Agent'],
  ['product-intelligence', 'Product Intelligence Agent'],
  ['customer-insights', 'Customer Insights Agent'],
  ['compliance-review', 'Compliance Review Agent'],
];

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('real local demo fleet is discovered by Census and governed through the browser', { timeout: 180000 }, async t => {
  await buildDemo();
  const require = createRequire(join(h2a, 'package.json'));
  const { chromium } = require('playwright');
  const executablePath = [process.env.DEMO_BROWSER, chromium.executablePath(),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(path => path && existsSync(path));
  assert.ok(executablePath, 'Install Playwright Chromium or set DEMO_BROWSER.');

  // This is the same executable fleet as npm run demo:agents. Its A2A responses
  // and real simulation telemetry pass through the native Census collectors.
  // Only storage, ports, and environment are isolated; no discovery fixtures or
  // direct database inserts are used, and presenter data is never touched.
  const artifacts = join(root, '.test-artifacts', `demo-fleet-${randomUUID()}`);
  await mkdir(artifacts, { recursive: true });
  const envFile = join(artifacts, 'empty.env');
  await writeFile(envFile, '');
  const port = await freePort(), censusPort = await freePort(), fleetPort = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const censusUrl = `http://127.0.0.1:${censusPort}`;
  const fleetUrl = `http://127.0.0.1:${fleetPort}`;
  const python = pythonRuntime();
  const env = { ...python.env };
  for (const key of Object.keys(env)) if (key.startsWith('CENSUS_')) delete env[key];
  const token = randomBytes(32).toString('hex');
  Object.assign(env, { PORT: String(port), GOVERNANCE_BRIDGE_TOKEN: token,
    CENSUS_API_TOKEN: token, CENSUS_API_URL: censusUrl,
    GOVERNANCE_DATA_DIR: join(artifacts, 'h2a'), DEMO_DATA_DIR: join(artifacts, 'h2a') });
  const children = [], apiCalls = [], pageErrors = [], consoleErrors = [], failedRequests = [];
  let browser, context, page, serviceLog = '', step = 'startup';
  const launch = (command, args, cwd) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.stdout.on('data', value => serviceLog += value);
    child.stderr.on('data', value => serviceLog += value);
    return child;
  };
  t.after(async () => {
    if (page && !page.isClosed()) await page.screenshot({ path: join(artifacts, 'final-screen.png'), fullPage: true }).catch(() => {});
    if (context) await context.tracing.stop({ path: join(artifacts, 'browser-trace.zip') }).catch(() => {});
    if (browser) await browser.close();
    await Promise.all(children.map(stopChild));
    await writeFile(join(artifacts, 'service.log'), serviceLog);
    await writeFile(join(artifacts, 'browser-evidence.json'), JSON.stringify({ step, executablePath, apiCalls, pageErrors, consoleErrors, failedRequests }, null, 2));
    t.diagnostic(`Actual fleet, Census, governance state, screenshots and browser trace: ${artifacts}`);
  });

  const censusArgs = ['scripts/governance_bridge.py', '--port', String(censusPort),
    '--data-dir', join(artifacts, 'census'), '--env-file', envFile, '--demo-fleet-url', fleetUrl];
  const bridge = launch(python.command, censusArgs, census);
  await waitFor(`${censusUrl}/health`, bridge);
  const fleet = launch(python.command, ['scripts/demo_agent_fleet.py', '--port', String(fleetPort), '--census-url', censusUrl], census);
  await waitFor(`${fleetUrl}/health`, fleet);
  const health = await (await fetch(`${fleetUrl}/health`)).json();
  assert.equal(health.agent_count, 4);
  assert.equal(health.telemetry_ready, true, 'Every running agent must have emitted accepted native runtime observations.');
  assert.equal(health.simulation, true);
  const cards = [], turns = [];
  for (const [slug, name] of fleetAgents) {
    const response = await fetch(`${fleetUrl}/${slug}/.well-known/agent-card.json`);
    assert.equal(response.status, 200);
    const card = await response.json();
    assert.equal(card.name, name);
    assert.equal(card.url, `${fleetUrl}/${slug}/a2a`);
    assert.match(JSON.stringify(card), /simulat/i, 'Cards must disclose the local simulation.');
    cards.push(card);
    const turnResponse = await fetch(card.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: `live-${slug}`, method: 'message/send',
        params: { message: { kind: 'message', messageId: randomUUID(), role: 'user',
          parts: [{ kind: 'text', text: 'Research the Q4 product launch demonstration.' }] } } }),
    });
    assert.equal(turnResponse.status, 200);
    const turn = await turnResponse.json();
    assert.equal(turn.result.kind, 'task');
    assert.equal(turn.result.status.state, 'completed');
    const result = turn.result.artifacts[0].parts[0].data;
    assert.equal(result.agent_name, name);
    assert.equal(result.simulation, true);
    assert.equal(result.telemetry_published, true);
    assert.ok(result.count > 0);
    assert.equal(result.sources.length, result.count);
    turns.push(turn);
  }
  await writeFile(join(artifacts, 'live-agent-cards.json'), JSON.stringify(cards, null, 2));
  await writeFile(join(artifacts, 'live-agent-turns.json'), JSON.stringify(turns, null, 2));
  let api = launch(process.execPath, [join(h2a, '.governance-dist/server.mjs')], h2a);
  try { await waitFor(`${origin}/api/state`, api); }
  catch (error) { throw new Error(`${error.message}\n${serviceLog}`); }

  browser = await chromium.launch({ executablePath, headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
  await context.tracing.start({ screenshots: true, snapshots: true });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/')) apiCalls.push({ method: response.request().method(), path, status: response.status() });
  });
  const snapshot = async () => {
    const response = await page.request.get(`${origin}/api/state`);
    assert.equal(response.status(), 200);
    return response.json();
  };
  async function clickCommand(testId, path, scope = page) {
    step = testId;
    const completed = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === path);
    await scope.getByTestId(testId).click();
    const response = await completed;
    assert.equal(response.status(), 200, `${testId}: ${await response.text()}`);
    await page.locator('.g-working').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('alert').count(), 0);
    return response.json();
  }
  const screenshot = name => page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true });
  const imported = (state, censusId) => state.agents.find(agent => agent.census_agent_id === censusId);
  let scan;
  async function scanFresh() {
    await page.getByTestId('nav-discovery').click();
    await page.getByTestId('discovery-ready').waitFor();
    assert.equal(await page.getByTestId('census-inventory').count(), 0);
    scan = await clickCommand('run-discovery', '/api/discovery/scan');
    assert.equal(scan.agents.length, 4);
    for (const entity of scan.agents) await page.getByTestId(`census-row-${entity.agent_id}`).waitFor();
    return scan;
  }
  async function onboard(censusId) {
    await page.getByTestId(`inspect-${censusId}`).click();
    const inspector = page.getByTestId('census-inspector');
    const state = await clickCommand(`register-h2a-${censusId}`, '/api/discovery/import', inspector);
    const agent = imported(state, censusId);
    assert.ok(agent);
    assert.notEqual(agent.agent_id, censusId);
    assert.equal(agent.governance_status, 'Registered');
    assert.equal(agent.discovery_snapshot.shadow, true);
    await inspector.getByTestId(`view-registry-${censusId}`).click();
    assert.equal(await page.getByTestId('issue-passport').isDisabled(), true);
    assert.equal(await page.getByTestId('assign-mandate').isDisabled(), true);
    await page.getByLabel('Human owner', { exact: true }).selectOption('HUM-PRIYA');
    let current = await clickCommand('bind-human', `/api/agents/${agent.agent_id}/bind`);
    assert.equal(imported(current, censusId).binding.human_id, 'HUM-PRIYA');
    await page.reload();
    await page.getByTestId('agent-id').waitFor();
    assert.equal(await page.getByTestId('agent-id').innerText(), agent.agent_id);
    assert.match(await page.getByLabel('Selected agent trust context').innerText(), /Priya Sharma/);
    current = await clickCommand('issue-passport', `/api/agents/${agent.agent_id}/passport`);
    assert.equal(imported(current, censusId).passport.binding_id, imported(current, censusId).binding.binding_id);
    current = await clickCommand('assign-mandate', `/api/agents/${agent.agent_id}/mandate`);
    assert.equal(imported(current, censusId).governance_status, 'Managed');
    return imported(current, censusId);
  }

  await page.goto(origin);
  await page.getByTestId('discovery-ready').waitFor();
  assert.equal(apiCalls.filter(call => call.path === '/api/discovery/scan').length, 0);
  assert.equal((await snapshot()).agents.length, 0);
  scan = await clickCommand('run-discovery', '/api/discovery/scan');
  assert.deepEqual(new Set(scan.agents.map(agent => agent.name)), new Set(fleetAgents.map(([, name]) => name)));
  assert.equal(new Set(scan.agents.map(agent => agent.agent_id)).size, 4);
  for (const entity of scan.agents) {
    assert.equal(entity.classification.is_agent, true);
    assert.equal(entity.shadow, true);
    assert.equal(entity.registered, false);
    assert.equal(entity.framework, 'H2A Demo Runtime (simulated)');
    assert.equal(entity.model, 'simulated:deterministic-planner');
    assert.equal(entity.provider, 'Local simulation');
    assert.ok(entity.endpoint.startsWith(fleetUrl));
    assert.ok(entity.discovery_history.length > 0);
    assert.match(JSON.stringify(entity.evidence), /demo_runtime_simulation|simulation/);
    await page.getByTestId(`census-row-${entity.agent_id}`).waitFor();
    assert.match(await page.getByTestId(`census-row-${entity.agent_id}`).innerText(), /Shadow/);
  }
  assert.equal((await snapshot()).agents.length, 0, 'A native scan must not import any of the four agents.');
  await writeFile(join(artifacts, 'native-four-agent-scan.json'), JSON.stringify(scan, null, 2));
  await screenshot('01-four-live-shadow-agents');
  const marketingCensusId = scan.agents.find(agent => agent.name === 'Marketing Research Agent').agent_id;
  const peerCensusIds = fleetAgents.slice(1).map(([, name]) => scan.agents.find(agent => agent.name === name).agent_id);
  await page.reload();
  await page.getByTestId('discovery-ready').waitFor();
  assert.equal(await page.getByTestId('census-inventory').count(), 0, 'Reload must not restore old discovery results.');
  scan = await clickCommand('run-discovery', '/api/discovery/scan');
  assert.equal(scan.agents.find(agent => agent.name === 'Marketing Research Agent').agent_id, marketingCensusId);
  const marketing = await onboard(marketingCensusId);
  assert.equal((await snapshot()).agents.length, 1);
  await screenshot('02-marketing-under-governance');
  const peers = [];
  for (const censusId of peerCensusIds) {
    await scanFresh();
    peers.push(await onboard(censusId));
  }
  const governed = await snapshot();
  assert.equal(governed.agents.length, 4);
  assert.deepEqual(new Set(governed.agents.map(agent => agent.census_agent_id)), new Set([marketingCensusId, ...peerCensusIds]));
  for (const agent of governed.agents) {
    assert.equal(agent.governance_status, 'Managed');
    assert.equal(agent.binding.human_id, 'HUM-PRIYA');
    assert.equal(agent.passport.agent_id, agent.agent_id);
    assert.equal(agent.passport.binding_id, agent.binding.binding_id);
    assert.equal(agent.mandate.agent_id, agent.agent_id);
    await page.getByTestId(`registry-row-${agent.agent_id}`).waitFor();
  }
  await screenshot('02b-all-four-agents-governed');
  await page.getByTestId(`select-registry-${marketing.agent_id}`).click();
  await page.getByTestId('nav-room').click();
  for (const peer of peers) await page.getByTestId(`room-peer-${peer.agent_id}`).check();
  let state = await clickCommand('create-room', '/api/rooms');
  const room = state.rooms.find(room => room.name === 'Q4 Product Launch Research');
  assert.deepEqual(new Set(room.agent_ids), new Set([marketing.agent_id, ...peers.map(peer => peer.agent_id)]));
  assert.deepEqual(room.human_ids, ['HUM-PRIYA']);
  assert.equal(state.agents.length, 4, 'Room creation must use the four explicitly imported identities.');
  for (const [, name] of fleetAgents) assert.ok((await page.locator('.g-participants').innerText()).includes(name));
  const actionsPath = `/api/rooms/${room.room_id}/actions`;
  state = await clickCommand('action-web-search', actionsPath);
  const research = state.actions.find(action => action.action === 'web_search');
  assert.equal(research.agent_id, marketing.agent_id);
  assert.equal(research.decision, 'ALLOWED');
  assert.equal(research.status, 'executed');
  assert.equal(research.execution_count, 1);
  assert.equal(research.result.products.length, 5);
  state = await clickCommand('action-crm-write', actionsPath);
  const denied = state.actions.find(action => action.action === 'crm_write');
  assert.equal(denied.decision, 'DENIED');
  assert.equal(denied.execution_count, 0);
  const actionFor = (current, approval) => current.actions.find(action => action.action_id === approval.action_id);
  state = await clickCommand('action-external-share', actionsPath);
  const rejected = state.approvals.find(approval => approval.status === 'pending');
  assert.equal(actionFor(state, rejected).execution_count, 0);
  assert.equal(actionFor(state, rejected).result, undefined);
  await page.getByTestId('nav-approvals').click();
  await screenshot('03-approval-blocks-execution');
  state = await clickCommand('reject-action', `/api/approvals/${rejected.approval_id}/decision`);
  assert.equal(state.approvals.find(approval => approval.approval_id === rejected.approval_id).status, 'rejected');
  assert.equal(actionFor(state, rejected).execution_count, 0);
  await page.getByTestId('nav-room').click();
  state = await clickCommand('action-external-share', actionsPath);
  const approved = state.approvals.find(approval => approval.status === 'pending');
  assert.equal(actionFor(state, approved).execution_count, 0);
  await page.getByTestId('nav-approvals').click();
  state = await clickCommand('approve-once', `/api/approvals/${approved.approval_id}/decision`);
  assert.equal(state.approvals.find(approval => approval.approval_id === approved.approval_id).status, 'approved');
  assert.equal(actionFor(state, approved).execution_count, 1);
  assert.equal(actionFor(state, approved).status, 'executed');
  await page.getByTestId('nav-room').click();
  state = await clickCommand('propose-memory', `/api/rooms/${room.room_id}/memories`);
  const proposal = state.memories.at(-1);
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.reviewed_by, undefined);
  assert.equal(proposal.source_action_id, research.action_id);
  assert.match(await page.getByTestId(`memory-${proposal.memory_id}`).innerText(), /Unreviewed/);
  await page.getByTestId('edit-approve-memory').click();
  const content = 'Reviewed by Priya Sharma: this competitor pricing evidence comes from the explicitly simulated local demo.';
  await page.getByTestId('memory-edit-content').fill(content);
  state = await clickCommand('save-approve-memory', `/api/memories/${proposal.memory_id}/review`);
  const published = state.memories.find(memory => memory.memory_id === proposal.memory_id);
  assert.equal(published.status, 'published');
  assert.equal(published.reviewed_by, 'HUM-PRIYA');
  assert.equal(published.content, content);
  assert.equal(published.created_by_agent, marketing.agent_id);
  assert.equal(published.passport_id, marketing.passport.passport_id);
  assert.equal(published.mandate_id, marketing.mandate.mandate_id);
  assert.equal(published.room_id, room.room_id);
  assert.equal(published.sources.length, 5);
  assert.ok(published.reviewed_at);
  assert.match(await page.getByTestId(`memory-${proposal.memory_id}`).innerText(), /Trusted company memory/);
  await screenshot('04-reviewed-company-memory');
  await page.getByTestId('nav-trace').click();
  await page.getByTestId('identity-trace').waitFor();
  assert.equal(await page.getByTestId('trace-census-id').innerText(), marketingCensusId);
  assert.ok(await page.getByTestId('census-discovery-history').locator('li').count() > 0);
  const traceResponse = await page.request.get(`${origin}/api/agents/${marketing.agent_id}/trace`);
  assert.equal(traceResponse.status(), 200);
  const trace = await traceResponse.json();
  assert.ok(trace.every(event => event.agent_id === marketing.agent_id));
  assert.equal(await page.getByTestId('identity-trace').locator(':scope > li').count(), trace.length);
  for (const eventType of ['AGENT_REGISTERED_IN_H2A', 'HUMAN_BOUND', 'PASSPORT_ISSUED', 'MANDATE_CREATED',
    'ROOM_JOINED', 'POLICY_ALLOWED', 'HUMAN_APPROVAL_REQUIRED', 'HUMAN_APPROVED', 'HUMAN_REJECTED',
    'ACTION_EXECUTED', 'MEMORY_PROPOSED', 'MEMORY_REVIEWED', 'MEMORY_PUBLISHED']) {
    assert.ok(trace.some(event => event.event_type === eventType), `Missing persisted event ${eventType}`);
  }
  assert.equal(state.integrity.status, 'verified');
  await screenshot('05-complete-identity-trace');

  step = 'backend-restart-persistence';
  await stopChild(api);
  api = launch(process.execPath, [join(h2a, '.governance-dist/server.mjs')], h2a);
  await waitFor(`${origin}/api/state`, api);
  await page.reload();
  await page.getByTestId('identity-trace').waitFor();
  const persisted = await snapshot();
  assert.deepEqual(persisted, state, 'The complete lifecycle must survive a real backend restart.');
  assert.equal(await page.getByTestId('identity-trace').locator(':scope > li').count(), trace.length);
  await scanFresh();
  const finalRow = page.getByTestId(`census-row-${marketingCensusId}`);
  assert.match(await finalRow.innerText(), /Managed/);
  assert.match(await finalRow.innerText(), /Shadow/, 'H2A governance must not rewrite native Census registration evidence.');
  assert.equal((await snapshot()).agents.length, 4);
  for (const censusId of peerCensusIds) {
    assert.match(await page.getByTestId(`census-row-${censusId}`).innerText(), /Managed/);
    assert.match(await page.getByTestId(`census-row-${censusId}`).innerText(), /Shadow/);
  }
  await screenshot('06-discovery-and-governance-status');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.ok(apiCalls.every(call => call.status === 200));
  await writeFile(join(artifacts, 'final-state.json'), JSON.stringify(persisted, null, 2));
  await writeFile(join(artifacts, 'identity-trace.json'), JSON.stringify(trace, null, 2));
  step = 'complete';
});
