/**
 * 폭락존 TF별 상승확정/하락확정 진입 스캔.
 * GET ?symbol=ALL|BTCUSDT&leverage=
 * 확정 수익 아님.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import {
  listDumpConfirmSymbols,
  listDumpConfirmTimeframes,
  scanDumpConfirmOnClosedBar,
  type DumpConfirmSignal,
} from '@/lib/mergedDeskDumpConfirmEntry';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const leverage = Math.max(1, Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 10));
  const symQ = String(req.nextUrl.searchParams.get('symbol') || 'ALL').toUpperCase();
  const symbols =
    symQ === 'ALL' || !symQ
      ? listDumpConfirmSymbols()
      : listDumpConfirmSymbols([symQ.endsWith('USDT') ? symQ : `${symQ}USDT`]);
  const tfs = listDumpConfirmTimeframes();

  const signals: DumpConfirmSignal[] = [];
  const skipped: Array<{ symbol: string; tf: string; reasonKo: string }> = [];
  const errors: Array<{ symbol: string; tf: string; msg: string }> = [];

  await Promise.all(
    symbols.flatMap((symbol) =>
      tfs.map(async (tf) => {
        try {
          const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
            recentOnly: true,
          });
          const sig = scanDumpConfirmOnClosedBar({
            symbol,
            timeframe: tf,
            candles,
            leverage,
            tp1RoePct: FAST_TP1_ROE_PCT,
          });
          if (!sig) {
            skipped.push({ symbol, tf, reasonKo: `${tf} 확정·터치 대기` });
            return;
          }
          signals.push(sig);
        } catch (e) {
          errors.push({
            symbol,
            tf,
            msg: e instanceof Error ? e.message : 'scan fail',
          });
        }
      })
    )
  );

  /** 심볼당 1신호 — 3m > 5m > 15m */
  const tfRank = (tf: string) => (tf === '3m' ? 3 : tf === '5m' ? 2 : 1);
  signals.sort((a, b) => tfRank(b.timeframe) - tfRank(a.timeframe));
  const bestBySym = new Map<string, DumpConfirmSignal>();
  for (const s of signals) {
    if (!bestBySym.has(s.symbol)) bestBySym.set(s.symbol, s);
  }
  const picked = [...bestBySym.values()];

  return NextResponse.json({
    ok: true,
    symbols,
    timeframes: tfs,
    signals: picked,
    signalCount: picked.length,
    allSignals: signals.slice(0, 24),
    skipped: skipped.slice(0, 16),
    errors: errors.slice(0, 8),
    hintKo: picked.length
      ? picked.map((s) => s.noteKo).join(' · ')
      : `BTC폭락확정 대기 · ${tfs.join('/')} · 상승확정→롱 · 하락/저항확정→숏 · BTC만 · 확정아님`,
  });
}
