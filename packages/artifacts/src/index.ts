import {
  TarstateParseError,
  type Artifact,
  type ArtifactRef,
  type ParseResult,
} from '@tarstate/core';
import type { ConstraintSetArtifact } from '@tarstate/core/artifacts/constraint-set';
import type { SchemaArtifact, StorageMappingArtifact } from '@tarstate/core/schema';
import {
  prepareArtifactBundle,
  type ArtifactBundleAttachment,
} from '@tarstate/schema-tools/artifact-bundle';
import bundle from './generated/artifacts.json' with { type: 'json' };
import {
  artifactDeclarationNames,
  fileSchemaArtifactRef,
  folderSchemaArtifactRef,
  workspaceConstraintSetArtifactRef,
  workspaceMappingArtifactRef,
  workspacePanesRelation,
  workspacePlacementsRelation,
  workspacePresenceMappingArtifactRef,
  workspacePresencePanesRelation,
  workspacePresencePreviewsRelation,
  workspacePresenceRecentContextsRelation,
  workspacePresenceSchemaArtifactRef,
  workspaceSchemaArtifactRef,
  workspaceSplitsRelation,
  workspaceStateRelation,
  type WorkspacePanesRow,
  type WorkspacePlacementsRow,
  type WorkspacePresencePanesRow,
  type WorkspacePresencePreviewsRow,
  type WorkspacePresenceRecentContextsRow,
  type WorkspaceSplitsRow,
  type WorkspaceStateRow,
} from './generated/bindings.ts';

export { workspaceSplitRatioBounds } from './workspace-semantics.ts';

const catalog = value(await prepareArtifactBundle(bundle));
export const fileBinaryAttachment = attachment(artifactDeclarationNames.fileBinary);
export const fileTextAttachment = attachment(artifactDeclarationNames.fileText);
export const fileForeignBinaryAttachment = attachment(artifactDeclarationNames.fileForeignBinary);
export const fileForeignTextAttachment = attachment(artifactDeclarationNames.fileForeignText);
export const folderOwnedAttachment = attachment(artifactDeclarationNames.folderOwned);
export const folderForeignAttachment = attachment(artifactDeclarationNames.folderForeign);
const workspaceAttachment = attachment(artifactDeclarationNames.workspace);
const workspacePresenceAttachment = attachment(artifactDeclarationNames.workspacePresence);

export {
  fileRelation,
  folderLinksRelation,
  folderRelation,
  type FileRow,
  type FileKey,
  type FolderLinksRow as FolderLink,
  type FolderRow as Folder,
} from './generated/bindings.ts';
export type {
  WorkspacePanesRow as WorkspacePaneRelationRow,
  WorkspacePlacementsRow as WorkspacePlacementRelationRow,
  WorkspaceSplitsRow as WorkspaceSplitRelationRow,
  WorkspaceStateRow as WorkspaceStateRelationRow,
  WorkspacePresencePanesRow as WorkspacePresencePaneRelationRow,
  WorkspacePresencePreviewsRow as WorkspacePresencePreviewRelationRow,
  WorkspacePresenceRecentContextsRow as WorkspacePresenceRecentContextRelationRow,
};

export const workspaceRelations = {
  panes: workspacePanesRelation,
  placements: workspacePlacementsRelation,
  splits: workspaceSplitsRelation,
  state: workspaceStateRelation,
} as const;

export const workspacePresenceRelations = {
  panes: workspacePresencePanesRelation,
  previews: workspacePresencePreviewsRelation,
  recentContexts: workspacePresenceRecentContextsRelation,
} as const;

export const fileSchemaArtifact = artifact<SchemaArtifact>(fileSchemaArtifactRef, 'schema');
export const folderSchemaArtifact = artifact<SchemaArtifact>(folderSchemaArtifactRef, 'schema');
export const workspaceSchemaArtifact = artifact<SchemaArtifact>(workspaceSchemaArtifactRef, 'schema');
export const workspacePresenceSchemaArtifact = artifact<SchemaArtifact>(
  workspacePresenceSchemaArtifactRef,
  'schema',
);
export const workspaceConstraintSetArtifact = artifact<ConstraintSetArtifact>(
  workspaceConstraintSetArtifactRef,
  'constraint-set',
);
export const workspaceStorageMappingArtifact = artifact<StorageMappingArtifact>(
  workspaceMappingArtifactRef,
  'storage-mapping',
);
export const workspacePresenceStorageMappingArtifact = artifact<StorageMappingArtifact>(
  workspacePresenceMappingArtifactRef,
  'storage-mapping',
);

export const workspaceDocumentMetadata = {
  type: 'workspace',
  schema: workspaceSchemaArtifactRef,
  declaration: workspaceAttachment.declaration,
  schemas: workspaceAttachment.artifacts,
} as const;

export const workspacePresenceSourceMetadata = {
  type: 'workspace-presence',
  schema: workspacePresenceSchemaArtifactRef,
  declaration: workspacePresenceAttachment.declaration,
  schemas: workspacePresenceAttachment.artifacts,
} as const;

function artifact<Type extends Pick<Artifact, 'kind'>>(
  reference: ArtifactRef,
  kind: Type['kind'],
): Type {
  return value(catalog.artifact(reference, kind)) as unknown as Type;
}

function attachment(
  name: typeof artifactDeclarationNames[keyof typeof artifactDeclarationNames],
): ArtifactBundleAttachment {
  return value(catalog.attachment(name));
}

function value<Type>(result: ParseResult<Type>): Type {
  if (!result.success) throw new TarstateParseError(result.issues);
  return result.value;
}
