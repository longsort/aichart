import { readBitgetFuturesCsv } from '../lib/bitgetFuturesCsv';
import { buildAiMarketZonePack } from '../lib/aiMarketZone/buildPack';
import { isMergedDeskRequestedVisibleZone } from '../lib/mergedAnalysisDeskVisualCleanup';

async function main() {
  const c = await readBitgetFuturesCsv('BTCUSDT', '4h');
  const p = buildAiMarketZonePack({
    candles: c.slice(-400),
    timeframe: '4h',
    symbol: 'BTCUSDT',
  });
  console.log('zones', p.zones.length, 'ovs', p.overlays.length);
  for (const o of p.overlays.slice(0, 4)) {
    console.log(
      o.id,
      o.kind,
      't',
      o.time1,
      o.time2,
      'p',
      o.price1,
      o.price2,
      'visible',
      isMergedDeskRequestedVisibleZone(o)
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
