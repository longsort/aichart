/**
 * Doksuri-1 — 최소 FACT 스냅샷 assert (창작·빈 해시 방지).
 * 실행: npx tsx scripts/assert-doksuri1-fact.ts
 */
import type { Candle } from '../types';
import { buildDoksuri1Pack } from '../lib/doksuri1/buildDoksuri1Pack';

function candle(t: number, c: number, v = 100): Candle {
  return {
    time: t,
    open: c,
    high: c * 1.002,
    low: c * 0.998,
    close: c,
    volume: v,
  };
}

function main() {
  const base = 90000;
  const candles: Candle[] = [];
  for (let i = 0; i < 40; i++) {
    candles.push(candle(1_700_000_000 + i * 900, base + i * 10, 80 + (i % 5) * 20));
  }
  const pack = buildDoksuri1Pack({
    symbol: 'BTCUSDT',
    timeframe: '15m',
    price: base + 390,
    candles,
    dumpZones: [
      {
        sourceTf: '4h',
        sourceTfKo: '4시간',
        bandRole: 'floor',
        mid: base - 500,
        top: base - 200,
        bot: base - 800,
        lifeState: 'BOUNCE_WATCH',
        evidenceScore: 6,
      } as never,
    ],
    srPath: {
      supportPrice: base - 500,
      resistPrice: base + 800,
      bounceLimitPrice: base + 400,
      invalidationPrice: base - 900,
      supportFirm: true,
      resistFirm: false,
      pathKo: '지지 테스트',
      scenarioKo: '반등 관찰',
      tipKo: null,
    } as never,
    enabled: true,
  });
  if (!pack) throw new Error('pack null');
  if (!pack.fact.factHash) throw new Error('missing factHash');
  if (pack.fact.currentPrice <= 0) throw new Error('bad price');
  if (!pack.storyHtml.includes('독수리1호')) throw new Error('story html missing title');
  if (pack.cardKo.headline.length < 4) throw new Error('headline empty');
  console.log('ok', pack.fact.factHash, pack.fact.action, pack.cardKo.headline);
}

main();
