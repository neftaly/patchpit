import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

type Mode = 'check' | 'profile';

type CdpMessage = {
  readonly id?: number;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly message: string };
  readonly sessionId?: string;
};

type WebGlReport = {
  readonly canvas: { readonly height: number; readonly width: number } | null;
  readonly differentPixels: number;
  readonly drawCalls: number;
  readonly firstDrawMs: number | null;
  readonly renderer: string;
  readonly vendor: string;
};

const chromiumArgs = (userDataDir: string): readonly string[] => [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${userDataDir}`,
  '--use-gl=angle',
  '--use-angle=default',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--disable-software-rasterizer',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--no-first-run',
  'about:blank'
];

class CdpClient {
  readonly #pending = new Map<
    number,
    {
      readonly reject: (error: Error) => void;
      readonly resolve: (value: unknown) => void;
    }
  >();
  readonly #waiters: Array<{
    readonly method: string;
    readonly resolve: (message: CdpMessage) => void;
    readonly sessionId?: string;
  }> = [];
  readonly socket: WebSocket;
  #nextId = 1;

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;

      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        if (pending === undefined) return;
        this.#pending.delete(message.id);

        if (message.error !== undefined) {
          pending.reject(new Error(message.error.message));
          return;
        }

        pending.resolve(message.result);
        return;
      }

      for (const waiter of this.#waiters) {
        if (
          waiter.method === message.method &&
          (waiter.sessionId === undefined || waiter.sessionId === message.sessionId)
        ) {
          this.#waiters.splice(this.#waiters.indexOf(waiter), 1);
          waiter.resolve(message);
          return;
        }
      }
    });
  }

  send<T>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<T> {
    const id = this.#nextId;
    this.#nextId += 1;
    const message = sessionId === undefined
      ? { id, method, params }
      : { id, method, params, sessionId };

    return new Promise((resolve, reject) => {
      this.#pending.set(id, {
        reject,
        resolve: (value) => resolve(value as T)
      });
      this.socket.send(JSON.stringify(message));
    });
  }

  waitFor(method: string, sessionId?: string): Promise<CdpMessage> {
    return new Promise((resolve) => {
      this.#waiters.push(sessionId === undefined
        ? { method, resolve }
        : { method, resolve, sessionId });
    });
  }
}

const parseArgs = (): {
  readonly mode: Mode;
  readonly out: string;
  readonly settleMs: number;
  readonly url: string;
} => {
  const [modeArg = 'check', ...rawArgs] = process.argv.slice(2);
  const args = rawArgs.filter((arg) => arg !== '--');
  if (modeArg !== 'check' && modeArg !== 'profile') {
    throw new Error('Usage: node scripts/gpu.ts <check|profile> [--url URL] [--out trace.json]');
  }

  let out = path.join(tmpdir(), `royal-gpu-profile-${Date.now()}.json`);
  let settleMs = 0;
  let url = 'http://127.0.0.1:5173/cube';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--url' && value !== undefined) {
      url = value;
      index += 1;
      continue;
    }

    if (arg === '--out' && value !== undefined) {
      out = value;
      index += 1;
      continue;
    }

    if (arg === '--settle-ms' && value !== undefined) {
      settleMs = Number(value);
      if (!Number.isFinite(settleMs) || settleMs < 0) {
        throw new Error(`Invalid --settle-ms value: ${value}`);
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown GPU script argument: ${arg ?? '<empty>'}`);
  }

  return { mode: modeArg, out, settleMs, url };
};

const launchChromium = async (): Promise<{
  readonly browser: ChildProcessWithoutNullStreams;
  readonly userDataDir: string;
  readonly wsUrl: string;
}> => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'royal-gpu-'));
  const browser = spawn('/usr/bin/chromium', chromiumArgs(userDataDir));

  const wsUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Chromium did not expose a DevTools websocket'));
    }, 10000);

    browser.stderr.on('data', (data: Buffer) => {
      const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match?.[1] === undefined) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });

    browser.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited before profiling started: ${code}`));
    });
  });

  return { browser, userDataDir, wsUrl };
};

const openCdp = (wsUrl: string): Promise<CdpClient> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    socket.addEventListener('open', () => resolve(new CdpClient(socket)));
    socket.addEventListener('error', () => reject(new Error('Failed to connect to Chromium DevTools')));
  });

const openPage = async (
  cdp: CdpClient,
  url: string
): Promise<{ readonly sessionId: string }> => {
  const target = await cdp.send<{ readonly targetId: string }>('Target.createTarget', {
    url: 'about:blank'
  });
  const attached = await cdp.send<{ readonly sessionId: string }>('Target.attachToTarget', {
    flatten: true,
    targetId: target.targetId
  });
  const sessionId = attached.sessionId;

  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const started = performance.now();
      const stats = globalThis.__royalGpuActivity = { drawCalls: 0, firstDrawMs: null };
      const originalGetContext = HTMLCanvasElement.prototype.getContext;

      HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
        const context = originalGetContext.call(this, type, ...args);
        if ((type === 'webgl' || type === 'experimental-webgl') && context && !context.__royalWrapped) {
          context.__royalWrapped = true;

          for (const name of ['drawArrays', 'drawElements']) {
            const original = context[name].bind(context);
            context[name] = (...drawArgs) => {
              stats.drawCalls += 1;
              stats.firstDrawMs ??= performance.now() - started;
              return original(...drawArgs);
            };
          }
        }
        return context;
      };
    })()`
  }, sessionId);
  const loaded = cdp.waitFor('Page.loadEventFired', sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  await loaded;
  await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `new Promise((resolve, reject) => {
      const started = performance.now();
      const wait = () => {
        if (
          document.querySelector('canvas') !== null &&
          (globalThis.__royalGpuActivity?.drawCalls ?? 0) > 0
        ) {
          resolve(undefined);
          return;
        }
        if (performance.now() - started > 5000) {
          reject(new Error('Timed out waiting for canvas draw'));
          return;
        }
        setTimeout(wait, 16);
      };
      wait();
    })`
  }, sessionId);

  return { sessionId };
};

const readWebGl = async (cdp: CdpClient, sessionId: string): Promise<WebGlReport> => {
  const evaluated = await cdp.send<{
    readonly result: { readonly value?: WebGlReport };
  }>('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const pixels = gl && canvas ? new Uint8Array(canvas.width * canvas.height * 4) : null;
      if (gl && pixels) gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let differentPixels = 0;
      if (pixels) {
        for (let index = 4; index < pixels.length; index += 4) {
          if (
            pixels[index] !== pixels[0] ||
            pixels[index + 1] !== pixels[1] ||
            pixels[index + 2] !== pixels[2] ||
            pixels[index + 3] !== pixels[3]
          ) {
            differentPixels += 1;
          }
        }
      }
      return {
        canvas: canvas === null ? null : { height: canvas.height, width: canvas.width },
        differentPixels,
        drawCalls: globalThis.__royalGpuActivity?.drawCalls ?? 0,
        firstDrawMs: globalThis.__royalGpuActivity?.firstDrawMs ?? null,
        renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown',
        vendor: gl && debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : 'unknown'
      };
    })()`
  }, sessionId);

  if (evaluated.result.value === undefined) {
    throw new Error('Failed to read WebGL renderer');
  }

  return evaluated.result.value;
};

const assertHardwareWebGl = (report: WebGlReport): void => {
  const renderer = report.renderer.toLowerCase();
  const vendor = report.vendor.toLowerCase();
  const software = ['swiftshader', 'software', 'llvmpipe', 'lavapipe'];

  if (report.canvas === null) throw new Error('No canvas found on page');
  if (report.drawCalls === 0) throw new Error('WebGL rendered no draw calls');
  if (software.some((needle) => renderer.includes(needle) || vendor.includes(needle))) {
    throw new Error(`Software WebGL renderer rejected: ${report.vendor} / ${report.renderer}`);
  }
};

const collectTrace = async (
  cdp: CdpClient,
  url: string,
  out: string,
  settleMs: number
): Promise<WebGlReport> => {
  const events: unknown[] = [];

  const onMessage = (event: MessageEvent): void => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (message.method !== 'Tracing.dataCollected') return;
    const params = message.params as { readonly value?: readonly unknown[] };
    events.push(...(params.value ?? []));
  };

  cdp.socket.addEventListener('message', onMessage);
  await cdp.send('Tracing.start', {
    categories: [
      'blink.user_timing',
      'cc',
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'gpu',
      'loading',
      'toplevel',
      'v8'
    ].join(','),
    transferMode: 'ReportEvents'
  });
  const page = await openPage(cdp, url);
  const report = await readWebGl(cdp, page.sessionId);
  if (settleMs > 0) {
    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `new Promise((resolve) => setTimeout(resolve, ${JSON.stringify(settleMs)}))`
    }, page.sessionId);
  }
  const complete = cdp.waitFor('Tracing.tracingComplete');
  await cdp.send('Tracing.end');
  await complete;
  cdp.socket.removeEventListener('message', onMessage);

  writeFileSync(out, JSON.stringify({ traceEvents: events }));
  return report;
};

const main = async (): Promise<void> => {
  const { mode, out, settleMs, url } = parseArgs();
  const { browser, userDataDir, wsUrl } = await launchChromium();

  try {
    const cdp = await openCdp(wsUrl);
    const report = mode === 'profile'
      ? await collectTrace(cdp, url, out, settleMs)
      : await openPage(cdp, url).then((page) => readWebGl(cdp, page.sessionId));

    assertHardwareWebGl(report);
    console.log(`WebGL renderer: ${report.vendor} / ${report.renderer}`);
    console.log(`Canvas: ${report.canvas?.width}x${report.canvas?.height}`);
    console.log(`Draw calls: ${report.drawCalls}`);
    console.log(`First draw: ${report.firstDrawMs?.toFixed(2) ?? 'unknown'} ms`);

    if (mode === 'profile') {
      console.log(`Trace: ${out}`);
    }

    cdp.socket.close();
  } finally {
    browser.kill();
    rmSync(userDataDir, { force: true, recursive: true });
  }
};

await main();
