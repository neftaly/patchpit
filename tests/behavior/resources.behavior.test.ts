import assert from 'node:assert/strict';
import test from 'node:test';
import type { FsEntryRow } from '@patchpit/fs';
import { projectResources } from '../../src/content/resources.ts';

void test('resource trees preserve duplicate entry IDs from distinct sources', () => {
  const resources = [
    entry('source-a', 'root', null, 'root-a'),
    entry('source-a', 'file', 'root', 'a.txt'),
    entry('source-b', 'root', null, 'root-b'),
    entry('source-b', 'file', 'root', 'b.txt'),
  ];

  assert.deepEqual(projectResources(resources).rows.map(({ depth, resource }) => [
    resource.sourceId,
    resource.entryId,
    depth,
  ]), [
    ['source-a', 'root', 0],
    ['source-a', 'file', 1],
    ['source-b', 'root', 0],
    ['source-b', 'file', 1],
  ]);
});

const entry = (
  sourceId: string,
  entryId: string,
  parentId: string | null,
  name: string,
): FsEntryRow => ({
  sourceId,
  entryId,
  parentId,
  kind: entryId === 'root' ? 'folder' : 'file',
  name,
  order: 0,
  resourceRef: `${sourceId}:${entryId}`,
});
