import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createSeedFilesystem,
  projectFilesystem,
  type FilesystemNode,
} from '@patchpit/system';
import '@patchpit/system/theme.css';
import { Viewer } from './index';

function App() {
  const [seed] = useState(createSeedFilesystem);
  const filesystem = useMemo(() => projectFilesystem(seed.indexHandle.doc(), seed.rootUrl), [seed]);
  const url = firstFileUrl(filesystem.root);

  if (filesystem.root === null) {
    return <pre className="diagnostics-json">{JSON.stringify(filesystem, null, 2)}</pre>;
  }

  return (
    <main className="standalone-app">
      <Viewer filesystemRoot={filesystem.root} url={url} />
    </main>
  );
}

function firstFileUrl(node: FilesystemNode | null): string | undefined {
  if (node === null) return undefined;
  if (node.kind === 'file') return node.url;
  for (const child of node.entries) {
    const url = firstFileUrl(child);
    if (url !== undefined) return url;
  }
  return undefined;
}

createRoot(document.getElementById('root') ?? document.body).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
