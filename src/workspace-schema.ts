import {
  compileStorageMapping,
  normalizeArtifactRef,
  prepareSchema,
  relationLiteral,
  schemaLiteral,
  sealStorageMapping,
  sealSchema,
  TarstateParseError,
} from '@tarstate/core';

export const workspaceSchemaBody = schemaLiteral({
  description: 'Patchpit workspace configuration and state.',
  relations: {
    state: {
      relationId: 'patchpit.workspace.state',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string' } },
        rootNodeId: { type: { kind: 'string' } },
      },
    },
    contexts: {
      relationId: 'patchpit.workspace.context',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string' } },
        url: { type: { kind: 'string' }, description: 'App invocation URL.' },
      },
    },
    panes: {
      relationId: 'patchpit.workspace.pane',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string' } },
        activeContext: { type: { kind: 'string' } },
        previewContext: { type: { kind: 'string' }, nullable: true },
      },
    },
    paneContexts: {
      relationId: 'patchpit.workspace.pane-context',
      key: ['contextId'],
      fields: {
        paneId: { type: { kind: 'string' } },
        position: { type: { kind: 'number' } },
        contextId: { type: { kind: 'string' } },
      },
    },
    splits: {
      relationId: 'patchpit.workspace.split',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string' } },
        axis: { type: { kind: 'string', values: ['horizontal', 'vertical'] } },
        first: { type: { kind: 'string' } },
        ratio: { type: { kind: 'number' } },
        second: { type: { kind: 'string' } },
      },
    },
  },
});

export const workspaceSchemaArtifact = await sealSchema({
  id: 'patchpit.workspace.state@1',
  body: workspaceSchemaBody,
});

const preparedWorkspaceSchemaResult = prepareSchema(workspaceSchemaBody);
if (!preparedWorkspaceSchemaResult.success) {
  throw new TarstateParseError(preparedWorkspaceSchemaResult.issues);
}

export const workspaceRelations = {
  contexts: relationLiteral(workspaceSchemaArtifact, workspaceSchemaBody, 'contexts'),
  paneContexts: relationLiteral(workspaceSchemaArtifact, workspaceSchemaBody, 'paneContexts'),
  panes: relationLiteral(workspaceSchemaArtifact, workspaceSchemaBody, 'panes'),
  splits: relationLiteral(workspaceSchemaArtifact, workspaceSchemaBody, 'splits'),
  state: relationLiteral(workspaceSchemaArtifact, workspaceSchemaBody, 'state'),
} as const;

const readOnly = { kind: 'read-only' } as const;
export const workspaceStorageMappingArtifact = await sealStorageMapping({
  id: 'patchpit.workspace.storage@1',
  body: {
    schema: normalizeArtifactRef(workspaceSchemaArtifact),
    model: 'json-tree-v1',
    relations: {
      [workspaceRelations.state.relationId]: {
        collection: { kind: 'object-map', path: ['state'], absent: 'invalid' },
        keys: { id: { kind: 'map-key', onMismatch: 'reject' } },
        fields: { rootNodeId: { path: ['rootNodeId'], write: readOnly } },
      },
      [workspaceRelations.contexts.relationId]: {
        collection: { kind: 'object-map', path: ['contexts'], absent: 'invalid' },
        keys: { id: { kind: 'map-key', onMismatch: 'reject' } },
        fields: { url: { path: ['url'], write: readOnly } },
      },
      [workspaceRelations.panes.relationId]: {
        collection: { kind: 'object-map', path: ['panes'], absent: 'invalid' },
        keys: { id: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {
          activeContext: { path: ['activeContext'], write: readOnly },
          previewContext: { path: ['previewContext'], write: readOnly },
        },
      },
      [workspaceRelations.paneContexts.relationId]: {
        collection: { kind: 'object-map', path: ['paneContexts'], absent: 'invalid' },
        keys: { contextId: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {
          paneId: { path: ['paneId'], write: readOnly },
          position: { path: ['position'], write: readOnly },
        },
      },
      [workspaceRelations.splits.relationId]: {
        collection: { kind: 'object-map', path: ['splits'], absent: 'invalid' },
        keys: { id: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {
          axis: { path: ['axis'], write: readOnly },
          first: { path: ['first'], write: readOnly },
          ratio: { path: ['ratio'], write: readOnly },
          second: { path: ['second'], write: readOnly },
        },
      },
    },
  },
});

const workspaceStorageMappingResult = compileStorageMapping(
  workspaceStorageMappingArtifact.body,
  normalizeArtifactRef(workspaceSchemaArtifact),
  preparedWorkspaceSchemaResult.value,
);
if (!workspaceStorageMappingResult.success) {
  throw new TarstateParseError(workspaceStorageMappingResult.issues);
}
export const workspaceStorageMapping = workspaceStorageMappingResult.value;

export const workspaceDocumentMetadata = {
  type: 'workspace',
  schema: normalizeArtifactRef(workspaceSchemaArtifact),
  schemas: { [workspaceSchemaArtifact.id]: workspaceSchemaArtifact },
} as const;
