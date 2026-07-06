import assert from 'node:assert/strict';
import test from 'node:test';
import { PatchpitType } from '@patchpit/system';
import { installedAppsFromFilesystem } from './installed-apps.ts';
import { installedAppManifests } from '../runtime/manifest-routing.ts';

void test('installed app discovery paths use package manifests in filesystem order', () => {
  const manifests = new Map([
    ['automerge:zeta-manifest', appManifest('zeta', 'Zeta')],
    ['automerge:alpha-manifest', appManifest('alpha', 'Alpha')],
    ['automerge:direct-manifest', appManifest('direct', 'Direct')],
    ['automerge:missing-version-manifest', appManifest('missing-version', 'Missing Version', { version: undefined })],
    ['automerge:bad-entry-kind-manifest', appManifest('bad-entry-kind', 'Bad Entry Kind', { entryKind: 'script' })],
  ]);
  const root = filesystemRoot([
    appPackageNode('zeta', 'automerge:zeta-package', 'automerge:zeta-manifest'),
    directManifestNode('direct.app', 'automerge:direct-manifest'),
    appPackageNode('missing-version', 'automerge:missing-version-package', 'automerge:missing-version-manifest'),
    appPackageNode('bad-entry-kind', 'automerge:bad-entry-kind-package', 'automerge:bad-entry-kind-manifest'),
    appPackageNode('alpha', 'automerge:alpha-package', 'automerge:alpha-manifest'),
  ]);

  const apps = installedAppsFromFilesystem({
    getDocument: (url) => manifests.get(url),
    root,
  });
  const routedManifests = installedAppManifests(seedFromFilesystem(root, manifests));

  assert.deepEqual(apps.map((app) => app.manifest.id), ['zeta', 'alpha']);
  assert.deepEqual(apps.map((app) => app.packagePath), ['/apps/zeta', '/apps/alpha']);
  assert.deepEqual(routedManifests.map((manifest) => manifest.id), ['zeta', 'alpha']);
});

function appManifest(id, name, overrides = {}) {
  const manifest = {
    '@patchpit': { type: PatchpitType.AppManifest },
    entry: 'main.js',
    entryKind: 'module',
    extension: 'am',
    handles: [],
    icons: [],
    id,
    manifestVersion: 1,
    mimeType: 'application/vnd.automerge',
    name,
    surfaces: [],
    version: '0.0.0',
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete manifest[key];
    } else {
      manifest[key] = value;
    }
  }
  return manifest;
}

function filesystemRoot(appsEntries) {
  return {
    entries: [
      {
        entries: appsEntries,
        kind: 'folder',
        name: 'apps',
        text: '',
        url: 'automerge:apps',
      },
    ],
    kind: 'folder',
    name: '/',
    text: '',
    url: 'automerge:root',
  };
}

function appPackageNode(name, url, manifestUrl) {
  return {
    entries: [
      directManifestNode('manifest.am', manifestUrl),
      {
        kind: 'file',
        mediaType: 'text/javascript',
        name: 'main.js',
        sourceUrl: null,
        text: '',
        url: `${url}:main`,
      },
    ],
    kind: 'folder',
    name,
    text: '',
    url,
  };
}

function directManifestNode(name, url) {
  return {
    kind: 'file',
    mediaType: 'application/vnd.automerge',
    name,
    sourceUrl: null,
    text: '',
    url,
  };
}

function seedFromFilesystem(root, documents) {
  const documentHandles = {};
  indexFilesystemDocs(documentHandles, root);
  for (const [url, doc] of documents) {
    documentHandles[url] = { doc: () => doc };
  }
  return {
    documentHandles,
    rootUrl: root.url,
  };
}

function indexFilesystemDocs(documentHandles, node) {
  if (node.kind !== 'folder') return;

  documentHandles[node.url] = {
    doc: () => ({
      '@patchpit': { type: PatchpitType.Folder },
      docs: node.entries.map((entry) => ({
        name: entry.name,
        type: entry.kind === 'folder' ? PatchpitType.Folder : PatchpitType.File,
        url: entry.url,
      })),
      name: node.name,
      title: node.name,
    }),
  };

  for (const entry of node.entries) {
    indexFilesystemDocs(documentHandles, entry);
  }
}
