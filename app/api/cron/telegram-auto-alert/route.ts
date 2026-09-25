import { NextRequest, NextResponse } from 'next/server';
import { assertTelegramCronSecret } from '@/lib/cronRouteAuth';
import { runTelegramAutoAlertTick } from '@/lib/telegramAutoAlertSelfScheduler';

export const dynamic = 'force-dynamic';

/**
 * PM2/crontab — 앱 미접속 서버 자동 텔레그램.
 * Next instrumentation 자체 루프와 동일 엔진(파일 락으로 중복 방지).
 *
 * - `telegramMergedDeskAutoEnabled`(기본 ON): 통합·분석 스윙중투 ENTER·★타점·TP·무효 → PNG+메시지
 * - `telegramMoneyEntryTouchEnabled`: 롱/숏진입·$$$$ 터치
 * - `telegramPrecisionTouchEnabled`: 폭락존·정밀E·빅롱2차 (15m·1h·4h·1d·1w·1M)
 * - `telegramZoneTouchAlertEnabled`: 기관밴드·Hot·안착 터치 (동일 TF)
 * - SFP↑/SFP↓: 1m~1M (요청 TF 15m~1M 포함)
 *
 * `Authorization: Bearer <TELEGRAM_MULTITF_CRON_SECRET>`
 *
 * 크론(선택): `scripts/telegram-auto-alert-run.sh` — 자체 루프가 기본, 크론은 보조
 */
async function runCron(req: NextRequest) {
  const denied = assertTelegramCronSecret(req);
  if (denied) return denied;

  const result = await runTelegramAutoAlertTick('cron');
  return NextResponse.json({
    ok: result.ok,
    skippedLock: result.skippedLock || false,
    ...(result.stats || {}),
    error: result.error,
    note: 'merged+폭락존+기관밴드+SFP · TF 15m·1h·4h·1d·1w·1M · 앱미접속 · self-loop|cron',
  });
}

export async function GET(req: NextRequest) {
  return runCron(req);
}

export async function POST(req: NextRequest) {
  return runCron(req);
}
