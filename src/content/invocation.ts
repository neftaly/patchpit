import type { FsEntryRow } from '@patchpit/fs';
import {
  resourceAt,
  resourceIdentity,
  type ResourceProjection,
} from './resources.ts';

export const resourceBrowserUrl = 'files.html';

const appContentPrefix = 'app.html#';
const viewerContentPrefix = 'viewer.html#';

type ContentInvocation = {
  readonly kind: 'resources';
} | {
  readonly kind: 'app';
  readonly rootEntryId: string;
} | {
  readonly kind: 'viewer';
  readonly entryId: string;
  readonly sourceId: string;
};

export const appContentUrl = (rootEntryId: string) =>
  `${appContentPrefix}${JSON.stringify({ rootEntryId })}`;

export const viewerContentUrl = (sourceId: string, entryId: string) =>
  `${viewerContentPrefix}${JSON.stringify({ sourceId, entryId })}`;

export const contentUrlForResource = (
  resource: FsEntryRow,
  resources: ResourceProjection,
): string | undefined => {
  if (resource.kind === 'file') return viewerContentUrl(resource.sourceId, resource.entryId);
  return resources.launchableFolders.has(resourceIdentity(resource))
    ? appContentUrl(resource.entryId)
    : undefined;
};

export const contentLabel = (
  resources: ResourceProjection,
  contentUrl: string | undefined,
) => {
  const invocation = contentUrl === undefined ? undefined : parseContentInvocation(contentUrl);
  if (invocation?.kind === 'resources') return 'Resources';
  if (invocation?.kind === 'app') {
    const root = resources.byEntryId.get(invocation.rootEntryId);
    return root === undefined ? 'App unavailable' : `${root.name} / index.html`;
  }
  const resource = invocation?.kind !== 'viewer'
    ? undefined
    : resourceAt(resources, invocation.sourceId, invocation.entryId);
  if (resource === undefined) return 'Resource unavailable';
  const parent = resource.parentId === null
    ? undefined
    : resourceAt(resources, resource.sourceId, resource.parentId);
  return `${parent?.name ?? 'patchpit'} / ${resource.name}`;
};

export const parseContentInvocation = (contentUrl: string): ContentInvocation | undefined => {
  if (contentUrl === resourceBrowserUrl) return { kind: 'resources' };
  if (contentUrl.startsWith(appContentPrefix)) {
    const candidate = parseHashObject(contentUrl, appContentPrefix);
    return typeof candidate?.rootEntryId === 'string' && candidate.rootEntryId !== ''
      ? { kind: 'app', rootEntryId: candidate.rootEntryId }
      : undefined;
  }
  if (contentUrl.startsWith(viewerContentPrefix)) {
    const candidate = parseHashObject(contentUrl, viewerContentPrefix);
    return typeof candidate?.sourceId === 'string' && candidate.sourceId !== ''
      && typeof candidate.entryId === 'string' && candidate.entryId !== ''
      ? { kind: 'viewer', sourceId: candidate.sourceId, entryId: candidate.entryId }
      : undefined;
  }
  return undefined;
};

const parseHashObject = (
  contentUrl: string,
  prefix: string,
): Readonly<Record<string, unknown>> | undefined => {
  try {
    const candidate: unknown = JSON.parse(contentUrl.slice(prefix.length));
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
      ? candidate as Readonly<Record<string, unknown>>
      : undefined;
  } catch {
    return undefined;
  }
};
