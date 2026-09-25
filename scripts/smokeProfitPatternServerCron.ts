/**
 * 서버 무접속 스캔 드라이런 스모크
 *   npx tsx scripts/smokeProfitPatternServerCron.ts
 */
import { writePpServerArm } from '../lib/profitPattern15m/serverArm';
import { runProfitPatternServerScan } from '../lib/profitPattern15m/serverRunner';

async function main() {
  writePpServerArm({
    liveArmed: true,
    symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT'],
    leverage: 50,
    marginUsdt: 10,
    paperOnly: true,
    updatedBy: 'smoke',
  });
  const report = await runProfitPatternServerScan({ dryRun: true });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
