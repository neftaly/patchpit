export type ReferenceValue = string | number | boolean | null | undefined;

export type ReferenceRelation<Columns extends readonly string[] = readonly string[]> = {
  readonly kind: 'referenceRelation';
  readonly name: string;
  readonly columns: Columns;
  readonly arity: number;
};

export type ReferenceVariable = {
  readonly kind: 'variable';
  readonly name: string;
};

export type ReferenceWildcard = {
  readonly kind: 'wildcard';
};

export type ReferenceTerm = ReferenceValue | ReferenceVariable | ReferenceWildcard;

export type ReferenceFact<Columns extends readonly string[] = readonly string[]> = {
  readonly kind: 'fact';
  readonly relation: ReferenceRelation<Columns>;
  readonly values: readonly ReferenceValue[];
};

export type ReferenceAtom<Columns extends readonly string[] = readonly string[]> = {
  readonly kind: 'atom';
  readonly relation: ReferenceRelation<Columns>;
  readonly terms: readonly ReferenceTerm[];
};

export type ReferenceNegatedAtom = {
  readonly kind: 'not';
  readonly atom: ReferenceAtom;
};

export type ReferenceBodyItem = ReferenceAtom | ReferenceNegatedAtom;

export type ReferenceRule = {
  readonly kind: 'rule';
  readonly head: ReferenceAtom;
  readonly body: readonly ReferenceBodyItem[];
};

export type ReferenceProgram = {
  readonly facts: readonly ReferenceFact[];
  readonly rules: readonly ReferenceRule[];
};

export type ReferenceEvaluationMetrics = {
  readonly initialFactCount: number;
  readonly factCount: number;
  readonly derivedFactCount: number;
  readonly duplicateFactCount: number;
  readonly ruleCount: number;
  readonly iterations: number;
  readonly ruleApplications: number;
  readonly candidateChecks: number;
  readonly negatedChecks: number;
  readonly peakJoinRows: number;
  readonly elapsedMs: number;
};

export type ReferenceEvaluation = {
  readonly facts: readonly ReferenceFact[];
  readonly metrics: ReferenceEvaluationMetrics;
};

export type ReferenceObjectRow<Columns extends readonly string[]> = {
  readonly [Column in Columns[number]]: ReferenceValue;
};

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
};
type MutableMetrics = Mutable<Omit<ReferenceEvaluationMetrics, 'elapsedMs'>>;
type Environment = Record<string, ReferenceValue>;

type FactStore = {
  readonly facts: Map<string, ReferenceFact>;
  readonly byRelation: Map<string, ReferenceFact[]>;
};

export function referenceRelation<const Columns extends readonly string[]>(
  name: string,
  columns: Columns
): ReferenceRelation<Columns> {
  return {
    kind: 'referenceRelation',
    name,
    columns,
    arity: columns.length
  };
}

export function variable(name: string): ReferenceVariable {
  return { kind: 'variable', name };
}

export const v = variable;

export function wildcard(): ReferenceWildcard {
  return { kind: 'wildcard' };
}

export function fact<const Columns extends readonly string[]>(
  relation: ReferenceRelation<Columns>,
  values: readonly ReferenceValue[]
): ReferenceFact<Columns> {
  assertArity(relation, values, 'fact');
  return { kind: 'fact', relation, values: Object.freeze([...values]) };
}

export function atom<const Columns extends readonly string[]>(
  relation: ReferenceRelation<Columns>,
  terms: readonly ReferenceTerm[]
): ReferenceAtom<Columns> {
  assertArity(relation, terms, 'atom');
  return { kind: 'atom', relation, terms: Object.freeze([...terms]) };
}

export function not(atomToNegate: ReferenceAtom): ReferenceNegatedAtom {
  return { kind: 'not', atom: atomToNegate };
}

export function rule(head: ReferenceAtom, body: readonly ReferenceBodyItem[]): ReferenceRule {
  const nextRule = { kind: 'rule', head, body: Object.freeze([...body]) } satisfies ReferenceRule;
  assertSafeRule(nextRule);
  return nextRule;
}

export function program(items: readonly (ReferenceFact | ReferenceRule)[]): ReferenceProgram {
  const facts: ReferenceFact[] = [];
  const rules: ReferenceRule[] = [];

  for (const item of items) {
    if (item.kind === 'fact') {
      facts.push(item);
    } else {
      rules.push(item);
    }
  }

  return { facts, rules };
}

export function factsFromRows<const Columns extends readonly string[]>(
  relation: ReferenceRelation<Columns>,
  rows: readonly ReferenceObjectRow<Columns>[]
): ReferenceFact<Columns>[] {
  return rows.map((row) => fact(relation, relation.columns.map((column) => row[column as Columns[number]])));
}

export function evaluateReference(
  referenceProgram: ReferenceProgram,
  options: { readonly maxIterations?: number } = {}
): ReferenceEvaluation {
  const startedAt = nowMs();
  const maxIterations = options.maxIterations ?? 64;
  const store = emptyStore();
  const metrics: MutableMetrics = {
    initialFactCount: 0,
    factCount: 0,
    derivedFactCount: 0,
    duplicateFactCount: 0,
    ruleCount: referenceProgram.rules.length,
    iterations: 0,
    ruleApplications: 0,
    candidateChecks: 0,
    negatedChecks: 0,
    peakJoinRows: 0
  };

  for (const initialFact of referenceProgram.facts) {
    if (addFact(store, initialFact)) {
      metrics.initialFactCount += 1;
      continue;
    }

    metrics.duplicateFactCount += 1;
  }

  if (referenceProgram.rules.length > 0) {
    runRulesToFixedPoint(store, referenceProgram.rules, maxIterations, metrics);
  }

  metrics.factCount = store.facts.size;

  return {
    facts: Array.from(store.facts.values()),
    metrics: { ...metrics, elapsedMs: nowMs() - startedAt }
  };
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function factsForRelation<const Columns extends readonly string[]>(
  evaluation: ReferenceEvaluation,
  relation: ReferenceRelation<Columns>
): ReferenceFact<Columns>[] {
  return evaluation.facts.filter((item): item is ReferenceFact<Columns> => matchesRelation(item.relation, relation));
}

export function rowsForRelation<const Columns extends readonly string[]>(
  evaluation: ReferenceEvaluation,
  relation: ReferenceRelation<Columns>
): ReferenceObjectRow<Columns>[] {
  return factsForRelation(evaluation, relation).map((item) => rowFromFact(item));
}

function runRulesToFixedPoint(
  store: FactStore,
  rules: readonly ReferenceRule[],
  maxIterations: number,
  metrics: MutableMetrics
): void {
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    let addedThisIteration = 0;
    metrics.iterations = iteration;

    for (const currentRule of rules) {
      metrics.ruleApplications += 1;

      for (const environment of solveBody(store, currentRule.body, metrics)) {
        const derivedFact = fact(currentRule.head.relation, instantiateHead(currentRule.head, environment));

        if (addFact(store, derivedFact)) {
          metrics.derivedFactCount += 1;
          addedThisIteration += 1;
        } else {
          metrics.duplicateFactCount += 1;
        }
      }
    }

    if (addedThisIteration === 0) {
      return;
    }
  }

  throw new Error(`Datalog reference prototype did not reach a fixed point after ${maxIterations} iterations`);
}

function solveBody(
  store: FactStore,
  body: readonly ReferenceBodyItem[],
  metrics: MutableMetrics
): readonly Environment[] {
  let environments: readonly Environment[] = [{}];

  for (const item of body) {
    const nextEnvironments: Environment[] = [];

    for (const environment of environments) {
      if (item.kind === 'not') {
        metrics.negatedChecks += 1;

        if (!hasMatchingFact(store, item.atom, environment, metrics)) {
          nextEnvironments.push(environment);
        }

        continue;
      }

      for (const candidate of factsForAtom(store, item)) {
        metrics.candidateChecks += 1;
        const nextEnvironment = extendEnvironment(item, candidate, environment);

        if (nextEnvironment !== undefined) {
          nextEnvironments.push(nextEnvironment);
        }
      }
    }

    environments = nextEnvironments;
    metrics.peakJoinRows = Math.max(metrics.peakJoinRows, environments.length);

    if (environments.length === 0) {
      return environments;
    }
  }

  return environments;
}

function hasMatchingFact(
  store: FactStore,
  atomToMatch: ReferenceAtom,
  environment: Environment,
  metrics: MutableMetrics
): boolean {
  for (const candidate of factsForAtom(store, atomToMatch)) {
    metrics.candidateChecks += 1;

    if (factMatchesEnvironment(atomToMatch, candidate, environment)) {
      return true;
    }
  }

  return false;
}

function factsForAtom(store: FactStore, atomToMatch: ReferenceAtom): readonly ReferenceFact[] {
  return store.byRelation.get(atomToMatch.relation.name) ?? [];
}

function extendEnvironment(
  atomToMatch: ReferenceAtom,
  candidate: ReferenceFact,
  environment: Environment
): Environment | undefined {
  if (!matchesRelation(candidate.relation, atomToMatch.relation)) {
    return undefined;
  }

  const nextEnvironment: Environment = { ...environment };

  for (let index = 0; index < atomToMatch.terms.length; index += 1) {
    const term = atomToMatch.terms[index];
    const value = candidate.values[index];

    if (term === undefined) {
      if (value !== undefined) {
        return undefined;
      }
      continue;
    }

    if (isWildcard(term)) {
      continue;
    }

    if (!isVariable(term)) {
      if (!sameValue(term, value)) {
        return undefined;
      }
      continue;
    }

    if (Object.hasOwn(nextEnvironment, term.name)) {
      if (!sameValue(nextEnvironment[term.name], value)) {
        return undefined;
      }
      continue;
    }

    nextEnvironment[term.name] = value;
  }

  return nextEnvironment;
}

function factMatchesEnvironment(
  atomToMatch: ReferenceAtom,
  candidate: ReferenceFact,
  environment: Environment
): boolean {
  if (!matchesRelation(candidate.relation, atomToMatch.relation)) {
    return false;
  }

  for (let index = 0; index < atomToMatch.terms.length; index += 1) {
    const term = atomToMatch.terms[index];
    const value = candidate.values[index];

    if (term === undefined) {
      if (value !== undefined) {
        return false;
      }
      continue;
    }

    if (isWildcard(term)) {
      continue;
    }

    if (!isVariable(term)) {
      if (!sameValue(term, value)) {
        return false;
      }
      continue;
    }

    if (!Object.hasOwn(environment, term.name)) {
      continue;
    }

    if (!sameValue(environment[term.name], value)) {
      return false;
    }
  }

  return true;
}

function instantiateHead(head: ReferenceAtom, environment: Environment): readonly ReferenceValue[] {
  return head.terms.map((term) => {
    if (term === undefined) {
      return undefined;
    }

    if (isWildcard(term)) {
      throw new Error(`Wildcard cannot be used in the head of relation ${head.relation.name}`);
    }

    if (!isVariable(term)) {
      return term;
    }

    if (!Object.hasOwn(environment, term.name)) {
      throw new Error(`Unbound head variable ${term.name} in relation ${head.relation.name}`);
    }

    return environment[term.name];
  });
}

function emptyStore(): FactStore {
  return { facts: new Map(), byRelation: new Map() };
}

function addFact(store: FactStore, item: ReferenceFact): boolean {
  const key = factKey(item);

  if (store.facts.has(key)) {
    return false;
  }

  store.facts.set(key, item);

  const bucket = store.byRelation.get(item.relation.name);
  if (bucket === undefined) {
    store.byRelation.set(item.relation.name, [item]);
  } else {
    bucket.push(item);
  }

  return true;
}

function rowFromFact<const Columns extends readonly string[]>(
  item: ReferenceFact<Columns>
): ReferenceObjectRow<Columns> {
  const row = {} as { [Column in Columns[number]]: ReferenceValue };

  for (let index = 0; index < item.relation.columns.length; index += 1) {
    const column = item.relation.columns[index];

    if (column !== undefined) {
      row[column as Columns[number]] = item.values[index];
    }
  }

  return row;
}

function assertArity(relation: ReferenceRelation, values: readonly unknown[], kind: string): void {
  if (values.length !== relation.arity) {
    throw new Error(`${kind} for relation ${relation.name} expected ${relation.arity} values, got ${values.length}`);
  }
}

function assertSafeRule(nextRule: ReferenceRule): void {
  const boundVariables = new Set<string>();

  for (const item of nextRule.body) {
    if (item.kind === 'not') {
      for (const variableName of variablesInAtom(item.atom)) {
        if (!boundVariables.has(variableName)) {
          throw new Error(
            `Unsafe negated variable ${variableName} in relation ${item.atom.relation.name}; use a prior positive atom or wildcard()`
          );
        }
      }
      continue;
    }

    for (const variableName of variablesInAtom(item)) {
      boundVariables.add(variableName);
    }
  }

  for (const variableName of variablesInAtom(nextRule.head)) {
    if (!boundVariables.has(variableName)) {
      throw new Error(`Unsafe head variable ${variableName} in relation ${nextRule.head.relation.name}`);
    }
  }
}

function variablesInAtom(atomToInspect: ReferenceAtom): readonly string[] {
  const names: string[] = [];

  for (const term of atomToInspect.terms) {
    if (isVariable(term)) {
      names.push(term.name);
    }
  }

  return names;
}

function matchesRelation(left: ReferenceRelation, right: ReferenceRelation): boolean {
  return left.name === right.name && left.arity === right.arity;
}

function factKey(item: ReferenceFact): string {
  return `${item.relation.name}\u001f${item.values.map(valueKey).join('\u001e')}`;
}

function valueKey(value: ReferenceValue): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  return `${typeof value}:${String(value)}`;
}

function sameValue(left: ReferenceValue, right: ReferenceValue): boolean {
  return left === right;
}

function isVariable(term: ReferenceTerm): term is ReferenceVariable {
  return typeof term === 'object' && term !== null && term.kind === 'variable';
}

function isWildcard(term: ReferenceTerm): term is ReferenceWildcard {
  return typeof term === 'object' && term !== null && term.kind === 'wildcard';
}
