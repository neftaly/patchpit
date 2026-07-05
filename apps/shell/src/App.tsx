import type { DocHandle } from '@automerge/automerge-repo';
import { useMemo, useSyncExternalStore } from 'react';
import {
  fileIcons,
  selectFilePickerUrl,
  toggleFilePickerFolder,
  type FileSelectionOptions,
} from '@patchpit/file-picker';
import {
  createSeedFilesystem,
  projectFilesystem,
  resolveTheme,
  rootContainer,
  themeStyle,
  type WindowContext,
} from '@patchpit/system';
import { WindowManager } from './window-manager/WindowManager';
import {
  closeContext,
  commitWindowManagerState,
  dropContext,
  dropNewContext,
  focusContext,
  openContext,
  pinContext,
  previewContext,
  resizeSplit,
  type ContextDropTarget,
  type SplitPath,
} from './window-manager/window-manager-state';

export function App() {
  const seed = useMemo(() => createSeedFilesystem(), []);
  const appearance = useAutomergeDoc(seed.appearanceHandle);
  const darkTheme = useAutomergeDoc(seed.darkThemeHandle);
  const fileTypes = useAutomergeDoc(seed.fileTypesHandle);
  const indexDoc = useAutomergeDoc(seed.indexHandle);
  const iconRules = useMemo(() => fileIcons(fileTypes), [fileTypes]);
  const lightTheme = useAutomergeDoc(seed.lightThemeHandle);
  const filePickerState = useAutomergeDoc(seed.filePickerStateHandle);
  const terminalState = useAutomergeDoc(seed.terminalStateHandle);
  const windowManagerState = useAutomergeDoc(seed.windowManagerHandle);
  const prefersDark = usePrefersDark();
  const theme = useMemo(
    () => resolveTheme(appearance, lightTheme, darkTheme, prefersDark),
    [appearance, darkTheme, lightTheme, prefersDark],
  );
  const liveDocuments = {
    [seed.appearanceHandle.url]: JSON.stringify(appearance, null, 2),
    [seed.darkThemeHandle.url]: JSON.stringify(darkTheme, null, 2),
    [seed.fileTypesHandle.url]: JSON.stringify(fileTypes, null, 2),
    [seed.filePickerStateHandle.url]: JSON.stringify(filePickerState, null, 2),
    [seed.lightThemeHandle.url]: JSON.stringify(lightTheme, null, 2),
    [seed.terminalStateHandle.url]: JSON.stringify(terminalState, null, 2),
    [seed.windowManagerHandle.url]: JSON.stringify(windowManagerState, null, 2),
  };
  const filesystem = useMemo(() => projectFilesystem(indexDoc, seed.rootUrl), [indexDoc, seed.rootUrl]);
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
    dropContext: (sourceSurfaceId: string, contextId: string, target: ContextDropTarget) => {
      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        dropContext(doc, sourceSurfaceId, contextId, target);
      });
    },
    dropUrl: (url: string, title: string, target: ContextDropTarget) => {
      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        dropNewContext(doc, viewerContext(url, title, seed.rootUrl), target);
      });
    },
    pinContext: (surfaceId: string, contextId: string) => {
      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        pinContext(doc, surfaceId, contextId);
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
        openContext(doc, viewerContext(url, title, seed.rootUrl), sourceSurfaceId);
      });
    },
    previewUrl: (url: string, title: string) => {
      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        previewContext(doc, viewerContext(url, title, seed.rootUrl), sourceSurfaceId);
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
  const terminals = {
    [seed.terminalStateHandle.url]: {
      runtimeOptions: {
        documentHandles: seed.documentHandles,
        indexHandle: seed.indexHandle,
        repo: seed.repo,
        rootUrl: seed.rootUrl,
      },
      state: terminalState,
      stateHandle: seed.terminalStateHandle,
    },
  };
  return (
    <main className="standalone-app" style={themeStyle(theme)}>
      {filesystem.root === null ? (
        <pre className="diagnostics-json">{JSON.stringify(filesystem, null, 2)}</pre>
      ) : (
        <WindowManager
          actions={windowManagerActions}
          filePickers={filePickers}
          filesystemRoot={filesystem.root}
          liveDocuments={liveDocuments}
          state={windowManagerState}
          terminals={terminals}
          theme={theme}
        />
      )}
    </main>
  );
}

function viewerContext(url: string, title: string | undefined, rootUrl: string): WindowContext {
  return {
    app: 'viewer',
    container: rootContainer(rootUrl),
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

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (update) => {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
}
