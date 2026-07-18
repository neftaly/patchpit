# Testing and review ratchet

## T1. Evidence layers

Behavior examples explain a small number of named product rules. Fuzz
properties generate operation sequences and assert invariants across the whole
functional core. Integration cases own external lifecycles such as Automerge
Repo, attachments, linked sources, and service-worker mounts. Browser cases own
rendering, pointer and keyboard modality, focus across frames, visible geometry,
and teardown.

Legacy examples are tripwires, not a template for adding one unit test per
branch. New deterministic combinations belong in an existing fuzz model when
they share its state and invariants. Separate fuzz properties should be merged
when they generate the same model and differ only in assertions. A browser
regression belongs in browser evidence when DOM event ordering, hit geometry,
focus, capture, or nested frames are part of the behavior.

## T2. Behavior review matrix

Every interactive surface is reviewed across:

1. pointer, touch, native keyboard activation, and focus;
2. selected, unselected, preview, pinned, moved, and closed context state;
3. ordinary host content, sandbox content, and nested same-origin frames;
4. start, movement, commit, cancellation, capture loss, and unmount where an
   interaction has phases;
5. visible affordance versus actual hit area;
6. local intent versus durable write, source authority, and failure receipt.

The matrix guides review; it is not duplicated into exhaustive example tests.

## T3. Code-quality passes

The holistic ratchet checks state ownership, functional-core boundaries,
idiomatic React, impossible state combinations, self-documenting names,
declarative collection transforms, accessibility, Tarstate boundary leakage,
unnecessary abstractions, and code that can be deleted. A pass adds a ratchet
only when it protects a real invariant without creating a second source of
truth or a source-line budget.

## T4. Commands

Use `pnpm typecheck` and `pnpm lint` for the fast static loop. `pnpm
test:behavior`, `pnpm test:fuzz`, and `pnpm test:integration` run individual
evidence layers; `pnpm test` runs all Node layers. `pnpm test:dev` and `pnpm
test:preview` run browser behavior against development and production builds.
