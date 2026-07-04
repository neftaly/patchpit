import type { FilesystemNode } from '../filesystem-tree';
import { findNode, folderSummary } from '../filesystem-tree';
import {
  WorkbenchNodeKind,
  type WorkbenchLayoutNode,
  type WorkbenchPane,
  type WorkbenchStateDoc,
  type WorkbenchTab,
} from '../filesystem';
import './workbench.css';

type WorkbenchActions = {
  readonly activateTab: (paneId: string, tabId: string) => void;
};

export function Workbench({
  actions,
  filesystemRoot,
  state,
}: {
  readonly actions: WorkbenchActions;
  readonly filesystemRoot: FilesystemNode;
  readonly state: WorkbenchStateDoc;
}) {
  return (
    <section className="workbench" aria-label="workbench">
      <WorkbenchNode
        actions={actions}
        filesystemRoot={filesystemRoot}
        node={state.layout}
        panes={state.panes}
      />
    </section>
  );
}

function WorkbenchNode({
  actions,
  filesystemRoot,
  node,
  panes,
}: {
  readonly actions: WorkbenchActions;
  readonly filesystemRoot: FilesystemNode;
  readonly node: WorkbenchLayoutNode;
  readonly panes: readonly WorkbenchPane[];
}) {
  if (node.kind === WorkbenchNodeKind.Split) {
    return (
      <div className={`workbench-split workbench-split-${node.direction}`}>
        {node.children.map((child, index) => (
          <WorkbenchNode
            actions={actions}
            filesystemRoot={filesystemRoot}
            key={`${child.kind}-${index}`}
            node={child}
            panes={panes}
          />
        ))}
      </div>
    );
  }

  const pane = panes.find((item) => item.id === node.paneId);
  return pane ? (
    <WorkbenchPaneView actions={actions} filesystemRoot={filesystemRoot} pane={pane} />
  ) : null;
}

function WorkbenchPaneView({
  actions,
  filesystemRoot,
  pane,
}: {
  readonly actions: WorkbenchActions;
  readonly filesystemRoot: FilesystemNode;
  readonly pane: WorkbenchPane;
}) {
  const tabs = pane.previewTab === null ? pane.pinnedTabs : [...pane.pinnedTabs, pane.previewTab];
  const activeTab = tabs.find((tab) => tab.id === pane.activeTabId) ?? tabs.at(0) ?? null;
  const node = activeTab === null ? null : findNode(filesystemRoot, activeTab.targetUrl);

  return (
    <section className="workbench-pane" aria-label="editor pane">
      <div className="workbench-tabs" role="tablist" aria-label="open files">
        {tabs.map((tab) => (
          <button
            aria-selected={tab.id === activeTab?.id}
            className="workbench-tab"
            data-preview={tab.pinned ? undefined : ''}
            key={tab.id}
            onClick={() => actions.activateTab(pane.id, tab.id)}
            role="tab"
            type="button"
          >
            {tab.title}
          </button>
        ))}
      </div>
      <Viewer node={node} tab={activeTab} />
    </section>
  );
}

function Viewer({
  node,
  tab,
}: {
  readonly node: FilesystemNode | null;
  readonly tab: WorkbenchTab | null;
}) {
  if (tab === null) {
    return <section className="viewer" aria-label="viewer" />;
  }

  return (
    <section className="viewer" aria-label="viewer">
      <header className="viewer-header">
        <h1>{tab.targetUrl}</h1>
      </header>
      {node?.kind === 'folder' ? (
        <pre className="file-preview">{JSON.stringify(folderSummary(node), null, 2)}</pre>
      ) : node?.sourceUrl ? (
        <div className="file-preview url-preview">
          <a href={node.sourceUrl}>{node.sourceUrl}</a>
          {node.mediaType.startsWith('image/') && (
            <img src={node.sourceUrl} alt={node.name} />
          )}
        </div>
      ) : (
        <pre className="file-preview">{node?.text ?? ''}</pre>
      )}
    </section>
  );
}
