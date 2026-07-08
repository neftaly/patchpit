import { Repo } from '@automerge/automerge-repo';
import { folderAssetPath } from './config.mjs';
import { assetPathFor, repoDocumentId, sameBytes, samePath } from './paths.mjs';

export async function automergeFixtureAssets(files, urlFiles, readExistingBytes) {
  const repo = new Repo({ network: [] });
  const existingFolderBytes = await readExistingBytes(folderAssetPath);
  const srcByPath = existingFolderBytes === undefined
    ? new Map()
    : srcByPathFromTree(repo.import(existingFolderBytes).doc().tree);
  const contentDocs = await Promise.all(files.map((file) =>
    contentDocAsset(repo, file, srcByPath.get(file.path), readExistingBytes)));
  const tree = fsTreeFromFiles([
    ...contentDocs.map((file) => ({ path: file.path, src: file.src })),
    ...urlFiles.map((file) => ({ path: file.path, src: file.url })),
  ]);
  const folderBytes = existingFolderBytes !== undefined && sameFolderDoc(existingFolderBytes, tree)
    ? existingFolderBytes
    : await exportedAutomergeDoc(repo, repo.create({ kind: 'patchpit.fs-folder@1', tree }), 'folder doc');
  return {
    contentDocs,
    folder: { bytes: folderBytes, tree },
  };
}

export const sameFolderDoc = (binary, tree) =>
  sameTree(new Repo({ network: [] }).import(binary).doc().tree, tree);

export function sameContentDoc(binary, file) {
  const repo = new Repo({ network: [] });
  const doc = repo.import(binary, { docId: repoDocumentId(file.src) }).doc();
  return sameContent(doc, file);
}

async function contentDocAsset(repo, file, src, readExistingBytes) {
  const existingBytes = src === undefined ? undefined : await readExistingBytes(assetPathFor(src, '.automerge'));
  if (existingBytes !== undefined) {
    const handle = repo.import(existingBytes, { docId: repoDocumentId(src) });
    if (sameContent(handle.doc(), file)) return contentDocAssetResult(file, handle.url, existingBytes);
    handle.change((doc) => Object.assign(doc, contentDoc(file)));
    return contentDocAssetResult(file, handle.url, await exportedAutomergeDoc(repo, handle, file.path));
  }

  const handle = repo.create(contentDoc(file));
  return contentDocAssetResult(file, handle.url, await exportedAutomergeDoc(repo, handle, file.path));
}

function contentDocAssetResult(file, src, bytes) {
  return {
    assetPath: assetPathFor(src, '.automerge'),
    bytes,
    contentType: file.contentType,
    fileBytes: file.bytes,
    path: file.path,
    src,
  };
}

async function exportedAutomergeDoc(repo, handle, label) {
  const bytes = await repo.export(handle.url);
  if (bytes === undefined) throw new Error(`Failed to export Automerge ${label}.`);
  return bytes;
}

const contentDoc = (file) => ({
  bytes: new Uint8Array(file.bytes),
  contentType: file.contentType,
  kind: 'patchpit.file-content@1',
});

function sameContent(doc, file) {
  return doc.kind === 'patchpit.file-content@1'
    && doc.contentType === file.contentType
    && doc.bytes instanceof Uint8Array
    && sameBytes(doc.bytes, file.fileBytes ?? file.bytes);
}

function fsTreeFromFiles(files) {
  return { kind: 'dir', entries: treeEntries(files.map((file) => ({ ...file, pathSegments: file.path.split('/') })), []) };
}

function treeEntries(files, prefix) {
  return uniqueNames(files, prefix).map((name) => {
    const path = [...prefix, name];
    const exactFile = files.find((file) => samePath(file.pathSegments, path));
    return [
      name,
      exactFile === undefined
        ? { kind: 'dir', entries: treeEntries(files, path) }
        : { kind: 'file', src: exactFile.src },
    ];
  });
}

function uniqueNames(files, prefix) {
  return [...new Set(files
    .map((file) => file.pathSegments)
    .filter((path) => path.length > prefix.length && samePath(path.slice(0, prefix.length), prefix))
    .map((path) => path[prefix.length])
    .filter((name) => name !== undefined))]
    .sort((left, right) => left.localeCompare(right));
}

function srcByPathFromTree(tree, path = []) {
  if (tree.kind === 'file') return new Map([[path.join('/'), tree.src]]);
  return new Map(tree.entries.flatMap(([name, child]) =>
    [...srcByPathFromTree(child, [...path, name])]));
}

function sameTree(left, right) {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'file') return left.src === right.src;
  return left.entries.length === right.entries.length
    && left.entries.every(([name, child], index) => {
      const rightEntry = right.entries[index];
      return rightEntry !== undefined && name === rightEntry[0] && sameTree(child, rightEntry[1]);
    });
}
