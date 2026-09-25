/**
 * GET /api/merged-desk/htf-dump-touch-scan
 * 1h·4h·1d·1w·1M 폭락존(floor/ceiling) 터치 → 롱/숏.
 * ?symbol=ALL|&leverage=
 * 확정 수익 아님.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { FAST_SL_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import {
  listHtfDumpTouchSymbols,
  listHtfDumpTouchTimeframes,
  pickBestHtfDumpTouch,
  scanHtfDumpTouchOnClosedBar,
  type HtfDumpTouchSignal,
} from '@/lib/mergedDeskHtfDumpTouchTrade';
import { resolveWick15mLeverage } from '@/lib/mergedDeskWick15mTrade';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const leverage = resolveWick15mLeverage(
    Number(req.nextUrl.searchParams.get('leverage')) || null
  );
  const symQ = String(req.nextUrl.searchParams.get('symbol') || 'ALL').toUpperCase();
  const symbols =
    symQ === 'ALL' || !symQ
      ? listHtfDumpTouchSymbols()
      : listHtfDumpTouchSymbols([symQ.endsWith('USDT') ? symQ : `${symQ}USDT`]);

  const tfs = listHtfDumpTouchTimeframes();
  const signals: HtfDumpTouchSignal[] = [];
  const skipped: Array<{ symbol: string; reasonKo: string }> = [];
  const errors: Array<{ symbol: string; msg: string }> = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      const perTf: HtfDumpTouchSignal[] = [];
      try {
        for (let i = 0; i < tfs.length; i += 2) {
          const batch = tfs.slice(i, i + 2);
          await Promise.all(
            batch.map(async (tf) => {
              try {
                const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
                  recentOnly: true,
                });
                const sig = scanHtfDumpTouchOnClosedBar({
                  symbol,
                  timeframe: tf,
                  candles,
                  leverage,
                  slRoePct: FAST_SL_ROE_PCT,
                });
                if (sig) perTf.push(sig);
              } catch {
                /* skip tf */
              }
            })
          );
        }
        const best = pickBestHtfDumpTouch(perTf);
        if (best) signals.push(best);
        else {
          skipped.push({
            symbol,
            reasonKo: 'HTF 폭락존 터치 없음 · 1h·4h·1d·1w·1M',
          });
        }
      } catch (e) {
        errors.push({
          symbol,
          msg: e instanceof Error ? e.message : 'scan fail',
        });
      }
    })
  );

  return NextResponse.json({
    ok: true,
    timeframes: tfs,
    leverage,
    signals,
    skipped,
    errors,
    hintKo:
      'HTF 폭락존 · 신규터치+종가반응+지지/거부≥60%만 진입 · floor→롱 · ceiling→숏 · 확정아님',
  });
}
