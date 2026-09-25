/**
 * 통합·분석 — TF별 거래량 매수/매도 + 봉·현물 상승/하락 %.
 * 사용: taker/WAD 수급 · RVOL · RSI · 봉 몸통 · 현물 종가.
 * 확정 수익·승률 아님. 카드/HUD 없음 — 거래량 봉 라벨·막대색만.
 */
import type { Candle } from '@/types';
import { macd, rsi } from '@/lib/indicators';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import { smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import {
  fmtSpotPctSigned,
  spotMoveSinceBarPct,
  spotPctMove,
} from '@/lib/mergedDeskSpotReactionPct';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';

export type VolumeTfBarMetrics = {
  time: number;
  buyVol: number;
  sellVol: number;
  buyPct: number;
  sellPct: number;
  /** 봉 시가→종가 % (양수=상승봉) */
  barMovePct: number | null;
  /** 봉 저→고 중 상승 쪽 비중 추정 % (0~100) — 참고 */
  barUpSharePct: number;
  barDownSharePct: number;
  /** 신호봉 종가 → 현물 % (양수=현물 상승) */
  spotMovePct: number | null;
  rvol: number | null;
  rsi: number | null;
  macdHist: number | null;
  /** 매수 우세 시 true */
  buyDominant: boolean;
  sellDominant: boolean;
  /** 거래량 막대 위 짧은 라벨 */
  labelKo: string;
  /** 툴팁·상세 */
  detailKo: string;
  buyColor: string;
  sellColor: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function rvolAt(rows: Candle[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  const sma = smaTotalVolumeAt(rows, i, period);
  const v = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(sma > 0)) return null;
  return v / sma;
}

function barBodyMovePct(c: Candle): number | null {
  const o = Number(c.open);
  const cl = Number(c.close);
  if (!(o > 0) || !Number.isFinite(cl)) return null;
  return spotPctMove(o, cl);
}

/** 봉 레인지에서 종가 위치로 상승/하락 점유(참고) */
function barRangeShare(c: Candle): { up: number; down: number } {
  const hi = Number(c.high);
  const lo = Number(c.low);
  const cl = Number(c.close);
  if (![hi, lo, cl].every(Number.isFinite) || !(hi > lo)) return { up: 50, down: 50 };
  const up = clamp(((cl - lo) / (hi - lo)) * 100, 0, 100);
  return { up, down: 100 - up };
}

function buySellColors(params: {
  buyPct: number;
  rvol: number | null;
  rsi: number | null;
  barMovePct: number | null;
  macdHist?: number | null;
  last: boolean;
  whaleBoost?: 'LONG' | 'SHORT' | null;
}): { buy: string; sell: string } {
  const rv = params.rvol ?? 1;
  const lastBoost = params.last ? 0.05 : 0;
  let buyA = clamp(0.55 + (params.buyPct - 0.5) * 0.7 + (rv >= 1.5 ? 0.12 : 0) + lastBoost, 0.45, 0.98);
  let sellA = clamp(0.55 + (params.buyPct < 0.5 ? (0.5 - params.buyPct) * 0.7 : 0) + (rv >= 1.5 ? 0.1 : 0) + lastBoost, 0.42, 0.95);

  if (params.rsi != null) {
    if (params.rsi >= 58 && params.buyPct >= 0.52) buyA = Math.min(0.98, buyA + 0.08);
    if (params.rsi <= 42 && params.buyPct <= 0.48) sellA = Math.min(0.95, sellA + 0.08);
  }
  if (params.barMovePct != null) {
    if (params.barMovePct > 0.05) buyA = Math.min(0.98, buyA + 0.06);
    if (params.barMovePct < -0.05) sellA = Math.min(0.95, sellA + 0.06);
  }
  if (params.macdHist != null && Number.isFinite(params.macdHist)) {
    if (params.macdHist > 0 && params.buyPct >= 0.5) buyA = Math.min(0.98, buyA + 0.05);
    if (params.macdHist < 0 && params.buyPct <= 0.5) sellA = Math.min(0.95, sellA + 0.05);
  }
  if (params.whaleBoost === 'LONG') buyA = Math.min(0.99, buyA + 0.1);
  if (params.whaleBoost === 'SHORT') sellA = Math.min(0.99, sellA + 0.1);

  return {
    buy: `rgba(34,197,94,${buyA.toFixed(2)})`,
    sell: `rgba(239,68,68,${sellA.toFixed(2)})`,
  };
}

/**
 * 라벨: 짧고 완전 — 잘림(…) 없음
 * 예: `매62↑1.1` / `매도71↓0.8` / 마지막만 `매62↑1.1 현+0.3`
 */
export function formatVolumeTfBarLabelKo(m: Omit<VolumeTfBarMetrics, 'labelKo' | 'detailKo' | 'buyColor' | 'sellColor'>): {
  labelKo: string;
  detailKo: string;
} {
  const buyN = Math.round(m.buyPct * 100);
  const sellN = Math.round(m.sellPct * 100);
  const barAbs =
    m.barMovePct != null && Number.isFinite(m.barMovePct)
      ? Math.abs(m.barMovePct) >= 10
        ? Math.abs(m.barMovePct).toFixed(0)
        : Math.abs(m.barMovePct).toFixed(1)
      : '';
  const flow = m.buyDominant ? `매${buyN}` : m.sellDominant ? `매도${sellN}` : `매${buyN}`;
  const barPart =
    barAbs && m.barMovePct != null
      ? m.barMovePct >= 0
        ? `↑${barAbs}`
        : `↓${barAbs}`
      : '';
  const spotKo =
    m.spotMovePct != null && Math.abs(m.spotMovePct) >= 0.08
      ? fmtSpotPctSigned(m.spotMovePct, 1).replace(/%$/, '')
      : '';
  /** 현물은 의미 있을 때만 — 라벨 짧게 */
  const spotPart = spotKo ? `현${spotKo}` : '';
  const labelKo = [flow + (barPart || ''), spotPart].filter(Boolean).join(' ');
  const barKo = fmtSpotPctSigned(m.barMovePct, 1);
  const detailKo = [
    `매수 ${buyN}% · 매도 ${sellN}%`,
    barKo ? `봉 ${barKo}` : '',
    spotKo ? `현물 ${spotKo}%` : '',
    m.rvol != null ? `RVOL ${m.rvol.toFixed(1)}` : '',
    m.rsi != null ? `RSI ${m.rsi.toFixed(0)}` : '',
    m.macdHist != null && Number.isFinite(m.macdHist)
      ? `MACD ${m.macdHist >= 0 ? '+' : '−'}`
      : '',
    '조건부·확정아님',
  ]
    .filter(Boolean)
    .join(' · ');
  return { labelKo: labelKo || `매${buyN}`, detailKo };
}

export function buildVolumeTfBarMetrics(params: {
  candles: Candle[];
  barIdx: number;
  spotPx: number | null;
  rvolPeriod?: number;
  rsiSeries?: number[] | null;
  macdHistSeries?: number[] | null;
  last?: boolean;
  whaleBoost?: 'LONG' | 'SHORT' | null;
}): VolumeTfBarMetrics | null {
  const { candles, barIdx } = params;
  const c = candles[barIdx];
  if (!c) return null;
  const period = Math.max(8, Math.min(60, Math.floor(params.rvolPeriod ?? 20)));
  const sp = estimateBarBuySell(c);
  const tot = Math.max(0, Number(c.volume) || 0);
  const buyVol = Math.max(0, sp.buyVol);
  const sellVol = Math.max(0, sp.sellVol);
  const split = buyVol + sellVol;
  const buyV = split > 0 && tot > 0 ? (tot * buyVol) / split : buyVol;
  const sellV = Math.max(0, tot - buyV);
  const buyPct = tot > 0 ? buyV / tot : sp.buyPct;
  const sellPct = 1 - buyPct;
  const rvol = rvolAt(candles, barIdx, period);
  const rsiVal =
    params.rsiSeries && Number.isFinite(params.rsiSeries[barIdx]!)
      ? Number(params.rsiSeries[barIdx])
      : null;
  const macdHist =
    params.macdHistSeries && Number.isFinite(params.macdHistSeries[barIdx]!)
      ? Number(params.macdHistSeries[barIdx])
      : null;
  const barMovePct = barBodyMovePct(c);
  const share = barRangeShare(c);
  const spot =
    params.spotPx != null && params.spotPx > 0
      ? params.spotPx
      : Number(candles[candles.length - 1]?.close) > 0
        ? Number(candles[candles.length - 1]!.close)
        : null;
  const spotMovePct = spot != null ? spotMoveSinceBarPct(candles, barIdx, spot) : null;
  const buyDominant = buyPct >= 0.56;
  const sellDominant = sellPct >= 0.56;
  const colors = buySellColors({
    buyPct,
    rvol,
    rsi: rsiVal,
    barMovePct,
    macdHist,
    last: params.last === true,
    whaleBoost: params.whaleBoost ?? null,
  });
  const base = {
    time: Number(c.time),
    buyVol: buyV,
    sellVol: sellV,
    buyPct,
    sellPct,
    barMovePct,
    barUpSharePct: share.up,
    barDownSharePct: share.down,
    spotMovePct,
    rvol,
    rsi: rsiVal,
    macdHist,
    buyDominant,
    sellDominant,
  };
  const { labelKo, detailKo } = formatVolumeTfBarLabelKo(base);
  return {
    ...base,
    labelKo,
    detailKo,
    buyColor: colors.buy,
    sellColor: colors.sell,
  };
}

export function buildVolumeTfMetricsSeries(params: {
  candles: Candle[];
  spotPx?: number | null;
  rvolPeriod?: number;
  whaleBeamIntel?: WhaleBeamIntelPack | null;
}): VolumeTfBarMetrics[] {
  const rows = params.candles;
  const n = rows.length;
  if (n < 2) return [];
  const rsiSeries = rsi(rows, 14);
  const macdPack = macd(rows, 12, 26, 9);
  const spot =
    params.spotPx != null && Number(params.spotPx) > 0
      ? Number(params.spotPx)
      : Number(rows[n - 1]?.close) > 0
        ? Number(rows[n - 1]!.close)
        : null;
  const beam = params.whaleBeamIntel?.live?.beamKo;
  const whaleBoost: 'LONG' | 'SHORT' | null =
    beam === '롱빔' ? 'LONG' : beam === '숏빔' ? 'SHORT' : null;
  const out: VolumeTfBarMetrics[] = [];
  for (let i = 0; i < n; i++) {
    const m = buildVolumeTfBarMetrics({
      candles: rows,
      barIdx: i,
      spotPx: spot,
      rvolPeriod: params.rvolPeriod,
      rsiSeries,
      macdHistSeries: macdPack.hist,
      last: i === n - 1,
      whaleBoost: i >= n - 3 ? whaleBoost : null,
    });
    if (m) out.push(m);
  }
  return out;
}

/** 차트 라벨용 — 마지막 봉 + 핵심만 (전 봉 금지 · 지저분함 방지) */
export function pickVolumeTfLabelBars(
  metrics: VolumeTfBarMetrics[],
  maxLabels = 6
): VolumeTfBarMetrics[] {
  if (!metrics.length) return [];
  const n = metrics.length;
  const last = metrics[n - 1]!;
  const scored = metrics
    .slice(0, -1)
    .map((m, i) => {
      let s = 0;
      if (m.rvol != null && m.rvol >= 1.65) s += 22 + m.rvol * 4;
      if (m.buyDominant || m.sellDominant) s += 12;
      if (m.barMovePct != null && Math.abs(m.barMovePct) >= 0.35) s += 12;
      if (m.spotMovePct != null && Math.abs(m.spotMovePct) >= 0.45) s += 8;
      if (m.rsi != null && (m.rsi >= 65 || m.rsi <= 35)) s += 6;
      if (m.macdHist != null && Math.abs(m.macdHist) > 0) {
        if ((m.macdHist > 0 && m.buyDominant) || (m.macdHist < 0 && m.sellDominant)) s += 5;
      }
      return { m, i, s };
    })
    .filter((x) => x.s >= 28)
    .sort((a, b) => b.s - a.s);

  const picked: VolumeTfBarMetrics[] = [last];
  const used = new Set<number>([n - 1]);
  const minGap = 7;
  for (const x of scored) {
    if (picked.length >= maxLabels) break;
    if (used.has(x.i)) continue;
    let ok = true;
    for (const u of used) {
      if (Math.abs(u - x.i) < minGap) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    used.add(x.i);
    picked.push(x.m);
  }
  return picked.sort((a, b) => a.time - b.time);
}
