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
import { useEffect, useMemo, useState } from 'react';
import {
  createSeedFilesystem,
  type FilesystemDocumentRow,
  type FilesystemDoc,
  type WorkbenchPane,
  type WorkbenchTab,
  WorkbenchTabKind,
} from './filesystem';
import {
  buildFilesystem,
} from './filesystem-tree';
import { Sidebar } from './sidebar/Sidebar';
import { Workbench } from './workbench/Workbench';

const filesystemSchema = defineSchema({
  documents: relation<FilesystemDocumentRow>({
    key: 'url',
    fields: {
      url: stringField(),
      entryKind: stringField(),
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
    entryKind: doc.entryKind,
    mimeType: maybe(doc.mimeType),
    url: doc.url,
  }),
);

export function App() {
  const seed = useMemo(() => createSeedFilesystem(), []);
  const fileManagerState = useAutomergeDoc(seed.fileManagerHandle);
  const workbenchState = useAutomergeDoc(seed.workbenchHandle);
  const workbenchActions = useMemo(
    () => ({
      activateTab: (paneId: string, tabId: string) => {
        seed.workbenchHandle.change((doc) => {
          const pane = paneById(doc.panes, paneId);
          pane.activeTabId = tabId;
          doc.activePaneId = pane.id;
        });
      },
    }),
    [seed.workbenchHandle],
  );
  const fileManagerActions = useMemo(
    () => ({
      openUrl: (url: string, title: string) => {
        seed.workbenchHandle.change((doc) => {
          const pane = activePane(doc.panes, doc.activePaneId);
          const tab = pinnedTab(url, title);
          const existing = pane.pinnedTabs.find((item) => item.targetUrl === url);
          if (existing === undefined) pane.pinnedTabs.push(tab);
          pane.previewTab = pane.previewTab?.targetUrl === url ? null : pane.previewTab;
          pane.activeTabId = existing?.id ?? tab.id;
        });
      },
      previewUrl: (url: string, title: string) => {
        seed.workbenchHandle.change((doc) => {
          const pane = activePane(doc.panes, doc.activePaneId);
          const existing = pane.pinnedTabs.find((item) => item.targetUrl === url);
          if (existing) {
            pane.activeTabId = existing.id;
            return;
          }
          const tab = previewTab(url, title);
          pane.previewTab = tab;
          pane.activeTabId = tab.id;
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
          doc.openFolders = toggleValue(doc.openFolders, url);
        });
      },
    }),
    [seed.fileManagerHandle, seed.workbenchHandle],
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
        <section className="workspace">
          <Sidebar actions={fileManagerActions} root={filesystem.root} state={fileManagerState} />
          <Workbench actions={workbenchActions} filesystemRoot={filesystem.root} state={workbenchState} />
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

function activePane(panes: WorkbenchPane[], activePaneId: string): WorkbenchPane {
  return panes.find((pane) => pane.id === activePaneId) ?? panes[0] ?? createMainPane();
}

function paneById(panes: WorkbenchPane[], paneId: string): WorkbenchPane {
  return panes.find((pane) => pane.id === paneId) ?? activePane(panes, paneId);
}

function createMainPane(): WorkbenchPane {
  return { activeTabId: null, id: 'main', pinnedTabs: [], previewTab: null };
}

function pinnedTab(url: string, title: string): WorkbenchTab {
  return { id: `pinned:${url}`, kind: WorkbenchTabKind.File, pinned: true, targetUrl: url, title };
}

function previewTab(url: string, title: string): WorkbenchTab {
  return { id: 'preview', kind: WorkbenchTabKind.File, pinned: false, targetUrl: url, title };
}
