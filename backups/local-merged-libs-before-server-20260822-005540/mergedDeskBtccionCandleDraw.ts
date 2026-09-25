/**
 * 통합·분석 — btccion 작도 (라인·레일 디자인).
 *
 * zone 면(빨강/초록 네모) 없음. 가격에 붙은 가로선·점선·캔들 핀만.
 *
 *  1) 반응 상·하·중 레일 3선
 *  2) 돌파 점선 1
 *  3) 무효 점선 1
 *  4) 헌트 외곽 점선 2
 *  5) MB± 상·하 점선 (있을 때만)
 *  6) 구간분류 짧은 레일+라벨
 *  7) 타이롱 경로 ≤4
 *  8) 빔 핀 ≤2
 */
import type { Candle, OverlayItem } from '@/types';
import { atrSeries } from '@/lib/indicators';
import { normalizeChartTimeframe } from '@/lib/constants';
import { analyzeTyronPro } from '@/lib/cleanCandleFeatureDraw';

export const MERGED_DESK_BTCCION_ID_PREFIX = 'merged-desk-btccion-';

export function isMergedDeskBtccionOverlayId(id: string | undefined | null): boolean {
  return String(id || '').startsWith(MERGED_DESK_BTCCION_ID_PREFIX);
}

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
};

function barMs(tf: string, candles: Candle[]): number {
  const k = TF_MS[normalizeChartTimeframe(tf)];
  if (k) return k;
  if (candles.length >= 2) {
    const d = Math.abs(Number(candles[candles.length - 1]!.time) - Number(candles[candles.length - 2]!.time));
    if (d > 0) return d;
  }
  return 3_600_000;
}

function lastAtr(candles: Candle[], period = 14): number {
  const arr = atrSeries(candles, period);
  const v = arr[arr.length - 1];
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  const c = candles[candles.length - 1];
  return c ? c.close * 0.004 : 0;
}

function swingHighLow(candles: Candle[], look = 40): { hi: number; lo: number } {
  const slice = candles.slice(-Math.min(look, candles.length));
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of slice) {
    if (c.high > hi) hi = c.high;
    if (c.low < lo) lo = c.low;
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) {
    const last = candles[candles.length - 1]!;
    return { hi: last.high, lo: last.low };
  }
  return { hi, lo };
}

function computeStopHunt(params: {
  zoneLow: number;
  zoneHigh: number;
  atr: number;
  swingLow: number;
  swingHigh: number;
}): {
  huntLow: number;
  huntHigh: number;
  suggestedSlLong: number;
  suggestedSlShort: number;
  riskScore: number;
} {
  const zoneWidth = Math.abs(params.zoneHigh - params.zoneLow);
  const buffer = Math.max(params.atr * 1.0, zoneWidth * 0.2);
  const huntLow = Math.min(params.swingLow, params.zoneLow);
  const huntHigh = Math.max(params.swingHigh, params.zoneHigh);
  return {
    huntLow,
    huntHigh,
    suggestedSlLong: huntLow - buffer,
    suggestedSlShort: huntHigh + buffer,
    riskScore: Math.max(28, Math.min(88, Math.round(40 + (buffer / Math.max(params.atr, 1e-9)) * 12))),
  };
}

function classifyZoneLite(params: {
  price: number;
  reactLow: number;
  reactHigh: number;
  atr: number;
  trend: 'bullish' | 'bearish' | 'range';
  last: Candle;
}): { code: string; name: string; bias: 'LONG' | 'SHORT' | 'NEUTRAL'; strength: number } {
  const { price, reactLow, reactHigh, atr, trend, last } = params;
  const inBand = reactLow > 0 && reactHigh > 0 && price >= reactLow && price <= reactHigh;
  const rng = Math.max(1e-9, last.high - last.low);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const wickRisk = atr > 0 && (upperWick > atr * 0.85 || lowerWick > atr * 0.85);

  if (wickRisk && rng > atr * 1.2) {
    return { code: 'DANGER', name: '위험', bias: 'NEUTRAL', strength: 78 };
  }
  if (inBand && trend === 'bullish') {
    return { code: 'DEFENSE', name: '방어', bias: 'LONG', strength: 68 };
  }
  if (inBand && trend === 'bearish') {
    return { code: 'DISTRIBUTION_SELL', name: '분산', bias: 'SHORT', strength: 66 };
  }
  if (inBand && lowerWick >= atr * 0.4) {
    return { code: 'ABSORB_BUY', name: '흡수', bias: 'LONG', strength: 62 };
  }
  if (inBand && upperWick >= atr * 0.4) {
    return { code: 'DISTRIBUTION_SELL', name: '분산', bias: 'SHORT', strength: 60 };
  }
  if (trend === 'bullish') return { code: 'REBOUND', name: '반등', bias: 'LONG', strength: 55 };
  if (trend === 'bearish') return { code: 'PULLBACK', name: '되돌림', bias: 'SHORT', strength: 55 };
  return { code: 'NONE', name: '관망', bias: 'NEUTRAL', strength: 40 };
}

function detectMuMbZone(candles: Candle[], atr: number): { low: number; high: number; bias: 'bull' | 'bear' } | null {
  if (candles.length < 30 || !(atr > 0)) return null;
  const win = candles.slice(-24, -2);
  if (win.length < 10) return null;
  const boxHi = Math.max(...win.map((c) => c.high));
  const boxLo = Math.min(...win.map((c) => c.low));
  if (!(boxHi > boxLo)) return null;
  const last3 = candles.slice(-3);
  const sweptHigh = last3.some((c) => c.high > boxHi + atr * 0.15);
  const sweptLow = last3.some((c) => c.low < boxLo - atr * 0.15);
  const last = candles[candles.length - 1]!;
  if (sweptHigh && last.close < boxHi && last.close > boxLo) {
    return { low: boxLo, high: boxHi, bias: 'bear' };
  }
  if (sweptLow && last.close > boxLo && last.close < boxHi) {
    return { low: boxLo, high: boxHi, bias: 'bull' };
  }
  return null;
}

function displacementBeam(c: Candle, atr: number): 'LONG' | 'SHORT' | null {
  const rng = Math.max(1e-12, c.high - c.low);
  const body = Math.abs(c.close - c.open);
  const bodyPct = body / rng;
  const bull = c.close > c.open;
  const bear = c.close < c.open;
  const closeFromLow = (c.close - c.low) / rng;
  const closeFromHigh = (c.high - c.close) / rng;
  const bodyAtr = body / Math.max(atr, 1e-9);
  if (bull && bodyPct >= 0.48 && (closeFromLow >= 0.62 || bodyAtr >= 0.65)) return 'LONG';
  if (bear && bodyPct >= 0.48 && (closeFromHigh >= 0.62 || bodyAtr >= 0.65)) return 'SHORT';
  return null;
}

/** 가격 고정 가로 레일 — zone 면 없음 */
function railLine(opts: {
  id: string;
  label: string;
  tooltip: string;
  time1: number;
  time2: number;
  price: number;
  color: string;
  dash?: string;
  width?: number;
  extraClass?: string;
  confidence?: number;
}): OverlayItem {
  return {
    id: opts.id,
    kind: 'keyLevel',
    label: opts.label,
    labelTooltip: opts.tooltip,
    x1: 0.02,
    y1: 0.5,
    x2: 0.98,
    y2: 0.5,
    time1: opts.time1,
    time2: opts.time2,
    price1: opts.price,
    price2: opts.price,
    confidence: opts.confidence ?? 70,
    color: opts.color,
    category: 'keyLevel',
    lineDash: opts.dash,
    lineStrokeWidth: opts.width ?? 1.8,
    overlayZoneExtraClass: `merged-desk-btccion-line ${opts.extraClass || ''}`.trim(),
  };
}

export type MergedDeskBtccionDrawInput = {
  candles: Candle[];
  timeframe: string;
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';
  entry?: number | null;
  stopLoss?: number | null;
  breakLevel?: number | null;
  reactLevel?: number | null;
};

/**
 * btccion 라인·레일 작도 팩.
 * id: `merged-desk-btccion-*` — zone/reactionZone/demand/supply 면 없음.
 */
export function buildMergedDeskBtccionCandleDrawPack(
  input: MergedDeskBtccionDrawInput
): { overlays: OverlayItem[]; summaryKo: string } {
  const candles = input.candles;
  const n = candles.length;
  if (n < 40) return { overlays: [], summaryKo: '' };

  const tf = normalizeChartTimeframe(input.timeframe);
  const last = candles[n - 1]!;
  const atr = lastAtr(candles, 14);
  const { hi: swingHi, lo: swingLo } = swingHighLow(candles, 48);
  const dir =
    input.direction === 'LONG' || input.direction === 'SHORT'
      ? input.direction
      : last.close >= last.open
        ? 'LONG'
        : 'SHORT';
  const trend: 'bullish' | 'bearish' | 'range' =
    dir === 'LONG' ? 'bullish' : dir === 'SHORT' ? 'bearish' : 'range';

  const reactLevel =
    (input.reactLevel != null && input.reactLevel > 0
      ? input.reactLevel
      : input.entry != null && input.entry > 0
        ? input.entry
        : dir === 'LONG'
          ? swingLo
          : swingHi) || last.close;
  const bandHalf = atr > 0 ? atr * 0.25 : last.close * 0.0015;
  const reactLow = reactLevel - bandHalf;
  const reactHigh = reactLevel + bandHalf;

  const breakLevel =
    input.breakLevel != null && input.breakLevel > 0
      ? input.breakLevel
      : dir === 'LONG'
        ? swingHi
        : swingLo;

  const hunt = computeStopHunt({
    zoneLow: reactLow,
    zoneHigh: reactHigh,
    atr,
    swingLow: swingLo,
    swingHigh: swingHi,
  });

  const zoneClass = classifyZoneLite({
    price: last.close,
    reactLow,
    reactHigh,
    atr,
    trend,
    last,
  });

  const muMb = detectMuMbZone(candles, atr);
  const tyron = analyzeTyronPro(candles, { pathLen: 12 });

  const tEnd = Number(last.time);
  const tStart = Number(candles[Math.max(0, n - 36)]!.time);
  const tHunt = Number(candles[Math.max(0, n - 16)]!.time);
  const tMb = Number(candles[Math.max(0, n - 22)]!.time);
  const out: OverlayItem[] = [];

  // 1) 반응 밴드 = 상·중·하 레일 (면 없음) — 가시성 강화
  out.push(
    railLine({
      id: `${MERGED_DESK_BTCCION_ID_PREFIX}react-hi`,
      label: '반응상',
      tooltip: `반응상단 ${reactHigh.toFixed(2)} (±0.25ATR)`,
      time1: tStart,
      time2: tEnd,
      price: reactHigh,
      color: 'rgba(56,189,248,0.75)',
      dash: '2 4',
      width: 1.6,
      extraClass: 'merged-desk-btccion-line--react-edge',
      confidence: 68,
    }),
    railLine({
      id: `${MERGED_DESK_BTCCION_ID_PREFIX}react-mid`,
      label: `반응·${zoneClass.name}`,
      tooltip: `반응 ${reactLevel.toFixed(2)} · ${zoneClass.code} (참고)`,
      time1: tStart,
      time2: tEnd,
      price: reactLevel,
      color: 'rgba(14,165,233,1)',
      width: 2.6,
      extraClass: 'merged-desk-btccion-line--react',
      confidence: Math.min(94, 55 + zoneClass.strength / 2),
    }),
    railLine({
      id: `${MERGED_DESK_BTCCION_ID_PREFIX}react-lo`,
      label: '반응하',
      tooltip: `반응하단 ${reactLow.toFixed(2)} (±0.25ATR)`,
      time1: tStart,
      time2: tEnd,
      price: reactLow,
      color: 'rgba(56,189,248,0.75)',
      dash: '2 4',
      width: 1.6,
      extraClass: 'merged-desk-btccion-line--react-edge',
      confidence: 68,
    })
  );

  // 2) 돌파
  if (breakLevel > 0 && Math.abs(breakLevel - reactLevel) > atr * 0.15) {
    out.push(
      railLine({
        id: `${MERGED_DESK_BTCCION_ID_PREFIX}break`,
        label: '돌파',
        tooltip: `돌파/목표 ${breakLevel.toFixed(2)} (참고)`,
        time1: tStart,
        time2: tEnd,
        price: breakLevel,
        color: dir === 'LONG' ? 'rgba(74,222,128,0.92)' : 'rgba(248,113,113,0.92)',
        dash: '6 4',
        width: 2.0,
        extraClass: 'merged-desk-btccion-line--break',
        confidence: 72,
      })
    );
  }

  // 3) 무효
  const inv =
    input.stopLoss != null && input.stopLoss > 0
      ? input.stopLoss
      : dir === 'LONG'
        ? hunt.suggestedSlLong
        : hunt.suggestedSlShort;
  if (inv > 0) {
    out.push(
      railLine({
        id: `${MERGED_DESK_BTCCION_ID_PREFIX}inv`,
        label: '무효',
        tooltip: `무효/손절 ${inv.toFixed(2)} (참고)`,
        time1: tStart,
        time2: tEnd,
        price: inv,
        color: 'rgba(248,113,113,0.9)',
        dash: '4 5',
        width: 1.95,
        extraClass: 'merged-desk-btccion-line--inv',
        confidence: 78,
      })
    );
  }

  // 4) 헌트 = 상·하 외곽 점선 (면 없음)
  out.push(
    railLine({
      id: `${MERGED_DESK_BTCCION_ID_PREFIX}hunt-hi`,
      label: '헌트↑',
      tooltip: `스탑헌트 상단 ${hunt.huntHigh.toFixed(2)} · 위험 ${hunt.riskScore}`,
      time1: tHunt,
      time2: tEnd,
      price: hunt.huntHigh,
      color: 'rgba(251,146,60,0.85)',
      dash: '3 6',
      width: 1.5,
      extraClass: 'merged-desk-btccion-line--hunt',
      confidence: hunt.riskScore,
    }),
    railLine({
      id: `${MERGED_DESK_BTCCION_ID_PREFIX}hunt-lo`,
      label: '헌트↓',
      tooltip: `스탑헌트 하단 ${hunt.huntLow.toFixed(2)} · 위험 ${hunt.riskScore}`,
      time1: tHunt,
      time2: tEnd,
      price: hunt.huntLow,
      color: 'rgba(251,146,60,0.85)',
      dash: '3 6',
      width: 1.5,
      extraClass: 'merged-desk-btccion-line--hunt',
      confidence: hunt.riskScore,
    })
  );

  // 5) MB± = 상·하 점선만
  if (muMb) {
    const mbLabel = muMb.bias === 'bull' ? 'MB+' : 'MB-';
    const mbColor = muMb.bias === 'bull' ? 'rgba(250,204,21,0.88)' : 'rgba(251,146,60,0.88)';
    out.push(
      railLine({
        id: `${MERGED_DESK_BTCCION_ID_PREFIX}mumb-hi`,
        label: mbLabel,
        tooltip: `MU-MB ${muMb.low.toFixed(0)}~${muMb.high.toFixed(0)} (참고)`,
        time1: tMb,
        time2: tEnd,
        price: muMb.high,
        color: mbColor,
        dash: '5 4',
        width: 1.7,
        extraClass: 'merged-desk-btccion-line--mumb',
        confidence: 64,
      }),
      railLine({
        id: `${MERGED_DESK_BTCCION_ID_PREFIX}mumb-lo`,
        label: '',
        tooltip: `MU-MB 하단 ${muMb.low.toFixed(2)}`,
        time1: tMb,
        time2: tEnd,
        price: muMb.low,
        color: mbColor,
        dash: '5 4',
        width: 1.7,
        extraClass: 'merged-desk-btccion-line--mumb',
        confidence: 64,
      })
    );
  }

  // 6) 타이롱 경로
  if (tyron.bias !== 'NEUTRAL' && tyron.confidence >= 28 && tyron.pathMain.length) {
    const step = barMs(tf, candles);
    const prices = tyron.pathMain.map((r) => last.close * (1 + r));
    const idxs = [0, 3, 6, 9, Math.min(prices.length - 1, 11)].filter(
      (v, i, a) => v < prices.length && (i === 0 || v > a[i - 1]!)
    );
    const color = tyron.bias === 'LONG' ? 'rgba(74,222,128,0.75)' : 'rgba(248,113,113,0.75)';
    for (let i = 0; i < idxs.length - 1; i++) {
      const a = idxs[i]!;
      const b = idxs[i + 1]!;
      out.push({
        id: `${MERGED_DESK_BTCCION_ID_PREFIX}path-${i}`,
        kind: 'trendLine',
        label: i === 0 ? (tyron.bias === 'LONG' ? '경로▲' : '경로▼') : '',
        labelTooltip: `타이롱 ${tyron.bias} ${tyron.confidence}% · ${tyron.reasons.join('·')} (확정 아님)`,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: tEnd + a * step,
        time2: tEnd + b * step,
        price1: prices[a]!,
        price2: prices[b]!,
        confidence: tyron.confidence,
        color,
        lineDash: '5 4',
        lineStrokeWidth: 1.45,
        noProject: true,
        category: 'tailongPath',
        overlayZoneExtraClass: 'merged-desk-btccion-path',
      });
    }
  }

  // 7) 빔 핀
  let beamPins = 0;
  for (let i = n - 1; i >= Math.max(0, n - 10) && beamPins < 2; i--) {
    const c = candles[i]!;
    const beam = displacementBeam(c, atr);
    if (!beam) continue;
    const long = beam === 'LONG';
    out.push({
      id: `${MERGED_DESK_BTCCION_ID_PREFIX}beam-${c.time}`,
      kind: 'label',
      label: long ? '▲' : '▼',
      labelTooltip: `${long ? '롱' : '숏'}빔(변위봉) · 참고`,
      x1: 0,
      y1: 0,
      time1: Number(c.time),
      price1: long ? c.high + atr * 0.08 : c.low - atr * 0.08,
      confidence: 88,
      color: long ? 'rgba(74,222,128,0.95)' : 'rgba(248,113,113,0.95)',
      labelBackgroundColor: 'rgba(8,12,20,0.88)',
      labelTextColor: '#f8fafc',
      category: 'labels',
      noProject: true,
      overlayZoneExtraClass: 'merged-desk-btccion-beam',
    });
    beamPins++;
  }

  const summaryKo = [
    `반응레일 ${reactLow.toFixed(0)}~${reactHigh.toFixed(0)}`,
    zoneClass.name,
    breakLevel > 0 ? `돌파 ${breakLevel.toFixed(0)}` : null,
    inv > 0 ? `무효 ${inv.toFixed(0)}` : null,
    tyron.bias !== 'NEUTRAL' ? `경로 ${tyron.bias}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return { overlays: out, summaryKo };
}
