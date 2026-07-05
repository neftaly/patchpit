import type { DocHandle, Repo } from '@automerge/automerge-repo';
import {
  defineSchema,
  opaqueField,
  optional,
  relation,
  stringField,
  write,
  type JsonValue,
} from '@tarstate/core';
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
  automergeMimeType,
  isAutomergeFileName,
  PatchpitType,
  type FileDoc,
  type FilesystemIndexDoc,
  type FilesystemIndexRow,
  type FilesystemResource,
  type FolderDoc,
  type FolderEntry,
} from '@patchpit/system';

export type PatchpitFsOptions = {
  readonly documentHandles: Record<string, DocHandle<FilesystemResource>>;
  readonly indexHandle: DocHandle<FilesystemIndexDoc>;
  readonly repo: Repo;
  readonly rootUrl: string;
};

type FileRow = {
  content: string;
  extension: string;
  id: string;
  mimeType: string;
  name: string;
};

type FolderRow = {
  docs: FolderEntry[];
  id: string;
};

type WritableIndexRow = FilesystemIndexRow & { id: string };
type WriteFileOption = Parameters<IFileSystem['writeFile']>[2];
type EncodingOption = BufferEncoding | { encoding?: BufferEncoding | null };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const fsSchema = defineSchema({
  file: relation<FileRow>({
    key: 'id',
    fields: {
      content: stringField(),
      extension: stringField(),
      id: stringField(),
      mimeType: stringField(),
      name: stringField(),
    },
  }),
  folder: relation<FolderRow>({
    key: 'id',
    fields: {
      docs: opaqueField<FolderEntry[]>(),
      id: stringField(),
    },
  }),
  index: relation<WritableIndexRow>({
    key: 'id',
    fields: {
      content: optional(stringField()),
      entries: optional(opaqueField<JsonValue>()),
      id: stringField(),
      mimeType: optional(stringField()),
      title: optional(stringField()),
      type: stringField(),
      url: stringField(),
    },
  }),
});

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
    this.#setEntry(parent.handle, entry(name, PatchpitType.File, handle.url));
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
    return [...this.#folder(path).doc().docs].map((item) => item.name).sort();
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

    const parent = this.#parentFolder(path, false);
    this.#updateFolder(parent.handle, parent.handle.doc().docs.filter((item) => item.name !== basename(path)));
    this.#dropIndex(found.entry.url);
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
        entry: entry('/', PatchpitType.Folder, this.#rootUrl),
        handle: this.#rootFolder(),
        kind: PatchpitType.Folder,
      };
    }

    let folder = this.#rootFolder();
    const parts = segments(normalized);
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const entry = folder.doc().docs.find((item) => item.name === name);
      if (entry === undefined) return undefined;
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
    this.#setEntry(parent.handle, entry(name, PatchpitType.Folder, handle.url));
  }

  #setEntry(handle: DocHandle<FolderDoc>, next: FolderEntry): void {
    this.#updateFolder(handle, [
      ...handle.doc().docs.filter((item) => item.name !== next.name),
      next,
    ]);
  }

  #updateFolder(handle: DocHandle<FolderDoc>, docs: FolderEntry[]): void {
    const changes = write(fsSchema.folder)
      .updateByKey(handle.url, { docs, id: handle.url })
      .changes as FolderRow;
    handle.change((doc) => {
      doc.docs = [...changes.docs];
    });
    this.#upsertIndex(handle.url, folderRow(handle.url, handle.doc()));
  }

  #updateFile(handle: DocHandle<FileDoc>, content: string): void {
    const current = handle.doc();
    const changes = write(fsSchema.file)
      .updateByKey(handle.url, {
        content,
        extension: current.extension,
        id: handle.url,
        mimeType: current.mimeType,
        name: current.name,
      })
      .changes as FileRow;
    handle.change((doc) => {
      doc.content = changes.content;
      doc.extension = changes.extension;
      doc.mimeType = changes.mimeType;
      doc.name = changes.name;
    });
    this.#upsertIndex(handle.url, fileRow(handle.url, handle.doc()));
  }

  #createFile(name: string, content: string): DocHandle<FileDoc> {
    const handle = this.#repo.create<FileDoc>({
      '@patchpit': { type: PatchpitType.File },
      content,
      extension: extensionFromName(name),
      mimeType: mimeTypeFromName(name),
      name,
    });
    this.#documentHandles[handle.url] = handle as DocHandle<FilesystemResource>;
    this.#upsertIndex(handle.url, fileRow(handle.url, handle.doc()));
    return handle;
  }

  #createFolder(name: string): DocHandle<FolderDoc> {
    const handle = this.#repo.create<FolderDoc>({
      '@patchpit': { type: PatchpitType.Folder },
      docs: [],
      name,
      title: name,
    });
    this.#documentHandles[handle.url] = handle as DocHandle<FilesystemResource>;
    this.#upsertIndex(handle.url, folderRow(handle.url, handle.doc()));
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

  #upsertIndex(url: string, row: FilesystemIndexRow): void {
    const changes = write(fsSchema.index)
      .updateByKey(url, { ...row, id: url })
      .changes as WritableIndexRow;
    this.#indexHandle.change((doc) => {
      const index = doc.filesystemIndex.documents.findIndex((item) => item.url === url);
      const next = indexRow(changes);
      if (index === -1) doc.filesystemIndex.documents.push(next);
      else doc.filesystemIndex.documents[index] = next;
    });
  }

  #dropIndex(url: string): void {
    this.#indexHandle.change((doc) => {
      doc.filesystemIndex.documents = doc.filesystemIndex.documents.filter((row) => row.url !== url);
    });
    delete this.#documentHandles[url];
  }

  #paths(path: string, folder: DocHandle<FolderDoc>): string[] {
    return [
      path,
      ...folder.doc().docs.flatMap((item) => {
        const childPath = join(path, item.name);
        if (item.type !== PatchpitType.Folder) return [childPath];
        return this.#paths(childPath, this.#folderHandle(item.url));
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

function entry(name: string, type: PatchpitType | string, url: string): FolderEntry {
  return { name, type, url };
}

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

function fileRow(url: string, doc: FileDoc): FilesystemIndexRow {
  return {
    content: doc.content,
    mimeType: doc.mimeType,
    type: doc['@patchpit'].type,
    url,
  };
}

function folderRow(url: string, doc: FolderDoc): FilesystemIndexRow {
  return {
    content: JSON.stringify(doc, null, 2),
    entries: doc.docs,
    title: doc.title,
    type: doc['@patchpit'].type,
    url,
  };
}

function indexRow(row: WritableIndexRow): FilesystemIndexRow {
  return {
    ...(row.content === undefined ? {} : { content: row.content }),
    ...(row.entries === undefined ? {} : { entries: row.entries }),
    ...(row.mimeType === undefined ? {} : { mimeType: row.mimeType }),
    ...(row.title === undefined ? {} : { title: row.title }),
    type: row.type,
    url: row.url,
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

function extensionFromName(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1);
}

function mimeTypeFromName(name: string): string {
  if (isAutomergeFileName(name)) return automergeMimeType;
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function fsError(code: string, message: string): Error & { code: string } {
  const error = new Error(`${code}: ${message}`) as Error & { code: string };
  error.code = code;
  return error;
}
