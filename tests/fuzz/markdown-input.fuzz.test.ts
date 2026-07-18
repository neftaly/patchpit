import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  applyTextSplice,
  applyTextUpdate,
  beginComposition,
  createTextInputSession,
  endComposition,
  minimalTextSplice,
  moveTextSelection,
  parseTextUpdate,
  selectText,
  selectAllText,
  type TextInputSession,
  type TextSpliceIntent,
} from '../../apps/markdown-editor/input-session.ts';

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
    (value, startSeed, endSeed, key, extend) => {
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

const codePointBoundaries = (value: string) => {
  const boundaries = [0];
  let offset = 0;
  for (const character of value) {
    offset += character.length;
    boundaries.push(offset);
  }
  return boundaries;
};
