import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import { planOpenWorkspaceContext, planWorkspaceAction } from '../../src/workspace/action-planner.ts';
import {
  workspaceFromRelationRows,
  workspaceRelationRowsFromState,
} from '../../src/workspace/document.ts';
import { projectWorkspaceLayout, type LayoutRect } from '../../src/workspace/layout.ts';
import {
  contentDropZone,
  canStartResize,
  operationForDrop,
  pointInRect,
  splitRatio,
  tabDropIndex,
} from '../../src/workspace/interaction.ts';
import {
  activeWorkspaceEditor,
  composeWorkspacePresentation,
  createWorkspaceViewState,
  reconcileWorkspaceViewState,
  workspaceContextForUrl,
  type WorkspaceAction,
  type WorkspaceViewState,
} from '../../src/workspace/view-state.ts';
import {
  applyWorkspaceOperation,
  createWorkspace,
  paneIdsInLayoutOrder,
  type WorkspaceState,
} from '../../src/workspace/durable-state.ts';
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

void test('workspace actions preserve the complete durable/view-state/document model', () => {
  fc.assert(fc.property(
    fc.array(stepArbitrary, { minLength: 1, maxLength: 60 }),
    (steps) => {
      let workspace = createWorkspace('files.html', 'editor:initial');
      let viewState = createWorkspaceViewState(workspace, ['context-1']);

      for (const step of steps) {
        const beforeWorkspace = structuredClone(workspace);
        const beforeViewState = structuredClone(viewState);
        const plan = planStep(workspace, viewState, step);

        assert.deepEqual(workspace, beforeWorkspace, 'planning mutated durable input');
        assert.deepEqual(viewState, beforeViewState, 'planning mutated view-state input');
        assert.deepEqual(
          plan.durableOperation === undefined
            ? workspace
            : applyWorkspaceOperation(workspace, plan.durableOperation),
          plan.workspace,
          'the operation evidence does not reproduce the planned workspace',
        );

        workspace = plan.workspace;
        viewState = plan.viewState;
        assert.deepEqual(workspaceInvariantViolations(workspace), []);
        assert.equal(reconcileWorkspaceViewState(workspace, viewState), viewState);
        assertActiveEditorFallback(workspace, viewState);
        assertContextIdCollisionIsNoOp(workspace, viewState, step.first + step.second, step.pinned);
        assertMountedUrlReuse(workspace, viewState, step.first + step.second, step.pinned);

        const presentation = composeWorkspacePresentation(workspace, viewState, isEditorContext);
        assert.deepEqual(presentationInvariantViolations(workspace, viewState, presentation), []);
        assertWorkspaceLayoutProjection(presentation);
        assertWorkspaceRelationRoundTrip(workspace);
      }
    },
  ), { numRuns: 100 });
});

void test('workspace pointer geometry lowers to bounded deterministic intent', () => {
  const coordinate = fc.double({ min: -4, max: 4, noNaN: true, noDefaultInfinity: true });
  fc.assert(fc.property(
    coordinate,
    coordinate,
    fc.double({ min: -1_000, max: 1_000, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -1_000, max: 1_000, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: 0.01, max: 1_000, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: 0.01, max: 1_000, noNaN: true, noDefaultInfinity: true }),
    fc.nat(100),
    fc.constantFrom('mouse', 'touch', 'pen', ''),
    fc.integer({ min: -1, max: 5 }),
    fc.boolean(),
    (x, y, left, top, width, height, index, pointerType, button, isPrimary) => {
      const point = pointInRect(
        { x: left + (width * x), y: top + (height * y) },
        { left, top, width, height },
      );
      assert.ok(Math.abs(point.x - x) < 1e-9);
      assert.ok(Math.abs(point.y - y) < 1e-9);
      assert.ok(splitRatio('horizontal', point) >= 0.1 && splitRatio('horizontal', point) <= 0.9);
      assert.ok(splitRatio('vertical', point) >= 0.1 && splitRatio('vertical', point) <= 0.9);
      assert.equal(tabDropIndex(point.x, index), point.x < 0.5 ? index : index + 1);
      const zone = contentDropZone(point);
      assert.ok(['left', 'right', 'top', 'bottom', 'center'].includes(zone));
      const operation = operationForDrop({
        allocatedSplitIds: { paneId: 'created-pane', splitId: 'created-split' },
        contentUrl: 'viewer',
        contextId: 'context',
        fromResource: false,
        sourcePaneId: null,
      }, 'target-pane', { zone });
      assert.equal(operation.kind, zone === 'center' ? 'workspace.context.move' : 'workspace.context.split');
      assert.equal(
        canStartResize(pointerType, button, isPrimary),
        isPrimary && (pointerType === 'touch' || (pointerType === 'mouse' && button === 0)),
      );
    },
  ), { numRuns: 200 });
});

const planStep = (workspace: WorkspaceState, viewState: WorkspaceViewState, step: Step) => {
  const paneIds = paneIdsInLayoutOrder(workspace);
  const targetPaneId = select(paneIds, step.first);
  if (targetPaneId === undefined || step.kind === 0) {
    return planOpenWorkspaceContext({
      contextId: `opened-${step.first}`,
      isEditorContext,
      nodes: { paneId: `pane-${step.first}`, splitId: `split-${step.first}` },
      pinned: step.pinned,
      viewState,
      url: step.pinned ? `editor:${step.second}` : `viewer:${step.second}`,
      workspace,
    });
  }

  const presentation = composeWorkspacePresentation(workspace, viewState, isEditorContext);
  const mounted = Object.entries(presentation.nodes).flatMap(([paneId, node]) => node.kind === 'pane'
    ? node.contexts.map((contextId) => ({ contextId, paneId }))
    : []);
  const selected = select(mounted, step.second);
  const split = Object.entries(workspace.nodes).filter(([, node]) => node.kind === 'split');
  let action: WorkspaceAction;

  if (step.kind === 1 && selected !== undefined) {
    action = { kind: 'workspace.context.select', contextId: selected.contextId };
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
        viewState,
        url: `viewer:${step.second}`,
        workspace,
      });
    }
    action = { kind: 'workspace.split.resize', splitId: selectedSplit[0], ratio: step.ratio };
  }
  return planWorkspaceAction({ action, viewState, workspace });
};

const assertWorkspaceRelationRoundTrip = (workspace: WorkspaceState) => {
  const relationRows = workspaceRelationRowsFromState(workspace);
  const decoded = workspaceFromRelationRows(relationRows);
  assert.deepEqual(decoded.issues, []);
  assert.deepEqual(decoded.workspace, workspace);
};

const assertActiveEditorFallback = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
) => {
  const withoutHistory = { ...viewState, recentContextIds: [] };
  const presentation = composeWorkspacePresentation(workspace, withoutHistory, isEditorContext);
  const panes = paneIdsInLayoutOrder(workspace).flatMap((paneId) => {
    const pane = presentation.nodes[paneId];
    return pane?.kind === 'pane' ? [{ pane, paneId }] : [];
  });
  const contextIds = new Set([
    ...panes.flatMap(({ pane }) => pane.selectedContext === null ? [] : [pane.selectedContext]),
    ...panes.flatMap(({ pane }) => pane.contexts),
  ]);
  const contextId = [...contextIds].find((candidate) => {
    const url = presentation.contexts[candidate]?.url;
    return url !== undefined && isEditorContext(url);
  });
  const paneId = contextId === undefined
    ? undefined
    : panes.find(({ pane }) => pane.contexts.includes(contextId))?.paneId;
  const expected = contextId === undefined || paneId === undefined ? undefined : { contextId, paneId };
  assert.deepEqual(activeWorkspaceEditor(workspace, withoutHistory, isEditorContext), expected);
};

const assertMountedUrlReuse = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  seed: number,
  pinned: boolean,
) => {
  const presentation = composeWorkspacePresentation(workspace, viewState, isEditorContext);
  const contextId = select(mountedContextIds(presentation), seed);
  if (contextId === undefined) return;
  const url = presentation.contexts[contextId]?.url;
  if (url === undefined) return;
  const existing = workspaceContextForUrl(workspace, viewState, url);
  assert(existing !== undefined);
  const plan = planOpenWorkspaceContext({
    contextId: `duplicate-${seed}`,
    isEditorContext,
    nodes: { paneId: `duplicate-pane-${seed}`, splitId: `duplicate-split-${seed}` },
    pinned,
    viewState,
    url,
    workspace,
  });
  const reusedContextId = plan.viewState.recentContextIds[0];
  if (pinned && existing.kind === 'preview') {
    assert.equal(plan.durableOperation?.kind, 'workspace.context.pin');
    assert.equal(plan.workspace.contexts[existing.contextId]?.url, url);
    assert.equal(plan.viewState.panes[existing.paneId]?.preview, null);
  } else {
    assert.equal(plan.durableOperation, undefined);
    assert.equal(plan.workspace, workspace);
  }
  assert(reusedContextId !== undefined);
  assert.equal(reusedContextId, existing.contextId);
};

const assertContextIdCollisionIsNoOp = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  seed: number,
  pinned: boolean,
) => {
  const presentation = composeWorkspacePresentation(workspace, viewState, isEditorContext);
  const contextId = select(mountedContextIds(presentation), seed);
  if (contextId === undefined) return;
  const plan = planOpenWorkspaceContext({
    contextId,
    isEditorContext,
    nodes: { paneId: `collision-pane-${seed}`, splitId: `collision-split-${seed}` },
    pinned,
    viewState,
    url: `collision:${seed}`,
    workspace,
  });
  assert.deepEqual(plan, { viewState, workspace });
};

const mountedContextIds = (
  presentation: ReturnType<typeof composeWorkspacePresentation>,
) => Object.values(presentation.nodes).flatMap((node) => node.kind === 'pane' ? node.contexts : []);

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
