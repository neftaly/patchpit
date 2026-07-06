import type { DocHandle } from '@automerge/automerge-repo';
import { StrictMode, useMemo, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createSeedFilesystem,
  projectFilesystem,
  type FilePickerStateDoc,
  type FileTypesDoc,
} from '@patchpit/system';
import '@patchpit/system/theme.css';
import {
  FilePicker,
  fileIcons,
  type FileSelectionOptions,
} from './index';
import {
  selectFilePickerUrl,
  toggleFilePickerFolder,
} from './file-picker-state';

function App() {
  const [seed] = useState(createSeedFilesystem);
  const state = useAutomergeDoc(seed.filePickerStateHandle);
  const fileTypes = useAutomergeDoc(seed.fileTypesHandle);
  const filesystem = useMemo(() => projectFilesystem(seed.indexHandle.doc(), seed.rootUrl), [seed]);
  const icons = useMemo(() => fileIcons(fileTypes), [fileTypes]);

  if (filesystem.root === null) {
    return <pre className="diagnostics-json">{JSON.stringify(filesystem, null, 2)}</pre>;
  }

  return (
    <main className="standalone-app">
      <FilePicker
        actions={{
          openUrl() {},
          previewUrl() {},
          selectUrl(url: string, options?: FileSelectionOptions) {
            selectFilePickerUrl(seed.filePickerStateHandle, url, options);
          },
          toggleFolder(url: string) {
            toggleFilePickerFolder(seed.filePickerStateHandle, url);
          },
        }}
        fileIcons={icons}
        root={filesystem.root}
        state={state}
      />
    </main>
  );
}

function useAutomergeDoc<T extends FilePickerStateDoc | FileTypesDoc>(handle: DocHandle<T>): T {
  return useSyncExternalStore(
    (update) => {
      handle.on('change', update);
      return () => handle.off('change', update);
    },
    () => handle.doc(),
  );
}

createRoot(document.getElementById('root') ?? document.body).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
