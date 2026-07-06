import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSandboxPackageLoadPlan,
  sandboxFilesystemAppEntry,
} from './sandbox-package-loader.ts';

void test('sandbox module entries resolve package-relative imports', async () => {
  const entry = appEntry({
    entryKind: 'module',
    entryPath: 'app.js',
    files: [
      file('app.js', 'text/javascript', "import { message } from './lib/message.js'; export default () => message;"),
      folder('lib', [
        file('message.js', 'text/javascript', "export const message = 'hello from package module';"),
      ]),
    ],
  });

  const plan = createSandboxPackageLoadPlan(entry);

  assert.equal(plan.kind, 'module');
  if (plan.kind !== 'module') return;
  const module = await import(plan.entryModuleUrl);
  assert.equal(module.default(), 'hello from package module');
});

void test('sandbox html entries rewrite package-relative modules and assets', () => {
  const entry = appEntry({
    entryKind: 'html',
    entryPath: 'index.html',
    files: [
      file(
        'index.html',
        'text/html',
        '<!doctype html><html><head><link rel="stylesheet" href="./style.css"><script type="module" src="./app.js"></script></head><body></body></html>',
      ),
      file('app.js', 'text/javascript', "export default (env) => { window.appId = env.appId; };"),
      file('style.css', 'text/css', 'body { color: red; }'),
    ],
  });

  const plan = createSandboxPackageLoadPlan(entry);

  assert.equal(plan.kind, 'html');
  if (plan.kind !== 'html') return;
  assert.match(plan.html, /<script type="module">/);
  assert.match(plan.html, /await import\("data:text\/javascript;charset=utf-8,/);
  assert.match(plan.html, /href="data:text\/css;charset=utf-8,/);
  assert.doesNotMatch(plan.html, /src="\.\/app\.js"/);
});

void test('sandbox package loader rejects unsupported entries explicitly', () => {
  const entry = appEntry({
    entryKind: 'module',
    entryPath: 'data.json',
    files: [file('data.json', 'application/json', '{}')],
  });

  const plan = createSandboxPackageLoadPlan(entry);

  assert.deepEqual(plan, {
    error: 'Sandbox app entryKind "module" requires a JavaScript entry, got "data.json".',
    kind: 'error',
  });
});

void test('sandbox package loader rejects shell compatibility entries', () => {
  const entry = appEntry({
    entryKind: 'shell-compat',
    entryPath: 'index.html',
    files: [file('index.html', 'text/html', '<main>compat placeholder</main>')],
  });

  const plan = createSandboxPackageLoadPlan(entry);

  assert.deepEqual(plan, {
    error: 'Sandbox app entry "index.html" is shell compatibility content and must be rendered by a host adapter.',
    kind: 'error',
  });
});

function appEntry({
  entryKind,
  entryPath,
  files,
}) {
  const packageRoot = folder('test-app', files);
  const entry = findFile(packageRoot, entryPath);
  assert.ok(entry);
  return sandboxFilesystemAppEntry({
    entry,
    entryKind,
    entryPath,
    packageRoot,
  });
}

function folder(name, entries) {
  return {
    entries,
    kind: 'folder',
    name,
    text: '',
    url: `automerge:${name}`,
  };
}

function file(name, mediaType, text) {
  return {
    kind: 'file',
    mediaType,
    name,
    sourceUrl: null,
    text,
    url: `automerge:${name}`,
  };
}

function findFile(node, path) {
  const [part, ...rest] = path.split('/');
  assert.ok(part);
  if (node.kind !== 'folder') return null;
  const child = node.entries.find((entry) => entry.name === part);
  if (child === undefined) return null;
  if (rest.length === 0) return child.kind === 'file' ? child : null;
  return findFile(child, rest.join('/'));
}
