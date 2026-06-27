import { describe, expect, it } from 'vitest';
import {
  createTextureAtlasState,
  evictTextureAtlasAsset,
  requestTextureAtlasAllocation,
  simulateCardTextureStress,
  textureAtlasHandleKey,
  type TextureAtlasHandle,
  type TextureAtlasState
} from './textureAtlasPrototype';

const atlasPolicy = {
  scopeId: 'royal',
  atlasId: 'card-atlas',
  pageWidth: 64,
  pageHeight: 64,
  padding: 2,
  gutter: 1
};

describe('Royal texture atlas prototype', () => {
  it('packs small textures deterministically with padding and gutter coordinates', () => {
    let state = createTextureAtlasState(atlasPolicy);
    const first = allocate(state, 'card-a', 20, 10);
    state = first.state;
    const second = allocate(state, 'card-b', 20, 10);
    state = second.state;
    const third = allocate(state, 'card-c', 20, 10);

    expect(handles([first.handle, second.handle, third.handle])).toEqual([
      {
        assetId: 'card-a',
        pageId: 'card-atlas-page-0',
        x: 0,
        y: 0,
        width: 26,
        height: 16,
        uploadX: 2,
        uploadY: 2,
        uploadWidth: 22,
        uploadHeight: 12,
        contentX: 3,
        contentY: 3
      },
      {
        assetId: 'card-b',
        pageId: 'card-atlas-page-0',
        x: 26,
        y: 0,
        width: 26,
        height: 16,
        uploadX: 28,
        uploadY: 2,
        uploadWidth: 22,
        uploadHeight: 12,
        contentX: 29,
        contentY: 3
      },
      {
        assetId: 'card-c',
        pageId: 'card-atlas-page-0',
        x: 0,
        y: 16,
        width: 26,
        height: 16,
        uploadX: 2,
        uploadY: 18,
        uploadWidth: 22,
        uploadHeight: 12,
        contentX: 3,
        contentY: 19
      }
    ]);
    expect(third.rows.atlas_page).toEqual([
      expect.objectContaining({
        relation: 'atlas_page',
        pageId: 'card-atlas-page-0',
        allocations: 3,
        occupiedPixels: 1_248
      })
    ]);
  });

  it('returns stable handles and emits uploads only when content changes', () => {
    let state = createTextureAtlasState(atlasPolicy);
    const first = requestTextureAtlasAllocation(state, {
      assetId: 'card-a',
      width: 20,
      height: 10,
      version: 'front-v1',
      frame: 7
    });
    state = first.state;
    const repeat = requestTextureAtlasAllocation(state, {
      assetId: 'card-a',
      width: 20,
      height: 10,
      version: 'front-v1',
      frame: 8
    });
    state = repeat.state;
    const changed = requestTextureAtlasAllocation(state, {
      assetId: 'card-a',
      width: 20,
      height: 10,
      version: 'front-v2',
      frame: 9
    });

    expect(first.handle).toBeDefined();
    expect(repeat.handle).toEqual(first.handle);
    expect(textureAtlasHandleKey(requireHandle(repeat.handle))).toBe(textureAtlasHandleKey(requireHandle(first.handle)));
    expect(repeat.rows.texture_upload).toEqual([]);
    expect(changed.handle).toEqual(first.handle);
    expect(changed.rows.texture_upload).toEqual([
      expect.objectContaining({
        relation: 'texture_upload',
        uploadId: 'card-atlas-upload-2',
        assetId: 'card-a',
        frame: 9,
        x: 2,
        y: 2,
        width: 22,
        height: 12,
        reason: 'content_changed'
      })
    ]);
    expect(changed.rows.atlas_allocation).toEqual([
      expect.objectContaining({
        relation: 'atlas_allocation',
        assetId: 'card-a',
        version: 'front-v2',
        lastUsedFrame: 9
      })
    ]);
  });

  it('rejects oversized assets before page allocation', () => {
    const result = allocate(createTextureAtlasState(atlasPolicy), 'oversized-card', 60, 10);

    expect(result.handle).toBeUndefined();
    expect(result.rows.atlas_page).toEqual([]);
    expect(result.rows.texture_upload).toEqual([]);
    expect(result.rows.diagnostics).toEqual([
      expect.objectContaining({
        code: 'atlas_oversized',
        relation: 'atlas_allocation',
        key: 'oversized-card'
      })
    ]);
  });

  it('allocates additional pages when a page fills', () => {
    let state = createTextureAtlasState(atlasPolicy);
    const pageIds: string[] = [];

    for (let index = 0; index < 13; index += 1) {
      const result = allocate(state, `card-${index}`, 20, 10);
      state = result.state;
      pageIds.push(requireHandle(result.handle).pageId);
    }

    expect(new Set(pageIds)).toEqual(new Set(['card-atlas-page-0', 'card-atlas-page-1']));
    expect(state.pages).toHaveLength(2);
    expect(pageIds.slice(0, 8).every((pageId) => pageId === 'card-atlas-page-0')).toBe(true);
    expect(pageIds.slice(8).every((pageId) => pageId === 'card-atlas-page-1')).toBe(true);
  });

  it('emits upload rows for new allocations', () => {
    const result = requestTextureAtlasAllocation(createTextureAtlasState(atlasPolicy), {
      assetId: 'card-a',
      width: 20,
      height: 10,
      version: 'front-v1',
      frame: 42
    });

    expect(result.rows.texture_upload).toEqual([
      {
        relation: 'texture_upload',
        scopeId: 'royal',
        atlasId: 'card-atlas',
        uploadId: 'card-atlas-upload-1',
        assetId: 'card-a',
        handleId: 'card-atlas:card-a',
        pageId: 'card-atlas-page-0',
        frame: 42,
        x: 2,
        y: 2,
        width: 22,
        height: 12,
        reason: 'allocated'
      }
    ]);
  });

  it('reports fragmentation and eviction diagnostics without repacking existing pages', () => {
    let state = createTextureAtlasState({ ...atlasPolicy, maxPages: 1 });
    for (let index = 0; index < 8; index += 1) {
      state = allocate(state, `card-${index}`, 20, 10).state;
    }
    const eviction = evictTextureAtlasAsset(state, 'card-1', { frame: 10, reason: 'stress budget' });
    state = eviction.state;
    const rejected = allocate(state, 'wide-card', 50, 10);

    expect(eviction.rows.diagnostics).toEqual([
      expect.objectContaining({
        code: 'texture_evicted',
        relation: 'atlas_allocation',
        key: 'card-1'
      })
    ]);
    expect(rejected.handle).toBeUndefined();
    expect(rejected.rows.diagnostics).toEqual([
      expect.objectContaining({
        code: 'atlas_fragmented',
        relation: 'atlas_page',
        key: 'wide-card'
      })
    ]);
    expect(rejected.rows.atlas_page).toEqual([
      expect.objectContaining({
        pageId: 'card-atlas-page-0',
        allocations: 7,
        fragmentedPixels: 416
      })
    ]);
  });

  it('shows the 500 to 5k card stress shape versus one texture per card', () => {
    const small = simulateCardTextureStress({ cardCount: 500 });
    const large = simulateCardTextureStress({ cardCount: 5_000 });

    expect(small).toMatchObject({
      cardCount: 500,
      oneTexturePerCardCount: 500,
      atlasPageCount: 4,
      uploadRowCount: 500,
      rejectedCount: 0
    });
    expect(large).toMatchObject({
      cardCount: 5_000,
      oneTexturePerCardCount: 5_000,
      atlasPageCount: 31,
      uploadRowCount: 5_000,
      rejectedCount: 0
    });
    expect(small.atlasPageCount).toBeLessThan(small.oneTexturePerCardCount / 100);
    expect(large.atlasPageCount).toBeLessThan(large.oneTexturePerCardCount / 100);
    expect(large.utilization).toBeGreaterThan(0.75);
    expect(large.diagnostics).toEqual([]);
  });
});

function allocate(state: TextureAtlasState, assetId: string, width: number, height: number) {
  return requestTextureAtlasAllocation(state, { assetId, width, height, version: 'base' });
}

function requireHandle(handle: TextureAtlasHandle | undefined): TextureAtlasHandle {
  if (handle === undefined) {
    throw new Error('Expected texture atlas handle');
  }

  return handle;
}

function handles(input: readonly (TextureAtlasHandle | undefined)[]) {
  return input.map((handle) => {
    const resolved = requireHandle(handle);
    return {
      assetId: resolved.assetId,
      pageId: resolved.pageId,
      x: resolved.x,
      y: resolved.y,
      width: resolved.width,
      height: resolved.height,
      uploadX: resolved.uploadX,
      uploadY: resolved.uploadY,
      uploadWidth: resolved.uploadWidth,
      uploadHeight: resolved.uploadHeight,
      contentX: resolved.contentX,
      contentY: resolved.contentY
    };
  });
}
