import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const installedChromium = chromium.executablePath();
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ?? (existsSync(installedChromium) ? installedChromium : '/usr/bin/chromium');
const port = Number(process.env.PATCHPIT_EDITOR_ACTION_TEST_PORT ?? 5176);
const server = await createServer({
  logLevel: 'silent',
  server: { host: '127.0.0.1', port, strictPort: true },
});
await server.listen();

const failures = [];
const passes = [];
const caseFilter = process.env.PATCHPIT_EDITOR_ACTION_FILTER;
let browser;

const pause = (milliseconds) => new Promise((resolve) => { setTimeout(resolve, milliseconds); });

const eventually = async (probe, message, timeout = 750) => {
  const deadline = performance.now() + timeout;
  let value = await probe();
  while (!value && performance.now() < deadline) {
    await pause(25);
    value = await probe();
  }
  assert(value, message);
};

const record = async (name, action) => {
  if (caseFilter !== undefined && !name.includes(caseFilter)) return;
  console.log(`RUN ${name}`);
  try {
    await action();
    passes.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({
      name,
      message: error instanceof Error ? error.message : String(error),
    });
    console.log(`FAIL ${name}`);
  }
};

const openEditor = async (context, mode, sourceUrl) => {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => { pageErrors.push(error.message); });
  await page.goto(sourceUrl ?? `http://127.0.0.1:${port}/`);
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
  await editor.waitFor({ timeout: 10_000 });
  return {
    app: frame.locator('.editor-app'),
    appFrame,
    editor,
    frame,
    mode,
    page,
    pageErrors,
  };
};

const editorText = (editor) => editor.locator('.editor-text').textContent();
const revision = (editor) => editor.app.getAttribute('data-document-revision');
const selection = async (editor) => ({
  start: Number(await editor.editor.getAttribute('data-selection-start')),
  end: Number(await editor.editor.getAttribute('data-selection-end')),
});

const waitForRevisionChange = async (editor, before) => {
  await eventually(async () => {
    const current = await revision(editor);
    return current !== null && current !== before;
  }, `document revision did not advance from ${before}`, 8_000);
  await editor.frame.getByText('Applied', { exact: true }).waitFor({ timeout: 8_000 });
};

const dispatchTextUpdate = async (editor, text, nextSelection) => {
  await editor.editor.evaluate((root, input) => {
    if (root.editContext === null) throw new Error('EditContext is detached');
    const renderedLength = root.querySelector('.editor-text')?.textContent?.length;
    if (renderedLength === undefined) throw new Error('Rendered editor text is unavailable');
    root.editContext.updateText(0, root.editContext.text.length, input.text);
    root.editContext.dispatchEvent(new TextUpdateEvent('textupdate', {
      updateRangeStart: 0,
      updateRangeEnd: renderedLength,
      text: input.text,
      selectionStart: input.selection.start,
      selectionEnd: input.selection.end,
    }));
  }, { text, selection: nextSelection });
};

const setFixture = async (editor, text, nextSelection) => {
  await eventually(
    async () => await editor.app.getAttribute('data-sync-state') !== 'applying',
    'harness setup timed out waiting for the prior transaction',
    8_000,
  );
  assert.notEqual(
    await editor.app.getAttribute('data-sync-state'),
    'unsaved',
    'harness setup cannot reset a deliberately retained local draft',
  );
  const beforeText = await editorText(editor.editor);
  const beforeRevision = await revision(editor);
  await dispatchTextUpdate(editor, text, nextSelection);
  await eventually(
    async () => await editorText(editor.editor) === text,
    `harness fixture text was not adopted: ${JSON.stringify(text)}`,
    8_000,
  );
  if (beforeText !== text) await waitForRevisionChange(editor, beforeRevision);
  if (JSON.stringify(await selection(editor)) !== JSON.stringify(nextSelection)) {
    await dispatchTextUpdate(editor, text, nextSelection);
  }
  await eventually(
    async () => JSON.stringify(await selection(editor)) === JSON.stringify(nextSelection),
    `harness fixture selection was not adopted: ${JSON.stringify(nextSelection)}`,
    8_000,
  );
};

const referenceKeyboardAction = async (editor, text, initialSelection, action) => {
  await editor.frame.locator('body').evaluate((_body, { selection: referenceSelection, value }) => {
    const before = document.createElement('button');
    const textarea = document.createElement('textarea');
    const after = document.createElement('button');
    before.dataset.referenceBefore = '';
    textarea.dataset.referenceEditor = '';
    after.dataset.referenceAfter = '';
    Object.assign(textarea.style, {
      position: 'fixed',
      inset: '0 auto auto 0',
      width: '24rem',
      height: '12rem',
      font: '16px/24px monospace',
      opacity: '0.01',
      zIndex: '2147483647',
    });
    textarea.value = value;
    document.body.append(before, textarea, after);
    textarea.focus();
    textarea.setSelectionRange(
      Math.min(referenceSelection.start, referenceSelection.end),
      Math.max(referenceSelection.start, referenceSelection.end),
      referenceSelection.start > referenceSelection.end ? 'backward' : 'forward',
    );
  }, { value: text, selection: initialSelection });
  await action(editor.page.keyboard);
  return editor.frame.locator('body').evaluate(() => {
    const textarea = document.querySelector('[data-reference-editor]');
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Reference editor is missing');
    const backward = textarea.selectionDirection === 'backward';
    const result = {
      text: textarea.value,
      selection: {
        start: backward ? textarea.selectionEnd : textarea.selectionStart,
        end: backward ? textarea.selectionStart : textarea.selectionEnd,
      },
    };
    document.querySelector('[data-reference-before]')?.remove();
    textarea.remove();
    document.querySelector('[data-reference-after]')?.remove();
    return result;
  });
};

const keyboardCase = async (editor, name, text, initialSelection, action) => {
  await record(`${editor.mode}: keyboard: ${name}`, async () => {
    const expected = await referenceKeyboardAction(editor, text, initialSelection, action);
    await setFixture(editor, text, initialSelection);
    await editor.editor.focus();
    const beforeRevision = await revision(editor);
    await action(editor.page.keyboard);
    await eventually(
      async () => await editorText(editor.editor) === expected.text,
      `expected text ${JSON.stringify(expected.text)}, received ${JSON.stringify(await editorText(editor.editor))}`,
    );
    await eventually(
      async () => JSON.stringify(await selection(editor)) === JSON.stringify(expected.selection),
      `expected selection ${JSON.stringify(expected.selection)}, received ${JSON.stringify(await selection(editor))}`,
    );
    if (expected.text !== text) await waitForRevisionChange(editor, beforeRevision);
    else assert.equal(await revision(editor), beforeRevision);
    assert.deepEqual(editor.pageErrors, []);
  });
};

const offsetPoint = (editor, offset, edge = 'start') => editor.editor.evaluate(
  (root, input) => {
    const textRoot = root.querySelector('.editor-text');
    if (!(textRoot instanceof HTMLElement)) throw new Error('Editor text is unavailable');
    const rootBounds = root.getBoundingClientRect();
    const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
    let traversed = 0;
    let lastNode;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const length = node.textContent?.length ?? 0;
      lastNode = node;
      if (input.offset <= traversed + length) {
        const localOffset = input.offset - traversed;
        const range = document.createRange();
        if (localOffset < length) {
          range.setStart(node, localOffset);
          range.setEnd(node, localOffset + 1);
          const bounds = range.getBoundingClientRect();
          return {
            x: (input.edge === 'end' ? bounds.right - 1 : bounds.left + 1) - rootBounds.left,
            y: bounds.top + (bounds.height / 2) - rootBounds.top,
          };
        }
        range.setStart(node, localOffset);
        range.collapse(true);
        const bounds = range.getBoundingClientRect();
        return { x: bounds.left - rootBounds.left, y: bounds.top + (bounds.height / 2) - rootBounds.top };
      }
      traversed += length;
    }
    if (lastNode === undefined) throw new Error('Editor text has no rendered node');
    throw new Error(`Offset ${input.offset} is outside rendered text`);
  },
  { offset, edge },
);

const pointerCase = async (editor, name, text, initialSelection, action, expectedSelection) => {
  await record(`${editor.mode}: pointer: ${name}`, async () => {
    await setFixture(editor, text, initialSelection);
    await editor.editor.focus();
    const beforeText = await editorText(editor.editor);
    const beforeRevision = await revision(editor);
    await action();
    await eventually(
      async () => JSON.stringify(await selection(editor)) === JSON.stringify(expectedSelection),
      `expected selection ${JSON.stringify(expectedSelection)}, received ${JSON.stringify(await selection(editor))}`,
    );
    assert.equal(await editorText(editor.editor), beforeText);
    assert.equal(await revision(editor), beforeRevision);
    assert.deepEqual(editor.pageErrors, []);
  });
};

const passiveSnapshot = async (editor) => ({
  text: await editorText(editor.editor),
  revision: await revision(editor),
  selection: await selection(editor),
  participants: await editor.frame.getByRole('list', { name: 'Present editors' }).locator('li').allTextContents(),
  remoteCarets: await editor.frame.locator('.remote-caret').count(),
  remoteSelections: await editor.frame.locator('.remote-selection').count(),
});

const runKeyboardCorpus = async (editor) => {
  const collapsed = { start: 1, end: 1 };
  await keyboardCase(editor, 'printable key', 'abc', collapsed, (keyboard) => keyboard.press('x'));
  await keyboardCase(editor, 'physical key sequence', 'abc', collapsed, (keyboard) => keyboard.type('Az ?'));
  await keyboardCase(editor, 'Space', 'abc', collapsed, (keyboard) => keyboard.press('Space'));
  await keyboardCase(editor, 'Enter inserts a line', 'abc', collapsed, (keyboard) => keyboard.press('Enter'));
  await keyboardCase(editor, 'Shift+Enter inserts a line', 'abc', collapsed, (keyboard) => keyboard.press('Shift+Enter'));
  await keyboardCase(
    editor,
    'Enter replaces a forward selection',
    'alpha beta',
    { start: 2, end: 7 },
    (keyboard) => keyboard.press('Enter'),
  );
  await keyboardCase(
    editor,
    'Enter replaces a reverse selection',
    'alpha beta',
    { start: 8, end: 2 },
    (keyboard) => keyboard.press('Enter'),
  );
  await keyboardCase(editor, 'Backspace', 'abc', { start: 2, end: 2 }, (keyboard) => keyboard.press('Backspace'));
  await keyboardCase(editor, 'Backspace at document start is a no-op', 'abc', { start: 0, end: 0 }, (keyboard) => keyboard.press('Backspace'));
  await keyboardCase(editor, 'Delete', 'abc', collapsed, (keyboard) => keyboard.press('Delete'));
  await keyboardCase(
    editor,
    'Backspace deletes a forward selection',
    'alpha beta',
    { start: 2, end: 7 },
    (keyboard) => keyboard.press('Backspace'),
  );
  await keyboardCase(
    editor,
    'Delete deletes a reverse selection',
    'alpha beta',
    { start: 8, end: 2 },
    (keyboard) => keyboard.press('Delete'),
  );
  await keyboardCase(
    editor,
    'Backspace joins lines at a line start',
    'one\ntwo',
    { start: 4, end: 4 },
    (keyboard) => keyboard.press('Backspace'),
  );
  await keyboardCase(
    editor,
    'Delete joins lines at a line end',
    'one\ntwo',
    { start: 3, end: 3 },
    (keyboard) => keyboard.press('Delete'),
  );
  await keyboardCase(
    editor,
    'Backspace removes one emoji grapheme',
    'A👍🏽B',
    { start: 5, end: 5 },
    (keyboard) => keyboard.press('Backspace'),
  );
  await keyboardCase(
    editor,
    'Delete removes one joined emoji grapheme',
    'A👨‍👩‍👧‍👦B',
    { start: 1, end: 1 },
    (keyboard) => keyboard.press('Delete'),
  );
  await keyboardCase(
    editor,
    'typing replaces a reverse selection',
    'alpha beta',
    { start: 8, end: 2 },
    (keyboard) => keyboard.press('Z'),
  );
  await keyboardCase(
    editor,
    'select all then type',
    'alpha beta',
    { start: 3, end: 3 },
    async (keyboard) => {
      await keyboard.press('Control+A');
      await keyboard.press('Z');
    },
  );
  await keyboardCase(
    editor,
    'Left crosses a joined emoji as one grapheme',
    'A👨‍👩‍👧‍👦B',
    { start: 12, end: 12 },
    (keyboard) => keyboard.press('ArrowLeft'),
  );
  await keyboardCase(
    editor,
    'Shift+Left extends a reverse selection',
    'A👍🏽BC',
    { start: 7, end: 7 },
    async (keyboard) => {
      await keyboard.press('Shift+ArrowLeft');
      await keyboard.press('Shift+ArrowLeft');
    },
  );
  await keyboardCase(
    editor,
    'Left collapses a forward selection',
    'alpha beta',
    { start: 2, end: 7 },
    (keyboard) => keyboard.press('ArrowLeft'),
  );
  await keyboardCase(
    editor,
    'Right collapses a reverse selection',
    'alpha beta',
    { start: 8, end: 2 },
    (keyboard) => keyboard.press('ArrowRight'),
  );
  await keyboardCase(
    editor,
    'Left crosses a combining grapheme',
    'AéB',
    { start: 3, end: 3 },
    (keyboard) => keyboard.press('ArrowLeft'),
  );
  await keyboardCase(editor, 'Home', 'one\ntwo\nthree', { start: 6, end: 6 }, (keyboard) => keyboard.press('Home'));
  await keyboardCase(editor, 'End', 'one\ntwo\nthree', { start: 5, end: 5 }, (keyboard) => keyboard.press('End'));
  await keyboardCase(
    editor,
    'ArrowUp retains visual column',
    'abcde\nABCDE\n12345',
    { start: 9, end: 9 },
    (keyboard) => keyboard.press('ArrowUp'),
  );
  await keyboardCase(
    editor,
    'ArrowDown retains visual column',
    'abcde\nABCDE\n12345',
    { start: 9, end: 9 },
    (keyboard) => keyboard.press('ArrowDown'),
  );
  await keyboardCase(
    editor,
    'Control+Home reaches document start',
    'one\ntwo\nthree',
    { start: 6, end: 6 },
    (keyboard) => keyboard.press('Control+Home'),
  );
  await keyboardCase(
    editor,
    'Control+End reaches document end',
    'one\ntwo\nthree',
    { start: 2, end: 2 },
    (keyboard) => keyboard.press('Control+End'),
  );
  await keyboardCase(
    editor,
    'Control+Right follows platform word navigation',
    'one two three',
    { start: 0, end: 0 },
    (keyboard) => keyboard.press('Control+ArrowRight'),
  );
  await keyboardCase(
    editor,
    'Control+Left follows platform word navigation',
    'one two three',
    { start: 7, end: 7 },
    (keyboard) => keyboard.press('Control+ArrowLeft'),
  );
  await keyboardCase(
    editor,
    'Control+Shift+Right extends by a platform word',
    'one two three',
    { start: 0, end: 0 },
    (keyboard) => keyboard.press('Control+Shift+ArrowRight'),
  );
  await keyboardCase(
    editor,
    'Control+Shift+Left extends by a platform word',
    'one two three',
    { start: 7, end: 7 },
    (keyboard) => keyboard.press('Control+Shift+ArrowLeft'),
  );
  await keyboardCase(
    editor,
    'Control+Backspace follows platform word deletion',
    'one two three',
    { start: 7, end: 7 },
    (keyboard) => keyboard.press('Control+Backspace'),
  );
  await keyboardCase(
    editor,
    'Control+Delete follows platform word deletion',
    'one two three',
    { start: 4, end: 4 },
    (keyboard) => keyboard.press('Control+Delete'),
  );
  await keyboardCase(
    editor,
    'RTL text input uses the active selection',
    'abc אבג',
    { start: 4, end: 4 },
    (keyboard) => keyboard.type('ש '),
  );
  await keyboardCase(
    editor,
    'repeated physical keys retain order',
    'abc',
    { start: 1, end: 1 },
    async (keyboard) => {
      await keyboard.press('x');
      await keyboard.press('x');
    },
  );
  await record(`${editor.mode}: keyboard: Tab leaves the editor`, async () => {
    await setFixture(editor, 'alpha', { start: 2, end: 2 });
    await editor.editor.focus();
    const before = await passiveSnapshot(editor);
    await editor.page.keyboard.press('Tab');
    assert.equal(await editor.editor.evaluate((root) => document.activeElement === root), false);
    const after = await passiveSnapshot(editor);
    assert.equal(after.text, before.text);
    assert.equal(after.revision, before.revision);
    assert.deepEqual(after.selection, before.selection);
  });
  await record(`${editor.mode}: keyboard: Shift+Tab leaves the editor`, async () => {
    await setFixture(editor, 'alpha', { start: 2, end: 2 });
    await editor.editor.focus();
    const before = await passiveSnapshot(editor);
    await editor.page.keyboard.press('Shift+Tab');
    assert.equal(await editor.editor.evaluate((root) => document.activeElement === root), false);
    const after = await passiveSnapshot(editor);
    assert.equal(after.text, before.text);
    assert.equal(after.revision, before.revision);
    assert.deepEqual(after.selection, before.selection);
  });
  await record(`${editor.mode}: keyboard: undo remains deliberately unavailable`, async () => {
    await setFixture(editor, 'alpha', { start: 2, end: 2 });
    await editor.editor.focus();
    const before = await passiveSnapshot(editor);
    await editor.page.keyboard.press('Control+Z');
    assert.deepEqual(await passiveSnapshot(editor), before);
  });
};

const runPointerCorpus = async (editor) => {
  const text = 'one two\nthree four';
  await pointerCase(
    editor,
    'primary click places the caret',
    text,
    { start: 0, end: 0 },
    async () => editor.editor.click({ position: await offsetPoint(editor, 5) }),
    { start: 5, end: 5 },
  );
  await pointerCase(
    editor,
    'reverse drag preserves direction',
    text,
    { start: 0, end: 0 },
    async () => {
      const bounds = await editor.editor.boundingBox();
      assert.notEqual(bounds, null);
      const from = await offsetPoint(editor, 17);
      const to = await offsetPoint(editor, 8);
      await editor.page.mouse.move(bounds.x + from.x, bounds.y + from.y);
      await editor.page.mouse.down();
      await editor.page.mouse.move(bounds.x + to.x, bounds.y + to.y, { steps: 5 });
      await editor.page.mouse.up();
    },
    { start: 17, end: 8 },
  );
  await pointerCase(
    editor,
    'Shift+click extends from the existing anchor',
    text,
    { start: 1, end: 1 },
    async () => editor.editor.click({
      modifiers: ['Shift'],
      position: await offsetPoint(editor, 6),
    }),
    { start: 1, end: 6 },
  );
  await record(`${editor.mode}: pointer: double click selects a word`, async () => {
    await setFixture(editor, text, { start: 0, end: 0 });
    await editor.editor.click({ clickCount: 2, position: await offsetPoint(editor, 5) });
    assert.equal(
      await editor.editor.evaluate((root) => root.querySelector('.selection')?.textContent),
      'two',
    );
  });
  await record(`${editor.mode}: pointer: triple click selects a logical line`, async () => {
    await setFixture(editor, text, { start: 0, end: 0 });
    await editor.editor.click({ clickCount: 3, position: await offsetPoint(editor, 11) });
    assert.equal(
      await editor.editor.evaluate((root) => root.querySelector('.selection')?.textContent),
      'three four',
    );
  });
  await pointerCase(
    editor,
    'primary click places a caret at document end',
    text,
    { start: 0, end: 0 },
    async () => editor.editor.click({ position: await offsetPoint(editor, text.length) }),
    { start: text.length, end: text.length },
  );
  await record(`${editor.mode}: pointer: hover is passive without peers`, async () => {
    await setFixture(editor, text, { start: 4, end: 7 });
    const before = await passiveSnapshot(editor);
    await editor.editor.hover({ position: await offsetPoint(editor, 12) });
    await pause(150);
    assert.deepEqual(await passiveSnapshot(editor), before);
  });
  await record(`${editor.mode}: pointer: non-primary buttons preserve selection`, async () => {
    await setFixture(editor, text, { start: 4, end: 7 });
    await editor.editor.focus();
    const before = await passiveSnapshot(editor);
    const position = await offsetPoint(editor, 12);
    await editor.editor.click({ button: 'middle', position });
    await editor.editor.click({ button: 'right', position });
    assert.deepEqual(await passiveSnapshot(editor), before);
  });
};

const runClipboardCorpus = async (editor) => {
  await record(`${editor.mode}: clipboard: copy is non-mutating`, async () => {
    await setFixture(editor, 'alpha beta', { start: 0, end: 5 });
    await editor.editor.focus();
    const before = await passiveSnapshot(editor);
    await editor.page.keyboard.press('Control+C');
    assert.equal(await editor.frame.locator('body').evaluate(() => navigator.clipboard.readText()), 'alpha');
    assert.deepEqual(await passiveSnapshot(editor), before);
  });
  await record(`${editor.mode}: clipboard: cut removes the selection`, async () => {
    await setFixture(editor, 'alpha beta', { start: 0, end: 5 });
    await editor.editor.focus();
    const beforeRevision = await revision(editor);
    await editor.page.keyboard.press('Control+X');
    await eventually(async () => await editorText(editor.editor) === ' beta', 'cut did not remove the selection');
    await waitForRevisionChange(editor, beforeRevision);
    assert.equal(await editor.frame.locator('body').evaluate(() => navigator.clipboard.readText()), 'alpha');
  });
  await record(`${editor.mode}: clipboard: multiline plain-text paste replaces the selection`, async () => {
    await setFixture(editor, 'alpha beta', { start: 6, end: 10 });
    await editor.frame.locator('body').evaluate(() => navigator.clipboard.writeText('one\ntwo'));
    await editor.editor.focus();
    const beforeRevision = await revision(editor);
    await editor.page.keyboard.press('Control+V');
    await eventually(
      async () => await editorText(editor.editor) === 'alpha one\ntwo',
      'multiline paste did not replace the selection',
    );
    await waitForRevisionChange(editor, beforeRevision);
  });
  await record(`${editor.mode}: clipboard: rich paste uses only its plain-text representation`, async () => {
    await setFixture(editor, 'alpha beta', { start: 6, end: 10 });
    const beforeRevision = await revision(editor);
    await editor.editor.evaluate((root) => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/plain', 'plain');
      clipboard.setData('text/html', '<strong>rich</strong>');
      root.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }));
    });
    await eventually(
      async () => await editorText(editor.editor) === 'alpha plain',
      'rich paste did not use its plain-text representation',
    );
    await waitForRevisionChange(editor, beforeRevision);
  });
  await record(`${editor.mode}: drag and drop is non-mutating`, async () => {
    await setFixture(editor, 'alpha beta', { start: 2, end: 7 });
    const before = await passiveSnapshot(editor);
    const prevented = await editor.editor.evaluate((root) => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'replacement');
      transfer.setData('text/uri-list', 'https://example.com/resource');
      const dragover = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });
      const drop = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });
      return !root.dispatchEvent(dragover) && !root.dispatchEvent(drop);
    });
    assert.equal(prevented, true);
    assert.deepEqual(await passiveSnapshot(editor), before);
  });
};

const ensureRemoteSelection = async (local, peer, text, peerSelection) => {
  await setFixture(local, text, { start: 0, end: 0 });
  await eventually(async () => await editorText(peer.editor) === text, 'peer did not adopt fixture', 8_000);
  await dispatchTextUpdate(peer, text, peerSelection);
  await peer.editor.focus();
  await eventually(
    async () => await local.frame.locator('.remote-caret').count() === 1,
    'remote caret did not appear',
    8_000,
  );
};

const remoteStableCase = async (local, peer, name, action, options = {}) => {
  await record(`default: presence: ${name}`, async () => {
    const text = options.text ?? 'one two\nthree four';
    const peerSelection = options.peerSelection ?? { start: 4, end: 7 };
    await ensureRemoteSelection(local, peer, text, peerSelection);
    const before = await passiveSnapshot(local);
    assert.equal(before.remoteCarets, 1);
    assert(before.remoteSelections > 0);
    await action();
    await pause(options.pause ?? 200);
    const after = await passiveSnapshot(local);
    assert.equal(after.text, before.text);
    assert.equal(after.revision, before.revision);
    assert.deepEqual(after.participants, before.participants);
    assert.equal(after.remoteCarets, before.remoteCarets);
    assert.equal(after.remoteSelections, before.remoteSelections);
    assert.equal(await local.frame.locator('.remote-caret').isVisible(), true);
  });
};

const runPresenceCorpus = async (context, local) => {
  await local.page.waitForFunction(() => location.hash.includes('src'));
  const peer = await openEditor(context, 'default', local.page.url());
  try {
    await eventually(
      async () => await local.frame.getByRole('list', { name: 'Present editors' }).locator('li').count() === 2,
      'peer did not join local participant list',
      8_000,
    );
    await remoteStableCase(local, peer, 'hover over editor text preserves remote paint', async () => {
      await local.editor.hover({ position: await offsetPoint(local, 12) });
    });
    await remoteStableCase(local, peer, 'hover over blank editor padding preserves remote paint', async () => {
      const size = await local.editor.evaluate((root) => ({ width: root.clientWidth, height: root.clientHeight }));
      await local.editor.hover({ position: { x: size.width - 6, y: size.height - 6 } });
    });
    await remoteStableCase(local, peer, 'hover over remote caret preserves remote paint', async () => {
      const bounds = await local.frame.locator('.remote-caret').boundingBox();
      assert.notEqual(bounds, null);
      await local.page.mouse.move(bounds.x, bounds.y + Math.max(1, bounds.height / 2));
    });
    await remoteStableCase(local, peer, 'hover over participant status preserves remote paint', async () => {
      await local.frame.locator('.editor-status').hover();
    });
    await remoteStableCase(local, peer, 'local focus preserves remote paint', async () => {
      await local.editor.focus();
    });
    await remoteStableCase(local, peer, 'local keyboard selection preserves remote paint', async () => {
      await local.editor.focus();
      await local.page.keyboard.press('ArrowRight');
    });
    await remoteStableCase(local, peer, 'local primary click preserves remote paint', async () => {
      await local.editor.click({ position: await offsetPoint(local, 10) });
    });
    await remoteStableCase(local, peer, 'viewport resize preserves remote paint', async () => {
      await local.page.setViewportSize({ width: 900, height: 620 });
    });
    await remoteStableCase(
      local,
      peer,
      'scrolling preserves remote paint',
      async () => {
        await local.editor.evaluate((root) => { root.scrollTop = root.scrollHeight; });
      },
      {
        text: Array.from({ length: 80 }, (_, index) => `line ${index}`).join('\n'),
        peerSelection: { start: 3, end: 9 },
      },
    );
    await remoteStableCase(
      local,
      peer,
      'hover remains stable across a presence heartbeat',
      async () => { await local.editor.hover({ position: await offsetPoint(local, 5) }); },
      { pause: 5_500 },
    );
    await record('default: presence: remote reverse selection retains direction and paint', async () => {
      await ensureRemoteSelection(local, peer, 'one two\nthree four', { start: 15, end: 8 });
      assert.equal(await local.frame.locator('.remote-caret').count(), 1);
      assert(await local.frame.locator('.remote-selection').count() > 0);
    });
    await record('default: presence: peer blur preserves paint and participant', async () => {
      await ensureRemoteSelection(local, peer, 'one two\nthree four', { start: 4, end: 7 });
      await peer.page.locator('button.resource', { hasText: 'demo.md' }).focus();
      await pause(200);
      assert.equal(await local.frame.locator('.remote-caret').count(), 1);
      assert.equal(
        await local.frame.getByRole('list', { name: 'Present editors' }).locator('li').count(),
        2,
      );
    });
    await record('default: presence: peer blur then local hover preserves paint', async () => {
      await ensureRemoteSelection(local, peer, 'one two\nthree four', { start: 4, end: 7 });
      await peer.page.locator('button.resource', { hasText: 'demo.md' }).focus();
      await local.editor.hover({ position: await offsetPoint(local, 10) });
      await pause(200);
      assert.equal(await local.frame.locator('.remote-caret').count(), 1);
      assert(await local.frame.locator('.remote-selection').count() > 0);
    });
    await record('default: presence: peer refocus retains paint', async () => {
      await peer.editor.focus();
      await eventually(
        async () => await local.frame.locator('.remote-caret').count() === 1,
        'remote caret was not present after peer refocus',
        8_000,
      );
    });
    await record('default: presence: local blur remains visible to its peer', async () => {
      await ensureRemoteSelection(peer, local, 'one two\nthree four', { start: 4, end: 7 });
      await local.frame.locator('.editor-status').click();
      await pause(200);
      assert.equal(await peer.frame.locator('.remote-caret').count(), 1);
      assert(await peer.frame.locator('.remote-selection').count() > 0);
    });
    await record('default: presence: normal peer close removes only that participant', async () => {
      const durableText = await editorText(local.editor);
      await peer.page.getByRole('button', { name: 'Close Markdown editor / index.html' }).click();
      await eventually(
        async () => await local.frame.getByRole('list', { name: 'Present editors' }).locator('li').count() === 1,
        'closed peer remained in participant list',
        2_000,
      );
      assert.equal(await editorText(local.editor), durableText);
      await peer.page.locator('button.resource', { hasText: 'Markdown editor' }).click();
      await peer.editor.waitFor();
      await eventually(
        async () => await local.frame.getByRole('list', { name: 'Present editors' }).locator('li').count() === 2,
        'reopened peer did not rejoin participant list',
        8_000,
      );
    });
    await record('default: presence: closed peer expires within the bounded fallback', async () => {
      const durableText = await editorText(local.editor);
      await peer.page.close();
      await eventually(
        async () => await local.frame.getByRole('list', { name: 'Present editors' }).locator('li').count() === 1,
        'closed peer outlived the presence expiry bound',
        18_000,
      );
      assert.equal(await editorText(local.editor), durableText);
    });
  } finally {
    if (!peer.page.isClosed()) await peer.page.close();
  }
};

const runViewportCorpus = async (editor) => {
  await record(`${editor.mode}: viewport: document-end navigation reveals the caret`, async () => {
    const text = Array.from({ length: 100 }, (_, index) => `line ${index} value`).join('\n');
    await setFixture(editor, text, { start: 0, end: 0 });
    await editor.editor.focus();
    await editor.page.keyboard.press('Control+End');
    await eventually(async () => {
      const state = await editor.editor.evaluate((root) => {
        const caret = root.querySelector('.caret')?.getBoundingClientRect();
        const bounds = root.getBoundingClientRect();
        return caret !== undefined
          && caret !== null
          && root.scrollTop > 0
          && caret.top >= bounds.top
          && caret.bottom <= bounds.bottom;
      });
      return state;
    }, 'document-end navigation did not reveal the caret');
  });
  await record(`${editor.mode}: viewport: hovering does not alter scroll position`, async () => {
    const text = Array.from({ length: 60 }, (_, index) => `line ${index}`).join('\n');
    await setFixture(editor, text, { start: 0, end: 0 });
    await editor.editor.evaluate((root) => { root.scrollTop = root.scrollHeight / 2; });
    const before = await editor.editor.evaluate((root) => ({ left: root.scrollLeft, top: root.scrollTop }));
    await editor.editor.hover({ position: { x: 20, y: 20 } });
    assert.deepEqual(
      await editor.editor.evaluate((root) => ({ left: root.scrollLeft, top: root.scrollTop })),
      before,
    );
  });
  await record(`${editor.mode}: viewport: focusing an offscreen caret reveals it`, async () => {
    const text = Array.from({ length: 80 }, (_, index) => `line ${index} value`).join('\n');
    await setFixture(editor, text, { start: text.length, end: text.length });
    await editor.editor.evaluate((root) => { root.blur(); });
    await editor.editor.evaluate((root) => { root.scrollTop = 0; });
    await editor.editor.focus();
    await eventually(async () => editor.editor.evaluate((root) => {
      const caret = root.querySelector('.caret')?.getBoundingClientRect();
      const bounds = root.getBoundingClientRect();
      return caret !== undefined
        && caret !== null
        && root.scrollTop > 0
        && caret.top >= bounds.top
        && caret.bottom <= bounds.bottom;
    }), 'focusing did not reveal the offscreen caret');
  });
  await record(`${editor.mode}: viewport: editing at an offscreen caret reveals it`, async () => {
    const text = Array.from({ length: 80 }, (_, index) => `line ${index} value`).join('\n');
    await setFixture(editor, text, { start: text.length, end: text.length });
    await editor.editor.evaluate((root) => { root.scrollTop = 0; });
    await editor.editor.focus();
    await editor.page.keyboard.press('x');
    await eventually(async () => editor.editor.evaluate((root) => {
      const caret = root.querySelector('.caret')?.getBoundingClientRect();
      const bounds = root.getBoundingClientRect();
      return caret !== undefined
        && caret !== null
        && root.scrollTop > 0
        && caret.top >= bounds.top
        && caret.bottom <= bounds.bottom;
    }), 'editing did not reveal the offscreen caret');
  });
};

const runTouchCorpus = async () => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 900, height: 700 } });
  const editor = await openEditor(context, 'touch');
  try {
    await record('touch: primary tap places the caret', async () => {
      await setFixture(editor, 'tap this text', { start: 0, end: 0 });
      const bounds = await editor.editor.boundingBox();
      assert.notEqual(bounds, null);
      const point = await offsetPoint(editor, 4);
      await editor.page.touchscreen.tap(bounds.x + point.x, bounds.y + point.y);
      await eventually(
        async () => JSON.stringify(await selection(editor)) === JSON.stringify({ start: 4, end: 4 }),
        `touch caret was ${JSON.stringify(await selection(editor))}`,
      );
    });
  } finally {
    await context.close();
  }
};

try {
  browser = await chromium.launch({ executablePath: chromiumPath });
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1100, height: 760 },
  });
  for (const mode of ['default', 'forced-polyfill']) {
    const editor = await openEditor(context, mode);
    try {
      await runKeyboardCorpus(editor);
      await runPointerCorpus(editor);
      await runClipboardCorpus(editor);
      await runViewportCorpus(editor);
      if (mode === 'default') await runPresenceCorpus(context, editor);
    } finally {
      if (!editor.page.isClosed()) await editor.page.close();
    }
  }
  await context.close();
  await runTouchCorpus();
} finally {
  await browser?.close();
  await server.close();
}

const report = {
  passed: passes.length,
  failed: failures.length,
  failures,
};
if (failures.length === 0) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
