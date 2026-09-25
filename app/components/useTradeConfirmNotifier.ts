'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import { buildMonthDeskTradeAction } from '@/lib/monthDeskTradeAction';
import {
  buildTradeConfirmDesk,
  detectConfirmNotifyTransition,
  type ConfirmNotifyKind,
  type ConfirmPhase,
  type TradeConfirmDesk,
} from '@/lib/tradeConfirmDesk';
import { useTradePracticalBundle } from '@/app/components/useTradePracticalBundle';
import type { UIMode } from '@/lib/settings';

export type TradeConfirmAlert = {
  kind: ConfirmNotifyKind;
  title: string;
  body: string;
  at: number;
  desk: TradeConfirmDesk;
};

type Options = {
  analysis: AnalyzeResponse | null;
  candles: Candle[] | null;
  symbol: string;
  timeframe: string;
  alertEnabled?: boolean;
  soundEnabled?: boolean;
  notifyCandidate?: boolean;
  telegramEnabled?: boolean;
  telegramCandidate?: boolean;
  uiMode?: UIMode;
};

export function useTradeConfirmNotifier({
  analysis,
  candles,
  symbol,
  timeframe,
  alertEnabled = true,
  soundEnabled = true,
  notifyCandidate = true,
  telegramEnabled = false,
  telegramCandidate = false,
  uiMode,
}: Options) {
  const { metrics, levels, whale } = useTradePracticalBundle(analysis, candles, symbol, timeframe);
  const ta = useMemo(
    () => buildMonthDeskTradeAction(metrics, levels, whale, analysis),
    [metrics, levels, whale, analysis]
  );
  const desk = useMemo(
    () => buildTradeConfirmDesk(analysis, metrics, levels, ta),
    [analysis, metrics, levels, ta]
  );

  const prevPhaseRef = useRef<ConfirmPhase | null>(null);
  const sentKeysRef = useRef<Set<string>>(new Set());
  const [lastAlert, setLastAlert] = useState<TradeConfirmAlert | null>(null);

  useEffect(() => {
    if (!desk || !analysis) return;

    const transition = detectConfirmNotifyTransition(prevPhaseRef.current, desk);
    prevPhaseRef.current = desk.phase;

    if (!transition) return;
    if (transition === 'candidate' && !notifyCandidate) return;

    const key = desk.notifyKey;
    if (!key || sentKeysRef.current.has(key)) return;
    sentKeysRef.current.add(key);
    if (sentKeysRef.current.size > 80) {
      const arr = [...sentKeysRef.current];
      sentKeysRef.current = new Set(arr.slice(-40));
    }

    setLastAlert({
      kind: transition,
      title: desk.notifyTitle,
      body: desk.notifyBody,
      at: Date.now(),
      desk,
    });

    try {
      if (soundEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        const pattern =
          transition === 'confirmed_full' || transition === 'at_entry'
            ? [200, 80, 200, 80, 280]
            : transition === 'confirmed'
              ? [180, 100, 220]
              : transition === 'invalid'
                ? [120, 60, 120]
                : [100];
        navigator.vibrate(pattern);
      }
    } catch {}

    if (soundEnabled) {
      try {
        const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
          || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const beep = (t: number, d: number, f: number, g: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = f;
            gain.gain.value = g;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + d);
          };
          if (transition === 'confirmed_full' || transition === 'at_entry') {
            beep(0, 0.12, 880, 0.07);
            beep(0.16, 0.14, 1180, 0.08);
            beep(0.34, 0.16, 1320, 0.07);
          } else if (transition === 'confirmed') {
            beep(0, 0.14, 920, 0.06);
            beep(0.2, 0.12, 1100, 0.07);
          } else {
            beep(0, 0.1, 760, 0.05);
          }
          setTimeout(() => {
            try {
              void ctx.close();
            } catch {}
          }, 600);
        }
      } catch {}
    }

    if (alertEnabled) {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const show = () => {
          try {
            new Notification(desk.notifyTitle, { body: desk.notifyBody, tag: key });
          } catch {}
        };
        if (Notification.permission === 'granted') show();
        else if (Notification.permission === 'default') {
          void Notification.requestPermission().then((p) => {
            if (p === 'granted') show();
          });
        }
      }
    } catch {}
    }

    // Telegram push is moved to realtime flash alert channel only.
    void telegramEnabled;
    void telegramCandidate;
    void uiMode;
  }, [desk, analysis, alertEnabled, soundEnabled, notifyCandidate, symbol, timeframe, ta, telegramEnabled, telegramCandidate, uiMode]);

  const dismissAlert = () => setLastAlert(null);

  return { desk, ta, metrics, levels, whale, lastAlert, dismissAlert };
}
