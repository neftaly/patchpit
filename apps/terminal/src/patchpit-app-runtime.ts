import type { DocHandle } from '@automerge/automerge-repo';
import { useEffect, useRef, useState } from 'react';
import {
  ContainerMountKind,
  PatchpitType,
  terminalContainer,
  type AppContainer,
  type FilesystemResource,
  type RuntimeStateDoc,
  type SeedFilesystem,
  type TerminalStateDoc,
  type WindowContext,
} from '@patchpit/system';
import {
  runtimeError,
  type CapabilityPort,
  type CapabilityRequest,
  type RuntimeClient,
} from '@patchpit/system/runtime';
import {
  createPatchpitFilesystem,
  createTerminalFilesystemClient,
  serveTerminalFilesystemCapability,
} from './filesystem';
import {
  terminalFilesystemCapability,
  terminalFilesystemProtocol,
  terminalFilesystemVerbs,
  type TerminalFilesystemCapabilityGrant,
  type TerminalFilesystemVerb,
} from './terminal-filesystem-protocol';
import type { PatchpitFilesystem } from './terminal-filesystem';
import {
  createTerminalStateActions,
  replaceTerminalState,
  terminalStateWithMutation,
  type TerminalStateMutation,
  type TerminalStateActions,
  type TerminalStateWriter,
} from './terminal-state';
import type { TerminalRuntimeOptions } from './terminal-bash';

export type TerminalAppRuntimeIssue = {
  readonly details: readonly string[];
  readonly message: string;
  readonly title: string;
};

type TerminalRuntimeLifecycle<ReadyPayload extends object> =
  | { readonly status: 'failed'; readonly failure: TerminalAppRuntimeIssue }
  | { readonly status: 'opening' }
  | ({ readonly status: 'ready' } & ReadyPayload);

export type TerminalAppRuntime = TerminalRuntimeLifecycle<{
  readonly options: TerminalRuntimeOptions;
}>;

export type TerminalAppSession = {
  readonly actions: TerminalStateActions;
  readonly runtime: TerminalAppRuntime;
  readonly state: TerminalStateDoc;
};

type TerminalFilesystemCapabilityState = TerminalRuntimeLifecycle<{
  readonly filesystem: PatchpitFilesystem;
}>;

export function terminalAppInstanceStateHandler(
  createState: () => DocHandle<TerminalStateDoc>,
) {
  return {
    app: 'terminal',
    createContext({ app, rootUrl, stateHandle }: {
      readonly app: string;
      readonly rootUrl: string;
      readonly stateHandle: DocHandle<FilesystemResource>;
    }): WindowContext {
      return {
        app,
        container: terminalContainer(rootUrl),
        id: `${app}:${stateHandle.url}`,
        url: stateHandle.url,
      };
    },
    createState(): DocHandle<FilesystemResource> {
      return createState() as unknown as DocHandle<FilesystemResource>;
    },
    stateType: PatchpitType.TerminalState,
  };
}

export function terminalFilesystemCapabilityProvider(seed: SeedFilesystem) {
  let nextCapabilityId = 1;

  return {
    capability: terminalFilesystemCapability,

    open(request: CapabilityRequest): CapabilityPort {
      const verbs = terminalFilesystemGrantVerbs(request.verbs);
      if (verbs.length === 0) {
        throw runtimeError(
          'bad_request',
          `${terminalFilesystemCapability} request did not include any supported verbs.`,
        );
      }

      const filesystem = createPatchpitFilesystem({
        documentHandles: seed.documentHandles,
        indexHandle: seed.indexHandle,
        repo: seed.repo,
        rootUrl: seed.rootUrl,
      });
      const rootUrls = terminalFilesystemRootUrls(terminalContainer(seed.rootUrl));
      const initialPathsByRoot = verbs.includes('list')
        ? terminalFilesystemInitialPathsByRoot(filesystem, rootUrls)
        : {};
      const grant: TerminalFilesystemCapabilityGrant = {
        capability: terminalFilesystemCapability,
        capabilityId: `terminal-filesystem:${nextCapabilityId++}`,
        endpoint: {
          protocol: terminalFilesystemProtocol,
          rootUrl: seed.rootUrl,
          rootUrls,
          initialPaths: initialPathsByRoot[seed.rootUrl] ?? [],
          initialPathsByRoot,
        },
        verbs,
      };
      const { port1, port2 } = new MessageChannel();
      const closeServer = serveTerminalFilesystemCapability({ filesystem, grant, port: port1 });
      let closed = false;

      return {
        close() {
          if (closed) return;
          closed = true;
          closeServer();
          port2.close();
        },
        grant,
        port: port2,
      };
    },
  };
}

export function terminalAppStateHandles(
  seed: SeedFilesystem,
  runtimeState: RuntimeStateDoc,
): readonly DocHandle<TerminalStateDoc>[] {
  return runtimeState.appInstances.flatMap((entry) => {
    if (entry.app !== 'terminal' || entry.stateType !== PatchpitType.TerminalState) return [];
    const handle = seed.documentHandles[entry.stateUrl];
    return isTerminalStateHandle(handle) ? [handle] : [];
  });
}

export function createTerminalStateHandleWriter(
  handle: DocHandle<TerminalStateDoc>,
): TerminalStateWriter {
  return {
    commit(mutation: TerminalStateMutation) {
      const next = terminalStateWithMutation(handle.doc(), mutation);
      handle.change((doc) => {
        replaceTerminalState(doc, next);
      });
    },
  };
}

export function terminalAppSessions({
  handles,
  runtime,
  states,
}: {
  readonly handles: readonly DocHandle<TerminalStateDoc>[];
  readonly runtime: TerminalAppRuntime;
  readonly states: Readonly<Record<string, TerminalStateDoc>>;
}): Readonly<Record<string, TerminalAppSession>> {
  return Object.fromEntries(handles.map((handle) => [
    handle.url,
    {
      actions: createTerminalStateActions(createTerminalStateHandleWriter(handle)),
      runtime,
      state: states[handle.url] ?? handle.doc(),
    },
  ]));
}

export function terminalAppContextLabel(session: TerminalAppSession | undefined): string | undefined {
  if (session === undefined) return undefined;
  return `${currentDirectoryName(session.state.cwd)} - Terminal`;
}

export function useTerminalAppRuntime(
  runtime: RuntimeClient,
  onIssue: (issue: TerminalAppRuntimeIssue) => void,
  options: { readonly enabled?: boolean } = {},
): TerminalAppRuntime {
  const enabled = options.enabled ?? true;
  const capability = useTerminalFilesystemCapability(runtime, enabled);
  const lastIssueKey = useRef<string | undefined>(undefined);
  const onIssueRef = useRef(onIssue);
  onIssueRef.current = onIssue;

  useEffect(() => {
    if (!enabled || capability.status !== 'failed') {
      lastIssueKey.current = undefined;
      return;
    }

    const issue = capability.failure;
    const issueKey = `${issue.title}:${issue.message}:${issue.details.join('\n')}`;
    if (lastIssueKey.current === issueKey) return;
    lastIssueKey.current = issueKey;
    onIssueRef.current(issue);
  }, [capability, enabled]);

  if (!enabled) return { status: 'opening' };

  if (capability.status === 'ready') {
    return {
      options: { filesystem: capability.filesystem },
      status: 'ready',
    };
  }

  if (capability.status === 'failed') {
    return {
      failure: capability.failure,
      status: 'failed',
    };
  }

  return { status: 'opening' };
}

function useTerminalFilesystemCapability(
  runtime: RuntimeClient,
  enabled: boolean,
): TerminalFilesystemCapabilityState {
  const [capability, setCapability] = useState<TerminalFilesystemCapabilityState>({ status: 'opening' });

  useEffect(() => {
    if (!enabled) {
      setCapability({ status: 'opening' });
      return undefined;
    }

    let closed = false;
    let filesystem: PatchpitFilesystem | undefined;
    let closeCapability: (() => void) | undefined;
    setCapability({ status: 'opening' });

    void runtime.openCapability({ capability: terminalFilesystemCapability })
      .then((capabilityPort) => {
        if (closed) {
          capabilityPort.close();
          return;
        }

        closeCapability = () => capabilityPort.close();
        filesystem = createTerminalFilesystemClient(capabilityPort);
        setCapability({
          filesystem,
          status: 'ready',
        });
      })
      .catch((error: unknown) => {
        if (!closed) {
          setCapability({
            failure: terminalRuntimeIssueFromUnknown(error),
            status: 'failed',
          });
        }
      });

    return () => {
      closed = true;
      filesystem?.close?.();
      if (filesystem === undefined) closeCapability?.();
    };
  }, [enabled, runtime]);

  return capability;
}

function terminalRuntimeIssueFromUnknown(error: unknown): TerminalAppRuntimeIssue {
  return {
    title: 'Terminal filesystem unavailable',
    message: error instanceof Error ? error.message : 'Runtime could not open the terminal filesystem capability.',
    details: detailFromUnknown(error),
  };
}

function detailFromUnknown(value: unknown): readonly string[] {
  if (value === undefined || value instanceof Error) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return [String(value)];
  }
  try {
    const json = JSON.stringify(value);
    return json === undefined ? [] : [json];
  } catch {
    return [Object.prototype.toString.call(value)];
  }
}

function terminalFilesystemRootUrls(container: AppContainer): readonly string[] {
  return [...new Set(container.mounts.flatMap((mount) => (
    mount.kind === ContainerMountKind.Automerge ? [mount.url] : []
  )))].sort();
}

function terminalFilesystemInitialPathsByRoot(
  filesystem: PatchpitFilesystem,
  rootUrls: readonly string[],
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(rootUrls.map((rootUrl) => [
    rootUrl,
    filesystem.openRoot(rootUrl).getAllPaths(),
  ]));
}

function terminalFilesystemGrantVerbs(
  requested: readonly string[] | undefined,
): readonly TerminalFilesystemVerb[] {
  if (requested === undefined) return terminalFilesystemVerbs;
  return terminalFilesystemVerbs.filter((verb) => requested.includes(verb));
}

function currentDirectoryName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? '/';
}

type TerminalStateHandle = DocHandle<FilesystemResource> & DocHandle<TerminalStateDoc>;

function isTerminalStateHandle(
  handle: DocHandle<FilesystemResource> | undefined,
): handle is TerminalStateHandle {
  return handle?.doc()['@patchpit'].type === PatchpitType.TerminalState;
}
