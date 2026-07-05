import type { DocHandle, Repo } from '@automerge/automerge-repo';
import type {
  BufferEncoding,
  CpOptions,
  FileContent,
  FsStat,
  IFileSystem,
  MkdirOptions,
  RmOptions,
} from 'just-bash/browser';
import {
  cloneFolderEntries,
  cloneFolderEntry,
  createPatchpitFileDoc,
  createPatchpitFolderDoc,
  filesystemIndexRowForResource,
  folderEntry,
  PatchpitType,
  removeFilesystemIndexRows,
  replaceFolderEntries,
  upsertFilesystemIndexRow,
  type FileDoc,
  type FilesystemIndexDoc,
  type FilesystemIndexRow,
  type FilesystemResource,
  type FolderDoc,
  type FolderEntry,
} from '@patchpit/system';
import type { PatchpitFilesystem } from './terminal-filesystem';

export type PatchpitFsOptions = {
  readonly documentHandles: Record<string, DocHandle<FilesystemResource>>;
  readonly indexHandle: DocHandle<FilesystemIndexDoc>;
  readonly repo: Repo;
  readonly rootUrl: string;
};

let nextPatchpitFilesystemId = 1;

export function createPatchpitFilesystem(options: PatchpitFsOptions): PatchpitFilesystem {
  const cacheKey = `patchpit-filesystem:${nextPatchpitFilesystemId++}:${options.rootUrl}`;
  return {
    cacheKey,
    rootUrl: options.rootUrl,
    openRoot: (rootUrl) => new PatchpitFs({ ...options, rootUrl }),
  };
}

type WriteFileOption = Parameters<IFileSystem['writeFile']>[2];
type EncodingOption = BufferEncoding | { encoding?: BufferEncoding | null };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class PatchpitFs implements IFileSystem {
  readonly #documentHandles: Record<string, DocHandle<FilesystemResource>>;
  readonly #indexHandle: DocHandle<FilesystemIndexDoc>;
  readonly #repo: Repo;
  readonly #rootUrl: string;

  constructor(options: PatchpitFsOptions) {
    this.#documentHandles = options.documentHandles;
    this.#indexHandle = options.indexHandle;
    this.#repo = options.repo;
    this.#rootUrl = options.rootUrl;
  }

  async readFile(path: string): Promise<string> {
    const file = this.#file(path);
    return file.handle === undefined ? `${file.entry.url}\n` : file.handle.doc().content;
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    return textEncoder.encode(await this.readFile(path));
  }

  async writeFile(
    path: string,
    content: FileContent,
    options?: WriteFileOption,
  ): Promise<void> {
    const text = contentText(content, options);
    const found = this.#lookup(path);
    if (found?.kind === PatchpitType.Folder) throw fsError('EISDIR', `illegal operation on a directory, write '${path}'`);
    if (found?.handle !== undefined) {
      this.#updateFile(found.handle, text);
      return;
    }

    const parent = this.#parentFolder(path, false);
    const name = basename(path);
    const handle = this.#createFile(name, text);
    this.#setEntry(parent.handle, folderEntry(name, PatchpitType.File, handle.url));
  }

  async appendFile(
    path: string,
    content: FileContent,
    options?: WriteFileOption,
  ): Promise<void> {
    const previous = await this.exists(path) ? await this.readFile(path) : '';
    await this.writeFile(path, `${previous}${contentText(content, options)}`);
  }

  async exists(path: string): Promise<boolean> {
    return this.#lookup(path) !== undefined;
  }

  async stat(path: string): Promise<FsStat> {
    const found = this.#lookup(path);
    if (found === undefined) throw fsError('ENOENT', `no such file or directory, stat '${path}'`);
    if (found.kind === PatchpitType.Folder) return stat(true, 0);
    return stat(false, textEncoder.encode(await this.readFile(path)).byteLength);
  }

  async lstat(path: string): Promise<FsStat> {
    return this.stat(path);
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    this.#mkdir(path, options?.recursive ?? false);
  }

  async readdir(path: string): Promise<string[]> {
    return [...this.#folder(path).doc().docs].map((folderEntry) => folderEntry.name).sort();
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    const found = this.#lookup(path);
    if (found === undefined) {
      if (options?.force) return;
      throw fsError('ENOENT', `no such file or directory, rm '${path}'`);
    }
    if (normalize(path) === '/') throw fsError('EBUSY', `cannot remove mount root '${path}'`);
    if (found.kind === PatchpitType.Folder && found.handle.doc().docs.length > 0 && !options?.recursive) {
      throw fsError('ENOTEMPTY', `directory not empty, rm '${path}'`);
    }

    const removedUrls = this.#subtreeUrls(found);
    const parent = this.#parentFolder(path, false);
    this.#updateFolder(
      parent.handle,
      cloneFolderEntries(parent.handle.doc().docs).filter((folderEntry) => folderEntry.name !== basename(path)),
    );
    this.#dropIndexes(removedUrls);
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const found = this.#lookup(src);
    if (found === undefined) throw fsError('ENOENT', `no such file or directory, cp '${src}'`);
    if (found.kind !== PatchpitType.Folder) {
      await this.writeFile(dest, await this.readFileBuffer(src));
      return;
    }
    if (!options?.recursive) throw fsError('EISDIR', `is a directory, cp '${src}'`);
    await this.mkdir(dest, { recursive: true });
    await Promise.all(found.handle.doc().docs.map((child) => (
      this.cp(join(src, child.name), join(dest, child.name), options)
    )));
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.cp(src, dest, { recursive: true });
    await this.rm(src, { recursive: true });
  }

  resolvePath(base: string, path: string): string {
    return path.startsWith('/') ? normalize(path) : normalize(join(base, path));
  }

  getAllPaths(): string[] {
    return this.#paths('/', this.#rootFolder()).sort();
  }

  async chmod(path: string): Promise<void> {
    if (!await this.exists(path)) throw fsError('ENOENT', `no such file or directory, chmod '${path}'`);
  }

  async symlink(): Promise<void> {
    throw fsError('EPERM', 'symbolic links are not supported by this filesystem');
  }

  async link(): Promise<void> {
    throw fsError('EPERM', 'hard links are not supported by this filesystem');
  }

  async readlink(path: string): Promise<string> {
    throw fsError('EINVAL', `invalid argument, readlink '${path}'`);
  }

  async realpath(path: string): Promise<string> {
    if (!await this.exists(path)) throw fsError('ENOENT', `no such file or directory, realpath '${path}'`);
    return normalize(path);
  }

  async utimes(path: string): Promise<void> {
    if (!await this.exists(path)) throw fsError('ENOENT', `no such file or directory, utimes '${path}'`);
  }

  #rootFolder(): DocHandle<FolderDoc> {
    return this.#folderHandle(this.#rootUrl);
  }

  #folder(path: string): DocHandle<FolderDoc> {
    const found = this.#lookup(path);
    if (found?.kind !== PatchpitType.Folder) throw fsError('ENOTDIR', `not a directory, scandir '${path}'`);
    return found.handle;
  }

  #file(path: string): Extract<LookupResult, { kind: PatchpitType.File }> {
    const found = this.#lookup(path);
    if (found === undefined) throw fsError('ENOENT', `no such file or directory, open '${path}'`);
    if (found.kind !== PatchpitType.File) throw fsError('EISDIR', `illegal operation on a directory, read '${path}'`);
    return found;
  }

  #lookup(path: string): LookupResult | undefined {
    const normalized = normalize(path);
    if (normalized === '/') {
      return {
        entry: folderEntry('/', PatchpitType.Folder, this.#rootUrl),
        handle: this.#rootFolder(),
        kind: PatchpitType.Folder,
      };
    }

    let folder = this.#rootFolder();
    const parts = segments(normalized);
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const currentEntry = folder.doc().docs.find((folderEntry) => folderEntry.name === name);
      if (currentEntry === undefined) return undefined;
      const entry = cloneFolderEntry(currentEntry);
      const last = index === parts.length - 1;
      if (entry.type === PatchpitType.Folder) {
        const handle = this.#folderHandle(entry.url);
        if (last) return { entry, handle, kind: PatchpitType.Folder };
        folder = handle;
      } else if (last) {
        const handle = this.#fileHandle(entry.url);
        return handle === undefined
          ? { entry, kind: PatchpitType.File }
          : { entry, handle, kind: PatchpitType.File };
      } else {
        return undefined;
      }
    }
    return undefined;
  }

  #parentFolder(path: string, recursive: boolean): { handle: DocHandle<FolderDoc>; path: string } {
    const parent = dirname(path);
    if (recursive) this.#mkdir(parent, true);
    return { handle: this.#folder(parent), path: parent };
  }

  #mkdir(path: string, recursive: boolean): void {
    const normalized = normalize(path);
    if (normalized === '/' || this.#lookup(normalized)?.kind === PatchpitType.Folder) return;
    if (this.#lookup(normalized) !== undefined) throw fsError('ENOTDIR', `not a directory, mkdir '${path}'`);

    const parent = this.#parentFolder(normalized, recursive);
    const name = basename(normalized);
    const handle = this.#createFolder(name);
    this.#setEntry(parent.handle, folderEntry(name, PatchpitType.Folder, handle.url));
  }

  #setEntry(handle: DocHandle<FolderDoc>, nextEntry: FolderEntry): void {
    this.#updateFolder(handle, [
      ...cloneFolderEntries(handle.doc().docs).filter((folderEntry) => folderEntry.name !== nextEntry.name),
      cloneFolderEntry(nextEntry),
    ]);
  }

  #updateFolder(handle: DocHandle<FolderDoc>, entries: readonly FolderEntry[]): void {
    handle.change((doc) => {
      replaceFolderEntries(doc.docs, entries);
    });
    this.#upsertIndex(filesystemIndexRowForResource(handle.url, handle.doc()));
  }

  #updateFile(handle: DocHandle<FileDoc>, content: string): void {
    handle.change((doc) => {
      doc.content = content;
    });
    this.#upsertIndex(filesystemIndexRowForResource(handle.url, handle.doc()));
  }

  #createFile(name: string, content: string): DocHandle<FileDoc> {
    const handle = this.#repo.create<FileDoc>(createPatchpitFileDoc(name, content));
    this.#documentHandles[handle.url] = handle as DocHandle<FilesystemResource>;
    this.#upsertIndex(filesystemIndexRowForResource(handle.url, handle.doc()));
    return handle;
  }

  #createFolder(name: string): DocHandle<FolderDoc> {
    const handle = this.#repo.create<FolderDoc>(createPatchpitFolderDoc(name));
    this.#documentHandles[handle.url] = handle as DocHandle<FilesystemResource>;
    this.#upsertIndex(filesystemIndexRowForResource(handle.url, handle.doc()));
    return handle;
  }

  #fileHandle(url: string): DocHandle<FileDoc> | undefined {
    const handle = this.#documentHandles[url];
    if (handle?.doc()['@patchpit'].type === PatchpitType.File) return handle as DocHandle<FileDoc>;
    return undefined;
  }

  #folderHandle(url: string): DocHandle<FolderDoc> {
    const handle = this.#documentHandles[url];
    if (handle?.doc()['@patchpit'].type === PatchpitType.Folder) return handle as DocHandle<FolderDoc>;
    throw fsError('ENOENT', `missing folder document '${url}'`);
  }

  #upsertIndex(row: FilesystemIndexRow): void {
    this.#indexHandle.change((doc) => {
      upsertFilesystemIndexRow(doc.filesystemIndex.documents, row);
    });
  }

  #dropIndexes(urls: readonly string[]): void {
    this.#indexHandle.change((doc) => {
      removeFilesystemIndexRows(doc.filesystemIndex.documents, urls);
    });
    for (const url of urls) delete this.#documentHandles[url];
  }

  #subtreeUrls(found: LookupResult): string[] {
    const urls = new Set<string>();

    if (found.kind === PatchpitType.Folder) {
      this.#collectFolderSubtreeUrls(found.entry.url, found.handle, urls);
    } else {
      urls.add(found.entry.url);
    }

    return [...urls];
  }

  #collectFolderSubtreeUrls(url: string, handle: DocHandle<FolderDoc>, urls: Set<string>): void {
    if (urls.has(url)) return;
    urls.add(url);

    for (const entry of handle.doc().docs) {
      if (entry.type === PatchpitType.Folder) {
        this.#collectFolderSubtreeUrls(entry.url, this.#folderHandle(entry.url), urls);
      } else {
        urls.add(entry.url);
      }
    }
  }

  #paths(path: string, folder: DocHandle<FolderDoc>): string[] {
    return [
      path,
      ...folder.doc().docs.flatMap((folderEntry) => {
        const childPath = join(path, folderEntry.name);
        if (folderEntry.type !== PatchpitType.Folder) return [childPath];
        return this.#paths(childPath, this.#folderHandle(folderEntry.url));
      }),
    ];
  }
}

type LookupResult =
  | {
      entry: FolderEntry;
      handle: DocHandle<FolderDoc>;
      kind: PatchpitType.Folder;
    }
  | {
      entry: FolderEntry;
      handle?: DocHandle<FileDoc>;
      kind: PatchpitType.File;
    };

function stat(isDirectory: boolean, size: number): FsStat {
  return {
    isDirectory,
    isFile: !isDirectory,
    isSymbolicLink: false,
    mode: isDirectory ? 0o755 : 0o644,
    mtime: new Date(),
    size,
  };
}

function contentText(content: FileContent, options?: WriteFileOption): string {
  if (typeof content === 'string') return content;
  return decoder(options).decode(content);
}

function decoder(options?: EncodingOption): TextDecoder {
  const encoding = typeof options === 'string' ? options : options?.encoding;
  return encoding === 'binary' || encoding === 'latin1'
    ? new TextDecoder('latin1')
    : textDecoder;
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function segments(path: string): string[] {
  return normalize(path).split('/').filter(Boolean);
}

function dirname(path: string): string {
  const parts = segments(path);
  parts.pop();
  return `/${parts.join('/')}`;
}

function basename(path: string): string {
  return segments(path).at(-1) ?? '';
}

function join(parent: string, child: string): string {
  return normalize(parent === '/' ? `/${child}` : `${parent}/${child}`);
}

function fsError(code: string, message: string): Error & { code: string } {
  const error = new Error(`${code}: ${message}`) as Error & { code: string };
  error.code = code;
  return error;
}
