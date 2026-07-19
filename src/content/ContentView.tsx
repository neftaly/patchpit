import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { isImmutableString } from '@automerge/automerge';
import type { SandboxFrameAttributes } from '@patchpit/sandbox';
import type { FolderLinkRow } from '@patchpit/fs';
import {
  contentUrlForResource,
  parseContentInvocation,
} from './invocation.ts';
import {
  resourceIdentity,
  type ResourceProjection,
} from './resource-projection.ts';
import type { PatchpitRuntime } from '../root/runtime.ts';
import type { BrowserSandboxHost } from '../browser/sandbox-host.ts';
import { observeSameOriginFrameInteractions } from '../browser/frame-interaction.ts';
import { connectEditorFrame } from './editor-port-host.ts';

export const RESOURCE_DRAG_TYPE = 'application/x-patchpit-resource';

type ContentRuntime = Pick<
  PatchpitRuntime,
  'createAppSnapshot' | 'openAppTextDocument' | 'resolveResourceDocument'
>;
type SandboxHost = Pick<BrowserSandboxHost, 'install'>;

export function ContentView({ contentRuntime, contentUrl, onInteract, onOpenResource, resources, resourceTitles, sandboxHost }: {
  readonly contentRuntime: ContentRuntime;
  readonly contentUrl: string | undefined;
  readonly onInteract: () => void;
  readonly onOpenResource: (resource: FolderLinkRow, pinned: boolean) => void;
  readonly resources: ResourceProjection;
  readonly resourceTitles: ReadonlyMap<string, string>;
  readonly sandboxHost: SandboxHost;
}): ReactNode {
  const invocation = contentUrl === undefined ? undefined : parseContentInvocation(contentUrl);
  if (invocation?.kind === 'resources') {
    return <ResourceBrowser onOpenResource={onOpenResource} resources={resources} />;
  }
  if (invocation?.kind === 'app') {
    const root = resources.byResourceRef.get(invocation.resourceRef);
    return root === undefined
      ? <p role="alert">App unavailable.</p>
      : (
          <SandboxApp
            sandboxHost={sandboxHost}
            key={invocation.resourceRef}
            onInteract={onInteract}
            rootFolderRef={invocation.resourceRef}
            contentRuntime={contentRuntime}
            title={resourceTitles.get(invocation.resourceRef) ?? root.name}
          />
        );
  }
  return invocation?.kind !== 'viewer'
    ? <p role="alert">Resource unavailable.</p>
    : <Viewer contentRuntime={contentRuntime} key={invocation.resourceRef} resourceRef={invocation.resourceRef} />;
}

function ResourceBrowser({ onOpenResource, resources }: {
  readonly onOpenResource: (resource: FolderLinkRow, pinned: boolean) => void;
  readonly resources: ResourceProjection;
}) {
  return (
    <section aria-label="Files" className="view">
      <div className="resource resource-folder" style={treeDepthStyle(0)}>
        <span aria-hidden="true" className="resource-icon">📂</span>
        <span className="resource-name">patchpit</span>
      </div>
      {resources.graphState !== 'ready' && (
        <div
          className="resource"
          role={resources.graphState === 'invalid' || resources.graphState === 'closed' ? 'alert' : 'status'}
          style={treeDepthStyle(1)}
        >
          <span aria-hidden="true" className="resource-icon">⚠</span>
          <span className="resource-name">{resourceGraphMessage(resources.graphState)}</span>
        </div>
      )}
      {resources.sourceProblems.map((problem) => (
        <div
          className="resource"
          key={`${problem.attachmentId}:${problem.sourceId}`}
          style={treeDepthStyle(2)}
        >
          <span aria-hidden="true" className="resource-icon">↳</span>
          <span className="resource-name">
            {problem.sourceId} — {resourceSourceProblemMessage(problem)}
          </span>
        </div>
      ))}
      {resources.rows.map(({ depth, folderTraversal, resource }) => {
        const openable = contentUrlForResource(resource, resources) !== undefined;
        const notice = resourceNotice(folderTraversal);
        const label = (
          <>
            <span aria-hidden="true" className="resource-icon">{resourceIcon(resource)}</span>
            <span className="resource-name">
              {notice === undefined ? resource.name : `⚠ ${resource.name} — ${notice}`}
            </span>
          </>
        );
        return !openable
          ? (
              <div
                className={`resource${resource.typeHint === 'folder' ? ' resource-folder' : ''}`}
                key={resourceIdentity(resource)}
                style={treeDepthStyle(depth + 1)}
              >
                {label}
              </div>
            )
          : (
              <button
                className={`resource${resource.typeHint === 'folder' ? ' resource-folder' : ''}`}
                draggable
                key={resourceIdentity(resource)}
                onClick={(event) => onOpenResource(resource, event.detail !== 1)}
                onDragStart={(event) => event.dataTransfer.setData(RESOURCE_DRAG_TYPE, resourceIdentity(resource))}
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

const resourceGraphMessage = (state: Exclude<ResourceProjection['graphState'], 'ready'>) => ({
  closed: 'Resource list unavailable.',
  incomplete: 'Resource list incomplete.',
  invalid: 'Resource list invalid.',
  stale: 'Resource list not current.',
})[state];

const resourceSourceProblemMessage = (
  problem: ResourceProjection['sourceProblems'][number],
) => {
  if (!problem.authorized) return 'unauthorized';
  if (problem.state !== 'ready') return problem.state;
  if (problem.freshness !== 'current') return problem.freshness;
  return problem.issueCodes.join(', ');
};

const resourceNotice = (folderTraversal: 'already-expanded' | 'cycle' | undefined) =>
  folderTraversal === 'already-expanded' ? 'contents shown above'
    : folderTraversal === 'cycle' ? 'folder cycle'
    : undefined;

const resourceIcon = (resource: FolderLinkRow) => {
  if (resource.typeHint === 'folder') return '📂';
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
    void contentRuntime.resolveResourceDocument(resourceRef, controller.signal).then((resolved) => {
      if (!controller.signal.aborted) setResolution(resolved === undefined
        ? { state: 'unavailable' }
        : { state: 'ready', handle: resolved });
    }, () => {
      if (!controller.signal.aborted) setResolution({ state: 'unavailable' });
    });
    return () => { controller.abort(); };
  }, [contentRuntime, resourceRef]);
  const handle = resolution.state === 'ready' ? resolution.handle : undefined;
  const subscribeDocument = useCallback((listener: () => void) => {
    if (handle === undefined) return () => undefined;
    const changed = () => { listener(); };
    handle.on('heads-changed', changed);
    return () => { handle.off('heads-changed', changed); };
  }, [handle]);
  const getDocument = useCallback(() => handle?.doc(), [handle]);
  const document = useSyncExternalStore(
    subscribeDocument,
    getDocument,
    getDocument,
  );
  if (resolution.state === 'unavailable') return <p role="alert">Resource unavailable.</p>;
  return <pre className="viewer">{formatViewerContent(document, resourceRef)}</pre>;
}

function SandboxApp({ contentRuntime, onInteract, rootFolderRef, sandboxHost, title }: {
  readonly contentRuntime: ContentRuntime;
  readonly onInteract: () => void;
  readonly rootFolderRef: string;
  readonly sandboxHost: SandboxHost;
  readonly title: string;
}) {
  const [installation, setInstallation] = useState<{
    readonly state: 'loading' | 'unavailable';
  } | {
    readonly state: 'ready';
    readonly frameAttributes: SandboxFrameAttributes;
  }>({ state: 'loading' });
  const removeInteractionListeners = useRef<() => void>(() => undefined);
  const closeEditorPort = useRef<() => void>(() => undefined);
  useEffect(() => {
    removeInteractionListeners.current();
    removeInteractionListeners.current = () => undefined;
    const controller = new AbortController();
    setInstallation({ state: 'loading' });
    const mountPromise = contentRuntime.createAppSnapshot(rootFolderRef, controller.signal).then(async (snapshot) => {
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
      if (!controller.signal.aborted) {
        setInstallation({ state: 'ready', frameAttributes: installedMount.frameAttributes });
      }
    }, () => {
      if (!controller.signal.aborted) setInstallation({ state: 'unavailable' });
    });
    return () => {
      closeEditorPort.current();
      closeEditorPort.current = () => undefined;
      removeInteractionListeners.current();
      removeInteractionListeners.current = () => undefined;
      controller.abort();
      void mountPromise.then((installedMount) => installedMount.close(), () => undefined);
    };
  }, [contentRuntime, rootFolderRef, sandboxHost]);
  return installation.state !== 'ready'
    ? installation.state === 'unavailable' ? <p role="alert">App unavailable.</p> : null
    : (
        <iframe
          className="sandbox-app"
          onLoad={(event) => {
            removeInteractionListeners.current();
            closeEditorPort.current();
            removeInteractionListeners.current = observeSameOriginFrameInteractions(event.currentTarget, onInteract);
            closeEditorPort.current = connectEditorFrame(event.currentTarget, contentRuntime, rootFolderRef);
          }}
          title={`${title} app`}
          {...installation.frameAttributes}
        />
      );
}

const formatViewerContent = (document: object | undefined, resourceRef: string) => {
  if (document === undefined) return resourceRef;
  const content = 'content' in document ? document.content : undefined;
  return content instanceof Uint8Array
    ? new TextDecoder().decode(content)
    : typeof content === 'string' || isImmutableString(content) ? String(content)
    : JSON.stringify(document, null, 2);
};
