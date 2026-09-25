/**
 * 거래량 터짐 + 가격 구간 일치 → 과거(비트겟 상장~) 통계 · 미래 롱/숏 참고.
 */
import type { Candle } from '@/types';
import { extractVolumePhaseEvents, type VolumePhaseEvent } from '@/lib/volumePhaseCatalog';
import { computeVolumeShockForecast } from '@/lib/volumeShockForecast';
import { evalBarVolumeShock, RVOL_SHOCK_MIN } from '@/lib/volumeShockMetrics';
import { phaseHorizonsForTf, volumePhaseStatsTfLabel, VOLUME_PHASE_STATS_TIMEFRAMES } from '@/lib/volumePhaseTimeframes';

const SAMPLE_TRUST_MIN = 12;
const FLAT_PCT = 0.12;

export type VolumeZoneBurstHorizonStats = {
  bars: number;
  sampleCount: number;
  longPct: number;
  shortPct: number;
  flatPct: number;
  medianUsd: number | null;
  medianPct: number | null;
  sampleLowTrust: boolean;
};

export type VolumeZoneBurstMatch = {
  zoneBot: number;
  zoneTop: number;
  timeframe: string;
  totalBars: number;
  listingFromKo: string;
  eventCount: number;
  matchedCount: number;
  currentBurst: boolean;
  currentRvol: number | null;
  dominant: 'LONG' | 'SHORT' | 'NEUTRAL';
  longPct: number;
  shortPct: number;
  horizons: VolumeZoneBurstHorizonStats[];
  primaryHorizon: number;
  headlineKo: string;
  summaryKo: string;
  reasonsKo: string[];
};

export type VolumeZoneBurstMtfRow = {
  tf: string;
  tfKo: string;
  ok: boolean;
  match: VolumeZoneBurstMatch | null;
  error?: string;
};

export type VolumeZoneBurstMtfPack = {
  symbol: string;
  zoneBot: number;
  zoneTop: number;
  rows: VolumeZoneBurstMtfRow[];
  aggregate: Pick<VolumeZoneBurstMatch, 'longPct' | 'shortPct' | 'dominant' | 'matchedCount' | 'headlineKo'>;
  alignedTfCount: number;
  summaryKo: string;
  updatedAt: number;
};

function percentileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function zoneOverlapRatio(aBot: number, aTop: number, bBot: number, bTop: number): number {
  const inter = Math.min(aTop, bTop) - Math.max(aBot, bBot);
  if (inter <= 0) return 0;
  const union = Math.max(aTop, bTop) - Math.min(aBot, bBot);
  return union > 0 ? inter / union : 0;
}

function eventRangeAt(candles: Candle[], idx: number, windowBars = 10): { bot: number; top: number; center: number } {
  const from = Math.max(0, idx - windowBars);
  const seg = candles.slice(from, idx + 1);
  const bot = Math.min(...seg.map((c) => c.low));
  const top = Math.max(...seg.map((c) => c.high));
  return { bot, top, center: candles[idx]!.close };
}

function eventMatchesZone(
  candles: Candle[],
  e: VolumePhaseEvent,
  zoneBot: number,
  zoneTop: number,
  overlapMin: number
): boolean {
  const idx = e.endIdx;
  const range = eventRangeAt(candles, idx, e.fromIdx != null ? Math.min(12, idx - e.fromIdx + 1) : 10);
  const overlap = zoneOverlapRatio(range.bot, range.top, zoneBot, zoneTop);
  if (overlap >= overlapMin) return true;
  return range.center >= zoneBot && range.center <= zoneTop;
}

function classifyOutcome(pct: number): 'long' | 'short' | 'flat' {
  if (pct > FLAT_PCT) return 'long';
  if (pct < -FLAT_PCT) return 'short';
  return 'flat';
}

function aggregateHorizon(
  events: VolumePhaseEvent[],
  candles: Candle[],
  h: number
): VolumeZoneBurstHorizonStats {
  let longN = 0;
  let shortN = 0;
  let flatN = 0;
  const usds: number[] = [];
  const pcts: number[] = [];

  for (const e of events) {
    const o = e.outcomes[`h${h}`];
    if (!o) continue;
    usds.push(o.usd);
    pcts.push(o.pct);
    const cls = classifyOutcome(o.pct);
    if (cls === 'long') longN++;
    else if (cls === 'short') shortN++;
    else flatN++;
  }

  const n = usds.length;
  const dirN = longN + shortN || 1;
  const sortedUsd = [...usds].sort((a, b) => a - b);
  const sortedPct = [...pcts].sort((a, b) => a - b);
  let longPct = Math.round((longN / dirN) * 100);
  let shortPct = 100 - longPct;
  longPct = Math.max(35, Math.min(65, longPct));
  shortPct = 100 - longPct;

  return {
    bars: h,
    sampleCount: n,
    longPct,
    shortPct,
    flatPct: n ? Math.round((flatN / n) * 100) : 0,
    medianUsd: n ? percentileSorted(sortedUsd, 0.5) : null,
    medianPct: n ? percentileSorted(sortedPct, 0.5) : null,
    sampleLowTrust: n < SAMPLE_TRUST_MIN,
  };
}

function listingLabelKo(candles: Candle[]): string {
  if (!candles.length) return '—';
  const t = candles[0]!.time * 1000;
  try {
    return new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '비트겟 상장~';
  }
}

/** 단일 TF · 구간 내 거래량 터짐 이벤트 통계 (상장 전구간 캔들) */
export function computeVolumeZoneBurstStats(params: {
  candles: Candle[];
  timeframe: string;
  zoneBot: number;
  zoneTop: number;
  overlapMin?: number;
  htfCandles?: Candle[];
}): VolumeZoneBurstMatch | null {
  const { candles, timeframe, zoneBot, zoneTop, overlapMin = 0.22, htfCandles } = params;
  if (!(zoneTop > zoneBot) || candles.length < 80) return null;

  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const horizons = phaseHorizonsForTf(timeframe);
  const primaryH = horizons[0] ?? 6;

  const vs = computeVolumeShockForecast(sorted, {
    timeframe,
    includeDynamic: true,
    dataSource: 'bitget-futures-csv',
  });
  const vsOk = vs && !('error' in vs) ? vs : null;

  const allEvents = extractVolumePhaseEvents(sorted, timeframe, {
    horizons,
    htfCandles,
    vs: vsOk,
    minGapBars: 4,
  });

  const matched = allEvents.filter((e) => eventMatchesZone(sorted, e, zoneBot, zoneTop, overlapMin));
  const lastIdx = sorted.length - 1;
  const lastShock = evalBarVolumeShock(sorted, lastIdx, vsOk);
  const currentBurst = Boolean(lastShock && lastShock.rvol >= RVOL_SHOCK_MIN);
  const currentInZone =
    sorted[lastIdx]!.close >= zoneBot && sorted[lastIdx]!.close <= zoneTop;

  const horizonStats = horizons.map((h) => aggregateHorizon(matched, sorted, h));
  const primary = horizonStats.find((x) => x.bars === primaryH) ?? horizonStats[0];
  const longPct = primary?.longPct ?? 50;
  const shortPct = primary?.shortPct ?? 50;
  const edge = Math.abs(longPct - shortPct);
  const dominant: VolumeZoneBurstMatch['dominant'] =
    longPct >= 55 && edge >= 6 ? 'LONG' : shortPct >= 55 && edge >= 6 ? 'SHORT' : 'NEUTRAL';

  const med = primary?.medianUsd;
  const medKo =
    med != null && Number.isFinite(med)
      ? med >= 0
        ? `+$${Math.round(med)}`
        : `−$${Math.round(Math.abs(med))}`
      : '—';
  const n = primary?.sampleCount ?? 0;
  const dirKo = dominant === 'LONG' ? '롱' : dominant === 'SHORT' ? '숏' : '혼조';
  const trust = primary?.sampleLowTrust ? '·저표본' : '';

  const reasonsKo: string[] = [
    `구간 ${zoneBot.toFixed(0)}~${zoneTop.toFixed(0)} 겹침 ${matched.length}/${allEvents.length}건`,
    `+${primaryH}봉 후 ${dirKo} ${longPct}% / 숏 ${shortPct}% · 중앙 ${medKo}`,
  ];
  if (currentBurst && currentInZone) {
    reasonsKo.unshift(`현재 봉 RVOL ${lastShock!.rvol.toFixed(1)}× · 동일 구간 쇼크`);
  }

  return {
    zoneBot,
    zoneTop,
    timeframe,
    totalBars: sorted.length,
    listingFromKo: listingLabelKo(sorted),
    eventCount: allEvents.length,
    matchedCount: matched.length,
    currentBurst: currentBurst && currentInZone,
    currentRvol: lastShock?.rvol ?? null,
    dominant,
    longPct,
    shortPct,
    horizons: horizonStats,
    primaryHorizon: primaryH,
    headlineKo: `📊 구간거래량 L${longPct}%·S${shortPct}% · n=${n}${trust}`,
    summaryKo: `${volumePhaseStatsTfLabel(timeframe)} · ${listingLabelKo(sorted)}~ · +${primaryH}봉 ${dirKo} ${medKo}`,
    reasonsKo,
  };
}

const MTF_WEIGHT: Record<string, number> = {
  '1m': 0.45,
  '3m': 0.55,
  '5m': 0.65,
  '15m': 0.85,
  '1h': 1.0,
  '4h': 1.35,
  '1d': 1.65,
  '1w': 2.0,
  '1M': 2.4,
  '1Y': 2.6,
};

export function buildVolumeZoneBurstMtfPack(params: {
  symbol: string;
  zoneBot: number;
  zoneTop: number;
  tfCandles: Array<{ tf: string; candles: Candle[]; htfCandles?: Candle[] }>;
}): VolumeZoneBurstMtfPack {
  const { symbol, zoneBot, zoneTop, tfCandles } = params;
  const rows: VolumeZoneBurstMtfRow[] = [];

  for (const tf of VOLUME_PHASE_STATS_TIMEFRAMES) {
    const row = tfCandles.find((x) => x.tf === tf);
    const candles = row?.candles ?? [];
    if (candles.length < 80) {
      rows.push({ tf, tfKo: volumePhaseStatsTfLabel(tf), ok: false, match: null, error: '캔들 부족' });
      continue;
    }
    const match = computeVolumeZoneBurstStats({
      candles,
      timeframe: tf,
      zoneBot,
      zoneTop,
      htfCandles: row?.htfCandles,
    });
    rows.push({ tf, tfKo: volumePhaseStatsTfLabel(tf), ok: true, match });
  }

  const active = rows.filter((r) => r.match && r.match.matchedCount >= 3);
  let longW = 0;
  let shortW = 0;
  let wSum = 0;
  let matchedSum = 0;
  for (const r of active) {
    const m = r.match!;
    const w = MTF_WEIGHT[r.tf] ?? 1;
    longW += m.longPct * w;
    shortW += m.shortPct * w;
    wSum += w;
    matchedSum += m.matchedCount;
  }
  const norm = wSum || 1;
  let longPct = Math.round(longW / norm);
  let shortPct = Math.round(shortW / norm);
  longPct = Math.max(35, Math.min(65, longPct));
  shortPct = 100 - longPct;
  const edge = Math.abs(longPct - shortPct);
  const dominant: VolumeZoneBurstMatch['dominant'] =
    longPct >= 55 && edge >= 6 ? 'LONG' : shortPct >= 55 && edge >= 6 ? 'SHORT' : 'NEUTRAL';
  const dirKo = dominant === 'LONG' ? '롱' : dominant === 'SHORT' ? '숏' : '혼조';

  const alignedTfCount = active.filter(
    (r) =>
      r.match!.dominant === dominant &&
      dominant !== 'NEUTRAL' &&
      r.match!.matchedCount >= 3
  ).length;

  return {
    symbol,
    zoneBot,
    zoneTop,
    rows,
    aggregate: {
      longPct,
      shortPct,
      dominant,
      matchedCount: matchedSum,
      headlineKo: `📊 MTF 구간거래량 L${longPct}%·S${shortPct}% · ${dirKo}`,
    },
    alignedTfCount,
    summaryKo: `${active.length}TF 활성 · ${alignedTfCount}TF ${dirKo} 일치 · 표본 ${matchedSum}건`,
    updatedAt: Date.now(),
  };
}

export function resolveVolumeZoneFromPrice(price: number | null, padPct = 0.004): { bot: number; top: number } | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const pad = price * padPct;
  return { bot: price - pad * 2, top: price + pad * 2 };
}

export function formatVolumeZoneBurstMarkerLabel(match: VolumeZoneBurstMatch): string {
  const h = match.horizons.find((x) => x.bars === match.primaryHorizon) ?? match.horizons[0];
  const n = h?.sampleCount ?? match.matchedCount;
  const dir = match.dominant === 'LONG' ? '▲롱' : match.dominant === 'SHORT' ? '▼숏' : '◆';
  const med =
    h?.medianUsd != null && Number.isFinite(h.medianUsd)
      ? h.medianUsd >= 0
        ? `+$${Math.round(h.medianUsd)}`
        : `−$${Math.round(Math.abs(h.medianUsd))}`
      : '';
  return `구간 ${dir}${match.longPct}% n${n} +${match.primaryHorizon}${med ? ` ${med}` : ''}`;
}
