import {
  isValidAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type Repo,
} from '@automerge/automerge-repo';
import {
  createAutomergeBinaryFileDocument,
  createAutomergeFolderDocument,
  createAutomergeTextFileDocument,
  openAutomergeFolderDatabase,
  type AutomergeFolderDocument,
} from '@patchpit/automerge-fs';
import {
  openFolderLinksQuery,
  type FolderLink,
  type FolderLinkRow,
} from '@patchpit/fs';
import { appContentUrl } from '../content/invocation.ts';
import { paneIdsInLayoutOrder } from '../workspace/durable-state.ts';
import { openWorkspacePresence } from '../workspace/presence-runtime.ts';
import {
  createWorkspaceDocument,
  openWorkspaceRuntime,
  type WorkspaceDocument,
} from '../workspace/runtime.ts';
import {
  createAutomergeRootDocument,
  readRootDeclaration,
} from './document.ts';
import { openRootResourceRuntime } from './resource-runtime.ts';

const WORKSPACE_LINK_ID = 'workspace';

export class RootRuntimeOpenError extends Error {
  readonly reason: 'incomplete' | 'invalid' | 'unsupported';

  constructor(reason: RootRuntimeOpenError['reason'], cause?: unknown) {
    super(`Patchpit root is ${reason}`, cause === undefined ? {} : { cause });
    this.name = 'RootRuntimeOpenError';
    this.reason = reason;
  }
}

export type RootSeedFile = {
  readonly linkId: string;
  readonly name: string;
  readonly order: number;
} & ({
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly text?: never;
  readonly contentType?: string;
  readonly documentName?: string;
  readonly resourceUrl?: never;
} | {
  readonly bytes?: never;
  readonly text: string;
  readonly contentType?: string;
  readonly documentName?: string;
  readonly resourceUrl?: never;
} | {
  readonly bytes?: never;
  readonly text?: never;
  readonly contentType?: never;
  readonly documentName?: never;
  readonly resourceUrl: `https:${string}`;
});

export type RootSeedFolder = {
  readonly folderId: string;
  readonly files: readonly RootSeedFile[];
  readonly name: string;
  readonly order: number;
};

type RootOptions = {
  readonly repo: Repo;
  readonly displayIdentityId?: string;
  readonly folders: readonly RootSeedFolder[];
  readonly initialContext: string;
  readonly documentContextFolderId?: string;
  readonly onDocumentCreated?: (sourceId: AutomergeUrl) => void;
};

export const createRoot = async (options: RootOptions) => {
  const createDocument = <Document extends object>(document: Document) => {
    const handle = options.repo.create(document);
    options.onDocumentCreated?.(handle.url);
    return handle;
  };
  const folderHandles = options.folders.map((folder) => createDocument(createAutomergeFolderDocument(
    folder.name,
    folder.files.map((file): FolderLink => ({
      linkId: file.linkId,
      name: file.name,
      order: file.order,
      resourceRef: file.resourceUrl
        ?? createDocument(file.text === undefined
          ? createAutomergeBinaryFileDocument(file.bytes, fileMetadata(file))
          : createAutomergeTextFileDocument(file.text, fileMetadata(file))).url,
      typeHint: 'file',
    })),
  )));
  const documentContext = options.documentContextFolderId === undefined
    ? undefined
    : folderHandles[options.folders.findIndex(({ folderId }) =>
      folderId === options.documentContextFolderId)]?.url;
  if (options.documentContextFolderId !== undefined && documentContext === undefined) {
    throw new Error('Initial document context folder is unavailable');
  }
  const workspace = createDocument(createWorkspaceDocument(
    options.initialContext,
    documentContext === undefined ? undefined : appContentUrl(documentContext),
  ));
  const rootHandle = createDocument(createAutomergeRootDocument('patchpit', [
    folderLink(WORKSPACE_LINK_ID, 'workspace.am', 0, 'file', workspace.url),
    ...options.folders.map((folder, index) => folderLink(
      folder.folderId,
      folder.name,
      folder.order,
      'folder',
      folderHandles[index]?.url ?? unreachableFolder(folder.folderId),
    )),
  ]));
  return openRootHandle(options.repo, rootHandle, undefined, options.displayIdentityId);
};

const fileMetadata = (file: RootSeedFile) => ({
  name: file.documentName ?? file.name,
  ...(file.contentType === undefined ? {} : { mimeType: file.contentType }),
});

export const openRoot = async (options: {
  readonly repo: Repo;
  readonly rootUrl: string;
  readonly displayIdentityId?: string;
  readonly signal?: AbortSignal;
}) => {
  if (!isValidAutomergeUrl(options.rootUrl)) throw new Error('Invalid Patchpit root URL');
  return openRootHandle(
    options.repo,
    await options.repo.find<AutomergeFolderDocument>(
      options.rootUrl as AutomergeUrl,
      findOptions(options.signal),
    ),
    options.signal,
    options.displayIdentityId,
  );
};

const openRootHandle = async (
  repo: Repo,
  rootHandle: DocHandle<AutomergeFolderDocument>,
  signal?: AbortSignal,
  displayIdentityId: string = crypto.randomUUID(),
) => {
  const rootOpened = await openAutomergeFolderDatabase(asObjectHandle(rootHandle));
  if (!rootOpened.success) {
    throw new RootRuntimeOpenError('invalid', rootOpened.issues);
  }
  const filesystem = rootOpened.value;
  const declaredRoot = readRootDeclaration(rootHandle.doc());
  if (declaredRoot.state === 'invalid' || declaredRoot.state === 'unsupported') {
    filesystem.close();
    throw new RootRuntimeOpenError(declaredRoot.state);
  }
  const rootDeclaration = declaredRoot.state === 'ready' ? declaredRoot.value : undefined;
  let workspaceHandle: DocHandle<WorkspaceDocument>;
  try {
    const workspaceLink = await readWorkspaceLink(filesystem, rootHandle.url);
    if (!isValidAutomergeUrl(workspaceLink.resourceRef)) {
      throw new Error('Patchpit workspace document reference is invalid');
    }
    workspaceHandle = await repo.find<WorkspaceDocument>(workspaceLink.resourceRef, findOptions(signal));
  } catch (error) {
    filesystem.close();
    throw error instanceof RootRuntimeOpenError
      ? error
      : new RootRuntimeOpenError('incomplete', error);
  }
  const resourceRuntime = await openRootResourceRuntime({
    displayIdentityId,
    filesystem,
    protectedLinkId: WORKSPACE_LINK_ID,
    repo,
    rootHandle,
    workspaceHandle: asObjectHandle(workspaceHandle),
  });
  const workspaceRuntime = await openWorkspaceRuntime(workspaceHandle).catch((error: unknown) => {
    resourceRuntime.close();
    throw new RootRuntimeOpenError('invalid', error);
  });
  const initialWorkspace = workspaceRuntime.getSnapshot();
  if (initialWorkspace.state !== 'ready') {
    workspaceRuntime.close();
    resourceRuntime.close();
    throw new RootRuntimeOpenError('incomplete');
  }
  const initialPaneIds = paneIdsInLayoutOrder(initialWorkspace.workspace);
  const initialContextPane = initialWorkspace.workspace.nodes[initialPaneIds.at(-1) ?? ''];
  const workspacePresence = await openWorkspacePresence({
    sourceId: `${rootHandle.url}:presence:${crypto.randomUUID()}`,
    workspace: initialWorkspace.workspace,
    recentContextIds: initialContextPane?.kind === 'pane'
      ? initialContextPane.contexts.slice(0, 1)
      : [],
  }).catch((error: unknown) => {
    workspaceRuntime.close();
    resourceRuntime.close();
    throw error;
  });
  let closed = false;
  return {
    rootUrl: rootHandle.url,
    rootDeclaration,
    ...resourceRuntime,
    workspaceRuntime,
    workspacePresence,
    close: () => {
      if (closed) return;
      closed = true;
      workspaceRuntime.close();
      workspacePresence.close();
      resourceRuntime.close();
    },
  };
};

const readWorkspaceLink = async (
  filesystem: Parameters<typeof openFolderLinksQuery>[0][number],
  rootSourceId: string,
) => {
  const query = await openFolderLinksQuery([filesystem]);
  try {
    const result = await query.whenSettled();
    if (result.readiness !== 'ready' || result.completeness !== 'exact') {
      throw new Error('Patchpit root links are unavailable', { cause: result.issues });
    }
    return requireWorkspaceLink(result.rows, rootSourceId);
  } finally {
    query.close();
  }
};

const requireWorkspaceLink = (links: readonly FolderLinkRow[], rootSourceId: string) => {
  const workspace = links.find(({ linkId, sourceId }) =>
    linkId === WORKSPACE_LINK_ID && sourceId === rootSourceId);
  if (workspace?.typeHint === 'folder' || workspace === undefined) {
    throw new Error('Patchpit root links are missing');
  }
  return workspace;
};

const folderLink = (
  linkId: string,
  name: string,
  order: number,
  typeHint: string,
  resourceRef: string,
): FolderLink => ({ linkId, name, order, resourceRef, typeHint });

const unreachableFolder = (folderId: string): never => {
  throw new Error(`Created folder is unavailable: ${folderId}`);
};

const asObjectHandle = <Document extends object>(handle: DocHandle<Document>) =>
  handle as unknown as DocHandle<object>;

const findOptions = (signal: AbortSignal | undefined) =>
  signal === undefined ? {} : { signal };

export type PatchpitRuntime = Awaited<ReturnType<typeof createRoot>>;
