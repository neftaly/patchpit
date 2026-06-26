import type { TarstateDiagnostic } from './diagnostics.js';
import type { ExprData, OptionalProjection, PredicateData, ProjectionData, Query, QueryData } from './query.js';
import type { RelationLookup, RelationSource } from './source.js';
import type { FieldSpec, RelationRef } from './schema.js';

/** Rows plus diagnostics returned by one query evaluation. */
export type QueryResult<Row> = {
  readonly rows: readonly Row[];
  readonly diagnostics: readonly TarstateDiagnostic[];
};

type Context = Record<string, Record<string, unknown> | null>;

/**
 * Evaluate a query once against a source.
 *
 * @remarks Always async so sync and async sources share one call shape.
 *
 * @example `const result = await evaluate(source, query)`
 */
export async function evaluate<Row>(source: RelationSource, query: Query<Row>): Promise<QueryResult<Row>> {
  const diagnostics: TarstateDiagnostic[] = [];
  const contexts = await evaluateData(source, query.relations, query.data, diagnostics);

  if (source.diagnostics) {
    diagnostics.push(...(await collectDiagnostics(source)));
  }

  return {
    rows: contexts as Row[],
    diagnostics
  };
}

async function collectDiagnostics(source: RelationSource): Promise<TarstateDiagnostic[]> {
  try {
    return Array.from(await source.diagnostics?.() ?? []);
  } catch (error) {
    return [
      {
        code: 'source_error',
        message: 'source diagnostics failed',
        detail: error
      }
    ];
  }
}

async function evaluateData(
  source: RelationSource,
  relations: Record<string, RelationRef>,
  data: QueryData,
  diagnostics: TarstateDiagnostic[]
): Promise<unknown[]> {
  switch (data.op) {
    case 'from':
      return evaluateFrom(source, relationFor(relations, data.relation), data.alias, diagnostics);
    case 'where':
      return evaluateWhere(source, relations, data, diagnostics);
    case 'join':
      return evaluateJoin(source, relations, data, diagnostics);
    case 'select':
      return (await evaluateData(source, relations, data.input, diagnostics)).map((context) =>
        evaluateProjection(context as Context, data.projection)
      );
  }
}

async function evaluateFrom(
  source: RelationSource,
  relationRef: RelationRef,
  alias: string,
  diagnostics: TarstateDiagnostic[]
): Promise<Context[]> {
  const rows = await readRows(source, relationRef, diagnostics);
  return rowsToContexts(rows, alias, relationRef, diagnostics);
}

async function evaluateWhere(
  source: RelationSource,
  relations: Record<string, RelationRef>,
  data: Extract<QueryData, { op: 'where' }>,
  diagnostics: TarstateDiagnostic[]
): Promise<unknown[]> {
  const plannedLookup = lookupForWhere(relations, data);

  if (plannedLookup !== undefined && source.lookup !== undefined) {
    const lookupRows = await readLookup(source, plannedLookup.lookup, diagnostics);
    if (lookupRows !== undefined) {
      return rowsToContexts(lookupRows, plannedLookup.alias, plannedLookup.lookup.relation, diagnostics);
    }
  }

  return (await evaluateData(source, relations, data.input, diagnostics)).filter((context) =>
    evaluatePredicate(context as Context, data.predicate)
  );
}

async function evaluateJoin(
  source: RelationSource,
  relations: Record<string, RelationRef>,
  data: Extract<QueryData, { op: 'join' }>,
  diagnostics: TarstateDiagnostic[]
): Promise<Context[]> {
  const leftRows = (await evaluateData(source, relations, data.left, diagnostics)) as Context[];
  const rightRows = (await evaluateData(source, relations, data.right, diagnostics)) as Context[];
  const output: Context[] = [];
  const rightAliases = aliasesFor(data.right);

  for (const leftRow of leftRows) {
    let matched = false;

    for (const rightRow of rightRows) {
      const combined = { ...leftRow, ...rightRow };

      if (evaluatePredicate(combined, data.on)) {
        output.push(combined);
        matched = true;
      }
    }

    if (!matched && data.kind === 'left') {
      output.push(
        rightAliases.reduce<Context>(
          (combined, alias) => {
            combined[alias] = null;
            return combined;
          },
          { ...leftRow }
        )
      );
    }
  }

  return output;
}

function relationFor(relations: Record<string, RelationRef>, relationName: string): RelationRef {
  const relationRef = relations[relationName];

  if (relationRef === undefined) {
    throw new Error(`Unknown relation: ${relationName}`);
  }

  return relationRef;
}

async function readRows(
  source: RelationSource,
  relationRef: RelationRef,
  diagnostics: TarstateDiagnostic[]
): Promise<unknown[]> {
  try {
    return Array.from(await source.rows(relationRef));
  } catch (error) {
    diagnostics.push({
      code: 'source_error',
      message: `source rows failed for relation ${relationRef.name}`,
      relation: relationRef.name,
      detail: error
    });
    return [];
  }
}

async function readLookup(
  source: RelationSource,
  lookup: RelationLookup,
  diagnostics: TarstateDiagnostic[]
): Promise<unknown[] | undefined> {
  try {
    const rows = await source.lookup?.(lookup);
    return rows === undefined ? undefined : Array.from(rows);
  } catch (error) {
    diagnostics.push({
      code: 'source_error',
      message: `source lookup failed for relation ${lookup.relation.name}`,
      relation: lookup.relation.name,
      field: lookup.field,
      detail: error
    });
    return undefined;
  }
}

function rowsToContexts(
  rows: readonly unknown[],
  alias: string,
  relationRef: RelationRef,
  diagnostics: TarstateDiagnostic[]
): Context[] {
  // Keep scan and lookup result policy identical once rows are returned.
  const seenKeys = new Set<string>();
  const contexts: Context[] = [];

  for (const row of rows) {
    if (!isRecord(row)) {
      diagnostics.push({
        code: 'invalid_row',
        message: `row for relation ${relationRef.name} is not an object`,
        relation: relationRef.name,
        detail: row
      });
      continue;
    }

    const rowDiagnostics = validateRow(relationRef, row);
    diagnostics.push(...rowDiagnostics);

    if (relationRef.ephemeral && rowDiagnostics.length > 0) {
      continue;
    }

    const key = rowKey(relationRef, row);
    if (key !== undefined) {
      if (seenKeys.has(key)) {
        diagnostics.push({
          code: 'duplicate_key',
          message: `duplicate key ${key} in relation ${relationRef.name}`,
          relation: relationRef.name,
          key
        });
      }
      seenKeys.add(key);
    }

    contexts.push({ [alias]: row });
  }

  return contexts;
}

function lookupForWhere(
  relations: Record<string, RelationRef>,
  data: Extract<QueryData, { op: 'where' }>
): { readonly lookup: RelationLookup; readonly alias: string } | undefined {
  if (data.input.op !== 'from' || data.predicate.op !== 'eq') {
    return undefined;
  }

  const left = data.predicate.left;
  const right = data.predicate.right;

  if (left.op === 'field' && right.op === 'value' && left.alias === data.input.alias) {
    return {
      lookup: { relation: relationFor(relations, data.input.relation), field: left.field, value: right.value },
      alias: data.input.alias
    };
  }

  if (right.op === 'field' && left.op === 'value' && right.alias === data.input.alias) {
    return {
      lookup: { relation: relationFor(relations, data.input.relation), field: right.field, value: left.value },
      alias: data.input.alias
    };
  }

  return undefined;
}

function aliasesFor(data: QueryData): string[] {
  switch (data.op) {
    case 'from':
      return [data.alias];
    case 'where':
    case 'select':
      return aliasesFor(data.input);
    case 'join':
      return [...aliasesFor(data.left), ...aliasesFor(data.right)];
  }
}

function validateRow(relationRef: RelationRef, row: Record<string, unknown>): TarstateDiagnostic[] {
  const diagnostics: TarstateDiagnostic[] = [];

  for (const [fieldName, spec] of Object.entries(relationRef.fields)) {
    const hasField = Object.hasOwn(row, fieldName);
    const value = row[fieldName];

    if (!hasField || value === undefined) {
      if (!spec.optional) {
        diagnostics.push({
          code: 'invalid_row',
          message: `missing required field ${fieldName} in relation ${relationRef.name}`,
          relation: relationRef.name,
          field: fieldName
        });
      }
      continue;
    }

    if (value === null) {
      if (!spec.nullable) {
        diagnostics.push({
          code: 'invalid_row',
          message: `null field ${fieldName} is not nullable in relation ${relationRef.name}`,
          relation: relationRef.name,
          field: fieldName
        });
      }
      continue;
    }

    if (!valueMatches(spec, value)) {
      diagnostics.push({
        code: 'invalid_row',
        message: `invalid field ${fieldName} in relation ${relationRef.name}`,
        relation: relationRef.name,
        field: fieldName,
        detail: value
      });
    }
  }

  return diagnostics;
}

function valueMatches(spec: FieldSpec, value: unknown): boolean {
  switch (spec.valueKind) {
    case 'string':
    case 'id':
    case 'ref':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'anchoredPath':
      return Array.isArray(value);
  }
}

function rowKey(relationRef: RelationRef, row: Record<string, unknown>): string | undefined {
  const keyFields = Array.isArray(relationRef.key) ? relationRef.key : [relationRef.key];
  const values = keyFields.map((keyField) => row[keyField]);

  if (values.some((value) => value === undefined)) {
    return undefined;
  }

  return JSON.stringify(values);
}

function evaluatePredicate(context: Context, predicate: PredicateData): boolean {
  switch (predicate.op) {
    case 'eq':
      return evaluateExpr(context, predicate.left) === evaluateExpr(context, predicate.right);
    case 'and':
      return predicate.predicates.every((item) => evaluatePredicate(context, item));
    case 'or':
      return predicate.predicates.some((item) => evaluatePredicate(context, item));
    case 'not':
      return !evaluatePredicate(context, predicate.predicate);
  }
}

function evaluateProjection(context: Context, projection: ProjectionData): Record<string, unknown> {
  return Object.entries(projection).reduce<Record<string, unknown>>((row, [fieldName, expr]) => {
    if (isOptionalProjection(expr)) {
      row[fieldName] = evaluateExpr(context, expr.expr);
    } else {
      row[fieldName] = evaluateExpr(context, expr);
    }

    return row;
  }, {});
}

function isOptionalProjection(input: ExprData | OptionalProjection): input is OptionalProjection {
  return 'kind' in input && input.kind === 'optionalProjection';
}

function evaluateExpr(context: Context, expr: ExprData): unknown {
  switch (expr.op) {
    case 'field':
      return context[expr.alias]?.[expr.field];
    case 'value':
      return expr.value;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
