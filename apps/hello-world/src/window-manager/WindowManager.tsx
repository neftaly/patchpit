import type { CSSProperties, KeyboardEvent } from 'react';
import { Viewer } from '../apps/viewer/Viewer';
import type { FilesystemNode } from '../filesystem-tree';
import {
  WindowManagerNodeKind,
  type WindowLayoutNode,
  type WindowPane,
  type WindowPaneTab,
  type WindowManagerStateDoc,
  type WindowTab,
} from '../filesystem';
import './window-manager.css';

export type WindowManagerActions = {
  readonly closeTab: (paneId: string, tabId: string) => void;
  readonly focusTab: (paneId: string, tabId: string) => void;
};

export function WindowManager({
  actions,
  filesystemRoot,
  liveDocuments,
  state,
}: {
  readonly actions: WindowManagerActions;
  readonly filesystemRoot: FilesystemNode;
  readonly liveDocuments: Readonly<Record<string, string>>;
  readonly state: WindowManagerStateDoc;
}) {
  return (
    <section className="window-manager" aria-label="window manager">
      <WindowManagerNode
        actions={actions}
        filesystemRoot={filesystemRoot}
        liveDocuments={liveDocuments}
        node={state.layout}
        paneTabs={state.paneTabs}
        panes={state.panes}
        tabs={state.tabs}
      />
    </section>
  );
}

function WindowManagerNode({
  actions,
  filesystemRoot,
  liveDocuments,
  node,
  paneTabs,
  panes,
  style,
  tabs,
}: {
  readonly actions: WindowManagerActions;
  readonly filesystemRoot: FilesystemNode;
  readonly liveDocuments: Readonly<Record<string, string>>;
  readonly node: WindowLayoutNode;
  readonly paneTabs: Readonly<Record<string, WindowPaneTab>>;
  readonly panes: Readonly<Record<string, WindowPane>>;
  readonly style?: CSSProperties;
  readonly tabs: Readonly<Record<string, WindowTab>>;
}) {
  if (node.kind === WindowManagerNodeKind.Split) {
    return (
      <div className={`window-manager-split window-manager-split-${node.direction}`} style={style}>
        {node.children.map((child, index) => (
          <WindowManagerNode
            actions={actions}
            filesystemRoot={filesystemRoot}
            liveDocuments={liveDocuments}
            key={`${child.kind}-${index}`}
            node={child}
            paneTabs={paneTabs}
            panes={panes}
            style={splitChildStyle(node.sizes[index])}
            tabs={tabs}
          />
        ))}
      </div>
    );
  }

  const pane = panes[node.paneId];
  return pane ? (
    <WindowPaneView
      actions={actions}
      filesystemRoot={filesystemRoot}
      liveDocuments={liveDocuments}
      pane={pane}
      paneTabsById={paneTabs}
      tabsById={tabs}
      {...(style === undefined ? {} : { style })}
    />
  ) : null;
}

function WindowPaneView({
  actions,
  filesystemRoot,
  liveDocuments,
  pane,
  paneTabsById,
  style,
  tabsById,
}: {
  readonly actions: WindowManagerActions;
  readonly filesystemRoot: FilesystemNode;
  readonly liveDocuments: Readonly<Record<string, string>>;
  readonly pane: WindowPane;
  readonly paneTabsById: Readonly<Record<string, WindowPaneTab>>;
  readonly style?: CSSProperties;
  readonly tabsById: Readonly<Record<string, WindowTab>>;
}) {
  const tabs = paneTabs(pane, paneTabsById, tabsById);
  const selectedTab = tabs.find((tab) => tab.id === pane.selectedTabId) ?? tabs.at(0) ?? null;

  return (
    <section className="window-manager-pane" aria-label="window pane" style={style}>
      <header className="window-manager-pane-header">
        <div className="window-manager-tabs" role="tablist" aria-label="open windows">
          {tabs.map((tab) => (
            <div
              className="window-manager-tab"
              data-preview={tab.temporary ? '' : undefined}
              data-selected={tab.id === selectedTab?.id ? '' : undefined}
              onClick={() => actions.focusTab(pane.id, tab.id)}
              onKeyDown={(event) => {
                if (isActivationKey(event)) actions.focusTab(pane.id, tab.id);
              }}
              aria-selected={tab.id === selectedTab?.id}
              key={tab.id}
              role="tab"
              tabIndex={0}
              title={tab.targetUrl}
            >
              <span className="window-manager-tab-label">
                {tab.targetUrl}
              </span>
              <button
                aria-label={`Close ${tab.targetUrl}`}
                className="window-manager-tab-icon"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.closeTab(pane.id, tab.id);
                }}
                title="Close window"
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </header>
      <Viewer filesystemRoot={filesystemRoot} liveDocuments={liveDocuments} tab={selectedTab} />
    </section>
  );
}

function isActivationKey(event: KeyboardEvent): boolean {
  if (event.key !== 'Enter' && event.key !== ' ') return false;
  event.preventDefault();
  return true;
}

function splitChildStyle(size = 1): CSSProperties {
  return { flex: `${size} 1 0` };
}

function paneTabs(
  pane: WindowPane,
  paneTabsById: Readonly<Record<string, WindowPaneTab>>,
  tabsById: Readonly<Record<string, WindowTab>>,
): readonly WindowTab[] {
  const tabRows = Object.values(paneTabsById)
    .filter((row) => row.paneId === pane.id)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const tabs = tabRows.flatMap((row) => {
    const tab = tabsById[row.tabId];
    return tab === undefined ? [] : [tab];
  });

  return tabs;
}
