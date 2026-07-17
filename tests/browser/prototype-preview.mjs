import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { build, createServer, preview } from 'vite';

const installedChromium = chromium.executablePath();
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ?? (existsSync(installedChromium) ? installedChromium : '/usr/bin/chromium');
const development = process.argv.includes('--dev');
const testPort = Number(process.env.PATCHPIT_TEST_PORT ?? (development ? 5174 : 4174));

if (!development) await build({ logLevel: 'silent' });
const server = development
  ? await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: testPort, strictPort: true } })
  : await preview({ logLevel: 'silent', preview: { host: '127.0.0.1', port: testPort, strictPort: true } });
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
    if (/\/__patchpit\/sandbox\/[0-9a-f-]{36}\/index\.html$/.test(new URL(response.url()).pathname)) {
      entryHeaders = response.headers();
    }
  });
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'sandbox-compat:report') window.__sandboxCompatReport = event.data;
    });
  });
  await page.goto(`${url}#${JSON.stringify({ delegation: 'https://example.com/delegation' })}`);
  await proveWorkspaceBehavior(page);
  const reportHandle = await page.waitForFunction(() => window.__sandboxCompatReport, undefined, {
    timeout: 2_000,
  });
  const report = await reportHandle.jsonValue();
  const failed = report.cases.filter((result) => result.status !== result.expectedSandbox);

  assert.deepEqual(failed, []);
  assert.deepEqual(pageErrors, []);
  assert.equal(entryHeaders?.['access-control-allow-origin'], '*');
  assert.match(entryHeaders?.['content-security-policy'] ?? '', /sandbox allow-scripts allow-same-origin/);
  await proveOfflineSandboxReload(page);
  await proveFolderAppLaunch(page);
  await proveRootReplacementLifecycle(page);
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
  const treeLayout = await page.locator('.view').evaluate((view) => {
    const row = (name) => [...view.querySelectorAll('.resource')].find((candidate) =>
      candidate.querySelector('.resource-name')?.textContent === name);
    const style = (name) => {
      const element = row(name);
      if (element === undefined) throw new Error(`Missing resource row: ${name}`);
      const computed = getComputedStyle(element);
      return {
        backgroundImage: computed.backgroundImage,
        backgroundSize: Number.parseFloat(computed.backgroundSize),
        padding: Number.parseFloat(computed.paddingInlineStart),
      };
    };
    return {
      folder: style('sandbox-compat'),
      nested: style('ghostscript-tiger.svg'),
      rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      source: style('patchpit'),
    };
  });
  assert(Math.abs((treeLayout.folder.padding - treeLayout.source.padding) - treeLayout.rootFontSize) < 0.1);
  assert(Math.abs((treeLayout.nested.padding - treeLayout.folder.padding) - treeLayout.rootFontSize) < 0.1);
  assert.equal(treeLayout.nested.backgroundImage.startsWith('repeating-linear-gradient'), true);
  assert(Math.abs(treeLayout.nested.backgroundSize - (treeLayout.rootFontSize * 2)) < 0.1);
  const invocation = JSON.parse(decodeURIComponent(new URL(page.url()).hash.slice(1)));
  assert.equal(invocation.src.startsWith('automerge:'), true);
  assert.deepEqual(invocation.sync, ['wss://sync.automerge.org']);
  assert.equal(invocation.delegation, 'https://example.com/delegation');
  const leftPane = page.locator('[data-pane="left"]');
  const rightPane = page.locator('[data-pane="right"]');
  const rootSplit = page.locator('[data-node="split-0"]');
  const rootBounds = await rootSplit.boundingBox();
  const leftBounds = await leftPane.boundingBox();
  const frameBounds = await page.locator('.sandbox-app').boundingBox();
  assert(rootBounds !== null && leftBounds !== null && frameBounds !== null, 'Initial workspace panes must be visible');
  assert(Math.abs((leftBounds.width / rootBounds.width) - 0.2) < 0.02);
  assert(frameBounds.width > 0);
  assert.equal(await page.locator('.sandbox-app').getAttribute('sandbox'), 'allow-scripts allow-same-origin');
  assert.equal(await page.locator('.sandbox-app').getAttribute('title'), 'sandbox-compat app');
  const sandboxSrc = await page.locator('.sandbox-app').getAttribute('src');
  assert.match(sandboxSrc ?? '', /\/__patchpit\/sandbox\/[0-9a-f-]{36}\/index\.html$/);
  assert.equal(sandboxSrc?.includes('example.com/delegation'), false);
  assert.equal(sandboxSrc?.includes('sync.automerge.org'), false);
  await page.evaluate(() => {
    window.__patchpitIdentityFrame = document.querySelector('.sandbox-app');
  });
  await tab('sandbox-compat / index.html').waitFor();
  assert.notEqual(await tab('sandbox-compat / index.html').getAttribute('data-context'), null);
  await page.frameLocator('.sandbox-app').getByText('image-file-backed: PASS').waitFor();
  await page.frameLocator('.sandbox-app').getByText('image-html-file: PASS').waitFor();
  const duplicateNames = page.getByRole('button', {
    name: 'duplicate.svg',
    exact: true,
  });
  await duplicateNames.first().waitFor();
  assert.equal(await duplicateNames.count(), 2);
  await duplicateNames.first().click();
  await page.locator('.viewer').filter({ hasText: '<circle' }).waitFor();
  await tab('relative-file.svg').waitFor();
  await page.getByRole('button', { name: 'Close relative-file.svg' }).click();
  const unavailableResource = page.getByRole('button', {
    name: 'ghostscript-tiger-web.svg',
    exact: true,
  });
  await unavailableResource.focus();
  await unavailableResource.press('Enter');
  await page.getByRole('alert').getByText('Resource unavailable.').waitFor();
  assert.equal(await tab('ghostscript-tiger-web.svg').getAttribute('data-preview'), null);
  await page.getByRole('button', { name: 'Close ghostscript-tiger-web.svg' }).click();
  await tab('sandbox-compat / index.html').click();
  await drag(
    resource('sandbox-compat', 'data.json'),
    leftPane.locator('.pane-content'),
    'data-drop-zone',
    null,
    0.01,
  );
  assert.equal(await page.locator('.pane').count(), 2);
  assert.equal(await tab('data.json').count(), 0);
  await resource('sandbox-compat', 'data.json').click();
  await page.getByText('{"ok":true}', { exact: true }).waitFor();
  const appTab = rightPane.getByRole('tab', { name: 'sandbox-compat / index.html' });
  const dataTab = rightPane.getByRole('tab', { name: 'data.json' });
  assert.equal(await dataTab.getAttribute('aria-selected'), 'true');
  assert.equal(await dataTab.getAttribute('tabindex'), '0');
  assert.equal(await appTab.getAttribute('tabindex'), '-1');
  const dataPanelId = await dataTab.getAttribute('aria-controls');
  assert(dataPanelId !== null);
  assert.equal(await page.evaluate((id) => document.getElementById(id)?.role, dataPanelId), 'tabpanel');
  await dataTab.press('ArrowLeft');
  assert.equal(await appTab.getAttribute('aria-selected'), 'true');
  await tab('sandbox-compat / index.html').click();
  await drag(
    tab('sandbox-compat / index.html'),
    rightPane.locator('.pane-content'),
    'data-drop-zone',
    'left',
    0.01,
  );
  assert.equal(await page.locator('.pane').count(), 3);
  await assertSandboxIdentity(page);
  const identityPane = page.locator('.pane', { has: tab('sandbox-compat / index.html') });
  await drag(
    identityPane.locator('.tab', { hasText: 'sandbox-compat / index.html' }),
    rightPane.locator('.pane-content'),
    'data-drop-zone',
    'center',
    0.5,
  );
  assert.equal(await page.locator('.pane').count(), 2);
  await assertSandboxIdentity(page);
  await page.getByRole('button', { name: 'Close data.json' }).click();
  await assertSandboxIdentity(page);
  assert.equal(await page.locator('.pane').count(), 2);
  await resource('patchpit', 'workspace.am').click();
  const workspaceViewer = page.locator('.viewer');
  await workspaceViewer.waitFor();
  const workspaceDocument = JSON.parse(await workspaceViewer.textContent());
  assert.equal(workspaceDocument.splits['split-0'].ratio, 0.2);
  assert.equal(Object.values(workspaceDocument.placements)
    .some((placement) => placement.url.startsWith('viewer.html#')), false);
  assert(await workspaceViewer.evaluate((viewer) => viewer.scrollHeight > viewer.clientHeight));
  await workspaceViewer.evaluate((viewer) => { viewer.scrollTop = viewer.scrollHeight; });
  assert(await workspaceViewer.evaluate((viewer) => viewer.scrollTop > 0));

  const resizeHandle = rootSplit.locator(':scope > .resize-handle');
  assert.equal(await resizeHandle.getAttribute('role'), 'separator');
  assert.equal(await resizeHandle.getAttribute('aria-orientation'), 'vertical');
  assert.equal(await resizeHandle.getAttribute('aria-valuemin'), '10');
  assert.equal(await resizeHandle.getAttribute('aria-valuemax'), '90');
  const controlledNodeIds = (await resizeHandle.getAttribute('aria-controls'))?.split(' ');
  assert.equal(controlledNodeIds?.length, 2);
  assert.equal(await page.evaluate((ids) => ids.every((id) => document.getElementById(id) !== null), controlledNodeIds), true);
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
  assert(JSON.parse(await workspaceViewer.textContent()).splits['split-0'].ratio > 0.25);
  const pointerRatio = Number(await rootSplit.getAttribute('data-ratio'));
  await resizeHandle.press('ArrowRight');
  await page.waitForFunction(({ ratio }) => Number(
    document.querySelector('[data-node="split-0"]')?.getAttribute('data-ratio'),
  ) > ratio, { ratio: pointerRatio });
  await page.getByRole('button', { name: 'Close workspace.am' }).click();
  await tab('sandbox-compat / index.html').click();

  await drag(
    resource('sandbox-compat', 'data.json'),
    rightPane.locator('.pane-content'),
    'data-drop-zone',
    'center',
    0.5,
  );
  assert.equal(await page.locator('.pane').count(), 2);
  assert.equal(await tab('data.json').getAttribute('data-preview'), null);
  await page.getByText('{"ok":true}', { exact: true }).waitFor();
  await dragTab(
    resource('sandbox-compat', 'worker.js'),
    tab('data.json'),
    'after',
  );
  assert.deepEqual(await rightPane.locator('.tab').allTextContents(), [
    'sandbox-compat / index.html',
    'data.json',
    'worker.js',
  ]);
  await drag(
    tab('data.json'),
    tab('worker.js'),
    'data-drop-target',
    'after',
    0.01,
  );
  assert.deepEqual(await rightPane.locator('.tab').allTextContents(), [
    'sandbox-compat / index.html',
    'worker.js',
    'data.json',
  ]);
  await drag(
    resource('sandbox-compat', 'frame.html'),
    rightPane.locator('.pane-content'),
    'data-drop-zone',
    'left',
    0.01,
  );
  const splitPane = page.locator('.pane', { has: tab('frame.html') });
  const splitPaneId = await splitPane.getAttribute('data-pane');
  assert(splitPaneId !== null);
  assert.equal(await page.locator('.pane').count(), 3);
  assert.deepEqual(await splitPane.locator('.tab').allTextContents(), ['frame.html']);
  await drag(
    tab('worker.js'),
    splitPane.locator('.pane-content'),
    'data-drop-zone',
    'bottom',
    0.5,
    0.99,
  );
  assert.equal(await page.locator('.pane').count(), 4);
  assert.equal(await page.locator('[role="separator"]').evaluateAll((separators) => separators.every((separator) => {
    const controlled = separator.getAttribute('aria-controls');
    return controlled !== null && controlled.split(' ').every((id) => document.getElementById(id) !== null);
  })), true);
  const workerPane = page.locator('.pane', { has: tab('worker.js') });
  const workerPaneId = await workerPane.getAttribute('data-pane');
  assert(workerPaneId !== null);
  assert.deepEqual(await workerPane.locator('.tab').allTextContents(), [
    'worker.js',
  ]);
  const workerTabBounds = await tab('worker.js').boundingBox();
  assert(workerTabBounds !== null);
  assert.equal(await page.evaluate(({ x, y }) => (
    document.elementFromPoint(x, y)?.closest('.tab') !== null
  ), {
    x: workerTabBounds.x + (workerTabBounds.width / 2),
    y: workerTabBounds.y + 1,
  }), true);
  await resource('sandbox-compat', 'css-url.css').click();
  await tab('data.json').waitFor();
  await tab('css-url.css').waitFor();
  assert.equal(await workerPane.locator('.tab', { hasText: 'css-url.css' }).count(), 1);
  await resource('sandbox-compat', 'css-import.css').click();
  assert.equal(await tab('css-url.css').count(), 0);

  const previewTab = tab('css-import.css');
  assert.equal(await previewTab.getAttribute('data-preview'), 'true');
  await drag(
    previewTab,
    leftPane.locator('.pane-content'),
    'data-drop-zone',
    'center',
    0.5,
  );
  assert.equal(await leftPane.locator('.tab', { hasText: 'css-import.css' }).count(), 1);
  assert.equal(await tab('css-import.css').getAttribute('data-preview'), null);
  assert.equal(await rightPane.locator('.tab', { hasText: 'css-import.css' }).count(), 0);

  await tab('css-import.css').dragTo(leftPane.locator('.tab', { hasText: 'Resources' }), {
    targetPosition: { x: 1, y: 15 },
  });
  assert.deepEqual(await leftPane.locator('.tab').allTextContents(), ['css-import.css', 'Resources']);
  await tab('css-import.css').dragTo(tab('data.json'), {
    targetPosition: { x: 1, y: 15 },
  });
  assert.deepEqual(await rightPane.locator('.tab').allTextContents(), [
    'sandbox-compat / index.html',
    'css-import.css',
    'data.json',
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
    'css-import.css',
    'data.json',
    'worker.js',
  ]);
  await page.getByRole('button', { name: 'Close frame.html' }).click();
  assert.equal(await page.locator(`[data-pane="${splitPaneId}"]`).count(), 0);
  assert.equal(await page.locator('.pane').count(), 2);
  await assertSandboxIdentity(page);
}

async function assertSandboxIdentity(page) {
  assert.equal(await page.evaluate(() => (
    document.querySelector('.sandbox-app') === window.__patchpitIdentityFrame
  )), true, 'Workspace placement changes must preserve the live sandbox iframe');
}

async function proveOfflineSandboxReload(page) {
  await page.evaluate(() => { window.__sandboxCompatReport = undefined; });
  await page.context().setOffline(true);
  try {
    await page.locator('.sandbox-app').evaluate((frame) => { frame.contentWindow.location.reload(); });
    await page.waitForFunction(() => window.__sandboxCompatReport, undefined, { timeout: 2_000 });
  } finally {
    await page.context().setOffline(false);
  }
}

async function proveFolderAppLaunch(page) {
  const previousCaches = await sandboxCacheNames(page);
  assert.equal(previousCaches.length, 1);
  await page.getByRole('button', { name: 'Close sandbox-compat / index.html' }).click();
  assert.equal(await page.locator('.sandbox-app').count(), 0);
  await page.waitForFunction(() => caches.keys().then((names) =>
    names.every((name) => !name.startsWith('@patchpit/sandbox-cache/'))));
  await page.evaluate(() => { window.__sandboxCompatReport = undefined; });
  await page.locator('button.resource', { hasText: 'sandbox-compat' }).click();
  await page.locator('.sandbox-app').waitFor();
  await page.waitForFunction(() => window.__sandboxCompatReport, undefined, { timeout: 2_000 });
  assert.equal(await page.locator('.tab', { hasText: 'sandbox-compat / index.html' }).getAttribute('data-preview'), 'true');
  const currentCaches = await sandboxCacheNames(page);
  assert.equal(currentCaches.length, 1);
  assert.notEqual(currentCaches[0], previousCaches[0]);
}

async function proveRootReplacementLifecycle(page) {
  const previousFrameSrc = await page.locator('.sandbox-app').getAttribute('src');
  const previousCaches = await sandboxCacheNames(page);
  assert(previousFrameSrc !== null && previousCaches.length === 1);
  await page.evaluate(() => {
    window.__sandboxCompatReport = undefined;
    const invocation = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    location.hash = JSON.stringify({ ...invocation, delegation: 'https://example.com/replaced' });
  });
  await page.waitForFunction((oldCache) => caches.keys().then((names) => !names.includes(oldCache)), previousCaches[0]);
  await page.locator('button.resource', { hasText: 'sandbox-compat' }).waitFor();
  assert.equal(await page.locator('.sandbox-app').count(), 0);
  await page.locator('button.resource', { hasText: 'sandbox-compat' }).click();
  await page.locator('.sandbox-app').waitFor();
  await page.waitForFunction(() => window.__sandboxCompatReport, undefined, { timeout: 2_000 });
  assert.notEqual(await page.locator('.sandbox-app').getAttribute('src'), previousFrameSrc);
  assert.equal((await sandboxCacheNames(page)).length, 1);
}

function sandboxCacheNames(page) {
  return page.evaluate(() => caches.keys().then((names) =>
    names.filter((name) => name.startsWith('@patchpit/sandbox-cache/'))));
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
  await page.locator('.pane-content[data-dragging="true"]').first().waitFor();
  const position = {
    clientX: targetBounds.x + (targetBounds.width * xRatio),
    clientY: targetBounds.y + (targetBounds.height * yRatio),
    dataTransfer,
  };
  await target.dispatchEvent('dragover', position);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  assert.equal(await target.getAttribute(attribute), expectedTarget);
  await target.dispatchEvent('drop', position);
  await sourceElement.dispatchEvent('dragend', { dataTransfer });
}
