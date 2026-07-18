import type { WorkspacePaneId } from './durable-state.ts';
import type { WorkspacePresentation, WorkspacePresentationPane } from './view-state.ts';

export type LayoutRect = {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
};

export const projectWorkspaceLayout = (
  workspace: WorkspacePresentation,
  draftRatios: Readonly<Record<string, number>>,
) => {
  const panes: Array<{ pane: WorkspacePresentationPane; paneId: WorkspacePaneId; rect: LayoutRect }> = [];
  const splits: Array<{
    axis: 'horizontal' | 'vertical';
    first: string;
    ratio: number;
    rect: LayoutRect;
    second: string;
    splitId: string;
  }> = [];
  const visited = new Set<string>();
  const visit = (nodeId: string, rect: LayoutRect) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = workspace.nodes[nodeId];
    if (node?.kind === 'pane') {
      panes.push({ pane: node, paneId: nodeId, rect });
      return;
    }
    if (node?.kind !== 'split') return;
    const ratio = draftRatios[nodeId] ?? node.ratio;
    splits.push({ axis: node.axis, first: node.first, ratio, rect, second: node.second, splitId: nodeId });
    if (node.axis === 'horizontal') {
      visit(node.first, { ...rect, width: rect.width * ratio });
      visit(node.second, {
        ...rect,
        left: rect.left + (rect.width * ratio),
        width: rect.width * (1 - ratio),
      });
      return;
    }
    visit(node.first, { ...rect, height: rect.height * ratio });
    visit(node.second, {
      ...rect,
      height: rect.height * (1 - ratio),
      top: rect.top + (rect.height * ratio),
    });
  };
  visit(workspace.rootNodeId, { height: 1, left: 0, top: 0, width: 1 });
  const contexts = panes.flatMap(({ pane, paneId, rect }) => pane.contexts.map((contextId) => ({
    selected: pane.selectedContext === contextId,
    contextId,
    paneId,
    rect,
  })));
  return { contexts, panes, splits };
};
