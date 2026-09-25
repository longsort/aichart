import { readBitgetFuturesCsv } from '../lib/bitgetFuturesCsv';
import { computeAmzStatsFromCandles } from '../lib/aiMarketZone/statsEngine';
import { buildAiMarketZonePack } from '../lib/aiMarketZone/buildPack';

async function main() {
  const candles = await readBitgetFuturesCsv('BTCUSDT', '4h');
  console.log('candles', candles.length);
  const slice = candles.slice(-400);
  const stats = computeAmzStatsFromCandles({
    symbol: 'BTCUSDT',
    timeframe: '4h',
    candles: slice,
    stride: 4,
    maxSteps: 40,
  });
  console.log(
    'events',
    stats.eventCount,
    'mlCases',
    stats.mlCases.length,
    'lowTrust',
    stats.sampleLowTrust
  );
  const pack = buildAiMarketZonePack({
    candles: slice,
    timeframe: '4h',
    symbol: 'BTCUSDT',
    stats,
  });
  console.log('status', pack.statusKo, 'zones', pack.zones.length);
  const z = pack.zones[0];
  if (z) {
    console.log('prob', JSON.stringify(z.probabilities));
    console.log('explain', z.explainKo.slice(-3));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
