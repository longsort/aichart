export type FuturePathItem = {
  path: 'A' | 'B' | 'C';
  direction: 'bullish' | 'bearish' | 'neutral';
  probability: number;
  targets: number[];
  reason: string;
};

export function computeFuturePaths(
  verdict: string,
  lastClose: number,
  equilibrium: number,
  trend: string
): FuturePathItem[] {
  const paths: FuturePathItem[] = [];
  if (verdict === 'LONG') {
    paths.push({
      path: 'A',
      direction: 'bullish',
      probability: 55,
      targets: [lastClose * 1.01, lastClose * 1.025, lastClose * 1.05],
      reason: 'BOS 상승 이어짐',
    });
    paths.push({
      path: 'B',
      direction: 'neutral',
      probability: 30,
      targets: [equilibrium, equilibrium * 1.005, lastClose * 1.01],
      reason: '균형선 터치 후 반등',
    });
    paths.push({
      path: 'C',
      direction: 'bearish',
      probability: 15,
      targets: [lastClose * 0.99, equilibrium * 0.995, lastClose * 0.97],
      reason: 'CHOCH 전환',
    });
  } else if (verdict === 'SHORT') {
    paths.push({
      path: 'A',
      direction: 'bearish',
      probability: 55,
      targets: [lastClose * 0.99, lastClose * 0.975, lastClose * 0.95],
      reason: 'BOS 하락 이어짐',
    });
    paths.push({
      path: 'B',
      direction: 'neutral',
      probability: 30,
      targets: [equilibrium, equilibrium * 0.995, lastClose * 0.99],
      reason: '균형선 터치 후 하락',
    });
    paths.push({
      path: 'C',
      direction: 'bullish',
      probability: 15,
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
