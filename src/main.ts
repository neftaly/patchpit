import { createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createInitialSandboxDocument } from './initial-sandbox-document';

type InitialSandboxDocument = Awaited<ReturnType<typeof createInitialSandboxDocument>>;

type LaunchState =
  | { readonly status: 'mounting' }
  | { readonly sandboxDocument: InitialSandboxDocument; readonly status: 'ready' }
  | { readonly status: 'failed'; readonly message: string };

function App() {
  const [launchState, setLaunchState] = useState<LaunchState>({ status: 'mounting' });

  useEffect(() => {
    let disposed = false;

    const launch = async () => {
      const sandboxDocument = await createInitialSandboxDocument();
      if (!disposed) setLaunchState({ sandboxDocument, status: 'ready' });
    };

    void launch().catch((error) => {
      if (!disposed) setLaunchState({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      disposed = true;
    };
  }, []);

  return createElement('main', { className: 'patchpit-root' },
    launchState.status === 'ready'
      ? createElement('iframe', {
        height: 320,
        referrerPolicy: launchState.sandboxDocument.referrerPolicy,
        sandbox: launchState.sandboxDocument.sandbox,
        src: launchState.sandboxDocument.url,
        title: 'Sandbox',
        width: 320,
      })
      : createElement('p', {}, launchState.status === 'failed' ? launchState.message : 'Loading sandbox...'));
}

const root = document.querySelector('#root');
if (root === null) throw new Error('Missing root element.');

createRoot(root).render(createElement(App));
