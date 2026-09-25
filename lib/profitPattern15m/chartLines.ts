/**
 * 차트용 50x E/SL/TP 가로줄 — 진입 고정값 우선.
 */
import type { ProfitPatternMonitorSignal } from '@/lib/profitPattern15m/liveSignal';
import type { PpLockedLevels } from '@/lib/profitPattern15m/lockedLevels';

export type PpChartLine = {
  title: string;
  price: number;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
};

export function buildProfitPatternChartLines(params: {
  locked?: PpLockedLevels | null;
  monitor?: ProfitPatternMonitorSignal | null;
}): PpChartLine[] {
  const locked = params.locked;
  if (
    locked &&
    locked.entry > 0 &&
    locked.sl > 0 &&
    locked.tp > 0
  ) {
    const eKo = locked.lineEntryKo || '50x고정';
    const sKo = locked.lineSlKo || '50x고정스탑';
    const tKo = locked.lineTpKo || '50x고정목표';
    return [
      { title: eKo, price: locked.entry, color: '#38bdf8', lineWidth: 2 },
      { title: sKo, price: locked.sl, color: '#f87171', lineWidth: 2 },
      { title: tKo, price: locked.tp, color: '#4ade80', lineWidth: 2 },
    ];
  }

  const mon = params.monitor;
  if (
    mon?.status === 'SIGNAL' &&
    mon.entry != null &&
    mon.sl != null &&
    mon.tp != null
  ) {
    return [
      {
        title: mon.lineEntryKo,
        price: mon.entry,
        color: '#38bdf8',
        lineWidth: 2,
      },
      {
        title: mon.lineSlKo,
        price: mon.sl,
        color: '#f87171',
        lineWidth: 2,
      },
      {
        title: mon.lineTpKo,
        price: mon.tp,
        color: '#4ade80',
        lineWidth: 2,
      },
    ];
  }
  return [];
}
