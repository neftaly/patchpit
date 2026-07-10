import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium';

await build({ logLevel: 'silent' });
const server = await preview({
  logLevel: 'silent',
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
let browser;

try {
  const address = server.httpServer.address();
  assert(address !== null && typeof address !== 'string', 'Prototype preview did not bind to a TCP port');
  const url = `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch({ executablePath: chromiumPath });
  const page = await browser.newPage();
  let entryHeaders;

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
  const reportHandle = await page.waitForFunction(() => window.__sandboxCompatReport, undefined, {
    timeout: 2_000,
  });
  const report = await reportHandle.jsonValue();
  const failed = report.cases.filter((result) => result.status !== result.expectedSandbox);

  assert.deepEqual(failed, []);
  assert.equal(entryHeaders?.['access-control-allow-origin'], '*');
  assert.match(entryHeaders?.['content-security-policy'] ?? '', /sandbox allow-scripts/);
  console.log(JSON.stringify({ cases: report.cases.length, entryHeaders: 'pass' }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
