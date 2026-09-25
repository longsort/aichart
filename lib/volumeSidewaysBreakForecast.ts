/**
 * 횡보(박스) → 상승/하락 편향 · 현물(종가) 기준 예상 %
 *
 * 설계 근거 (와이코프·VSA·기존 차트 표본):
 * - 횡보 창: TF별 가격봉 수 (15m≈24, 1h≈20, 4h≈16, 1d≈12 …)
 * - 거래량: 창 내 RVOL 중앙값 ≤ 1.2 (조용한 매집/분산), 돌파는 RVOL≥1.5·넓은 봉
 * - 예상 %: ① 박스 높이(measured move) ② 같은 TF 과거 횡보 이탈 후 전진 표본 중앙값
 * - 확정 승률·수익 보장 아님 · 표본 부족 시 WAIT
 *
 * 기존 모집/확장/폭등/폭락 존·라벨은 건드리지 않음 — 부가 분석만.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import { smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import { fmtSpotPctSigned, spotPctMove } from '@/lib/mergedDeskSpotReactionPct';

export type SidewaysBias = 'up' | 'down' | 'wait';

export type SidewaysBreakStage =
  | 'sideways'
  | 'bias-up'
  | 'bias-down'
  | 'break-up'
  | 'break-down'
  | 'none';

export type SidewaysBreakForecast = {
  active: boolean;
  stage: SidewaysBreakStage;
  stageKo: string;
  bias: SidewaysBias;
  biasKo: string;
  /** 횡보 봉 수 */
  rangeBars: number;
  fromIdx: number;
  toIdx: number;
  rangeHigh: number;
  rangeLow: number;
  /** 박스 높이 % (현물 measured move 1차) */
  boxHeightPct: number;
  /** 과거 동일 TF 횡보 이탈 후 전진 표본 중앙값 % (있을 때) */
  histMedianPct: number | null;
  histP25Pct: number | null;
  histP75Pct: number | null;
  histSamples: number;
  /** 최종 참고 예상 % — 상승은 +, 하락은 − */
  expectedSpotPct: number | null;
  expectedSpotKo: string;
  /** 칩·마커용 한 줄 */
  chipKo: string;
  detailKo: string;
  confidence: 'low' | 'mid' | 'high';
  buyPct: number;
  quietRvolMed: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/**
 * TF별 분석 창 — 가격봉 + 전진 표본 봉수
 * (와이코프 일봉 베이스를 하위 TF로 스케일: 대략 1~2주 분량 압축)
 */
export function sidewaysWindowForTf(tf: string): {
  win: number;
  minWin: number;
  maxSpanPct: number;
  maxNetPct: number;
  quietRvolMax: number;
  breakRvolMin: number;
  horizon: number;
  lookback: number;
} {
  const n = normalizeChartTimeframe(tf);
  const map: Record<
    string,
    {
      win: number;
      minWin: number;
      maxSpanPct: number;
      maxNetPct: number;
      quietRvolMax: number;
      breakRvolMin: number;
      horizon: number;
      lookback: number;
    }
  > = {
    '1m': {
      win: 36,
      minWin: 24,
      maxSpanPct: 0.014,
      maxNetPct: 0.009,
      quietRvolMax: 1.22,
      breakRvolMin: 1.45,
      horizon: 48,
      lookback: 420,
    },
    '3m': {
      win: 32,
      minWin: 20,
      maxSpanPct: 0.016,
      maxNetPct: 0.01,
      quietRvolMax: 1.2,
      breakRvolMin: 1.45,
      horizon: 40,
      lookback: 360,
    },
    '5m': {
      win: 28,
      minWin: 18,
      maxSpanPct: 0.018,
      maxNetPct: 0.011,
      quietRvolMax: 1.2,
      breakRvolMin: 1.48,
      horizon: 36,
      lookback: 320,
    },
    '15m': {
      win: 24,
      minWin: 16,
      maxSpanPct: 0.022,
      maxNetPct: 0.014,
      quietRvolMax: 1.18,
      breakRvolMin: 1.5,
      horizon: 32,
      lookback: 280,
    },
    '1h': {
      win: 20,
      minWin: 14,
      maxSpanPct: 0.028,
      maxNetPct: 0.016,
      quietRvolMax: 1.18,
      breakRvolMin: 1.5,
      horizon: 24,
      lookback: 240,
    },
    '4h': {
      win: 16,
      minWin: 12,
      maxSpanPct: 0.042,
      maxNetPct: 0.024,
      quietRvolMax: 1.2,
      breakRvolMin: 1.5,
      horizon: 18,
      lookback: 200,
    },
    '1d': {
      win: 14,
      minWin: 10,
      maxSpanPct: 0.065,
      maxNetPct: 0.035,
      quietRvolMax: 1.22,
      breakRvolMin: 1.45,
      horizon: 12,
      lookback: 180,
    },
    '1w': {
      win: 10,
      minWin: 8,
      maxSpanPct: 0.1,
      maxNetPct: 0.05,
      quietRvolMax: 1.25,
      breakRvolMin: 1.4,
      horizon: 8,
      lookback: 120,
    },
    '1M': {
      win: 8,
      minWin: 6,
      maxSpanPct: 0.14,
      maxNetPct: 0.07,
      quietRvolMax: 1.28,
      breakRvolMin: 1.35,
      horizon: 6,
      lookback: 90,
    },
  };
  return (
    map[n] ?? {
      win: 20,
      minWin: 14,
      maxSpanPct: 0.03,
      maxNetPct: 0.018,
      quietRvolMax: 1.2,
      breakRvolMin: 1.5,
      horizon: 24,
      lookback: 220,
    }
  );
}

function rvolAt(rows: Candle[], i: number, period: number): number {
  const sma = smaTotalVolumeAt(rows, i, period);
  const v = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(sma > 0) || !(v > 0)) return 1;
  return v / sma;
}

type RangeBox = {
  from: number;
  to: number;
  hi: number;
  lo: number;
  mid: number;
  spanPct: number;
  netPct: number;
  compression: number;
  buyPct: number;
  quietRvolMed: number;
  score: number;
};

function scanBoxes(
  rows: Candle[],
  cfg: ReturnType<typeof sidewaysWindowForTf>,
  period: number
): RangeBox[] {
  const n = rows.length;
  const ranges = rows.map((c) => Math.max(1e-9, Number(c.high) - Number(c.low)));
  const start = Math.max(cfg.minWin, n - cfg.lookback);
  const out: RangeBox[] = [];

  for (let end = start; end < n; end++) {
    for (const win of [cfg.win, cfg.minWin, Math.floor((cfg.win + cfg.minWin) / 2)]) {
      const from = end - win + 1;
      if (from < 0) continue;
      const seg = rows.slice(from, end + 1);
      const hi = Math.max(...seg.map((c) => Number(c.high)));
      const lo = Math.min(...seg.map((c) => Number(c.low)));
      const mid = (hi + lo) / 2;
      if (!(mid > 0)) continue;
      const spanPct = (hi - lo) / mid;
      const open0 = Number(seg[0]!.open ?? seg[0]!.close);
      const close1 = Number(seg[seg.length - 1]!.close);
      const netPct = open0 > 0 ? Math.abs(close1 - open0) / open0 : 1;
      if (spanPct > cfg.maxSpanPct || netPct > cfg.maxNetPct) continue;

      const avgR = avg(ranges.slice(from, end + 1));
      const ctxFrom = Math.max(0, from - Math.max(20, win));
      const ctxR = avg(ranges.slice(ctxFrom, from + 1)) || avgR;
      const compression = clamp(1 - avgR / Math.max(1e-9, ctxR), 0, 1);
      if (compression < 0.06) continue;

      const rvols: number[] = [];
      let buy = 0;
      let sell = 0;
      for (let i = from; i <= end; i++) {
        rvols.push(rvolAt(rows, i, period));
        const sp = estimateBarBuySell(rows[i]!);
        buy += Math.max(0, sp.buyVol);
        sell += Math.max(0, sp.sellVol);
      }
      const quietRvolMed = median(rvols) ?? 1;
      if (quietRvolMed > cfg.quietRvolMax + 0.15) continue;
      const tot = buy + sell;
      const buyPct = tot > 0 ? buy / tot : 0.5;
      const quietBonus = quietRvolMed <= cfg.quietRvolMax ? 0.12 : 0;
      const score = compression * 0.45 + (1 - spanPct / cfg.maxSpanPct) * 0.25 + quietBonus + win / 80;
      if (score < 0.18) continue;
      out.push({
        from,
        to: end,
        hi,
        lo,
        mid,
        spanPct,
        netPct,
        compression,
        buyPct,
        quietRvolMed,
        score,
      });
    }
  }

  out.sort((a, b) => b.score - a.score || b.to - a.to);
  const picked: RangeBox[] = [];
  for (const b of out) {
    if (picked.some((p) => !(b.to < p.from - 2 || b.from > p.to + 2))) continue;
    picked.push(b);
    if (picked.length >= 24) break;
  }
  return picked.sort((a, b) => a.to - b.to);
}

function histBreakSamples(
  boxes: RangeBox[],
  rows: Candle[],
  horizon: number,
  bias: 'up' | 'down'
): number[] {
  const n = rows.length;
  const samples: number[] = [];
  for (const b of boxes) {
    if (b.to + 2 >= n - 1) continue;
    const after = Math.min(n - 1, b.to + horizon);
    const c0 = Number(rows[b.to]!.close);
    if (!(c0 > 0)) continue;
    let extremum = c0;
    for (let i = b.to + 1; i <= after; i++) {
      if (bias === 'up') extremum = Math.max(extremum, Number(rows[i]!.high));
      else extremum = Math.min(extremum, Number(rows[i]!.low));
    }
    const brokeUp = Number(rows[Math.min(n - 1, b.to + 2)]!.close) > b.hi * 1.0005;
    const brokeDn = Number(rows[Math.min(n - 1, b.to + 2)]!.close) < b.lo * 0.9995;
    if (bias === 'up' && !brokeUp) continue;
    if (bias === 'down' && !brokeDn) continue;
    const pct = spotPctMove(c0, extremum);
    if (pct == null) continue;
    if (bias === 'up' && pct > 0.05) samples.push(pct);
    if (bias === 'down' && pct < -0.05) samples.push(pct);
  }
  return samples;
}

function emptyForecast(): SidewaysBreakForecast {
  return {
    active: false,
    stage: 'none',
    stageKo: '횡보없음',
    bias: 'wait',
    biasKo: '관망',
    rangeBars: 0,
    fromIdx: 0,
    toIdx: 0,
    rangeHigh: 0,
    rangeLow: 0,
    boxHeightPct: 0,
    histMedianPct: null,
    histP25Pct: null,
    histP75Pct: null,
    histSamples: 0,
    expectedSpotPct: null,
    expectedSpotKo: '',
    chipKo: '',
    detailKo: '횡보 박스 없음 · 참고용',
    confidence: 'low',
    buyPct: 0.5,
    quietRvolMed: 1,
  };
}

/**
 * 최근 횡보 박스 기준 — 상승/하락 편향 + 현물 예상 %
 */
export function buildSidewaysBreakForecast(
  candles: Candle[],
  opts?: { timeframe?: string; rvolPeriod?: number }
): SidewaysBreakForecast {
  const rows = candles.filter((c) => c && Number.isFinite(Number(c.close)));
  const n = rows.length;
  const cfg = sidewaysWindowForTf(opts?.timeframe || '15m');
  const period = Math.max(8, Math.min(40, opts?.rvolPeriod ?? 20));
  if (n < cfg.minWin + 8) return emptyForecast();

  const boxes = scanBoxes(rows, cfg, period);
  if (!boxes.length) return emptyForecast();

  const last = n - 1;
  const live =
    boxes
      .filter((b) => last - b.to <= Math.max(4, Math.floor(cfg.win * 0.35)) || (last >= b.from && last <= b.to))
      .sort((a, b) => b.score - a.score || b.to - a.to)[0] ?? boxes[boxes.length - 1]!;

  const px = Number(rows[last]!.close);
  const boxHeightPct = live.mid > 0 ? ((live.hi - live.lo) / live.mid) * 100 : 0;

  /** 박스 내 종가 위치·수급·스프링/UTAD 유사 터치 */
  let upScore = 0;
  let dnScore = 0;
  const pos = (px - live.lo) / Math.max(1e-9, live.hi - live.lo);
  if (live.buyPct >= 0.54) upScore += 1.2;
  if (live.buyPct <= 0.46) dnScore += 1.2;
  if (pos >= 0.62) upScore += 0.8;
  if (pos <= 0.38) dnScore += 0.8;

  const springLook = Math.min(last, live.to + 3);
  for (let i = live.from; i <= springLook; i++) {
    const lo = Number(rows[i]!.low);
    const hi = Number(rows[i]!.high);
    const cl = Number(rows[i]!.close);
    const rv = rvolAt(rows, i, period);
    /** spring: 저점 살짝 이탈 후 회수 + 낮은~보통 거래량 */
    if (lo < live.lo * 0.9985 && cl > live.lo && rv <= cfg.breakRvolMin) upScore += 1.4;
    /** UTAD: 고점 살짝 이탈 후 실패 */
    if (hi > live.hi * 1.0015 && cl < live.hi && rv <= cfg.breakRvolMin) dnScore += 1.4;
  }

  const lastRv = rvolAt(rows, last, period);
  const lastRange =
    Number(rows[last]!.high) - Number(rows[last]!.low);
  const atrApprox = avg(
    rows.slice(Math.max(0, last - 14), last + 1).map((c) => Number(c.high) - Number(c.low))
  );
  const wideBar = atrApprox > 0 && lastRange >= atrApprox * 1.35;

  let stage: SidewaysBreakStage = 'sideways';
  if (px > live.hi * 1.0008 && lastRv >= cfg.breakRvolMin && (wideBar || lastRv >= 1.7)) {
    stage = 'break-up';
    upScore += 2;
  } else if (px < live.lo * 0.9992 && lastRv >= cfg.breakRvolMin && (wideBar || lastRv >= 1.7)) {
    stage = 'break-down';
    dnScore += 2;
  } else if (upScore >= dnScore + 0.8) {
    stage = 'bias-up';
  } else if (dnScore >= upScore + 0.8) {
    stage = 'bias-down';
  }

  let bias: SidewaysBias = 'wait';
  if (stage === 'break-up' || stage === 'bias-up') bias = 'up';
  else if (stage === 'break-down' || stage === 'bias-down') bias = 'down';

  const histBias = bias === 'wait' ? (live.buyPct >= 0.5 ? 'up' : 'down') : bias;
  const samples = histBreakSamples(boxes, rows, cfg.horizon, histBias);
  const sorted = [...samples].sort((a, b) => a - b);
  const histMedianPct = median(sorted);
  const histP25Pct = percentile(sorted, 0.25);
  const histP75Pct = percentile(sorted, 0.75);

  /** measured move ± 과거 중앙값 혼합 */
  let expectedSpotPct: number | null = null;
  if (bias === 'up') {
    const mm = boxHeightPct;
    expectedSpotPct =
      histMedianPct != null && samples.length >= 6
        ? mm * 0.45 + Math.abs(histMedianPct) * 0.55
        : mm;
  } else if (bias === 'down') {
    const mm = -boxHeightPct;
    expectedSpotPct =
      histMedianPct != null && samples.length >= 6
        ? mm * 0.45 - Math.abs(histMedianPct) * 0.55
        : mm;
  }

  const confidence: SidewaysBreakForecast['confidence'] =
    samples.length >= 12 && Math.abs(upScore - dnScore) >= 1.5
      ? 'high'
      : samples.length >= 6 || Math.abs(upScore - dnScore) >= 1
        ? 'mid'
        : 'low';

  const stageKo =
    stage === 'break-up'
      ? '상승돌파'
      : stage === 'break-down'
        ? '하락돌파'
        : stage === 'bias-up'
          ? '횡보·상승편향'
          : stage === 'bias-down'
            ? '횡보·하락편향'
            : stage === 'sideways'
              ? '횡보중'
              : '횡보없음';

  const biasKo = bias === 'up' ? '상승' : bias === 'down' ? '하락' : '관망';
  const expectedSpotKo = fmtSpotPctSigned(expectedSpotPct, 1);
  const histKo =
    histMedianPct != null && samples.length >= 4
      ? `과거n${samples.length} ${fmtSpotPctSigned(histP25Pct)}~${fmtSpotPctSigned(histP75Pct)}`
      : samples.length
        ? `과거n${samples.length}(부족)`
        : '과거표본없음';

  const chipKo = expectedSpotKo
    ? `횡보→${biasKo} ${expectedSpotKo}`
    : `횡보→${biasKo}`;

  const detailKo = [
    stageKo,
    `${live.to - live.from + 1}봉박스`,
    `높이${boxHeightPct.toFixed(1)}%`,
    `매수비중${Math.round(live.buyPct * 100)}%`,
    histKo,
    expectedSpotKo ? `현물참고 ${expectedSpotKo}` : '',
    '확정아님',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    active: true,
    stage,
    stageKo,
    bias,
    biasKo,
    rangeBars: live.to - live.from + 1,
    fromIdx: live.from,
    toIdx: live.to,
    rangeHigh: live.hi,
    rangeLow: live.lo,
    boxHeightPct,
    histMedianPct,
    histP25Pct,
    histP75Pct,
    histSamples: samples.length,
    expectedSpotPct,
    expectedSpotKo,
    chipKo,
    detailKo,
    confidence,
    buyPct: live.buyPct,
    quietRvolMed: live.quietRvolMed,
  };
}
