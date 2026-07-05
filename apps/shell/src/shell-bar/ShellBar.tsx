import './shell-bar.css';
import type { LauncherItem } from '../launch-router/launch-router';

export function ShellBar({ items }: { readonly items: readonly LauncherItem[] }) {
  return (
    <footer className="shell-bar" aria-label="shell launcher">
      <nav className="shell-bar-launchers" aria-label="apps">
        {items.map((item) => (
          <button
            className="shell-bar-button"
            data-active={item.active ? '' : undefined}
            key={item.app}
            onClick={item.launch}
            type="button"
          >
            <span className="emoji-icon shell-bar-icon" aria-hidden="true">{item.emoji}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </footer>
  );
}
