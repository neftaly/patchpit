import type { CSSProperties, DragEvent, MouseEvent } from 'react';
import type { FilePickerStateDoc, FilesystemNode } from '@patchpit/system';
import {
  filePickerSelectionRange,
  isFilePickerFolderOpen,
  listVisibleFilePickerUrls,
  type FileSelectionOptions,
} from './file-picker-model';
import { fileIcon, folderIcon, type FileIcons } from './file-icons';
import './file-picker.css';

export type FilePickerActions = {
  readonly openUrl: (url: string, title: string) => void;
  readonly previewUrl: (url: string, title: string) => void;
  readonly selectUrl: (url: string, options?: FileSelectionOptions) => void;
  readonly toggleFolder: (url: string) => void;
};

export const filePickerDragType = 'application/x.patchpit-file';

export type DraggedFilePickerUrl = {
  readonly title: string;
  readonly url: string;
};

type FilePickerItemStyle = CSSProperties & {
  readonly '--tree-depth-size': string;
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
  const visibleUrls = listVisibleFilePickerUrls(root, state.openFolders, state.rootUrl);
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
  const isOpen = node.kind === 'folder'
    ? isFilePickerFolderOpen(state.openFolders, node.url, state.rootUrl)
    : false;
  const isSelected = state.selectedUrls.includes(node.url);
  const isActive = state.activeUrl === node.url;
  const icon = node.kind === 'folder' ? folderIcon(isOpen) : fileIcon(icons, node.mediaType);
  const displayName = node.name || '/';

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
        draggable
        onClick={(event) => {
          selectUrlFromPointer(event, state.activeUrl, node.url, visibleUrls, actions.selectUrl);
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
            if (node.kind === 'folder') actions.toggleFolder(node.url);
            actions.previewUrl(node.url, displayName);
          }
        }}
        onDoubleClick={() => {
          actions.openUrl(node.url, displayName);
        }}
        onDragStart={(event) => {
          beginFileDrag(event, { title: displayName, url: node.url });
        }}
        style={depthStyle(depth)}
        type="button"
      >
        {icon && <span className="emoji-icon tree-icon" aria-hidden="true">{icon}</span>}
        <span className="tree-name">{displayName}</span>
      </button>
      {node.kind === 'folder' && isOpen && (
        <ul role="group" style={depthStyle(depth + 1)}>
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

function beginFileDrag(event: DragEvent, draggedFile: DraggedFilePickerUrl): void {
  event.dataTransfer.effectAllowed = 'copyMove';
  event.dataTransfer.setData(filePickerDragType, JSON.stringify(draggedFile));
}

function selectUrlFromPointer(
  event: MouseEvent,
  selectionAnchorUrl: string | undefined,
  url: string,
  visibleUrls: readonly string[],
  selectUrl: FilePickerActions['selectUrl'],
) {
  selectUrl(
    url,
    event.shiftKey
      ? { selectedUrls: filePickerSelectionRange(selectionAnchorUrl, url, visibleUrls) }
      : event.metaKey || event.ctrlKey
        ? { toggle: true }
        : undefined,
  );
}

function depthStyle(depth: number): FilePickerItemStyle {
  return { '--tree-depth-size': `${depth}rem` };
}
