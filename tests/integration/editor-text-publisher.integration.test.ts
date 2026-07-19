import assert from 'node:assert/strict';
import test from 'node:test';
import * as Automerge from '@automerge/automerge';
import { Repo } from '@automerge/automerge-repo';
import type { AutomergeDatabase } from '@tarstate/automerge';
import type { DatabaseTextIntentSession } from '@tarstate/core/transactions';
import {
  createAutomergeTextFileDocument,
  openAutomergeFileDatabase,
} from '@patchpit/automerge-fs';
import { createEditorTextPublisher } from '../../src/content/editor-text-publisher.ts';
import { createEditorDocumentHub } from '../../src/content/editor-document-runtime.ts';

void test('closing an editor settles its publishing prefix and retained suffix before a late receipt', async () => {
  const repo = new Repo({ network: [] });
  try {
    const handle = repo.create(createAutomergeTextFileDocument('', { name: 'demo.md' }));
    handle.removeAllListeners('change');
    const opened = await openAutomergeFileDatabase(handle, 'patchpit.editor-text');
    assert.equal(opened.success, true);
    if (!opened.success) return;
    const database = opened.value;
    const suffixRetained = Promise.withResolvers<void>();
    let appendCount = 0;
    const gate = holdFirstPublication(database, () => {
      appendCount += 1;
      if (appendCount === 2) suffixRetained.resolve();
    });
    const initial = database.getSnapshot();
    assert.equal(initial.state, 'open');
    if (initial.state !== 'open') return;
    let oldSelectionResolutions = 0;
    const oldPublisher = createEditorTextPublisher({
      database: gate.database,
      maxTextLength: 1_024,
      basisForRevision: (revision) => revision === 'initial' ? initial.current.basis : undefined,
      resolveSelection: async () => {
        oldSelectionResolutions += 1;
        return true;
      },
    });
    const prefix = oldPublisher.commit('initial', {
      kind: 'file.text.splice', index: 0, deleteCount: 0, insert: 'A',
    }, { anchor: 1, focus: 1 });
    const suffix = oldPublisher.commit('initial', {
      kind: 'file.text.splice', index: 1, deleteCount: 0, insert: 'B',
    }, { anchor: 2, focus: 2 });
    let prefixSettlements = 0;
    let suffixSettlements = 0;
    void prefix.then(() => { prefixSettlements += 1; });
    void suffix.then(() => { suffixSettlements += 1; });
    try {
      await within(Promise.race([
        suffixRetained.promise,
        Promise.all([prefix, suffix]).then((results) => {
          throw new Error(`Publications settled before retaining the suffix: ${JSON.stringify(results)}`);
        }),
      ]), () => `retained suffix (observed ${appendCount} appends)`);
      await within(gate.receiptHeld, () => 'held prefix receipt');
    } catch (error) {
      gate.release();
      oldPublisher.close();
      database.close();
      throw error;
    }

    oldPublisher.close();
    assert.deepEqual(await Promise.all([prefix, suffix]), [
      { outcome: 'unknown', selection: 'unresolved' },
      { outcome: 'unknown', selection: 'unresolved' },
    ]);
    assert.deepEqual([prefixSettlements, suffixSettlements], [1, 1]);
    const replacementBasis = database.getSnapshot();
    assert.equal(replacementBasis.state, 'open');
    if (replacementBasis.state !== 'open') return;
    const beforeReplacement = handle.doc().content;
    let replacementSelectionResolutions = 0;
    const replacement = createEditorTextPublisher({
      database,
      maxTextLength: 1_024,
      basisForRevision: (revision) => revision === 'replacement'
        ? replacementBasis.current.basis
        : undefined,
      resolveSelection: async () => {
        replacementSelectionResolutions += 1;
        return true;
      },
    });
    assert.deepEqual(await replacement.commit('replacement', {
      kind: 'file.text.splice',
      index: beforeReplacement.length,
      deleteCount: 0,
      insert: 'R',
    }, {
      anchor: beforeReplacement.length + 1,
      focus: beforeReplacement.length + 1,
    }), { outcome: 'committed', selection: 'resolved' });
    const replacementText = handle.doc().content;

    gate.release();
    await gate.handled;
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(handle.doc().content, replacementText);
    assert.equal(oldSelectionResolutions, 0);
    assert.equal(replacementSelectionResolutions, 1);
    assert.deepEqual([prefixSettlements, suffixSettlements], [1, 1]);
    replacement.close();
    database.close();
  } finally {
    await repo.shutdown();
  }
});

void test('a retained stream reports real Tarstate budget rejection without lying about its prefix', async () => {
  const repo = new Repo({ network: [] });
  try {
    const handle = repo.create(createAutomergeTextFileDocument('', { name: 'demo.md' }));
    handle.removeAllListeners('change');
    const opened = await openAutomergeFileDatabase(handle, 'patchpit.editor-text');
    assert.equal(opened.success, true);
    if (!opened.success) return;
    const database = opened.value;
    const initial = database.getSnapshot();
    assert.equal(initial.state, 'open');
    if (initial.state !== 'open') return;
    const selectionStarted = Promise.withResolvers<void>();
    const releaseSelection = Promise.withResolvers<void>();
    let selectionResolutions = 0;
    const publisher = createEditorTextPublisher({
      database,
      maxTextLength: 1_024,
      basisForRevision: (revision) => revision === 'initial' ? initial.current.basis : undefined,
      resolveSelection: async (_basis, _selection, signal) => {
        selectionStarted.resolve();
        await releaseSelection.promise;
        if (signal.aborted) return false;
        selectionResolutions += 1;
        return true;
      },
    });
    const prefix = publisher.commit('initial', {
      kind: 'file.text.splice', index: 0, deleteCount: 0, insert: 'x',
    }, { anchor: 1, focus: 1 });
    await within(selectionStarted.promise, () => 'held prefix selection resolution');
    const suffix = Array.from({ length: 300 }, (_, index) => publisher.commit('initial', {
      kind: 'file.text.splice', index: index + 1, deleteCount: 0, insert: 'x',
    }, { anchor: index + 2, focus: index + 2 }));
    const results = await within(Promise.all([prefix, ...suffix]), () => 'bounded stream rejection');
    assert.deepEqual(results[0], { outcome: 'committed', selection: 'unresolved' });
    assert(results.slice(1).every(({ outcome, selection }) =>
      outcome === 'rejected' && selection === 'unresolved'));
    assert.equal(handle.doc().content, 'x');

    releaseSelection.resolve();
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(handle.doc().content, 'x');
    assert.equal(selectionResolutions, 0);
    publisher.close();
    database.close();
  } finally {
    await repo.shutdown();
  }
});

void test('selection restoration uses the committed basis after the live document advances', async () => {
  const repo = new Repo({ network: [] });
  try {
    const handle = repo.create(createAutomergeTextFileDocument('', { name: 'demo.md' }));
    handle.removeAllListeners('change');
    const opened = await openAutomergeFileDatabase(handle, 'patchpit.editor-text');
    assert.equal(opened.success, true);
    if (!opened.success) return;
    const database = opened.value;
    const gate = holdFirstPublication(database);
    const hub = createEditorDocumentHub(handle, {
      capabilities: database.capabilities,
      close: database.close,
      getSnapshot: database.getSnapshot,
      openTextIntent: gate.database.openTextIntent,
      subscribe: database.subscribe,
    }, crypto.randomUUID(), () => undefined);
    const session = hub.openSession();
    const initial = session.getSnapshot();
    assert.equal(initial.state, 'ready');
    if (initial.state !== 'ready') return;
    const publication = session.commitSplice(initial.revision, {
      kind: 'file.text.splice', index: 0, deleteCount: 0, insert: 'A',
    }, { anchor: 1, focus: 1 });
    await within(gate.receiptHeld, () => 'held exact-basis receipt');

    handle.change((document) => {
      Automerge.splice(document, ['content'], 0, 0, 'R');
    });
    gate.release();
    assert.deepEqual(await publication, { outcome: 'committed', selection: 'resolved' });
    await gate.handled;
    const advanced = session.getSnapshot();
    assert.equal(advanced.state, 'ready');
    if (advanced.state === 'ready') {
      assert.equal(advanced.text, 'RA');
      assert.deepEqual(advanced.participants.find(({ local }) => local)?.selection, {
        anchor: 2,
        focus: 2,
      });
    }
    session.close();
    hub.close();
  } finally {
    await repo.shutdown();
  }
});

const holdFirstPublication = (
  database: Pick<AutomergeDatabase, 'openTextIntent'>,
  onAppend: () => void = () => undefined,
) => {
  const receiptHeld = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const handled = Promise.withResolvers<void>();
  let hold = true;
  const wrapSession = (session: DatabaseTextIntentSession): DatabaseTextIntentSession => ({
    getSnapshot: () => session.getSnapshot(),
    subscribe: (listener) => session.subscribe(listener),
    append: (...input) => {
      const segment = session.append(...input);
      onAppend();
      return segment;
    },
    captureTextPosition: (input) => session.captureTextPosition(input),
    publish: async (options) => {
      if (!hold) return session.publish(options);
      hold = false;
      const outcome = await session.publish(options).then(
        (value) => ({ success: true as const, value }),
        (error: unknown) => ({ success: false as const, error }),
      );
      receiptHeld.resolve();
      await release.promise;
      handled.resolve();
      if (outcome.success) return outcome.value;
      throw outcome.error;
    },
    cancel: () => { session.cancel(); },
    close: () => { session.close(); },
  });
  return {
    database: {
      openTextIntent: async (...input: Parameters<AutomergeDatabase['openTextIntent']>) => {
        const intent = await database.openTextIntent(...input);
        return intent.success ? { ...intent, value: wrapSession(intent.value) } : intent;
      },
    },
    handled: handled.promise,
    receiptHeld: receiptHeld.promise,
    release: () => { release.resolve(); },
  };
};

const within = <Value>(promise: Promise<Value>, description: () => string) => new Promise<Value>(
  (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${description()}`));
    }, 5_000);
    void promise.then((value) => {
      clearTimeout(timeout);
      resolve(value);
    }, (error: unknown) => {
      clearTimeout(timeout);
      reject(error);
    });
  },
);
