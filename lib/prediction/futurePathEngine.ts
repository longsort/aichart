export type FuturePathItem = {
  path: 'A' | 'B' | 'C';
  direction: 'bullish' | 'bearish' | 'neutral';
  probability: number;
  targets: number[];
  reason: string;
};

export type BeamPathPoint = {
  horizon: 3 | 5 | 8;
  longProb: number;
  shortProb: number;
  expectedPriceLong: number;
  expectedPriceShort: number;
};

export type BeamPathForecast = {
  dominant: 'LONG' | 'SHORT' | 'MIXED';
  confidence: number;
  points: BeamPathPoint[];
};

type FuturePathHint = {
  beamLongProb?: number;
  beamShortProb?: number;
};

export function computeFuturePaths(
  verdict: string,
  lastClose: number,
  equilibrium: number,
  trend: string,
  hint?: FuturePathHint
): FuturePathItem[] {
  const paths: FuturePathItem[] = [];
  const beamLong = Math.max(0, Math.min(100, hint?.beamLongProb ?? 50));
  const beamShort = Math.max(0, Math.min(100, hint?.beamShortProb ?? 50));
  const beamTilt = (beamLong - beamShort) * 0.18;
  if (verdict === 'LONG') {
    const baseA = trend === 'bullish' ? 58 : trend === 'range' ? 52 : 48;
    const baseB = trend === 'range' ? 33 : 30;
    const pA = Math.max(40, Math.min(80, Math.round(baseA + beamTilt)));
    const pB = Math.max(12, Math.min(45, Math.round(baseB - beamTilt * 0.35)));
    const pC = Math.max(8, 100 - pA - pB);
    paths.push({
      path: 'A',
      direction: 'bullish',
      probability: pA,
      targets: [lastClose * 1.01, lastClose * 1.025, lastClose * 1.05],
      reason: `BOS 상승 이어짐 · 롱빔 ${Math.round(beamLong)}%`,
    });
    paths.push({
      path: 'B',
      direction: 'neutral',
      probability: pB,
      targets: [equilibrium, equilibrium * 1.005, lastClose * 1.01],
      reason: '균형선 터치 후 반등',
    });
    paths.push({
      path: 'C',
      direction: 'bearish',
      probability: pC,
      targets: [lastClose * 0.99, equilibrium * 0.995, lastClose * 0.97],
      reason: 'CHOCH 전환',
    });
  } else if (verdict === 'SHORT') {
    const baseA = trend === 'bearish' ? 58 : trend === 'range' ? 52 : 48;
    const baseB = trend === 'range' ? 33 : 30;
    const shortTilt = -beamTilt;
    const pA = Math.max(40, Math.min(80, Math.round(baseA + shortTilt)));
    const pB = Math.max(12, Math.min(45, Math.round(baseB - shortTilt * 0.35)));
    const pC = Math.max(8, 100 - pA - pB);
    paths.push({
      path: 'A',
      direction: 'bearish',
      probability: pA,
      targets: [lastClose * 0.99, lastClose * 0.975, lastClose * 0.95],
      reason: `BOS 하락 이어짐 · 숏빔 ${Math.round(beamShort)}%`,
    });
    paths.push({
      path: 'B',
      direction: 'neutral',
      probability: pB,
      targets: [equilibrium, equilibrium * 0.995, lastClose * 0.99],
      reason: '균형선 터치 후 하락',
    });
    paths.push({
      path: 'C',
      direction: 'bullish',
      probability: pC,
      targets: [lastClose * 1.01, equilibrium * 1.005, lastClose * 1.03],
      reason: 'CHOCH 반전',
    });
  } else {
    paths.push(
      { path: 'A', direction: 'bullish', probability: 40, targets: [lastClose * 1.01, lastClose * 1.02], reason: '상승 이탈' },
      { path: 'B', direction: 'neutral', probability: 40, targets: [equilibrium, equilibrium], reason: '횡보' },
      { path: 'C', direction: 'bearish', probability: 20, targets: [lastClose * 0.99, lastClose * 0.98], reason: '하락 이탈' }
    );
  }
  return paths;
}

export function computeBeamPathForecast(
  lastClose: number,
  atr: number,
  forecasts: Array<{ horizon: number; longProb: number; shortProb: number }>
): BeamPathForecast {
  const points: BeamPathPoint[] = forecasts
    .filter((f) => f.horizon === 3 || f.horizon === 5 || f.horizon === 8)
    .map((f) => {
      const h = f.horizon as 3 | 5 | 8;
      const scale = h === 3 ? 0.85 : h === 5 ? 1.35 : 2.1;
      const longAmp = (f.longProb / 100) * atr * scale;
      const shortAmp = (f.shortProb / 100) * atr * scale;
      return {
        horizon: h,
        longProb: Math.round(f.longProb),
        shortProb: Math.round(f.shortProb),
        expectedPriceLong: lastClose + longAmp,
        expectedPriceShort: lastClose - shortAmp,
      };
    })
    .sort((a, b) => a.horizon - b.horizon);
  const longAvg = points.length ? points.reduce((s, x) => s + x.longProb, 0) / points.length : 0;
  const shortAvg = points.length ? points.reduce((s, x) => s + x.shortProb, 0) / points.length : 0;
  const dominant: BeamPathForecast['dominant'] = longAvg > shortAvg + 4 ? 'LONG' : shortAvg > longAvg + 4 ? 'SHORT' : 'MIXED';
  return {
    dominant,
    confidence: Math.round(Math.max(longAvg, shortAvg)),
    points,
  };
}
