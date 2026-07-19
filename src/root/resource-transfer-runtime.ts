import * as Automerge from '@automerge/automerge';
import {
  isValidAutomergeUrl,
  type DocHandle,
  type Repo,
} from '@automerge/automerge-repo';
import {
  openAutomergeFileDatabase,
  openAutomergeFolderDatabase,
  type AutomergeFolderDatabase,
} from '@patchpit/automerge-fs';
import {
  commitFolderOperation,
  openFileDocumentQuery,
  type FolderLinkRow,
} from '@patchpit/fs';
import { createAutomergeRepoLifecycleAdapter } from '@tarstate/automerge/repo-lifecycle';
import { viewAutomergeDocumentAtBasis } from '@tarstate/automerge/view';
import {
  createIssue,
  sha256Json,
  type CapabilityRef,
  type Issue,
} from '@tarstate/core';
import type { DatabaseQuerySession } from '@tarstate/core/database/session';
import {
  executeDatabaseNonAtomicBatch,
  executeSequence,
  SourceLifecycleCoordinator,
  type NonAtomicBatchReceipt,
  type SequenceReceipt,
  type SourceLifecycleCommand,
} from '@tarstate/core/transactions';
import { toPortableBytes } from '@tarstate/core/values';
import {
  classifyExactResourceCopy,
  classifyExactResourceCopySource,
  classifyExactResourceRelocation,
  classifyExactResourceRelocationStep,
  copyDestinationLink,
  type ResourceCopyIntent,
  type ResourceRelocationIntent,
} from './resource-transfer.ts';

export type ResourceCopyRequest = Omit<ResourceCopyIntent, 'sourceBasis'>;

export type PreparedResourceCopyIntent = ResourceCopyIntent & {
  readonly operationEpoch: string;
};

export type PreparedResourceCopy = {
  readonly intent: PreparedResourceCopyIntent;
  readonly state: 'ready';
} | ResourceTransferBlocked;

export type ResourceTransferResult<Receipt extends NonAtomicBatchReceipt | SequenceReceipt> = {
  readonly state: 'no-op';
} | ResourceTransferBlocked | {
  readonly receipt: Receipt;
  readonly state: Receipt['outcome'];
};

export type ResourceTransferBlocked = {
  readonly issues: readonly Issue[];
  readonly reason:
    | 'destination-unavailable'
    | 'document-basis-unavailable'
    | 'document-incomplete'
    | 'document-invalid'
    | 'document-stale'
    | 'graph-incomplete'
    | 'graph-invalid'
    | 'graph-stale'
    | 'operation-expired'
    | 'root-closed'
    | 'source-unavailable'
    | 'unsupported-copy'
    | 'ambiguous-links'
    | 'destination-collision'
    | 'destination-missing'
    | 'folder-cycle'
    | 'source-changed'
    | 'source-missing';
  readonly state: 'blocked';
};

type ResourceQuery = DatabaseQuerySession<FolderLinkRow>;

type ResourceTransferRuntimeOptions = {
  readonly isClosed: () => boolean;
  readonly repo: Repo;
  readonly resolveDocument: (
    resourceRef: string,
    signal?: AbortSignal,
  ) => Promise<DocHandle<object> | undefined>;
  readonly resourceQuery: ResourceQuery;
  readonly rootUrl: string;
};

const SOURCE_CAPABILITY_ID = 'urn:patchpit:capability:source/automerge-history-import';
const SOURCE_CAPABILITY_VERSION = '1';

export const createResourceTransferRuntime = async (
  options: ResourceTransferRuntimeOptions,
) => {
  const sourceCapability: CapabilityRef = {
    id: SOURCE_CAPABILITY_ID,
    version: SOURCE_CAPABILITY_VERSION,
    contractHash: await sha256Json({
      kind: 'patchpit.source-capability',
      operation: 'create-automerge-source-from-exact-history',
      version: 1,
    }),
  };
  const operationEpoch = `${options.rootUrl}:resource-transfer:${crypto.randomUUID()}`;
  const lifecycleCoordinatorId = `${options.rootUrl}:documents`;
  const lifecycle = new SourceLifecycleCoordinator({
    lifecycleCoordinatorId,
    operationEpoch,
    authorityViewFingerprint: await sha256Json({
      authority: 'patchpit.resource-transfer',
      rootUrl: options.rootUrl,
      version: 1,
    }),
    authorize: () => ({ allowed: true }),
    adapter: createAutomergeRepoLifecycleAdapter({
      repo: options.repo,
      sourceCapability,
    }),
  });

  const prepareResourceCopy = async (
    request: ResourceCopyRequest,
    signal?: AbortSignal,
  ): Promise<PreparedResourceCopy> => {
    const graph = await exactResourceGraph(options, signal);
    if (graph.state === 'blocked') return graph;
    const classified = classifyExactResourceCopySource(request, graph.rows);
    if (classified.state === 'blocked') return blocked(classified.reason);
    if (request.source.typeHint !== 'file'
      || !isValidAutomergeUrl(request.source.resourceRef)) {
      return blocked('unsupported-copy');
    }
    const handle = await options.resolveDocument(request.source.resourceRef, signal);
    if (handle === undefined) return blocked('source-unavailable');
    const opened = await openAutomergeFileDatabase(handle, 'public');
    if (!opened.success) return blocked('document-invalid', opened.issues);
    try {
      const query = await openFileDocumentQuery(opened.value);
      try {
        const projection = await query.whenSettled(signal === undefined ? undefined : { signal });
        if (!isExact(projection)) {
          return blocked(projection.readiness === 'invalid'
            ? 'document-invalid'
            : projection.freshness !== 'current'
              ? 'document-stale'
              : 'document-incomplete', projection.issues);
        }
        const bases = projection.basis.attachments.filter(({ sourceId }) =>
          sourceId === request.source.resourceRef);
        if (bases.length !== 1 || projection.rows.length !== 1) {
          return blocked('document-basis-unavailable', projection.issues);
        }
        return {
          state: 'ready',
          intent: { ...request, operationEpoch, sourceBasis: bases[0]!.basis },
        };
      } finally {
        query.close();
      }
    } finally {
      opened.value.close();
    }
  };

  const relocateResource = async (
    intent: ResourceRelocationIntent,
    signal?: AbortSignal,
  ): Promise<ResourceTransferResult<NonAtomicBatchReceipt>> => {
    const graph = await exactResourceGraph(options, signal);
    if (graph.state === 'blocked') return graph;
    const initial = classifyExactResourceRelocation(intent, graph.rows);
    if (initial.state === 'no-op') return { state: 'no-op' };
    if (initial.state === 'blocked') return blocked(initial.reason);
    const destination = await openFolder(
      options,
      intent.destinationSourceId,
      'destination-unavailable',
      signal,
    );
    if (destination.state === 'blocked') return destination;
    const source = await openFolder(
      options,
      intent.source.sourceId,
      'source-unavailable',
      signal,
    );
    if (source.state === 'blocked') {
      destination.database.close();
      return source;
    }
    try {
      const receipt = await executeDatabaseNonAtomicBatch({
        batchId: intent.transferId,
        failurePolicy: 'stop',
        ...(signal === undefined ? {} : { signal }),
        steps: [{
          stepId: 'add-destination',
          attachmentId: destination.database.attachmentId,
          sourceId: destination.database.sourceId,
          transact: () => transactRelocationStep(
            options,
            destination.database,
            intent,
            'add-destination',
            signal,
          ),
        }, {
          stepId: 'unlink-source',
          attachmentId: source.database.attachmentId,
          sourceId: source.database.sourceId,
          transact: () => transactRelocationStep(
            options,
            source.database,
            intent,
            'unlink-source',
            signal,
          ),
        }],
      });
      return { state: receipt.outcome, receipt };
    } finally {
      source.database.close();
      destination.database.close();
    }
  };

  const copyResource = async (
    intent: PreparedResourceCopyIntent,
    signal?: AbortSignal,
  ): Promise<ResourceTransferResult<SequenceReceipt>> => {
    if (intent.operationEpoch !== operationEpoch) return blocked('operation-expired');
    const graph = await exactResourceGraph(options, signal);
    if (graph.state === 'blocked') return graph;
    const sourceProgress = classifyExactResourceCopySource(intent, graph.rows);
    if (sourceProgress.state === 'blocked') return blocked(sourceProgress.reason);
    if (intent.source.typeHint !== 'file'
      || !isValidAutomergeUrl(intent.source.resourceRef)) {
      return blocked('unsupported-copy');
    }
    const handle = await options.resolveDocument(intent.source.resourceRef, signal);
    if (handle === undefined) return blocked('source-unavailable');
    const historical = viewAutomergeDocumentAtBasis(handle.doc(), intent.sourceBasis);
    if (!historical.success) return blocked('document-basis-unavailable');
    const destination = await openFolder(
      options,
      intent.destinationSourceId,
      'destination-unavailable',
      signal,
    );
    if (destination.state === 'blocked') return destination;
    let copiedResourceRef: string | undefined;
    try {
      const command: SourceLifecycleCommand = {
        lifecycleCoordinatorId,
        operationEpoch: intent.operationEpoch,
        operationId: intent.transferId,
        request: {
          action: 'create',
          sourceCapability,
          input: toPortableBytes(Automerge.save(historical.value)),
        },
      };
      const receipt = await executeSequence({
        sequenceId: intent.transferId,
        failurePolicy: 'stop',
        steps: [{
          stepId: 'create-document',
          run: async () => {
            const lifecycleReceipt = await lifecycle.execute(
              command,
              signal === undefined ? undefined : { signal },
            );
            if (lifecycleReceipt.outcome === 'committed') {
              copiedResourceRef = lifecycleReceipt.sourceId;
            }
            return lifecycleReceipt;
          },
        }, {
          stepId: 'add-destination',
          run: async () => {
            if (copiedResourceRef === undefined) {
              throw new Error('Committed source lifecycle receipt omitted its source ID');
            }
            const current = await exactResourceGraph(options, signal);
            if (current.state === 'blocked') {
              return rejectTransfer(
                destination.database,
                intent.transferId,
                current.reason,
                current.issues,
                signal,
              );
            }
            const progress = classifyExactResourceCopy(intent, copiedResourceRef, current.rows);
            return progress.state === 'ready'
              ? commitFolderOperation(destination.database, progress.operation, signal)
              : progress.state === 'complete'
                ? commitFolderOperation(destination.database, {
                    kind: 'folder.link.alias',
                    link: copyDestinationLink(intent, copiedResourceRef),
                  }, signal)
                : rejectTransfer(
                    destination.database,
                    intent.transferId,
                    progress.reason,
                    [],
                    signal,
                  );
          },
        }],
      });
      return { state: receipt.outcome, receipt };
    } finally {
      destination.database.close();
    }
  };

  return { copyResource, prepareResourceCopy, relocateResource };
};

const transactRelocationStep = async (
  options: ResourceTransferRuntimeOptions,
  database: AutomergeFolderDatabase,
  intent: ResourceRelocationIntent,
  step: 'add-destination' | 'unlink-source',
  signal?: AbortSignal,
) => {
  const graph = await exactResourceGraph(options, signal);
  if (graph.state === 'blocked') {
    return rejectTransfer(database, intent.transferId, graph.reason, graph.issues, signal);
  }
  const progress = classifyExactResourceRelocationStep(intent, graph.rows, step);
  return progress.state === 'ready'
    ? commitFolderOperation(database, progress.operation, signal)
    : rejectTransfer(database, intent.transferId, progress.reason, [], signal);
};

const openFolder = async (
  options: ResourceTransferRuntimeOptions,
  sourceId: string,
  unavailableReason: 'destination-unavailable' | 'source-unavailable',
  signal?: AbortSignal,
): Promise<{ readonly database: AutomergeFolderDatabase; readonly state: 'ready' }
  | ResourceTransferBlocked> => {
  if (!isValidAutomergeUrl(sourceId)) return blocked(unavailableReason);
  const handle = await options.resolveDocument(sourceId, signal);
  if (handle === undefined) return blocked(unavailableReason);
  const opened = await openAutomergeFolderDatabase(handle);
  return opened.success
    ? { database: opened.value, state: 'ready' }
    : blocked(unavailableReason, opened.issues);
};

const exactResourceGraph = async (
  options: ResourceTransferRuntimeOptions,
  signal?: AbortSignal,
): Promise<{ readonly rows: readonly FolderLinkRow[]; readonly state: 'ready' }
  | ResourceTransferBlocked> => {
  if (options.isClosed()) return blocked('root-closed');
  const result = await options.resourceQuery.whenSettled(
    signal === undefined ? undefined : { signal },
  );
  if (options.isClosed()) return blocked('root-closed');
  if (!isExact(result)) {
    return blocked(result.readiness === 'invalid'
      ? 'graph-invalid'
      : result.freshness !== 'current'
        ? 'graph-stale'
        : 'graph-incomplete', result.issues);
  }
  return { rows: result.rows, state: 'ready' };
};

const isExact = (result: {
  readonly completeness: 'exact' | 'lower-bound' | 'unknown';
  readonly freshness: 'current' | 'stale' | 'mixed' | 'none';
  readonly issues: readonly Issue[];
  readonly readiness: 'ready' | 'incomplete' | 'invalid';
}) => result.readiness === 'ready'
  && result.completeness === 'exact'
  && result.freshness === 'current'
  && !result.issues.some(({ severity }) => severity === 'error');

const rejectTransfer = (
  database: AutomergeFolderDatabase,
  transferId: string,
  reason: ResourceTransferBlocked['reason'],
  issues: readonly Issue[],
  signal?: AbortSignal,
) => database.transact(
  { kind: 'resource.transfer.reject', reason, transferId },
  (snapshot) => {
    const diagnostic = transferIssue(reason, transferId);
    return snapshot.reject(
      diagnostic,
      ...issues.filter(({ code }) => code !== diagnostic.code),
    );
  },
  signal === undefined ? undefined : { signal },
);

const blocked = (
  reason: ResourceTransferBlocked['reason'],
  issues: readonly Issue[] = [],
): ResourceTransferBlocked => ({
  state: 'blocked',
  reason,
  issues: [transferIssue(reason), ...issues],
});

const transferIssue = (
  reason: ResourceTransferBlocked['reason'],
  operationId?: string,
) => createIssue({
  code: `patchpit.resource_transfer.${reason.replaceAll('-', '_')}`,
  phase: 'commit',
  severity: 'error',
  retry: reason === 'root-closed' || reason === 'unsupported-copy'
    ? 'never'
    : reason === 'operation-expired' ? 'after_input' : 'after_refresh',
  ...(operationId === undefined ? {} : { operationId }),
  details: { reason },
});
