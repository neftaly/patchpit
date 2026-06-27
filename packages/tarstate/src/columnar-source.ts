import type { TarstateDiagnostic } from './diagnostics.js';
import type { FieldSpec, RelationRef } from './schema.js';
import type { MaybePromise, RelationLookup, RelationSource } from './source.js';

export type ColumnarRelationInput<Row extends Record<string, unknown> = Record<string, unknown>> = {
  readonly relation: RelationRef<Row>;
  readonly rows: Iterable<Row>;
  /**
   * Fields that should support equality lookup.
   *
   * @remarks Omit to allow lazy indexes for every declared field.
   */
  readonly indexFields?: readonly (keyof Row & string)[];
};

type StoredRelation = {
  readonly relation: RelationRef;
  readonly rowCount: number;
  readonly fields: ReadonlyMap<string, StoredField>;
  readonly indexableFields: ReadonlySet<string> | undefined;
  readonly indexes: Map<string, Map<unknown, number[]>>;
  readonly rowCache: (Record<string, unknown> | undefined)[];
  allRowsCache: readonly Record<string, unknown>[] | undefined;
};

type StoredField = {
  readonly name: string;
  readonly kind: StoredFieldKind;
  readonly present: Uint8Array;
  readonly nulls: Uint8Array;
  readonly invalidValues: ReadonlyMap<number, unknown> | undefined;
  readonly numbers?: Float64Array;
  readonly booleans?: Uint8Array;
  readonly internedIds?: Int32Array;
  readonly internedValues?: readonly string[];
  readonly objects?: readonly unknown[];
};

type StoredFieldKind = 'boolean' | 'number' | 'object' | 'string';

/** Build a fixed-schema columnar source that still returns normal Tarstate row records. */
export function fromColumnarSource(
  relations: readonly ColumnarRelationInput[]
): RelationSource {
  const relationStores = new Map<string, StoredRelation>();
  const diagnostics: TarstateDiagnostic[] = [];

  for (const input of relations) {
    relationStores.set(input.relation.name, buildRelation(input));
  }

  return {
    relationNames: Array.from(relationStores.keys()),
    rows: (relationRef) => materializedRows(relationStores.get(relationRef.name)),
    lookup: (lookup) => lookupRows(relationStores.get(lookup.relation.name), lookup),
    diagnostics: () => diagnostics
  };
}

function buildRelation(input: ColumnarRelationInput): StoredRelation {
  const rows = Array.from(input.rows);
  const fields = new Map<string, StoredField>();

  for (const [fieldName, spec] of Object.entries(input.relation.fields)) {
    fields.set(fieldName, buildField(fieldName, spec, rows));
  }

  return {
    relation: input.relation,
    rowCount: rows.length,
    fields,
    indexableFields: input.indexFields === undefined ? undefined : new Set(input.indexFields),
    indexes: new Map(),
    rowCache: Array.from({ length: rows.length }),
    allRowsCache: undefined
  };
}

function buildField(fieldName: string, spec: FieldSpec, rows: readonly Record<string, unknown>[]): StoredField {
  const kind = storedKind(spec);
  const present = bitset(rows.length);
  const nulls = bitset(rows.length);
  const invalidValues = new Map<number, unknown>();
  const values = rows.map((row, rowIndex) => {
    if (!Object.hasOwn(row, fieldName)) {
      return undefined;
    }

    const value = row[fieldName];

    if (value === undefined) {
      return undefined;
    }

    setBit(present, rowIndex);

    if (value === null) {
      setBit(nulls, rowIndex);
      return undefined;
    }

    if (!valueMatches(spec, value)) {
      invalidValues.set(rowIndex, value);
      return undefined;
    }

    return value;
  });

  switch (kind) {
    case 'boolean': {
      const booleans = new Uint8Array(rows.length);
      for (let index = 0; index < values.length; index += 1) {
        booleans[index] = values[index] === true ? 1 : 0;
      }
      return fieldBase(fieldName, kind, present, nulls, invalidValues, { booleans });
    }
    case 'number': {
      const numbers = new Float64Array(rows.length);
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        numbers[index] = typeof value === 'number' ? value : 0;
      }
      return fieldBase(fieldName, kind, present, nulls, invalidValues, { numbers });
    }
    case 'string': {
      const intern = internStrings(values);
      return fieldBase(fieldName, kind, present, nulls, invalidValues, {
        internedIds: intern.ids,
        internedValues: intern.values
      });
    }
    case 'object':
      return fieldBase(fieldName, kind, present, nulls, invalidValues, { objects: values });
  }
}

function fieldBase(
  name: string,
  kind: StoredFieldKind,
  present: Uint8Array,
  nulls: Uint8Array,
  invalidValues: Map<number, unknown>,
  storage: Pick<StoredField, 'booleans' | 'internedIds' | 'internedValues' | 'numbers' | 'objects'>
): StoredField {
  return {
    name,
    kind,
    present,
    nulls,
    invalidValues: invalidValues.size === 0 ? undefined : invalidValues,
    ...storage
  };
}

function internStrings(values: readonly unknown[]): { readonly ids: Int32Array; readonly values: readonly string[] } {
  const ids = new Int32Array(values.length);
  const interned = new Map<string, number>();
  const output: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (typeof value !== 'string') {
      continue;
    }

    let id = interned.get(value);

    if (id === undefined) {
      id = output.length + 1;
      interned.set(value, id);
      output.push(value);
    }

    ids[index] = id;
  }

  return { ids, values: output };
}

function materializedRows(relation: StoredRelation | undefined): MaybePromise<Iterable<unknown>> {
  if (relation === undefined) {
    return [];
  }

  if (relation.allRowsCache !== undefined) {
    return relation.allRowsCache;
  }

  const rows: Record<string, unknown>[] = [];

  for (let rowIndex = 0; rowIndex < relation.rowCount; rowIndex += 1) {
    rows.push(materializedRow(relation, rowIndex));
  }

  relation.allRowsCache = rows;
  return rows;
}

function lookupRows(
  relation: StoredRelation | undefined,
  lookup: RelationLookup
): MaybePromise<Iterable<unknown> | undefined> {
  if (relation === undefined || !relation.fields.has(lookup.field)) {
    return undefined;
  }

  if (relation.indexableFields !== undefined && !relation.indexableFields.has(lookup.field)) {
    return undefined;
  }

  const index = lookupIndex(relation, lookup.field);
  const rowIndexes = index.get(lookup.value);

  if (rowIndexes === undefined) {
    return [];
  }

  return rowIndexes.map((rowIndex) => materializedRow(relation, rowIndex));
}

function lookupIndex(relation: StoredRelation, fieldName: string): Map<unknown, number[]> {
  const existing = relation.indexes.get(fieldName);

  if (existing !== undefined) {
    return existing;
  }

  const field = relation.fields.get(fieldName);
  const next = new Map<unknown, number[]>();

  if (field === undefined) {
    relation.indexes.set(fieldName, next);
    return next;
  }

  for (let rowIndex = 0; rowIndex < relation.rowCount; rowIndex += 1) {
    const value = valueAt(field, rowIndex);
    const rows = next.get(value);

    if (rows === undefined) {
      next.set(value, [rowIndex]);
    } else {
      rows.push(rowIndex);
    }
  }

  relation.indexes.set(fieldName, next);
  return next;
}

function materializedRow(relation: StoredRelation, rowIndex: number): Record<string, unknown> {
  const cached = relation.rowCache[rowIndex];

  if (cached !== undefined) {
    return cached;
  }

  const row: Record<string, unknown> = {};

  for (const field of relation.fields.values()) {
    if (!hasBit(field.present, rowIndex)) {
      continue;
    }

    row[field.name] = valueAt(field, rowIndex);
  }

  relation.rowCache[rowIndex] = row;
  return row;
}

function valueAt(field: StoredField, rowIndex: number): unknown {
  const invalidValue = field.invalidValues?.get(rowIndex);

  if (invalidValue !== undefined || field.invalidValues?.has(rowIndex) === true) {
    return invalidValue;
  }

  if (!hasBit(field.present, rowIndex)) {
    return undefined;
  }

  if (hasBit(field.nulls, rowIndex)) {
    return null;
  }

  switch (field.kind) {
    case 'boolean':
      return field.booleans?.[rowIndex] === 1;
    case 'number':
      return field.numbers?.[rowIndex];
    case 'object':
      return field.objects?.[rowIndex];
    case 'string': {
      const id = field.internedIds?.[rowIndex] ?? 0;
      return id === 0 ? undefined : field.internedValues?.[id - 1];
    }
  }
}

function storedKind(spec: FieldSpec): StoredFieldKind {
  switch (spec.valueKind) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'anchoredPath':
      return 'object';
    case 'id':
    case 'ref':
    case 'string':
      return 'string';
  }
}

function valueMatches(spec: FieldSpec, value: unknown): boolean {
  switch (spec.valueKind) {
    case 'anchoredPath':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'id':
    case 'ref':
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
  }
}

function bitset(size: number): Uint8Array {
  return new Uint8Array(Math.ceil(size / 8));
}

function setBit(bits: Uint8Array, index: number): void {
  const byteIndex = index >> 3;
  bits[byteIndex] = (bits[byteIndex] ?? 0) | (1 << (index & 7));
}

function hasBit(bits: Uint8Array, index: number): boolean {
  return ((bits[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
}
