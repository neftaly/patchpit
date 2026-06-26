import { useState } from 'react';
import './style.css';

const pages = [
  { id: 'baseline', label: 'baseline' },
  { id: 'boxes', label: 'boxes' },
  { id: 'media', label: 'media' }
] as const;

type PageId = (typeof pages)[number]['id'];

export function App() {
  const [gridVisible, setGridVisible] = useState(false);
  const [page, setPage] = useState<PageId>('baseline');

  return (
    <main className="lab-shell" data-grid-visible={gridVisible} data-page={page}>
      <div className="grid-overlay" aria-hidden="true" />
      <header className="lab-toolbar flow-reset">
        <nav aria-label="chargrid pages" className="page-tabs">
          {pages.map((item) => (
            <button
              aria-current={page === item.id ? 'page' : undefined}
              className="page-tab"
              key={item.id}
              onClick={() => setPage(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          aria-pressed={gridVisible}
          className="grid-toggle-button"
          onClick={() => setGridVisible((visible) => !visible)}
          type="button"
        >
          {gridVisible ? 'hide grid' : 'show grid'}
        </button>
      </header>
      {page === 'baseline' ? <BaselinePage /> : null}
      {page === 'boxes' ? <BoxesPage /> : null}
      {page === 'media' ? <MediaPage /> : null}
    </main>
  );
}

function BaselinePage() {
  return <section className="lab-surface baseline-surface" aria-label="blank character grid canvas" />;
}

function BoxesPage() {
  return (
    <section className="lab-surface boxes-surface flow-reset" aria-label="grid-aligned interface primitives">
      <div className="panel panel-wide">
        <div className="panel-title">chargrid primitives</div>
        <p>
          Buttons, labels, rules, status strips, and text blocks stay on the same character rhythm as the blank
          baseline.
        </p>
      </div>
      <div className="primitive-row">
        <button className="primitive-button" type="button">
          view grid
        </button>
        <button className="primitive-button primitive-button-active" type="button">
          snap media
        </button>
        <button className="primitive-button" type="button">
          cube pass
        </button>
      </div>
      <div className="panel-grid">
        <article className="panel">
          <div className="panel-title">text + boxes</div>
          <p>
            Body copy wraps into integer cells. Borders sit on the outside edge so the inside can remain a predictable
            typing field.
          </p>
          <div className="meter" aria-label="snap fit 72 percent">
            <span style={{ inlineSize: '72%' }} />
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">state stack</div>
          <dl className="stat-list">
            <div>
              <dt>columns</dt>
              <dd>98ch</dd>
            </div>
            <div>
              <dt>line</dt>
              <dd>2.5ch</dd>
            </div>
            <div>
              <dt>snap</dt>
              <dd>on</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
}

function MediaPage() {
  return (
    <section className="lab-surface media-surface flow-reset" aria-label="media and terminal chargrid study">
      <div className="terminal-frame">
        <div className="terminal-title">media + projected geometry</div>
        <div className="media-layout">
          <div className="media-box" aria-label="canvas placeholder">
            <span>canvas/image placeholder</span>
            <b>42ch x 10ln</b>
          </div>
          <pre className="cube-box" aria-label="3d-ish placeholder">
            {`      +------+
    .'|     .'|
  .'  |   .'  |
 +----+--+    |
 |    |  |    |
 |    +--+----+
 |  .'   |  .'
 +.'-----+.'`}
          </pre>
        </div>
        <div className="terminal-log" aria-label="snap notes">
          <span>snap media: width 386px -&gt; 43ch</span>
          <span>ghost cells: 1ch x 1ln reserved</span>
          <span>paint pass: text, border, media, cube</span>
        </div>
      </div>
    </section>
  );
}
