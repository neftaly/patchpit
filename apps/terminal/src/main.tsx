import type { DocHandle } from '@automerge/automerge-repo';
import { StrictMode, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createSeedFilesystem,
  resolveTheme,
  terminalContainer,
  themeStyle,
} from '@patchpit/system';
import '@patchpit/system/theme.css';
import { Terminal } from './index';

function App() {
  const [seed] = useState(createSeedFilesystem);
  const appearance = useAutomergeDoc(seed.appearanceHandle);
  const darkTheme = useAutomergeDoc(seed.darkThemeHandle);
  const lightTheme = useAutomergeDoc(seed.lightThemeHandle);
  const state = useAutomergeDoc(seed.terminalStateHandle);
  const theme = resolveTheme(appearance, lightTheme, darkTheme, usePrefersDark());

  return (
    <main className="standalone-app" style={themeStyle(theme)}>
      <Terminal
        container={terminalContainer(seed.rootUrl)}
        runtimeOptions={{
          documentHandles: seed.documentHandles,
          indexHandle: seed.indexHandle,
          repo: seed.repo,
          rootUrl: seed.rootUrl,
        }}
        state={state}
        stateHandle={seed.terminalStateHandle}
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
