import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { createReadStream } from 'node:fs';
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const smokeBasePath = smokeBasePathFromArgs(process.argv.slice(2));
const distIndexHtml = await readFile('dist/index.html', 'utf8');
if (!distIndexHtml.includes('<div id="root"></div>')) throw new Error('dist/index.html is missing the root mount');
if (!distIndexHtml.includes(`${smokeBasePath}assets/index-`)) {
  throw new Error(`dist/index.html is missing the root app bundle for base ${smokeBasePath}`);
}

async function smokeSandboxApps() {
  const distRoot = resolve('dist');
  const staticServer = await startStaticServer(distRoot, smokeBasePath);
  const userDataDir = await mkdtemp(join(tmpdir(), 'patchpit-smoke-'));
  const browser = await startBrowser(userDataDir);

  try {
    const browserDebuggerUrl = await browserWebSocketUrl(browser.debugPort, browser.browserProcess);
    const browserCdp = await CdpSession.connect(browserDebuggerUrl);
    let pageCdp;
    try {
      await browserCdp.send('Target.setDiscoverTargets', { discover: true });
      const { targetId } = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
      const { webSocketDebuggerUrl } = await fetchJson(`http://127.0.0.1:${browser.debugPort}/json/list`)
        .then((targets) => targets.find((target) => target.id === targetId) ?? {});
      if (webSocketDebuggerUrl === undefined) throw new Error('Chromium did not expose a DevTools URL for the smoke page');

      pageCdp = await CdpSession.connect(webSocketDebuggerUrl);
      const targets = new TargetSessionRegistry(pageCdp);
      await pageCdp.send('Target.setAutoAttach', {
        autoAttach: true,
        flatten: true,
        waitForDebuggerOnStart: false,
      });
      await pageCdp.send('Page.enable');
      await pageCdp.send('Runtime.enable');

      const load = pageCdp.waitForEvent('Page.loadEventFired', 10_000);
      await pageCdp.send('Page.navigate', { url: `${staticServer.origin}${smokeBasePath}` });
      await load;
      const mainFrameId = await pageMainFrameId(pageCdp);

      const ready = await waitForBrowserState(pageCdp, launcherReadyExpression, 10_000);
      if (ready.status !== 'passed') throw smokeError('Shell launcher did not become ready', ready);

      const filePickerHost = await waitForBrowserState(pageCdp, filePickerHostExpression, 10_000);
      if (filePickerHost.status !== 'passed') throw smokeError('File Picker sandbox host did not mount', filePickerHost);

      const filePicker = await waitForSandboxState(pageCdp, targets, mainFrameId, filePickerTreeExpression, 10_000);
      if (filePicker.status !== 'passed') throw smokeError('File Picker sandbox did not render cleanly', filePicker);

      const filePickerMarked = await waitForSandboxState(
        pageCdp,
        targets,
        mainFrameId,
        markFilePickerAliveExpression,
        5_000,
      );
      if (filePickerMarked.status !== 'passed') {
        throw smokeError('File Picker sandbox could not be marked before preview clicks', filePickerMarked);
      }

      const homeClicked = await waitForSandboxState(
        pageCdp,
        targets,
        mainFrameId,
        clickFilePickerTreeItemExpression({ name: 'home' }),
        5_000,
      );
      if (homeClicked.status !== 'passed') throw smokeError('File Picker home folder could not be clicked', homeClicked);

      const docsClicked = await waitForSandboxState(
        pageCdp,
        targets,
        mainFrameId,
        clickFilePickerTreeItemExpression({ name: 'docs' }),
        5_000,
      );
      if (docsClicked.status !== 'passed') throw smokeError('File Picker docs folder could not be clicked', docsClicked);

      const viewerFolder = await waitForSandboxState(pageCdp, targets, mainFrameId, viewerFolderExpression, 5_000);
      if (viewerFolder.status !== 'passed') throw smokeError('Viewer did not render the docs folder preview', viewerFolder);

      const filePickerAfterFolderPreview = await waitForSandboxState(
        pageCdp,
        targets,
        mainFrameId,
        filePickerAliveAfterPreviewExpression,
        5_000,
      );
      if (filePickerAfterFolderPreview.status !== 'passed') {
        throw smokeError('File Picker sandbox did not stay alive after folder preview', filePickerAfterFolderPreview);
      }

      const readmeClicked = await waitForSandboxState(
        pageCdp,
        targets,
        mainFrameId,
        clickFilePickerTreeItemExpression({ name: 'README.md' }),
        5_000,
      );
      if (readmeClicked.status !== 'passed') throw smokeError('File Picker README.md could not be clicked', readmeClicked);

      const viewerReadme = await waitForSandboxState(pageCdp, targets, mainFrameId, viewerReadmeExpression, 5_000);
      if (viewerReadme.status !== 'passed') throw smokeError('Viewer did not render the seeded README.md text', viewerReadme);

      const filePickerAfterReadmePreview = await waitForSandboxState(
        pageCdp,
        targets,
        mainFrameId,
        filePickerAliveAfterPreviewExpression,
        5_000,
      );
      if (filePickerAfterReadmePreview.status !== 'passed') {
        throw smokeError('File Picker sandbox did not stay alive after file preview', filePickerAfterReadmePreview);
      }

      const lifecycleBaseline = await waitForBrowserState(pageCdp, sandboxLifecycleBaselineExpression, 5_000);
      if (lifecycleBaseline.status !== 'passed') {
        throw smokeError('Sandbox lifecycle baseline could not be measured', lifecycleBaseline);
      }

      for (let iteration = 1; iteration <= 3; iteration += 1) {
        const clicked = await evaluate(pageCdp, clickHelloWorldExpression);
        if (clicked.status !== 'passed') throw smokeError(`Hello World launcher could not be clicked in lifecycle iteration ${iteration}`, clicked);

        const sandbox = await waitForBrowserState(pageCdp, helloWorldVisibleExpression, 5_000);
        if (sandbox.status !== 'passed') throw smokeError(`Hello World did not open cleanly in lifecycle iteration ${iteration}`, sandbox);

        const closed = await evaluate(pageCdp, closeHelloWorldExpression);
        if (closed.status !== 'passed') throw smokeError(`Hello World close button could not be clicked in lifecycle iteration ${iteration}`, closed);

        const lifecycleClosed = await waitForBrowserState(pageCdp, helloWorldClosedExpression(lifecycleBaseline), 5_000);
        if (lifecycleClosed.status !== 'passed') {
          throw smokeError(`Hello World sandbox did not clean up after close in lifecycle iteration ${iteration}`, lifecycleClosed);
        }
      }
    } finally {
      await pageCdp?.close().catch(() => {});
      await browserCdp.close().catch(() => {});
    }
  } finally {
    browser.browserProcess.kill();
    await onceExit(browser.browserProcess);
    await rm(userDataDir, { force: true, recursive: true });
    await staticServer.close();
  }
}

const launcherReadyExpression = `
(() => {
  const alert = document.querySelector('[role="alert"]');
  const helloWorldButton = document.querySelector('button[data-app-id="hello-world"]');
  if (alert !== null) {
    return {
      status: 'failed',
      reason: 'Runtime issue banner is visible before Hello World launch',
      alert: alert.innerText,
      body: document.body.innerText,
    };
  }
  if (helloWorldButton !== null) return { status: 'passed' };
  return {
    status: 'pending',
    reason: 'Waiting for manifest-derived Hello World launcher button',
    body: document.body.innerText,
  };
})()
`;

const clickHelloWorldExpression = `
(() => {
  const helloWorldButton = document.querySelector('button[data-app-id="hello-world"]');
  if (helloWorldButton === null) {
    return {
      status: 'failed',
      reason: 'Manifest-derived Hello World launcher button is missing',
      body: document.body.innerText,
    };
  }
  if (typeof helloWorldButton.click !== 'function') {
    return {
      status: 'failed',
      reason: 'Hello World launcher target is not clickable',
      tag: helloWorldButton.tagName,
      body: document.body.innerText,
    };
  }
  try {
    helloWorldButton.click();
  } catch (error) {
    return {
      status: 'failed',
      reason: 'Hello World launcher click threw',
      error: error instanceof Error ? error.stack : String(error),
      body: document.body.innerText,
    };
  }
  return { status: 'passed' };
})()
`;

const helloWorldVisibleExpression = `
(() => {
  const alert = document.querySelector('[role="alert"]');
  const host = document.querySelector('section.sandbox-app-host[aria-label="Hello World"]');
  const frame = host === null ? null : host.querySelector('iframe[title="Hello World"]');
  const hasHost = host !== null;
  const hasFrame = frame !== null;
  const selectedTabs = [...document.querySelectorAll('[role="tab"][aria-selected="true"], [role="tab"][data-selected]')]
    .map((tab) => tab.textContent.trim());

  if (alert !== null) {
    return {
      status: 'failed',
      reason: 'Runtime issue banner is visible after Hello World launch',
      alert: alert.innerText,
      hasHost,
      hasFrame,
      selectedTabs,
      body: document.body.innerText,
    };
  }
  if (hasHost && hasFrame && selectedTabs.some((tab) => (
    tab.includes('Hello World') || tab.includes('/apps/hello-world/app.js')
  ))) {
    return {
      status: 'passed',
      selectedTabs,
    };
  }
  return {
    status: 'pending',
    reason: 'Waiting for Hello World sandbox host',
    hasHost,
    hasFrame,
    selectedTabs,
    body: document.body.innerText,
  };
})()
`;

const sandboxLifecycleBaselineExpression = `
(() => {
  const alert = document.querySelector('[role="alert"]');
  const helloHost = document.querySelector('section.sandbox-app-host[aria-label="Hello World"]');
  const frames = [...document.querySelectorAll('iframe.sandbox-app-frame')];
  const frameTitles = frames.map((frame) => frame.getAttribute('title') ?? '');

  if (alert !== null) {
    return {
      status: 'failed',
      reason: 'Runtime issue banner is visible before sandbox lifecycle check',
      alert: alert.innerText,
      frameTitles,
      iframeCount: frames.length,
      body: document.body.innerText,
    };
  }
  if (helloHost !== null) {
    return {
      status: 'pending',
      reason: 'Waiting for Hello World to be absent before lifecycle baseline',
      frameTitles,
      iframeCount: frames.length,
      body: document.body.innerText,
    };
  }

  return {
    status: 'passed',
    frameTitles,
    iframeCount: frames.length,
  };
})()
`;

const closeHelloWorldExpression = `
(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const helloTab = tabs.find((tab) => {
    const label = tab.textContent ?? '';
    return label.includes('Hello World') || label.includes('/apps/hello-world/app.js');
  });
  const closeButton = helloTab?.querySelector('button[aria-label^="Close "]');
  if (helloTab === undefined || closeButton === null || closeButton === undefined) {
    return {
      status: 'failed',
      reason: 'Hello World close button is missing',
      tabs: tabs.map((tab) => tab.textContent?.trim() ?? ''),
      body: document.body.innerText,
    };
  }

  closeButton.click();
  return {
    status: 'passed',
    tabs: tabs.map((tab) => tab.textContent?.trim() ?? ''),
  };
})()
`;

function helloWorldClosedExpression(baseline) {
  return `
(() => {
  const alert = document.querySelector('[role="alert"]');
  const helloHost = document.querySelector('section.sandbox-app-host[aria-label="Hello World"]');
  const frames = [...document.querySelectorAll('iframe.sandbox-app-frame')];
  const frameTitles = frames.map((frame) => frame.getAttribute('title') ?? '');
  const expectedIframeCount = ${JSON.stringify(baseline.iframeCount)};

  if (alert !== null) {
    return {
      status: 'failed',
      reason: 'Runtime issue banner is visible after closing Hello World',
      alert: alert.innerText,
      frameTitles,
      iframeCount: frames.length,
      expectedIframeCount,
      body: document.body.innerText,
    };
  }

  if (helloHost !== null || frameTitles.includes('Hello World')) {
    return {
      status: 'pending',
      reason: 'Waiting for Hello World sandbox iframe to unmount',
      frameTitles,
      iframeCount: frames.length,
      expectedIframeCount,
      body: document.body.innerText,
    };
  }

  if (frames.length <= expectedIframeCount) {
    return {
      status: 'passed',
      frameTitles,
      iframeCount: frames.length,
      expectedIframeCount,
    };
  }

  return {
    status: 'pending',
    reason: 'Waiting for sandbox iframe count to return to or below baseline',
    frameTitles,
    iframeCount: frames.length,
    expectedIframeCount,
    body: document.body.innerText,
  };
})()
`;
}

const filePickerHostExpression = `
(() => {
  const alert = document.querySelector('[role="alert"]');
  const host = document.querySelector('section.sandbox-app-host[aria-label="File Picker"]');
  const frame = host === null ? null : host.querySelector('iframe[title="File Picker"]');
  const hasHost = host !== null;
  const hasFrame = frame !== null;

  if (alert !== null) {
    return {
      status: 'failed',
      reason: 'Runtime issue banner is visible before File Picker sandbox check',
      alert: alert.innerText,
      hasHost,
      hasFrame,
      body: document.body.innerText,
    };
  }
  if (hasHost && hasFrame) {
    return {
      status: 'passed',
      hasHost,
      hasFrame,
    };
  }
  return {
    status: 'pending',
    reason: 'Waiting for File Picker sandbox host',
    hasHost,
    hasFrame,
    body: document.body.innerText,
  };
})()
`;

const filePickerTreeExpression = `
(() => {
  const tree = document.querySelector('[role="tree"][aria-label="project files"]');
  const names = [...document.querySelectorAll('.tree-name')]
    .map((node) => node.textContent?.trim() ?? '')
    .filter((name) => name !== '');
  if (tree !== null && names.includes('home') && !names.includes('docs')) {
    return {
      status: 'passed',
      names,
      body: document.body.innerText,
    };
  }

  return {
    status: 'pending',
    reason: 'Waiting for File Picker tree from view("file-picker")',
    names,
    body: document.body.innerText,
  };
})()
`;

const markFilePickerAliveExpression = `
(() => {
  const tree = document.querySelector('[role="tree"][aria-label="project files"]');
  if (tree === null) {
    return {
      status: 'pending',
      reason: 'Waiting for File Picker tree before marking sandbox document',
      body: document.body.innerText,
    };
  }

  document.documentElement.dataset.patchpitSmokeFilePickerAlive = 'before-preview-click';
  return {
    status: 'passed',
    body: document.body.innerText,
  };
})()
`;

const filePickerAliveAfterPreviewExpression = `
(() => {
  const tree = document.querySelector('[role="tree"][aria-label="project files"]');
  const names = [...document.querySelectorAll('.tree-name')]
    .map((node) => node.textContent?.trim() ?? '')
    .filter((name) => name !== '');
  if (tree === null) {
    return {
      status: 'pending',
      reason: 'Waiting for File Picker tree after preview click',
      names,
      body: document.body.innerText,
    };
  }

  const marker = document.documentElement.dataset.patchpitSmokeFilePickerAlive;
  if (marker === 'before-preview-click') {
    return {
      status: 'passed',
      marker,
      names,
      body: document.body.innerText,
    };
  }

  return {
    status: 'failed',
    reason: 'File Picker sandbox document was replaced after preview click',
    marker,
    names,
    body: document.body.innerText,
  };
})()
`;

function clickFilePickerTreeItemExpression({ name, occurrence = 0 }) {
  return `
(() => {
  const tree = document.querySelector('[role="tree"][aria-label="project files"]');
  const buttons = [...document.querySelectorAll('button.tree-item')];
  const names = buttons.map((button) => button.querySelector('.tree-name')?.textContent?.trim() ?? '');

  if (tree === null) {
    return {
      status: 'pending',
      reason: 'Waiting for File Picker tree before clicking ${name}',
      names,
      body: document.body.innerText,
    };
  }

  const matches = buttons.filter((button) => (
    button.querySelector('.tree-name')?.textContent?.trim() === ${JSON.stringify(name)}
  ));
  const button = matches[${occurrence}];
  if (button === undefined) {
    return {
      status: 'pending',
      reason: ${JSON.stringify(`Waiting for File Picker item ${name}`)},
      names,
      body: document.body.innerText,
    };
  }

  button.click();
  return {
    status: 'passed',
    clicked: ${JSON.stringify(name)},
    names,
    occurrence: ${occurrence},
  };
})()
`;
}

const viewerFolderExpression = `
(() => {
  const body = document.body.innerText;
  const title = document.title;
  const items = [...document.querySelectorAll('li')].map((item) => item.textContent.trim());
  if (title === 'docs' && items.includes('File: README.md') && items.includes('File: architecture.md')) {
    return {
      status: 'passed',
      items,
      title,
      body,
    };
  }

  return {
    status: 'pending',
    reason: 'Waiting for Viewer folder resource output',
    items,
    title,
    body,
  };
})()
`;

const viewerReadmeExpression = `
(() => {
  const body = document.body.innerText;
  const title = document.title;
  if (
    title === 'README.md'
    && body.includes('# Patchpit Docs')
    && body.includes('Current specs:')
    && body.includes('surface-protocol.md')
  ) {
    return {
      status: 'passed',
      title,
      body,
    };
  }

  return {
    status: 'pending',
    reason: 'Waiting for Viewer README.md resource text',
    title,
    body,
  };
})()
`;

async function startStaticServer(root, basePath) {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const pathname = staticPathname(requestUrl.pathname, basePath);
      if (pathname === undefined) {
        response.writeHead(404).end('Not found');
        return;
      }
      const filePath = resolve(root, `.${decodeURIComponent(pathname)}`);
      if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }

      response.writeHead(200, { 'Content-Type': contentType(filePath) });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('Smoke server did not bind to a TCP port');

  return {
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
    }),
    origin: `http://127.0.0.1:${address.port}`,
  };
}

function staticPathname(requestPathname, basePath) {
  let pathname = requestPathname;
  if (basePath !== '/') {
    const basePrefix = basePath.slice(0, -1);
    if (pathname === basePrefix) pathname = basePath;
    if (!pathname.startsWith(basePath)) return undefined;
    pathname = pathname.slice(basePrefix.length);
  }
  return pathname.endsWith('/') ? `${pathname}index.html` : pathname;
}

async function startBrowser(userDataDir) {
  const executable = await findChromium();
  const debugPort = await freePort();
  const browserProcess = spawn(executable, [
    '--headless=new',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-sandbox',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  return {
    browserProcess,
    debugPort,
  };
}

async function findChromium() {
  const executableCandidates = [
    process.env.PATCHPIT_CHROMIUM,
    '/snap/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter((candidate) => candidate !== undefined);

  for (const candidate of executableCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next common Chromium path.
    }
  }

  throw new Error('Chromium is required for the browser smoke test. Set PATCHPIT_CHROMIUM to a Chromium executable.');
}

async function browserWebSocketUrl(debugPort, browserProcess) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 10_000) {
    if (browserProcess.exitCode !== null) {
      throw new Error(`Chromium exited before DevTools was available (exit ${browserProcess.exitCode})`);
    }
    try {
      const version = await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
      if (typeof version.webSocketDebuggerUrl === 'string') return version.webSocketDebuggerUrl;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for Chromium DevTools: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function freePort() {
  const server = createTcpServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
  });
  if (typeof address !== 'object' || address === null) throw new Error('Could not allocate a Chromium debug port');
  return address.port;
}

async function waitForBrowserState(cdp, expression, timeoutMs) {
  return evaluate(cdp, browserStateWaitExpression(expression, timeoutMs));
}

async function evaluate(cdp, expression, options = {}) {
  const evaluation = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    ...(options.contextId === undefined ? {} : { contextId: options.contextId }),
    expression,
    returnByValue: true,
    userGesture: true,
  }, options.timeoutMs ?? CdpSession.commandTimeoutMs, options.sessionId);
  if (evaluation.exceptionDetails !== undefined) {
    throw new Error(`Browser evaluation failed: ${
      evaluation.exceptionDetails.exception?.description
      ?? evaluation.exceptionDetails.text
    }`);
  }
  return evaluation.result.value;
}

async function pageMainFrameId(cdp) {
  const frameTree = await cdp.send('Page.getFrameTree');
  const mainFrameId = frameTree.frameTree?.frame?.id;
  if (typeof mainFrameId !== 'string') throw new Error('CDP did not return a main frame id');
  return mainFrameId;
}

async function waitForSandboxState(cdp, targets, mainFrameId, expression, timeoutMs) {
  const started = Date.now();
  let lastState = {
    status: 'pending',
    reason: 'Waiting for sandbox execution contexts',
    sandboxFrames: [],
  };

  while (Date.now() - started < timeoutMs) {
    const states = await evaluateSandboxStates(cdp, targets, mainFrameId, expression);
    const passed = states.find((state) => state.status === 'passed');
    if (passed !== undefined) {
      return {
        ...passed,
        elapsedMs: Date.now() - started,
        timeoutMs,
      };
    }

    const failed = states.find((state) => state.status === 'failed');
    if (failed !== undefined) {
      return {
        ...failed,
        elapsedMs: Date.now() - started,
        timeoutMs,
      };
    }

    lastState = states.at(-1) ?? lastState;
    await sleep(100);
  }

  return {
    ...lastState,
    status: 'failed',
    reason: lastState.reason ?? 'Sandbox state did not settle before timeout',
    elapsedMs: Date.now() - started,
    timeoutMs,
  };
}

async function evaluateSandboxStates(cdp, targets, mainFrameId, expression) {
  const sandboxContexts = [
    ...targets.sandboxTargets(),
    ...await sandboxExecutionContexts(cdp, mainFrameId),
  ];
  const states = [];
  for (const context of sandboxContexts) {
    try {
      const state = await evaluate(cdp, expression, {
        ...(context.contextId === undefined ? {} : { contextId: context.contextId }),
        ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
        timeoutMs: 1_000,
      });
      states.push({
        ...state,
        sandboxFrame: contextSummary(context),
        sandboxFrames: sandboxContexts.map(contextSummary),
      });
    } catch (error) {
      if (isMissingExecutionContextError(error)) continue;
      states.push({
        status: 'failed',
        reason: 'Sandbox evaluation failed',
        error: error instanceof Error ? error.stack : String(error),
        sandboxFrame: contextSummary(context),
        sandboxFrames: sandboxContexts.map(contextSummary),
      });
    }
  }

  return states;
}

async function sandboxExecutionContexts(cdp, mainFrameId) {
  const frameIds = (await pageFrameIds(cdp)).filter((frameId) => frameId !== mainFrameId);
  const contexts = [];
  for (const frameId of frameIds) {
    try {
      const { executionContextId } = await cdp.send('Page.createIsolatedWorld', {
        frameId,
        worldName: 'patchpit-smoke',
      });
      if (typeof executionContextId === 'number') {
        contexts.push({
          contextId: executionContextId,
          frameId,
          name: 'patchpit-smoke',
          origin: 'isolated-world',
          type: 'frame',
        });
      }
    } catch (error) {
      if (!isMissingFrameError(error)) throw error;
    }
  }
  return contexts;
}

async function pageFrameIds(cdp) {
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const frameIds = [];
  collectFrameIds(frameTree, frameIds);
  return frameIds;
}

function collectFrameIds(frameTree, frameIds) {
  const frameId = frameTree?.frame?.id;
  if (typeof frameId === 'string') frameIds.push(frameId);
  for (const child of frameTree?.childFrames ?? []) collectFrameIds(child, frameIds);
}

function isMissingExecutionContextError(error) {
  return error instanceof Error && (
    error.message.includes('Cannot find context with specified id')
    || error.message.includes('Inspected target navigated or closed')
    || error.message.includes('Timed out waiting for CDP command Runtime.evaluate')
  );
}

function isMissingFrameError(error) {
  return error instanceof Error && (
    error.message.includes('No frame for given id found')
    || error.message.includes('Frame with the given id was not found')
    || error.message.includes('Inspected target navigated or closed')
  );
}

function contextSummary(context) {
  return {
    contextId: context.contextId,
    frameId: context.frameId,
    name: context.name,
    origin: context.origin,
    sessionId: context.sessionId,
    targetId: context.targetId,
    title: context.title,
    type: context.type,
  };
}

function browserStateWaitExpression(expression, timeoutMs) {
  return `
(() => {
  const check = () => (${expression});
  const readState = () => {
    try {
      return check();
    } catch (error) {
      return {
        status: 'failed',
        reason: 'Browser state check threw',
        error: error instanceof Error ? error.stack : String(error),
        body: document.body?.innerText ?? '',
      };
    }
  };

  const started = performance.now();
  let lastState = readState();
  if (lastState.status !== 'pending') {
    return {
      ...lastState,
      elapsedMs: Math.round(performance.now() - started),
      timeoutMs: ${timeoutMs},
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    let observer;
    const finish = (state) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      observer?.disconnect();
      resolve({
        ...state,
        elapsedMs: Math.round(performance.now() - started),
        timeoutMs: ${timeoutMs},
      });
    };
    const inspect = () => {
      lastState = readState();
      if (lastState.status !== 'pending') finish(lastState);
    };
    const timeout = setTimeout(() => {
      finish({
        ...lastState,
        status: 'failed',
        reason: lastState?.reason ?? 'Browser state did not settle before timeout',
      });
    }, ${timeoutMs});

    observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    queueMicrotask(inspect);
  });
})()
`;
}

function smokeError(message, state) {
  return new Error([
    message,
    state.reason,
    state.error === undefined ? undefined : `Browser state error:\n${truncate(state.error, 1_000)}`,
    state.elapsedMs === undefined ? undefined : `Elapsed: ${state.elapsedMs}ms of ${state.timeoutMs}ms`,
    state.alert === undefined ? undefined : `Runtime issue banner:\n${truncate(state.alert, 1_000)}`,
    state.selectedTabs === undefined ? undefined : `Selected tabs: ${state.selectedTabs.join(', ')}`,
    state.hasHost === undefined ? undefined : `Hello World DOM: host=${state.hasHost}, frame=${state.hasFrame}`,
    state.sandboxFrame === undefined ? undefined : `Sandbox frame:\n${JSON.stringify(state.sandboxFrame, null, 2)}`,
    state.sandboxFrames === undefined ? undefined : `Sandbox frames:\n${JSON.stringify(state.sandboxFrames, null, 2)}`,
    state.body === undefined ? undefined : `Visible text:\n${truncate(state.body, 1_500)}`,
  ].filter((line) => line !== undefined && line !== '').join('\n\n'));
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.wasm':
      return 'application/wasm';
    default:
      return 'application/octet-stream';
  }
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function smokeBasePathFromArgs(args) {
  const baseArg = args.find((arg) => arg.startsWith('--base='));
  const rawBasePath = baseArg === undefined
    ? (process.env.PATCHPIT_SMOKE_BASE_PATH ?? '/')
    : baseArg.slice('--base='.length);
  return normalizeBasePath(rawBasePath);
}

function normalizeBasePath(rawBasePath) {
  if (rawBasePath === '' || rawBasePath === '/') return '/';
  const withLeadingSlash = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded with ${response.status}`);
  return response.json();
}

function onceExit(childProcess) {
  if (childProcess.exitCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => {
    childProcess.once('exit', resolveExit);
  });
}

class CdpSession {
  static commandTimeoutMs = 10_000;

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });
    return new CdpSession(socket);
  }

  constructor(socket) {
    this.events = new Map();
    this.handlers = new Map();
    this.nextId = 1;
    this.pending = new Map();
    this.socket = socket;

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(messageDataText(event.data));
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (pending === undefined) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.error === undefined) pending.resolve(message.result ?? {});
        else pending.reject(new Error(`${pending.method} failed: ${message.error.message}: ${message.error.data ?? ''}`));
        return;
      }

      const listeners = this.events.get(message.method);
      const handlers = this.handlers.get(message.method);
      if (handlers !== undefined) {
        for (const handler of handlers) handler(message.params ?? {});
      }
      if (listeners === undefined) return;
      for (const listener of listeners.splice(0)) listener.resolve(message.params ?? {});
    });
    socket.addEventListener('close', () => this.rejectPending(new Error('CDP websocket closed')));
    socket.addEventListener('error', () => this.rejectPending(new Error('CDP websocket error')));
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
    return () => {
      const current = this.handlers.get(method);
      if (current === undefined) return;
      this.handlers.set(method, current.filter((candidate) => candidate !== handler));
    };
  }

  send(method, params = {}, timeoutMs = CdpSession.commandTimeoutMs, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({
      id,
      method,
      params,
      ...(sessionId === undefined ? {} : { sessionId }),
    });
    return new Promise((resolveSend, rejectSend) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`Timed out waiting for CDP command ${method} after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        reject: rejectSend,
        resolve: resolveSend,
        timeout,
      });
      try {
        this.socket.send(payload);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        rejectSend(new Error(`Failed to send CDP command ${method}: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  waitForEvent(method, timeoutMs) {
    return new Promise((resolveEvent, rejectEvent) => {
      const timeout = setTimeout(() => {
        const listeners = this.events.get(method);
        if (listeners !== undefined) {
          this.events.set(method, listeners.filter((listener) => listener !== listenerEntry));
        }
        rejectEvent(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const listeners = this.events.get(method) ?? [];
      const listenerEntry = {
        resolve: (params) => {
          clearTimeout(timeout);
          resolveEvent(params);
        },
      };
      listeners.push(listenerEntry);
      this.events.set(method, listeners);
    });
  }

  close() {
    this.socket.close();
    return Promise.resolve();
  }

  rejectPending(reason) {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${pending.method} failed: ${reason.message}`));
    }
  }
}

class TargetSessionRegistry {
  constructor(cdp) {
    this.sessions = new Map();
    cdp.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      if (typeof sessionId !== 'string' || targetInfo?.type !== 'iframe') return;
      this.sessions.set(sessionId, {
        name: targetInfo.url,
        origin: targetInfo.url,
        sessionId,
        targetId: targetInfo.targetId,
        title: targetInfo.title,
        type: targetInfo.type,
      });
      void cdp.send('Runtime.enable', {}, CdpSession.commandTimeoutMs, sessionId).catch(() => {});
    });
    cdp.on('Target.detachedFromTarget', ({ sessionId }) => {
      if (typeof sessionId === 'string') this.sessions.delete(sessionId);
    });
  }

  sandboxTargets() {
    return [...this.sessions.values()];
  }
}

function messageDataText(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  return String(data);
}

await smokeSandboxApps();
