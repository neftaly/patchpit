import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filePickerSelectionRange,
  isDefaultFilePickerFolderOpen,
  listVisibleFilePickerUrls,
} from './file-picker-model.ts';
import {
  selectFilePickerUrl,
  toggleFilePickerFolder,
} from './file-picker-state.ts';

void test('defaults only the root folder open', () => {
  assert.equal(isDefaultFilePickerFolderOpen('root', 'root'), true);
  assert.equal(isDefaultFilePickerFolderOpen('root', 'child'), false);
});

void test('toggles folders against the root-only default', () => {
  const handle = filePickerStateHandle({
    openFolders: {},
    rootUrl: 'root',
    selectedUrls: [],
  });

  toggleFilePickerFolder(handle, 'root');
  assert.deepEqual(handle.doc().openFolders, { root: false });

  toggleFilePickerFolder(handle, 'child');
  assert.deepEqual(handle.doc().openFolders, { child: true, root: false });
});

void test('derives visible urls from folder open state', () => {
  assert.deepEqual(
    listVisibleFilePickerUrls(filesystemTree, {}, 'root'),
    ['root', 'src', 'readme'],
  );

  assert.deepEqual(
    listVisibleFilePickerUrls(filesystemTree, { src: true }, 'root'),
    ['root', 'src', 'src/index', 'readme'],
  );

  assert.deepEqual(
    listVisibleFilePickerUrls(filesystemTree, { root: false, src: true }, 'root'),
    ['root'],
  );
});

void test('derives shift selection from the visible url order', () => {
  const visibleUrls = ['root', 'src', 'src/index', 'readme'];

  assert.deepEqual(
    filePickerSelectionRange('src', 'readme', visibleUrls),
    ['src', 'src/index', 'readme'],
  );
  assert.deepEqual(
    filePickerSelectionRange('readme', 'src', visibleUrls),
    ['src', 'src/index', 'readme'],
  );
  assert.deepEqual(filePickerSelectionRange(undefined, 'readme', visibleUrls), ['readme']);
  assert.deepEqual(filePickerSelectionRange('missing', 'readme', visibleUrls), ['readme']);
});

void test('commits precomputed selected urls without storing intent options', () => {
  const handle = filePickerStateHandle({
    activeUrl: 'root',
    openFolders: {},
    rootUrl: 'root',
    selectedUrls: ['root'],
  });

  selectFilePickerUrl(handle, 'src/index', { selectedUrls: ['src', 'src/index'] });

  assert.equal(handle.doc().activeUrl, 'src/index');
  assert.deepEqual(handle.doc().selectedUrls, ['src', 'src/index']);
  assert.equal('range' in handle.doc(), false);
  assert.equal('toggle' in handle.doc(), false);
});

const filesystemTree = {
  entries: [
    {
      entries: [
        {
          kind: 'file',
          mediaType: 'text/plain',
          name: 'index.ts',
          sourceUrl: null,
          text: '',
          url: 'src/index',
        },
      ],
      kind: 'folder',
      name: 'src',
      text: '',
      url: 'src',
    },
    {
      kind: 'file',
      mediaType: 'text/markdown',
      name: 'README.md',
      sourceUrl: null,
      text: '',
      url: 'readme',
    },
  ],
  kind: 'folder',
  name: '/',
  text: '',
  url: 'root',
};

function filePickerStateHandle(state) {
  return {
    change(update) {
      update(state);
    },
    doc() {
      return state;
    },
  };
}
