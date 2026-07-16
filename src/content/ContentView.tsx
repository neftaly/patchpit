import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { isImmutableString } from '@automerge/automerge';
import type { SandboxFrameAttributes } from '@patchpit/sandbox';
import type { FsEntryRow } from '@patchpit/fs';
import {
  contentUrlForResource,
  parseContentInvocation,
} from './invocation.ts';
import {
  resourceIdentity,
  findResource,
  type ResourceProjection,
} from './resource-projection.ts';
import type { PatchpitRuntime } from '../root/runtime.ts';
import type { BrowserSandboxHost } from '../browser/sandbox-host.ts';

export const RESOURCE_DRAG_TYPE = 'application/x-patchpit-resource';

type ContentRuntime = Pick<PatchpitRuntime, 'createAppSnapshot' | 'resolveResourceDocument'>;
type SandboxHost = Pick<BrowserSandboxHost, 'install'>;

export function ContentView({ contentRuntime, contentUrl, onOpenResource, resources, sandboxHost }: {
  readonly contentRuntime: ContentRuntime;
  readonly contentUrl: string | undefined;
  readonly onOpenResource: (resource: FsEntryRow, pinned: boolean) => void;
  readonly resources: ResourceProjection;
  readonly sandboxHost: SandboxHost;
}): ReactNode {
  const invocation = contentUrl === undefined ? undefined : parseContentInvocation(contentUrl);
  if (invocation?.kind === 'resources') {
    return <ResourceBrowser onOpenResource={onOpenResource} resources={resources} />;
  }
  if (invocation?.kind === 'app') {
    const root = resources.byEntryId.get(invocation.rootEntryId);
    return root === undefined
      ? <p role="alert">App unavailable.</p>
      : (
          <SandboxApp
            sandboxHost={sandboxHost}
            key={invocation.rootEntryId}
            rootEntryId={invocation.rootEntryId}
            contentRuntime={contentRuntime}
            title={root.name}
          />
        );
  }
  const resource = invocation?.kind !== 'viewer'
    ? undefined
    : findResource(resources, invocation.sourceId, invocation.entryId);
  return resource === undefined
    ? <p role="alert">Resource unavailable.</p>
    : <Viewer contentRuntime={contentRuntime} key={resource.resourceRef} resourceRef={resource.resourceRef} />;
}

function ResourceBrowser({ onOpenResource, resources }: {
  readonly onOpenResource: (resource: FsEntryRow, pinned: boolean) => void;
  readonly resources: ResourceProjection;
}) {
  return (
    <section aria-label="Files" className="view">
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
                className={`resource${resource.kind === 'folder' ? ' resource-folder' : ''}`}
                key={resourceIdentity(resource)}
                style={treeDepthStyle(depth + 1)}
              >
                {label}
              </div>
            )
          : (
              <button
                className={`resource${resource.kind === 'folder' ? ' resource-folder' : ''}`}
                draggable
                key={resourceIdentity(resource)}
                onClick={() => onOpenResource(resource, false)}
                onDoubleClick={() => onOpenResource(resource, true)}
                onDragStart={(event) => event.dataTransfer.setData(RESOURCE_DRAG_TYPE, resourceIdentity(resource))}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  onOpenResource(resource, true);
                }}
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

const treeDepthStyle = (depth: number) => ({ '--tree-depth': depth }) as CSSProperties;

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

function Viewer({ contentRuntime, resourceRef }: {
  readonly contentRuntime: ContentRuntime;
  readonly resourceRef: string;
}) {
  const [resolution, setResolution] = useState<{
    readonly state: 'loading' | 'unavailable';
  } | {
    readonly state: 'ready';
    readonly handle: NonNullable<Awaited<ReturnType<ContentRuntime['resolveResourceDocument']>>>;
  }>({ state: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setResolution({ state: 'loading' });
    void contentRuntime.resolveResourceDocument(resourceRef).then((resolved) => {
      if (!controller.signal.aborted) setResolution(resolved === undefined
        ? { state: 'unavailable' }
        : { state: 'ready', handle: resolved });
    }, () => {
      if (!controller.signal.aborted) setResolution({ state: 'unavailable' });
    });
    return () => { controller.abort(); };
  }, [contentRuntime, resourceRef]);
  const handle = resolution.state === 'ready' ? resolution.handle : undefined;
  const document = useSyncExternalStore(
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
  return <pre className="viewer">{formatViewerContent(document, resourceRef)}</pre>;
}

function SandboxApp({ contentRuntime, rootEntryId, sandboxHost, title }: {
  readonly contentRuntime: ContentRuntime;
  readonly rootEntryId: string;
  readonly sandboxHost: SandboxHost;
  readonly title: string;
}) {
  const [frameAttributes, setFrameAttributes] = useState<SandboxFrameAttributes>();
  const [installationFailed, setInstallationFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setFrameAttributes(undefined);
    setInstallationFailed(false);
    const mountPromise = contentRuntime.createAppSnapshot(rootEntryId, controller.signal).then(async (snapshot) => {
      if (snapshot.state !== 'ready') throw new Error('Sandbox app snapshot is unavailable');
      return sandboxHost.install({
        entry: snapshot.entry,
        files: snapshot.files.map((file) => ({
          path: file.path,
          read: () => ({
            body: file.body,
            ...(file.contentType === undefined ? {} : { contentType: file.contentType }),
          }),
        })),
      }, controller.signal);
    });
    void mountPromise.then((installedMount) => {
      if (!controller.signal.aborted) setFrameAttributes(installedMount.frameAttributes);
    }, () => {
      if (!controller.signal.aborted) setInstallationFailed(true);
    });
    return () => {
      controller.abort();
      void mountPromise.then((installedMount) => installedMount.close(), () => undefined);
    };
  }, [contentRuntime, rootEntryId, sandboxHost]);
  return frameAttributes === undefined
    ? installationFailed ? <p role="alert">App unavailable.</p> : null
    : <iframe className="sandbox-app" title={`${title} app`} {...frameAttributes} />;
}

const formatViewerContent = (document: object | undefined, resourceRef: string) => {
  if (document === undefined) return resourceRef;
  const content = 'content' in document ? document.content : undefined;
  return content instanceof Uint8Array
    ? new TextDecoder().decode(content)
    : typeof content === 'string' || isImmutableString(content) ? String(content)
    : JSON.stringify(document, null, 2);
};
