import type { WorkspacePresentation, WorkspaceViewState } from '../../src/workspace/view-state.ts';
import type { WorkspaceState } from '../../src/workspace/durable-state.ts';

export const workspaceInvariantViolations = (workspace: WorkspaceState): readonly string[] => {
  const violations: string[] = [];
  const mounted = new Set<string>();
  for (const [nodeId, node] of Object.entries(workspace.nodes)) {
    if (node.kind === 'pane') {
      for (const contextId of node.contexts) {
        if (workspace.contexts[contextId] === undefined) violations.push(`missing context ${contextId}`);
        if (mounted.has(contextId)) violations.push(`mounted twice ${contextId}`);
        mounted.add(contextId);
      }
      continue;
    }
    if (workspace.nodes[node.first] === undefined || workspace.nodes[node.second] === undefined) {
      violations.push(`missing child ${nodeId}`);
    }
    if (node.first === node.second) violations.push(`duplicate child ${nodeId}`);
    if (!Number.isFinite(node.ratio) || node.ratio <= 0 || node.ratio >= 1) {
      violations.push(`invalid ratio ${nodeId}`);
    }
  }
  for (const contextId of Object.keys(workspace.contexts)) {
    if (!mounted.has(contextId)) violations.push(`unmounted ${contextId}`);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      violations.push(`cycle ${nodeId}`);
      return;
    }
    if (visited.has(nodeId)) {
      violations.push(`shared ${nodeId}`);
      return;
    }
    const node = workspace.nodes[nodeId];
    if (node === undefined) {
      violations.push(`missing node ${nodeId}`);
      return;
    }
    visiting.add(nodeId);
    if (node.kind === 'split') {
      visit(node.first);
      visit(node.second);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  visit(workspace.rootNodeId);
  for (const nodeId of Object.keys(workspace.nodes)) {
    if (!visited.has(nodeId)) violations.push(`unreachable ${nodeId}`);
  }
  return violations;
};

export const presentationInvariantViolations = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  presentation: WorkspacePresentation,
): readonly string[] => {
  const violations: string[] = [];
  if (presentation.rootNodeId !== workspace.rootNodeId) violations.push('presentation root differs');
  if (presentation.activePaneId !== null && presentation.nodes[presentation.activePaneId]?.kind !== 'pane') {
    violations.push('active pane is unavailable');
  }
  for (const paneId of Object.keys(viewState.panes)) {
    const pane = presentation.nodes[paneId];
    if (pane?.kind !== 'pane') {
      violations.push(`view-state pane is unavailable ${paneId}`);
      continue;
    }
    if (pane.activeContext !== null && !pane.contexts.includes(pane.activeContext)) {
      violations.push(`active context is unavailable ${paneId}`);
    }
    for (const contextId of pane.contexts) {
      if (presentation.contexts[contextId] === undefined) violations.push(`presentation context is unavailable ${contextId}`);
    }
  }
  return violations;
};
