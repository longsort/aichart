/**
 * SMC 데스크 · 합성: 카드 대신 차트에 진입/SL/TP 작도 (ls-plan과 동일 데이터 소스 우선).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { SmcDeskCompositeModel } from '@/lib/smcDeskCompositeModel';

function fmtPrice(p: number): string {
  const a = Math.abs(p);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return p.toFixed(d);
}

export function buildSmcDeskCompositeChartOverlays(
  candles: Candle[],
  _analysis: AnalyzeResponse | null,
  model: SmcDeskCompositeModel
): OverlayItem[] {
  if (candles.length < 2) return [];
  const tStart = candles[0].time as number;
  const tEnd = candles[candles.length - 1].time as number;
  const { entry, stopLoss, targets, direction } = model.tradePlan;
  const dd = model.depthDelta;
  const aligned =
    (direction === 'LONG' && dd?.regime === 'buy') || (direction === 'SHORT' && dd?.regime === 'sell');
  const contra =
    (direction === 'LONG' && dd?.regime === 'sell') || (direction === 'SHORT' && dd?.regime === 'buy');
  const out: OverlayItem[] = [];

  if (entry != null && Number.isFinite(entry)) {
    out.push({
      id: 'smc-composite-entry',
      kind: 'entry',
      label: `합성 진입 ${fmtPrice(entry)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart,
      time2: tEnd,
      price1: entry,
      price2: entry,
      confidence: 82,
      category: 'smcDesk',
      color: contra ? 'rgba(245,158,11,0.95)' : 'rgba(34,197,94,0.92)',
      lineLabelColor: '#BBF7D0',
      labelBackgroundColor: 'rgba(21,128,61,0.88)',
      labelTextColor: '#F0FDF4',
      lineStrokeWidth: 2.5,
      labelTooltip: model.tradePlan.layerNotes.entry
        ? `합성 진입 — ${model.tradePlan.layerNotes.entry}`
        : '합성 모델 진입가(참고)',
    });
  }

  if (stopLoss != null && Number.isFinite(stopLoss)) {
    out.push({
      id: 'smc-composite-sl',
      kind: 'stop',
      label: `합성 SL ${fmtPrice(stopLoss)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart,
      time2: tEnd,
      price1: stopLoss,
      price2: stopLoss,
      confidence: 84,
      category: 'smcDesk',
      color: 'rgba(248,113,113,0.95)',
      lineLabelColor: '#FECACA',
      labelBackgroundColor: 'rgba(185,28,28,0.88)',
      labelTextColor: '#FEF2F2',
      lineStrokeWidth: 2.45,
      lineDash: '8 5',
      labelTooltip: `${model.longScenario.invalidation.slice(0, 220)}${dd ? ` · Δ ${dd.regime} ${dd.smoothedPct.toFixed(1)}%` : ''}`,
    });
  }

  const tpCols = ['rgba(52,211,153,0.9)', 'rgba(45,212,191,0.88)', 'rgba(56,189,248,0.88)'];
  targets.forEach((tp, i) => {
    if (tp == null || !Number.isFinite(tp)) return;
    out.push({
      id: `smc-composite-tp-${i + 1}`,
      kind: 'target',
      label: `합성 TP${i + 1} ${fmtPrice(tp)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart,
      time2: tEnd,
      price1: tp,
      price2: tp,
      confidence: 80,
      category: 'smcDesk',
      color: aligned ? 'rgba(16,185,129,0.95)' : tpCols[i] ?? tpCols[2],
      lineLabelColor: '#ECFDF5',
      labelBackgroundColor: 'rgba(6,78,59,0.82)',
      labelTextColor: '#F0FDF4',
      lineStrokeWidth: 2.1,
      lineDash: i === 0 ? undefined : '4 4',
      labelTooltip: model.tradePlan.layerNotes.tp ?? `익절 후보 ${i + 1} — 참고용`,
    });
  });

  if (dd && entry != null && Number.isFinite(entry)) {
    out.push({
      id: 'smc-composite-dd-tag',
      kind: 'label',
      label: `Δ ${dd.regime === 'buy' ? '매수' : dd.regime === 'sell' ? '매도' : '중립'} ${dd.smoothedPct.toFixed(1)}%`,
      x1: 0,
      y1: 0,
      time1: tEnd,
      price1: entry,
      confidence: 70,
      category: 'smcDesk',
      color: dd.regime === 'buy' ? '#22C55E' : dd.regime === 'sell' ? '#F87171' : '#94A3B8',
      lineLabelColor: '#E2E8F0',
      labelBackgroundColor: 'rgba(15,23,42,0.86)',
      labelTextColor: '#E2E8F0',
      labelTooltip: `유동성 Δ 레짐 · flip ${dd.flip} · ${dd.persistenceBars}봉 지속`,
    });
  }
  const ddRule = model.watchRules.find((w) => w.id === 'w4');
  if (ddRule?.matched && entry != null && Number.isFinite(entry)) {
    out.push({
      id: 'smc-composite-alert-dd-flip',
      kind: 'label',
      label: '규칙충족 Δ전환',
      x1: 0,
      y1: 0,
      time1: tEnd,
      price1: entry,
      confidence: 76,
      category: 'smcDesk',
      color: '#22D3EE',
      lineLabelColor: '#67E8F9',
      labelBackgroundColor: 'rgba(14,116,144,0.85)',
      labelTextColor: '#ECFEFF',
      labelTooltip: ddRule.label,
    });
  }

  return out;
}
