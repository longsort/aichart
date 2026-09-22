/**
 * GET/POST 타점엔진 결정 — 기존 analyze와 별도.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { runTapointOrchestrator } from '@/lib/eagle1Tapoint/orchestrator';
import { TAPOINT_SYMBOLS } from '@/lib/eagle1Tapoint/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const symbol = String(req.nextUrl.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = String(req.nextUrl.searchParams.get('timeframe') || '15m');
  if (!(TAPOINT_SYMBOLS as readonly string[]).includes(symbol) && !symbol.endsWith('USDT')) {
    return NextResponse.json({ ok: false, error: '심볼 불가' }, { status: 400 });
  }

  try {
    const { candles } = await loadBitgetFuturesChartCandles(symbol, timeframe, {
      recentOnly: true,
    });
    const report = runTapointOrchestrator({
      symbol,
      timeframe,
      candles: candles || [],
      qualityOk: (candles?.length || 0) >= 64,
      setupSources: ['eagle1-pipeline'],
    });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'scan fail' },
      { status: 500 }
    );
  }
}
