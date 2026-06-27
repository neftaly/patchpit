export type TextureAtlasPolicy = {
  readonly scopeId?: string;
  readonly atlasId?: string;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly maxPages?: number;
  readonly padding?: number;
  readonly gutter?: number;
  readonly bytesPerPixel?: number;
};

export type TextureAtlasAssetRequest = {
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly version?: string;
  readonly frame?: number;
};

export type TextureAtlasHandle = {
  readonly assetId: string;
  readonly handleId: string;
  readonly pageId: string;
  readonly pageIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly uploadX: number;
  readonly uploadY: number;
  readonly uploadWidth: number;
  readonly uploadHeight: number;
  readonly contentX: number;
  readonly contentY: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
};

export type AtlasPageRow = {
  readonly relation: 'atlas_page';
  readonly scopeId: string;
  readonly atlasId: string;
  readonly pageId: string;
  readonly pageIndex: number;
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly gutter: number;
  readonly allocations: number;
  readonly occupiedPixels: number;
  readonly freePixels: number;
  readonly fragmentedPixels: number;
};

export type AtlasAllocationRow = {
  readonly relation: 'atlas_allocation';
  readonly scopeId: string;
  readonly atlasId: string;
  readonly assetId: string;
  readonly handleId: string;
  readonly pageId: string;
  readonly pageIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly uploadX: number;
  readonly uploadY: number;
  readonly uploadWidth: number;
  readonly uploadHeight: number;
  readonly contentX: number;
  readonly contentY: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly version: string;
  readonly lastUsedFrame: number;
};

export type TextureUploadRow = {
  readonly relation: 'texture_upload';
  readonly scopeId: string;
  readonly atlasId: string;
  readonly uploadId: string;
  readonly assetId: string;
  readonly handleId: string;
  readonly pageId: string;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly reason: 'allocated' | 'content_changed';
};

export type TextureAtlasDiagnosticCode = 'atlas_oversized' | 'atlas_fragmented' | 'texture_evicted';

export type TextureAtlasDiagnostic = {
  readonly code: TextureAtlasDiagnosticCode;
  readonly message: string;
  readonly relation?: 'atlas_page' | 'atlas_allocation' | 'texture_upload';
  readonly key?: string;
  readonly detail?: unknown;
};

export type TextureAtlasRows = {
  readonly atlas_page: readonly AtlasPageRow[];
  readonly atlas_allocation: readonly AtlasAllocationRow[];
  readonly texture_upload: readonly TextureUploadRow[];
  readonly diagnostics: readonly TextureAtlasDiagnostic[];
};

export type TextureAtlasState = {
  readonly scopeId: string;
  readonly atlasId: string;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly maxPages: number;
  readonly padding: number;
  readonly gutter: number;
  readonly bytesPerPixel: number;
  readonly pages: readonly TextureAtlasPage[];
  readonly allocationsByAssetId: ReadonlyMap<string, TextureAtlasAllocation>;
  readonly nextUploadSequence: number;
  readonly nextFrame: number;
};

export type TextureAtlasPage = {
  readonly pageId: string;
  readonly pageIndex: number;
  readonly shelves: readonly TextureAtlasShelf[];
};

export type TextureAtlasShelf = {
  readonly y: number;
  readonly height: number;
  readonly nextX: number;
};

export type TextureAtlasAllocation = TextureAtlasHandle & {
  readonly version: string;
  readonly lastUsedFrame: number;
};

export type TextureAtlasRequestResult = {
  readonly state: TextureAtlasState;
  readonly handle?: TextureAtlasHandle;
  readonly rows: TextureAtlasRows;
};

export type TextureAtlasStressResult = {
  readonly cardCount: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly oneTexturePerCardCount: number;
  readonly atlasPageCount: number;
  readonly uploadRowCount: number;
  readonly rejectedCount: number;
  readonly utilization: number;
  readonly diagnostics: readonly TextureAtlasDiagnostic[];
};

type MutableAtlasPage = {
  pageId: string;
  pageIndex: number;
  shelves: TextureAtlasShelf[];
};

type MutableAtlasState = {
  scopeId: string;
  atlasId: string;
  pageWidth: number;
  pageHeight: number;
  maxPages: number;
  padding: number;
  gutter: number;
  bytesPerPixel: number;
  pages: MutableAtlasPage[];
  allocationsByAssetId: Map<string, TextureAtlasAllocation>;
  nextUploadSequence: number;
  nextFrame: number;
};

type PackedRect = {
  readonly page: MutableAtlasPage;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export function createTextureAtlasState(policy: TextureAtlasPolicy): TextureAtlasState {
  assertPositiveInteger(policy.pageWidth, 'pageWidth');
  assertPositiveInteger(policy.pageHeight, 'pageHeight');

  return freezeState({
    scopeId: policy.scopeId ?? 'royal',
    atlasId: policy.atlasId ?? 'royal-card-atlas',
    pageWidth: policy.pageWidth,
    pageHeight: policy.pageHeight,
    maxPages: policy.maxPages ?? Number.MAX_SAFE_INTEGER,
    padding: nonNegativeInteger(policy.padding ?? 1, 'padding'),
    gutter: nonNegativeInteger(policy.gutter ?? 1, 'gutter'),
    bytesPerPixel: nonNegativeInteger(policy.bytesPerPixel ?? 4, 'bytesPerPixel'),
    pages: [],
    allocationsByAssetId: new Map(),
    nextUploadSequence: 1,
    nextFrame: 1
  });
}

export function requestTextureAtlasAllocation(
  previousState: TextureAtlasState,
  request: TextureAtlasAssetRequest
): TextureAtlasRequestResult {
  assertAssetRequest(request);
  const state = thawState(previousState);
  const frame = request.frame ?? state.nextFrame;
  state.nextFrame = Math.max(state.nextFrame, frame + 1);
  const previous = state.allocationsByAssetId.get(request.assetId);

  if (previous !== undefined) {
    const nextAllocation = { ...previous, lastUsedFrame: frame };
    state.allocationsByAssetId.set(request.assetId, nextAllocation);
    const uploadRows =
      previous.version === normalizedVersion(request)
        ? []
        : [uploadRow(state, nextAllocation, nextUploadId(state), frame, 'content_changed')];

    if (uploadRows.length > 0) {
      state.allocationsByAssetId.set(request.assetId, {
        ...nextAllocation,
        version: normalizedVersion(request)
      });
    }

    return resultFromState(state, nextAllocation, uploadRows, []);
  }

  const outerWidth = reservedDimension(state, request.width);
  const outerHeight = reservedDimension(state, request.height);
  if (outerWidth > state.pageWidth || outerHeight > state.pageHeight) {
    return resultFromState(state, undefined, [], [oversizedDiagnostic(state, request, outerWidth, outerHeight)]);
  }

  const placement = placeRect(state, outerWidth, outerHeight);
  if (placement === undefined) {
    return resultFromState(state, undefined, [], [fragmentedDiagnostic(state, request, outerWidth, outerHeight)]);
  }

  const allocation = allocationFromPlacement(state, request, placement, frame);
  state.allocationsByAssetId.set(request.assetId, allocation);

  return resultFromState(state, allocation, [uploadRow(state, allocation, nextUploadId(state), frame, 'allocated')], []);
}

export function evictTextureAtlasAsset(
  previousState: TextureAtlasState,
  assetId: string,
  input?: { readonly frame?: number; readonly reason?: string }
): { readonly state: TextureAtlasState; readonly rows: TextureAtlasRows } {
  const state = thawState(previousState);
  const allocation = state.allocationsByAssetId.get(assetId);
  const frame = input?.frame ?? state.nextFrame;
  state.nextFrame = Math.max(state.nextFrame, frame + 1);

  if (allocation === undefined) {
    return { state: freezeState(state), rows: rowsFromState(state, [], []) };
  }

  state.allocationsByAssetId.delete(assetId);

  return {
    state: freezeState(state),
    rows: rowsFromState(state, [], [evictedDiagnostic(allocation, input?.reason ?? 'evicted')])
  };
}

export function textureAtlasRows(state: TextureAtlasState): TextureAtlasRows {
  const mutable = thawState(state);
  return rowsFromState(mutable, [], []);
}

export function simulateCardTextureStress(
  input: {
    readonly cardCount: number;
    readonly cardWidth?: number;
    readonly cardHeight?: number;
    readonly pageWidth?: number;
    readonly pageHeight?: number;
    readonly padding?: number;
    readonly gutter?: number;
  }
): TextureAtlasStressResult {
  assertPositiveInteger(input.cardCount, 'cardCount');
  const cardWidth = input.cardWidth ?? 128;
  const cardHeight = input.cardHeight ?? 180;
  const state = thawState(createTextureAtlasState({
    atlasId: 'royal-card-stress',
    pageWidth: input.pageWidth ?? 2048,
    pageHeight: input.pageHeight ?? 2048,
    padding: input.padding ?? 2,
    gutter: input.gutter ?? 1
  }));
  let uploadRowCount = 0;
  let rejectedCount = 0;
  const diagnostics: TextureAtlasDiagnostic[] = [];

  for (let index = 0; index < input.cardCount; index += 1) {
    const request = {
      assetId: `card-${index.toString().padStart(5, '0')}`,
      width: cardWidth,
      height: cardHeight,
      version: 'base'
    };
    const outerWidth = reservedDimension(state, request.width);
    const outerHeight = reservedDimension(state, request.height);

    if (outerWidth > state.pageWidth || outerHeight > state.pageHeight) {
      rejectedCount += 1;
      diagnostics.push(oversizedDiagnostic(state, request, outerWidth, outerHeight));
      continue;
    }

    const placement = placeRect(state, outerWidth, outerHeight);
    if (placement === undefined) {
      rejectedCount += 1;
      diagnostics.push(fragmentedDiagnostic(state, request, outerWidth, outerHeight));
      continue;
    }

    state.allocationsByAssetId.set(
      request.assetId,
      allocationFromPlacement(state, request, placement, state.nextFrame)
    );
    state.nextFrame += 1;
    uploadRowCount += 1;
  }

  const occupiedPixels = Array.from(state.allocationsByAssetId.values()).reduce(
    (total, allocation) => total + allocation.width * allocation.height,
    0
  );
  const atlasPixels = state.pages.length * state.pageWidth * state.pageHeight;

  return {
    cardCount: input.cardCount,
    cardWidth,
    cardHeight,
    oneTexturePerCardCount: input.cardCount,
    atlasPageCount: state.pages.length,
    uploadRowCount,
    rejectedCount,
    utilization: atlasPixels === 0 ? 0 : occupiedPixels / atlasPixels,
    diagnostics
  };
}

export function textureAtlasHandleKey(handle: TextureAtlasHandle): string {
  return `${handle.pageId}:${handle.assetId}:${handle.contentX},${handle.contentY}:${handle.contentWidth}x${handle.contentHeight}`;
}

function resultFromState(
  state: MutableAtlasState,
  handle: TextureAtlasHandle | undefined,
  uploadRows: readonly TextureUploadRow[],
  diagnostics: readonly TextureAtlasDiagnostic[]
): TextureAtlasRequestResult {
  const frozenState = freezeState(state);
  return {
    state: frozenState,
    ...(handle === undefined ? {} : { handle: stableHandle(handle) }),
    rows: rowsFromState(thawState(frozenState), uploadRows, diagnostics)
  };
}

function stableHandle(handle: TextureAtlasHandle): TextureAtlasHandle {
  return {
    assetId: handle.assetId,
    handleId: handle.handleId,
    pageId: handle.pageId,
    pageIndex: handle.pageIndex,
    x: handle.x,
    y: handle.y,
    width: handle.width,
    height: handle.height,
    uploadX: handle.uploadX,
    uploadY: handle.uploadY,
    uploadWidth: handle.uploadWidth,
    uploadHeight: handle.uploadHeight,
    contentX: handle.contentX,
    contentY: handle.contentY,
    contentWidth: handle.contentWidth,
    contentHeight: handle.contentHeight
  };
}

function rowsFromState(
  state: MutableAtlasState,
  uploadRows: readonly TextureUploadRow[],
  diagnostics: readonly TextureAtlasDiagnostic[]
): TextureAtlasRows {
  const allocations = Array.from(state.allocationsByAssetId.values()).sort(compareAllocations);

  return {
    atlas_page: state.pages.map((page) => pageRow(state, page)),
    atlas_allocation: allocations.map((allocation) => allocationRow(state, allocation)),
    texture_upload: uploadRows,
    diagnostics
  };
}

function pageRow(state: MutableAtlasState, page: MutableAtlasPage): AtlasPageRow {
  const allocations = Array.from(state.allocationsByAssetId.values()).filter(
    (allocation) => allocation.pageId === page.pageId
  );
  const occupiedPixels = allocations.reduce((total, allocation) => total + allocation.width * allocation.height, 0);
  const shelfPixels = page.shelves.reduce((total, shelf) => total + shelf.nextX * shelf.height, 0);
  const pagePixels = state.pageWidth * state.pageHeight;

  return {
    relation: 'atlas_page',
    scopeId: state.scopeId,
    atlasId: state.atlasId,
    pageId: page.pageId,
    pageIndex: page.pageIndex,
    width: state.pageWidth,
    height: state.pageHeight,
    padding: state.padding,
    gutter: state.gutter,
    allocations: allocations.length,
    occupiedPixels,
    freePixels: Math.max(0, pagePixels - occupiedPixels),
    fragmentedPixels: Math.max(0, shelfPixels - occupiedPixels)
  };
}

function allocationRow(state: MutableAtlasState, allocation: TextureAtlasAllocation): AtlasAllocationRow {
  return {
    relation: 'atlas_allocation',
    scopeId: state.scopeId,
    atlasId: state.atlasId,
    assetId: allocation.assetId,
    handleId: allocation.handleId,
    pageId: allocation.pageId,
    pageIndex: allocation.pageIndex,
    x: allocation.x,
    y: allocation.y,
    width: allocation.width,
    height: allocation.height,
    uploadX: allocation.uploadX,
    uploadY: allocation.uploadY,
    uploadWidth: allocation.uploadWidth,
    uploadHeight: allocation.uploadHeight,
    contentX: allocation.contentX,
    contentY: allocation.contentY,
    contentWidth: allocation.contentWidth,
    contentHeight: allocation.contentHeight,
    version: allocation.version,
    lastUsedFrame: allocation.lastUsedFrame
  };
}

function uploadRow(
  state: MutableAtlasState,
  allocation: TextureAtlasAllocation,
  uploadId: string,
  frame: number,
  reason: TextureUploadRow['reason']
): TextureUploadRow {
  return {
    relation: 'texture_upload',
    scopeId: state.scopeId,
    atlasId: state.atlasId,
    uploadId,
    assetId: allocation.assetId,
    handleId: allocation.handleId,
    pageId: allocation.pageId,
    frame,
    x: allocation.uploadX,
    y: allocation.uploadY,
    width: allocation.uploadWidth,
    height: allocation.uploadHeight,
    reason
  };
}

function allocationFromPlacement(
  state: MutableAtlasState,
  request: TextureAtlasAssetRequest,
  placement: PackedRect,
  frame: number
): TextureAtlasAllocation {
  const inset = atlasInset(state);
  const uploadX = placement.x + state.padding;
  const uploadY = placement.y + state.padding;

  return {
    assetId: request.assetId,
    handleId: `${state.atlasId}:${request.assetId}`,
    pageId: placement.page.pageId,
    pageIndex: placement.page.pageIndex,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    uploadX,
    uploadY,
    uploadWidth: request.width + state.gutter * 2,
    uploadHeight: request.height + state.gutter * 2,
    contentX: placement.x + inset,
    contentY: placement.y + inset,
    contentWidth: request.width,
    contentHeight: request.height,
    version: normalizedVersion(request),
    lastUsedFrame: frame
  };
}

function placeRect(state: MutableAtlasState, width: number, height: number): PackedRect | undefined {
  for (const page of state.pages) {
    const rect = placeRectOnPage(page, state.pageWidth, state.pageHeight, width, height);
    if (rect !== undefined) {
      return rect;
    }
  }

  if (state.pages.length >= state.maxPages) {
    return undefined;
  }

  const page = createPage(state);
  state.pages.push(page);
  return placeRectOnPage(page, state.pageWidth, state.pageHeight, width, height);
}

function placeRectOnPage(
  page: MutableAtlasPage,
  pageWidth: number,
  pageHeight: number,
  width: number,
  height: number
): PackedRect | undefined {
  for (let index = 0; index < page.shelves.length; index += 1) {
    const shelf = page.shelves[index];
    if (shelf === undefined || height > shelf.height || shelf.nextX + width > pageWidth) {
      continue;
    }

    page.shelves[index] = { ...shelf, nextX: shelf.nextX + width };
    return { page, x: shelf.nextX, y: shelf.y, width, height };
  }

  const y = page.shelves.reduce((maxY, shelf) => Math.max(maxY, shelf.y + shelf.height), 0);
  if (y + height > pageHeight) {
    return undefined;
  }

  page.shelves.push({ y, height, nextX: width });
  return { page, x: 0, y, width, height };
}

function createPage(state: MutableAtlasState): MutableAtlasPage {
  const pageIndex = state.pages.length;
  return {
    pageId: `${state.atlasId}-page-${pageIndex}`,
    pageIndex,
    shelves: []
  };
}

function fragmentedDiagnostic(
  state: MutableAtlasState,
  request: TextureAtlasAssetRequest,
  width: number,
  height: number
): TextureAtlasDiagnostic {
  const requestedPixels = width * height;
  const pageSummaries = state.pages.map((page) => {
    const row = pageRow(state, page);
    return {
      pageId: page.pageId,
      freePixels: row.freePixels,
      fragmentedPixels: row.fragmentedPixels
    };
  });

  return {
    code: 'atlas_fragmented',
    relation: 'atlas_page',
    key: request.assetId,
    message: `Texture asset ${request.assetId} could not fit in any available atlas page.`,
    detail: {
      requestedPixels,
      requestedWidth: width,
      requestedHeight: height,
      pageSummaries
    }
  };
}

function oversizedDiagnostic(
  state: MutableAtlasState,
  request: TextureAtlasAssetRequest,
  width: number,
  height: number
): TextureAtlasDiagnostic {
  return {
    code: 'atlas_oversized',
    relation: 'atlas_allocation',
    key: request.assetId,
    message: `Texture asset ${request.assetId} exceeds atlas page dimensions after padding and gutter.`,
    detail: {
      requestedWidth: width,
      requestedHeight: height,
      pageWidth: state.pageWidth,
      pageHeight: state.pageHeight
    }
  };
}

function evictedDiagnostic(allocation: TextureAtlasAllocation, reason: string): TextureAtlasDiagnostic {
  return {
    code: 'texture_evicted',
    relation: 'atlas_allocation',
    key: allocation.assetId,
    message: `Texture asset ${allocation.assetId} was evicted from ${allocation.pageId}.`,
    detail: {
      reason,
      pageId: allocation.pageId,
      handleId: allocation.handleId
    }
  };
}

function nextUploadId(state: MutableAtlasState): string {
  const uploadId = `${state.atlasId}-upload-${state.nextUploadSequence}`;
  state.nextUploadSequence += 1;
  return uploadId;
}

function reservedDimension(state: MutableAtlasState, dimension: number): number {
  return dimension + atlasInset(state) * 2;
}

function atlasInset(state: MutableAtlasState): number {
  return state.padding + state.gutter;
}

function normalizedVersion(request: TextureAtlasAssetRequest): string {
  return request.version ?? 'initial';
}

function compareAllocations(left: TextureAtlasAllocation, right: TextureAtlasAllocation): number {
  if (left.pageIndex !== right.pageIndex) {
    return left.pageIndex - right.pageIndex;
  }

  if (left.y !== right.y) {
    return left.y - right.y;
  }

  if (left.x !== right.x) {
    return left.x - right.x;
  }

  return left.assetId.localeCompare(right.assetId);
}

function thawState(state: TextureAtlasState): MutableAtlasState {
  return {
    scopeId: state.scopeId,
    atlasId: state.atlasId,
    pageWidth: state.pageWidth,
    pageHeight: state.pageHeight,
    maxPages: state.maxPages,
    padding: state.padding,
    gutter: state.gutter,
    bytesPerPixel: state.bytesPerPixel,
    pages: state.pages.map((page) => ({
      pageId: page.pageId,
      pageIndex: page.pageIndex,
      shelves: page.shelves.map((shelf) => ({ ...shelf }))
    })),
    allocationsByAssetId: new Map(state.allocationsByAssetId),
    nextUploadSequence: state.nextUploadSequence,
    nextFrame: state.nextFrame
  };
}

function freezeState(state: MutableAtlasState): TextureAtlasState {
  return {
    scopeId: state.scopeId,
    atlasId: state.atlasId,
    pageWidth: state.pageWidth,
    pageHeight: state.pageHeight,
    maxPages: state.maxPages,
    padding: state.padding,
    gutter: state.gutter,
    bytesPerPixel: state.bytesPerPixel,
    pages: state.pages.map((page) => ({
      pageId: page.pageId,
      pageIndex: page.pageIndex,
      shelves: page.shelves.map((shelf) => ({ ...shelf }))
    })),
    allocationsByAssetId: new Map(state.allocationsByAssetId),
    nextUploadSequence: state.nextUploadSequence,
    nextFrame: state.nextFrame
  };
}

function assertAssetRequest(request: TextureAtlasAssetRequest): void {
  if (request.assetId.trim() === '') {
    throw new Error('assetId must not be empty');
  }
  assertPositiveInteger(request.width, 'width');
  assertPositiveInteger(request.height, 'height');
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
}
