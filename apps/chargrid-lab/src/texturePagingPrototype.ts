export type TexturePageCoord = {
  readonly textureId: string;
  readonly mipLevel: number;
  readonly pageX: number;
  readonly pageY: number;
};

export type VirtualTextureSpec = {
  readonly textureId: string;
  readonly width: number;
  readonly height: number;
  readonly pageSize: number;
  readonly mipLevels: number;
  readonly bytesPerPixel: number;
};

export type TextureViewport = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly mipLevel: number;
};

export type TextureCacheBudget = {
  readonly scopeId: string;
  readonly cacheId: string;
  readonly maxResidentBytes: number;
  readonly maxAtlasPages: number;
};

export type TexturePageRequestRow = TexturePageCoord & {
  readonly scopeId: string;
  readonly requestId: string;
  readonly frame: number;
  readonly priority: number;
  readonly reason: 'visible';
  readonly status: 'resident' | 'pending' | 'requested';
};

export type TexturePageResidencyRow = TexturePageCoord & {
  readonly scopeId: string;
  readonly resident: boolean;
  readonly atlasPageId?: string;
  readonly byteSize: number;
  readonly lastUsedFrame: number;
  readonly loadedFrame: number;
};

export type TextureCacheBudgetRow = TextureCacheBudget & {
  readonly residentPages: number;
  readonly residentBytes: number;
  readonly pendingPages: number;
  readonly requestedPages: number;
  readonly evictedPages: number;
  readonly visiblePages: number;
};

export type TexturePagingDiagnosticCode =
  | 'texture_missing_page'
  | 'texture_thrash'
  | 'texture_overbudget';

export type TexturePagingDiagnostic = {
  readonly code: TexturePagingDiagnosticCode;
  readonly message: string;
  readonly relation?: 'texture_page_request' | 'texture_page_residency' | 'texture_cache_budget';
  readonly field?: string;
  readonly key?: string;
  readonly detail?: unknown;
};

export type TexturePagingFrame = {
  readonly scopeId: string;
  readonly frame: number;
  readonly visiblePages: readonly TexturePageCoord[];
  readonly requestRows: readonly TexturePageRequestRow[];
  readonly residencyRows: readonly TexturePageResidencyRow[];
  readonly budgetRow: TextureCacheBudgetRow;
  readonly evictedPages: readonly TexturePageCoord[];
  readonly diagnostics: readonly TexturePagingDiagnostic[];
};

export type TexturePagingState = {
  readonly scopeId: string;
  readonly cacheId: string;
  readonly residentPages: ReadonlyMap<string, TextureResidentPage>;
  readonly pendingPages: ReadonlyMap<string, TexturePageCoord>;
  readonly freeAtlasPageIds: readonly string[];
  readonly nextFrame: number;
};

export type TextureResidentPage = TexturePageCoord & {
  readonly atlasPageId: string;
  readonly byteSize: number;
  readonly loadedFrame: number;
  readonly lastUsedFrame: number;
};

type MutableTexturePagingState = {
  scopeId: string;
  cacheId: string;
  residentPages: Map<string, TextureResidentPage>;
  pendingPages: Map<string, TexturePageCoord>;
  freeAtlasPageIds: string[];
  nextFrame: number;
};

export function createTexturePagingState(input?: {
  readonly scopeId?: string;
  readonly cacheId?: string;
  readonly atlasPagePrefix?: string;
  readonly maxAtlasPages?: number;
}): TexturePagingState {
  const maxAtlasPages = input?.maxAtlasPages ?? 0;
  const prefix = input?.atlasPagePrefix ?? 'atlas-page';

  return freezeState({
    scopeId: input?.scopeId ?? 'royal',
    cacheId: input?.cacheId ?? 'royal-texture-cache',
    residentPages: new Map(),
    pendingPages: new Map(),
    freeAtlasPageIds: Array.from({ length: maxAtlasPages }, (_, index) => `${prefix}-${index}`),
    nextFrame: 1
  });
}

export function selectVisibleTexturePages(
  spec: VirtualTextureSpec,
  viewport: TextureViewport,
  input?: { readonly preloadBorderPages?: number }
): readonly TexturePageCoord[] {
  assertSpec(spec);
  const mipLevel = clampInteger(viewport.mipLevel, 0, spec.mipLevels - 1);
  const mipScale = 2 ** mipLevel;
  const mipWidth = mipDimension(spec.width, mipLevel);
  const mipHeight = mipDimension(spec.height, mipLevel);
  const pageColumns = Math.ceil(mipWidth / spec.pageSize);
  const pageRows = Math.ceil(mipHeight / spec.pageSize);
  const border = Math.max(0, Math.floor(input?.preloadBorderPages ?? 0));
  const minX = Math.max(0, Math.floor(viewport.x / mipScale));
  const minY = Math.max(0, Math.floor(viewport.y / mipScale));
  const maxX = Math.min(mipWidth, Math.ceil((viewport.x + viewport.width) / mipScale));
  const maxY = Math.min(mipHeight, Math.ceil((viewport.y + viewport.height) / mipScale));

  if (viewport.width <= 0 || viewport.height <= 0 || maxX <= minX || maxY <= minY) {
    return [];
  }

  const firstPageX = clampInteger(Math.floor(minX / spec.pageSize) - border, 0, pageColumns - 1);
  const firstPageY = clampInteger(Math.floor(minY / spec.pageSize) - border, 0, pageRows - 1);
  const lastPageX = clampInteger(Math.floor((maxX - 1) / spec.pageSize) + border, 0, pageColumns - 1);
  const lastPageY = clampInteger(Math.floor((maxY - 1) / spec.pageSize) + border, 0, pageRows - 1);
  const pages: TexturePageCoord[] = [];

  for (let pageY = firstPageY; pageY <= lastPageY; pageY += 1) {
    for (let pageX = firstPageX; pageX <= lastPageX; pageX += 1) {
      pages.push({ textureId: spec.textureId, mipLevel, pageX, pageY });
    }
  }

  return pages;
}

export function simulateTexturePagingFrame(
  previousState: TexturePagingState,
  spec: VirtualTextureSpec,
  budget: TextureCacheBudget,
  viewport: TextureViewport,
  input?: {
    readonly preloadBorderPages?: number;
    readonly completeRequestedPages?: boolean;
    readonly thrashEvictionThreshold?: number;
  }
): { readonly state: TexturePagingState; readonly frame: TexturePagingFrame } {
  assertSpec(spec);
  const state = thawState(previousState, budget);
  const frame = state.nextFrame;
  const visiblePages = selectVisibleTexturePages(
    spec,
    viewport,
    input?.preloadBorderPages === undefined ? undefined : { preloadBorderPages: input.preloadBorderPages }
  );
  const visibleKeys = new Set(visiblePages.map(texturePageKey));
  const requestRows: TexturePageRequestRow[] = [];
  const requestedPages: TexturePageCoord[] = [];

  touchResidentPages(state, visibleKeys, frame);

  visiblePages.forEach((page, priority) => {
    const key = texturePageKey(page);
    const resident = state.residentPages.get(key);
    const pending = state.pendingPages.get(key);

    if (resident !== undefined) {
      requestRows.push(requestRow(state.scopeId, page, frame, priority, 'resident'));
      return;
    }

    if (pending !== undefined) {
      requestRows.push(requestRow(state.scopeId, page, frame, priority, 'pending'));
      return;
    }

    state.pendingPages.set(key, page);
    requestedPages.push(page);
    requestRows.push(requestRow(state.scopeId, page, frame, priority, 'requested'));
  });

  const completedPages = input?.completeRequestedPages === false ? [] : requestedPages;
  const evictedPages = completePages(state, spec, budget, completedPages, visibleKeys, frame);
  state.nextFrame = frame + 1;

  const residencyRows = Array.from(state.residentPages.values())
    .sort(compareResidentPages)
    .map((page) => residencyRow(state.scopeId, page));
  const budgetRow = budgetRowFor(
    budget,
    state,
    countResidentBytes(state),
    requestedPages.length,
    evictedPages.length,
    visiblePages.length
  );
  const diagnostics = deriveDiagnostics({
    budget,
    state,
    visiblePages,
    requestedPages,
    evictedPages,
    residentBytes: budgetRow.residentBytes,
    thrashEvictionThreshold: input?.thrashEvictionThreshold ?? 1
  });

  return {
    state: freezeState(state),
    frame: {
      scopeId: state.scopeId,
      frame,
      visiblePages,
      requestRows,
      residencyRows,
      budgetRow,
      evictedPages,
      diagnostics
    }
  };
}

export function estimateFullTextureBytes(spec: VirtualTextureSpec): number {
  assertSpec(spec);
  let bytes = 0;

  for (let mipLevel = 0; mipLevel < spec.mipLevels; mipLevel += 1) {
    bytes += mipDimension(spec.width, mipLevel) * mipDimension(spec.height, mipLevel) * spec.bytesPerPixel;
  }

  return bytes;
}

export function estimatePagedVisibleBytes(spec: VirtualTextureSpec, pages: readonly TexturePageCoord[]): number {
  assertSpec(spec);
  return pages.reduce((total, page) => total + pageByteSize(spec, page), 0);
}

export function texturePageKey(page: TexturePageCoord): string {
  return `${page.textureId}:m${page.mipLevel}:x${page.pageX}:y${page.pageY}`;
}

function completePages(
  state: MutableTexturePagingState,
  spec: VirtualTextureSpec,
  budget: TextureCacheBudget,
  pages: readonly TexturePageCoord[],
  visibleKeys: ReadonlySet<string>,
  frame: number
): readonly TexturePageCoord[] {
  const evictedPages: TexturePageCoord[] = [];

  for (const page of pages) {
    const key = texturePageKey(page);
    state.pendingPages.delete(key);

    if (state.residentPages.has(key)) {
      continue;
    }

    evictedPages.push(...ensureRoomForPage(state, budget, pageByteSize(spec, page), visibleKeys));
    const atlasPageId = state.freeAtlasPageIds.shift() ?? `overbudget-${key}`;
    state.residentPages.set(key, {
      ...page,
      atlasPageId,
      byteSize: pageByteSize(spec, page),
      loadedFrame: frame,
      lastUsedFrame: frame
    });
  }

  evictedPages.push(...evictUntilWithinBudget(state, budget, visibleKeys));

  return evictedPages;
}

function ensureRoomForPage(
  state: MutableTexturePagingState,
  budget: TextureCacheBudget,
  byteSize: number,
  protectedKeys: ReadonlySet<string>
): readonly TexturePageCoord[] {
  const evictedPages: TexturePageCoord[] = [];

  while (
    state.residentPages.size >= budget.maxAtlasPages ||
    countResidentBytes(state) + byteSize > budget.maxResidentBytes
  ) {
    const victim = lruVictim(state, protectedKeys);

    if (victim === undefined) {
      break;
    }

    evictedPages.push(evictResidentPage(state, victim));
  }

  return evictedPages;
}

function evictUntilWithinBudget(
  state: MutableTexturePagingState,
  budget: TextureCacheBudget,
  protectedKeys: ReadonlySet<string>
): readonly TexturePageCoord[] {
  const evictedPages: TexturePageCoord[] = [];

  while (state.residentPages.size > budget.maxAtlasPages || countResidentBytes(state) > budget.maxResidentBytes) {
    const victim = lruVictim(state, protectedKeys);

    if (victim === undefined) {
      break;
    }

    evictedPages.push(evictResidentPage(state, victim));
  }

  return evictedPages;
}

function evictResidentPage(state: MutableTexturePagingState, page: TextureResidentPage): TexturePageCoord {
  state.residentPages.delete(texturePageKey(page));
  state.freeAtlasPageIds.push(page.atlasPageId);
  state.freeAtlasPageIds.sort();

  return pageCoord(page);
}

function lruVictim(
  state: MutableTexturePagingState,
  protectedKeys: ReadonlySet<string>
): TextureResidentPage | undefined {
  const candidates = Array.from(state.residentPages.values())
    .filter((page) => !protectedKeys.has(texturePageKey(page)))
    .sort(compareResidentPages);

  return candidates[0];
}

function deriveDiagnostics(input: {
  readonly budget: TextureCacheBudget;
  readonly state: MutableTexturePagingState;
  readonly visiblePages: readonly TexturePageCoord[];
  readonly requestedPages: readonly TexturePageCoord[];
  readonly evictedPages: readonly TexturePageCoord[];
  readonly residentBytes: number;
  readonly thrashEvictionThreshold: number;
}): readonly TexturePagingDiagnostic[] {
  const diagnostics: TexturePagingDiagnostic[] = [];
  const missingPages = input.visiblePages.filter((page) => !input.state.residentPages.has(texturePageKey(page)));

  if (missingPages.length > 0) {
    const firstMissingKey = missingPages[0] === undefined ? undefined : texturePageKey(missingPages[0]);

    diagnostics.push({
      code: 'texture_missing_page',
      message: `${missingPages.length} visible texture page(s) are not resident`,
      relation: 'texture_page_request',
      field: 'status',
      ...(firstMissingKey === undefined ? {} : { key: firstMissingKey }),
      detail: { missingPageKeys: missingPages.map(texturePageKey) }
    });
  }

  if (
    input.residentBytes > input.budget.maxResidentBytes ||
    input.state.residentPages.size > input.budget.maxAtlasPages
  ) {
    diagnostics.push({
      code: 'texture_overbudget',
      message: 'resident texture pages exceed cache budget',
      relation: 'texture_cache_budget',
      field: 'maxResidentBytes',
      key: input.budget.cacheId,
      detail: {
        maxResidentBytes: input.budget.maxResidentBytes,
        residentBytes: input.residentBytes,
        maxAtlasPages: input.budget.maxAtlasPages,
        residentPages: input.state.residentPages.size
      }
    });
  }

  if (
    input.requestedPages.length > 0 &&
    input.evictedPages.length >= input.thrashEvictionThreshold
  ) {
    diagnostics.push({
      code: 'texture_thrash',
      message: 'texture cache evicted resident pages while satisfying visible requests',
      relation: 'texture_page_residency',
      field: 'lastUsedFrame',
      key: texturePageKey(input.evictedPages[0]!),
      detail: {
        requestedPageKeys: input.requestedPages.map(texturePageKey),
        evictedPageKeys: input.evictedPages.map(texturePageKey)
      }
    });
  }

  return diagnostics;
}

function touchResidentPages(
  state: MutableTexturePagingState,
  visibleKeys: ReadonlySet<string>,
  frame: number
): void {
  for (const key of visibleKeys) {
    const page = state.residentPages.get(key);

    if (page !== undefined) {
      state.residentPages.set(key, { ...page, lastUsedFrame: frame });
    }
  }
}

function requestRow(
  scopeId: string,
  page: TexturePageCoord,
  frame: number,
  priority: number,
  status: TexturePageRequestRow['status']
): TexturePageRequestRow {
  return {
    scopeId,
    requestId: `${frame}:${texturePageKey(page)}`,
    frame,
    priority,
    reason: 'visible',
    status,
    ...page
  };
}

function residencyRow(scopeId: string, page: TextureResidentPage): TexturePageResidencyRow {
  return {
    scopeId,
    resident: true,
    atlasPageId: page.atlasPageId,
    byteSize: page.byteSize,
    lastUsedFrame: page.lastUsedFrame,
    loadedFrame: page.loadedFrame,
    textureId: page.textureId,
    mipLevel: page.mipLevel,
    pageX: page.pageX,
    pageY: page.pageY
  };
}

function budgetRowFor(
  budget: TextureCacheBudget,
  state: MutableTexturePagingState,
  residentBytes: number,
  requestedPages: number,
  evictedPages: number,
  visiblePages: number
): TextureCacheBudgetRow {
  return {
    ...budget,
    residentPages: state.residentPages.size,
    residentBytes,
    pendingPages: state.pendingPages.size,
    requestedPages,
    evictedPages,
    visiblePages
  };
}

function pageByteSize(spec: VirtualTextureSpec, page: TexturePageCoord): number {
  const mipWidth = mipDimension(spec.width, page.mipLevel);
  const mipHeight = mipDimension(spec.height, page.mipLevel);
  const pageWidth = Math.min(spec.pageSize, mipWidth - page.pageX * spec.pageSize);
  const pageHeight = Math.min(spec.pageSize, mipHeight - page.pageY * spec.pageSize);

  return Math.max(0, pageWidth) * Math.max(0, pageHeight) * spec.bytesPerPixel;
}

function mipDimension(value: number, mipLevel: number): number {
  return Math.max(1, Math.ceil(value / 2 ** mipLevel));
}

function countResidentBytes(state: MutableTexturePagingState): number {
  let bytes = 0;

  for (const page of state.residentPages.values()) {
    bytes += page.byteSize;
  }

  return bytes;
}

function compareResidentPages(left: TextureResidentPage, right: TextureResidentPage): number {
  return (
    left.lastUsedFrame - right.lastUsedFrame ||
    left.loadedFrame - right.loadedFrame ||
    left.mipLevel - right.mipLevel ||
    left.pageY - right.pageY ||
    left.pageX - right.pageX ||
    left.textureId.localeCompare(right.textureId)
  );
}

function assertSpec(spec: VirtualTextureSpec): void {
  if (
    spec.width <= 0 ||
    spec.height <= 0 ||
    spec.pageSize <= 0 ||
    spec.mipLevels <= 0 ||
    spec.bytesPerPixel <= 0
  ) {
    throw new Error('virtual texture spec dimensions, page size, mip levels, and byte size must be positive');
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function pageCoord(page: TexturePageCoord): TexturePageCoord {
  return {
    textureId: page.textureId,
    mipLevel: page.mipLevel,
    pageX: page.pageX,
    pageY: page.pageY
  };
}

function freezeState(state: MutableTexturePagingState): TexturePagingState {
  return {
    scopeId: state.scopeId,
    cacheId: state.cacheId,
    residentPages: new Map(state.residentPages),
    pendingPages: new Map(state.pendingPages),
    freeAtlasPageIds: [...state.freeAtlasPageIds],
    nextFrame: state.nextFrame
  };
}

function thawState(state: TexturePagingState, budget: TextureCacheBudget): MutableTexturePagingState {
  const freeAtlasPageIds = [...state.freeAtlasPageIds];

  for (let index = state.residentPages.size + freeAtlasPageIds.length; index < budget.maxAtlasPages; index += 1) {
    freeAtlasPageIds.push(`atlas-page-${index}`);
  }

  return {
    scopeId: state.scopeId,
    cacheId: state.cacheId,
    residentPages: new Map(state.residentPages),
    pendingPages: new Map(state.pendingPages),
    freeAtlasPageIds,
    nextFrame: state.nextFrame
  };
}
