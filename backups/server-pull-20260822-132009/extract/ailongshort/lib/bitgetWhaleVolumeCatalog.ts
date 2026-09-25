/**
 * Bitget BTCUSDT.P — BTC 거래량 티어 + 캔들 지문 → 상장~ 과거 통계 · 실시간 매칭.
 */
import type { Candle } from '@/types';
import { wadBuyVolume, wadSellVolume, smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import { normalizeChartTimeframe } from '@/lib/constants';

export const BITGET_WHALE_CATALOG_TFS = ['15m', '1h', '4h', '1d', '1w'] as const;

/** BTC volume_base 티어 (15m 기준; TF별 스케일 적용) */
export const BITGET_WHALE_BTC_TIERS_15M = [
  300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000,
] as const;

const TF_TIER_SCALE: Record<string, number> = {
  '15m': 1,
  '1h': 2.8,
  '4h': 8,
  '1d': 28,
  '1w': 120,
};

const FLAT_PCT = 0.12;
const SAMPLE_TRUST_MIN = 15;

export type WhaleVolumeSide = 'buy' | 'sell' | 'bull' | 'bear';

export type CandleBodyBucket = 'doji' | 'small' | 'medium' | 'large';
export type CandleWickBucket = 'upper' | 'lower' | 'balanced';
export type CandleRvolBucket = 'normal' | 'high' | 'extreme';

export type WhaleCandleFingerprint = {
  body: CandleBodyBucket;
  wick: CandleWickBucket;
  rvol: CandleRvolBucket;
};

export type WhaleCatalogBucket = {
  key: string;
  labelKo: string;
  tierBtc: number;
  side: WhaleVolumeSide;
  body: CandleBodyBucket;
  wick: CandleWickBucket;
  rvol: CandleRvolBucket;
  sampleCount: number;
  sampleLowTrust: boolean;
  longPct: number;
  shortPct: number;
  flatPct: number;
  medianUsd: number | null;
  medianPct: number | null;
  horizons: Array<{
    bars: number;
    sampleCount: number;
    longPct: number;
    shortPct: number;
    medianUsd: number | null;
    medianPct: number | null;
    p25Pct: number | null;
    p75Pct: number | null;
  }>;
};

export type BitgetWhaleVolumeCatalog = {
  version: 1;
  symbol: string;
  timeframe: string;
  builtAt: string;
  listingFromKo: string;
  /** CSV 실제 구간 (Bitget API 한도 반영) */
  dataSpanKo: string;
  dataFromSec: number;
  dataToSec: number;
  totalBars: number;
  eventCount: number;
  tiers: number[];
  horizons: number[];
  buckets: WhaleCatalogBucket[];
};

export type WhaleVolumeLiveMatch = {
  tierBtc: number;
  side: WhaleVolumeSide;
  sideKo: string;
  fingerprint: WhaleCandleFingerprint;
  fingerprintKo: string;
  longPct: number;
  shortPct: number;
  dominant: 'LONG' | 'SHORT' | 'NEUTRAL';
  sampleCount: number;
  sampleLowTrust: boolean;
  medianUsd: number | null;
  primaryHorizon: number;
  currentRvol: number | null;
  currentVolBtc: number;
  bucket: WhaleCatalogBucket | null;
  headlineKo: string;
  summaryKo: string;
  reasonsKo: string[];
};

export type WhaleVolumeMtfRow = {
  tf: string;
  tfKo: string;
  ok: boolean;
  match: WhaleVolumeLiveMatch | null;
  error?: string;
};

export type WhaleVolumeMtfPack = {
  symbol: string;
  rows: WhaleVolumeMtfRow[];
  aggregate: Pick<WhaleVolumeLiveMatch, 'longPct' | 'shortPct' | 'dominant' | 'sampleCount' | 'headlineKo'>;
  alignedTfCount: number;
  summaryKo: string;
  updatedAt: number;
};

const TF_KO: Record<string, string> = {
  '15m': '15분',
  '1h': '1시간',
  '4h': '4시간',
  '1d': '일봉',
  '1w': '주봉',
};

function percentileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function listingLabelKo(candles: Candle[]): string {
  if (!candles.length) return '—';
  try {
    return new Date(candles[0]!.time * 1000).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function catalogDataSpanKo(candles: Candle[]): { spanKo: string; fromSec: number; toSec: number } {
  if (!candles.length) return { spanKo: '—', fromSec: 0, toSec: 0 };
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const fromSec = sorted[0]!.time as number;
  const toSec = sorted[sorted.length - 1]!.time as number;
  const fmt = (t: number) =>
    new Date(t * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  return { spanKo: `${fmt(fromSec)}~${fmt(toSec)}`, fromSec, toSec };
}

export function whaleTiersForTf(timeframe: string): number[] {
  const tf = normalizeChartTimeframe(timeframe);
  const scale = TF_TIER_SCALE[tf] ?? 1;
  return BITGET_WHALE_BTC_TIERS_15M.map((t) => Math.round(t * scale));
}

export function whaleHorizonsForTf(timeframe: string): number[] {
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, number[]> = {
    '15m': [4, 8, 16, 32],
    '1h': [4, 8, 12, 24],
    '4h': [4, 6, 12],
    '1d': [3, 5, 10],
    '1w': [2, 4, 8],
    '1M': [2, 3, 6],
  };
  return map[tf] ?? [4, 8, 16];
}

function bodyBucket(c: Candle): CandleBodyBucket {
  const range = Math.max(c.high - c.low, 1e-9);
  const body = Math.abs(c.close - c.open) / range;
  if (body < 0.15) return 'doji';
  if (body < 0.42) return 'small';
  if (body < 0.68) return 'medium';
  return 'large';
}

function wickBucket(c: Candle): CandleWickBucket {
  const range = Math.max(c.high - c.low, 1e-9);
  const bodyTop = Math.max(c.open, c.close);
  const bodyBot = Math.min(c.open, c.close);
  const upper = (c.high - bodyTop) / range;
  const lower = (bodyBot - c.low) / range;
  const body = Math.abs(c.close - c.open) / range;
  if (upper > body * 1.8 && upper > lower * 1.35) return 'upper';
  if (lower > body * 1.8 && lower > upper * 1.35) return 'lower';
  return 'balanced';
}

function rvolBucket(candles: Candle[], idx: number): CandleRvolBucket {
  const sma = smaTotalVolumeAt(candles, idx, 20);
  const v = Math.max(0, candles[idx]?.volume ?? 0);
  if (sma <= 0) return 'normal';
  const r = v / sma;
  if (r >= 3.2) return 'extreme';
  if (r >= 2.0) return 'high';
  return 'normal';
}

export function candleFingerprint(candles: Candle[], idx: number): WhaleCandleFingerprint {
  const c = candles[idx]!;
  return {
    body: bodyBucket(c),
    wick: wickBucket(c),
    rvol: rvolBucket(candles, idx),
  };
}

export function fingerprintLabelKo(fp: WhaleCandleFingerprint): string {
  const bodyKo =
    fp.body === 'doji' ? '도지' : fp.body === 'small' ? '소몸통' : fp.body === 'medium' ? '중몸통' : '장몸통';
  const wickKo = fp.wick === 'upper' ? '윗꼬리' : fp.wick === 'lower' ? '아랫꼬리' : '균형';
  const rvolKo = fp.rvol === 'extreme' ? 'RVOL극' : fp.rvol === 'high' ? 'RVOL↑' : 'RVOL보통';
  return `${bodyKo}·${wickKo}·${rvolKo}`;
}

export function sideKo(side: WhaleVolumeSide): string {
  if (side === 'buy') return '매수량';
  if (side === 'sell') return '매도량';
  if (side === 'bull') return '양봉총량';
  return '음봉총량';
}

function bucketKey(tier: number, side: WhaleVolumeSide, fp: WhaleCandleFingerprint): string {
  return `${tier}|${side}|${fp.body}|${fp.wick}|${fp.rvol}`;
}

function classifyOutcome(pct: number): 'long' | 'short' | 'flat' {
  if (pct > FLAT_PCT) return 'long';
  if (pct < -FLAT_PCT) return 'short';
  return 'flat';
}

function nearestTier(volBtc: number, tiers: number[]): number | null {
  if (volBtc < tiers[0]! * 0.85) return null;
  let best = tiers[0]!;
  for (const t of tiers) {
    if (volBtc >= t * 0.88) best = t;
  }
  return best;
}

function eventVolumes(c: Candle): { buy: number; sell: number; total: number; bull: boolean; bear: boolean } {
  const buy = wadBuyVolume(c);
  const sell = wadSellVolume(c);
  const total = Math.max(0, c.volume || 0);
  return {
    buy,
    sell,
    total,
    bull: c.close >= c.open,
    bear: c.close < c.open,
  };
}

function volumeForSide(ev: ReturnType<typeof eventVolumes>, side: WhaleVolumeSide): number {
  if (side === 'buy') return ev.buy;
  if (side === 'sell') return ev.sell;
  return ev.total;
}

function qualifiesSide(ev: ReturnType<typeof eventVolumes>, side: WhaleVolumeSide, tier: number): boolean {
  const v = volumeForSide(ev, side);
  if (v < tier * 0.88) return false;
  if (side === 'bull' && !ev.bull) return false;
  if (side === 'bear' && !ev.bear) return false;
  return true;
}

type RawEvent = {
  tier: number;
  side: WhaleVolumeSide;
  fp: WhaleCandleFingerprint;
  outcomes: Record<string, { usd: number; pct: number }>;
};

function extractWhaleEvents(candles: Candle[], timeframe: string): RawEvent[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const tiers = whaleTiersForTf(timeframe);
  const horizons = whaleHorizonsForTf(timeframe);
  const maxH = Math.max(...horizons, 4);
  const n = sorted.length;
  if (n < maxH + 30) return [];

  const events: RawEvent[] = [];
  const sides: WhaleVolumeSide[] = ['buy', 'sell', 'bull', 'bear'];
  const minGap = 3;
  const lastByKey = new Map<string, number>();

  for (let i = 20; i < n - maxH; i++) {
    const c = sorted[i]!;
    const ev = eventVolumes(c);
    const fp = candleFingerprint(sorted, i);

    for (const side of sides) {
      const vol = volumeForSide(ev, side);
      const tier = nearestTier(vol, tiers);
      if (tier == null || !qualifiesSide(ev, side, tier)) continue;

      const key = bucketKey(tier, side, fp);
      const last = lastByKey.get(key);
      if (last != null && i - last < minGap) continue;

      const outcomes: RawEvent['outcomes'] = {};
      for (const h of horizons) {
        const c0 = sorted[i];
        const c1 = sorted[i + h];
        if (!c0 || !c1 || c0.close <= 0) continue;
        outcomes[`h${h}`] = {
          usd: c1.close - c0.close,
          pct: ((c1.close / c0.close) - 1) * 100,
        };
      }
      events.push({ tier, side, fp, outcomes });
      lastByKey.set(key, i);
    }
  }
  return events;
}

function aggregateBucket(
  tier: number,
  side: WhaleVolumeSide,
  fp: WhaleCandleFingerprint,
  events: RawEvent[],
  horizons: number[]
): WhaleCatalogBucket {
  const subset = events.filter(
    (e) => e.tier === tier && e.side === side && e.fp.body === fp.body && e.fp.wick === fp.wick && e.fp.rvol === fp.rvol
  );
  const primaryH = horizons[0] ?? 4;

  const horizonAggs = horizons.map((h) => {
    const usds: number[] = [];
    const pcts: number[] = [];
    let longN = 0;
    let shortN = 0;
    for (const e of subset) {
      const o = e.outcomes[`h${h}`];
      if (!o) continue;
      usds.push(o.usd);
      pcts.push(o.pct);
      const cls = classifyOutcome(o.pct);
      if (cls === 'long') longN++;
      else if (cls === 'short') shortN++;
    }
    const n = usds.length;
    const dirN = longN + shortN || 1;
    let longPct = Math.round((longN / dirN) * 100);
    let shortPct = 100 - longPct;
    longPct = Math.max(35, Math.min(65, longPct));
    shortPct = 100 - longPct;
    const sortedPcts = [...pcts].sort((a, b) => a - b);
    const sortedUsds = [...usds].sort((a, b) => a - b);
    return {
      bars: h,
      sampleCount: n,
      longPct,
      shortPct,
      medianUsd: n ? percentileSorted(sortedUsds, 0.5) : null,
      medianPct: n ? percentileSorted(sortedPcts, 0.5) : null,
      p25Pct: n >= 4 ? percentileSorted(sortedPcts, 0.25) : null,
      p75Pct: n >= 4 ? percentileSorted(sortedPcts, 0.75) : null,
    };
  });

  const primary = horizonAggs.find((x) => x.bars === primaryH) ?? horizonAggs[0];
  const n = primary?.sampleCount ?? 0;
  let flatN = 0;
  for (const e of subset) {
    const o = e.outcomes[`h${primaryH}`];
    if (o && classifyOutcome(o.pct) === 'flat') flatN++;
  }

  return {
    key: bucketKey(tier, side, fp),
    labelKo: `${tier}BTC ${sideKo(side)} · ${fingerprintLabelKo(fp)}`,
    tierBtc: tier,
    side,
    body: fp.body,
    wick: fp.wick,
    rvol: fp.rvol,
    sampleCount: n,
    sampleLowTrust: n < SAMPLE_TRUST_MIN,
    longPct: primary?.longPct ?? 50,
    shortPct: primary?.shortPct ?? 50,
    flatPct: n ? Math.round((flatN / n) * 100) : 0,
    medianUsd: primary?.medianUsd ?? null,
    medianPct: primary?.medianPct ?? null,
    horizons: horizonAggs,
  };
}

export function buildBitgetWhaleVolumeCatalog(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
}): BitgetWhaleVolumeCatalog {
  const { symbol, timeframe, candles } = params;
  const tf = normalizeChartTimeframe(timeframe);
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const horizons = whaleHorizonsForTf(tf);
  const tiers = whaleTiersForTf(tf);
  const events = extractWhaleEvents(sorted, tf);

  const bucketMap = new Map<string, RawEvent[]>();
  for (const e of events) {
    const k = bucketKey(e.tier, e.side, e.fp);
    const list = bucketMap.get(k) ?? [];
    list.push(e);
    bucketMap.set(k, list);
  }

  const buckets: WhaleCatalogBucket[] = [];
  for (const [k, list] of bucketMap) {
    const sample = list[0]!;
    buckets.push(aggregateBucket(sample.tier, sample.side, sample.fp, events, horizons));
  }

  buckets.sort((a, b) => b.sampleCount - a.sampleCount);

  const span = catalogDataSpanKo(sorted);

  return {
    version: 1,
    symbol: String(symbol).toUpperCase(),
    timeframe: tf,
    builtAt: new Date().toISOString(),
    listingFromKo: listingLabelKo(sorted),
    dataSpanKo: span.spanKo,
    dataFromSec: span.fromSec,
    dataToSec: span.toSec,
    totalBars: sorted.length,
    eventCount: events.length,
    tiers,
    horizons,
    buckets,
  };
}

function pickBestSide(ev: ReturnType<typeof eventVolumes>, tiers: number[]): { tier: number; side: WhaleVolumeSide } | null {
  const candidates: Array<{ tier: number; side: WhaleVolumeSide; vol: number }> = [];
  const sides: WhaleVolumeSide[] = ['buy', 'sell', 'bull', 'bear'];
  for (const side of sides) {
    const vol = volumeForSide(ev, side);
    const tier = nearestTier(vol, tiers);
    if (tier != null && qualifiesSide(ev, side, tier)) {
      candidates.push({ tier, side, vol });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.vol / b.tier - a.vol / a.tier);
  const top = candidates[0]!;
  return { tier: top.tier, side: top.side };
}

function findBucket(
  catalog: BitgetWhaleVolumeCatalog,
  tier: number,
  side: WhaleVolumeSide,
  fp: WhaleCandleFingerprint
): WhaleCatalogBucket | null {
  const exact = catalog.buckets.find(
    (b) => b.tierBtc === tier && b.side === side && b.body === fp.body && b.wick === fp.wick && b.rvol === fp.rvol
  );
  if (exact && exact.sampleCount >= 3) return exact;

  const relaxed = catalog.buckets
    .filter((b) => b.tierBtc === tier && b.side === side && b.body === fp.body && b.sampleCount >= 5)
    .sort((a, b) => b.sampleCount - a.sampleCount)[0];
  if (relaxed) return relaxed;

  return (
    catalog.buckets
      .filter((b) => b.tierBtc === tier && b.side === side && b.sampleCount >= 8)
      .sort((a, b) => b.sampleCount - a.sampleCount)[0] ?? null
  );
}

export function matchWhaleVolumeAtIndex(
  candles: Candle[],
  catalog: BitgetWhaleVolumeCatalog,
  barIdx?: number
): WhaleVolumeLiveMatch | null {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  if (n < 25) return null;

  const lastIdx = barIdx != null && barIdx >= 0 && barIdx < n ? barIdx : n - 1;
  const c = sorted[lastIdx]!;
  const ev = eventVolumes(c);
  const tiers = catalog.tiers.length ? catalog.tiers : whaleTiersForTf(catalog.timeframe);
  const pick = pickBestSide(ev, tiers);
  if (!pick) return null;

  const fp = candleFingerprint(sorted, lastIdx);
  const bucket = findBucket(catalog, pick.tier, pick.side, fp);
  const primaryH = catalog.horizons[0] ?? 4;
  const sma = smaTotalVolumeAt(sorted, lastIdx, 20);
  const rvol = sma > 0 ? c.volume / sma : null;

  const longPct = bucket?.longPct ?? 50;
  const shortPct = bucket?.shortPct ?? 50;
  const edge = Math.abs(longPct - shortPct);
  const dominant: WhaleVolumeLiveMatch['dominant'] =
    longPct >= 55 && edge >= 6 ? 'LONG' : shortPct >= 55 && edge >= 6 ? 'SHORT' : 'NEUTRAL';
  const dirKo = dominant === 'LONG' ? '롱' : dominant === 'SHORT' ? '숏' : '혼조';
  const nSample = bucket?.sampleCount ?? 0;
  const med = bucket?.medianUsd;
  const medKo =
    med != null && Number.isFinite(med)
      ? med >= 0
        ? `+$${Math.round(med)}`
        : `−$${Math.round(Math.abs(med))}`
      : '—';

  return {
    tierBtc: pick.tier,
    side: pick.side,
    sideKo: sideKo(pick.side),
    fingerprint: fp,
    fingerprintKo: fingerprintLabelKo(fp),
    longPct,
    shortPct,
    dominant,
    sampleCount: nSample,
    sampleLowTrust: bucket?.sampleLowTrust ?? true,
    medianUsd: med ?? null,
    primaryHorizon: primaryH,
    currentRvol: rvol,
    currentVolBtc: Math.max(ev.buy, ev.sell, ev.total),
    bucket,
    headlineKo: `🐋 ${pick.tier}BTC ${sideKo(pick.side)} · ${dirKo} L${longPct}% S${shortPct}%`,
    summaryKo: `${catalog.listingFromKo}~ n=${nSample} · +${primaryH}봉 ${medKo} · ${fingerprintLabelKo(fp)}`,
    reasonsKo: [
      `티어 ${pick.tier} BTC · ${sideKo(pick.side)} ${Math.round(volumeForSide(ev, pick.side))} BTC`,
      rvol != null ? `RVOL ${rvol.toFixed(1)}×` : 'RVOL —',
      bucket ? `과거 동일지문 ${nSample}건 → ${dirKo} ${longPct}%` : '과거 표본 부족 — 티어만 일치',
      `캔들 ${fingerprintLabelKo(fp)}`,
    ],
  };
}

export function matchCurrentWhaleVolume(
  candles: Candle[],
  catalog: BitgetWhaleVolumeCatalog
): WhaleVolumeLiveMatch | null {
  return matchWhaleVolumeAtIndex(candles, catalog);
}

const MTF_WEIGHT: Record<string, number> = {
  '15m': 0.85,
  '1h': 1.0,
  '4h': 1.35,
  '1d': 1.65,
  '1w': 1.85,
};

export function buildWhaleVolumeMtfPack(params: {
  symbol: string;
  rows: Array<{ tf: string; match: WhaleVolumeLiveMatch | null; ok: boolean; error?: string }>;
}): WhaleVolumeMtfPack {
  const active = params.rows.filter((r) => r.ok && r.match && r.match.sampleCount >= 3);
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
    matchedSum += m.sampleCount;
  }
  const norm = wSum || 1;
  let longPct = Math.round(longW / norm);
  let shortPct = Math.round(shortW / norm);
  longPct = Math.max(35, Math.min(65, longPct));
  shortPct = 100 - longPct;
  const edge = Math.abs(longPct - shortPct);
  const dominant: WhaleVolumeLiveMatch['dominant'] =
    longPct >= 55 && edge >= 6 ? 'LONG' : shortPct >= 55 && edge >= 6 ? 'SHORT' : 'NEUTRAL';
  const dirKo = dominant === 'LONG' ? '롱' : dominant === 'SHORT' ? '숏' : '혼조';

  const alignedTfCount = active.filter(
    (r) => r.match!.dominant === dominant && dominant !== 'NEUTRAL'
  ).length;

  return {
    symbol: params.symbol,
    rows: params.rows.map((r) => ({
      tf: r.tf,
      tfKo: TF_KO[r.tf] ?? r.tf,
      ok: r.ok,
      match: r.match,
      error: r.error,
    })),
    aggregate: {
      longPct,
      shortPct,
      dominant,
      sampleCount: matchedSum,
      headlineKo: `🐋 MTF 고래거래량 L${longPct}%·S${shortPct}% · ${dirKo}`,
    },
    alignedTfCount,
    summaryKo: `${active.length}TF 활성 · 표본 ${matchedSum}건${alignedTfCount ? ` · ${alignedTfCount}TF ${dirKo} 일치` : ''}`,
    updatedAt: Date.now(),
  };
}

export function whaleVolumeMarkerLabel(match: WhaleVolumeLiveMatch): string {
  const dir = match.dominant === 'LONG' ? '▲' : match.dominant === 'SHORT' ? '▼' : '◆';
  const med =
    match.medianUsd != null && Number.isFinite(match.medianUsd)
      ? match.medianUsd >= 0
        ? `+$${Math.round(match.medianUsd)}`
        : `−$${Math.round(Math.abs(match.medianUsd))}`
      : '';
  return `🐋${match.tierBtc} ${dir}L${match.longPct}% n${match.sampleCount}${med ? ` ${med}` : ''}`;
}
