import {
  applyTextSplice,
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
  readonly submissionId: number;
  readonly basisRevision: string;
  readonly expectedText: string;
  readonly queued: readonly TextSpliceIntent[];
  readonly outcome?: 'committed';
} | {
  readonly kind: 'blocked';
  readonly nextSubmissionId: number;
  readonly message: string;
};

export type EditorSyncEvent = {
  readonly type: 'intent';
  readonly operation: TextSpliceIntent;
  readonly snapshot: ReadyEditorSnapshot;
} | {
  readonly type: 'receipt';
  readonly submissionId: number;
  readonly outcome: 'committed' | 'rejected' | 'unknown';
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
  if (event.type === 'intent') {
    if (state.kind === 'applying') {
      return unchanged({ ...state, queued: [...state.queued, event.operation] });
    }
    return submit(state.nextSubmissionId, event.snapshot, event.operation, []);
  }
  if (event.type === 'receipt') {
    if (state.kind !== 'applying' || event.submissionId !== state.submissionId) {
      return unchanged(state);
    }
    if (event.outcome === 'rejected') {
      return blocked(state.nextSubmissionId, 'Edit rejected; local draft retained.');
    }
    if (event.outcome === 'unknown') {
      return blocked(state.nextSubmissionId, 'Write outcome unknown; local draft retained.');
    }
    return unchanged({ ...state, outcome: 'committed' });
  }
  if (state.kind === 'ready') {
    return state.documentRevision === event.snapshot.revision
      ? unchanged(state)
      : {
          state: {
            kind: 'ready',
            nextSubmissionId: state.nextSubmissionId,
            documentRevision: event.snapshot.revision,
          },
          commands: [{ type: 'adopt', snapshot: event.snapshot }],
        };
  }
  if (state.outcome !== 'committed' || event.snapshot.revision === state.basisRevision) {
    return unchanged(state);
  }
  const [next, ...remaining] = state.queued;
  if (next !== undefined) {
    return event.snapshot.text === state.expectedText
      ? submit(state.nextSubmissionId, event.snapshot, next, remaining)
      : blocked(
          state.nextSubmissionId,
          'Concurrent change needs draft reconciliation; local draft retained.',
        );
  }
  return event.snapshot.text === state.expectedText
    ? {
        state: {
          kind: 'ready',
          nextSubmissionId: state.nextSubmissionId,
          documentRevision: event.snapshot.revision,
        },
        commands: [],
      }
    : {
        state: {
          kind: 'ready',
          nextSubmissionId: state.nextSubmissionId,
          documentRevision: event.snapshot.revision,
        },
        commands: [{ type: 'adopt', snapshot: event.snapshot }],
      };
};

const submit = (
  submissionId: number,
  snapshot: ReadyEditorSnapshot,
  operation: TextSpliceIntent,
  queued: readonly TextSpliceIntent[],
): EditorSyncTransition => ({
  state: {
    kind: 'applying',
    nextSubmissionId: submissionId + 1,
    submissionId,
    basisRevision: snapshot.revision,
    expectedText: applyTextSplice(snapshot.text, operation),
    queued,
  },
  commands: [{
    type: 'submit',
    submissionId,
    revision: snapshot.revision,
    operation,
  }],
});

const blocked = (nextSubmissionId: number, message: string): EditorSyncTransition => ({
  state: { kind: 'blocked', nextSubmissionId, message },
  commands: [],
});

const unchanged = (state: EditorSyncState): EditorSyncTransition => ({ state, commands: [] });
