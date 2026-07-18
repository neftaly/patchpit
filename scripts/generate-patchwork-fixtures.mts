import assert from 'node:assert/strict';
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
import {
  createAutomergeFolderDocument,
  openAutomergeFolderDatabase,
} from '@patchpit/automerge-fs';
import {
  commitFolderOperation,
  openFolderLinksQuery,
} from '@patchpit/fs';

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
  ['@automerge/automerge-repo/slim', import.meta.resolve('@automerge/automerge-repo/slim')],
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
  getTitle(document: Record<string, unknown>, repo: Repo): string;
  setTitle?(document: Record<string, unknown>, title: string): void;
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
const { getType } = await importUpstream<{
  getType: (document: Readonly<Record<string, unknown>>) => string | undefined;
}>(patchwork, 'core/filesystem/src/metadata.ts');
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

const foreignFolderBeforePatchpit = Automerge.save(folder.doc());
const folderOpened = await openAutomergeFolderDatabase(folder);
assert.equal(folderOpened.success, true);
if (!folderOpened.success) throw new Error('Patchpit could not reopen the upstream folder fixture.');
const folderLinks = await openFolderLinksQuery([folderOpened.value]);
try {
  const settled = await folderLinks.whenSettled();
  const firstLinkId = settled.rows[0]?.linkId;
  assert.equal(typeof firstLinkId, 'string');
  const receipt = await commitFolderOperation(folderOpened.value, {
    kind: 'folder.link.unlink',
    linkId: firstLinkId ?? '',
  });
  assert.equal(receipt.outcome, 'committed');
} finally {
  folderLinks.close();
  folderOpened.value.close();
}

const foreignFolderAfterPatchpit = Automerge.save(folder.doc());

const patchpitFolder = repo.create(createAutomergeFolderDocument('Patchpit compatible folder', [{
  linkId: 'notes',
  name: 'notes.txt',
  order: 0,
  resourceRef: text.url,
  typeHint: 'file',
}]));
const patchpitFolderDocument = Automerge.save(patchpitFolder.doc());

const upstreamReopenRepo = new Repo({ network: [] });
const reopenUpstream = (bytes: Uint8Array) => {
  const handle = upstreamReopenRepo.create<Record<string, unknown>>();
  handle.update(() => Automerge.load<Record<string, unknown>>(bytes));
  return handle;
};
const reopenedForeignFolder = reopenUpstream(foreignFolderAfterPatchpit).doc();
assert.equal(getType(reopenedForeignFolder), 'folder');
assert.equal(FolderDatatype.getTitle(reopenedForeignFolder, upstreamReopenRepo), 'Patchwork interoperability');
const reopenedForeignLinks = reopenedForeignFolder.docs;
assert.ok(Array.isArray(reopenedForeignLinks));
assert.equal(reopenedForeignLinks.length, 4);
assert.deepEqual(reopenedForeignFolder.fixtureExtension, { retained: true });

const reopenedPatchpitFolderHandle = reopenUpstream(patchpitFolderDocument);
const reopenedPatchpitFolder = reopenedPatchpitFolderHandle.doc();
assert.equal(getType(reopenedPatchpitFolder), 'folder');
assert.equal(FolderDatatype.getTitle(reopenedPatchpitFolder, upstreamReopenRepo), 'Patchpit compatible folder');
const reopenedPatchpitLinks = reopenedPatchpitFolder.docs;
assert.ok(Array.isArray(reopenedPatchpitLinks));
assert.equal(reopenedPatchpitLinks.length, 1);
assert.equal(typeof FolderDatatype.setTitle, 'function');
reopenedPatchpitFolderHandle.change((document) => {
  FolderDatatype.setTitle?.(document, 'Patchwork renamed folder');
});
const patchpitFolderAfterPatchwork = Automerge.save(reopenedPatchpitFolderHandle.doc());

const documents = [
  ['folder.am', foreignFolderBeforePatchpit],
  ['folder-after-patchpit-unlink.am', foreignFolderAfterPatchpit],
  ['patchpit-folder.am', patchpitFolderDocument],
  ['patchpit-folder-after-patchwork-rename.am', patchpitFolderAfterPatchwork],
  ['text-file.am', Automerge.save(text.doc())],
  ['binary-file.am', Automerge.save(binary.doc())],
  ['immutable-string-file.am', Automerge.save(immutable.doc())],
] as const;

await mkdir(FIXTURE_DIRECTORY, { recursive: true });

const fixtures = await Promise.all(documents.map(async ([name, bytes]) => {
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
      sources: [
        'core/filesystem/src/metadata.ts',
        'core/plugins/src/datatypes.ts',
      ],
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

await upstreamReopenRepo.shutdown();
await repo.shutdown();
