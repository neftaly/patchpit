import {
  canonicalSchemaManifest,
  stringifyCanonicalSchemaManifest,
  validateSchemaManifest,
  type CodecDeclarationV1,
  type FieldManifestV1,
  type JsonValue,
  type RefTarget,
  type RelationManifestV1,
  type SchemaManifestDiagnosticV1,
  type SchemaManifestV1,
} from '@tarstate/core/schema';

export { SchemaManifestValidationError as PatchpitSchemaValidationError } from '@tarstate/core/schema';

export const patchpitRelationSchemaFormat = 'tarstate.schema' as const;

const patchpitSchemaHashPattern = /^sha256:[a-f0-9]{64}$/;

export type PatchpitSchemaFormat = typeof patchpitRelationSchemaFormat;
export type PatchpitSchemaId = string;
export type PatchpitSchemaHash = `sha256:${string}`;
export type PatchpitSchemaUrl = string;
export type PatchpitJson = JsonValue;

export type PatchpitSchemaRef = {
  readonly id: PatchpitSchemaId;
  readonly hash?: PatchpitSchemaHash;
  readonly url?: PatchpitSchemaUrl;
};

export type PatchpitSchemaAttachment = PatchpitSchemaRef & {
  readonly descriptor: PatchpitRelationSchemaDescriptor;
};

export type PatchpitRelationSchemaDescriptor = SchemaManifestV1;
export type PatchpitRelationDescriptor = RelationManifestV1;
export type PatchpitFieldDescriptor = FieldManifestV1;
export type PatchpitRelationLifetime = 'durable' | 'derived' | 'ephemeral';
export type PatchpitFieldKind = FieldManifestV1['type'];
export type PatchpitFieldRef = RefTarget & {
  readonly schemaId?: PatchpitSchemaId;
};
export type PatchpitCustomFieldDescriptor = CodecDeclarationV1;
export type PatchpitSchemaRegistry = Readonly<Record<PatchpitSchemaId, PatchpitRelationSchemaDescriptor>>;
export type PatchpitSchemaDiagnostic = SchemaManifestDiagnosticV1;

export type RelationSchemaRefOptions = {
  readonly hash?: PatchpitSchemaHash;
  readonly url?: PatchpitSchemaUrl;
};

export function defineRelationSchema<const Schema extends PatchpitRelationSchemaDescriptor>(schema: Schema): Schema {
  return canonicalSchemaManifest(schema) as Schema;
}

export function validateRelationSchema(input: unknown): readonly PatchpitSchemaDiagnostic[] {
  return validateSchemaManifest(input);
}

export function isRelationSchemaDescriptor(input: unknown): input is PatchpitRelationSchemaDescriptor {
  return validateRelationSchema(input).every((diagnostic) => diagnostic.severity !== 'error');
}

export function parseRelationSchema(input: unknown): PatchpitRelationSchemaDescriptor {
  return canonicalSchemaManifest(input);
}

export function relationSchemaRef(
  schema: PatchpitSchemaId | PatchpitRelationSchemaDescriptor,
  options: RelationSchemaRefOptions = {},
): PatchpitSchemaRef {
  const schemaId = typeof schema === 'string' ? schema : parseRelationSchema(schema).schemaId;
  if (schemaId === '') throw new Error('Relation schema ids must be non-empty.');
  return {
    id: schemaId,
    ...validatedSchemaRefOptions(options),
  };
}

export function relationSchemaAttachment(
  descriptor: PatchpitRelationSchemaDescriptor,
  options: RelationSchemaRefOptions = {},
): PatchpitSchemaAttachment {
  const canonicalDescriptor = parseRelationSchema(descriptor);
  return {
    id: canonicalDescriptor.schemaId,
    ...validatedSchemaRefOptions(options),
    descriptor: canonicalDescriptor,
  };
}

export function relationSchemaRegistry(
  ...descriptors: readonly PatchpitRelationSchemaDescriptor[]
): PatchpitSchemaRegistry {
  const registry: Record<PatchpitSchemaId, PatchpitRelationSchemaDescriptor> = {};
  for (const descriptor of descriptors) {
    const canonicalDescriptor = parseRelationSchema(descriptor);
    if (registry[canonicalDescriptor.schemaId] !== undefined) {
      throw new Error(`Duplicate relation schema id: ${canonicalDescriptor.schemaId}`);
    }
    registry[canonicalDescriptor.schemaId] = canonicalDescriptor;
  }
  return registry;
}

export function canonicalRelationSchemaJson(descriptor: PatchpitRelationSchemaDescriptor): string {
  return stringifyCanonicalSchemaManifest(descriptor);
}

export async function relationSchemaHash(
  descriptor: PatchpitRelationSchemaDescriptor,
  subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle,
): Promise<PatchpitSchemaHash> {
  if (subtle === undefined) throw new Error('SubtleCrypto is required to hash relation schemas.');
  const bytes = new TextEncoder().encode(canonicalRelationSchemaJson(descriptor));
  const digest = await subtle.digest('SHA-256', bytes);
  return `sha256:${hexDigest(digest)}`;
}

function validatedSchemaRefOptions(options: RelationSchemaRefOptions): RelationSchemaRefOptions {
  const validatedOptions: {
    hash?: PatchpitSchemaHash;
    url?: PatchpitSchemaUrl;
  } = {};
  if (options.hash !== undefined) {
    if (typeof options.hash !== 'string' || !patchpitSchemaHashPattern.test(options.hash)) {
      throw new Error('Relation schema hashes must use sha256:<64 lowercase hex characters>.');
    }
    validatedOptions.hash = options.hash;
  }
  if (options.url !== undefined) {
    if (typeof options.url !== 'string' || options.url === '') {
      throw new Error('Relation schema urls must be non-empty strings.');
    }
    validatedOptions.url = options.url;
  }
  return validatedOptions;
}

function hexDigest(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
