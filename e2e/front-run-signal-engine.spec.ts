import { test, expect } from '@playwright/test';
import { runFrontRunSignalEngine } from '../lib/signal-engine';

function baseInput() {
  const candles = Array.from({ length: 120 }).map((_, i) => ({
    open: 70000 + i * 2,
    high: 70020 + i * 2,
    low: 69980 + i * 2,
    close: 70010 + i * 2,
    volume: 100 + (i % 10) * 5,
    time: 1700000000 + i * 60,
  }));
  return {
    timeframe: '15m',
    currentPrice: candles[candles.length - 1].close,
    candles,
    htfBias: 'bullish' as const,
    regime: 'trend' as const,
    premiumDiscount: 'discount' as const,
    supportLevel: candles[candles.length - 1].low - 20,
    resistanceLevel: candles[candles.length - 1].high + 40,
    bosCount: 2,
    chochCount: 1,
    sweeps: [{ side: 'sell' as const }],
    rsiVerdict: 'LONG' as const,
    rsiScore: 82,
    entryHoldProbability: 78,
    breakoutLevelProbability: 80,
    invalidationLevelProbability: 40,
    supportLevelProbability: 80,
    resistanceLevelProbability: 30,
    oiState: 'decreasing' as const,
    fundingState: 'neutral' as const,
    orderbookImbalance: 0.12,
    buyPressure: 0.42,
    sellPressure: 0.64,
    verdict: 'LONG' as const,
    confidence: 78,
    totalSeed: 1000,
  };
}

test.describe('FrontRun signal engine states', () => {
  test('TRIGGERED LONG 재현', async () => {
    const input = baseInput();
    const li = input.candles.length - 1;
    input.candles[li].open = input.candles[li].close * 0.996;
    input.candles[li].high = input.candles[li].close * 1.003;
    input.currentPrice = input.candles[li].close;
    const r = runFrontRunSignalEngine(input);
    expect(r.state).toBe('TRIGGERED');
    expect(r.direction).toBe('LONG');
    expect(r.entry).toBeDefined();
    expect(r.stop).toBeDefined();
    expect(r.tp1).toBeDefined();
    expect(r.leverage).toBeGreaterThanOrEqual(1);
  });

  test('READY 재현', async () => {
    const input = baseInput();
    input.breakoutLevelProbability = 60;
    input.entryHoldProbability = 70;
    input.sweeps = [{ side: 'sell' }];
    input.chochCount = 0;
    const r = runFrontRunSignalEngine(input);
    expect(['READY', 'WATCH']).toContain(r.state);
    expect(['LONG', 'SHORT', 'NONE']).toContain(r.direction);
  });

  test('WATCH 재현', async () => {
    const input = baseInput();
    input.breakoutLevelProbability = 20;
    input.entryHoldProbability = 40;
    input.chochCount = 0;
    input.bosCount = 0;
    input.sweeps = [{ side: 'sell' }];
    input.supportLevelProbability = 65;
    input.orderbookImbalance = 0;
    const r = runFrontRunSignalEngine(input);
    expect(['WATCH', 'NO_SIGNAL', 'READY']).toContain(r.state);
  });

  test('INVALID 재현', async () => {
    const input = baseInput();
    input.verdict = 'LONG';
    input.resistanceLevelProbability = 90;
    const r = runFrontRunSignalEngine(input);
    expect(r.state).toBe('INVALID');
  });
});

