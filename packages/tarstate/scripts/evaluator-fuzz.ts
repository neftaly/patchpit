import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join as joinPath } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'

type RelationName = 'r0' | 'r1' | 'r2'
type FieldName = 'id' | 'group' | 'value' | 'flag' | 'note'
type Atom = string | number | boolean | null
type PublicFieldRef = {
  readonly _rel: string
  readonly _field: string
}
type PublicSchema = Record<RelationName, Record<FieldName, PublicFieldRef>>
type TarstateApi = {
  readonly defineSchema: (shape: object) => PublicSchema
  readonly eq: (lhs: PublicFieldRef, rhs: PublicFieldRef | Atom) => object
  readonly evaluate: (
    query: object,
    source: object,
  ) => Promise<ReadonlyArray<Record<string, Atom>>>
  readonly from: (relation: object) => object
  readonly fromObjects: (docs: readonly object[]) => object
  readonly join: (query: object, otherQuery: object, on: object) => object
  readonly project: (
    query: object,
    shape: Record<string, PublicFieldRef>,
  ) => object
  readonly where: (query: object, predicate: object) => object
  readonly string: () => string
  readonly number: () => number
  readonly boolean: () => boolean
  readonly nullable: () => null
}
type Ref = {
  readonly relation: RelationName
  readonly field: FieldName
}
type PredicatePlan = {
  readonly lhs: Ref
  readonly rhs: Ref | Atom
}
type JoinPlan = {
  readonly relation: RelationName
  readonly on: PredicatePlan
}
type QueryPlan = {
  readonly from: RelationName
  readonly joins: readonly JoinPlan[]
  readonly predicates: readonly PredicatePlan[]
  readonly projection: readonly Ref[]
}
type Row = Record<FieldName, Atom>
type Doc = Record<RelationName, Row[]>
type EvalRow = Record<RelationName, Row>
type OutputRow = Record<string, Atom>

const relations = ['r0', 'r1', 'r2'] as const
const fields = ['id', 'group', 'value', 'flag', 'note'] as const

const defaults = {
  cases: 250,
  maxRows: 5,
  seed: 0x5eed,
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const api = await loadTarstateApi()
  const schema = createSchema(api)
  const random = mulberry32(options.seed)
  const started = performance.now()
  let comparedRows = 0

  for (let index = 0; index < options.cases; index += 1) {
    const doc = randomDoc(random, options.maxRows)
    const plan = randomQuery(random)
    const actual = await api.evaluate(
      buildPublicQuery(api, schema, plan),
      api.fromObjects([doc]),
    )
    const expected = referenceEvaluate(plan, doc)

    comparedRows += actual.length
    assertSameRows(actual as readonly OutputRow[], expected, {
      caseIndex: index,
      seed: options.seed,
      doc,
      plan,
    })
  }

  const elapsed = performance.now() - started
  const rate = Math.round(options.cases / (elapsed / 1000))
  console.log(
    [
      `ok ${options.cases} cases`,
      `seed=${options.seed}`,
      `rows=${comparedRows}`,
      `time=${elapsed.toFixed(1)}ms`,
      `rate=${rate}/s`,
    ].join(' '),
  )
}

function createSchema(api: TarstateApi): PublicSchema {
  return api.defineSchema({
    r0: {
      id: api.string(),
      group: api.nullable() as number | null,
      value: api.number(),
      flag: api.boolean(),
      note: api.nullable() as string | null,
    },
    r1: {
      id: api.string(),
      group: api.nullable() as number | null,
      value: api.number(),
      flag: api.boolean(),
      note: api.nullable() as string | null,
    },
    r2: {
      id: api.string(),
      group: api.nullable() as number | null,
      value: api.number(),
      flag: api.boolean(),
      note: api.nullable() as string | null,
    },
  })
}

function randomDoc(random: Random, maxRows: number): Doc {
  return {
    r0: randomRows(random, 'r0', maxRows),
    r1: randomRows(random, 'r1', maxRows),
    r2: randomRows(random, 'r2', maxRows),
  }
}

function randomRows(
  random: Random,
  relation: RelationName,
  maxRows: number,
): Row[] {
  const count = randomInt(random, maxRows + 1)
  const rows: Row[] = []

  for (let index = 0; index < count; index += 1) {
    rows.push({
      id: `${relation}-${index}`,
      group: randomMaybeNull(random, randomInt(random, 4)),
      value: randomInt(random, 7) - 3,
      flag: random() < 0.5,
      note: randomMaybeNull(random, ['a', 'b', 'c'][randomInt(random, 3)] ?? 'a'),
    })
  }

  return rows
}

function randomQuery(random: Random): QueryPlan {
  const fromRelation = randomRelation(random)
  const joined = [fromRelation]
  const available = relations.filter((relation) => relation !== fromRelation)
  const joinCount = randomInt(random, relations.length)
  const joins: JoinPlan[] = []

  for (let index = 0; index < joinCount; index += 1) {
    const relation = takeRandom(random, available)
    const lhsRelation = joined[randomInt(random, joined.length)]
    if (!relation || !lhsRelation) break

    joins.push({
      relation,
      on: {
        lhs: { relation: lhsRelation, field: randomComparableField(random) },
        rhs: { relation, field: randomComparableField(random) },
      },
    })
    joined.push(relation)
  }

  const predicateCount = randomInt(random, 4)
  const predicates: PredicatePlan[] = []
  for (let index = 0; index < predicateCount; index += 1) {
    const lhs = randomRef(random, joined)
    predicates.push({
      lhs,
      rhs: random() < 0.45 ? randomAtomForField(random, lhs.field) : randomRef(random, joined),
    })
  }

  const projection = joined.flatMap((relation) =>
    fields
      .filter(() => random() < 0.45)
      .map((field) => ({ relation, field })),
  )

  return {
    from: fromRelation,
    joins,
    predicates,
    projection: projection.length > 0 ? projection : [{ relation: fromRelation, field: 'id' }],
  }
}

function buildPublicQuery(
  api: TarstateApi,
  schema: PublicSchema,
  plan: QueryPlan,
): object {
  let query = api.from(schema[plan.from])

  for (const item of plan.joins) {
    query = api.join(
      query,
      api.from(schema[item.relation]),
      toPublicPredicate(api, schema, item.on),
    )
  }

  for (const predicate of plan.predicates) {
    query = api.where(query, toPublicPredicate(api, schema, predicate))
  }

  const projection: Record<string, PublicFieldRef> = {}
  for (const ref of plan.projection) {
    projection[projectionKey(ref)] = publicRef(schema, ref)
  }
  return api.project(query, projection)
}

function referenceEvaluate(plan: QueryPlan, doc: Doc): OutputRow[] {
  let rows = doc[plan.from].map((row) => ({ [plan.from]: row }) as EvalRow)

  for (const item of plan.joins) {
    const nextRows: EvalRow[] = []
    for (const row of rows) {
      for (const right of doc[item.relation]) {
        const candidate = { ...row, [item.relation]: right }
        if (evalPredicate(item.on, candidate)) nextRows.push(candidate)
      }
    }
    rows = nextRows
  }

  rows = rows.filter((row) =>
    plan.predicates.every((predicate) => evalPredicate(predicate, row)),
  )

  return rows.map((row) => {
    const output: OutputRow = {}
    for (const ref of plan.projection) {
      output[projectionKey(ref)] = resolveRef(ref, row)
    }
    return output
  })
}

function evalPredicate(predicate: PredicatePlan, row: EvalRow): boolean {
  return resolveRef(predicate.lhs, row) === resolveValue(predicate.rhs, row)
}

function resolveValue(value: Ref | Atom, row: EvalRow): Atom {
  return isRef(value) ? resolveRef(value, row) : value
}

function resolveRef(ref: Ref, row: EvalRow): Atom {
  return row[ref.relation][ref.field] ?? null
}

function toPublicPredicate(
  api: TarstateApi,
  schema: PublicSchema,
  predicate: PredicatePlan,
): object {
  return api.eq(
    publicRef(schema, predicate.lhs),
    isRef(predicate.rhs) ? publicRef(schema, predicate.rhs) : predicate.rhs,
  )
}

function publicRef(schema: PublicSchema, ref: Ref): PublicFieldRef {
  return schema[ref.relation][ref.field]
}

function projectionKey(ref: Ref): string {
  return `${ref.relation}_${ref.field}`
}

function assertSameRows(
  actual: readonly OutputRow[],
  expected: readonly OutputRow[],
  context: {
    readonly caseIndex: number
    readonly seed: number
    readonly doc: Doc
    readonly plan: QueryPlan
  },
): void {
  const actualRows = canonicalRows(actual)
  const expectedRows = canonicalRows(expected)
  if (actualRows === expectedRows) return

  throw new Error(
    [
      `tarstate evaluator mismatch in case ${context.caseIndex} (seed=${context.seed})`,
      `plan: ${JSON.stringify(context.plan, null, 2)}`,
      `doc: ${JSON.stringify(context.doc, null, 2)}`,
      `actual: ${JSON.stringify(actual, null, 2)}`,
      `expected: ${JSON.stringify(expected, null, 2)}`,
    ].join('\n'),
  )
}

function canonicalRows(rows: readonly OutputRow[]): string {
  return JSON.stringify(rows.map(stableObject).sort())
}

function stableObject(row: OutputRow): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right))),
  )
}

function randomRef(random: Random, joined: readonly RelationName[]): Ref {
  const relation = joined[randomInt(random, joined.length)] ?? 'r0'
  return {
    relation,
    field: fields[randomInt(random, fields.length)] ?? 'id',
  }
}

function randomRelation(random: Random): RelationName {
  return relations[randomInt(random, relations.length)] ?? 'r0'
}

function randomComparableField(random: Random): FieldName {
  const comparable = ['id', 'group', 'value', 'flag', 'note'] as const
  return comparable[randomInt(random, comparable.length)] ?? 'id'
}

function randomAtomForField(random: Random, field: FieldName): Atom {
  switch (field) {
    case 'id':
      return `${randomRelation(random)}-${randomInt(random, 5)}`
    case 'group':
      return randomMaybeNull(random, randomInt(random, 4))
    case 'value':
      return randomInt(random, 7) - 3
    case 'flag':
      return random() < 0.5
    case 'note':
      return randomMaybeNull(random, ['a', 'b', 'c'][randomInt(random, 3)] ?? 'a')
  }
}

function randomMaybeNull<T extends Atom>(random: Random, value: T): T | null {
  return random() < 0.2 ? null : value
}

function takeRandom<T>(random: Random, values: T[]): T | undefined {
  if (values.length === 0) return undefined
  const index = randomInt(random, values.length)
  const [value] = values.splice(index, 1)
  return value
}

function randomInt(random: Random, maxExclusive: number): number {
  return Math.floor(random() * maxExclusive)
}

function isRef(value: Ref | Atom): value is Ref {
  return value !== null && typeof value === 'object' && 'relation' in value
}

function parseArgs(args: readonly string[]): {
  readonly cases: number
  readonly maxRows: number
  readonly seed: number
} {
  const options = { ...defaults }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]
    if (arg === '--') continue
    if (arg === '--cases' && next) {
      options.cases = parsePositiveInt(arg, next)
      index += 1
      continue
    }
    if (arg === '--max-rows' && next) {
      options.maxRows = parsePositiveInt(arg, next)
      index += 1
      continue
    }
    if (arg === '--seed' && next) {
      options.seed = parseSeed(next)
      index += 1
      continue
    }
    if (arg === '--help') {
      console.log('usage: node packages/tarstate/scripts/evaluator-fuzz.ts [--cases n] [--max-rows n] [--seed n]')
      process.exit(0)
    }
    throw new Error(`unknown or incomplete argument: ${arg ?? ''}`)
  }

  return options
}

function parsePositiveInt(flag: string, value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return parsed
}

function parseSeed(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error('--seed must be an integer')
  return parsed >>> 0
}

async function loadTarstateApi(): Promise<TarstateApi> {
  const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
  const tempDir = await mkdtemp(joinPath(tmpdir(), 'tarstate-evaluator-fuzz-'))

  try {
    await writeFile(
      joinPath(tempDir, 'package.json'),
      `${JSON.stringify({
        name: '@patchpit/tarstate',
        type: 'module',
        exports: { '.': './src/index.js' },
      })}\n`,
    )
    await emitSourcePackage(packageDir, tempDir)

    const publicApiPath = joinPath(tempDir, 'scripts', 'public-api.mjs')
    await mkdir(dirname(publicApiPath), { recursive: true })
    await writeFile(publicApiPath, "export * from '@patchpit/tarstate'\n")

    return await import(pathToFileURL(publicApiPath).href) as TarstateApi
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function emitSourcePackage(
  packageDir: string,
  tempDir: string,
): Promise<void> {
  const srcDir = joinPath(packageDir, 'src')
  const outDir = joinPath(tempDir, 'src')
  await mkdir(outDir, { recursive: true })

  for (const entry of await readdir(srcDir)) {
    if (!entry.endsWith('.ts')) continue

    const sourcePath = joinPath(srcDir, entry)
    const source = await readFile(sourcePath, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
      fileName: sourcePath,
    })

    await writeFile(
      joinPath(outDir, entry.replace(/\.ts$/, '.js')),
      output.outputText,
    )
  }
}

type Random = () => number

function mulberry32(seed: number): Random {
  return () => {
    let value = seed += 0x6d2b79f5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
