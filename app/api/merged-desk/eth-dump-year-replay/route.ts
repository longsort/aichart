/**
 * ETH 폭락존 1년 리플레이 API.
 * GET ?leverage=30&forceDownload=0
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { fetchBitgetFuturesCandlesFullHistory } from '@/lib/bitgetFuturesMarket';
import { readBitgetFuturesCsv, writeBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import {
  ETH_DUMP_YEAR_SYMBOL,
  ETH_DUMP_YEAR_TFS,
  runEthDumpYearReplay,
} from '@/lib/doksuri1/ethDumpYearReplay';
import { yearBarTarget } from '@/lib/doksuri1/coinYearReplayShared';
import type { Candle } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const YEAR_SEC = 365 * 86400;

async function loadYear(tf: string, force: boolean): Promise<{ candles: Candle[]; source: string }> {
  const target = yearBarTarget(tf);
  const minNeed = Math.floor(target * 0.45);
  if (!force) {
    try {
      const csv = await readBitgetFuturesCsv(ETH_DUMP_YEAR_SYMBOL, tf);
      if (csv.length >= minNeed) {
        const cut = Date.now() / 1000 - YEAR_SEC;
        const year = csv.filter((c) => Number(c.time) >= cut);
        if (year.length >= Math.min(minNeed, 8_000)) return { candles: year, source: 'csv' };
        return { candles: csv.slice(-target), source: 'csv' };
      }
    } catch {
      /* dl */
    }
  }
  const live = await fetchBitgetFuturesCandlesFullHistory(ETH_DUMP_YEAR_SYMBOL, tf, target);
  if (live.length >= 80) {
    try {
      await writeBitgetFuturesCsv(ETH_DUMP_YEAR_SYMBOL, tf, live);
    } catch {
      /* */
    }
  }
  const cut = Date.now() / 1000 - YEAR_SEC;
  const year = live.filter((c) => Number(c.time) >= cut);
  return { candles: year.length >= 80 ? year : live, source: 'bitget-api' };
}

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  if (!verifySiteAuthToken(token)) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const leverage = Math.max(1, Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 30));
  const forceDownload = String(req.nextUrl.searchParams.get('forceDownload') || '') === '1';
  const errors: Array<{ tf: string; msg: string }> = [];
  const byTf: Array<{ timeframe: string; candles: Candle[]; source?: string }> = [];

  for (const tf of ETH_DUMP_YEAR_TFS) {
    try {
      const { candles, source } = await loadYear(tf, forceDownload);
      if (candles.length < 80) {
        errors.push({ tf, msg: `봉부족 ${candles.length}` });
        continue;
      }
      byTf.push({ timeframe: tf, candles, source: `${source}:${candles.length}` });
    } catch (e) {
      errors.push({ tf, msg: e instanceof Error ? e.message : 'fail' });
    }
  }

  if (!byTf.length) {
    return NextResponse.json({ ok: false, error: 'ETH 캔들 없음', errors }, { status: 500 });
  }

  const pack = runEthDumpYearReplay({ byTf, leverage });
  return NextResponse.json({
    ok: true,
    ...pack,
    errors,
    forceDownload,
    sources: Object.fromEntries(byTf.map((r) => [r.timeframe, r.source || ''])),
  });
}
