import './launcher-bar.css';

export function LauncherBar({
  onResetSession,
}: {
  readonly onResetSession: () => void;
}) {
  const resetSession = () => {
    if (window.confirm('Reset current in-memory Patchpit state/session for this tab?')) onResetSession();
  };

  return (
    <footer className="launcher-bar" aria-label="shell launcher">
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
