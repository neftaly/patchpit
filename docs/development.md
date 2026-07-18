# Development approach

## D1. Start with behavior

First ask whether the proposed feature is necessary, already derivable, or a
composition of existing behavior. For behavior that remains, describe the
user-visible rule and adversarial edges before choosing a mechanism. Include
identity, input modalities, failure, cancellation, concurrency, and
accessibility where they can change the result. The behavior contract may lead
implementation within one active change, but both land together. Keep
`behavior.md` about the current product, not implementation history.

## D2. Assign ownership

Choose canonical storage, Tarstate relational machinery, or Patchpit runtime
semantics as the owner of every new fact. Cross a boundary through a projection,
canonical writer, or explicit source. Do not mirror state for convenience.
Derived values remain projections rather than additional owned facts.

Prefer declarative schemas, mappings, constraints, queries, and semantic
operations when they express the rule directly. Keep temporal browser protocols
local unless they are durable product facts. An abstraction must delete,
contain, or make impossible real complexity; renaming the same complexity is
not decomposition.

## D3. Handle upstream gaps

Use released Tarstate capabilities as black boxes. When a missing capability is
generic, propose it in the Tarstate repository with:

1. the consumer-independent semantic contract;
2. ownership and lifecycle boundaries;
3. failure, readiness, authority, and distributed semantics;
4. executable acceptance evidence; and
5. the Patchpit machinery it would remove.

Do not design the proposal around Patchpit's object shapes. Do not add a local
substitute for a hypothetical API. Pause dependent work when the capability is
required. A temporary adapter around an existing released boundary is
acceptable only when it is small, explicit, behavior-preserving, and easy to
delete after a better upstream release. Remove resolved proposal documents once
their remaining guidance is represented by code or current documentation.

## D4. Attack the roadmap vertically

The roadmap contains future outcomes only. Select work by product evidence,
dependency removal, and uncertainty reduced rather than item number. Implement
the smallest end-to-end slice that demonstrates the behavior through canonical
storage, Tarstate, runtime, and UI. A real use case precedes generalized
framework machinery.

Each goal needs executable acceptance evidence. Remove completed behavior from
the roadmap instead of retaining a delivery ledger. Defer work whose semantic
owner or required upstream capability is unresolved.

## D5. Review and prove

Adversarially review every slice against the behavior matrix, state ownership,
CRDT convergence, source atomicity, authority, bounded work, accessibility, and
cleanup. Schema, mapping, constraint, and capability evolution remains exact;
migrations are explicit operations rather than incidental reads. Compatible
writes preserve unknown foreign fields. Put evidence at the layer that owns the
risk: fuzz the functional core, integrate storage and source lifecycles, and use
browsers for event ordering, focus, geometry, frames, and teardown.

Interoperability claims require fixtures produced or reopened by the external
implementation. Performance work requires a representative benchmark and
belongs primarily in Tarstate when it concerns relational machinery.

## D6. Finish by simplifying

Regenerate canonical artifacts, remove superseded adapters and duplicated
tests, update current-state documentation, and run the complete ratchet. Prefer
a smaller codebase when behavior and development experience remain clearer;
never reduce lines by hiding validation, evidence, or ownership.
