import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxDocument } from './index';

type EmbeddedPayload = {
  readonly entryHtml: string;
  readonly entryPath: string;
  readonly fileDataUrls: readonly (readonly [string, string])[];
};

void test('sandbox document API returns a data-backed iframe document', async () => {
  const sandboxDocument = await createSandboxDocument({
    entry: ['index.html'],
    files: [{
      body: '<!doctype html><img src="./assets/dir%20name/a%2Fb.svg">',
      contentType: 'text/html',
      path: ['index.html'],
    }, {
      body: '<svg />',
      contentType: 'image/svg+xml',
      path: ['assets', 'dir name', 'a/b.svg'],
    }],
  });

  assert.equal(sandboxDocument.sandbox, 'allow-scripts');
  assert.equal(sandboxDocument.url.startsWith('data:text/html;charset=utf-8,'), true);

});

void test('sandbox document API rewrites JavaScript and CSS relative file references before embedding', async () => {
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
      body: `export const nested = true;`,
      contentType: 'text/javascript',
      path: ['src', 'nested.js'],
    }, {
      body: `export default 1;`,
      contentType: 'text/javascript',
      path: ['pkg', 'value.js'],
    }, {
      body: `export const more = true;`,
      contentType: 'text/javascript',
      path: ['src', 'more.js'],
    }, {
      body: `export const lazy = true;`,
      contentType: 'text/javascript',
      path: ['src', 'lazy.js'],
    }, {
      body: '{}',
      contentType: 'application/json',
      path: ['src', 'app.js.map'],
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
    }, {
      body: 'html { box-sizing: border-box; }',
      contentType: 'text/css',
      path: ['src', 'reset.css'],
    }, {
      body: 'body { color: black; }',
      contentType: 'text/css',
      path: ['theme.css'],
    }, {
      body: '<svg />',
      contentType: 'image/svg+xml',
      path: ['img', 'bg.svg'],
    }],
  });

  const payload = embeddedPayload(sandboxDocument.url);
  const files = new Map(payload.fileDataUrls);
  const app = embeddedFileText(files, 'src/app.js');
  const style = embeddedFileText(files, 'src/style.css');
  const depUrl = embeddedFileUrl(files, 'src/dep.js');
  const dep = embeddedFileText(files, 'src/dep.js');
  const valueUrl = embeddedFileUrl(files, 'pkg/value.js');
  const moreUrl = embeddedFileUrl(files, 'src/more.js');
  const lazyUrl = embeddedFileUrl(files, 'src/lazy.js');
  const mapUrl = embeddedFileUrl(files, 'src/app.js.map');
  const resetUrl = embeddedFileUrl(files, 'src/reset.css');
  const themeUrl = embeddedFileUrl(files, 'theme.css');
  const bgUrl = embeddedFileUrl(files, 'img/bg.svg');

  assert.equal(app.includes(`import '${depUrl}';`), true);
  assert.equal(dep.includes(`import './nested.js';`), false);
  assert.match(dep, /import 'data:text\/javascript;base64,/);
  assert.equal(app.includes(`import value from "${valueUrl}";`), true);
  assert.equal(app.includes(`import bare from "library";`), true);
  assert.equal(app.includes(`export { value } from '${depUrl}';`), true);
  assert.equal(app.includes(`export * from '${moreUrl}';`), true);
  assert.equal(app.includes(`const lazy = import('${lazyUrl}');`), true);
  assert.equal(app.includes(`//# sourceMappingURL=${mapUrl}`), true);
  assert.equal(style.includes(`@import "${resetUrl}";`), true);
  assert.equal(style.includes(`@import url('${themeUrl}') screen;`), true);
  assert.equal(style.includes(`background: url("${bgUrl}#paint")`), true);
  assert.equal(style.includes(`url("data:image/png;base64,aaaa")`), true);
  assert.equal(style.includes(`url(/keep.svg)`), true);
});

void test('sandbox document API rejects missing JavaScript relative file references during embedding', async () => {
  await assert.rejects(
    createSandboxDocument({
      entry: ['index.html'],
      files: [{
        body: '<script type="module" src="./src/app.js"></script>',
        contentType: 'text/html',
        path: ['index.html'],
      }, {
        body: `import './missing.js';`,
        contentType: 'text/javascript',
        path: ['src', 'app.js'],
      }],
    }),
    /Missing sandbox file referenced from src\/app\.js: \.\/missing\.js/,
  );
});

void test('sandbox document API rejects missing CSS relative file references during embedding', async () => {
  await assert.rejects(
    createSandboxDocument({
      entry: ['index.html'],
      files: [{
        body: '<link rel="stylesheet" href="./style.css">',
        contentType: 'text/html',
        path: ['index.html'],
      }, {
        body: `.missing { background: url(./missing.png); }`,
        contentType: 'text/css',
        path: ['style.css'],
      }],
    }),
    /Missing sandbox file referenced from style\.css: \.\/missing\.png/,
  );
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

  assert.equal(html.includes('const activateEntryScripts = async () => {'), true);
  assert.equal(html.includes('script.async = false;'), true);
  assert.equal(html.includes(`script.addEventListener('load', () => resolve(), { once: true });`), true);
  assert.equal(html.includes(`script.addEventListener('error', () => reject(new Error(\`Failed to load sandbox script: \${script.src}\`)), { once: true });`), true);
  assert.equal(html.includes('await new Promise((resolve, reject) => {'), true);
  assert.equal(html.includes('window.fetch = (input, init) => {'), true);
  assert.equal(html.includes('return nativeFetch(resolved ?? input, init);'), true);
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
