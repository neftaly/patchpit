import { describe, expect, it } from 'vitest';
import {
  createGeneratedSceneSource,
  generateSceneSubmapRows,
  generateSceneTileRow,
  sceneSourcePrototypeRows,
  sceneTileCacheKey,
  selectSceneVisibility,
  type SceneSubmapEdge,
  type SceneSubmapRow
} from './sceneSourcePrototype';

describe('Royal scene source prototype', () => {
  it('generates deterministic tile rows with stable ids, bounds, and metrics', () => {
    const source = createGeneratedSceneSource({
      sourceId: 'royal-world',
      seed: 'paper-seed',
      tileSize: 64,
      submapTileSpan: 4,
      maxLevel: 4
    });
    const coord = { level: 2, tileX: -3, tileY: 7 };
    const first = generateSceneTileRow(source, coord);
    const second = generateSceneTileRow(source, coord);
    const otherSeed = generateSceneTileRow(
      createGeneratedSceneSource({ sourceId: 'royal-world', seed: 'other-seed', tileSize: 64, submapTileSpan: 4 }),
      coord
    );

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      relation: 'scene_tile',
      tileId: 'tile:royal-world:paper-seed:l2:x-3:y7',
      submapId: 'submap:royal-world:paper-seed:l2:x-1:y1',
      bounds: { x: -768, y: 1792, width: 256, height: 256 },
      status: 'ready'
    });
    expect(first.semanticLabels).toHaveLength(2);
    expect(first.timeToFirstMs).toBeGreaterThan(0);
    expect(first.tileComputeMs).toBeGreaterThan(0);
    expect(first.byteEstimate).toBeGreaterThan(0);
    expect(otherSeed.tileId).not.toBe(first.tileId);
    expect(otherSeed.cacheKey).not.toBe(first.cacheKey);
  });

  it('supports teleport and random-access selection without walking from the origin', () => {
    const source = createGeneratedSceneSource({
      sourceId: 'royal-world',
      seed: 'teleport-seed',
      tileSize: 64,
      submapTileSpan: 4
    });
    const submaps = generateSceneSubmapRows(source, [
      { level: 0, submapX: 0, submapY: 0 },
      { level: 0, submapX: 100, submapY: -30 },
      { level: 0, submapX: 101, submapY: -30 }
    ]);
    const directTile = generateSceneTileRow(source, { level: 0, tileX: 400, tileY: -120 });
    const selection = selectSceneVisibility({
      source,
      submaps,
      camera: {
        centerX: 100 * 256 + 128,
        centerY: -30 * 256 + 128,
        width: 180,
        height: 180,
        level: 0
      },
      maxResults: 2
    });

    expect(directTile.submapId).toBe('submap:royal-world:teleport-seed:l0:x100:y-30');
    expect(selection.results[0]).toMatchObject({
      submapId: 'submap:royal-world:teleport-seed:l0:x100:y-30',
      visible: true,
      rank: 0
    });
    expect(selection.results.map((row) => row.rank)).toEqual([0, 1]);
    expect(selection.diagnostics).toEqual([]);
  });

  it('keeps cache keys stable for equivalent source labels and changes them on revision cursors', () => {
    const base = createGeneratedSceneSource({
      sourceId: 'royal-world',
      seed: 'cache-seed',
      revision: 7,
      cursor: 'worldgrow-7',
      semanticLabels: ['quest', 'generated']
    });
    const reorderedLabels = createGeneratedSceneSource({
      sourceId: 'royal-world',
      seed: 'cache-seed',
      revision: 7,
      cursor: 'worldgrow-7',
      semanticLabels: ['generated', 'quest']
    });
    const revised = createGeneratedSceneSource({
      sourceId: 'royal-world',
      seed: 'cache-seed',
      revision: 8,
      cursor: 'worldgrow-8',
      semanticLabels: ['generated', 'quest']
    });
    const coord = { level: 1, tileX: 5, tileY: -2 };

    expect(base.semanticLabels).toEqual(['generated', 'quest']);
    expect(base.cacheKey).toBe(reorderedLabels.cacheKey);
    expect(sceneTileCacheKey(base, coord)).toBe(sceneTileCacheKey(reorderedLabels, coord));
    expect(sceneTileCacheKey(revised, coord)).not.toBe(sceneTileCacheKey(base, coord));
  });

  it('ranks visibility with graph and semantic interest, not only grid position', () => {
    const source = createGeneratedSceneSource({
      sourceId: 'royal-world',
      seed: 'trag-seed',
      tileSize: 64,
      submapTileSpan: 4
    });
    const [visible, closeBoring, farQuest] = generateSceneSubmapRows(source, [
      { level: 0, submapX: 0, submapY: 0 },
      { level: 0, submapX: 1, submapY: 0 },
      { level: 0, submapX: 4, submapY: 0 }
    ]) as [SceneSubmapRow, SceneSubmapRow, SceneSubmapRow];
    const submaps: readonly SceneSubmapRow[] = [
      { ...visible, semanticLabels: ['route'], semanticWeight: 0.1 },
      { ...closeBoring, semanticLabels: ['route'], semanticWeight: 0.1 },
      { ...farQuest, semanticLabels: ['quest'], semanticWeight: 1 }
    ];
    const edges: readonly SceneSubmapEdge[] = [
      { fromSubmapId: visible.submapId, toSubmapId: closeBoring.submapId, kind: 'adjacent', weight: 0.35 },
      { fromSubmapId: visible.submapId, toSubmapId: farQuest.submapId, kind: 'semantic', weight: 1 }
    ];
    const selection = selectSceneVisibility({
      source,
      submaps,
      edges,
      camera: {
        centerX: 128,
        centerY: 128,
        width: 220,
        height: 220,
        level: 0,
        semanticFocus: ['quest']
      },
      maxResults: 3
    });

    expect(selection.results.map((row) => row.submapId)).toEqual([
      visible.submapId,
      farQuest.submapId,
      closeBoring.submapId
    ]);
    expect(selection.results[1]?.semanticInterest).toBeGreaterThan(selection.results[2]?.semanticInterest ?? 0);
    expect(selection.results[1]?.graphInterest).toBeGreaterThan(selection.results[2]?.graphInterest ?? 0);
    expect(selection.results[1]?.distance).toBeGreaterThan(selection.results[2]?.distance ?? Infinity);
  });

  it('emits tarstate-friendly row groups and readiness rows', () => {
    const source = createGeneratedSceneSource({ sourceId: 'royal-world', seed: 'rows-seed' });
    const submaps = generateSceneSubmapRows(source, [{ level: 0, submapX: 0, submapY: 0 }]);
    const tile = generateSceneTileRow(source, { level: 0, tileX: 0, tileY: 0 });
    const visibility = selectSceneVisibility({
      source,
      submaps,
      camera: { centerX: 32, centerY: 32, width: 64, height: 64, level: 0 }
    });
    const rows = sceneSourcePrototypeRows({ source, submaps, tiles: [tile], visibility });

    expect(Object.keys(rows).sort()).toEqual([
      'diagnostics',
      'scene_readiness',
      'scene_source',
      'scene_submap',
      'scene_tile',
      'scene_visibility_request',
      'scene_visibility_result'
    ]);
    expect(rows.scene_source).toHaveLength(1);
    expect(rows.scene_tile).toHaveLength(1);
    expect(rows.scene_submap).toHaveLength(1);
    expect(rows.scene_visibility_request).toHaveLength(1);
    expect(rows.scene_visibility_result).toHaveLength(1);
    expect(rows.scene_readiness.map((row) => row.rowKind).sort()).toEqual([
      'scene_source',
      'scene_submap',
      'scene_tile'
    ]);
  });
});
