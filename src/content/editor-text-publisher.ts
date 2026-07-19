import type { AutomergeDatabase } from '@tarstate/automerge';
import type { SourceBasis } from '@tarstate/core/database';
import type { DatabaseTextIntentSession } from '@tarstate/core/transactions';
import type { EditorPublicationResult } from '@patchpit/sandbox';
import {
  fileRelation,
  stageTextFileSplice,
  type TextFileSpliceOperation,
} from '@patchpit/fs';

const ANCHOR_POSITION_NAME = 'selection-anchor';
const FOCUS_POSITION_NAME = 'selection-focus';

type EditorSelection = {
  readonly anchor: number;
  readonly focus: number;
};

type PendingPublication = {
  readonly resolve: (result: EditorPublicationResult) => void;
};

export const createEditorTextPublisher = (options: {
  readonly basisForRevision: (revision: string) => SourceBasis | undefined;
  readonly database: AutomergeDatabase;
  readonly maxTextLength: number;
  readonly resolveSelection: (
    basis: SourceBasis,
    selection: EditorSelection,
    signal: AbortSignal,
  ) => Promise<boolean>;
}) => {
  const lifecycle = new AbortController();
  const pendingRequests: PendingPublication[] = [];
  let session: DatabaseTextIntentSession | undefined;
  let sessionBasisRevision: string | undefined;
  let appendTail = Promise.resolve();
  let publishing = false;
  let latestSelection: EditorSelection = { anchor: 0, focus: 0 };
  let closed = false;

  const closeSession = () => {
    session?.close();
    session = undefined;
    sessionBasisRevision = undefined;
  };

  const settlePending = (result: EditorPublicationResult) => {
    pendingRequests.splice(0).forEach(({ resolve }) => { resolve(result); });
  };

  const failPublisher = (outcome: 'rejected' | 'unknown') => {
    publishing = false;
    closed = true;
    lifecycle.abort();
    settlePending({ outcome, selection: 'unresolved' });
    closeSession();
  };

  const publishPending = () => {
    const active = session;
    if (closed || publishing || active === undefined || pendingRequests.length === 0) return;
    const publishingRequests = pendingRequests.splice(0);
    let positions;
    try {
      positions = [
        active.captureTextPosition({
          name: ANCHOR_POSITION_NAME,
          relation: fileRelation,
          key: ['text'],
          field: 'textContent',
          index: latestSelection.anchor,
          affinity: 'after',
        }),
        active.captureTextPosition({
          name: FOCUS_POSITION_NAME,
          relation: fileRelation,
          key: ['text'],
          field: 'textContent',
          index: latestSelection.focus,
          affinity: 'after',
        }),
      ];
    } catch {
      publishingRequests.forEach(({ resolve }) => {
        resolve({ outcome: 'rejected', selection: 'unresolved' });
      });
      failPublisher('rejected');
      return;
    }
    publishing = true;
    void active.publish({ textPositions: positions }).then(async (receipt) => {
      if (closed || session !== active) {
        publishingRequests.forEach(({ resolve }) => {
          resolve({ outcome: 'unknown', selection: 'unresolved' });
        });
        return;
      }
      let selectionState: EditorPublicationResult['selection'] = 'unresolved';
      if (receipt.outcome === 'committed') {
        const anchor = receipt.textPositions.find(({ name }) => name === ANCHOR_POSITION_NAME);
        const focus = receipt.textPositions.find(({ name }) => name === FOCUS_POSITION_NAME);
        if (anchor?.state === 'resolved' && focus?.state === 'resolved') {
          try {
            if (await options.resolveSelection(anchor.basis, {
              anchor: anchor.index,
              focus: focus.index,
            }, lifecycle.signal)) selectionState = 'resolved';
          } catch {
            selectionState = 'unresolved';
          }
        }
      }
      publishingRequests.forEach(({ resolve }) => {
        resolve({ outcome: receipt.outcome, selection: selectionState });
      });
      publishing = false;
      if (receipt.outcome === 'committed') publishPending();
      else failPublisher(receipt.outcome);
    }).catch(() => {
      publishingRequests.forEach(({ resolve }) => {
        resolve({ outcome: 'unknown', selection: 'unresolved' });
      });
      failPublisher('unknown');
    });
  };

  const openSession = async (revision: string) => {
    if (session !== undefined && sessionBasisRevision === revision) return session;
    if (session !== undefined) {
      if (publishing || pendingRequests.length > 0) return undefined;
      closeSession();
    }
    const basis = options.basisForRevision(revision);
    if (basis === undefined) return undefined;
    const opened = await options.database.openTextIntent({
      observedBasis: basis,
      signal: lifecycle.signal,
    });
    if (!opened.success || closed) {
      if (opened.success) opened.value.close();
      return undefined;
    }
    session = opened.value;
    sessionBasisRevision = revision;
    return session;
  };

  const commit = (
    revision: string,
    operation: TextFileSpliceOperation,
    nextSelection: EditorSelection,
  ): Promise<EditorPublicationResult> => new Promise((resolve) => {
    appendTail = appendTail.then(async () => {
      if (closed) {
        resolve({ outcome: 'rejected', selection: 'unresolved' });
        return;
      }
      const active = await openSession(revision);
      if (active === undefined) {
        resolve({ outcome: 'rejected', selection: 'unresolved' });
        return;
      }
      const text = editableText(active);
      if (text === undefined
        || !validSplice(operation, text, options.maxTextLength)
        || !validSelection(nextSelection, text, operation)) {
        resolve({ outcome: 'rejected', selection: 'unresolved' });
        return;
      }
      const segment = active.append(
        operation,
        (snapshot) => stageTextFileSplice(snapshot, operation),
      );
      if (segment.status !== 'pending') {
        const outcome = segment.status === 'unknown' ? 'unknown' : 'rejected';
        resolve({
          outcome,
          selection: 'unresolved',
        });
        failPublisher(outcome);
        return;
      }
      latestSelection = nextSelection;
      pendingRequests.push({ resolve });
      publishPending();
    }).catch(() => {
      resolve({ outcome: 'unknown', selection: 'unresolved' });
      failPublisher('unknown');
    });
  });

  const close = () => {
    if (closed) return;
    closed = true;
    lifecycle.abort();
    settlePending({ outcome: 'unknown', selection: 'unresolved' });
    closeSession();
  };

  return { close, commit };
};

const editableText = (session: DatabaseTextIntentSession) => {
  const rows = session.getSnapshot().current.rows(fileRelation);
  const row = rows.length === 1 ? rows[0] : undefined;
  return row?.contentKind === 'text' && typeof row.textContent === 'string'
    ? row.textContent
    : undefined;
};

const validSplice = (
  operation: TextFileSpliceOperation,
  text: string,
  maxTextLength: number,
) =>
  operation.kind === 'file.text.splice'
  && validOffset(operation.index, text)
  && Number.isSafeInteger(operation.deleteCount)
  && operation.deleteCount >= 0
  && operation.index + operation.deleteCount <= text.length
  && text.length - operation.deleteCount + operation.insert.length <= maxTextLength
  && !bisectsSurrogatePair(text, operation.index + operation.deleteCount)
  && operation.insert.isWellFormed();

const validSelection = (
  selection: EditorSelection,
  text: string,
  operation: TextFileSpliceOperation,
) => validOffsetAfterSplice(selection.anchor, text, operation)
  && validOffsetAfterSplice(selection.focus, text, operation);

const validOffsetAfterSplice = (
  offset: number,
  text: string,
  operation: TextFileSpliceOperation,
) => {
  const length = text.length - operation.deleteCount + operation.insert.length;
  return Number.isSafeInteger(offset)
    && offset >= 0
    && offset <= length
    && !(offset > 0
      && offset < length
      && /[\uD800-\uDBFF]/u.test(codeUnitAfterSplice(text, operation, offset - 1))
      && /[\uDC00-\uDFFF]/u.test(codeUnitAfterSplice(text, operation, offset)));
};

const codeUnitAfterSplice = (
  text: string,
  operation: TextFileSpliceOperation,
  offset: number,
) => offset < operation.index ? text[offset] ?? ''
  : offset < operation.index + operation.insert.length
    ? operation.insert[offset - operation.index] ?? ''
    : text[offset - operation.insert.length + operation.deleteCount] ?? '';

const validOffset = (offset: number, text: string) => Number.isSafeInteger(offset)
  && offset >= 0
  && offset <= text.length
  && !bisectsSurrogatePair(text, offset);

const bisectsSurrogatePair = (text: string, offset: number) => offset > 0
  && offset < text.length
  && /[\uD800-\uDBFF]/u.test(text[offset - 1] ?? '')
  && /[\uDC00-\uDFFF]/u.test(text[offset] ?? '');
