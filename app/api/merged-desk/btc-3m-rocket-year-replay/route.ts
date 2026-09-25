/**
 * BTC 3분 로켓 1년 리플레이 — 다운로드 + 성과·레버·수수료 분석.
 * GET ?leverage=30&forceDownload=0
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { fetchBitgetFuturesCandlesFullHistory } from '@/lib/bitgetFuturesMarket';
import { readBitgetFuturesCsv, writeBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import {
  BTC_ROCKET_YEAR_BARS,
  BTC_ROCKET_YEAR_TF,
  runBtc3mRocketYearReplay,
} from '@/lib/doksuri1/btc3mRocketYearReplay';
import { BTC_3M_ROCKET_SYMBOL } from '@/lib/mergedDeskBtc3mRocketTrade';
import type { Candle } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const YEAR_SEC = 365 * 86400;

async function loadBtc3mYear(forceDownload: boolean): Promise<{ candles: Candle[]; source: string }> {
  const target = BTC_ROCKET_YEAR_BARS;
  const minNeed = 40_000;

  if (!forceDownload) {
    try {
      const csv = await readBitgetFuturesCsv(BTC_3M_ROCKET_SYMBOL, BTC_ROCKET_YEAR_TF);
      if (csv.length >= minNeed) {
        const cut = Date.now() / 1000 - YEAR_SEC;
        const year = csv.filter((c) => Number(c.time) >= cut);
        if (year.length >= Math.min(minNeed, 20_000)) {
          return { candles: year, source: 'csv' };
        }
        return { candles: csv.slice(-target), source: 'csv' };
      }
    } catch {
      /* download */
    }
  }

  const live = await fetchBitgetFuturesCandlesFullHistory(
    BTC_3M_ROCKET_SYMBOL,
    BTC_ROCKET_YEAR_TF,
    target
  );
  if (live.length >= 80) {
    try {
      await writeBitgetFuturesCsv(BTC_3M_ROCKET_SYMBOL, BTC_ROCKET_YEAR_TF, live);
    } catch {
      /* ignore */
    }
  }
  const cut = Date.now() / 1000 - YEAR_SEC;
  const year = live.filter((c) => Number(c.time) >= cut);
  return {
    candles: year.length >= 80 ? year : live,
    source: 'bitget-api',
  };
}

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const leverage = Math.max(1, Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 30));
  const forceDownload = String(req.nextUrl.searchParams.get('forceDownload') || '') === '1';

  try {
    const { candles, source } = await loadBtc3mYear(forceDownload);
    if (candles.length < 200) {
      return NextResponse.json({
        ok: false,
        error: `BTC 3m 봉 부족 (${candles.length})`,
        source,
      });
    }

    const pack = runBtc3mRocketYearReplay({
      candles,
      baseLeverage: leverage,
    });

    return NextResponse.json({
      ok: true,
      source: `${source}:${candles.length}`,
      forceDownload,
      ...pack,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'btc-3m-rocket-year-replay fail',
      },
      { status: 500 }
    );
  }
}
