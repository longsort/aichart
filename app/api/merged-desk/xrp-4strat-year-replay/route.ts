/**
 * XRP 4패턴 1년 리플레이 — 3m/5m/15m 다운(또는 CSV) → walk-forward.
 * GET ?leverage=30&tp1RoePct=5&forceDownload=0
 * maxDuration 여유 필요 (다운로드+리플레이).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { fetchBitgetFuturesCandlesFullHistory } from '@/lib/bitgetFuturesMarket';
import { readBitgetFuturesCsv, writeBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import {
  XRP_YEAR_REPLAY_TFS,
  yearBarTargetForTf,
  runXrpFourStrategyTfReplay,
  mergeXrpYearReplayPack,
} from '@/lib/doksuri1/xrpFourStrategyYearReplay';
import type { Candle } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SYMBOL = 'XRPUSDT';
const YEAR_SEC = 365 * 86400;

async function loadYearCandles(
  tf: string,
  forceDownload: boolean
): Promise<{ candles: Candle[]; source: string }> {
  const target = yearBarTargetForTf(tf);
  const minNeed = Math.floor(target * 0.55);

  if (!forceDownload) {
    try {
      const csv = await readBitgetFuturesCsv(SYMBOL, tf);
      if (csv.length >= minNeed) {
        const cut = Date.now() / 1000 - YEAR_SEC;
        const year = csv.filter((c) => Number(c.time) >= cut);
        if (year.length >= Math.min(minNeed, 8_000)) {
          return { candles: year.length ? year : csv.slice(-target), source: 'csv' };
        }
        if (csv.length >= minNeed) {
          return { candles: csv.slice(-target), source: 'csv' };
        }
      }
    } catch {
      /* download */
    }
  }

  const live = await fetchBitgetFuturesCandlesFullHistory(SYMBOL, tf, target);
  if (live.length >= 80) {
    try {
      await writeBitgetFuturesCsv(SYMBOL, tf, live);
    } catch {
      /* ignore disk */
    }
  }
  const cut = Date.now() / 1000 - YEAR_SEC;
  const year = live.filter((c) => Number(c.time) >= cut);
  return {
    candles: year.length >= 80 ? year : live,
    source: 'bitget-api',
  };
}

function strideForTf(tf: string): number {
  if (tf === '3m') return 3;
  if (tf === '5m') return 2;
  return 1;
}

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const leverage = Math.max(1, Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 30));
  const tp1RoePct = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get('tp1RoePct')) || 5));
  const forceDownload = String(req.nextUrl.searchParams.get('forceDownload') || '') === '1';
  const tfFilter = String(req.nextUrl.searchParams.get('tf') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const tfs = (
    tfFilter.length
      ? XRP_YEAR_REPLAY_TFS.filter((t) => tfFilter.includes(t))
      : [...XRP_YEAR_REPLAY_TFS]
  ) as string[];

  if (!tfs.length) {
    return NextResponse.json({ ok: false, error: 'tf=3m|5m|15m' }, { status: 400 });
  }

  const sources: Record<string, string> = {};
  const errors: Array<{ tf: string; msg: string }> = [];
  const fullTfResults: ReturnType<typeof runXrpFourStrategyTfReplay>[] = [];

  for (const tf of tfs) {
    try {
      const { candles, source } = await loadYearCandles(tf, forceDownload);
      sources[tf] = `${source}:${candles.length}`;
      if (candles.length < 80) {
        errors.push({ tf, msg: `봉부족 ${candles.length}` });
        continue;
      }
      const result = runXrpFourStrategyTfReplay({
        candles,
        timeframe: tf,
        leverage,
        tp1RoePct,
        stride: strideForTf(tf),
        minBars: 48,
      });
      fullTfResults.push(result);
    } catch (e) {
      errors.push({
        tf,
        msg: e instanceof Error ? e.message : 'fail',
      });
    }
  }

  const pack = mergeXrpYearReplayPack({
    tfResults: fullTfResults,
    leverage,
  });

  const tfsOut = fullTfResults.map((r) => ({
    ...r,
    tradeCountFull: r.trades.length,
    trades: r.trades.slice(0, 60),
  }));

  return NextResponse.json({
    ok: true,
    ...pack,
    tfs: tfsOut,
    sources,
    errors,
    forceDownload,
  });
}
