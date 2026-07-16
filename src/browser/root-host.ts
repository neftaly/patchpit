import { Repo } from '@automerge/automerge-repo';
import {
  createRoot,
  openRoot,
  type PatchpitRuntime,
  type RootSeedFolder,
} from '../root/runtime.ts';
import type { RootInvocation } from '../root/invocation.ts';

export const createBrowserRootHost = (options: {
  readonly repo?: Repo;
  readonly seed: (signal?: AbortSignal) => Promise<{
    readonly documentContext?: string;
    readonly folders: readonly RootSeedFolder[];
    readonly initialContext: string;
  }>;
}) => {
  const repo = options.repo ?? new Repo({ network: [] });
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
          ...(seed.documentContext === undefined ? {} : { documentContext: seed.documentContext }),
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
    await repo.shutdown();
  };

  return { close, open, release };
};
