import {
  normalizeArtifactRef,
  schemaLiteral,
  sealSchema,
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

export const workspaceDocumentMetadata = {
  type: 'workspace',
  schema: normalizeArtifactRef(workspaceSchemaArtifact),
  schemas: { [workspaceSchemaArtifact.id]: workspaceSchemaArtifact },
} as const;
