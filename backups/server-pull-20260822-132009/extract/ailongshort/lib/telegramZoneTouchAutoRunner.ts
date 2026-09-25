/**
 * 서버 — 기관밴드 반응 · HotZone · 안착구간 터치 시 차트 PNG → 텔레그램.
 * 앱 미접속. crontab → /api/cron/telegram-auto-alert
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
import { sendTelegramPhotoPngToEnvChat, sendTelegramHtmlToEnvChat } from '@/lib/telegramBotSendHtml';
import { getLastInstitutionalBandEdges } from '@/lib/institutionalSuperBand';
import { buildMergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import {
  buildTelegramZoneTouchChartSvg,
  telegramAlertChartSvgToPng,
} from '@/lib/telegramAlertChartImage';

const TOUCH_COOLDOWN_MS = 40 * 60_000;
const SKIP_TFS = new Set(['1m', '3m']);

export type TelegramZoneTouchKind = 'band' | 'hot' | 'settle';

export type TelegramZoneTouchHit = {
  kind: TelegramZoneTouchKind;
  kindKo: string;
  side: 'LONG' | 'SHORT' | 'WAIT';
  labelKo: string;
  top: number;
  bot: number;
  detailKo: string;
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
    return analysis?.symbol ? analysis : null;
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
      detailKo: `하단 밴드 ${fmtPx(curE.lower)} · 종가 ${fmtPx(cur.close)}`,
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
      detailKo: `상단 밴드 ${fmtPx(curE.upper)} · 종가 ${fmtPx(cur.close)}`,
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

function buildCaption(symbol: string, timeframe: string, hit: TelegramZoneTouchHit, price: number): string {
  return [
    `📡 ${hit.kindKo} · ${symbol} ${timeframe}`,
    hit.labelKo,
    `구간 ${fmtPx(hit.bot)} ~ ${fmtPx(hit.top)}`,
    `현재가 ${fmtPx(price)}`,
    hit.detailKo,
    `※ 서버 자동 감지 · 참고용 — 승률·수익 보장 아님`,
  ].join('\n');
}

export async function sendTelegramZoneTouchHits(params: {
  user: string;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  hits: TelegramZoneTouchHit[];
  price: number;
  chartImageOn: boolean;
}): Promise<{ sent: number; photo: number; dedup: number; sendErr: number }> {
  let sent = 0;
  let photo = 0;
  let dedup = 0;
  let sendErr = 0;
  const tf = String(params.timeframe || '').toLowerCase();
  for (const hit of params.hits) {
    const mid = Math.round((hit.top + hit.bot) / 2);
    const dedupeKey = `zone-touch|${params.user}|${params.symbol}|${tf}|${hit.kind}|${hit.side}|${mid}`;
    const ok = await telegramEventDedupServerTry(dedupeKey, TOUCH_COOLDOWN_MS);
    if (!ok) {
      dedup += 1;
      continue;
    }
    const caption = buildCaption(params.symbol, params.timeframe, hit, params.price);
    let sentOk = false;
    let photoOk = false;
    if (params.chartImageOn && params.candles.length >= 4) {
      const svg = buildTelegramZoneTouchChartSvg({
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
        extraLines: hit.extraLines,
      });
      const png = await telegramAlertChartSvgToPng(svg);
      if (png) {
        const r = await sendTelegramPhotoPngToEnvChat(caption, png);
        sentOk = r.ok;
        photoOk = r.ok;
      }
    }
    if (!sentOk) {
      const r = await sendTelegramHtmlToEnvChat(caption);
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
}): Promise<Pick<TelegramZoneTouchStats, 'touchSent' | 'photoSent' | 'dedupSkip' | 'sendErr' | 'noTouch'>> {
  const empty = { touchSent: 0, photoSent: 0, dedupSkip: 0, sendErr: 0, noTouch: 0 };
  if (params.settings.telegramZoneTouchAlertEnabled === false) return empty;
  const tf = String(params.timeframe || '').toLowerCase();
  if (SKIP_TFS.has(tf)) return empty;
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
  const r = await sendTelegramZoneTouchHits({
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
    if (!TELEGRAM_MULTITF_ALLOWED_TFS.has(tf) || SKIP_TFS.has(tf)) continue;
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
