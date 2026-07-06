import {
  type ThemeDoc,
  type WindowContext,
} from '@patchpit/system';
import { Terminal } from './Terminal';
import type { TerminalAppSession } from './patchpit-app-runtime';

export function TerminalAppSurface({
  context,
  sessions,
  theme,
}: {
  readonly context: WindowContext;
  readonly sessions: Readonly<Record<string, TerminalAppSession>>;
  readonly theme: ThemeDoc;
}) {
  const session = sessions[context.url];
  if (session === undefined) {
    return (
      <section className="window-manager-empty-state" role="alert">
        <strong>Terminal state missing</strong>
        <span>The terminal context no longer has a matching app state document.</span>
      </section>
    );
  }

  if (session.runtime.status === 'opening') {
    return (
      <section className="window-manager-empty-state" role="status">
        Terminal filesystem capability opening.
      </section>
    );
  }

  if (session.runtime.status === 'failed') {
    return (
      <section className="window-manager-empty-state" role="alert">
        <strong>{session.runtime.failure.title}</strong>
        <span>{session.runtime.failure.message}</span>
      </section>
    );
  }

  return (
    <Terminal
      actions={session.actions}
      container={context.container}
      runtimeOptions={session.runtime.options}
      state={session.state}
      theme={theme}
    />
  );
}
