/**
 * 서버 — 기관밴드 반응 · HotZone · 안착구간 터치 시 차트 PNG → 텔레그램.
 * 앱 미접속. crontab → /api/cron/telegram-auto-alert
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
} from '@/lib/telegramSymbolPriceGuard';
import {
  buildTelegramMultiTfPairListFromSettings,
  TELEGRAM_MULTITF_ALLOWED_TFS,
} from '@/lib/telegramMultiTfPairList';
import { telegramEventDedupServerTry, telegramPriceBucket } from '@/lib/telegramEventDedupServer';
import { sendTelegramHtmlCaptionToEnvChat } from '@/lib/telegramBotSendHtml';
import { sendTelegramDeskAlertPhoto } from '@/lib/telegramMergedDeskPhotoSend';
import { getLastInstitutionalBandEdges } from '@/lib/institutionalSuperBand';
import { buildMergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
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

const TOUCH_COOLDOWN_MS = 8 * 60 * 60_000; // 같은 Hot/밴드 자리 8시간
export const ZONE_TOUCH_COOLDOWN_MS = TOUCH_COOLDOWN_MS;

export type TelegramZoneTouchKind = 'band' | 'hot' | 'settle';

export type TelegramZoneTouchHit = {
  kind: TelegramZoneTouchKind;
  kindKo: string;
  side: 'LONG' | 'SHORT' | 'WAIT';
  labelKo: string;
  top: number;
  bot: number;
  detailKo: string;
  briefingKo?: string;
  extraLines?: Array<{ price: number; color: string; label: string }>;
};

export type TelegramZoneTouchStats = {
  pairRuns: number;
  touchSent: number;
  photoSent: number;
  dedupSkip: number;
  fetchErr: number;
  sendErr: number;
  noTouch: number;
};

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

function candlesFromAnalysis(analysis: AnalyzeResponse): Candle[] {
  const raw = (analysis as AnalyzeResponse & { candles?: Candle[] }).candles;
  return Array.isArray(raw) && raw.length ? raw : [];
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function lastAtr(candles: Candle[], period = 14): number {
  const n = candles.length;
  if (n < 3) return Math.abs(candles[n - 1]?.close ?? 1) * 0.01;
  let sum = 0;
  let cnt = 0;
  const start = Math.max(1, n - period);
  for (let i = start; i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    const pc = Number(candles[i - 1]!.close);
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    cnt += 1;
  }
  return cnt > 0 ? sum / cnt : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.01;
}

function candleTouchesLevel(c: Candle, level: number, pad: number): boolean {
  return c.low <= level + pad && c.high >= level - pad;
}

function candleTouchesBand(c: Candle, top: number, bot: number): boolean {
  const lo = Math.min(top, bot);
  const hi = Math.max(top, bot);
  return c.high >= lo && c.low <= hi;
}

function bandBrief(side: 'LONG' | 'SHORT', price: number, level: number): string {
  if (side === 'LONG') {
    return price >= level
      ? '하단 밴드 지지 반응 관찰(조건부) · 종가 이탈 시 무효 가능'
      : '하단 밴드 근접 · 안착·거절 확인 전 대기';
  }
  return price <= level
    ? '상단 밴드 저항 거부 관찰(조건부) · 종가 돌파 시 무효 가능'
    : '상단 밴드 근접 · 거부 확인 전 대기';
}

function detectBandTouches(candles: Candle[]): TelegramZoneTouchHit[] {
  if (candles.length < 8) return [];
  const cur = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const curE = getLastInstitutionalBandEdges(candles);
  const prevE = getLastInstitutionalBandEdges(candles.slice(0, -1));
  if (!curE) return [];
  const atr = lastAtr(candles);
  const pad = Math.max(atr * 0.14, Math.abs(cur.close) * 0.0005);
  const out: TelegramZoneTouchHit[] = [];

  const curLo = candleTouchesLevel(cur, curE.lower, pad);
  const prevLo = prevE ? candleTouchesLevel(prev, prevE.lower, pad) : false;
  if (curLo && !prevLo && cur.close >= curE.lower - pad * 0.6) {
    const half = Math.max(atr * 0.18, Math.abs(curE.lower) * 0.0008);
    out.push({
      kind: 'band',
      kindKo: '기관밴드 반응',
      side: 'LONG',
      labelKo: '기관지지 터치',
      top: curE.lower + half,
      bot: curE.lower - half,
      detailKo: `하단 밴드 ${fmtPx(curE.lower)} · 종가 ${fmtPx(cur.close)} · 상단 ${fmtPx(curE.upper)}`,
      briefingKo: [
        bandBrief('LONG', cur.close, curE.lower),
        '기관밴드(초록/빨강) · MTF 구조 확인',
        '확정 진입·승률 아님',
      ].join(' · '),
      extraLines: [
        { price: curE.upper, color: '#f87171', label: '밴드상' },
        { price: curE.lower, color: '#4ade80', label: '밴드하' },
      ],
    });
  }

  const curHi = candleTouchesLevel(cur, curE.upper, pad);
  const prevHi = prevE ? candleTouchesLevel(prev, prevE.upper, pad) : false;
  if (curHi && !prevHi && cur.close <= curE.upper + pad * 0.6) {
    const half = Math.max(atr * 0.18, Math.abs(curE.upper) * 0.0008);
    out.push({
      kind: 'band',
      kindKo: '기관밴드 반응',
      side: 'SHORT',
      labelKo: '기관저항 터치',
      top: curE.upper + half,
      bot: curE.upper - half,
      detailKo: `상단 밴드 ${fmtPx(curE.upper)} · 종가 ${fmtPx(cur.close)} · 하단 ${fmtPx(curE.lower)}`,
      briefingKo: [
        bandBrief('SHORT', cur.close, curE.upper),
        '기관밴드(초록/빨강) · MTF 구조 확인',
        '확정 진입·승률 아님',
      ].join(' · '),
      extraLines: [
        { price: curE.upper, color: '#f87171', label: '밴드상' },
        { price: curE.lower, color: '#4ade80', label: '밴드하' },
      ],
    });
  }
  return out;
}

function detectHotTouches(candles: Candle[], timeframe: string, price: number): TelegramZoneTouchHit[] {
  if (candles.length < 30) return [];
  const pack = buildMergedDeskHotZoneEntryPack({
    candles,
    timeframe,
    currentPrice: price,
  });
  if (!pack.all.length) return [];
  const cur = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const out: TelegramZoneTouchHit[] = [];
  for (const z of pack.all) {
    const curT = candleTouchesBand(cur, z.top, z.bot);
    const prevT = candleTouchesBand(prev, z.top, z.bot);
    if (!curT || prevT) continue;
    out.push({
      kind: 'hot',
      kindKo: 'HotZone',
      side: z.side,
      labelKo: z.side === 'LONG' ? 'Hot지지 터치' : 'Hot저항 터치',
      top: z.top,
      bot: z.bot,
      detailKo: `${z.reasonKo} · ${fmtPx(z.bot)}~${fmtPx(z.top)} · ${z.statusKo}`,
    });
  }
  return out;
}

function detectSettleTouches(analysis: AnalyzeResponse, candles: Candle[]): TelegramZoneTouchHit[] {
  const sz = analysis.settlementZone;
  if (!sz || sz.state === 'none' || sz.state === 'failed') return [];
  const level = Number(sz.level);
  if (!(level > 0) || candles.length < 2) return [];
  const atr = lastAtr(candles);
  const half = Math.max(atr * 0.28, Math.abs(level) * 0.0014);
  const top = level + half;
  const bot = level - half;
  const cur = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const curT = candleTouchesBand(cur, top, bot);
  const prevT = candleTouchesBand(prev, top, bot);
  if (!curT || prevT) return [];
  const side: TelegramZoneTouchHit['side'] =
    sz.direction === 'LONG' || sz.direction === 'SHORT' ? sz.direction : 'WAIT';
  const stateKo =
    sz.state === 'confirmed' ? '안착확정' : sz.state === 'candidate' ? '안착후보' : sz.state;
  return [
    {
      kind: 'settle',
      kindKo: '안착구간',
      side,
      labelKo: `안착 ${stateKo} 터치`,
      top,
      bot,
      detailKo: `레벨 ${fmtPx(level)} · ${stateKo} · ${(sz.reasons ?? []).slice(0, 2).join(' · ')}`,
    },
  ];
}

export function collectTelegramZoneTouchHits(
  analysis: AnalyzeResponse,
  candles: Candle[],
  timeframe: string,
  price: number
): TelegramZoneTouchHit[] {
  return [
    ...detectBandTouches(candles),
    ...detectHotTouches(candles, timeframe, price),
    ...detectSettleTouches(analysis, candles),
  ];
}

function hitBriefingInput(
  symbol: string,
  timeframe: string,
  hit: TelegramZoneTouchHit,
  price: number,
  ctx?: TelegramAlertChartContext | null
) {
  const emoji = hit.kind === 'band' ? '📊' : hit.kind === 'settle' ? '📍' : '🔥';
  const invalidKo =
    hit.side === 'LONG'
      ? '종가가 구간·밴드 하단 이탈 시 무효 가능'
      : hit.side === 'SHORT'
        ? '종가가 구간·밴드 상단 돌파 시 무효 가능'
        : '방향 미확정 · 구조 확인 필요';
  return {
    emoji,
    kindKo: hit.kindKo,
    symbol,
    timeframe,
    titleKo: hit.labelKo,
    side: hit.side,
    top: hit.top,
    bot: hit.bot,
    price,
    detailKo: hit.detailKo,
    briefingKo: hit.briefingKo,
    mtfSummaryKo: ctx?.mtfSummaryKo,
    mtfZoneLines: ctx?.mtfZones?.map((z) => z.labelKo),
    invalidKo,
  };
}

export function zoneTouchHitBriefInput(
  symbol: string,
  timeframe: string,
  hit: TelegramZoneTouchHit,
  price: number,
  ctx?: TelegramAlertChartContext | null
) {
  return hitBriefingInput(symbol, timeframe, hit, price, ctx);
}

export async function sendTelegramZoneTouchHits(params: {
  user: string;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  hits: TelegramZoneTouchHit[];
  price: number;
  chartImageOn: boolean;
  chartContext?: TelegramAlertChartContext | null;
  settings: UserSettings;
  apiBase: string;
}): Promise<{ sent: number; photo: number; dedup: number; sendErr: number }> {
  let sent = 0;
  let photo = 0;
  let dedup = 0;
  let sendErr = 0;
  const tf = String(params.timeframe || '').toLowerCase();
  for (const hit of params.hits) {
    const midPx = (hit.top + hit.bot) / 2;
    if (
      !telegramAssetPricePlausible(params.symbol, params.price) ||
      !telegramAssetPricePlausible(params.symbol, midPx) ||
      !telegramPriceCompatibleWithAnchor(params.price, midPx)
    ) {
      continue;
    }
    const bucket = telegramPriceBucket(params.price, midPx);
    const dedupeKey = `zone-touch|${params.user}|${params.symbol}|${tf}|${hit.kind}|${hit.side}|b${bucket}`;
    const ok = await telegramEventDedupServerTry(dedupeKey, TOUCH_COOLDOWN_MS);
    if (!ok) {
      dedup += 1;
      continue;
    }
    const briefIn = hitBriefingInput(params.symbol, params.timeframe, hit, params.price, params.chartContext);
    const captionHtml = buildTelegramDeskBriefingHtml(briefIn);
    const ctx = params.chartContext;
    const extraLines = filterTelegramPricesToSymbolScale(
      params.symbol,
      params.price,
      [...(hit.extraLines ?? []), ...(ctx ? instBandExtraLines(ctx) : [])],
      (l) => l.price
    );
    const mtfZones = filterTelegramPricesToSymbolScale(
      params.symbol,
      params.price,
      (ctx?.mtfZones ?? []).map((z) => ({
        ...z,
        primary:
          z.primary ||
          Math.abs((z.top + z.bot) / 2 - (hit.top + hit.bot) / 2) /
            Math.max((hit.top + hit.bot) / 2, 1) <
            0.005,
      })),
      (z) => (z.top + z.bot) / 2
    );
    let sentOk = false;
    let photoOk = false;
    if (params.chartImageOn && params.candles.length >= 4) {
      const sendR = await sendTelegramDeskAlertPhoto({
        captionHtml,
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
              labelKo: hit.labelKo,
              side: hit.side,
            },
            currentPrice: params.price,
            extraLines,
            mtfZones,
            subtitleKo: `${hit.labelKo} · MTF 폭락·기관밴드 · 참고용`,
          }),
      });
      sentOk = sendR.ok;
      photoOk = sendR.photo;
    } else {
      const r = await sendTelegramHtmlCaptionToEnvChat(captionHtml);
      sentOk = r.ok;
    }
    if (sentOk) {
      sent += 1;
      if (photoOk) photo += 1;
      console.info('[telegram-zone-touch] sent', {
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

/** 이미 받은 analysis로 터치 발송 (통합텔레 루프 재사용) */
export async function runTelegramZoneTouchForFetchedPair(params: {
  user: string;
  settings: UserSettings;
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse;
  candles?: Candle[];
  price?: number;
  chartContext?: TelegramAlertChartContext | null;
  apiBase?: string;
}): Promise<Pick<TelegramZoneTouchStats, 'touchSent' | 'photoSent' | 'dedupSkip' | 'sendErr' | 'noTouch'>> {
  const empty = { touchSent: 0, photoSent: 0, dedupSkip: 0, sendErr: 0, noTouch: 0 };
  if (params.settings.telegramZoneTouchAlertEnabled === false) return empty;
  const tf = String(params.timeframe || '').toLowerCase();
  if (!TELEGRAM_MULTITF_ALLOWED_TFS.has(tf)) return empty;
  const candles =
    params.candles && params.candles.length
      ? params.candles
      : candlesFromAnalysis(params.analysis);
  if (candles.length < 8) return { ...empty, noTouch: 1 };
  const price =
    params.price && params.price > 0
      ? params.price
      : params.analysis.currentPrice ?? candles[candles.length - 1]!.close;
  const hits = collectTelegramZoneTouchHits(params.analysis, candles, params.timeframe, price);
  if (!hits.length) return { ...empty, noTouch: 1 };
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
  const r = await sendTelegramZoneTouchHits({
    user: params.user,
    symbol: params.symbol,
    timeframe: params.timeframe,
    candles,
    hits,
    price,
    chartImageOn,
    chartContext,
    settings: params.settings,
    apiBase: params.apiBase || internalApiBaseUrl(),
  });
  return {
    touchSent: r.sent,
    photoSent: r.photo,
    dedupSkip: r.dedup,
    sendErr: r.sendErr,
    noTouch: r.sent ? 0 : 1,
  };
}

export async function runTelegramZoneTouchForUser(
  user: string,
  settings: UserSettings,
  stats: TelegramZoneTouchStats
): Promise<void> {
  if (settings.telegramZoneTouchAlertEnabled === false) return;
  const base = internalApiBaseUrl();
  const pairs = buildTelegramMultiTfPairListFromSettings(settings);
  if (!pairs.length) return;
  const uiMode: UIMode = 'MERGED_ANALYSIS_DESK';

  for (const [symbol, timeframe] of pairs) {
    const tf = String(timeframe || '').toLowerCase();
    if (!TELEGRAM_MULTITF_ALLOWED_TFS.has(tf)) continue;
    stats.pairRuns += 1;
    const analysis = await fetchAnalyze(base, settings, symbol, timeframe, uiMode);
    if (!analysis) {
      stats.fetchErr += 1;
      continue;
    }
    const r = await runTelegramZoneTouchForFetchedPair({
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

export function emptyZoneTouchStats(): TelegramZoneTouchStats {
  return {
    pairRuns: 0,
    touchSent: 0,
    photoSent: 0,
    dedupSkip: 0,
    fetchErr: 0,
    sendErr: 0,
    noTouch: 0,
  };
}
