import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentLabel,
  contentUrlForResource,
  viewerContentUrl,
} from '../../src/content/invocation.ts';
import { projectResourceTree } from '../../src/content/resource-projection.ts';
import type { FolderLinkRow } from '@patchpit/fs';

void test('folder launch and viewer labels follow document references', () => {
  const folder = link('root', 'app', 'folder', 'App', 'folder:app');
  const unrelatedIndex = link('folder:other', 'index', 'file', 'index.html', 'file:other');
  const readme = link('folder:app', 'readme', 'file', 'readme.md', 'file:readme');
  const readmeAlias = link('root', 'readme-alias', 'file', 'notes.md', 'file:readme');

  assert.equal(contentUrlForResource(folder, projectResourceTree([folder, unrelatedIndex])), undefined);
  const resources = projectResourceTree([readmeAlias, folder, readme], 'root');
  assert.equal(contentUrlForResource(readme, resources), viewerContentUrl('file:readme'));
  assert.equal(contentLabel(resources, viewerContentUrl('file:readme')), 'readme.md');
  assert.equal(contentLabel(
    resources,
    viewerContentUrl('file:readme'),
    new Map([['file:readme', 'Document title']]),
  ), 'Document title');
});

const link = (
  sourceId: string,
  linkId: string,
  typeHint: string,
  name: string,
  resourceRef: string,
): FolderLinkRow => ({
  sourceId,
  linkId,
  typeHint,
  name,
  order: 0,
  resourceRef,
});
