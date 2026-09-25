/**
 * BTC 3분·5분 구조로켓 스캔 — 차트 TF와 무관하게 3m·5m 캔들·로켓만 본다.
 * 후반영 로켓 감지 후 **추격 금지** · 눌림(수요)/저항(공급) 재진입만 신호.
 * GET ?leverage=&tp1RoePct=
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { analyzeCandles } from '@/lib/analyze';
import { listProfileLiveTfs } from '@/lib/mergedDeskCoinExitProfile';
import {
  BTC_3M_ROCKET_SYMBOL,
  buildBtc3mRocketSignal,
  type Btc3mRocketSignal,
} from '@/lib/mergedDeskBtc3mRocketTrade';
import {
  BTC_ULTRA_LEVERAGE,
  BTC_ULTRA_TP_ROE_PCT,
  evaluateBtcUltraScalpConfluence,
  resolveBtcUltraLeverage,
} from '@/lib/mergedDeskBtcUltraScalpPack';
import { detectMtfDumpZone } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { dumpConfirmBiasOnTf } from '@/lib/mergedDeskDumpConfirmEntry';

export const dynamic = 'force-dynamic';

/** 후반영·눌림대기 lookback · 모듈 const export HMR 이슈 회피용 로컬 상수 */
const LOOKBACK_BARS = 10;
const PULLBACK_MAX_BARS = 8;
const FALLBACK_TFS = ['3m', '5m'];

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const leverage = resolveBtcUltraLeverage(
    Number(req.nextUrl.searchParams.get('leverage')) || BTC_ULTRA_LEVERAGE
  );
  const tp1RoePct = Math.max(
    3,
    Math.min(20, Number(req.nextUrl.searchParams.get('tp1RoePct')) || BTC_ULTRA_TP_ROE_PCT)
  );
  const tfs = listProfileLiveTfs(BTC_3M_ROCKET_SYMBOL, FALLBACK_TFS);
  const signals: Array<
    Btc3mRocketSignal & {
      confluenceScore?: number;
      confluenceKo?: string;
      longPct?: number;
      shortPct?: number;
    }
  > = [];
  const skipped: Array<{ tf: string; reasonKo: string }> = [];
  const errors: Array<{ tf: string; msg: string }> = [];

  await Promise.all(
    tfs.map(async (tf) => {
      try {
        const { candles } = await loadBitgetFuturesChartCandles(BTC_3M_ROCKET_SYMBOL, tf, {
          recentOnly: true,
        });
        if (!candles?.length || candles.length < 24) {
          skipped.push({ tf, reasonKo: `${tf} 캔들 부족` });
          return;
        }
        const pack = analyzeCandles(BTC_3M_ROCKET_SYMBOL, tf, candles) as {
          structureRocketSignals?: Btc3mRocketSignal extends never ? never : unknown;
          longScore?: number;
          shortScore?: number;
          aiZonePack?: {
            longPct?: number | null;
            shortPct?: number | null;
            volumeHeavy?: boolean;
          } | null;
          volumeHeavy?: boolean;
        };
        const signal = buildBtc3mRocketSignal({
          candles,
          structureRocketSignals: pack.structureRocketSignals as never,
          leverage,
          tp1RoePct,
          timeframe: tf,
          lookbackBars: LOOKBACK_BARS,
          pullbackMaxBars: PULLBACK_MAX_BARS,
        });
        if (!signal) {
          skipped.push({
            tf,
            reasonKo: `${tf} 로켓후 눌림/저항 대기(최근${LOOKBACK_BARS}봉·눌림≤${PULLBACK_MAX_BARS}) · 봉수${candles.length}`,
          });
          return;
        }

        const longPct =
          pack.aiZonePack?.longPct != null
            ? Number(pack.aiZonePack.longPct)
            : Number(pack.longScore) || 0;
        const shortPct =
          pack.aiZonePack?.shortPct != null
            ? Number(pack.aiZonePack.shortPct)
            : Number(pack.shortScore) || 0;

        /** 추정 강한 쪽 · 폭락확정과 로켓 방향 정렬 (안 맞으면 스킵) */
        const stronger =
          longPct > shortPct ? 'LONG' : shortPct > longPct ? 'SHORT' : null;
        const strongPct = Math.max(longPct, shortPct);
        const weakPct = Math.min(longPct, shortPct);
        const estimateAgrees =
          stronger != null && stronger === signal.direction && strongPct >= 67;
        const estimateConflicts =
          stronger != null &&
          stronger !== signal.direction &&
          strongPct >= 70 &&
          strongPct - weakPct >= 8;
        const dumpBias = dumpConfirmBiasOnTf({ timeframe: tf, candles });
        const dumpAgrees = dumpBias != null && dumpBias.direction === signal.direction;
        if (estimateConflicts && !dumpAgrees) {
          skipped.push({
            tf,
            reasonKo: `${tf} 로켓${signal.direction} vs 추정${stronger}${strongPct.toFixed(0)}% 충돌`,
          });
          return;
        }
        if (!estimateAgrees && !dumpAgrees) {
          skipped.push({
            tf,
            reasonKo: `${tf} 로켓합류부족 · 추정≥67동의 또는 폭락${dumpBias?.lifeKo || '확정'} 필요`,
          });
          return;
        }

        let dumpZones: Array<{ bot: number; top: number; demand?: boolean }> = [];
        try {
          const z = detectMtfDumpZone(candles, tf);
          if (z && z.top > z.bot) {
            dumpZones = [
              {
                bot: z.bot,
                top: z.top,
                demand: z.bandRole !== 'ceiling',
              },
            ];
          }
        } catch {
          /* ignore */
        }

        const conf = evaluateBtcUltraScalpConfluence({
          direction: signal.direction,
          entry: signal.entry,
          sl: signal.sl,
          trigger: 'structure-rocket',
          longPct,
          shortPct,
          volumeHeavy: pack.aiZonePack?.volumeHeavy ?? pack.volumeHeavy,
          candles,
          dumpZones,
          leverage,
        });
        if (!conf.allow) {
          skipped.push({ tf, reasonKo: conf.reasonKo });
          return;
        }

        const alignKo = dumpAgrees
          ? `폭락${dumpBias!.lifeKo}합류`
          : `추정${stronger}${strongPct.toFixed(0)}%합류`;
        signals.push({
          ...signal,
          noteKo: `${signal.noteKo} · ${alignKo} · ${conf.reasonKo}`,
          confluenceScore: conf.score,
          confluenceKo: conf.reasonKo,
          longPct,
          shortPct,
        });
      } catch (e) {
        errors.push({
          tf,
          msg: e instanceof Error ? e.message : 'scan fail',
        });
      }
    })
  );

  signals.sort((a, b) => {
    const closedScore = (s: Btc3mRocketSignal) => (s.barsAgo > 0 ? 2 : 0);
    const tfRank = (tf: string) => (tf === '3m' ? 2 : tf === '5m' ? 1 : 0);
    return (
      closedScore(b) - closedScore(a) ||
      tfRank(b.timeframe) - tfRank(a.timeframe) ||
      a.barsAgo - b.barsAgo
    );
  });

  const signal = signals[0] ?? null;

  return NextResponse.json({
    ok: true,
    symbol: BTC_3M_ROCKET_SYMBOL,
    timeframes: tfs,
    timeframe: signal?.timeframe ?? tfs[0] ?? '3m',
    lookbackBars: LOOKBACK_BARS,
    pullbackMaxBars: PULLBACK_MAX_BARS,
    signal,
    signals,
    signalCount: signals.length,
    skipped: skipped.slice(0, 8),
    errors: errors.slice(0, 4),
    hintKo: signal
      ? signal.noteKo
      : `BTC로켓 · 추격금지 · 확장후 눌림/저항 재진입 · ${leverage}x·TP${tp1RoePct}% · 추정≥67또는폭락합류 · ${tfs.join('/')} · 확정아님`,
  });
}
