import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import { planOpenWorkspaceContext, planWorkspaceAction } from '../../src/workspace/controller.ts';
import { workspaceFromLogicalRows, workspaceLogicalRows } from '../../src/workspace/document.ts';
import { projectWorkspaceLayout, type LayoutRect } from '../../src/workspace/layout.ts';
import {
  composeWorkspacePresentation,
  createWorkspacePresence,
  reconcileWorkspacePresence,
  type WorkspaceAction,
  type WorkspacePresence,
} from '../../src/workspace/presence.ts';
import {
  applyWorkspaceOperation,
  createWorkspace,
  paneIdsInLayoutOrder,
  type WorkspaceState,
} from '../../src/workspace/model.ts';
import {
  presentationInvariantViolations,
  workspaceInvariantViolations,
} from '../support/workspace-test-support.ts';

type Step = {
  readonly kind: number;
  readonly first: number;
  readonly second: number;
  readonly edge: 'left' | 'right' | 'top' | 'bottom';
  readonly pinned: boolean;
  readonly ratio: number;
};

const stepArbitrary = fc.record({
  kind: fc.integer({ min: 0, max: 5 }),
  first: fc.integer({ min: 0, max: 31 }),
  second: fc.integer({ min: 0, max: 31 }),
  edge: fc.constantFrom('left' as const, 'right' as const, 'top' as const, 'bottom' as const),
  pinned: fc.boolean(),
  ratio: fc.integer({ min: -20, max: 120 }).map((value) => value / 100),
});

void test('workspace actions preserve the complete durable/presence/document model', () => {
  fc.assert(fc.property(
    fc.array(stepArbitrary, { minLength: 1, maxLength: 60 }),
    (steps) => {
      let workspace = createWorkspace('files.html', 'editor:initial');
      let presence = createWorkspacePresence(workspace, 'right');

      for (const step of steps) {
        const beforeWorkspace = structuredClone(workspace);
        const beforePresence = structuredClone(presence);
        const plan = planStep(workspace, presence, step);

        assert.deepEqual(workspace, beforeWorkspace, 'planning mutated durable input');
        assert.deepEqual(presence, beforePresence, 'planning mutated presence input');
        assert.deepEqual(
          plan.operations.reduce(applyWorkspaceOperation, workspace),
          plan.workspace,
          'the operation evidence does not reproduce the planned workspace',
        );

        workspace = plan.workspace;
        presence = plan.presence;
        assert.deepEqual(workspaceInvariantViolations(workspace), []);
        assert.equal(reconcileWorkspacePresence(workspace, presence), presence);

        const presentation = composeWorkspacePresentation(workspace, presence);
        assert.deepEqual(presentationInvariantViolations(workspace, presence, presentation), []);
        assertWorkspaceLayoutProjection(presentation);
        assertWorkspaceRelationRoundTrip(workspace);
      }
    },
  ), { numRuns: 100 });
});

const planStep = (workspace: WorkspaceState, presence: WorkspacePresence, step: Step) => {
  const paneIds = paneIdsInLayoutOrder(workspace);
  const targetPaneId = select(paneIds, step.first);
  if (targetPaneId === undefined || step.kind === 0) {
    return planOpenWorkspaceContext({
      contextId: `opened-${step.first}`,
      isEditorContext,
      nodes: { paneId: `pane-${step.first}`, splitId: `split-${step.first}` },
      pinned: step.pinned,
      presence,
      url: step.pinned ? `editor:${step.second}` : `viewer:${step.second}`,
      workspace,
    });
  }

  const presentation = composeWorkspacePresentation(workspace, presence);
  const mounted = Object.entries(presentation.nodes).flatMap(([paneId, node]) => node.kind === 'pane'
    ? node.contexts.map((contextId) => ({ contextId, paneId }))
    : []);
  const selected = select(mounted, step.second);
  const split = Object.entries(workspace.nodes).filter(([, node]) => node.kind === 'split');
  let action: WorkspaceAction;

  if (step.kind === 1 && selected !== undefined) {
    action = { kind: 'workspace.context.activate', ...selected };
  } else if (step.kind === 2 && selected !== undefined) {
    action = { kind: 'workspace.context.close', ...selected };
  } else if (step.kind === 3 && selected !== undefined) {
    const target = workspace.nodes[targetPaneId];
    action = {
      kind: 'workspace.context.move',
      contextId: selected.contextId,
      targetPaneId,
      beforeContext: target?.kind === 'pane' ? select(target.contexts, step.first + step.second) ?? null : null,
      url: workspace.contexts[selected.contextId] === undefined ? `viewer:${step.first}` : null,
      pin: step.pinned,
    };
  } else if (step.kind === 4 && selected !== undefined) {
    action = {
      kind: 'workspace.context.split',
      contextId: selected.contextId,
      targetPaneId,
      edge: step.edge,
      ids: { paneId: `pane-${step.first}`, splitId: `split-${step.second}` },
      url: workspace.contexts[selected.contextId] === undefined ? `viewer:${step.first}` : null,
    };
  } else {
    const selectedSplit = select(split, step.second);
    if (selectedSplit === undefined) {
      return planOpenWorkspaceContext({
        contextId: `opened-${step.first}`,
        isEditorContext,
        nodes: { paneId: `pane-${step.first}`, splitId: `split-${step.second}` },
        pinned: step.pinned,
        presence,
        url: `viewer:${step.second}`,
        workspace,
      });
    }
    action = { kind: 'workspace.split.resize', splitId: selectedSplit[0], ratio: step.ratio };
  }
  return planWorkspaceAction({ action, isEditorContext, presence, workspace });
};

const assertWorkspaceRelationRoundTrip = (workspace: WorkspaceState) => {
  const logicalRows = workspaceLogicalRows(workspace);
  const decoded = workspaceFromLogicalRows(logicalRows);
  assert.deepEqual(decoded.issues, []);
  assert.deepEqual(decoded.workspace, workspace);
};

const assertWorkspaceLayoutProjection = (
  presentation: ReturnType<typeof composeWorkspacePresentation>,
) => {
  const layout = projectWorkspaceLayout(presentation, {});
  const expectedPanes = Object.entries(presentation.nodes)
    .filter(([, node]) => node.kind === 'pane')
    .map(([paneId]) => paneId)
    .sort();
  const expectedContexts = expectedPanes.flatMap((paneId) => {
    const pane = presentation.nodes[paneId];
    return pane?.kind === 'pane' ? pane.contexts : [];
  }).sort();
  assert.deepEqual(layout.panes.map(({ paneId }) => paneId).sort(), expectedPanes);
  assert.deepEqual(layout.contexts.map(({ contextId }) => contextId).sort(), expectedContexts);
  for (const { rect } of [...layout.panes, ...layout.splits]) assertUnitRect(rect);
};

const assertUnitRect = ({ height, left, top, width }: LayoutRect) => {
  const epsilon = Number.EPSILON * 16;
  for (const value of [height, left, top, width]) assert.equal(Number.isFinite(value), true);
  assert.ok(height >= 0 && width >= 0);
  assert.ok(left >= -epsilon && top >= -epsilon);
  assert.ok(left + width <= 1 + epsilon);
  assert.ok(top + height <= 1 + epsilon);
};

const isEditorContext = (url: string) => url.startsWith('editor:');
const select = <Value>(values: readonly Value[], seed: number): Value | undefined => values.length === 0
  ? undefined
  : values[Math.abs(seed) % values.length];
