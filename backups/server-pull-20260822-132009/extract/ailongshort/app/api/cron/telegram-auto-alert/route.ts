import { NextRequest, NextResponse } from 'next/server';
import { readAllUserSettingsMap } from '@/lib/serverUserSettings';
import { runTelegramAutoAlertAll } from '@/lib/telegramServerConfirmRunner';
import { assertTelegramCronSecret } from '@/lib/cronRouteAuth';

export const dynamic = 'force-dynamic';

/**
 * PM2/crontab — 앱 미접속 서버 자동 텔레그램.
 *
 * - `telegramMergedDeskAutoEnabled`(기본 ON): 통합·분석 스윙중투 ENTER·★타점·TP·무효 → PNG+메시지
 * - `telegramHqZoneTouchEnabled`: 통합텔레 ON 시 되돌림 존 터치 보조 / OFF시 단독 HQ 모드
 * - `telegramConfirmEnabled` / `telegramMultiTfEnabled`: 레거시 (통합텔레 OFF + HQ OFF일 때만)
 *
 * `Authorization: Bearer <TELEGRAM_MULTITF_CRON_SECRET>`
 *
 * 크론: `scripts/telegram-auto-alert-run.sh` (권장, 2~3분)
 */
async function runCron(req: NextRequest) {
  const denied = assertTelegramCronSecret(req);
  if (denied) return denied;

  const all = await readAllUserSettingsMap();
  const stats = await runTelegramAutoAlertAll(all);

  return NextResponse.json({
    ok: true,
    ...stats,
    note: 'merged=ENTER·타점/TP·무효 · moneyEntry=롱/숏진입·$$$$터치(+PNG) · zoneTouch=기관·Hot·안착 · 앱미접속',
  });
}

export async function GET(req: NextRequest) {
  return runCron(req);
}

export async function POST(req: NextRequest) {
  return runCron(req);
}
