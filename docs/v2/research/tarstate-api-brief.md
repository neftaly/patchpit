# Tarstate API Brief

This is a working brief for understanding and criticizing Tarstate during the
Patchpit v2 review. It is not a final API spec.

The immediate purpose is to make Tarstate small enough to discuss: what the API
currently does, which layer each export belongs to, and what external research
can legitimately argue for or against.

## Current Read

Tarstate is currently best understood as a typed relational query/write library
over document-shaped relation sources.

It is not yet a full in-memory database like Relic, and it is not yet a
tuple-store/storage substrate like Chet Corcos' tuple database. Those projects
are useful as critique lenses, not templates to copy.

The smallest honest claim is:

Tarstate lets Patchpit describe relation-shaped views over one or more document
snapshots, evaluate those views against a pluggable source, and express writes
as relation operations that adapters can apply to a backing document.

## Desired Posture

The desired v2 posture is Relic-compatible, not Relic-complete.

Patchpit should be able to start with the current small query/write library
while leaving the public API shape open to Relic-like features later:

- materialized queries
- watched query deltas
- incremental view maintenance
- relational constraints
- explicit indexes
- aggregate invalidation
- richer query operators

That means v2 does not need to implement those features now, but it should avoid
API choices that would make them breaking changes later.

Practical API constraints:

- Queries should remain declarative values, not callbacks that close over app
  state in ways a future planner cannot inspect.
- Query construction should preserve enough structure for future planning,
  materialization, dependency analysis, and serialization.
- Core Tarstate should not expose React hooks, Automerge handles, or browser
  runtime concepts as part of the algebra.
- Source adapters should be allowed to grow optional capabilities such as
  lookup, subscribe, materialize, direct index access, or change tracking without
  changing the basic `rows()` contract.
- Transactions should stay as data, not imperative storage calls, so future
  constraint checks and watched query deltas can run around the same write
  boundary.
- Schema/relation metadata should stay explicit enough for future constraints,
  indexes, migrations, and app-owned state contracts.
- Current names should not overclaim. Avoid naming a simple React re-run hook as
  a "subscription" unless it can later mean watched query deltas without a
  semantic break.
- Ephemeral sources such as presence should be queryable without becoming
  durable state. Their absence, staleness, and invalidity must be represented in
  the API instead of hidden behind normal foreign-key assumptions.
- Bad data should be handled at source/adapter boundaries first. Tarstate should
  be able to expose validation errors and skipped rows without making every
  query consumer write bespoke parser code.

The design rule is:

Ship the smallest evaluator now, but make the public shapes compatible with a
future materialized relational runtime.

## Public Surface

Core query/schema exports:

- `defineSchema`
- `relation`
- `string`, `number`, `boolean`, `nullable`
- `from`
- `where`
- `join`
- `select`
- `project`
- `eq`
- `evaluate`
- `evaluateMany`
- `fromObject`
- `fromObjects`

Write/command exports:

- `defineCommand`
- `dispatch`
- `createTransaction`
- `insert`
- `update`
- `remove`
- `run`
- `newId`
- `applyOperation`
- `applyTransaction`

Adapter/helper packages:

- `@patchpit/tarstate-react`
- `@patchpit/tarstate-automerge`
- `@patchpit/tarstate-links`

## Minimal Example

The todo demo is currently the clearest API example:

```ts
const schema = defineSchema({
  users: relation({ key: 'id', fields: { id: '', name: '' } }),
  tasks: relation({
    key: 'id',
    fields: { id: '', title: '', done: false, assigneeId: '' },
  }),
})

const pendingTasks = where(from(schema.tasks), eq(schema.tasks.done, false))

const pendingByUser = project(
  join(
    pendingTasks,
    from(schema.users),
    eq(schema.tasks.assigneeId, schema.users.id),
  ),
  { title: schema.tasks.title, name: schema.users.name },
)
```

This example is important because it proves the current core can query a plain
object source. Immer mutates the local todo document; Tarstate derives views.
That means Tarstate currently reads as query algebra first, not as the sole app
mutation boundary.

## Layer Classification

### Core Algebra

Owned by `packages/tarstate/src/query.ts`, `predicates.ts`, `types.ts`,
`internal.ts`, `plan.ts`, and `evaluate.ts`.

Current responsibilities:

- define typed relation refs from schema-shaped objects
- build query objects through `from`, `where`, `join`, `select`, and `project`
- compile query specs into simple query plans
- evaluate plans against a `RelationSource`
- batch multiple query evaluations through `evaluateMany`

Current limitations:

- predicates are equality only
- joins are equality joins or nested joins
- no aggregation, grouping, sort, union, difference, or recursion
- no materialized views
- no watched query deltas
- no constraint operators
- no durable query plan format

### Source Adapter Boundary

Owned by `packages/tarstate/src/source.ts`.

The core adapter contract is small:

```ts
interface RelationSource {
  rows(relation: string): MaybePromise<Iterable<Row>>
  lookup?(lookup: RelationLookup): MaybePromise<Iterable<Row> | undefined>
}
```

This is a good boundary. It means Tarstate can query plain objects, linked
documents, Automerge snapshots, or future indexed stores without making the core
depend on any one storage system.

The optional `lookup` hook is the current indexing escape hatch. The evaluator
uses it for equality filters and lookup joins when possible, then falls back to
scanning.

### Write Boundary

Owned by `packages/tarstate/src/command.ts` and `write.ts`.

Current responsibilities:

- commands collect insert/update/remove operations into transactions
- relation refs carry key names into writes
- writers can apply one operation at a time or whole transactions
- adapters decide how those operations mutate backing storage

Current limitations:

- no schema validation beyond TypeScript types
- no unique/foreign-key/check constraints
- no conflict semantics beyond adapter behavior
- no read-before-write query contract
- no demonstrated app-level command pattern beyond the library primitives

### React Consumption Layer

Owned by `packages/tarstate-react`.

Current responsibilities:

- `useQuery` and `useQueries` evaluate Tarstate queries from React
- `useObjectQuery` turns a plain object into a source and runs a query
- query identity is tracked with a `WeakMap` signature

Current limitation:

This is not fine-grained query subscription. It re-runs evaluation when React
dependencies change. That is acceptable for a small layer, but it should not be
described as Relic-style watched query reactivity.

### Automerge Adapter

Owned by `packages/tarstate-automerge`.

Current responsibilities:

- subscribe to Automerge document handles
- collect linked Automerge snapshots
- turn snapshots into `RelationSource`s
- apply Tarstate relation operations into Automerge array fields

Current limitations:

- invalidation is coarse: document/snapshot changes rebuild the relation source
- writes assume relation arrays in object documents
- linked snapshot collection is adapter policy, not core algebra
- React and Automerge concerns currently live in the same package

### Link Helper

Owned by `packages/tarstate-links`.

Current responsibilities:

- collect linked object docs by following string/link-record fields
- build a `RelationSource` from the collected object docs

Review question:

Does Tarstate own document graph traversal, or should link collection remain a
separate helper package used by source adapters?

### Presence Source

Presence should be modeled as an ephemeral relation source, not persisted app
state.

Probability and SDK evidence:

- SDK presence is temporary peer state broadcast through `usePresenceState`.
- Presence is schema-validated in development and throttled before broadcast.
- Probability Play uses presence as pre-commit intent: selection and drag are
  represented as `ops` that mirror the future document operations.
- Presence may not exist for a peer, may arrive late, may disappear on
  disconnect, and may be invalid.

The desired Tarstate shape is:

- Durable document relations and ephemeral presence relations can be queried
  together.
- Presence rows are keyed by explicit identity, probably document URL, peer ID,
  client, operation kind, anchored object/path, and timestamp/clock metadata
  when available.
- Joining document rows to presence must be optional. A document row with no
  presence should still exist in query results.
- Presence must not participate in durable referential-integrity constraints.
  It can be validated and filtered, but not required for document validity.
- Presence adapters should be allowed to expire rows, drop invalid peer states,
  and expose validation diagnostics.

This implies Tarstate likely needs an optional relation operator before presence
can feel seamless:

- `leftJoin` / `optionalJoin`
- nullable projected fields
- query metadata that can distinguish "missing relation row" from "invalid
  source data"

Without that, an inner join from document state to presence would accidentally
hide real document rows whenever nobody is present.

#### Focus As Attention Mark

Probability's `FocusOp` should be treated as an attention/mark operation, not
only as UI selection.

Current shape:

```ts
type FocusOp = {
  action: 'focus'
  path: AnchoredPath
}
```

This was added because Automerge-like `put` and `move` operations do not express
"this peer is paying attention to this object". In Probability that means
selection/focus, but the more general semantic is a user marking attention on a
particular object or subpath.

Design stance:

- `focus` is ephemeral when carried through presence.
- The same semantic may deserve a durable form later: "user marked / attended to
  object X", with optional label, client, timestamp, and reason metadata.
- This is analogous to Automerge text marks in spirit, but it marks object/path
  attention rather than a character range.
- If Automerge grows a general object/path mark, focus should map to that
  instead of staying a Probability-only presence convention.
- Until then, Patchpit/Tarstate should model it as an app/platform operation
  that can be projected into queryable presence rows.

Open naming:

- `focus` is good for live attention and selection.
- `mark` is better for durable recorded attention.
- `attention` may be the most semantically precise relation name if both live
  and durable forms exist.

#### Anchored Paths

Probability changed the pointer shape from an Automerge-style path to an
anchored path:

```ts
type AnchoredPath = [objectId: string, ...pathWithinObject: Prop[]]
```

This is an important invariant. Plain document paths are not stable enough for
presence, because the object a user is dragging/focusing can move while presence
messages are in flight. Anchoring by Automerge object ID makes the operation
follow the object, while the rest of the path points inside it.

Current caveat:

- Reparenting in Probability currently clone-and-deletes objects, which changes
  Automerge object IDs.
- Probability tracks those changes through `__automergeMoves` so presence
  anchors and selections can be remapped.
- This is temporary compatibility machinery, not a desired long-term primitive.

Future desired shape:

- Native Automerge move should preserve object identity across reparenting.
- Once that exists, `__automergeMoves` and `objectIdToPath` should disappear
  from app-level semantics.
- Subdocuments do not appear to solve this by themselves unless the identity
  being focused remains stable with the moved object and remains addressable
  from query/presence relations.

Tarstate implication:

Queryable presence should keep both levels:

- stable object identity for joins
- relative path within that object for precise fields/subobjects

Do not collapse this back to plain paths in the Tarstate-facing API.

### Bad Data Boundary

Patchpit v2 should assume some data is malformed.

Bad data classes:

- invalid document schema
- valid document schema but invalid app state
- missing linked documents
- stale Automerge URLs or unavailable HTTPS refs
- invalid presence state from a peer
- relation rows with missing keys or wrong field types
- adapter/runtime errors while loading a source

The policy should be layered:

- Source adapters validate incoming documents/presence against the schema they
  know.
- Invalid durable app documents should become explicit load/error state, not
  silently filtered into partial truth.
- Invalid ephemeral presence can usually be dropped or quarantined with a
  diagnostic, because absence is expected.
- Tarstate core should not know every app schema, but it should have a way to
  carry source diagnostics alongside query results.
- Commands/writes should validate before commit when a schema is available.
- Relic-like constraints are future relational invariants, not a replacement for
  parsing and schema validation at the edge.

Possible future result shape:

```ts
type QueryResult<T> = {
  rows: readonly T[]
  diagnostics: readonly SourceDiagnostic[]
}
```

Do not add this shape until needed, but avoid APIs that make it impossible. A
bare `Promise<Row[]>` is simple today; if it becomes the only public contract, it
will be harder to expose invalid docs, invalid presence, and partial source
failure later without breaking consumers.

## What Tarstate Does Not Currently Claim

These are not criticisms by themselves. They are useful guardrails for the v2
review.

- It does not currently claim to be a database.
- It does not currently claim incremental materialized views.
- It does not currently claim watched query deltas.
- It does not currently claim relational constraints.
- It does not currently claim durable indexes beyond `RelationSource.lookup`.
- It does not currently claim a storage adapter matrix.
- It does not currently claim app schema migration.
- It does not currently claim security, authorization, or write permissions.
- It does not currently claim to be the only way app state can be mutated.

If v2 wants any of those claims, the API needs additional proof obligations.

## Relic Argument

Relic is the strongest research anchor for asking what a serious "Out of the
Tar Pit" relational state layer looks like:

https://github.com/wotbrew/relic

Useful pressure from Relic:

- queries are data
- relations are normalized
- query results can be materialized
- materialized views are incrementally maintained
- watched queries can return added/deleted rows after a transaction
- constraints are relational queries
- indexes exist both internally and as direct tuning tools
- aggregate invalidation is a first-class performance problem

How to use this argument:

Do not say "Tarstate must become Relic." Say:

If Tarstate wants to be the central reactive relational state layer for Patchpit,
then it needs a Relic-shaped answer for materialization, change tracking,
constraints, indexes, and correctness/performance tests.

If Tarstate wants to stay small, then it should explicitly reject those claims
for v2 and remain a query/write algebra over adapter-provided sources.

## Chet Corcos Tuple Database Argument

Chet Corcos' tuple database is the stronger practical local-first app-state
anchor:

https://github.com/ccorcos/tuple-database

Useful pressure from tuple-database:

- app-owned schemas
- reactive queries
- direct tuple indexes
- transaction composition
- sync and async storage adapters
- benchmarkable storage choices
- local-first embedded database ergonomics

How to use this argument:

Do not say "Tarstate must become tuple-database." Say:

If Tarstate is supposed to support real app-owned state documents, it needs a
position on schema ownership, transactions, adapter shape, direct indexes, and
benchmarks against realistic Patchpit and Probability workflows.

This aligns with the current Patchpit v2 direction: apps own their own state,
while other apps can read through explicit document/query APIs.

## Other Research Arguments

Substrait is a weak but useful reminder that query plans can become portable
data. Patchpit should not adopt a standards-shaped plan format unless Tarstate
outgrows its current small algebra.

Tau.alpha is not a relational model reference for this review. Its value is the
browser performance warning: if Tarstate evaluation moves to workers, then
serialization, `postMessage`, SharedArrayBuffer, append-only logs, and structural
diffs become real design costs.

Ink & Switch work supports the product direction more than the API shape:
documents should remain inspectable, app state should be malleable, and schema
compatibility is a product problem rather than a parser detail.

## Critique Questions

### Identity

- Is Tarstate a small relational algebra, a reactive database, or a tuple/index
  substrate?
- Which one does Patchpit v2 actually need for the first stub?
- Which one can be delayed without blocking app shortcuts, app state documents,
  and state inspection?

### API Understanding

- Can the API be explained in one real app example without hidden context?
- Are `defineSchema`, `relation`, and the placeholder scalar functions the right
  way to express schema, or just a TypeScript trick that needs a clearer guide?
- Should query objects be opaque builders, serializable data, or both?
- Should `evaluateMany` share work between queries, or is it only a batch
  convenience today?

### Reactivity

- Should Tarstate own query subscriptions?
- If yes, does it return full result sets, added/deleted row deltas, or changed
  relation ranges?
- If no, which adapter owns invalidation?
- What is the minimum invalidation model for Patchpit v2: whole document,
  relation, indexed lookup, Automerge object path, or watched query?
- How should ephemeral relation updates such as presence participate in
  reactivity without forcing durable document queries to re-run too broadly?

### Writes And Validation

- Should Tarstate writes become the only app mutation path?
- Should commands be app-owned and exported by apps?
- Where do unique, foreign-key, required-field, and check constraints live?
- Does host/app validation happen before Tarstate writes, inside Tarstate, or in
  Automerge adapters?
- What is the error contract for invalid durable docs, invalid app state,
  missing linked docs, and invalid peer presence?
- Should query results eventually carry diagnostics, or should adapters expose
  diagnostics through a separate channel?

### Presence

- Should presence be represented as ordinary relation rows from an ephemeral
  source?
- What are the stable keys: document URL, peer ID, client, op kind, object ID,
  anchored path, timestamp/clock, or all of these?
- Does seamless presence access require `leftJoin` / `optionalJoin` before v2?
- How does a query distinguish no peer presence from invalid peer presence?
- Are presence operations literal previews of future document writes, or can apps
  define unrelated ephemeral state too?
- Which presence data should be globally typed by Patchpit, and which should be
  app/plugin-namespaced?
- Is `focus` the right name for live attention, and is `mark` or `attention` the
  right name for durable recorded attention?
- Should durable attention be a normal document relation, an Automerge
  object/path mark if the core grows one, or an app/plugin-owned annotation
  schema?
- Should all presence object references use anchored paths
  `[objectId, ...pathWithinObject]`, even when a plain path is currently
  available?
- What proof lets Patchpit delete `__automergeMoves` once Automerge gains native
  move support?

### Indexing And Performance

- Is `RelationSource.lookup` enough for v2?
- Should Tarstate expose direct indexes or keep indexes entirely adapter-owned?
- What are the first real benchmark workloads: filesystem tree, app shortcut
  registry, plugin/app state lookup, scene/material lookup, asset manifests, or
  cross-app control state?
- Should Tarstate benchmark incremental updates, or only full evaluation for now?

### Package Boundaries

- Should `tarstate-automerge` split non-React Automerge source/write code from
  React hooks?
- Should `tarstate-links` remain independent, or become a document graph package?
- Should app-specific schemas live with apps, with Tarstate only supplying the
  expression language?

## Current V2 Bias

For the first Patchpit v2 stub, the conservative position is:

- Keep Tarstate as a library, not an OS primitive.
- Treat core Tarstate as storage-agnostic query/write algebra.
- Keep Automerge, React, and link traversal as adapters.
- Keep the API Relic-compatible even while the implementation remains small.
- Do not claim Relic-style reactivity until there is materialization/change
  tracking proof, but avoid public shapes that would block it.
- Do not claim tuple-database-style storage until there is an adapter/index
  benchmark matrix, but keep adapter capabilities extensible.
- Require one understandable API guide and one real Patchpit app example before
  elevating Tarstate to a central contract.

That still leaves room for Tarstate to grow. It just prevents v2 from building
on a claim the API has not earned yet.

## Minimum Next Artifacts

- A small `docs/tarstate-api.md` user-facing guide, written around one app.
- A package-boundary/import test proving core Tarstate has no Automerge or React
  dependency.
- A benchmark that uses a real Patchpit/Probability-shaped document graph.
- A decision note: "Tarstate v2 posture: small algebra, reactive DB, or
  tuple/index substrate."
