/**
 * 현재가 → 상단 ceiling(반등 시 폭등감시) 도달 조건부 통계.
 * 과거 스윙저 유사 갭에서 H봉 내 high가 목표에 닿은 비율 — 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe, timeframeRank } from '@/lib/constants';

const SAMPLE_TRUST_MIN = 12;

export type DumpCeilingReachStat = {
  sourceTf: string;
  sourceTfKo: string;
  targetPrice: number;
  gapPct: number;
  horizonBars: number;
  sampleCount: number;
  sampleLowTrust: boolean;
  /** 조건부 도달 비율 0~100 — 확정 승률 아님 */
  reachPct: number | null;
  /** 도달 사례 중앙 봉수 */
  medianBarsToHit: number | null;
  /** 목표 전 저점 갱신(실패) 비율 */
  failFirstPct: number | null;
  labelKo: string;
  tipKo: string;
};

export type DumpCeilingReachPack = {
  /** 현재가 위 ceiling 중 최근접 우선 */
  primary: DumpCeilingReachStat | null;
  byTf: DumpCeilingReachStat[];
  summaryKo: string;
  /** 반등 1차 한도 = 최근접 상단 폭등감시(ceiling) 하단 */
  bounceCap: DumpBounceCap | null;
};

export type DumpBounceCap = {
  sourceTf: string;
  sourceTfKo: string;
  /** 한도 가격 (존 하단 — 먼저 닿는 쪽) */
  price: number;
  mid: number;
  gapPct: number;
  labelKo: string;
  tipKo: string;
  reachPct: number | null;
  reachSample: number | null;
};

/**
 * 현재가 위 가장 가까운 폭등감시(ceiling) = 반등 1차 한도.
 */
export function resolveDumpBounceCap(params: {
  zones: DumpCeilingTarget[];
  priceNow: number;
  reachByTf?: Map<string, DumpCeilingReachStat>;
}): DumpBounceCap | null {
  const price = Number(params.priceNow);
  if (!(price > 0)) return null;

  const ceilings = (params.zones ?? [])
    .filter((z) => (z.bandRole ?? 'floor') === 'ceiling')
    .map((z) => {
      const bot = Math.min(Number(z.bot), Number(z.top));
      const mid = Number(z.mid) > 0 ? Number(z.mid) : (Number(z.top) + Number(z.bot)) / 2;
      const target = bot > 0 ? bot : mid;
      return {
        sourceTf: normalizeChartTimeframe(z.sourceTf),
        sourceTfKo: tfKo(z.sourceTf),
        target,
        mid,
      };
    })
    .filter((z) => z.target > price * 1.002)
    .sort((a, b) => a.target - b.target || timeframeRank(b.sourceTf) - timeframeRank(a.sourceTf));

  const nearest = ceilings[0];
  if (!nearest) return null;

  const gapPct = ((nearest.target - price) / price) * 100;
  const reach = params.reachByTf?.get(nearest.sourceTf);
  const reachBit =
    reach?.reachPct != null && reach.sampleCount != null
      ? ` · 조건부도달 ${reach.reachPct}%(n=${reach.sampleCount})`
      : '';
  const px = Math.round(nearest.target);
  return {
    sourceTf: nearest.sourceTf,
    sourceTfKo: nearest.sourceTfKo,
    price: nearest.target,
    mid: nearest.mid,
    gapPct,
    labelKo: `반등가능 ${nearest.sourceTfKo}저항 ${px}`,
    tipKo: `지지에서 반등 가능 1차 구간 한도 ≈ ${nearest.sourceTfKo} 폭등감시(저항) ${px} (+${gapPct.toFixed(1)}%)${reachBit} · 한도·목표가 보장 아님`,
    reachPct: reach?.reachPct ?? null,
    reachSample: reach?.sampleCount ?? null,
  };
}

function tfKo(tf: string): string {
  const t = normalizeChartTimeframe(tf);
  const map: Record<string, string> = {
    '15m': '15분',
    '1h': '1시간',
    '4h': '4시간',
    '1d': '1일',
    '1w': '1주',
    '1M': '1달',
  };
  return map[t] ?? t;
}

/** 차트 TF·목표 TF에 따른 관측 봉수 */
export function dumpReachHorizonBars(chartTf: string, targetTf: string): number {
  const c = normalizeChartTimeframe(chartTf);
  const t = normalizeChartTimeframe(targetTf);
  const base: Record<string, number> = {
    '15m': 64,
    '1h': 48,
    '4h': 36,
    '1d': 28,
    '1w': 16,
    '1M': 12,
  };
  let h = base[c] ?? 40;
  const tr = timeframeRank(t);
  const cr = timeframeRank(c);
  if (tr > cr) h = Math.round(h * (1 + Math.min(1.2, (tr - cr) * 0.22)));
  return Math.max(8, Math.min(120, h));
}

function isLocalSwingLow(candles: Candle[], i: number, rad = 3): boolean {
  const lo = Number(candles[i]?.low);
  if (!Number.isFinite(lo)) return false;
  for (let j = i - rad; j <= i + rad; j++) {
    if (j < 0 || j >= candles.length || j === i) continue;
    if (Number(candles[j]!.low) < lo) return false;
  }
  return true;
}

function medianInt(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
}

/**
 * 단일 ceiling 목표에 대한 과거 유사 갭 도달 통계.
 */
export function computeDumpCeilingReachStat(params: {
  chartCandles: Candle[];
  chartTf: string;
  sourceTf: string;
  targetPrice: number;
  priceNow?: number;
}): DumpCeilingReachStat | null {
  const candles = params.chartCandles ?? [];
  const n = candles.length;
  const target = Number(params.targetPrice);
  if (n < 40 || !(target > 0)) return null;

  const last = candles[n - 1]!;
  const price =
    params.priceNow != null && Number(params.priceNow) > 0
      ? Number(params.priceNow)
      : Number(last.close);
  if (!(price > 0) || target <= price * 1.001) return null;

  const gapPct = ((target - price) / price) * 100;
  if (!(gapPct > 0.08) || gapPct > 45) return null;

  const horizon = dumpReachHorizonBars(params.chartTf, params.sourceTf);
  const gapTol = Math.max(0.12, gapPct * 0.22);
  const hits: boolean[] = [];
  const barsToHit: number[] = [];
  let failFirst = 0;

  const start = Math.max(8, Math.floor(n * 0.08));
  const end = n - horizon - 2;
  const step = end - start > 400 ? 2 : 1;

  for (let i = start; i < end; i += step) {
    if (!isLocalSwingLow(candles, i, 2)) continue;
    const c0 = Number(candles[i]!.close);
    if (!(c0 > 0)) continue;
    const synTarget = c0 * (1 + gapPct / 100);
    /** 당시에도 비슷한 상방 여유(스윙고가 synTarget 근방 이상)가 있었는지 */
    let hadRoom = false;
    for (let k = Math.max(0, i - 28); k < i; k++) {
      if (Number(candles[k]!.high) >= synTarget * 0.985) {
        hadRoom = true;
        break;
      }
    }
    if (!hadRoom) continue;

    const setupLow = Number(candles[i]!.low);
    let hitAt: number | null = null;
    let failed = false;
    for (let j = i + 1; j <= i + horizon; j++) {
      const hi = Number(candles[j]!.high);
      const lo = Number(candles[j]!.low);
      if (lo < setupLow * 0.997) {
        failed = true;
        break;
      }
      if (hi >= synTarget) {
        hitAt = j - i;
        break;
      }
    }
    if (hitAt != null) {
      hits.push(true);
      barsToHit.push(hitAt);
    } else {
      hits.push(false);
      if (failed) failFirst += 1;
    }
  }

  const sampleCount = hits.length;
  const sourceTf = normalizeChartTimeframe(params.sourceTf);
  const ko = tfKo(sourceTf);
  if (sampleCount < 3) {
    return {
      sourceTf,
      sourceTfKo: ko,
      targetPrice: target,
      gapPct,
      horizonBars: horizon,
      sampleCount,
      sampleLowTrust: true,
      reachPct: null,
      medianBarsToHit: null,
      failFirstPct: null,
      labelKo: `${ko}상단 표본부족(n=${sampleCount})`,
      tipKo: `현재→${Math.round(target)} (+${gapPct.toFixed(1)}%) · ${horizon}봉 관측 · 유사 스윙저 표본 부족 · 확정 아님`,
    };
  }

  const hitN = hits.filter(Boolean).length;
  const reachPct = Math.round((hitN / sampleCount) * 1000) / 10;
  const sampleLowTrust = sampleCount < SAMPLE_TRUST_MIN;
  const medBars = medianInt(barsToHit);
  const failFirstPct =
    sampleCount > 0 ? Math.round((failFirst / sampleCount) * 1000) / 10 : null;

  const trustTag = sampleLowTrust ? '·통계부족' : '';
  const labelKo = `${ko}상단도달 n=${sampleCount} · 조건부 ${reachPct}%${trustTag}`;
  const tipKo = [
    `현재 ${Math.round(price)} → ${ko}폭등감시 ${Math.round(target)} (+${gapPct.toFixed(1)}%)`,
    `유사 스윙저 ${sampleCount}건 · ${horizon}봉 내 high 도달 ${hitN}건 (${reachPct}%)`,
    medBars != null ? `도달 중앙 ${medBars}봉` : null,
    failFirstPct != null ? `저점갱신선 ${failFirstPct}%` : null,
    '과거 조건부 비율 — 확정 승률·수익 아님',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    sourceTf,
    sourceTfKo: ko,
    targetPrice: target,
    gapPct,
    horizonBars: horizon,
    sampleCount,
    sampleLowTrust,
    reachPct,
    medianBarsToHit: medBars,
    failFirstPct,
    labelKo,
    tipKo,
  };
}

export type DumpCeilingTarget = {
  sourceTf: string;
  mid: number;
  top: number;
  bot: number;
  bandRole?: string;
};

/**
 * 현재가 위 ceiling 존들에 대해 도달 통계 팩.
 */
export function buildDumpCeilingReachPack(params: {
  chartCandles: Candle[];
  chartTf: string;
  zones: DumpCeilingTarget[];
  priceNow?: number;
}): DumpCeilingReachPack {
  const empty: DumpCeilingReachPack = {
    primary: null,
    byTf: [],
    summaryKo: '',
    bounceCap: null,
  };
  const candles = params.chartCandles ?? [];
  if (candles.length < 40) return empty;

  const price =
    params.priceNow != null && Number(params.priceNow) > 0
      ? Number(params.priceNow)
      : Number(candles[candles.length - 1]!.close);
  if (!(price > 0)) return empty;

  const ceilings = (params.zones ?? [])
    .filter((z) => (z.bandRole ?? 'floor') === 'ceiling')
    .map((z) => {
      const bot = Math.min(Number(z.bot), Number(z.top));
      const mid = Number(z.mid) > 0 ? Number(z.mid) : (Number(z.top) + Number(z.bot)) / 2;
      /** 도달 목표 = 존 하단(먼저 닿는 쪽) */
      const target = bot > 0 ? bot : mid;
      return { ...z, target };
    })
    .filter((z) => z.target > price * 1.002)
    .sort((a, b) => a.target - b.target || timeframeRank(b.sourceTf) - timeframeRank(a.sourceTf));

  const byTf: DumpCeilingReachStat[] = [];
  const seen = new Set<string>();
  for (const z of ceilings.slice(0, 5)) {
    const key = normalizeChartTimeframe(z.sourceTf);
    if (seen.has(key)) continue;
    seen.add(key);
    const st = computeDumpCeilingReachStat({
      chartCandles: candles,
      chartTf: params.chartTf,
      sourceTf: z.sourceTf,
      targetPrice: z.target,
      priceNow: price,
    });
    if (st) byTf.push(st);
  }

  const reachByTf = new Map(byTf.map((r) => [normalizeChartTimeframe(r.sourceTf), r]));
  const bounceCap = resolveDumpBounceCap({
    zones: params.zones,
    priceNow: price,
    reachByTf,
  });

  const primary =
    byTf.find((s) => s.reachPct != null && !s.sampleLowTrust) ??
    byTf.find((s) => s.reachPct != null) ??
    byTf[0] ??
    null;

  const reachSummary = primary
    ? primary.reachPct != null
      ? `↑${primary.sourceTfKo}폭등감시 도달 n=${primary.sampleCount} · 조건부 ${primary.reachPct}%${
          primary.sampleLowTrust ? ' · 통계부족' : ''
        } · 확정아님`
      : primary.labelKo
    : '';
  const summaryKo = [bounceCap?.labelKo, reachSummary].filter(Boolean).join(' · ');

  return { primary, byTf, summaryKo, bounceCap };
}
