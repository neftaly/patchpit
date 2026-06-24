import type {
  Atom,
  FieldRef,
  QB,
  Predicate,
  SchemaShape,
  Schema,
  App,
  Constraint,
  Observer,
} from './types.js'
import { makeQB, getSpec, fieldsOf } from './internal.js'

type ReservedField = '_rel' | '_field' | '_rels'

type AssertNoReserved<T extends Record<string, Atom>> = keyof T &
  ReservedField extends never
  ? T
  : never

type SafeSchemaShape = {
  [K: string]: { [F: string]: Atom } & {
    _rel?: never
    _field?: never
    _rels?: never
  }
}

export function defineSchema<S extends SafeSchemaShape>(shape: {
  readonly [K in keyof S]: AssertNoReserved<S[K]>
}): Schema<S> {
  const schema: Partial<Schema<S>> = {}
  for (const relName in shape) {
    const fieldRefs: Record<string, FieldRef<Atom, string>> = {}
    const relation = shape[relName]
    for (const fieldName in relation) {
      fieldRefs[fieldName] = { _rel: relName, _field: fieldName }
    }
    schema[relName] = makeQB(fieldRefs, {
      from: relName,
      predicates: [],
      joins: [],
      projection: null,
    }) as Schema<S>[typeof relName]
  }
  return schema as Schema<S>
}

export function where<T extends Record<string, Atom>, Rels extends string>(
  qb: QB<T, Rels>,
  pred: Predicate<NoInfer<Rels>>,
): QB<T, Rels> {
  const spec = getSpec(qb)
  return makeQB(fieldsOf(qb), {
    ...spec,
    predicates: [...spec.predicates, pred],
  })
}

export function join<
  T extends Record<string, Atom>,
  Rels extends string,
  U extends Record<string, Atom>,
  R2 extends string,
>(
  qb: QB<T, Rels>,
  other: QB<U, R2>,
  on: Predicate<NoInfer<Rels | R2>>,
): QB<Omit<T, keyof U> & U, Rels | R2> {
  const spec = getSpec(qb)
  const otherSpec = getSpec(other)
  const merged = { ...fieldsOf(qb), ...fieldsOf(other) }
  return makeQB(merged, {
    ...spec,
    joins: [...spec.joins, { spec: otherSpec, on }],
  })
}

export function select<
  T extends Record<string, Atom>,
  Rels extends string,
  K extends keyof T,
>(qb: QB<T, Rels>, ...keys: K[]): QB<Pick<T, K>, Rels> {
  const spec = getSpec(qb)
  const picked: Record<string, FieldRef<Atom, string>> = {}
  for (const key of keys) {
    picked[key as string] = qb[key]
  }
  return makeQB(picked, { ...spec, projection: keys as string[] })
}

type Fn<Input, Output> = (input: Input) => Output
type Unary = Fn<any, any>

type PipeChain<Input, Fns extends readonly Unary[]> = Fns extends readonly []
  ? []
  : Fns extends readonly [(input: Input) => infer Output, ...infer Rest]
    ? Rest extends readonly Unary[]
      ? [(input: Input) => Output, ...PipeChain<Output, Rest>]
      : never
    : never

type PipeOutput<Input, Fns extends readonly Unary[]> = Fns extends readonly []
  ? Input
  : Fns extends readonly [(input: Input) => infer Output, ...infer Rest]
    ? Rest extends readonly Unary[]
      ? PipeOutput<Output, Rest>
      : never
    : never

export function pipe<A>(input: A): A
export function pipe<A, B>(input: A, ab: Fn<A, B>): B
export function pipe<A, B, C>(input: A, ab: Fn<A, B>, bc: Fn<B, C>): C
export function pipe<A, B, C, D>(
  input: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
): D
export function pipe<A, B, C, D, E>(
  input: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
  de: Fn<D, E>,
): E
export function pipe<A, B, C, D, E, F>(
  input: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
  de: Fn<D, E>,
  ef: Fn<E, F>,
): F
export function pipe<A, B, C, D, E, F, G>(
  input: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
  de: Fn<D, E>,
  ef: Fn<E, F>,
  fg: Fn<F, G>,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  input: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
  de: Fn<D, E>,
  ef: Fn<E, F>,
  fg: Fn<F, G>,
  gh: Fn<G, H>,
): H
export function pipe<A, B, C, D, E, F, G, H, I>(
  input: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
  de: Fn<D, E>,
  ef: Fn<E, F>,
  fg: Fn<F, G>,
  gh: Fn<G, H>,
  hi: Fn<H, I>,
): I
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  input: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
  de: Fn<D, E>,
  ef: Fn<E, F>,
  fg: Fn<F, G>,
  gh: Fn<G, H>,
  hi: Fn<H, I>,
  ij: Fn<I, J>,
): J
export function pipe<A, B, C, D, E, F, G, H, I, J, K>(
  input: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
  de: Fn<D, E>,
  ef: Fn<E, F>,
  fg: Fn<F, G>,
  gh: Fn<G, H>,
  hi: Fn<H, I>,
  ij: Fn<I, J>,
  jk: Fn<J, K>,
): K
export function pipe<Input, const Fns extends readonly Unary[]>(
  input: Input,
  ...fns: Fns & PipeChain<Input, Fns>
): PipeOutput<Input, Fns>
export function pipe(input: unknown, ...fns: Unary[]): unknown {
  let value: any = input
  for (const fn of fns) {
    value = fn(value)
  }
  return value
}

export function defineApp<
  S extends SchemaShape,
  D extends Record<string, QB<any, any>>,
  F extends Record<string, (doc: any, input: any) => any> = Record<
    string,
    never
  >,
>(spec: {
  schema: Schema<S>
  derived: D
  constraints: readonly Constraint[]
  feeders?: F
  observers?: {
    [K in keyof D]?: Observer<D[K] extends QB<infer T, any> ? T : never>
  }
}): App<S, D, F> {
  return {
    schema: spec.schema,
    derived: spec.derived,
    constraints: spec.constraints,
    feeders: (spec.feeders ?? {}) as F,
    observers: spec.observers ?? {},
  }
}
