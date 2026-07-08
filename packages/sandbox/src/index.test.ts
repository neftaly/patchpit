import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxDocument } from './index';

type EmbeddedPayload = {
  readonly contentSecurityPolicy: string;
  readonly entryHtml: string;
  readonly entryPath: string;
  readonly fileDataUrls: readonly (readonly [string, string])[];
  readonly htmlFiles: readonly (readonly [string, string])[];
};

void test('sandbox document API returns a data-backed iframe document', async () => {
  const sandboxDocument = await createSandboxDocument({
    entry: ['index.html'],
    files: [{
      body: '<!doctype html><iframe src="./nested.html"></iframe><img src="./assets/dir%20name/a%2Fb.svg">',
      contentType: 'text/html',
      path: ['index.html'],
    }, {
      body: '<!doctype html><img src="./assets/dir%20name/a%2Fb.svg">',
      contentType: 'text/html',
      path: ['nested.html'],
    }, {
      body: '<svg />',
      contentType: 'image/svg+xml',
      path: ['assets', 'dir name', 'a/b.svg'],
    }],
  });

  assert.equal(sandboxDocument.sandbox, 'allow-scripts');
  assert.equal(sandboxDocument.referrerPolicy, 'no-referrer');
  assert.equal(sandboxDocument.url.startsWith('data:text/html;charset=utf-8,'), true);
  assert.equal(embeddedPayload(sandboxDocument.url).contentSecurityPolicy.includes(`connect-src 'none'`), true);
  assert.deepEqual(new Map(embeddedPayload(sandboxDocument.url).htmlFiles).get('nested.html'), '<!doctype html><img src="./assets/dir%20name/a%2Fb.svg">');
});

void test('sandbox document API embeds JavaScript and CSS without parsing source languages', async () => {
  const sandboxDocument = await createSandboxDocument({
    entry: ['index.html'],
    files: [{
      body: '<!doctype html><script type="module" src="./src/app.js"></script><link rel="stylesheet" href="./src/style.css">',
      contentType: 'text/html',
      path: ['index.html'],
    }, {
      body: [
        `import './dep.js';`,
        `import value from "../pkg/value.js";`,
        `import bare from "library";`,
        `export { value } from './dep.js';`,
        `export * from './more.js';`,
        `const lazy = import('./lazy.js');`,
        `//# sourceMappingURL=app.js.map`,
      ].join('\n'),
      contentType: 'text/javascript',
      path: ['src', 'app.js'],
    }, {
      body: `import './nested.js';\nexport const dep = true;`,
      contentType: 'text/javascript',
      path: ['src', 'dep.js'],
    }, {
      body: [
        `@import "./reset.css";`,
        `@import url('../theme.css') screen;`,
        `.card { background: url(../img/bg.svg#paint); }`,
        `.data { background: url("data:image/png;base64,aaaa"); }`,
        `.root { background: url(/keep.svg); }`,
      ].join('\n'),
      contentType: 'text/css',
      path: ['src', 'style.css'],
    }],
  });

  const payload = embeddedPayload(sandboxDocument.url);
  const files = new Map(payload.fileDataUrls);
  const app = embeddedFileText(files, 'src/app.js');
  const style = embeddedFileText(files, 'src/style.css');
  const dep = embeddedFileText(files, 'src/dep.js');

  assert.equal(app.includes(`import './dep.js';`), true);
  assert.equal(dep.includes(`import './nested.js';`), true);
  assert.equal(app.includes(`import value from "../pkg/value.js";`), true);
  assert.equal(app.includes(`import bare from "library";`), true);
  assert.equal(app.includes(`export { value } from './dep.js';`), true);
  assert.equal(app.includes(`export * from './more.js';`), true);
  assert.equal(app.includes(`const lazy = import('./lazy.js');`), true);
  assert.equal(app.includes(`//# sourceMappingURL=app.js.map`), true);
  assert.equal(style.includes(`@import "./reset.css";`), true);
  assert.equal(style.includes(`@import url('../theme.css') screen;`), true);
  assert.equal(style.includes(`background: url(../img/bg.svg#paint)`), true);
  assert.equal(style.includes(`url("data:image/png;base64,aaaa")`), true);
  assert.equal(style.includes(`url(/keep.svg)`), true);
});

void test('sandbox document bootstrap recreates scripts in order with external load handling', async () => {
  const sandboxDocument = await createSandboxDocument({
    entry: ['index.html'],
    files: [{
      body: '<script src="./one.js"></script><script>window.order.push(2)</script>',
      contentType: 'text/html',
      path: ['index.html'],
    }, {
      body: 'window.order = [1];',
      contentType: 'text/javascript',
      path: ['one.js'],
    }],
  });

  const html = outerHtml(sandboxDocument.url);

  assert.equal(html.match(/<\/script>/g)?.length, 1);
  assert.equal(html.includes('const activateEntryScripts = async () => {'), true);
  assert.equal(html.includes('script.async = false;'), true);
  assert.equal(html.includes(`script.addEventListener('load', () => resolve(), { once: true });`), true);
  assert.equal(html.includes(`script.addEventListener('error', () => reject(new Error(\`Failed to load sandbox script: \${script.src}\`)), { once: true });`), true);
  assert.equal(html.includes('await new Promise((resolve, reject) => {'), true);
  assert.equal(html.includes('window.fetch = (input, init) => {'), true);
  assert.equal(html.includes('script.text = dataUrlText(script.src);'), true);
  assert.equal(html.includes('await (await fetch(script.src)).text()'), false);
  assert.equal(html.includes('input instanceof Request'), true);
  assert.equal(html.includes('Promise.resolve(dataUrlResponse(resolved))'), true);
  assert.equal(html.includes('nativeFetch(input instanceof Request ? new Request(resolved, input) : resolved, init);'), true);
  assert.equal(html.includes('element.srcdoc = bootstrapHtml(path, html);'), true);
  assert.equal(html.includes('throw new Error(`Missing sandbox file referenced from ${payload.entryPath}: ${value}`);'), true);
});

void test('sandbox document API only accepts relative file paths', async () => {
  await assert.rejects(
    createSandboxDocument({
      entry: [],
      files: [],
    }),
    /non-empty relative/,
  );
});

const embeddedPayload = (url: string): EmbeddedPayload => {
  const html = outerHtml(url);
  const payloadStart = html.lastIndexOf(')(');
  const payloadEnd = html.lastIndexOf(');\n</script>');
  if (payloadStart === -1 || payloadEnd === -1) throw new Error('Embedded sandbox payload is missing');
  return JSON.parse(html.slice(payloadStart + 2, payloadEnd)) as EmbeddedPayload;
};

const outerHtml = (url: string): string => dataUrlText(url);

const embeddedFileUrl = (files: ReadonlyMap<string, string>, path: string): string => {
  const url = files.get(path);
  if (url === undefined) throw new Error(`Embedded file is missing: ${path}`);
  return url;
};

const embeddedFileText = (files: ReadonlyMap<string, string>, path: string): string =>
  dataUrlText(embeddedFileUrl(files, path));

const dataUrlText = (url: string): string => {
  const commaIndex = url.indexOf(',');
  if (commaIndex === -1) throw new Error('Invalid data URL');
  const metadata = url.slice(0, commaIndex);
  const body = url.slice(commaIndex + 1);
  return metadata.endsWith(';base64')
    ? Buffer.from(body, 'base64').toString('utf8')
    : decodeURIComponent(body);
};
