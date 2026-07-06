import type { CSSProperties, PointerEvent } from 'react';
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

const doublePointerActivationMs = 500;

let lastPrimaryPointerActivation: {
  readonly at: number;
  readonly count: number;
  readonly pointerType: string;
  readonly url: string;
} | undefined;

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
        onPointerUp={(event) => {
          const activationCount = primaryPointerActivationCount(event, node.url);
          if (activationCount === 0) return;
          selectUrlFromPointer(event, state.activeUrl, node.url, visibleUrls, actions.selectUrl);
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
            if (activationCount >= 2) {
              actions.openUrl(node.url, displayName);
              return;
            }
            if (node.kind === 'folder') actions.toggleFolder(node.url);
            actions.previewUrl(node.url, displayName);
          }
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

function selectUrlFromPointer(
  event: PointerEvent,
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

function primaryPointerActivationCount(event: PointerEvent, url: string): number {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return 0;
  const previous = lastPrimaryPointerActivation;
  const count = previous?.url === url
    && previous.pointerType === event.pointerType
    && event.timeStamp - previous.at <= doublePointerActivationMs
      ? previous.count + 1
      : 1;
  lastPrimaryPointerActivation = { at: event.timeStamp, count, pointerType: event.pointerType, url };
  return count;
}

function depthStyle(depth: number): FilePickerItemStyle {
  return { '--tree-depth-size': `${depth}rem` };
}
