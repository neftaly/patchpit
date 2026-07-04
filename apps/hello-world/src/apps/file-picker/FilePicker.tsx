import type { CSSProperties, MouseEvent } from 'react';
import { useMemo } from 'react';
import { defaultFolderOpen, type FileManagerStateDoc } from '../../filesystem';
import type { FilesystemNode } from '../../filesystem-tree';
import { fileIcon, folderIcon } from './file-icons';
import './file-picker.css';

type FilePickerActions = {
  readonly openUrl: (url: string) => void;
  readonly previewUrl: (url: string) => void;
  readonly selectUrl: (
    url: string,
    options?: { readonly range?: readonly string[]; readonly toggle?: boolean },
  ) => void;
  readonly toggleFolder: (url: string) => void;
};

export function FilePicker({
  actions,
  root,
  state,
}: {
  readonly actions: FilePickerActions;
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
  readonly actions: FilePickerActions;
  readonly depth: number;
  readonly node: FilesystemNode;
  readonly state: FileManagerStateDoc;
  readonly visibleUrls: readonly string[];
}) {
  const isOpen = node.kind === 'folder' ? isFolderOpen(state.openFolders, node.url) : false;
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
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
            actions.previewUrl(node.url);
            if (node.kind === 'folder') actions.toggleFolder(node.url);
          }
        }}
        onDoubleClick={() => {
          actions.openUrl(node.url);
        }}
        style={treeDepthStyle(depth)}
        type="button"
      >
        {icon && <span className="emoji-icon tree-icon" aria-hidden="true">{icon}</span>}
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

function listVisibleUrls(
  node: FilesystemNode,
  openFolders: Readonly<Record<string, boolean | undefined>>,
): readonly string[] {
  if (node.kind === 'file' || !isFolderOpen(openFolders, node.url)) return [node.url];
  return [node.url, ...node.entries.flatMap((entry) => listVisibleUrls(entry, openFolders))];
}

function isFolderOpen(
  openFolders: Readonly<Record<string, boolean | undefined>>,
  url: string,
): boolean {
  return openFolders[url] ?? defaultFolderOpen;
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
