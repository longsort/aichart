/**
 * ETH 차트 신호 스캔 — 장바구니·로켓·LH번개·스윙·SFP.
 * GET ?symbol=ETHUSDT (기본)
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles, isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesMarket';
import {
  listEthChartSignalScanTimeframes,
  scanEthChartSignalsOnClosedBar,
  type EthChartSignalEntry,
} from '@/lib/mergedDeskEthChartSignalEngine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const symbol = String(req.nextUrl.searchParams.get('symbol') || 'ETHUSDT').toUpperCase();
  if (!isBitgetPerpChartSymbol(symbol) || !symbol.startsWith('ETH')) {
    return NextResponse.json({ ok: false, error: 'ETHUSDT 전용 차트신호 스캔' }, { status: 400 });
  }

  const leverage = Math.max(1, Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 10));
  const minRr = Math.max(1, Math.min(3, Number(req.nextUrl.searchParams.get('minRr')) || 1.2));
  const minScore = Math.max(3, Math.min(10, Number(req.nextUrl.searchParams.get('minScore')) || 3));
  const tfs = listEthChartSignalScanTimeframes();
  const signals: EthChartSignalEntry[] = [];
  const errors: Array<{ tf: string; msg: string }> = [];

  for (let i = 0; i < tfs.length; i += 2) {
    const batch = tfs.slice(i, i + 2);
    await Promise.all(
      batch.map(async (tf) => {
        try {
          const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
            recentOnly: true,
          });
          const sig = scanEthChartSignalsOnClosedBar({
            symbol,
            timeframe: tf,
            candles,
            leverage,
            minRr,
            minScore,
          });
          if (sig) signals.push(sig);
        } catch (e) {
          errors.push({
            tf,
            msg: e instanceof Error ? e.message : 'scan fail',
          });
        }
      })
    );
  }

  /** 점수 높은 순 */
  signals.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    ok: true,
    symbol,
    scannedAt: Date.now(),
    tfCount: tfs.length,
    signalCount: signals.length,
    signals: signals.map((s) => ({
      signalId: s.signalId,
      timeframe: s.timeframe,
      direction: s.direction,
      entry: s.entry,
      sl: s.sl,
      tp1: s.tp1,
      tp2: s.tp2,
      noteKo: s.noteKo,
      score: s.score,
      hits: s.hits.map((h) => ({
        kind: h.kind,
        direction: h.direction,
        labelKo: h.labelKo,
        weight: h.weight,
      })),
      closedBarTime: s.closedBarTime,
    })),
    errors: errors.slice(0, 6),
    hintKo: 'ETH 장바구니·로켓·LH번개·스윙·SFP 합류 · 확정 아님',
  });
}
