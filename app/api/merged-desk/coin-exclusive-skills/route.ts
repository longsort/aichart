/**
 * GET/POST /api/merged-desk/coin-exclusive-skills
 * 코인 전용 스킬 슬롯 저장.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import type { AutoTradeCoinKey } from '@/lib/mergedDeskCoinExitProfile';
import {
  defaultExclusiveState,
  listExclusiveSkillsForCoin,
  normalizeExclusiveState,
  type CoinExclusiveSkillMap,
  type CoinExclusiveSkillState,
} from '@/lib/mergedDeskCoinExclusiveSkills';
import {
  readServerExclusiveSkillMap,
  writeServerExclusiveSkillMap,
  writeServerExclusiveSkills,
} from '@/lib/serverCoinExclusiveSkillsStore';

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
  const saved = readServerExclusiveSkillMap(auth.user);
  const skills: CoinExclusiveSkillMap = {};
  const catalog: Record<string, ReturnType<typeof listExclusiveSkillsForCoin>> = {};
  for (const c of COINS) {
    skills[c] = saved[c]
      ? normalizeExclusiveState(c, saved[c])
      : defaultExclusiveState(c);
    catalog[c] = listExclusiveSkillsForCoin(c);
  }
  return NextResponse.json({
    ok: true,
    skills,
    catalog,
    hintKo: '코인 전용 스킬 ON/OFF · 상위스윕필터 포함 · 확정수익 아님',
  });
}

export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    coin?: string;
    state?: CoinExclusiveSkillState | null;
    skills?: CoinExclusiveSkillMap | null;
  };

  if (body.skills && typeof body.skills === 'object') {
    const cleaned: CoinExclusiveSkillMap = {};
    for (const c of COINS) {
      if (body.skills[c]) cleaned[c] = normalizeExclusiveState(c, body.skills[c]);
    }
    const saved = writeServerExclusiveSkillMap(auth.user, cleaned);
    return NextResponse.json({ ok: true, skills: saved, hintKo: '전용스킬 일괄저장' });
  }

  if (isCoin(body.coin) && body.state && typeof body.state === 'object') {
    const saved = writeServerExclusiveSkills(
      auth.user,
      body.coin,
      normalizeExclusiveState(body.coin, body.state)
    );
    return NextResponse.json({
      ok: true,
      coin: body.coin,
      state: saved,
      hintKo: `${body.coin} 전용스킬 저장`,
    });
  }

  return NextResponse.json({ ok: false, error: 'coin+state 또는 skills 필요' }, { status: 400 });
}
