/**
 * GET/POST 타점엔진 결정 — 기존 analyze와 별도.
 * 볼륨폭발 감지는 5m·15m 별도 로드.
 * P2: MACRO HTF(1M/1W/1D/4H/1H) 병렬 로드.
 * 다수 유저: 심볼·TF 공용 캐시·inflight 공유(개인키·주문과 분리).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { runTapointOrchestrator } from '@/lib/eagle1Tapoint/orchestrator';
import { loadTapointHtfMacroCandles } from '@/lib/eagle1Tapoint/htfCandleLoader';
import { TAPOINT_SYMBOLS } from '@/lib/eagle1Tapoint/types';
import { runTapointDecideShared } from '@/lib/serverTapointDecideShare';
import { evaluateTapointCandleQuality } from '@/lib/eagle1Tapoint/tapointQualityRepaintGate';
import { loadTapSetupSourceHints } from '@/lib/eagle1Tapoint/setupSourceBridge.server';

export const dynamic = 'force-dynamic';

async function buildReport(symbol: string, timeframe: string) {
  const [{ candles }, c5, c15, htf] = await Promise.all([
    loadBitgetFuturesChartCandles(symbol, timeframe, { recentOnly: true }),
    loadBitgetFuturesChartCandles(symbol, '5m', { recentOnly: true }).catch(() => ({
      candles: [] as Awaited<ReturnType<typeof loadBitgetFuturesChartCandles>>['candles'],
    })),
    loadBitgetFuturesChartCandles(symbol, '15m', { recentOnly: true }).catch(() => ({
      candles: [] as Awaited<ReturnType<typeof loadBitgetFuturesChartCandles>>['candles'],
    })),
    loadTapointHtfMacroCandles(symbol),
  ]);
  const rows = candles || [];
  const q = evaluateTapointCandleQuality({
    symbol,
    timeframe,
    candles: rows,
    minBars: 64,
  });
  const dual = loadTapSetupSourceHints(symbol);
  return runTapointOrchestrator({
    symbol,
    timeframe,
    candles: rows,
    dailyCandles: htf.dailyCandles || [],
    weeklyCandles: htf.weeklyCandles || [],
    monthlyCandles: htf.monthlyCandles || [],
    macroCandles: htf.pack,
    candles5m: c5.candles || [],
    candles15m: c15.candles || [],
    qualityOk: q.qualityOk,
    qualityNoteKo: q.noteKo,
    setupSources: [
      'eagle1-pipeline',
      'adv-volume',
      'daily-face',
      'vol-burst-5m15m',
      'p2-macro-htf',
      'quality-repaint-gate',
      ...dual.sources,
    ],
    setupHint: dual.setupHint,
  });
}

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
    const { report, cacheHit } = await runTapointDecideShared(symbol, timeframe, () =>
      buildReport(symbol, timeframe)
    );
    return NextResponse.json({
      ok: true,
      report,
      shareKo: cacheHit ? '공용캐시' : '신규스캔',
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'scan fail' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    symbol?: string;
    timeframe?: string;
  };
  const symbol = String(body.symbol || 'BTCUSDT').toUpperCase();
  const timeframe = String(body.timeframe || '15m');
  try {
    const { report, cacheHit } = await runTapointDecideShared(symbol, timeframe, () =>
      buildReport(symbol, timeframe)
    );
    return NextResponse.json({
      ok: true,
      report,
      shareKo: cacheHit ? '공용캐시' : '신규스캔',
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'scan fail' },
      { status: 500 }
    );
  }
}
