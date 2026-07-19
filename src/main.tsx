import { isValidAutomergeUrl } from '@automerge/automerge-repo';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { loadBrowserDemoSeed } from './browser/demo-seed.ts';
import { openBrowserSandboxHost, type BrowserSandboxHost } from './browser/sandbox-host.ts';
import {
  createBrowserRootHost,
  loadBrowserDisplayIdentityId,
} from './browser/root-host.ts';
import { canonicalRootInvocationHash, parseRootInvocationHash } from './root/invocation.ts';

const container = document.querySelector('#root');
if (container === null) throw new Error('Missing root element.');
const root = createRoot(container);
const browserBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
const displayIdentityId = await loadBrowserDisplayIdentityId();
const rootHost = createBrowserRootHost({
  broadcastChannelName: `patchpit:${browserBaseUrl.href}`,
  displayIdentityId,
  seed: (signal) => loadBrowserDemoSeed(
    browserBaseUrl,
    signal,
  ),
});
let sandboxHost: BrowserSandboxHost | undefined;
let pending: AbortController | undefined;
let generation = 0;

const showError = () => {
  root.render(<p role="alert">Workspace unavailable.</p>);
};

const releaseActivePage = () => {
  generation += 1;
  pending?.abort();
  pending = undefined;
  void sandboxHost?.close();
  sandboxHost = undefined;
  rootHost.release();
  root.render(null);
};

const loadRoot = async () => {
  const currentGeneration = ++generation;
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  void sandboxHost?.close();
  sandboxHost = undefined;
  root.render(null);
  const invocation = parseRootInvocationHash(window.location.hash, isValidAutomergeUrl);
  if (!invocation.ok) {
    rootHost.release();
    pending = undefined;
    showError();
    return;
  }

  let nextSandboxHost: BrowserSandboxHost | undefined;
  try {
    const builtRunner = browserBaseUrl;
    const configuredRunner = new URL(
      import.meta.env.VITE_PATCHPIT_RUNNER_URL ?? import.meta.env.BASE_URL,
      window.location.origin,
    );
    if (configuredRunner.href !== builtRunner.href) {
      throw new Error('The configured sandbox runner is not deployed by this build');
    }
    nextSandboxHost = openBrowserSandboxHost(configuredRunner);
    const opened = await rootHost.open(invocation.value, controller.signal);
    if (generation !== currentGeneration) {
      void nextSandboxHost.close();
      return;
    }
    pending = undefined;
    sandboxHost = nextSandboxHost;
    if (invocation.value.src === undefined) {
      history.replaceState(null, '', canonicalRootInvocationHash(opened.invocation));
    }
    root.render(<App key={currentGeneration} runtime={opened.runtime} sandboxHost={nextSandboxHost} />);
  } catch {
    void nextSandboxHost?.close();
    if (generation === currentGeneration) {
      rootHost.release();
      pending = undefined;
      showError();
    }
  }
};

window.addEventListener('hashchange', () => { void loadRoot(); });
window.addEventListener('pagehide', (event) => {
  releaseActivePage();
  if (!event.persisted) void rootHost.close();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) void loadRoot();
});

void loadRoot();
