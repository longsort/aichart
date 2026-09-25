/**
 * Bitget BTCUSDT.P 고래 거래량 카탈로그 빌드 (CSV → JSON)
 *
 *   npx tsx scripts/build-bitget-whale-volume-catalog.ts --symbol BTCUSDT --all-tf
 *   npx tsx scripts/build-bitget-whale-volume-catalog.ts --symbol BTCUSDT --tf 15m
 */
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import {
  BITGET_WHALE_CATALOG_TFS,
  buildBitgetWhaleVolumeCatalog,
} from '@/lib/bitgetWhaleVolumeCatalog';
import { writeBitgetWhaleVolumeCatalog, bitgetWhaleCatalogPath } from '@/lib/bitgetWhaleVolumeCatalogStore';
import { normalizeChartTimeframe } from '@/lib/constants';

function parseArgs(argv: string[]) {
  let symbol = 'BTCUSDT';
  let tf: string | null = null;
  let allTf = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol' && argv[i + 1]) symbol = String(argv[++i]).toUpperCase();
    else if (a === '--tf' && argv[i + 1]) tf = normalizeChartTimeframe(argv[++i]);
    else if (a === '--all-tf') allTf = true;
    else if (a === '--help' || a === '-h') {
      console.log(`
Usage:
  npx tsx scripts/build-bitget-whale-volume-catalog.ts --symbol BTCUSDT --all-tf
  npx tsx scripts/build-bitget-whale-volume-catalog.ts --symbol BTCUSDT --tf 15m
`);
      process.exit(0);
    }
  }
  return { symbol, tf, allTf };
}

async function buildOne(symbol: string, timeframe: string) {
  const candles = await readBitgetFuturesCsv(symbol, timeframe);
  if (candles.length < 80) {
    console.error(`[skip] ${timeframe}: candles ${candles.length} (<80)`);
    return null;
  }
  const catalog = buildBitgetWhaleVolumeCatalog({ symbol, timeframe, candles });
  const fp = await writeBitgetWhaleVolumeCatalog(catalog);
  console.error(
    `[ok] ${timeframe}: bars=${catalog.totalBars} events=${catalog.eventCount} buckets=${catalog.buckets.length} → ${fp}`
  );
  const top = catalog.buckets.slice(0, 3);
  for (const b of top) {
    console.error(`  · ${b.labelKo} n=${b.sampleCount} L${b.longPct}% S${b.shortPct}%`);
  }
  return catalog;
}

async function main() {
  const { symbol, tf, allTf } = parseArgs(process.argv);
  const tfs = allTf ? [...BITGET_WHALE_CATALOG_TFS] : tf ? [tf] : ['15m'];
  for (const t of tfs) {
    await buildOne(symbol, t);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
