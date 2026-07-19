import type { EditorPublicationResult } from '@patchpit/sandbox';
import {
  applyTextSplice,
  type TextSelection,
  type TextSpliceIntent,
} from './input-session.ts';

export type ReadyEditorSnapshot = {
  readonly revision: string;
  readonly text: string;
};

export type EditorSyncState = {
  readonly kind: 'ready';
  readonly nextSubmissionId: number;
  readonly documentRevision?: string;
} | {
  readonly kind: 'applying';
  readonly nextSubmissionId: number;
  readonly basisRevision: string;
  readonly expectedText: string;
  readonly pendingSubmissionIds: readonly number[];
} | {
  readonly kind: 'blocked';
  readonly nextSubmissionId: number;
  readonly message: string;
};

export type EditorSyncEvent = {
  readonly type: 'intent';
  readonly operation: TextSpliceIntent;
  readonly selection: TextSelection;
  readonly snapshot: ReadyEditorSnapshot;
} | EditorPublicationResult & {
  readonly type: 'receipt';
  readonly submissionId: number;
} | {
  readonly type: 'snapshot';
  readonly snapshot: ReadyEditorSnapshot;
} | {
  readonly type: 'block';
  readonly message: string;
};

export type EditorSyncCommand = {
  readonly type: 'submit';
  readonly submissionId: number;
  readonly revision: string;
  readonly operation: TextSpliceIntent;
  readonly selection: TextSelection;
} | {
  readonly type: 'adopt';
  readonly snapshot: ReadyEditorSnapshot;
};

type EditorSyncTransition = {
  readonly state: EditorSyncState;
  readonly commands: readonly EditorSyncCommand[];
};

export const createEditorSyncState = (): EditorSyncState => ({
  kind: 'ready',
  nextSubmissionId: 1,
});

export const transitionEditorSync = (
  state: EditorSyncState,
  event: EditorSyncEvent,
): EditorSyncTransition => {
  if (event.type === 'block') return blocked(state.nextSubmissionId, event.message);
  if (state.kind === 'blocked') return unchanged(state);
  if (event.type === 'intent') return submit(state, event);
  if (event.type === 'receipt') return receiveReceipt(state, event);
  if (state.kind === 'ready') {
    return state.documentRevision === event.snapshot.revision
      ? unchanged(state)
      : readyAt(state.nextSubmissionId, event.snapshot, true);
  }
  if (state.pendingSubmissionIds.length > 0
    || event.snapshot.revision === state.basisRevision) return unchanged(state);
  return readyAt(
    state.nextSubmissionId,
    event.snapshot,
    event.snapshot.text !== state.expectedText,
  );
};

const submit = (
  state: Exclude<EditorSyncState, { readonly kind: 'blocked' }>,
  event: Extract<EditorSyncEvent, { readonly type: 'intent' }>,
): EditorSyncTransition => {
  const submissionId = state.nextSubmissionId;
  const basisRevision = state.kind === 'applying'
    ? state.basisRevision
    : event.snapshot.revision;
  const expectedText = applyTextSplice(
    state.kind === 'applying' ? state.expectedText : event.snapshot.text,
    event.operation,
  );
  return {
    state: {
      kind: 'applying',
      nextSubmissionId: submissionId + 1,
      basisRevision,
      expectedText,
      pendingSubmissionIds: [
        ...(state.kind === 'applying' ? state.pendingSubmissionIds : []),
        submissionId,
      ],
    },
    commands: [{
      type: 'submit',
      submissionId,
      revision: basisRevision,
      operation: event.operation,
      selection: event.selection,
    }],
  };
};

const receiveReceipt = (
  state: EditorSyncState,
  event: Extract<EditorSyncEvent, { readonly type: 'receipt' }>,
): EditorSyncTransition => {
  if (state.kind !== 'applying'
    || !state.pendingSubmissionIds.includes(event.submissionId)) return unchanged(state);
  if (event.outcome === 'rejected') {
    return blocked(state.nextSubmissionId, 'Edit rejected; local draft retained.');
  }
  if (event.outcome === 'unknown') {
    return blocked(state.nextSubmissionId, 'Write outcome unknown; local draft retained.');
  }
  if (event.selection === 'unresolved') {
    return blocked(
      state.nextSubmissionId,
      'Edit committed, but merged selection is unavailable; local draft retained.',
    );
  }
  return unchanged({
    ...state,
    pendingSubmissionIds: state.pendingSubmissionIds.filter((id) => id !== event.submissionId),
  });
};

const readyAt = (
  nextSubmissionId: number,
  snapshot: ReadyEditorSnapshot,
  adopt: boolean,
): EditorSyncTransition => ({
  state: {
    kind: 'ready',
    nextSubmissionId,
    documentRevision: snapshot.revision,
  },
  commands: adopt ? [{ type: 'adopt', snapshot }] : [],
});

const blocked = (nextSubmissionId: number, message: string): EditorSyncTransition => ({
  state: { kind: 'blocked', nextSubmissionId, message },
  commands: [],
});

const unchanged = (state: EditorSyncState): EditorSyncTransition => ({ state, commands: [] });
