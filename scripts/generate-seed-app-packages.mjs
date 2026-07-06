import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const generatedFixturePath = resolve(repoRoot, 'packages/system/src/fixtures/seed-app-packages.ts');
const buildRoot = resolve(repoRoot, '.seed-app-packages');

const seedApps = await seedAppPackages();

await rm(buildRoot, { force: true, recursive: true });
const packages = [];

for (const app of seedApps) {
  const sourceRoot = app.source === 'vite'
    ? resolve(repoRoot, app.root)
    : resolve(buildRoot, '__sources', app.id);
  const outDir = app.source === 'vite'
    ? resolve(sourceRoot, 'dist')
    : resolve(buildRoot, app.id, 'dist');
  if (app.source !== 'vite') {
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(resolve(sourceRoot, 'index.html'), seedAppHtml(app));
  }
  await build({
    base: './',
    build: {
      emptyOutDir: true,
      minify: false,
      outDir,
      rollupOptions: {
        input: resolve(sourceRoot, 'index.html'),
        output: {
          assetFileNames: 'assets/[name][extname]',
          chunkFileNames: 'assets/[name].js',
          entryFileNames: 'assets/[name].js',
        },
      },
      sourcemap: false,
      target: 'esnext',
    },
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    root: sourceRoot,
  });

  packages.push({
    entry: app.entry,
    files: await bundleFiles(outDir),
    id: app.id,
  });
}

const fixtureSource = `export type SeedAppPackageFile = {
  readonly content: string;
  readonly name: string;
};

export type SeedAppPackageDefinition = {
  readonly entry: string;
  readonly files: readonly SeedAppPackageFile[];
  readonly id: string;
};

export const seedAppPackages = ${JSON.stringify(packages, null, 2)} as const satisfies readonly SeedAppPackageDefinition[];
`;

await mkdir(dirname(generatedFixturePath), { recursive: true });
await writeFile(generatedFixturePath, fixtureSource);

async function seedAppPackages() {
  const appsRoot = resolve(repoRoot, 'apps');
  const entries = await readdir(appsRoot, { withFileTypes: true });
  const packages = [helloWorldSeedAppPackage()];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const root = `apps/${entry.name}`;
    const appEntry = 'src/patchpit-app.js';
    const appEntryPath = resolve(repoRoot, root, appEntry);
    let appModule;
    try {
      await readFile(appEntryPath, 'utf8');
      appModule = await import(pathToFileURL(appEntryPath).href);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    const metadata = appModule.patchpitApp;
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new Error(`Seed app ${root} must export patchpitApp metadata from ${appEntry}.`);
    }
    if (typeof metadata.id !== 'string') {
      throw new Error(`Seed app ${root} patchpitApp metadata must declare id.`);
    }
    if (typeof metadata.name !== 'string') {
      throw new Error(`Seed app ${root} patchpitApp metadata must declare name.`);
    }

    packages.push({
      entry: 'index.html',
      id: metadata.id,
      main: appEntry,
      name: metadata.name,
      root,
      source: 'patchpit-module',
    });
  }

  return packages.sort((left, right) => left.id.localeCompare(right.id));
}

function helloWorldSeedAppPackage() {
  return {
    id: 'hello-world',
    entry: 'index.html',
    name: 'Hello World',
    root: 'apps/hello-world',
    source: 'vite',
  };
}

function seedAppHtml(app) {
  const appRoot = resolve(repoRoot, app.root);
  const entry = resolve(appRoot, app.main).split(sep).join('/');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(app.name)}</title>
  </head>
  <body>
    <div id="patchpit-root"></div>
    <script type="module">
      import activate from "/@fs/${entry}";
      await activate(window.patchpit);
    </script>
  </body>
</html>
`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

async function bundleFiles(directory) {
  const files = await listFiles(directory);
  if (!files.includes('index.html')) {
    throw new Error(`Seed app package at ${directory} did not emit index.html.`);
  }

  return Promise.all(files.map(async (name) => {
    const content = await readTextBundleFile(resolve(directory, name));
    return { content, name };
  }));
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(directory, path));
    else if (entry.isFile()) files.push(path);
  }

  return files;
}

async function readTextBundleFile(path) {
  const content = await readFile(path, 'utf8');
  if (content.includes('\u0000')) {
    const displayPath = relative(repoRoot, path).split(sep).join('/');
    throw new Error(`Seed app bundle artifact ${displayPath} is binary; filesystem seed app packages only support text files.`);
  }
  return content;
}
