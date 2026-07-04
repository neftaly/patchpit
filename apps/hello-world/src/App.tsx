import type { DocHandle } from '@automerge/automerge-repo';
import { automergeMapSource, defineAutomergeMapRelations } from '@tarstate/automerge';
import {
  as,
  asc,
  defineSchema,
  from,
  jsonField,
  maybe,
  optional,
  pipe,
  project,
  relation,
  sort,
  stringField,
} from '@tarstate/core';
import { evaluate } from '@tarstate/core/evaluate';
import { useMemo, useSyncExternalStore } from 'react';
import {
  selectFilePickerUrl,
  toggleFilePickerFolder,
  type FileSelectionOptions,
} from './apps/file-picker/file-picker-state';
import { fileIcons } from './apps/file-picker/file-icons';
import {
  buildFilesystem,
  createSeedFilesystem,
  type FilesystemDocumentRow,
  type FilesystemDoc,
  type WindowContext,
} from './filesystem';
import { WindowManager } from './window-manager/WindowManager';
import {
  closeContext,
  commitWindowManagerState,
  focusContext,
  openContext,
  previewContext,
  resizeSplit,
  type SplitPath,
} from './window-manager/window-manager-state';

const filesystemSchema = defineSchema({
  documents: relation<FilesystemDocumentRow>({
    key: 'url',
    fields: {
      url: stringField(),
      type: stringField(),
      entries: optional(jsonField()),
      title: optional(stringField()),
      mimeType: optional(stringField()),
      content: optional(stringField()),
    },
  }),
});

const filesystemRelations = defineAutomergeMapRelations<FilesystemDoc>()([
  { relation: filesystemSchema.documents, path: ['filesystem', 'documents'] },
]);

const doc = as(filesystemSchema.documents, 'doc');
const filesystemEntryQuery = pipe(
  from(doc),
  sort(asc(doc.url)),
  project({
    content: maybe(doc.content),
    entries: maybe(doc.entries),
    mimeType: maybe(doc.mimeType),
    title: maybe(doc.title),
    type: doc.type,
    url: doc.url,
  }),
);

export function App() {
  const seed = useMemo(() => createSeedFilesystem(), []);
  const fileTypes = useAutomergeDoc(seed.fileTypesHandle);
  const iconRules = useMemo(() => fileIcons(fileTypes), [fileTypes]);
  const filePickerState = useAutomergeDoc(seed.filePickerStateHandle);
  const windowManagerState = useAutomergeDoc(seed.windowManagerHandle);
  const liveDocuments = {
    [seed.fileTypesHandle.url]: JSON.stringify(fileTypes, null, 2),
    [seed.filePickerStateHandle.url]: JSON.stringify(filePickerState, null, 2),
    [seed.windowManagerHandle.url]: JSON.stringify(windowManagerState, null, 2),
  };
  const filesystem = useMemo(() => {
    const result = evaluate(
      automergeMapSource(seed.indexDoc, { relations: filesystemRelations }),
      filesystemEntryQuery,
    );

    return result.diagnostics.length > 0
      ? { diagnostics: result.diagnostics, root: null }
      : {
          diagnostics: [],
          root: buildFilesystem(seed.rootUrl, result.rows as readonly FilesystemDocumentRow[]),
        };
  }, [seed]);
  const windowManagerActions = {
    focusContext: (surfaceId: string, contextId: string) => {
      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        focusContext(doc, surfaceId, contextId);
      });
    },
    closeContext: (surfaceId: string, contextId: string) => {
      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        closeContext(doc, surfaceId, contextId);
      });
    },
    resizeSplit: (path: SplitPath, ratio: number) => {
      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        resizeSplit(doc, path, ratio);
      });
    },
  };
  const filePickerActions = (sourceSurfaceId: string) => ({
    openUrl: (url: string, title: string) => {
      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        openContext(doc, viewerContext(url, title), sourceSurfaceId);
      });
    },
    previewUrl: (url: string, title: string) => {
      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        previewContext(doc, viewerContext(url, title), sourceSurfaceId);
      });
    },
    selectUrl: (
      url: string,
      options?: FileSelectionOptions,
    ) => {
      selectFilePickerUrl(seed.filePickerStateHandle, url, options);
    },
    toggleFolder: (url: string) => {
      toggleFilePickerFolder(seed.filePickerStateHandle, url);
    },
  });
  const filePickers = {
    [seed.filePickerStateHandle.url]: {
      actions: filePickerActions,
      fileIcons: iconRules,
      state: filePickerState,
    },
  };
  return (
    <main className="app-shell">
      {filesystem.root === null ? (
        <pre className="diagnostics-json">{JSON.stringify(filesystem, null, 2)}</pre>
      ) : (
        <WindowManager
          actions={windowManagerActions}
          filePickers={filePickers}
          filesystemRoot={filesystem.root}
          liveDocuments={liveDocuments}
          state={windowManagerState}
        />
      )}
    </main>
  );
}

function viewerContext(url: string, title: string | undefined): WindowContext {
  return {
    app: 'viewer',
    id: `viewer:${url}`,
    ...(title === undefined ? {} : { title }),
    url,
  };
}

function useAutomergeDoc<T>(handle: DocHandle<T>): T {
  return useSyncExternalStore(
    (update) => {
      handle.on('change', update);
      return () => handle.off('change', update);
    },
    () => handle.doc(),
  );
}
