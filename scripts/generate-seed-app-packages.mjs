import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const generatedFixturePath = resolve(repoRoot, 'packages/system/src/fixtures/seed-app-packages.ts');
const buildRoot = resolve(repoRoot, '.seed-app-packages');

const seedApps = await seedAppPackages();

await rm(buildRoot, { force: true, recursive: true });
const packages = [];

for (const app of seedApps) {
  const appRoot = resolve(repoRoot, app.root);
  const outDir = resolve(buildRoot, app.id);
  await build({
    build: {
      emptyOutDir: true,
      lib: {
        entry: resolve(appRoot, app.main),
        fileName: () => 'app.js',
        formats: ['es'],
      },
      minify: false,
      outDir,
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name][extname]',
          chunkFileNames: 'assets/[name].js',
          entryFileNames: 'app.js',
          inlineDynamicImports: true,
        },
      },
      sourcemap: false,
      target: 'esnext',
    },
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    root: appRoot,
  });

  packages.push({
    files: await bundleFiles(outDir),
    manifest: app.manifest,
  });
}

const fixtureSource = `export type SeedAppPackageFile = {
  readonly content: string;
  readonly name: string;
};

export type SeedAppPackageEntryKind = 'html' | 'module';

export type SeedAppPackageHandler = {
  readonly accepts: readonly string[];
  readonly intent: 'activate' | 'open' | 'preview' | 'reveal';
  readonly port: string;
};

export type SeedAppPackageSurface = {
  readonly role: 'document-set' | 'workspace-view';
  readonly state?: {
    readonly schemaId?: string;
    readonly type: string;
  };
};

export type SeedAppPackageManifest = {
  readonly entry: string;
  readonly entryKind: SeedAppPackageEntryKind;
  readonly handles: readonly SeedAppPackageHandler[];
  readonly icon: string;
  readonly id: string;
  readonly name: string;
  readonly schemaIds?: readonly string[];
  readonly surfaces: readonly SeedAppPackageSurface[];
  readonly version: string;
};

export type SeedAppPackageDefinition = {
  readonly files: readonly SeedAppPackageFile[];
  readonly manifest: SeedAppPackageManifest;
};

export const seedAppPackages = ${JSON.stringify(packages, null, 2)} as const satisfies readonly SeedAppPackageDefinition[];
`;

await mkdir(dirname(generatedFixturePath), { recursive: true });
await writeFile(generatedFixturePath, fixtureSource);

async function seedAppPackages() {
  const appsRoot = resolve(repoRoot, 'apps');
  const entries = await readdir(appsRoot, { withFileTypes: true });
  const packages = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const root = `apps/${entry.name}`;
    const packageJsonPath = resolve(repoRoot, root, 'package.json');
    let packageSource;
    try {
      packageSource = await readFile(packageJsonPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    const packageJson = JSON.parse(packageSource);
    const patchpit = packageJson.patchpit;
    if (typeof patchpit !== 'object' || patchpit === null || Array.isArray(patchpit)) {
      continue;
    }
    if (typeof packageJson.main !== 'string') {
      throw new Error(`Seed app ${root} must declare package.json main.`);
    }
    if (typeof packageJson.name !== 'string') {
      throw new Error(`Seed app ${root} must declare package.json name.`);
    }
    const appId = packageNameAppId(packageJson.name);
    const { bundleEntry: _bundleEntry, displayName, ...manifestFields } = patchpit;
    packages.push({
      id: appId,
      main: packageJson.main,
      manifest: {
        ...manifestFields,
        entry: 'app.js',
        handles: patchpit.handles ?? [],
        id: appId,
        name: displayName ?? packageJson.name,
        version: packageJson.version ?? '0.0.0',
      },
      root,
    });
  }

  return packages;
}

function packageNameAppId(name) {
  const unscoped = name.split('/').at(-1) ?? name;
  return unscoped.startsWith('patchpit-') ? unscoped.slice('patchpit-'.length) : unscoped;
}

async function bundleFiles(directory) {
  const files = await listFiles(directory);
  if (!files.includes('app.js')) {
    throw new Error(`Seed app bundle at ${directory} did not emit app.js.`);
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
