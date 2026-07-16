import {
  builtInCapabilityRefs,
  normalizeArtifactRef,
  TarstateParseError,
} from '@tarstate/core';
import {
  compileStorageMapping,
  prepareSchema,
  relationLiteral,
  schemaLiteral,
  sealStorageMapping,
  sealSchema,
} from '@tarstate/core/schema';
import type { DocumentDeclaration } from '@tarstate/core/attachment';
import { sealWorkspaceConstraintSet } from './constraints.ts';

const replaceable = { editCapabilities: [builtInCapabilityRefs.fieldReplace] } as const;

const workspaceSchemaBody = schemaLiteral({
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
    placements: {
      relationId: 'patchpit.workspace.placement',
      key: ['contextId'],
      fields: {
        contextId: { type: { kind: 'string' } },
        url: {
          type: { kind: 'string' },
          description: 'App invocation URL.',
          ...replaceable,
        },
        paneId: { type: { kind: 'string' }, ...replaceable },
        position: { type: { kind: 'integer' }, ...replaceable },
      },
    },
    panes: {
      relationId: 'patchpit.workspace.pane',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string' } },
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
  panes: relationLiteral(workspaceSchemaArtifact, 'panes'),
  placements: relationLiteral(workspaceSchemaArtifact, 'placements'),
  splits: relationLiteral(workspaceSchemaArtifact, 'splits'),
  state: relationLiteral(workspaceSchemaArtifact, 'state'),
} as const;

export const workspaceConstraintSetArtifact = await sealWorkspaceConstraintSet(
  normalizeArtifactRef(workspaceSchemaArtifact),
  workspaceRelations,
);

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
      [workspaceRelations.placements.relationId]: {
        collection: { kind: 'object-map', path: ['placements'], absent: 'invalid' },
        keys: { contextId: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {
          url: { path: ['url'], write: replace },
          paneId: { path: ['paneId'], write: replace },
          position: { path: ['position'], write: replace },
        },
      },
      [workspaceRelations.panes.relationId]: {
        collection: { kind: 'object-map', path: ['panes'], absent: 'invalid' },
        keys: { id: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {},
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

const workspaceDocumentDeclaration: DocumentDeclaration = {
  formatVersion: 1,
  storageSchema: normalizeArtifactRef(workspaceSchemaArtifact),
  projection: {
    kind: 'storage-mapping',
    storageMapping: normalizeArtifactRef(workspaceStorageMappingArtifact),
  },
  constraints: {
    set: normalizeArtifactRef(workspaceConstraintSetArtifact),
    mode: 'required',
  },
};

export const workspaceDocumentMetadata = {
  type: 'workspace',
  schema: normalizeArtifactRef(workspaceSchemaArtifact),
  declaration: workspaceDocumentDeclaration,
  schemas: {
    [workspaceSchemaArtifact.id]: workspaceSchemaArtifact,
    [workspaceConstraintSetArtifact.id]: workspaceConstraintSetArtifact,
    [workspaceStorageMappingArtifact.id]: workspaceStorageMappingArtifact,
  },
} as const;
