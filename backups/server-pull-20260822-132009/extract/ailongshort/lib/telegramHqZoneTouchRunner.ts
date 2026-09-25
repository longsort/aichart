/**
 * 서버 — 고확률 롱/숏 진입 zone 터치 시 차트 PNG + 텔레그램 (앱 미접속).
 * 기존 확정·HTF·멀티TF 신호와 분리. 조건부 참고 — 승률·수익 보장 아님.
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
import {
  buildMergedDeskHqEntryZonesPack,
  detectHqZoneTouchTransitions,
  type HqEntryZone,
} from '@/lib/mergedDeskHqEntryZones';
import { buildMergedDeskSwingRetracePack } from '@/lib/mergedDeskSwingRetrace';
import { detectMergedAnalysisKeyZones } from '@/lib/mergedAnalysisKeyZones';
import {
  buildTelegramHqZoneChartSvg,
  telegramAlertChartSvgToPng,
} from '@/lib/telegramAlertChartImage';

const TOUCH_COOLDOWN_MS = 45 * 60_000;

export type TelegramHqZoneStats = {
  hqUsers: number;
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

function buildCaption(symbol: string, timeframe: string, z: HqEntryZone, price: number): string {
  const sideKo = z.side === 'LONG' ? '롱자리' : '숏자리';
  return [
    `🎯 ${sideKo} 터치 · ${symbol} ${timeframe}`,
    `${z.labelKo}`,
    `구간 ${fmtPx(z.bot)} ~ ${fmtPx(z.top)}`,
    `현재가 ${fmtPx(price)}`,
    z.reasonKo,
    z.invalidationKo,
    `합류: ${z.sources.join('+')}`,
    `※ 신호등급·합류 참고 — 승률·수익 보장 아님`,
  ].join('\n');
}

async function sendHqTouchAlert(
  symbol: string,
  timeframe: string,
  z: HqEntryZone,
  candles: Candle[],
  price: number,
  chartImageOn: boolean
): Promise<{ ok: boolean; photo: boolean }> {
  const caption = buildCaption(symbol, timeframe, z, price);
  if (chartImageOn && candles.length >= 4) {
    const svg = buildTelegramHqZoneChartSvg({
      symbol,
      timeframe,
      candles,
      zone: z,
      currentPrice: price,
    });
    const png = await telegramAlertChartSvgToPng(svg);
    if (png) {
      const sent = await sendTelegramPhotoPngToEnvChat(caption, png);
      return { ok: sent.ok, photo: sent.ok };
    }
  }
  const sent = await sendTelegramHtmlToEnvChat(caption.replace(/\n/g, '\n'));
  return { ok: sent.ok, photo: false };
}

export async function runTelegramHqZoneTouchForUser(
  user: string,
  settings: UserSettings,
  stats: TelegramHqZoneStats
): Promise<void> {
  if (settings.telegramHqZoneTouchEnabled === false) return;
  const base = internalApiBaseUrl();
  const pairs = buildTelegramMultiTfPairListFromSettings(settings);
  if (!pairs.length) return;

  const chartImageOn = settings.telegramConfirmChartImageEnabled !== false;
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

    const candles = candlesFromAnalysis(analysis);
    if (candles.length < 24) {
      stats.noTouch += 1;
      continue;
    }

    const swingRetrace = buildMergedDeskSwingRetracePack(candles, timeframe);
    const keyZones = detectMergedAnalysisKeyZones(candles, timeframe);
    const pack = buildMergedDeskHqEntryZonesPack({
      candles,
      timeframe,
      keyZones,
      swingRetrace,
      currentPrice: analysis.currentPrice ?? null,
    });
    const touches = detectHqZoneTouchTransitions(pack, candles);
    if (!touches.length) {
      stats.noTouch += 1;
      continue;
    }

    const price = analysis.currentPrice ?? candles[candles.length - 1]!.close;
    for (const z of touches) {
      const dedupeKey = `hq-touch|${user}|${symbol}|${tf}|${z.side}|${z.grade}|${Math.round(z.mid)}`;
      const ok = await telegramEventDedupServerTry(dedupeKey, TOUCH_COOLDOWN_MS);
      if (!ok) {
        stats.dedupSkip += 1;
        continue;
      }
      const sent = await sendHqTouchAlert(symbol, timeframe, z, candles, price, chartImageOn);
      if (sent.ok) {
        stats.touchSent += 1;
        if (sent.photo) stats.photoSent += 1;
        console.info('[telegram-hq-zone] touch sent', {
          user,
          symbol,
          timeframe,
          side: z.side,
          grade: z.grade,
          photo: sent.photo,
        });
      } else {
        stats.sendErr += 1;
      }
    }
  }
}

export function emptyHqZoneStats(): TelegramHqZoneStats {
  return {
    hqUsers: 0,
    pairRuns: 0,
    touchSent: 0,
    photoSent: 0,
    dedupSkip: 0,
    fetchErr: 0,
    sendErr: 0,
    noTouch: 0,
  };
}
