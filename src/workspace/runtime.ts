import { getConflicts } from '@automerge/automerge';
import type { DocHandle } from '@automerge/automerge-repo';
import {
  mappedRelationRows,
  openAutomergeDatabase,
  type AutomergeDatabaseSnapshot,
} from '@tarstate/automerge';
import { adoptConflictFreeAutomergeJsonValue } from '@tarstate/automerge/values';
import {
  canonicalizeJson,
  createIssue,
  type Issue,
  type JsonValue,
} from '@tarstate/core';
import {
  safeParseDocumentDeclaration,
} from '@tarstate/core/attachment/declaration';
import type { SourceBasis } from '@tarstate/core/source';
import { workspaceDocumentMetadata, workspaceRelations } from '@patchpit/artifacts';
import {
  applyWorkspaceOperation,
  type WorkspaceOperation,
  type WorkspaceState,
} from './durable-state.ts';
import {
  workspaceFromRelationRows,
  workspaceFromTransactionSnapshot,
  workspaceTransactionWithState,
  type WorkspaceDocument,
} from './document.ts';

export { createWorkspaceDocument, type WorkspaceDocument } from './document.ts';

type WorkspaceProjection = {
  readonly state: 'ready';
  readonly workspace: WorkspaceState;
  readonly basis: SourceBasis;
  readonly issues: readonly Issue[];
} | {
  readonly state: 'incomplete' | 'invalid';
  readonly basis?: SourceBasis;
  readonly issues: readonly Issue[];
};

export const openWorkspaceRuntime = async (handle: DocHandle<WorkspaceDocument>) => {
  const document = handle.doc();
  if (document === undefined) throw new Error('Patchpit workspace source is unavailable');
  const metadata = parseWorkspaceMetadata(document);
  const opened = await openAutomergeDatabase({
    handle,
    declaration: metadata.declaration,
    embeddedArtifacts: metadata.schemas,
    authorityScope: 'patchpit.workspace',
    attachmentId: `${handle.url}:workspace`,
  });
  if (!opened.success) {
    throw new Error('Patchpit workspace attachment is unavailable', { cause: opened.issues });
  }
  const attachment = opened.value;
  let pendingTransactions = Promise.resolve();
  let cachedAttachmentSnapshot = attachment.getSnapshot();
  let cachedProjection = projectAttachmentSnapshot(cachedAttachmentSnapshot);

  const getSnapshot = (): WorkspaceProjection => {
    const snapshot = attachment.getSnapshot();
    if (snapshot !== cachedAttachmentSnapshot) {
      cachedAttachmentSnapshot = snapshot;
      cachedProjection = projectAttachmentSnapshot(snapshot);
    }
    return cachedProjection;
  };

  const commitOperation = (operation: WorkspaceOperation) => {
    const queuedTransaction = pendingTransactions.then(() => attachment.transact(
      operation,
      (snapshot) => {
        const decoded = workspaceFromTransactionSnapshot(snapshot);
        if (decoded.workspace === undefined) {
          throw new Error('Patchpit workspace logical state is unavailable', {
            cause: decoded.issues,
          });
        }
        const next = applyWorkspaceOperation(decoded.workspace, operation);
        return next === decoded.workspace ? snapshot : workspaceTransactionWithState(snapshot, next);
      },
    ));
    pendingTransactions = queuedTransaction.then(() => undefined, () => undefined);
    return queuedTransaction;
  };

  return {
    commitOperation,
    close: () => attachment.close(),
    getSnapshot,
    subscribe: (listener: () => void) => attachment.subscribe(listener),
  };
};

const projectAttachmentSnapshot = (
  snapshot: AutomergeDatabaseSnapshot,
): WorkspaceProjection => {
  if (snapshot.state === 'closed') {
    return { state: 'invalid', issues: [workspaceIssue('closed', {})] };
  }
  const { current } = snapshot;
  if (current.readiness !== 'ready') {
    return {
      state: current.readiness,
      basis: current.basis,
      issues: current.issues,
    };
  }
  const decoded = workspaceFromRelationRows({
    state: mappedRelationRows(current, workspaceRelations.state),
    panes: mappedRelationRows(current, workspaceRelations.panes),
    placements: mappedRelationRows(current, workspaceRelations.placements),
    splits: mappedRelationRows(current, workspaceRelations.splits),
  });
  const issues = [
    ...current.issues,
    ...decoded.issues.map(({ kind, details }) => workspaceIssue(kind, details)),
  ];
  return decoded.workspace === undefined || issues.some(({ severity }) => severity === 'error')
    ? { state: 'invalid', basis: current.basis, issues }
    : { state: 'ready', workspace: decoded.workspace, basis: current.basis, issues };
};

const parseWorkspaceMetadata = (document: WorkspaceDocument) => {
  if (getConflicts(document, '@patchpit') !== undefined) {
    throw invalidWorkspaceMetadata();
  }
  const adopted = adoptConflictFreeAutomergeJsonValue(document['@patchpit']);
  if (!adopted.success) throw invalidWorkspaceMetadata(adopted.issues);
  const input = adopted.value;
  if (!isRecord(input)
    || input.type !== workspaceDocumentMetadata.type
    || !sameArtifactRef(input.schema, workspaceDocumentMetadata.schema)
    || !isRecord(input.schemas)) {
    throw invalidWorkspaceMetadata();
  }
  const declaration = safeParseDocumentDeclaration(input.declaration);
  if (!declaration.success) throw invalidWorkspaceMetadata(declaration.issues);
  if (canonicalizeJson(declaration.value)
    !== canonicalizeJson(workspaceDocumentMetadata.declaration)) {
    throw invalidWorkspaceMetadata();
  }
  return { declaration: declaration.value, schemas: input.schemas };
};

const invalidWorkspaceMetadata = (cause: readonly Issue[] = [workspaceIssue('metadata-invalid', {})]) =>
  new Error('Patchpit workspace metadata is invalid', { cause });

const sameArtifactRef = (input: unknown, expected: { readonly id: string; readonly contentHash: string }) =>
  isRecord(input) && input.id === expected.id && input.contentHash === expected.contentHash;

const workspaceIssue = (kind: string, details: Readonly<Record<string, JsonValue>>) => createIssue({
  code: `patchpit.workspace.${kind}`,
  phase: 'parse',
  severity: 'error',
  details,
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
