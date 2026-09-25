/**
 * GET: 텔레그램 BOT/CHAT 연동 상태 (전송 없음)
 * POST: 코인별 테스트 메시지 1건 (주문 없음)
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { notifyMergedDeskPositionEntry } from '@/lib/mergedDeskLiveEntryTelegram';
import { resolveTapointEntryTf } from '@/lib/eagle1Tapoint/symbolEntryTf';
import {
  DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS,
  type AutoTradeSymbolId,
} from '@/lib/mergedDeskAutoTradeConfig';

export const dynamic = 'force-dynamic';

const COINS = DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS;

function sanitizeEnv(v: string | undefined | null): string {
  return String(v ?? '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
}

function envSnap() {
  const token = sanitizeEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chat = sanitizeEnv(process.env.TELEGRAM_CHAT_ID);
  return {
    hasBot: Boolean(token),
    hasChat: Boolean(chat),
    botMasked: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : null,
    chatId: chat || null,
    configured: Boolean(token && chat),
  };
}

/** 유저별 3초 쿨다운 */
const lastSendAt = new Map<string, number>();

export async function GET() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인 필요' }, { status: 401 });
  }
  const env = envSnap();
  return NextResponse.json({
    ok: true,
    ...env,
    symbols: COINS,
    hintKo: env.configured
      ? 'BOT·CHAT OK · 코인칩으로 테스트전송 가능'
      : 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 서버 env 확인',
  });
}

export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인 필요' }, { status: 401 });
  }

  const env = envSnap();
  if (!env.configured) {
    return NextResponse.json(
      {
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 미설정',
        ...env,
      },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    symbol?: string;
    direction?: string;
    all?: boolean;
  };

  const wantAll = body.all === true;
  const symbols: AutoTradeSymbolId[] = wantAll
    ? [...COINS]
    : (() => {
        const s = String(body.symbol || '').toUpperCase() as AutoTradeSymbolId;
        if ((COINS as readonly string[]).includes(s)) return [s];
        return [];
      })();

  if (!symbols.length) {
    return NextResponse.json(
      { ok: false, error: 'symbol=BTCUSDT… 또는 all=true', symbols: COINS },
      { status: 400 }
    );
  }

  const now = Date.now();
  const prev = lastSendAt.get(auth.user) || 0;
  if (now - prev < 2500) {
    return NextResponse.json(
      { ok: false, error: '잠시 후 재시도 (2.5초 쿨다운)' },
      { status: 429 }
    );
  }
  lastSendAt.set(auth.user, now);

  const direction = body.direction === 'SHORT' ? 'SHORT' : 'LONG';
  const results: Array<{ symbol: string; ok: boolean; error?: string; tf: string }> = [];

  for (const symbol of symbols) {
    const tf = resolveTapointEntryTf(symbol) || '15m';
    const r = await notifyMergedDeskPositionEntry({
      symbol,
      direction,
      price: 1,
      sl: null,
      tp: null,
      size: null,
      marginUsdt: null,
      equityPct: null,
      leverage: null,
      orderId: null,
      source: 'tg-test',
      signalId: `tg-test-${symbol}-${Date.now()}`,
      mode: 'virtual',
      timeframe: tf,
      signalKo: `[TG테스트] ${symbol.replace('USDT', '')} · ${tf} · 주문없음`,
      evidenceKo: `사용자 ${auth.user} · 코인칩 테스트전송 · 진입경로(entry-telegram/notify) 검증`,
      noteKo: '테스트 메시지 · 실주문 아님 · 확정수익 아님',
      analysisTags: ['tg-test', 'tapoint-desk', symbol],
    });
    results.push({
      symbol,
      ok: r.ok,
      error: r.error,
      tf,
    });
    if (wantAll && symbols.indexOf(symbol) < symbols.length - 1) {
      await new Promise((res) => setTimeout(res, 400));
    }
  }

  const okN = results.filter((x) => x.ok).length;
  return NextResponse.json({
    ok: okN === results.length,
    okN,
    failN: results.length - okN,
    results,
    chatId: env.chatId,
    hintKo:
      okN === results.length
        ? `단톡 전송 OK · ${okN}건 · 텔레그램 확인`
        : `일부실패 · OK${okN}/실패${results.length - okN}`,
  });
}
