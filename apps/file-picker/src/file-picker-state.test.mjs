import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDefaultFilePickerFolderOpen,
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
