/**
 * 거래량 히스토그램 — WAD(Whale Activity Detector) 스타일 (Pine 포트).
 * - 매수 볼륨: close > open 이면 전체 거래량, 아니면 0
 * - 매도 볼륨: close < open 이면 전체 거래량, 아니면 0
 * - 고래: 해당 쪽 거래량 > SMA(해당 쪽, lookback) × threshold → BUY/SELL 마커
 */
import type { HistogramData, LineData, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';
import {
  chartTimeframeNominalStepSeconds,
  chartTimeframeStepSeconds,
  normalizeChartTimeframe,
} from '@/lib/constants';
import type { ChartCandleStyleFields } from '@/lib/chartCandleOptions';
import { volumeHistogramBarColors } from '@/lib/chartCandleOptions';
import { normalizeHex6 } from '@/lib/chartHexColor';
import {
  candleOverlapsAnyBuyZone,
  candleOverlapsAnySellZone,
  type WhaleZoneBand,
} from '@/lib/volumeZoneOverlap';

function validWhaleBand(z: WhaleZoneBand): boolean {
  const lo = Math.min(z.low, z.high);
  const hi = Math.max(z.low, z.high);
  return Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo;
}

export type VolumeHistogramIntelOpts = {
  enabled: boolean;
  /** Pine `lookbackPeriod` (기본 34) */
  wadLookback: number;
  /** Pine `volumeThreshold` — 평균의 몇 배 이상이면 고래 (기본 4) */
  wadThreshold: number;
  /** 총 거래량 / SMA(RVOL) 단계로 막대 색 강조 */
  rvolTiers: boolean;
  /** RVOL 분모 SMA 기간 */
  rvolSmaPeriod: number;
};

const DEFAULT_OPTS: VolumeHistogramIntelOpts = {
  enabled: true,
  wadLookback: 34,
  wadThreshold: 4,
  rvolTiers: true,
  rvolSmaPeriod: 20,
};

export const VOLUME_FLOW_SUMMARY_BARS = 48;

export function wadBuyVolume(c: Candle): number {
  const v = Math.max(0, c.volume || 0);
  return c.close > c.open ? v : 0;
}

export function wadSellVolume(c: Candle): number {
  const v = Math.max(0, c.volume || 0);
  return c.close < c.open ? v : 0;
}

function smaWadBuy(candles: Candle[], endIdx: number, period: number): number {
  const from = endIdx - period + 1;
  let s = 0;
  for (let j = from; j <= endIdx; j++) s += wadBuyVolume(candles[j]);
  return s / period;
}

function smaWadSell(candles: Candle[], endIdx: number, period: number): number {
  const from = endIdx - period + 1;
  let s = 0;
  for (let j = from; j <= endIdx; j++) s += wadSellVolume(candles[j]);
  return s / period;
}

/** 총 거래량 SMA — RVOL·VMA·존 돌파 판정 공용 */
export function smaTotalVolumeAt(candles: Candle[], endIdx: number, period: number): number {
  if (period < 1 || endIdx < period - 1 || endIdx >= candles.length) return 0;
  const from = endIdx - period + 1;
  let s = 0;
  for (let j = from; j <= endIdx; j++) s += Math.max(0, candles[j].volume || 0);
  return s / period;
}

function rvolTierIndex(rvol: number): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(rvol) || rvol < 1.12) return 0;
  if (rvol < 1.48) return 1;
  if (rvol < 2.15) return 2;
  if (rvol < 2.85) return 3;
  return 4;
}

/**
 * 캔들 방향 — WAD 막대(매수/매도 볼륨)와 RVOL 색·마커에서 롱/숏 구분용.
 * 도지는 종가가 레인지 중간보다 위면 약한 롱 편, 아래면 약한 숏 편으로 둠(중립은 neutral).
 */
export function volumeCandleDirectionBias(c: Candle): 'long' | 'short' | 'neutral' {
  const o = Number(c.open);
  const cl = Number(c.close);
  const hi = Number(c.high);
  const lo = Number(c.low);
  if (![o, cl, hi, lo].every(Number.isFinite)) return 'neutral';
  if (cl > o) return 'long';
  if (cl < o) return 'short';
  const mid = (hi + lo) / 2;
  if (!Number.isFinite(mid) || hi <= lo) return 'neutral';
  if (cl > mid) return 'long';
  if (cl < mid) return 'short';
  return 'neutral';
}

/** RVOL 단계별 막대색 — 롱은 녹·청록만, 숏은 적·로즈만 (노랑 공유로 방향 혼동 나지 않게) */
function volumeBarColorRvolTier(isUp: boolean, tier: 0 | 1 | 2 | 3 | 4): string {
  if (isUp) {
    const up = ['#22C55E', '#16A34A', '#4ADE80', '#34D399', '#14B8A6'];
    return up[tier];
  }
  const down = ['#EF4444', '#DC2626', '#F87171', '#FB7185', '#E11D48'];
  return down[tier];
}

/** 몸통이 전체 레인지에서 차지하는 비율 0~1 (도지·스핀닝탑 판별용) */
export function candleBodyRatioOfRange(c: Candle): number | null {
  const hi = Number(c.high);
  const lo = Number(c.low);
  const o = Number(c.open);
  const cl = Number(c.close);
  if (![hi, lo, o, cl].every(Number.isFinite)) return null;
  const rng = hi - lo;
  if (rng <= 0) return null;
  return Math.abs(cl - o) / rng;
}

export type VolumePanelMarker = {
  time: UTCTimestamp;
  position: 'aboveBar';
  shape: 'square';
  color: string;
  text: string;
  size?: number;
};

/** 같은 봉에 마커가 여러 개면 LWC가 우측에서 세로로 쌓임 — 봉당 1개만 */
export function collapseVolumeMarkersOnePerTime(markers: VolumePanelMarker[]): VolumePanelMarker[] {
  const byT = new Map<number, VolumePanelMarker>();
  for (const m of markers) {
    const t = Number(m.time);
    if (!Number.isFinite(t)) continue;
    const prev = byT.get(t);
    if (!prev) {
      byT.set(t, m);
      continue;
    }
    const mTx = String(m.text || '');
    const pTx = String(prev.text || '');
    const mStory =
      mTx.includes('빅롱') ||
      mTx.includes('빅숏') ||
      mTx.includes('하락 중 증가') ||
      mTx.includes('스윕') ||
      mTx.includes('반등 시 증가') ||
      mTx === '상승 지속' ||
      mTx === '상승지속' ||
      mTx === '매도우위' ||
      mTx === '매수유입' ||
      mTx === '스윕폭락' ||
      mTx.includes('흡수') ||
      mTx.includes('다이버전스') ||
      mTx.includes('괴리') ||
      mTx.includes('고점') ||
      mTx.includes('상승 끝') ||
      mTx === '고점소진';
    const pStory =
      pTx.includes('빅롱') ||
      pTx.includes('빅숏') ||
      pTx.includes('하락 중 증가') ||
      pTx.includes('스윕') ||
      pTx.includes('반등 시 증가') ||
      pTx === '상승 지속' ||
      pTx === '상승지속' ||
      pTx === '매도우위' ||
      pTx === '매수유입' ||
      pTx === '스윕폭락' ||
      pTx.includes('흡수') ||
      pTx.includes('다이버전스') ||
      pTx.includes('괴리') ||
      pTx.includes('고점') ||
      pTx.includes('상승 끝') ||
      pTx === '고점소진';
    /** 빅롱/빅숏 > 구간 스토리 > size > 짧은 라벨 */
    const mBig = mTx.includes('빅롱') || mTx.includes('빅숏');
    const pBig = pTx.includes('빅롱') || pTx.includes('빅숏');
    const prefer =
      (mBig && !pBig) ||
      (mBig && pBig && !(mTx.includes('예비')) && pTx.includes('예비')) ||
      (!mBig && !pBig && mStory && !pStory) ||
      (!mBig &&
        !pBig &&
        !mStory &&
        !pStory &&
        (m.size ?? 1) > (prev.size ?? 1)) ||
      (!mBig &&
        !pBig &&
        !mStory &&
        !pStory &&
        (m.size ?? 1) === (prev.size ?? 1) &&
        mTx.length < pTx.length) ||
      (mStory && pStory && !mBig && !pBig && (m.size ?? 1) > (prev.size ?? 1));
    if (prefer) byT.set(t, m);
  }
  return [...byT.values()].sort((a, b) => Number(a.time) - Number(b.time));
}

/**
 * 시간축(가로)으로만 배치 — 인접 봉 간격 미만이면 세로 스택 방지로 스킵.
 * 라벨은 짧게 잘라 LWC가 우측에 세로로 밀어내지 않게 함.
 */
export function layoutVolumeMarkersHorizontal(
  markers: VolumePanelMarker[],
  candles: { time: number }[],
  minBarGap = 6,
  maxTextLen = 10
): VolumePanelMarker[] {
  const collapsed = collapseVolumeMarkersOnePerTime(markers);
  if (!collapsed.length) return [];
  const idxByT = new Map<number, number>();
  for (let i = 0; i < candles.length; i++) {
    const t = Number(candles[i]!.time);
    if (Number.isFinite(t)) idxByT.set(t, i);
  }
  const gap = Math.max(1, Math.floor(minBarGap));
  const out: VolumePanelMarker[] = [];
  let lastIdx = -9999;
  for (const m of collapsed) {
    const idx = idxByT.get(Number(m.time));
    if (idx == null) continue;
    if (idx - lastIdx < gap) continue;
    lastIdx = idx;
    const raw = String(m.text || '').trim();
    const text = raw.length > maxTextLen ? `${raw.slice(0, maxTextLen - 1)}…` : raw;
    out.push({
      ...m,
      position: 'aboveBar',
      text,
      size: Math.min(2, m.size ?? 1),
    });
  }
  return out;
}

/** 거래량 패널 SMA 라인 — Histogram·캔들 setData와 동일 축 */
export function buildVolumeMaLineData(
  candles: Candle[],
  period: number,
  timeframe?: string
): LineData<UTCTimestamp>[] {
  const rows = timeframe ? sanitizeChartCandlesForSeries(candles, timeframe) : candles;
  const n = rows.length;
  if (n < 2 || period < 2) return [];
  const out: LineData<UTCTimestamp>[] = [];
  for (let i = period - 1; i < n; i++) {
    const sma = smaTotalVolumeAt(rows, i, period);
    if (sma <= 0) continue;
    out.push({ time: rows[i].time as UTCTimestamp, value: sma });
  }
  return out;
}

export type ZoneBreakoutMarker = VolumePanelMarker;

/** 같은 봉에 여러 신호가 있을 때 표시 우선순위 (큰 값이 위) */
export const VOLUME_MARKER_PRIORITY = {
  ABSORPTION: 1,
  RVOL_EXTREME: 2,
  TAKER_FLOW: 3,
  WAD_WHALE: 4,
  ZONE_BREAKOUT: 5,
} as const;

/**
 * 같은 time 키에는 priority가 더 큰 마커만 남김.
 */
export function mergeVolumeMarkerLayers(
  layers: Array<{ markers: VolumePanelMarker[]; priority: number }>
): Array<{ marker: VolumePanelMarker; priority: number }> {
  const byT = new Map<number, { marker: VolumePanelMarker; priority: number }>();
  for (const { markers, priority } of layers) {
    for (const marker of markers) {
      const t = Number(marker.time);
      const cur = byT.get(t);
      if (!cur || priority > cur.priority) {
        byT.set(t, { marker, priority });
      }
    }
  }
  return [...byT.values()].sort((a, b) => Number(a.marker.time) - Number(b.marker.time));
}

/**
 * 인접한 봉에 마커가 몰릴 때 가독성용: 최소 `minBarGap` 봉 인덱스 간격을 두고,
 * 붙어 있으면 우선순위가 더 높은 마커만 남김(교체).
 * minBarGap 0이면 필터 없음.
 */
export function thinVolumeMarkersByBarGap(
  merged: Array<{ marker: VolumePanelMarker; priority: number }>,
  candles: Candle[],
  minBarGap: number
): VolumePanelMarker[] {
  if (minBarGap <= 0) {
    return merged.map((x) => x.marker);
  }
  const safe = sanitizeChartCandlesForSeries(candles);
  const idxOf = new Map<number, number>();
  safe.forEach((c, i) => idxOf.set(Number(c.time), i));

  const sorted = [...merged].sort((a, b) => {
    const ia = idxOf.get(Number(a.marker.time));
    const ib = idxOf.get(Number(b.marker.time));
    return (ia ?? 0) - (ib ?? 0);
  });

  const out: VolumePanelMarker[] = [];
  let lastKeptIdx = -1_000_000;
  let lastKeptPri = -1;

  for (const { marker, priority } of sorted) {
    const idx = idxOf.get(Number(marker.time));
    if (idx === undefined) continue;

    if (out.length === 0) {
      out.push(marker);
      lastKeptIdx = idx;
      lastKeptPri = priority;
      continue;
    }

    const gap = idx - lastKeptIdx;
    if (gap >= minBarGap) {
      out.push(marker);
      lastKeptIdx = idx;
      lastKeptPri = priority;
    } else if (priority > lastKeptPri) {
      out[out.length - 1] = marker;
      lastKeptIdx = idx;
      lastKeptPri = priority;
    }
  }

  return out;
}

/**
 * RVOL이 임계 이상인 봉 — 거래량 “폭증” 구간 강조 (막대 위 라벨)
 */
export function buildRvolExtremeMarkers(
  candles: Candle[],
  partial?: {
    volSmaPeriod?: number;
    minRvol?: number;
    maxMarks?: number;
    textShort?: string;
    /** 한글: 롱/숏 · 영문: L/S */
    labelLong?: string;
    labelShort?: string;
  }
): VolumePanelMarker[] {
  const volSmaPeriod = Math.max(5, Math.min(60, Math.floor(partial?.volSmaPeriod ?? 20)));
  const minRvol = Number.isFinite(partial?.minRvol) ? Math.max(1.6, Math.min(6, partial!.minRvol!)) : 2.35;
  const maxMarks = Math.max(10, Math.min(72, Math.floor(partial?.maxMarks ?? 48)));
  const shortLabel = (partial?.textShort && String(partial.textShort).trim()) || 'HV';
  const labL = (partial?.labelLong && String(partial.labelLong).trim()) || 'L';
  const labS = (partial?.labelShort && String(partial.labelShort).trim()) || 'S';

  const rows = sanitizeChartCandlesForSeries(candles);
  const n = rows.length;
  if (n < volSmaPeriod + 1) return [];

  const out: VolumePanelMarker[] = [];
  const seen = new Set<number>();

  for (let i = n - 1; i >= volSmaPeriod - 1 && out.length < maxMarks; i--) {
    const cur = rows[i];
    const t = cur.time as UTCTimestamp;
    const tnum = Number(t);
    if (seen.has(tnum)) continue;

    const sma = smaTotalVolumeAt(rows, i, volSmaPeriod);
    const vol = Math.max(0, cur.volume || 0);
    if (sma <= 0) continue;
    const rvol = vol / sma;
    if (rvol < minRvol) continue;

    seen.add(tnum);
    const bias = volumeCandleDirectionBias(cur);
    let color = 'rgba(234,179,8,0.95)';
    let text: string;
    if (bias === 'long') {
      color = 'rgba(34,197,94,0.96)';
      text =
        rvol >= 3.2
          ? `${labL} ${rvol.toFixed(1)}×`
          : `${labL}·${shortLabel}`;
    } else if (bias === 'short') {
      color = 'rgba(239,68,68,0.96)';
      text =
        rvol >= 3.2
          ? `${labS} ${rvol.toFixed(1)}×`
          : `${labS}·${shortLabel}`;
    } else {
      text = rvol >= 3.2 ? `${rvol.toFixed(1)}×` : shortLabel;
    }

    out.push({
      time: t,
      position: 'aboveBar',
      shape: 'square',
      color,
      text,
      size: rvol >= 3.2 ? 2 : 1,
    });
  }

  return out.reverse();
}

/**
 * 거래량은 붙었는데 몸통이 작음 → 흡수·클라이맥스 후보 (무효화·재진입 검증은 별도)
 */
export function buildVolumeAbsorptionMarkers(
  candles: Candle[],
  partial?: {
    volSmaPeriod?: number;
    minRvol?: number;
    maxBodyRatio?: number;
    maxMarks?: number;
    textAbs?: string;
  }
): VolumePanelMarker[] {
  const volSmaPeriod = Math.max(5, Math.min(60, Math.floor(partial?.volSmaPeriod ?? 20)));
  const minRvol = Number.isFinite(partial?.minRvol) ? Math.max(1.05, Math.min(4, partial!.minRvol!)) : 1.38;
  const maxBodyRatio = Number.isFinite(partial?.maxBodyRatio)
    ? Math.max(0.06, Math.min(0.55, partial!.maxBodyRatio!))
    : 0.22;
  const maxMarks = Math.max(8, Math.min(56, Math.floor(partial?.maxMarks ?? 36)));
  const absT = (partial?.textAbs && String(partial.textAbs).trim()) || '흡수';

  const rows = sanitizeChartCandlesForSeries(candles);
  const n = rows.length;
  if (n < volSmaPeriod + 1) return [];

  const out: VolumePanelMarker[] = [];
  const seen = new Set<number>();

  for (let i = n - 1; i >= volSmaPeriod - 1 && out.length < maxMarks; i--) {
    const cur = rows[i];
    const t = cur.time as UTCTimestamp;
    const tnum = Number(t);
    if (seen.has(tnum)) continue;

    const br = candleBodyRatioOfRange(cur);
    if (br == null || br > maxBodyRatio) continue;

    const sma = smaTotalVolumeAt(rows, i, volSmaPeriod);
    const vol = Math.max(0, cur.volume || 0);
    if (sma <= 0 || vol < sma * minRvol) continue;

    seen.add(tnum);
    const bias = volumeCandleDirectionBias(cur);
    let color = 'rgba(148,163,184,0.9)';
    let text = absT;
    if (bias === 'long') {
      color = 'rgba(52,211,153,0.94)';
      text = `${absT}↑`;
    } else if (bias === 'short') {
      color = 'rgba(251,113,133,0.94)';
      text = `${absT}↓`;
    }

    out.push({
      time: t,
      position: 'aboveBar',
      shape: 'square',
      color,
      text,
      size: 1,
    });
  }

  return out.reverse();
}

/**
 * taker 매수 체결 비중이 높/낮을 때 + 거래량 확인 (데이터 있는 봉만)
 */
export function buildTakerFlowSkewMarkers(
  candles: Candle[],
  partial?: {
    volSmaPeriod?: number;
    minRvol?: number;
    buyEdge?: number;
    sellEdge?: number;
    maxMarks?: number;
    buyText?: string;
    sellText?: string;
  }
): VolumePanelMarker[] {
  const volSmaPeriod = Math.max(5, Math.min(60, Math.floor(partial?.volSmaPeriod ?? 20)));
  const minRvol = Number.isFinite(partial?.minRvol) ? Math.max(1.05, Math.min(3.5, partial!.minRvol!)) : 1.18;
  const buyEdge = Number.isFinite(partial?.buyEdge) ? Math.max(0.55, Math.min(0.92, partial!.buyEdge!)) : 0.64;
  const sellEdge = Number.isFinite(partial?.sellEdge) ? Math.max(0.08, Math.min(0.45, partial!.sellEdge!)) : 0.36;
  const maxMarks = Math.max(8, Math.min(64, Math.floor(partial?.maxMarks ?? 44)));
  const buyT = (partial?.buyText && String(partial.buyText).trim()) || 'TB+';
  const sellT = (partial?.sellText && String(partial.sellText).trim()) || 'TB−';

  const rows = sanitizeChartCandlesForSeries(candles);
  const n = rows.length;
  if (n < volSmaPeriod + 1) return [];

  const out: VolumePanelMarker[] = [];
  const seen = new Set<number>();

  for (let i = n - 1; i >= volSmaPeriod - 1 && out.length < maxMarks; i--) {
    const cur = rows[i];
    const t = cur.time as UTCTimestamp;
    const tnum = Number(t);
    if (seen.has(tnum)) continue;

    const vol = Math.max(0, cur.volume || 0);
    const tb = cur.takerBuyBaseVolume;
    if (vol <= 0 || tb == null || !Number.isFinite(tb) || tb < 0 || tb > vol * 1.002) continue;

    const sma = smaTotalVolumeAt(rows, i, volSmaPeriod);
    if (sma <= 0 || vol < sma * minRvol) continue;

    const ratio = tb / vol;
    let label: string | null = null;
    let color = '';
    if (ratio >= buyEdge) {
      label = buyT;
      color = 'rgba(59,130,246,0.95)';
    } else if (ratio <= sellEdge) {
      label = sellT;
      color = 'rgba(244,114,182,0.95)';
    }
    if (!label) continue;

    seen.add(tnum);
    out.push({
      time: t,
      position: 'aboveBar',
      shape: 'square',
      color,
      text: label,
      size: 1,
    });
  }

  return out.reverse();
}

/**
 * 존 상단 돌파(저항) / 존 하단 이탈(지지) + 거래량 ≥ SMA×mult
 * minBodyPctOfRange: 0이면 비활성. 양수면 몸통/레인지 비율(%)이 이 값 이상일 때만 돌파 인정
 */
export function buildZoneBreakoutVolumeMarkers(
  candles: Candle[],
  buyZones: WhaleZoneBand[],
  sellZones: WhaleZoneBand[],
  partial?: {
    volSmaPeriod?: number;
    volMult?: number;
    maxMarks?: number;
    upText?: string;
    downText?: string;
    /** 0~100, 0이면 몸통 필터 없음 */
    minBodyPctOfRange?: number;
  }
): ZoneBreakoutMarker[] {
  const volSmaPeriod = Math.max(5, Math.min(60, Math.floor(partial?.volSmaPeriod ?? 20)));
  const volMult = Number.isFinite(partial?.volMult) ? Math.max(1.05, Math.min(3, partial!.volMult!)) : 1.22;
  const maxMarks = Math.max(8, Math.min(64, Math.floor(partial?.maxMarks ?? 40)));
  const upT = (partial?.upText && String(partial.upText).trim()) || '존↑';
  const downT = (partial?.downText && String(partial.downText).trim()) || '존↓';
  const minBodyPct = Math.max(0, Math.min(85, Math.floor(partial?.minBodyPctOfRange ?? 0)));

  const rows = sanitizeChartCandlesForSeries(candles);
  const n = rows.length;
  if (n < volSmaPeriod + 1) return [];

  const out: ZoneBreakoutMarker[] = [];
  const seen = new Set<number>();

  for (let i = n - 1; i >= 1 && out.length < maxMarks; i--) {
    const prev = rows[i - 1];
    const cur = rows[i];
    const t = cur.time as UTCTimestamp;
    const tnum = Number(t);
    if (seen.has(tnum)) continue;

    const sma = smaTotalVolumeAt(rows, i, volSmaPeriod);
    const vol = Math.max(0, cur.volume || 0);
    if (sma <= 0 || vol < sma * volMult) continue;

    if (minBodyPct > 0) {
      const br = candleBodyRatioOfRange(cur);
      if (br == null || br * 100 < minBodyPct) continue;
    }

    let dir: 'up' | 'down' | null = null;
    for (const z of sellZones) {
      if (!validWhaleBand(z)) continue;
      const ztop = Math.max(z.low, z.high);
      if (prev.close <= ztop && cur.close > ztop) {
        dir = 'up';
        break;
      }
    }
    if (dir == null) {
      for (const z of buyZones) {
        if (!validWhaleBand(z)) continue;
        const zbot = Math.min(z.low, z.high);
        if (prev.close >= zbot && cur.close < zbot) {
          dir = 'down';
          break;
        }
      }
    }
    if (dir == null) continue;

    seen.add(tnum);
    out.push({
      time: t,
      position: 'aboveBar',
      shape: 'square',
      color: dir === 'up' ? 'rgba(234,179,8,0.95)' : 'rgba(248,113,113,0.95)',
      text: dir === 'up' ? upT : downT,
      size: 1,
    });
  }

  return out.reverse();
}

export type WadBarEval = {
  buyV: number;
  sellV: number;
  avgBuy: number;
  avgSell: number;
  whaleBuy: boolean;
  whaleSell: boolean;
};

export function evalWadBar(
  candles: Candle[],
  i: number,
  partial?: Partial<VolumeHistogramIntelOpts>
): WadBarEval | undefined {
  const o = { ...DEFAULT_OPTS, ...partial };
  const n = candles.length;
  if (i < 0 || i >= n) return undefined;
  const buyV = wadBuyVolume(candles[i]);
  const sellV = wadSellVolume(candles[i]);
  if (i < o.wadLookback - 1) {
    return {
      buyV,
      sellV,
      avgBuy: 0,
      avgSell: 0,
      whaleBuy: false,
      whaleSell: false,
    };
  }
  const avgBuy = smaWadBuy(candles, i, o.wadLookback);
  const avgSell = smaWadSell(candles, i, o.wadLookback);
  const whaleBuy = buyV > avgBuy * o.wadThreshold;
  const whaleSell = sellV > avgSell * o.wadThreshold;
  return { buyV, sellV, avgBuy, avgSell, whaleBuy, whaleSell };
}

/** 통합 그래프·요약용 */
export type VolumeFlowSummary = {
  windowBars: number;
  spikeCount: number;
  whaleBuyCount: number;
  whaleSellCount: number;
  label: string;
};

export function computeVolumeFlowSummary(
  candles: Candle[],
  partial?: Partial<VolumeHistogramIntelOpts>
): VolumeFlowSummary | undefined {
  const o = { ...DEFAULT_OPTS, ...partial };
  const n = candles.length;
  if (n < o.wadLookback) return undefined;
  const start = Math.max(o.wadLookback - 1, n - VOLUME_FLOW_SUMMARY_BARS);
  const windowBars = n - start;
  let whaleBuyCount = 0;
  let whaleSellCount = 0;

  for (let i = start; i < n; i++) {
    const e = evalWadBar(candles, i, o);
    if (!e) continue;
    if (e.whaleBuy) whaleBuyCount++;
    if (e.whaleSell) whaleSellCount++;
  }

  const spikeCount = whaleBuyCount + whaleSellCount;
  const label =
    spikeCount > 0
      ? `WAD 고래 ${spikeCount}회(최근 ${windowBars}봉) — BUY ${whaleBuyCount} · SELL ${whaleSellCount} · 기준 ${o.wadLookback}봉 SMA×${o.wadThreshold}`
      : `최근 ${windowBars}봉 — WAD 고래 신호 없음(또는 데이터 부족)`;

  return {
    windowBars,
    spikeCount,
    whaleBuyCount,
    whaleSellCount,
    label,
  };
}

/** WAD 고래 마커 색·문구(한글 번역 토글 등) */
export type WadMarkerStyleOpts = {
  buyHex?: string;
  sellHex?: string;
  buyText?: string;
  sellText?: string;
};

/** 거래량 히스토그램 시리즈용 — Pine labeldown / location.top 에 대응: 막대 위·작은 사각 라벨 */
export function buildWadVolumeMarkers(
  candles: Candle[],
  partial?: Partial<VolumeHistogramIntelOpts>,
  /** 넘기고 buy+sell 존이 1개 이상이면: WAD 급증이 해당 존과 겹칠 때만 라벨 */
  zoneFilter?: { buyZones: WhaleZoneBand[]; sellZones: WhaleZoneBand[] },
  markerStyle?: WadMarkerStyleOpts
): VolumePanelMarker[] {
  const o = { ...DEFAULT_OPTS, ...partial };
  const n = candles.length;
  if (n < o.wadLookback) return [];
  const buyZ = zoneFilter?.buyZones ?? [];
  const sellZ = zoneFilter?.sellZones ?? [];
  const strictZones = buyZ.length + sellZ.length > 0;
  const out: VolumePanelMarker[] = [];
  const buyC = normalizeHex6(markerStyle?.buyHex, '#16A34A');
  const sellC = normalizeHex6(markerStyle?.sellHex, '#DC2626');
  const buyT = (markerStyle?.buyText && String(markerStyle.buyText).trim()) || 'BUY';
  const sellT = (markerStyle?.sellText && String(markerStyle.sellText).trim()) || 'SELL';
  const megaMult = o.wadThreshold * 1.62;
  const maxMarks = 48;
  for (let i = n - 1; i >= o.wadLookback - 1 && out.length < maxMarks; i--) {
    const e = evalWadBar(candles, i, o);
    if (!e) continue;
    const c = candles[i];
    const t = c.time as UTCTimestamp;
    if (e.whaleBuy) {
      if (strictZones && !candleOverlapsAnyBuyZone(c, buyZ)) continue;
      const mega = e.buyV > e.avgBuy * megaMult && e.avgBuy > 0;
      out.push({
        time: t,
        position: 'aboveBar',
        shape: 'square',
        color: buyC,
        text: buyT,
        size: mega ? 2 : 1,
      });
    } else if (e.whaleSell) {
      if (strictZones && !candleOverlapsAnySellZone(c, sellZ)) continue;
      const mega = e.sellV > e.avgSell * megaMult && e.avgSell > 0;
      out.push({
        time: t,
        position: 'aboveBar',
        shape: 'square',
        color: sellC,
        text: sellT,
        size: mega ? 2 : 1,
      });
    }
  }
  return out.reverse();
}

/** @deprecated 이름 호환 — WAD 고래 마커와 동일 */
export const buildVolumeSpikeMarkers = buildWadVolumeMarkers;

function repairOhlc(o: number, h: number, l: number, c: number): { open: number; high: number; low: number; close: number } {
  let hi = Math.max(h, o, c);
  let lo = Math.min(l, o, c);
  if (hi < lo) {
    const mid = (o + c) / 2;
    hi = mid;
    lo = mid;
  }
  return { open: o, high: hi, low: lo, close: c };
}

function mergeCandleBucket(existing: Candle, next: Candle): Candle {
  const o = Number(existing.open);
  const c = Number(next.close);
  const hi = Math.max(Number(existing.high), Number(next.high));
  const lo = Math.min(Number(existing.low), Number(next.low));
  const fixed = repairOhlc(o, hi, lo, c);
  return {
    ...existing,
    ...fixed,
    volume: Math.max(0, Number(existing.volume) || 0) + Math.max(0, Number(next.volume) || 0),
    ...(typeof next.takerBuyBaseVolume === 'number'
      ? {
          takerBuyBaseVolume:
            (existing.takerBuyBaseVolume ?? 0) + (next.takerBuyBaseVolume ?? 0),
        }
      : {}),
  };
}

function bucketChartCandleOpenSec(t: number, tf: string): number {
  const tfNorm = normalizeChartTimeframe(tf);
  if (tfNorm === '1d') return Math.floor(t / 86_400) * 86_400;
  const step = chartTimeframeStepSeconds(tfNorm);
  if (step > 0) return Math.floor(t / step) * step;
  return t;
}

/**
 * 마지막 봉만 비정상 간격(4h인데 8h·12h 점프 등)이면 TF 격자 시가로 스냅 — lightweight-charts 빈 축 방지.
 */
function repairUniformCandleSpacing(rows: Candle[], stepSec: number): Candle[] {
  if (rows.length < 2 || stepSec <= 0) return rows;
  const nowSec = Math.floor(Date.now() / 1000);
  const curOpen = Math.floor(nowSec / stepSec) * stepSec;
  const maxT = curOpen + stepSec;
  let out = rows.filter((c) => Number(c.time) <= maxT);
  if (out.length < 2) return out.length ? out : rows;

  const lastIdx = out.length - 1;
  const prevT = Number(out[lastIdx - 1]!.time);
  let lastT = Number(out[lastIdx]!.time);
  const gap = lastT - prevT;
  if (gap <= stepSec * 1.25) return out;

  const snapped = Math.floor(lastT / stepSec) * stepSec;
  let fixed = snapped > prevT ? snapped : prevT + stepSec;
  if (fixed - prevT > stepSec * 1.25) fixed = Math.min(curOpen, prevT + stepSec);
  if (fixed <= prevT) fixed = Math.min(curOpen, prevT + stepSec);
  if (fixed === lastT) return out;
  out = [...out.slice(0, lastIdx), { ...out[lastIdx]!, time: fixed }];
  return out;
}

/** 인접 봉 간격 중앙값 — 1d/1w 등 고정 step 없을 때 공백 메우기용 */
function medianCandleStepSec(rows: Candle[]): number {
  if (rows.length < 3) return 0;
  const diffs: number[] = [];
  const start = Math.max(1, rows.length - 80);
  for (let i = start; i < rows.length; i++) {
    const d = Number(rows[i]!.time) - Number(rows[i - 1]!.time);
    if (d > 0 && Number.isFinite(d)) diffs.push(d);
  }
  if (diffs.length < 2) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)]!;
}

/**
 * 빠진 TF 슬롯을 평봉(거래량 0)으로 채워 timeScale 공백(뛰엄뛰엄) 제거.
 * 분·시·일·주·월 공동. 최근 tail 위주(전량 fill은 TF 전환 부하).
 */
function fillMissingChartCandleSlots(rows: Candle[], stepSec: number, maxFill = 8_000): Candle[] {
  if (rows.length < 2 || stepSec <= 0) return rows;
  /** 통합 데스크 작업창(~480~900)은 전 구간 메움 — 우측만 갭 남는 현상 방지 */
  const tailBars = Math.min(rows.length, 1_200);
  const tailStart = Math.max(1, rows.length - tailBars);
  if (tailStart > 1) {
    const head = rows.slice(0, tailStart);
    const tail = fillMissingChartCandleSlots(rows.slice(tailStart - 1), stepSec, maxFill);
    return head.slice(0, -1).concat(tail);
  }
  const out: Candle[] = [rows[0]!];
  let filled = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = out[out.length - 1]!;
    const curr = rows[i]!;
    const prevT = Number(prev.time);
    const currT = Number(curr.time);
    if (!(currT > prevT)) {
      out.push(curr);
      continue;
    }
    const gap = currT - prevT;
    if (gap > stepSec * 1.35 && filled < maxFill) {
      let t = prevT + stepSec;
      const px = Number(prev.close);
      /** 갭당 상한 크게 — 잔여 점프가 남으면 우측이 뛰엄뛰엄 */
      let gapFill = 0;
      const gapCap = 2_400;
      while (t < currT - stepSec * 0.35 && filled < maxFill && gapFill < gapCap) {
        out.push({
          time: t,
          open: px,
          high: px,
          low: px,
          close: px,
          volume: 0,
        });
        t += stepSec;
        filled += 1;
        gapFill += 1;
      }
    }
    out.push(curr);
  }
  return out;
}

/**
 * fill step — 분·시·일·주은 **항상 명목 TF**.
 * 최근 봉에 결측이 있으면 중앙값이 커져(2h·4h…) fill이 스킵되고 우측만 뛰엄뛰엄이 됨.
 */
function resolveFillStepSeconds(rows: Candle[], timeframe: string): number {
  const nominal = chartTimeframeNominalStepSeconds(timeframe);
  const med = medianCandleStepSec(rows);
  const tf = normalizeChartTimeframe(timeframe);
  /** 월·년만 가변 길이 → 중앙값 */
  if (tf === '1M' || tf === '1Y') {
    if (med >= 86400) return med;
    return nominal > 0 ? nominal : med;
  }
  if (nominal > 0) return nominal;
  return med >= 60 ? med : 0;
}

/**
 * Line/Histogram 등 부시리즈가 캔들에 없는 time을 넣으면 LWC가 빈 칸(뛰엄뛰엄)을 만든다.
 * 캔들 setData 시각에 스냅·중복 제거 — 전 TF 공동.
 */
export function alignSeriesPointsToCandleTimes<T extends { time: unknown }>(
  points: T[],
  candles: Array<{ time: unknown }>
): T[] {
  if (!points.length || !candles.length) return points;
  const times: number[] = [];
  const allowed = new Set<number>();
  for (const c of candles) {
    const t = Number(c.time);
    if (Number.isFinite(t) && t > 0) {
      allowed.add(t);
      times.push(t);
    }
  }
  if (!allowed.size) return points;
  times.sort((a, b) => a - b);

  const snapTo = (t: number): number | null => {
    if (allowed.has(t)) return t;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (times[mid]! <= t) lo = mid;
      else hi = mid - 1;
    }
    const a = times[lo]!;
    const b = lo + 1 < times.length ? times[lo + 1]! : a;
    const pick = Math.abs(b - t) < Math.abs(a - t) ? b : a;
    return Number.isFinite(pick) ? pick : null;
  };

  const byT = new Map<number, T>();
  for (const p of points) {
    const raw = Number(p.time);
    if (!Number.isFinite(raw)) continue;
    const st = snapTo(raw);
    if (st == null || !allowed.has(st)) continue;
    byT.set(st, { ...p, time: st } as T);
  }
  return [...byT.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

/**
 * 캔들·거래량 시리즈 공통 — ms→초, OHLC 정합, 중복 제거, TF별 UTC 봉 시가 버킷.
 * 하위 TF·잘못된 시각이 섞이면 4h 등에서 마지막 봉만 우측으로 뛰어 보임.
 * 빠진 봉 슬롯은 평봉으로 메워 LWC timeScale 뛰엄뛰엄을 막음.
 * 동일 입력 시그니처 LRU — TF 전환·레이아웃·엔진 경로의 중복 sanitize 제거.
 */
const sanitizeSeriesLru = new Map<string, Candle[]>();
const SANITIZE_SERIES_LRU_MAX = 28;

export function sanitizeChartCandlesForSeries(candles: Candle[], timeframe?: string): Candle[] {
  if (!candles.length) return candles;
  const tf = timeframe ? normalizeChartTimeframe(timeframe) : '';
  const first = candles[0]!;
  const last = candles[candles.length - 1]!;
  const mid = candles[candles.length >> 1]!;
  /** v5 — 명목 TF fill 고정(갭 중앙값 함정 제거) + 부시리즈 스냅 */
  const cacheKey = `v5|${tf}|${candles.length}|${first.time}|${mid.time}|${last.time}|${last.close}|${Number(last.volume) || 0}`;
  const cached = sanitizeSeriesLru.get(cacheKey);
  if (cached) return cached;

  /** 버킷 스냅은 분·시만 — 1d/1w/1M은 Bitget 시가 위상 유지 */
  const bucketStep = tf ? chartTimeframeStepSeconds(tf) : 0;
  const m = new Map<number, Candle>();
  for (const raw of candles) {
    let t = Number(raw.time);
    if (!Number.isFinite(t) || t <= 0) continue;
    if (t >= 1e12) t = Math.floor(t / 1000);
    let o = Number(raw.open);
    let h = Number(raw.high);
    let l = Number(raw.low);
    let c = Number(raw.close);
    if (![o, h, l, c].every(Number.isFinite)) continue;
    if (tf && bucketStep > 0) t = bucketChartCandleOpenSec(t, tf);
    const fixed = repairOhlc(o, h, l, c);
    const row: Candle = {
      ...raw,
      time: t,
      ...fixed,
      volume: Math.max(0, Number(raw.volume) || 0),
    };
    const prev = m.get(t);
    m.set(t, prev ? mergeCandleBucket(prev, row) : row);
  }
  let sorted = [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
  /** 분·시만 균일 스냅·갭필 — 1d/1w/1M은 Bitget 16:00 시가 위상 유지(예전 정상) */
  const fillStep = tf ? resolveFillStepSeconds(sorted, tf) : medianCandleStepSec(sorted);
  const isHtf = tf === '1d' || tf === '1w' || tf === '1M';
  if (fillStep >= 60 && !isHtf) {
    if (bucketStep > 0) {
      sorted = repairUniformCandleSpacing(sorted, bucketStep);
    } else {
      sorted = repairUniformCandleSpacing(sorted, fillStep);
    }
    sorted = fillMissingChartCandleSlots(sorted, fillStep);
  } else if (fillStep >= 60 && (tf === '1d' || tf === '1w')) {
    /** 일·주는 슬롯만 메움(스냅 금지) */
    sorted = fillMissingChartCandleSlots(sorted, fillStep);
  }
  sanitizeSeriesLru.set(cacheKey, sorted);
  if (sanitizeSeriesLru.size > SANITIZE_SERIES_LRU_MAX) {
    const oldest = sanitizeSeriesLru.keys().next().value;
    if (oldest) sanitizeSeriesLru.delete(oldest);
  }
  return sorted;
}

export function candlesToVolumeHistogramData(
  candles: Candle[],
  style: ChartCandleStyleFields,
  chartBgHex: string,
  partial?: Partial<VolumeHistogramIntelOpts>,
  /** 캔들 setData와 동일 TF — 미지정 시 재sanitize가 축을 어긋나게 할 수 있음 */
  timeframe?: string
): HistogramData<UTCTimestamp>[] {
  const o = { ...DEFAULT_OPTS, ...partial };
  const rows = timeframe
    ? sanitizeChartCandlesForSeries(candles, timeframe)
    : candles;
  const n = rows.length;
  if (n === 0) return [];

  const pal = volumeHistogramBarColors(style, chartBgHex);
  const upSolid = normalizeHex6(style.chartCandleClassicUpHex, '#22C55E');
  const downSolid = normalizeHex6(style.chartCandleClassicDownHex, '#EF4444');
  const dojiColor = 'rgba(148,163,184,0.35)';

  const rvolPeriod = Math.max(5, Math.min(60, Math.floor(o.rvolSmaPeriod)));

  return rows.map((c, idx) => {
    const time = Number(c.time) as UTCTimestamp;
    const v = Math.max(0, Number(c.volume) || 0);
    const oc = Number(c.open);
    const cc = Number(c.close);
    const isUp = Number.isFinite(oc) && Number.isFinite(cc) ? cc >= oc : true;

    if (!o.enabled) {
      return { time, value: v, color: isUp ? pal.up : pal.down };
    }

    const buyV = wadBuyVolume(c);
    const sellV = wadSellVolume(c);
    let upCol = upSolid;
    let downCol = downSolid;
    if (o.rvolTiers && idx >= rvolPeriod - 1) {
      const smaTot = smaTotalVolumeAt(rows, idx, rvolPeriod);
      const vtot = Math.max(0, c.volume || 0);
      const rvol = smaTot > 0 ? vtot / smaTot : 1;
      const tier = rvolTierIndex(rvol);
      upCol = volumeBarColorRvolTier(true, tier);
      downCol = volumeBarColorRvolTier(false, tier);
    }

    if (buyV > 0) {
      return { time, value: buyV, color: upCol };
    }
    if (sellV > 0) {
      return { time, value: sellV, color: downCol };
    }
    return { time, value: 0, color: dojiColor };
  });
}
