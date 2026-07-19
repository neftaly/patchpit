import type { FolderLink, FolderLinkRow, FolderOperation } from '@patchpit/fs';

export type ResourceRelocationIntent = {
  readonly destinationLinkId: string;
  readonly destinationSourceId: string;
  readonly source: FolderLinkRow;
  readonly transferId: string;
};

export type ResourceRelocationProgress = {
  readonly state: 'complete';
} | {
  readonly reason: 'same-source';
  readonly state: 'no-op';
} | {
  readonly operation: FolderOperation;
  readonly sourceId: string;
  readonly state: 'ready';
  readonly step: 'add-destination' | 'unlink-source';
} | {
  readonly destinationApplied: boolean;
  readonly reason: 'ambiguous-links' | 'destination-collision' | 'folder-cycle' | 'source-changed' | 'source-missing';
  readonly state: 'blocked';
};

export const classifyExactResourceRelocation = (
  intent: ResourceRelocationIntent,
  resources: readonly FolderLinkRow[],
): ResourceRelocationProgress => {
  const { destinationLinkId, destinationSourceId, source } = intent;
  if (source.sourceId === destinationSourceId) return { reason: 'same-source', state: 'no-op' };
  const desiredDestination = relocationDestinationLink(intent);
  const destinations = matchingLinks(resources, destinationSourceId, destinationLinkId);
  const sources = matchingLinks(resources, source.sourceId, source.linkId);
  if (destinations.length > 1 || sources.length > 1) {
    return { destinationApplied: false, reason: 'ambiguous-links', state: 'blocked' };
  }
  const destination = destinations[0];
  const destinationApplied = destination !== undefined
    && sameTransferableLink(destination, desiredDestination);
  if (destination !== undefined && !destinationApplied) {
    return { destinationApplied: false, reason: 'destination-collision', state: 'blocked' };
  }
  const currentSource = sources[0];
  if (currentSource !== undefined && !sameTransferableLink(currentSource, source)) {
    return { destinationApplied, reason: 'source-changed', state: 'blocked' };
  }
  if (wouldIntroduceFolderCycle(resources, source, destinationSourceId)) {
    return { destinationApplied, reason: 'folder-cycle', state: 'blocked' };
  }
  if (destinationApplied && currentSource === undefined) return { state: 'complete' };
  if (currentSource === undefined) {
    return { destinationApplied: false, reason: 'source-missing', state: 'blocked' };
  }
  return destinationApplied
    ? {
        operation: { kind: 'folder.link.unlink', linkId: source.linkId },
        sourceId: source.sourceId,
        state: 'ready',
        step: 'unlink-source',
      }
    : {
        operation: { kind: 'folder.link.alias', link: desiredDestination },
        sourceId: destinationSourceId,
        state: 'ready',
        step: 'add-destination',
      };
};

export const relocationDestinationLink = (
  intent: ResourceRelocationIntent,
): Omit<FolderLink, 'order'> => ({
  linkId: intent.destinationLinkId,
  name: intent.source.name,
  resourceRef: intent.source.resourceRef,
  typeHint: intent.source.typeHint,
  ...(intent.source.copyOf === undefined ? {} : { copyOf: intent.source.copyOf }),
  ...(intent.source.icon === undefined ? {} : { icon: intent.source.icon }),
});

const matchingLinks = (
  resources: readonly FolderLinkRow[],
  sourceId: string,
  linkId: string,
) => resources.filter((resource) =>
  resource.sourceId === sourceId && resource.linkId === linkId);

const sameTransferableLink = (
  left: Omit<FolderLinkRow, 'order' | 'sourceId'>,
  right: Omit<FolderLinkRow, 'order' | 'sourceId'>,
) => left.linkId === right.linkId
  && left.name === right.name
  && left.resourceRef === right.resourceRef
  && left.typeHint === right.typeHint
  && left.copyOf === right.copyOf
  && left.icon === right.icon;

const wouldIntroduceFolderCycle = (
  resources: readonly FolderLinkRow[],
  source: FolderLinkRow,
  destinationSourceId: string,
) => {
  if (source.typeHint !== 'folder') return false;
  const pending = [source.resourceRef];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const sourceId = pending.pop();
    if (sourceId === undefined || visited.has(sourceId)) continue;
    if (sourceId === destinationSourceId) return true;
    visited.add(sourceId);
    resources.forEach((resource) => {
      if (resource.sourceId === sourceId && resource.typeHint === 'folder') {
        pending.push(resource.resourceRef);
      }
    });
  }
  return false;
};
