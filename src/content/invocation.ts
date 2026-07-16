import type { FsEntryRow } from '@patchpit/fs';
import {
  findResource,
  resourceIdentity,
  type ResourceProjection,
} from './resource-projection.ts';

export const resourceBrowserUrl = 'files.html';

const APP_CONTENT_PREFIX = 'app.html#';
const VIEWER_CONTENT_PREFIX = 'viewer.html#';

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
  `${APP_CONTENT_PREFIX}${JSON.stringify({ rootEntryId })}`;

export const viewerContentUrl = (sourceId: string, entryId: string) =>
  `${VIEWER_CONTENT_PREFIX}${JSON.stringify({ sourceId, entryId })}`;

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
    : findResource(resources, invocation.sourceId, invocation.entryId);
  if (resource === undefined) return 'Resource unavailable';
  const parent = resource.parentId === null
    ? undefined
    : findResource(resources, resource.sourceId, resource.parentId);
  return `${parent?.name ?? 'patchpit'} / ${resource.name}`;
};

export const parseContentInvocation = (contentUrl: string): ContentInvocation | undefined => {
  if (contentUrl === resourceBrowserUrl) return { kind: 'resources' };
  if (contentUrl.startsWith(APP_CONTENT_PREFIX)) {
    const candidate = parseHashObject(contentUrl, APP_CONTENT_PREFIX);
    return typeof candidate?.rootEntryId === 'string' && candidate.rootEntryId !== ''
      ? { kind: 'app', rootEntryId: candidate.rootEntryId }
      : undefined;
  }
  if (contentUrl.startsWith(VIEWER_CONTENT_PREFIX)) {
    const candidate = parseHashObject(contentUrl, VIEWER_CONTENT_PREFIX);
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
