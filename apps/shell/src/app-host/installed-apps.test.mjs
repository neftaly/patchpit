import assert from 'node:assert/strict';
import test from 'node:test';
import { PatchpitType } from '@patchpit/system';
import { installedAppsFromFilesystem } from './installed-apps.ts';

void test('installed apps come from package folders in filesystem order', () => {
  const manifests = new Map([
    ['automerge:zeta-manifest', appManifest('zeta', 'Zeta')],
    ['automerge:alpha-manifest', appManifest('alpha', 'Alpha')],
    ['automerge:direct-manifest', appManifest('direct', 'Direct')],
  ]);

  const apps = installedAppsFromFilesystem({
    getDocument: (url) => manifests.get(url),
    root: {
      entries: [
        {
          entries: [
            appPackageNode('zeta', 'automerge:zeta-package', 'automerge:zeta-manifest'),
            directManifestNode('direct.app', 'automerge:direct-manifest'),
            appPackageNode('alpha', 'automerge:alpha-package', 'automerge:alpha-manifest'),
          ],
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
    },
  });

  assert.deepEqual(apps.map((app) => app.manifest.id), ['zeta', 'alpha']);
  assert.deepEqual(apps.map((app) => app.packagePath), ['/apps/zeta', '/apps/alpha']);
});

function appManifest(id, name) {
  return {
    '@patchpit': { type: PatchpitType.AppManifest },
    entry: 'main.js',
    extension: 'am',
    handles: [],
    icons: [],
    id,
    manifestVersion: 1,
    mimeType: 'application/vnd.automerge',
    name,
    surfaces: [],
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
