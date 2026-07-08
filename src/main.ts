import { createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createHelloWorldSandboxDocument } from './hello-world-fixture-runtime';

type LaunchState =
  | { readonly status: 'mounting' }
  | { readonly sandbox: string; readonly status: 'ready'; readonly url: string }
  | { readonly status: 'failed'; readonly message: string };

function App() {
  const [launchState, setLaunchState] = useState<LaunchState>({ status: 'mounting' });

  useEffect(() => {
    let disposed = false;

    const launch = async () => {
      const sandboxDocument = await createHelloWorldSandboxDocument();
      if (!disposed) setLaunchState({ sandbox: sandboxDocument.sandbox, status: 'ready', url: sandboxDocument.url });
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
      ? createElement('iframe', { height: 320, sandbox: launchState.sandbox, src: launchState.url, title: 'Hello World', width: 320 })
      : createElement('p', {}, launchState.status === 'failed' ? launchState.message : 'Mounting hello-world...'));
}

const root = document.querySelector('#root');
if (root === null) throw new Error('Missing root element.');

createRoot(root).render(createElement(App));
