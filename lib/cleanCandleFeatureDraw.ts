/**
 * btccion 스타일 클린 캔들 작도 — 롱/숏빔 · ATR 반응구간 · 타이롱 경로.
 * 과밀 방지: 빔 핀 최대 2, 반응 띠 1, 타이롱 선 최대 2 + 점선 경로 최대 4세그먼트.
 */
import type { Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { OVERLAY_COLORS as C } from '@/lib/overlayColors';

const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
  '1Y': 31_536_000_000,
};

export type TyronProBias = 'LONG' | 'SHORT' | 'NEUTRAL';

export type TyronProResult = {
  bias: TyronProBias;
  confidence: number;
  absorbBull: boolean;
  absorbBear: boolean;
  reasons: string[];
  pathMain: number[];
  pathAlt: number[];
};

export type CleanBeamForecast = {
  horizon: number;
  longProb: number;
  shortProb: number;
};

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) return 0;
  let sum = 0;
  for (let i = n - 14; i < n; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    sum += Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
  }
  return sum / 14;
}

function rsi14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = n - 14; i < n; i++) {
    const diff = candles[i]!.close - candles[i - 1]!.close;
    if (diff >= 0) gain += diff;
    else loss += -diff;
  }
  if (gain === 0 && loss === 0) return 50;
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

function buildRelPath(
  pathLen: number,
  atr: number,
  price: number,
  score: number,
  main: boolean
): number[] {
  if (!(atr > 0) || !(price > 0) || pathLen < 2) return [];
  const dir = score >= 0 ? 1 : -1;
  const strength = Math.min(1, Math.abs(score));
  const step = (atr / price) * (0.45 + 0.75 * strength);
  const wiggle = main ? 0.12 : 0.22;
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < pathLen; i++) {
    const t = i / Math.max(1, pathLen - 1);
    const curve = (1 / (1 + Math.exp(-6 * (t - 0.35)))) * (1 - 0.35 * t);
    const noise = Math.sin((i + 1) * 1.7) * wiggle * step;
    acc += dir * step * curve + noise;
    out.push(acc);
  }
  return out;
}

/** Flutter TyronProEngine 이식 — 꼬리흡수·RSI·거래량 → bias + 상대수익 경로 */
export function analyzeTyronPro(
  candles: Candle[],
  opts?: { pathLen?: number }
): TyronProResult {
  const pathLen = Math.max(8, Math.min(18, opts?.pathLen ?? 12));
  if (candles.length < 60) {
    return {
      bias: 'NEUTRAL',
      confidence: 0,
      absorbBull: false,
      absorbBear: false,
      reasons: ['데이터 부족'],
      pathMain: [],
      pathAlt: [],
    };
  }

  const last = candles[candles.length - 1]!;
  const atr = atr14(candles);
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  const absorbBull =
    atr > 0 &&
    lowerWick >= atr * 0.45 &&
    lowerWick >= body * 1.2 &&
    last.close >= last.open + body * 0.35;
  const absorbBear =
    atr > 0 &&
    upperWick >= atr * 0.45 &&
    upperWick >= body * 1.2 &&
    last.close <= last.open - body * 0.35;

  const rsi = rsi14(candles);
  const rsiPrev = rsi14(candles.slice(0, -1));
  const rsiSlope = rsi - rsiPrev;

  const vols = candles.slice(-40).map((c) => Math.max(0, Number(c.volume) || 0));
  const sorted = [...vols].sort((a, b) => a - b);
  const medV = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
  const volSpike = medV > 0 ? (Number(last.volume) || 0) / medV : 1;

  let score = 0;
  const reasons: string[] = [];
  if (absorbBull) {
    score += 0.55;
    reasons.push('아래꼬리 흡수');
  }
  if (absorbBear) {
    score -= 0.55;
    reasons.push('윗꼬리 흡수');
  }
  if (Math.abs(rsiSlope) > 0.8) {
    score += rsiSlope > 0 ? 0.12 : -0.12;
    reasons.push(rsiSlope > 0 ? 'RSI↑' : 'RSI↓');
  }
  if (volSpike >= 1.35) {
    score += score >= 0 ? 0.1 : -0.1;
    reasons.push('거래량↑');
  }

  const bias: TyronProBias = score >= 0.18 ? 'LONG' : score <= -0.18 ? 'SHORT' : 'NEUTRAL';
  const confidence = Math.max(0, Math.min(100, Math.round(Math.min(1, Math.abs(score) / 0.85) * 100)));
  if (!reasons.length) reasons.push('중립');

  return {
    bias,
    confidence,
    absorbBull,
    absorbBear,
    reasons: reasons.slice(0, 4),
    pathMain: buildRelPath(pathLen, atr, last.close, score, true),
    pathAlt: buildRelPath(Math.max(8, Math.round(pathLen * 0.7)), atr, last.close, score, false),
  };
}

function toRatio(price: number, min: number, max: number): number {
  const r = max - min || 1;
  return Math.max(0, Math.min(1, (max - price) / r));
}

function barMs(tf: string, candles: Candle[]): number {
  const known = TF_MS[normalizeChartTimeframe(tf)];
  if (known) return known;
  if (candles.length >= 2) {
    const a = Number(candles[candles.length - 1]!.time);
    const b = Number(candles[candles.length - 2]!.time);
    const d = Math.abs(a - b);
    if (d > 0) return d;
  }
  return 3_600_000;
}

/** 선행 빔 — 우세 1개 + 확정 1개만, 짧은 기호 */
export function buildCleanBeamOverlays(params: {
  last: Candle;
  min: number;
  max: number;
  atrVal: number;
  trend: 'bullish' | 'bearish' | 'range';
  forecasts: CleanBeamForecast[];
}): OverlayItem[] {
  const { last, min, max, atrVal, trend, forecasts } = params;
  const out: OverlayItem[] = [];
  const minProb = trend === 'range' ? 68 : 62;

  let best: { horizon: number; long: boolean; prob: number } | null = null;
  for (const f of forecasts) {
    const long = f.longProb >= f.shortProb;
    const prob = long ? f.longProb : f.shortProb;
    if (prob < minProb) continue;
    if (!best || prob > best.prob) best = { horizon: f.horizon, long, prob };
  }

  if (best) {
    const yPrice = best.long
      ? Math.min(max, last.high + atrVal * 0.14)
      : Math.max(min, last.low - atrVal * 0.14);
    out.push({
      id: `beam-forecast-${best.horizon}`,
      kind: 'label',
      label: `${best.long ? '▲' : '▼'}${best.horizon}`,
      labelTooltip: `${best.horizon}봉 후 ${best.long ? '롱' : '숏'}빔 ${best.prob}% (참고)`,
      x1: 0.94,
      y1: toRatio(yPrice, min, max),
      time1: last.time as number,
      price1: yPrice,
      confidence: Math.min(94, best.prob),
      color: best.long ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)',
      labelBackgroundColor: 'rgba(8,12,20,0.9)',
      labelTextColor: '#f8fafc',
      category: 'labels',
      noProject: true,
    });
  }

  const f3 = forecasts.find((x) => x.horizon === 3);
  const f5 = forecasts.find((x) => x.horizon === 5);
  const f8 = forecasts.find((x) => x.horizon === 8);
  if (f3 && f5 && f8) {
    const t3 = trend === 'range' ? 85 : 80;
    const t5 = trend === 'range' ? 85 : 80;
    const t8 = trend === 'range' ? 75 : 70;
    const longQ = f3.longProb >= t3 && f5.longProb >= t5 && f8.longProb >= t8;
    const shortQ = f3.shortProb >= t3 && f5.shortProb >= t5 && f8.shortProb >= t8;
    if (longQ !== shortQ) {
      const longSide = longQ;
      const badgeProb = longSide
        ? Math.round((f3.longProb + f5.longProb + f8.longProb) / 3)
        : Math.round((f3.shortProb + f5.shortProb + f8.shortProb) / 3);
      const yPrice = longSide
        ? Math.min(max, last.high + atrVal * 0.28)
        : Math.max(min, last.low - atrVal * 0.28);
      out.push({
        id: `beam-confirm-${longSide ? 'long' : 'short'}`,
        kind: 'label',
        label: longSide ? '▲확' : '▼확',
        labelTooltip: `${longSide ? '롱' : '숏'}빔 합류 ${badgeProb}% (3·5·8봉 · 참고)`,
        x1: 0.96,
        y1: toRatio(yPrice, min, max),
        time1: last.time as number,
        price1: yPrice,
        confidence: Math.min(98, badgeProb + 4),
        color: longSide ? 'rgba(16,185,129,0.98)' : 'rgba(239,68,68,0.98)',
        labelBackgroundColor: 'rgba(8,12,20,0.92)',
        labelTextColor: '#f8fafc',
        category: 'labels',
        noProject: true,
      });
    }
  }

  return out;
}

/** Flutter식 반응구간 — 1띠만 (±0.25 ATR) */
export function buildCleanReactionZoneOverlay(params: {
  visible: Candle[];
  min: number;
  max: number;
  reactLevel: number;
  atrVal: number;
}): OverlayItem | null {
  const { visible, min, max, reactLevel, atrVal } = params;
  if (!(reactLevel > 0) || visible.length < 8) return null;
  const last = visible[visible.length - 1]!;
  const px = last.close;
  const bandHalf = atrVal > 0 ? atrVal * 0.25 : px * 0.0015;
  const top = reactLevel + bandHalf;
  const bot = reactLevel - bandHalf;
  if (!(top > bot)) return null;

  const bars = Math.min(28, Math.max(12, Math.floor(visible.length * 0.22)));
  const lastNorm = Math.max(1, visible.length - 1);
  const xStart = Math.max(0, (visible.length - bars) / lastNorm);
  const xEnd = Math.min(0.98, (visible.length - 1) / lastNorm);
  const t1 = Number(visible[Math.max(0, visible.length - bars)]!.time);
  const t2 = Number(last.time);

  return {
    id: 'reaction-zone-atr',
    kind: 'reactionZone',
    label: '반응',
    labelTooltip: `변동성 반응구간 ${bot.toFixed(0)}~${top.toFixed(0)} (±0.25 ATR · 참고)`,
    x1: xStart,
    y1: toRatio(top, min, max),
    x2: xEnd,
    y2: toRatio(bot, min, max),
    time1: t1,
    time2: t2,
    price1: top,
    price2: bot,
    confidence: 76,
    color: C.reactionZoneEntry,
    category: 'reactionZone',
    zoneFillPreserve: true,
    zoneSpanOnly: true,
    overlayZoneExtraClass: 'overlay-zone--clean-reaction',
  };
}

/** 타이롱 지지·저항(짧은 라벨) + Tyron 미래 점선 경로 */
export function buildCleanTailongOverlays(params: {
  visible: Candle[];
  timeframe: string;
  min: number;
  max: number;
  support: number;
  resistance: number;
  breakPrice: number;
  breakDirection: 'bullish' | 'bearish';
  tyron?: TyronProResult | null;
}): OverlayItem[] {
  const { visible, timeframe, min, max, support, resistance, breakPrice, breakDirection, tyron } =
    params;
  const out: OverlayItem[] = [];
  const last = visible[visible.length - 1];
  if (!last) return out;

  const pushLevel = (id: string, price: number, label: string, color: string) => {
    if (!(price > 0) || price < min || price > max) return;
    out.push({
      id,
      kind: 'keyLevel',
      label,
      labelTooltip: `타이롱 ${label} ${price.toFixed(2)} (참고)`,
      x1: 0.02,
      y1: toRatio(price, min, max),
      x2: 0.98,
      y2: toRatio(price, min, max),
      time1: Number(visible[Math.max(0, visible.length - 24)]!.time),
      time2: Number(last.time),
      price1: price,
      price2: price,
      confidence: 70,
      color,
      category: 'keyLevel',
      lineStrokeWidth: 1.25,
      lineDash: id.includes('break') ? '5 4' : undefined,
    });
  };

  // 과밀 방지: 현재가 기준 가까운 쪽 지지/저항 1개 + 돌파 1개
  const mid = last.close;
  const nearSup = support > 0 && Math.abs(mid - support) <= Math.abs(mid - resistance);
  if (nearSup && support > 0) pushLevel('tailong-support', support, '지지', C.tailongSupport);
  else if (resistance > 0) pushLevel('tailong-resistance', resistance, '저항', C.tailongResistance);
  if (breakPrice > 0) {
    pushLevel(
      'tailong-break',
      breakPrice,
      '돌파',
      breakDirection === 'bullish' ? C.tailongBreakBullish : C.tailongBreakBearish
    );
  }

  if (!tyron || tyron.bias === 'NEUTRAL' || tyron.confidence < 28 || !tyron.pathMain.length) {
    return out;
  }

  const step = barMs(timeframe, visible);
  const t0 = Number(last.time);
  const px0 = last.close;
  const prices = tyron.pathMain.map((r) => px0 * (1 + r));
  // 4세그먼트만 — 점선 경로
  const idxs = [0, 3, 6, 9, Math.min(prices.length - 1, 11)].filter(
    (v, i, a) => v < prices.length && (i === 0 || v > a[i - 1]!)
  );
  const color =
    tyron.bias === 'LONG' ? 'rgba(74,222,128,0.72)' : 'rgba(248,113,113,0.72)';

  for (let i = 0; i < idxs.length - 1; i++) {
    const a = idxs[i]!;
    const b = idxs[i + 1]!;
    out.push({
      id: `tailong-path-${i}`,
      kind: 'trendLine',
      label: i === 0 ? (tyron.bias === 'LONG' ? '경로▲' : '경로▼') : '',
      labelTooltip: `타이롱 경로 ${tyron.bias} · 신뢰 ${tyron.confidence}% · ${tyron.reasons.join('·')} (확정 아님)`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t0 + a * step,
      time2: t0 + b * step,
      price1: prices[a]!,
      price2: prices[b]!,
      confidence: tyron.confidence,
      color,
      lineDash: '5 4',
      lineStrokeWidth: 1.4,
      noProject: true,
      category: 'tailongPath',
      overlayZoneExtraClass: 'merged-desk-tailong-path',
    });
  }

  return out;
}

/** analyze / 통합데스크 공통 엔트리 */
export function buildCleanCandleFeatureOverlays(params: {
  visible: Candle[];
  timeframe: string;
  min: number;
  max: number;
  atrVal: number;
  trend: 'bullish' | 'bearish' | 'range';
  beamForecasts: CleanBeamForecast[];
  reactLevel: number;
  support: number;
  resistance: number;
  breakPrice: number;
  breakDirection: 'bullish' | 'bearish';
  includeBeam?: boolean;
  includeReaction?: boolean;
  includeTailong?: boolean;
}): OverlayItem[] {
  const last = params.visible[params.visible.length - 1];
  if (!last) return [];
  const out: OverlayItem[] = [];

  if (params.includeBeam !== false) {
    out.push(
      ...buildCleanBeamOverlays({
        last,
        min: params.min,
        max: params.max,
        atrVal: params.atrVal,
        trend: params.trend,
        forecasts: params.beamForecasts,
      })
    );
  }

  if (params.includeReaction !== false) {
    const rz = buildCleanReactionZoneOverlay({
      visible: params.visible,
      min: params.min,
      max: params.max,
      reactLevel: params.reactLevel,
      atrVal: params.atrVal,
    });
    if (rz) out.push(rz);
  }

  if (params.includeTailong !== false) {
    const tyron = analyzeTyronPro(params.visible, { pathLen: 12 });
    out.push(
      ...buildCleanTailongOverlays({
        visible: params.visible,
        timeframe: params.timeframe,
        min: params.min,
        max: params.max,
        support: params.support,
        resistance: params.resistance,
        breakPrice: params.breakPrice,
        breakDirection: params.breakDirection,
        tyron,
      })
    );
  }

  return out;
}
