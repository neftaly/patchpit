import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { build, createServer, preview } from 'vite';
import { sandboxCompatPathPrefix } from '../apps/sandbox-compat/node.ts';

const installedChromium = chromium.executablePath();
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ?? (existsSync(installedChromium) ? installedChromium : '/usr/bin/chromium');
const development = process.argv.includes('--dev');
const sandboxEntryPath = `${process.env.PATCHPIT_BASE ?? '/'}${sandboxCompatPathPrefix.slice(1)}index.html`;

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
    if (new URL(response.url()).pathname === sandboxEntryPath) {
      entryHeaders = response.headers();
    }
  });
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'sandbox-compat:report') window.__sandboxCompatReport = event.data;
    });
  });
  await page.goto(`${url}#${JSON.stringify({ delegation: 'placeholder:beelay' })}`);
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
  console.log(JSON.stringify({ cases: report.cases.length, entryHeaders: 'pass', mode: development ? 'dev' : 'preview', workspace: 'pass' }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}

async function proveWorkspaceBehavior(page) {
  const resource = (_source, name) => page.locator('.resource', { hasText: name });
  const tab = (name) => page.locator('.tab', { hasText: name });
  const drag = (...args) => dragWithTargetPreview(page, ...args);
  const dragTab = (source, target, expected) => drag(source, target, 'data-drop-target', expected, 0.99);
  await resource('patchpit', 'workspace.am').waitFor();
  await resource('sandbox-compat', 'ghostscript-tiger.svg').waitFor();
  const invocation = JSON.parse(decodeURIComponent(new URL(page.url()).hash.slice(1)));
  assert.equal(invocation.src.startsWith('automerge:'), true);
  assert.deepEqual(invocation.sync, ['wss://sync.automerge.org']);
  assert.equal(invocation.delegation, 'placeholder:beelay');
  const leftPane = page.locator('[data-pane="left"]');
  const rightPane = page.locator('[data-pane="right"]');
  const rootSplit = page.locator('[data-node="split-0"]');
  const rootBounds = await rootSplit.boundingBox();
  const leftBounds = await leftPane.boundingBox();
  const frameBounds = await page.locator('.sandbox-app').boundingBox();
  assert(rootBounds !== null && leftBounds !== null && frameBounds !== null, 'Initial workspace panes must be visible');
  assert(Math.abs((leftBounds.width / rootBounds.width) - 0.2) < 0.02);
  assert(frameBounds.width > 0);
  assert.equal(await page.locator('.sandbox-app').getAttribute('sandbox'), 'allow-scripts');
  const sandboxSrc = await page.locator('.sandbox-app').getAttribute('src');
  assert.equal(sandboxSrc?.includes('placeholder:beelay'), false);
  assert.equal(sandboxSrc?.includes('sync.automerge.org'), false);
  await tab('sandbox-compat / index.html').waitFor();
  assert.notEqual(await tab('sandbox-compat / index.html').getAttribute('data-context'), null);
  await page.frameLocator('.sandbox-app').getByText('image-file-backed: PASS').waitFor();
  await drag(
    tab('sandbox-compat / index.html'),
    rightPane.locator('.pane-content'),
    'data-drop-zone',
    null,
    0.5,
    0.99,
  );
  assert.equal(await page.locator('.pane').count(), 2);
  await resource('patchpit', 'workspace.am').click();
  const workspaceViewer = page.locator('.viewer');
  await workspaceViewer.waitFor();
  const workspaceDocument = JSON.parse(await workspaceViewer.textContent());
  assert.equal(workspaceDocument.nodes['split-0'].ratio, 0.2);
  const viewerUrl = Object.values(workspaceDocument.contexts)
    .map((context) => context.url)
    .find((url) => url.startsWith('viewer.html#'));
  assert(viewerUrl !== undefined);
  assert.equal(JSON.parse(viewerUrl.slice('viewer.html#'.length)).src.startsWith('automerge:'), true);
  assert(await workspaceViewer.evaluate((viewer) => viewer.scrollHeight > viewer.clientHeight));
  await workspaceViewer.evaluate((viewer) => { viewer.scrollTop = viewer.scrollHeight; });
  assert(await workspaceViewer.evaluate((viewer) => viewer.scrollTop > 0));

  const resizeHandle = rootSplit.locator(':scope > .resize-handle');
  const handleBounds = await resizeHandle.boundingBox();
  assert(handleBounds !== null, 'Resize handle must be visible');
  await page.mouse.move(handleBounds.x + (handleBounds.width / 2), handleBounds.y + (handleBounds.height / 2));
  await page.mouse.down();
  await page.mouse.move(rootBounds.x + (rootBounds.width * 0.3), handleBounds.y + (handleBounds.height / 2), {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForFunction(() => Number(
    document.querySelector('[data-node="split-0"]')?.getAttribute('data-ratio'),
  ) > 0.25);
  await page.locator('.viewer', { hasText: '"ratio": 0.3' }).waitFor();
  assert(JSON.parse(await workspaceViewer.textContent()).nodes['split-0'].ratio > 0.25);
  await page.getByRole('button', { name: 'Close patchpit / workspace.am' }).click();
  await tab('sandbox-compat / index.html').click();

  await drag(
    resource('sandbox-compat', 'data.json'),
    rightPane.locator('.pane-content'),
    'data-drop-zone',
    'center',
    0.5,
  );
  assert.equal(await page.locator('.pane').count(), 2);
  assert.equal(await tab('sandbox-compat / data.json').getAttribute('data-preview'), null);
  await page.getByText('{"ok":true}', { exact: true }).waitFor();
  await dragTab(
    resource('sandbox-compat', 'worker.js'),
    tab('sandbox-compat / data.json'),
    'after',
  );
  assert.deepEqual(await rightPane.locator('.tab').allTextContents(), [
    'sandbox-compat / index.html',
    'sandbox-compat / data.json',
    'sandbox-compat / worker.js',
  ]);
  await drag(
    tab('sandbox-compat / data.json'),
    tab('sandbox-compat / worker.js'),
    'data-drop-target',
    'after',
    0.01,
  );
  assert.deepEqual(await rightPane.locator('.tab').allTextContents(), [
    'sandbox-compat / index.html',
    'sandbox-compat / worker.js',
    'sandbox-compat / data.json',
  ]);
  await drag(
    resource('sandbox-compat', 'frame.html'),
    rightPane.locator('.pane-content'),
    'data-drop-zone',
    'left',
    0.01,
  );
  const splitPane = page.locator('.pane', { has: tab('sandbox-compat / frame.html') });
  const splitPaneId = await splitPane.getAttribute('data-pane');
  assert(splitPaneId !== null);
  assert.equal(await page.locator('.pane').count(), 3);
  assert.deepEqual(await splitPane.locator('.tab').allTextContents(), ['sandbox-compat / frame.html']);
  await drag(
    tab('sandbox-compat / worker.js'),
    splitPane.locator('.pane-content'),
    'data-drop-zone',
    'bottom',
    0.5,
    0.99,
  );
  assert.equal(await page.locator('.pane').count(), 4);
  const workerPane = page.locator('.pane', { has: tab('sandbox-compat / worker.js') });
  const workerPaneId = await workerPane.getAttribute('data-pane');
  assert(workerPaneId !== null);
  assert.deepEqual(await workerPane.locator('.tab').allTextContents(), [
    'sandbox-compat / worker.js',
  ]);
  await resource('sandbox-compat', 'css-url.css').click();
  await tab('sandbox-compat / data.json').waitFor();
  await tab('sandbox-compat / css-url.css').waitFor();
  await resource('sandbox-compat', 'css-import.css').click();
  assert.equal(await tab('sandbox-compat / css-url.css').count(), 0);

  const previewTab = tab('sandbox-compat / css-import.css');
  assert.equal(await previewTab.getAttribute('data-preview'), 'true');
  await drag(
    previewTab,
    leftPane.locator('.pane-content'),
    'data-drop-zone',
    'center',
    0.5,
  );
  assert.equal(await leftPane.locator('.tab', { hasText: 'sandbox-compat / css-import.css' }).count(), 1);
  assert.equal(await tab('sandbox-compat / css-import.css').getAttribute('data-preview'), null);
  assert.equal(await rightPane.locator('.tab', { hasText: 'sandbox-compat / css-import.css' }).count(), 0);

  await tab('sandbox-compat / css-import.css').dragTo(leftPane.locator('.tab', { hasText: 'Resources' }), {
    targetPosition: { x: 1, y: 15 },
  });
  assert.deepEqual(await leftPane.locator('.tab').allTextContents(), ['sandbox-compat / css-import.css', 'Resources']);
  await tab('sandbox-compat / css-import.css').dragTo(tab('sandbox-compat / data.json'), {
    targetPosition: { x: 1, y: 15 },
  });
  assert.deepEqual(await rightPane.locator('.tab').allTextContents(), [
    'sandbox-compat / index.html',
    'sandbox-compat / css-import.css',
    'sandbox-compat / data.json',
  ]);
  await drag(
    page.locator(`[data-pane="${workerPaneId}"] .tab`),
    rightPane.locator('.pane-content'),
    'data-drop-zone',
    'center',
    0.5,
  );
  assert.equal(await page.locator('.pane').count(), 3);
  assert.equal(await page.locator(`[data-pane="${workerPaneId}"]`).count(), 0);
  assert.deepEqual(await rightPane.locator('.tab').allTextContents(), [
    'sandbox-compat / index.html',
    'sandbox-compat / css-import.css',
    'sandbox-compat / data.json',
    'sandbox-compat / worker.js',
  ]);
  await page.getByRole('button', { name: 'Close sandbox-compat / frame.html' }).click();
  assert.equal(await page.locator(`[data-pane="${splitPaneId}"]`).count(), 0);
  assert.equal(await page.locator('.pane').count(), 2);
}

async function dragWithTargetPreview(
  page,
  source,
  target,
  attribute,
  expectedTarget,
  xRatio,
  yRatio = 0.5,
) {
  const targetBounds = await target.boundingBox();
  assert(targetBounds !== null, 'Drag target must be visible');
  const sourceElement = await source.elementHandle();
  assert(sourceElement !== null, 'Drag source must exist');
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await sourceElement.dispatchEvent('dragstart', { dataTransfer });
  await page.locator('.drag-shield').first().waitFor();
  const shield = target.locator('.drag-shield');
  const eventTarget = await shield.count() === 0 ? target : shield;
  const position = {
    clientX: targetBounds.x + (targetBounds.width * xRatio),
    clientY: targetBounds.y + (targetBounds.height * yRatio),
    dataTransfer,
  };
  await eventTarget.dispatchEvent('dragover', position);
  assert.equal(await target.getAttribute(attribute), expectedTarget);
  await eventTarget.dispatchEvent('drop', position);
  await sourceElement.dispatchEvent('dragend', { dataTransfer });
}
