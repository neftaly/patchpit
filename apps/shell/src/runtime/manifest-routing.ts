import {
  PatchpitType,
  automergeMimeType,
  type AppManifestDoc,
  type AppManifestHandler,
  type FilesystemResource,
  type FolderDoc,
  type SeedFilesystem,
} from '@patchpit/system';
import {
  routeOpenIntent,
  routePreviewIntent,
  runtimeError,
  type RuntimeError,
} from '@patchpit/system/runtime';

type RouteIntentName = typeof routeOpenIntent | typeof routePreviewIntent;
type RouteHandlerIntent = Extract<AppManifestHandler['intent'], 'open' | 'preview'>;

export type ManifestRouteHandler = {
  readonly app: string;
  readonly handler: AppManifestHandler;
  readonly targetTypes: readonly string[];
};

type ScoredManifestRouteHandler = ManifestRouteHandler & {
  readonly score: number;
};

export function manifestRouteHandler(
  seed: SeedFilesystem,
  intent: RouteIntentName,
  url: string,
): ManifestRouteHandler | RuntimeError {
  const targetTypes = routeTargetTypes(seed, url);
  const match = bestManifestRouteHandler(seed, routeHandlerIntent(intent), targetTypes);
  if (match === undefined) {
    return runtimeError(
      'missing_handler',
      `No installed ${intent} handler matched ${url}.`,
      `target types: ${targetTypes.join(', ')}`,
    );
  }

  return {
    app: match.app,
    handler: match.handler,
    targetTypes,
  };
}

function bestManifestRouteHandler(
  seed: SeedFilesystem,
  intent: RouteHandlerIntent,
  targetTypes: readonly string[],
): ScoredManifestRouteHandler | undefined {
  let best: ScoredManifestRouteHandler | undefined;

  for (const manifest of installedAppManifests(seed)) {
    for (const handler of manifest.handles ?? []) {
      if (handler.intent !== intent) continue;
      const score = handlerAcceptsScore(handler, targetTypes);
      if (score === undefined) continue;
      if (best === undefined || score > best.score) {
        best = { app: manifest.id, handler, score, targetTypes };
      }
    }
  }

  return best;
}

function routeHandlerIntent(intent: RouteIntentName): RouteHandlerIntent {
  return intent === routeOpenIntent ? 'open' : 'preview';
}

export function installedAppManifests(seed: SeedFilesystem): AppManifestDoc[] {
  const root = seed.documentHandles[seed.rootUrl]?.doc();
  if (!isFolderDoc(root)) return [];

  const appsFolder = root.docs
    .find((entry) => entry.name === 'apps' && entry.type === PatchpitType.Folder);
  const appsFolderDoc = appsFolder === undefined
    ? undefined
    : seed.documentHandles[appsFolder.url]?.doc();
  if (!isFolderDoc(appsFolderDoc)) return [];

  return appsFolderDoc.docs.flatMap((entry) => installedAppManifestFromEntry(seed, entry.url));
}

function isAppManifestDoc(doc: FilesystemResource | undefined): doc is AppManifestDoc {
  return doc?.['@patchpit'].type === PatchpitType.AppManifest;
}

function installedAppManifestFromEntry(seed: SeedFilesystem, url: string): readonly AppManifestDoc[] {
  const doc = seed.documentHandles[url]?.doc();
  if (isAppManifestDoc(doc)) return [doc];
  if (!isFolderDoc(doc)) return [];

  return doc.docs.flatMap((entry) => {
    const child = seed.documentHandles[entry.url]?.doc();
    return isAppManifestDoc(child) ? [child] : [];
  });
}

function isFolderDoc(doc: FilesystemResource | undefined): doc is FolderDoc {
  return doc?.['@patchpit'].type === PatchpitType.Folder;
}

function routeTargetTypes(seed: SeedFilesystem, url: string): readonly string[] {
  const doc = seed.documentHandles[url]?.doc();
  if (doc === undefined) return [automergeMimeType];

  const types = new Set<string>();
  if ('mimeType' in doc && typeof doc.mimeType === 'string') {
    const mimeType = normalizeRouteType(doc.mimeType);
    if (mimeType !== '') types.add(mimeType);
  }

  const patchpitType = doc['@patchpit'].type;
  types.add(`application/vnd.patchpit.${patchpitType}`);
  types.add(patchpitType);
  return [...types];
}

function handlerAcceptsScore(
  handler: AppManifestHandler,
  targetTypes: readonly string[],
): number | undefined {
  let best: number | undefined;

  for (const pattern of handler.accepts) {
    for (const targetType of targetTypes) {
      const score = routeTypePatternScore(pattern, targetType);
      if (score !== undefined && (best === undefined || score > best)) best = score;
    }
  }

  return best;
}

function routeTypePatternScore(pattern: string, targetType: string): number | undefined {
  const normalizedPattern = normalizeRouteType(pattern);
  if (normalizedPattern === '') return undefined;
  if (normalizedPattern === targetType) return 1000 + normalizedPattern.length;
  if (!wildcardRouteTypeMatches(normalizedPattern, targetType)) return undefined;
  return normalizedPattern.replaceAll('*', '').length;
}

function wildcardRouteTypeMatches(pattern: string, targetType: string): boolean {
  const parts = pattern.split('*');
  if (parts.length === 1) return false;

  const prefix = parts[0] ?? '';
  if (!targetType.startsWith(prefix)) return false;

  let index = prefix.length;
  for (const part of parts.slice(1)) {
    if (part === '') continue;
    const nextIndex = targetType.indexOf(part, index);
    if (nextIndex === -1) return false;
    index = nextIndex + part.length;
  }

  const last = parts.at(-1) ?? '';
  return last === '' || targetType.endsWith(last);
}

function normalizeRouteType(value: string): string {
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}
