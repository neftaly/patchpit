import { relative, resolve } from 'node:path';
import { assetRoot, generatedRoot } from './config.mjs';

export const assetPathFor = (identifier, extension) =>
  resolve(assetRoot, `${encodeURIComponent(identifier)}${extension}`);

export const importSpecifier = (path) =>
  `./${relative(generatedRoot, path).split('\\').join('/')}?url`;

export const relativePath = (path) =>
  relative(process.cwd(), path);

export const repoDocumentId = (src) =>
  src.slice('automerge:'.length);

export const sameBytes = (left, right) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

export const samePath = (left, right) =>
  left.length === right.length && left.every((segment, index) => segment === right[index]);
