'use client';

import { useEffect, useRef, useState } from 'react';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskConfirmDisplay } from '@/lib/monthDeskConfirmDisplay';
import { playMonthDeskChime } from '@/lib/monthDeskGateChime';
import { dispatchMonthDeskChartPulse } from '@/lib/monthDeskChartPulse';

export function useMonthDeskGateFx(
  metrics: MonthDeskBoardMetrics,
  confirmDisplay: MonthDeskConfirmDisplay,
  soundEnabled = true,
  pulseMeta?: { symbol?: string; timeframe?: string }
): { flash: boolean; flashKey: string } {
  const prevGatesRef = useRef<number>(-1);
  const prevPhaseRef = useRef<string>('');
  const [flash, setFlash] = useState(false);
  const [flashKey, setFlashKey] = useState('');

  useEffect(() => {
    const gates = metrics.gatesPassCount ?? 0;
    const prev = prevGatesRef.current;
    if (prev < 0) {
      prevGatesRef.current = gates;
      return;
    }
    if (gates > prev) {
      setFlash(true);
      setFlashKey(`gate-${gates}-${Date.now()}`);
      playMonthDeskChime('gate', soundEnabled);
      dispatchMonthDeskChartPulse({
        kind: 'gate',
        gates,
        symbol: pulseMeta?.symbol,
        timeframe: pulseMeta?.timeframe,
      });
      const t = window.setTimeout(() => setFlash(false), 520);
      prevGatesRef.current = gates;
      return () => window.clearTimeout(t);
    }
    prevGatesRef.current = gates;
  }, [metrics.gatesPassCount, soundEnabled, pulseMeta?.symbol, pulseMeta?.timeframe]);

  useEffect(() => {
    const phase = confirmDisplay.phase;
    const prev = prevPhaseRef.current;
    if (prev && prev !== phase) {
      if (phase === 'confirmed_full' || phase === 'at_entry') {
        playMonthDeskChime('full', soundEnabled);
        dispatchMonthDeskChartPulse({
          kind: 'full',
          gates: metrics.gatesPassCount,
          symbol: pulseMeta?.symbol,
          timeframe: pulseMeta?.timeframe,
        });
        setFlash(true);
        setFlashKey(`phase-${phase}-${Date.now()}`);
        const t = window.setTimeout(() => setFlash(false), 700);
        return () => window.clearTimeout(t);
      }
      if (phase === 'confirmed') {
        playMonthDeskChime('confirm', soundEnabled);
        dispatchMonthDeskChartPulse({
          kind: 'confirm',
          gates: metrics.gatesPassCount,
          symbol: pulseMeta?.symbol,
          timeframe: pulseMeta?.timeframe,
        });
      }
      if (phase === 'invalid') {
        playMonthDeskChime('invalid', soundEnabled);
        dispatchMonthDeskChartPulse({ kind: 'invalid', symbol: pulseMeta?.symbol, timeframe: pulseMeta?.timeframe });
      }
    }
    prevPhaseRef.current = phase;
  }, [confirmDisplay.phase, soundEnabled, metrics.gatesPassCount, pulseMeta?.symbol, pulseMeta?.timeframe]);

  return { flash, flashKey };
}
