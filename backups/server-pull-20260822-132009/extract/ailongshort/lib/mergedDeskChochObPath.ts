/**
 * CHoCH 돌파 → 하락(또는 상승) 후 OB까지 반등/거부 경로.
 * 규칙: CHoCH 뚫리면 반대쪽 OB까지 되돌린 뒤, 위/아래 OB로 반등·거부.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  type MergedSmcLeadingContext,
  type MergedSmcLeadingOb,
  type MergedSmcStructureMark,
} from '@/lib/mergedAnalysisSmcLeading';
import {
  mergedWorkCandles,
  snapMergedOverlayTimeToCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import { isMergedDeskSharedFeatureTf } from '@/lib/mergedDeskSharedTfFeatures';

export type ChochObPathSide = 'LONG' | 'SHORT';

export type ChochObPathPack = {
  active: boolean;
  side: ChochObPathSide | null;
  chochPrice: number | null;
  /** 하락/상승 후 닿을 1차 목표 (반대 OB) */
  pullbackOb: { low: number; high: number; mid: number; labelKo: string } | null;
  /** 반등/거부 목표 (진행 방향 OB) */
  bounceOb: { low: number; high: number; mid: number; labelKo: string } | null;
  /** 중간 경로 레벨 */
  dropLow: number | null;
  bounceHigh: number | null;
  phaseKo: string;
  summaryKo: string;
  detailKo: string;
  invalidationKo: string;
  overlays: OverlayItem[];
};

function fmt(p: number): string {
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function mid(lo: number, hi: number): number {
  return (lo + hi) / 2;
}

function pickDemandBelow(obs: MergedSmcLeadingOb[], price: number): MergedSmcLeadingOb | null {
  const list = obs
    .filter((o) => o.bias === 'bullish' && o.high < price * 1.002)
    .sort((a, b) => b.high - a.high);
  return list[0] ?? null;
}

function pickSupplyAbove(obs: MergedSmcLeadingOb[], price: number): MergedSmcLeadingOb | null {
  const list = obs
    .filter((o) => o.bias === 'bearish' && o.low > price * 0.998)
    .sort((a, b) => a.low - b.low);
  return list[0] ?? null;
}

function phaseAllowsPath(phase: MergedSmcStructureMark['phase']): boolean {
  return (
    phase === 'breakout' ||
    phase === 'settling' ||
    phase === 'confirmed' ||
    phase === 'pending'
  );
}

/**
 * CHoCH 돌파 시:
 * - 롱(상방 CHoCH): 아래로 수요 OB까지 하락 → 위 공급 OB까지 반등
 * - 숏(하방 CHoCH): 위로 공급 OB까지 상승 → 아래 수요 OB까지 하락
 */
export function buildMergedDeskChochObPathPack(params: {
  candles: Candle[];
  timeframe: string;
  smcLeading: MergedSmcLeadingContext;
  currentPrice?: number | null;
}): ChochObPathPack {
  const empty: ChochObPathPack = {
    active: false,
    side: null,
    chochPrice: null,
    pullbackOb: null,
    bounceOb: null,
    dropLow: null,
    bounceHigh: null,
    phaseKo: '',
    summaryKo: 'CHoCH→OB 경로 대기',
    detailKo: '—',
    invalidationKo: '',
    overlays: [],
  };

  if (!isMergedDeskSharedFeatureTf(params.timeframe)) return empty;

  const tf = normalizeChartTimeframe(params.timeframe);
  const candles = mergedWorkCandles(params.candles, tf);
  const choch = params.smcLeading.lastChoch;
  if (!candles.length || !choch || choch.phase === 'failed' || !phaseAllowsPath(choch.phase)) {
    return empty;
  }

  const price =
    params.currentPrice && params.currentPrice > 0
      ? params.currentPrice
      : candles[candles.length - 1]!.close;
  const obs = params.smcLeading.obs;
  const last = candles[candles.length - 1]!;
  const tEnd = Number(snapMergedOverlayTimeToCandles(Number(last.time), candles));
  const tStart = Number(
    snapMergedOverlayTimeToCandles(Number(candles[Math.max(0, choch.index)]!.time), candles)
  );

  const side: ChochObPathSide = choch.bias === 'bullish' ? 'LONG' : 'SHORT';
  const demand = pickDemandBelow(obs, Math.max(price, choch.price));
  const supply = pickSupplyAbove(obs, Math.min(price, choch.price));

  // 레그 범위로 OB 없을 때 대체
  let legHigh = -Infinity;
  let legLow = Infinity;
  const scanFrom = Math.max(0, choch.index - 80);
  for (let i = scanFrom; i <= choch.index; i++) {
    legHigh = Math.max(legHigh, candles[i]!.high);
    legLow = Math.min(legLow, candles[i]!.low);
  }
  const range = Math.max(legHigh - legLow, price * 0.008);

  let pullbackOb: ChochObPathPack['pullbackOb'] = null;
  let bounceOb: ChochObPathPack['bounceOb'] = null;
  let dropLow: number | null = null;
  let bounceHigh: number | null = null;
  let summaryKo = '';
  let detailKo = '';
  let invalidationKo = '';

  if (side === 'LONG') {
    // 하락 후 반등: 수요 OB까지 눌림 → 위 공급 OB(또는 CHoCH 위 OB)까지 반등
    if (demand) {
      pullbackOb = {
        low: demand.low,
        high: demand.high,
        mid: mid(demand.low, demand.high),
        labelKo: demand.labelKo || '수요 OB',
      };
      dropLow = demand.low;
    } else {
      const lo = choch.price - range * 0.382;
      pullbackOb = {
        low: lo - range * 0.04,
        high: lo + range * 0.04,
        mid: lo,
        labelKo: '되돌림 38%',
      };
      dropLow = lo;
    }
    if (supply) {
      bounceOb = {
        low: supply.low,
        high: supply.high,
        mid: mid(supply.low, supply.high),
        labelKo: supply.labelKo || '공급 OB',
      };
      bounceHigh = supply.high;
    } else {
      const hi = Math.max(choch.price + range * 0.25, legHigh);
      bounceOb = {
        low: hi - range * 0.05,
        high: hi + range * 0.02,
        mid: hi,
        labelKo: '상단 반등목표',
      };
      bounceHigh = hi;
    }
    summaryKo = `CHoCH↑ 돌파 · ${fmt(dropLow!)}까지 하락 후 → ${fmt(bounceOb.mid)} OB 반등(롱)`;
    detailKo = `눌림 ${pullbackOb.labelKo} ${fmt(pullbackOb.low)}~${fmt(pullbackOb.high)} · 반등 ${bounceOb.labelKo} ${fmt(bounceOb.low)}~${fmt(bounceOb.high)}`;
    invalidationKo = `종가 ${fmt(pullbackOb.low)} 이탈 시 롱 경로 무효`;
  } else {
    // 상승 후 하락: 공급 OB까지 되돌림 → 아래 수요 OB까지 하락(숏)
    if (supply) {
      pullbackOb = {
        low: supply.low,
        high: supply.high,
        mid: mid(supply.low, supply.high),
        labelKo: supply.labelKo || '공급 OB',
      };
      bounceHigh = supply.high;
    } else {
      const hi = choch.price + range * 0.382;
      pullbackOb = {
        low: hi - range * 0.04,
        high: hi + range * 0.04,
        mid: hi,
        labelKo: '되돌림 38%',
      };
      bounceHigh = hi;
    }
    if (demand) {
      bounceOb = {
        low: demand.low,
        high: demand.high,
        mid: mid(demand.low, demand.high),
        labelKo: demand.labelKo || '수요 OB',
      };
      dropLow = demand.low;
    } else {
      const lo = Math.min(choch.price - range * 0.25, legLow);
      bounceOb = {
        low: lo - range * 0.02,
        high: lo + range * 0.05,
        mid: lo,
        labelKo: '하단 하락목표',
      };
      dropLow = lo;
    }
    summaryKo = `CHoCH↓ 돌파 · ${fmt(pullbackOb.mid)}까지 반등 후 → ${fmt(bounceOb.mid)} OB 하락(숏)`;
    detailKo = `되돌림 ${pullbackOb.labelKo} ${fmt(pullbackOb.low)}~${fmt(pullbackOb.high)} · 목표 ${bounceOb.labelKo} ${fmt(bounceOb.low)}~${fmt(bounceOb.high)}`;
    invalidationKo = `종가 ${fmt(pullbackOb.high)} 돌파 시 숏 경로 무효`;
  }

  const phaseKo =
    choch.phase === 'breakout'
      ? '돌파'
      : choch.phase === 'settling'
        ? '안착중'
        : choch.phase === 'confirmed'
          ? '안착'
          : '선행';

  const overlays: OverlayItem[] = [];
  const isLong = side === 'LONG';

  if (pullbackOb) {
    overlays.push({
      id: `merged-choch-ob-pullback-${Math.round(pullbackOb.mid)}`,
      kind: isLong ? 'demandZone' : 'supplyZone',
      label: isLong ? `하락→${fmt(pullbackOb.mid)}` : `반등→${fmt(pullbackOb.mid)}`,
      labelTooltip: `${pullbackOb.labelKo} · CHoCH 돌파 후 1차 되돌림 · ${invalidationKo}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart as UTCTimestamp,
      time2: tEnd as UTCTimestamp,
      price1: pullbackOb.high,
      price2: pullbackOb.low,
      confidence: 82,
      color: isLong ? 'rgba(34,211,238,0.22)' : 'rgba(248,113,113,0.2)',
      category: 'scenario',
      zonePulse: true,
      zoneFillPreserve: true,
      lineLabelColor: isLong ? '#67e8f9' : '#fca5a5',
      labelBackgroundColor: isLong ? 'rgba(8,78,99,0.94)' : 'rgba(127,29,29,0.94)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: 'merged-choch-ob-path merged-choch-ob-pullback',
    });
  }

  if (bounceOb) {
    overlays.push({
      id: `merged-choch-ob-bounce-${Math.round(bounceOb.mid)}`,
      kind: isLong ? 'supplyZone' : 'demandZone',
      label: isLong ? `반등OB ${fmt(bounceOb.mid)}` : `하락OB ${fmt(bounceOb.mid)}`,
      labelTooltip: `${bounceOb.labelKo} · CHoCH 돌파 후 목표 OB · ${detailKo}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart as UTCTimestamp,
      time2: tEnd as UTCTimestamp,
      price1: bounceOb.high,
      price2: bounceOb.low,
      confidence: 78,
      color: isLong ? 'rgba(74,222,128,0.18)' : 'rgba(251,146,60,0.18)',
      category: 'scenario',
      zonePulse: choch.phase === 'breakout' || choch.phase === 'settling',
      zoneFillPreserve: true,
      lineLabelColor: isLong ? '#86efac' : '#fdba74',
      labelBackgroundColor: isLong ? 'rgba(20,83,45,0.92)' : 'rgba(124,45,18,0.9)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: 'merged-choch-ob-path merged-choch-ob-target',
    });
  }

  // 경로 가이드선 (CHoCH → 눌림 → 목표)
  if (pullbackOb && bounceOb) {
    overlays.push({
      id: `merged-choch-ob-path-line-${choch.index}`,
      kind: 'trendLine',
      label: isLong ? 'CHoCH→하락→반등OB' : 'CHoCH→반등→하락OB',
      labelTooltip: summaryKo,
      x1: 0,
      x2: 0,
      time1: tStart as UTCTimestamp,
      time2: tEnd as UTCTimestamp,
      price1: choch.price,
      price2: bounceOb.mid,
      color: isLong ? 'rgba(34,211,238,0.75)' : 'rgba(248,113,113,0.75)',
      lineWidth: 2,
      lineStyle: 2,
    });
    overlays.push({
      id: `merged-choch-ob-drop-mark-${choch.index}`,
      kind: 'keyLevel',
      label: isLong ? `↓${fmt(pullbackOb.mid)}` : `↑${fmt(pullbackOb.mid)}`,
      x1: 0,
      y1: pullbackOb.mid,
      x2: 1,
      y2: pullbackOb.mid,
      time1: tStart as UTCTimestamp,
      time2: tEnd as UTCTimestamp,
      price1: pullbackOb.mid,
      price2: pullbackOb.mid,
      confidence: 80,
      color: isLong ? '#22d3ee' : '#fb923c',
      lineDash: '5 4',
      category: 'scenario',
    });
  }

  return {
    active: true,
    side,
    chochPrice: choch.price,
    pullbackOb,
    bounceOb,
    dropLow,
    bounceHigh,
    phaseKo,
    summaryKo,
    detailKo,
    invalidationKo,
    overlays,
  };
}

export function summarizeChochObPathKo(pack: ChochObPathPack): string {
  if (!pack.active) return '';
  return `${pack.summaryKo} · ${pack.phaseKo}${pack.invalidationKo ? ` · ${pack.invalidationKo}` : ''}`;
}
