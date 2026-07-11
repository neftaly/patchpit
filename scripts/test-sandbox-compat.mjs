import { createServer } from 'node:http';
import { constants, existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { respondWithSandboxUrlMount } from '@patchpit/sandbox/node';
import { createSandboxCompatMount, readSandboxCompatFiles } from '../apps/sandbox-compat/node.ts';

const installedChromium = chromium.executablePath();
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ?? (existsSync(installedChromium) ? installedChromium : '/usr/bin/chromium');
const selectedCase = process.argv.find((argument) => argument.startsWith('--case='))?.slice('--case='.length);

await assertChromiumExecutable(chromiumPath);
const files = await readSandboxCompatFiles();
const server = await staticServer(files);
const browser = await chromium.launch({ executablePath: chromiumPath });

try {
  const reference = await referenceReport(browser, server.url, selectedCase);
  const sandbox = await sandboxReport(browser, server, selectedCase);
  const comparison = compareReports(reference, sandbox, selectedCase);
  console.log(JSON.stringify(comparison, null, 2));
} finally {
  await browser.close();
  await server.close();
}

async function assertChromiumExecutable(path) {
  try {
    await access(path, constants.X_OK);
  } catch {
    throw new Error(`Chromium executable not found: ${path}\nSet PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium.`);
  }
}

async function referenceReport(browser, url, onlyCase) {
  return pageReport(browser, async (page) => {
    await page.goto(`${url}${caseHash(onlyCase)}`);
    return compatReport(page);
  });
}

async function sandboxReport(browser, server, onlyCase) {
  const mountBuildStartedAt = performance.now();
  const sandboxMount = await createSandboxCompatMount(server.url);
  server.addMount(sandboxMount);
  const frameAttributes = sandboxMount.frameAttributes;
  const mountBuildMs = performance.now() - mountBuildStartedAt;

  return pageReport(browser, async (page) => {
    await page.setContent('<!doctype html><body></body>');
    await page.evaluate(({ frameAttributes, hash }) => {
      window.__sandboxCompatReport = undefined;
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'sandbox-compat:report') window.__sandboxCompatReport = event.data;
      });
      const iframe = window.document.createElement('iframe');
      iframe.referrerPolicy = frameAttributes.referrerPolicy;
      iframe.sandbox = frameAttributes.sandbox;
      iframe.src = `${frameAttributes.src}${hash}`;
      window.document.body.append(iframe);
    }, { frameAttributes, hash: caseHash(onlyCase) });
    const report = await compatReport(page);
    return {
      ...report,
      mountBuildMs,
      launchUrlLength: frameAttributes.src.length,
    };
  });
}

async function pageReport(browser, read) {
  const page = await browser.newPage();
  try {
    return await read(page);
  } finally {
    await page.close();
  }
}

function compatReport(page) {
  return page.waitForFunction(() => window.__sandboxCompatReport, undefined, { timeout: 2000 })
    .then((handle) => handle.jsonValue());
}

function caseHash(onlyCase) {
  return onlyCase === undefined ? '' : `#case=${encodeURIComponent(onlyCase)}`;
}

function compareReports(reference, sandbox, onlyCase) {
  const referenceCases = onlyCase === undefined ? reference.cases : reference.cases.filter((result) => result.id === onlyCase);
  if (referenceCases.length === 0) throw new Error(`Unknown sandbox compat case: ${onlyCase}`);
  const sandboxCases = new Map(sandbox.cases.map((result) => [result.id, result]));
  const cases = referenceCases.map((referenceCase) => {
    const sandboxCase = sandboxCases.get(referenceCase.id);
    if (sandboxCase === undefined) return { id: referenceCase.id, ok: false, reason: 'missing sandbox result' };
    const expected = referenceCase.expectedSandbox;
    return {
      expected,
      id: referenceCase.id,
      ok: referenceCase.status === 'pass' && sandboxCase.status === expected,
      reference: referenceCase.status,
      sandbox: sandboxCase.status,
      sandboxDetail: sandboxCase.detail,
    };
  });
  const failed = cases.filter((result) => !result.ok);
  if (failed.length > 0) throw new Error(`Sandbox compat failed:\n${JSON.stringify(failed, null, 2)}`);
  return {
    cases,
    referenceDurationMs: reference.durationMs,
    sandboxMountBuildMs: sandbox.mountBuildMs,
    sandboxLaunchUrlLength: sandbox.launchUrlLength,
    sandboxDurationMs: sandbox.durationMs,
  };
}

function staticServer(files) {
  let mount;
  const fileByPath = new Map(files.map((file) => [file.path.join('/'), file]));
  const server = createServer(async (request, response) => {
    if (mount !== undefined && await respondWithSandboxUrlMount(mount, request, response)) return;
    const path = requestPath(request.url);
    const file = fileByPath.get((path.length === 0 ? ['index.html'] : path).join('/'));
    if (file === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': file.contentType }).end(file.body);
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') reject(new Error('Sandbox compat server did not bind to a TCP port'));
      else resolvePromise({
        addMount: (nextMount) => {
          mount = nextMount;
        },
        close: () => new Promise((resolveClose, rejectClose) =>
          server.close((error) => error === undefined ? resolveClose() : rejectClose(error))),
        url: `http://127.0.0.1:${address.port}/`,
      });
    });
  });
}

function requestPath(url) {
  return new URL(url ?? '/', 'http://localhost/')
    .pathname
    .split('/')
    .filter((segment) => segment !== '')
    .map(decodeURIComponent);
}
