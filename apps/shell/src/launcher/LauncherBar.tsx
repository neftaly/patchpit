import './launcher-bar.css';
import type { LauncherItem } from './launch-router';

export function LauncherBar({ items }: { readonly items: readonly LauncherItem[] }) {
  return (
    <footer className="launcher-bar" aria-label="shell launcher">
      <nav className="launcher-bar-items" aria-label="apps">
        {items.map((item) => (
          <button
            className="launcher-bar-button"
            data-active={item.active ? '' : undefined}
            key={item.app}
            onClick={item.launch}
            type="button"
          >
            <span className="emoji-icon launcher-bar-icon" aria-hidden="true">{item.emoji}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </footer>
  );
}
