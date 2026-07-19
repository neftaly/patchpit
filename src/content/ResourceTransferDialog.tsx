import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { isValidAutomergeUrl } from '@automerge/automerge-repo';
import type { FolderLinkRow } from '@patchpit/fs';
import type { PatchpitRuntime } from '../root/runtime.ts';
import type { ResourceRelocationIntent } from '../root/resource-transfer.ts';
import type {
  PreparedResourceCopyIntent,
  ResourceCopyRequest,
} from '../root/resource-transfer-runtime.ts';
import type { ResourceTransferDestination } from './resource-projection.ts';

export type ResourceTransferRuntime = Pick<
  PatchpitRuntime,
  'copyResource' | 'prepareResourceCopy' | 'relocateResource'
>;

export type ResourceTransferCloseFocus = 'files' | 'resource';

type ReadyResourceTransferAttempt = {
  readonly intent: ResourceRelocationIntent;
  readonly kind: 'move';
} | {
  readonly intent: PreparedResourceCopyIntent;
  readonly kind: 'copy';
};

type ResourceTransferAttempt = ReadyResourceTransferAttempt | {
  readonly kind: 'copy';
  readonly request: ResourceCopyRequest;
};

type ResourceTransferOutcome = Awaited<
  ReturnType<ResourceTransferRuntime['copyResource'] | ResourceTransferRuntime['relocateResource']>
>;

type ResourceTransferDialogState = {
  readonly state: 'choosing';
} | {
  readonly attempt: ResourceTransferAttempt;
  readonly state: 'running';
} | {
  readonly attempt: ResourceTransferAttempt;
  readonly outcome: ResourceTransferOutcome;
  readonly state: 'settled';
} | {
  readonly attempt: ResourceTransferAttempt;
  readonly state: 'interrupted';
};

export function ResourceTransferDialog({ destinations, onClose, runtime, source }: {
  readonly destinations: readonly ResourceTransferDestination[];
  readonly onClose: (focus: ResourceTransferCloseFocus) => void;
  readonly runtime: ResourceTransferRuntime;
  readonly source: FolderLinkRow;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeFocus = useRef<ResourceTransferCloseFocus>('resource');
  const mounted = useRef(true);
  const operationActive = useRef(false);
  const titleId = useId();
  const [dialogState, setDialogState] = useState<ResourceTransferDialogState>({ state: 'choosing' });
  const [destinationSourceId, setDestinationSourceId] = useState(() =>
    destinations.find(({ sourceId }) => sourceId !== source.sourceId)?.sourceId
      ?? destinations[0]?.sourceId
      ?? source.sourceId);
  const running = dialogState.state === 'running';
  useEffect(() => {
    mounted.current = true;
    if (dialog.current?.open === false) dialog.current.showModal();
    return () => { mounted.current = false; };
  }, []);
  const settle = (state: ResourceTransferDialogState) => {
    if (mounted.current) setDialogState(state);
  };
  const runAttempt = async (attempt: ResourceTransferAttempt) => {
    if (operationActive.current) return;
    operationActive.current = true;
    settle({ attempt, state: 'running' });
    try {
      settle(await performTransferAttempt(runtime, attempt));
    } finally {
      operationActive.current = false;
    }
  };
  const beginTransfer = (kind: 'copy' | 'move') => {
    const common = {
      destinationLinkId: crypto.randomUUID(),
      destinationSourceId,
      source,
      transferId: crypto.randomUUID(),
    };
    void runAttempt(kind === 'move'
      ? { intent: common, kind }
      : { kind, request: common });
  };
  const copyable = source.typeHint === 'file' && isValidAutomergeUrl(source.resourceRef);
  const status = dialogState.state === 'choosing' ? undefined : resourceTransferStatus(dialogState);
  return (
    <dialog
      aria-labelledby={titleId}
      className="resource-transfer-dialog"
      onCancel={(event) => {
        if (running) {
          event.preventDefault();
        } else if (dialogState.state !== 'choosing') {
          closeFocus.current = resourceTransferCloseFocus(dialogState);
        }
      }}
      onClose={() => onClose(closeFocus.current)}
      ref={dialog}
    >
      <h2 id={titleId}>Transfer {source.name}</h2>
      {dialogState.state === 'choosing' ? (
        <>
          <label>
            Destination
            <select
              onChange={(event) => setDestinationSourceId(event.currentTarget.value)}
              value={destinationSourceId}
            >
              {destinations.map((destination) => (
                <option key={destination.sourceId} value={destination.sourceId}>
                  {destination.label}
                </option>
              ))}
            </select>
          </label>
          <div className="resource-transfer-actions">
            <button
              disabled={destinationSourceId === source.sourceId}
              onClick={() => beginTransfer('move')}
              type="button"
            >
              Move
            </button>
            {copyable && <button onClick={() => beginTransfer('copy')} type="button">Copy</button>}
            <button onClick={() => { dialog.current?.close(); }} type="button">Cancel</button>
          </div>
        </>
      ) : (
        status !== undefined && <>
          <p
            aria-live={status.alert ? undefined : 'polite'}
            role={status.alert ? 'alert' : 'status'}
          >
            {status.message}
          </p>
          {status.issueCodes.length > 0 && (
            <p className="resource-transfer-issues">{status.issueCodes.join(', ')}</p>
          )}
          <div className="resource-transfer-actions">
            {status.retryable && dialogState.state !== 'running' && (
              <button
                onClick={() => { void runAttempt(dialogState.attempt); }}
                type="button"
              >
                Retry
              </button>
            )}
            {dialogState.state !== 'running' && (
              <button
                onClick={() => {
                  closeFocus.current = resourceTransferCloseFocus(dialogState);
                  dialog.current?.close();
                }}
                type="button"
              >
                Close
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}

const prepareTransferAttempt = async (
  runtime: ResourceTransferRuntime,
  attempt: ResourceTransferAttempt,
): Promise<{ readonly attempt: ReadyResourceTransferAttempt; readonly state: 'ready' } | {
  readonly outcome: Extract<ResourceTransferOutcome, { readonly state: 'blocked' }>;
  readonly state: 'blocked';
}> => {
  if (attempt.kind === 'move' || 'intent' in attempt) {
    return { attempt, state: 'ready' };
  }
  const prepared = await runtime.prepareResourceCopy(attempt.request);
  return prepared.state === 'ready'
    ? { attempt: { intent: prepared.intent, kind: 'copy' }, state: 'ready' }
    : { outcome: prepared, state: 'blocked' };
};

const performTransferAttempt = async (
  runtime: ResourceTransferRuntime,
  attempt: ResourceTransferAttempt,
): Promise<Extract<ResourceTransferDialogState, { readonly state: 'interrupted' | 'settled' }>> => {
  const prepared = await prepareTransferAttempt(runtime, attempt).catch(() => undefined);
  if (prepared === undefined) return { attempt, state: 'interrupted' };
  if (prepared.state === 'blocked') {
    return { attempt, outcome: prepared.outcome, state: 'settled' };
  }
  try {
    const outcome = await executeTransferAttempt(runtime, prepared.attempt);
    return { attempt: prepared.attempt, outcome, state: 'settled' };
  } catch {
    return { attempt: prepared.attempt, state: 'interrupted' };
  }
};

const executeTransferAttempt = (
  runtime: ResourceTransferRuntime,
  attempt: ReadyResourceTransferAttempt,
) => attempt.kind === 'move'
  ? runtime.relocateResource(attempt.intent)
  : runtime.copyResource(attempt.intent);

const resourceTransferStatus = (state: Exclude<ResourceTransferDialogState, { readonly state: 'choosing' }>) => {
  const action = state.attempt.kind === 'copy' ? 'Copy' : 'Move';
  if (state.state === 'running') {
    return { alert: false, issueCodes: [], message: `${action} in progress…`, retryable: false };
  }
  if (state.state === 'interrupted') {
    return {
      alert: true,
      issueCodes: [],
      message: `${action} was interrupted. Its outcome may be unknown.`,
      retryable: true,
    };
  }
  const { outcome } = state;
  const issues = 'receipt' in outcome
    ? outcome.receipt.issues
    : 'issues' in outcome ? outcome.issues : [];
  const issueCodes = issues.map(({ code }) => code);
  if (outcome.state === 'complete') {
    return { alert: false, issueCodes, message: `${action} complete.`, retryable: false };
  }
  if (outcome.state === 'no-op') {
    return { alert: false, issueCodes, message: `${action} made no change.`, retryable: false };
  }
  if (outcome.state === 'partial') {
    const orphaned = outcome.receipt.kind === 'sequence'
      ? outcome.receipt.orphanedSourceIds.length
      : 0;
    return {
      alert: true,
      issueCodes,
      message: orphaned === 0
        ? `${action} partially completed. Both occurrences may remain visible.`
        : `${action} created ${orphaned} unlinked document${orphaned === 1 ? '' : 's'}.`,
      retryable: true,
    };
  }
  if (outcome.state === 'blocked') {
    return {
      alert: true,
      issueCodes,
      message: `${action} blocked: ${outcome.reason.replaceAll('-', ' ')}.`,
      retryable: outcome.issues.some(({ retry }) =>
        retry === 'after_refresh' || retry === 'query_outcome'),
    };
  }
  return {
    alert: true,
    issueCodes,
    message: `${action} ${outcome.state}.`,
    retryable: true,
  };
};

const resourceTransferCloseFocus = (
  state: Exclude<ResourceTransferDialogState, { readonly state: 'choosing' | 'running' }>,
): ResourceTransferCloseFocus => state.attempt.kind === 'move'
  && (state.state === 'interrupted'
    || state.outcome.state === 'complete'
    || state.outcome.state === 'unknown')
  ? 'files'
  : 'resource';
