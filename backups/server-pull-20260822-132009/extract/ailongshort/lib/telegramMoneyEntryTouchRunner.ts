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
  buildTelegramMultiTfPairListFromSettings,
  TELEGRAM_MULTITF_ALLOWED_TFS,
} from '@/lib/telegramMultiTfPairList';
import { telegramEventDedupServerTry } from '@/lib/telegramEventDedupServer';
import { sendTelegramHtmlToEnvChat, sendTelegramPhotoPngToEnvChat } from '@/lib/telegramBotSendHtml';
import { escapeTelegramHtml } from '@/lib/telegramFormatHtml';
import {
  buildTelegramZoneTouchChartSvg,
  telegramAlertChartSvgToPng,
} from '@/lib/telegramAlertChartImage';
import { detectMonthDeskMoneyZones, MONTH_DESK_MONEY_LABEL } from '@/lib/monthDeskMoneyZone';
import { buildMergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import { MERGED_DESK_AUTO_ALERT_TFS } from '@/lib/telegramServerMergedDeskEval';
import type { TelegramMergedDeskEval } from '@/lib/telegramServerMergedDeskEval';

const TOUCH_COOLDOWN_MS = 35 * 60_000;

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

function buildHtml(
  symbol: string,
  timeframe: string,
  hit: MoneyEntryTouchHit,
  price: number
): string {
  const sideKo = hit.side === 'LONG' ? '롱' : '숏';
  const emoji = hit.kind === 'money' ? '💰' : hit.side === 'LONG' ? '🟢' : '🔴';
  return [
    `<b>${emoji} ${escapeTelegramHtml(hit.kindKo)}</b> · <code>${escapeTelegramHtml(symbol)}</code> ${escapeTelegramHtml(timeframe)}`,
    `<b>${escapeTelegramHtml(hit.titleKo)}</b>`,
    `구간 <code>${escapeTelegramHtml(fmtPx(hit.bot))}</code> ~ <code>${escapeTelegramHtml(fmtPx(hit.top))}</code>`,
    `현재가 <code>${escapeTelegramHtml(fmtPx(price))}</code> · ${escapeTelegramHtml(sideKo)}${hit.gradeKo ? ` · ${escapeTelegramHtml(hit.gradeKo)}` : ''}`,
    escapeTelegramHtml(hit.detailKo),
    `<i>서버 자동스캔 · 참고용 — 승률·수익 보장 아님</i>`,
  ].join('\n');
}

function buildPlain(
  symbol: string,
  timeframe: string,
  hit: MoneyEntryTouchHit,
  price: number
): string {
  return [
    `${hit.kindKo} · ${symbol} ${timeframe}`,
    hit.titleKo,
    `구간 ${fmtPx(hit.bot)} ~ ${fmtPx(hit.top)}`,
    `현재가 ${fmtPx(price)}`,
    hit.detailKo,
    `※ 서버 자동 · 참고용`,
  ].join('\n');
}

export async function sendMoneyEntryTouchHits(params: {
  user: string;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  hits: MoneyEntryTouchHit[];
  price: number;
  chartImageOn: boolean;
}): Promise<{ sent: number; photo: number; dedup: number; sendErr: number }> {
  let sent = 0;
  let photo = 0;
  let dedup = 0;
  let sendErr = 0;
  const tf = String(params.timeframe || '').toLowerCase();

  for (const hit of params.hits) {
    const mid = Math.round(hit.mid);
    const dedupeKey = `money-entry|${params.user}|${params.symbol}|${tf}|${hit.kind}|${hit.side}|${mid}`;
    const ok = await telegramEventDedupServerTry(dedupeKey, TOUCH_COOLDOWN_MS);
    if (!ok) {
      dedup += 1;
      continue;
    }

    const html = buildHtml(params.symbol, params.timeframe, hit, params.price);
    let sentOk = false;
    let photoOk = false;

    if (params.chartImageOn && params.candles.length >= 4) {
      const svg = buildTelegramZoneTouchChartSvg({
        symbol: params.symbol,
        timeframe: params.timeframe,
        candles: params.candles,
        titleKo: hit.titleKo,
        zone: {
          top: hit.top,
          bot: hit.bot,
          labelKo: hit.titleKo,
          side: hit.side,
        },
        currentPrice: params.price,
      });
      const png = await telegramAlertChartSvgToPng(svg);
      if (png) {
        const caption = buildPlain(params.symbol, params.timeframe, hit, params.price);
        const r = await sendTelegramPhotoPngToEnvChat(caption, png);
        if (r.ok) {
          sentOk = true;
          photoOk = true;
        }
      }
    }

    if (!sentOk) {
      const r = await sendTelegramHtmlToEnvChat(html);
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
  const r = await sendMoneyEntryTouchHits({
    user: params.user,
    symbol: params.symbol,
    timeframe: params.timeframe,
    candles,
    hits,
    price,
    chartImageOn,
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
    return analysis?.symbol ? analysis : null;
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
