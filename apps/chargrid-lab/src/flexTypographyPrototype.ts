export type PrototypeUnitSpace = 'px';

export type TinyFlexDirection = 'column' | 'row';
export type TinyFlexWrap = 'nowrap' | 'wrap';
export type TinyFlexAlign = 'start' | 'stretch';

export type TinyFlexStyle = {
  readonly alignItems?: TinyFlexAlign;
  readonly columnGap?: number;
  readonly flexBasis?: number;
  readonly flexDirection?: TinyFlexDirection;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexWrap?: TinyFlexWrap;
  readonly gap?: number;
  readonly height?: number;
  readonly rowGap?: number;
  readonly width?: number;
};

export type TinyFlexNode = {
  readonly children?: readonly TinyFlexNode[];
  readonly id: string;
  readonly intrinsicSize?: {
    readonly height: number;
    readonly width: number;
  };
  readonly role?: string;
  readonly style?: TinyFlexStyle;
};

export type TinyFlexRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type TinyFlexBox = {
  readonly flexLine?: number;
  readonly id: string;
  readonly parentId?: string;
  readonly rect: TinyFlexRect;
  readonly role?: string;
  readonly space: PrototypeUnitSpace;
};

export type TinyFlexLayoutResult = {
  readonly boxes: readonly TinyFlexBox[];
  readonly diagnostics: readonly FlexTypographyDiagnostic[];
  readonly space: PrototypeUnitSpace;
};

export type FlexTypographyDiagnostic = {
  readonly code: 'line-overflow' | 'unsupported-flex-feature';
  readonly message: string;
  readonly severity: 'info' | 'warning';
};

export type PrototypeFontMetrics = {
  readonly ascent: number;
  readonly descent: number;
  readonly lineGap: number;
  readonly unitsPerEm: number;
};

export type PrototypeGlyphMetric = {
  readonly advanceUnits: number;
  readonly glyphId: string;
};

export type PrototypeKerningPair = {
  readonly adjustmentUnits: number;
  readonly leftGlyphId: string;
  readonly rightGlyphId: string;
};

export type PrototypeLigature = {
  readonly advanceUnits: number;
  readonly glyphId: string;
  readonly sequence: string;
};

export type PrototypeFontFace = {
  readonly family: string;
  readonly glyphs: Readonly<Record<string, PrototypeGlyphMetric>>;
  readonly kerningPairs: readonly PrototypeKerningPair[];
  readonly ligatures: readonly PrototypeLigature[];
  readonly metrics: PrototypeFontMetrics;
  readonly renderHint: 'sdf-msdf-or-loop-blinn';
};

export type PrototypeTextDirection = 'ltr';

export type OpenTypeFeatureApplication = {
  readonly adjustmentUnits?: number;
  readonly source:
    | 'GPOS PairPos prototype'
    | 'GSUB LigatureSubst prototype';
  readonly tag: 'kern' | 'liga';
};

export type ShapedGlyph = {
  readonly baseAdvancePx: number;
  readonly clusterEnd: number;
  readonly clusterStart: number;
  readonly features: readonly OpenTypeFeatureApplication[];
  readonly glyphId: string;
  readonly pairAdjustmentPx: number;
  readonly sourceText: string;
  readonly xAdvancePx: number;
  readonly xOffsetPx: number;
  readonly yOffsetPx: number;
};

export type ShapedGlyphRun = {
  readonly direction: PrototypeTextDirection;
  readonly fontFamily: string;
  readonly fontSizePx: number;
  readonly glyphs: readonly ShapedGlyph[];
  readonly shapingEngine: 'prototype-gsub-gpos-shaper';
  readonly sourceText: string;
  readonly totalAdvancePx: number;
};

export type PrototypeLineBreakClass = 'BA' | 'HY' | 'LF' | 'SP' | 'end';

export type PrototypeLineBreakOpportunity = {
  readonly afterCluster: number;
  readonly class: PrototypeLineBreakClass;
  readonly mandatory: boolean;
  readonly penalty: number;
};

export type ParagraphBreakAtom =
  | {
      readonly glyphIndex: number;
      readonly kind: 'box';
      readonly text: string;
      readonly widthPx: number;
    }
  | {
      readonly glyphIndex: number;
      readonly kind: 'glue';
      readonly shrinkPx: number;
      readonly stretchPx: number;
      readonly widthPx: number;
    }
  | {
      readonly breakAfterCluster: number;
      readonly breakAfterGlyphIndex: number;
      readonly kind: 'penalty';
      readonly penalty: number;
      readonly widthPx: number;
    };

export type PositionedLineGlyph = ShapedGlyph & {
  readonly lineXOffsetPx: number;
};

export type ParagraphLine = {
  readonly badness: number;
  readonly endGlyphIndex: number;
  readonly glyphs: readonly PositionedLineGlyph[];
  readonly remainingPx: number;
  readonly startGlyphIndex: number;
  readonly text: string;
  readonly widthPx: number;
};

export type ParagraphBreakResult = {
  readonly atoms: readonly ParagraphBreakAtom[];
  readonly lines: readonly ParagraphLine[];
  readonly opportunities: readonly PrototypeLineBreakOpportunity[];
  readonly totalBadness: number;
};

export type RendererApiPressure = {
  readonly id: string;
  readonly owner:
    | 'adapter'
    | 'layout-engine'
    | 'renderer-core'
    | 'tarstate-lens'
    | 'text-shaper';
  readonly recommendation: string;
};

export type LayoutDependencyDecision = {
  readonly useTinyTypeScriptSubsetWhen: readonly string[];
  readonly useWasmYogaWhen: readonly string[];
};

export type RoyalFlexTypographyDemo = {
  readonly apiPressure: readonly RendererApiPressure[];
  readonly boxes: readonly TinyFlexBox[];
  readonly layoutDecision: LayoutDependencyDecision;
  readonly textBlocks: readonly ParagraphBreakResult[];
  readonly tree: TinyFlexNode;
  readonly viewport: {
    readonly heightPx: number;
    readonly widthPx: number;
  };
};

type FlexItemMeasure = {
  readonly baseCross: number;
  readonly baseMain: number;
  readonly crossAuto: boolean;
  readonly flexGrow: number;
  readonly flexShrink: number;
  readonly node: TinyFlexNode;
};

type ResolvedFlexItem = FlexItemMeasure & {
  readonly mainSize: number;
};

type FlexBoxMetadata = {
  readonly flexLine?: number;
};

type BreakCandidate = {
  readonly glyphIndex: number;
  readonly opportunity: PrototypeLineBreakOpportunity;
};

// Anchors for this prototype: W3C CSS Flexbox main/cross axes, wrapping, and
// grow/shrink/basis; UAX #14 break opportunities; Knuth-Plass boxes/glue/
// penalties and badness; OpenType GSUB/GPOS shaping; SDF/MSDF or Loop-Blinn
// scalable glyph rendering. This file is a patchpit research lane, not a
// shipping Royal API.
export const royalFlexTypographyResearchAnchors = [
  'W3C CSS Flexible Box Layout Module Level 1',
  'Knuth and Plass, Breaking Paragraphs into Lines',
  'Unicode Standard Annex #14, Unicode Line Breaking Algorithm',
  'OpenType GSUB/GPOS and HarfBuzz shaping concepts',
  'Loop and Blinn 2005 or SDF/MSDF text rendering'
] as const;

export const royalProportionalDemoFont: PrototypeFontFace = {
  family: 'Royal Proportional Demo Sans',
  metrics: {
    ascent: 780,
    descent: -220,
    lineGap: 120,
    unitsPerEm: 1_000
  },
  glyphs: createDemoGlyphMetrics(),
  kerningPairs: [
    { leftGlyphId: 'A', rightGlyphId: 'V', adjustmentUnits: -90 },
    { leftGlyphId: 'A', rightGlyphId: 'W', adjustmentUnits: -70 },
    { leftGlyphId: 'T', rightGlyphId: 'A', adjustmentUnits: -70 },
    { leftGlyphId: 'T', rightGlyphId: 'o', adjustmentUnits: -80 },
    { leftGlyphId: 'V', rightGlyphId: 'A', adjustmentUnits: -80 },
    { leftGlyphId: 'W', rightGlyphId: 'a', adjustmentUnits: -55 },
    { leftGlyphId: 'Y', rightGlyphId: 'o', adjustmentUnits: -75 }
  ],
  ligatures: [
    { sequence: 'ffi', glyphId: 'f_f_i.liga', advanceUnits: 940 },
    { sequence: 'ff', glyphId: 'f_f.liga', advanceUnits: 650 },
    { sequence: 'fi', glyphId: 'f_i.liga', advanceUnits: 620 },
    { sequence: 'fl', glyphId: 'f_l.liga', advanceUnits: 620 }
  ],
  renderHint: 'sdf-msdf-or-loop-blinn'
};

export const royalFlexTypographyApiPressure: readonly RendererApiPressure[] = [
  {
    id: 'renderer-core:flex-node',
    owner: 'renderer-core',
    recommendation: 'Add pure flex container/item descriptors in pixel or point units; keep char/cell grid layout as a separate lab contract.'
  },
  {
    id: 'renderer-core:shaped-text-node',
    owner: 'renderer-core',
    recommendation: 'Accept shaped glyph runs with glyph IDs, clusters, advances, offsets, feature audit data, and line boxes instead of raw strings only.'
  },
  {
    id: 'text-shaper:owns-opentype',
    owner: 'text-shaper',
    recommendation: 'Keep HarfBuzz/OpenType GSUB and GPOS feature application in a shaper package; React, Solid, and renderer adapters should receive positioned glyph runs.'
  },
  {
    id: 'adapter:no-dom-text',
    owner: 'adapter',
    recommendation: 'Adapters should not measure DOM text as the source of truth. They should pass viewport and font handles into layout/shaping services and render returned glyph plans.'
  },
  {
    id: 'renderer-backend:scalable-text-lane',
    owner: 'renderer-core',
    recommendation: 'Expose a backend capability row for SDF/MSDF atlas text or Loop-Blinn-style curve rendering before promising high-quality proportional typography.'
  },
  {
    id: 'tarstate-lens:text-diagnostics',
    owner: 'tarstate-lens',
    recommendation: 'Store authoring text, style, shaped-run diagnostics, and layout boxes as rows; keep raw font bytes, HarfBuzz instances, atlases, and GPU resources outside Tarstate.'
  }
];

export const tinyFlexVsYogaDecision: LayoutDependencyDecision = {
  useTinyTypeScriptSubsetWhen: [
    'Royal demos need row, column, wrap, gap, grow, shrink, basis, and simple start/stretch alignment only.',
    'Layout inputs are already measured and do not need baseline, min/max-content, aspect-ratio, percentage, or custom measure functions.',
    'The goal is API pressure and deterministic tests rather than CSS/Yoga compatibility.'
  ],
  useWasmYogaWhen: [
    'WASM Yoga is acceptable when the demo needs production-grade parity for min/max sizes, percentage resolution, absolute positioning, baseline alignment, aspect ratios, or custom text measurement.',
    'International text measurement participates directly in layout and the team cannot afford to chase Yoga edge cases in TypeScript.',
    'Benchmark parity against Yoga starts failing outside the deliberate subset.'
  ]
};

export function layoutTinyFlexTree(root: TinyFlexNode, viewport: { readonly height: number; readonly width: number }): TinyFlexLayoutResult {
  const boxes: TinyFlexBox[] = [];
  const diagnostics: FlexTypographyDiagnostic[] = [];

  layoutNode(root, {
    height: viewport.height,
    width: viewport.width,
    x: 0,
    y: 0
  }, undefined, boxes, diagnostics);

  return { boxes, diagnostics, space: 'px' };
}

export function createRoyalFlexTypographyDemoTree(): TinyFlexNode {
  return {
    id: 'root',
    role: 'flex-row-wrap-root',
    style: {
      alignItems: 'start',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16
    },
    children: [
      {
        id: 'hero-card',
        role: 'card',
        style: {
          flexBasis: 260,
          flexDirection: 'column',
          flexGrow: 1,
          flexShrink: 1,
          gap: 8,
          height: 168
        },
        children: [
          {
            id: 'headline-slot',
            role: 'headline-text',
            style: { flexBasis: 32, height: 32 }
          },
          {
            id: 'body-copy-slot',
            role: 'paragraph-text',
            style: { flexBasis: 64, flexGrow: 1, height: 64 }
          },
          {
            id: 'action-row',
            role: 'flex-row-actions',
            style: {
              flexBasis: 40,
              flexDirection: 'row',
              flexShrink: 0,
              gap: 12,
              height: 40
            },
            children: [
              {
                id: 'primary-action',
                role: 'button',
                style: { flexBasis: 108, flexGrow: 1, height: 40 }
              },
              {
                id: 'secondary-action',
                role: 'button',
                style: { flexBasis: 92, height: 40 }
              }
            ]
          }
        ]
      },
      {
        id: 'metrics-card',
        role: 'card',
        style: {
          flexBasis: 180,
          flexDirection: 'column',
          flexShrink: 1,
          gap: 8,
          height: 168
        },
        children: [
          { id: 'metric-a', role: 'metric', style: { flexBasis: 48, height: 48 } },
          { id: 'metric-b', role: 'metric', style: { flexBasis: 48, height: 48 } },
          { id: 'metric-c', role: 'metric', style: { flexBasis: 48, height: 48 } }
        ]
      },
      {
        id: 'notes-card',
        role: 'card',
        style: {
          flexBasis: 240,
          flexDirection: 'column',
          flexGrow: 1,
          flexShrink: 1,
          gap: 8,
          height: 112
        },
        children: [
          { id: 'notes-title', role: 'headline-text', style: { flexBasis: 28, height: 28 } },
          { id: 'notes-copy', role: 'paragraph-text', style: { flexBasis: 76, flexGrow: 1, height: 76 } }
        ]
      }
    ]
  };
}

export function createRoyalFlexTypographyDemo(input: {
  readonly viewportHeightPx?: number;
  readonly viewportWidthPx?: number;
} = {}): RoyalFlexTypographyDemo {
  const viewport = {
    heightPx: input.viewportHeightPx ?? 360,
    widthPx: input.viewportWidthPx ?? 520
  };
  const tree = createRoyalFlexTypographyDemoTree();
  const layout = layoutTinyFlexTree(tree, {
    height: viewport.heightPx,
    width: viewport.widthPx
  });
  const bodyCopy = requiredBox(layout.boxes, 'body-copy-slot');
  const notesCopy = requiredBox(layout.boxes, 'notes-copy');
  const headline = shapePrototypeText({
    font: royalProportionalDemoFont,
    fontSizePx: 28,
    text: 'AVATAR affinity'
  });
  const body = shapePrototypeText({
    font: royalProportionalDemoFont,
    fontSizePx: 18,
    text: 'Flex cards wrap while proportional glyphs keep kerning, ligatures, and balanced line breaks.'
  });
  const notes = shapePrototypeText({
    font: royalProportionalDemoFont,
    fontSizePx: 16,
    text: 'Tiny TypeScript flex is a demo target. WASM Yoga stays acceptable once the subset grows.'
  });

  return {
    apiPressure: royalFlexTypographyApiPressure,
    boxes: layout.boxes,
    layoutDecision: tinyFlexVsYogaDecision,
    textBlocks: [
      breakShapedRunIntoLines({ maxLineWidthPx: Math.max(1, bodyCopy.rect.width), run: body }),
      breakShapedRunIntoLines({ maxLineWidthPx: Math.max(1, notesCopy.rect.width), run: notes }),
      breakShapedRunIntoLines({ maxLineWidthPx: Math.max(1, requiredBox(layout.boxes, 'headline-slot').rect.width), run: headline })
    ],
    tree,
    viewport
  };
}

export function shapePrototypeText(input: {
  readonly direction?: PrototypeTextDirection;
  readonly font: PrototypeFontFace;
  readonly fontSizePx: number;
  readonly text: string;
}): ShapedGlyphRun {
  const chars = Array.from(input.text);
  const baseGlyphs: Omit<ShapedGlyph, 'pairAdjustmentPx' | 'xAdvancePx' | 'xOffsetPx'>[] = [];
  const scale = input.fontSizePx / input.font.metrics.unitsPerEm;
  const ligatures = [...input.font.ligatures].sort((left, right) =>
    Array.from(right.sequence).length - Array.from(left.sequence).length
  );
  let cluster = 0;

  while (cluster < chars.length) {
    const ligature = ligatures.find((candidate) => sequenceMatches(chars, cluster, candidate.sequence));

    if (ligature !== undefined) {
      const length = Array.from(ligature.sequence).length;
      baseGlyphs.push({
        baseAdvancePx: ligature.advanceUnits * scale,
        clusterEnd: cluster + length,
        clusterStart: cluster,
        features: [{
          source: 'GSUB LigatureSubst prototype',
          tag: 'liga'
        }],
        glyphId: ligature.glyphId,
        sourceText: chars.slice(cluster, cluster + length).join(''),
        yOffsetPx: 0
      });
      cluster += length;
      continue;
    }

    const char = chars[cluster] ?? '';
    const metric = glyphMetricFor(input.font, char);
    baseGlyphs.push({
      baseAdvancePx: metric.advanceUnits * scale,
      clusterEnd: cluster + 1,
      clusterStart: cluster,
      features: [],
      glyphId: metric.glyphId,
      sourceText: char,
      yOffsetPx: 0
    });
    cluster += 1;
  }

  const glyphs: ShapedGlyph[] = [];
  let pen = 0;

  for (let index = 0; index < baseGlyphs.length; index += 1) {
    const glyph = baseGlyphs[index];
    if (glyph === undefined) continue;
    const nextGlyph = baseGlyphs[index + 1];
    const kerningUnits = nextGlyph === undefined
      ? 0
      : kerningAdjustmentUnits(input.font, glyph.glyphId, nextGlyph.glyphId);
    const pairAdjustmentPx = kerningUnits * scale;
    const kernFeature: readonly OpenTypeFeatureApplication[] = kerningUnits === 0
      ? []
      : [{
          adjustmentUnits: kerningUnits,
          source: 'GPOS PairPos prototype',
          tag: 'kern'
        }];
    const shaped = {
      ...glyph,
      features: [...glyph.features, ...kernFeature],
      pairAdjustmentPx,
      xAdvancePx: glyph.baseAdvancePx + pairAdjustmentPx,
      xOffsetPx: pen
    } satisfies ShapedGlyph;

    glyphs.push(shaped);
    pen += shaped.xAdvancePx;
  }

  return {
    direction: input.direction ?? 'ltr',
    fontFamily: input.font.family,
    fontSizePx: input.fontSizePx,
    glyphs,
    shapingEngine: 'prototype-gsub-gpos-shaper',
    sourceText: input.text,
    totalAdvancePx: pen
  };
}

export function findPrototypeLineBreakOpportunities(text: string): readonly PrototypeLineBreakOpportunity[] {
  const chars = Array.from(text);
  const opportunities: PrototypeLineBreakOpportunity[] = [];

  for (const [index, char] of chars.entries()) {
    if (char === '\n') {
      opportunities.push({
        afterCluster: index + 1,
        class: 'LF',
        mandatory: true,
        penalty: -1_000
      });
      continue;
    }

    if (char === ' ') {
      opportunities.push({
        afterCluster: index + 1,
        class: 'SP',
        mandatory: false,
        penalty: 0
      });
      continue;
    }

    if (char === '-') {
      opportunities.push({
        afterCluster: index + 1,
        class: 'HY',
        mandatory: false,
        penalty: 40
      });
      continue;
    }

    if (char === '/' || char === ',' || char === ';') {
      opportunities.push({
        afterCluster: index + 1,
        class: 'BA',
        mandatory: false,
        penalty: 80
      });
    }
  }

  opportunities.push({
    afterCluster: chars.length,
    class: 'end',
    mandatory: true,
    penalty: 0
  });

  return opportunities;
}

export function createParagraphBreakAtoms(run: ShapedGlyphRun): readonly ParagraphBreakAtom[] {
  const opportunitiesByCluster = new Map(
    findPrototypeLineBreakOpportunities(run.sourceText).map((opportunity) => [opportunity.afterCluster, opportunity])
  );
  const atoms: ParagraphBreakAtom[] = [];

  for (const [index, glyph] of run.glyphs.entries()) {
    if (glyph.sourceText === ' ') {
      atoms.push({
        glyphIndex: index,
        kind: 'glue',
        shrinkPx: glyph.baseAdvancePx / 3,
        stretchPx: glyph.baseAdvancePx / 2,
        widthPx: glyph.baseAdvancePx
      });
    } else {
      atoms.push({
        glyphIndex: index,
        kind: 'box',
        text: glyph.sourceText,
        widthPx: glyph.baseAdvancePx
      });
    }

    const opportunity = opportunitiesByCluster.get(glyph.clusterEnd);
    if (opportunity !== undefined && opportunity.class !== 'end') {
      atoms.push({
        breakAfterCluster: opportunity.afterCluster,
        breakAfterGlyphIndex: index + 1,
        kind: 'penalty',
        penalty: opportunity.penalty,
        widthPx: 0
      });
    }
  }

  atoms.push({
    breakAfterCluster: Array.from(run.sourceText).length,
    breakAfterGlyphIndex: run.glyphs.length,
    kind: 'penalty',
    penalty: 0,
    widthPx: 0
  });

  return atoms;
}

export function breakShapedRunIntoLines(input: {
  readonly maxLineWidthPx: number;
  readonly run: ShapedGlyphRun;
}): ParagraphBreakResult {
  const opportunities = findPrototypeLineBreakOpportunities(input.run.sourceText);
  const candidates = breakCandidatesFor(input.run, opportunities);
  const costs = new Array<number>(candidates.length).fill(Number.POSITIVE_INFINITY);
  const previous = new Array<number>(candidates.length).fill(-1);
  const lineBadness = new Array<number>(candidates.length).fill(0);
  costs[0] = 0;

  for (let endCandidate = 1; endCandidate < candidates.length; endCandidate += 1) {
    const end = candidates[endCandidate];
    if (end === undefined) continue;

    for (let startCandidate = 0; startCandidate < endCandidate; startCandidate += 1) {
      const start = candidates[startCandidate];
      const startCost = costs[startCandidate];
      if (start === undefined || startCost === undefined || startCost === Number.POSITIVE_INFINITY) continue;
      const widthPx = measureGlyphRange(input.run, start.glyphIndex, end.glyphIndex);
      const badness = calculateLineBadness({
        isFinal: end.glyphIndex === input.run.glyphs.length,
        maxLineWidthPx: input.maxLineWidthPx,
        penalty: end.opportunity.penalty,
        widthPx
      });
      const total = startCost + badness;
      const endCost = costs[endCandidate] ?? Number.POSITIVE_INFINITY;

      if (total < endCost) {
        costs[endCandidate] = total;
        previous[endCandidate] = startCandidate;
        lineBadness[endCandidate] = badness;
      }
    }
  }

  const lines: ParagraphLine[] = [];
  let cursor = candidates.length - 1;

  while (cursor > 0) {
    const prior = previous[cursor];
    if (prior === undefined || prior < 0) {
      const start = cursor === candidates.length - 1 ? 0 : candidates[cursor - 1]?.glyphIndex ?? 0;
      lines.push(createParagraphLine(input.run, start, input.run.glyphs.length, input.maxLineWidthPx, 1_000_000));
      break;
    }

    const start = candidates[prior];
    const end = candidates[cursor];
    if (start === undefined || end === undefined) break;
    lines.push(createParagraphLine(input.run, start.glyphIndex, end.glyphIndex, input.maxLineWidthPx, lineBadness[cursor] ?? 0));
    cursor = prior;
  }

  lines.reverse();

  return {
    atoms: createParagraphBreakAtoms(input.run),
    lines,
    opportunities,
    totalBadness: costs[candidates.length - 1] ?? Number.POSITIVE_INFINITY
  };
}

function layoutNode(
  node: TinyFlexNode,
  rect: TinyFlexRect,
  parentId: string | undefined,
  boxes: TinyFlexBox[],
  diagnostics: FlexTypographyDiagnostic[],
  metadata: FlexBoxMetadata = {}
): void {
  boxes.push({
    id: node.id,
    ...(metadata.flexLine === undefined ? {} : { flexLine: metadata.flexLine }),
    ...(parentId === undefined ? {} : { parentId }),
    rect: roundRect(rect),
    ...(node.role === undefined ? {} : { role: node.role }),
    space: 'px'
  });

  const children = node.children ?? [];
  if (children.length === 0) return;

  const style = node.style ?? {};
  const direction = style.flexDirection ?? 'row';
  const wrap = style.flexWrap ?? 'nowrap';
  const alignItems = style.alignItems ?? 'stretch';
  const mainAvailable = mainSize(rect, direction);
  const mainGap = gapFor(style, direction, 'main');
  const crossGap = gapFor(style, direction, 'cross');
  const measures = children.map((child) => measureFlexItem(child, direction));
  const lines = collectFlexLines(measures, mainAvailable, mainGap, wrap);
  let crossCursor = 0;

  for (const [lineIndex, line] of lines.entries()) {
    const resolved = resolveFlexibleLengths(line, mainAvailable, mainGap);
    const measuredCross = Math.max(0, ...line.map((item) => item.baseCross));
    const lineCross = alignItems === 'stretch'
      ? Math.max(measuredCross, crossSize(rect, direction))
      : measuredCross;
    let mainCursor = 0;

    for (const item of resolved) {
      const crossSize = alignItems === 'stretch' && item.crossAuto ? lineCross : item.baseCross;
      const childRect = rectForAxes({
        container: rect,
        crossOffset: crossCursor,
        crossSize,
        direction,
        mainOffset: mainCursor,
        mainSizeValue: item.mainSize
      });
      layoutNode(item.node, childRect, node.id, boxes, diagnostics, { flexLine: lineIndex });
      mainCursor += item.mainSize + mainGap;
    }

    crossCursor += lineCross + crossGap;
  }

  if (crossCursor - crossGap > crossSize(rect, direction)) {
    diagnostics.push({
      code: 'unsupported-flex-feature',
      message: `Tiny flex subset does not implement align-content or cross-axis compression for ${node.id}.`,
      severity: 'info'
    });
  }
}

function measureFlexItem(node: TinyFlexNode, direction: TinyFlexDirection): FlexItemMeasure {
  const style = node.style ?? {};
  const baseMain = style.flexBasis ?? axisStyleSize(style, direction) ?? axisIntrinsicSize(node, direction);
  const explicitCross = axisStyleSize(style, oppositeDirection(direction));

  return {
    baseCross: explicitCross ?? axisIntrinsicSize(node, oppositeDirection(direction)),
    baseMain,
    crossAuto: explicitCross === undefined,
    flexGrow: style.flexGrow ?? 0,
    flexShrink: style.flexShrink ?? 1,
    node
  };
}

function collectFlexLines(
  items: readonly FlexItemMeasure[],
  mainAvailable: number,
  mainGap: number,
  wrap: TinyFlexWrap
): readonly (readonly FlexItemMeasure[])[] {
  if (wrap === 'nowrap') return [items];
  const lines: FlexItemMeasure[][] = [];
  let current: FlexItemMeasure[] = [];
  let used = 0;

  for (const item of items) {
    const nextUsed = current.length === 0 ? item.baseMain : used + mainGap + item.baseMain;
    if (current.length > 0 && nextUsed > mainAvailable) {
      lines.push(current);
      current = [item];
      used = item.baseMain;
      continue;
    }

    current.push(item);
    used = nextUsed;
  }

  if (current.length > 0) lines.push(current);
  return lines;
}

function resolveFlexibleLengths(
  line: readonly FlexItemMeasure[],
  mainAvailable: number,
  mainGap: number
): readonly ResolvedFlexItem[] {
  const basisSum = line.reduce((sum, item) => sum + item.baseMain, 0);
  const gapSum = Math.max(0, line.length - 1) * mainGap;
  const free = mainAvailable - basisSum - gapSum;

  if (free > 0) {
    const growSum = line.reduce((sum, item) => sum + item.flexGrow, 0);
    return line.map((item) => ({
      ...item,
      mainSize: growSum === 0 ? item.baseMain : item.baseMain + free * (item.flexGrow / growSum)
    }));
  }

  if (free < 0) {
    const shrinkSum = line.reduce((sum, item) => sum + item.flexShrink * item.baseMain, 0);
    return line.map((item) => ({
      ...item,
      mainSize: shrinkSum === 0
        ? item.baseMain
        : Math.max(0, item.baseMain + free * ((item.flexShrink * item.baseMain) / shrinkSum))
    }));
  }

  return line.map((item) => ({ ...item, mainSize: item.baseMain }));
}

function axisStyleSize(style: TinyFlexStyle, direction: TinyFlexDirection): number | undefined {
  return direction === 'row' ? style.width : style.height;
}

function axisIntrinsicSize(node: TinyFlexNode, direction: TinyFlexDirection): number {
  const intrinsic = node.intrinsicSize;
  if (intrinsic === undefined) return 0;
  return direction === 'row' ? intrinsic.width : intrinsic.height;
}

function oppositeDirection(direction: TinyFlexDirection): TinyFlexDirection {
  return direction === 'row' ? 'column' : 'row';
}

function mainSize(rect: TinyFlexRect, direction: TinyFlexDirection): number {
  return direction === 'row' ? rect.width : rect.height;
}

function crossSize(rect: TinyFlexRect, direction: TinyFlexDirection): number {
  return direction === 'row' ? rect.height : rect.width;
}

function gapFor(style: TinyFlexStyle, direction: TinyFlexDirection, axis: 'cross' | 'main'): number {
  if (axis === 'main') {
    return direction === 'row' ? style.columnGap ?? style.gap ?? 0 : style.rowGap ?? style.gap ?? 0;
  }

  return direction === 'row' ? style.rowGap ?? style.gap ?? 0 : style.columnGap ?? style.gap ?? 0;
}

function rectForAxes(input: {
  readonly container: TinyFlexRect;
  readonly crossOffset: number;
  readonly crossSize: number;
  readonly direction: TinyFlexDirection;
  readonly mainOffset: number;
  readonly mainSizeValue: number;
}): TinyFlexRect {
  if (input.direction === 'row') {
    return {
      height: input.crossSize,
      width: input.mainSizeValue,
      x: input.container.x + input.mainOffset,
      y: input.container.y + input.crossOffset
    };
  }

  return {
    height: input.mainSizeValue,
    width: input.crossSize,
    x: input.container.x + input.crossOffset,
    y: input.container.y + input.mainOffset
  };
}

function roundRect(rect: TinyFlexRect): TinyFlexRect {
  return {
    height: roundPx(rect.height),
    width: roundPx(rect.width),
    x: roundPx(rect.x),
    y: roundPx(rect.y)
  };
}

function roundPx(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function createDemoGlyphMetrics(): Readonly<Record<string, PrototypeGlyphMetric>> {
  const advances: Record<string, number> = {
    ' ': 300,
    '-': 340,
    ',': 260,
    '.': 260,
    '/': 360,
    ';': 280,
    A: 720,
    B: 700,
    C: 690,
    D: 720,
    E: 650,
    F: 610,
    G: 740,
    H: 740,
    I: 320,
    L: 580,
    M: 880,
    O: 760,
    R: 700,
    S: 640,
    T: 640,
    V: 740,
    W: 940,
    Y: 720,
    a: 540,
    b: 570,
    c: 500,
    d: 570,
    e: 540,
    f: 340,
    g: 560,
    h: 560,
    i: 230,
    k: 520,
    l: 240,
    m: 830,
    n: 560,
    o: 560,
    p: 570,
    q: 570,
    r: 380,
    s: 470,
    t: 350,
    u: 560,
    v: 520,
    w: 760,
    x: 500,
    y: 520
  };
  const metrics: Record<string, PrototypeGlyphMetric> = {};

  for (const [text, advanceUnits] of Object.entries(advances)) {
    metrics[text] = {
      advanceUnits,
      glyphId: text === ' ' ? 'space' : text
    };
  }

  return metrics;
}

function glyphMetricFor(font: PrototypeFontFace, text: string): PrototypeGlyphMetric {
  return font.glyphs[text] ?? {
    advanceUnits: 560,
    glyphId: `uni${(text.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`
  };
}

function sequenceMatches(chars: readonly string[], offset: number, sequence: string): boolean {
  const sequenceChars = Array.from(sequence);
  return sequenceChars.every((char, index) => chars[offset + index] === char);
}

function kerningAdjustmentUnits(font: PrototypeFontFace, leftGlyphId: string, rightGlyphId: string): number {
  return font.kerningPairs.find((pair) =>
    pair.leftGlyphId === leftGlyphId && pair.rightGlyphId === rightGlyphId
  )?.adjustmentUnits ?? 0;
}

function breakCandidatesFor(
  run: ShapedGlyphRun,
  opportunities: readonly PrototypeLineBreakOpportunity[]
): readonly BreakCandidate[] {
  const byGlyphIndex = new Map<number, BreakCandidate>();
  const startOpportunity = {
    afterCluster: 0,
    class: 'end',
    mandatory: true,
    penalty: 0
  } satisfies PrototypeLineBreakOpportunity;

  byGlyphIndex.set(0, { glyphIndex: 0, opportunity: startOpportunity });

  for (const opportunity of opportunities) {
    byGlyphIndex.set(glyphIndexForBreakAfterCluster(run, opportunity.afterCluster), {
      glyphIndex: glyphIndexForBreakAfterCluster(run, opportunity.afterCluster),
      opportunity
    });
  }

  return [...byGlyphIndex.values()].sort((left, right) => left.glyphIndex - right.glyphIndex);
}

function glyphIndexForBreakAfterCluster(run: ShapedGlyphRun, afterCluster: number): number {
  if (afterCluster <= 0) return 0;

  for (const [index, glyph] of run.glyphs.entries()) {
    if (glyph.clusterEnd >= afterCluster) return index + 1;
  }

  return run.glyphs.length;
}

function measureGlyphRange(run: ShapedGlyphRun, startGlyphIndex: number, endGlyphIndex: number): number {
  const visibleEnd = trailingTrimmedGlyphEnd(run, startGlyphIndex, endGlyphIndex);
  let width = 0;

  for (let index = startGlyphIndex; index < visibleEnd; index += 1) {
    const glyph = run.glyphs[index];
    if (glyph === undefined) continue;
    width += glyph.baseAdvancePx;
    if (index + 1 < visibleEnd) width += glyph.pairAdjustmentPx;
  }

  return width;
}

function calculateLineBadness(input: {
  readonly isFinal: boolean;
  readonly maxLineWidthPx: number;
  readonly penalty: number;
  readonly widthPx: number;
}): number {
  if (input.widthPx > input.maxLineWidthPx) {
    const overflow = input.widthPx - input.maxLineWidthPx;
    return 1_000_000 + overflow * overflow;
  }

  if (input.isFinal) return 0;
  const remaining = input.maxLineWidthPx - input.widthPx;
  return remaining * remaining + input.penalty * input.penalty;
}

function createParagraphLine(
  run: ShapedGlyphRun,
  startGlyphIndex: number,
  endGlyphIndex: number,
  maxLineWidthPx: number,
  badness: number
): ParagraphLine {
  const visibleEnd = trailingTrimmedGlyphEnd(run, startGlyphIndex, endGlyphIndex);
  const widthPx = measureGlyphRange(run, startGlyphIndex, endGlyphIndex);
  const remainingPx = maxLineWidthPx - widthPx;

  return {
    badness,
    endGlyphIndex,
    glyphs: positionLineGlyphs(run, startGlyphIndex, visibleEnd),
    remainingPx,
    startGlyphIndex,
    text: run.glyphs.slice(startGlyphIndex, visibleEnd).map((glyph) => glyph.sourceText).join(''),
    widthPx
  };
}

function trailingTrimmedGlyphEnd(run: ShapedGlyphRun, startGlyphIndex: number, endGlyphIndex: number): number {
  let visibleEnd = endGlyphIndex;

  while (visibleEnd > startGlyphIndex) {
    const glyph = run.glyphs[visibleEnd - 1];
    if (glyph === undefined || glyph.sourceText !== ' ') break;
    visibleEnd -= 1;
  }

  return visibleEnd;
}

function positionLineGlyphs(
  run: ShapedGlyphRun,
  startGlyphIndex: number,
  visibleEnd: number
): readonly PositionedLineGlyph[] {
  const glyphs: PositionedLineGlyph[] = [];
  let pen = 0;

  for (let index = startGlyphIndex; index < visibleEnd; index += 1) {
    const glyph = run.glyphs[index];
    if (glyph === undefined) continue;
    glyphs.push({ ...glyph, lineXOffsetPx: pen });
    pen += glyph.baseAdvancePx;
    if (index + 1 < visibleEnd) pen += glyph.pairAdjustmentPx;
  }

  return glyphs;
}

function requiredBox(boxes: readonly TinyFlexBox[], id: string): TinyFlexBox {
  const box = boxes.find((candidate) => candidate.id === id);
  if (box === undefined) throw new Error(`Missing flex box ${id}`);
  return box;
}
