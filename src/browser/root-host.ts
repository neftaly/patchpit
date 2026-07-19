import { Repo } from '@automerge/automerge-repo';
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel';
import {
  createRoot,
  openRoot,
  type PatchpitRuntime,
  type RootSeedFolder,
} from '../root/runtime.ts';
import type { RootInvocation } from '../root/invocation.ts';

const DISPLAY_IDENTITY_STORAGE_KEY = 'patchpit.display-identity.v1';

export const loadBrowserDisplayIdentityId = async () => {
  const load = () => {
    try {
      const stored = localStorage.getItem(DISPLAY_IDENTITY_STORAGE_KEY);
      if (isDisplayIdentityId(stored)) return stored;
      const created = crypto.randomUUID();
      localStorage.setItem(DISPLAY_IDENTITY_STORAGE_KEY, created);
      const persisted = localStorage.getItem(DISPLAY_IDENTITY_STORAGE_KEY);
      return isDisplayIdentityId(persisted) ? persisted : created;
    } catch {
      return crypto.randomUUID();
    }
  };
  try {
    return await navigator.locks.request(DISPLAY_IDENTITY_STORAGE_KEY, load);
  } catch {
    return load();
  }
};

export const createBrowserRootHost = (options: {
  readonly broadcastChannelName?: string;
  readonly displayIdentityId?: string;
  readonly repo?: Repo;
  readonly seed: (signal?: AbortSignal) => Promise<{
    readonly documentContextFolderId?: string;
    readonly folders: readonly RootSeedFolder[];
    readonly initialContext: string;
  }>;
}) => {
  const ownsRepo = options.repo === undefined;
  const displayIdentityId = options.displayIdentityId ?? crypto.randomUUID();
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
          displayIdentityId,
          folders: seed.folders,
          initialContext: seed.initialContext,
          ...(seed.documentContextFolderId === undefined
            ? {}
            : { documentContextFolderId: seed.documentContextFolderId }),
        }))
      : await openRoot({
          repo,
          rootUrl: invocation.src,
          displayIdentityId,
          ...(signal === undefined ? {} : { signal }),
        });
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

const isDisplayIdentityId = (value: string | null): value is string => value !== null
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
