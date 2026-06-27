# Royal Text Pipeline Prototype

This is a prototype direction, not a production rendering change. The current
Royal chargrid path still uses `VectorText` with built-in lowercase vector
patterns. The prototype in `apps/chargrid-lab/src/fontPipelinePrototype.ts`
keeps that path intact and models the seams needed for real font-backed text.

## Native Pipeline Reference

Verified Apple references:

- Text Programming Guide for iOS: Text Kit sits under UIKit text views and
  provides typographic services such as glyph generation, line breaking,
  kerning, ligatures, and justification.
  https://developer.apple.com/library/archive/documentation/StringsTextFonts/Conceptual/TextAndWebiPhoneOS/Introduction/Introduction.html
- Core Text Programming Guide: Core Text is the lower-level layout/font layer
  between higher-level text systems and Quartz/Core Graphics. Its hierarchy is
  attributed string -> framesetter/typesetter -> frame -> line -> glyph run.
  Glyph runs share attributes and direction; font objects expose metrics,
  character-to-glyph mapping, glyph bounds, and advances. Font cascading is the
  native fallback concept.
  https://developer.apple.com/library/archive/documentation/StringsTextFonts/Conceptual/CoreText_Programming/Overview/Overview.html
- Apple TrueType Reference: `hmtx` stores horizontal advance widths and left
  side bearings; `glyf` stores glyph outline contour data, bounding boxes, and
  simple/compound glyph descriptions.
  https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6hmtx.html
  https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6glyf.html
- Modern Core Text references for APIs such as `CTLineGetGlyphRuns`,
  `CTRunGetPositions`, and `CTFontCreatePathForGlyph` were reachable but render
  their detailed content through JavaScript in this browsing environment.

The UIKit/Core Text shape to mirror is:

1. Select a font face from a descriptor.
2. Shape text into glyph IDs, clusters, advances, metrics, and fallback runs.
3. Break shaped glyphs into lines and glyph runs.
4. Extract vector outlines or choose a raster/bitmap path.
5. Tessellate/stroke outlines or rasterize/upload an atlas.
6. Keep diagnostics at every boundary: missing glyphs, fallback hits, overflow,
   unavailable outlines, and cache misses.

## Royal Mapping

Royal should keep grid cells as layout anchors. A cell is not a font pixel grid.
Glyph pixels and curves inside the anchored region can be arbitrary.

- Text layout/shaping: `TextShaper` converts a string plus `FontFaceSpec` into
  `ShapedGlyph` entries with glyph IDs, clusters, advances, and diagnostics.
- Glyph outline extraction: `GlyphOutlineProvider` returns vector data for a
  shaped glyph. The prototype uses existing `VectorText` rectangles as simulated
  outlines; production would read real font outlines.
- Vector tessellation/strokes: a later renderer stage should convert outlines to
  triangles, SDFs, or strokes. This is deliberately not mixed into shaping.
- Atlas/raster fallback: the prototype explicitly disables raster fallback.
  Production can add a separate atlas stage, but fallback use should be visible
  in diagnostics and render rows.
- Grid anchoring: `GridTextAnchor` fixes the run box in chargrid columns/rows.
  Mono and proportional runs can share the same anchor.
- Proportional advances: glyph centers are computed from font advances inside
  the anchored run. A non-mono face can move glyph centers while preserving the
  same grid run and per-cluster grid cells.
- Diagnostics: unsupported glyphs, missing outlines, and anchor overflow are
  row-shaped data that can move into Royal/Tarstate diagnostics later.

## Prototype State

Implemented:

- `FontFaceSpec`, `FontMetrics`, `GlyphMetric`, `GlyphRun`, `ShapedGlyph`,
  `GridTextAnchor`, diagnostics, `TextShaper`, `GlyphOutlineProvider`, and
  `TextLayoutEngine` types.
- Atkinson Hyperlegible Mono-like simulated metrics with fixed one-cell
  advances.
- A proportional proof face with representative lowercase advance widths.
- A no-dependency outline provider using the current simple `VectorText`
  geometry as vector-outline stand-in data.
- Tests proving that `mimi` keeps the same grid anchor in mono and proportional
  runs while proportional glyph centers and advances differ.
- Tests proving raster fallback is not used and unsupported glyphs produce
  explicit diagnostics.

Simulated:

- The Atkinson metrics are representative values, not parsed from a font file.
- The proportional face is a proof variant, not a verified Atkinson font file.
- Shaping is simple Unicode code point iteration. It does not perform HarfBuzz,
  Core Text, OpenType features, ligatures, bidi, combining marks, or script
  fallback.
- Outlines are rectangle contours derived from the current vector glyph renderer,
  not real quadratic/cubic font curves.

## Production Direction

Next production dependency to evaluate:

- Add a real shaping and font parser path behind the same seams. Good candidates
  are a WASM HarfBuzz shaper plus an OpenType parser, or a browser-native
  `FontFace`/canvas measurement bridge only for early metrics validation. The
  production choice should support Atkinson Hyperlegible Mono font files,
  fallback runs, glyph IDs, advances, glyph bounds, and outline extraction.

Next benchmark:

- Shape and outline-cache 1k, 10k, and 50k short Royal labels with mixed mono
  and proportional faces. Measure shaping time, outline extraction/cache hit
  rate, tessellation or atlas upload cost, GPU draw calls, diagnostics emitted,
  and whether anchored grid boxes remain stable under face changes.

The key contract to keep: Royal grid layout owns boxes; font layout owns glyph
positions inside those boxes.
