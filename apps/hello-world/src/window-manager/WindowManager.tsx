import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { FilePicker, type FilePickerActions } from '../apps/file-picker/FilePicker';
import { Terminal } from '../apps/terminal/Terminal';
import { Viewer } from '../apps/viewer/Viewer';
import {
  findNode,
  type SplitDirection,
  SurfaceRole,
  WindowManagerNodeKind,
  type FilePickerStateDoc,
  type FilesystemNode,
  type WindowContext,
  type WindowLayoutNode,
  type WindowManagerStateDoc,
  type WindowSurface,
} from '../filesystem';
import type { FileIcons } from '../apps/file-picker/file-icons';
import { type SplitPath } from './window-manager-state';
import './window-manager.css';

export type WindowManagerActions = {
  readonly closeContext: (surfaceId: string, contextId: string) => void;
  readonly focusContext: (surfaceId: string, contextId: string) => void;
  readonly resizeSplit: (path: SplitPath, ratio: number) => void;
};

type RunningFilePicker = {
  readonly actions: (surfaceId: string) => FilePickerActions;
  readonly fileIcons: FileIcons;
  readonly state: FilePickerStateDoc;
};

type WindowManagerRuntime = {
  readonly actions: WindowManagerActions;
  readonly contexts: Readonly<Record<string, WindowContext>>;
  readonly filePickers: Readonly<Record<string, RunningFilePicker>>;
  readonly filesystemRoot: FilesystemNode;
  readonly liveDocuments: Readonly<Record<string, string>>;
  readonly surfaces: Readonly<Record<string, WindowSurface>>;
};

export function WindowManager({
  actions,
  filePickers,
  filesystemRoot,
  liveDocuments,
  state,
}: {
  readonly actions: WindowManagerActions;
  readonly filePickers: Readonly<Record<string, RunningFilePicker>>;
  readonly filesystemRoot: FilesystemNode;
  readonly liveDocuments: Readonly<Record<string, string>>;
  readonly state: WindowManagerStateDoc;
}) {
  const runtime = {
    actions,
    contexts: state.contexts,
    filePickers,
    filesystemRoot,
    liveDocuments,
    surfaces: state.surfaces,
  };

  return (
    <section className="window-manager" aria-label="window manager">
      <LayoutNodeView node={state.layout} path={[]} runtime={runtime} />
    </section>
  );
}

function LayoutNodeView({
  node,
  path,
  runtime,
  style,
}: {
  readonly node: WindowLayoutNode;
  readonly path: SplitPath;
  readonly runtime: WindowManagerRuntime;
  readonly style?: CSSProperties | undefined;
}) {
  if (node.kind === WindowManagerNodeKind.Split) {
    return <SplitView node={node} path={path} runtime={runtime} style={style} />;
  }

  const surface = runtime.surfaces[node.surfaceId];
  return surface === undefined
    ? null
    : <SurfaceView runtime={runtime} style={style} surface={surface} />;
}

function SplitView({
  node,
  path,
  runtime,
  style,
}: {
  readonly node: Extract<WindowLayoutNode, { kind: WindowManagerNodeKind.Split }>;
  readonly path: SplitPath;
  readonly runtime: WindowManagerRuntime;
  readonly style?: CSSProperties | undefined;
}) {
  const splitRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={`window-manager-split window-manager-split-${node.direction}`}
      ref={splitRef}
      style={style}
    >
      <LayoutNodeView
        node={node.first}
        path={[...path, 'first']}
        runtime={runtime}
        style={splitChildStyle(node.ratio)}
      />
      <button
        aria-label="Resize surfaces"
        className="window-manager-resize-handle"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeFromPointer(event, splitRef.current, node.direction, path, runtime.actions.resizeSplit);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            resizeFromPointer(event, splitRef.current, node.direction, path, runtime.actions.resizeSplit);
          }
        }}
        type="button"
      />
      <LayoutNodeView
        node={node.second}
        path={[...path, 'second']}
        runtime={runtime}
        style={splitChildStyle(1 - node.ratio)}
      />
    </div>
  );
}

function SurfaceView({
  runtime,
  surface,
  style,
}: {
  readonly runtime: WindowManagerRuntime;
  readonly surface: WindowSurface;
  readonly style?: CSSProperties | undefined;
}) {
  const tabIds = surface.previewContext === undefined
    ? surface.contexts
    : [...surface.contexts, surface.previewContext];
  const selectedContextId = tabIds.find((contextId) => contextId === surface.activeContext) ?? tabIds.at(0);
  const selectedContext = selectedContextId === undefined ? undefined : runtime.contexts[selectedContextId];
  const showTabs = surface.role === SurfaceRole.DocumentSet && tabIds.length > 0;

  return (
    <section className="window-manager-surface" aria-label="window surface" style={style}>
      {showTabs && (
        <header className="window-manager-surface-header">
          <div className="window-manager-tabs" role="tablist" aria-label="open windows">
            {tabIds.map((contextId) => {
              const label = contextLabel(runtime.contexts[contextId], contextId);
              return (
                <div
                  aria-selected={contextId === selectedContextId}
                  className="window-manager-tab"
                  data-preview={contextId === surface.previewContext ? '' : undefined}
                  data-selected={contextId === selectedContextId ? '' : undefined}
                  key={`${contextId === surface.previewContext ? 'preview' : 'context'}:${contextId}`}
                  onClick={() => runtime.actions.focusContext(surface.id, contextId)}
                  onKeyDown={(event) => {
                    if (isActivationKey(event)) runtime.actions.focusContext(surface.id, contextId);
                  }}
                  role="tab"
                  tabIndex={0}
                  title={label}
                >
                  <span className="window-manager-tab-label">{label}</span>
                  <button
                    aria-label={`Close ${label}`}
                    className="window-manager-tab-icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      runtime.actions.closeContext(surface.id, contextId);
                    }}
                    title="Close window"
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </header>
      )}
      <SurfaceContent context={selectedContext} runtime={runtime} surfaceId={surface.id} />
    </section>
  );
}

function SurfaceContent({
  context,
  runtime,
  surfaceId,
}: {
  readonly context: WindowContext | undefined;
  readonly runtime: WindowManagerRuntime;
  readonly surfaceId: string;
}) {
  const filePickerStateUrl = context?.app === 'file-picker' ? context.url : undefined;
  const filePicker = filePickerStateUrl === undefined ? undefined : runtime.filePickers[filePickerStateUrl];
  const root = filePicker === undefined ? null : findNode(runtime.filesystemRoot, filePicker.state.rootUrl);

  if (filePicker !== undefined && root !== null) {
    return (
      <FilePicker
        actions={filePicker.actions(surfaceId)}
        fileIcons={filePicker.fileIcons}
        root={root}
        state={filePicker.state}
      />
    );
  }

  if (context?.app === 'terminal') {
    return <Terminal />;
  }

  return (
    <Viewer
      filesystemRoot={runtime.filesystemRoot}
      liveDocuments={runtime.liveDocuments}
      url={context?.url}
    />
  );
}

function isActivationKey(event: KeyboardEvent): boolean {
  if (event.key !== 'Enter' && event.key !== ' ') return false;
  event.preventDefault();
  return true;
}

function splitChildStyle(size = 1): CSSProperties {
  return { flex: `${size} 1 0` };
}

function contextLabel(context: WindowContext | undefined, fallback: string): string {
  return context === undefined ? fallback : context.title ?? context.url;
}

function resizeFromPointer(
  event: PointerEvent,
  split: HTMLDivElement | null,
  direction: SplitDirection,
  path: SplitPath,
  resizeSplit: (path: SplitPath, ratio: number) => void,
): void {
  if (split === null) return;
  event.preventDefault();

  const rect = split.getBoundingClientRect();
  const offset = direction === 'row' ? event.clientX - rect.left : event.clientY - rect.top;
  const size = direction === 'row' ? rect.width : rect.height;
  resizeSplit(path, offset / size);
}
