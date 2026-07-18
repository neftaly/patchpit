import { Repo } from '@automerge/automerge-repo';
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel';
import {
  createRoot,
  openRoot,
  type PatchpitRuntime,
  type RootSeedFolder,
} from '../root/runtime.ts';
import type { RootInvocation } from '../root/invocation.ts';

export const createBrowserRootHost = (options: {
  readonly broadcastChannelName?: string;
  readonly repo?: Repo;
  readonly seed: (signal?: AbortSignal) => Promise<{
    readonly documentContextFolderId?: string;
    readonly folders: readonly RootSeedFolder[];
    readonly initialContext: string;
  }>;
}) => {
  const ownsRepo = options.repo === undefined;
  const repo = options.repo ?? new Repo({
    network: [new BroadcastChannelNetworkAdapter({
      channelName: options.broadcastChannelName ?? 'patchpit',
    })],
  });
  let active: PatchpitRuntime | undefined;
  let generation = 0;
  let closed = false;

  const release = () => {
    generation += 1;
    active?.close();
    active = undefined;
  };

  const open = async (invocation: RootInvocation, signal?: AbortSignal) => {
    if (closed) throw new Error('Root host is closed');
    release();
    const currentGeneration = generation;
    signal?.throwIfAborted();
    const runtime = invocation.src === undefined
      ? await options.seed(signal).then((seed) => createRoot({
          repo,
          folders: seed.folders,
          initialContext: seed.initialContext,
          ...(seed.documentContextFolderId === undefined
            ? {}
            : { documentContextFolderId: seed.documentContextFolderId }),
        }))
      : await openRoot({ repo, rootUrl: invocation.src, ...(signal === undefined ? {} : { signal }) });
    if (closed || generation !== currentGeneration || signal?.aborted === true) {
      runtime.close();
      signal?.throwIfAborted();
      throw new Error('Root host lifecycle was replaced');
    }
    active = runtime;
    return {
      invocation: invocation.src === undefined
        ? { ...invocation, src: runtime.rootUrl }
        : invocation,
      runtime,
    };
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    release();
    if (ownsRepo) await repo.shutdown();
  };

  return { close, open, release };
};
