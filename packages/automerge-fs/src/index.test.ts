import assert from 'node:assert/strict';
import test from 'node:test';
import { automergeFsPackageFromFiles } from './index.ts';

void test('automerge filesystem package keeps bytes separate from folder srcs', () => {
  const htmlBytes = new Uint8Array([60, 104, 49, 62]);
  const packaged = automergeFsPackageFromFiles([
    {
      bytes: htmlBytes,
      contentType: 'text/html',
      path: ['index.html'],
      src: 'automerge:index',
    },
    {
      bytes: new Uint8Array(),
      contentType: 'image/svg+xml',
      path: ['ghostscript-tiger.svg'],
      src: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg',
    },
  ]);

  assert.deepEqual(packaged.folder.tree, {
    entries: [
      ['index.html', { kind: 'file', src: 'automerge:index' }],
      ['ghostscript-tiger.svg', {
        kind: 'file',
        src: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg',
      }],
    ],
    kind: 'dir',
  });
  assert.deepEqual(packaged.files.map(([src]) => src), [
    'automerge:index',
    'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg',
  ]);

  const [firstFile] = packaged.files;
  htmlBytes[0] = 0;
  assert.deepEqual(firstFile?.[1].bytes, new Uint8Array([60, 104, 49, 62]));
});
