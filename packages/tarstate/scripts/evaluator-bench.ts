import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join as joinPath } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'

type Atom = string | number | boolean | null
type Row = Readonly<Record<string, Atom>>
type Doc = Readonly<Record<string, readonly Row[]>>
type PublicFieldRef = {
  readonly _rel: string
  readonly _field: string
}
type PublicSchema = {
  readonly customers: Record<string, PublicFieldRef>
  readonly orders: Record<string, PublicFieldRef>
  readonly items: Record<string, PublicFieldRef>
}
type RelationLookup = {
  readonly relation: string
  readonly field: string
  readonly value: Atom
}
type RelationSource = {
  rows(relation: string): Iterable<Row>
  lookup?(lookup: RelationLookup): Iterable<Row> | undefined
}
type TarstateApi = {
  readonly defineSchema: (shape: object) => PublicSchema
  readonly eq: (lhs: PublicFieldRef, rhs: PublicFieldRef | Atom) => object
  readonly evaluate: (
    query: object,
    source: RelationSource,
  ) => Promise<ReadonlyArray<Record<string, Atom>>>
  readonly evaluateMany: (
    queries: readonly object[],
    source: RelationSource,
  ) => Promise<ReadonlyArray<ReadonlyArray<Record<string, Atom>>>>
  readonly from: (relation: object) => object
  readonly join: (query: object, otherQuery: object, on: object) => object
  readonly project: (
    query: object,
    shape: Record<string, PublicFieldRef>,
  ) => object
  readonly where: (query: object, predicate: object) => object
  readonly string: () => string
  readonly number: () => number
  readonly boolean: () => boolean
}
type SourceStats = {
  readonly rowCalls: Map<string, number>
  readonly lookupCalls: Map<string, number>
  rowsReturned: number
  lookupRowsReturned: number
}
type SourceFixture = {
  readonly source: RelationSource
  readonly stats: SourceStats
}
type BenchCase = {
  readonly label: string
  readonly sourceLabel: string
  readonly run: (
    api: TarstateApi,
    queries: readonly object[],
    source: RelationSource,
  ) => Promise<ReadonlyArray<ReadonlyArray<Record<string, Atom>>>>
}

const defaults = {
  iterations: 1000,
  warmup: 100,
}

const doc: Doc = {
  customers: [
    { id: 'c1', country: 'NZ', tier: 'pro', active: true },
    { id: 'c2', country: 'US', tier: 'basic', active: true },
    { id: 'c3', country: 'NZ', tier: 'basic', active: false },
    { id: 'c4', country: 'GB', tier: 'pro', active: true },
  ],
  orders: [
    { id: 'o1', customerId: 'c1', status: 'shipped', total: 120 },
    { id: 'o2', customerId: 'c2', status: 'draft', total: 35 },
    { id: 'o3', customerId: 'c1', status: 'paid', total: 78 },
    { id: 'o4', customerId: 'c3', status: 'shipped', total: 42 },
    { id: 'o5', customerId: 'c4', status: 'paid', total: 164 },
    { id: 'o6', customerId: 'c1', status: 'shipped', total: 22 },
  ],
  items: [
    { id: 'i1', orderId: 'o1', sku: 'notebook', qty: 2 },
    { id: 'i2', orderId: 'o1', sku: 'pen', qty: 5 },
    { id: 'i3', orderId: 'o2', sku: 'marker', qty: 1 },
    { id: 'i4', orderId: 'o3', sku: 'staple', qty: 3 },
    { id: 'i5', orderId: 'o5', sku: 'paper', qty: 8 },
    { id: 'i6', orderId: 'o6', sku: 'pen', qty: 1 },
  ],
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const api = await loadTarstateApi()
  const queries = buildQueries(api)
  await assertEquivalentResults(api, queries)

  const cases: readonly BenchCase[] = [
    {
      label: 'evaluate loop',
      sourceLabel: 'scan source',
      run: evaluateLoop,
    },
    {
      label: 'evaluateMany',
      sourceLabel: 'scan source',
      run: evaluateBatch,
    },
    {
      label: 'evaluate loop',
      sourceLabel: 'lookup source',
      run: evaluateLoop,
    },
    {
      label: 'evaluateMany',
      sourceLabel: 'lookup source',
      run: evaluateBatch,
    },
  ]

  console.log('tarstate evaluator benchmark')
  console.log(
    `dataset=customers:${doc.customers.length},orders:${doc.orders.length},items:${doc.items.length}`,
  )
  console.log(
    `queries=${queries.length} iterations=${options.iterations} warmup=${options.warmup}`,
  )
  console.log('')
  console.log(
    [
      'variant'.padEnd(28),
      'ms'.padStart(9),
      'iter/s'.padStart(9),
      'rows'.padStart(8),
      'source access',
    ].join('  '),
  )

  for (const item of cases) {
    const fixtureFactory = item.sourceLabel === 'scan source'
      ? createScanSource
      : createLookupSource
    await runIterations(api, queries, fixtureFactory().source, item, options.warmup)

    const fixture = fixtureFactory()
    const started = performance.now()
    const rowCount = await runIterations(
      api,
      queries,
      fixture.source,
      item,
      options.iterations,
    )
    const elapsed = performance.now() - started
    const rate = Math.round(options.iterations / (elapsed / 1000))

    console.log(
      [
        `${item.label} / ${item.sourceLabel}`.padEnd(28),
        elapsed.toFixed(1).padStart(9),
        String(rate).padStart(9),
        String(rowCount).padStart(8),
        formatStats(fixture.stats),
      ].join('  '),
    )
  }
}

function buildQueries(api: TarstateApi): readonly object[] {
  const schema = api.defineSchema({
    customers: {
      id: api.string(),
      country: api.string(),
      tier: api.string(),
      active: api.boolean(),
    },
    orders: {
      id: api.string(),
      customerId: api.string(),
      status: api.string(),
      total: api.number(),
    },
    items: {
      id: api.string(),
      orderId: api.string(),
      sku: api.string(),
      qty: api.number(),
    },
  })

  const c1Orders = api.where(
    api.from(schema.orders),
    api.eq(schema.orders.customerId, 'c1'),
  )
  const c1ShippedOrders = api.where(
    c1Orders,
    api.eq(schema.orders.status, 'shipped'),
  )
  const c1Customer = api.where(
    api.from(schema.customers),
    api.eq(schema.customers.id, 'c1'),
  )
  const c1CustomerOrders = api.join(
    c1Customer,
    api.from(schema.orders),
    api.eq(schema.customers.id, schema.orders.customerId),
  )
  const c1OrderItems = api.join(
    c1Orders,
    api.from(schema.items),
    api.eq(schema.orders.id, schema.items.orderId),
  )

  return [
    api.project(c1Orders, {
      orderId: schema.orders.id,
      status: schema.orders.status,
      total: schema.orders.total,
    }),
    api.project(c1ShippedOrders, {
      orderId: schema.orders.id,
      status: schema.orders.status,
    }),
    api.project(c1CustomerOrders, {
      customerId: schema.customers.id,
      tier: schema.customers.tier,
      orderId: schema.orders.id,
      total: schema.orders.total,
    }),
    api.project(c1OrderItems, {
      orderId: schema.orders.id,
      sku: schema.items.sku,
      qty: schema.items.qty,
    }),
  ]
}

async function evaluateLoop(
  api: TarstateApi,
  queries: readonly object[],
  source: RelationSource,
): Promise<ReadonlyArray<ReadonlyArray<Record<string, Atom>>>> {
  const rows: ReadonlyArray<Record<string, Atom>>[] = []
  for (const query of queries) {
    rows.push(await api.evaluate(query, source))
  }
  return rows
}

function evaluateBatch(
  api: TarstateApi,
  queries: readonly object[],
  source: RelationSource,
): Promise<ReadonlyArray<ReadonlyArray<Record<string, Atom>>>> {
  return api.evaluateMany(queries, source)
}

async function runIterations(
  api: TarstateApi,
  queries: readonly object[],
  source: RelationSource,
  item: BenchCase,
  iterations: number,
): Promise<number> {
  let rowCount = 0
  for (let index = 0; index < iterations; index += 1) {
    rowCount += countRows(await item.run(api, queries, source))
  }
  return rowCount
}

async function assertEquivalentResults(
  api: TarstateApi,
  queries: readonly object[],
): Promise<void> {
  const scanRows = await api.evaluateMany(queries, createScanSource().source)
  const lookupRows = await api.evaluateMany(queries, createLookupSource().source)
  const loopRows = await evaluateLoop(api, queries, createScanSource().source)
  const expected = canonicalResult(scanRows)

  if (canonicalResult(lookupRows) !== expected) {
    throw new Error('lookup source results differ from scan source results')
  }
  if (canonicalResult(loopRows) !== expected) {
    throw new Error('evaluate loop results differ from evaluateMany results')
  }
}

function createScanSource(): SourceFixture {
  const stats = createStats()
  return {
    stats,
    source: {
      rows(relation) {
        const rows = rowsFor(relation)
        increment(stats.rowCalls, relation)
        stats.rowsReturned += rows.length
        return rows
      },
    },
  }
}

function createLookupSource(): SourceFixture {
  const stats = createStats()
  const indexes = buildLookupIndexes()

  return {
    stats,
    source: {
      rows(relation) {
        const rows = rowsFor(relation)
        increment(stats.rowCalls, relation)
        stats.rowsReturned += rows.length
        return rows
      },
      lookup({ relation, field, value }) {
        const key = `${relation}.${field}`
        const rows = indexes.get(key)?.get(value) ?? []
        increment(stats.lookupCalls, key)
        stats.lookupRowsReturned += rows.length
        return rows
      },
    },
  }
}

function createStats(): SourceStats {
  return {
    rowCalls: new Map(),
    lookupCalls: new Map(),
    rowsReturned: 0,
    lookupRowsReturned: 0,
  }
}

function rowsFor(relation: string): readonly Row[] {
  return doc[relation] ?? []
}

function buildLookupIndexes(): Map<string, Map<Atom, Row[]>> {
  const indexes = new Map<string, Map<Atom, Row[]>>()

  for (const [relation, rows] of Object.entries(doc)) {
    for (const row of rows) {
      for (const [field, value] of Object.entries(row)) {
        const key = `${relation}.${field}`
        let index = indexes.get(key)
        if (!index) {
          index = new Map()
          indexes.set(key, index)
        }

        const atom = value ?? null
        const bucket = index.get(atom)
        if (bucket) bucket.push(row)
        else index.set(atom, [row])
      }
    }
  }

  return indexes
}

function countRows(
  results: ReadonlyArray<ReadonlyArray<Record<string, Atom>>>,
): number {
  return results.reduce((sum, rows) => sum + rows.length, 0)
}

function canonicalResult(
  results: ReadonlyArray<ReadonlyArray<Record<string, Atom>>>,
): string {
  return JSON.stringify(results.map((rows) => rows.map(stableObject).sort()))
}

function stableObject(row: Record<string, Atom>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(row).sort(([left], [right]) => left.localeCompare(right)),
    ),
  )
}

function formatStats(stats: SourceStats): string {
  return [
    `rows{${formatMap(stats.rowCalls)}}`,
    `lookups{${formatMap(stats.lookupCalls)}}`,
    `returned=${stats.rowsReturned}/${stats.lookupRowsReturned}`,
  ].join(' ')
}

function formatMap(values: ReadonlyMap<string, number>): string {
  if (values.size === 0) return '-'
  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function parseArgs(args: readonly string[]): {
  readonly iterations: number
  readonly warmup: number
} {
  const options = { ...defaults }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]
    if (arg === '--') continue
    if (arg === '--iterations' && next) {
      options.iterations = parsePositiveInt(arg, next)
      index += 1
      continue
    }
    if (arg === '--warmup' && next) {
      options.warmup = parseNonNegativeInt(arg, next)
      index += 1
      continue
    }
    if (arg === '--help') {
      console.log(
        'usage: node packages/tarstate/scripts/evaluator-bench.ts [--iterations n] [--warmup n]',
      )
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

function parseNonNegativeInt(flag: string, value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`)
  }
  return parsed
}

async function loadTarstateApi(): Promise<TarstateApi> {
  const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
  const tempDir = await mkdtemp(joinPath(tmpdir(), 'tarstate-evaluator-bench-'))

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
