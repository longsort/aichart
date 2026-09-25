import { readBitgetFuturesCsv } from '../lib/bitgetFuturesCsv';
import { computeAmzStatsFromCandles } from '../lib/aiMarketZone/statsEngine';
import { buildAiMarketZonePack } from '../lib/aiMarketZone/buildPack';

async function main() {
  const candles = await readBitgetFuturesCsv('BTCUSDT', '4h');
  const slice = candles.slice(-400);
  const stats = computeAmzStatsFromCandles({
    symbol: 'BTCUSDT',
    timeframe: '4h',
    candles: slice,
    stride: 4,
    maxSteps: 30,
  });
  const t0 = Date.now();
  const pack = buildAiMarketZonePack({
    candles: slice,
    timeframe: '4h',
    symbol: 'BTCUSDT',
    stats,
  });
  const t1 = Date.now();
  const pack2 = buildAiMarketZonePack({
    candles: slice,
    timeframe: '4h',
    symbol: 'BTCUSDT',
    stats,
  });
  const t2 = Date.now();
  console.log('zones', pack.zones.length, 'overlays', pack.overlays.length, 'priceLines', pack.priceLines?.length);
  console.log('buildMs', t1 - t0, 'cacheMs', t2 - t1);
  console.log('validation', pack.liveValidation?.summaryKo);
  console.log('face', pack.overlays[0]?.zoneFaceBase, pack.overlays[0]?.zoneFaceSignal);
  console.log('pl', pack.priceLines?.slice(0, 3));
  console.log('same cache?', pack === pack2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
