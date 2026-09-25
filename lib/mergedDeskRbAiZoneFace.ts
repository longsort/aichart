/**
 * AI 파랑·빨강 띠 — Zone전투·Mirage수급·HotZone·기관밴드·로컬 MTF를 채널 면으로 합류.
 * 차트 % 숫자 나열 금지 · 면 색·짧은 토큰. 확정 수익·승률 보장 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { SmcZoneBattleVerdict } from '@/lib/assets353SmcZoneConflictIntel';
import { pickNearestSmcZoneBattle } from '@/lib/assets353SmcZoneConflictIntel';
import { computeZoneBattleForTfRange } from '@/lib/assets353SmcZoneBattleMtf';
import type {
  MergedDeskChannelEdgeRead,
  MergedDeskChannelPrimaryDecision,
} from '@/lib/mergedDeskChannelMoneyEdge';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MirageZoneProactiveIntel } from '@/lib/mergedDeskMirageZoneExchangeIntel';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import {
  computeInstitutionalSuperTrendMeta,
  getLastInstitutionalBandEdges,
} from '@/lib/institutionalSuperBand';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';

export type RbAiZoneFaceState =
  | 'mtfConflict'
  | 'breakoutPossible'
  | 'breakoutAttempt'
  | 'settled'
  | 'failRiskHigh'
  | 'volumeHeavy'
  | 'sellHeavy'
  | 'buyHeavy'
  | 'holdSupport'
  | 'holdResist'
  | 'battleLong'
  | 'battleShort'
  | 'battleMixed'
  | 'hotConfluence'
  | 'stSupport'
  | 'stResist';

export type MergedDeskRbAiZoneFacePack = {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  states: RbAiZoneFaceState[];
  battle: SmcZoneBattleVerdict | null;
  summaryKo: string;
  scoreBoost: number;
  scoreReasonsKo: string[];
};

const STATE_SIGNAL_KO: Record<RbAiZoneFaceState, string> = {
  mtfConflict: '상위역방향',
  breakoutPossible: '돌파가능',
  breakoutAttempt: '돌파중',
  settled: '안착',
  failRiskHigh: '실패위험',
  volumeHeavy: '거래과다',
  sellHeavy: '매도강',
  buyHeavy: '매수강',
  holdSupport: '지지면',
  holdResist: '저항면',
  battleLong: '롱우세',
  battleShort: '숏우세',
  battleMixed: '혼조',
  hotConfluence: 'Hot합류',
  stSupport: '기관지지',
  stResist: '기관저항',
};

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

const PARENT_TF: Record<string, string> = {
  '1m': '15m',
  '3m': '15m',
  '5m': '15m',
  '15m': '1h',
  '1h': '4h',
  '4h': '1d',
  '1d': '1w',
  '1w': '1M',
};

const PARENT_TF_KO: Record<string, string> = {
  '15m': '15분',
  '1h': '1시간',
  '4h': '4시간',
  '1d': '일봉',
  '1w': '주봉',
  '1M': '월봉',
};

const TF_KO: Record<string, string> = {
  '1m': '1분',
  '3m': '3분',
  '5m': '5분',
  '15m': '15분',
  '1h': '1시간',
  '4h': '4시간',
  '1d': '일봉',
  '1w': '주봉',
  '1M': '월봉',
};

function tfLabelKo(tf: string): string {
  const n = normalizeChartTimeframe(tf);
  return TF_KO[n] || n;
}

function atrLocal(candles: Candle[]): number {
  const n = candles.length;
  const last = Number(candles[n - 1]?.close) || 0;
  if (n < 3) return last > 0 ? last * 0.008 : 1;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    const pc = Number(candles[i - 1]!.close);
    if (![h, l, pc].every((x) => Number.isFinite(x) && x > 0)) continue;
    s += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    c += 1;
  }
  return c > 0 ? s / c : last > 0 ? last * 0.008 : 1;
}

function hugLastBars(candles: Candle[], bars: number): { lo: number; hi: number; t1: number; t2: number } {
  const n = candles.length;
  const i0 = Math.max(0, n - Math.max(2, bars));
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = i0; i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    if (Number.isFinite(h)) hi = Math.max(hi, h);
    if (Number.isFinite(l)) lo = Math.min(lo, l);
  }
  const t1 = Number(candles[i0]!.time);
  const t2 = Number(candles[n - 1]!.time);
  if (!(hi > lo)) {
    const c = Number(candles[n - 1]?.close) || 0;
    const pad = Math.max(Math.abs(c) * 0.0008, 1e-8);
    return { lo: c - pad, hi: c + pad, t1, t2 };
  }
  return { lo, hi, t1, t2 };
}

function clampHug(lo: number, hi: number, center: number, maxH: number): { lo: number; hi: number } {
  if (!(maxH > 0)) return { lo, hi };
  if (hi - lo <= maxH) return { lo, hi };
  const half = maxH / 2;
  return { lo: center - half, hi: center + half };
}

function rbNamedFaceZone(p: {
  id: string;
  faceBase: string;
  faceSignal: string;
  detailKo: string;
  t1: number;
  t2: number;
  lo: number;
  hi: number;
  color: string;
  extraClass: string;
  bias: 'bullish' | 'bearish';
  confidence?: number;
  bg?: string;
}): OverlayItem {
  return {
    id: p.id,
    kind: 'zone',
    category: 'chartPrimeTrendChannels',
    label: `${p.faceBase}·${p.faceSignal}`,
    zoneFaceBase: p.faceBase,
    zoneFaceSignal: p.faceSignal,
    zoneFaceDetailKo: p.detailKo,
    zoneFaceLang: 'ko',
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    time1: p.t1,
    time2: p.t2,
    price1: p.hi,
    price2: p.lo,
    confidence: p.confidence ?? 72,
    color: p.color,
    zoneFillPreserve: true,
    zoneSpanOnly: true,
    structureBias: p.bias,
    overlayZoneExtraClass: p.extraClass,
    labelTooltip: p.detailKo,
    labelBackgroundColor: p.bg,
    labelTextColor: '#f8fafc',
    noProject: true,
  };
}

function resampleToTf(candles: Candle[], targetTf: string): Candle[] {
  const bucketMs = TF_MS[normalizeChartTimeframe(targetTf)];
  if (!bucketMs || candles.length < 4) return [];
  const buckets = new Map<number, Candle[]>();
  for (const c of candles) {
    const tMs = Number(c.time) * 1000;
    if (!Number.isFinite(tMs)) continue;
    const key = Math.floor(Math.floor(tMs / bucketMs) * bucketMs / 1000);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }
  const out: Candle[] = [];
  for (const [key, arr] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    arr.sort((a, b) => Number(a.time) - Number(b.time));
    const first = arr[0]!;
    const last = arr[arr.length - 1]!;
    out.push({
      time: key,
      open: first.open,
      high: Math.max(...arr.map((x) => x.high)),
      low: Math.min(...arr.map((x) => x.low)),
      close: last.close,
      volume: arr.reduce((s, x) => s + (Number(x.volume) > 0 ? Number(x.volume) : 0), 0),
    });
  }
  return out;
}

function priceOverlap(aLo: number, aHi: number, bLo: number, bHi: number): number {
  const ov = Math.min(aHi, bHi) - Math.max(aLo, bLo);
  return ov > 0 ? ov : 0;
}

function pickMirage(
  list: MirageZoneProactiveIntel[] | undefined,
  selected: MirageZoneProactiveIntel | null | undefined
): MirageZoneProactiveIntel | null {
  if (selected) return selected;
  if (!list?.length) return null;
  return list.find((x) => x.tapeLabelKo && x.tapeLabelKo !== '체결없음') ?? list[0] ?? null;
}

function resolveLocalMtf(params: {
  candles: Candle[];
  timeframe: string;
  tipLower: number;
  tipUpper: number;
  mtfAggregate?: SmcZoneBattleVerdict | null;
  zoneBattle?: SmcZoneBattleVerdict | null;
  zoneBattles?: SmcZoneBattleVerdict[] | null;
}): {
  chart: SmcZoneBattleVerdict | null;
  htf: SmcZoneBattleVerdict | null;
  htfTf: string | null;
  conflict: boolean;
  merged: SmcZoneBattleVerdict | null;
} {
  const tf = normalizeChartTimeframe(params.timeframe);
  const chart =
    params.zoneBattle ??
    (params.zoneBattles?.length
      ? pickNearestSmcZoneBattle(params.candles, params.zoneBattles)
      : null) ??
    computeZoneBattleForTfRange(params.candles, tf, params.tipLower, params.tipUpper, {});

  const parent = PARENT_TF[tf] ?? null;
  let htf: SmcZoneBattleVerdict | null = null;
  if (parent) {
    const bars = resampleToTf(params.candles, parent);
    if (bars.length >= 16) {
      htf = computeZoneBattleForTfRange(bars, parent, params.tipLower, params.tipUpper, {});
    }
  }

  const conflict = !!(
    chart &&
    htf &&
    chart.dominant !== 'NEUTRAL' &&
    htf.dominant !== 'NEUTRAL' &&
    chart.dominant !== htf.dominant
  );

  const merged = params.mtfAggregate ?? (conflict ? null : htf ?? chart);
  return { chart, htf, htfTf: parent, conflict, merged };
}

function deriveStates(params: {
  primary: MergedDeskChannelPrimaryDecision | null;
  edgeReads: MergedDeskChannelEdgeRead[];
  battle: SmcZoneBattleVerdict | null;
  volRatio: number;
  mirage: MirageZoneProactiveIntel | null;
  mtfConflict: boolean;
  hotAlign: 'with' | 'against' | 'none';
  stKind: 'support' | 'resist' | 'none';
}): RbAiZoneFaceState[] {
  const out: RbAiZoneFaceState[] = [];
  const edgeKo = params.primary?.stateKo;
  const read = params.edgeReads.find((r) => r.geom.horizon === params.primary?.horizon);

  if (params.mtfConflict) out.push('mtfConflict');
  if (edgeKo === '돌파가능') out.push('breakoutPossible');
  if (edgeKo === '돌파') out.push('breakoutAttempt');
  if (edgeKo === '안착확정') out.push('settled');
  if (edgeKo === '돌파실패') out.push('failRiskHigh');
  if (edgeKo === '지지가능') out.push('holdSupport');
  if (edgeKo === '저항가능') out.push('holdResist');
  if (read?.upperSettle === 'failed' || read?.lowerSettle === 'failed') {
    if (!out.includes('failRiskHigh')) out.push('failRiskHigh');
  }

  const b = params.battle;
  if (b && !params.mtfConflict) {
    if (b.breakoutPct >= 55 && !out.includes('breakoutPossible') && edgeKo !== '돌파실패') {
      out.push('breakoutPossible');
    }
    if (b.sellStrength === 'strong') out.push('sellHeavy');
    if (b.buyStrength === 'strong') out.push('buyHeavy');
    if (b.dominant === 'LONG') out.push('battleLong');
    else if (b.dominant === 'SHORT') out.push('battleShort');
    else out.push('battleMixed');
    if (b.reasonsKo.some((r) => /거래량|수급/.test(r)) && params.volRatio >= 1.45) {
      out.push('volumeHeavy');
    }
    if (
      b.breakoutPct >= 50 &&
      ((b.dominant === 'LONG' && b.sellStrength === 'strong') ||
        (b.dominant === 'SHORT' && b.buyStrength === 'strong'))
    ) {
      if (!out.includes('failRiskHigh')) out.push('failRiskHigh');
    }
  } else if (b && params.mtfConflict) {
    out.push('battleMixed');
  }

  const m = params.mirage;
  if (m) {
    const tape = String(m.tapeLabelKo || '');
    const bias = String(m.bidAskBiasKo || '');
    if (/매도/.test(tape) || /매도/.test(bias)) out.push('sellHeavy');
    if (/매수/.test(tape) || /매수/.test(bias)) out.push('buyHeavy');
    if (
      (m.phaseProbPct != null && m.phaseProbPct >= 58) ||
      /거래|수급|분산|매집/.test(String(m.phaseLabelKo || ''))
    ) {
      out.push('volumeHeavy');
    }
    if (/깨짐|실패|이탈/.test(String(m.phaseLabelKo || '')) || (m.deepFaceKo ?? []).some((x) => /실패|깨짐/.test(x))) {
      if (!out.includes('failRiskHigh')) out.push('failRiskHigh');
    }
  }

  if (params.volRatio >= 1.8) out.push('volumeHeavy');
  if (params.hotAlign !== 'none') out.push('hotConfluence');
  if (params.stKind === 'support') out.push('stSupport');
  if (params.stKind === 'resist') out.push('stResist');

  const rank: RbAiZoneFaceState[] = [
    'mtfConflict',
    'failRiskHigh',
    'breakoutAttempt',
    'breakoutPossible',
    'settled',
    'sellHeavy',
    'buyHeavy',
    'volumeHeavy',
    'hotConfluence',
    'stSupport',
    'stResist',
    'holdSupport',
    'holdResist',
    'battleLong',
    'battleShort',
    'battleMixed',
  ];
  return rank.filter((s) => new Set(out).has(s)).slice(0, 5);
}

function scoreBoostFromEvidence(params: {
  states: RbAiZoneFaceState[];
  primary: MergedDeskChannelPrimaryDecision | null;
  battle: SmcZoneBattleVerdict | null;
  mtfConflict: boolean;
  hotAlign: 'with' | 'against' | 'none';
  stKind: 'support' | 'resist' | 'none';
  mirage: MirageZoneProactiveIntel | null;
}): { boost: number; reasonsKo: string[] } {
  let boost = 0;
  const reasonsKo: string[] = [];
  const { primary, states, battle } = params;
  if (!primary || primary.direction === 'NEUTRAL') return { boost: 0, reasonsKo };

  if (params.mtfConflict) {
    boost -= 14;
    reasonsKo.push('상위TF역방향·대기우선');
  }
  if (states.includes('volumeHeavy')) {
    boost += params.mtfConflict ? 2 : 6;
    reasonsKo.push('거래과다·수급합류');
  }
  if (states.includes('breakoutPossible') && !params.mtfConflict) {
    boost += 8;
    reasonsKo.push('돌파가능·자동분석');
  }
  if (states.includes('failRiskHigh')) {
    boost -= 12;
    reasonsKo.push('돌파실패위험');
  }
  if (params.hotAlign === 'with') {
    boost += 7;
    reasonsKo.push('HotZone합류');
  } else if (params.hotAlign === 'against') {
    boost -= 7;
    reasonsKo.push('HotZone역방향');
  }
  if (params.stKind === 'support' && primary.direction === 'LONG') {
    boost += 6;
    reasonsKo.push('기관밴드지지');
  } else if (params.stKind === 'resist' && primary.direction === 'SHORT') {
    boost += 6;
    reasonsKo.push('기관밴드저항');
  } else if (params.stKind === 'resist' && primary.direction === 'LONG') {
    boost -= 5;
    reasonsKo.push('기관저항·롱주의');
  } else if (params.stKind === 'support' && primary.direction === 'SHORT') {
    boost -= 5;
    reasonsKo.push('기관지지·숏주의');
  }
  if (params.mirage?.tapeLabelKo) {
    const t = params.mirage.tapeLabelKo;
    if (primary.direction === 'LONG' && /매수우세|매수압력/.test(t)) {
      boost += 5;
      reasonsKo.push('Mirage매수우세');
    } else if (primary.direction === 'SHORT' && /매도우세|매도압력/.test(t)) {
      boost += 5;
      reasonsKo.push('Mirage매도우세');
    } else if (primary.direction === 'LONG' && /매도/.test(t)) {
      boost -= 5;
      reasonsKo.push('Mirage매도압력');
    } else if (primary.direction === 'SHORT' && /매수/.test(t)) {
      boost -= 5;
      reasonsKo.push('Mirage매수압력');
    }
  }
  if (battle && !params.mtfConflict) {
    if (primary.direction === battle.dominant) {
      boost += 7;
      reasonsKo.push('Zone전투동방');
    } else if (battle.dominant !== 'NEUTRAL') {
      boost -= 8;
      reasonsKo.push('Zone전투역방향');
    }
  }
  return { boost, reasonsKo: reasonsKo.slice(0, 6) };
}

export type MergedDeskRbAiZoneFaceInput = {
  candles: Candle[];
  timeframe: string;
  geoms: MergedDeskChannelGeom[];
  edgeReads: MergedDeskChannelEdgeRead[];
  primary: MergedDeskChannelPrimaryDecision | null;
  volRatio: number;
  zoneBattle?: SmcZoneBattleVerdict | null;
  zoneBattles?: SmcZoneBattleVerdict[] | null;
  mtfAggregate?: SmcZoneBattleVerdict | null;
  mirageIntel?: MirageZoneProactiveIntel | null;
  mirageIntelList?: MirageZoneProactiveIntel[];
  hotZones?: MergedDeskHotZoneEntry[];
};

export function buildMergedDeskRbAiZoneFacePack(
  params: MergedDeskRbAiZoneFaceInput
): MergedDeskRbAiZoneFacePack {
  const empty: MergedDeskRbAiZoneFacePack = {
    overlays: [],
    priceLines: [],
    states: [],
    battle: null,
    summaryKo: '',
    scoreBoost: 0,
    scoreReasonsKo: [],
  };
  const { candles, geoms, primary } = params;
  if (candles.length < 12 || !geoms.length) return empty;

  const g =
    (primary ? geoms.find((x) => x.horizon === primary.horizon) : null) ??
    geoms.find((x) => x.primary) ??
    geoms[0]!;
  const tipUpper = g.tipUpper;
  const tipLower = g.tipLower;
  if (!(tipUpper > tipLower)) return empty;

  const mtf = resolveLocalMtf({
    candles,
    timeframe: params.timeframe,
    tipLower,
    tipUpper,
    mtfAggregate: params.mtfAggregate,
    zoneBattle: params.zoneBattle,
    zoneBattles: params.zoneBattles,
  });
  const battle = mtf.merged ?? mtf.chart;
  const mirage = pickMirage(params.mirageIntelList, params.mirageIntel);

  const close = Number(candles[candles.length - 1]?.close) || 0;
  let hotAlign: 'with' | 'against' | 'none' = 'none';
  for (const z of params.hotZones ?? []) {
    if (priceOverlap(tipLower, tipUpper, z.bot, z.top) <= 0) continue;
    if (!primary || primary.direction === 'NEUTRAL') {
      hotAlign = 'with';
      break;
    }
    hotAlign = z.side === primary.direction ? 'with' : 'against';
    if (hotAlign === 'with') break;
  }

  const meta = computeInstitutionalSuperTrendMeta(candles);
  const edges = getLastInstitutionalBandEdges(candles);
  const stLine =
    meta?.lastDir === 'long'
      ? edges?.lower
      : meta?.lastDir === 'short'
        ? edges?.upper
        : meta?.lastLinePrice;
  let stKind: 'support' | 'resist' | 'none' = 'none';
  if (stLine != null && stLine >= tipLower && stLine <= tipUpper) {
    stKind = meta?.lastDir === 'long' ? 'support' : meta?.lastDir === 'short' ? 'resist' : 'none';
  } else if (stLine != null && close > 0) {
    const dist = Math.abs(close - stLine) / Math.max(tipUpper - tipLower, 1e-8);
    if (dist <= 0.35) {
      stKind = meta?.lastDir === 'long' ? 'support' : meta?.lastDir === 'short' ? 'resist' : 'none';
    }
  }

  const states = deriveStates({
    primary,
    edgeReads: params.edgeReads,
    battle,
    volRatio: params.volRatio,
    mirage,
    mtfConflict: mtf.conflict,
    hotAlign,
    stKind,
  });

  const { boost, reasonsKo } = scoreBoostFromEvidence({
    states,
    primary,
    battle,
    mtfConflict: mtf.conflict,
    hotAlign,
    stKind,
    mirage,
  });

  const n = candles.length;
  const chartTf = normalizeChartTimeframe(params.timeframe);
  const chartTfKo = tfLabelKo(chartTf);
  const htfTf = mtf.htfTf;
  const htfKo = htfTf ? tfLabelKo(htfTf) : PARENT_TF_KO[PARENT_TF[chartTf] || ''] || '상위';
  const ltfHug = hugLastBars(candles, chartTf === '1m' || chartTf === '3m' ? 6 : 8);
  const htfBars = htfTf ? resampleToTf(candles, htfTf) : [];
  const htfRaw = htfBars.length >= 2 ? hugLastBars(htfBars, 2) : ltfHug;
  const ltfCenter = (ltfHug.lo + ltfHug.hi) / 2;
  const htfCenter = (htfRaw.lo + htfRaw.hi) / 2;
  const tLast = Number(candles[n - 1]!.time);

  const htfDom =
    mtf.htf?.dominant === 'LONG' || mtf.htf?.dominant === 'SHORT'
      ? mtf.htf.dominant
      : htfBars.length
        ? Number(htfBars[htfBars.length - 1]!.close) >= Number(htfBars[htfBars.length - 1]!.open)
          ? 'LONG'
          : 'SHORT'
        : g.descending
          ? 'SHORT'
          : 'LONG';
  const ltfDom =
    mtf.chart?.dominant === 'LONG' || mtf.chart?.dominant === 'SHORT'
      ? mtf.chart.dominant
      : Number(candles[n - 1]!.close) >= Number(candles[n - 1]!.open)
        ? 'LONG'
        : 'SHORT';
  const htfBear = htfDom === 'SHORT';
  const ltfBull = ltfDom === 'LONG';

  const signalKo = mtf.conflict
    ? `${htfKo}역·${chartTfKo}${ltfBull ? '상승' : '하락'}`
    : states.map((s) => STATE_SIGNAL_KO[s]).join('·');

  const detailParts = [
    mtf.conflict
      ? `${chartTfKo} ${ltfBull ? '상승' : '하락'} · ${htfKo} ${
          htfBear ? '하락' : '상승'
        } — 상위 구조 우선, 하위는 되돌림·대기`
      : `${htfKo}면·${chartTfKo}면 짧은 이름존(채널 띠 유지)`,
    battle?.detailKo,
    battle?.headlineKo,
    primary?.captionKo,
    mirage?.detailKo,
    mirage ? `수급 ${mirage.tapeLabelKo} · 호가 ${mirage.bidAskBiasKo} · ${mirage.phaseLabelKo}` : '',
    ...reasonsKo,
    ...(battle?.reasonsKo ?? []).slice(0, 3),
    `vol×${params.volRatio.toFixed(2)}`,
    '확정 수익·승률 보장 아님',
  ].filter(Boolean);

  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const atr = atrLocal(candles);
  const chartBarMs = TF_MS[chartTf] || 60_000;
  const htfBarMs = htfTf ? TF_MS[htfTf] : 0;
  const htfSpanBars =
    htfBarMs > 0
      ? Math.max(10, Math.min(24, Math.round((2 * htfBarMs) / chartBarMs)))
      : 16;
  const htfTime = hugLastBars(candles, htfSpanBars);
  const edgeTime = hugLastBars(candles, 5);
  const tip = detailParts.join('\n');
  const stateCls = [
    mtf.conflict ? 'merged-desk-rb-ai-face--mtfConflict' : '',
    ...states.slice(0, 3).map((s) => `merged-desk-rb-ai-face--${s}`),
  ]
    .filter(Boolean)
    .join(' ');

  if (htfTf) {
    const htfP = clampHug(htfRaw.lo, htfRaw.hi, htfCenter, Math.max(atr * 1.45, Math.abs(htfCenter) * 0.0012));
    overlays.push(
      rbNamedFaceZone({
        id: `merged-desk-rb-ai-htf-${g.horizon}`,
        faceBase: `${htfKo}면`,
        faceSignal: htfBear ? '하락' : '상승',
        detailKo: tip,
        t1: htfTime.t1,
        t2: tLast,
        lo: htfP.lo,
        hi: htfP.hi,
        color: htfBear ? 'rgba(251,113,133,0.32)' : 'rgba(16,185,129,0.48)',
        extraClass: [
          'merged-desk-rb-channel',
          'merged-desk-rb-ai-face',
          'merged-desk-rb-ai-htf',
          htfBear ? 'merged-desk-rb-ai-face--down' : 'merged-desk-rb-ai-face--up',
          mtf.conflict ? 'merged-desk-rb-ai-face--mtfConflict' : '',
        ]
          .filter(Boolean)
          .join(' '),
        bias: htfBear ? 'bearish' : 'bullish',
        bg: htfBear ? 'rgba(127,29,29,0.96)' : 'rgba(4,120,87,0.98)',
        confidence: 78,
      })
    );
  }

  const ltfP = clampHug(
    ltfHug.lo,
    ltfHug.hi,
    ltfCenter > 0 ? ltfCenter : close,
    Math.max(atr * 1.15, Math.abs(close) * 0.001)
  );
  overlays.push(
    rbNamedFaceZone({
      id: `merged-desk-rb-ai-ltf-${g.horizon}`,
      faceBase: `${chartTfKo}면`,
      faceSignal: ltfBull ? '반등' : '하락',
      detailKo: tip,
      t1: ltfHug.t1,
      t2: tLast,
      lo: ltfP.lo,
      hi: ltfP.hi,
      color: ltfBull ? 'rgba(34,197,94,0.46)' : 'rgba(248,113,113,0.28)',
      extraClass: [
        'merged-desk-rb-channel',
        'merged-desk-rb-ai-face',
        'merged-desk-rb-ai-ltf',
        ltfBull ? 'merged-desk-rb-ai-face--up' : 'merged-desk-rb-ai-face--down',
        stateCls,
      ]
        .filter(Boolean)
        .join(' '),
      bias: ltfBull ? 'bullish' : 'bearish',
      bg: ltfBull ? 'rgba(4,120,87,0.98)' : 'rgba(127,29,29,0.94)',
      confidence: 80,
    })
  );

  if (states.includes('sellHeavy') || states.includes('buyHeavy')) {
    const sell =
      states.includes('sellHeavy') && !states.includes('buyHeavy')
        ? true
        : states.includes('buyHeavy') && !states.includes('sellHeavy')
          ? false
          : (mirage?.tapeLabelKo || '').includes('매도');
    const edgePx = sell ? tipUpper : tipLower;
    const edgePad = Math.max(atr * 0.22, Math.abs(edgePx) * 0.00035);
    overlays.push(
      rbNamedFaceZone({
        id: `merged-desk-rb-ai-edge-${sell ? 'sell' : 'buy'}`,
        faceBase: sell ? '매도면' : '매수면',
        faceSignal: sell ? '매도강' : '매수강',
        detailKo: sell
          ? '채널 상단 매도 수급(Mirage·Zone전투) · 확정 아님'
          : '채널 하단 매수 수급(Mirage·Zone전투) · 확정 아님',
        t1: edgeTime.t1,
        t2: tLast,
        lo: edgePx - edgePad,
        hi: edgePx + edgePad,
        color: sell ? 'rgba(248,113,113,0.28)' : 'rgba(74,222,128,0.28)',
        extraClass: [
          'merged-desk-rb-channel',
          'merged-desk-rb-ai-face',
          'merged-desk-rb-ai-edge',
          sell ? 'merged-desk-rb-ai-face--sellHeavy' : 'merged-desk-rb-ai-face--buyHeavy',
        ].join(' '),
        bias: sell ? 'bearish' : 'bullish',
        bg: sell ? 'rgba(127,29,29,0.94)' : 'rgba(20,83,45,0.95)',
        confidence: 76,
      })
    );
  }

  if (
    stLine != null &&
    stKind !== 'none' &&
    stLine >= tipLower - (tipUpper - tipLower) &&
    stLine <= tipUpper + (tipUpper - tipLower)
  ) {
    const stPad = Math.max(atr * 0.18, Math.abs(stLine) * 0.0003);
    overlays.push(
      rbNamedFaceZone({
        id: `merged-desk-rb-ai-st-${stKind}`,
        faceBase: stKind === 'support' ? '기관지지' : '기관저항',
        faceSignal: stKind === 'support' ? 'ST지지' : 'ST저항',
        detailKo: `기관밴드 ${stKind === 'support' ? '지지' : '저항'} · 채널 tip 합류 · 확정 아님`,
        t1: edgeTime.t1,
        t2: tLast,
        lo: stLine - stPad,
        hi: stLine + stPad,
        color: stKind === 'support' ? 'rgba(45,212,191,0.24)' : 'rgba(244,114,182,0.24)',
        extraClass: [
          'merged-desk-rb-channel',
          'merged-desk-rb-ai-face',
          'merged-desk-rb-ai-st',
          stKind === 'support' ? 'merged-desk-rb-ai-face--stSupport' : 'merged-desk-rb-ai-face--stResist',
        ].join(' '),
        bias: stKind === 'support' ? 'bullish' : 'bearish',
        bg: stKind === 'support' ? 'rgba(13,148,136,0.92)' : 'rgba(190,24,93,0.92)',
        confidence: 70,
      })
    );
  }

  const summaryKo = mtf.conflict
    ? `${htfKo}면·${chartTfKo}면 역방향 · 대기우선`
    : `${htfKo}면·${chartTfKo}면 · ${signalKo}`;

  return {
    overlays,
    priceLines,
    states,
    battle,
    summaryKo,
    scoreBoost: boost,
    scoreReasonsKo: reasonsKo,
  };
}
