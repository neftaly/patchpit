import { spawn, spawnSync } from 'node:child_process';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const port = readPort(process.env.PATCHPIT_XR_PORT, 1337);
const host = process.env.PATCHPIT_XR_HOST ?? '0.0.0.0';
const alias = process.env.PATCHPIT_XR_ALIAS ?? 'xr.local';
const browserDebugPort = readPort(process.env.PATCHPIT_XR_DEBUG_PORT, 9222);
const browserProfile = path.resolve(process.env.PATCHPIT_XR_BROWSER_PROFILE ?? path.join(os.tmpdir(), 'patchpit-chromium-xr'));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const shouldOpenBrowser = process.env.PATCHPIT_XR_OPEN !== '0';

printDevUrls();

const child = spawn(
  pnpm,
  [
    '--dir',
    'apps/infinigen',
    'exec',
    'vite',
    '--config',
    '../../vite.config.ts',
    '--host',
    host,
    '--port',
    String(port),
    '--strictPort'
  ],
  {
    env: {
      ...process.env,
      PATCHPIT_XR_BASIC_SSL: '1'
    },
    stdio: 'inherit'
  }
);

if (shouldOpenBrowser) {
  void openBrowserWhenReady();
}

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

function readPort(input, fallback) {
  const parsed = Number.parseInt(input ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function printDevUrls() {
  const networkUrls = readLanAddresses().map((address) => `https://${address}:${port}/`);

  console.log('');
  console.log('Patchpit XR dev');
  console.log(`  local:   https://localhost:${port}/`);
  console.log(`  network: ${networkUrls[0] ?? 'unavailable'}`);
  console.log(`  headset: https://${alias}:${port}/`);
  console.log(`  cdp:     http://127.0.0.1:${browserDebugPort}/json/version`);
  console.log('');
  console.log('XR dev cert: open a URL, choose Advanced, then Proceed.');
  console.log('Long term: use a trusted HTTPS relay/origin instead of teaching cert bypass.');
  console.log('');
}

function readLanAddresses() {
  try {
    return Object.values(os.networkInterfaces())
      .flatMap((items) => items ?? [])
      .filter((item) => item.family === 'IPv4' && !item.internal)
      .map((item) => item.address)
      .sort();
  } catch {
    return [];
  }
}

async function openBrowserWhenReady() {
  try {
    await waitForServer(`https://localhost:${port}/`, 12000);
  } catch {
    console.warn(`XR browser launch skipped: https://localhost:${port}/ did not respond yet.`);
    return;
  }

  const browser = findBrowser();

  if (browser === undefined) {
    console.warn('XR browser launch skipped: chromium/google-chrome not found on PATH.');
    return;
  }

  const childBrowser = spawn(
    browser,
    [
      `--user-data-dir=${browserProfile}`,
      `--remote-debugging-port=${browserDebugPort}`,
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      '--new-window',
      `https://localhost:${port}/`
    ],
    {
      detached: true,
      stdio: 'ignore'
    }
  );

  childBrowser.unref();
  console.log(`XR browser launched: ${browser}`);
}

function findBrowser() {
  const candidates = [
    process.env.PATCHPIT_XR_BROWSER,
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable'
  ].filter((candidate) => candidate !== undefined);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });

    if (result.status === 0) {
      return candidate;
    }
  }

  return undefined;
}

function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = https.get(url, { rejectUnauthorized: false }, (response) => {
        response.resume();
        resolve();
      });

      request.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error('server did not become ready'));
          return;
        }

        setTimeout(attempt, 200);
      });
    };

    attempt();
  });
}
