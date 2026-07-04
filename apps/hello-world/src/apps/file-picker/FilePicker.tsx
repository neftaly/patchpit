import type { CSSProperties, MouseEvent } from 'react';
import { defaultFolderOpen, type FilePickerStateDoc, type FilesystemNode } from '../../filesystem';
import type { FileSelectionOptions } from './file-picker-state';
import { fileIcon, folderIcon, type FileIcons } from './file-icons';
import './file-picker.css';

export type FilePickerActions = {
  readonly openUrl: (url: string, title: string) => void;
  readonly previewUrl: (url: string, title: string) => void;
  readonly selectUrl: (url: string, options?: FileSelectionOptions) => void;
  readonly toggleFolder: (url: string) => void;
};

export function FilePicker({
  actions,
  fileIcons,
  root,
  state,
}: {
  readonly actions: FilePickerActions;
  readonly fileIcons: FileIcons;
  readonly root: FilesystemNode;
  readonly state: FilePickerStateDoc;
}) {
  const visibleUrls = listVisibleUrls(root, state.openFolders);
  return (
    <nav className="tree-pane" aria-label="project explorer">
      <ul className="tree" role="tree" aria-label="project files">
        <TreeItem
          actions={actions}
          depth={0}
          icons={fileIcons}
          node={root}
          state={state}
          visibleUrls={visibleUrls}
        />
      </ul>
    </nav>
  );
}

function TreeItem({
  actions,
  depth,
  icons,
  node,
  state,
  visibleUrls,
}: {
  readonly actions: FilePickerActions;
  readonly depth: number;
  readonly icons: FileIcons;
  readonly node: FilesystemNode;
  readonly state: FilePickerStateDoc;
  readonly visibleUrls: readonly string[];
}) {
  const isOpen = node.kind === 'folder' ? isFolderOpen(state.openFolders, node.url) : false;
  const isSelected = state.selectedUrls.includes(node.url);
  const isActive = state.activeUrl === node.url;
  const icon = node.kind === 'folder' ? folderIcon(isOpen) : fileIcon(icons, node.mediaType);
  const title = node.name || '/';

  return (
    <li
      data-active={isActive ? '' : undefined}
      role="treeitem"
      aria-expanded={node.kind === 'folder' ? isOpen : undefined}
      aria-selected={isSelected}
    >
      <button
        aria-pressed={isSelected}
        className="tree-item"
        onClick={(event) => {
          selectFromPointer(event, node.url, visibleUrls, actions.selectUrl);
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
            actions.previewUrl(node.url, title);
            if (node.kind === 'folder') actions.toggleFolder(node.url);
          }
        }}
        onDoubleClick={() => {
          actions.openUrl(node.url, title);
        }}
        style={treeDepthStyle(depth)}
        type="button"
      >
        {icon && <span className="emoji-icon tree-icon" aria-hidden="true">{icon}</span>}
        <span className="tree-name">{title}</span>
      </button>
      {node.kind === 'folder' && isOpen && (
        <ul role="group" style={treeGuideStyle(depth + 1)}>
          {node.entries.map((entry) => (
            <TreeItem
              actions={actions}
              depth={depth + 1}
              icons={icons}
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
  openFolders: Readonly<Record<string, boolean>>,
): readonly string[] {
  if (node.kind === 'file' || !isFolderOpen(openFolders, node.url)) return [node.url];
  return [node.url, ...node.entries.flatMap((entry) => listVisibleUrls(entry, openFolders))];
}

function isFolderOpen(
  openFolders: Readonly<Record<string, boolean>>,
  url: string,
): boolean {
  return openFolders[url] ?? defaultFolderOpen;
}

function selectFromPointer(
  event: MouseEvent,
  url: string,
  visibleUrls: readonly string[],
  selectUrl: FilePickerActions['selectUrl'],
) {
  selectUrl(
    url,
    event.shiftKey
      ? { range: visibleUrls }
      : event.metaKey || event.ctrlKey
        ? { toggle: true }
        : undefined,
  );
}

function treeDepthStyle(depth: number): CSSProperties {
  return { '--tree-indent': `${depth}rem` } as CSSProperties;
}

function treeGuideStyle(depth: number): CSSProperties {
  return { '--tree-guide-width': `${depth}rem` } as CSSProperties;
}
