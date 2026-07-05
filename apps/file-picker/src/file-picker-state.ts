import type { DocHandle } from '@automerge/automerge-repo';
import type { FilePickerStateDoc } from '@patchpit/system';
import { isDefaultFilePickerFolderOpen, type FileSelectionOptions } from './file-picker-model';

type FilePickerStateRow = {
  activeUrl?: string;
  id: string;
  openFolders: Record<string, boolean>;
  selectedUrls: string[];
};

const stateId = 'file-picker';

export function selectFilePickerUrl(
  handle: DocHandle<FilePickerStateDoc>,
  url: string,
  options?: FileSelectionOptions,
): void {
  commitFilePickerState(handle, (state) => selectedFilePickerState(state, url, options));
}

export function toggleFilePickerFolder(
  handle: DocHandle<FilePickerStateDoc>,
  url: string,
): void {
  commitFilePickerState(handle, (state) => toggledFilePickerFolderState(state, url));
}

function commitFilePickerState(
  handle: DocHandle<FilePickerStateDoc>,
  update: (doc: FilePickerStateDoc) => FilePickerStateDoc,
): void {
  const changes = filePickerStateRow(update(handle.doc()));

  handle.change((doc) => {
    if (changes.activeUrl === undefined) delete doc.activeUrl;
    else doc.activeUrl = changes.activeUrl;
    doc.openFolders = { ...changes.openFolders };
    doc.selectedUrls = [...changes.selectedUrls];
  });
}

function selectedFilePickerState(
  state: FilePickerStateDoc,
  url: string,
  options?: FileSelectionOptions,
): FilePickerStateDoc {
  const selectionAnchorUrl = state.activeUrl;
  return {
    ...cloneFilePickerState(state),
    activeUrl: url,
    selectedUrls: selectedFilePickerUrls(state.selectedUrls, url, selectionAnchorUrl, options),
  };
}

function selectedFilePickerUrls(
  selectedUrls: readonly string[],
  url: string,
  selectionAnchorUrl: string | undefined,
  options?: FileSelectionOptions,
): string[] {
  if (options?.range !== undefined && selectionAnchorUrl !== undefined) {
    const anchorIndex = options.range.indexOf(selectionAnchorUrl);
    const selectedIndex = options.range.indexOf(url);
    return anchorIndex === -1 || selectedIndex === -1
      ? [url]
      : options.range.slice(Math.min(anchorIndex, selectedIndex), Math.max(anchorIndex, selectedIndex) + 1);
  }
  if (!options?.toggle) return [url];
  return selectedUrls.includes(url)
    ? selectedUrls.filter((selectedUrl) => selectedUrl !== url)
    : [...selectedUrls, url];
}

function toggledFilePickerFolderState(
  state: FilePickerStateDoc,
  url: string,
): FilePickerStateDoc {
  return {
    ...cloneFilePickerState(state),
    openFolders: {
      ...state.openFolders,
      [url]: !(state.openFolders[url] ?? isDefaultFilePickerFolderOpen(state.rootUrl, url)),
    },
  };
}

function filePickerStateRow(state: FilePickerStateDoc): FilePickerStateRow {
  return {
    ...(state.activeUrl === undefined ? {} : { activeUrl: state.activeUrl }),
    id: stateId,
    openFolders: { ...state.openFolders },
    selectedUrls: [...state.selectedUrls],
  };
}

function cloneFilePickerState(doc: FilePickerStateDoc): FilePickerStateDoc {
  return {
    ...doc,
    openFolders: { ...doc.openFolders },
    selectedUrls: [...doc.selectedUrls],
  };
}
