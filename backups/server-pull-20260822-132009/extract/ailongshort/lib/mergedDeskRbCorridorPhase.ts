/**
 * 복도 국면 — 횡보·상승가능·하락가능.
 * 면 네모 없이 전폭 점선 + 마지막봉 핀. 확정 매매·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskRbVolumeSyncPack } from '@/lib/mergedDeskRbVolumeSync';

type EdgeSnap = {
  horizon?: string;
  upper?: string;
  lower?: string;
  captionKo?: string;
};
import { rbLastBarSignalPin, rbSignalPriceLine } from '@/lib/mergedDeskRbSignalDraw';

export function buildMergedDeskRbCorridorPhaseVisuals(params: {
  candles: Candle[];
  geoms: MergedDeskChannelGeom[];
  edgeReads?: EdgeSnap[] | null;
  volSync?: MergedDeskRbVolumeSyncPack | null;
}): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[]; summaryKo: string } {
  const empty = { overlays: [] as OverlayItem[], priceLines: [] as AtlasPulsePriceLine[], summaryKo: '' };
  const { candles, geoms, volSync } = params;
  const n = candles.length;
  if (n < 8 || !geoms.length) return empty;
  const g = geoms.find((x) => x.primary) ?? geoms[0]!;
  const tLast = Number(candles[n - 1]?.time) || 0;
  if (!(tLast > 0) || !(g.tipUpper > g.tipLower)) return empty;

  const read =
    (params.edgeReads ?? []).find((r) => r.horizon === g.horizon) ?? (params.edgeReads ?? [])[0] ?? null;
  const chop =
    volSync?.side === 'chop' || Math.abs(g.slopePct) < 0.0042;
  const buyPct = volSync?.buyPct ?? 0.5;
  const confirm = volSync?.confirm ?? 'weak';
  const energy =
    volSync?.volTrend === 'grow' || (volSync?.rvol != null && volSync.rvol >= 1.12);
  const flowUp = buyPct >= 0.55;
  const flowDn = buyPct <= 0.45;
  const upperThreat = read?.upper === '돌파가능' || read?.upper === '저항가능';
  const lowerHold = read?.lower === '지지가능' || read?.lower === '돌파가능';
  const lowerThreat = read?.lower === '돌파가능';
  const upperHold = read?.upper === '저항가능';

  /** 상승 통로이거나 횡보+매수수급 — 상단 위협/하단 지지와 겹치면 상승가능(조건부) */
  const upPossible =
    confirm !== 'diverge' &&
    (flowUp || (!g.descending && !chop)) &&
    (upperThreat || lowerHold) &&
    (chop ? flowUp && (energy || buyPct >= 0.58) : true);

  const downPossible =
    confirm !== 'diverge' &&
    (flowDn || (g.descending && !chop)) &&
    (lowerThreat || upperHold) &&
    (chop ? flowDn && (energy || buyPct <= 0.42) : true);

  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const bits: string[] = [];

  if (chop) {
    const mid = g.tipMid;
    const mixColor = flowUp ? '#4ADE80' : flowDn ? '#FB7185' : '#94A3B8';
    priceLines.push(
      rbSignalPriceLine({
        price: mid,
        color: mixColor,
        title: flowUp ? '횡보·매수우세' : flowDn ? '횡보·매도우세' : '횡보·수급혼조',
        lineWidth: 1,
        lineStyle: 'dotted',
      })
    );
    overlays.push(
      rbLastBarSignalPin({
        id: 'merged-desk-rb-phase-chop',
        label: flowUp ? '횡보·매수우세' : flowDn ? '횡보·매도우세' : '횡보·수급혼조',
        price: mid,
        tLast,
        color: mixColor,
        bg: flowUp ? 'rgba(20,83,45,0.92)' : flowDn ? 'rgba(127,29,29,0.92)' : 'rgba(51,65,85,0.92)',
        tooltip: [
          '복도 기울기 평탄 · 횡보',
          `매수 ${(buyPct * 100).toFixed(0)}% · 거래량 연동 유지`,
          volSync?.summaryKo || '',
          '확정 방향·수익 아님',
        ]
          .filter(Boolean)
          .join('\n'),
        extraClass: 'merged-desk-rb-phase merged-desk-rb-phase-chop',
        faceBase: '횡보',
        faceSignal: flowUp ? '매수우세' : flowDn ? '매도우세' : '혼조',
      })
    );
    bits.push('횡보수급');
  }

  if (upPossible) {
    priceLines.push(
      rbSignalPriceLine({
        price: g.tipUpper,
        color: '#22C55E',
        title: '상승가능',
        lineWidth: 2,
        lineStyle: 'dotted',
      })
    );
    overlays.push(
      rbLastBarSignalPin({
        id: 'merged-desk-rb-phase-up',
        label: chop ? '횡보·상승가능' : '상승가능',
        price: g.tipUpper,
        tLast,
        color: '#4ADE80',
        bg: 'rgba(20,83,45,0.94)',
        tooltip: [
          chop ? '횡보 복도 + 매수수급 · 상단 관찰' : '상승 통로 · 상단 돌파/지지 관찰',
          `${g.horizonKo} 상단 ${g.tipUpper.toFixed(2)}`,
          read?.captionKo || '',
          volSync?.summaryKo || '',
          '대기·확인 구간 · 진입 지시 아님',
        ]
          .filter(Boolean)
          .join('\n'),
        extraClass: 'merged-desk-rb-phase merged-desk-rb-phase-up',
        faceBase: '상승가능',
        faceSignal: chop ? '횡보' : '통로',
        bias: 'bullish',
      })
    );
    bits.push('상승가능');
  }

  if (downPossible && !upPossible) {
    priceLines.push(
      rbSignalPriceLine({
        price: g.tipLower,
        color: '#EF4444',
        title: '하락가능',
        lineWidth: 2,
        lineStyle: 'dotted',
      })
    );
    overlays.push(
      rbLastBarSignalPin({
        id: 'merged-desk-rb-phase-down',
        label: chop ? '횡보·하락가능' : '하락가능',
        price: g.tipLower,
        tLast,
        color: '#FB7185',
        bg: 'rgba(127,29,29,0.94)',
        tooltip: [
          chop ? '횡보 복도 + 매도수급 · 하단 관찰' : '하락 통로 · 하단 이탈/저항 관찰',
          `${g.horizonKo} 하단 ${g.tipLower.toFixed(2)}`,
          read?.captionKo || '',
          volSync?.summaryKo || '',
          '대기·확인 구간 · 진입 지시 아님',
        ]
          .filter(Boolean)
          .join('\n'),
        extraClass: 'merged-desk-rb-phase merged-desk-rb-phase-down',
        faceBase: '하락가능',
        faceSignal: chop ? '횡보' : '통로',
        bias: 'bearish',
      })
    );
    bits.push('하락가능');
  }

  return {
    overlays,
    priceLines,
    summaryKo: bits.join('·'),
  };
}
