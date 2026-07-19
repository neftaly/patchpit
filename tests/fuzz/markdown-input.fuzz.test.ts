import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import { Repo } from '@automerge/automerge-repo';
import {
  createAutomergeTextFileDocument,
  openAutomergeFileDatabase,
} from '@patchpit/automerge-fs';
import { commitTextFileSplice } from '@patchpit/fs';
import {
  applyTextSplice,
  applyTextUpdate,
  beginComposition,
  createTextInputSession,
  deleteText,
  endComposition,
  minimalTextSplice,
  moveTextSelectionByWord,
  moveTextSelection,
  moveTextSelectionToDocumentEdge,
  parseTextUpdate,
  replaceTextSelection,
  selectLineAt,
  selectText,
  selectAllText,
  selectWordAt,
  type TextInputSession,
  type TextSpliceIntent,
} from '../../apps/markdown-editor/input-session.ts';
import {
  createEditorSyncState,
  transitionEditorSync,
  type EditorSyncState,
} from '../../apps/markdown-editor/editor-sync.ts';

const unicodeScalar = fc.integer({ min: 0, max: 0x10FFFF })
  .filter((value) => value < 0xD800 || value > 0xDFFF)
  .map(String.fromCodePoint);
const text = fc.array(unicodeScalar, { maxLength: 60 }).map((characters) => characters.join(''));

void test('Markdown input transitions preserve text and coalesce compositions', () => {
  fc.assert(fc.property(
    text,
    fc.array(fc.record({
      composition: fc.constantFrom('begin', 'continue', 'end'),
      insert: text,
      startSeed: fc.nat(),
      endSeed: fc.nat(),
    }), { maxLength: 80 }),
    (initialText, steps) => {
      let session = createTextInputSession(initialText);
      let submittedText = initialText;
      steps.forEach((step) => {
        if (step.composition === 'begin') session = beginComposition(session);
        const boundaries = codePointBoundaries(session.text);
        const first = boundaries[step.startSeed % boundaries.length]!;
        const second = boundaries[step.endSeed % boundaries.length]!;
        const start = Math.min(first, second);
        const end = Math.max(first, second);
        const expectedText = applyTextSplice(session.text, {
          index: start,
          deleteCount: end - start,
          insert: step.insert,
        });
        const parsed = parseTextUpdate(session.text, {
          index: start,
          deleteCount: end - start,
          insert: step.insert,
          selectionStart: start + step.insert.length,
          selectionEnd: start + step.insert.length,
        });
        assert.equal(parsed.success, true);
        if (!parsed.success) return;
        const transition = applyTextUpdate(session, parsed.value);
        session = transition.session;
        if (transition.intent !== undefined) {
          submittedText = applyTextSplice(submittedText, transition.intent);
        }
        assert.equal(session.text, expectedText);

        if (step.composition === 'end') {
          const completed = endComposition(session);
          session = completed.session;
          if (completed.intent !== undefined) {
            submittedText = applyTextSplice(submittedText, completed.intent);
          }
        }
        if (session.compositionBasisText === undefined) assert.equal(submittedText, session.text);
      });
      const completed = endComposition(session);
      if (completed.intent !== undefined) {
        submittedText = applyTextSplice(submittedText, completed.intent);
      }
      assert.equal(submittedText, completed.session.text);
    },
  ), { numRuns: 300 });
});

void test('minimal composition splice round-trips Unicode without splitting surrogate pairs', () => {
  fc.assert(fc.property(text, text, (before, after) => {
    const splice = minimalTextSplice(before, after);
    assert.equal(splice === undefined ? before : applyTextSplice(before, splice), after);
    if (splice !== undefined) {
      assert.equal(codePointBoundaries(before).includes(splice.index), true);
      assert.equal(codePointBoundaries(before).includes(splice.index + splice.deleteCount), true);
    }
  }), { numRuns: 500 });
});

void test('Markdown navigation preserves text and valid Unicode boundaries', () => {
  fc.assert(fc.property(
    text,
    fc.nat(),
    fc.nat(),
    fc.constantFrom('ArrowLeft', 'ArrowRight', 'Home', 'End'),
    fc.boolean(),
    fc.constantFrom('backward', 'forward'),
    fc.constantFrom('grapheme', 'word'),
    text,
    (value, startSeed, endSeed, key, extend, direction, unit, insert) => {
      const boundaries = codePointBoundaries(value);
      const session: TextInputSession = {
        text: value,
        selection: {
          start: boundaries[startSeed % boundaries.length]!,
          end: boundaries[endSeed % boundaries.length]!,
        },
      };
      const moved = moveTextSelection(session, key, extend);
      assert.equal(moved.text, value);
      assert.equal(boundaries.includes(moved.selection.start), true);
      assert.equal(boundaries.includes(moved.selection.end), true);
      assert.deepEqual(
        selectText(session, session.selection.start, session.selection.end)?.selection,
        session.selection,
      );
      Array.from({ length: value.length + 1 }, (_, offset) => offset).forEach((offset) => {
        assert.equal(selectText(session, offset, offset) !== undefined, boundaries.includes(offset));
      });
      assert.deepEqual(selectAllText(session).selection, { start: 0, end: value.length });

      const wordMoved = moveTextSelectionByWord(session, direction, extend);
      const documentMoved = moveTextSelectionToDocumentEdge(session, direction === 'backward'
        ? 'start'
        : 'end', extend);
      const replaced = replaceTextSelection(session, insert);
      const deleted = deleteText(session, direction, unit);
      [wordMoved, documentMoved, replaced.session, deleted.session].forEach((next) => {
        assert.equal(next.text.isWellFormed(), true);
        assert.equal(codePointBoundaries(next.text).includes(next.selection.start), true);
        assert.equal(codePointBoundaries(next.text).includes(next.selection.end), true);
      });
      [replaced, deleted].forEach((transition) => {
        if (transition.intent !== undefined) {
          assert.equal(applyTextSplice(value, transition.intent), transition.session.text);
        } else {
          assert.equal(transition.session.text, value);
        }
      });
      const hitOffset = boundaries[startSeed % boundaries.length]!;
      [selectWordAt(session, hitOffset), selectLineAt(session, hitOffset)].forEach((selected) => {
        assert.equal(boundaries.includes(selected.selection.start), true);
        assert.equal(boundaries.includes(selected.selection.end), true);
      });
    },
  ), { numRuns: 300 });
});

void test('input parsing rejects non-boundaries and out-of-range updates', () => {
  const invalid: readonly TextSpliceIntent[] = [
    { index: -1, deleteCount: 0, insert: '' },
    { index: 0, deleteCount: 4, insert: '' },
    { index: 1, deleteCount: 0, insert: '' },
  ];
  invalid.forEach((splice) => {
    assert.deepEqual(parseTextUpdate('😀', {
      ...splice,
      selectionStart: 0,
      selectionEnd: 0,
    }), { success: false, reason: 'range' });
  });
  assert.deepEqual(parseTextUpdate('', {
    index: 0,
    deleteCount: 0,
    insert: '😀',
    selectionStart: 1,
    selectionEnd: 1,
  }), { success: false, reason: 'selection' });
  assert.deepEqual(parseTextUpdate('', {
    index: 0,
    deleteCount: 0,
    insert: '\uD800',
    selectionStart: 0,
    selectionEnd: 0,
  }), { success: false, reason: 'text' });
});

void test('basis-captured concurrent editor inserts survive either submission order', async () => {
  const repo = new Repo({ network: [] });
  try {
    await fc.assert(fc.asyncProperty(
      text,
      fc.tuple(text, text).filter(([left, right]) => left.length > 0 && right.length > 0),
      fc.nat(),
      fc.boolean(),
      async (initialText, [leftPayload, rightPayload], offsetSeed, reverse) => {
        const boundaries = codePointBoundaries(initialText);
        const index = boundaries[offsetSeed % boundaries.length]!;
        const left = `⟦A${leftPayload}A⟧`;
        const right = `⟦B${rightPayload}B⟧`;
        const handle = repo.create(createAutomergeTextFileDocument(initialText, { name: 'demo.md' }));
        // This property exercises source-routed writes, not Repo networking.
        handle.removeAllListeners('change');
        const opened = await openAutomergeFileDatabase(handle, 'patchpit.editor-text');
        assert.equal(opened.success, true);
        if (!opened.success) return;
        const snapshot = opened.value.getSnapshot();
        assert.equal(snapshot.state, 'open');
        if (snapshot.state !== 'open') {
          opened.value.close();
          return;
        }
        const options = { observedBasis: snapshot.current.basis };
        const insert = (value: string) => commitTextFileSplice(opened.value, {
          kind: 'file.text.splice',
          index,
          deleteCount: 0,
          insert: value,
        }, options);
        try {
          const receipts = reverse
            ? [await insert(right), await insert(left)]
            : [await insert(left), await insert(right)];
          assert.deepEqual(receipts.map(({ outcome }) => outcome), ['committed', 'committed']);
          const merged = handle.doc().content;
          assert.equal(merged.length, initialText.length + left.length + right.length);
          assert.equal(merged.includes(left), true);
          assert.equal(merged.includes(right), true);
        } finally {
          opened.value.close();
        }
      },
    ), { numRuns: 30 });
  } finally {
    await repo.shutdown();
  }
});

void test('editor synchronization drains dependent input or blocks a divergent rebase', () => {
  fc.assert(fc.property(
    text,
    fc.array(fc.record({ insert: text, indexSeed: fc.nat() }), { minLength: 1, maxLength: 30 }),
    fc.boolean(),
    (initialText, generated, diverge) => {
      let localText = initialText;
      const operations = generated.map(({ indexSeed, insert }) => {
        const boundaries = codePointBoundaries(localText);
        const operation = {
          index: boundaries[indexSeed % boundaries.length]!,
          deleteCount: 0,
          insert,
        };
        localText = applyTextSplice(localText, operation);
        return operation;
      });
      let state = createEditorSyncState();
      let revision = 0;
      let canonicalText = initialText;
      operations.forEach((operation) => {
        state = transitionEditorSync(state, {
          type: 'intent',
          operation,
          snapshot: { revision: String(revision), text: canonicalText },
        }).state;
      });
      assert.equal(state.kind, 'applying');
      let first = true;
      while (state.kind === 'applying') {
        const applying: Extract<EditorSyncState, { readonly kind: 'applying' }> = state;
        state = transitionEditorSync(state, {
          type: 'receipt',
          submissionId: applying.submissionId,
          outcome: 'committed',
        }).state;
        revision += 1;
        canonicalText = diverge && first && applying.queued.length > 0
          ? `remote:${applying.expectedText}`
          : applying.expectedText;
        first = false;
        state = transitionEditorSync(state, {
          type: 'snapshot',
          snapshot: { revision: String(revision), text: canonicalText },
        }).state;
      }
      if (diverge && operations.length > 1) {
        assert.equal(state.kind, 'blocked');
      } else {
        assert.equal(state.kind, 'ready');
        assert.equal(canonicalText, localText);
      }
    },
  ), { numRuns: 300 });
});

const codePointBoundaries = (value: string) => {
  const boundaries = [0];
  let offset = 0;
  for (const character of value) {
    offset += character.length;
    boundaries.push(offset);
  }
  return boundaries;
};
