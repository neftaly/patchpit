import type { DocHandle } from '@automerge/automerge-repo';
import type { FilePickerStateDoc } from '@patchpit/system';
import { isDefaultFilePickerFolderOpen, type FileSelectionOptions } from './file-picker-model';

type FilePickerStatePatch = {
  readonly activeUrl?: string;
  readonly openFolders?: Readonly<Record<string, boolean>>;
  readonly selectedUrls?: readonly string[];
};

export function selectFilePickerUrl(
  handle: DocHandle<FilePickerStateDoc>,
  url: string,
  options?: FileSelectionOptions,
): void {
  commitFilePickerState(handle, (state) => selectedFilePickerStatePatch(state, url, options));
}

export function toggleFilePickerFolder(
  handle: DocHandle<FilePickerStateDoc>,
  url: string,
): void {
  commitFilePickerState(handle, (state) => toggledFilePickerFolderStatePatch(state, url));
}

function commitFilePickerState(
  handle: DocHandle<FilePickerStateDoc>,
  update: (doc: FilePickerStateDoc) => FilePickerStatePatch,
): void {
  const changes = update(handle.doc());

  handle.change((doc) => {
    if (changes.activeUrl !== undefined) doc.activeUrl = changes.activeUrl;
    if (changes.openFolders !== undefined) doc.openFolders = { ...changes.openFolders };
    if (changes.selectedUrls !== undefined) doc.selectedUrls = [...changes.selectedUrls];
  });
}

function selectedFilePickerStatePatch(
  state: FilePickerStateDoc,
  url: string,
  options?: FileSelectionOptions,
): FilePickerStatePatch {
  return {
    activeUrl: url,
    selectedUrls: selectedFilePickerUrls(state.selectedUrls, url, options),
  };
}

function selectedFilePickerUrls(
  selectedUrls: readonly string[],
  url: string,
  options?: FileSelectionOptions,
): readonly string[] {
  if (options?.selectedUrls !== undefined) return [...options.selectedUrls];
  if (!options?.toggle) return [url];
  return selectedUrls.includes(url)
    ? selectedUrls.filter((selectedUrl) => selectedUrl !== url)
    : [...selectedUrls, url];
}

function toggledFilePickerFolderStatePatch(
  state: FilePickerStateDoc,
  url: string,
): FilePickerStatePatch {
  return {
    openFolders: {
      ...state.openFolders,
      [url]: !(state.openFolders[url] ?? isDefaultFilePickerFolderOpen(state.rootUrl, url)),
    },
  };
}
