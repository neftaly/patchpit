import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { SandboxFrameAttributes } from '@patchpit/sandbox';
import {
  resourceRows,
  type Resource,
} from './resources.ts';
import type { PatchpitRuntime } from './patchpit-runtime.ts';
import type { BrowserSandboxHost } from './browser-sandbox-host.ts';

export const resourceBrowserUrl = 'files.html';
export const resourceDragType = 'application/x-patchpit-resource';
const appContentPrefix = 'app.html#';
const viewerContentPrefix = 'viewer.html#';

type AppContentInvocation = {
  readonly entry: readonly string[];
  readonly rootEntryId: string;
};

export const appContentUrl = (invocation: AppContentInvocation) =>
  `${appContentPrefix}${JSON.stringify(invocation)}`;

export const contentUrlForResource = (
  resource: Resource,
  resources: readonly Resource[],
): string | undefined => {
  if (resource.kind === 'file') {
    return `${viewerContentPrefix}${JSON.stringify({ src: resource.resourceRef })}`;
  }
  const entry = resources.find((candidate) => candidate.kind === 'file'
    && candidate.parentId === resource.localId
    && candidate.name === 'index.html');
  return entry === undefined
    ? undefined
    : appContentUrl({ entry: ['index.html'], rootEntryId: resource.localId });
};

export const contentLabel = (
  resources: readonly Resource[],
  contentUrl: string | undefined,
) => {
  if (contentUrl === resourceBrowserUrl) return 'Resources';
  const app = contentUrl === undefined ? undefined : parseAppContentUrl(contentUrl);
  if (app !== undefined) {
    const root = resources.find((candidate) => candidate.localId === app.rootEntryId);
    return root === undefined ? 'App unavailable' : `${root.name} / ${app.entry.join('/')}`;
  }
  const resourceRef = contentUrl === undefined ? undefined : viewerSource(contentUrl);
  const resource = resourceRef === undefined
    ? undefined
    : resources.find((candidate) => candidate.resourceRef === resourceRef);
  if (resource === undefined) return 'Resource unavailable';
  const parent = resource.parentId === null
    ? undefined
    : resources.find((candidate) => candidate.localId === resource.parentId);
  return `${parent?.name ?? 'patchpit'} / ${resource.name}`;
};

export function ContentView({ contentUrl, host, onOpenResource, resources, runtime }: {
  readonly contentUrl: string | undefined;
  readonly host: BrowserSandboxHost;
  readonly onOpenResource: (resource: Resource, pinned: boolean) => void;
  readonly resources: readonly Resource[];
  readonly runtime: PatchpitRuntime;
}): ReactNode {
  const app = useMemo(
    () => contentUrl === undefined ? undefined : parseAppContentUrl(contentUrl),
    [contentUrl],
  );
  if (contentUrl === resourceBrowserUrl) {
    return <ResourceBrowser onOpen={onOpenResource} resources={resources} />;
  }
  if (app !== undefined) {
    const root = resources.find((candidate) => candidate.localId === app.rootEntryId);
    return root === undefined
      ? <p role="alert">App unavailable.</p>
      : <SandboxApp app={app} host={host} runtime={runtime} />;
  }
  const resourceRef = contentUrl === undefined ? undefined : viewerSource(contentUrl);
  const resource = resourceRef === undefined
    ? undefined
    : resources.find((candidate) => candidate.resourceRef === resourceRef);
  return resource === undefined
    ? <p role="alert">Resource unavailable.</p>
    : <Viewer resourceRef={resource.resourceRef} runtime={runtime} />;
}

function ResourceBrowser({ onOpen, resources }: {
  readonly onOpen: (resource: Resource, pinned: boolean) => void;
  readonly resources: readonly Resource[];
}) {
  return (
    <section className="view">
      <div className="resource-group">
        <div className="resource resource-folder resource-source" style={treeDepthStyle(0)}>
          <span aria-hidden="true" className="resource-icon">📂</span>
          <span className="resource-name">patchpit</span>
        </div>
        {resourceRows(resources).map(({ depth, resource }) => {
          const openable = contentUrlForResource(resource, resources) !== undefined;
          const label = (
            <>
              <span aria-hidden="true" className="resource-icon">{resourceIcon(resource)}</span>
              <span className="resource-name">{resource.name}</span>
            </>
          );
          return !openable
            ? (
                <div
                  className="resource resource-folder"
                  key={resource.localId}
                  style={treeDepthStyle(depth + 1)}
                >
                  {label}
                </div>
              )
            : (
                <button
                  className={`resource${resource.kind === 'folder' ? ' resource-folder' : ''}`}
                  draggable
                  key={resource.localId}
                  onClick={() => onOpen(resource, false)}
                  onDoubleClick={() => onOpen(resource, true)}
                  onDragStart={(event) => event.dataTransfer.setData(resourceDragType, resource.localId)}
                  style={treeDepthStyle(depth + 1)}
                  type="button"
                >
                  {label}
                </button>
              );
        })}
      </div>
    </section>
  );
}

const treeDepthStyle = (depth: number) => ({ '--tree-depth-size': `${depth}rem` }) as CSSProperties;

const resourceIcon = (resource: Resource) => {
  if (resource.kind === 'folder') return '📂';
  const extension = resource.name.split('.').at(-1)?.toLowerCase();
  if (extension === 'am') return '🔀';
  if (extension === 'json' || extension === 'ndjson') return '🧾';
  if (extension === 'js' || extension === 'mjs' || extension === 'ts') return '📜';
  if (extension === 'css') return '💅';
  if (extension === 'html' || extension === 'htm') return '🌐';
  if (extension === 'md' || extension === 'txt') return '📝';
  if (extension === 'gltf' || extension === 'glb' || extension === 'obj') return '🧊';
  if (extension === 'svg' || extension === 'png' || extension === 'jpg' || extension === 'webp') return '🖼️';
  return '📄';
};

function Viewer({ resourceRef, runtime }: {
  readonly resourceRef: string;
  readonly runtime: PatchpitRuntime;
}) {
  const [resolution, setResolution] = useState<{
    readonly state: 'loading' | 'unavailable';
  } | {
    readonly state: 'ready';
    readonly handle: NonNullable<Awaited<ReturnType<PatchpitRuntime['resolve']>>>;
  }>({ state: 'loading' });
  useEffect(() => {
    let current = true;
    setResolution({ state: 'loading' });
    void runtime.resolve(resourceRef).then((resolved) => {
      if (current) setResolution(resolved === undefined
        ? { state: 'unavailable' }
        : { state: 'ready', handle: resolved });
    }, () => {
      if (current) setResolution({ state: 'unavailable' });
    });
    return () => { current = false; };
  }, [resourceRef, runtime]);
  const handle = resolution.state === 'ready' ? resolution.handle : undefined;
  const doc = useSyncExternalStore(
    (listener) => {
      if (handle === undefined) return () => undefined;
      const changed = () => { listener(); };
      handle.on('heads-changed', changed);
      return () => { handle.off('heads-changed', changed); };
    },
    () => handle?.doc(),
    () => handle?.doc(),
  );
  if (resolution.state === 'unavailable') return <p role="alert">Resource unavailable.</p>;
  return <pre className="viewer">{viewerContent(doc, resourceRef)}</pre>;
}

function SandboxApp({ app, host, runtime }: {
  readonly app: AppContentInvocation;
  readonly host: BrowserSandboxHost;
  readonly runtime: PatchpitRuntime;
}) {
  const [frame, setFrame] = useState<SandboxFrameAttributes>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let close: (() => Promise<void>) | undefined;
    setFrame(undefined);
    setFailed(false);
    void runtime.snapshotApp(app.rootEntryId, controller.signal).then(async (snapshot) => {
      if (snapshot.state !== 'ready') throw new Error('Sandbox app snapshot is unavailable');
      const mount = await host.install({
        entry: app.entry,
        files: snapshot.files.map((file) => ({
          path: file.path,
          read: () => ({
            body: file.body,
            ...(file.contentType === undefined ? {} : { contentType: file.contentType }),
          }),
        })),
      }, controller.signal);
      close = mount.close;
      if (!controller.signal.aborted) setFrame(mount.frameAttributes);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      void close?.();
    };
  }, [app.entry, app.rootEntryId, host, runtime]);
  return frame === undefined
    ? failed ? <p role="alert">App unavailable.</p> : null
    : <iframe className="sandbox-app" title="App" {...frame} />;
}

const viewerSource = (contentUrl: string) => {
  if (!contentUrl.startsWith(viewerContentPrefix)) return undefined;
  try {
    const config = JSON.parse(contentUrl.slice(viewerContentPrefix.length)) as { readonly src?: unknown };
    return typeof config.src === 'string' ? config.src : undefined;
  } catch {
    return undefined;
  }
};

const parseAppContentUrl = (contentUrl: string): AppContentInvocation | undefined => {
  if (!contentUrl.startsWith(appContentPrefix)) return undefined;
  try {
    const candidate = JSON.parse(contentUrl.slice(appContentPrefix.length)) as {
      readonly entry?: unknown;
      readonly rootEntryId?: unknown;
    };
    return typeof candidate.rootEntryId === 'string'
      && candidate.rootEntryId !== ''
      && Array.isArray(candidate.entry)
      && candidate.entry.length > 0
      && candidate.entry.every((segment) => typeof segment === 'string'
        && segment !== ''
        && segment !== '.'
        && segment !== '..')
      ? { entry: candidate.entry as string[], rootEntryId: candidate.rootEntryId }
      : undefined;
  } catch {
    return undefined;
  }
};

const viewerContent = (doc: object | undefined, resourceRef: string) => {
  if (doc === undefined) return resourceRef;
  const bytes = 'bytes' in doc ? doc.bytes : undefined;
  return bytes instanceof Uint8Array
    ? new TextDecoder().decode(bytes)
    : JSON.stringify(doc, null, 2);
};
