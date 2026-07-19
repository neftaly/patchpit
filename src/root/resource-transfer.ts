import {
  folderLinkFactsFromRow,
  sameFolderLinkFacts,
  type FolderLinkFacts,
  type FolderLinkRow,
  type FolderOperation,
} from '@patchpit/fs';
import type { SourceBasis } from '@tarstate/core/source';

type ResourceTransferIntent = {
  readonly destinationLinkId: string;
  readonly destinationSourceId: string;
  readonly source: FolderLinkRow;
  readonly transferId: string;
};

export type ResourceRelocationIntent = ResourceTransferIntent;

export type ResourceCopyIntent = ResourceTransferIntent & {
  readonly sourceBasis: SourceBasis;
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
  readonly reason: 'ambiguous-links' | 'destination-collision' | 'destination-missing' | 'folder-cycle' | 'source-changed' | 'source-missing';
  readonly state: 'blocked';
};

export type ResourceRelocationStep = 'add-destination' | 'unlink-source';

export const classifyExactResourceRelocationStep = (
  intent: ResourceRelocationIntent,
  resources: readonly FolderLinkRow[],
  step: ResourceRelocationStep,
): Extract<ResourceRelocationProgress, { readonly state: 'ready' | 'blocked' }> => {
  const progress = classifyExactResourceRelocation(intent, resources);
  if (progress.state === 'blocked') return progress;
  if (progress.state === 'no-op') {
    return { destinationApplied: false, reason: 'source-changed', state: 'blocked' };
  }
  if (progress.state === 'ready' && progress.step === step) return progress;
  if (step === 'add-destination') {
    return {
      operation: { kind: 'folder.link.alias', link: relocationDestinationLink(intent) },
      sourceId: intent.destinationSourceId,
      state: 'ready',
      step,
    };
  }
  if (progress.state === 'complete') {
    return {
      operation: {
        kind: 'folder.link.unlink',
        linkId: intent.source.linkId,
        expected: folderLinkFactsFromRow(intent.source),
      },
      sourceId: intent.source.sourceId,
      state: 'ready',
      step,
    };
  }
  return {
    destinationApplied: false,
    reason: 'destination-missing',
    state: 'blocked',
  };
};

export type ResourceCopyProgress = {
  readonly state: 'complete';
} | {
  readonly operation: FolderOperation;
  readonly sourceId: string;
  readonly state: 'ready';
  readonly step: 'add-destination';
} | {
  readonly reason: 'ambiguous-links' | 'destination-collision' | 'source-changed' | 'source-missing';
  readonly state: 'blocked';
};

export type ResourceCopySourceProgress = {
  readonly state: 'ready';
} | {
  readonly reason: 'ambiguous-links' | 'source-changed' | 'source-missing';
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
    && sameFolderLinkFacts(destination, desiredDestination);
  if (destination !== undefined && !destinationApplied) {
    return { destinationApplied: false, reason: 'destination-collision', state: 'blocked' };
  }
  const currentSource = sources[0];
  if (currentSource !== undefined && !sameFolderLinkFacts(currentSource, source)) {
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
        operation: {
          kind: 'folder.link.unlink',
          linkId: source.linkId,
          expected: folderLinkFactsFromRow(source),
        },
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
): FolderLinkFacts => ({
  linkId: intent.destinationLinkId,
  name: intent.source.name,
  resourceRef: intent.source.resourceRef,
  typeHint: intent.source.typeHint,
  ...(intent.source.copyOf === undefined ? {} : { copyOf: intent.source.copyOf }),
  ...(intent.source.icon === undefined ? {} : { icon: intent.source.icon }),
});

export const classifyExactResourceCopy = (
  intent: ResourceCopyIntent,
  copiedResourceRef: string,
  resources: readonly FolderLinkRow[],
): ResourceCopyProgress => {
  const sourceProgress = classifyExactResourceCopySource(intent, resources);
  if (sourceProgress.state === 'blocked') return sourceProgress;
  const destinations = matchingLinks(
    resources,
    intent.destinationSourceId,
    intent.destinationLinkId,
  );
  if (destinations.length > 1) {
    return { reason: 'ambiguous-links', state: 'blocked' };
  }
  const link = copyDestinationLink(intent, copiedResourceRef);
  const destination = destinations[0];
  if (destination !== undefined) {
    return sameFolderLinkFacts(destination, link)
      ? { state: 'complete' }
      : { reason: 'destination-collision', state: 'blocked' };
  }
  return {
    operation: { kind: 'folder.link.alias', link },
    sourceId: intent.destinationSourceId,
    state: 'ready',
    step: 'add-destination',
  };
};

export const classifyExactResourceCopySource = (
  intent: Pick<ResourceCopyIntent, 'source'>,
  resources: readonly FolderLinkRow[],
): ResourceCopySourceProgress => {
  const sources = matchingLinks(resources, intent.source.sourceId, intent.source.linkId);
  if (sources.length > 1) return { reason: 'ambiguous-links', state: 'blocked' };
  const source = sources[0];
  if (source === undefined) return { reason: 'source-missing', state: 'blocked' };
  return sameFolderLinkFacts(source, intent.source)
    ? { state: 'ready' }
    : { reason: 'source-changed', state: 'blocked' };
};

export const copyDestinationLink = (
  intent: ResourceCopyIntent,
  copiedResourceRef: string,
): FolderLinkFacts => ({
  linkId: intent.destinationLinkId,
  name: intent.source.name,
  resourceRef: copiedResourceRef,
  typeHint: intent.source.typeHint,
  copyOf: intent.source.resourceRef,
  ...(intent.source.icon === undefined ? {} : { icon: intent.source.icon }),
});

const matchingLinks = (
  resources: readonly FolderLinkRow[],
  sourceId: string,
  linkId: string,
) => resources.filter((resource) =>
  resource.sourceId === sourceId && resource.linkId === linkId);

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
