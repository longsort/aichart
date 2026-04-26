import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { computeParkfLinRegBandSnapshot } from '@/lib/parkfLinregTrendlineEngine';

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function toFixed2(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function buildCpLinregFusionOverlays(params: {
  uiMode: string;
  candles: Candle[];
  overlays: OverlayItem[];
  analysis: AnalyzeResponse | null;
}): OverlayItem[] {
  const { uiMode, candles, overlays, analysis } = params;
  if (uiMode !== 'AI_ZONE') return [];
  if (!analysis || candles.length < 30) return [];

  const snapNow = computeParkfLinRegBandSnapshot(candles, {});
  const snapPrev = computeParkfLinRegBandSnapshot(candles.slice(0, -1), {});
  if (!snapNow || !snapPrev) return [];

  const last = candles[candles.length - 1];
  const eps = Math.max(last.close * 0.00025, snapNow.eps);
  const linSlope = snapNow.mid - snapPrev.mid;
  const linBias: 'LONG' | 'SHORT' | 'NEUTRAL' =
    linSlope > eps ? 'LONG' : linSlope < -eps ? 'SHORT' : 'NEUTRAL';

  const cpCenter = overlays.filter(
    (o) =>
      String(o.id || '').startsWith('cptc-') &&
      String(o.id || '').includes('-center') &&
      typeof o.price1 === 'number' &&
      typeof o.price2 === 'number'
  );
  const cpSlopeAvg = avg(cpCenter.map((o) => Number(o.price2) - Number(o.price1)));
  const cpBias: 'LONG' | 'SHORT' | 'NEUTRAL' =
    cpSlopeAvg > eps ? 'LONG' : cpSlopeAvg < -eps ? 'SHORT' : 'NEUTRAL';

  let side: 'LONG' | 'SHORT' | null = null;
  if (cpBias === linBias && cpBias !== 'NEUTRAL') side = cpBias;
  else if ((analysis.aiZoneSignal?.verdict === 'LONG' || analysis.aiZoneSignal?.verdict === 'SHORT') && linBias !== 'NEUTRAL') {
    if (analysis.aiZoneSignal.verdict === linBias) side = linBias;
  }
  if (!side) return [];

  const low = side === 'LONG' ? Math.min(snapNow.supS, snapNow.supM) : Math.min(snapNow.resS, snapNow.resM);
  const high = side === 'LONG' ? Math.max(snapNow.supS, snapNow.supM) : Math.max(snapNow.resS, snapNow.resM);
  const zonePad = Math.max((high - low) * 0.12, last.close * 0.0002);
  const inv = side === 'LONG' ? snapNow.supL : snapNow.resL;
  const alignedWithAiZone = analysis.aiZoneSignal?.zone?.side === side;
  const conf = Math.max(
    55,
    Math.min(
      93,
      Math.round(
        58 +
          (cpBias === linBias ? 12 : 0) +
          (alignedWithAiZone ? 10 : 0) +
          ((analysis.confirmedSignal?.gatesPassCount ?? 0) >= 4 ? 8 : 0) +
          (analysis.confirmedSignal?.mtfBlocked ? -8 : 0)
      )
    )
  );
  const reason = `CP ${cpBias} · LinReg ${linBias}${alignedWithAiZone ? ' · AI분석 모드 합류' : ''}`;

  const zone: OverlayItem = {
    id: 'ai-cp-lr-zone',
    kind: side === 'LONG' ? 'demandZone' : 'supplyZone',
    label: `AI 합성존 ${side} ${conf}%`,
    x1: 0.12,
    y1: 0.12,
    x2: 0.995,
    y2: 0.12,
    price1: high + zonePad,
    price2: low - zonePad,
    confidence: conf,
    color: side === 'LONG' ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
    lineLabelColor: side === 'LONG' ? '#86efac' : '#fca5a5',
    category: 'smcDesk',
    zoneSpanOnly: true,
    labelTooltip: `CP+LinReg 합성 컨플루언스 존. ${reason}`,
  };
  const invLine: OverlayItem = {
    id: 'ai-cp-lr-inv',
    kind: 'keyLevel',
    label: `합성 무효 ${toFixed2(inv)}`,
    x1: 0.20,
    y1: 0.20,
    x2: 0.995,
    y2: 0.20,
    price1: inv,
    price2: inv,
    confidence: Math.max(54, conf - 6),
    color: 'rgba(248,113,113,0.92)',
    category: 'keyLevel',
  };
  const info: OverlayItem = {
    id: 'ai-cp-lr-label',
    kind: 'label',
    label: `AI 합성 ${side} · ${reason}`,
    x1: 0.90,
    y1: 0.18,
    x2: 0.90,
    y2: 0.18,
    confidence: conf,
    color: side === 'LONG' ? '#4ade80' : '#f87171',
    category: 'labels',
  };
  return [zone, invLine, info];
}

