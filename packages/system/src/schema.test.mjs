import assert from 'node:assert/strict';
import test from 'node:test';
import { PatchpitFs } from '../../../apps/terminal/src/patchpit-fs.ts';
import {
  PatchpitSchemaValidationError,
  canonicalRelationSchemaJson,
  defineRelationSchema,
  parseRelationSchema,
  relationSchemaAttachment,
  relationSchemaHash,
  relationSchemaRef,
  relationSchemaRegistry,
  validateRelationSchema,
} from './schema.ts';
import {
  PatchpitType,
  createSeedFilesystem,
  createTerminalStateResource,
  filePickerIntentSchema,
  filePickerStateSchema,
  filesystemIndexSchema,
  patchpitDocSchemaRef,
  patchpitSystemSchemaCatalog,
  patchpitSystemSchemaLocation,
  patchpitSystemSchemaRef,
  patchpitSystemSchemas,
  terminalStateSchema,
} from './filesystem/index.ts';

const pizzaSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'example.pizzas@1',
  relations: {
    pizzas: {
      key: 'id',
      fields: {
        id: { type: 'id', domain: 'pizza' },
        name: { type: 'string' },
        notes: { type: 'string', optional: true },
        size: { type: 'string', metadata: { values: ['small', 'medium', 'large'] } },
      },
    },
    toppings: {
      key: ['pizzaId', 'name'],
      fields: {
        extra: { type: 'boolean' },
        name: { type: 'string' },
        pizzaId: { type: 'ref', target: { relation: 'pizzas', field: 'id' } },
      },
    },
  },
});

void test('parseRelationSchema accepts a valid relation schema', () => {
  assert.equal(parseRelationSchema(pizzaSchema).schemaId, 'example.pizzas@1');
  assert.deepEqual(validateRelationSchema(pizzaSchema), []);
});

void test('parseRelationSchema rejects fields missing required metadata', () => {
  const input = schemaWithPizzaField('badId', { type: 'id' });
  const diagnostics = validateRelationSchema(input);

  assert.equal(hasDiagnostic(diagnostics, 'schema_manifest.invalid_field', ['relations', 'pizzas', 'fields', 'badId', 'domain']), true);
  assert.throws(() => parseRelationSchema(input), PatchpitSchemaValidationError);
});

void test('parseRelationSchema rejects kind metadata on unrelated fields', () => {
  const input = schemaWithPizzaField('name', { type: 'string', target: { relation: 'pizzas', field: 'id' } });
  const diagnostics = validateRelationSchema(input);

  assert.equal(hasDiagnostic(diagnostics, 'schema_manifest.unknown_property', ['relations', 'pizzas', 'fields', 'name', 'target']), true);
  assert.throws(() => parseRelationSchema(input), PatchpitSchemaValidationError);
});

void test('parseRelationSchema rejects duplicate and missing relation keys', () => {
  const input = {
    ...pizzaSchema,
    relations: {
      ...pizzaSchema.relations,
      pizzas: {
        ...pizzaSchema.relations.pizzas,
        key: ['id', 'id', 'missing'],
      },
    },
  };
  const diagnostics = validateRelationSchema(input);

  assert.equal(hasDiagnostic(diagnostics, 'schema_manifest.invalid_key', ['relations', 'pizzas', 'key']), true);
  assert.throws(() => parseRelationSchema(input), PatchpitSchemaValidationError);
});

void test('parseRelationSchema rejects sparse arrays', () => {
  const key = ['pizzaId'];
  key.length = 2;
  const input = {
    ...pizzaSchema,
    relations: {
      ...pizzaSchema.relations,
      toppings: {
        ...pizzaSchema.relations.toppings,
        key,
      },
    },
  };
  const diagnostics = validateRelationSchema(input);

  assert.equal(hasDiagnostic(diagnostics, 'schema_manifest.invalid_key', ['relations', 'toppings', 'key', 1]), true);
  assert.throws(() => parseRelationSchema(input), PatchpitSchemaValidationError);
});

void test('canonicalRelationSchemaJson is stable across object insertion order', () => {
  const equivalentSchema = defineRelationSchema({
    relations: {
      toppings: {
        fields: {
          pizzaId: { target: { field: 'id', relation: 'pizzas' }, type: 'ref' },
          name: { type: 'string' },
          extra: { type: 'boolean' },
        },
        key: ['pizzaId', 'name'],
      },
      pizzas: {
        fields: {
          size: { metadata: { values: ['small', 'medium', 'large'] }, type: 'string' },
          notes: { optional: true, type: 'string' },
          name: { type: 'string' },
          id: { domain: 'pizza', type: 'id' },
        },
        key: 'id',
      },
    },
    schemaId: 'example.pizzas@1',
    formatVersion: 1,
    kind: 'tarstate.schema',
  });

  const canonical = canonicalRelationSchemaJson(pizzaSchema);

  assert.equal(canonical, canonicalRelationSchemaJson(equivalentSchema));
  assert.equal(canonical.indexOf('"formatVersion"') < canonical.indexOf('"kind"'), true);
  assert.equal(canonical.indexOf('"kind"') < canonical.indexOf('"relations"'), true);
  assert.equal(canonical.indexOf('"relations"') < canonical.indexOf('"schemaId"'), true);
});

void test('relationSchemaHash is stable across object insertion order', async () => {
  const equivalentSchema = defineRelationSchema({
    relations: pizzaSchema.relations,
    schemaId: pizzaSchema.schemaId,
    formatVersion: pizzaSchema.formatVersion,
    kind: pizzaSchema.kind,
  });
  const left = await relationSchemaHash(pizzaSchema);
  const right = await relationSchemaHash(equivalentSchema);

  assert.equal(left, right);
  assert.match(left, /^sha256:[a-f0-9]{64}$/);
});

void test('relation schema refs, attachments, and registries validate descriptors', () => {
  const schemaHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  assert.deepEqual(relationSchemaRef(pizzaSchema), { id: 'example.pizzas@1' });
  assert.deepEqual(relationSchemaRef(pizzaSchema, { hash: schemaHash }), {
    hash: schemaHash,
    id: 'example.pizzas@1',
  });
  assert.throws(() => relationSchemaRef(''), /non-empty/);
  assert.throws(() => relationSchemaRef(pizzaSchema, { hash: 'sha256:not-a-real-hash' }), /sha256/);
  assert.throws(() => relationSchemaRef(pizzaSchema, { url: '' }), /non-empty/);

  const attachment = relationSchemaAttachment(pizzaSchema, { url: 'patchpit-schema:example.pizzas@1' });
  assert.equal(attachment.id, pizzaSchema.schemaId);
  assert.equal(attachment.url, 'patchpit-schema:example.pizzas@1');
  assert.deepEqual(attachment.descriptor, pizzaSchema);

  assert.deepEqual(Object.keys(relationSchemaRegistry(pizzaSchema)), ['example.pizzas@1']);
  assert.throws(() => relationSchemaRegistry(pizzaSchema, pizzaSchema), /Duplicate relation schema id/);
});

void test('system schema catalog refs carry canonical hashes and source locations', async () => {
  assert.deepEqual(
    patchpitSystemSchemas.map((schema) => schema.schemaId),
    Object.keys(patchpitSystemSchemaCatalog),
  );

  for (const schema of patchpitSystemSchemas) {
    const ref = patchpitSystemSchemaRef(schema);

    assert.deepEqual(patchpitSystemSchemaCatalog[schema.schemaId], schema);
    assert.equal(ref.id, schema.schemaId);
    assert.equal(ref.hash, await relationSchemaHash(schema));
    assert.equal(ref.url, patchpitSystemSchemaLocation(schema.schemaId));
  }
});

void test('filesystem index schema exposes only projected document rows', () => {
  assert.deepEqual(Object.keys(filesystemIndexSchema.relations), ['documents']);
});

void test('file picker intent schema uses selectedUrls for precomputed selections', () => {
  const fields = filePickerIntentSchema.relations.requests.fields;

  assert.equal('selectedUrls' in fields, true);
  assert.equal('range' in fields, false);
});

void test('seeded and dynamically created system docs carry schema refs', () => {
  const seed = createSeedFilesystem();

  for (const handle of Object.values(seed.documentHandles)) {
    const metadata = handle.doc()['@patchpit'];
    assert.deepEqual(metadata.schema, patchpitDocSchemaRef(metadata.type));
    assert.equal(metadata.schemas, undefined);
  }

  assert.deepEqual(
    seed.indexHandle.doc()['@patchpit'].schema,
    patchpitDocSchemaRef(PatchpitType.FilesystemIndex),
  );

  const filePickerApp = appManifest(seed, 'file-picker');
  assert.deepEqual(
    filePickerApp.surfaces[0].state.schema,
    patchpitDocSchemaRef(PatchpitType.FilePickerState),
  );
  assert.deepEqual(filePickerApp.schemas[filePickerStateSchema.schemaId], filePickerStateSchema);

  const terminalApp = appManifest(seed, 'terminal');
  assert.deepEqual(
    terminalApp.surfaces[0].state.schema,
    patchpitDocSchemaRef(PatchpitType.TerminalState),
  );
  assert.deepEqual(terminalApp.schemas[terminalStateSchema.schemaId], terminalStateSchema);

  const dynamicTerminal = createTerminalStateResource(seed, 'terminal-test');
  assert.deepEqual(
    dynamicTerminal.doc()['@patchpit'].schema,
    patchpitDocSchemaRef(PatchpitType.TerminalState),
  );
});

void test('terminal-created file and folder docs carry schema refs', async () => {
  const seed = createSeedFilesystem();
  const fs = new PatchpitFs({
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  });

  await fs.writeFile('/home/terminal-created.txt', 'hello');
  await fs.mkdir('/home/terminal-created-folder');

  const file = filesystemDoc(seed, PatchpitType.File, 'terminal-created.txt');
  const folder = filesystemDoc(seed, PatchpitType.Folder, 'terminal-created-folder');

  assert.deepEqual(file['@patchpit'].schema, patchpitDocSchemaRef(PatchpitType.File));
  assert.equal(file['@patchpit'].schemas, undefined);
  assert.deepEqual(folder['@patchpit'].schema, patchpitDocSchemaRef(PatchpitType.Folder));
  assert.equal(folder['@patchpit'].schemas, undefined);
});

function schemaWithPizzaField(fieldName, field) {
  return {
    ...pizzaSchema,
    relations: {
      ...pizzaSchema.relations,
      pizzas: {
        ...pizzaSchema.relations.pizzas,
        fields: {
          ...pizzaSchema.relations.pizzas.fields,
          [fieldName]: field,
        },
      },
    },
  };
}

function hasDiagnostic(diagnostics, code, path) {
  return diagnostics.some((diagnostic) => {
    return diagnostic.code === code && JSON.stringify(diagnostic.path) === JSON.stringify(path);
  });
}

function appManifest(seed, appId) {
  const doc = Object.values(seed.documentHandles)
    .map((handle) => handle.doc())
    .find((candidate) => candidate['@patchpit'].type === PatchpitType.AppManifest && candidate.id === appId);
  assert.ok(doc, `Missing app manifest: ${appId}`);
  return doc;
}

function filesystemDoc(seed, type, name) {
  const doc = Object.values(seed.documentHandles)
    .map((handle) => handle.doc())
    .find((candidate) => candidate['@patchpit'].type === type && candidate.name === name);
  assert.ok(doc, `Missing filesystem ${type} doc: ${name}`);
  return doc;
}
