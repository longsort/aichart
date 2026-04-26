import type { AnalyzeResponse, Candle } from '@/types';
import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import type { StructureCandleHighlight } from '@/lib/smcDeskOverlay';

/** 한 봉의 pre3 반징 — preview 는 마감 전 연한 표시(저장 안 함) */
export type Pre3SparkleCell = { direction: 'LONG' | 'SHORT'; preview: boolean };

export type CandleBlendInput = {
  compositeLayers: boolean;
  chartCandleStyle: 'classic' | 'monochrome';
  classicUpHex: string;
  classicDownHex: string;
  monoUpHex: string;
  monoDownBodyHex: string;
  monoOutlineHex: string;
};

function putBar(
  m: Map<number, Pre3SparkleCell>,
  time: number,
  direction: 'LONG' | 'SHORT',
  preview: boolean,
  score: number,
  scoreMap: Map<number, number>
) {
  const prev = m.get(time);
  const prevSc = scoreMap.get(time) ?? -Infinity;
  if (score < prevSc) return;
  if (prev && !prev.preview && preview) return;
  m.set(time, { direction, preview });
  scoreMap.set(time, score);
}

/** pre3 반짝이 적용될 봉 time → 방향·프리뷰 여부 */
export function collectPre3SparkleDirections(
  analysis: AnalyzeResponse | null,
  symbol: string,
  timeframe: string,
  candles: Candle[]
): Map<number, Pre3SparkleCell> {
  const m = new Map<number, Pre3SparkleCell>();
  const scoreMap = new Map<number, number>();
  if (!analysis || analysis.symbol !== symbol || analysis.timeframe !== timeframe) return m;

  for (const h of analysis.pre3SparkleHistory ?? []) {
    if (h.direction === 'LONG' || h.direction === 'SHORT') {
      putBar(
        m,
        h.time,
        h.direction,
        false,
        Number.isFinite(h.similarity) ? Number(h.similarity) : 0,
        scoreMap
      );
    }
  }

  const p3 = analysis.pre3Sparkle;
  if (!p3?.enabled || candles.length < 4) return m;

  const n = candles.length;
  /** 직전 2캔 + 장대 본봉(n-1) 반짝 — 히스토리와 동일(유사도≥임계 세트) */
  const idxs = [n - 3, n - 2, n - 1] as const;
  const sim = Number.isFinite(p3.similarity) ? Number(p3.similarity) : 0;

  if (p3.matched && (p3.direction === 'LONG' || p3.direction === 'SHORT')) {
    for (const idx of idxs) {
      putBar(m, candles[idx].time as number, p3.direction, false, sim, scoreMap);
    }
  } else if (p3.waitingBarClose && (p3.direction === 'LONG' || p3.direction === 'SHORT')) {
    for (const idx of idxs) {
      putBar(m, candles[idx].time as number, p3.direction, true, sim * 0.99, scoreMap);
    }
  }

  return m;
}

/** pre3 반짝 — 상승 초록 / 하락 빨강 본봉, 테두리·심지는 보조색으로 구분 */
const LONG_PALETTE = [
  { color: '#22C55E', borderColor: '#EAB308', wickColor: '#A7F3D0' },
  { color: '#16A34A', borderColor: '#FDE047', wickColor: '#86EFAC' },
];
const SHORT_PALETTE = [
  { color: '#EF4444', borderColor: '#FB923C', wickColor: '#FCA5A5' },
  { color: '#DC2626', borderColor: '#F97316', wickColor: '#F87171' },
];
const LONG_PREVIEW_PALETTE = [
  { color: '#15803d', borderColor: '#84CC16', wickColor: '#4d7c0f' },
  { color: '#166534', borderColor: '#A3E635', wickColor: '#365314' },
];
const SHORT_PREVIEW_PALETTE = [
  { color: '#B91C1C', borderColor: '#EA580C', wickColor: '#991b1b' },
  { color: '#991B1B', borderColor: '#F97316', wickColor: '#7f1d1d' },
];

const PROX_LONG_PALETTE = [
  { color: '#22C55E', borderColor: '#3B82F6', wickColor: '#86EFAC' },
  { color: '#16A34A', borderColor: '#60A5FA', wickColor: '#4ADE80' },
];
const PROX_SHORT_PALETTE = [
  { color: '#EF4444', borderColor: '#06B6D4', wickColor: '#FCA5A5' },
  { color: '#DC2626', borderColor: '#22D3EE', wickColor: '#F87171' },
];

function paletteHotZoneCandle(isUp: boolean, pulsePhase: number): {
  color: string;
  borderColor: string;
  wickColor: string;
} {
  const ph = pulsePhase % 2;
  if (isUp) {
    return ph === 0
      ? { color: '#22C55E', borderColor: '#A855F7', wickColor: '#86EFAC' }
      : { color: '#16A34A', borderColor: '#C084FC', wickColor: '#4ADE80' };
  }
  return ph === 0
    ? { color: '#EF4444', borderColor: '#A855F7', wickColor: '#FCA5A5' }
    : { color: '#DC2626', borderColor: '#7C3AED', wickColor: '#F87171' };
}

/** BOS/CHOCH/MSB — 상승 편은 초록 계열, 하락 편은 빨강 계열 + 단계별 보조색 */
function paletteForStructureHighlight(
  h: StructureCandleHighlight,
  pulsePhase: number
): { color: string; borderColor: string; wickColor: string } {
  const ph = pulsePhase % 2;
  const long = h.bias === 'bullish';
  if (long) {
    switch (h.phase) {
      case 'confirmed':
        return ph === 0
          ? { color: '#15803d', borderColor: '#34D399', wickColor: '#22C55E' }
          : { color: '#166534', borderColor: '#2DD4BF', wickColor: '#4ADE80' };
      case 'settling':
        return { color: '#22C55E', borderColor: '#A7F3D0', wickColor: '#16A34A' };
      case 'breakout':
        return { color: '#15803d', borderColor: '#EAB308', wickColor: '#FDE047' };
      case 'trace':
        return ph === 0
          ? { color: '#115e59', borderColor: '#99f6e4', wickColor: '#14b8a6' }
          : { color: '#0f766e', borderColor: '#5eead4', wickColor: '#2dd4bf' };
      case 'failed':
      default:
        return { color: '#64748b', borderColor: '#94a3b8', wickColor: '#475569' };
    }
  }
  switch (h.phase) {
    case 'confirmed':
      return ph === 0
        ? { color: '#B91C1C', borderColor: '#FB7185', wickColor: '#EF4444' }
        : { color: '#991B1B', borderColor: '#F87171', wickColor: '#DC2626' };
    case 'settling':
      return { color: '#EF4444', borderColor: '#FCA5A5', wickColor: '#DC2626' };
    case 'breakout':
      return { color: '#DC2626', borderColor: '#F97316', wickColor: '#FB923C' };
    case 'trace':
      return ph === 0
        ? { color: '#881337', borderColor: '#fda4af', wickColor: '#be123c' }
        : { color: '#9f1239', borderColor: '#fb7185', wickColor: '#e11d48' };
    case 'failed':
    default:
      return { color: '#64748b', borderColor: '#94a3b8', wickColor: '#475569' };
  }
}

type PaintLayer =
  | { kind: 'structure'; h: StructureCandleHighlight }
  | { kind: 'pre3'; cell: Pre3SparkleCell }
  | { kind: 'prox'; dir: 'LONG' | 'SHORT' }
  | { kind: 'hot' };

function pre3Triple(cell: Pre3SparkleCell, phase: number): { color: string; borderColor: string; wickColor: string } {
  const long = cell.direction === 'LONG';
  const pal = long
    ? cell.preview
      ? LONG_PREVIEW_PALETTE
      : LONG_PALETTE
    : cell.preview
      ? SHORT_PREVIEW_PALETTE
      : SHORT_PALETTE;
  return pal[phase] ?? pal[0];
}

function proxTriple(dir: 'LONG' | 'SHORT', phase: number): { color: string; borderColor: string; wickColor: string } {
  const pal = dir === 'LONG' ? PROX_LONG_PALETTE : PROX_SHORT_PALETTE;
  return pal[phase] ?? pal[0];
}

type NonHotPaintLayer = Exclude<PaintLayer, { kind: 'hot' }>;

function layerTriple(layer: NonHotPaintLayer, pulsePhase: number, phase: number): { color: string; borderColor: string; wickColor: string } {
  switch (layer.kind) {
    case 'structure':
      return paletteForStructureHighlight(layer.h, pulsePhase);
    case 'pre3':
      return pre3Triple(layer.cell, phase);
    case 'prox':
      return proxTriple(layer.dir, phase);
  }
}

function layerTripleForCandle(layer: PaintLayer, candle: Candle, pulsePhase: number, phase: number) {
  if (layer.kind === 'hot') {
    return paletteHotZoneCandle(candle.close >= candle.open, pulsePhase);
  }
  return layerTriple(layer, pulsePhase, phase);
}

function bodyTriple(bl: CandleBlendInput, isUp: boolean): { color: string; borderColor: string; wickColor: string } {
  if (bl.chartCandleStyle === 'monochrome') {
    const c = isUp ? bl.monoUpHex : bl.monoDownBodyHex;
    const o = isUp ? bl.monoUpHex : bl.monoOutlineHex;
    return { color: c, borderColor: o, wickColor: o };
  }
  const c = isUp ? bl.classicUpHex : bl.classicDownHex;
  return { color: c, borderColor: c, wickColor: c };
}

function buildOrderedLayers(
  struct: StructureCandleHighlight | undefined,
  cell: Pre3SparkleCell | undefined,
  prox: 'LONG' | 'SHORT' | undefined,
  hot: boolean
): PaintLayer[] {
  const out: PaintLayer[] = [];
  if (struct) out.push({ kind: 'structure', h: struct });
  if (cell) out.push({ kind: 'pre3', cell });
  if (prox) out.push({ kind: 'prox', dir: prox });
  if (hot) out.push({ kind: 'hot' });
  return out;
}

function layerKindLabel(k: PaintLayer['kind']): string {
  switch (k) {
    case 'structure':
      return '구조(BOS/CHOCH)';
    case 'pre3':
      return 'pre3 반짝';
    case 'prox':
      return '줄·존 근접';
    case 'hot':
      return '핫존 핫캔들';
    default:
      return '';
  }
}

/** 크로스헤어 검증용 — 해당 봉에 적용된 규칙 설명(한 줄) */
export function describeCandlePaintForTime(
  t: number,
  blend: CandleBlendInput,
  sparkleByTime: Map<number, Pre3SparkleCell>,
  structureByTime: Map<number, StructureCandleHighlight> | null | undefined,
  lineZoneProximityByTime: Map<number, 'LONG' | 'SHORT'> | undefined,
  hotZoneHighlightTimes: Set<number> | null | undefined,
  candle: Candle
): string {
  const cell = sparkleByTime.get(t);
  const struct = structureByTime?.get(t);
  const prox = lineZoneProximityByTime?.get(t);
  const hot = hotZoneHighlightTimes != null && hotZoneHighlightTimes.has(t);
  const isUp = candle.close >= candle.open;

  if (!blend.compositeLayers) {
    if (struct) return `${layerKindLabel('structure')} · ${struct.tag} ${struct.phase}`;
    if (prox) return `${layerKindLabel('prox')} · ${prox === 'LONG' ? '롱' : '숏'}`;
    if (hot) return layerKindLabel('hot');
    if (cell) return `${layerKindLabel('pre3')} · ${cell.preview ? '프리뷰' : '확정'} ${cell.direction}`;
    return '기본 캔들색(OHLC)';
  }

  const layers = buildOrderedLayers(struct, cell, prox, hot);
  if (layers.length === 0) return '기본 캔들색(OHLC)';
  const names = layers.map((L) => layerKindLabel(L.kind));
  const body = bodyTriple(blend, isUp);
  const b0 = layerTripleForCandle(layers[0], candle, 0, 0);
  const wickSrc = layers.length > 1 ? layerTripleForCandle(layers[1], candle, 0, 0) : b0;
  return `겹침분리: 본봉=${isUp ? '상승' : '하락'}(${body.color}) 테두리=${b0.borderColor}(${names[0]}) 심지=${wickSrc.wickColor}(${layers.length > 1 ? names[1] : names[0]}) [${names.join('+')}]`;
}

export function buildCandlestickDataWithPre3Sparkle(
  candles: Candle[],
  sparkleByTime: Map<number, Pre3SparkleCell>,
  pulsePhase: number,
  reducedMotion: boolean,
  lineZoneProximityByTime?: Map<number, 'LONG' | 'SHORT'>,
  structureByTime?: Map<number, StructureCandleHighlight> | null,
  hotZoneHighlightTimes?: Set<number> | null,
  blend?: CandleBlendInput | null
): CandlestickData<UTCTimestamp>[] {
  const phase = reducedMotion ? 0 : pulsePhase % 2;
  const composite = blend?.compositeLayers === true && blend != null;

  return candles.map((x) => {
    const t = x.time as number;
    const cell = sparkleByTime.get(t);
    const structExclusive = !cell ? structureByTime?.get(t) : undefined;
    const proxExclusive = !cell && !structExclusive ? lineZoneProximityByTime?.get(t) : undefined;
    const hotExclusive =
      hotZoneHighlightTimes != null &&
      !cell &&
      !structExclusive &&
      !proxExclusive &&
      hotZoneHighlightTimes.has(t);

    const base: CandlestickData<UTCTimestamp> = {
      time: x.time as UTCTimestamp,
      open: x.open,
      high: x.high,
      low: x.low,
      close: x.close,
    };

    if (!composite || !blend) {
      if (structExclusive) {
        const c = paletteForStructureHighlight(structExclusive, pulsePhase);
        return { ...base, color: c.color, borderColor: c.borderColor, wickColor: c.wickColor };
      }
      if (proxExclusive) {
        const long = proxExclusive === 'LONG';
        const pal = long ? PROX_LONG_PALETTE : PROX_SHORT_PALETTE;
        const c = pal[phase] ?? pal[0];
        return { ...base, color: c.color, borderColor: c.borderColor, wickColor: c.wickColor };
      }
      if (hotExclusive) {
        const c = paletteHotZoneCandle(x.close >= x.open, pulsePhase);
        return { ...base, color: c.color, borderColor: c.borderColor, wickColor: c.wickColor };
      }
      if (!cell) return base;
      const long = cell.direction === 'LONG';
      const pal = long
        ? cell.preview
          ? LONG_PREVIEW_PALETTE
          : LONG_PALETTE
        : cell.preview
          ? SHORT_PREVIEW_PALETTE
          : SHORT_PALETTE;
      const c = pal[phase] ?? pal[0];
      return { ...base, color: c.color, borderColor: c.borderColor, wickColor: c.wickColor };
    }

    const struct = structureByTime?.get(t);
    const prox = lineZoneProximityByTime?.get(t);
    const hot = hotZoneHighlightTimes != null && hotZoneHighlightTimes.has(t);
    const layers = buildOrderedLayers(struct, cell, prox, hot);
    if (layers.length === 0) return base;

    const isUp = x.close >= x.open;
    const body = bodyTriple(blend, isUp);
    const primary = layerTripleForCandle(layers[0], x, pulsePhase, phase);
    const secondary = layers.length > 1 ? layerTripleForCandle(layers[1], x, pulsePhase, phase) : primary;
    return {
      ...base,
      color: body.color,
      borderColor: primary.borderColor,
      wickColor: secondary.wickColor,
    };
  });
}
