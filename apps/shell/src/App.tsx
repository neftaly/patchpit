import type { DocHandle } from '@automerge/automerge-repo';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  fileIcons,
  selectFilePickerUrl,
  toggleFilePickerFolder,
  type FileSelectionOptions,
} from '@patchpit/file-picker';
import {
  createTerminalStateResource,
  createSeedFilesystem,
  projectFilesystem,
  resolveTheme,
  rootContainer,
  themeStyle,
  type TerminalStateDoc,
  type WindowManagerStateDoc,
  type WindowContext,
} from '@patchpit/system';
import { LauncherBar } from './launcher/LauncherBar';
import { launcherItems } from './launcher/launch-router';
import { WindowManager } from './window-manager/WindowManager';
import {
  closeContext,
  commitWindowManagerState,
  dropContext,
  dropNewContext,
  focusedAppId,
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
  const nextTerminalId = useRef(2);
  const [terminalHandles, setTerminalHandles] = useState<readonly DocHandle<TerminalStateDoc>[]>([]);
  const filePickerState = useAutomergeDoc(seed.filePickerStateHandle);
  const terminalState = useAutomergeDoc(seed.terminalStateHandle);
  const terminalStates = useAutomergeDocs(terminalHandles);
  const windowManagerState = useAutomergeDoc(seed.windowManagerHandle);
  const prefersDark = usePrefersDark();
  const theme = useMemo(
    () => resolveTheme(appearance, lightTheme, darkTheme, prefersDark),
    [appearance, darkTheme, lightTheme, prefersDark],
  );
  const liveDocuments = {
    [seed.appearanceHandle.url]: appearance,
    [seed.darkThemeHandle.url]: darkTheme,
    [seed.fileTypesHandle.url]: fileTypes,
    [seed.filePickerStateHandle.url]: filePickerState,
    [seed.lightThemeHandle.url]: lightTheme,
    [seed.terminalStateHandle.url]: terminalState,
    [seed.windowManagerHandle.url]: windowManagerState,
    ...terminalStates,
  };
  const filesystem = useMemo(() => projectFilesystem(indexDoc, seed.rootUrl), [indexDoc, seed.rootUrl]);
  const updateWindowManager = (update: (doc: WindowManagerStateDoc) => void) => {
    commitWindowManagerState(seed.windowManagerHandle, update);
  };
  const windowManagerActions = {
    focusContext: (surfaceId: string, contextId: string) => {
      updateWindowManager((doc) => focusContext(doc, surfaceId, contextId));
    },
    closeContext: (surfaceId: string, contextId: string) => {
      updateWindowManager((doc) => closeContext(doc, surfaceId, contextId));
    },
    dropContext: (sourceSurfaceId: string, contextId: string, target: ContextDropTarget) => {
      updateWindowManager((doc) => dropContext(doc, sourceSurfaceId, contextId, target));
    },
    dropUrl: (url: string, title: string, target: ContextDropTarget) => {
      updateWindowManager((doc) => dropNewContext(doc, viewerContext(url, title, seed.rootUrl), target));
    },
    pinContext: (surfaceId: string, contextId: string) => {
      updateWindowManager((doc) => pinContext(doc, surfaceId, contextId));
    },
    resizeSplit: (path: SplitPath, ratio: number) => {
      updateWindowManager((doc) => resizeSplit(doc, path, ratio));
    },
  };
  const filePickerActions = (sourceSurfaceId: string) => ({
    openUrl: (url: string, title: string) => {
      updateWindowManager((doc) => openContext(doc, viewerContext(url, title, seed.rootUrl), sourceSurfaceId));
    },
    previewUrl: (url: string, title: string) => {
      updateWindowManager((doc) => previewContext(doc, viewerContext(url, title, seed.rootUrl), sourceSurfaceId));
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
  const terminalRuntimeOptions = {
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  };
  const terminals = Object.fromEntries(terminalHandles.map((handle) => [
    handle.url,
    {
      runtimeOptions: terminalRuntimeOptions,
      state: terminalStates[handle.url] ?? handle.doc(),
      stateHandle: handle,
    },
  ]));
  const newTerminalStateHandle = () => {
    const handle = createTerminalStateResource(seed, `terminal-${nextTerminalId.current}`);
    nextTerminalId.current += 1;
    setTerminalHandles((handles) => [...handles, handle]);
    return handle;
  };
  const launchers = launcherItems({
    focusedAppId: focusedAppId(windowManagerState),
    filePickerStateHandle: seed.filePickerStateHandle,
    newTerminalStateHandle,
    rootUrl: seed.rootUrl,
    windowManagerHandle: seed.windowManagerHandle,
  });
  return (
    <main className="standalone-app shell-app" style={themeStyle(theme)}>
      {filesystem.root === null ? (
        <pre className="diagnostics-json">{JSON.stringify(filesystem, null, 2)}</pre>
      ) : (
        <>
          <WindowManager
            actions={windowManagerActions}
            filePickers={filePickers}
            filesystemRoot={filesystem.root}
            liveDocuments={liveDocuments}
            state={windowManagerState}
            terminals={terminals}
            theme={theme}
          />
          <LauncherBar items={launchers} />
        </>
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

function useAutomergeDocs<T>(handles: readonly DocHandle<T>[]): Readonly<Record<string, T>> {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const update = () => setVersion((current) => current + 1);
    for (const handle of handles) handle.on('change', update);
    return () => {
      for (const handle of handles) handle.off('change', update);
    };
  }, [handles]);

  return useMemo(
    () => Object.fromEntries(handles.map((handle) => [handle.url, handle.doc()])),
    [handles, version],
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
