import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import * as Automerge from '@automerge/automerge';
import { Repo } from '@automerge/automerge-repo';
import {
  createAutomergeTextFileDocument,
  openAutomergeFileDatabase,
} from '@patchpit/automerge-fs';
import { fileRelation, stageTextFileSplice } from '@patchpit/fs';
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

void test('retained dependent editor inserts survive concurrent publication and resolve positions', async () => {
  const repo = new Repo({ network: [] });
  try {
    await fc.assert(fc.asyncProperty(
      text,
      fc.array(fc.record({ insert: text, indexSeed: fc.nat() }), { minLength: 2, maxLength: 8 }),
      fc.boolean(),
      fc.nat(),
      async (initialText, generated, remoteFirst, remoteIndexSeed) => {
        let optimisticText = initialText;
        const operations = generated.map(({ indexSeed, insert }, operationIndex) => {
          const boundaries = codePointBoundaries(optimisticText);
          const operation = {
            kind: 'file.text.splice' as const,
            index: boundaries[indexSeed % boundaries.length]!,
            deleteCount: 0,
            insert: `⟦${operationIndex}:${insert}⟧`,
          };
          optimisticText = applyTextSplice(optimisticText, operation);
          return operation;
        });
        const remote = '⟦remote⟧';
        const initialBoundaries = codePointBoundaries(initialText);
        const remoteOffset = initialBoundaries[remoteIndexSeed % initialBoundaries.length]!;
        const handle = repo.create(createAutomergeTextFileDocument(initialText, { name: 'demo.md' }));
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
        const intent = await opened.value.openTextIntent({ observedBasis: snapshot.current.basis });
        assert.equal(intent.success, true);
        if (!intent.success) {
          opened.value.close();
          return;
        }
        const session = intent.value;
        const prefixLength = Math.max(1, Math.floor(operations.length / 2));
        const append = (operation: (typeof operations)[number]) => session.append(
          operation,
          (current) => stageTextFileSplice(current, operation),
        );
        try {
          operations.slice(0, prefixLength).forEach((operation) => {
            assert.equal(append(operation).status, 'pending');
          });
          if (remoteFirst) {
            handle.change((document) => {
              Automerge.splice(document, ['content'], remoteOffset, 0, remote);
            });
          }
          const prefix = session.publish();
          operations.slice(prefixLength).forEach((operation) => {
            assert.equal(append(operation).status, 'pending');
          });
          if (!remoteFirst) {
            handle.change((document) => {
              Automerge.splice(document, ['content'], remoteOffset, 0, remote);
            });
          }
          assert.equal((await prefix).outcome, 'committed');
          const end = session.captureTextPosition({
            name: 'document-end',
            relation: fileRelation,
            key: ['text'],
            field: 'textContent',
            index: optimisticText.length,
            affinity: 'after',
          });
          const suffix = await session.publish({ textPositions: [end] });
          assert.equal(suffix.outcome, 'committed');
          const merged = handle.doc().content;
          assert.equal(merged.length, optimisticText.length + remote.length);
          const remoteIndex = merged.indexOf(remote);
          assert.notEqual(remoteIndex, -1);
          assert.equal(
            merged.slice(0, remoteIndex) + merged.slice(remoteIndex + remote.length),
            optimisticText,
          );
          assert.deepEqual(suffix.textPositions, [{
            name: 'document-end',
            state: 'resolved',
            index: merged.length,
            basis: suffix.outcome === 'committed' ? suffix.afterBasis : undefined,
            issues: [],
          }]);
        } finally {
          session.close();
          opened.value.close();
        }
      },
    ), { numRuns: 30 });
  } finally {
    await repo.shutdown();
  }
});

void test('editor synchronization adopts merged projections and blocks failed evidence', () => {
  fc.assert(fc.property(
    text,
    fc.array(fc.record({ insert: text, indexSeed: fc.nat() }), { minLength: 1, maxLength: 30 }),
    fc.boolean(),
    fc.constantFrom('committed', 'rejected', 'unknown', 'unresolved'),
    (initialText, generated, diverge, result) => {
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
          selection: {
            start: operation.index + operation.insert.length,
            end: operation.index + operation.insert.length,
          },
          snapshot: { revision: String(revision), text: canonicalText },
        }).state;
      });
      assert.equal(state.kind, 'applying');
      const pending = state.pendingSubmissionIds;
      for (const [index, submissionId] of pending.entries()) {
        const outcome = index === 0 && result !== 'unresolved' ? result : 'committed';
        state = transitionEditorSync(state, {
          type: 'receipt',
          submissionId,
          outcome,
          selection: index === 0 && result === 'unresolved' ? 'unresolved' : 'resolved',
        }).state;
        if (state.kind === 'blocked') break;
      }
      if (result !== 'committed') {
        assert.equal(state.kind, 'blocked');
        return;
      }
      assert.equal(state.kind, 'applying');
      revision += 1;
      canonicalText = diverge ? `remote:${localText}` : localText;
      state = transitionEditorSync(state, {
        type: 'snapshot',
        snapshot: { revision: String(revision), text: canonicalText },
      }).state;
      assert.equal(state.kind, 'ready');
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
