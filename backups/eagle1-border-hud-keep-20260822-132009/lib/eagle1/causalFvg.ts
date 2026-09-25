/**
 * Causal FVG — only candles in [0, endExclusive).
 * Mitigation may use bars after formation that are already known.
 */
export type Eagle1CausalFvg = {
  bias: 'bullish' | 'bearish';
  index: number;
  low: number;
  high: number;
  valid: boolean;
  known_at: number;
};

export function detectFvgCausal(
  candles: Array<{ high: number; low: number }>,
  endExclusive: number
): Eagle1CausalFvg[] {
  const n = Math.max(0, Math.min(candles.length, Math.floor(endExclusive)));
  const fvg: Eagle1CausalFvg[] = [];
  const overlaps = (c: { high: number; low: number }, lo: number, hi: number) =>
    c.low <= hi && c.high >= lo;
  for (let i = 2; i < n; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];
    if (c1.high < c3.low) {
      const gapLo = c1.high;
      const gapHi = c3.low;
      let mitigated = false;
      for (let j = i + 1; j < n; j++) {
        if (overlaps(candles[j], gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      fvg.push({ bias: 'bullish', index: i, low: gapLo, high: gapHi, valid: !mitigated, known_at: i });
    }
    if (c1.low > c3.high) {
      const gapLo = c3.high;
      const gapHi = c1.low;
      let mitigated = false;
      for (let j = i + 1; j < n; j++) {
        if (overlaps(candles[j], gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      fvg.push({ bias: 'bearish', index: i, low: gapLo, high: gapHi, valid: !mitigated, known_at: i });
    }
  }
  return fvg;
}

/** Hindsight: mitigation uses the full series (repaint of historical valid). */
export function detectFvgHindsight(candles: Array<{ high: number; low: number }>): Eagle1CausalFvg[] {
  return detectFvgCausal(candles, candles.length);
}

export function serializeFvgFrozen(rows: Eagle1CausalFvg[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      bias: r.bias,
      index: r.index,
      low: r.low,
      high: r.high,
      known_at: r.known_at,
    }))
  );
}
