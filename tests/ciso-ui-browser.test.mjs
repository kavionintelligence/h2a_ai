import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
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

test('CISO UI completes discovery, authority, approval and joined evidence trace', { timeout: 180000 }, async t => {
  await buildDemo();
  const require = createRequire(join(h2a, 'package.json'));
  const { chromium } = require('playwright');
  const browserPath = [process.env.DEMO_BROWSER, chromium.executablePath(), 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
  assert.ok(browserPath, 'A Chromium browser is required.');

  const artifacts = join(root, '.test-artifacts', `ciso-ui-${randomUUID()}`);
  await mkdir(artifacts, { recursive: true });
  const port = await freePort();
  const bridgePort = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const token = randomBytes(32).toString('hex');
  const sources = await censusTestSources({ includePeer: true });
  const python = pythonRuntime();
  const env = { ...process.env, ...python.env, ...sources.env, BYOSYNC_ENDPOINT_DISCOVERY: '0', PORT: String(port), GOVERNANCE_BRIDGE_TOKEN: token, CENSUS_API_TOKEN: token, CENSUS_API_URL: `http://127.0.0.1:${bridgePort}`, GOVERNANCE_DATA_DIR: join(artifacts, 'h2a'), DEMO_DATA_DIR: join(artifacts, 'h2a') };
  const children = [];
  const launch = (command, args, cwd) => { const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: 'ignore' }); children.push(child); return child; };
  const bridge = launch(python.command, ['scripts/governance_bridge.py', '--port', String(bridgePort), '--data-dir', join(artifacts, 'census')], census);
  await waitFor(`http://127.0.0.1:${bridgePort}/health`, bridge);
  await sources.ingest(`http://127.0.0.1:${bridgePort}`, token);
  const api = launch(process.execPath, [join(h2a, '.governance-dist/server.mjs')], h2a);
  await waitFor(`${origin}/api/state`, api);

  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  t.after(async () => { await page.screenshot({ path: join(artifacts, 'final.png'), fullPage: true }).catch(() => {}); await browser.close(); await Promise.all(children.map(stopChild)); await sources.close(); });

  const postByClick = async (path, button) => {
    const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === path);
    await button.click();
    assert.equal((await response).status(), 200);
  };

  await page.goto(`${origin}/?mode=workspace`);
  await page.getByRole('button',{name:'Security posture',exact:true}).click();
  await page.getByRole('heading',{name:'Know the exposure. Know the limits. Decide.',exact:true}).waitFor();
  assert.match(await page.locator('.sp-metrics').innerText(),/Fleet coverage: unknown/);
  assert.match(await page.locator('.sp-verdict').innerText(),/Workspace evidence/);
  await page.locator('.sp-filters').getByRole('button',{name:'High',exact:true}).click();
  assert.match(await page.locator('.sp-detail').innerText(),/local operator/);
  await page.screenshot({path:join(artifacts,'security-posture.png'),fullPage:true});
  await page.getByRole('button',{name:'Review access configuration',exact:true}).click();
  const securityBrief=page.waitForEvent('download');
  await page.getByRole('button',{name:'Security posture',exact:true}).click();
  await page.getByRole('button',{name:'Export security brief',exact:true}).click();
  assert.match((await securityBrief).suggestedFilename(),/workspace-security-brief/);
  for (const file of ['claude.png', 'gemini.png', 'antigravity.png', 'openai.svg']) {
    const asset = await page.request.get(`${origin}/product-marks/${file}`);
    assert.equal(asset.status(), 200, `Bundled mark is served: ${file}`);
    assert.match(asset.headers()['content-type'], /^image\//);
  }
  await page.getByRole('button', { name: 'Discovery', exact: true }).click();
  await postByClick('/api/discovery/scan', page.getByRole('button', { name: 'Run discovery', exact: true }));
  const marketingRow = page.getByRole('button', { name: /Marketing Research Agent/i }).first();
  await marketingRow.click();
  await page.getByRole('button', { name: 'Inspect discovery evidence', exact: true }).click();
  const importResponse = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/discovery/import');
  await page.getByRole('button', { name: 'Register in H2A', exact: true }).click();
  assert.equal((await importResponse).status(), 200);
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();

  await page.getByRole('button', { name: 'AI estate', exact: true }).click();
  await page.getByLabel('Search AI estate', { exact: true }).fill('no-such-identity');
  assert.equal(await page.getByRole('button', { name: /Marketing Research Agent/i }).count(), 0);
  await page.getByLabel('Search AI estate', { exact: true }).fill('Marketing Research');
  await page.getByLabel('Sort inventory', { exact: true }).selectOption('desc');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  assert.match((await downloadPromise).suggestedFilename(), /\.csv$/);
  await page.getByLabel('Search AI estate', { exact: true }).fill('');
  assert.ok(await page.locator('.product-mark[data-product="custom"]').count());
  await page.screenshot({ path: join(artifacts, 'estate.png'), fullPage: true });
  await page.getByRole('button', { name: /Marketing Research Agent/i }).first().click();
  let snapshot = await (await page.request.get(`${origin}/api/state`)).json();
  const agent = snapshot.agents[0];
  await postByClick(`/api/agents/${agent.agent_id}/bind`, page.getByRole('button', { name: /Bind to/i }));
  await postByClick(`/api/agents/${agent.agent_id}/passport`, page.getByRole('button', { name: 'Issue Agent Passport', exact: true }));
  await postByClick(`/api/agents/${agent.agent_id}/mandate`, page.getByRole('button', { name: 'Assign mandate', exact: true }));
  await postByClick('/api/rooms', page.getByRole('button', { name: 'Create governed room', exact: true }));
  snapshot = await (await page.request.get(`${origin}/api/state`)).json();
  const room = snapshot.rooms[0];
  await postByClick(`/api/rooms/${room.room_id}/actions`, page.getByRole('button', { name: 'Generate estate report', exact: true }));
  await postByClick(`/api/rooms/${room.room_id}/actions`, page.getByRole('button', { name: 'Request evidence export', exact: true }));
  snapshot = await (await page.request.get(`${origin}/api/state`)).json();
  const approval = snapshot.approvals.find(item => item.status === 'pending');
  assert.ok(approval);
  const closeInspector = page.getByRole('button', { name: 'Close inspector', exact: true });
  if (await closeInspector.isVisible()) await closeInspector.click();
  await page.getByRole('button', { name: 'Decisions', exact: true }).click();
  await page.locator('.review-request').first().click();
  const exactApproval = page.getByRole('button', { name: 'Approve exact action', exact: true });
  assert.equal(await exactApproval.isDisabled(), true);
  await page.getByLabel('I have reviewed the exact action, accountable owner and authority.', { exact: true }).check();
  await page.screenshot({ path: join(artifacts, 'approval-review.png'), fullPage: true });
  await postByClick(`/api/approvals/${approval.approval_id}/decision`, exactApproval);

  const observedAt = new Date().toISOString();
  const telemetry = await page.request.post(`${origin}/api/telemetry/ingest`, { data: { trace_id: `TRACE-${randomUUID()}`, occurred_at: observedAt, source: 'agent-census', kind: 'agent_discovered', agent_id: agent.agent_id, system: 'Agent Census', operation: 'observe runtime identity', outcome: 'observed', risk: 'medium', evidence: { provenance: 'runtime' } } });
  assert.equal(telemetry.status(), 200);
  const report = await page.request.post(`${origin}/api/source-reports`, { data: { source: 'custom', observed_at: observedAt, collector: 'CISO endpoint collector', collector_version: '1.0', host: 'ciso-test-host', status: 'healthy', summary: { observed_agents: 1, shadow_agents: 0, findings: 0 }, findings: [] } });
  assert.equal(report.status(), 200);
  const platformStatus = await (await page.request.get(`${origin}/api/platform/status`)).json();
  assert.equal(platformStatus.intake.telemetry_events, 1);
  const joinedTrace = await (await page.request.get(`${origin}/api/agents/${agent.agent_id}/identity-trace`)).json();
  assert.equal(joinedTrace.filter(item => item.lane === 'runtime').length, 1);

  await page.reload();
  await page.getByRole('button', { name: 'Identity trace', exact: true }).click();
  await page.getByText('runtime observations', { exact: true }).waitFor();
  await page.waitForFunction(() => /1runtime observations/i.test(document.querySelector('.trace-proof-summary')?.textContent ?? ''));
  assert.match(await page.locator('.trace-proof-summary').innerText(), /1\s+runtime observations/i);
  assert.match(await page.locator('.trace-timeline').innerText(), /Runtime/i);
  await page.getByRole('button', { name: 'Assurance', exact: true }).click();
  assert.match(await page.locator('.assurance-metrics').innerText(), /Runtime observations\s+1/i);
  assert.match(await page.locator('.source-intake-card').innerText(), /ciso-test-host/i);
  await page.screenshot({ path: join(artifacts, 'assurance.png'), fullPage: true });

  // New room UI: request an approval, but never launch a paid/authenticated CLI in this fixture test.
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.getByText('Runtime connections & authority', { exact: true }).click();
  await page.getByLabel('Agent identity', { exact: true }).selectOption(agent.agent_id);
  await postByClick(`/api/agents/${agent.agent_id}/runtime`, page.getByRole('button', { name: 'Connect CLI', exact: true }));
  await postByClick(`/api/agents/${agent.agent_id}/mandate`, page.getByRole('button', { name: 'Grant build mandate', exact: true }));
  await page.getByLabel('Build title', { exact: true }).fill('Browser fixture build');
  await page.getByLabel('Objective and acceptance criteria', { exact: true }).fill('Create a fixture dashboard. No live model execution in this test.');
  await page.locator('.runtime-columns input[type=checkbox]').first().check();
  snapshot = await (await page.request.get(`${origin}/api/state`)).json();
  await postByClick(`/api/rooms/${snapshot.rooms[0].room_id}/runs`, page.getByRole('button', { name: 'Request approval to run', exact: true }));
  await page.getByText('Browser fixture build', { exact: true }).waitFor();
  assert.match(await page.locator('.runtime-runs').innerText(), /pending/i);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(artifacts, 'live-room.png'), fullPage: true });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByText('Browser fixture build', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => innerWidth === 390 && document.documentElement.scrollWidth <= innerWidth);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(artifacts, 'live-room-mobile.png'), fullPage: false });
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, elements: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 15).map(el => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right })) }));
  assert.equal(overflow.width <= overflow.viewport, true, JSON.stringify(overflow));
});
