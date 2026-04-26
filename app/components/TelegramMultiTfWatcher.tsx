'use client';

import { useEffect, useRef } from 'react';
import { defaultSettings, loadSettings } from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';
import { buildTelegramMultiTfPairList } from '@/lib/telegramMultiTfPairList';
import { buildTelegramBackgroundAnalyzeUrl } from '@/lib/telegramBackgroundAnalyzeQuery';
import { evaluateBackgroundHtfTelegram } from '@/lib/telegramBackgroundHtfEval';
import { telegramEventDedupTry } from '@/lib/telegramEventDedup';
import { getTelegramSignalAuthHeaders } from '@/lib/telegramSignalAuthClient';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import type { AnalyzeResponse } from '@/types';

/**
 * 앱이 켜져 있을 때만 동작(보조). **24시간·접속 끊김** 대비는 서버 crontab → `/api/cron/telegram-multi-tf` 사용.
 */
export function TelegramMultiTfWatcher() {
  const runBusyRef = useRef(false);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const runLoop = async () => {
      if (runBusyRef.current) return;
      const st = loadSettings();
      if (!st.telegramMultiTfEnabled) return;
      const syms = st.telegramMultiTfSymbols?.length
        ? st.telegramMultiTfSymbols
        : defaultSettings.telegramMultiTfSymbols;
      const tfs = st.telegramMultiTfTimeframes?.length
        ? st.telegramMultiTfTimeframes
        : defaultSettings.telegramMultiTfTimeframes;
      const pairs = buildTelegramMultiTfPairList(syms, tfs);
      if (pairs.length === 0) return;
      runBusyRef.current = true;
      try {
        for (const [symbol, timeframe] of pairs) {
          const url = buildTelegramBackgroundAnalyzeUrl(symbol, timeframe, 'WHALE');
          const res = await fetchWithRetry(
            url,
            { cache: 'no-store', credentials: 'same-origin' },
            1
          );
          if (!res.ok) continue;
          const analysis = (await res.json().catch(() => null)) as AnalyzeResponse | null;
          if (!analysis?.symbol) continue;
          const nextSt = loadSettings();
          if (!nextSt.telegramMultiTfEnabled) return;
          const ev = evaluateBackgroundHtfTelegram(analysis, symbol, timeframe, nextSt);
          if (!ev) continue;
          if (!telegramEventDedupTry(ev.eventKey, ev.cooldownMs)) continue;
          const authH = await getTelegramSignalAuthHeaders();
          await fetch('/api/telegram/signal-capture', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...authH },
            body: JSON.stringify({
              text: ev.fullBrief,
              imageDataUrl: '',
              symbol,
              timeframe,
              eventKey: ev.eventKey,
            }),
          });
        }
      } finally {
        runBusyRef.current = false;
      }
    };

    const plan = () => {
      if (intervalIdRef.current != null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      const s = loadSettings();
      if (!s.telegramMultiTfEnabled) return;
      const sec = Math.max(30, Math.min(600, Math.floor(s.telegramMultiTfIntervalSec ?? 120)));
      intervalIdRef.current = setInterval(() => {
        void runLoop();
      }, sec * 1000);
    };

    plan();
    if (loadSettings().telegramMultiTfEnabled) {
      setTimeout(() => {
        void runLoop();
      }, 2500);
    }

    const onChange = () => {
      plan();
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onChange);
      if (intervalIdRef.current != null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, []);

  return null;
}
