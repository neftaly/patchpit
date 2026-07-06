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

async function smokeHelloWorldLauncher() {
  const distRoot = resolve('dist');
  const staticServer = await startStaticServer(distRoot, smokeBasePath);
  const userDataDir = await mkdtemp(join(tmpdir(), 'patchpit-smoke-'));
  const browser = await startBrowser(userDataDir);

  try {
    const browserDebuggerUrl = await browserWebSocketUrl(browser.debugPort, browser.browserProcess);
    const browserCdp = await CdpSession.connect(browserDebuggerUrl);
    let pageCdp;
    try {
      const { targetId } = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
      const { webSocketDebuggerUrl } = await fetchJson(`http://127.0.0.1:${browser.debugPort}/json/list`)
        .then((targets) => targets.find((target) => target.id === targetId) ?? {});
      if (webSocketDebuggerUrl === undefined) throw new Error('Chromium did not expose a DevTools URL for the smoke page');

      pageCdp = await CdpSession.connect(webSocketDebuggerUrl);
      await pageCdp.send('Page.enable');
      await pageCdp.send('Runtime.enable');

      const load = pageCdp.waitForEvent('Page.loadEventFired', 10_000);
      await pageCdp.send('Page.navigate', { url: `${staticServer.origin}${smokeBasePath}` });
      await load;

      const ready = await waitForBrowserState(pageCdp, launcherReadyExpression, 10_000);
      if (ready.status !== 'passed') throw smokeError('Shell launcher did not become ready', ready);

      const clicked = await evaluate(pageCdp, clickHelloWorldExpression);
      if (clicked.status !== 'passed') throw smokeError('Hello World launcher could not be clicked', clicked);

      const sandbox = await waitForBrowserState(pageCdp, helloWorldVisibleExpression, 5_000);
      if (sandbox.status !== 'passed') throw smokeError('Hello World did not open cleanly', sandbox);
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

async function evaluate(cdp, expression) {
  const evaluation = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
    userGesture: true,
  });
  if (evaluation.exceptionDetails !== undefined) {
    throw new Error(`Browser evaluation failed: ${
      evaluation.exceptionDetails.exception?.description
      ?? evaluation.exceptionDetails.text
    }`);
  }
  return evaluation.result.value;
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
      if (listeners === undefined) return;
      for (const listener of listeners.splice(0)) listener.resolve(message.params ?? {});
    });
    socket.addEventListener('close', () => this.rejectPending(new Error('CDP websocket closed')));
    socket.addEventListener('error', () => this.rejectPending(new Error('CDP websocket error')));
  }

  send(method, params = {}, timeoutMs = CdpSession.commandTimeoutMs) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
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

function messageDataText(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  return String(data);
}

await smokeHelloWorldLauncher();
