/**
 * Coverage sidecar 갱신 CLI
 *   npx tsx scripts/eagle1-coverage-refresh.ts --symbol BTCUSDT [--force]
 */
import { refreshCoverageSidecars } from '../lib/eagle1/coverageRefresh';

function parseArgs(argv: string[]) {
  const o = { symbol: 'BTCUSDT', force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol' && argv[i + 1]) o.symbol = String(argv[++i]).toUpperCase();
    else if (a === '--force') o.force = true;
  }
  return o;
}

const opts = parseArgs(process.argv);
const report = refreshCoverageSidecars({ symbol: opts.symbol, force: opts.force });
console.log('[coverage-refresh]', report.summaryKo);
for (const r of report.rows) {
  console.log(`  ${r.tf}: ${r.skipped ? 'skip' : r.wrote ? 'wrote' : 'fail'} · ${r.note}`);
}
if (report.rows.some((r) => !r.ok && !r.skipped)) process.exit(1);
