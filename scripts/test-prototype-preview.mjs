import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { build, createServer, preview } from 'vite';
import { sandboxCompatPathPrefix } from '../apps/sandbox-compat/node.ts';

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium';
const development = process.argv.includes('--dev');

if (!development) await build({ logLevel: 'silent' });
const server = development
  ? await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: true } })
  : await preview({ logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: true } });
if (development) await server.listen();
let browser;

try {
  const address = server.httpServer.address();
  assert(address !== null && typeof address !== 'string', 'Prototype preview did not bind to a TCP port');
  const url = `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch({ executablePath: chromiumPath });
  const page = await browser.newPage();
  const pageErrors = [];
  let entryHeaders;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.url().endsWith('/__patchpit/sandbox/sandbox-compat/index.html')) {
      entryHeaders = response.headers();
    }
  });
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'sandbox-compat:report') window.__sandboxCompatReport = event.data;
    });
  });
  await page.goto(url);
  await page.evaluate((src) => {
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    iframe.src = src;
    document.body.append(iframe);
  }, `${sandboxCompatPathPrefix}index.html`);
  await proveWorkspaceBehavior(page);
  const reportHandle = await page.waitForFunction(() => window.__sandboxCompatReport, undefined, {
    timeout: 2_000,
  });
  const report = await reportHandle.jsonValue();
  const failed = report.cases.filter((result) => result.status !== result.expectedSandbox);

  assert.deepEqual(failed, []);
  assert.deepEqual(pageErrors, []);
  assert.equal(entryHeaders?.['access-control-allow-origin'], '*');
  assert.match(entryHeaders?.['content-security-policy'] ?? '', /sandbox allow-scripts/);
  console.log(JSON.stringify({ cases: report.cases.length, entryHeaders: 'pass', mode: development ? 'dev' : 'preview', workspace: 'pass' }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}

async function proveWorkspaceBehavior(page) {
  const resource = (source, name) => page.locator('.resource-group', { hasText: source })
    .locator('.resource', { hasText: name });
  const tab = (name) => page.locator('.tab', { hasText: name });
  await resource('personal', 'projects').waitFor();
  await resource('personal', 'notes.md').waitFor();
  await resource('shared', 'readme.md').dblclick();
  await page.getByText('Shared notes', { exact: true }).waitFor();
  await resource('personal', 'readme.md').waitFor();
  await resource('shared', 'schedule.txt').click();
  await tab('shared / readme.md').waitFor();
  await tab('shared / schedule.txt').waitFor();
  await resource('personal', 'readme.md').click();
  assert.equal(await tab('shared / schedule.txt').count(), 0);

  const previewTab = tab('personal / readme.md');
  assert.equal(await previewTab.getAttribute('data-preview'), 'true');
  const leftPane = page.locator('[data-pane="left"]');
  await previewTab.dragTo(leftPane);
  assert.equal(await leftPane.locator('.tab', { hasText: 'personal / readme.md' }).count(), 1);
  assert.equal(await tab('personal / readme.md').getAttribute('data-preview'), null);
  assert.equal(await page.locator('[data-pane="right"] .tab', { hasText: 'personal / readme.md' }).count(), 0);

  await tab('personal / readme.md').dragTo(leftPane.locator('.tab', { hasText: 'Resources' }));
  assert.deepEqual(await leftPane.locator('.tab').allTextContents(), ['personal / readme.md', 'Resources']);
  await tab('personal / readme.md').dragTo(tab('shared / readme.md'));
  assert.deepEqual(await page.locator('[data-pane="right"] .tab').allTextContents(), [
    'personal / readme.md',
    'shared / readme.md',
  ]);
}
