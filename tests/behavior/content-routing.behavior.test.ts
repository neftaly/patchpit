import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentLabel,
  contentUrlForResource,
  viewerContentUrl,
} from '../../src/content/invocation.ts';
import { projectResourceTree } from '../../src/content/resource-projection.ts';
import type { FsEntryRow } from '@patchpit/fs';

void test('folder launch and viewer labels do not cross source boundaries', () => {
  const folderA = entry('source-a', 'app', null, 'folder', 'app-a');
  const indexB = entry('source-b', 'index', 'app', 'file', 'index.html');
  const fileA = entry('source-a', 'readme', 'app', 'file', 'readme.md');
  const folderB = entry('source-b', 'app', null, 'folder', 'app-b');

  assert.equal(contentUrlForResource(folderA, projectResourceTree([folderA, indexB])), undefined);
  const resources = projectResourceTree([folderA, folderB, fileA]);
  assert.equal(contentUrlForResource(fileA, resources), viewerContentUrl('source-a', 'readme'));
  assert.equal(
    contentLabel(resources, viewerContentUrl('source-a', 'readme')),
    'app-a / readme.md',
  );
});

const entry = (
  sourceId: string,
  entryId: string,
  parentId: string | null,
  kind: FsEntryRow['kind'],
  name: string,
): FsEntryRow => ({
  sourceId,
  entryId,
  parentId,
  kind,
  name,
  order: 0,
  resourceRef: `${sourceId}:${entryId}`,
});
