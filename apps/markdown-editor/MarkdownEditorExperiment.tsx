import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { attachEditContextInput } from './edit-context-input.ts';
import {
  createTextInputSession,
  type TextInputSession,
  type TextSpliceIntent,
} from './input-session.ts';
import exampleMarkdown from './example.md?raw';

type IntentReport = {
  readonly count: number;
  readonly last?: TextSpliceIntent;
};

export function MarkdownEditorExperiment() {
  const editor = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState(() => createTextInputSession(exampleMarkdown));
  const [intentReport, setIntentReport] = useState<IntentReport>({ count: 0 });
  const [status, setStatus] = useState('ready');
  const onSessionChange = useEffectEvent((next: TextInputSession) => { setSession(next); });
  const onSpliceIntent = useEffectEvent((intent: TextSpliceIntent) => {
    setIntentReport(({ count }) => ({ count: count + 1, last: intent }));
  });
  const onCompositionInterrupted = useEffectEvent(() => { setStatus('composition interrupted'); });
  const onInputIssue = useEffectEvent((reason: string) => { setStatus(`input rejected: ${reason}`); });

  useEffect(() => {
    if (editor.current === null) return;
    return attachEditContextInput(editor.current, exampleMarkdown, {
      onCompositionInterrupted,
      onInputIssue,
      onSessionChange,
      onSpliceIntent,
    });
  }, []);

  const selectionStart = Math.min(session.selection.start, session.selection.end);
  const selectionEnd = Math.max(session.selection.start, session.selection.end);
  return (
    <main>
      <h1>Markdown editor experiment</h1>
      <div
        aria-label="Markdown source"
        aria-multiline="true"
        className="editor"
        data-intent-count={intentReport.count}
        data-selection-end={session.selection.end}
        data-selection-start={session.selection.start}
        ref={editor}
        role="textbox"
        tabIndex={0}
      >
        <span>{session.text.slice(0, selectionStart)}</span>
        {selectionStart === selectionEnd
          ? <span aria-hidden="true" className="caret" />
          : <span className="selection">{session.text.slice(selectionStart, selectionEnd)}</span>}
        <span>{session.text.slice(selectionEnd)}</span>
      </div>
      <output>
        {status}; {intentReport.count} semantic {intentReport.count === 1 ? 'splice' : 'splices'}
      </output>
      {intentReport.last !== undefined && (
        <pre aria-label="Last semantic splice">{JSON.stringify(intentReport.last)}</pre>
      )}
    </main>
  );
}
