import { detectFvgCausal, serializeFvgFrozen } from '@/lib/eagle1/causalFvg';
import { freezePrediction, predictionsEqualFrozen, attachOutcome } from '@/lib/eagle1/predictionSnapshot';
import { chronologicalSplit, rejectShuffledSplit } from '@/lib/eagle1/chronologicalSplit';
import { EAGLE1_ENGINE_VERSION } from '@/lib/eagle1/rawTypes';

export type Eagle1RepaintAudit = {
  passed: boolean;
  confirmedSignalBlocked: boolean;
  failures: string[];
  checks: Record<string, boolean>;
  engine_version: string;
  calculated_at: number;
};

function syntheticCandles(n: number) {
  const out: Array<{ open: number; high: number; low: number; close: number; time: number }> = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    const close = px + ((i % 7) - 3) * 0.4 + (i % 11 === 0 ? 2 : 0);
    const open = px;
    const high = Math.max(open, close) + 0.3;
    const low = Math.min(open, close) - 0.3;
    out.push({ open, high, low, close, time: i * 900 });
    px = close;
  }
  return out;
}

export function runRepaintAudit(candles?: Array<{ high: number; low: number }>): Eagle1RepaintAudit {
  const failures: string[] = [];
  const checks: Record<string, boolean> = {};
  const series = candles && candles.length >= 30 ? candles : syntheticCandles(80);

  const checkpoints = [20, 40, 60].filter((i) => i < series.length - 2);
  let prefixParity = true;
  for (const t of checkpoints) {
    const a = serializeFvgFrozen(detectFvgCausal(series, t + 1));
    const again = serializeFvgFrozen(detectFvgCausal(series, t + 1));
    if (a !== again) {
      prefixParity = false;
      failures.push(`causal FVG not deterministic at t=${t}`);
    }
    const later = detectFvgCausal(series, series.length);
    const pastFrozen = serializeFvgFrozen(later.filter((f) => f.index <= t && f.known_at <= t));
    const liveAtT = serializeFvgFrozen(detectFvgCausal(series, t + 1));
    if (pastFrozen !== liveAtT) {
      prefixParity = false;
      failures.push(`causal FVG past rows changed after future bars at t=${t}`);
    }
  }
  checks.prefix_replay_parity = prefixParity;

  const snap = freezePrediction({
    signal_id: 'audit-1',
    timestamp: 1,
    price: 100,
    timeframe: '15m',
    symbol: 'BTCUSDT',
    features: { rsi: 50 },
    poc: 100,
    zones: [{ id: 'z1', lower: 99, upper: 101 }],
    scores: { long: 1, short: 0, confidence: 10 },
    entry: 100,
    sl: 99,
    tp: [102, 103, 104],
    reasons: ['audit'],
    invalidation: '99',
    direction: 'WAIT',
  });
  const bundled = attachOutcome(snap, { mfe: 1, mae: 0.2, result: 'tp', updated_at: 2 });
  let freezeOk = predictionsEqualFrozen(snap, bundled.prediction) && bundled.prediction.price === 100;
  try {
    (snap as { price: number }).price = 999;
  } catch {
    /* strict freeze */
  }
  if (snap.price !== 100) {
    freezeOk = false;
    failures.push('frozen prediction mutated');
  }
  checks.frozen_prediction = freezeOk;

  const split = chronologicalSplit(100);
  const splitErr = rejectShuffledSplit(split);
  const shuffled = { ...split, train: [...split.train].reverse() };
  const shuffleCaught = rejectShuffledSplit(shuffled) != null;
  checks.chrono_split = !splitErr && shuffleCaught;
  if (splitErr) failures.push(splitErr);
  if (!shuffleCaught) failures.push('shuffled split was not rejected');

  const passed = failures.length === 0;
  return {
    passed,
    confirmedSignalBlocked: !passed,
    failures,
    checks,
    engine_version: EAGLE1_ENGINE_VERSION,
    calculated_at: Date.now(),
  };
}
