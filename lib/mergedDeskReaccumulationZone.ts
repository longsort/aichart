/**
 * 통합·분석 — Re-accumulation / Re-distribution zone (추가 기능).
 * 기존 와이코프 축적·분배 작도는 유지. 카드/HUD 없이 zone·가격선·거래량 시그널만.
 * 조건부 참고 — 확정 승률·수익 보장 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import {
  computeVolumeSegmentDirection,
  type VolumeSegmentDirectionStats,
} from '@/lib/volumeDirectionStats';

export type ReaccKind = 'reaccumulation' | 'redistribution';

export type MergedDeskReaccZoneRead = {
  kind: ReaccKind;
  kindKo: string;
  kindEn: string;
  headlineKo: string;
  detailKo: string;
  volumeKo: string;
  signalKo: string;
  confidence: number;
  support: number;
  resist: number;
  mid: number;
  rangeStartIdx: number;
  rangeEndIdx: number;
  startTime: number;
  endTime: number;
  volume: VolumeSegmentDirectionStats | null;
  /** LONG 관찰 / SHORT 관찰 / WAIT */
  bias: 'LONG' | 'SHORT' | 'WAIT';
  invalidPrice: number;
};

export type MergedDeskReaccZonePack = {
  read: MergedDeskReaccZoneRead | null;
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
};

type RangeHit = {
  startIdx: number;
  endIdx: number;
  high: number;
  low: number;
  score: number;
};

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) return 0;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const h = candles[i]!.high;
    const l = candles[i]!.low;
    const pc = candles[i - 1]!.close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : 0;
}

function findTradingRange(candles: Candle[], atr: number): RangeHit | null {
  const n = candles.length;
  if (n < 28 || !(atr > 0)) return null;
  let best: RangeHit | null = null;
  for (const win of [28, 36, 48, 64, 80, 104, 128]) {
    if (n < win) continue;
    const a = n - win;
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = a; i < n; i++) {
      hi = Math.max(hi, candles[i]!.high);
      lo = Math.min(lo, candles[i]!.low);
    }
    const width = hi - lo;
    /** 너무 좁거나(노이즈) 너무 넓은(추세) TR 제외 — 완화 */
    if (!(width > atr * 1.05) || width > atr * 22) continue;
    let hiTouches = 0;
    let loTouches = 0;
    let inside = 0;
    for (let i = a; i < n; i++) {
      const bar = candles[i]!;
      if (bar.high >= hi - atr * 0.55) hiTouches++;
      if (bar.low <= lo + atr * 0.55) loTouches++;
      if (bar.close <= hi && bar.close >= lo) inside++;
    }
    const insideRatio = inside / win;
    if (insideRatio < 0.55 || hiTouches < 1 || loTouches < 1) continue;
    const score =
      insideRatio * 40 +
      Math.min(hiTouches, 6) * 3.2 +
      Math.min(loTouches, 6) * 3.2 +
      (width / atr < 14 ? 8 : 0) +
      (win >= 48 ? 4 : 0);
    if (!best || score > best.score) {
      best = { startIdx: a, endIdx: n - 1, high: hi, low: lo, score };
    }
  }
  return best;
}

function priorSlope(candles: Candle[], rangeStart: number): number {
  const look = Math.min(48, Math.max(12, Math.floor(rangeStart * 0.45)));
  const from = Math.max(0, rangeStart - look);
  const to = Math.max(from + 2, rangeStart - 1);
  return (candles[to]!.close - candles[from]!.close) / Math.max(1, to - from);
}

function volHalfAvg(candles: Candle[], from: number, to: number): number {
  if (to < from) return 0;
  let s = 0;
  let n = 0;
  for (let i = from; i <= to; i++) {
    s += candles[i]?.volume ?? 0;
    n++;
  }
  return n > 0 ? s / n : 0;
}

/**
 * 마크업 뒤 TR → 재매집 / 마크다운 뒤 TR → 재분배.
 * 기존 축적·분배 detect와 별도 (겹쳐도 기존 유지).
 */
export function detectMergedDeskReaccZone(candles: Candle[]): MergedDeskReaccZoneRead | null {
  if (candles.length < 28) return null;
  const atr = atr14(candles);
  if (!(atr > 0)) return null;
  const range = findTradingRange(candles, atr);
  if (!range) return null;

  const slope = priorSlope(candles, range.startIdx);
  const slopeAtr = slope / atr;
  /** 선행 추세 — 완화(0.012): 약한 마크업/마크다운도 허용 */
  if (Math.abs(slopeAtr) < 0.012) return null;

  const mid = Math.floor((range.startIdx + range.endIdx) / 2);
  const earlyVol = volHalfAvg(candles, range.startIdx, mid);
  const lateVol = volHalfAvg(candles, mid + 1, range.endIdx);
  const quieting = earlyVol > 0 && lateVol <= earlyVol * 1.25;
  const last = candles[candles.length - 1]!;
  const band = Math.max(atr * 0.2, (range.high - range.low) * 0.08);
  const midPx = (range.low + range.high) / 2;

  const vol = computeVolumeSegmentDirection(candles, range.startIdx, range.endIdx);
  const isReacc = slopeAtr > 0;
  /** volFit는 가점 — 하드게이트는 TR+선행추세만 (안 보이던 주원인 완화) */
  let volFit = quieting ? 1 : 0.35;
  if (vol) {
    if (isReacc && (vol.direction === 'buy' || last.close <= midPx + band)) volFit += 1;
    if (!isReacc && (vol.direction === 'sell' || last.close >= midPx - band)) volFit += 1;
    if (vol.strengthKo === '강함') volFit += 0.5;
  } else {
    volFit += 0.4;
  }

  /** 완전 이탈만 제외 — 살짝 밖은 zone 유지 */
  if (isReacc && last.close < range.low - atr * 0.55) return null;
  if (!isReacc && last.close > range.high + atr * 0.55) return null;

  const kind: ReaccKind = isReacc ? 'reaccumulation' : 'redistribution';
  const kindKo = isReacc ? '재매집' : '재분배';
  const kindEn = isReacc ? 'Re-accumulation' : 'Re-distribution';

  let bias: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  let signalKo = 'TR 안 정리 · 관찰(WAIT)';
  if (isReacc) {
    if (last.close > range.high - band * 0.5 && (vol?.direction === 'buy' || quieting)) {
      bias = 'LONG';
      signalKo = '재매집 상단 돌파·매수우세 관찰 (추격 주의)';
    } else if (last.low <= range.low + band && vol?.direction !== 'sell') {
      bias = 'LONG';
      signalKo = '재매집 하단 흡수·지지 반응 관찰';
    } else if (last.close <= midPx) {
      bias = 'LONG';
      signalKo = '재매집 TR 하단 쪽 · 롱 관찰';
    }
  } else {
    if (last.close < range.low + band * 0.5 && (vol?.direction === 'sell' || quieting)) {
      bias = 'SHORT';
      signalKo = '재분배 하단 이탈·매도우세 관찰 (추격 주의)';
    } else if (last.high >= range.high - band && vol?.direction !== 'buy') {
      bias = 'SHORT';
      signalKo = '재분배 상단 거부·저항 반응 관찰';
    } else if (last.close >= midPx) {
      bias = 'SHORT';
      signalKo = '재분배 TR 상단 쪽 · 숏 관찰';
    }
  }

  const confidence = Math.max(
    48,
    Math.min(86, Math.round(48 + range.score * 0.35 + volFit * 6 + (quieting ? 4 : 0)))
  );
  const volumeKo = vol?.headlineKo || (quieting ? '후반 거래량 축소(정리)' : '구간 거래량 혼조');
  const invalidPrice = isReacc ? range.low : range.high;

  return {
    kind,
    kindKo,
    kindEn,
    headlineKo: `${kindKo} · ${signalKo}`,
    detailKo: `${kindEn} TR. 선행 ${isReacc ? '상승' : '하락'} 후 횡보. ${volumeKo}. 무효≈${invalidPrice.toFixed(0)}. 확정 아님.`,
    volumeKo,
    signalKo,
    confidence,
    support: range.low,
    resist: range.high,
    mid: midPx,
    rangeStartIdx: range.startIdx,
    rangeEndIdx: range.endIdx,
    startTime: Number(candles[range.startIdx]!.time),
    endTime: Number(candles[range.endIdx]!.time),
    volume: vol,
    bias,
    invalidPrice,
  };
}

export function buildMergedDeskReaccZonePack(params: {
  candles: Candle[];
  timeframe: string;
  enabled?: boolean;
}): MergedDeskReaccZonePack {
  if (params.enabled === false || params.candles.length < 28) {
    return { read: null, overlays: [], priceLines: [] };
  }
  const read = detectMergedDeskReaccZone(params.candles);
  if (!read) return { read: null, overlays: [], priceLines: [] };

  const candles = params.candles;
  const t1 = read.startTime;
  const t2 = Number(candles[candles.length - 1]!.time); /** 마지막 생신 캔들까지만 */

  const reacc = read.kind === 'reaccumulation';
  const fill = reacc ? 'rgba(45,212,191,0.28)' : 'rgba(251,146,60,0.28)';
  const edge = reacc ? '#2dd4bf' : '#fb923c';
  const supportC = reacc ? '#4ade80' : '#fb7185';
  const resistC = reacc ? '#f87171' : '#fdba74';
  const faceH = Math.max(1e-12, (read.resist - read.support) * 0.18);

  const overlays: OverlayItem[] = [
    {
      id: 'merged-desk-reacc-zone-body',
      kind: 'zone',
      label: read.kindKo,
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.support,
      price2: read.resist,
      color: fill,
      confidence: read.confidence / 100,
      category: 'zones',
      zoneFillPreserve: true,
      zoneFaceBase: read.kindKo,
      zoneFaceSignal: read.bias === 'WAIT' ? '관찰' : read.bias === 'LONG' ? '롱관찰' : '숏관찰',
      zoneFaceDetailKo: `${read.signalKo} · ${read.volumeKo}`,
      overlayZoneExtraClass: [
        'merged-desk-reacc-zone',
        'merged-desk-money-zone-keep',
        'merged-desk-zone-label-on',
        'merged-desk-school-schematic-keep',
        reacc ? 'merged-desk-reacc-acc' : 'merged-desk-reacc-dist',
      ].join(' '),
      structureBias: reacc ? 'bullish' : 'bearish',
      labelTooltip: `${read.detailKo} · ${read.volumeKo}`,
    },
    {
      id: 'merged-desk-reacc-support-line',
      kind: 'supportLine',
      label: `${read.kindKo}하`,
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.support,
      price2: read.support,
      color: supportC,
      lineLabelColor: supportC,
      lineStrokeWidth: 2,
      lineDash: '5 4',
      category: 'zones',
      confidence: read.confidence,
      noProject: false,
      overlayZoneExtraClass: 'merged-desk-reacc-line merged-desk-school-schematic-keep',
    },
    {
      id: 'merged-desk-reacc-resist-line',
      kind: 'resistanceLine',
      label: `${read.kindKo}상`,
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.resist,
      price2: read.resist,
      color: resistC,
      lineLabelColor: resistC,
      lineStrokeWidth: 2,
      lineDash: '5 4',
      category: 'zones',
      confidence: read.confidence,
      noProject: false,
      overlayZoneExtraClass: 'merged-desk-reacc-line merged-desk-school-schematic-keep',
    },
    {
      id: 'merged-desk-reacc-mid-line',
      kind: 'supportLine',
      label: `${read.kindKo}중`,
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.mid,
      price2: read.mid,
      color: edge,
      lineLabelColor: edge,
      lineStrokeWidth: 1.25,
      lineDash: '3 5',
      category: 'zones',
      confidence: Math.max(40, read.confidence - 8),
      noProject: false,
      overlayZoneExtraClass: 'merged-desk-reacc-line merged-desk-school-schematic-keep',
    },
  ];

  overlays.push(
    {
      id: 'merged-desk-reacc-support-face',
      kind: 'zone',
      label: `${read.kindKo}하`,
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.support,
      price2: read.support + faceH,
      color: reacc ? 'rgba(74,222,128,0.22)' : 'rgba(251,113,133,0.18)',
      confidence: read.confidence / 100,
      category: 'zones',
      zoneFillPreserve: true,
      zoneFaceBase: `${read.kindKo}하`,
      overlayZoneExtraClass:
        'merged-desk-reacc-zone merged-desk-money-zone-keep merged-desk-school-schematic-keep',
      structureBias: reacc ? 'bullish' : 'bearish',
    },
    {
      id: 'merged-desk-reacc-resist-face',
      kind: 'zone',
      label: `${read.kindKo}상`,
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.resist - faceH,
      price2: read.resist,
      color: reacc ? 'rgba(248,113,113,0.18)' : 'rgba(251,146,60,0.22)',
      confidence: read.confidence / 100,
      category: 'zones',
      zoneFillPreserve: true,
      zoneFaceBase: `${read.kindKo}상`,
      overlayZoneExtraClass:
        'merged-desk-reacc-zone merged-desk-money-zone-keep merged-desk-school-schematic-keep',
      structureBias: reacc ? 'bullish' : 'bearish',
    }
  );

  const priceLines: AtlasPulsePriceLine[] = [
    {
      price: read.resist,
      color: resistC,
      title: `${read.kindKo}상`,
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    },
    {
      price: read.support,
      color: supportC,
      title: `${read.kindKo}하`,
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    },
    {
      price: read.mid,
      color: edge,
      title: `${read.kindKo}중`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    },
    {
      price: read.invalidPrice,
      color: '#fbbf24',
      title: `${read.kindKo}무효`,
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    },
  ];

  return { read, overlays, priceLines };
}
