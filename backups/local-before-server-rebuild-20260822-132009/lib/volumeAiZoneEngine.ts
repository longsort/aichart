/**
 * Bitget Vol — 거래량 구간 분석 (1·2번 박스형: 거래량↑·매도↑·저점·상승/하락)
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe, timeframeRank } from '@/lib/constants';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import { sanitizeChartCandlesForSeries, smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';

export type VolumeAiZoneKind =
  | 'low_surge'
  | 'range_heavy'
  | 'vol_up'
  | 'sell_up'
  | 'buy_up'
  | 'high_sell'
  | 'up'
  | 'down';

export type VolumeVerdictSide = 'LONG' | 'SHORT' | 'WAIT';

export type VolumeVerdict = {
  side: VolumeVerdictSide;
  /** 신호 일치도 0–100 (승률·수익 보장 아님) */
  strength: number;
  verdictKo: string;
  reasonKo: string;
  invalidationKo: string;
  color: string;
};

export type VolumeAiZone = {
  id: string;
  kind: VolumeAiZoneKind;
  layer: 'cluster' | 'trend';
  segNo?: number;
  timeFrom: number;
  timeTo: number;
  fromIdx: number;
  toIdx: number;
  bars: number;
  buyPct: number;
  sellPct: number;
  avgRvol: number;
  volTrendPct: number;
  sellTrendPct: number;
  buyTrendPct: number;
  netPct: number;
  /** 구간 평균 vs 직전 lookback 구간 평균 */
  volVsPastPct: number;
  sellVsPastPct: number;
  buyVsPastPct: number;
  priceVsPastPct: number;
  segLow?: number;
  segHigh?: number;
  labelKo: string;
  detailKo: string;
  markerKo: string;
  plainShortKo: string;
  plainSummaryKo: string;
  verdictSide: VolumeVerdictSide;
  verdictStrength: number;
  verdictKo: string;
  verdictReasonKo: string;
  invalidationKo: string;
  verdictColor: string;
  color: string;
  fill: string;
};

export type VolumeLiveCompare = {
  volVsPastPct: number;
  sellVsPastPct: number;
  buyVsPastPct: number;
  priceVsPrevPct: number;
  rvol: number;
  headlineKo: string;
  verdict: VolumeVerdict;
};

export type VolumeAiZonePack = {
  zones: VolumeAiZone[];
  liveZone: VolumeAiZone | null;
  liveCompare: VolumeLiveCompare | null;
  headlineKo: string;
};

export type VolumePanelLayout = {
  candleScaleMargins: { top: number; bottom: number };
  volumeScaleMargins: { top: number; bottom: number };
  volPanelTopRatio: number;
};

/** 차트 우측 가격축 — 낭비 공간 줄이기 · axisFontSize로 숫자·축폭 사용자 조절 */
export function getChartPriceScaleLayout(opts: {
  mobileFs?: boolean;
  chartFullscreen?: boolean;
  mergedDesk?: boolean;
  /** 우측 가격축·축옆 라벨 글자 (차트 본문 SL/E/TP 라벨과 별개) */
  axisFontSize?: number;
}): {
  minimumWidth: number;
  rightOffset: number;
  bitgetRightOffset: number;
  layoutFontSize?: number;
} {
  const compact = Boolean(opts.mobileFs || opts.chartFullscreen || opts.mergedDesk);
  const userFs =
    opts.axisFontSize != null && Number.isFinite(opts.axisFontSize)
      ? Math.max(1, Math.min(20, Math.round(opts.axisFontSize)))
      : null;
  const layoutFontSize = userFs ?? (opts.mobileFs || compact ? 11 : undefined);
  const minimumWidth =
    layoutFontSize != null
      ? Math.max(32, Math.min(78, Math.round(layoutFontSize * (opts.mobileFs ? 3.6 : 4.2) + (opts.mobileFs ? 6 : 10))))
      : opts.mobileFs
        ? 44
        : compact
          ? 46
          : 58;
  /** 통합·분석: 마지막 캔들 뒤 예측 여백 (서버 ChartView와 동일) */
  const mergedFuturePad = opts.mergedDesk ? MERGED_DESK_RIGHT_FUTURE_BARS : 0;
  return {
    minimumWidth,
    rightOffset: opts.mobileFs
      ? Math.max(2, Math.min(12, mergedFuturePad || 2))
      : opts.mergedDesk
        ? mergedFuturePad
        : compact
          ? 5
          : 10,
    bitgetRightOffset: opts.mobileFs
      ? Math.max(3, Math.min(14, mergedFuturePad || 3))
      : opts.mergedDesk
        ? Math.max(mergedFuturePad, 14)
        : compact
          ? 8
          : 14,
    layoutFontSize,
  };
}
/** 전체화면: 거래량 패널을 차트 최하단에 밀착. 폰 FS는 캔들 비중 더 큼 */
export function getVolumePanelLayout(fullscreen: boolean, mobileFs = false): VolumePanelLayout {
  if (mobileFs) {
    return {
      candleScaleMargins: { top: 0.035, bottom: 0.015 },
      volumeScaleMargins: { top: 0.978, bottom: 0 },
      volPanelTopRatio: 0.978,
    };
  }
  if (fullscreen) {
    return {
      candleScaleMargins: { top: 0.06, bottom: 0.04 },
      volumeScaleMargins: { top: 0.96, bottom: 0 },
      volPanelTopRatio: 0.96,
    };
  }
  return {
    candleScaleMargins: { top: 0.10, bottom: 0.22 },
    volumeScaleMargins: { top: 0.82, bottom: 0 },
    volPanelTopRatio: 0.82,
  };
}

type BarMeta = {
  buyPct: number;
  sellPct: number;
  buyVol: number;
  sellVol: number;
  vol: number;
  rvol: number;
  netPct: number;
};

const STYLE: Record<
  VolumeAiZoneKind,
  { color: string; fill: string; base: string }
> = {
  low_surge: { color: '#22d3ee', fill: 'rgba(34,211,238,0.28)', base: '바닥에서 거래 터짐' },
  range_heavy: { color: '#a78bfa', fill: 'rgba(167,139,250,0.22)', base: '횡보인데 거래 많음' },
  vol_up: { color: '#4ade80', fill: 'rgba(74,222,128,0.2)', base: '거래 늘어남' },
  sell_up: { color: '#f97316', fill: 'rgba(249,115,22,0.28)', base: '매도 많아짐' },
  buy_up: { color: '#22c55e', fill: 'rgba(34,197,94,0.22)', base: '매수 많아짐' },
  high_sell: { color: '#fb7185', fill: 'rgba(251,113,133,0.32)', base: '고점에서 매도 많음' },
  up: { color: '#16a34a', fill: 'rgba(22,163,74,0.18)', base: '가격 오름' },
  down: { color: '#dc2626', fill: 'rgba(220,38,38,0.18)', base: '가격 내림' },
};

function swingWing(timeframe?: string): number {
  const tf = normalizeChartTimeframe(timeframe ?? '4h');
  const map: Record<string, number> = {
    '1m': 4,
    '3m': 4,
    '5m': 4,
    '15m': 4,
    '1h': 3,
    '4h': 3,
    '1d': 3,
    '1w': 2,
    '1M': 2,
    '1Y': 2,
  };
  return map[tf] ?? 3;
}

/** 분·시·일·주·달 — 동일 UX를 위한 TF별 엔진 파라미터 */
export type VolumeAiEngineParams = {
  wing: number;
  rvolPeriod: number;
  scanBars: number;
  clusterHotRvol: number;
  clusterMinRvol: number;
  clusterAvgRvol: number;
  clusterMaxSpan: number;
  pivotMinBars: number;
  maxZones: number;
};

export function getVolumeAiEngineParams(timeframe?: string): VolumeAiEngineParams {
  const tf = normalizeChartTimeframe(timeframe ?? '4h');
  const wing = swingWing(tf);
  const rank = timeframeRank(tf);
  if (rank >= timeframeRank('1M')) {
    return {
      wing,
      rvolPeriod: 8,
      scanBars: 72,
      clusterHotRvol: 1.04,
      clusterMinRvol: 1.02,
      clusterAvgRvol: 0.86,
      clusterMaxSpan: 18,
      pivotMinBars: 3,
      maxZones: 10,
    };
  }
  if (tf === '1w') {
    return {
      wing,
      rvolPeriod: 12,
      scanBars: 100,
      clusterHotRvol: 1.06,
      clusterMinRvol: 1.04,
      clusterAvgRvol: 0.88,
      clusterMaxSpan: 20,
      pivotMinBars: 3,
      maxZones: 10,
    };
  }
  if (tf === '1d') {
    return {
      wing,
      rvolPeriod: 16,
      scanBars: 140,
      clusterHotRvol: 1.08,
      clusterMinRvol: 1.06,
      clusterAvgRvol: 0.9,
      clusterMaxSpan: 22,
      pivotMinBars: 4,
      maxZones: 10,
    };
  }
  return {
    wing,
    rvolPeriod: 20,
    scanBars: 160,
    clusterHotRvol: 1.12,
    clusterMinRvol: 1.08,
    clusterAvgRvol: 0.92,
    clusterMaxSpan: 16,
    pivotMinBars: 4,
    maxZones: 10,
  };
}

function buildBarMeta(rows: Candle[], rvolPeriod: number): BarMeta[] {
  return rows.map((c, i) => {
    const split = estimateBarBuySell(c);
    const vol = Math.max(0, c.volume || 0);
    const sma = i >= rvolPeriod - 1 ? smaTotalVolumeAt(rows, i, rvolPeriod) : vol;
    const rvol = sma > 0 ? vol / sma : 1;
    const o = c.open;
    const netPct = o > 0 ? ((c.close - o) / o) * 100 : 0;
    return {
      buyPct: split.buyPct,
      sellPct: split.sellPct,
      buyVol: split.buyVol,
      sellVol: split.sellVol,
      vol,
      rvol,
      netPct,
    };
  });
}

function trendPct(first: number, second: number): number {
  if (first <= 0) return second > 0 ? 100 : 0;
  return ((second - first) / first) * 100;
}

function fmtPct(v: number, decimals = 0): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
}

function plainShortKind(kind: VolumeAiZoneKind): string {
  const map: Record<VolumeAiZoneKind, string> = {
    low_surge: '바닥',
    range_heavy: '횡보',
    vol_up: '거래↑',
    sell_up: '매도↑',
    buy_up: '매수↑',
    high_sell: '고점',
    up: '오름',
    down: '내림',
  };
  return map[kind];
}

function comparePlainSentence(pct: number, subject: string): string {
  const abs = Math.abs(pct).toFixed(0);
  if (pct >= 12) return `${subject}이(가) 최근 평균보다 ${abs}% 더 많아요.`;
  if (pct <= -12) return `${subject}이(가) 최근 평균보다 ${abs}% 줄었어요.`;
  if (pct >= 5) return `${subject}이(가) 조금 더 많아요 (+${abs}%).`;
  if (pct <= -5) return `${subject}이(가) 조금 줄었어요 (-${abs}%).`;
  return `${subject}은(는) 최근 평균과 비슷해요.`;
}

function pricePlainSentence(pct: number, range = false): string {
  const abs = Math.abs(pct).toFixed(range ? 1 : 2);
  if (pct >= 0.8) return range ? `이 구간 동안 가격이 ${abs}% 올랐어요.` : `가격이 ${abs}% 올랐어요.`;
  if (pct <= -0.8) return range ? `이 구간 동안 가격이 ${abs}% 내렸어요.` : `가격이 ${abs}% 내렸어요.`;
  return range ? '이 구간 동안 가격은 거의 변하지 않았어요.' : '가격은 거의 변하지 않았어요.';
}

function rvolPlainSentence(rvol: number): string {
  if (rvol >= 1.5) return `평소 거래량의 ${rvol.toFixed(1)}배 수준으로, 꽤 많이 터졌어요.`;
  if (rvol >= 1.15) return `평소보다 거래가 조금 더 활발해요 (${rvol.toFixed(1)}배).`;
  if (rvol <= 0.85) return `평소보다 거래가 한산해요 (${rvol.toFixed(1)}배).`;
  return `평소 거래량과 비슷한 수준이에요 (${rvol.toFixed(1)}배).`;
}

export function buildPlainZoneSummary(zone: VolumeAiZone): string {
  const head = zone.segNo ? `${zone.segNo}번 ` : '';
  return `${head}${zone.verdictKo}. ${zone.verdictReasonKo}`;
}

/** 거래량·매수·매도·가격 종합 → 롱/숏/관망 확정 */
export function computeVolumeVerdict(input: {
  kind: VolumeAiZoneKind;
  layer: 'cluster' | 'trend';
  buyPct: number;
  sellPct: number;
  netPct: number;
  volVsPastPct: number;
  sellVsPastPct: number;
  buyVsPastPct: number;
  avgRvol: number;
  segLow?: number;
  segHigh?: number;
}): VolumeVerdict {
  let longScore = 0;
  let shortScore = 0;
  const reasons: string[] = [];

  const buyLead = input.buyVsPastPct - input.sellVsPastPct;
  if (buyLead >= 15) {
    longScore += 4;
    reasons.push(`매수 증가(+${input.buyVsPastPct.toFixed(0)}%)가 매도(+${input.sellVsPastPct.toFixed(0)}%)보다 큼`);
  } else if (buyLead <= -15) {
    shortScore += 4;
    reasons.push(`매도 증가(+${input.sellVsPastPct.toFixed(0)}%)가 매수(+${input.buyVsPastPct.toFixed(0)}%)보다 큼`);
  }

  if (input.buyPct >= 0.55) {
    longScore += 2;
    if (!reasons.some((r) => r.includes('매수'))) reasons.push('구간 체결 중 매수 비중이 더 큼');
  }
  if (input.sellPct >= 0.55) {
    shortScore += 2;
    if (!reasons.some((r) => r.includes('매도'))) reasons.push('구간 체결 중 매도 비중이 더 큼');
  }

  if (input.netPct >= 0.8) {
    longScore += 5;
    reasons.unshift(`구간 가격 +${input.netPct.toFixed(1)}% 상승`);
  } else if (input.netPct <= -0.8) {
    shortScore += 5;
    reasons.unshift(`구간 가격 ${input.netPct.toFixed(1)}% 하락`);
  } else if (Math.abs(input.netPct) < 0.5) {
    reasons.push('가격은 거의 횡보');
  }

  if (input.kind === 'low_surge') {
    longScore += 3;
    reasons.push('바닥에서 거래 급증');
  }
  if (input.kind === 'high_sell') {
    shortScore += 3;
    reasons.push('고점에서 매도 집중');
  }
  if (input.kind === 'buy_up') longScore += 2;
  if (input.kind === 'sell_up') shortScore += 2;

  if (input.avgRvol >= 1.25 && input.volVsPastPct >= 20) {
    if (longScore >= shortScore) longScore += 1;
    else shortScore += 1;
  }

  const diff = longScore - shortScore;
  const strength = Math.min(92, Math.max(35, 40 + Math.abs(diff) * 8));

  let side: VolumeVerdictSide = 'WAIT';
  if (diff >= 4) side = 'LONG';
  else if (diff <= -4) side = 'SHORT';

  const verdictKo =
    side === 'LONG'
      ? `롱(매수) 확정 — 신호 ${strength}점`
      : side === 'SHORT'
        ? `숏(매도) 확정 — 신호 ${strength}점`
        : `관망 — 신호 ${strength}점 (매수·매도 혼재)`;

  let reasonKo: string;
  if (side === 'LONG') {
    reasonKo =
      reasons.slice(0, 2).join(' · ') ||
      '매수·가격 흐름이 롱 쪽으로 맞물림';
  } else if (side === 'SHORT') {
    reasonKo =
      reasons.slice(0, 2).join(' · ') ||
      '매도·가격 흐름이 숏 쪽으로 맞물림';
  } else {
    reasonKo =
      buyLead > 5 && input.netPct < -0.5
        ? `매수는 늘었지만 가격은 ${Math.abs(input.netPct).toFixed(1)}% 내렸어요 — 방향 확인 필요`
        : buyLead < -5 && input.netPct > 0.5
          ? `매도는 늘었지만 가격은 ${input.netPct.toFixed(1)}% 올랐어요 — 방향 확인 필요`
          : reasons.slice(0, 2).join(' · ') || '매수·매도·가격 신호가 엇갈림';
  }

  const invalidationKo =
    side === 'LONG' && input.segLow != null
      ? `무효: 가격이 구간 저점 ${fmtPrice(input.segLow)} 아래로 이탈`
      : side === 'SHORT' && input.segHigh != null
        ? `무효: 가격이 구간 고점 ${fmtPrice(input.segHigh)} 위로 돌파`
        : side === 'LONG'
          ? '무효: 가격이 구간 저점 아래로 내려가면 롱 시나리오 약화'
          : side === 'SHORT'
            ? '무효: 가격이 구간 고점 위로 올라가면 숏 시나리오 약화'
            : '무효: 매수·매도 우위가 한쪽으로 기울 때까지 관망';

  const color = side === 'LONG' ? '#22c55e' : side === 'SHORT' ? '#f87171' : '#fbbf24';

  return { side, strength, verdictKo, reasonKo, invalidationKo, color };
}

function fmtPrice(p: number): string {
  return p >= 1000 ? p.toFixed(0) : p.toFixed(2);
}

export function computeLiveVolumeVerdict(live: {
  volVsPastPct: number;
  sellVsPastPct: number;
  buyVsPastPct: number;
  priceVsPrevPct: number;
  rvol: number;
}): VolumeVerdict {
  return computeVolumeVerdict({
    kind: 'vol_up',
    layer: 'cluster',
    buyPct: 0.5,
    sellPct: 0.5,
    netPct: live.priceVsPrevPct,
    volVsPastPct: live.volVsPastPct,
    sellVsPastPct: live.sellVsPastPct,
    buyVsPastPct: live.buyVsPastPct,
    avgRvol: live.rvol,
  });
}

export function verdictShortKo(side: VolumeVerdictSide): string {
  return side === 'LONG' ? '롱' : side === 'SHORT' ? '숏' : '관망';
}

export function comparePlainShort(pct: number): string {
  const abs = Math.abs(pct).toFixed(0);
  if (pct >= 8) return `${abs}%↑`;
  if (pct <= -8) return `${abs}%↓`;
  return '비슷';
}

/** 차트 거래량 마커용 — 짧게 (1롱 / 2숏 / 3관) */
export function buildVolumeVisibleLabel(z: VolumeAiZone, widthPx: number): string {
  const side = verdictShortKo(z.verdictSide);
  const no = z.segNo != null ? String(z.segNo) : '';
  if (widthPx >= 48 && no) return `${no}${side}`;
  if (no) return `${no}${side.charAt(0)}`;
  return side;
}

/** 캔들 테두리 — 거래량 구간 확정색 (차트만 보고 구분) */
export function buildVolumeVerdictCandleBorderByTime(
  candles: Candle[],
  pack: VolumeAiZonePack | null,
  timeframe?: string
): Map<number, string> {
  const out = new Map<number, string>();
  if (!pack?.zones.length) return out;
  const tf = normalizeChartTimeframe(timeframe ?? '4h');
  const rows = sanitizeChartCandlesForSeries(candles, tf);
  const rankOf = (z: VolumeAiZone) => (z.layer === 'cluster' ? 100 : 20) + z.bars;
  const tintByIdx = new Map<number, VolumeAiZone>();
  for (const z of pack.zones) {
    for (let i = z.fromIdx; i <= z.toIdx && i < rows.length; i++) {
      const prev = tintByIdx.get(i);
      if (!prev || rankOf(z) >= rankOf(prev)) tintByIdx.set(i, z);
    }
  }
  for (const [i, z] of tintByIdx) {
    const c = rows[i];
    if (!c) continue;
    out.set(Number(c.time), z.verdictColor || z.color);
  }
  return out;
}

export function applyVolumeVerdictCandleBorders<T extends { time: unknown; borderColor?: string; wickColor?: string }>(
  data: T[],
  borderByTime: Map<number, string>
): T[] {
  if (!borderByTime.size) return data;
  return data.map((bar) => {
    const t = Number(bar.time);
    const border = borderByTime.get(t);
    if (!border) return bar;
    return { ...bar, borderColor: border, wickColor: border };
  });
}

function segmentVsPast(
  meta: BarMeta[],
  rows: Candle[],
  from: number,
  to: number,
  lookback = 20
): {
  volVsPastPct: number;
  sellVsPastPct: number;
  buyVsPastPct: number;
  priceVsPastPct: number;
} {
  const histTo = from - 1;
  const histFrom = Math.max(0, from - lookback);
  if (histTo < histFrom) {
    return { volVsPastPct: 0, sellVsPastPct: 0, buyVsPastPct: 0, priceVsPastPct: 0 };
  }
  const histBars = histTo - histFrom + 1;
  let histVol = 0;
  let histSell = 0;
  let histBuy = 0;
  let histClose = 0;
  for (let i = histFrom; i <= histTo; i++) {
    const m = meta[i]!;
    histVol += m.vol;
    histSell += m.sellVol;
    histBuy += m.buyVol;
    histClose += rows[i]!.close;
  }
  histVol /= histBars;
  histSell /= histBars;
  histBuy /= histBars;
  histClose /= histBars;

  const segBars = to - from + 1;
  let segVol = 0;
  let segSell = 0;
  let segBuy = 0;
  let segClose = 0;
  for (let i = from; i <= to; i++) {
    const m = meta[i]!;
    segVol += m.vol;
    segSell += m.sellVol;
    segBuy += m.buyVol;
    segClose += rows[i]!.close;
  }
  segVol /= segBars;
  segSell /= segBars;
  segBuy /= segBars;
  segClose /= segBars;

  return {
    volVsPastPct: trendPct(histVol, segVol),
    sellVsPastPct: trendPct(histSell, segSell),
    buyVsPastPct: trendPct(histBuy, segBuy),
    priceVsPastPct: histClose > 0 ? trendPct(histClose, segClose) : 0,
  };
}

function buildDetailKo(
  labelKo: string,
  tr: ReturnType<typeof segmentTrends>,
  past: ReturnType<typeof segmentVsPast>,
  bars: number
): string {
  return [
    labelKo,
    `Vol${fmtPct(tr.volTrendPct)}·과거比${fmtPct(past.volVsPastPct)}`,
    `매도${fmtPct(tr.sellTrendPct)}·比${fmtPct(past.sellVsPastPct)}`,
    `매수${fmtPct(tr.buyTrendPct)}·比${fmtPct(past.buyVsPastPct)}`,
    `가격${fmtPct(tr.netPct, 1)}·比${fmtPct(past.priceVsPastPct, 1)}`,
    `RVOL${tr.avgRvol.toFixed(2)}×`,
    `${bars}봉`,
  ].join(' · ');
}

function buildMarkerKo(
  segNo: number | undefined,
  labelKo: string,
  tr: ReturnType<typeof segmentTrends>,
  past: ReturnType<typeof segmentVsPast>
): string {
  const head = segNo ? `${segNo}·` : '';
  const vol = `V${fmtPct(past.volVsPastPct)}`;
  const sell = past.sellVsPastPct >= 8 ? `S${fmtPct(past.sellVsPastPct)}` : '';
  const buy = past.buyVsPastPct >= 8 ? `B${fmtPct(past.buyVsPastPct)}` : '';
  const bits = [vol, sell, buy].filter(Boolean).join(' ');
  const shortLabel = labelKo.length > 8 ? labelKo.slice(0, 7) : labelKo;
  const raw = bits ? `${head}${shortLabel} ${bits}` : `${head}${shortLabel} ${fmtPct(tr.volTrendPct)}`;
  return raw.length > 22 ? `${raw.slice(0, 21)}…` : raw;
}

function buildLiveCompare(meta: BarMeta[], rows: Candle[], rvolPeriod: number): VolumeLiveCompare | null {
  const n = rows.length;
  if (n < rvolPeriod + 2) return null;
  const i = n - 1;
  const m = meta[i]!;
  const lookFrom = Math.max(0, i - rvolPeriod);
  const bars = i - lookFrom;
  if (bars < 3) return null;

  let histVol = 0;
  let histSell = 0;
  let histBuy = 0;
  for (let j = lookFrom; j < i; j++) {
    histVol += meta[j]!.vol;
    histSell += meta[j]!.sellVol;
    histBuy += meta[j]!.buyVol;
  }
  histVol /= bars;
  histSell /= bars;
  histBuy /= bars;

  const volVsPastPct = trendPct(histVol, m.vol);
  const sellVsPastPct = trendPct(histSell, m.sellVol);
  const buyVsPastPct = trendPct(histBuy, m.buyVol);
  const prevClose = rows[i - 1]!.close;
  const priceVsPrevPct = prevClose > 0 ? ((rows[i]!.close - prevClose) / prevClose) * 100 : 0;

  const verdict = computeVolumeVerdict({
    kind: m.buyPct >= m.sellPct ? 'buy_up' : 'sell_up',
    layer: 'cluster',
    buyPct: m.buyPct,
    sellPct: m.sellPct,
    netPct: priceVsPrevPct,
    volVsPastPct,
    sellVsPastPct,
    buyVsPastPct,
    avgRvol: m.rvol,
    segLow: rows[i]!.low,
    segHigh: rows[i]!.high,
  });

  const headlineKo = `${verdict.verdictKo} · ${verdict.reasonKo}`;

  return {
    volVsPastPct,
    sellVsPastPct,
    buyVsPastPct,
    priceVsPrevPct,
    rvol: m.rvol,
    headlineKo,
    verdict,
  };
}

function segmentTrends(rows: Candle[], meta: BarMeta[], from: number, to: number) {
  const mid = Math.floor((from + to) / 2);
  let v1 = 0;
  let v2 = 0;
  let s1 = 0;
  let s2 = 0;
  let b1 = 0;
  let b2 = 0;
  let buySum = 0;
  let sellSum = 0;
  let rvolSum = 0;
  for (let i = from; i <= to; i++) {
    const m = meta[i]!;
    buySum += m.buyPct;
    sellSum += m.sellPct;
    rvolSum += m.rvol;
    if (i <= mid) {
      v1 += m.vol;
      s1 += m.sellVol;
      b1 += m.buyVol;
    } else {
      v2 += m.vol;
      s2 += m.sellVol;
      b2 += m.buyVol;
    }
  }
  const bars = to - from + 1;
  const o0 = rows[from]!.open;
  const c1 = rows[to]!.close;
  const netPct = o0 > 0 ? ((c1 - o0) / o0) * 100 : 0;
  return {
    buyPct: buySum / bars,
    sellPct: sellSum / bars,
    avgRvol: rvolSum / bars,
    netPct,
    volTrendPct: trendPct(v1, v2),
    sellTrendPct: trendPct(s1, s2),
    buyTrendPct: trendPct(b1, b2),
  };
}

function isLocalLow(rows: Candle[], from: number, to: number, lookback: number): boolean {
  const segLo = Math.min(...rows.slice(from, to + 1).map((c) => c.low));
  const ctxFrom = Math.max(0, from - lookback);
  const ctxLo = Math.min(...rows.slice(ctxFrom, from).map((c) => c.low));
  return segLo <= ctxLo * 1.008;
}

function isLocalHigh(rows: Candle[], from: number, to: number, lookback: number): boolean {
  const segHi = Math.max(...rows.slice(from, to + 1).map((c) => c.high));
  const ctxFrom = Math.max(0, from - lookback);
  const ctxHi = Math.max(...rows.slice(ctxFrom, from).map((c) => c.high));
  return segHi >= ctxHi * 0.992;
}

function isRangeSegment(rows: Candle[], from: number, to: number, maxSpanPct: number): boolean {
  const seg = rows.slice(from, to + 1);
  const hi = Math.max(...seg.map((c) => c.high));
  const lo = Math.min(...seg.map((c) => c.low));
  const mid = (hi + lo) / 2;
  if (mid <= 0) return false;
  return (hi - lo) / mid <= maxSpanPct;
}

/** RVOL·거래량 클러스터 (표시 1·2번 같은 구간) */
function detectVolumeClusters(
  rows: Candle[],
  meta: BarMeta[],
  fromScan: number,
  params: VolumeAiEngineParams
): Array<{ from: number; to: number }> {
  const n = rows.length;
  const clusters: Array<{ from: number; to: number }> = [];
  let i = fromScan;
  while (i < n) {
    const hot = meta[i]!.rvol >= params.clusterHotRvol || meta[i]!.vol > 0;
    if (!hot || meta[i]!.rvol < params.clusterMinRvol) {
      i++;
      continue;
    }
    const start = i;
    while (i < n) {
      const m = meta[i]!;
      if (i > start + params.clusterMaxSpan) break;
      if (m.rvol < params.clusterAvgRvol - 0.1 && i > start + 2) break;
      if (m.rvol < params.clusterAvgRvol + 0.03 && i > start + 5) break;
      i++;
    }
    const end = i - 1;
    const bars = end - start + 1;
    const avgRvol =
      meta.slice(start, end + 1).reduce((s, x) => s + x.rvol, 0) / Math.max(1, bars);
    if (bars >= 2 && avgRvol >= params.clusterAvgRvol) {
      clusters.push({ from: start, to: end });
    }
  }
  return clusters;
}

function classifyCluster(
  rows: Candle[],
  meta: BarMeta[],
  from: number,
  to: number,
  wing: number,
  pastLookback: number,
  segNo?: number
): {
  kind: VolumeAiZoneKind;
  labelKo: string;
  detailKo: string;
  markerKo: string;
  tr: ReturnType<typeof segmentTrends>;
  past: ReturnType<typeof segmentVsPast>;
} {
  const tr = segmentTrends(rows, meta, from, to);
  const past = segmentVsPast(meta, rows, from, to, pastLookback);
  const lookback = Math.max(12, wing * 4);
  const atLow = isLocalLow(rows, from, to, lookback);
  const atHigh = isLocalHigh(rows, from, to, lookback);
  const range = isRangeSegment(rows, from, to, 0.045);

  const volUp = tr.volTrendPct >= 12 || tr.avgRvol >= 1.35;
  const sellUp = tr.sellTrendPct >= 10 || (tr.sellPct >= 0.54 && tr.sellTrendPct >= 5);
  const buyUp = tr.buyTrendPct >= 10 || (tr.buyPct >= 0.54 && tr.buyTrendPct >= 5);

  const tags: string[] = [];
  if (volUp) tags.push('거래 많음');
  if (sellUp) tags.push('매도 많음');
  if (buyUp) tags.push('매수 많음');

  let kind: VolumeAiZoneKind = 'vol_up';
  if (atLow && volUp) {
    kind = 'low_surge';
  } else if (atHigh && sellUp) {
    kind = 'high_sell';
  } else if (range && tr.avgRvol >= 1.1) {
    kind = 'range_heavy';
  } else if (sellUp && !buyUp) {
    kind = 'sell_up';
  } else if (buyUp && !sellUp) {
    kind = 'buy_up';
  } else if (volUp) {
    kind = 'vol_up';
  } else if (sellUp) {
    kind = 'sell_up';
  }

  const labelKo = STYLE[kind].base;

  const bars = to - from + 1;
  const detailKo = buildDetailKo(labelKo, tr, past, bars);
  const markerKo = buildMarkerKo(segNo, labelKo, tr, past);

  return { kind, labelKo, detailKo, markerKo, tr, past };
}

function pivotHigh(rows: Candle[], i: number, L: number, R: number): boolean {
  const hi = rows[i]!.high;
  for (let j = i - L; j < i; j++) if (j < 0 || rows[j]!.high >= hi) return false;
  for (let j = i + 1; j <= i + R; j++) if (j >= rows.length || rows[j]!.high > hi) return false;
  return true;
}

function pivotLow(rows: Candle[], i: number, L: number, R: number): boolean {
  const lo = rows[i]!.low;
  for (let j = i - L; j < i; j++) if (j < 0 || rows[j]!.low <= lo) return false;
  for (let j = i + 1; j <= i + R; j++) if (j >= rows.length || rows[j]!.low < lo) return false;
  return true;
}

function findPivots(rows: Candle[], wing: number, fromIdx: number) {
  const out: Array<{ idx: number; side: 'high' | 'low'; price: number }> = [];
  for (let i = fromIdx; i < rows.length - wing; i++) {
    if (pivotLow(rows, i, wing, wing)) out.push({ idx: i, side: 'low', price: rows[i]!.low });
    if (pivotHigh(rows, i, wing, wing)) out.push({ idx: i, side: 'high', price: rows[i]!.high });
  }
  return out.sort((a, b) => a.idx - b.idx);
}

function withPlainFields(zone: Omit<VolumeAiZone, 'plainShortKo' | 'plainSummaryKo' | 'verdictSide' | 'verdictStrength' | 'verdictKo' | 'verdictReasonKo' | 'invalidationKo' | 'verdictColor'>, rows: Candle[]): VolumeAiZone {
  const seg = rows.slice(zone.fromIdx, zone.toIdx + 1);
  const segLow = seg.length ? Math.min(...seg.map((c) => c.low)) : undefined;
  const segHigh = seg.length ? Math.max(...seg.map((c) => c.high)) : undefined;
  const verdict = computeVolumeVerdict({
    kind: zone.kind,
    layer: zone.layer,
    buyPct: zone.buyPct,
    sellPct: zone.sellPct,
    netPct: zone.netPct,
    volVsPastPct: zone.volVsPastPct,
    sellVsPastPct: zone.sellVsPastPct,
    buyVsPastPct: zone.buyVsPastPct,
    avgRvol: zone.avgRvol,
    segLow,
    segHigh,
  });
  const plainShortKo = `${verdictShortKo(verdict.side)}·${plainShortKind(zone.kind)}`;
  const full: VolumeAiZone = {
    ...zone,
    segLow,
    segHigh,
    plainShortKo,
    plainSummaryKo: '',
    verdictSide: verdict.side,
    verdictStrength: verdict.strength,
    verdictKo: verdict.verdictKo,
    verdictReasonKo: verdict.reasonKo,
    invalidationKo: verdict.invalidationKo,
    verdictColor: verdict.color,
  };
  full.plainSummaryKo = buildPlainZoneSummary(full);
  return full;
}

export function buildVolumeAiZonePack(candles: Candle[], timeframe?: string): VolumeAiZonePack {
  const tf = normalizeChartTimeframe(timeframe ?? '4h');
  const rows = sanitizeChartCandlesForSeries(candles, tf);
  const n = rows.length;
  if (n < 10) return { zones: [], liveZone: null, liveCompare: null, headlineKo: '' };

  const params = getVolumeAiEngineParams(tf);
  const { wing, rvolPeriod, scanBars, pivotMinBars, maxZones } = params;
  const meta = buildBarMeta(rows, rvolPeriod);
  const fromScan = Math.max(wing + 2, n - scanBars);
  const zones: VolumeAiZone[] = [];
  let zi = 0;

  const clusters = detectVolumeClusters(rows, meta, fromScan, params);
  let segNo = 1;
  for (const cl of clusters.slice(-6)) {
    const no = segNo++;
    const { kind, labelKo, detailKo, markerKo, tr, past } = classifyCluster(
      rows,
      meta,
      cl.from,
      cl.to,
      wing,
      rvolPeriod,
      no
    );
    const st = STYLE[kind];
    zones.push(
      withPlainFields({
        id: `vol-cl-${zi++}`,
        kind,
        layer: 'cluster',
        segNo: no,
        timeFrom: Number(rows[cl.from]!.time),
        timeTo: Number(rows[cl.to]!.time),
        fromIdx: cl.from,
        toIdx: cl.to,
        bars: cl.to - cl.from + 1,
        buyPct: tr.buyPct,
        sellPct: tr.sellPct,
        avgRvol: tr.avgRvol,
        volTrendPct: tr.volTrendPct,
        sellTrendPct: tr.sellTrendPct,
        buyTrendPct: tr.buyTrendPct,
        netPct: tr.netPct,
        volVsPastPct: past.volVsPastPct,
        sellVsPastPct: past.sellVsPastPct,
        buyVsPastPct: past.buyVsPastPct,
        priceVsPastPct: past.priceVsPastPct,
        labelKo,
        detailKo,
        markerKo,
        color: st.color,
        fill: st.fill,
      }, rows)
    );
  }

  const pivots = findPivots(rows, wing, fromScan);
  for (let p = 0; p + 1 < pivots.length; p++) {
    const a = pivots[p]!;
    const b = pivots[p + 1]!;
    if (a.side === b.side) continue;
    const fromIdx = a.idx;
    const toIdx = b.idx;
    if (toIdx - fromIdx < pivotMinBars) continue;
    const tr = segmentTrends(rows, meta, fromIdx, toIdx);
    const past = segmentVsPast(meta, rows, fromIdx, toIdx, rvolPeriod);
    const priceUp = b.price > a.price;
    const kind: VolumeAiZoneKind =
      a.side === 'low' && b.side === 'high' && priceUp
        ? 'up'
        : a.side === 'high' && b.side === 'low'
          ? 'down'
          : priceUp
            ? 'up'
            : 'down';
    const st = STYLE[kind];
    const extra =
      tr.volTrendPct >= 10
        ? '(거래 많음)'
        : tr.sellTrendPct >= 10
          ? '(매도 많음)'
          : tr.buyTrendPct >= 10
            ? '(매수 많음)'
            : '';
    const labelKo = `${st.base}${extra}`;
    const bars = toIdx - fromIdx + 1;
    zones.push(
      withPlainFields({
        id: `vol-tr-${zi++}`,
        kind,
        layer: 'trend',
        timeFrom: Number(rows[fromIdx]!.time),
        timeTo: Number(rows[toIdx]!.time),
        fromIdx,
        toIdx,
        bars,
        buyPct: tr.buyPct,
        sellPct: tr.sellPct,
        avgRvol: tr.avgRvol,
        volTrendPct: tr.volTrendPct,
        sellTrendPct: tr.sellTrendPct,
        buyTrendPct: tr.buyTrendPct,
        netPct: tr.netPct,
        volVsPastPct: past.volVsPastPct,
        sellVsPastPct: past.sellVsPastPct,
        buyVsPastPct: past.buyVsPastPct,
        priceVsPastPct: past.priceVsPastPct,
        labelKo,
        detailKo: buildDetailKo(labelKo, tr, past, bars),
        markerKo: buildMarkerKo(undefined, labelKo, tr, past),
        color: st.color,
        fill: st.fill,
      }, rows)
    );
  }

  const sorted = zones.sort((a, b) => a.fromIdx - b.fromIdx);
  const trimmed = sorted.slice(-maxZones);
  const liveCluster = trimmed.filter((z) => z.layer === 'cluster' && z.toIdx >= n - 2).slice(-1)[0];
  const liveTrend = trimmed.filter((z) => z.layer === 'trend' && z.toIdx >= n - 1).slice(-1)[0];
  const liveZone = liveCluster ?? liveTrend ?? trimmed[trimmed.length - 1] ?? null;
  const liveCompare = buildLiveCompare(meta, rows, rvolPeriod);
  const headlineKo =
    liveZone?.verdictKo ?? liveCompare?.verdict.verdictKo ?? liveCompare?.headlineKo ?? liveZone?.detailKo ?? '';

  return { zones: trimmed, liveZone, liveCompare, headlineKo };
}

export type VolumeAiZoneScreenGeom = {
  id: string;
  x1: number;
  x2: number;
  labelKo: string;
  /** 거래량 위에 붙는 쉬운 라벨 */
  visibleLabelKo: string;
  detailKo: string;
  plainShortKo: string;
  plainSummaryKo: string;
  volVsPastPct: number;
  verdictSide: VolumeVerdictSide;
  verdictColor: string;
  color: string;
  fill: string;
  kind: VolumeAiZoneKind;
  layer: 'cluster' | 'trend';
  segNo?: number;
  isLive: boolean;
  barSpan: number;
  widthPx: number;
};

export type VolumeAiZoneScreenPack = {
  zones: VolumeAiZoneScreenGeom[];
  volPanelTop: number;
  volPanelBot: number;
  liveLabel: string;
};

export function projectVolumeAiZonesToScreen(params: {
  pack: VolumeAiZonePack;
  candles: Candle[];
  timeframe?: string;
  resolveBarSpanX: (fromIdx: number, toIdx: number) => { x1: number; x2: number } | null;
  chartHeight: number;
  volPanelTopRatio?: number;
}): VolumeAiZoneScreenPack {
  const { pack, resolveBarSpanX, chartHeight: chartH, volPanelTopRatio = 0.82, timeframe } = params;
  const tf = normalizeChartTimeframe(timeframe ?? '4h');
  const engine = getVolumeAiEngineParams(tf);
  const volPanelTop = chartH * volPanelTopRatio;
  const volPanelBot = chartH - 2;
  const lastIdx = sanitizeChartCandlesForSeries(params.candles, tf).length - 1;
  const minPx = 8;

  const zones = pack.zones
    .map((z) => {
      const span = resolveBarSpanX(z.fromIdx, z.toIdx);
      if (!span) return null;
      const w = span.x2 - span.x1;
      if (w < minPx) return null;
      if (z.layer === 'trend' && z.bars < engine.pivotMinBars) return null;
      return {
        id: z.id,
        x1: span.x1,
        x2: span.x2,
        labelKo: z.segNo ? `${z.segNo}번 ${z.labelKo}` : z.labelKo,
        visibleLabelKo: buildVolumeVisibleLabel(z, w),
        detailKo: z.detailKo,
        plainShortKo: z.plainShortKo,
        plainSummaryKo: z.plainSummaryKo,
        volVsPastPct: z.volVsPastPct,
        verdictSide: z.verdictSide,
        verdictColor: z.verdictColor,
        color: z.color,
        fill: z.fill,
        kind: z.kind,
        layer: z.layer,
        segNo: z.segNo,
        isLive: z.toIdx >= lastIdx - 1,
        barSpan: z.bars,
        widthPx: w,
      };
    })
    .filter(Boolean) as VolumeAiZoneScreenGeom[];

  return {
    zones,
    volPanelTop,
    volPanelBot,
    liveLabel: pack.liveCompare?.headlineKo ?? pack.headlineKo,
  };
}

export function buildVolumeSegmentMarkers(
  candles: Candle[],
  pack: VolumeAiZonePack,
  timeframe?: string
): import('@/lib/volumeHistogramIntelligence').VolumePanelMarker[] {
  const tf = normalizeChartTimeframe(timeframe ?? '4h');
  const engine = getVolumeAiEngineParams(tf);
  const rows = sanitizeChartCandlesForSeries(candles, tf);
  if (!pack.zones.length || !rows.length) return [];
  const out: import('@/lib/volumeHistogramIntelligence').VolumePanelMarker[] = [];
  const usedTimes = new Set<number>();

  const clamp = (s: string, max = 20) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

  for (const z of pack.zones.filter((x) => x.layer === 'cluster')) {
    const mid = Math.floor((z.fromIdx + z.toIdx) / 2);
    const c = rows[mid];
    if (!c) continue;
    const t = Number(c.time);
    if (usedTimes.has(t)) continue;
    usedTimes.add(t);
    out.push({
      time: c.time as import('lightweight-charts').UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: z.verdictColor,
      text: clamp(buildVolumeVisibleLabel(z, 80)),
      size: 2,
    });
  }

  for (const z of pack.zones.filter((x) => x.layer === 'trend' && x.bars >= engine.pivotMinBars)) {
    const c = rows[z.fromIdx];
    if (!c) continue;
    const t = Number(c.time);
    if (usedTimes.has(t)) continue;
    usedTimes.add(t);
    out.push({
      time: c.time as import('lightweight-charts').UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: z.verdictColor,
      text: clamp(buildVolumeVisibleLabel(z, 56)),
      size: 1,
    });
  }

  const live = pack.liveCompare;
  const last = rows[rows.length - 1];
  if (live && last) {
    const t = Number(last.time);
    if (!usedTimes.has(t)) {
      usedTimes.add(t);
      const side = verdictShortKo(live.verdict.side);
      out.push({
        time: last.time as import('lightweight-charts').UTCTimestamp,
        position: 'aboveBar',
        shape: 'circle',
        color: live.verdict.color,
        text: `지금${side}`,
        size: 2,
      });
    }
  }

  return out.sort((a, b) => Number(a.time) - Number(b.time));
}

export type VolumeAiExplainMetric = {
  label: string;
  sentence: string;
  tone: 'up' | 'down' | 'neutral';
};

export type VolumeAiExplainCardData = {
  title: string;
  summary: string;
  subtitle: string;
  verdictSide: VolumeVerdictSide;
  verdictKo: string;
  verdictReasonKo: string;
  verdictStrength: number;
  invalidationKo: string;
  verdictColor: string;
  metrics: VolumeAiExplainMetric[];
  footnote: string;
};

export function buildVolumeZoneExplainCard(zone: VolumeAiZone): VolumeAiExplainCardData {
  const toneOf = (v: number): 'up' | 'down' | 'neutral' =>
    v >= 8 ? 'up' : v <= -8 ? 'down' : 'neutral';

  const title = zone.segNo ? `${zone.segNo}번 구간 확정` : '거래량 구간 확정';
  const summary = `${zone.verdictKo}\n${zone.verdictReasonKo}`;
  const subtitle = `${zone.bars}개 봉 · 신호 ${zone.verdictStrength}점 · 최근 20봉 평균 대비`;

  const metrics: VolumeAiExplainMetric[] = [
    {
      label: '확정',
      sentence: zone.verdictReasonKo,
      tone: zone.verdictSide === 'LONG' ? 'up' : zone.verdictSide === 'SHORT' ? 'down' : 'neutral',
    },
    {
      label: '무효',
      sentence: zone.invalidationKo,
      tone: 'neutral',
    },
    {
      label: '거래',
      sentence: comparePlainSentence(zone.volVsPastPct, '거래'),
      tone: toneOf(zone.volVsPastPct),
    },
    {
      label: '매도',
      sentence: comparePlainSentence(zone.sellVsPastPct, '매도(팔기)'),
      tone: toneOf(zone.sellVsPastPct),
    },
    {
      label: '매수',
      sentence: comparePlainSentence(zone.buyVsPastPct, '매수(사기)'),
      tone: toneOf(zone.buyVsPastPct),
    },
    {
      label: '가격',
      sentence: pricePlainSentence(zone.netPct, true),
      tone: toneOf(zone.netPct),
    },
    {
      label: '활발도',
      sentence: rvolPlainSentence(zone.avgRvol),
      tone: zone.avgRvol >= 1.15 ? 'up' : zone.avgRvol <= 0.85 ? 'down' : 'neutral',
    },
  ];

  return {
    title,
    summary,
    subtitle,
    verdictSide: zone.verdictSide,
    verdictKo: zone.verdictKo,
    verdictReasonKo: zone.verdictReasonKo,
    verdictStrength: zone.verdictStrength,
    invalidationKo: zone.invalidationKo,
    verdictColor: zone.verdictColor,
    metrics,
    footnote: '신호 점수는 매수·매도·가격 일치도예요. 투자 확정·승률 보장 아님. 무효 조건 확인 필수.',
  };
}

export function buildVolumeLiveExplainCard(live: VolumeLiveCompare): VolumeAiExplainCardData {
  const v = live.verdict;
  const toneOf = (n: number): 'up' | 'down' | 'neutral' =>
    n >= 8 ? 'up' : n <= -8 ? 'down' : 'neutral';

  return {
    title: '지금 이 봉 — 확정',
    summary: `${v.verdictKo}\n${v.reasonKo}`,
    subtitle: `신호 ${v.strength}점 · 최근 20봉 평균 대비`,
    verdictSide: v.side,
    verdictKo: v.verdictKo,
    verdictReasonKo: v.reasonKo,
    verdictStrength: v.strength,
    invalidationKo: v.invalidationKo,
    verdictColor: v.color,
    metrics: [
      {
        label: '확정',
        sentence: v.reasonKo,
        tone: v.side === 'LONG' ? 'up' : v.side === 'SHORT' ? 'down' : 'neutral',
      },
      {
        label: '무효',
        sentence: v.invalidationKo,
        tone: 'neutral',
      },
      {
        label: '거래',
        sentence: comparePlainSentence(live.volVsPastPct, '거래'),
        tone: toneOf(live.volVsPastPct),
      },
      {
        label: '매도',
        sentence: comparePlainSentence(live.sellVsPastPct, '매도(팔기)'),
        tone: toneOf(live.sellVsPastPct),
      },
      {
        label: '매수',
        sentence: comparePlainSentence(live.buyVsPastPct, '매수(사기)'),
        tone: toneOf(live.buyVsPastPct),
      },
      {
        label: '가격',
        sentence: pricePlainSentence(live.priceVsPrevPct),
        tone: toneOf(live.priceVsPrevPct),
      },
      {
        label: '활발도',
        sentence: rvolPlainSentence(live.rvol),
        tone: live.rvol >= 1.15 ? 'up' : live.rvol <= 0.85 ? 'down' : 'neutral',
      },
    ],
    footnote: '신호 점수는 일치도일 뿐, 수익·승률을 보장하지 않아요.',
  };
}

/** @deprecated use buildVolumeSegmentMarkers */
export function buildVolumeAiZoneMarkers(): never[] {
  return [];
}

export function applyVolumeRegimeBarColors(
  base: import('lightweight-charts').HistogramData<import('lightweight-charts').UTCTimestamp>[],
  pack: VolumeAiZonePack | null,
  candles: Candle[],
  timeframe?: string
): import('lightweight-charts').HistogramData<import('lightweight-charts').UTCTimestamp>[] {
  if (!pack?.zones.length) return base;
  const rows = sanitizeChartCandlesForSeries(candles, normalizeChartTimeframe(timeframe ?? '4h'));
  const tintByIdx = new Map<number, VolumeAiZone>();
  const rankOf = (z: VolumeAiZone) => (z.layer === 'cluster' ? 100 : 20) + z.bars;
  for (const z of pack.zones) {
    for (let i = z.fromIdx; i <= z.toIdx && i < rows.length; i++) {
      const prev = tintByIdx.get(i);
      if (!prev || rankOf(z) >= rankOf(prev)) tintByIdx.set(i, z);
    }
  }
  return base.map((bar, i) => {
    const z = tintByIdx.get(i);
    if (!z) return bar;
    return { ...bar, color: z.verdictColor || z.color };
  });
}
