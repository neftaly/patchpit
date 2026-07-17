import type { FolderLinkRow } from '@patchpit/fs';
import type { ResourceProjection } from './resource-projection.ts';

export const resourceBrowserUrl = 'files.html';

const APP_CONTENT_PREFIX = 'app.html#';
const VIEWER_CONTENT_PREFIX = 'viewer.html#';

type ContentInvocation = {
  readonly kind: 'resources';
} | {
  readonly kind: 'app';
  readonly resourceRef: string;
} | {
  readonly kind: 'viewer';
  readonly resourceRef: string;
};

export const appContentUrl = (resourceRef: string) =>
  `${APP_CONTENT_PREFIX}${JSON.stringify({ resourceRef })}`;

export const viewerContentUrl = (resourceRef: string) =>
  `${VIEWER_CONTENT_PREFIX}${JSON.stringify({ resourceRef })}`;

export const contentUrlForResource = (
  resource: FolderLinkRow,
  resources: ResourceProjection,
): string | undefined => {
  if (resource.typeHint !== 'folder') return viewerContentUrl(resource.resourceRef);
  return resources.launchableFolders.has(resource.resourceRef)
    ? appContentUrl(resource.resourceRef)
    : undefined;
};

export const contentLabel = (
  resources: ResourceProjection,
  contentUrl: string | undefined,
  resourceTitles?: ReadonlyMap<string, string>,
) => {
  const invocation = contentUrl === undefined ? undefined : parseContentInvocation(contentUrl);
  if (invocation?.kind === 'resources') return 'Resources';
  if (invocation === undefined) return 'Resource unavailable';
  const resource = resources.byResourceRef.get(invocation.resourceRef);
  if (resource === undefined) return invocation.kind === 'app' ? 'App unavailable' : 'Resource unavailable';
  const title = resourceTitles?.get(invocation.resourceRef) ?? resource.name;
  return invocation.kind === 'app' ? `${title} / index.html` : title;
};

export const parseContentInvocation = (contentUrl: string): ContentInvocation | undefined => {
  if (contentUrl === resourceBrowserUrl) return { kind: 'resources' };
  if (contentUrl.startsWith(APP_CONTENT_PREFIX)) {
    const resourceRef = parseResourceRef(contentUrl, APP_CONTENT_PREFIX);
    return resourceRef === undefined ? undefined : { kind: 'app', resourceRef };
  }
  if (contentUrl.startsWith(VIEWER_CONTENT_PREFIX)) {
    const resourceRef = parseResourceRef(contentUrl, VIEWER_CONTENT_PREFIX);
    return resourceRef === undefined ? undefined : { kind: 'viewer', resourceRef };
  }
  return undefined;
};

const parseResourceRef = (contentUrl: string, prefix: string) => {
  try {
    const candidate: unknown = JSON.parse(contentUrl.slice(prefix.length));
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
      && 'resourceRef' in candidate && typeof candidate.resourceRef === 'string'
      && candidate.resourceRef !== '' ? candidate.resourceRef : undefined;
  } catch {
    return undefined;
  }
};
