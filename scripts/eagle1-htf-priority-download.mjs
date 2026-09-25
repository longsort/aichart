#!/usr/bin/env node
/**
 * HTF 우선 Bitget CSV 다운로드. 빈 봉 날조 없음. resume 기본.
 *
 *   node scripts/eagle1-htf-priority-download.mjs
 *   node scripts/eagle1-htf-priority-download.mjs --symbol BTCUSDT --dry
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PRIORITY = ['1M', '1W', '1D', '12H', '4H', '1H'];

function parseArgs(argv) {
  const o = { symbol: 'BTCUSDT', dry: false, maxRows: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol' && argv[i + 1]) o.symbol = String(argv[++i]).toUpperCase();
    else if (a === '--dry') o.dry = true;
    else if (a === '--max-rows' && argv[i + 1]) o.maxRows = parseInt(argv[++i], 10) || 0;
  }
  return o;
}

function main() {
  const opts = parseArgs(process.argv);
  const downloader = path.join(ROOT, 'scripts', 'download-bitget-futures-candles.mjs');
  if (!fs.existsSync(downloader)) {
    console.error('missing download-bitget-futures-candles.mjs');
    process.exit(1);
  }

  console.log(`[htf-priority] symbol=${opts.symbol} order=${PRIORITY.join(',')}`);

  for (const g of PRIORITY) {
    const args = [downloader, '--symbol', opts.symbol, '--granularity', g, '--resume'];
    if (opts.maxRows > 0) args.push('--max-rows', String(opts.maxRows));
    console.log(`[htf-priority] → ${g}${opts.dry ? ' (dry)' : ''}`);
    if (opts.dry) continue;
    const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`[htf-priority] failed ${g} exit=${r.status}`);
      process.exit(r.status || 1);
    }
  }

  console.log('[htf-priority] done — HUD HTF HISTORY / runHtfHistoricalStatus 로 상태 확인');
}

main();
