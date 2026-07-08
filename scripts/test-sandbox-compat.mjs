import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createSandboxUrlMountFromFsTree } from '@patchpit/sandbox-fs';

const appRoot = resolve('apps/sandbox-compat/static');
const ghostscriptTigerPath = resolve('apps/sandbox-compat/url-backed/Ghostscript_Tiger.svg');
const ghostscriptTigerSrc = 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium';
const selectedCase = process.argv.find((argument) => argument.startsWith('--case='))?.slice('--case='.length);

const files = await mountedFiles();
const server = await staticServer(files);
const browser = await chromium.launch({ executablePath: chromiumPath });

try {
  const reference = await referenceReport(browser, server.url, selectedCase);
  const sandbox = await sandboxReport(browser, files, server, selectedCase);
  const comparison = compareReports(reference, sandbox, selectedCase);
  console.log(JSON.stringify(comparison, null, 2));
} finally {
  await browser.close();
  await server.close();
}

async function referenceReport(browser, url, onlyCase) {
  return pageReport(browser, async (page) => {
    await page.goto(`${url}${caseHash(onlyCase)}`);
    return compatReport(page);
  });
}

async function sandboxReport(browser, files, server, onlyCase) {
  const documentBuildStartedAt = performance.now();
  const sandboxMount = createSandboxUrlMountFromFsTree({
    entries: files.map((file) => [file.path[0], { kind: 'file', src: file.src }]),
    kind: 'dir',
  }, {
    baseUrl: server.url,
    entry: ['index.html'],
    mountId: 'sandbox-compat',
    readFile: (file) => files.find((item) => item.src === file.src),
  });
  server.addMount(sandboxMount);
  const sandboxDocument = sandboxMount.document;
  const documentBuildMs = performance.now() - documentBuildStartedAt;

  return pageReport(browser, async (page) => {
    await page.setContent('<!doctype html><body></body>');
    await page.evaluate(({ document, hash }) => {
      window.__sandboxCompatReport = undefined;
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'sandbox-compat:report') window.__sandboxCompatReport = event.data;
      });
      const iframe = window.document.createElement('iframe');
      iframe.referrerPolicy = document.referrerPolicy;
      iframe.sandbox = document.sandbox;
      iframe.src = `${document.url}${hash}`;
      window.document.body.append(iframe);
    }, { document: sandboxDocument, hash: caseHash(onlyCase) });
    const report = await compatReport(page);
    return {
      ...report,
      documentBuildMs,
      launchUrlLength: sandboxDocument.url.length,
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
  const referenceCases = selectedCases(reference.cases, onlyCase);
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
    sandboxDocumentBuildMs: sandbox.documentBuildMs,
    sandboxLaunchUrlLength: sandbox.launchUrlLength,
    sandboxDurationMs: sandbox.durationMs,
  };
}

function selectedCases(cases, onlyCase) {
  return onlyCase === undefined ? cases : cases.filter((result) => result.id === onlyCase);
}

async function mountedFiles() {
  return [
    ...await staticFiles(appRoot),
    {
      body: await readFile(ghostscriptTigerPath),
      contentType: 'image/svg+xml',
      path: ['ghostscript-tiger.svg'],
      src: ghostscriptTigerSrc,
    },
  ].toSorted((left, right) => left.path.join('/').localeCompare(right.path.join('/')));
}

async function staticFiles(root) {
  return Promise.all((await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const path = resolve(root, entry.name);
      return {
        body: await readFile(path),
        contentType: contentType(path),
        path: [entry.name],
        src: `automerge:sandbox-compat/${entry.name}`,
      };
    }));
}

function staticServer(files) {
  let mount;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const mountResponse = await mount?.respond(new Request(url, { method: request.method ?? 'GET' }));
    if (mountResponse !== undefined) {
      await writeWebResponse(response, mountResponse);
      return;
    }
    const file = files.find((item) => item.path[0] === requestFileName(request.url));
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

async function writeWebResponse(response, webResponse) {
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  response.end(webResponse.body === null ? undefined : new Uint8Array(await webResponse.arrayBuffer()));
}

function requestFileName(url) {
  return decodeURIComponent(new URL(url ?? '/', 'http://localhost/').pathname.slice(1)) || 'index.html';
}

function contentType(path) {
  const type = ({
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
  })[extname(path)];
  if (type === undefined) throw new Error(`Unknown sandbox compat content type: ${path}`);
  return type;
}
