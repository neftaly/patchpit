import type { WorkspaceSplitIds } from './model.ts';

export const allocateWorkspaceIds = (): {
  readonly contextId: string;
  readonly nodes: WorkspaceSplitIds;
} => ({
  contextId: `context:${crypto.randomUUID()}`,
  nodes: {
    paneId: `pane:${crypto.randomUUID()}`,
    splitId: `split:${crypto.randomUUID()}`,
  },
});
