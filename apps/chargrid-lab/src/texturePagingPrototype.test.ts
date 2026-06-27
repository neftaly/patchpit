import { describe, expect, it } from 'vitest';
import {
  createTexturePagingState,
  estimateFullTextureBytes,
  estimatePagedVisibleBytes,
  selectVisibleTexturePages,
  simulateTexturePagingFrame,
  texturePageKey,
  type TextureCacheBudget,
  type TextureViewport,
  type VirtualTextureSpec
} from './texturePagingPrototype';

const spec: VirtualTextureSpec = {
  textureId: 'royal-board',
  width: 1024,
  height: 1024,
  pageSize: 256,
  mipLevels: 4,
  bytesPerPixel: 4
};

const roomyBudget: TextureCacheBudget = {
  scopeId: 'royal',
  cacheId: 'texture-cache',
  maxResidentBytes: 256 * 256 * 4 * 16,
  maxAtlasPages: 16
};

describe('Royal texture paging prototype', () => {
  it('selects deterministic page coordinates for a visible viewport', () => {
    const pages = selectVisibleTexturePages(spec, {
      x: 128,
      y: 256,
      width: 384,
      height: 300,
      mipLevel: 0
    });

    expect(pages).toEqual([
      { textureId: 'royal-board', mipLevel: 0, pageX: 0, pageY: 1 },
      { textureId: 'royal-board', mipLevel: 0, pageX: 1, pageY: 1 },
      { textureId: 'royal-board', mipLevel: 0, pageX: 0, pageY: 2 },
      { textureId: 'royal-board', mipLevel: 0, pageX: 1, pageY: 2 }
    ]);
  });

  it('evicts least-recently-used pages within the cache budget', () => {
    const budget: TextureCacheBudget = {
      ...roomyBudget,
      maxResidentBytes: 256 * 256 * 4 * 2,
      maxAtlasPages: 2
    };
    let state = createTexturePagingState({ maxAtlasPages: budget.maxAtlasPages });
    state = simulate(state, budget, pageViewport(0, 0)).state;
    state = simulate(state, budget, pageViewport(1, 0)).state;
    state = simulate(state, budget, pageViewport(0, 0)).state;

    const result = simulate(state, budget, pageViewport(2, 0), { thrashEvictionThreshold: 99 });

    expect(result.frame.evictedPages).toEqual([{ textureId: 'royal-board', mipLevel: 0, pageX: 1, pageY: 0 }]);
    expect(Array.from(result.state.residentPages.keys()).sort()).toEqual([
      'royal-board:m0:x0:y0',
      'royal-board:m0:x2:y0'
    ]);
  });

  it('does not re-request resident pages during repeated viewport pans', () => {
    let state = createTexturePagingState({ maxAtlasPages: roomyBudget.maxAtlasPages });
    const first = simulate(state, roomyBudget, {
      x: 0,
      y: 0,
      width: 512,
      height: 256,
      mipLevel: 0
    });
    state = first.state;
    const second = simulate(state, roomyBudget, {
      x: 128,
      y: 0,
      width: 512,
      height: 256,
      mipLevel: 0
    });

    expect(first.frame.requestRows.map((row) => row.status)).toEqual(['requested', 'requested']);
    expect(second.frame.requestRows.map((row) => [row.pageX, row.status])).toEqual([
      [0, 'resident'],
      [1, 'resident'],
      [2, 'requested']
    ]);
    expect(second.frame.budgetRow.requestedPages).toBe(1);
  });

  it('reports explicit overbudget and thrash diagnostics', () => {
    const tinyBudget: TextureCacheBudget = {
      ...roomyBudget,
      maxResidentBytes: 256 * 256 * 4,
      maxAtlasPages: 1
    };
    let state = createTexturePagingState({ maxAtlasPages: tinyBudget.maxAtlasPages });
    const first = simulate(state, tinyBudget, pageViewport(0, 0));
    state = first.state;
    const thrash = simulate(state, tinyBudget, pageViewport(1, 0));
    const overbudget = simulate(createTexturePagingState({ maxAtlasPages: tinyBudget.maxAtlasPages }), tinyBudget, {
      x: 0,
      y: 0,
      width: 512,
      height: 256,
      mipLevel: 0
    });
    const missing = simulate(
      createTexturePagingState({ maxAtlasPages: tinyBudget.maxAtlasPages }),
      tinyBudget,
      pageViewport(0, 0),
      { completeRequestedPages: false }
    );

    expect(thrash.frame.diagnostics.map((diagnostic) => diagnostic.code)).toContain('texture_thrash');
    expect(thrash.frame.evictedPages.map(texturePageKey)).toEqual(['royal-board:m0:x0:y0']);
    expect(overbudget.frame.diagnostics.map((diagnostic) => diagnostic.code)).toContain('texture_overbudget');
    expect(missing.frame.diagnostics.map((diagnostic) => diagnostic.code)).toContain('texture_missing_page');
    expect(overbudget.frame.budgetRow).toMatchObject({
      maxAtlasPages: 1,
      residentPages: 2,
      visiblePages: 2
    });
  });

  it('shows the synthetic full-residency versus visible-paged memory shape', () => {
    const board32k: VirtualTextureSpec = {
      textureId: 'synthetic-32k-board',
      width: 32768,
      height: 32768,
      pageSize: 256,
      mipLevels: 1,
      bytesPerPixel: 4
    };
    const visiblePages = selectVisibleTexturePages(board32k, {
      x: 8192,
      y: 8192,
      width: 2048,
      height: 2048,
      mipLevel: 0
    });

    expect(visiblePages).toHaveLength(64);
    expect(estimateFullTextureBytes(board32k)).toBe(4_294_967_296);
    expect(estimatePagedVisibleBytes(board32k, visiblePages)).toBe(16_777_216);
  });
});

function simulate(
  state: ReturnType<typeof createTexturePagingState>,
  budget: TextureCacheBudget,
  viewport: TextureViewport,
  input?: Parameters<typeof simulateTexturePagingFrame>[4]
): ReturnType<typeof simulateTexturePagingFrame> {
  return simulateTexturePagingFrame(state, spec, budget, viewport, input);
}

function pageViewport(pageX: number, pageY: number): TextureViewport {
  return {
    x: pageX * spec.pageSize,
    y: pageY * spec.pageSize,
    width: spec.pageSize,
    height: spec.pageSize,
    mipLevel: 0
  };
}
