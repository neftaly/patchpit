export type SceneSourceStatus = 'blocked' | 'ready' | 'stale' | 'warming';

export type SceneBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type SceneTileCoord = {
  readonly level: number;
  readonly tileX: number;
  readonly tileY: number;
};

export type SceneSubmapCoord = {
  readonly level: number;
  readonly submapX: number;
  readonly submapY: number;
};

export type SceneSourceInput = {
  readonly sourceId: string;
  readonly seed: string;
  readonly revision?: number;
  readonly cursor?: string;
  readonly tileSize?: number;
  readonly submapTileSpan?: number;
  readonly minLevel?: number;
  readonly maxLevel?: number;
  readonly bounds?: SceneBounds;
  readonly semanticLabels?: readonly string[];
  readonly status?: SceneSourceStatus;
};

export type SceneSourceRow = {
  readonly sourceId: string;
  readonly seed: string;
  readonly revision: number;
  readonly cursor: string;
  readonly cacheKey: string;
  readonly bounds: SceneBounds;
  readonly minLevel: number;
  readonly maxLevel: number;
  readonly tileSize: number;
  readonly submapTileSpan: number;
  readonly semanticLabels: readonly string[];
  readonly status: SceneSourceStatus;
  readonly relation: 'scene_source';
};

export type SceneTileRow = SceneTileCoord & {
  readonly sourceId: string;
  readonly tileId: string;
  readonly submapId: string;
  readonly seed: string;
  readonly revision: number;
  readonly cursor: string;
  readonly cacheKey: string;
  readonly bounds: SceneBounds;
  readonly semanticLabels: readonly string[];
  readonly status: SceneSourceStatus;
  readonly timeToFirstMs: number;
  readonly tileComputeMs: number;
  readonly byteEstimate: number;
  readonly relation: 'scene_tile';
};

export type SceneSubmapRow = SceneSubmapCoord & {
  readonly sourceId: string;
  readonly submapId: string;
  readonly seed: string;
  readonly revision: number;
  readonly cursor: string;
  readonly cacheKey: string;
  readonly bounds: SceneBounds;
  readonly semanticLabels: readonly string[];
  readonly semanticWeight: number;
  readonly status: SceneSourceStatus;
  readonly tileCount: number;
  readonly relation: 'scene_submap';
};

export type SceneSubmapEdge = {
  readonly fromSubmapId: string;
  readonly toSubmapId: string;
  readonly kind: 'adjacent' | 'portal' | 'semantic';
  readonly weight?: number;
};

export type SceneCameraViewport = {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly level: number;
  readonly semanticFocus?: readonly string[];
};

export type SceneVisibilityRequestRow = {
  readonly requestId: string;
  readonly sourceId: string;
  readonly revision: number;
  readonly cursor: string;
  readonly cameraCenterX: number;
  readonly cameraCenterY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly level: number;
  readonly semanticFocus: readonly string[];
  readonly maxResults: number;
  readonly relation: 'scene_visibility_request';
};

export type SceneVisibilityResultRow = {
  readonly requestId: string;
  readonly sourceId: string;
  readonly submapId: string;
  readonly rank: number;
  readonly visible: boolean;
  readonly score: number;
  readonly distance: number;
  readonly contribution: number;
  readonly semanticInterest: number;
  readonly graphInterest: number;
  readonly status: SceneSourceStatus;
  readonly cacheKey: string;
  readonly relation: 'scene_visibility_result';
};

export type SceneReadinessRow = {
  readonly sourceId: string;
  readonly rowId: string;
  readonly rowKind: 'scene_source' | 'scene_submap' | 'scene_tile';
  readonly status: SceneSourceStatus;
  readonly revision: number;
  readonly cursor: string;
  readonly cacheKey: string;
  readonly relation: 'scene_readiness';
};

export type SceneSourceDiagnosticCode =
  | 'scene_source_empty_candidates'
  | 'scene_source_level_mismatch'
  | 'scene_source_not_ready';

export type SceneSourceDiagnostic = {
  readonly code: SceneSourceDiagnosticCode;
  readonly message: string;
  readonly relation:
    | 'scene_source'
    | 'scene_submap'
    | 'scene_tile'
    | 'scene_visibility_request'
    | 'scene_visibility_result';
  readonly key?: string;
  readonly detail?: unknown;
};

export type SceneSourcePrototypeRows = {
  readonly scene_source: readonly SceneSourceRow[];
  readonly scene_tile: readonly SceneTileRow[];
  readonly scene_submap: readonly SceneSubmapRow[];
  readonly scene_visibility_request: readonly SceneVisibilityRequestRow[];
  readonly scene_visibility_result: readonly SceneVisibilityResultRow[];
  readonly scene_readiness: readonly SceneReadinessRow[];
  readonly diagnostics: readonly SceneSourceDiagnostic[];
};

export type SceneVisibilitySelection = {
  readonly request: SceneVisibilityRequestRow;
  readonly results: readonly SceneVisibilityResultRow[];
  readonly diagnostics: readonly SceneSourceDiagnostic[];
};

const defaultBounds: SceneBounds = {
  x: -1_048_576,
  y: -1_048_576,
  width: 2_097_152,
  height: 2_097_152
};

const semanticPalette = [
  'settlement',
  'route',
  'water',
  'resource',
  'hazard',
  'highland',
  'ruin',
  'garden'
] as const;

export function createGeneratedSceneSource(input: SceneSourceInput): SceneSourceRow {
  const revision = nonNegativeInteger(input.revision ?? 0);
  const cursor = input.cursor ?? `rev-${revision}`;
  const tileSize = positiveInteger(input.tileSize ?? 64);
  const submapTileSpan = positiveInteger(input.submapTileSpan ?? 4);
  const minLevel = nonNegativeInteger(input.minLevel ?? 0);
  const maxLevel = Math.max(minLevel, nonNegativeInteger(input.maxLevel ?? minLevel + 6));
  const semanticLabels = normalizeLabels(input.semanticLabels ?? ['generated', 'royal']);
  const source: Omit<SceneSourceRow, 'cacheKey' | 'relation'> = {
    sourceId: input.sourceId,
    seed: input.seed,
    revision,
    cursor,
    bounds: input.bounds ?? defaultBounds,
    minLevel,
    maxLevel,
    tileSize,
    submapTileSpan,
    semanticLabels,
    status: input.status ?? 'ready'
  };

  return {
    ...source,
    cacheKey: sceneSourceCacheKey(source),
    relation: 'scene_source'
  };
}

export function generateSceneTileRow(source: SceneSourceRow, coord: SceneTileCoord): SceneTileRow {
  const tileCoord = normalizeTileCoord(source, coord);
  const submap = submapCoordForTile(source, tileCoord);
  const submapId = sceneSubmapId(source, submap);
  const cacheKey = sceneTileCacheKey(source, tileCoord);
  const hash = stableHash(cacheKey);
  const semanticLabels = labelsForHash(hash, 2);

  return {
    sourceId: source.sourceId,
    tileId: sceneTileId(source, tileCoord),
    submapId,
    seed: source.seed,
    revision: source.revision,
    cursor: source.cursor,
    cacheKey,
    bounds: boundsForTile(source, tileCoord),
    semanticLabels,
    status: source.status,
    timeToFirstMs: 8 + (hash % 29),
    tileComputeMs: 2 + ((hash >>> 5) % 17),
    byteEstimate: source.tileSize * source.tileSize * (2 + ((hash >>> 11) % 3)),
    relation: 'scene_tile',
    ...tileCoord
  };
}

export function generateSceneTileRows(
  source: SceneSourceRow,
  coords: readonly SceneTileCoord[]
): readonly SceneTileRow[] {
  return coords.map((coord) => generateSceneTileRow(source, coord));
}

export function generateSceneSubmapRow(source: SceneSourceRow, coord: SceneSubmapCoord): SceneSubmapRow {
  const submapCoord = normalizeSubmapCoord(source, coord);
  const cacheKey = sceneSubmapCacheKey(source, submapCoord);
  const hash = stableHash(cacheKey);
  const semanticLabels = labelsForHash(hash, 3);

  return {
    sourceId: source.sourceId,
    submapId: sceneSubmapId(source, submapCoord),
    seed: source.seed,
    revision: source.revision,
    cursor: source.cursor,
    cacheKey,
    bounds: boundsForSubmap(source, submapCoord),
    semanticLabels,
    semanticWeight: round3(0.25 + ((hash >>> 7) % 75) / 100),
    status: source.status,
    tileCount: source.submapTileSpan * source.submapTileSpan,
    relation: 'scene_submap',
    ...submapCoord
  };
}

export function generateSceneSubmapRows(
  source: SceneSourceRow,
  coords: readonly SceneSubmapCoord[]
): readonly SceneSubmapRow[] {
  return coords.map((coord) => generateSceneSubmapRow(source, coord));
}

export function selectSceneVisibility(input: {
  readonly source: SceneSourceRow;
  readonly camera: SceneCameraViewport;
  readonly submaps: readonly SceneSubmapRow[];
  readonly edges?: readonly SceneSubmapEdge[];
  readonly maxResults?: number;
  readonly requestCursor?: string;
}): SceneVisibilitySelection {
  const maxResults = positiveInteger(input.maxResults ?? 8);
  const semanticFocus = normalizeLabels(input.camera.semanticFocus ?? []);
  const request = visibilityRequestRow(input.source, input.camera, semanticFocus, maxResults, input.requestCursor);
  const viewport = boundsFromCamera(input.camera);
  const levelCandidates = input.submaps.filter((submap) => submap.level === input.camera.level);
  const visibleSubmapIds = new Set(
    levelCandidates
      .filter((submap) => overlapArea(viewport, submap.bounds) > 0)
      .map((submap) => submap.submapId)
  );
  const graphInterestById = graphInterest(input.edges ?? [], visibleSubmapIds);
  const diagnostics: SceneSourceDiagnostic[] = [];

  if (input.submaps.length === 0) {
    diagnostics.push({
      code: 'scene_source_empty_candidates',
      message: 'visibility selection received no submap candidates',
      relation: 'scene_submap'
    });
  }

  if (levelCandidates.length !== input.submaps.length) {
    diagnostics.push({
      code: 'scene_source_level_mismatch',
      message: 'visibility selection ignored submaps outside the camera level',
      relation: 'scene_visibility_request',
      key: request.requestId,
      detail: {
        level: input.camera.level,
        ignored: input.submaps.length - levelCandidates.length
      }
    });
  }

  if (input.source.status !== 'ready') {
    diagnostics.push({
      code: 'scene_source_not_ready',
      message: 'scene source is not ready',
      relation: 'scene_source',
      key: input.source.sourceId,
      detail: { status: input.source.status }
    });
  }

  const scored = levelCandidates
    .map((submap) => scoreSubmap({
      requestId: request.requestId,
      source: input.source,
      submap,
      viewport,
      semanticFocus,
      graphInterest: graphInterestById.get(submap.submapId) ?? 0
    }))
    .filter((row) => row.visible || row.graphInterest > 0 || row.semanticInterest > 0)
    .sort(compareVisibilityRows)
    .slice(0, maxResults)
    .map((row, rank) => ({ ...row, rank }));

  return { request, results: scored, diagnostics };
}

export function sceneSourcePrototypeRows(input: {
  readonly source: SceneSourceRow;
  readonly tiles?: readonly SceneTileRow[];
  readonly submaps?: readonly SceneSubmapRow[];
  readonly visibility?: SceneVisibilitySelection;
}): SceneSourcePrototypeRows {
  const tiles = input.tiles ?? [];
  const submaps = input.submaps ?? [];
  const visibility = input.visibility;
  const readiness: SceneReadinessRow[] = [
    readinessRow(input.source, 'scene_source', input.source.sourceId, input.source.status, input.source.cacheKey),
    ...submaps.map((submap) =>
      readinessRow(input.source, 'scene_submap', submap.submapId, submap.status, submap.cacheKey)
    ),
    ...tiles.map((tile) => readinessRow(input.source, 'scene_tile', tile.tileId, tile.status, tile.cacheKey))
  ];

  return {
    scene_source: [input.source],
    scene_tile: tiles,
    scene_submap: submaps,
    scene_visibility_request: visibility === undefined ? [] : [visibility.request],
    scene_visibility_result: visibility?.results ?? [],
    scene_readiness: readiness,
    diagnostics: visibility?.diagnostics ?? []
  };
}

export function sceneTileId(source: SceneSourceRow, coord: SceneTileCoord): string {
  const normalized = normalizeTileCoord(source, coord);
  return `tile:${source.sourceId}:${source.seed}:l${normalized.level}:x${normalized.tileX}:y${normalized.tileY}`;
}

export function sceneSubmapId(source: SceneSourceRow, coord: SceneSubmapCoord): string {
  const normalized = normalizeSubmapCoord(source, coord);
  return `submap:${source.sourceId}:${source.seed}:l${normalized.level}:x${normalized.submapX}:y${normalized.submapY}`;
}

export function sceneTileCacheKey(source: SceneSourceRow, coord: SceneTileCoord): string {
  const normalized = normalizeTileCoord(source, coord);
  return [
    'scene_tile',
    source.sourceId,
    `seed=${source.seed}`,
    `rev=${source.revision}`,
    `cursor=${source.cursor}`,
    `level=${normalized.level}`,
    `x=${normalized.tileX}`,
    `y=${normalized.tileY}`,
    `tile=${source.tileSize}`,
    `span=${source.submapTileSpan}`
  ].join('|');
}

export function sceneSubmapCacheKey(source: SceneSourceRow, coord: SceneSubmapCoord): string {
  const normalized = normalizeSubmapCoord(source, coord);
  return [
    'scene_submap',
    source.sourceId,
    `seed=${source.seed}`,
    `rev=${source.revision}`,
    `cursor=${source.cursor}`,
    `level=${normalized.level}`,
    `x=${normalized.submapX}`,
    `y=${normalized.submapY}`,
    `tile=${source.tileSize}`,
    `span=${source.submapTileSpan}`
  ].join('|');
}

function sceneSourceCacheKey(source: Omit<SceneSourceRow, 'cacheKey' | 'relation'>): string {
  return [
    'scene_source',
    source.sourceId,
    `seed=${source.seed}`,
    `rev=${source.revision}`,
    `cursor=${source.cursor}`,
    `tile=${source.tileSize}`,
    `span=${source.submapTileSpan}`,
    `levels=${source.minLevel}-${source.maxLevel}`,
    `bounds=${source.bounds.x},${source.bounds.y},${source.bounds.width},${source.bounds.height}`
  ].join('|');
}

function visibilityRequestRow(
  source: SceneSourceRow,
  camera: SceneCameraViewport,
  semanticFocus: readonly string[],
  maxResults: number,
  requestCursor?: string
): SceneVisibilityRequestRow {
  const requestKey = [
    source.cacheKey,
    requestCursor ?? source.cursor,
    camera.level,
    camera.centerX,
    camera.centerY,
    camera.width,
    camera.height,
    semanticFocus.join(',')
  ].join('|');

  return {
    requestId: `visibility:${stableHash(requestKey).toString(36)}`,
    sourceId: source.sourceId,
    revision: source.revision,
    cursor: requestCursor ?? source.cursor,
    cameraCenterX: camera.centerX,
    cameraCenterY: camera.centerY,
    viewportWidth: camera.width,
    viewportHeight: camera.height,
    level: camera.level,
    semanticFocus,
    maxResults,
    relation: 'scene_visibility_request'
  };
}

function scoreSubmap(input: {
  readonly requestId: string;
  readonly source: SceneSourceRow;
  readonly submap: SceneSubmapRow;
  readonly viewport: SceneBounds;
  readonly semanticFocus: readonly string[];
  readonly graphInterest: number;
}): SceneVisibilityResultRow {
  const visibleArea = overlapArea(input.viewport, input.submap.bounds);
  const visible = visibleArea > 0;
  const contribution = visible
    ? round3(visibleArea / Math.min(area(input.viewport), area(input.submap.bounds)))
    : 0;
  const distance = round3(distanceBetweenCenters(input.viewport, input.submap.bounds));
  const semanticInterest = semanticInterestFor(input.submap, input.semanticFocus);
  const normalizedDistance = distance / Math.max(input.viewport.width, input.viewport.height, 1);
  const score = round3(
    (visible ? 1_000 : 0) +
    contribution * 420 +
    semanticInterest * 260 +
    input.graphInterest * 180 -
    normalizedDistance * 35
  );

  return {
    requestId: input.requestId,
    sourceId: input.source.sourceId,
    submapId: input.submap.submapId,
    rank: -1,
    visible,
    score,
    distance,
    contribution,
    semanticInterest,
    graphInterest: input.graphInterest,
    status: input.submap.status,
    cacheKey: input.submap.cacheKey,
    relation: 'scene_visibility_result'
  };
}

function graphInterest(
  edges: readonly SceneSubmapEdge[],
  visibleSubmapIds: ReadonlySet<string>
): ReadonlyMap<string, number> {
  const interest = new Map<string, number>();

  for (const id of visibleSubmapIds) {
    interest.set(id, 1);
  }

  for (const edge of edges) {
    const weight = edge.weight ?? (edge.kind === 'portal' ? 0.9 : edge.kind === 'semantic' ? 0.75 : 0.5);
    const fromVisible = visibleSubmapIds.has(edge.fromSubmapId);
    const toVisible = visibleSubmapIds.has(edge.toSubmapId);

    if (fromVisible) {
      interest.set(edge.toSubmapId, Math.max(interest.get(edge.toSubmapId) ?? 0, weight));
    }

    if (toVisible) {
      interest.set(edge.fromSubmapId, Math.max(interest.get(edge.fromSubmapId) ?? 0, weight));
    }
  }

  return interest;
}

function compareVisibilityRows(left: SceneVisibilityResultRow, right: SceneVisibilityResultRow): number {
  return (
    right.score - left.score ||
    Number(right.visible) - Number(left.visible) ||
    right.semanticInterest - left.semanticInterest ||
    left.distance - right.distance ||
    left.submapId.localeCompare(right.submapId)
  );
}

function semanticInterestFor(submap: SceneSubmapRow, focus: readonly string[]): number {
  if (focus.length === 0) {
    return round3(submap.semanticWeight * 0.25);
  }

  const labels = new Set(submap.semanticLabels);
  const matches = focus.filter((label) => labels.has(label)).length;
  const focusScore = matches / focus.length;

  return round3(Math.min(1, focusScore * 0.85 + submap.semanticWeight * 0.15));
}

function submapCoordForTile(source: SceneSourceRow, coord: SceneTileCoord): SceneSubmapCoord {
  return {
    level: coord.level,
    submapX: Math.floor(coord.tileX / source.submapTileSpan),
    submapY: Math.floor(coord.tileY / source.submapTileSpan)
  };
}

function boundsForTile(source: SceneSourceRow, coord: SceneTileCoord): SceneBounds {
  const size = source.tileSize * 2 ** coord.level;

  return {
    x: coord.tileX * size,
    y: coord.tileY * size,
    width: size,
    height: size
  };
}

function boundsForSubmap(source: SceneSourceRow, coord: SceneSubmapCoord): SceneBounds {
  const size = source.tileSize * source.submapTileSpan * 2 ** coord.level;

  return {
    x: coord.submapX * size,
    y: coord.submapY * size,
    width: size,
    height: size
  };
}

function boundsFromCamera(camera: SceneCameraViewport): SceneBounds {
  return {
    x: camera.centerX - camera.width / 2,
    y: camera.centerY - camera.height / 2,
    width: Math.max(0, camera.width),
    height: Math.max(0, camera.height)
  };
}

function overlapArea(left: SceneBounds, right: SceneBounds): number {
  const x = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const y = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));

  return x * y;
}

function area(bounds: SceneBounds): number {
  return Math.max(0, bounds.width) * Math.max(0, bounds.height);
}

function distanceBetweenCenters(left: SceneBounds, right: SceneBounds): number {
  const dx = left.x + left.width / 2 - (right.x + right.width / 2);
  const dy = left.y + left.height / 2 - (right.y + right.height / 2);

  return Math.sqrt(dx * dx + dy * dy);
}

function labelsForHash(hash: number, count: number): readonly string[] {
  const labels = new Set<string>();
  const start = hash % semanticPalette.length;
  const direction = (hash & 1) === 0 ? 1 : -1;

  for (let index = 0; index < semanticPalette.length && labels.size < count; index += 1) {
    const paletteIndex = (start + direction * index + semanticPalette.length) % semanticPalette.length;
    labels.add(semanticPalette[paletteIndex]!);
  }

  return Array.from(labels).sort();
}

function normalizeLabels(labels: readonly string[]): readonly string[] {
  return Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean))).sort();
}

function normalizeTileCoord(source: SceneSourceRow, coord: SceneTileCoord): SceneTileCoord {
  return {
    level: clampInteger(coord.level, source.minLevel, source.maxLevel),
    tileX: integer(coord.tileX),
    tileY: integer(coord.tileY)
  };
}

function normalizeSubmapCoord(source: SceneSourceRow, coord: SceneSubmapCoord): SceneSubmapCoord {
  return {
    level: clampInteger(coord.level, source.minLevel, source.maxLevel),
    submapX: integer(coord.submapX),
    submapY: integer(coord.submapY)
  };
}

function readinessRow(
  source: SceneSourceRow,
  rowKind: SceneReadinessRow['rowKind'],
  rowId: string,
  status: SceneSourceStatus,
  cacheKey: string
): SceneReadinessRow {
  return {
    sourceId: source.sourceId,
    rowId,
    rowKind,
    status,
    revision: source.revision,
    cursor: source.cursor,
    cacheKey,
    relation: 'scene_readiness'
  };
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function positiveInteger(value: number): number {
  return Math.max(1, integer(value));
}

function nonNegativeInteger(value: number): number {
  return Math.max(0, integer(value));
}

function integer(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, integer(value)));
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
