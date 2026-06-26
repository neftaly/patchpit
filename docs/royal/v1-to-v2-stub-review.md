# V1 To V2 Stub Review

This document is the source of truth for the review process used to move from a
working v1 system to a fresh v2 stub. It is a method note, not a chat log and
not a project history.

Use the old system and the review session as evidence only when they produce an
invariant, an anti-invariant, a proof obligation, a required workflow, or a
deletion decision.

## Review Narrative

The Royal review did not start as a clean architecture exercise. It moved
through three modes:

1. Stabilize the v1 understanding.
2. Extract the v2 constraints.
3. Attack the fresh scaffold until only necessary structure remained.

The important move was the branch point. Once `main` was moved forward from the
v1 line, the question stopped being "how do we preserve the existing renderer?"
and became "what must exist for a fresh renderer v2 stub to count as Royal?"

After that point, the docs stopped being explanatory notes and became gates.
Research could churn or disappear. Implementation could be rewritten. Config
could be removed. But architecture claims had to survive by becoming one of:

- an invariant in the target architecture
- an explicit exclusion from scope
- a proof gate in tests, benchmarks, import checks, or workflow checks
- a named acceptance scenario
- a deletion or simplification decision

That is the process to reuse.

## What The Review Was Doing

### Freezing Product Shape Without Freezing Implementation

The renderer v2 architecture doc captured the shape of Royal: a light, fast
renderer for primitives, glTF, streamed scene data, and XR, with
`react-regl-fiber` as the branded React surface and a renderer core that does
not depend on React.

That doc did not say "copy v1". It said which constraints define the next
renderer:

- stable handles cross the hot path
- render planning uses retained workspaces
- feature wiring resolves at construction
- absent modules have no hot-path work
- poses are separate from assets
- high-frequency updates bypass React reconciliation
- scene patches have lanes
- transforms are columnar transport
- backends own GPU resources and frame scheduling
- XR is a backend from the start

This is the first review move: convert what feels important into constraints
that can reject future implementation.

### Turning Compatibility Into Parity Gates

The review kept some v1 surfaces as compatibility anchors: `createRoot`,
intrinsic JSX scene elements, primitive examples, declarative `<gltf src />`,
primitive helpers, plain geometry/material objects, and camera-control interop.

But those were not kept as nostalgia. They became parity gates. A v2
replacement for a kept surface needs a named scenario, metric, and allowed
regression budget, or an explicit reason that v1 is the wrong baseline.

This is the second review move: kept capability is not a promise to keep code.
It is a promise to define acceptance.

### Filtering Research Into Proof

The Donnybrook/MMOFPS work was useful because it forced a distinction between
research assumptions and renderer obligations. Dynamic actor replication,
attention sets, P2P3V, authority, persistence, and transport strategy should
not leak into renderer core just because they are adjacent to world streaming.

The review pattern was:

- name the assumption
- decide whether it belongs to renderer, transport, interest policy, or app
  runtime
- keep only renderer-facing obligations in the renderer architecture
- move broader assumptions into research or future app/runtime scope
- add proof scenes or import checks for the boundary

This is the third review move: research is allowed to be broad, but v2 docs must
filter it into narrow obligations.

### Treating The Scaffold As Disposable

After the first v2 scaffold landed, the review became intentionally aggressive:

- read-only decomplection review before edits
- stale v1 assumption search
- package boundary leak search
- workflow and security config review
- "do we need this guardrail?" review
- "can this config be shared?" review
- "is this script ceremony?" review
- "should this research doc churn out?" review

This matters because the v2 stub is not a miniature product. It is a proof
frame. Anything that does not help prove the next architecture should be
removed, folded, or left as research outside the core scaffold.

This is the fourth review move: a fresh v2 stub should be smaller after review,
not larger.

### Reviewing The Smallest Reasonable Artifact

The later review work was not another broad architecture pass. It was code
review against the smallest artifact that could honestly carry a v2 claim: a
fresh scaffold, one package-boundary test, one script, one shared config choice,
one package export, or one narrow doc section.

That artifact was treated as a proxy for the architecture. The review question
was not "is v2 done?" It was "does this small artifact express the right v2
shape without importing unnecessary baggage?"

The review pattern was:

- identify the smallest artifact that claims to represent the v2 direction
- name the claim the artifact is making
- ask what invariant, anti-invariant, or proof gate it protects
- delete or fold anything that is only ceremony
- prefer shared/simple configuration until a separate config is necessary
- keep tests only when they prove a boundary the architecture actually needs
- make the artifact smaller and clearer before adding supporting machinery

This is the fifth review move: use ordinary code review as pressure on the v2
idea. A tiny artifact can reveal whether the architecture has actually landed.

### Separating Guardrails From Ceremony

The review did not reject tests or scripts by default. It asked what each one
proved.

Good guardrails:

- package/import boundary tests for core independence
- workflow security checks that fail loudly
- source-map/build checks that protect deployment
- hardware WebGL paths for renderer tests that actually need GPU truth
- claims tooling when multiple agents are editing shared files

Suspicious ceremony:

- broad forbidden-word tests without a concrete boundary
- duplicated package configs that can be shared
- research documents treated as permanent docs
- feature names wired into core before the module exists
- scripts that are only coordination residue

This is the sixth review move: keep guardrails that protect an invariant; prune
guardrails that only decorate the process.

### Capping The Scaffold

The final Royal setup pass was about stopping v2 base from becoming a context
sponge. Once the scaffold built, tested, and expressed the package direction,
the review shifted from "what else should we add?" to "what should not be given
a lane yet?"

The useful moves were:

- remove experimental feature lanes from the active scaffold
- put context at the level where it is consumed
- keep the root README as orientation, not project memory
- move package-use context into package docs
- keep future shape in architecture docs, not in current API docs
- replace custom scaffold code with a standard tool when the standard tool
  carries the claim with less local machinery
- treat warnings as review signal, not background noise
- fix warning root causes when the fix is obvious; otherwise flag the warning
  for review instead of suppressing it
- stop polishing when the next change would only make the base look more
  complete without proving a new claim

This is the seventh review move: v2 setup is done when the smallest base can
carry the next real implementation slice without attracting speculative
features, noisy diagnostics, or extra explanatory context.

## Process Rubric

Use this sequence when reviewing a v2 stub.

### 1. Name The Larger Thing

Start with the product boundary, not the package list.

For Royal, the larger thing is the renderer and scene-source pipeline.
`react-regl-fiber` is the branded React surface. Renderer core must remain
usable without React.

Output:

- product purpose
- named surfaces
- non-goals
- ownership boundaries

### 2. Convert History Into Claims

Review v1, commits, chats, and research only to extract:

- invariant
- anti-invariant
- proof obligation
- required workflow
- explicit deletion
- open question

Anything else stays out of the v2 source of truth.

### 3. Split Architecture From Proof

Architecture states what must be true.
The proof plan states how the claim becomes executable.

Do not let architecture become a backlog, and do not let tests invent
architecture.

### 4. Classify Every Assumption

For each assumption, ask:

- Does this define the product?
- Does this belong to core, adapter, app, runtime, transport, or research?
- Is it testable now?
- If not testable, should it be a skipped acceptance target, a research note,
  or deleted?
- What would make it false?

### 5. Make The Stub Minimal

After creating the scaffold, run review passes that try to delete things:

- package config
- root scripts
- workflow checks
- generated files
- research docs
- placeholder tests
- names imported too early
- compatibility aliases

Keep only what proves the next slice or prevents known bad coupling.

### 6. Code Review The Smallest Artifact

Do not wait for a full v2 implementation before reviewing architecture. Pick
the smallest artifact that claims to express the direction and review it hard.

For that artifact, ask:

- What v2 claim does this make?
- What would this artifact look like if the claim were false?
- Is this proof, ceremony, compatibility, or implementation habit?
- Can it be deleted, folded, shared, or made narrower?
- Does it make the next artifact easier to review?

The artifact passes review when it makes one claim clearly and carries no extra
structure that future work must explain.

Place the artifact at the ownership level of the claim. Do not hide repo-wide
proof inside a package-local test just because the first example involves that
package.

### 7. Put Context Where It Is Consumed

Context has an ownership boundary too:

- root docs orient
- package docs explain package use
- architecture docs hold future shape
- proof docs explain how claims are tested
- process docs explain review method

Do not move context upward just because it is generally useful. The root should
not become the memory of the whole review.

Do not advertise an API as usable until the smallest backing artifact exists.
Keep target-shape examples in architecture docs until they are executable or
explicitly marked as target shape.

### 8. Prefer Active Proof Over Aspirational Notes

Use `test.todo` only for named future API obligations.
Use `test.skip` only when a concrete fixture or proof scene exists but support
is intentionally absent.
Prefer active import, package, workflow, and unit checks whenever possible.

### 9. Review Guardrails The Same Way As Code

Ask whether each guardrail has a failure mode worth protecting.

If a guardrail cannot explain what architectural claim it protects, delete or
fold it.

### 10. Treat Diagnostics As Review Input

Warnings and noisy diagnostics can bloat review context. Do not normalize that
noise into the repo.

During ordinary development, avoid long detours for warning cleanup. During a
specific v2 review pass:

- fix obvious root causes
- fail on warnings that protect an invariant
- flag warnings that require judgment
- do not suppress warnings just to make output quiet
- remove experimental runtime/tooling flags when a stable tool version can do
  the same job

The goal is not silence. The goal is that important diagnostics remain visible.

## Maintaining This Document

This document should change when the review process changes, not whenever a
review conversation produces more detail.

Use chat logs, commits, and agent summaries as evidence. Do not preserve them as
material unless they expose a reusable review move.

High-signal updates:

- a user correction that changes the rubric
- a new category of invariant, anti-invariant, or proof gate
- a repeated failure mode in how agents turn research into docs
- a clearer deletion rule for v2 scaffold work
- a repo-ownership or document-location rule
- a context-ownership rule
- a diagnostics rule that changes review behavior
- a distinction that prevents the next review from confusing product, package,
  scaffold, research, or implementation history

Low-signal updates:

- chronological summaries
- resolved coordination notes
- lists of commits without a process implication
- broad research detail that has not become a proof obligation
- implementation steps that belong in the project being reviewed

The recent curation loop added one important rule: ownership and freshness of
the process doc matter as much as content. The source-of-truth process doc lives
with the project that produced the reusable method. Project-specific v2 notes
should consume this rubric, not become the place where the rubric is rewritten.

When updating this document after a review session, make the smallest delta that
captures the new method:

- add a rule if future reviews should behave differently
- refine a category if the old category caused confusion
- add a narrative only when it explains a reusable move
- delete or compress text once it starts describing events instead of decisions

Stop curating when the doc starts becoming a transcript.

## Output Shape

A mature v2 stub review should leave:

- one short target architecture doc
- one proof and benchmark matrix
- a minimal scaffold that builds
- active tests for boundaries already expressible
- todo/skip tests only for named future obligations
- scripts that fail loudly and justify their existence
- context placed at the level where it is consumed
- diagnostics that are either fixed, failed, or intentionally visible for
  review
- research notes that are allowed to churn independently

It should not leave a transcript, a general essay, or a pile of coordination
notes that the implementation must carry forever.
