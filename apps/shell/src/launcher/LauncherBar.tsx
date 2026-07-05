import './launcher-bar.css';
import type { LauncherItem } from './launch-router';

export function LauncherBar({
  items,
  onResetSession,
}: {
  readonly items: readonly LauncherItem[];
  readonly onResetSession: () => void;
}) {
  const resetSession = () => {
    if (window.confirm('Reset current in-memory Patchpit state/session for this tab?')) onResetSession();
  };

  return (
    <footer className="launcher-bar" aria-label="shell launcher">
      <nav className="launcher-bar-items" aria-label="apps">
        {items.map((launcherItem) => (
          <button
            className="launcher-bar-button"
            data-active={launcherItem.active ? '' : undefined}
            key={launcherItem.app}
            onClick={launcherItem.launch}
            type="button"
          >
            <span className="emoji-icon launcher-bar-icon" aria-hidden="true">{launcherItem.emoji}</span>
            <span>{launcherItem.label}</span>
          </button>
        ))}
      </nav>
      <div className="launcher-bar-system-buttons" aria-label="system">
        <a
          className="launcher-bar-button"
          href="https://github.com/neftaly/patchpit/"
          rel="noreferrer"
          target="_blank"
          title="Patchpit GitHub"
        >
          <span>Patchpit GitHub</span>
        </a>
        <button
          aria-label="Reset current in-memory session state"
          className="launcher-bar-button launcher-bar-reset-button"
          onClick={resetSession}
          title="Reset current in-memory session state"
          type="button"
        >
          <span className="launcher-bar-reset-icon" aria-hidden="true">↻</span>
          <span>Reset</span>
        </button>
      </div>
    </footer>
  );
}
