/* global console, document */
import { chromium } from 'playwright';

const baseUrl = process.env.H2A_WEB_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'AI Estate' }).click();
  await page.getByLabel('Primary navigation').getByRole('button', { name: 'Evidence' }).click();
  await page.locator('.task-trace-events > button').first().waitFor();

  const taskTraceCount = await page.locator('.task-trace-events > button').count();
  await page.locator('.task-trace-events > button').filter({ hasText: 'PROVIDER-CALL' }).click();
  const taskInspector = await page.locator('.audit-event-inspector.compact').innerText();
  const atomicInitial = await page.locator('.atomic-event-list > button:not(.atomic-load-more)').count();

  await page.locator('.atomic-ledger-toolbar select').selectOption('provider-call');
  const providerSummary = await page.locator('.atomic-ledger-toolbar > span').innerText();
  const providerRows = await page.locator('.atomic-event-list > button:not(.atomic-load-more)').count();
  await page.locator('.atomic-ledger-toolbar input').fill('audit-0001-04');
  const exactRows = await page.locator('.atomic-event-list > button:not(.atomic-load-more)').count();
  await page.locator('.atomic-event-list > button:not(.atomic-load-more)').first().click();

  const ledgerInspector = page.locator('.atomic-ledger-grid > .audit-event-inspector');
  const ledgerText = await ledgerInspector.innerText();
  await ledgerInspector.locator('.raw-event-payload summary').click();
  const rawPayload = await ledgerInspector.locator('.raw-event-payload pre').innerText();

  const eventDownloadPromise = page.waitForEvent('download');
  await ledgerInspector.getByRole('button', { name: 'Export event' }).click();
  const eventDownload = await eventDownloadPromise;
  const taskDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected trail' }).click();
  const taskDownload = await taskDownloadPromise;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );

  const results = {
    taskTraceCount,
    taskInspectorHasProviderApi: taskInspector.includes('POST /v1/responses'),
    taskInspectorHasActor: taskInspector.includes('Codex Builder'),
    atomicInitial,
    providerSummary,
    providerRows,
    exactRows,
    ledgerInspectorHasPolicy: ledgerText.includes('provider.approved-route'),
    ledgerInspectorHasReleasedData: ledgerText.includes('Approved project files'),
    rawPayloadHasEventId: rawPayload.includes('audit-0001-04'),
    rawPayloadHasDigest: rawPayload.includes('demo_sha256_in_'),
    eventDownload: eventDownload.suggestedFilename(),
    taskDownload: taskDownload.suggestedFilename(),
    mobileOverflow
  };

  const failed = Object.entries(results).filter(([key, value]) => {
    if (key === 'taskTraceCount') return value !== 7;
    if (key === 'atomicInitial' || key === 'providerRows') return value !== 80;
    if (key === 'providerSummary') return value !== '260 events';
    if (key === 'exactRows') return value !== 1;
    if (key === 'eventDownload') return value !== 'audit-0001-04.json';
    if (key === 'taskDownload') return value !== 'evidence-0001.json';
    if (key === 'mobileOverflow') return value !== 0;
    return value !== true;
  });

  console.log(JSON.stringify(results, null, 2));
  if (failed.length > 0) {
    throw new Error(`CISO evidence verification failed: ${failed.map(([key]) => key).join(', ')}`);
  }
} finally {
  await browser.close();
}
