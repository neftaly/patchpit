# Royal Flex Typography Demo Prototype

This is a patchpit research note and prototype lane. It should stay here until
Royal and Tarstate APIs are stabilized in their future shipping repos.

Implemented prototype:

- `apps/chargrid-lab/src/flexTypographyPrototype.ts`
- `apps/chargrid-lab/src/flexTypographyPrototype.test.ts`

## Why This Is Not A Royal Example Page Yet

The current Royal renderer stack has enough scene data for meshes, glTF,
lights, cameras, and legacy vector text rectangles. It does not yet have the
data contracts needed for a real flexbox typography demo:

- no renderer-core flex container/item model in pixel or point units
- no shaped glyph run node carrying glyph IDs, clusters, advances, offsets, and
  feature applications
- no line box model for paragraph text
- no backend text lane for SDF/MSDF atlas text or Loop-Blinn-style curve text
- no adapter contract that says React/Solid/vanilla receive shaped runs rather
  than raw strings

The char/cell grid UI should stay in patchpit lab. This prototype is explicitly
non-grid: every flex box uses `space: "px"` and floating pixel dimensions.

## Primary Anchors

- W3C CSS Flexible Box Layout Module Level 1: flex containers/items, main and
  cross axes, wrapping, flex grow/shrink/basis.
  https://www.w3.org/TR/css-flexbox-1/
- Knuth and Plass, "Breaking Paragraphs into Lines": paragraph line breaking
  as boxes, glue, penalties, and badness minimization.
  https://doi.org/10.1002/spe.4380111102
- Unicode Standard Annex #14, Unicode Line Breaking Algorithm: line break
  opportunities by character class.
  https://www.unicode.org/reports/tr14/
- OpenType GSUB/GPOS and HarfBuzz shaping concepts: glyph substitution,
  positioning, kerning, and ligatures belong in shaping, not in framework
  adapters.
  https://learn.microsoft.com/en-us/typography/opentype/spec/gsub
  https://learn.microsoft.com/en-us/typography/opentype/spec/gpos
  https://harfbuzz.github.io/
- Loop and Blinn 2005, plus SDF/MSDF text rendering work: high-quality scalable
  text should be a renderer/backend lane, not DOM text measurement.
  https://www.microsoft.com/en-us/research/wp-content/uploads/2005/01/p1000-loop.pdf
  https://github.com/Chlumsky/msdfgen

## Prototype Shape

The prototype has three separable contracts.

1. Tiny flex layout subset:
   - `row` and `column`
   - `wrap` and `nowrap`
   - `gap`, `rowGap`, `columnGap`
   - `flexGrow`, `flexShrink`, `flexBasis`
   - simple `start` and `stretch` cross-axis behavior

2. Shaped glyph run:
   - `glyphId`
   - source clusters
   - base advance
   - pair adjustment
   - x/y offsets
   - applied `liga` and `kern` feature records

3. Paragraph line breaking:
   - UAX-style break opportunities for spaces, hyphens, break-after
     punctuation, newlines, and paragraph end
   - explicit paragraph atoms: `box`, `glue`, and `penalty`
   - dynamic-programming badness minimization over candidate breaks

The shaper is fake but contract-shaped. It demonstrates where GSUB ligatures
and GPOS kerning pair adjustments live. It does not parse font files or run
HarfBuzz.

## Yoga Decision

Yoga is still a good target. The user direction is that Yoga is liked but may
be too large for the first shipping Royal lane; shipping with WASM Yoga remains
acceptable if the TypeScript subset grows too large.

Use the tiny TypeScript flex subset when Royal demos need only:

- row, column, wrap, gap
- flex grow/shrink/basis
- measured fixed content sizes
- simple start/stretch alignment
- deterministic API pressure tests

Use WASM Yoga when the demo or product needs:

- min/max size behavior
- percentage resolution
- absolute positioning
- aspect ratios
- baseline alignment
- custom measure functions
- production parity with Yoga's edge cases
- text measurement participating directly in layout

The test `matches Yoga on the deliberate tiny flex subset used as a correctness
target` compares the TypeScript subset against Yoga for grow/basis/gap. That is
a guardrail, not a promise to clone Yoga.

## Recommended API Change

Add two renderer-core level contracts before wiring a Royal example page:

```ts
type RoyalFlexContainerNode = {
  kind: 'FlexContainer';
  style: {
    flexDirection: 'row' | 'column';
    flexWrap: 'nowrap' | 'wrap';
    gap?: number;
  };
  children: readonly RoyalFlexItemNode[];
};

type RoyalShapedTextNode = {
  kind: 'ShapedText';
  lines: readonly {
    glyphs: readonly {
      glyphId: string;
      clusterStart: number;
      clusterEnd: number;
      xOffset: number;
      yOffset: number;
      xAdvance: number;
      features: readonly string[];
    }[];
  }[];
};
```

Keep framework adapters out of glyph shaping. A React adapter can own lifecycle
and event normalization, but HarfBuzz/OpenType feature application belongs in a
text shaping service. Renderer backends should receive shaped glyph runs and
choose SDF/MSDF atlas or curve rendering based on capability rows.

## Current Limitations

- Flex subset intentionally omits percentages, min/max sizes, baseline
  alignment, absolute positioning, aspect ratios, order, margin, padding, and
  custom measure functions.
- The line breaker is Knuth-Plass-like, not a full TeX implementation.
- UAX #14 support is a small opportunity detector, not the full Unicode line
  breaking algorithm.
- The font is simulated; metrics, ligatures, and kerning pairs are hand-authored
  proof data.
- No actual Royal renderer backend draws these shaped runs yet.
