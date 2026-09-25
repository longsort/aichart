/**
 * GET/POST /api/merged-desk/coin-skill-risk
 * 스킬창 코인별 레버·비중·TP/SL 저장 · 서버 타점 자동매매 연동.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import type { AutoTradeCoinKey } from '@/lib/mergedDeskCoinExitProfile';
import {
  defaultCoinSkillRisk,
  listCoinSkillRiskCoins,
  normalizeCoinSkillRisk,
  type CoinSkillRisk,
  type CoinSkillRiskMap,
} from '@/lib/mergedDeskCoinSkillRisk';
import {
  readServerCoinSkillRiskMap,
  writeServerCoinSkillRisk,
  writeServerCoinSkillRiskMap,
} from '@/lib/serverCoinSkillRiskStore';

export const dynamic = 'force-dynamic';

const COINS = listCoinSkillRiskCoins();

function isCoin(v: unknown): v is AutoTradeCoinKey {
  return typeof v === 'string' && (COINS as string[]).includes(v);
}

export async function GET() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const saved = readServerCoinSkillRiskMap(auth.user);
  const risks: CoinSkillRiskMap = {};
  for (const c of COINS) {
    risks[c] = saved[c] ? normalizeCoinSkillRisk(c, saved[c]) : defaultCoinSkillRisk(c);
  }
  return NextResponse.json({
    ok: true,
    risks,
    hintKo: '스킬창 저장값 · 타점 자동매매 적용 · 확정수익 아님',
  });
}

export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    risk?: Partial<CoinSkillRisk> | null;
    risks?: CoinSkillRiskMap | null;
  };

  if (body.risks && typeof body.risks === 'object') {
    const cleaned: CoinSkillRiskMap = {};
    for (const c of COINS) {
      if (body.risks[c]) cleaned[c] = normalizeCoinSkillRisk(c, body.risks[c]);
    }
    const saved = writeServerCoinSkillRiskMap(auth.user, cleaned);
    return NextResponse.json({
      ok: true,
      risks: saved,
      hintKo: '코인 리스크 일괄 저장 · 서버타점 적용',
    });
  }

  if (body.risk && isCoin(body.risk.coin)) {
    const saved = writeServerCoinSkillRisk(
      auth.user,
      normalizeCoinSkillRisk(body.risk.coin, body.risk)
    );
    return NextResponse.json({
      ok: true,
      risk: saved,
      hintKo: `${saved.coin} 리스크 저장 · ${saved.leverage}x · 비중${saved.equityPct}%`,
    });
  }

  return NextResponse.json({ ok: false, error: 'risk 또는 risks 필요' }, { status: 400 });
}
