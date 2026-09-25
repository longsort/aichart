/**
 * Bitget 고래 거래량 — 현재 vs 과거 유사 이벤트 비교
 */
import type { Candle } from '@/types';
import {
  candleFingerprint,
  fingerprintLabelKo,
  matchCurrentWhaleVolume,
  sideKo,
  whaleHorizonsForTf,
  whaleTiersForTf,
  type BitgetWhaleVolumeCatalog,
  type WhaleCandleFingerprint,
  type WhaleCatalogBucket,
  type WhaleVolumeLiveMatch,
  type WhaleVolumeSide,
} from '@/lib/bitgetWhaleVolumeCatalog';
import { analyzeCandleVolumeJoint } from '@/lib/volumeCandleJoint';
import { wadBuyVolume, wadSellVolume, smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import { normalizeChartTimeframe } from '@/lib/constants';

const FLAT_PCT = 0.12;

export type ForwardPctBand = {
  bars: number;
  sampleCount: number;
  longPct: number;
  shortPct: number;
  medianPct: number | null;
  p25Pct: number | null;
  p75Pct: number | null;
  medianUsd: number | null;
  avgUpPct: number | null;
  avgDnPct: number | null;
};

export type SingleCandleCompare = {
  volBtc: number;
  buyBtc: number;
  sellBtc: number;
  isBull: boolean;
  bodyPct: number;
  bodyKo: string;
  wickKo: string;
  rvol: number | null;
  rvolKo: string;
  candleKo: string;
  burstKo: string;
  forecasts: ForwardPctBand[];
  similarCount: number;
  forecastLineKo: string;
  headlineKo: string;
};

export type RangeSegmentCompare = {
  bars: number;
  netPct: number;
  totalVolBtc: number;
  sellPct: number;
  bullPct: number;
  volTrend: 'grow' | 'shrink' | 'flat';
  volTrendKo: string;
  scenarioKo: string;
  theoryKo: string;
  forecasts: ForwardPctBand[];
  similarCount: number;
  similarRanges: Array<{
    time: number;
    dateKo: string;
    netPct: number;
    totalVolBtc: number;
    afterPct: number;
    afterUsd: number;
    similarityPct: number;
  }>;
  forecastLineKo: string;
  headlineKo: string;
};

export type VolumeBurstForecastRow = {
  tierBtc: number;
  sideKo: string;
  sampleCount: number;
  longPct: number;
  shortPct: number;
  medianPct: number | null;
  medianUpPct: number | null;
  medianDnPct: number | null;
  labelKo: string;
};

export type WhaleHistoryCompareRow = {
  time: number;
  dateKo: string;
  price: number;
  tierBtc: number;
  volBtc: number;
  side: WhaleVolumeSide;
  sideKo: string;
  fingerprintKo: string;
  similarityPct: number;
  outcomes: Array<{
    bars: number;
    usd: number;
    pct: number;
    dir: 'long' | 'short' | 'flat';
  }>;
};

export type WhaleTierCompareRow = {
  tierBtc: number;
  side: WhaleVolumeSide;
  sideKo: string;
  eventCount: number;
  longPct: number;
  shortPct: number;
  medianUsd: number | null;
};

export type BitgetWhaleVolumeComparePack = {
  symbol: string;
  timeframe: string;
  listingFromKo: string;
  totalBars: number;
  catalogEvents: number;
  current: WhaleVolumeLiveMatch;
  bucket: WhaleCatalogBucket | null;
  singleCandle: SingleCandleCompare;
  rangeSegment: RangeSegmentCompare;
  burstForecasts: VolumeBurstForecastRow[];
  tierBreakdown: WhaleTierCompareRow[];
  similarHistory: WhaleHistoryCompareRow[];
  aggregateLongPct: number;
  aggregateShortPct: number;
  headlineKo: string;
  summaryKo: string;
};

function bodyPctOf(c: Candle): number {
  const r = Math.max(1e-9, c.high - c.low);
  return Math.abs(c.close - c.open) / r;
}

function bodyLabelKo(c: Candle): string {
  const bp = bodyPctOf(c);
  const bull = c.close >= c.open;
  if (bp < 0.15) return '도지';
  if (bp < 0.42) return bull ? '소양봉' : '소음봉';
  if (bp < 0.68) return bull ? '중양봉' : '중음봉';
  return bull ? '장대양봉' : '장대음봉';
}

function wickLabelKo(c: Candle): string {
  const r = Math.max(1e-9, c.high - c.low);
  const top = Math.max(c.open, c.close);
  const bot = Math.min(c.open, c.close);
  const upper = (c.high - top) / r;
  const lower = (bot - c.low) / r;
  if (upper > 0.45) return '윗꼬리';
  if (lower > 0.45) return '아랫꼬리';
  return '균형';
}

function rvolLabel(rvol: number | null): string {
  if (rvol == null) return 'RVOL—';
  if (rvol >= 3.2) return `RVOL${rvol.toFixed(1)}×극`;
  if (rvol >= 2) return `RVOL${rvol.toFixed(1)}×↑`;
  return `RVOL${rvol.toFixed(1)}×`;
}

function rangeWindowForTf(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, number> = { '15m': 10, '1h': 8, '4h': 6, '1d': 5, '1w': 6, '1M': 4 };
  return map[tf] ?? 8;
}

function aggregateForwardStats(
  samples: Array<{ pct: number; usd: number }>,
  bars: number
): ForwardPctBand {
  const pcts = samples.map((s) => s.pct);
  const usds = samples.map((s) => s.usd);
  let longN = 0;
  let shortN = 0;
  const ups: number[] = [];
  const dns: number[] = [];
  for (const p of pcts) {
    const cls = classifyOutcome(p);
    if (cls === 'long') {
      longN++;
      ups.push(p);
    } else if (cls === 'short') {
      shortN++;
      dns.push(p);
    }
  }
  const n = pcts.length;
  const dirN = longN + shortN || 1;
  let longPct = Math.round((longN / dirN) * 100);
  let shortPct = 100 - longPct;
  longPct = Math.max(35, Math.min(65, longPct));
  shortPct = 100 - longPct;
  const sorted = [...pcts].sort((a, b) => a - b);
  const sortedUsd = [...usds].sort((a, b) => a - b);
  return {
    bars,
    sampleCount: n,
    longPct,
    shortPct,
    medianPct: n ? percentileSorted(sorted, 0.5) : null,
    p25Pct: n ? percentileSorted(sorted, 0.25) : null,
    p75Pct: n ? percentileSorted(sorted, 0.75) : null,
    medianUsd: n ? percentileSorted(sortedUsd, 0.5) : null,
    avgUpPct: ups.length ? ups.reduce((s, x) => s + x, 0) / ups.length : null,
    avgDnPct: dns.length ? dns.reduce((s, x) => s + x, 0) / dns.length : null,
  };
}

function forecastLineFromBands(forecasts: ForwardPctBand[], primaryH: number): string {
  const f = forecasts.find((x) => x.bars === primaryH) ?? forecasts[0];
  if (!f || f.sampleCount < 3) return '표본 부족';
  const med = f.medianPct != null ? `${f.medianPct >= 0 ? '+' : ''}${f.medianPct.toFixed(1)}%` : '—';
  const up = f.avgUpPct != null ? `↑${f.avgUpPct.toFixed(1)}%` : '';
  const dn = f.avgDnPct != null ? `↓${f.avgDnPct.toFixed(1)}%` : '';
  return `+${f.bars}봉 ${med} · L${f.longPct}%/S${f.shortPct}% · n${f.sampleCount}${up && dn ? ` (${up}/${dn})` : ''}`;
}

function buildSingleCandleCompare(
  candles: Candle[],
  timeframe: string,
  current: WhaleVolumeLiveMatch
): SingleCandleCompare {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  const idx = n - 1;
  const c = sorted[idx]!;
  const ev = eventVolumes(c);
  const horizons = whaleHorizonsForTf(timeframe);
  const primaryH = current.primaryHorizon;
  const maxH = Math.max(...horizons, primaryH);
  const curVol = Math.max(ev.total, volumeForSide(ev, current.side));
  const curBody = bodyPctOf(c);
  const curBull = c.close >= c.open;
  const sma = smaTotalVolumeAt(sorted, idx, 20);
  const rvol = sma > 0 ? c.volume / sma : null;

  const matched: Array<{ idx: number; pct: number; usd: number; h: number }> = [];

  for (let i = 20; i < n - maxH; i++) {
    if (i >= idx - 1) continue;
    const h = sorted[i]!;
    const hev = eventVolumes(h);
    const hVol = hev.total;
    if (hVol < curVol * 0.5 || hVol > curVol * 1.85) continue;
    const hBody = bodyPctOf(h);
    if (Math.abs(hBody - curBody) > 0.38) continue;
    const fpSim = fingerprintSimilarity(current.fingerprint, candleFingerprint(sorted, i));
    const volSim = curVol > 0 ? (Math.min(hVol, curVol) / Math.max(hVol, curVol)) * 100 : 0;
    const combinedSim = fpSim * 0.55 + volSim * 0.45;
    if (combinedSim < 28 && fpSim < 22) continue;
    for (const hb of horizons) {
      const c1 = sorted[i + hb];
      if (!c1 || h.close <= 0) continue;
      matched.push({
        idx: i,
        h: hb,
        pct: ((c1.close / h.close) - 1) * 100,
        usd: c1.close - h.close,
      });
    }
  }

  const forecasts = horizons.map((h) => {
    const samples = matched.filter((m) => m.h === h).map((m) => ({ pct: m.pct, usd: m.usd }));
    return aggregateForwardStats(samples, h);
  });

  const similarCount = new Set(matched.map((m) => m.idx)).size;
  const burstKo = `${Math.round(curVol)}BTC ${current.sideKo} · ${rvolLabel(rvol)}`;
  const candleKo = `${bodyLabelKo(c)} · ${wickLabelKo(c)} · ${fingerprintLabelKo(current.fingerprint)}`;

  return {
    volBtc: Math.round(curVol),
    buyBtc: Math.round(ev.buy),
    sellBtc: Math.round(ev.sell),
    isBull: curBull,
    bodyPct: Math.round(curBody * 100),
    bodyKo: bodyLabelKo(c),
    wickKo: wickLabelKo(c),
    rvol,
    rvolKo: rvolLabel(rvol),
    candleKo,
    burstKo,
    forecasts,
    similarCount,
    forecastLineKo: forecastLineFromBands(forecasts, primaryH),
    headlineKo: `🕯 단일캔들 ${burstKo} → ${forecastLineFromBands(forecasts, primaryH)}`,
  };
}

function rangeProfileSimilarity(
  a: { netPct: number; sellPct: number; volTrend: string; bullPct: number; totalVol?: number },
  b: { netPct: number; sellPct: number; volTrend: string; bullPct: number; totalVol?: number }
): number {
  let s = 0;
  s += Math.max(0, 35 - Math.abs(a.netPct - b.netPct) * 6);
  s += Math.max(0, 30 - Math.abs(a.sellPct - b.sellPct) * 100);
  if (a.volTrend === b.volTrend) s += 20;
  else if (a.volTrend === 'flat' || b.volTrend === 'flat') s += 8;
  s += Math.max(0, 25 - Math.abs(a.bullPct - b.bullPct) * 80);
  if (a.totalVol != null && b.totalVol != null && a.totalVol > 0 && b.totalVol > 0) {
    const ratio = Math.min(a.totalVol, b.totalVol) / Math.max(a.totalVol, b.totalVol);
    s += ratio * 15;
  }
  return Math.min(100, s);
}

function buildRangeSegmentCompare(
  candles: Candle[],
  timeframe: string,
  current: WhaleVolumeLiveMatch
): RangeSegmentCompare {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  const win = rangeWindowForTf(timeframe);
  const horizons = whaleHorizonsForTf(timeframe);
  const primaryH = current.primaryHorizon;
  const maxH = Math.max(...horizons, primaryH);
  const toIdx = n - 1;
  const fromIdx = Math.max(0, toIdx - win + 1);
  const joint = analyzeCandleVolumeJoint(sorted, fromIdx, toIdx, 'none');
  const seg = sorted.slice(fromIdx, toIdx + 1);
  const totalVolBtc = Math.round(seg.reduce((s, c) => s + (c.volume || 0), 0));
  const open0 = seg[0]!.open;
  const close1 = seg[seg.length - 1]!.close;
  const netPct = open0 > 0 ? ((close1 / open0) - 1) * 100 : 0;

  const curProfile = {
    netPct,
    sellPct: joint?.downVolPct ?? 0.5,
    volTrend: joint?.volTrend ?? 'flat',
    bullPct: joint?.bullPct ?? 0.5,
    totalVol: totalVolBtc,
  };

  const matchedSamples: Array<{ pct: number; usd: number; h: number }> = [];
  const similarRanges: RangeSegmentCompare['similarRanges'] = [];

  for (let end = fromIdx + win; end < n - maxH - 1; end++) {
    const start = end - win + 1;
    if (start < 0) continue;
    const j = analyzeCandleVolumeJoint(sorted, start, end, 'none');
    if (!j) continue;
    const s = sorted.slice(start, end + 1);
    const tv = Math.round(s.reduce((a, c) => a + (c.volume || 0), 0));
    const o0 = s[0]!.open;
    const c1 = s[s.length - 1]!.close;
    const np = o0 > 0 ? ((c1 / o0) - 1) * 100 : 0;
    const prof = {
      netPct: np,
      sellPct: j.downVolPct,
      volTrend: j.volTrend,
      bullPct: j.bullPct,
      totalVol: tv,
    };
    const sim = rangeProfileSimilarity(curProfile, prof);
    if (sim < 24) continue;
    const cEnd = sorted[end]!;
    const cFwd = sorted[end + primaryH];
    const afterPct = cFwd && cEnd.close > 0 ? ((cFwd.close / cEnd.close) - 1) * 100 : 0;
    const afterUsd = cFwd ? cFwd.close - cEnd.close : 0;
    similarRanges.push({
      time: cEnd.time,
      dateKo: formatDateKo(cEnd.time),
      netPct: np,
      totalVolBtc: tv,
      afterPct,
      afterUsd,
      similarityPct: sim,
    });
    for (const hb of horizons) {
      const cf = sorted[end + hb];
      if (!cf || cEnd.close <= 0) continue;
      matchedSamples.push({
        h: hb,
        pct: ((cf.close / cEnd.close) - 1) * 100,
        usd: cf.close - cEnd.close,
      });
    }
  }

  similarRanges.sort((a, b) => b.similarityPct - a.similarityPct || b.time - a.time);
  let topRanges = similarRanges.slice(0, 12);

  if (topRanges.length < 3 && n > maxH + win + 30) {
    const fallback: RangeSegmentCompare['similarRanges'] = [];
    for (let end = fromIdx + win; end < n - maxH - 1; end++) {
      const start = end - win + 1;
      if (start < 0) continue;
      const j = analyzeCandleVolumeJoint(sorted, start, end, 'none');
      if (!j) continue;
      const s = sorted.slice(start, end + 1);
      const tv = Math.round(s.reduce((a, c) => a + (c.volume || 0), 0));
      if (curProfile.totalVol > 0 && tv < curProfile.totalVol * 0.35) continue;
      const o0 = s[0]!.open;
      const c1 = s[s.length - 1]!.close;
      const np = o0 > 0 ? ((c1 / o0) - 1) * 100 : 0;
      const volRatio =
        curProfile.totalVol > 0 ? Math.min(tv, curProfile.totalVol) / Math.max(tv, curProfile.totalVol) : 0;
      const buySim = 1 - Math.abs(j.bullPct - curProfile.bullPct);
      const simPct = Math.round(volRatio * 55 + buySim * 45);
      if (simPct < 30) continue;
      const cEnd = sorted[end]!;
      const cFwd = sorted[end + primaryH];
      const afterPct = cFwd && cEnd.close > 0 ? ((cFwd.close / cEnd.close) - 1) * 100 : 0;
      fallback.push({
        time: cEnd.time,
        dateKo: formatDateKo(cEnd.time),
        netPct: np,
        totalVolBtc: tv,
        afterPct,
        afterUsd: cFwd ? cFwd.close - cEnd.close : 0,
        similarityPct: simPct,
      });
      for (const hb of horizons) {
        const cf = sorted[end + hb];
        if (!cf || cEnd.close <= 0) continue;
        matchedSamples.push({
          h: hb,
          pct: ((cf.close / cEnd.close) - 1) * 100,
          usd: cf.close - cEnd.close,
        });
      }
    }
    fallback.sort((a, b) => b.similarityPct - a.similarityPct || b.time - a.time);
    topRanges = [...topRanges, ...fallback.filter((f) => !topRanges.some((t) => t.time === f.time))].slice(0, 12);
  }

  const forecasts = horizons.map((h) => {
    const samples = matchedSamples.filter((m) => m.h === h).map((m) => ({ pct: m.pct, usd: m.usd }));
    return aggregateForwardStats(samples, h);
  });

  const volTrendKo =
    curProfile.volTrend === 'grow' ? '거래량↑' : curProfile.volTrend === 'shrink' ? '거래량↓' : '거래량→';

  return {
    bars: win,
    netPct,
    totalVolBtc,
    sellPct: Math.round((joint?.downVolPct ?? 0.5) * 100),
    bullPct: Math.round((joint?.bullPct ?? 0.5) * 100),
    volTrend: (joint?.volTrend ?? 'flat') as 'grow' | 'shrink' | 'flat',
    volTrendKo,
    scenarioKo: joint?.scenarioKo ?? '구간 혼조',
    theoryKo: joint?.theoryKo ?? '',
    forecasts,
    similarCount: topRanges.length,
    similarRanges: topRanges,
    forecastLineKo: forecastLineFromBands(forecasts, primaryH),
    headlineKo: `📦 구간${win}봉 ${joint?.scenarioKo ?? '혼조'} · ${volTrendKo} → ${forecastLineFromBands(forecasts, primaryH)}`,
  };
}

function buildVolumeBurstForecasts(
  candles: Candle[],
  timeframe: string,
  primaryH: number
): VolumeBurstForecastRow[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const tiers = whaleTiersForTf(timeframe).filter((_, i) => i % 2 === 0 || i > 4).slice(0, 8);
  const n = sorted.length;
  const rows: VolumeBurstForecastRow[] = [];
  const sides: WhaleVolumeSide[] = ['buy', 'sell', 'bull', 'bear'];

  for (const tier of tiers) {
    for (const side of sides) {
      const pcts: number[] = [];
      const ups: number[] = [];
      const dns: number[] = [];
      let longN = 0;
      let shortN = 0;
      for (let i = 20; i < n - primaryH - 1; i++) {
        const ev = eventVolumes(sorted[i]!);
        if (!qualifiesSide(ev, side, tier)) continue;
        const c0 = sorted[i]!;
        const c1 = sorted[i + primaryH];
        if (!c1 || c0.close <= 0) continue;
        const pct = ((c1.close / c0.close) - 1) * 100;
        pcts.push(pct);
        const cls = classifyOutcome(pct);
        if (cls === 'long') {
          longN++;
          ups.push(pct);
        } else if (cls === 'short') {
          shortN++;
          dns.push(pct);
        }
      }
      if (pcts.length < 5) continue;
      const dirN = longN + shortN || 1;
      let longPct = Math.round((longN / dirN) * 100);
      let shortPct = 100 - longPct;
      longPct = Math.max(35, Math.min(65, longPct));
      shortPct = 100 - longPct;
      const med = percentileSorted([...pcts].sort((a, b) => a - b), 0.5);
      rows.push({
        tierBtc: tier,
        sideKo: sideKo(side),
        sampleCount: pcts.length,
        longPct,
        shortPct,
        medianPct: med,
        medianUpPct: ups.length ? percentileSorted([...ups].sort((a, b) => a - b), 0.5) : null,
        medianDnPct: dns.length ? percentileSorted([...dns].sort((a, b) => a - b), 0.5) : null,
        labelKo: `${tier}BTC ${sideKo(side)} 터지면 +${primaryH}봉 ${med >= 0 ? '+' : ''}${med?.toFixed(1) ?? '—'}% (L${longPct}%)`,
      });
    }
  }
  return rows.sort((a, b) => b.sampleCount - a.sampleCount).slice(0, 16);
}

function eventVolumes(c: Candle) {
  const buy = wadBuyVolume(c);
  const sell = wadSellVolume(c);
  const total = Math.max(0, c.volume || 0);
  return { buy, sell, total, bull: c.close >= c.open, bear: c.close < c.open };
}

function volumeForSide(ev: ReturnType<typeof eventVolumes>, side: WhaleVolumeSide): number {
  if (side === 'buy') return ev.buy;
  if (side === 'sell') return ev.sell;
  return ev.total;
}

function nearestTier(volBtc: number, tiers: number[]): number | null {
  if (volBtc < tiers[0]! * 0.85) return null;
  let best = tiers[0]!;
  for (const t of tiers) {
    if (volBtc >= t * 0.88) best = t;
  }
  return best;
}

function qualifiesSide(ev: ReturnType<typeof eventVolumes>, side: WhaleVolumeSide, tier: number): boolean {
  const v = volumeForSide(ev, side);
  if (v < tier * 0.88) return false;
  if (side === 'bull' && !ev.bull) return false;
  if (side === 'bear' && !ev.bear) return false;
  return true;
}

function classifyOutcome(pct: number): 'long' | 'short' | 'flat' {
  if (pct > FLAT_PCT) return 'long';
  if (pct < -FLAT_PCT) return 'short';
  return 'flat';
}

function fingerprintSimilarity(a: WhaleCandleFingerprint, b: WhaleCandleFingerprint): number {
  let score = 0;
  if (a.body === b.body) score += 40;
  else if (
    (a.body === 'small' && b.body === 'medium') ||
    (a.body === 'medium' && b.body === 'small') ||
    (a.body === 'medium' && b.body === 'large') ||
    (a.body === 'large' && b.body === 'medium')
  )
    score += 18;
  if (a.wick === b.wick) score += 30;
  else if (a.wick === 'balanced' || b.wick === 'balanced') score += 12;
  if (a.rvol === b.rvol) score += 30;
  else if (
    (a.rvol === 'high' && b.rvol === 'extreme') ||
    (a.rvol === 'extreme' && b.rvol === 'high') ||
    (a.rvol === 'normal' && b.rvol === 'high') ||
    (a.rvol === 'high' && b.rvol === 'normal')
  )
    score += 14;
  return Math.min(100, score);
}

function formatDateKo(tsSec: number): string {
  try {
    return new Date(tsSec * 1000).toLocaleString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(tsSec);
  }
}

function percentileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function buildTierBreakdown(
  candles: Candle[],
  timeframe: string,
  primaryH: number
): WhaleTierCompareRow[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const tiers = whaleTiersForTf(timeframe);
  const n = sorted.length;
  const maxH = primaryH + 2;
  if (n < maxH + 20) return [];

  const sides: WhaleVolumeSide[] = ['buy', 'sell', 'bull', 'bear'];
  const rows: WhaleTierCompareRow[] = [];

  for (const tier of tiers) {
    for (const side of sides) {
      const usds: number[] = [];
      let longN = 0;
      let shortN = 0;
      for (let i = 20; i < n - maxH; i++) {
        const ev = eventVolumes(sorted[i]!);
        if (!qualifiesSide(ev, side, tier)) continue;
        const c0 = sorted[i]!;
        const c1 = sorted[i + primaryH];
        if (!c1 || c0.close <= 0) continue;
        const usd = c1.close - c0.close;
        const pct = ((c1.close / c0.close) - 1) * 100;
        usds.push(usd);
        const cls = classifyOutcome(pct);
        if (cls === 'long') longN++;
        else if (cls === 'short') shortN++;
      }
      const count = usds.length;
      if (count < 3) continue;
      const dirN = longN + shortN || 1;
      let longPct = Math.round((longN / dirN) * 100);
      let shortPct = 100 - longPct;
      longPct = Math.max(35, Math.min(65, longPct));
      shortPct = 100 - longPct;
      rows.push({
        tierBtc: tier,
        side,
        sideKo: sideKo(side),
        eventCount: count,
        longPct,
        shortPct,
        medianUsd: percentileSorted([...usds].sort((a, b) => a - b), 0.5),
      });
    }
  }
  return rows.sort((a, b) => b.eventCount - a.eventCount).slice(0, 24);
}

function findSimilarHistory(
  candles: Candle[],
  timeframe: string,
  current: WhaleVolumeLiveMatch,
  maxRows = 16
): WhaleHistoryCompareRow[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const horizons = whaleHorizonsForTf(timeframe);
  const primaryH = current.primaryHorizon;
  const maxH = Math.max(...horizons, primaryH);
  const n = sorted.length;
  const lastIdx = n - 1;
  if (n < maxH + 25) return [];

  const candidates: WhaleHistoryCompareRow[] = [];

  for (let i = 20; i < n - maxH; i++) {
    if (i >= lastIdx - 1) continue;
    const c = sorted[i]!;
    const ev = eventVolumes(c);
    if (current.tierBtc !== nearestTier(volumeForSide(ev, current.side), whaleTiersForTf(timeframe))) continue;
    if (!qualifiesSide(ev, current.side, current.tierBtc)) continue;

    const fp = candleFingerprint(sorted, i);
    const sim = fingerprintSimilarity(current.fingerprint, fp);
    if (sim < 28) continue;

    const outcomes = horizons.map((h) => {
      const c1 = sorted[i + h];
      const usd = c1 ? c1.close - c.close : 0;
      const pct = c1 && c.close > 0 ? ((c1.close / c.close) - 1) * 100 : 0;
      return { bars: h, usd, pct, dir: classifyOutcome(pct) };
    });

    candidates.push({
      time: c.time,
      dateKo: formatDateKo(c.time),
      price: c.close,
      tierBtc: current.tierBtc,
      volBtc: Math.round(volumeForSide(ev, current.side)),
      side: current.side,
      sideKo: sideKo(current.side),
      fingerprintKo: fingerprintLabelKo(fp),
      similarityPct: sim,
      outcomes,
    });
  }

  candidates.sort((a, b) => b.similarityPct - a.similarityPct || b.time - a.time);
  const out: WhaleHistoryCompareRow[] = [];
  const seen = new Set<number>();
  for (const row of candidates) {
    if (seen.has(row.time)) continue;
    seen.add(row.time);
    out.push(row);
    if (out.length >= maxRows) break;
  }
  return out;
}

export function buildBitgetWhaleVolumeComparePack(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  catalog: BitgetWhaleVolumeCatalog;
}): BitgetWhaleVolumeComparePack | null {
  const { symbol, timeframe, candles, catalog } = params;
  const current = matchCurrentWhaleVolume(candles, catalog);
  if (!current) return null;

  const similarHistory = findSimilarHistory(candles, timeframe, current, 16);
  const tierBreakdown = buildTierBreakdown(candles, timeframe, current.primaryHorizon);
  const singleCandle = buildSingleCandleCompare(candles, timeframe, current);
  const rangeSegment = buildRangeSegmentCompare(candles, timeframe, current);
  const burstForecasts = buildVolumeBurstForecasts(candles, timeframe, current.primaryHorizon);

  let longN = 0;
  let shortN = 0;
  const primaryH = current.primaryHorizon;
  for (const row of similarHistory) {
    const o = row.outcomes.find((x) => x.bars === primaryH) ?? row.outcomes[0];
    if (!o) continue;
    if (o.dir === 'long') longN++;
    else if (o.dir === 'short') shortN++;
  }
  const histN = longN + shortN;
  let aggregateLongPct = current.longPct;
  let aggregateShortPct = current.shortPct;
  if (histN >= 5) {
    aggregateLongPct = Math.round((longN / histN) * 100);
    aggregateShortPct = 100 - aggregateLongPct;
    aggregateLongPct = Math.max(35, Math.min(65, aggregateLongPct));
    aggregateShortPct = 100 - aggregateLongPct;
  }

  const dirKo =
    aggregateLongPct >= 55 && aggregateLongPct - aggregateShortPct >= 6
      ? '롱'
      : aggregateShortPct >= 55 && aggregateShortPct - aggregateLongPct >= 6
        ? '숏'
        : '혼조';

  return {
    symbol,
    timeframe,
    listingFromKo: catalog.listingFromKo,
    totalBars: catalog.totalBars,
    catalogEvents: catalog.eventCount,
    current,
    bucket: current.bucket,
    singleCandle,
    rangeSegment,
    burstForecasts,
    tierBreakdown,
    similarHistory,
    aggregateLongPct,
    aggregateShortPct,
    headlineKo: `📊 ${current.tierBtc}BTC · 단일+구간 비교 · ${dirKo} L${aggregateLongPct}%`,
    summaryKo: `${singleCandle.forecastLineKo} · ${rangeSegment.scenarioKo}`,
  };
}
