import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { EditorPublicationResult } from '@patchpit/sandbox';
import {
  attachEditContextInput,
  type AttachedEditContextInput,
} from './edit-context-input.ts';
import {
  createTextInputSession,
  type TextInputSession,
  type TextSpliceIntent,
} from './input-session.ts';
import type { EditorClient } from './editor-client.ts';
import {
  createEditorSyncState,
  transitionEditorSync,
  type EditorSyncEvent,
  type ReadyEditorSnapshot,
} from './editor-sync.ts';
import { useRemoteSelectionPaint } from './remote-selection-paint.ts';

export function MarkdownEditor({ client }: { readonly client: EditorClient }) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const editor = useRef<HTMLDivElement>(null);
  const input = useRef<AttachedEditContextInput | undefined>(undefined);
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  const deferredAdoption = useRef<ReadyEditorSnapshot | undefined>(undefined);
  const compositionBasis = useRef<ReadyEditorSnapshot | undefined>(undefined);
  const hasInputFocus = useRef(false);
  const [sync, setSync] = useState(createEditorSyncState);
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const dispatchSyncRef = useRef<(event: EditorSyncEvent) => void>(() => undefined);
  const [session, setSession] = useState(() => createTextInputSession(
    snapshot.state === 'ready' ? snapshot.text : '',
  ));
  const latestSession = useRef(session);
  latestSession.current = session;
  const [hasDocument, setHasDocument] = useState(snapshot.state === 'ready');
  const [issue, setIssue] = useState<string>();
  const documentRevision = snapshot.state === 'ready' ? snapshot.revision : undefined;
  const documentText = snapshot.state === 'ready' ? snapshot.text : undefined;
  const onSessionChange = useEffectEvent((next: TextInputSession) => {
    if (next.compositionBasisText !== undefined && compositionBasis.current === undefined) {
      const current = latestSnapshot.current;
      if (current.state === 'ready') {
        compositionBasis.current = { revision: current.revision, text: current.text };
      }
    }
    latestSession.current = next;
    setSession(next);
  });
  const adoptSnapshot = useEffectEvent((adopted: ReadyEditorSnapshot) => {
    const current = client.getSnapshot();
    if (current.state !== 'ready' || current.revision !== adopted.revision) return;
    const currentSession = latestSession.current;
    if (current.text === currentSession.text) {
      setIssue(undefined);
      return;
    }
    const localSelection = current.participants.find(({ local }) => local)?.selection;
    const fallback = Math.min(currentSession.selection.end, current.text.length);
    const selection = localSelection ?? { anchor: fallback, focus: fallback };
    if (input.current?.replace(current.text, {
      start: selection.anchor,
      end: selection.focus,
    }) === false) {
      deferredAdoption.current = adopted;
      return;
    }
    deferredAdoption.current = undefined;
    setHasDocument(true);
    setIssue(undefined);
  });
  const dispatchSync = useEffectEvent((event: EditorSyncEvent) => {
    const transition = transitionEditorSync(syncRef.current, event);
    syncRef.current = transition.state;
    setSync(transition.state);
    transition.commands.forEach((command) => {
      if (command.type === 'adopt') {
        adoptSnapshot(command.snapshot);
        return;
      }
      const receiveResult = (result: EditorPublicationResult) => {
        dispatchSyncRef.current({
          type: 'receipt',
          submissionId: command.submissionId,
          ...result,
        });
        const current = client.getSnapshot();
        if (current.state === 'ready') {
          dispatchSyncRef.current({ type: 'snapshot', snapshot: current });
        }
      };
      void client.commitSplice(command.revision, command.operation, command.selection).then(
        receiveResult,
        () => { receiveResult({ outcome: 'unknown', selection: 'unresolved' }); },
      );
    });
  });
  dispatchSyncRef.current = dispatchSync;
  const onSpliceIntent = useEffectEvent((intent: TextSpliceIntent, next: TextInputSession) => {
    const current = latestSnapshot.current;
    const basis = compositionBasis.current
      ?? (current.state === 'ready' ? { revision: current.revision, text: current.text } : undefined);
    if (basis !== undefined) {
      setIssue(undefined);
      dispatchSync({
        type: 'intent',
        operation: intent,
        selection: next.selection,
        snapshot: basis,
      });
    }
  });
  const onCompositionInterrupted = useEffectEvent(() => {
    compositionBasis.current = undefined;
    dispatchSync({ type: 'block', message: 'Composition interrupted; local draft retained.' });
  });
  const onCompositionEnd = useEffectEvent((changed: boolean) => {
    compositionBasis.current = undefined;
    const pending = deferredAdoption.current;
    deferredAdoption.current = undefined;
    if (!changed && pending !== undefined) adoptSnapshot(pending);
  });
  const onInputIssue = useEffectEvent((reason: string) => {
    setIssue(`Input rejected: ${reason}.`);
  });

  useEffect(() => {
    if (editor.current === null || input.current !== undefined || snapshot.state !== 'ready') return;
    setHasDocument(true);
    input.current = attachEditContextInput(editor.current, snapshot.text, {
      onCompositionEnd,
      onCompositionInterrupted,
      onInputIssue,
      onSessionChange,
      onSpliceIntent,
    });
    input.current.setReadOnly(syncRef.current.kind === 'blocked');
  }, [snapshot.state]);
  useEffect(() => () => {
    input.current?.close();
    input.current = undefined;
  }, []);
  useEffect(() => {
    if (documentRevision !== undefined && documentText !== undefined) {
      dispatchSync({
        type: 'snapshot',
        snapshot: { revision: documentRevision, text: documentText },
      });
    }
  }, [documentRevision, documentText]);
  useEffect(() => {
    input.current?.setReadOnly(snapshot.state !== 'ready' || sync.kind === 'blocked');
  }, [snapshot.state, sync.kind]);
  useEffect(() => {
    if (documentRevision !== undefined
      && sync.kind === 'ready'
      && session.compositionBasisText === undefined
      && deferredAdoption.current === undefined) {
      if (hasInputFocus.current) client.setSelection(documentRevision, session.selection);
    }
  }, [
    client,
    documentRevision,
    session.compositionBasisText,
    session.selection.end,
    session.selection.start,
    sync.kind,
  ]);
  const participants = snapshot.participants;
  const visibleParticipants = participants.slice(0, 5);
  const additionalParticipantCount = participants.length - visibleParticipants.length;
  const remotePaint = useRemoteSelectionPaint(
    editor,
    sync.kind === 'ready' && session.text === documentText ? participants : [],
    session.text,
  );

  const selectionStart = Math.min(session.selection.start, session.selection.end);
  const selectionEnd = Math.max(session.selection.start, session.selection.end);
  const localColor = participants.find(({ local }) => local)?.color ?? 0;
  const status = snapshot.state === 'ready'
    ? sync.kind === 'blocked' ? sync.message
      : issue ?? (sync.kind === 'applying' ? 'Applying…'
        : sync.nextSubmissionId === 1 ? 'Ready' : 'Applied')
    : snapshot.message;
  const announcedStatus = snapshot.state !== 'ready' || sync.kind === 'blocked' || issue !== undefined
    ? status
    : '';
  const syncState = sync.kind === 'blocked' ? 'unsaved' : sync.kind;
  return (
    <main
      className={`editor-app participant-${localColor}`}
      data-document-revision={documentRevision}
      data-sync-state={syncState}
    >
      {(hasDocument || snapshot.state === 'ready') && (
        <div
          aria-label="Markdown source"
          aria-multiline="true"
          aria-readonly={sync.kind === 'blocked' || snapshot.state !== 'ready'}
          className="editor"
          data-selection-end={session.selection.end}
          data-selection-start={session.selection.start}
          onBlur={() => {
            hasInputFocus.current = false;
          }}
          onFocus={() => {
            hasInputFocus.current = true;
            if (snapshot.state === 'ready'
              && syncRef.current.kind === 'ready'
              && session.compositionBasisText === undefined
              && deferredAdoption.current === undefined) {
              client.setSelection(snapshot.revision, session.selection);
            }
          }}
          ref={editor}
          role="textbox"
          tabIndex={0}
        >
          <span className="editor-text">
            <span>{session.text.slice(0, selectionStart)}</span>
            {selectionStart === selectionEnd
              ? null
              : <span className="selection">{session.text.slice(selectionStart, selectionEnd)}</span>}
            <span>{session.text.slice(selectionEnd)}</span>
          </span>
          {selectionStart === selectionEnd
            ? <span aria-hidden="true" className="caret" data-editor-caret />
            : null}
          <span aria-hidden="true" className="remote-paint">
            {remotePaint.flatMap((paint) => [
              ...paint.rectangles.map((style, index) => (
                <span
                  className={`remote-selection participant-${paint.color}`}
                  key={`${paint.sessionId}:selection:${index}`}
                  style={style}
                />
              )),
              <span
                className={`remote-caret participant-${paint.color}`}
                key={`${paint.sessionId}:caret`}
                style={paint.caret}
              >
                <span className="remote-label">{paint.label}</span>
              </span>,
            ])}
          </span>
        </div>
      )}
      <footer className="editor-status">
        <span>{status}</span>
        <span aria-live="polite" className="visually-hidden">{announcedStatus}</span>
        {participants.length > 0 && (
          <ul aria-label="Present editors" className="participants">
            {visibleParticipants.map((participant) => (
              <li className={`participant participant-${participant.color}`} key={participant.sessionId}>
                <span aria-hidden="true" className="participant-swatch" />
                {participant.local ? `You · ${participant.label}` : participant.label}
              </li>
            ))}
            {additionalParticipantCount > 0 && (
              <li aria-label={`${additionalParticipantCount} more editors`}>
                +{additionalParticipantCount}
              </li>
            )}
          </ul>
        )}
      </footer>
    </main>
  );
}
