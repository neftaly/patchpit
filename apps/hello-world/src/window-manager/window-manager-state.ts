import {
  currentFocusId,
  SplitDirection,
  type WindowLayoutNode,
  WindowManagerNodeKind,
  type WindowPane,
  type WindowManagerStateDoc,
  type WindowTab,
  WindowTabKind,
} from '../filesystem';

export function focusTab(state: WindowManagerStateDoc, paneId: string, tabId: string): void {
  const pane = paneById(state, paneId);
  if (state.tabs[tabId] !== undefined) selectTab(state, pane, tabId);
}

export function closeTab(state: WindowManagerStateDoc, paneId: string, tabId: string): void {
  const pane = paneById(state, paneId);
  const index = paneTabIds(state, pane).indexOf(tabId);
  const wasSelected = pane.selectedTabId === tabId;

  removePaneTab(state, pane.id, tabId);
  if (!isTabReferenced(state, tabId)) delete state.tabs[tabId];
  if (wasSelected) pane.selectedTabId = paneTabIds(state, pane).at(Math.max(0, index - 1)) ?? null;
  focusPane(state, pane.id);
}

export function openTab(state: WindowManagerStateDoc, url: string): void {
  const pane = focusedPane(state);
  const tab = findPaneTabByUrl(state, pane, url) ?? addTab(state, pane, url, false);

  clearPreviewsExcept(state, pane, tab.id);
  tab.temporary = false;
  selectTab(state, pane, tab.id);
}

export function previewTab(state: WindowManagerStateDoc, url: string): void {
  const pane = focusedPane(state);
  const tab = findPaneTabByUrl(state, pane, url) ?? addTab(state, pane, url, true);

  if (tab.temporary) clearPreviewsExcept(state, pane, tab.id);
  selectTab(state, pane, tab.id);
}

export function splitPane(state: WindowManagerStateDoc, paneId: string, direction: SplitDirection): void {
  const pane = paneById(state, paneId);
  const tabId = pane.selectedTabId;
  const newPane = createPane(nextPaneId(state.panes));

  if (tabId !== null && state.tabs[tabId] !== undefined) {
    removePaneTab(state, pane.id, tabId);
    addPaneTab(state, newPane.id, tabId);
    state.tabs[tabId].temporary = false;
    newPane.selectedTabId = tabId;
    pane.selectedTabId = paneTabIds(state, pane).at(0) ?? null;
  }

  state.panes[newPane.id] = newPane;
  state.layout = splitPaneInLayout(state.layout, pane.id, newPane.id, direction);
  focusPane(state, newPane.id);
}

function focusedPane(state: WindowManagerStateDoc): WindowPane {
  const paneId = state.focus[currentFocusId]?.paneId;
  return (paneId === undefined ? undefined : state.panes[paneId]) ?? state.panes.main ?? createPane('main');
}

function paneById(state: WindowManagerStateDoc, paneId: string): WindowPane {
  return state.panes[paneId] ?? focusedPane(state);
}

function createPane(id: string): WindowPane {
  return { id, selectedTabId: null };
}

function addTab(
  state: WindowManagerStateDoc,
  pane: WindowPane,
  url: string,
  temporary: boolean,
): WindowTab {
  const tab = { id: nextTabId(state), kind: WindowTabKind.Viewer, targetUrl: url, temporary };
  state.tabs[tab.id] = tab;
  addPaneTab(state, pane.id, tab.id);
  return tab;
}

function selectTab(state: WindowManagerStateDoc, pane: WindowPane, tabId: string): void {
  pane.selectedTabId = tabId;
  focusPane(state, pane.id);
}

function focusPane(state: WindowManagerStateDoc, paneId: string): void {
  state.focus[currentFocusId] = { id: currentFocusId, paneId };
}

function findPaneTabByUrl(
  state: WindowManagerStateDoc,
  pane: WindowPane,
  url: string,
): WindowTab | undefined {
  return paneTabIds(state, pane)
    .map((id) => state.tabs[id])
    .find((tab): tab is WindowTab => tab !== undefined && tab.targetUrl === url);
}

function paneTabIds(state: WindowManagerStateDoc, pane: WindowPane): string[] {
  return Object.values(state.paneTabs)
    .filter((row) => row.paneId === pane.id)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((row) => row.tabId);
}

function addPaneTab(state: WindowManagerStateDoc, paneId: string, tabId: string): void {
  const id = `${paneId}:${tabId}`;
  state.paneTabs[id] = { id, order: nextPaneTabOrder(state, paneId), paneId, tabId };
}

function removePaneTab(state: WindowManagerStateDoc, paneId: string, tabId: string): void {
  for (const row of Object.values(state.paneTabs)) {
    if (row.paneId === paneId && row.tabId === tabId) delete state.paneTabs[row.id];
  }
}

function clearPreviewsExcept(state: WindowManagerStateDoc, pane: WindowPane, keptTabId: string): void {
  for (const tabId of paneTabIds(state, pane)) {
    if (tabId === keptTabId || !state.tabs[tabId]?.temporary) continue;
    removePaneTab(state, pane.id, tabId);
    if (!isTabReferenced(state, tabId)) delete state.tabs[tabId];
  }
}

function isTabReferenced(state: WindowManagerStateDoc, tabId: string): boolean {
  return Object.values(state.paneTabs).some((row) => row.tabId === tabId);
}

function nextPaneTabOrder(state: WindowManagerStateDoc, paneId: string): number {
  const orders = Object.values(state.paneTabs)
    .filter((row) => row.paneId === paneId)
    .map((row) => row.order);
  return Math.max(-1, ...orders) + 1;
}

function nextPaneId(panes: Readonly<Record<string, WindowPane>>): string {
  for (let index = Object.keys(panes).length + 1; ; index += 1) {
    const id = `pane-${index}`;
    if (panes[id] === undefined) return id;
  }
}

function nextTabId(state: WindowManagerStateDoc): string {
  for (let index = Object.keys(state.tabs).length + 1; ; index += 1) {
    const id = `tab-${index}`;
    if (state.tabs[id] === undefined) return id;
  }
}

function splitPaneInLayout(
  node: WindowLayoutNode,
  paneId: string,
  newPaneId: string,
  direction: SplitDirection,
): WindowLayoutNode {
  if (node.kind === WindowManagerNodeKind.Pane) {
    return node.paneId === paneId
      ? {
          children: [
            node,
            { kind: WindowManagerNodeKind.Pane, paneId: newPaneId },
          ],
          direction,
          kind: WindowManagerNodeKind.Split,
          sizes: [1, 1],
        }
      : node;
  }

  return {
    ...node,
    children: node.children.map((child) => splitPaneInLayout(child, paneId, newPaneId, direction)),
  };
}
