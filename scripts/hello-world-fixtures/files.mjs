import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { assetPathFor } from './paths.mjs';

export async function distFiles(root, dir = root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory()
      ? distFiles(root, path)
      : [{
          bytes: await readFile(path),
          contentType: contentType(path),
          path: relative(root, path).split('\\').join('/'),
        }];
  }));
  return nested.flat().toSorted((left, right) => left.path.localeCompare(right.path));
}

export async function urlBackedFixtureFiles(fixtures) {
  return Promise.all(fixtures.map(async (fixture) => {
    const [bytes, metadata] = await Promise.all([
      readFile(fixture.fixturePath),
      fixtureMetadata(fixture.metadataPath),
    ]);
    if (metadata.url !== fixture.url) {
      throw new Error(`URL-backed fixture metadata URL does not match packaged URL: ${fixture.metadataPath}`);
    }
    return {
      assetPath: assetPathFor(metadata.url, extname(fixture.fixturePath)),
      bytes,
      contentType: metadata.contentType,
      path: fixture.path,
      url: metadata.url,
    };
  }));
}

async function fixtureMetadata(path) {
  const metadata = JSON.parse(await readFile(path, 'utf8'));
  if (!isFixtureMetadata(metadata)) {
    throw new Error(`URL-backed fixture metadata is missing content type or URL: ${path}`);
  }
  return metadata;
}

function isFixtureMetadata(value) {
  return typeof value === 'object'
    && value !== null
    && 'contentType' in value
    && typeof value.contentType === 'string'
    && value.contentType.length > 0
    && 'url' in value
    && typeof value.url === 'string'
    && value.url.length > 0;
}

function contentType(path) {
  const type = ({
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.map': 'application/json',
    '.svg': 'image/svg+xml',
  })[extname(path)];
  if (type === undefined) throw new Error(`Cannot package hello-world dist file without content type metadata: ${path}`);
  return type;
}
