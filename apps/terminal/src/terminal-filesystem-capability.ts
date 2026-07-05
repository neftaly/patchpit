import type {
  CpOptions,
  FileContent,
  FsStat,
  IFileSystem,
  MkdirOptions,
  RmOptions,
} from 'just-bash/browser';
import {
  runtimeError,
  terminalFilesystemCapability,
  terminalFilesystemProtocol,
  type CapabilityPort,
  type TerminalFilesystemCapabilityGrant,
  type TerminalFilesystemOperation,
  type TerminalFilesystemPayload,
  type TerminalFilesystemRequest,
  type TerminalFilesystemResponse,
  type TerminalFilesystemVerb,
} from '@patchpit/system/runtime';
import type { PatchpitFilesystem } from './terminal-filesystem';

export type TerminalFilesystemCapabilityServerOptions = {
  readonly filesystem: PatchpitFilesystem;
  readonly grant: TerminalFilesystemCapabilityGrant;
  readonly port: MessagePort;
};

type PendingRequest = {
  readonly reject: (error: Error) => void;
  readonly resolve: (value: unknown) => void;
  readonly rootUrl: string;
};

type WriteFileOption = Parameters<IFileSystem['writeFile']>[2];
type ReadFileOption = Parameters<IFileSystem['readFile']>[1];

let nextFilesystemRequestId = 1;

export function serveTerminalFilesystemCapability({
  filesystem,
  grant,
  port,
}: TerminalFilesystemCapabilityServerOptions): () => void {
  const onMessage = (event: MessageEvent<unknown>) => {
    void handleTerminalFilesystemRequest(filesystem, grant, port, event.data);
  };

  port.addEventListener('message', onMessage);
  port.start();

  return () => {
    port.removeEventListener('message', onMessage);
    port.close();
  };
}

export function createTerminalFilesystemClient(capability: CapabilityPort): PatchpitFilesystem {
  const grant = terminalFilesystemGrant(capability.grant);
  const connection = new TerminalFilesystemConnection(grant, capability.port);
  return {
    cacheKey: `terminal-filesystem-capability:${grant.capabilityId}`,
    rootUrl: grant.endpoint.rootUrl,
    openRoot: (rootUrl) => new TerminalFilesystemPortFs(connection, rootUrl),
  };
}

async function handleTerminalFilesystemRequest(
  filesystem: PatchpitFilesystem,
  grant: TerminalFilesystemCapabilityGrant,
  port: MessagePort,
  message: unknown,
): Promise<void> {
  if (!isTerminalFilesystemRequest(message) || message.capabilityId !== grant.capabilityId) {
    postFilesystemError(port, responseId(message), 'EPROTO', 'Invalid terminal filesystem capability request.');
    return;
  }

  const verb = terminalFilesystemOperationVerb(message.op);
  if (!grant.verbs.includes(verb)) {
    postFilesystemError(port, message.id, 'EPERM', `${message.op} is outside this terminal filesystem grant.`);
    return;
  }

  const fs = filesystem.openRoot(message.rootUrl);
  try {
    const result = await executeTerminalFilesystemOperation(fs, message.op, message.args);
    port.postMessage({
      protocol: terminalFilesystemProtocol,
      id: message.id,
      ok: true,
      ...(result === undefined ? {} : { result }),
      paths: fs.getAllPaths(),
    } satisfies TerminalFilesystemResponse);
  } catch (error) {
    const filesystemError = errorFromUnknown(error);
    postFilesystemError(port, message.id, filesystemError.code, filesystemError.message);
  }
}

async function executeTerminalFilesystemOperation(
  fs: IFileSystem,
  op: TerminalFilesystemOperation,
  args: readonly TerminalFilesystemPayload[],
): Promise<TerminalFilesystemPayload> {
  if (op === 'appendFile') return fs.appendFile(stringArg(args, 0), fileContentArg(args, 1), args[2] as WriteFileOption);
  if (op === 'chmod') return fs.chmod(stringArg(args, 0), numberArg(args, 1));
  if (op === 'cp') return fs.cp(stringArg(args, 0), stringArg(args, 1), args[2] as CpOptions | undefined);
  if (op === 'exists') return fs.exists(stringArg(args, 0));
  if (op === 'getAllPaths') return fs.getAllPaths();
  if (op === 'link') return fs.link(stringArg(args, 0), stringArg(args, 1));
  if (op === 'lstat') return fs.lstat(stringArg(args, 0));
  if (op === 'mkdir') return fs.mkdir(stringArg(args, 0), args[1] as MkdirOptions | undefined);
  if (op === 'mv') return fs.mv(stringArg(args, 0), stringArg(args, 1));
  if (op === 'readFile') return fs.readFile(stringArg(args, 0), args[1] as ReadFileOption);
  if (op === 'readFileBuffer') return fs.readFileBuffer(stringArg(args, 0));
  if (op === 'readlink') return fs.readlink(stringArg(args, 0));
  if (op === 'readdir') return fs.readdir(stringArg(args, 0));
  if (op === 'realpath') return fs.realpath(stringArg(args, 0));
  if (op === 'resolvePath') return fs.resolvePath(stringArg(args, 0), stringArg(args, 1));
  if (op === 'rm') return fs.rm(stringArg(args, 0), args[1] as RmOptions | undefined);
  if (op === 'stat') return fs.stat(stringArg(args, 0));
  if (op === 'symlink') return fs.symlink(stringArg(args, 0), stringArg(args, 1));
  if (op === 'utimes') return fs.utimes(stringArg(args, 0), dateArg(args, 1), dateArg(args, 2));
  return fs.writeFile(stringArg(args, 0), fileContentArg(args, 1), args[2] as WriteFileOption);
}

class TerminalFilesystemConnection {
  readonly #grant: TerminalFilesystemCapabilityGrant;
  readonly #pathsByRoot = new Map<string, readonly string[]>();
  readonly #pending = new Map<string, PendingRequest>();
  readonly #port: MessagePort;

  constructor(grant: TerminalFilesystemCapabilityGrant, port: MessagePort) {
    this.#grant = grant;
    this.#port = port;
    this.#pathsByRoot.set(grant.endpoint.rootUrl, grant.endpoint.initialPaths);
    this.#port.addEventListener('message', this.#onMessage);
    this.#port.start();
  }

  paths(rootUrl: string): string[] {
    return [...(this.#pathsByRoot.get(rootUrl) ?? [])];
  }

  request<Result = TerminalFilesystemPayload>(
    rootUrl: string,
    op: TerminalFilesystemOperation,
    args: readonly TerminalFilesystemPayload[],
  ): Promise<Result> {
    const id = `terminal-fs:${nextFilesystemRequestId++}`;
    const request: TerminalFilesystemRequest = {
      protocol: terminalFilesystemProtocol,
      id,
      capabilityId: this.#grant.capabilityId,
      rootUrl,
      op,
      args,
    };

    return new Promise((resolve, reject) => {
      this.#pending.set(id, {
        reject,
        resolve: (value) => resolve(value as Result),
        rootUrl,
      });
      this.#port.postMessage(request);
    });
  }

  readonly #onMessage = (event: MessageEvent<unknown>) => {
    const response = event.data;
    if (!isTerminalFilesystemResponse(response)) return;
    const pending = this.#pending.get(response.id);
    if (pending === undefined) return;
    this.#pending.delete(response.id);

    if (response.ok) {
      if (response.paths !== undefined) this.#pathsByRoot.set(pending.rootUrl, response.paths);
      pending.resolve(response.result);
      return;
    }

    pending.reject(filesystemClientError(response.error.message, response.error.code));
  };
}

class TerminalFilesystemPortFs implements IFileSystem {
  readonly #connection: TerminalFilesystemConnection;
  readonly #rootUrl: string;

  constructor(connection: TerminalFilesystemConnection, rootUrl: string) {
    this.#connection = connection;
    this.#rootUrl = rootUrl;
  }

  readFile(path: string, options?: ReadFileOption): Promise<string> {
    return this.#connection.request(this.#rootUrl, 'readFile', [path, options]);
  }

  readFileBuffer(path: string): Promise<Uint8Array> {
    return this.#connection.request(this.#rootUrl, 'readFileBuffer', [path]);
  }

  writeFile(path: string, content: FileContent, options?: WriteFileOption): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'writeFile', [path, content, options]);
  }

  appendFile(path: string, content: FileContent, options?: WriteFileOption): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'appendFile', [path, content, options]);
  }

  exists(path: string): Promise<boolean> {
    return this.#connection.request(this.#rootUrl, 'exists', [path]);
  }

  stat(path: string): Promise<FsStat> {
    return this.#connection.request<FsStat>(this.#rootUrl, 'stat', [path]);
  }

  lstat(path: string): Promise<FsStat> {
    return this.#connection.request<FsStat>(this.#rootUrl, 'lstat', [path]);
  }

  mkdir(path: string, options?: MkdirOptions): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'mkdir', [path, options]);
  }

  readdir(path: string): Promise<string[]> {
    return this.#connection.request(this.#rootUrl, 'readdir', [path]);
  }

  rm(path: string, options?: RmOptions): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'rm', [path, options]);
  }

  cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'cp', [src, dest, options]);
  }

  mv(src: string, dest: string): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'mv', [src, dest]);
  }

  resolvePath(base: string, path: string): string {
    return path.startsWith('/') ? normalize(path) : normalize(join(base, path));
  }

  getAllPaths(): string[] {
    return this.#connection.paths(this.#rootUrl);
  }

  chmod(path: string, mode: number): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'chmod', [path, mode]);
  }

  symlink(target: string, linkPath: string): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'symlink', [target, linkPath]);
  }

  link(existingPath: string, newPath: string): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'link', [existingPath, newPath]);
  }

  readlink(path: string): Promise<string> {
    return this.#connection.request(this.#rootUrl, 'readlink', [path]);
  }

  realpath(path: string): Promise<string> {
    return this.#connection.request(this.#rootUrl, 'realpath', [path]);
  }

  utimes(path: string, atime: Date, mtime: Date): Promise<void> {
    return this.#connection.request<void>(this.#rootUrl, 'utimes', [path, atime, mtime]);
  }
}

function terminalFilesystemGrant(grant: CapabilityPort['grant']): TerminalFilesystemCapabilityGrant {
  if (
    grant.capability === terminalFilesystemCapability
    && grant.endpoint?.protocol === terminalFilesystemProtocol
    && typeof grant.endpoint.rootUrl === 'string'
    && Array.isArray(grant.endpoint.initialPaths)
  ) {
    return grant as TerminalFilesystemCapabilityGrant;
  }

  throw runtimeError(
    'bad_request',
    'Capability grant is not a terminal filesystem grant.',
    `expected ${terminalFilesystemCapability} with ${terminalFilesystemProtocol}`,
  );
}

function terminalFilesystemOperationVerb(op: TerminalFilesystemOperation): TerminalFilesystemVerb {
  if (op === 'readFile' || op === 'readFileBuffer' || op === 'readlink' || op === 'realpath') return 'read';
  if (op === 'exists' || op === 'stat' || op === 'lstat') return 'stat';
  if (op === 'readdir' || op === 'getAllPaths') return 'list';
  if (op === 'resolvePath') return 'mount';
  return 'write';
}

function isTerminalFilesystemRequest(value: unknown): value is TerminalFilesystemRequest {
  return isRecord(value)
    && value.protocol === terminalFilesystemProtocol
    && typeof value.id === 'string'
    && typeof value.capabilityId === 'string'
    && typeof value.rootUrl === 'string'
    && isTerminalFilesystemOperation(value.op)
    && Array.isArray(value.args);
}

function isTerminalFilesystemResponse(value: unknown): value is TerminalFilesystemResponse {
  return isRecord(value)
    && value.protocol === terminalFilesystemProtocol
    && typeof value.id === 'string'
    && typeof value.ok === 'boolean';
}

function isTerminalFilesystemOperation(value: unknown): value is TerminalFilesystemOperation {
  return typeof value === 'string' && terminalFilesystemOperations.includes(value as TerminalFilesystemOperation);
}

const terminalFilesystemOperations: readonly TerminalFilesystemOperation[] = [
  'appendFile',
  'chmod',
  'cp',
  'exists',
  'getAllPaths',
  'link',
  'lstat',
  'mkdir',
  'mv',
  'readFile',
  'readFileBuffer',
  'readlink',
  'readdir',
  'realpath',
  'resolvePath',
  'rm',
  'stat',
  'symlink',
  'utimes',
  'writeFile',
];

function stringArg(args: readonly TerminalFilesystemPayload[], index: number): string {
  const value = args[index];
  if (typeof value === 'string') return value;
  throw filesystemClientError(`Argument ${index} must be a string.`, 'EINVAL');
}

function numberArg(args: readonly TerminalFilesystemPayload[], index: number): number {
  const value = args[index];
  if (typeof value === 'number') return value;
  throw filesystemClientError(`Argument ${index} must be a number.`, 'EINVAL');
}

function dateArg(args: readonly TerminalFilesystemPayload[], index: number): Date {
  const value = args[index];
  if (value instanceof Date) return value;
  throw filesystemClientError(`Argument ${index} must be a Date.`, 'EINVAL');
}

function fileContentArg(args: readonly TerminalFilesystemPayload[], index: number): FileContent {
  const value = args[index];
  if (typeof value === 'string' || value instanceof Uint8Array) return value;
  throw filesystemClientError(`Argument ${index} must be file content.`, 'EINVAL');
}

function responseId(message: unknown): string {
  return isRecord(message) && typeof message.id === 'string' ? message.id : 'unknown';
}

function postFilesystemError(port: MessagePort, id: string, code: string | undefined, message: string): void {
  port.postMessage({
    protocol: terminalFilesystemProtocol,
    id,
    ok: false,
    error: code === undefined ? { message } : { code, message },
  } satisfies TerminalFilesystemResponse);
}

function errorFromUnknown(error: unknown): { readonly code?: string; readonly message: string } {
  if (error instanceof Error) {
    return {
      ...(errorWithCode(error).code === undefined ? {} : { code: errorWithCode(error).code }),
      message: error.message,
    };
  }
  return { message: String(error) };
}

function filesystemClientError(message: string, code?: string): Error & { code?: string } {
  const error = new Error(code === undefined ? message : `${code}: ${message}`) as Error & { code?: string };
  if (code !== undefined) error.code = code;
  return error;
}

function errorWithCode(error: Error): Error & { code?: string } {
  return error as Error & { code?: string };
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

function join(parent: string, child: string): string {
  return normalize(parent === '/' ? `/${child}` : `${parent}/${child}`);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
