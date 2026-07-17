import {
  TarstateParseError,
  type Artifact,
  type ArtifactKind,
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
  workspaceSchemaArtifactRef,
  workspaceSplitsRelation,
  workspaceStateRelation,
  type WorkspacePanesRow,
  type WorkspacePlacementsRow,
  type WorkspaceSplitsRow,
  type WorkspaceStateRow,
} from './generated/bindings.ts';

const catalog = value(await prepareArtifactBundle(bundle));
export const fileBinaryAttachment = attachment(artifactDeclarationNames.fileBinary);
export const fileTextAttachment = attachment(artifactDeclarationNames.fileText);
export const fileForeignBinaryAttachment = attachment(artifactDeclarationNames.fileForeignBinary);
export const fileForeignTextAttachment = attachment(artifactDeclarationNames.fileForeignText);
export const folderOwnedAttachment = attachment(artifactDeclarationNames.folderOwned);
export const folderForeignAttachment = attachment(artifactDeclarationNames.folderForeign);
const workspaceAttachment = attachment(artifactDeclarationNames.workspace);

export {
  fileRelation,
  folderLinksRelation,
  folderRelation,
  type FileRow,
  type FolderLinksRow as FolderLink,
  type FolderRow as Folder,
} from './generated/bindings.ts';
export type {
  WorkspacePanesRow as WorkspacePaneRelationRow,
  WorkspacePlacementsRow as WorkspacePlacementRelationRow,
  WorkspaceSplitsRow as WorkspaceSplitRelationRow,
  WorkspaceStateRow as WorkspaceStateRelationRow,
};

export const workspaceRelations = {
  panes: workspacePanesRelation,
  placements: workspacePlacementsRelation,
  splits: workspaceSplitsRelation,
  state: workspaceStateRelation,
} as const;

export const fileSchemaArtifact = artifact<SchemaArtifact>(fileSchemaArtifactRef, 'schema');
export const folderSchemaArtifact = artifact<SchemaArtifact>(folderSchemaArtifactRef, 'schema');
export const workspaceSchemaArtifact = artifact<SchemaArtifact>(workspaceSchemaArtifactRef, 'schema');
export const workspaceConstraintSetArtifact = artifact<ConstraintSetArtifact>(
  workspaceConstraintSetArtifactRef,
  'constraint-set',
);
export const workspaceStorageMappingArtifact = artifact<StorageMappingArtifact>(
  workspaceMappingArtifactRef,
  'storage-mapping',
);

export const workspaceDocumentMetadata = {
  type: 'workspace',
  schema: workspaceSchemaArtifactRef,
  declaration: workspaceAttachment.declaration,
  schemas: workspaceAttachment.artifacts,
} as const;

function artifact<Type extends Artifact>(reference: ArtifactRef, kind: ArtifactKind): Type {
  return value(catalog.artifact(reference, kind)) as Type;
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
