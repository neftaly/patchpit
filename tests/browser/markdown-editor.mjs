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
  for (const mode of ['default', 'forced-polyfill']) {
    const context = await browser.newContext();
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
    assert.equal(await frame.locator('html').getAttribute('data-input-mode'), mode);
    const editorApp = frame.locator('.editor-app');
    const revision = () => editorApp.getAttribute('data-document-revision');
    const waitForCommit = async (before) => {
      await frame.locator(`.editor-app:not([data-document-revision="${before}"])`).waitFor({ timeout: 10_000 })
        .catch(async (cause) => {
          throw new Error(JSON.stringify({
            before,
            body: await frame.locator('body').textContent(),
            revision: await revision(),
            syncState: await editorApp.getAttribute('data-sync-state'),
          }), { cause });
        });
      await frame.getByText('Applied', { exact: true }).waitFor();
      return revision();
    };
    assert.equal(await frame.getByRole('list', { name: 'Present editors' }).locator('li', {
      hasText: /^You · User [0-9A-F]{4}$/u,
    }).count(), 1);
    assert.equal(await frame.locator('h1, output, pre').count(), 0);
    let peerPage;
    let peerFrame;
    let peerEditor;
    if (mode === 'default') {
      await page.waitForFunction(() => location.hash.includes('src'));
      peerPage = await context.newPage();
      await peerPage.goto(page.url());
      await peerPage.locator('button.resource', { hasText: 'Markdown editor' }).waitFor();
      await peerPage.locator('button.resource', { hasText: 'Markdown editor' }).click();
      const peerAppFrame = peerPage.locator('iframe[title="Markdown editor app"]');
      await peerAppFrame.waitFor();
      peerFrame = peerAppFrame.contentFrame();
      peerEditor = peerFrame.getByRole('textbox', { name: 'Markdown source' });
      await peerEditor.waitFor();
      await peerFrame.getByRole('list', { name: 'Present editors' }).locator('li').nth(1).waitFor();
      await frame.getByRole('list', { name: 'Present editors' }).locator('li').nth(1).waitFor();
      const localNames = (await frame.getByRole('list', { name: 'Present editors' })
        .locator('li').allTextContents()).map(displayName);
      const peerNames = (await peerFrame.getByRole('list', { name: 'Present editors' })
        .locator('li').allTextContents()).map(displayName);
      assert.equal(new Set([...localNames, ...peerNames]).size, 1);
      const participantLists = [frame, peerFrame].map((participantFrame) =>
        participantFrame.getByRole('list', { name: 'Present editors' }).locator('li.participant'));
      const colorClasses = (await Promise.all(participantLists.map((participants) =>
        participants.evaluateAll((items) => items.map((item) => [...item.classList]
          .find((className) => /^participant-\d$/u.test(className))))))).flat();
      assert(colorClasses.every((colorClass) => colorClass !== undefined));
      assert.equal(new Set(colorClasses).size, 1);
    }
    await editor.focus();
    const caretLayout = await editor.evaluate((root) => {
      const caret = root.querySelector('.caret');
      if (!(caret instanceof HTMLElement)) throw new Error('Editor caret is unavailable');
      const measure = () => [root.offsetWidth, root.offsetHeight, root.scrollWidth, root.scrollHeight];
      const visible = measure();
      caret.style.display = 'none';
      const hidden = measure();
      caret.style.removeProperty('display');
      const firstText = root.querySelector('.editor-text span:last-child')?.firstChild;
      if (firstText === null || firstText === undefined) throw new Error('Editor text is unavailable');
      const firstCharacter = document.createRange();
      firstCharacter.setStart(firstText, 0);
      firstCharacter.setEnd(firstText, 1);
      const expected = firstCharacter.getBoundingClientRect();
      const positioned = caret.getBoundingClientRect();
      return {
        hidden,
        visible,
        positionError: [positioned.height - expected.height, positioned.left - expected.left,
          positioned.top - expected.top].map(Math.abs),
      };
    });
    assert.deepEqual(caretLayout.visible, caretLayout.hidden);
    caretLayout.positionError.forEach((error) =>
      assert(error < 1, JSON.stringify(caretLayout.positionError)));
    let committedRevision = await revision();
    assert.notEqual(committedRevision, null);
    await page.keyboard.insertText('Hello 😀');
    await frame.getByText('Hello 😀# Collaborative Markdown', { exact: false }).waitFor();
    committedRevision = await waitForCommit(committedRevision);
    const client = await page.context().newCDPSession(page);
    await client.send('Input.imeSetComposition', {
      text: 'に',
      selectionStart: 1,
      selectionEnd: 1,
    });
    await frame.getByText('Hello 😀に# Collaborative Markdown', { exact: false }).waitFor();
    assert.equal(await revision(), committedRevision);
    await client.send('Input.imeSetComposition', {
      text: '日本',
      selectionStart: 2,
      selectionEnd: 2,
    });
    assert.equal(await revision(), committedRevision);
    await client.send('Input.insertText', { text: '日本' });
    await frame.getByText('Hello 😀日本# Collaborative Markdown', { exact: false }).waitFor();
    committedRevision = await waitForCommit(committedRevision);
    await editor.press('ArrowLeft');
    await page.keyboard.insertText('!');
    await frame.getByText('Hello 😀日!本# Collaborative Markdown', { exact: false }).waitFor({ timeout: 10_000 })
      .catch(async (cause) => {
        throw new Error(JSON.stringify({
          mode,
          selection: {
            start: await editor.getAttribute('data-selection-start'),
            end: await editor.getAttribute('data-selection-end'),
          },
          text: await editor.locator('.editor-text').textContent(),
        }), { cause });
      });
    committedRevision = await waitForCommit(committedRevision);
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
    committedRevision = await waitForCommit(committedRevision);
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
    committedRevision = await waitForCommit(committedRevision);
    assert.notEqual(committedRevision, null);
    let finalText = 'Hello 😀日!本@# shared Markdown';
    if (peerPage !== undefined && peerFrame !== undefined && peerEditor !== undefined) {
      await peerFrame.getByText(finalText, { exact: false }).waitFor();
      await peerEditor.focus();
      const peerRevision = await peerFrame.locator('.editor-app').getAttribute('data-document-revision');
      assert.notEqual(peerRevision, null);
      await peerPage.keyboard.insertText('Peer ');
      finalText = `Peer ${finalText}`;
      await peerFrame.getByText(finalText, { exact: false }).waitFor();
      await peerFrame.locator(`.editor-app:not([data-document-revision="${peerRevision}"])`).waitFor();
      await frame.getByText(finalText, { exact: false }).waitFor();
      await frame.locator('.remote-caret').waitFor();
      const remoteLayout = await editor.evaluate((root) => {
        const paint = root.querySelector('.remote-paint');
        if (!(paint instanceof HTMLElement)) throw new Error('Remote paint is unavailable');
        const measure = () => [root.offsetWidth, root.offsetHeight, root.scrollWidth, root.scrollHeight];
        const visible = measure();
        paint.style.display = 'none';
        const hidden = measure();
        paint.style.removeProperty('display');
        return { hidden, visible };
      });
      assert.deepEqual(remoteLayout.visible, remoteLayout.hidden);
      await editor.focus();
      const compositionBasisRevision = await revision();
      assert.notEqual(compositionBasisRevision, null);
      await client.send('Input.imeSetComposition', {
        text: 'Ω',
        selectionStart: 1,
        selectionEnd: 1,
      });
      const peerCompositionBasisRevision = await peerFrame.locator('.editor-app')
        .getAttribute('data-document-revision');
      assert.notEqual(peerCompositionBasisRevision, null);
      await peerEditor.evaluate((root) => {
        root.editContext.dispatchEvent(new TextUpdateEvent('textupdate', {
          updateRangeStart: 0,
          updateRangeEnd: 0,
          text: 'Remote ',
          selectionStart: 7,
          selectionEnd: 7,
        }));
      });
      await peerFrame.locator(
        `.editor-app:not([data-document-revision="${peerCompositionBasisRevision}"])`,
      ).waitFor();
      await frame.locator(
        `.editor-app:not([data-document-revision="${compositionBasisRevision}"])`,
      ).waitFor();
      const concurrentRevision = await revision();
      assert.notEqual(concurrentRevision, null);
      await client.send('Input.insertText', { text: 'Ω' });
      await waitForCommit(concurrentRevision);
      assert.equal(await editor.getAttribute('aria-readonly'), 'false');
      const mergedText = await editor.locator('.editor-text').textContent() ?? '';
      assert(mergedText.includes('Ω'));
      assert(mergedText.includes('Remote '));
      await peerFrame.getByText(mergedText, { exact: true }).waitFor();
      const resolvedSelection = {
        start: Number(await editor.getAttribute('data-selection-start')),
        end: Number(await editor.getAttribute('data-selection-end')),
      };
      assert(resolvedSelection.start >= 0 && resolvedSelection.start <= mergedText.length);
      assert(resolvedSelection.end >= 0 && resolvedSelection.end <= mergedText.length);
      finalText = await peerEditor.locator('.editor-text').textContent() ?? '';
      assert.equal(finalText, mergedText);
      await peerPage.close();
      await frame.getByRole('list', { name: 'Present editors' }).locator('li').nth(1).waitFor({
        state: 'detached',
      });
    }
    assert.equal(await editor.getAttribute('aria-multiline'), 'true');
    await page.getByRole('button', { name: 'Close Markdown editor / index.html' }).click();
    await page.locator('button.resource', { hasText: 'Markdown editor' }).click();
    const reopenedFrame = page.locator('iframe[title="Markdown editor app"]').contentFrame();
    await reopenedFrame.getByRole('textbox', { name: 'Markdown source' }).waitFor();
    await reopenedFrame.getByText(finalText, { exact: false }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    await context.close();
  }
  console.log(JSON.stringify({ modes: ['default', 'forced-polyfill'], markdownEditor: 'pass' }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}

function displayName(label) {
  return label.replace(/^You · /u, '').trim();
}
