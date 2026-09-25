/**
 * POST /api/merged-desk/server-arm
 * 브라우저 실전 ON/OFF → 서버 ARM 파일 동기화 (창 꺼도 ROE익절·진입 틱 동작).
 * GET: ARM·최근틱·API키 점검 요약 (주문 없음).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import {
  writeServerAutoTradeArm,
  readServerAutoTradeArm,
  readServerPositionEntryMemos,
  type ServerAutoTradeArm,
} from '@/lib/serverMergedDeskAutoTradeStore';
import { readExchangeKeysMeta } from '@/lib/serverExchangeKeysStore';
import {
  AUTO_TRADE_MAX_CONCURRENT,
  DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS,
  FAST_SL_ROE_PCT,
  FAST_TP1_ROE_PCT,
  type AutoTradeSymbolId,
} from '@/lib/mergedDeskAutoTradeConfig';

export const dynamic = 'force-dynamic';

function tickAgeSec(at: number | null | undefined): number | null {
  if (at == null || !(at > 0)) return null;
  return Math.max(0, Math.round((Date.now() - at) / 1000));
}

function buildHealthKo(params: {
  liveArmed: boolean;
  tapOnly: boolean;
  chips: string[];
  lastStatusKo: string | null;
  tickAgeSec: number | null;
  keysOk: boolean | null;
}): string {
  const arm = params.liveArmed ? '서버ARM ON' : '서버ARM OFF';
  const mode = params.tapOnly ? '타점전용' : 'Dual포함';
  const chips =
    params.chips.length > 0
      ? params.chips.map((s) => s.replace('USDT', '')).join(',')
      : '칩없음';
  const tick =
    params.tickAgeSec == null
      ? '틱기록없음'
      : params.tickAgeSec < 180
        ? `틱 ${params.tickAgeSec}초전`
        : params.tickAgeSec < 900
          ? `틱 ${Math.round(params.tickAgeSec / 60)}분전·느림`
          : `틱 ${Math.round(params.tickAgeSec / 60)}분전·멈춤의심`;
  const keys =
    params.keysOk === true
      ? '키OK'
      : params.keysOk === false
        ? '키실패'
        : '키미등록';
  const st = params.lastStatusKo ? ` · ${params.lastStatusKo.slice(0, 48)}` : '';
  return `${arm} · ${mode} · ${chips} · ${tick} · ${keys}${st}`;
}

export async function GET() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인 필요' }, { status: 401 });
  const arm = readServerAutoTradeArm(auth.user);
  const meta = readExchangeKeysMeta(auth.user);
  const keysOk = !meta
    ? null
    : meta.lastTestOk === true
      ? true
      : meta.lastTestOk === false
        ? false
        : null;
  const age = tickAgeSec(arm.lastTickAt);
  const healthKo = buildHealthKo({
    liveArmed: arm.liveArmed,
    tapOnly: arm.tapOnly !== false,
    chips: arm.enabledSymbols || [],
    lastStatusKo: arm.lastStatusKo || null,
    tickAgeSec: age,
    keysOk,
  });
  const serverEntryReady =
    arm.liveArmed === true && keysOk === true && (arm.enabledSymbols?.length || 0) > 0;
  return NextResponse.json({
    ok: true,
    arm,
    entryMemos: readServerPositionEntryMemos(auth.user),
    keys: meta
      ? {
          hasKeys: true,
          apiKeyMasked: meta.apiKeyMasked || null,
          lastTestOk: meta.lastTestOk,
          lastTestAt: meta.lastTestAt ?? null,
          lastTestMsg: meta.lastTestMsg || null,
        }
      : {
          hasKeys: false,
          apiKeyMasked: null,
          lastTestOk: null,
          lastTestAt: null,
          lastTestMsg: null,
        },
    tickAgeSec: age,
    healthKo,
    serverEntryReady,
    noteKo: serverEntryReady
      ? '앱 꺼도 서버가 타점 스캔·진입 가능(조건 충족 시)'
      : '서버 무접속 진입 불가 · ARM·키·칩 확인',
  });
}

export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인 필요' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const liveArmed = body.liveArmed === true;
  const symbols = Array.isArray(body.enabledSymbols)
    ? (body.enabledSymbols as AutoTradeSymbolId[])
    : [...DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS];

  /** lastTickAt/lastStatusKo는 서버 틱만 갱신 — 동기화로 덮어쓰지 않음 */
  const patch: Partial<ServerAutoTradeArm> = {
    liveArmed,
    enabledSymbols: symbols,
    leverage: Math.max(1, Math.min(125, Number(body.leverage) || 10)),
    marginMode: body.marginMode === 'crossed' ? 'crossed' : 'isolated',
    sizeMode: body.sizeMode === 'fixedUsdt' ? 'fixedUsdt' : 'equityPct',
    scalpEquityPct: Math.max(0.5, Math.min(100, Number(body.scalpEquityPct) || 5)),
    doksuriEquityPct: Math.max(0.5, Math.min(100, Number(body.doksuriEquityPct) || 5)),
    marginUsdt: Math.max(1, Math.min(50000, Number(body.marginUsdt) || 20)),
    strategyScalp: body.strategyScalp !== false,
    strategyDoksuri1: body.strategyDoksuri1 !== false,
    minRr: Math.max(1, Math.min(3, Number(body.minRr) || 1.2)),
    maxConcurrent: Math.max(
      1,
      Math.min(AUTO_TRADE_MAX_CONCURRENT, Number(body.maxConcurrent) || AUTO_TRADE_MAX_CONCURRENT)
    ),
    scalpTp1RoePct: Math.max(
      1,
      Math.min(100, Number(body.scalpTp1RoePct) || FAST_TP1_ROE_PCT)
    ),
    scalpSlRoePct: Math.max(
      1,
      Math.min(100, Number(body.scalpSlRoePct) || FAST_SL_ROE_PCT)
    ),
    tapOnly: body.tapOnly !== false,
  };

  const arm = writeServerAutoTradeArm(auth.user, patch);
  return NextResponse.json({
    ok: true,
    arm,
    msg: liveArmed
      ? '서버 ARM ON · 폰·PC 꺼도 진입·ROE익절 활성'
      : '서버 ARM OFF',
  });
}
