import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appContentUrl,
  contentLabel,
  contentUrlForResource,
  parseContentInvocation,
  viewerContentUrl,
} from '../../src/content/invocation.ts';
import { projectResources } from '../../src/content/resources.ts';
import type { FsEntryRow } from '@patchpit/fs';

void test('viewer invocations preserve source-scoped entry identity', () => {
  const first = viewerContentUrl('source-a', 'workspace');
  const second = viewerContentUrl('source-b', 'workspace');

  assert.notEqual(first, second);
  assert.deepEqual(parseContentInvocation(first), {
    kind: 'viewer',
    sourceId: 'source-a',
    entryId: 'workspace',
  });
  assert.deepEqual(parseContentInvocation(second), {
    kind: 'viewer',
    sourceId: 'source-b',
    entryId: 'workspace',
  });
});

void test('app invocations identify a root and leave entry selection to the index convention', () => {
  const invocation = appContentUrl('sandbox-compat');

  assert.deepEqual(parseContentInvocation(invocation), {
    kind: 'app',
    rootEntryId: 'sandbox-compat',
  });
  assert.equal(invocation.includes('index.html'), false);
});

void test('folder launch and viewer labels do not cross source boundaries', () => {
  const folderA = entry('source-a', 'app', null, 'folder', 'app-a');
  const indexB = entry('source-b', 'index', 'app', 'file', 'index.html');
  const fileA = entry('source-a', 'readme', 'app', 'file', 'readme.md');
  const folderB = entry('source-b', 'app', null, 'folder', 'app-b');

  assert.equal(contentUrlForResource(folderA, projectResources([folderA, indexB])), undefined);
  const resources = projectResources([folderA, folderB, fileA]);
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
