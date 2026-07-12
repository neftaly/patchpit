import { isValidAutomergeUrl, Repo } from '@automerge/automerge-repo';
import { createRoot } from 'react-dom/client';
import sandboxCompatBundle from 'virtual:patchpit/sandbox-compat-bundle';
import { App, filesAppUrl, sandboxCompatAppUrl } from './App.tsx';
import { openBrowserSandboxHost, type BrowserSandboxHost } from './browser-sandbox-host.ts';
import { createRoot as createPatchpitRoot, openRoot, type PatchpitRuntime } from './patchpit-runtime.ts';
import { canonicalRootInvocationHash, parseRootInvocationHash } from './root-invocation.ts';

const container = document.querySelector('#root');
if (container === null) throw new Error('Missing root element.');
const root = createRoot(container);
const repo = new Repo({ network: [] });
const files = sandboxCompatBundle.files;
let active: PatchpitRuntime | undefined;
let sandboxHost: BrowserSandboxHost | undefined;
let pending: AbortController | undefined;
let generation = 0;

const showError = () => {
  root.render(<p role="alert">Workspace unavailable.</p>);
};

const loadRoot = async () => {
  const currentGeneration = ++generation;
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  active?.close();
  active = undefined;
  void sandboxHost?.close();
  sandboxHost = undefined;
  root.render(null);
  const invocation = parseRootInvocationHash(window.location.hash, isValidAutomergeUrl);
  if (!invocation.ok) {
    pending = undefined;
    showError();
    return;
  }

  let nextSandboxHost: BrowserSandboxHost | undefined;
  try {
    const builtRunner = new URL(import.meta.env.BASE_URL, window.location.origin);
    const configuredRunner = new URL(
      import.meta.env.VITE_PATCHPIT_RUNNER_URL ?? import.meta.env.BASE_URL,
      window.location.origin,
    );
    if (configuredRunner.href !== builtRunner.href) {
      throw new Error('The configured sandbox runner is not deployed by this build');
    }
    nextSandboxHost = openBrowserSandboxHost(configuredRunner);
    const runtime = invocation.value.src === undefined
      ? await createPatchpitRoot({
          repo,
          files,
          initialContext: filesAppUrl,
          documentContext: sandboxCompatAppUrl,
        })
      : await openRoot({ repo, rootUrl: invocation.value.src, signal: controller.signal });
    if (generation !== currentGeneration) {
      runtime.close();
      void nextSandboxHost.close();
      return;
    }
    pending = undefined;
    active = runtime;
    sandboxHost = nextSandboxHost;
    if (invocation.value.src === undefined) {
      history.replaceState(null, '', canonicalRootInvocationHash({
        ...invocation.value,
        src: runtime.rootUrl,
      }));
    }
    root.render(<App runtime={runtime} sandboxHost={nextSandboxHost} />);
  } catch {
    void nextSandboxHost?.close();
    if (generation === currentGeneration) {
      pending = undefined;
      showError();
    }
  }
};

window.addEventListener('hashchange', () => { void loadRoot(); });
window.addEventListener('pagehide', () => {
  generation += 1;
  pending?.abort();
  active?.close();
  active = undefined;
  void sandboxHost?.close();
  sandboxHost = undefined;
  void repo.shutdown();
}, { once: true });

void loadRoot();
