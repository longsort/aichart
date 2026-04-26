'use client';

import { useEffect, useRef, useState } from 'react';
import type { Candle, OverlayItem } from '@/types';

/**
 * 호가·체결 기반 고래 구간(strongZoneOverlays): 분석 폴링이 잦아도 면/라벨이 매 응답마다 바뀌지 않도록
 * 최소 간격 + 새 봉(time 변경) 시에만 갱신. 심볼·TF 바뀌면 즉시 동기화.
 */
export function useStableStrongZoneOverlays(
  raw: OverlayItem[] | undefined | null,
  candles: Candle[],
  minRefreshMs: number,
  sceneKey: string
): OverlayItem[] {
  const [stable, setStable] = useState<OverlayItem[]>([]);
  const lastPushAt = useRef(0);
  const lastBarTimeRef = useRef<number | undefined>(undefined);
  const sceneRef = useRef(sceneKey);

  useEffect(() => {
    const zones = raw ?? [];
    const ms = Math.max(500, Math.min(60_000, Number(minRefreshMs) || 4000));

    if (sceneRef.current !== sceneKey) {
      sceneRef.current = sceneKey;
      lastPushAt.current = Date.now();
      lastBarTimeRef.current = candles.length ? Number(candles[candles.length - 1]?.time) : undefined;
      setStable(zones);
      return;
    }

    if (zones.length === 0) {
      setStable([]);
      return;
    }

    const barT = candles.length ? Number(candles[candles.length - 1]?.time) : undefined;
    const barChanged =
      barT !== undefined && lastBarTimeRef.current !== undefined && barT !== lastBarTimeRef.current;
    if (barT !== undefined) lastBarTimeRef.current = barT;

    const now = Date.now();
    const elapsed = now - lastPushAt.current;

    if (barChanged || elapsed >= ms) {
      lastPushAt.current = now;
      setStable(zones);
      return;
    }

    setStable((prev) => (prev.length === 0 ? zones : prev));
  }, [raw, candles, minRefreshMs, sceneKey]);

  return stable;
}
