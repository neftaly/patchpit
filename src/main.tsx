import { isValidAutomergeUrl, type AutomergeUrl } from '@automerge/automerge-repo';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { loadBrowserDemoSeed } from './browser/demo-seed.ts';
import { openBrowserSandboxHost, type BrowserSandboxHost } from './browser/sandbox-host.ts';
import {
  BrowserRootOpenError,
  createBrowserRootHost,
  loadBrowserDisplayIdentityId,
} from './browser/root-host.ts';
import { RootFailure } from './browser/RootFailure.tsx';
import {
  canonicalRootInvocationHash,
  DEFAULT_ROOT_SYNC,
  parseRootInvocationHash,
  type RootInvocation,
} from './root/invocation.ts';

const container = document.querySelector('#root');
if (container === null) throw new Error('Missing root element.');
const root = createRoot(container);
const browserBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
const displayIdentityId = await loadBrowserDisplayIdentityId();
const rootHost = createBrowserRootHost({
  broadcastChannelName: `patchpit:${browserBaseUrl.href}`,
  catalogueName: `patchpit.roots.v1:${browserBaseUrl.href}`,
  displayIdentityId,
  storageName: `patchpit.documents.v1:${browserBaseUrl.href}`,
  seed: (signal) => loadBrowserDemoSeed(
    browserBaseUrl,
    signal,
  ),
});
let sandboxHost: BrowserSandboxHost | undefined;
let pending: AbortController | undefined;
let generation = 0;

const showError = async (error: unknown, currentGeneration: number) => {
  const recentRoots = await rootHost.listRecentRoots().catch(() => []);
  if (generation !== currentGeneration) return;
  const openRecent = (rootUrl: AutomergeUrl) => {
    const parsed = parseRootInvocationHash(window.location.hash, isValidAutomergeUrl);
    const invocation = parsed.ok ? parsed.value : { sync: DEFAULT_ROOT_SYNC };
    history.pushState(null, '', canonicalRootInvocationHash({ ...invocation, src: rootUrl }));
    void loadRoot();
  };
  root.render(<RootFailure
    message={rootFailureMessage(error)}
    recentRoots={recentRoots}
    onRetry={() => { void loadRoot(); }}
    onFresh={() => { void loadRoot({ fresh: true }); }}
    onOpen={openRecent}
  />);
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

const loadRoot = async (options?: { readonly fresh?: boolean }) => {
  const currentGeneration = ++generation;
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  void sandboxHost?.close();
  sandboxHost = undefined;
  root.render(null);
  const invocation = parseRootInvocationHash(window.location.hash, isValidAutomergeUrl);
  if (!invocation.ok && options?.fresh !== true) {
    rootHost.release();
    pending = undefined;
    void showError(new Error(`Invalid root invocation: ${invocation.error}`), currentGeneration);
    return;
  }
  const parsedInvocation = invocation.ok ? invocation.value : { sync: DEFAULT_ROOT_SYNC };

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
    const selectedInvocation = options?.fresh === true
      ? invocationWithoutSource(parsedInvocation)
      : parsedInvocation;
    const opened = await rootHost.open(
      selectedInvocation,
      controller.signal,
      options?.fresh === true ? { fresh: true } : undefined,
    );
    if (generation !== currentGeneration) {
      void nextSandboxHost.close();
      return;
    }
    pending = undefined;
    sandboxHost = nextSandboxHost;
    if (options?.fresh === true) {
      history.pushState(null, '', canonicalRootInvocationHash(opened.invocation));
    } else if (parsedInvocation.src === undefined) {
      history.replaceState(null, '', canonicalRootInvocationHash(opened.invocation));
    }
    root.render(<App key={currentGeneration} runtime={opened.runtime} sandboxHost={nextSandboxHost} />);
  } catch (error) {
    void nextSandboxHost?.close();
    if (generation === currentGeneration) {
      rootHost.release();
      pending = undefined;
      void showError(error, currentGeneration);
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
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void rootHost.flush();
});

void loadRoot();

const rootFailureMessage = (error: unknown) => {
  if (!(error instanceof BrowserRootOpenError)) {
    return error instanceof Error ? error.message : 'Workspace unavailable.';
  }
  return ({
    cancelled: 'Workspace opening was cancelled.',
    catalogue: 'Browser root catalogue unavailable.',
    evicted: 'Workspace root was locally evicted.',
    incomplete: 'Workspace document graph is incomplete.',
    invalid: 'Workspace root is invalid.',
    'root-unavailable': 'Workspace root unavailable.',
    storage: 'Browser document storage unavailable.',
    timeout: 'Workspace opening timed out.',
    unsupported: 'Workspace root version unsupported.',
  })[error.reason];
};

const invocationWithoutSource = ({ src: _src, ...invocation }: RootInvocation) => invocation;
