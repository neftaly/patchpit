import type { DocHandle } from '@automerge/automerge-repo';
import { StrictMode, useMemo, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createSeedFilesystem,
  resolveTheme,
  terminalContainer,
  themeStyle,
} from '@patchpit/system';
import '@patchpit/system/theme.css';
import {
  createTerminalStateActions,
  Terminal,
} from './index';
import { createPatchpitFilesystem } from './filesystem';

function App() {
  const [seed] = useState(createSeedFilesystem);
  const appearance = useAutomergeDoc(seed.appearanceHandle);
  const darkTheme = useAutomergeDoc(seed.darkThemeHandle);
  const lightTheme = useAutomergeDoc(seed.lightThemeHandle);
  const state = useAutomergeDoc(seed.terminalStateHandle);
  const theme = resolveTheme(appearance, lightTheme, darkTheme, usePrefersDark());
  const terminalFilesystem = useMemo(() => createPatchpitFilesystem({
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  }), [seed]);
  const terminalActions = useMemo(() => createTerminalStateActions(seed.terminalStateHandle), [seed]);

  return (
    <main className="standalone-app" style={themeStyle(theme)}>
      <Terminal
        actions={terminalActions}
        container={terminalContainer(seed.rootUrl)}
        runtimeOptions={{ filesystem: terminalFilesystem }}
        state={state}
        theme={theme}
      />
    </main>
  );
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

createRoot(document.getElementById('root') ?? document.body).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
