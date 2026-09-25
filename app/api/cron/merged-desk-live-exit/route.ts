/**
 * GET/POST /api/cron/merged-desk-live-exit
 * 실전 ROE 익절·SL/TP 치유 (가벼움).
 * 진입 스캔은 ?entry=1 일 때만 (기본 OFF — 서버 버벅임 방지).
 */
import { NextRequest, NextResponse } from 'next/server';
import { listServerAutoTradeArmedUsers, readServerAutoTradeArm } from '@/lib/serverMergedDeskAutoTradeStore';
import { readExchangeKeysMeta, readExchangeKeysPlain } from '@/lib/serverExchangeKeysStore';
import { runServerLiveRoeExits } from '@/lib/mergedDeskServerLiveRoeExit';
import { runMergedDeskServerAutoTradeTick } from '@/lib/mergedDeskServerAutoTradeRunner';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = String(
    process.env.TELEGRAM_MULTITF_CRON_SECRET ||
      process.env.INTERNAL_ANALYZE_SECRET ||
      process.env.APP_SESSION_SECRET ||
      ''
  )
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const q = req.nextUrl.searchParams.get('secret') || '';
  return bearer === secret || q === secret;
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const wantEntry =
    req.nextUrl.searchParams.get('entry') === '1' ||
    req.nextUrl.searchParams.get('withEntry') === '1';

  const users = listServerAutoTradeArmedUsers();
  const results: Array<{ user: string; closed: number; healed?: number; notes: string[] }> = [];
  let closedTotal = 0;
  let healedTotal = 0;

  for (const user of users) {
    const arm = readServerAutoTradeArm(user);
    if (!arm.liveArmed) continue;
    const meta = readExchangeKeysMeta(user);
    if (!meta || meta.lastTestOk === false) continue;
    const creds = readExchangeKeysPlain(user);
    if (!creds) continue;

    const r = await runServerLiveRoeExits({
      user,
      creds,
      tp1RoePct: arm.scalpTp1RoePct || 5,
      slRoePct: arm.scalpSlRoePct || 3,
      marginMode: arm.marginMode,
    });
    const g = globalThis as { __alsLastRoeExitAt?: Record<string, number> };
    if (!g.__alsLastRoeExitAt) g.__alsLastRoeExitAt = {};
    g.__alsLastRoeExitAt[user] = Date.now();
    closedTotal += r.closed;
    healedTotal += r.healed || 0;
    results.push({ user, closed: r.closed, healed: r.healed, notes: r.notes });
  }

  let entryTick: unknown = null;
  if (wantEntry) {
    try {
      entryTick = await runMergedDeskServerAutoTradeTick('cron');
    } catch (e) {
      entryTick = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({
    ok: true,
    closedTotal,
    healedTotal,
    armedUsers: users.length,
    results,
    entryTick,
    entryRan: wantEntry,
    noteKo: wantEntry
      ? '익절+진입스캔'
      : '익절·SL치유만 (진입은 별도 루프)',
  });
}
