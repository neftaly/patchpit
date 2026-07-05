import type { DocHandle } from '@automerge/automerge-repo';
import {
  defineSchema,
  opaqueField,
  optional,
  relation,
  stringField,
  write,
} from '@tarstate/core';
import { defaultFolderOpen, type FilePickerStateDoc } from '@patchpit/system';

export type FileSelectionOptions = {
  readonly range?: readonly string[];
  readonly toggle?: boolean;
};

type FilePickerStateRow = {
  activeUrl?: string;
  id: string;
  openFolders: Record<string, boolean>;
  selectedUrls: string[];
};

const stateId = 'file-picker';
const filePickerSchema = defineSchema({
  state: relation<FilePickerStateRow>({
    key: 'id',
    fields: {
      activeUrl: optional(stringField()),
      id: stringField(),
      openFolders: opaqueField<Record<string, boolean>>(),
      selectedUrls: opaqueField<string[]>(),
    },
  }),
});

export function selectFilePickerUrl(
  handle: DocHandle<FilePickerStateDoc>,
  url: string,
  options?: FileSelectionOptions,
): void {
  commitFilePickerState(handle, (doc) => {
    const anchor = doc.activeUrl;
    doc.activeUrl = url;
    if (options?.range !== undefined && anchor !== undefined) {
      const start = options.range.indexOf(anchor);
      const end = options.range.indexOf(url);
      doc.selectedUrls = start === -1 || end === -1
        ? [url]
        : options.range.slice(Math.min(start, end), Math.max(start, end) + 1);
    } else if (options?.toggle) {
      doc.selectedUrls = doc.selectedUrls.includes(url)
        ? doc.selectedUrls.filter((item) => item !== url)
        : [...doc.selectedUrls, url];
    } else {
      doc.selectedUrls = [url];
    }
  });
}

export function toggleFilePickerFolder(
  handle: DocHandle<FilePickerStateDoc>,
  url: string,
): void {
  commitFilePickerState(handle, (doc) => {
    doc.openFolders[url] = !(doc.openFolders[url] ?? defaultFolderOpen);
  });
}

function commitFilePickerState(
  handle: DocHandle<FilePickerStateDoc>,
  update: (doc: FilePickerStateDoc) => void,
): void {
  const next = cloneFilePickerState(handle.doc());
  update(next);
  const changes = write(filePickerSchema.state)
    .updateByKey(stateId, {
      ...(next.activeUrl === undefined ? {} : { activeUrl: next.activeUrl }),
      id: stateId,
      openFolders: { ...next.openFolders },
      selectedUrls: [...next.selectedUrls],
    })
    .changes as Partial<FilePickerStateRow>;

  handle.change((doc) => {
    if (changes.activeUrl === undefined) delete doc.activeUrl;
    else doc.activeUrl = changes.activeUrl;
    if (changes.openFolders !== undefined) doc.openFolders = { ...changes.openFolders };
    if (changes.selectedUrls !== undefined) doc.selectedUrls = [...changes.selectedUrls];
  });
}

function cloneFilePickerState(doc: FilePickerStateDoc): FilePickerStateDoc {
  return {
    ...doc,
    openFolders: { ...doc.openFolders },
    selectedUrls: [...doc.selectedUrls],
  };
}
