import {
  builtInCapabilityRefs,
  compileStorageMapping,
  normalizeArtifactRef,
  prepareSchema,
  relationLiteral,
  schemaLiteral,
  sealStorageMapping,
  sealSchema,
  TarstateParseError,
  type DocumentDeclaration,
} from '@tarstate/core';

const replaceable = { editCapabilities: [builtInCapabilityRefs.fieldReplace] } as const;

export const workspaceSchemaBody = schemaLiteral({
  description: 'Patchpit workspace configuration and state.',
  relations: {
    state: {
      relationId: 'patchpit.workspace.state',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string' } },
        rootNodeId: { type: { kind: 'string' }, ...replaceable },
      },
    },
    contexts: {
      relationId: 'patchpit.workspace.context',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string' } },
        url: {
          type: { kind: 'string' },
          description: 'App invocation URL.',
          ...replaceable,
        },
      },
    },
    panes: {
      relationId: 'patchpit.workspace.pane',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string' } },
        activeContext: { type: { kind: 'string' }, ...replaceable },
        previewContext: { type: { kind: 'string' }, nullable: true, ...replaceable },
      },
    },
    paneContexts: {
      relationId: 'patchpit.workspace.pane-context',
      key: ['contextId'],
      fields: {
        paneId: { type: { kind: 'string' }, ...replaceable },
        position: { type: { kind: 'number' }, ...replaceable },
        contextId: { type: { kind: 'string' } },
      },
    },
    splits: {
      relationId: 'patchpit.workspace.split',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string' } },
        axis: {
          type: { kind: 'string', values: ['horizontal', 'vertical'] },
          ...replaceable,
        },
        first: { type: { kind: 'string' }, ...replaceable },
        ratio: { type: { kind: 'number' }, ...replaceable },
        second: { type: { kind: 'string' }, ...replaceable },
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
  contexts: relationLiteral(workspaceSchemaArtifact, 'contexts'),
  paneContexts: relationLiteral(workspaceSchemaArtifact, 'paneContexts'),
  panes: relationLiteral(workspaceSchemaArtifact, 'panes'),
  splits: relationLiteral(workspaceSchemaArtifact, 'splits'),
  state: relationLiteral(workspaceSchemaArtifact, 'state'),
} as const;

const replace = {
  kind: 'replace',
  capability: builtInCapabilityRefs.fieldReplace,
} as const;
export const workspaceStorageMappingArtifact = await sealStorageMapping({
  id: 'patchpit.workspace.storage@1',
  body: {
    schema: normalizeArtifactRef(workspaceSchemaArtifact),
    model: 'json-tree-v1',
    relations: {
      [workspaceRelations.state.relationId]: {
        collection: { kind: 'object-map', path: ['state'], absent: 'invalid' },
        keys: { id: { kind: 'map-key', onMismatch: 'reject' } },
        fields: { rootNodeId: { path: ['rootNodeId'], write: replace } },
      },
      [workspaceRelations.contexts.relationId]: {
        collection: { kind: 'object-map', path: ['contexts'], absent: 'invalid' },
        keys: { id: { kind: 'map-key', onMismatch: 'reject' } },
        fields: { url: { path: ['url'], write: replace } },
      },
      [workspaceRelations.panes.relationId]: {
        collection: { kind: 'object-map', path: ['panes'], absent: 'invalid' },
        keys: { id: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {
          activeContext: { path: ['activeContext'], write: replace },
          previewContext: { path: ['previewContext'], write: replace },
        },
      },
      [workspaceRelations.paneContexts.relationId]: {
        collection: { kind: 'object-map', path: ['paneContexts'], absent: 'invalid' },
        keys: { contextId: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {
          paneId: { path: ['paneId'], write: replace },
          position: { path: ['position'], write: replace },
        },
      },
      [workspaceRelations.splits.relationId]: {
        collection: { kind: 'object-map', path: ['splits'], absent: 'invalid' },
        keys: { id: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {
          axis: { path: ['axis'], write: replace },
          first: { path: ['first'], write: replace },
          ratio: { path: ['ratio'], write: replace },
          second: { path: ['second'], write: replace },
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

export const workspaceDocumentDeclaration: DocumentDeclaration = {
  formatVersion: 1,
  storageSchema: normalizeArtifactRef(workspaceSchemaArtifact),
  projection: {
    kind: 'storage-mapping',
    storageMapping: normalizeArtifactRef(workspaceStorageMappingArtifact),
  },
};

export const workspaceDocumentMetadata = {
  type: 'workspace',
  schema: normalizeArtifactRef(workspaceSchemaArtifact),
  declaration: workspaceDocumentDeclaration,
  schemas: {
    [workspaceSchemaArtifact.id]: workspaceSchemaArtifact,
    [workspaceStorageMappingArtifact.id]: workspaceStorageMappingArtifact,
  },
} as const;
