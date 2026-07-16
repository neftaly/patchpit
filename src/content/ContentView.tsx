import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { SandboxFrameAttributes } from '@patchpit/sandbox';
import type { FsEntryRow } from '@patchpit/fs';
import {
  contentUrlForResource,
  parseContentInvocation,
} from './invocation.ts';
import {
  resourceIdentity,
  resourceAt,
  type ResourceProjection,
} from './resources.ts';
import type { PatchpitRuntime } from '../root/runtime.ts';
import type { BrowserSandboxHost } from '../browser/sandbox-host.ts';

export const resourceDragType = 'application/x-patchpit-resource';

type ContentRuntime = Pick<PatchpitRuntime, 'resolve' | 'snapshotApp'>;
type SandboxHost = Pick<BrowserSandboxHost, 'install'>;

export function ContentView({ contentUrl, host, onOpenResource, resources, runtime }: {
  readonly contentUrl: string | undefined;
  readonly host: SandboxHost;
  readonly onOpenResource: (resource: FsEntryRow, pinned: boolean) => void;
  readonly resources: ResourceProjection;
  readonly runtime: ContentRuntime;
}): ReactNode {
  const invocation = useMemo(
    () => contentUrl === undefined ? undefined : parseContentInvocation(contentUrl),
    [contentUrl],
  );
  if (invocation?.kind === 'resources') {
    return <ResourceBrowser onOpen={onOpenResource} resources={resources} />;
  }
  if (invocation?.kind === 'app') {
    const root = resources.byEntryId.get(invocation.rootEntryId);
    return root === undefined
      ? <p role="alert">App unavailable.</p>
      : <SandboxApp host={host} rootEntryId={invocation.rootEntryId} runtime={runtime} />;
  }
  const resource = invocation?.kind !== 'viewer'
    ? undefined
    : resourceAt(resources, invocation.sourceId, invocation.entryId);
  return resource === undefined
    ? <p role="alert">Resource unavailable.</p>
    : <Viewer resourceRef={resource.resourceRef} runtime={runtime} />;
}

function ResourceBrowser({ onOpen, resources }: {
  readonly onOpen: (resource: FsEntryRow, pinned: boolean) => void;
  readonly resources: ResourceProjection;
}) {
  return (
    <section className="view">
      <div className="resource resource-folder" style={treeDepthStyle(0)}>
        <span aria-hidden="true" className="resource-icon">📂</span>
        <span className="resource-name">patchpit</span>
      </div>
      {resources.rows.map(({ depth, resource }) => {
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
                  key={`${resource.sourceId}:${resource.entryId}`}
                  style={treeDepthStyle(depth + 1)}
                >
                  {label}
                </div>
              )
            : (
                <button
                  className={`resource${resource.kind === 'folder' ? ' resource-folder' : ''}`}
                  draggable
                  key={`${resource.sourceId}:${resource.entryId}`}
                  onClick={() => onOpen(resource, false)}
                  onDoubleClick={() => onOpen(resource, true)}
                  onDragStart={(event) => event.dataTransfer.setData(resourceDragType, resourceIdentity(resource))}
                  style={treeDepthStyle(depth + 1)}
                  type="button"
                >
                  {label}
                </button>
              );
      })}
    </section>
  );
}

const treeDepthStyle = (depth: number) => ({ '--tree-depth-size': `${depth}rem` }) as CSSProperties;

const resourceIcon = (resource: FsEntryRow) => {
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
  readonly runtime: ContentRuntime;
}) {
  const [resolution, setResolution] = useState<{
    readonly state: 'loading' | 'unavailable';
  } | {
    readonly state: 'ready';
    readonly handle: NonNullable<Awaited<ReturnType<ContentRuntime['resolve']>>>;
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

function SandboxApp({ host, rootEntryId, runtime }: {
  readonly host: SandboxHost;
  readonly rootEntryId: string;
  readonly runtime: ContentRuntime;
}) {
  const [frame, setFrame] = useState<SandboxFrameAttributes>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let close: (() => Promise<void>) | undefined;
    setFrame(undefined);
    setFailed(false);
    void runtime.snapshotApp(rootEntryId, controller.signal).then(async (snapshot) => {
      if (snapshot.state !== 'ready') throw new Error('Sandbox app snapshot is unavailable');
      const mount = await host.install({
        entry: snapshot.entry,
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
  }, [host, rootEntryId, runtime]);
  return frame === undefined
    ? failed ? <p role="alert">App unavailable.</p> : null
    : <iframe className="sandbox-app" title="App" {...frame} />;
}


const viewerContent = (doc: object | undefined, resourceRef: string) => {
  if (doc === undefined) return resourceRef;
  const bytes = 'bytes' in doc ? doc.bytes : undefined;
  return bytes instanceof Uint8Array
    ? new TextDecoder().decode(bytes)
    : JSON.stringify(doc, null, 2);
};
