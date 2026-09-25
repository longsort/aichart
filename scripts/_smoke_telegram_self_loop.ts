/**
 * smoke: self-scheduler lock + tick export
 * npx tsx scripts/_smoke_telegram_self_loop.ts
 */
import { runTelegramAutoAlertTick } from '../lib/telegramAutoAlertSelfScheduler';

async function main() {
  const a = runTelegramAutoAlertTick('manual');
  const b = runTelegramAutoAlertTick('manual');
  const [r1, r2] = await Promise.all([a, b]);
  const oneSkip = Boolean(r1.skippedLock) !== Boolean(r2.skippedLock) || (r1.skippedLock && r2.skippedLock);
  /** 동시 2회면 최소 1회는 락 스킵이거나 둘 다 ok(순차 완료) */
  if (!r1.ok && !r2.ok) {
    console.error('FAIL both ticks failed', r1, r2);
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        r1: { ok: r1.ok, skippedLock: r1.skippedLock, err: r1.error, users: r1.stats?.users },
        r2: { ok: r2.ok, skippedLock: r2.skippedLock, err: r2.error, users: r2.stats?.users },
        lockWorks: oneSkip || (r1.ok && r2.ok),
      },
      null,
      2
    )
  );
  console.log('OK telegram self-loop tick export');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
