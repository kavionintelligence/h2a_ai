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
import { censusTestSources } from './helpers/census-test-sources.mjs';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('browser clicks complete the persisted governance lifecycle and enforce human decisions', { timeout: 180000 }, async t => {
  await buildDemo();
  const require = createRequire(join(h2a, 'package.json'));
  const { chromium } = require('playwright');
  const browserPath = [
    process.env.DEMO_BROWSER,
    chromium.executablePath(),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(path => path && existsSync(path));
  assert.ok(browserPath, 'Install Playwright Chromium or set DEMO_BROWSER to a Chrome/Edge executable.');

  const artifactDir = join(root, '.test-artifacts', `browser-${randomUUID()}`);
  await mkdir(artifactDir, { recursive: true });
  const port = await freePort(), bridgePort = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const token = randomBytes(32).toString('hex');
  const peers = await censusTestSources({ includePeer: true });
  const env = {
    ...process.env, ...peers.env, PORT: String(port), GOVERNANCE_BRIDGE_TOKEN: token,
    CENSUS_API_TOKEN: token, CENSUS_API_URL: `http://127.0.0.1:${bridgePort}`,
    GOVERNANCE_DATA_DIR: join(artifactDir, 'h2a'), DEMO_DATA_DIR: join(artifactDir, 'h2a'),
  };
  let serviceLog = '', browser, context, page, currentStep = 'startup';
  const children = [], pageErrors = [], consoleErrors = [], expectedOutageErrors = [], failedRequests = [], apiCalls = [];
  const launch = (command, args, cwd, extraEnv = {}) => {
    const child = spawn(command, args, { cwd, env: { ...env, ...extraEnv }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.stdout.on('data', value => serviceLog += value);
    child.stderr.on('data', value => serviceLog += value);
    return child;
  };
  t.after(async () => {
    if (page && !page.isClosed()) await page.screenshot({ path: join(artifactDir, 'final-screen.png'), fullPage: true }).catch(() => {});
    if (context) await context.tracing.stop({ path: join(artifactDir, 'browser-trace.zip') }).catch(() => {});
    if (browser) await browser.close();
    await Promise.all(children.map(stopChild));
    await peers.close();
    await writeFile(join(artifactDir, 'service.log'), serviceLog);
    await writeFile(join(artifactDir, 'browser-evidence.json'), JSON.stringify({ currentStep, browserPath, apiCalls, pageErrors, consoleErrors, expectedOutageErrors, failedRequests }, null, 2));
    t.diagnostic(`Browser screenshots, trace, API observations, and state: ${artifactDir}`);
  });

  const python = pythonRuntime();
  let bridge = launch(python.command, ['scripts/governance_bridge.py', '--port', String(bridgePort), '--data-dir', join(artifactDir, 'census')], census, { PYTHONPATH: python.env.PYTHONPATH });
  await waitFor(`http://127.0.0.1:${bridgePort}/health`, bridge);
  await peers.ingest(`http://127.0.0.1:${bridgePort}`, token);
  const api = launch(process.execPath, [join(h2a, '.governance-dist/server.mjs')], h2a);
  try { await waitFor(`${origin}/api/state`, api); }
  catch (error) { throw new Error(`${error.message}\n${serviceLog}`); }

  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (currentStep === 'service-outage' && message.type() === 'error' && message.text().includes('503')) { expectedOutageErrors.push(message.text()); return; }
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: message.location() });
  });
  page.on('requestfailed', request => {
    // React aborts a stale initial/trace read during navigation and reload.
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/api/')) apiCalls.push({ method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() });
  });

  async function state() {
    const response = await page.request.get(`${origin}/api/state`);
    assert.equal(response.status(), 200);
    return response.json();
  }
  async function command(testId, path) {
    currentStep = testId;
    const completed = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === path);
    await page.getByTestId(testId).click();
    const response = await completed;
    assert.equal(response.status(), 200, `${testId}: ${await response.text()}`);
    await page.locator('.g-working').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('alert').count(), 0, `${testId} rendered an application error`);
    return state();
  }
  async function screenshot(name) { await page.screenshot({ path: join(artifactDir, `${name}.png`), fullPage: true }); }
  let agentId;
  async function reload() {
    currentStep = `reload-${new URL(page.url()).hash}`;
    await page.reload();
    await page.getByTestId('agent-id').waitFor();
    assert.equal(await page.getByTestId('agent-id').innerText(), agentId);
    assert.equal(await page.getByRole('alert').count(), 0);
    return state();
  }
  const marketing = snapshot => snapshot.agents.find(agent => agent.agent_id === agentId);
  const actionFor = (snapshot, approval) => snapshot.actions.find(action => action.action_id === approval.action_id);

  await page.goto(origin);
  await page.getByTestId('run-discovery').waitFor();
  await page.getByTestId('discovery-ready').waitFor();
  assert.equal(await page.getByTestId('census-inventory').count(), 0, 'Initial page must not load old discovery results');
  assert.equal(apiCalls.filter(call => call.path === '/api/discovery/scan').length, 0);
  const firstScanResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/discovery/scan');
  await page.getByTestId('run-discovery').click();
  const firstScan = await (await firstScanResponse).json();
  const discovered = firstScan.agents.find(agent => agent.name === 'Marketing Research Agent');
  assert.ok(discovered);
  const censusId = discovered.agent_id;
  assert.equal(discovered.framework, 'CrewAI');
  assert.equal(discovered.shadow, true);
  assert.equal((await state()).agents.length, 0, 'Scanning must not import agents');
  await page.getByTestId('source-warnings').waitFor();
  const row = page.getByTestId(`census-row-${censusId}`);
  await page.getByTestId(`inspect-${censusId}`).click();
  assert.match(await row.innerText(), /Shadow/);
  await page.getByTestId('census-inspector').waitFor();
  assert.match(await page.getByTestId('census-inspector').innerText(), /Test Provider/);
  assert.match(await page.getByTestId('census-inspector').innerText(), /test-model/);
  await screenshot('01-discovery-shadow');
  await page.reload();
  await page.getByTestId('discovery-ready').waitFor();
  assert.equal(await page.getByTestId('census-inventory').count(), 0, 'Refresh must clear Discovery only');
  await page.getByTestId('run-discovery').click();
  await page.getByTestId(`inspect-${censusId}`).click();
  const importResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/discovery/import');
  await page.getByTestId('census-inspector').getByTestId(`register-h2a-${censusId}`).click();
  assert.equal((await importResponse).status(), 200);
  let snapshot = await state();
  const registered = snapshot.agents.find(agent => agent.census_agent_id === censusId);
  agentId = registered.agent_id;
  assert.match(agentId, /^H2A-AGENT-/); assert.notEqual(agentId, censusId);
  assert.equal(registered.governance_status, 'Registered');
  assert.equal(registered.discovery_snapshot.shadow, true);
  await page.getByTestId('census-inspector').getByTestId(`view-registry-${censusId}`).click();
  const agentPath = `/api/agents/${agentId}`;
  assert.equal(await page.getByTestId('issue-passport').isDisabled(), true, 'Passport must wait for binding');
  assert.equal(await page.getByTestId('assign-mandate').isDisabled(), true, 'Mandate must wait for passport');
  await page.getByLabel('Human owner', { exact: true }).selectOption('HUM-PRIYA');
  snapshot = await command('bind-human', `${agentPath}/bind`);
  const binding = marketing(snapshot).binding;
  assert.equal(binding.human_id, 'HUM-PRIYA'); assert.equal(binding.agent_id, agentId);
  snapshot = await reload();
  assert.equal(marketing(snapshot).binding.binding_id, binding.binding_id);
  assert.match(await page.getByLabel('Selected agent trust context').innerText(), /Priya Sharma/);
  snapshot = await command('issue-passport', `${agentPath}/passport`);
  const passport = marketing(snapshot).passport;
  assert.equal(passport.binding_id, binding.binding_id); assert.equal(passport.agent_id, agentId);
  assert.equal(marketing(snapshot).status, 'Managed');
  snapshot = await reload();
  assert.equal(await page.getByTestId('passport-id').innerText(), passport.passport_id);
  snapshot = await command('assign-mandate', `${agentPath}/mandate`);
  const mandate = marketing(snapshot).mandate;
  assert.equal(mandate.agent_id, agentId); assert.deepEqual(mandate.approval_required_actions, ['external_share']);
  snapshot = await reload();
  assert.equal(marketing(snapshot).mandate.mandate_id, mandate.mandate_id);
  await screenshot('02-governed-identity');
  // The optional room peer must be a real Census result, explicitly imported and
  // governed through the same API, never fabricated by room creation.
  const productCensus = firstScan.agents.find(agent => agent.name === 'Product Intelligence Agent');
  assert.ok(productCensus?.classification.is_agent);
  const productImport = await page.request.post(`${origin}/api/discovery/import`, { data: { census_agent_id: productCensus.agent_id, scan_id: firstScan.scan_id } });
  assert.equal(productImport.status(), 200);
  const product = (await productImport.json()).agents.find(agent => agent.census_agent_id === productCensus.agent_id);
  for (const [operation, body] of [['bind', { human_id: 'HUM-PRIYA' }], ['passport', {}], ['mandate', {}]]) {
    const response = await page.request.post(`${origin}/api/agents/${product.agent_id}/${operation}`, { data: body });
    assert.equal(response.status(), 200);
  }
  snapshot = await reload();
  await page.getByTestId('nav-discovery').click();
  await page.getByTestId('discovery-ready').waitFor();
  await page.getByTestId('run-discovery').click();
  assert.match(await page.getByTestId(`census-row-${censusId}`).innerText(), /Managed/);
  assert.match(await page.getByTestId(`census-row-${censusId}`).innerText(), /Shadow/);
  await page.getByTestId('nav-room').click();
  await page.getByTestId(`room-peer-${product.agent_id}`).check();
  snapshot = await command('create-room', '/api/rooms');
  const room = snapshot.rooms.find(item => item.name === 'Q4 Product Launch Research');
  assert.ok(room.human_ids.includes('HUM-PRIYA')); assert.ok(room.agent_ids.includes(agentId));
  assert.deepEqual(new Set(room.agent_ids), new Set([agentId, product.agent_id]), 'Only selected, imported governed agents may join');
  await page.getByRole('heading', { name: room.name, exact: true }).waitFor();
  assert.match(await page.locator('.g-participants').innerText(), /Marketing Research Agent/);
  assert.match(await page.locator('.g-participants').innerText(), /Product Intelligence Agent/);
  snapshot = await reload();
  assert.equal(snapshot.rooms[0].room_id, room.room_id);
  const actionsPath = `/api/rooms/${room.room_id}/actions`;
  snapshot = await command('action-web-search', actionsPath);
  const research = snapshot.actions.find(action => action.agent_id === agentId && action.action === 'web_search');
  assert.equal(research.decision, 'ALLOWED'); assert.equal(research.status, 'executed'); assert.equal(research.execution_count, 1);
  assert.equal(research.result.products.length, 5);
  assert.match(await page.getByTestId(`action-${research.action_id}`).innerText(), /5 competitor products found/);
  snapshot = await command('action-crm-write', actionsPath);
  const denied = snapshot.actions.find(action => action.action === 'crm_write');
  assert.equal(denied.decision, 'DENIED'); assert.equal(denied.execution_count, 0);
  await screenshot('03-room-research-and-denial');

  snapshot = await command('action-external-share', actionsPath);
  let approval = snapshot.approvals.find(item => item.status === 'pending');
  assert.ok(approval); assert.equal(actionFor(snapshot, approval).execution_count, 0);
  assert.equal(actionFor(snapshot, approval).result, undefined);
  await page.getByTestId('nav-approvals').click();
  let approvalCard = page.getByTestId(`approval-${approval.approval_id}`);
  assert.match(await approvalCard.innerText(), /Human Approval Required/);
  assert.match(await approvalCard.getByTestId('execution-count').innerText(), /0/);
  snapshot = await reload();
  assert.equal(actionFor(snapshot, approval).execution_count, 0);
  await screenshot('04-approval-blocked');
  snapshot = await command('reject-action', `/api/approvals/${approval.approval_id}/decision`);
  assert.equal(snapshot.approvals.find(item => item.approval_id === approval.approval_id).status, 'rejected');
  assert.equal(actionFor(snapshot, approval).execution_count, 0);
  const rejectedApprovalId = approval.approval_id;
  await page.getByTestId('nav-room').click();
  snapshot = await command('action-external-share', actionsPath);
  approval = snapshot.approvals.find(item => item.status === 'pending');
  assert.ok(approval); assert.notEqual(approval.approval_id, rejectedApprovalId);
  assert.equal(actionFor(snapshot, approval).execution_count, 0);
  await page.getByTestId('nav-approvals').click();
  snapshot = await command('approve-once', `/api/approvals/${approval.approval_id}/decision`);
  assert.equal(snapshot.approvals.find(item => item.approval_id === approval.approval_id).status, 'approved');
  assert.equal(actionFor(snapshot, approval).execution_count, 1);
  assert.equal(actionFor(snapshot, approval).status, 'executed');
  snapshot = await reload();
  assert.equal(actionFor(snapshot, approval).execution_count, 1);
  approvalCard = page.getByTestId(`approval-${approval.approval_id}`);
  assert.match(await approvalCard.getByTestId('execution-count').innerText(), /1/);
  await screenshot('05-human-approved-action');

  await page.getByTestId('nav-room').click();
  snapshot = await command('propose-memory', `/api/rooms/${room.room_id}/memories`);
  const proposal = snapshot.memories.at(-1);
  assert.equal(proposal.status, 'proposed'); assert.equal(proposal.source_action_id, research.action_id);
  assert.equal(proposal.reviewed_by, undefined); assert.equal(proposal.sources.length, 5);
  let memoryCard = page.getByTestId(`memory-${proposal.memory_id}`);
  await memoryCard.waitFor();
  assert.match(await memoryCard.innerText(), /Unreviewed/);
  await screenshot('06-proposed-unreviewed-memory');
  snapshot = await reload();
  assert.equal(snapshot.memories.find(memory => memory.memory_id === proposal.memory_id).status, 'proposed');
  await page.getByTestId('edit-approve-memory').click();
  const reviewedContent = 'Reviewed by Priya: Competitor X uses tiered per-seat pricing. Validate the simulated $29 Starter and $79 Pro evidence before making a real pricing decision.';
  await page.getByTestId('memory-edit-content').fill(reviewedContent);
  snapshot = await command('save-approve-memory', `/api/memories/${proposal.memory_id}/review`);
  const published = snapshot.memories.find(memory => memory.memory_id === proposal.memory_id);
  assert.equal(published.status, 'published'); assert.equal(published.content, reviewedContent);
  assert.equal(published.reviewed_by, 'HUM-PRIYA'); assert.ok(published.reviewed_at);
  assert.notEqual(published.content_hash, proposal.content_hash);
  assert.equal(published.created_by_agent, agentId); assert.equal(published.passport_id, passport.passport_id);
  assert.equal(published.mandate_id, mandate.mandate_id); assert.equal(published.room_id, room.room_id);
  snapshot = await reload();
  assert.deepEqual(snapshot.memories.find(memory => memory.memory_id === proposal.memory_id), published);
  memoryCard = page.getByTestId(`memory-${proposal.memory_id}`);
  assert.match(await memoryCard.innerText(), /Trusted company memory/);
  assert.match(await memoryCard.innerText(), /Priya Sharma/);
  assert.equal(await page.getByTestId('approve-memory').count(), 0);
  await screenshot('07-reviewed-company-memory');

  await page.getByTestId('nav-room').click();
  snapshot = await command('propose-memory', `/api/rooms/${room.room_id}/memories`);
  const plainProposal = snapshot.memories.at(-1);
  assert.equal(plainProposal.status, 'proposed'); assert.equal(plainProposal.reviewed_by, undefined);
  assert.equal(snapshot.memories.filter(memory => memory.status === 'published').length, 1, 'New proposals must not inherit trust');
  assert.match(await page.getByTestId(`memory-${plainProposal.memory_id}`).innerText(), /Unreviewed/);
  snapshot = await command('approve-memory', `/api/memories/${plainProposal.memory_id}/review`);
  const plainPublished = snapshot.memories.find(memory => memory.memory_id === plainProposal.memory_id);
  assert.equal(plainPublished.status, 'published'); assert.equal(plainPublished.reviewed_by, 'HUM-PRIYA');
  assert.equal(plainPublished.content, plainProposal.content); assert.equal(plainPublished.content_hash, plainProposal.content_hash);
  assert.ok(plainPublished.reviewed_at);
  snapshot = await reload();
  assert.deepEqual(snapshot.memories.find(memory => memory.memory_id === plainProposal.memory_id), plainPublished);

  await page.getByTestId('nav-room').click();
  snapshot = await command('propose-memory', `/api/rooms/${room.room_id}/memories`);
  const rejectedProposal = snapshot.memories.at(-1);
  assert.equal(rejectedProposal.status, 'proposed'); assert.equal(rejectedProposal.reviewed_by, undefined);
  assert.equal(snapshot.memories.filter(memory => memory.status === 'published').length, 2);
  snapshot = await command('reject-memory', `/api/memories/${rejectedProposal.memory_id}/review`);
  const rejectedMemory = snapshot.memories.find(memory => memory.memory_id === rejectedProposal.memory_id);
  assert.equal(rejectedMemory.status, 'rejected'); assert.equal(rejectedMemory.reviewed_by, 'HUM-PRIYA');
  assert.equal(snapshot.memories.filter(memory => memory.status === 'published').length, 2, 'Reject must not publish memory');
  snapshot = await reload();
  assert.deepEqual(snapshot.memories.find(memory => memory.memory_id === rejectedProposal.memory_id), rejectedMemory);
  const rejectedCard = page.getByTestId(`memory-${rejectedProposal.memory_id}`);
  assert.match(await rejectedCard.innerText(), /Rejected.*Not published/);
  assert.doesNotMatch(await rejectedCard.innerText(), /Trusted company memory/);
  assert.equal(await page.getByTestId('approve-memory').count(), 0);
  await screenshot('07b-all-memory-review-decisions');

  currentStep = 'inspect-identity-trace';
  await page.getByTestId('nav-trace').click();
  await page.getByTestId('identity-trace').waitFor();
  assert.equal(await page.getByTestId('trace-census-id').innerText(), censusId);
  assert.ok(await page.getByTestId('census-discovery-history').locator('li').count() > 0, 'Trace includes real persisted Census history');
  const traceResponse = await page.request.get(`${origin}${agentPath}/trace`);
  assert.equal(traceResponse.status(), 200);
  const trace = await traceResponse.json();
  assert.ok(trace.length >= 14); assert.ok(trace.every(event => event.agent_id === agentId));
  assert.equal(await page.getByTestId('identity-trace').locator(':scope > li').count(), trace.length);
  const types = new Set(trace.map(event => event.event_type));
  for (const alternatives of [
    ['AGENT_REGISTERED_IN_H2A'], ['HUMAN_BOUND'], ['PASSPORT_ISSUED'],
    ['MANDATE_CREATED', 'MANDATE_ASSIGNED'], ['ROOM_JOINED'], ['POLICY_ALLOWED', 'ACTION_ALLOWED'],
    ['HUMAN_APPROVAL_REQUIRED', 'APPROVAL_REQUESTED'], ['HUMAN_APPROVED', 'APPROVAL_GRANTED'],
    ['HUMAN_REJECTED', 'APPROVAL_REJECTED'], ['ACTION_EXECUTED'],
    ['MEMORY_PROPOSED'], ['MEMORY_REVIEWED'], ['MEMORY_PUBLISHED'], ['MEMORY_REJECTED'],
  ]) assert.ok(alternatives.some(type => types.has(type)), `Missing persisted trace event ${alternatives.join(' / ')}`);
  assert.equal(trace.filter(event => event.event_type === 'MEMORY_PUBLISHED').length, 2);
  assert.ok(!trace.some(event => event.event_type === 'MEMORY_PUBLISHED' && event.metadata.memory_id === rejectedProposal.memory_id));
  assert.equal(snapshot.integrity.status, 'verified');
  assert.match(await page.getByTestId('identity-trace').innerText(), /Trusted company memory published/);
  await screenshot('08-complete-identity-trace');
  snapshot = await reload();
  await page.getByTestId('identity-trace').waitFor();
  assert.equal(await page.getByTestId('identity-trace').locator(':scope > li').count(), trace.length);

  currentStep = 'mobile-layout';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const viewport = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(viewport.bodyWidth <= viewport.viewportWidth + 1, `Mobile body overflows: ${JSON.stringify(viewport)}`);
  assert.ok(viewport.documentWidth <= viewport.viewportWidth + 1, `Mobile document overflows: ${JSON.stringify(viewport)}`);
  await page.screenshot({ path: join(artifactDir, '09-mobile-trace-390x844.png') });
  await writeFile(join(artifactDir, 'mobile-layout.json'), JSON.stringify(viewport, null, 2));

  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByTestId('nav-discovery').click();
  await page.getByTestId('discovery-ready').waitFor();
  await page.getByTestId('run-discovery').click();
  await page.getByTestId(`census-row-${censusId}`).waitFor();
  assert.match(await page.getByTestId(`census-row-${censusId}`).innerText(), /stale/i, 'Stale entities remain visible');
  assert.match(await page.getByTestId(`census-row-${censusId}`).innerText(), /Managed/, 'Governance and discovery states remain separate');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const discoveryWidth = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (discoveryWidth.document > discoveryWidth.viewport + 1) await writeFile(join(artifactDir, 'overflow-elements.json'), JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(element => element.getBoundingClientRect().right > innerWidth + 1).map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right, overflow: getComputedStyle(element).overflow, width: element.getBoundingClientRect().width }))), null, 2));
  assert.ok(discoveryWidth.document <= discoveryWidth.viewport + 1, `Discovery overflows mobile ${JSON.stringify(discoveryWidth)}`);
  await screenshot('10-mobile-discovery');
  await page.setViewportSize({ width: 1440, height: 1080 });
  currentStep = 'service-outage';
  await stopChild(bridge);
  const outage = page.waitForResponse(response => new URL(response.url()).pathname === '/api/discovery/scan' && response.status() === 503);
  await page.getByTestId('run-discovery').click(); await outage;
  await page.getByTestId('discovery-unavailable').waitFor();
  assert.match(await page.getByTestId('discovery-unavailable').innerText(), /Agent Discovery service unavailable/);
  assert.equal(await page.getByTestId('census-inventory').count(), 0, 'Outage must not show cached results');
  await screenshot('11-service-unavailable');
  bridge = launch(python.command, ['scripts/governance_bridge.py', '--port', String(bridgePort), '--data-dir', join(artifactDir, 'census')], census, { PYTHONPATH: python.env.PYTHONPATH });
  await waitFor(`http://127.0.0.1:${bridgePort}/health`, bridge);
  currentStep = 'service-retry';
  await page.getByTestId('retry-discovery').click();
  await page.getByTestId(`census-row-${censusId}`).waitFor();
  assert.equal((await state()).agents.filter(agent => agent.census_agent_id === censusId).length, 1);

  assert.deepEqual(pageErrors, [], 'Browser JavaScript exceptions');
  assert.deepEqual(failedRequests, [], 'Failed browser network requests');
  assert.deepEqual(consoleErrors, [], 'Browser console errors');
  assert.ok(apiCalls.filter(call => call.method === 'POST').length >= 17);
  assert.ok(apiCalls.every(call => call.status === 200 || (call.path === '/api/discovery/scan' && call.status === 503)), 'Only intentional service outage may fail');
  await writeFile(join(artifactDir, 'final-state.json'), JSON.stringify(snapshot, null, 2));
  currentStep = 'complete';
});
