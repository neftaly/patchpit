import { useState } from 'react';
import './style.css';

export function App() {
  const [gridVisible, setGridVisible] = useState(false);

  return (
    <main className="lab-shell" data-grid-visible={gridVisible}>
      <div className="grid-overlay" aria-hidden="true" />
      <header className="lab-toolbar flow-reset">
        <button
          aria-pressed={gridVisible}
          className="grid-toggle-button"
          onClick={() => setGridVisible((visible) => !visible)}
          type="button"
        >
          {gridVisible ? 'hide grid' : 'show grid'}
        </button>
      </header>
      <section className="lab-surface" aria-label="blank character grid canvas" />
    </main>
  );
}
