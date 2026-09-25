/**
 * 통합·분석 — 종가·스윙 ENTER를 **캔들 본체 색**으로 작도 (글자 카드 아님).
 * MonthDesk settle paint 셀 형식 재사용 → ChartView sparkle 경로.
 */
import type { Candle } from '@/types';
import type { MonthDeskSettleCandleCell } from '@/lib/monthDeskSettleCandlePaint';
import {
  chartTfToCloseSettleTf,
  findCloseSettleRow,
  type TfCloseSettleBoard,
  type TfCloseSettleRow,
} from '@/lib/tfCloseSettleAssessment';
import type { SwingMidEntryPack } from '@/lib/mergedDeskSwingMidEntry';

function put(
  m: Map<number, MonthDeskSettleCandleCell>,
  candles: Candle[],
  idx: number,
  phase: MonthDeskSettleCandleCell['phase'],
  bias: 'bullish' | 'bearish'
) {
  if (idx < 0 || idx >= candles.length) return;
  const t = Number(candles[idx]?.time);
  if (!Number.isFinite(t)) return;
  const prev = m.get(t);
  const rank = (p: MonthDeskSettleCandleCell['phase']) => {
    switch (p) {
      case 'failed':
        return 0;
      case 'breakoutWeak':
        return 1;
      case 'breakout':
        return 2;
      case 'retest':
        return 3;
      case 'settling':
        return 4;
      case 'confirmed':
        return 5;
      default:
        return 0;
    }
  };
  if (!prev || rank(phase) >= rank(prev.phase)) {
    m.set(t, { phase, bias });
  }
}

function paintFromSettleRow(
  out: Map<number, MonthDeskSettleCandleCell>,
  candles: Candle[],
  row: TfCloseSettleRow
) {
  const n = candles.length;
  if (n < 2) return;

  /** 직전 마감봉 = n-2, 진행봉 = n-1 (보드 prior/forming과 동일 관점) */
  const priorIdx = n - 2;
  const formIdx = n - 1;

  const sealedBias: 'bullish' | 'bearish' | null =
    row.confirmedEdge === '롱 유리'
      ? 'bullish'
      : row.confirmedEdge === '숏 유리'
        ? 'bearish'
        : row.tailongTag === '종가안착' && row.vsPriorClose !== '아래'
          ? 'bullish'
          : row.tailongTag === '종가안착' && row.vsPriorClose === '아래'
            ? 'bearish'
            : null;

  if (row.tailongTag === '꼬리실패') {
    put(out, candles, priorIdx, 'failed', sealedBias ?? 'bullish');
  } else if (sealedBias) {
    put(
      out,
      candles,
      priorIdx,
      row.tailongTag === '종가안착' ? 'confirmed' : 'settling',
      sealedBias
    );
  }

  if (row.formingVerdict === '실패' || row.tailongTag === '꼬리실패') {
    put(out, candles, formIdx, 'failed', sealedBias ?? 'bearish');
  } else if (row.formingVerdict === '안착') {
    const formBias: 'bullish' | 'bearish' =
      row.vsPriorClose === '아래' ? 'bearish' : 'bullish';
    put(out, candles, formIdx, 'settling', formBias);
  } else if (row.formingVerdict === '불안') {
    put(out, candles, formIdx, 'breakoutWeak', sealedBias ?? 'bullish');
  }
}

/**
 * 스윙·종가 보드 → 캔들 색 맵.
 */
export function collectMergedDeskSwingSettleCandlePaint(params: {
  candles: Candle[];
  timeframe: string;
  settleBoard?: TfCloseSettleBoard | null;
  swingMid?: SwingMidEntryPack | null;
}): Map<number, MonthDeskSettleCandleCell> {
  const out = new Map<number, MonthDeskSettleCandleCell>();
  const candles = params.candles;
  if (candles.length < 4) return out;

  const settleTf = chartTfToCloseSettleTf(params.timeframe);
  const row = settleTf ? findCloseSettleRow(params.settleBoard, settleTf) : null;
  if (row) paintFromSettleRow(out, candles, row);

  const swing = params.swingMid;
  if (!swing || swing.side === 'WAIT') return out;

  const n = candles.length;
  const bias: 'bullish' | 'bearish' = swing.side === 'LONG' ? 'bullish' : 'bearish';

  if (swing.stance === 'ENTER_LONG' || swing.stance === 'ENTER_SHORT') {
    put(out, candles, n - 1, 'confirmed', bias);
    put(out, candles, n - 2, 'settling', bias);
    if (n >= 3) put(out, candles, n - 3, 'retest', bias);
  } else if (swing.stance === 'WAIT_PULLBACK') {
    if (swing.settleEnterAllowed === false) {
      put(out, candles, n - 1, 'breakoutWeak', bias);
    } else {
      put(out, candles, n - 1, 'settling', bias);
    }
  } else if (swing.settleEnterAllowed === false) {
    put(out, candles, n - 1, 'failed', bias);
  }

  return out;
}
