/**
 * PM2/crontab — 앱 접속 없이 전코인 15m 수익패턴 감지·자동진입.
 *
 * Authorization: Bearer less-than PROFIT_PATTERN_CRON_SECRET greater-than
 * (없으면 TELEGRAM_MULTITF_CRON_SECRET 사용)
 *
 * crontab 예 (2분마다):
 *   curl -s -X POST -H "Authorization: Bearer SECRET"
 *     http://127.0.0.1:3000/api/cron/profit-pattern-auto
 */
import { NextRequest, NextResponse } from 'next/server';
import { runProfitPatternServerScan } from '@/lib/profitPattern15m/serverRunner';
import { readPpServerArm } from '@/lib/profitPattern15m/serverArm';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorize(req: NextRequest): boolean {
  const expected = (
    process.env.PROFIT_PATTERN_CRON_SECRET ||
    process.env.TELEGRAM_MULTITF_CRON_SECRET ||
    ''
  ).trim();
  if (!expected) return false;
  const bearer =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const hdr =
    req.headers.get('x-profit-pattern-cron-secret')?.trim() ||
    req.headers.get('x-telegram-cron-secret')?.trim() ||
    '';
  return bearer === expected || hdr === expected;
}

async function run(req: NextRequest) {
  const expected = (
    process.env.PROFIT_PATTERN_CRON_SECRET ||
    process.env.TELEGRAM_MULTITF_CRON_SECRET ||
    ''
  ).trim();
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'PROFIT_PATTERN_CRON_SECRET (또는 TELEGRAM_MULTITF_CRON_SECRET) 미설정',
      },
      { status: 503 }
    );
  }
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dryRun =
    req.nextUrl.searchParams.get('dry') === '1' ||
    req.nextUrl.searchParams.get('dryRun') === '1';

  const arm = readPpServerArm();
  const report = await runProfitPatternServerScan({ dryRun });
  return NextResponse.json({
    ok: true,
    dryRun,
    ...report,
    noteKo: [
      '서버 무접속 스캔',
      arm.liveArmed ? 'ARM ON' : 'ARM OFF',
      dryRun ? '드라이런' : '실실행',
    ].join(' · '),
  });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
