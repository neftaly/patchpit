import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const installedChromium = chromium.executablePath();
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ?? (existsSync(installedChromium) ? installedChromium : '/usr/bin/chromium');
const port = Number(process.env.PATCHPIT_EDITOR_TEST_PORT ?? 5175);
const server = await createServer({
  logLevel: 'silent',
  server: { host: '127.0.0.1', port, strictPort: true },
});
await server.listen();
let browser;

try {
  browser = await chromium.launch({ executablePath: chromiumPath });
  const context = await browser.newContext();
  for (const mode of ['default', 'forced-polyfill']) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator('button.resource', { hasText: 'demo.md' }).waitFor();
    await page.locator('button.resource', { hasText: 'Markdown editor' }).click();
    const appFrame = page.locator('iframe[title="Markdown editor app"]');
    await appFrame.waitFor();
    const frame = appFrame.contentFrame();
    if (mode === 'forced-polyfill') {
      const frameHandle = await appFrame.elementHandle();
      const browsingContext = await frameHandle.contentFrame();
      assert.notEqual(browsingContext, null);
      await browsingContext.goto(`${browsingContext.url()}?force-polyfill`);
    }
    const editor = frame.getByRole('textbox', { name: 'Markdown source' });
    await editor.waitFor({ timeout: 10_000 }).catch(async (cause) => {
      throw new Error(JSON.stringify({
        errors,
        frameBody: await frame.locator('body').textContent().catch(() => undefined),
      }), { cause });
    });
    assert.equal(await frame.locator('html').getAttribute('data-experiment-mode'), mode);
    await editor.focus();
    await page.keyboard.insertText('Hello 😀');
    await frame.getByText('Hello 😀# Collaborative Markdown', { exact: false }).waitFor();
    assert.equal(Number(await editor.getAttribute('data-intent-count')), 1);
    const client = await page.context().newCDPSession(page);
    await client.send('Input.imeSetComposition', {
      text: 'に',
      selectionStart: 1,
      selectionEnd: 1,
    });
    await frame.getByText('Hello 😀に# Collaborative Markdown', { exact: false }).waitFor();
    assert.equal(Number(await editor.getAttribute('data-intent-count')), 1);
    await client.send('Input.imeSetComposition', {
      text: '日本',
      selectionStart: 2,
      selectionEnd: 2,
    });
    assert.equal(Number(await editor.getAttribute('data-intent-count')), 1);
    await client.send('Input.insertText', { text: '日本' });
    await frame.getByText('Hello 😀日本# Collaborative Markdown', { exact: false }).waitFor();
    await frame.getByText('2 semantic splices', { exact: false }).waitFor();
    assert.equal(Number(await editor.getAttribute('data-intent-count')), 2);
    await editor.press('ArrowLeft');
    await page.keyboard.insertText('!');
    await frame.getByText('Hello 😀日!本# Collaborative Markdown', { exact: false }).waitFor();
    assert.equal(Number(await editor.getAttribute('data-intent-count')), 3);
    const hashPoint = await editor.evaluate((root) => {
      const target = root.textContent?.indexOf('#') ?? -1;
      if (target < 0) throw new Error('Markdown heading marker is unavailable');
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let traversed = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const length = node.textContent?.length ?? 0;
        if (traversed + length >= target) {
          const range = document.createRange();
          range.setStart(node, target - traversed);
          range.setEnd(node, Math.min(target - traversed + 1, length));
          const bounds = range.getBoundingClientRect();
          return { x: bounds.left, y: bounds.top + (bounds.height / 2) };
        }
        traversed += length;
      }
      throw new Error('Markdown heading marker has no rendered position');
    });
    const frameBounds = await appFrame.boundingBox();
    assert.notEqual(frameBounds, null);
    const pagePoint = ({ x, y }) => ({ x: x + frameBounds.x, y: y + frameBounds.y });
    const headingPoint = pagePoint(hashPoint);
    await page.mouse.click(headingPoint.x, headingPoint.y);
    await page.keyboard.insertText('@');
    await frame.getByText('Hello 😀日!本@# Collaborative Markdown', { exact: false }).waitFor();
    assert.equal(Number(await editor.getAttribute('data-intent-count')), 4);
    const drag = await editor.evaluate((root) => {
      const value = root.textContent ?? '';
      const start = value.indexOf('Collaborative');
      const end = start + 'Collaborative'.length;
      if (start < 0) throw new Error('Drag target is unavailable');
      const pointAt = (target, edge) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let traversed = 0;
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const length = node.textContent?.length ?? 0;
          if (target >= traversed && target <= traversed + length) {
            const localOffset = target - traversed;
            const characterOffset = edge === 'start' ? localOffset : localOffset - 1;
            const range = document.createRange();
            range.setStart(node, characterOffset);
            range.setEnd(node, characterOffset + 1);
            const bounds = range.getBoundingClientRect();
            return {
              x: edge === 'start' ? bounds.left + 1 : bounds.right - 1,
              y: bounds.top + (bounds.height / 2),
            };
          }
          traversed += length;
        }
        throw new Error('Drag target has no rendered position');
      };
      return { start, end, from: pointAt(start, 'start'), to: pointAt(end, 'end') };
    });
    const dragFrom = pagePoint(drag.from);
    const dragTo = pagePoint(drag.to);
    await page.mouse.move(dragFrom.x, dragFrom.y);
    await page.mouse.down();
    await page.mouse.move(dragTo.x, dragTo.y);
    await page.mouse.up();
    assert.deepEqual({
      start: Number(await editor.getAttribute('data-selection-start')),
      end: Number(await editor.getAttribute('data-selection-end')),
    }, { start: drag.start, end: drag.end });
    assert.equal(await editor.locator('.selection').textContent(), 'Collaborative');
    const geometry = await editor.evaluate(async (root) => {
      const editContext = root.editContext;
      editContext.dispatchEvent(new CharacterBoundsUpdateEvent('characterboundsupdate', {
        rangeStart: 0,
        rangeEnd: 2,
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        bounds: editContext.characterBounds().map(({ height, width }) => ({ height, width })),
        start: editContext.characterBoundsRangeStart,
      };
    });
    assert.equal(geometry.start, 0);
    assert.equal(geometry.bounds.length, 2);
    geometry.bounds.forEach(({ height, width }) => {
      assert.equal(height > 0, true);
      assert.equal(width > 0, true);
    });
    const selected = {
      start: await editor.getAttribute('data-selection-start'),
      end: await editor.getAttribute('data-selection-end'),
    };
    const auxiliaryPoint = pagePoint({ x: hashPoint.x + 20, y: hashPoint.y });
    await page.mouse.click(auxiliaryPoint.x, auxiliaryPoint.y, { button: 'middle' });
    assert.deepEqual({
      start: await editor.getAttribute('data-selection-start'),
      end: await editor.getAttribute('data-selection-end'),
    }, selected);
    await page.mouse.click(auxiliaryPoint.x, auxiliaryPoint.y, { button: 'right' });
    assert.deepEqual({
      start: await editor.getAttribute('data-selection-start'),
      end: await editor.getAttribute('data-selection-end'),
    }, selected);
    await page.keyboard.insertText('shared');
    await frame.getByText('Hello 😀日!本@# shared Markdown', { exact: false }).waitFor();
    assert.equal(Number(await editor.getAttribute('data-intent-count')), 5);
    assert.deepEqual(JSON.parse(await frame.getByLabel('Last semantic splice').textContent()), {
      index: drag.start,
      deleteCount: 'Collaborative'.length,
      insert: 'shared',
    });
    assert.equal(await editor.getAttribute('aria-multiline'), 'true');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(JSON.stringify({ modes: ['default', 'forced-polyfill'], markdownEditor: 'pass' }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
