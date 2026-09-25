/**
 * 코인 통계프로파일·1년팩 서버 영속 API.
 * GET → 서버 저장분 반환 · POST → 업서트(로컬과 동기).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import type { AutoTradeCoinKey, CoinExitProfile } from '@/lib/mergedDeskCoinExitProfile';
import type { CachedYearPack } from '@/lib/mergedDeskYearReplayCache';
import {
  readServerCoinExitProfiles,
  readServerYearReplayPacks,
  writeServerCoinExitProfile,
  writeServerYearReplayPack,
} from '@/lib/mergedDeskCoinStatsServerPersist';

export const dynamic = 'force-dynamic';

const COINS: AutoTradeCoinKey[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];

function isCoin(v: unknown): v is AutoTradeCoinKey {
  return typeof v === 'string' && (COINS as string[]).includes(v);
}

export async function GET() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const profiles = await readServerCoinExitProfiles();
  const packs = await readServerYearReplayPacks();
  return NextResponse.json({
    ok: true,
    profiles,
    packs,
    hintKo: '서버 디스크 저장 · 재접속·패치 후에도 유지 · 확정수익 아님',
  });
}

export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    profile?: CoinExitProfile | null;
    coin?: string;
    pack?: CachedYearPack | null;
  };

  const saved: string[] = [];
  if (body.profile && isCoin(body.profile.coin)) {
    await writeServerCoinExitProfile(body.profile);
    saved.push(`profile:${body.profile.coin}`);
  }
  if (isCoin(body.coin) && body.pack && typeof body.pack === 'object') {
    await writeServerYearReplayPack(body.coin, body.pack);
    saved.push(`pack:${body.coin}`);
  }
  if (!saved.length) {
    return NextResponse.json({ ok: false, error: 'profile 또는 pack 필요' }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    saved,
    hintKo: '서버 저장 완료 · 다음 접속부터 재통계 불필요',
  });
}
