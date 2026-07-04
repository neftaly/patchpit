import type { CSSProperties, MouseEvent } from 'react';
import { useMemo } from 'react';
import type { FilesystemNode } from '../filesystem-tree';
import type { FileManagerStateDoc } from '../filesystem';
import { fileIcon, folderIcon } from './file-icons';
import './sidebar.css';

type SidebarActions = {
  readonly openUrl: (url: string, title: string) => void;
  readonly previewUrl: (url: string, title: string) => void;
  readonly selectUrl: (
    url: string,
    options?: { readonly range?: readonly string[]; readonly toggle?: boolean },
  ) => void;
  readonly toggleFolder: (url: string) => void;
};

export function Sidebar({
  actions,
  root,
  state,
}: {
  readonly actions: SidebarActions;
  readonly root: FilesystemNode;
  readonly state: FileManagerStateDoc;
}) {
  const visibleUrls = useMemo(() => listVisibleUrls(root, state.openFolders), [root, state.openFolders]);
  return (
    <nav className="tree-pane" aria-label="project explorer">
      <ul className="tree" role="tree" aria-label="project files">
        <TreeItem actions={actions} depth={0} node={root} state={state} visibleUrls={visibleUrls} />
      </ul>
    </nav>
  );
}

function TreeItem({
  actions,
  depth,
  node,
  state,
  visibleUrls,
}: {
  readonly actions: SidebarActions;
  readonly depth: number;
  readonly node: FilesystemNode;
  readonly state: FileManagerStateDoc;
  readonly visibleUrls: readonly string[];
}) {
  const isOpen = state.openFolders.includes(node.url);
  const isSelected = state.selectedUrls.includes(node.url);
  const isActive = state.activeUrl === node.url;
  const icon = node.kind === 'folder' ? folderIcon(isOpen) : fileIcon(node.mediaType, node.name);

  return (
    <li
      data-active={isActive ? '' : undefined}
      role="treeitem"
      aria-expanded={node.kind === 'folder' ? isOpen : undefined}
      aria-selected={isSelected}
    >
      <button
        aria-pressed={isSelected}
        className={`tree-item tree-${node.kind}`}
        onClick={(event) => {
          selectFromPointer(event, node.url, visibleUrls, actions.selectUrl);
          if (node.kind === 'file' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
            actions.previewUrl(node.url, node.name);
          }
          if (node.kind === 'folder' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
            actions.toggleFolder(node.url);
          }
        }}
        onDoubleClick={() => {
          if (node.kind === 'file') actions.openUrl(node.url, node.name);
        }}
        style={treeDepthStyle(depth)}
        type="button"
      >
        {icon && <span className="tree-icon" aria-hidden="true">{icon}</span>}
        <span className="tree-name">{node.name || '/'}</span>
      </button>
      {node.kind === 'folder' && isOpen && (
        <ul role="group" style={treeGuideStyle(depth + 1)}>
          {node.entries.map((entry) => (
            <TreeItem
              actions={actions}
              depth={depth + 1}
              key={entry.url}
              node={entry}
              state={state}
              visibleUrls={visibleUrls}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function listVisibleUrls(node: FilesystemNode, openFolders: readonly string[]): readonly string[] {
  if (node.kind === 'file' || !openFolders.includes(node.url)) return [node.url];
  return [node.url, ...node.entries.flatMap((entry) => listVisibleUrls(entry, openFolders))];
}

function selectFromPointer(
  event: MouseEvent,
  url: string,
  visibleUrls: readonly string[],
  selectUrl: (
    url: string,
    options?: { readonly range?: readonly string[]; readonly toggle?: boolean },
  ) => void,
) {
  selectUrl(url, event.shiftKey ? { range: visibleUrls } : { toggle: event.metaKey || event.ctrlKey });
}

function treeDepthStyle(depth: number): CSSProperties {
  return { '--tree-indent': `${depth}rem` } as CSSProperties;
}

function treeGuideStyle(depth: number): CSSProperties {
  return { '--tree-guide-width': `${depth}rem` } as CSSProperties;
}
