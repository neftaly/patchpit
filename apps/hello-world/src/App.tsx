import type { DocHandle } from '@automerge/automerge-repo';
import { automergeMapSource, defineAutomergeMapRelations } from '@tarstate/automerge';
import {
  as,
  asc,
  defineSchema,
  from,
  maybe,
  optional,
  pipe,
  project,
  relation,
  sort,
  stringField,
} from '@tarstate/core';
import { evaluate } from '@tarstate/core/evaluate';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { FilePicker } from './apps/file-picker/FilePicker';
import {
  createSeedFilesystem,
  defaultFolderOpen,
  type FilesystemDocumentRow,
  type FilesystemDoc,
  type FilesystemResourceRecord,
  PatchworkType,
  type WorkspaceLayout,
} from './filesystem';
import {
  buildFilesystem,
} from './filesystem-tree';
import { launchUrl } from './shared/launch-url';
import { WindowManager } from './window-manager/WindowManager';
import {
  closeTab,
  focusTab,
  openTab,
  previewTab,
} from './window-manager/window-manager-state';

const filesystemSchema = defineSchema({
  documents: relation<FilesystemDocumentRow>({
    key: 'url',
    fields: {
      url: stringField(),
      type: stringField(),
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
    mimeType: maybe(doc.mimeType),
    type: doc.type,
    url: doc.url,
  }),
);

export function App() {
  const seed = useMemo(() => createSeedFilesystem(), []);
  const fileManagerState = useAutomergeDoc(seed.fileManagerHandle);
  const windowManagerState = useAutomergeDoc(seed.windowManagerHandle);
  const liveDocuments = useMemo(
    () => ({
      ...folderDocuments(seed.documents),
      [seed.fileManagerHandle.url]: JSON.stringify(fileManagerState, null, 2),
      [seed.windowManagerHandle.url]: JSON.stringify(windowManagerState, null, 2),
    }),
    [fileManagerState, seed.documents, seed.fileManagerHandle.url, seed.windowManagerHandle.url, windowManagerState],
  );
  const windowManagerActions = useMemo(
    () => ({
      focusTab: (paneId: string, tabId: string) => {
        seed.windowManagerHandle.change((doc) => {
          focusTab(doc, paneId, tabId);
        });
      },
      closeTab: (paneId: string, tabId: string) => {
        seed.windowManagerHandle.change((doc) => {
          closeTab(doc, paneId, tabId);
        });
      },
    }),
    [seed.windowManagerHandle],
  );
  const fileManagerActions = useMemo(
    () => ({
      openUrl: (url: string) => {
        seed.windowManagerHandle.change((doc) => {
          openTab(doc, viewerUrl(url));
        });
      },
      previewUrl: (url: string) => {
        seed.windowManagerHandle.change((doc) => {
          previewTab(doc, viewerUrl(url));
        });
      },
      selectUrl: (
        url: string,
        options?: { readonly range?: readonly string[]; readonly toggle?: boolean },
      ) => {
        seed.fileManagerHandle.change((doc) => {
          const startUrl = doc.activeUrl;
          doc.activeUrl = url;
          doc.selectedUrls = options?.range
            ? selectedRange(startUrl, url, options.range)
            : options?.toggle
              ? toggleValue(doc.selectedUrls, url)
              : [url];
        });
      },
      toggleFolder: (url: string) => {
        seed.fileManagerHandle.change((doc) => {
          doc.openFolders[url] = !(doc.openFolders[url] ?? defaultFolderOpen);
        });
      },
    }),
    [seed.fileManagerHandle, seed.windowManagerHandle],
  );
  const filesystem = useMemo(() => {
    const result = evaluate(
      automergeMapSource(seed.indexDoc, { relations: filesystemRelations }),
      filesystemEntryQuery,
    );

    return result.diagnostics.length > 0
      ? { diagnostics: result.diagnostics, root: null }
      : {
          diagnostics: [],
          root: buildFilesystem(
            seed.rootUrl,
            seed.documents,
            result.rows as readonly FilesystemDocumentRow[],
          ),
        };
  }, [seed]);
  return (
    <main className="app-shell">
      {filesystem.root === null ? (
        <pre className="diagnostics-json">{JSON.stringify(filesystem, null, 2)}</pre>
      ) : (
        <section className="workspace" style={workspaceStyle(windowManagerState.workspace)}>
          <FilePicker actions={fileManagerActions} root={filesystem.root} state={fileManagerState} />
          <WindowManager
            actions={windowManagerActions}
            filesystemRoot={filesystem.root}
            liveDocuments={liveDocuments}
            state={windowManagerState}
          />
        </section>
      )}
    </main>
  );
}

function useAutomergeDoc<T>(handle: DocHandle<T>): T {
  const [doc, setDoc] = useState(() => handle.doc());
  useEffect(() => {
    const update = () => setDoc(handle.doc());
    handle.on('change', update);
    return () => {
      handle.off('change', update);
    };
  }, [handle]);
  return doc;
}

function selectedRange(
  startUrl: string,
  endUrl: string,
  visibleUrls: readonly string[],
): string[] {
  const startIndex = visibleUrls.indexOf(startUrl);
  const endIndex = visibleUrls.indexOf(endUrl);
  if (startIndex === -1 || endIndex === -1) return [endUrl];
  return visibleUrls.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);
}

function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function viewerUrl(src: string): string {
  return launchUrl('viewer.html', src);
}

function workspaceStyle(workspace: WorkspaceLayout): CSSProperties {
  return {
    '--workspace-file-picker-ratio': String(workspace.filePickerRatio),
  } as CSSProperties;
}

function folderDocuments(
  documents: readonly FilesystemResourceRecord[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    documents
      .filter(({ doc }) => doc['@patchwork'].type === PatchworkType.Folder)
      .map(({ doc, url }) => [url, JSON.stringify(doc, null, 2)]),
  );
}
