/**
 * 서버 자동 — 롱/숏 진입자리 · $$$$ 돈구간 터치 → 텔레그램.
 * 앱 미접속. crontab → /api/cron/telegram-auto-alert
 * 추천 핵심 3종만: 롱진입 · 숏진입 · 돈구간($$$$) 터치.
 * 조건부 참고 — 승률·수익 보장 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { UserSettings, UIMode } from '@/lib/settings';
import { buildTelegramBackgroundAnalyzeUrlWithSettings } from '@/lib/telegramBackgroundAnalyzeQuery';
import {
  analysisMatchesTelegramSymbol,
  analysisPriceMatchesTelegramSymbol,
  telegramAssetPricePlausible,
  telegramPriceCompatibleWithAnchor,
  filterTelegramPricesToSymbolScale,
  sanitizeTelegramTradeLevels,
} from '@/lib/telegramSymbolPriceGuard';
import {
  buildTelegramMultiTfPairListFromSettings,
  TELEGRAM_MULTITF_ALLOWED_TFS,
} from '@/lib/telegramMultiTfPairList';
import { telegramEventDedupServerTry, telegramPriceBucket } from '@/lib/telegramEventDedupServer';
import { sendTelegramHtmlCaptionToEnvChat } from '@/lib/telegramBotSendHtml';
import { sendTelegramDeskAlertPhoto } from '@/lib/telegramMergedDeskPhotoSend';
import {
  buildTelegramZoneTouchChartSvg,
} from '@/lib/telegramAlertChartImage';
import {
  buildTelegramDeskBriefingHtml,
  buildTelegramPhotoCaptionHtml,
} from '@/lib/telegramAlertBriefing';
import {
  buildTelegramAlertChartContext,
  instBandExtraLines,
  type TelegramAlertChartContext,
} from '@/lib/telegramMtfAlertContext';
import { detectMonthDeskMoneyZones, MONTH_DESK_MONEY_LABEL } from '@/lib/monthDeskMoneyZone';
import { buildMergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import { MERGED_DESK_AUTO_ALERT_TFS } from '@/lib/telegramServerMergedDeskEval';
import type { TelegramMergedDeskEval } from '@/lib/telegramServerMergedDeskEval';

const TOUCH_COOLDOWN_MS = 8 * 60 * 60_000; // 같은 진입자리 8시간

export type MoneyEntryTouchKind = 'money' | 'entry-long' | 'entry-short';

export type MoneyEntryTouchHit = {
  kind: MoneyEntryTouchKind;
  kindKo: string;
  side: 'LONG' | 'SHORT';
  titleKo: string;
  top: number;
  bot: number;
  mid: number;
  detailKo: string;
  gradeKo?: string;
};

export type TelegramMoneyEntryTouchStats = {
  pairRuns: number;
  touchSent: number;
  photoSent: number;
  dedupSkip: number;
  fetchErr: number;
  sendErr: number;
  noTouch: number;
  skippedTf: number;
};

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function candleInBand(c: Candle, top: number, bot: number): boolean {
  const lo = Math.min(top, bot);
  const hi = Math.max(top, bot);
  return c.high >= lo && c.low <= hi;
}

/** 직전 봉은 밖 · 현재 봉이 구간 안 = 첫 터치 */
function firstTouchBand(candles: Candle[], top: number, bot: number): boolean {
  if (candles.length < 2) return false;
  const cur = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  return candleInBand(cur, top, bot) && !candleInBand(prev, top, bot);
}

function candlesFromAnalysis(analysis: AnalyzeResponse): Candle[] {
  const raw = (analysis as AnalyzeResponse & { candles?: Candle[] }).candles;
  return Array.isArray(raw) && raw.length ? raw : [];
}

/**
 * $$$$ · Hot진입 · 스윙★타점 첫 터치 수집.
 */
export function collectMoneyEntryTouchHits(params: {
  candles: Candle[];
  timeframe: string;
  price: number;
  ev?: TelegramMergedDeskEval | null;
}): MoneyEntryTouchHit[] {
  const { candles, timeframe, price, ev } = params;
  if (candles.length < 8 || !(price > 0)) return [];
  const hits: MoneyEntryTouchHit[] = [];

  /** 1) $$$$ 돈구간 */
  try {
    const hud = detectMonthDeskMoneyZones(candles, timeframe);
    for (const side of ['LONG', 'SHORT'] as const) {
      const z = side === 'LONG' ? hud.long : hud.short;
      if (!z || !(z.priceTop > 0) || !(z.priceBot > 0)) continue;
      if (!firstTouchBand(candles, z.priceTop, z.priceBot)) continue;
      const g =
        z.strength >= 78 ? '초강' : z.strength >= 62 ? '강' : z.strength >= 48 ? '중' : '약';
      hits.push({
        kind: 'money',
        kindKo: `${MONTH_DESK_MONEY_LABEL}돈구간`,
        side,
        titleKo: `${MONTH_DESK_MONEY_LABEL}${side === 'LONG' ? '롱' : '숏'}·${g} 터치`,
        top: z.priceTop,
        bot: z.priceBot,
        mid: z.priceMid,
        gradeKo: g,
        detailKo: `${z.headlineKo || '유동성 풀'} · ${fmtPx(z.priceBot)}~${fmtPx(z.priceTop)}`,
      });
    }
  } catch {
    /* ignore money detect */
  }

  /** 2) Hot 진입자리 */
  try {
    const hot = buildMergedDeskHotZoneEntryPack({
      candles,
      timeframe,
      currentPrice: price,
    });
    for (const z of hot.all ?? []) {
      if (!(z.top > 0) || !(z.bot > 0)) continue;
      if (!firstTouchBand(candles, z.top, z.bot)) continue;
      if (z.status !== 'TOUCH' && z.status !== 'ENTER' && !z.touchedNow) {
        /** 첫 터치면 상태 무관하게 진입자리로 */
      }
      const kind: MoneyEntryTouchKind = z.side === 'LONG' ? 'entry-long' : 'entry-short';
      hits.push({
        kind,
        kindKo: z.side === 'LONG' ? '롱진입자리' : '숏진입자리',
        side: z.side,
        titleKo: `${z.side === 'LONG' ? '롱' : '숏'}진입 · Hot ${z.statusKo || '터치'}`,
        top: z.top,
        bot: z.bot,
        mid: z.mid,
        gradeKo: z.grade,
        detailKo: `${z.labelKo || ''} · ${z.reasonKo || ''} · ${fmtPx(z.bot)}~${fmtPx(z.top)}`.trim(),
      });
    }
  } catch {
    /* ignore hot */
  }

  /** 3) 스윙중투 ★타점 구간 첫 진입 */
  if (ev?.swing && (ev.swing.side === 'LONG' || ev.swing.side === 'SHORT')) {
    const lo = Math.min(ev.swing.entryLow, ev.swing.entryHigh);
    const hi = Math.max(ev.swing.entryLow, ev.swing.entryHigh);
    if (lo > 0 && hi > lo && firstTouchBand(candles, hi, lo)) {
      const kind: MoneyEntryTouchKind = ev.swing.side === 'LONG' ? 'entry-long' : 'entry-short';
      hits.push({
        kind,
        kindKo: ev.swing.side === 'LONG' ? '롱진입자리' : '숏진입자리',
        side: ev.swing.side,
        titleKo: `★타점 ${ev.swing.side === 'LONG' ? '롱' : '숏'} · ${ev.swing.stance}`,
        top: hi,
        bot: lo,
        mid: (hi + lo) / 2,
        gradeKo: ev.swing.grade,
        detailKo: `${ev.swing.whereKo || ''} · E ${fmtPx(ev.levels.entry || (hi + lo) / 2)} · SL ${fmtPx(ev.levels.sl || 0)}`.trim(),
      });
    }
  }

  /** 같은 side+kind 근처 중복 제거(가격 0.4% 이내) */
  const out: MoneyEntryTouchHit[] = [];
  for (const h of hits) {
    const dup = out.find(
      (x) =>
        x.kind === h.kind &&
        x.side === h.side &&
        Math.abs(x.mid - h.mid) / Math.max(h.mid, 1) < 0.004
    );
    if (!dup) out.push(h);
  }
  return out;
}

function hitBriefInput(
  symbol: string,
  timeframe: string,
  hit: MoneyEntryTouchHit,
  price: number,
  ctx?: TelegramAlertChartContext | null,
  levels?: { entry?: number | null; sl?: number | null; tp1?: number | null; tp2?: number | null; tp3?: number | null }
) {
  const emoji = hit.kind === 'money' ? '💰' : hit.side === 'LONG' ? '🟢' : '🔴';
  const scrub = sanitizeTelegramTradeLevels(symbol, price, levels);
  const hasLv = scrub.entry || scrub.sl || scrub.tp1;
  return {
    emoji,
    kindKo: hit.kindKo,
    symbol,
    timeframe,
    titleKo: hit.titleKo,
    side: hit.side,
    top: hit.top,
    bot: hit.bot,
    price,
    detailKo: `${hit.detailKo}${hit.gradeKo ? ` · 등급 ${hit.gradeKo}` : ''}`,
    briefingKo: hit.side === 'LONG'
      ? '지지·안착 확인 전 참고 · 이탈 시 무효 가능'
      : '저항·거부 확인 전 참고 · 돌파 시 무효 가능',
    mtfSummaryKo: ctx?.mtfSummaryKo,
    mtfZoneLines: ctx?.mtfZones?.map((z) => z.labelKo),
    invalidKo: hit.side === 'LONG' ? '구간 하단·종가 이탈 시 무효' : '구간 상단·종가 돌파 시 무효',
    levels: hasLv
      ? {
          entry: scrub.entry,
          sl: scrub.sl,
          tp1: scrub.tp1,
          tp2: scrub.tp2,
          tp3: scrub.tp3,
        }
      : undefined,
  };
}

export function moneyEntryTouchHitBriefInput(
  symbol: string,
  timeframe: string,
  hit: MoneyEntryTouchHit,
  price: number,
  ctx?: TelegramAlertChartContext | null,
  levels?: { entry?: number | null; sl?: number | null; tp1?: number | null; tp2?: number | null; tp3?: number | null }
) {
  return hitBriefInput(symbol, timeframe, hit, price, ctx, levels);
}

export const MONEY_ENTRY_TOUCH_COOLDOWN_MS = 8 * 60 * 60_000;

export async function sendMoneyEntryTouchHits(params: {
  user: string;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  hits: MoneyEntryTouchHit[];
  price: number;
  chartImageOn: boolean;
  chartContext?: TelegramAlertChartContext | null;
  levels?: { entry?: number | null; sl?: number | null; tp1?: number | null; tp2?: number | null; tp3?: number | null };
  /** 데스크 스윙 방향 — 반대쪽 터치에 레벨 혼입 방지 */
  direction?: 'LONG' | 'SHORT' | 'WAIT' | null;
  settings: UserSettings;
  apiBase: string;
}): Promise<{ sent: number; photo: number; dedup: number; sendErr: number }> {
  let sent = 0;
  let photo = 0;
  let dedup = 0;
  let sendErr = 0;
  const tf = String(params.timeframe || '').toLowerCase();

  for (const hit of params.hits) {
    if (
      !telegramAssetPricePlausible(params.symbol, params.price) ||
      !telegramAssetPricePlausible(params.symbol, hit.mid) ||
      !telegramPriceCompatibleWithAnchor(params.price, hit.mid)
    ) {
      continue;
    }
    const bucket = telegramPriceBucket(params.price, hit.mid);
    const dedupeKey = `money-entry|${params.user}|${params.symbol}|${tf}|${hit.kind}|${hit.side}|b${bucket}`;
    const ok = await telegramEventDedupServerTry(dedupeKey, TOUCH_COOLDOWN_MS);
    if (!ok) {
      dedup += 1;
      continue;
    }

    const briefIn = hitBriefInput(
      params.symbol,
      params.timeframe,
      hit,
      params.price,
      params.chartContext,
      /** 데스크 방향과 다른 쪽 터치에는 공용 E/SL/TP 넣지 않음 */
      params.levels &&
        (!params.direction || params.direction === hit.side)
        ? params.levels
        : undefined
    );
    const html = buildTelegramDeskBriefingHtml(briefIn);
    const ctx = params.chartContext;
    const extraLines = filterTelegramPricesToSymbolScale(
      params.symbol,
      params.price,
      ctx ? instBandExtraLines(ctx) : [],
      (l) => l.price
    );
    const mtfZones = filterTelegramPricesToSymbolScale(
      params.symbol,
      params.price,
      ctx?.mtfZones ?? [],
      (z) => (z.top + z.bot) / 2
    );
    let sentOk = false;
    let photoOk = false;

    if (params.chartImageOn && params.candles.length >= 4) {
      const sendR = await sendTelegramDeskAlertPhoto({
        captionHtml: html,
        photoCaptionHtml: buildTelegramPhotoCaptionHtml(briefIn),
        symbol: params.symbol,
        timeframe: params.timeframe,
        candles: params.candles,
        settings: params.settings,
        apiBase: params.apiBase,
        buildSvg: () =>
          buildTelegramZoneTouchChartSvg({
            symbol: params.symbol,
            timeframe: params.timeframe,
            candles: params.candles,
            titleKo: hit.kindKo,
            zone: {
              top: hit.top,
              bot: hit.bot,
              labelKo: hit.titleKo,
              side: hit.side,
            },
            currentPrice: params.price,
            extraLines,
            mtfZones,
            levels: params.levels
              ? {
                  entry: params.levels.entry ?? null,
                  sl: params.levels.sl ?? null,
                  tp1: params.levels.tp1 ?? null,
                  tp2: params.levels.tp2 ?? null,
                  tp3: null,
                }
              : undefined,
            subtitleKo: `${hit.titleKo} · 진입·돈구간 · 참고용`,
          }),
      });
      sentOk = sendR.ok;
      photoOk = sendR.photo;
    } else {
      const r = await sendTelegramHtmlCaptionToEnvChat(html);
      sentOk = r.ok;
    }

    if (sentOk) {
      sent += 1;
      if (photoOk) photo += 1;
      console.info('[telegram-money-entry] sent', {
        user: params.user,
        symbol: params.symbol,
        timeframe: params.timeframe,
        kind: hit.kind,
        side: hit.side,
        photo: photoOk,
      });
    } else {
      sendErr += 1;
    }
  }

  return { sent, photo, dedup, sendErr };
}

/**
 * 이미 fetch된 분석으로 롱/숏/$$$$ 터치 발송 (merged auto 루프용).
 */
export async function runTelegramMoneyEntryTouchForFetchedPair(params: {
  user: string;
  settings: UserSettings;
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse;
  candles?: Candle[] | null;
  price?: number | null;
  ev?: TelegramMergedDeskEval | null;
  chartContext?: TelegramAlertChartContext | null;
  apiBase?: string;
}): Promise<{ touchSent: number; photoSent: number; dedupSkip: number; sendErr: number; noTouch: number }> {
  if (params.settings.telegramMoneyEntryTouchEnabled === false) {
    return { touchSent: 0, photoSent: 0, dedupSkip: 0, sendErr: 0, noTouch: 0 };
  }
  const tf = String(params.timeframe || '').toLowerCase();
  if (!MERGED_DESK_AUTO_ALERT_TFS.has(tf) && !TELEGRAM_MULTITF_ALLOWED_TFS.has(tf)) {
    return { touchSent: 0, photoSent: 0, dedupSkip: 0, sendErr: 0, noTouch: 0 };
  }
  if (tf === '1m' || tf === '3m' || tf === '5m') {
    return { touchSent: 0, photoSent: 0, dedupSkip: 0, sendErr: 0, noTouch: 0 };
  }

  const candles =
    (params.candles && params.candles.length ? params.candles : null) ||
    candlesFromAnalysis(params.analysis);
  const price =
    Number(params.price) > 0
      ? Number(params.price)
      : Number(params.analysis.currentPrice) || Number(candles[candles.length - 1]?.close) || 0;

  const hits = collectMoneyEntryTouchHits({
    candles,
    timeframe: params.timeframe,
    price,
    ev: params.ev ?? null,
  });
  if (!hits.length) {
    return { touchSent: 0, photoSent: 0, dedupSkip: 0, sendErr: 0, noTouch: 1 };
  }

  const chartImageOn = params.settings.telegramConfirmChartImageEnabled !== false;
  let chartContext = params.chartContext ?? null;
  if (chartImageOn && !chartContext) {
    const base = params.apiBase || internalApiBaseUrl();
    try {
      chartContext = await buildTelegramAlertChartContext({
        base,
        symbol: params.symbol,
        chartTf: params.timeframe,
        chartCandles: candles,
      });
    } catch {
      chartContext = null;
    }
  }
  const ev = params.ev ?? null;
  const r = await sendMoneyEntryTouchHits({
    user: params.user,
    symbol: params.symbol,
    timeframe: params.timeframe,
    candles,
    hits,
    price,
    chartImageOn,
    chartContext,
    direction: ev?.desk.direction ?? ev?.swing.side ?? null,
    levels: ev
      ? {
          entry: ev.levels.entry,
          sl: ev.levels.sl,
          tp1: ev.levels.tp1,
          tp2: ev.levels.tp2,
          tp3: ev.levels.tp3,
        }
      : undefined,
    settings: params.settings,
    apiBase: params.apiBase || internalApiBaseUrl(),
  });
  return {
    touchSent: r.sent,
    photoSent: r.photo,
    dedupSkip: r.dedup,
    sendErr: r.sendErr,
    noTouch: 0,
  };
}

function internalApiBaseUrl(): string {
  const b = (process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (b) return b.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const p = process.env.PORT || '3000';
  return `http://127.0.0.1:${p}`;
}

async function fetchAnalyze(
  base: string,
  settings: UserSettings,
  symbol: string,
  timeframe: string,
  uiMode: UIMode
): Promise<AnalyzeResponse | null> {
  const analyzeHeaderSecret = (
    process.env.INTERNAL_ANALYZE_SECRET || process.env.TELEGRAM_MULTITF_CRON_SECRET || ''
  ).trim();
  const rel = buildTelegramBackgroundAnalyzeUrlWithSettings(settings, symbol, timeframe, uiMode);
  const url = new URL(rel, base).toString();
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: analyzeHeaderSecret ? { 'x-internal-analyze-secret': analyzeHeaderSecret } : undefined,
    });
    if (!res.ok) return null;
    const analysis = (await res.json()) as AnalyzeResponse;
    if (!analysisMatchesTelegramSymbol(analysis, symbol)) return null;
    if (!analysisPriceMatchesTelegramSymbol(analysis, symbol)) return null;
    return analysis;
  } catch {
    return null;
  }
}

export function emptyMoneyEntryTouchStats(): TelegramMoneyEntryTouchStats {
  return {
    pairRuns: 0,
    touchSent: 0,
    photoSent: 0,
    dedupSkip: 0,
    fetchErr: 0,
    sendErr: 0,
    noTouch: 0,
    skippedTf: 0,
  };
}

/** 단독 스캔(레거시 경로용) */
export async function runTelegramMoneyEntryTouchForUser(
  user: string,
  settings: UserSettings,
  stats: TelegramMoneyEntryTouchStats
): Promise<void> {
  if (settings.telegramMoneyEntryTouchEnabled === false) return;
  const base = internalApiBaseUrl();
  const pairs = buildTelegramMultiTfPairListFromSettings(settings);
  const uiMode: UIMode = 'MERGED_ANALYSIS_DESK';

  for (const [symbol, timeframe] of pairs) {
    const tf = String(timeframe || '').toLowerCase();
    if (!TELEGRAM_MULTITF_ALLOWED_TFS.has(tf)) continue;
    if (!MERGED_DESK_AUTO_ALERT_TFS.has(tf)) {
      stats.skippedTf += 1;
      continue;
    }
    stats.pairRuns += 1;
    const analysis = await fetchAnalyze(base, settings, symbol, timeframe, uiMode);
    if (!analysis) {
      stats.fetchErr += 1;
      continue;
    }
    const r = await runTelegramMoneyEntryTouchForFetchedPair({
      user,
      settings,
      symbol,
      timeframe,
      analysis,
    });
    stats.touchSent += r.touchSent;
    stats.photoSent += r.photoSent;
    stats.dedupSkip += r.dedupSkip;
    stats.sendErr += r.sendErr;
    stats.noTouch += r.noTouch;
  }
}
