import {
  builtInCapabilityRefs,
  normalizeArtifactRef,
  TarstateParseError,
  type ArtifactRef,
} from '@tarstate/core';
import type { DocumentDeclaration } from '@tarstate/core/attachment/declaration';
import {
  prepareSchema,
  relationLiteral,
  sealSchema,
  sealStorageMapping,
  type KeyMapping,
  type SchemaArtifact,
  type StoredFieldMapping,
  type StorageMappingArtifact,
  type StorageMappingBody,
} from '@tarstate/core/schema';
import type { ArtifactBuildManifest } from '@tarstate/schema-tools';
import { sealWorkspaceConstraintSet } from './workspace-constraints.ts';
import fileSchemaSource from './file.schema.json' with { type: 'json' };
import folderSchemaSource from './folder.schema.json' with { type: 'json' };
import workspacePresenceSchemaSource from './workspace-presence.schema.json' with { type: 'json' };
import workspaceSchemaSource from './workspace.schema.json' with { type: 'json' };

const replace = { kind: 'replace', capability: builtInCapabilityRefs.fieldReplace } as const;
const readOnly = { kind: 'read-only' } as const;
const absent = { kind: 'absent' } as const;

const folderSchema = await sealSchemaSource('urn:patchpit:schema:folder@1', folderSchemaSource);
const fileSchema = await sealSchemaSource('urn:patchpit:schema:file@1', fileSchemaSource);
const workspaceSchema = await sealSchemaSource('patchpit.workspace.state@1', workspaceSchemaSource);
const workspacePresenceSchema = await sealSchemaSource(
  'patchpit.workspace.presence@1',
  workspacePresenceSchemaSource,
);

const folderRelation = relationLiteral(folderSchema, 'folder');
const folderLinksRelation = relationLiteral(folderSchema, 'links');
const fileRelation = relationLiteral(fileSchema, 'file');
const workspaceRelations = {
  panes: relationLiteral(workspaceSchema, 'panes'),
  placements: relationLiteral(workspaceSchema, 'placements'),
  splits: relationLiteral(workspaceSchema, 'splits'),
  state: relationLiteral(workspaceSchema, 'state'),
};
const workspacePresenceRelations = {
  panes: relationLiteral(workspacePresenceSchema, 'panes'),
  previews: relationLiteral(workspacePresenceSchema, 'previews'),
  session: relationLiteral(workspacePresenceSchema, 'session'),
};

const folderOwnedMapping = await sealFolderMapping(
  'urn:patchpit:mapping:automerge-folder@1',
  { kind: 'field', path: ['id'] },
  replace,
);
const folderForeignMapping = await sealFolderMapping(
  'urn:patchpit:mapping:foreign-automerge-folder@1',
  { kind: 'source-metadata', value: 'collection-element-identity' },
  readOnly,
);
const fileBinaryMapping = await sealFileMapping(
  'urn:patchpit:mapping:binary-file@1', 'binary', replace,
);
const fileTextMapping = await sealFileMapping(
  'urn:patchpit:mapping:text-file@1', 'text', replace,
);
const fileForeignBinaryMapping = await sealFileMapping(
  'urn:patchpit:mapping:foreign-binary-file@1', 'binary', readOnly,
);
const fileForeignTextMapping = await sealFileMapping(
  'urn:patchpit:mapping:foreign-text-file@1', 'text', readOnly,
);
const workspaceConstraintSet = await sealWorkspaceConstraintSet(
  normalizeArtifactRef(workspaceSchema),
  workspaceRelations,
);
const workspaceMapping = await sealStorageMapping({
  id: 'patchpit.workspace.storage@1',
  body: workspaceStorageMapping(normalizeArtifactRef(workspaceSchema)),
});
const workspacePresenceMapping = await sealStorageMapping({
  id: 'patchpit.workspace.presence.storage@1',
  body: workspacePresenceStorageMapping(normalizeArtifactRef(workspacePresenceSchema)),
});

export const artifactManifest = {
  artifacts: {
    fileBinaryMapping,
    fileForeignBinaryMapping,
    fileForeignTextMapping,
    fileSchema,
    fileTextMapping,
    folderForeignMapping,
    folderOwnedMapping,
    folderSchema,
    workspaceConstraintSet,
    workspaceMapping,
    workspacePresenceMapping,
    workspacePresenceSchema,
    workspaceSchema,
  },
  declarations: {
    fileBinary: declaration(fileSchema, fileBinaryMapping),
    fileForeignBinary: declaration(fileSchema, fileForeignBinaryMapping),
    fileForeignText: declaration(fileSchema, fileForeignTextMapping),
    fileText: declaration(fileSchema, fileTextMapping),
    folderForeign: declaration(folderSchema, folderForeignMapping),
    folderOwned: declaration(folderSchema, folderOwnedMapping),
    workspace: declaration(workspaceSchema, workspaceMapping, {
      set: normalizeArtifactRef(workspaceConstraintSet),
      mode: 'required',
    }),
    workspacePresence: declaration(workspacePresenceSchema, workspacePresenceMapping),
  },
  relations: {
    file: { schema: 'fileSchema', relation: 'file' },
    folder: { schema: 'folderSchema', relation: 'folder' },
    folderLinks: { schema: 'folderSchema', relation: 'links' },
    workspacePanes: { schema: 'workspaceSchema', relation: 'panes' },
    workspacePresencePanes: { schema: 'workspacePresenceSchema', relation: 'panes' },
    workspacePresencePreviews: { schema: 'workspacePresenceSchema', relation: 'previews' },
    workspacePresenceSession: { schema: 'workspacePresenceSchema', relation: 'session' },
    workspacePlacements: { schema: 'workspaceSchema', relation: 'placements' },
    workspaceSplits: { schema: 'workspaceSchema', relation: 'splits' },
    workspaceState: { schema: 'workspaceSchema', relation: 'state' },
  },
} as const satisfies ArtifactBuildManifest;

async function sealSchemaSource(id: string, source: unknown): Promise<SchemaArtifact> {
  const prepared = prepareSchema(source);
  if (!prepared.success) throw new TarstateParseError(prepared.issues);
  return sealSchema({ id, body: prepared.value.body });
}

async function sealFolderMapping(
  id: string,
  linkKey: KeyMapping,
  nameWrite: StoredFieldMapping['write'],
) {
  return sealStorageMapping({
    id,
    body: {
      schema: normalizeArtifactRef(folderSchema),
      model: 'json-tree-v1',
      relations: {
        [folderRelation.relationId]: {
          collection: { kind: 'singleton', path: [], absent: 'invalid' },
          keys: { id: { kind: 'literal', value: 'folder' } },
          fields: { title: { path: ['title'], write: readOnly } },
        },
        [folderLinksRelation.relationId]: {
          collection: { kind: 'array', path: ['docs'], absent: 'invalid' },
          keys: { linkId: linkKey },
          fields: {
            order: { kind: 'source-metadata', value: 'collection-position' },
            name: { path: ['name'], write: nameWrite },
            typeHint: { path: ['type'], write: readOnly },
            resourceRef: { path: ['url'], write: readOnly },
            icon: { path: ['icon'], write: readOnly },
            copyOf: { path: ['copyOf'], write: readOnly },
          },
        },
      },
    },
  });
}

async function sealFileMapping(
  id: string,
  contentKind: 'binary' | 'text',
  contentWrite: StoredFieldMapping['write'],
) {
  return sealStorageMapping({
    id,
    body: {
      schema: normalizeArtifactRef(fileSchema),
      model: 'json-tree-v1',
      relations: {
        [fileRelation.relationId]: {
          collection: { kind: 'singleton', path: [], absent: 'invalid' },
          keys: {
            id: { kind: 'literal', value: 'file' },
            contentKind: { kind: 'literal', value: contentKind },
          },
          fields: {
            binaryContent: contentKind === 'binary'
              ? { path: ['content'], write: contentWrite }
              : absent,
            textContent: contentKind === 'text'
              ? { path: ['content'], write: contentWrite }
              : absent,
            extension: { path: ['extension'], write: readOnly },
            mimeType: { path: ['mimeType'], write: readOnly },
            name: { path: ['name'], write: readOnly },
          },
        },
      },
    },
  });
}

function workspaceStorageMapping(schema: ArtifactRef): StorageMappingBody {
  return {
    schema,
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
  };
}

function workspacePresenceStorageMapping(schema: ArtifactRef): StorageMappingBody {
  return {
    schema,
    model: 'json-tree-v1',
    relations: {
      [workspacePresenceRelations.session.relationId]: {
        collection: { kind: 'singleton', path: ['session'], absent: 'invalid' },
        keys: { id: { kind: 'literal', value: 'workspace-presence' } },
        fields: { activePaneId: { path: ['activePaneId'], write: replace } },
      },
      [workspacePresenceRelations.panes.relationId]: {
        collection: { kind: 'object-map', path: ['panes'], absent: 'invalid' },
        keys: { paneId: { kind: 'map-key', onMismatch: 'reject' } },
        fields: { activeContextId: { path: ['activeContextId'], write: replace } },
      },
      [workspacePresenceRelations.previews.relationId]: {
        collection: { kind: 'object-map', path: ['previews'], absent: 'invalid' },
        keys: { paneId: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {
          contextId: { path: ['contextId'], write: replace },
          url: { path: ['url'], write: replace },
        },
      },
    },
  };
}

function declaration(
  schema: SchemaArtifact,
  mapping: StorageMappingArtifact,
  constraints?: DocumentDeclaration['constraints'],
): DocumentDeclaration {
  return {
    formatVersion: 1,
    storageSchema: normalizeArtifactRef(schema),
    projection: {
      kind: 'storage-mapping',
      storageMapping: normalizeArtifactRef(mapping),
    },
    ...(constraints === undefined ? {} : { constraints }),
  };
}
