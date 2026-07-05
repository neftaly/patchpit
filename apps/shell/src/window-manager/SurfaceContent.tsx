import { FilePicker } from '@patchpit/file-picker';
import { Terminal } from '@patchpit/terminal';
import { Viewer } from '@patchpit/viewer';
import {
  containerRootUrl,
  findNode,
  type WindowContext,
} from '@patchpit/system';
import { StateBrowser } from '../state-browser/StateBrowser';
import type { WindowManagerRuntime } from './WindowManager';

export function SurfaceContent({
  context,
  runtime,
  surfaceId,
}: {
  readonly context: WindowContext | undefined;
  readonly runtime: WindowManagerRuntime;
  readonly surfaceId: string;
}) {
  if (context?.app === 'file-picker') {
    const filePicker = runtime.filePickers[context.url];
    const rootUrl = containerRootUrl(context.container) ?? filePicker?.state.rootUrl;
    const root = rootUrl === undefined ? null : findNode(runtime.filesystemRoot, rootUrl);

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
  }

  if (context?.app === 'terminal') {
    const terminal = runtime.terminals[context.url];
    return terminal === undefined
      ? null
      : (
          <Terminal
            actions={terminal.actions}
            container={context.container}
            runtimeOptions={terminal.runtimeOptions}
            state={terminal.state}
            theme={runtime.theme}
          />
        );
  }

  if (context?.app === 'state-browser') {
    return <StateBrowser snapshot={runtime.stateBrowser} />;
  }

  return (
    <Viewer
      filesystemRoot={runtime.filesystemRoot}
      url={context?.url}
    />
  );
}
