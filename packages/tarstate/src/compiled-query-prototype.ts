import type { ExprData, OptionalProjection, PredicateData, ProjectionData, Query, QueryData } from './query.js';
import type { RelationSource } from './source.js';
import type { RelationRef } from './schema.js';

type Context = Record<string, Record<string, unknown> | null>;
type RuntimeRow = Record<string, unknown>;

type QueryPlan = FromPlan | WherePlan | JoinPlan | ProjectPlan;

type FromPlan = {
  readonly kind: 'from';
  readonly relation: RelationRef;
  readonly alias: string;
};

type WherePlan = {
  readonly kind: 'where';
  readonly input: QueryPlan;
  readonly predicate: PredicateData;
  readonly lookup: WhereLookupPlan | undefined;
};

type WhereLookupPlan = {
  readonly relation: RelationRef;
  readonly alias: string;
  readonly field: string;
  readonly value: unknown;
  readonly residual: PredicateData | undefined;
};

type JoinPlan = {
  readonly kind: 'join';
  readonly joinKind: 'inner' | 'left';
  readonly left: QueryPlan;
  readonly right: QueryPlan;
  readonly predicate: PredicateData;
  readonly rightAliases: readonly string[];
  readonly lookup: JoinLookupPlan | undefined;
};

type JoinLookupPlan = {
  readonly relation: RelationRef;
  readonly alias: string;
  readonly field: string;
  readonly value: ExprData;
  readonly residual: PredicateData | undefined;
};

type ProjectPlan = {
  readonly kind: 'project';
  readonly input: QueryPlan;
  readonly projection: readonly ProjectionStep[];
};

type ProjectionStep = {
  readonly fieldName: string;
  readonly expr: ExprData;
};

export type CompiledQueryPrototype<Row> = {
  readonly kind: 'compiledQueryPrototype';
  readonly query: Query<Row>;
  readonly steps: readonly CompiledQueryPrototypeStep[];
  readonly execute: (
    source: RelationSource,
    options?: CompiledQueryPrototypeOptions
  ) => Promise<CompiledQueryPrototypeResult<Row>>;
};

export type CompiledQueryPrototypeStep =
  | {
      readonly kind: 'scan';
      readonly relation: string;
      readonly alias: string;
    }
  | {
      readonly kind: 'where';
      readonly strategy: 'indexLookup';
      readonly relation: string;
      readonly alias: string;
      readonly field: string;
      readonly residualPredicates: number;
    }
  | {
      readonly kind: 'where';
      readonly strategy: 'filter';
      readonly predicates: number;
    }
  | {
      readonly kind: 'join';
      readonly joinKind: 'inner' | 'left';
      readonly strategy: 'rightIndexLookup';
      readonly relation: string;
      readonly alias: string;
      readonly field: string;
      readonly residualPredicates: number;
    }
  | {
      readonly kind: 'join';
      readonly joinKind: 'inner' | 'left';
      readonly strategy: 'nestedLoop';
      readonly predicates: number;
    }
  | {
      readonly kind: 'project';
      readonly fields: readonly string[];
    };

export type CompiledQueryPrototypeOptions = {
  readonly useIndexes?: boolean;
};

export type CompiledQueryPrototypeResult<Row> = {
  readonly rows: readonly Row[];
  readonly counters: CompiledQueryPrototypeCounters;
};

export type CompiledQueryPrototypeCounters = {
  readonly elapsedMs: number;
  readonly relationScans: number;
  readonly rowsScanned: number;
  readonly lookupCalls: number;
  readonly lookupUnsupported: number;
  readonly lookupEmptyResults: number;
  readonly lookupRows: number;
  readonly rowsMaterialized: number;
  readonly invalidRowsSkipped: number;
  readonly filterInputRows: number;
  readonly filterOutputRows: number;
  readonly predicateChecks: number;
  readonly joinLookupIterations: number;
  readonly joinComparisons: number;
  readonly joinedRows: number;
  readonly leftJoinMisses: number;
  readonly projectedRows: number;
  readonly outputRows: number;
};

type MutableCounters = {
  relationScans: number;
  rowsScanned: number;
  lookupCalls: number;
  lookupUnsupported: number;
  lookupEmptyResults: number;
  lookupRows: number;
  rowsMaterialized: number;
  invalidRowsSkipped: number;
  filterInputRows: number;
  filterOutputRows: number;
  predicateChecks: number;
  joinLookupIterations: number;
  joinComparisons: number;
  joinedRows: number;
  leftJoinMisses: number;
  projectedRows: number;
};

/** Compile inspectable query data into a prototype lookup/nested-loop plan. */
export function compileQueryPrototype<Row>(query: Query<Row>): CompiledQueryPrototype<Row> {
  const plan = planData(query.relations, query.data);

  return {
    kind: 'compiledQueryPrototype',
    query,
    steps: stepsFor(plan),
    execute: (source, options) => executeCompiled<Row>(source, plan, options)
  };
}

/** Execute a compiled prototype plan and return rows plus benchmark-ish counters. */
export function runCompiledQueryPrototype<Row>(
  source: RelationSource,
  compiled: CompiledQueryPrototype<Row>,
  options: CompiledQueryPrototypeOptions = {}
): Promise<CompiledQueryPrototypeResult<Row>> {
  return compiled.execute(source, options);
}

function planData(relations: Record<string, RelationRef>, data: QueryData): QueryPlan {
  switch (data.op) {
    case 'from':
      return {
        kind: 'from',
        relation: relationFor(relations, data.relation),
        alias: data.alias
      };
    case 'where':
      return {
        kind: 'where',
        input: planData(relations, data.input),
        predicate: data.predicate,
        lookup: lookupForWhere(relations, data)
      };
    case 'join':
      return {
        kind: 'join',
        joinKind: data.kind,
        left: planData(relations, data.left),
        right: planData(relations, data.right),
        predicate: data.on,
        rightAliases: aliasesFor(data.right),
        lookup: lookupForJoin(relations, data)
      };
    case 'select':
      return {
        kind: 'project',
        input: planData(relations, data.input),
        projection: projectionPlan(data.projection)
      };
  }
}

function stepsFor(plan: QueryPlan): readonly CompiledQueryPrototypeStep[] {
  switch (plan.kind) {
    case 'from':
      return [{ kind: 'scan', relation: plan.relation.name, alias: plan.alias }];
    case 'where':
      if (plan.lookup !== undefined) {
        return [
          {
            kind: 'where',
            strategy: 'indexLookup',
            relation: plan.lookup.relation.name,
            alias: plan.lookup.alias,
            field: plan.lookup.field,
            residualPredicates: predicateCount(plan.lookup.residual)
          }
        ];
      }

      return [
        ...stepsFor(plan.input),
        { kind: 'where', strategy: 'filter', predicates: predicateCount(plan.predicate) }
      ];
    case 'join':
      if (plan.lookup !== undefined) {
        return [
          ...stepsFor(plan.left),
          {
            kind: 'join',
            joinKind: plan.joinKind,
            strategy: 'rightIndexLookup',
            relation: plan.lookup.relation.name,
            alias: plan.lookup.alias,
            field: plan.lookup.field,
            residualPredicates: predicateCount(plan.lookup.residual)
          }
        ];
      }

      return [
        ...stepsFor(plan.left),
        ...stepsFor(plan.right),
        { kind: 'join', joinKind: plan.joinKind, strategy: 'nestedLoop', predicates: predicateCount(plan.predicate) }
      ];
    case 'project':
      return [
        ...stepsFor(plan.input),
        { kind: 'project', fields: plan.projection.map((step) => step.fieldName) }
      ];
  }
}

async function executeCompiled<Row>(
  source: RelationSource,
  plan: QueryPlan,
  options: CompiledQueryPrototypeOptions = {}
): Promise<CompiledQueryPrototypeResult<Row>> {
  const startedAt = nowMs();
  const counters = emptyCounters();
  const rows = await executePlan(source, plan, counters, options);

  return {
    rows: rows as Row[],
    counters: {
      elapsedMs: nowMs() - startedAt,
      ...counters,
      outputRows: rows.length
    }
  };
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

async function executePlan(
  source: RelationSource,
  plan: QueryPlan,
  counters: MutableCounters,
  options: CompiledQueryPrototypeOptions
): Promise<RuntimeRow[]> {
  switch (plan.kind) {
    case 'from':
      return scanRelation(source, plan, counters);
    case 'where':
      return executeWhere(source, plan, counters, options);
    case 'join':
      return executeJoin(source, plan, counters, options);
    case 'project':
      return executeProject(source, plan, counters, options);
  }
}

async function scanRelation(
  source: RelationSource,
  plan: FromPlan,
  counters: MutableCounters
): Promise<RuntimeRow[]> {
  const rows = rowsArray(await source.rows(plan.relation));
  counters.relationScans += 1;
  counters.rowsScanned += rows.length;
  return rowsToContexts(rows, plan.alias, counters);
}

async function executeWhere(
  source: RelationSource,
  plan: WherePlan,
  counters: MutableCounters,
  options: CompiledQueryPrototypeOptions
): Promise<RuntimeRow[]> {
  if (shouldUseIndexes(options) && plan.lookup !== undefined) {
    const lookupRows = await lookupWhere(source, plan.lookup, counters);

    if (lookupRows !== undefined) {
      return plan.lookup.residual === undefined
        ? lookupRows
        : filterRows(lookupRows, plan.lookup.residual, counters);
    }
  }

  const inputRows = await executePlan(source, plan.input, counters, options);
  return filterRows(inputRows, plan.predicate, counters);
}

async function lookupWhere(
  source: RelationSource,
  lookup: WhereLookupPlan,
  counters: MutableCounters
): Promise<RuntimeRow[] | undefined> {
  if (source.lookup === undefined) {
    counters.lookupUnsupported += 1;
    return undefined;
  }

  counters.lookupCalls += 1;
  const rows = await source.lookup({ relation: lookup.relation, field: lookup.field, value: lookup.value });

  if (rows === undefined) {
    counters.lookupUnsupported += 1;
    return undefined;
  }

  const rowArray = rowsArray(rows);
  counters.lookupRows += rowArray.length;

  if (rowArray.length === 0) {
    counters.lookupEmptyResults += 1;
  }

  return rowsToContexts(rowArray, lookup.alias, counters);
}

async function executeJoin(
  source: RelationSource,
  plan: JoinPlan,
  counters: MutableCounters,
  options: CompiledQueryPrototypeOptions
): Promise<RuntimeRow[]> {
  const leftRows = await executePlan(source, plan.left, counters, options);

  if (shouldUseIndexes(options) && plan.lookup !== undefined) {
    const lookupRows = await executeLookupJoin(source, plan, leftRows, counters);

    if (lookupRows !== undefined) {
      return lookupRows;
    }
  }

  const rightRows = await executePlan(source, plan.right, counters, options);
  return nestedJoin(plan, leftRows, rightRows, counters);
}

async function executeLookupJoin(
  source: RelationSource,
  plan: JoinPlan,
  leftRows: readonly RuntimeRow[],
  counters: MutableCounters
): Promise<RuntimeRow[] | undefined> {
  if (plan.lookup === undefined) {
    return undefined;
  }

  if (source.lookup === undefined) {
    counters.lookupUnsupported += 1;
    return undefined;
  }

  const output: RuntimeRow[] = [];

  for (const leftRow of leftRows) {
    counters.joinLookupIterations += 1;
    counters.lookupCalls += 1;

    const rows = await source.lookup({
      relation: plan.lookup.relation,
      field: plan.lookup.field,
      value: evaluateExpr(leftRow as Context, plan.lookup.value)
    });

    if (rows === undefined) {
      counters.lookupUnsupported += 1;
      return undefined;
    }

    const rowArray = rowsArray(rows);
    counters.lookupRows += rowArray.length;

    if (rowArray.length === 0) {
      counters.lookupEmptyResults += 1;
    }

    let matched = false;

    for (const row of rowArray) {
      const rightRow = contextRow(row, counters);

      if (rightRow === undefined) {
        continue;
      }

      const combined = { ...leftRow, [plan.lookup.alias]: rightRow };

      if (plan.lookup.residual !== undefined && !evaluatePredicate(combined as Context, plan.lookup.residual, counters)) {
        continue;
      }

      output.push(combined);
      counters.joinedRows += 1;
      matched = true;
    }

    if (!matched && plan.joinKind === 'left') {
      output.push(contextWithNullAliases(leftRow as Context, plan.rightAliases));
      counters.leftJoinMisses += 1;
    }
  }

  return output;
}

function nestedJoin(
  plan: JoinPlan,
  leftRows: readonly RuntimeRow[],
  rightRows: readonly RuntimeRow[],
  counters: MutableCounters
): RuntimeRow[] {
  const output: RuntimeRow[] = [];

  for (const leftRow of leftRows) {
    let matched = false;

    for (const rightRow of rightRows) {
      counters.joinComparisons += 1;
      const combined = { ...leftRow, ...rightRow };

      if (!evaluatePredicate(combined as Context, plan.predicate, counters)) {
        continue;
      }

      output.push(combined);
      counters.joinedRows += 1;
      matched = true;
    }

    if (!matched && plan.joinKind === 'left') {
      output.push(contextWithNullAliases(leftRow as Context, plan.rightAliases));
      counters.leftJoinMisses += 1;
    }
  }

  return output;
}

async function executeProject(
  source: RelationSource,
  plan: ProjectPlan,
  counters: MutableCounters,
  options: CompiledQueryPrototypeOptions
): Promise<RuntimeRow[]> {
  const inputRows = await executePlan(source, plan.input, counters, options);
  const output: RuntimeRow[] = [];

  for (const inputRow of inputRows) {
    const projected: RuntimeRow = {};

    for (const step of plan.projection) {
      projected[step.fieldName] = evaluateExpr(inputRow as Context, step.expr);
    }

    output.push(projected);
    counters.projectedRows += 1;
  }

  return output;
}

function filterRows(
  rows: readonly RuntimeRow[],
  predicate: PredicateData,
  counters: MutableCounters
): RuntimeRow[] {
  const output: RuntimeRow[] = [];

  for (const row of rows) {
    counters.filterInputRows += 1;

    if (evaluatePredicate(row as Context, predicate, counters)) {
      output.push(row);
      counters.filterOutputRows += 1;
    }
  }

  return output;
}

function lookupForWhere(
  relations: Record<string, RelationRef>,
  data: Extract<QueryData, { op: 'where' }>
): WhereLookupPlan | undefined {
  if (data.input.op !== 'from') {
    return undefined;
  }

  const input = data.input;
  const predicates = conjuncts(data.predicate);
  const predicateIndex = predicates.findIndex((predicate) => literalEqualityField(predicate, input.alias) !== undefined);

  if (predicateIndex < 0) {
    return undefined;
  }

  const selectedPredicate = predicates[predicateIndex];

  if (selectedPredicate === undefined) {
    return undefined;
  }

  const equality = literalEqualityField(selectedPredicate, input.alias);

  if (equality === undefined) {
    return undefined;
  }

  return {
    relation: relationFor(relations, input.relation),
    alias: input.alias,
    field: equality.field,
    value: equality.value,
    residual: withoutPredicate(predicates, predicateIndex)
  };
}

function lookupForJoin(
  relations: Record<string, RelationRef>,
  data: Extract<QueryData, { op: 'join' }>
): JoinLookupPlan | undefined {
  if (data.right.op !== 'from') {
    return undefined;
  }

  const rightAliases = aliasesFor(data.right);
  const predicates = conjuncts(data.on);
  const predicateIndex = predicates.findIndex((predicate) => joinEqualityField(predicate, rightAliases) !== undefined);

  if (predicateIndex < 0) {
    return undefined;
  }

  const selectedPredicate = predicates[predicateIndex];

  if (selectedPredicate === undefined) {
    return undefined;
  }

  const equality = joinEqualityField(selectedPredicate, rightAliases);

  if (equality === undefined) {
    return undefined;
  }

  return {
    relation: relationFor(relations, data.right.relation),
    alias: equality.alias,
    field: equality.field,
    value: equality.value,
    residual: withoutPredicate(predicates, predicateIndex)
  };
}

function literalEqualityField(
  predicate: PredicateData,
  alias: string
): { readonly field: string; readonly value: unknown } | undefined {
  if (predicate.op !== 'eq') {
    return undefined;
  }

  if (predicate.left.op === 'field' && predicate.left.alias === alias && predicate.right.op === 'value') {
    return { field: predicate.left.field, value: predicate.right.value };
  }

  if (predicate.right.op === 'field' && predicate.right.alias === alias && predicate.left.op === 'value') {
    return { field: predicate.right.field, value: predicate.left.value };
  }

  return undefined;
}

function joinEqualityField(
  predicate: PredicateData,
  rightAliases: readonly string[]
): { readonly alias: string; readonly field: string; readonly value: ExprData } | undefined {
  if (predicate.op !== 'eq') {
    return undefined;
  }

  if (
    predicate.left.op === 'field' &&
    rightAliases.includes(predicate.left.alias) &&
    !exprUsesAnyAlias(predicate.right, rightAliases)
  ) {
    return { alias: predicate.left.alias, field: predicate.left.field, value: predicate.right };
  }

  if (
    predicate.right.op === 'field' &&
    rightAliases.includes(predicate.right.alias) &&
    !exprUsesAnyAlias(predicate.left, rightAliases)
  ) {
    return { alias: predicate.right.alias, field: predicate.right.field, value: predicate.left };
  }

  return undefined;
}

function exprUsesAnyAlias(expr: ExprData, aliases: readonly string[]): boolean {
  return expr.op === 'field' && aliases.includes(expr.alias);
}

function conjuncts(predicate: PredicateData): readonly PredicateData[] {
  return predicate.op === 'and' ? predicate.predicates.flatMap((item) => conjuncts(item)) : [predicate];
}

function withoutPredicate(predicates: readonly PredicateData[], indexToRemove: number): PredicateData | undefined {
  return combineConjuncts(predicates.filter((_predicate, index) => index !== indexToRemove));
}

function combineConjuncts(predicates: readonly PredicateData[]): PredicateData | undefined {
  if (predicates.length === 0) {
    return undefined;
  }

  if (predicates.length === 1) {
    return predicates[0];
  }

  return { op: 'and', predicates };
}

function predicateCount(predicate: PredicateData | undefined): number {
  return predicate === undefined ? 0 : conjuncts(predicate).length;
}

function projectionPlan(projection: ProjectionData): readonly ProjectionStep[] {
  return Object.entries(projection).map(([fieldName, expr]) => ({
    fieldName,
    expr: isOptionalProjection(expr) ? expr.expr : expr
  }));
}

function evaluatePredicate(context: Context, predicate: PredicateData, counters: MutableCounters): boolean {
  switch (predicate.op) {
    case 'eq':
      counters.predicateChecks += 1;
      return evaluateExpr(context, predicate.left) === evaluateExpr(context, predicate.right);
    case 'and':
      for (const item of predicate.predicates) {
        if (!evaluatePredicate(context, item, counters)) {
          return false;
        }
      }
      return true;
    case 'or':
      for (const item of predicate.predicates) {
        if (evaluatePredicate(context, item, counters)) {
          return true;
        }
      }
      return false;
    case 'not':
      return !evaluatePredicate(context, predicate.predicate, counters);
  }
}

function evaluateExpr(context: Context, expr: ExprData): unknown {
  switch (expr.op) {
    case 'field':
      return context[expr.alias]?.[expr.field];
    case 'value':
      return expr.value;
  }
}

function rowsToContexts(
  rows: readonly unknown[],
  alias: string,
  counters: MutableCounters
): RuntimeRow[] {
  const output: RuntimeRow[] = [];

  for (const row of rows) {
    const contextValue = contextRow(row, counters);

    if (contextValue !== undefined) {
      output.push({ [alias]: contextValue });
    }
  }

  return output;
}

function contextRow(row: unknown, counters: MutableCounters): RuntimeRow | undefined {
  if (!isRecord(row)) {
    counters.invalidRowsSkipped += 1;
    return undefined;
  }

  counters.rowsMaterialized += 1;
  return row;
}

function rowsArray(rows: Iterable<unknown>): readonly unknown[] {
  return Array.isArray(rows) ? rows : Array.from(rows);
}

function relationFor(relations: Record<string, RelationRef>, relationName: string): RelationRef {
  const relationRef = relations[relationName];

  if (relationRef === undefined) {
    throw new Error(`Unknown relation: ${relationName}`);
  }

  return relationRef;
}

function aliasesFor(data: QueryData): readonly string[] {
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

function contextWithNullAliases(context: Context, aliases: readonly string[]): RuntimeRow {
  const output: RuntimeRow = { ...context };

  for (const alias of aliases) {
    output[alias] = null;
  }

  return output;
}

function isOptionalProjection(input: ExprData | OptionalProjection): input is OptionalProjection {
  return 'kind' in input && input.kind === 'optionalProjection';
}

function isRecord(input: unknown): input is RuntimeRow {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function shouldUseIndexes(options: CompiledQueryPrototypeOptions): boolean {
  return options.useIndexes !== false;
}

function emptyCounters(): MutableCounters {
  return {
    relationScans: 0,
    rowsScanned: 0,
    lookupCalls: 0,
    lookupUnsupported: 0,
    lookupEmptyResults: 0,
    lookupRows: 0,
    rowsMaterialized: 0,
    invalidRowsSkipped: 0,
    filterInputRows: 0,
    filterOutputRows: 0,
    predicateChecks: 0,
    joinLookupIterations: 0,
    joinComparisons: 0,
    joinedRows: 0,
    leftJoinMisses: 0,
    projectedRows: 0
  };
}
