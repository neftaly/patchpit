import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as Automerge from '@automerge/automerge';
import {
  ImmutableString,
  Repo,
  type DocHandle,
} from '@automerge/automerge-repo';

const PATCHWORK_COMMIT = '4742ae09ce406c89e13711dab57d15ec69a5c77f';
const PATCHWORK_BASE_COMMIT = '371b677978d00c4bcaf7b9831c24cc28479179d7';
const FIXTURE_DIRECTORY = resolve('tests/fixtures/patchwork');

const { values } = parseArgs({
  options: {
    patchwork: { type: 'string' },
    'patchwork-base': { type: 'string' },
  },
  strict: true,
});

if (values.patchwork === undefined || values['patchwork-base'] === undefined) {
  throw new Error('Pass --patchwork and --patchwork-base checkouts at the pinned commits.');
}

const patchwork = resolve(values.patchwork);
const patchworkBase = resolve(values['patchwork-base']);
const patchpitPackage = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as {
  readonly dependencies?: Readonly<Record<string, string>>;
};

const dependencyVersion = (name: string) => {
  const version = patchpitPackage.dependencies?.[name];
  if (version === undefined) throw new Error(`Patchpit dependency ${name} is unavailable.`);
  return version;
};

const requireCommit = (checkout: string, expected: string) => {
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: checkout,
    encoding: 'utf8',
  }).trim();
  if (actual !== expected) {
    throw new Error(`Expected ${checkout} at ${expected}, received ${actual}.`);
  }
};

requireCommit(patchwork, PATCHWORK_COMMIT);
requireCommit(patchworkBase, PATCHWORK_BASE_COMMIT);

const packageUrls = new Map([
  ['@automerge/automerge', import.meta.resolve('@automerge/automerge')],
  ['@automerge/automerge-repo', import.meta.resolve('@automerge/automerge-repo')],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const packageUrl = packageUrls.get(specifier);
    return packageUrl === undefined
      ? nextResolve(specifier, context)
      : { shortCircuit: true, url: packageUrl };
  },
});

type PatchworkMetadata = {
  type: string;
  suggestedImportUrl?: string;
};

type PatchworkDocument = {
  '@patchwork': PatchworkMetadata;
} & Record<string, unknown>;

type Datatype = {
  init(document: Record<string, unknown>, repo: Repo): void;
};

type LoadedDatatype = {
  id: string;
  importUrl: string;
  module: Datatype;
};

type CreateDocOfDatatype = (
  datatype: LoadedDatatype,
  repo: Repo,
  change?: (document: PatchworkDocument) => void,
) => Promise<DocHandle<PatchworkDocument>>;

const importUpstream = async <Module,>(checkout: string, path: string) =>
  import(pathToFileURL(join(checkout, path)).href) as Promise<Module>;

const { createDocOfDatatype2 } = await importUpstream<{
  createDocOfDatatype2: CreateDocOfDatatype;
}>(patchwork, 'core/plugins/src/datatypes.ts');
const { FolderDatatype } = await importUpstream<{ FolderDatatype: Datatype }>(
  patchworkBase,
  'folder/src/datatype.js',
);
const { NewFileDatatype } = await importUpstream<{ NewFileDatatype: Datatype }>(
  patchworkBase,
  'file/src/new-file-datatype.ts',
);

const loadedDatatype = (id: string, module: Datatype): LoadedDatatype => ({
  id,
  importUrl: `https://example.com/patchwork/${id}.js`,
  module,
});

const repo = new Repo({ network: [] });
const fileDatatype = loadedDatatype('new-file', NewFileDatatype);

const createFile = async (
  name: string,
  extension: string,
  mimeType: string,
  content: string | Uint8Array<ArrayBuffer> | InstanceType<typeof ImmutableString>,
) => createDocOfDatatype2(fileDatatype, repo, (document) => {
  document['@patchwork'].type = 'file';
  document.name = name;
  document.extension = extension;
  document.mimeType = mimeType;
  document.content = content;
});

const text = await createFile('notes', 'txt', 'text/plain', 'Patchwork text fixture.');
const binary = await createFile(
  'pixel',
  'rgba',
  'application/octet-stream',
  new Uint8Array([0, 127, 128, 255]),
);
const immutable = await createFile(
  'collaborative',
  'md',
  'text/markdown',
  new ImmutableString('# Immutable Patchwork text'),
);
const unavailable = await repo.create2<Record<string, unknown>>({ fixture: 'not exported' });

const folder = await createDocOfDatatype2(
  loadedDatatype('folder', FolderDatatype),
  repo,
  (document) => {
    document.title = 'Patchwork interoperability';
    document.docs = [
      { name: 'notes.txt', type: 'file', url: text.url, icon: 'text' },
      { name: 'README.txt', type: 'file', url: text.url },
      { name: 'duplicate.data', type: 'file', url: binary.url },
      { name: 'duplicate.data', type: 'file', url: immutable.url, copyOf: text.url },
      { name: 'unavailable.data', type: 'file', url: unavailable.url },
    ];
    document.lastSyncAt = 1_700_000_000_000;
    document.fixtureExtension = { retained: true };
  },
);

folder.change((document) => {
  const links = document.docs;
  if (!Array.isArray(links) || typeof links[0] !== 'object' || links[0] === null) {
    throw new Error('Upstream folder initialization did not create the expected links.');
  }
  (links[0] as Record<string, unknown>).fixtureLinkExtension = 'retained';
});

const documents = [
  ['folder.am', folder],
  ['text-file.am', text],
  ['binary-file.am', binary],
  ['immutable-string-file.am', immutable],
] as const;

await mkdir(FIXTURE_DIRECTORY, { recursive: true });

const fixtures = await Promise.all(documents.map(async ([name, handle]) => {
  const bytes = Automerge.save(handle.doc());
  await writeFile(join(FIXTURE_DIRECTORY, name), bytes);
  return {
    file: name,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}));

await writeFile(join(FIXTURE_DIRECTORY, 'manifest.json'), `${JSON.stringify({
  formatVersion: 1,
  upstream: {
    patchwork: {
      commit: PATCHWORK_COMMIT,
      repository: 'https://github.com/inkandswitch/patchwork',
      sources: ['core/plugins/src/datatypes.ts'],
    },
    patchworkBase: {
      commit: PATCHWORK_BASE_COMMIT,
      repository: 'https://github.com/inkandswitch/patchwork-base',
      sources: [
        'file/src/new-file-datatype.ts',
        'file/src/new-file-tool.tsx',
        'folder/src/datatype.js',
      ],
    },
  },
  runtime: {
    '@automerge/automerge': dependencyVersion('@automerge/automerge'),
    '@automerge/automerge-repo': dependencyVersion('@automerge/automerge-repo'),
  },
  fixtures,
}, undefined, 2)}\n`);

await repo.shutdown();
