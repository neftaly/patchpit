import { toJS } from '@automerge/automerge';
import type { DocHandle } from '@automerge/automerge-repo';
import {
  AutomergeAtomicSource,
  AutomergeMappedStorageBinding,
  automergeRepoSourceRuntime,
  type AutomergeSourceCommand,
} from '@tarstate/automerge';
import {
  CapabilityRegistry,
  ExactArtifactResolver,
  ResourceResolver,
  builtInCapabilityRefs,
  canonicalizeJson,
  createIssue,
  evaluateQuery,
  exactArtifactAttachmentResolver,
  executePreparedTransaction,
  prepareDatabaseAttachment,
  prepareWritableExecutionContext,
  registerBuiltInCapabilities,
  sealTransaction,
  sha256Json,
  type Issue,
  type JsonValue,
  type QueryRecord,
  type SourceBasis,
  type SourceSnapshot,
  type SourceConstraint,
  type Transaction,
  type WritableLogicalRow,
  type WritableLogicalState,
  type WriteExpression,
  type WriteRelation,
  type WriteStatement,
} from '@tarstate/core';
import {
  applyWorkspaceOperation,
  workspaceInvariantViolations,
  type WorkspaceOperation,
  type WorkspaceState,
} from './workspace.ts';
import {
  workspaceFromLogicalRows,
  workspaceRelationRows,
  type WorkspaceDocument,
} from './workspace-document.ts';
import {
  workspaceDocumentMetadata,
  workspaceDocumentDeclaration,
  workspaceRelations,
} from './workspace-schema.ts';

export { createWorkspaceDocument, type WorkspaceDocument } from './workspace-document.ts';

export type WorkspaceProjection = {
  readonly state: 'ready';
  readonly workspace: WorkspaceState;
  readonly basis: SourceBasis;
  readonly issues: readonly Issue[];
} | {
  readonly state: 'incomplete' | 'invalid';
  readonly basis?: SourceBasis;
  readonly issues: readonly Issue[];
};

export type WorkspaceOperationResult = {
  readonly outcome: 'committed' | 'unchanged' | 'rejected' | 'unknown';
  readonly issues: readonly Issue[];
};

const maxStaleRetries = 2;
type WorkspaceSourceSnapshot = SourceSnapshot<WorkspaceDocument>;

export const openWorkspace = async (handle: DocHandle<WorkspaceDocument>) => {
  const source = new AutomergeAtomicSource({
    runtime: automergeRepoSourceRuntime({ handle }),
    operationEpoch: `${handle.url}:workspace-operations:${crypto.randomUUID()}`,
    ownsRuntime: true,
  });
  const prepared = await prepareWorkspaceRuntime(handle, source).catch((error: unknown) => {
    source.close();
    throw error;
  });
  let nextOperationId = 0;
  let pending = Promise.resolve();
  let cachedKey: string | undefined;
  let cachedProjection: WorkspaceProjection | undefined;

  const getSnapshot = () => {
    const snapshot = source.snapshot();
    const key = `${snapshot.state}:${snapshot.freshness}:${canonicalizeJson(snapshot.basis as JsonValue)}`;
    if (key !== cachedKey || cachedProjection === undefined) {
      cachedKey = key;
      cachedProjection = projectWorkspace(snapshot, prepared.binding);
    }
    return cachedProjection;
  };

  const act = (operation: WorkspaceOperation) => {
    const queued = pending.then(async (): Promise<WorkspaceOperationResult> => {
      for (let attempt = 0; attempt <= maxStaleRetries; attempt += 1) {
        const snapshot = source.snapshot();
        const projection = projectWorkspace(snapshot, prepared.binding);
        if (projection.state !== 'ready') {
          return { outcome: 'rejected', issues: projection.issues };
        }
        const next = applyWorkspaceOperation(projection.workspace, operation);
        if (next === projection.workspace) return { outcome: 'unchanged', issues: [] };
        const transaction = await workspaceTransaction(projection.workspace, next);
        const result = await executePreparedTransaction(prepared.context, {
          attachmentId: prepared.context.attachmentId,
          operationEpoch: source.operationEpoch,
          operationId: `workspace-${nextOperationId++}`,
          expectedBasis: snapshot.basis,
          transaction,
        });
        if (result.outcome === 'committed') return { outcome: 'committed', issues: result.issues };
        if (result.outcome === 'unknown') return { outcome: 'unknown', issues: result.issues };
        if (attempt === maxStaleRetries || !staleBasisOnly(result.issues)) {
          return { outcome: 'rejected', issues: result.issues };
        }
      }
      return { outcome: 'rejected', issues: [] };
    });
    pending = queued.then(() => undefined, () => undefined);
    return queued;
  };

  return {
    act,
    close: () => source.close(),
    getSnapshot,
    subscribe: (listener: () => void) => source.subscribe(listener),
  };
};

type WorkspaceBinding = AutomergeMappedStorageBinding<WorkspaceDocument>;

const prepareWorkspaceRuntime = async (
  handle: DocHandle<WorkspaceDocument>,
  source: AutomergeAtomicSource<WorkspaceDocument>,
) => {
  const metadata = inertAutomergeValue(toJS(handle.doc())['@patchpit']);
  const bootstrap = workspaceBootstrap(metadata);
  const registry = new CapabilityRegistry('patchpit.workspace@1');
  await registerBuiltInCapabilities(registry);
  const implementation = registry.registerImplementation({
    ref: builtInCapabilityRefs.fieldReplace,
    integrity: 'patchpit.workspace.field-replace@1',
    implementation: Object.freeze({ kind: 'patchpit.workspace.field-replace' }),
  });
  if (!implementation.success) {
    throw new Error('Patchpit workspace write capability is unavailable', {
      cause: implementation.issues,
    });
  }
  const schemas = isRecord(metadata) && isRecord(metadata.schemas) ? metadata.schemas : {};
  const resolver = new ExactArtifactResolver({
    resourceResolver: new ResourceResolver({ authority: { permits: () => false } }),
    embedded: { get: (reference) => schemas[reference.id] },
  });
  const attachment = await prepareDatabaseAttachment<WritableLogicalState>({
    sourceId: source.sourceId,
    bootstrap,
    resolveArtifact: exactArtifactAttachmentResolver(resolver, {
      authorityScope: 'patchpit.workspace',
    }),
    registry,
  });
  if (attachment.state !== 'ready' || !attachment.writable || attachment.mapping === undefined) {
    throw new Error('Patchpit workspace attachment is unavailable', { cause: attachment.issues });
  }
  const binding = new AutomergeMappedStorageBinding<WorkspaceDocument>({
    id: 'patchpit.workspace.mapping',
    locatorNamespace: source.sourceId,
    mapping: attachment.mapping,
    registry,
  });
  const attachmentId = `${handle.url}:workspace`;
  const context = prepareWritableExecutionContext<WorkspaceDocument, AutomergeSourceCommand<WorkspaceDocument>>({
    attachmentId,
    attachmentIncarnation: `${handle.url}:workspace@1`,
    attachmentFingerprint: await sha256Json({
      type: 'patchpit.workspace.attachment',
      declaration: workspaceDocumentDeclaration,
    }),
    authorityViewFingerprint: await registry.fingerprint(),
    writable: true,
    schemaView: workspaceDocumentDeclaration.storageSchema,
    source,
    operationEpoch: source.operationEpoch,
    bindings: [binding],
    relationKeys: new Map(Object.values(workspaceRelations)
      .map((relation) => [relation.relationId, relation.declaration.key])),
    query: {
      evaluate: (root, state, parameters, basis) => evaluateQuery({
        root,
        relations: Object.values(workspaceRelations).map((relation) => {
          const rows = state.rows.filter(({ relationId }) => relationId === relation.relationId);
          return {
            relation: { relationId: relation.relationId, schemaView: relation.schemaView },
            rows: rows.map(({ fields }) => fields as QueryRecord),
            occurrenceIds: rows.map(({ locator }) => canonicalizeJson(locator)),
            completeness: 'exact' as const,
            sourceId: source.sourceId,
            attachmentId,
            basis,
          };
        }),
        parameters,
        basis,
      }),
    },
    constraints: [...attachment.constraints, workspaceTopologyConstraint],
    satisfiesCapability: (capability) => registry.satisfies(capability),
    durability: 'memory',
  });
  return { binding, context };
};

const workspaceBootstrap = (metadata: unknown) => {
  if (!isRecord(metadata)
    || metadata.type !== workspaceDocumentMetadata.type
    || !isRecord(metadata.schema)
    || metadata.schema.id !== workspaceDocumentMetadata.schema.id
    || metadata.schema.contentHash !== workspaceDocumentMetadata.schema.contentHash
    || !isRecord(metadata.schemas)
    || !isRecord(metadata.declaration)
    || !isRecord(metadata.declaration.storageSchema)
    || metadata.schema.id !== metadata.declaration.storageSchema.id
    || metadata.schema.contentHash !== metadata.declaration.storageSchema.contentHash) {
    return {
      status: 'malformed' as const,
      issues: [workspaceIssue('metadata-invalid', {})],
    };
  }
  return { status: 'ready' as const, declaration: metadata.declaration };
};

const projectWorkspace = (
  snapshot: WorkspaceSourceSnapshot,
  binding: WorkspaceBinding,
): WorkspaceProjection => {
  if (snapshot.state !== 'ready' || snapshot.storage === undefined) {
    return {
      state: snapshot.state === 'loading' ? 'incomplete' : 'invalid',
      basis: snapshot.basis,
      issues: snapshot.issues,
    };
  }
  const projection = binding.project(snapshot);
  const issues = [...snapshot.issues, ...projection.issues];
  if (projection.completeness !== 'exact') {
    return { state: 'invalid', basis: snapshot.basis, issues };
  }
  return workspaceProjectionFromRows(projection.rows, snapshot.basis, issues);
};

const workspaceProjectionFromRows = (
  rows: readonly Pick<WritableLogicalRow, 'relationId' | 'fields'>[],
  basis: SourceBasis,
  inputIssues: readonly Issue[] = [],
): WorkspaceProjection => {
  const decoded = workspaceFromLogicalRows(rows);
  const issues = [
    ...inputIssues,
    ...decoded.issues.map(({ kind, details }) => workspaceIssue(kind, details)),
  ];
  if (decoded.workspace === undefined) return { state: 'invalid', basis, issues };
  issues.push(...workspaceInvariantViolations(decoded.workspace)
    .map(({ kind, details }) => workspaceIssue(kind, details)));
  return issues.some(({ severity }) => severity === 'error')
    ? { state: 'invalid', basis, issues }
    : { state: 'ready', workspace: decoded.workspace, basis, issues };
};

const workspaceTransaction = async (
  before: WorkspaceState,
  after: WorkspaceState,
): Promise<Transaction> => {
  const beforeRelations = new Map(workspaceRelationRows(before)
    .map((relation) => [relation.relation.relationId, relation]));
  const deletes: WriteStatement[] = [];
  const inserts: WriteStatement[] = [];
  const updates: WriteStatement[] = [];
  for (const afterRelation of workspaceRelationRows(after)) {
    const beforeRelation = beforeRelations.get(afterRelation.relation.relationId);
    if (beforeRelation === undefined) throw new Error('Workspace relation is unavailable');
    const beforeRows = new Map(beforeRelation.rows
      .map((row) => [canonicalizeJson(row[beforeRelation.keyField] as JsonValue), row]));
    const afterRows = new Map(afterRelation.rows
      .map((row) => [canonicalizeJson(row[afterRelation.keyField] as JsonValue), row]));
    for (const [key, row] of beforeRows) {
      if (afterRows.has(key)) continue;
      deletes.push({
        kind: 'statement.delete',
        target: keyedTarget(afterRelation.relation, afterRelation.keyField, row[afterRelation.keyField] as JsonValue),
      });
    }
    const inserted = [...afterRows]
      .filter(([key]) => !beforeRows.has(key))
      .map(([, row]) => literalRow(row));
    if (inserted.length > 0) {
      inserts.push({ kind: 'statement.insert', relation: afterRelation.relation, rows: inserted });
    }
    for (const [key, row] of afterRows) {
      const previous = beforeRows.get(key);
      if (previous === undefined) continue;
      const edits = Object.fromEntries(Object.entries(row)
        .filter(([field, value]) => field !== afterRelation.keyField
          && !sameJson(value, previous[field]))
        .map(([field, value]) => [field, {
          kind: 'edit.replace' as const,
          value: literal(value),
        }]));
      if (Object.keys(edits).length === 0) continue;
      updates.push({
        kind: 'statement.update',
        target: keyedTarget(afterRelation.relation, afterRelation.keyField, row[afterRelation.keyField] as JsonValue),
        edits,
      });
    }
  }
  return sealTransaction({
    body: {
      schemaView: workspaceDocumentDeclaration.storageSchema,
      parameters: {},
      statements: [...deletes, ...inserts, ...updates],
      guards: [],
      requiredCapabilities: [builtInCapabilityRefs.fieldReplace],
    },
  });
};

const keyedTarget = (
  relation: WriteRelation,
  keyField: string,
  value: JsonValue,
) => {
  const alias = 'target';
  return {
    relation,
    alias,
    where: {
      kind: 'compare' as const,
      op: 'eq' as const,
      left: { kind: 'field' as const, alias, name: keyField },
      right: literal(value),
    },
  };
};

const literal = (value: JsonValue): WriteExpression => ({ kind: 'literal', value });
const literalRow = (row: Readonly<Record<string, JsonValue>>) => Object.fromEntries(
  Object.entries(row).map(([field, value]) => [field, literal(value)]),
);
const sameJson = (left: unknown, right: unknown) => canonicalizeJson(left as JsonValue)
  === canonicalizeJson(right as JsonValue);

const workspaceTopologyConstraint: SourceConstraint<WritableLogicalState> = {
  id: 'patchpit.workspace.topology',
  mode: 'required',
  dependencyRelations: Object.values(workspaceRelations).map(({ relationId }) => relationId),
  evaluate: (state, basis) => {
    const projection = workspaceProjectionFromRows(state.rows, basis);
    if (projection.state === 'ready') return { status: 'satisfied' };
    const violations = projection.issues
      .filter(({ severity }) => severity === 'error')
      .map((issue) => ({
        id: issue.id,
        subject: { scopeId: 'patchpit.workspace' },
        code: issue.code,
        ...(issue.details === undefined ? {} : { details: issue.details as JsonValue }),
      }));
    return violations.length === 0
      ? {
          status: 'indeterminate' as const,
          failures: [{
            id: 'patchpit.workspace.topology:invalid',
            subject: { scopeId: 'patchpit.workspace' },
            code: 'patchpit.workspace.topology-invalid',
          }],
        }
      : { status: 'violated' as const, violations };
  },
};

const workspaceIssue = (kind: string, details: Readonly<Record<string, JsonValue>>) => createIssue({
  code: `patchpit.workspace.${kind}`,
  phase: 'parse',
  severity: 'error',
  details,
});

const staleBasisOnly = (issues: readonly Issue[]) => issues.length > 0
  && issues.every(({ code }) => code.endsWith('expected_basis_stale'));

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const inertAutomergeValue = (value: unknown): unknown => {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('Automerge metadata is not JSON data');
  return JSON.parse(encoded) as unknown;
};
