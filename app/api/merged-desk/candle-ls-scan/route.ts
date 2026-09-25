/**
 * BTC/BNB/XRP 통합 캔들 롱숏 스캔 — 차트 포커스 불필요.
 * GET ?symbol=BTCUSDT|BNBUSDT|XRPUSDT&deskBias=LONG|SHORT (선택)
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesMarket';
import {
  buildCandleLsSignal,
  listCandleLsScanTimeframes,
  voteCandleLsOnClosedBar,
  type CandleLsDirection,
  type CandleLsTfVote,
} from '@/lib/mergedDeskCandleLsSignal';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['BTCUSDT', 'BNBUSDT', 'XRPUSDT']);

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const symbol = String(req.nextUrl.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  if (symbol === 'XRPUSDT') {
    return NextResponse.json({
      ok: true,
      symbol,
      skipped: true,
      signal: null,
      votes: [],
      errors: [],
      hintKo: 'XRP는 독수리1호 4패턴 전용 · /api/merged-desk/xrp-4strat-scan',
    });
  }
  if (!isBitgetPerpChartSymbol(symbol) || !ALLOWED.has(symbol)) {
    /** ETH 등 비대상 심볼 — 400 대신 soft skip (폴링 노이즈/에러 감소) */
    return NextResponse.json({
      ok: true,
      symbol,
      skipped: true,
      signal: null,
      votes: [],
      errors: [],
      hintKo: '캔들LS는 BTC·BNB·XRP만 · ETH는 폭락존/차트신호 경로',
    });
  }

  const leverage = Math.max(1, Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 10));
  const minRr = Math.max(1, Math.min(3, Number(req.nextUrl.searchParams.get('minRr')) || 1.2));
  const biasRaw = String(req.nextUrl.searchParams.get('deskBias') || '').toUpperCase();
  const deskBias: CandleLsDirection | null =
    biasRaw === 'LONG' || biasRaw === 'SHORT' ? biasRaw : null;

  const tfs = listCandleLsScanTimeframes();
  const votes: CandleLsTfVote[] = [];
  const errors: Array<{ tf: string; msg: string }> = [];

  await Promise.all(
    tfs.map(async (tf) => {
      try {
        const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
          recentOnly: true,
        });
        const vote = voteCandleLsOnClosedBar({ timeframe: tf, candles });
        if (vote) votes.push(vote);
      } catch (e) {
        errors.push({
          tf,
          msg: e instanceof Error ? e.message : 'scan fail',
        });
      }
    })
  );

  const signal = buildCandleLsSignal({
    symbol,
    votes,
    leverage,
    minRr,
    deskBias,
  });

  return NextResponse.json({
    ok: true,
    symbol,
    scannedAt: Date.now(),
    tfCount: tfs.length,
    voteCount: votes.length,
    signal: signal
      ? {
          signalId: signal.signalId,
          timeframe: signal.timeframe,
          direction: signal.direction,
          entry: signal.entry,
          sl: signal.sl,
          tp1: signal.tp1,
          tp2: signal.tp2,
          noteKo: signal.noteKo,
          agreeCount: signal.agreeCount,
          closedBarTime: signal.closedBarTime,
        }
      : null,
    votes: votes.map((v) => ({
      timeframe: v.timeframe,
      direction: v.direction,
      score: v.score,
      noteKo: v.noteKo,
    })),
    deskBias,
    errors: errors.slice(0, 6),
    hintKo: 'BNB/XRP 캔들 롱숏 · 다중TF 합의 · 확정 아님',
  });
}
