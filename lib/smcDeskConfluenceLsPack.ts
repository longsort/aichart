/**
 * SMC 데스크 전용 **합류(롱/숏)** 마커·존 — 기존 캔들 로켓·L 마커와 id 분리.
 * LinReg 대밴드 근접 + 엔진 OB 인접 + 최근 BOS/CHOCH 중 **2개 이상**일 때만 표시.
 * 확정 매매·고정 승률 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { ParkfLinRegBandSnapshot } from '@/lib/parkfLinregTrendlineEngine';
import { pickLowerProximity, pickUpperProximity } from '@/lib/linregSmcConfluence';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

const CAT: OverlayItem['category'] = 'smcDesk';

function hasRecentBosChoch(overlays: OverlayItem[], lastTime: number, timeframe: string, lookbackBars: number): boolean {
  const barSec = candleBarDurationSec(timeframe, lastTime);
  const winMs = lookbackBars * barSec * 1000;
  const tMin = lastTime - winMs;
  return overlays.some((o) => {
    const k = String(o.kind || '');
    if (k !== 'bos' && k !== 'choch') return false;
    const t1 = o.time1;
    return typeof t1 === 'number' && t1 >= tMin && t1 <= lastTime;
  });
}

function obTouchesSupport(cp: number, analysis: AnalyzeResponse | null | undefined): boolean {
  if (!analysis?.nearestSupportOb) return false;
  const ns = analysis.nearestSupportOb;
  const eps = Math.max(cp * 0.0004, 1e-8);
  return cp >= ns.low - eps && cp <= ns.high + eps;
}

function obTouchesResistance(cp: number, analysis: AnalyzeResponse | null | undefined): boolean {
  if (!analysis?.nearestResistanceOb) return false;
  const nr = analysis.nearestResistanceOb;
  const eps = Math.max(cp * 0.0004, 1e-8);
  return cp >= nr.low - eps && cp <= nr.high + eps;
}

/** L(외곽) > M > S — 동점 시 어느 밴드에 더 붙었는지 가늠 */
function bandKeyWeight(key: 'L' | 'M' | 'S' | null): number {
  if (key === 'L') return 3;
  if (key === 'M') return 2;
  if (key === 'S') return 1;
  return 0;
}

export type SmcDeskConfluenceLsMeta = {
  side: 'LONG' | 'SHORT';
  longScore: number;
  shortScore: number;
};

export type SmcDeskConfluenceLsPackParams = {
  candles: Candle[];
  analysis: AnalyzeResponse | null | undefined;
  overlays: OverlayItem[];
  snap: ParkfLinRegBandSnapshot;
  timeframe: string;
  depthDeltaBias?: 'LONG' | 'SHORT' | 'NEUTRAL';
};

/**
 * 차트 오버레이와 동일한 점수·동점 처리. `null` = 2/3 미달.
 * 종합 `verdict`(computeSignalScore)와는 별도 축 — 불일치 가능.
 */
export function computeSmcDeskConfluenceLsMeta(p: SmcDeskConfluenceLsPackParams): SmcDeskConfluenceLsMeta | null {
  const { candles, analysis, overlays, snap, timeframe } = p;
  const depthDeltaBias =
    p.depthDeltaBias ??
    (analysis?.depthDeltaContext?.regime === 'buy'
      ? 'LONG'
      : analysis?.depthDeltaContext?.regime === 'sell'
        ? 'SHORT'
        : 'NEUTRAL');
  const n = candles.length;
  if (n < 24 || !analysis) return null;

  const last = candles[n - 1];
  const lastHigh = last.high;
  const lastLow = last.low;
  const lastClose = last.close;
  const lastOpen = last.open;
  const lastTime = last.time as number;

  const up = pickUpperProximity(lastHigh, snap);
  const lo = pickLowerProximity(lastLow, snap);
  const struct = hasRecentBosChoch(overlays, lastTime, timeframe, 22);
  const obSup = obTouchesSupport(lastClose, analysis);
  const obRes = obTouchesResistance(lastClose, analysis);

  let longScore = 0;
  if (lo.key) longScore += 1;
  if (obSup) longScore += 1;
  if (struct) longScore += 1;

  let shortScore = 0;
  if (up.key) shortScore += 1;
  if (obRes) shortScore += 1;
  if (struct) shortScore += 1;
  if (depthDeltaBias === 'LONG') longScore += 0.5;
  if (depthDeltaBias === 'SHORT') shortScore += 0.5;

  const minHit = 2;
  let side: 'LONG' | 'SHORT' | null = null;

  if (longScore >= minHit && shortScore >= minHit) {
    if (longScore > shortScore) side = 'LONG';
    else if (shortScore > longScore) side = 'SHORT';
    else {
      const wUp = bandKeyWeight(up.key);
      const wLo = bandKeyWeight(lo.key);
      if (wUp > wLo) side = 'SHORT';
      else if (wLo > wUp) side = 'LONG';
      else {
        const sd = Math.max(snap.stdDev, snap.eps * 4);
        const z = (lastClose - snap.mid) / sd;
        if (z > 0.2) side = 'SHORT';
        else if (z < -0.2) side = 'LONG';
        else side = lastClose >= lastOpen ? 'LONG' : 'SHORT';
      }
    }
  } else if (longScore >= minHit) side = 'LONG';
  else if (shortScore >= minHit) side = 'SHORT';

  if (!side) return null;
  return { side, longScore, shortScore };
}

/**
 * 마커(최종봉 핀) + 가로 존(최근 구간) — 둘 다 또는 점수 미달 시 빈 배열.
 */
export function buildSmcDeskConfluenceLsPack(p: SmcDeskConfluenceLsPackParams): OverlayItem[] {
  const { candles, analysis, overlays, snap, timeframe } = p;
  const n = candles.length;
  if (n < 24 || !analysis) return [];

  const last = candles[n - 1];
  const lastHigh = last.high;
  const lastLow = last.low;
  const lastClose = last.close;
  const lastTime = last.time as number;

  const up = pickUpperProximity(lastHigh, snap);
  const lo = pickLowerProximity(lastLow, snap);
  const struct = hasRecentBosChoch(overlays, lastTime, timeframe, 22);
  const obSup = obTouchesSupport(lastClose, analysis);
  const obRes = obTouchesResistance(lastClose, analysis);

  const meta = computeSmcDeskConfluenceLsMeta(p);
  if (!meta) return [];
  const { side, longScore, shortScore } = meta;

  const lookback = Math.min(48, n - 1);
  const tStart = candles[Math.max(0, n - lookback)].time as number;
  const tEnd = lastTime;
  const half = Math.max(snap.stdDev * 0.09, snap.eps * 1.2);
  const mid = (lastHigh + lastLow) / 2;
  const zTop = side === 'LONG' ? mid + half : mid + half * 1.1;
  const zBot = side === 'LONG' ? mid - half * 1.1 : mid - half;

  const parts: string[] = [];
  parts.push(side === 'LONG' ? '롱 합류 요건(참고)' : '숏 합류 요건(참고)');
  parts.push(
    `LinReg ${side === 'LONG' ? '하단' : '상단'} 밴드 근접: ${side === 'LONG' ? (lo.key ? `예(${lo.key})` : '아니오') : up.key ? `예(${up.key})` : '아니오'}`
  );
  parts.push(`엔진 OB ${side === 'LONG' ? '지지' : '저항'} 구간과 종가 인접: ${side === 'LONG' ? (obSup ? '예' : '아니오') : obRes ? '예' : '아니오'}`);
  parts.push(`최근 BOS/CHOCH 표시: ${struct ? '예' : '아니오'}`);
  parts.push(`점수 롱${longScore}/3 · 숏${shortScore}/3 (한쪽 2 이상일 때 표시). 확정 신호 아님.`);
  parts.push(`우측 패널 종합 신호(롱/숏)는 별도 엔진 — 불일치할 수 있음.`);

  const tip = parts.join(' · ');

  const out: OverlayItem[] = [];

  out.push({
    id: `smc-desk-confluence-marker-${side === 'LONG' ? 'long' : 'short'}`,
    kind: 'label',
    label: side === 'LONG' ? '합류·L' : '합류·S',
    x1: 0,
    y1: 0,
    time1: lastTime,
    price1: lastClose,
    confidence: 56,
    color: side === 'LONG' ? '#22C55E' : '#F87171',
    lineLabelColor: side === 'LONG' ? '#DCFCE7' : '#FEE2E2',
    labelBackgroundColor: side === 'LONG' ? 'rgba(21,128,61,0.92)' : 'rgba(185,28,28,0.9)',
    labelTextColor: side === 'LONG' ? '#F0FDF4' : '#FEF2F2',
    category: CAT,
    labelTooltip: tip,
  });

  out.push({
    id: `smc-desk-confluence-zone-${side === 'LONG' ? 'long' : 'short'}`,
    kind: side === 'LONG' ? 'demandZone' : 'supplyZone',
    label: side === 'LONG' ? '합류·롱존' : '합류·숏존',
    x1: 0,
    y1: 0,
    time1: tStart,
    time2: tEnd,
    price1: zTop,
    price2: zBot,
    confidence: 54,
    color: side === 'LONG' ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
    lineLabelColor: side === 'LONG' ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.85)',
    category: CAT,
    zoneSpanOnly: true,
    labelTooltip: tip,
  });

  return out;
}
