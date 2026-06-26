# Tarstate V2 API Sketch

This is a design sketch, not an implementation contract. Its job is to keep the
day-one Tarstate slice compatible with the larger state/query system Patchpit
probably wants later.

The posture is Relic-compatible, not Relic-complete:

- query definitions are inspectable data
- relations are explicit and normalized
- indexes, constraints, materialized views, watched deltas, and aggregate
  invalidation can be added later without changing app query code
- core Tarstate stays independent of React, Automerge, browser presence,
  persistence, app hosting, and shell runtime policy

Research references:

- Relic: https://github.com/wotbrew/relic
- DataScript: https://github.com/tonsky/datascript
- Datomic docs: https://docs.datomic.com/
- Keyhive notebook: https://www.inkandswitch.com/keyhive/notebook/
- Beelay protocol: https://github.com/automerge/beelay

## Design Pressure

Patchpit wants Tarstate from day one because presence and foreign-key-like
references are not an edge feature. The first real proof should include durable
workspace rows joined to ephemeral presence rows.

That proof should answer:

- Can app code express presence references without pretending they are durable
  database foreign keys?
- Can the same query shape run against a plain object source, an indexed source,
  and eventually an Automerge/presence source?
- Can React consume query results through normal hooks without turning query
  construction into opaque render callbacks?
- Can invalid, stale, or missing data become diagnostics instead of hidden
  control flow?
- Can the evaluator start simple without closing the door on materialized views
  and watched query deltas?

## Comparative Pressure

Relic is the primary shape reference. It argues for normalized relations,
declarative queries as data, query-backed constraints, materialized views, and
query-aware change reports. Tarstate should borrow that direction without
claiming Relic's full runtime on day one.

DataScript and Datomic add a useful warning: a pure named-table API can become
awkward for sparse attributes, identity, history, refs, generic indexes,
transaction reports, and low-level debugging. Tarstate should expose named
relations for app ergonomics, but the core model should leave room for an
entity/fact substrate.

Keyhive and Beelay add the authorization warning. Local-first delegation cannot
be treated as a remote yes/no callback. Permission state, delegation paths,
revocations, unreadable dependencies, and denial reasons need to be representable
as data. Tarstate should not implement Keyhive crypto or sync, but it must be
able to query permission/delegation rows and carry authorization diagnostics.

The resulting ecosystem target is:

```txt
snapshot + query-data + tx-data + tx-report + diagnostics
+ permission-proof + future materialized-change-report
```

That target spans packages. Tarstate core should own query and diagnostic
structure; authorization packages or runtime adapters should own cryptographic
proof construction.

## Decomplected Layers

### Core Algebra

Owns:

- schema and relation metadata
- query expression values
- query planning and one-shot evaluation
- result and diagnostic shapes
- transaction data shapes when writes return
- future query-change report data shapes
- generic diagnostic extension points for authorization and source visibility

Does not own:

- React hooks
- Automerge handles
- peer presence transport
- persistence or sync
- app host capabilities
- namespace paths
- UI diagnostics
- cryptographic authorization or sync protocol

### Source Adapters

Own:

- turning backing state into relation rows
- optionally turning entity/fact stores into named relations
- validating incoming document or presence rows when they know the schema
- optional lookup/index capabilities
- optional subscription/materialization capabilities later
- adapter-specific staleness and invalid-row policy
- visibility filtering and unreadable-source diagnostics when permissions hide
  data

### Runtime And OS Layer

Owns:

- app lifecycle
- namespace paths such as `/patchpit/run/apps`
- presence arrival, expiry, throttling, and peer identity
- permissions, persistence, sync, cryptographic proofs, and capability
  boundaries

Tarstate can query runtime rows, but it should not become the runtime.

### React Layer

Owns:

- `useQuery` and future Suspense wrappers
- source lifecycle subscription through React
- rendering pending/error/result states

It should stay a thin consumer of query values. React should not define the
query algebra.

## API Shape

Tarstate should stay functional. Do not use fluent chains.

The preferred DX is v1-style typed field refs plus v2 metadata and aliases.
Query construction should feel like composing relation expressions, not like
writing callbacks over rows.

```ts
const object = as(schema.objects, 'object')
const presence = as(schema.presence, 'presence')

const focusedObjects = pipe(
  from(object),
  where(eq(object.kind, 'file')),
  leftJoin(from(presence), eq(presence.targetObjectId, object.id)),
  project({
    id: object.id,
    title: object.title,
    focusedBy: maybe(presence.peerId),
  }),
)
```

This keeps the good part of v1: schema fields are typed values. V2 adds explicit
aliases, richer field metadata, diagnostics, and canonical query data.

Left-to-right `pipe` should be the documented composition style because nested
query constructors become hard to read quickly. `compose` can wait; users who
prefer it can bring their own while the operator signatures stay ordinary
functions.

Helper builders are acceptable only if they run at query construction time and
lower immediately into expression data. They must not be row-level callbacks
evaluated against app state.

Avoid Proxy-based magic. It can make demos terse, but it obscures query data,
debugging, serialization, and type errors.

TypeScript should carry as much useful structure as practical:

- branded IDs such as `Id<'object'>`
- field value types through phantom symbols or equivalent metadata
- relation aliases as `const` generic strings
- composite key metadata
- ref target metadata
- optional and nullable field metadata
- projected row inference from `project({ ... })`

Do not chase perfect inference through every advanced query shape before the API
has real workflows. When TypeScript cannot infer a complex case, prefer a local
explicit annotation over adding broad machinery.

## Canonical Query Data

The public TypeScript API can be friendly, but the core query artifact should be
stable inspectable data. That is the shared lesson from Relic, DataScript, and
Datomic.

Field-ref constructors and any future helper constructors are acceptable only if
they lower immediately into a canonical query object:

```ts
type QueryData =
  | { op: 'from'; relation: string; alias: string }
  | { op: 'where'; input: QueryData; predicate: PredicateData }
  | { op: 'join'; kind: 'inner' | 'left'; left: QueryData; right: QueryData; on: PredicateData }
  | { op: 'select'; input: QueryData; projection: ProjectionData }

type PredicateData =
  | { op: 'eq'; left: ExprData; right: ExprData }
  | { op: 'and'; predicates: readonly PredicateData[] }
  | { op: 'or'; predicates: readonly PredicateData[] }
  | { op: 'not'; predicate: PredicateData }
```

This does not have to be the exact serialized shape, but the invariant matters:

- query identity can be compared and cached
- `explain(query)` can work without a source
- future workers or remote evaluators can receive query data
- permission analysis can inspect relation dependencies
- materialized queries can use stable keys
- diagnostics can point at a query node

The ergonomic `project({ ... })` API can lower to a canonical `select` node.
The public names should optimize for app readability; canonical operation names
should optimize for planner clarity.

Do not let arbitrary closures become part of the core query representation. If a
future app needs custom predicates or transforms, register them by symbolic name
with explicit input/output metadata.

## API Iteration Decisions

Chosen for day one:

- functional constructors over fluent builders
- `pipe` over deeply nested calls in examples
- no public `compose` until demand is proven
- v1-style field refs as the preferred DSL direction
- result objects over bare arrays
- `leftJoin` in the first presence proof
- source capability hooks over app-selected index APIs
- diagnostics from the first evaluator

Rejected for day one:

- generic Ramda-style helper surface
- arbitrary JavaScript predicates in query execution
- Proxy-based schema/query magic
- React hooks as the core query API
- full constraints before validation and diagnostics
- materialized views before one-shot plans are proven
- adapter-specific concepts in `packages/tarstate`

Understandability rules:

- Names should describe capability honestly. Do not call a React rerun hook a
  watched query until it can report query deltas.
- Examples should show one real Patchpit workflow instead of abstract todos once
  the shell fixture exists.
- Query examples should read in dataflow order.
- Documentation should always say which layer owns policy: core algebra, source
  adapter, runtime, React, or app schema.
- Day-one APIs should have a clear future home for materialization, constraints,
  and indexes, but should not pretend those features exist.

## Schema Sketch

```ts
const schema = defineSchema({
  objects: relation({
    key: 'id',
    fields: {
      id: id('object'),
      kind: string(),
      title: string(),
      parentId: optional(ref('objects.id')),
    },
  }),

  presence: relation({
    ephemeral: true,
    key: ['workspaceId', 'peerId', 'clientId'],
    fields: {
      workspaceId: id('workspace'),
      peerId: id('peer'),
      clientId: string(),
      targetObjectId: optional(ref('objects.id')),
      focusPath: optional(anchoredPath()),
      updatedAt: number(),
    },
  }),
})
```

Schema decisions to protect now:

- Relation keys can be single-field or composite.
- IDs are branded by domain, such as `Id<'object'>`.
- References are metadata, not automatically enforced constraints.
- `ephemeral: true` changes validation policy: bad presence can be dropped or
  reported without invalidating durable workspace state.
- `optional(T)` means missing or undefined is allowed.
- `nullable(T)` should mean the field is present and may be `null`.
- Do not collapse anchored object identity into plain document paths. Presence
  needs stable object identity plus an optional relative path inside that object.

## Entity/Facts And Named Relations

Named relations should be the application-facing API because they are readable
and match Patchpit workflows. But the core should not assume that every backing
store is literally arrays of rows.

DataScript and Datomic argue for a lower-level fact shape:

```ts
type Fact = {
  entity: EntityId
  attribute: AttributeId
  value: unknown
  tx?: TransactionId
  added?: boolean
}
```

Tarstate does not need to expose raw facts as the primary v2 API. It should
leave room for adapters or future core storage to map facts into named
relations:

```txt
facts/datoms -> source adapter -> named relation rows -> query algebra
```

Why keep that door open:

- sparse app attributes do not always want fixed row shapes
- refs, reverse refs, and lookup refs are natural in entity/fact stores
- history and transaction reports are easier when assertions and retractions are
  first-class
- direct index/debug access can exist below relation queries
- permissions and delegation can be represented as graph-like facts while still
  projected into ergonomic relations

Do not make day-one app code write Datalog or raw EAV. Do make sure relation
metadata is rich enough to compile down to fact/index access later.

## Query Constructors

Preferred near-term surface:

```ts
pipe(input, ...transforms)
as(relation, alias)
from(aliasedRelation)
where(predicate)
join(rightQuery, predicate)
leftJoin(rightQuery, predicate)
project(shape)
eq(left, right)
and(...predicates)
or(...predicates)
not(predicate)
value(literal)
maybe(expr)
```

`eq` should accept primitive literals directly and lower them to canonical value
expressions. Keep `value(literal)` for explicit expression construction.

`as` should create an alias-bound relation ref. Its fields should carry field
type, relation name, alias, and metadata needed to produce canonical expression
data.

`maybe` should be a projection helper for fields that may be absent because of a
left join, optional source field, or partial visibility. Keep schema
`optional(fieldSpec)` separate from projection `maybe(fieldRef)` so the API does
not overload one word across two different domains.

Avoid adding callback-style `where` or `project` as public API until a concrete
workflow proves they are more readable than field refs. Field refs should carry
the normal path.

Likely future surface:

```ts
orderBy(...terms)
limit(count)
offset(count)
exists(query)
notExists(query)
union(left, right)
groupBy(keys, aggregates)
count(expr)
sum(expr)
min(expr)
max(expr)
explain(query)
```

Defer features until a workflow proves them. Do not add fake aggregates,
sorting, or recursion just because the full system may eventually need them.

## Evaluation Shape

Return result objects from the start. A bare `Row[]` is attractive, but it makes
bad source data and partial source failure awkward to add later.

```ts
type QueryResult<T> = {
  rows: readonly T[]
  diagnostics: readonly TarstateDiagnostic[]
}

const result = await evaluate(source, focusedObjects)
```

Diagnostic examples:

- duplicate primary key
- invalid row shape
- stale presence row
- missing durable linked document
- unreadable linked document
- permission denied for a requested write
- source read error
- unsupported lookup capability, when requested by debug/explain mode
- query plan fallback warning when requested by debug mode

Do not make every diagnostic fatal. Durable and ephemeral data need different
policies.

## Source Boundary

```ts
interface RelationSource {
  rows(relation: RelationRef): MaybePromise<Iterable<unknown>>
  lookup?(lookup: RelationLookup): MaybePromise<Iterable<unknown> | undefined>
}
```

Lookup policy:

- `undefined` from `lookup` means unsupported for that lookup shape.
- an empty iterable means supported and no matching rows.
- if lookup is unsupported, the evaluator may fall back to scan.
- if lookup throws, evaluation should surface a diagnostic.
- the day-one evaluator does not need to report every scan fallback; future
  `explain` or debug diagnostics can report unsupported lookup capabilities.

Future optional capabilities should be additive:

```ts
subscribe?(relations, callback): Unsubscribe
materialize?(query): MaterializedQuery
explainLookup?(lookup): LookupPlan
```

The normal app query API should not change when these appear.

## Async Stance

Query construction is synchronous and pure. A `Query` is data.

Evaluation is always async at the public boundary:

```ts
const result = await evaluate(source, query)
```

Even if an in-memory source can answer synchronously, Patchpit's real sources
include Automerge documents, linked documents, presence, permission checks,
remote refs, and sync state. Letting `evaluate` sometimes be synchronous would
push source complexity into every consumer.

Source methods may be sync or async:

```ts
type MaybePromise<T> = T | Promise<T>

interface RelationSource {
  rows(relation: RelationRef): MaybePromise<Iterable<Row>>
  lookup?(lookup: RelationLookup): MaybePromise<Iterable<Row> | undefined>
}
```

Do not introduce `AsyncIterable` rows in the first slice. Streaming, paging, and
backpressure are real future concerns, but they complicate joins,
materialization, and diagnostics. Keep them behind adapters until a workflow
proves the query engine needs streaming semantics.

Future async capabilities should remain explicit:

- `evaluate(source, query)` for one-shot results
- `watch(source, query, handler)` once query deltas exist
- adapter-owned paging/streaming helpers before core streaming queries

## Big-I: Indexes And Invalidation

The main performance choice is to keep indexes and invalidation under the source
and evaluator boundary, not in application query code.

| Operation | Day-one fallback | Protected future path |
| --- | --- | --- |
| `from(aliasedRelation)` | scan relation rows, `O(n)` | relation iterator/index |
| `where(eq(field, literal))` | scan, `O(n)` | source `lookup` |
| inner `join` | nested/hash join chosen by evaluator | indexed join |
| `leftJoin` presence | preserve left rows, scan/lookup right rows | ephemeral presence index |
| `evaluateMany` | repeated plans/evals | shared source reads and plan reuse |
| React `useQuery` | rerun on source version change | watched query deltas |
| constraints | not implemented | query-backed transaction checks |
| aggregates | not implemented | materialized aggregate invalidation |

Indexes and materializations are different tools:

- An index accelerates primitive access paths such as relation/key/value lookup.
- A materialized view stores derived query results and must track invalidation.
- A watched query reports how a materialized or incrementally evaluated query
  changed.

Avoid these perf traps:

- row-level JavaScript predicates that the planner cannot inspect
- query constructors that close over live app state instead of literal values
- requiring apps to choose scan vs index APIs
- React hooks that hide the query value
- result shapes that cannot report planner diagnostics

Day-one evaluation can be simple. It should still build an internal plan so
`explain(query)` and later materialized execution have somewhere to attach.

Future materialized change reports should have a reserved shape:

```ts
type QueryChange<T> = {
  query: QueryData
  added: readonly T[]
  removed: readonly T[]
  updated?: readonly { before: T; after: T }[]
  diagnostics: readonly TarstateDiagnostic[]
}
```

Do not expose this as a real capability until Tarstate can maintain or derive it
from transaction reports. Until then, React hooks should describe themselves as
rerunning a query against a source version, not as watched query deltas.

## Presence And Foreign Keys

Durable references and presence references need different semantics.

Durable relation rows:

- may eventually participate in constraints
- missing required refs can make app state invalid
- invalid rows should surface as durable load/validation diagnostics

Ephemeral presence rows:

- may disappear at any time
- may arrive late or be stale
- may point at objects that no longer exist
- may be invalid peer input
- should not make durable state invalid

That leads to two early rules:

- Use `leftJoin` for durable-to-presence joins unless disappearing rows are the
  desired behavior.
- Treat presence refs as optional relation metadata plus diagnostics, not as
  mandatory referential integrity.

Example expected behavior:

```ts
const object = as(schema.objects, 'object')
const presence = as(schema.presence, 'presence')

const q = pipe(
  from(object),
  leftJoin(from(presence), eq(object.id, presence.targetObjectId)),
  project({
    id: object.id,
    peerId: maybe(presence.peerId),
  }),
)
```

If there are three objects and no peers, the query still returns three object
rows. `peerId` is absent in each row. If one object has two peer rows, the query
returns two rows for that object until grouping/aggregation exists.

## Patchpit Automerge And Presence Fit

The concrete Patchpit case is a composed source:

```txt
Automerge document snapshots -> durable relation rows
live peer/app presence        -> ephemeral relation rows
Keyhive/host visibility       -> diagnostics and filtered/unreadable rows
```

Tarstate core should only see relation sources. It should not hold Automerge
handles, subscribe to peer presence, or know how Keyhive verifies a delegation.

The Automerge adapter should own:

- loading one or more durable document snapshots
- mapping document URLs, object IDs, and app-owned fields into relation rows
- validating durable document shape
- translating future transaction data into Automerge changes
- reporting unavailable, invalid, or unreadable linked documents as diagnostics

The presence adapter/runtime should own:

- peer ID, client ID, session ID, and clock/timestamp policy
- throttling and expiry
- dropping or quarantining invalid peer state
- mapping live focus/drag/selection operations into ephemeral relation rows
- preserving stable object identity through anchored paths where possible

The combined source should make durable and ephemeral rows queryable together:

```ts
const source = composeSources(
  automergeDocumentSource(workspaceDoc),
  presenceSource(peerPresence),
  visibilityDiagnosticSource(currentPrincipal),
)
```

That is illustrative, not a day-one API requirement. The important ownership
rule is that source composition happens outside the query algebra.

Presence rows should carry both document identity and object identity:

```ts
type PresenceRow = {
  workspaceId: WorkspaceId
  documentUrl: string
  peerId: PeerId
  clientId: string
  targetObjectId?: ObjectId
  focusPath?: AnchoredPath
  operation?: 'focus' | 'drag' | 'select'
  updatedAt: number
  expiresAt?: number
}
```

Do not collapse this to a plain document path. Automerge object identity and
anchored paths are the bridge that lets presence continue to point at the same
logical object when possible.

Specific Patchpit diagnostics to preserve:

- durable document is present but invalid for the app schema
- linked Automerge document is missing or not yet loaded
- linked Automerge document exists but current principal cannot read it
- presence points at a document or object that is gone
- presence is stale or fails validation
- presence refers to an object whose identity was remapped by a move adapter

This section belongs in the API sketch because it defines what Tarstate must not
preclude. The full Automerge adapter API belongs in a later
`tarstate-automerge` design once the day-one core exists.

## Permissions And Delegation

Keyhive and Beelay imply that access control is not a final server-side filter.
Delegation, revocation, group membership, document membership, and unreadable
dependencies are replicated state with causal and cryptographic meaning.

Tarstate should not own:

- key management
- signature verification
- encrypted sync
- revocation protocol
- network reconciliation

Tarstate should support querying authorization as data when the runtime or
adapter exposes it:

```ts
const authSchema = defineSchema({
  principals: relation({
    key: 'id',
    fields: { id: id('principal'), kind: string(), label: optional(string()) },
  }),

  delegations: relation({
    key: 'id',
    fields: {
      id: id('delegation'),
      issuerId: ref('principals.id'),
      subjectId: ref('principals.id'),
      resourceId: id('resource'),
      capability: string(),
      scope: optional(string()),
      expiresAt: optional(number()),
      revokedById: optional(id('revocation')),
    },
  }),
})
```

Future permission checks should be explainable:

```ts
type PermissionDecision = // owned by an authorization package or runtime adapter
  | {
      status: 'allowed'
      principalId: PrincipalId
      resourceId: ResourceId
      capability: string
      proof: readonly DelegationId[]
    }
  | {
      status: 'denied'
      principalId: PrincipalId
      resourceId: ResourceId
      capability: string
      reason: 'no_proof' | 'revoked' | 'expired' | 'unreadable_dependency'
      diagnostics: readonly TarstateDiagnostic[]
    }
```

That decision may come from a Keyhive-aware adapter or runtime service, not from
core Tarstate. The important API constraint is that query results and diagnostics
can represent partial visibility:

- a row is absent because it truly does not exist
- a row is absent because the source cannot read it
- a row is present but the current principal cannot write it
- a delegation proof exists but has expired or been revoked

Do not model permissions as an opaque `canWrite(row) => boolean` callback inside
queries. That would hide proof paths from diagnostics, materialization, and
debugging.

## React API

React should feel normal even though Tarstate is relational underneath.

```tsx
const state = useQuery(source, queries.focusedObjects)

if (state.status === 'pending') return null
if (state.diagnostics.length) return <Diagnostics items={state.diagnostics} />

return state.rows.map((row) => <ObjectRow key={row.id} row={row} />)
```

Parameterized queries should be query factories that return query data:

```ts
const object = as(schema.objects, 'object')

const objectById = (objectId: ObjectId) =>
  pipe(
    from(object),
    where(eq(object.id, objectId)),
    project({ id: object.id, title: object.title }),
  )
```

React usage:

```tsx
const query = useMemo(() => objectById(objectId), [objectId])
const state = useQuery(source, query)
```

Do not make `useQuery(() => rows.filter(...))` the model. It is familiar React
code, but it erases the query structure Tarstate needs for indexes,
diagnostics, materialization, and watched deltas.

## Writes And Constraints

Writes should eventually return transaction data, not directly call storage.
DataScript and Datomic both argue that transactions are data because transaction
reports become the bridge to sync, undo, audit, materialized invalidation, and
authorization diagnostics.

Do not implement writes in the first read-only Tarstate slice unless the shell
workflow forces them. Reserve the shape so read APIs do not block it later.

```ts
const tx = createTransaction(
  assert(schema.objects, object),
  patch(schema.objects, objectId, { title: 'Draft' }),
  retract(schema.objects, oldObjectId),
  withTxMeta({ actorId, reason: 'rename object' }),
)

const report = await dispatch(writer, tx)
```

Potential report shape:

```ts
type TransactionReport = {
  txId: TransactionId
  accepted: readonly OperationData[]
  rejected: readonly { operation: OperationData; diagnostics: readonly TarstateDiagnostic[] }[]
  changedRelations: readonly string[]
  changedFacts?: readonly Fact[]
  affectedQueries?: readonly QueryData[]
  diagnostics: readonly TarstateDiagnostic[]
}
```

Keep writes as operation values. `insert`, `update`, and `remove` can exist as
ergonomic aliases later, but the core distinction should be assertions,
patches/sugar, and retractions.

Future transaction features to reserve:

- temp IDs
- lookup refs
- transaction metadata
- dry-run/preview
- deterministic transaction reports
- authorization diagnostics attached to operations
- materialized query invalidation derived from changed facts/relations

Future constraints should be query-like values checked at transaction
boundaries:

```ts
const validParent = constraint(
  'object parent exists',
  schema.objects,
  ({ row }) => optionalRefExists(schema.objects, row.parentId),
)
```

Do not implement constraints before validation, diagnostics, and basic query
evaluation are proven.

## Edge Cases To Test First

Day-one acceptance tests should cover:

- v1-style field-ref DSL lowers to canonical query data without preserving
  closures.
- `leftJoin` keeps durable rows when there is no presence.
- multiple presence rows for one object produce multiple result rows.
- invalid presence rows are reported or dropped without crashing durable
  queries.
- duplicate durable primary keys produce diagnostics.
- composite presence keys distinguish peer/client rows.
- `optional` and `nullable` are different in validation and projection.
- source `lookup` unsupported falls back to scan; lookup supported with zero
  matches returns no rows without scanning.
- source `lookup` errors become diagnostics.
- the same query returns the same rows against object-source scan and indexed
  lookup source.
- query factories with literal parameters produce inspectable query values.
- query constructors do not preserve closures in canonical query data.
- durable Automerge rows and ephemeral presence rows compose through the same
  source interface.

Later acceptance tests:

- `join` intentionally removes rows with missing matches.
- async source row errors become diagnostics.
- query objects can be passed to `explain` without a source.
- durable missing refs are diagnostics or constraint failures.
- unreadable refs produce authorization diagnostics, not false absence.
- stale presence expiry is adapter policy and visible as diagnostics when
  useful.
- anchored paths survive object moves when the adapter can remap them.
- missing, invalid, and unreadable Automerge documents produce distinct
  diagnostics.
- transaction reports identify changed relations/facts and rejected operations.
- permission decisions include proof paths or denial reasons.
- watched queries report deltas only after a real watch/materialization engine
  exists.
- aggregates do not recompute whole relations once materialized aggregates are
  claimed.

## Day-One Slice

Implement only enough to prove the shape:

1. Restore `packages/tarstate` as a small package.
2. Add schema/relation metadata with branded IDs, optional fields, composite
   keys, and `ephemeral` relation policy.
3. Add the preferred query constructors: `pipe`, `as`, `from`, `where`, `join`,
   `leftJoin`, `project`, `eq`, `value`, and `maybe`; `eq` accepts primitive
   literals directly.
4. Ensure constructors lower to inspectable canonical query data.
5. Add `evaluate` returning `{ rows, diagnostics }`.
6. Add object source helpers, with scan and lookup-backed variants for tests.
7. Add presence foreign-key tests around durable objects and ephemeral presence.
8. Add one permission/visibility diagnostic fixture, without implementing
   Keyhive.
9. Add one composed-source fixture that mimics Automerge durable rows plus
   ephemeral presence rows, without using real Automerge yet.
10. Wire one shell fixture query through Tarstate before extracting any runtime
   package.

Stop there unless the shell workflow forces more.

Revise the DSL before adding more query behavior if the implementation drifts
away from this field-ref shape. Otherwise scaffolding will harden into the
public API by accident.

Package layout should stay split by ownership:

- `schema.ts`: relation and field metadata.
- `query.ts`: functional query DSL plus canonical query data.
- `source.ts`: source contracts and object/composed source fixtures.
- `evaluate.ts`: one-shot evaluator, validation, lookup use, and diagnostics.
- `diagnostics.ts`: diagnostic shape shared across the core.
- `index.ts`: public barrel only.

Tests should mirror that split: query shape, evaluator behavior, and source
composition stay in separate files.

Explicitly do not implement in the first slice:

- transaction dispatch
- watched query deltas
- materialized views
- constraints
- raw fact storage
- Keyhive or Beelay integration
- React hooks

## Future Shapes Appendix

This section is non-contractual. Its purpose is to catch obvious API traps, not
to design the deferred systems.

### Iframe Or Worker App Hosting

Tarstate must not assume same-origin function calls or direct object identity
across the app boundary.

Likely owner: app host/runtime.

Useful protected shape:

- queries are serializable enough to pass through a message boundary later
- source diagnostics can say a capability denied a relation or path
- runtime rows can describe app instance, host kind, and granted capabilities

### WebContainer, WASI, And Command Runtimes

Tarstate must not assume commands can access local process state directly.

Likely owner: command/runtime host.

Useful protected shape:

- command output can be represented as structured rows or diagnostics
- long-running commands can update ephemeral runtime relations
- capability errors should be diagnostics, not thrown strings

### Large Files And Sedimentree

Tarstate must not force large binary content into relation rows or Automerge
documents.

Likely owner: file/storage adapters.

Useful protected shape:

- relation rows carry refs, metadata, hashes, MIME type, and availability
- source diagnostics distinguish missing content, unavailable content, and
  unreadable content
- queries can join metadata without loading blobs

### Royal Preview And Renderers

Tarstate must not treat rendering engines as core state machinery.

Likely owner: app package or renderer capability.

Useful protected shape:

- preview inputs and renderer settings can be app-owned relation rows
- render failures can be diagnostics
- heavy renderer resources stay outside Tarstate core

### App Marketplace And App Refs

Tarstate must not decide trust, sandboxing, or pinning policy.

Likely owner: app registry/runtime/security layer.

Useful protected shape:

- app refs, pinned refs, versions, and shortcut rows can be durable relations
- trust and delegation decisions can be diagnostics/proof records from another
  layer
- HTTPS refs and Automerge refs should both fit as data, even if only built-ins
  work first

### Production Deployment And Sync

Tarstate must not assume all sources are complete, online, or readable.

Likely owner: source adapters, sync layer, and runtime diagnostics.

Useful protected shape:

- source diagnostics report offline, partial, stale, unauthorized, or failed
  loads
- query results can be partial without pretending partial means correct
- transaction reports can later carry sync and authorization diagnostics

## Open Questions

- Should schema field descriptors double as runtime validators, or should source
  adapters own parsing with Tarstate only carrying relation metadata?
- Should `optional(ref('objects.id'))` be enough for presence refs, or do
  ephemeral refs need a distinct marker such as `softRef`?
- Should projection `maybe(fieldRef)` always produce `T | undefined`, or should
  it preserve `null` separately for nullable source fields?
- Should query projection return plain objects only, or also support tuple-like
  rows for cheaper joins?
- Should raw fact/datoms be a public advanced API or remain adapter/internal for
  v2?
- Should `evaluateMany` be day one to force shared planning, or wait until the
  shell has multiple concurrent queries?
- Should transaction data land with the first read-only slice, or wait for the
  first write workflow?
- Which package owns `PermissionDecision`? Tarstate should carry diagnostics and
  queryable authorization rows, not cryptographic proof policy, unless a later
  workflow proves otherwise.
- How much query serialization is actually needed before worker evaluation or
  persisted query plans exist?

The safest answer for now is to keep the surface small, functional, and
inspectable, with diagnostics and source capabilities present from the start.
