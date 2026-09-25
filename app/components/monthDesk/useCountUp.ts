'use client';

import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, durationMs = 680): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const from = fromRef.current;
    const start = performance.now();
    const delta = target - from;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = 1 - Math.pow(1 - t, 3);
      const v = from + delta * ease;
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setDisplay(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return display;
}

export function formatCountUp(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '–';
  if (decimals > 0) return n.toFixed(decimals);
  return String(Math.round(n));
}
