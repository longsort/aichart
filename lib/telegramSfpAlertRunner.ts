/**
 * SFP(스윕 후 종가 회수) — LTF/HTF·일/주/월 봉에서 뜨면 차트 캡처 + 텔레그램.
 * 앱 미접속. Next 자체 루프 또는 crontab → /api/cron/telegram-auto-alert
 * 차트 SFP↑/SFP↓ 마커와 동일 감지(파랑빨강띠 레일). 확정 수익 아님.
 *
 * 기본 스캔 TF: 15m·1h·4h·1d·1w·1M
 * settings.telegramMultiTfTimeframes 가 있으면 허용 TF만 합집합(1m~5m는 텔레 SFP에서 제외).
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { UserSettings, UIMode } from '@/lib/settings';
import { defaultSettings } from '@/lib/settings';
import { normalizeChartTimeframe } from '@/lib/constants';
import { buildTelegramBackgroundAnalyzeUrlWithSettings } from '@/lib/telegramBackgroundAnalyzeQuery';
import { telegramEventDedupServerTry } from '@/lib/telegramEventDedupServer';
import { sendTelegramDeskAlertPhoto } from '@/lib/telegramMergedDeskPhotoSend';
import { buildTelegramZoneTouchChartSvg } from '@/lib/telegramAlertChartImage';
import { sendTelegramHtmlCaptionToEnvChat } from '@/lib/telegramBotSendHtml';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import { detectRbRailSfp } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import {
  telegramAssetPricePlausible,
  telegramPriceCompatibleWithAnchor,
} from '@/lib/telegramSymbolPriceGuard';
import { isTelegramAnalyzableSymbol } from '@/lib/analyzeSymbolSupport';
import { MERGED_DESK_SHARED_TELEGRAM_TFS } from '@/lib/mergedDeskSharedTfFeatures';

/** 요청 TF: 15m·1h·4h·1d·1w·1M (LTF 1m~5m는 부하·타임아웃 유발 → 제외) */
export const TELEGRAM_SFP_ALERT_TFS = ['15m', '1h', '4h', '1d', '1w', '1M'] as const;

const SFP_COOLDOWN_MS = 90 * 60_000;

export type TelegramSfpAlertStats = {
  pairRuns: number;
  sent: number;
  photoSent: number;
  dedupSkip: number;
  fetchErr: number;
  sendErr: number;
  noHit: number;
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

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 3) return 0;
  const start = Math.max(1, n - 14);
  let sum = 0;
  let cnt = 0;
  for (let i = start; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    cnt += 1;
  }
  return cnt ? sum / cnt : 0;
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

export function sfpTfScopeKo(tf: string): { bucket: 'LTF' | 'HTF'; tfKo: string } {
  const t = normalizeChartTimeframe(tf);
  const names: Record<string, string> = {
    '1m': '1분봉',
    '3m': '3분봉',
    '5m': '5분봉',
    '15m': '15분봉',
    '1h': '1시간봉',
    '4h': '4시간봉',
    '1d': '일봉',
    '1w': '주봉',
    '1M': '월봉',
  };
  const tfKo = names[t] || t;
  if (t === '1d' || t === '1w' || t === '1M' || t === '4h') {
    return { bucket: 'HTF', tfKo };
  }
  return { bucket: 'LTF', tfKo };
}

function sfpPairsFromSettings(st: UserSettings): [string, string][] {
  const syms = st.telegramMultiTfSymbols?.length
    ? st.telegramMultiTfSymbols
    : defaultSettings.telegramMultiTfSymbols;
  const tfSet = new Set<string>();
  for (const t of TELEGRAM_SFP_ALERT_TFS) tfSet.add(t);
  for (const t of MERGED_DESK_SHARED_TELEGRAM_TFS) tfSet.add(t);
  const fromSettings = st.telegramMultiTfTimeframes?.length
    ? st.telegramMultiTfTimeframes
    : defaultSettings.telegramMultiTfTimeframes;
  for (const raw of fromSettings) {
    const tf = normalizeChartTimeframe(String(raw || ''));
    if (tf && MERGED_DESK_SHARED_TELEGRAM_TFS.has(tf)) tfSet.add(tf);
  }
  const out: [string, string][] = [];
  for (const rawS of syms) {
    const s = String(rawS || '')
      .trim()
      .toUpperCase();
    if (!s) continue;
    if (!isTelegramAnalyzableSymbol(s)) continue;
    for (const tf of tfSet) {
      out.push([s, tf]);
    }
  }
  return out;
}

/** 마감봉(형성봉 직전) SFP만 — 리페인트 알림 방지 */
function sfpOnRecentBars(
  candles: Candle[],
  hit: { side: 'bull' | 'bear'; price: number; time: number } | null
): { side: 'bull' | 'bear'; price: number; time: number } | null {
  if (!hit || candles.length < 3) return null;
  const tLive = Number(candles[candles.length - 1]!.time);
  const tClosed = Number(candles[candles.length - 2]!.time);
  const t = Number(hit.time);
  if (t !== tLive && t !== tClosed) return null;
  return hit;
}

function captionHtml(params: {
  symbol: string;
  timeframe: string;
  side: 'bull' | 'bear';
  price: number;
  railPx: number;
}): string {
  const { bucket, tfKo } = sfpTfScopeKo(params.timeframe);
  const mark = params.side === 'bull' ? 'SFP↑' : 'SFP↓';
  const sideKo = params.side === 'bull' ? '하단 스윕 후 종가 회수' : '상단 스윕 후 종가 회수';
  const hint =
    params.side === 'bull'
      ? '저점 유동성 털고 회수 · 롱 후보는 상위 TF 확인 필요'
      : '고점 유동성 털고 회수 · 숏 후보는 상위 TF 확인 필요';
  return [
    `<b>${mark} ${params.symbol}</b>`,
    `<b>${bucket} · ${tfKo} (${params.timeframe})</b>`,
    `${sideKo}`,
    `레일 ${fmtPx(params.railPx)} · 현재 ${fmtPx(params.price)}`,
    `<i>${hint}</i>`,
    `<i>참고 신호 · 확정 진입·승률 아님</i>`,
  ].join('\n');
}

export function emptyTelegramSfpAlertStats(): TelegramSfpAlertStats {
  return {
    pairRuns: 0,
    sent: 0,
    photoSent: 0,
    dedupSkip: 0,
    fetchErr: 0,
    sendErr: 0,
    noHit: 0,
  };
}

export async function runTelegramSfpAlertForUser(
  user: string,
  settings: UserSettings,
  stats: TelegramSfpAlertStats
): Promise<void> {
  const base = internalApiBaseUrl();
  const pairs = sfpPairsFromSettings(settings);
  if (!pairs.length) return;
  const uiMode: UIMode = 'MERGED_ANALYSIS_DESK';
  const chartImageOn = settings.telegramConfirmChartImageEnabled !== false;

  for (const [symbol, timeframe] of pairs) {
    stats.pairRuns += 1;
    const analysis = await fetchAnalyze(base, settings, symbol, timeframe, uiMode);
    if (!analysis) {
      stats.fetchErr += 1;
      continue;
    }
    const candles = candlesFromAnalysis(analysis);
    if (candles.length < 24) {
      stats.noHit += 1;
      continue;
    }
    const pack = buildMergedDeskBlueRedChannels(candles, timeframe);
    const geom = pack.geoms.find((g) => g.primary) ?? pack.geoms[0] ?? null;
    if (!geom) {
      stats.noHit += 1;
      continue;
    }
    const atr = atrApprox(candles);
    const raw = detectRbRailSfp(candles, geom, atr);
    const hit = sfpOnRecentBars(candles, raw);
    if (!hit) {
      stats.noHit += 1;
      continue;
    }
    const livePx = Number(analysis.currentPrice ?? candles[candles.length - 1]?.close) || hit.price;
    if (
      !telegramAssetPricePlausible(symbol, livePx) ||
      !telegramPriceCompatibleWithAnchor(livePx, hit.price, 2.5)
    ) {
      stats.noHit += 1;
      continue;
    }
    const tf = normalizeChartTimeframe(timeframe);
    const dedupeKey = `sfp|${user}|${symbol}|${tf}|${hit.side}|${hit.time}`;
    const ok = await telegramEventDedupServerTry(dedupeKey, SFP_COOLDOWN_MS);
    if (!ok) {
      stats.dedupSkip += 1;
      continue;
    }
    const html = captionHtml({
      symbol,
      timeframe: tf,
      side: hit.side,
      price: livePx,
      railPx: hit.price,
    });
    const { bucket, tfKo } = sfpTfScopeKo(tf);
    const mark = hit.side === 'bull' ? 'SFP↑' : 'SFP↓';
    const photoCaption = `<b>${mark} ${symbol} · ${bucket} ${tfKo}</b>\n<i>스윕 회수 · 확정 아님</i>`;
    const pad = Math.max(atr * 0.35, Math.abs(hit.price) * 0.0008);
    let sentOk = false;
    let photoOk = false;
    if (chartImageOn) {
      const sendR = await sendTelegramDeskAlertPhoto({
        captionHtml: html,
        photoCaptionHtml: photoCaption,
        symbol,
        timeframe: tf,
        candles,
        settings,
        apiBase: base,
        buildSvg: () =>
          buildTelegramZoneTouchChartSvg({
            symbol,
            timeframe: tf,
            candles,
            titleKo: `${mark} ${bucket} ${tfKo}`,
            subtitleKo: hit.side === 'bull' ? '하단 스윕 회수' : '상단 스윕 회수',
            zone: {
              top: hit.price + pad,
              bot: hit.price - pad,
              labelKo: mark,
              side: hit.side === 'bull' ? 'LONG' : 'SHORT',
            },
            currentPrice: livePx,
            extraLines: [{ price: hit.price, color: hit.side === 'bull' ? '#4ade80' : '#f87171', label: mark }],
          }),
      });
      sentOk = sendR.ok;
      photoOk = sendR.photo;
    } else {
      const r = await sendTelegramHtmlCaptionToEnvChat(html);
      sentOk = r.ok;
    }
    if (sentOk) {
      stats.sent += 1;
      if (photoOk) stats.photoSent += 1;
      console.info('[telegram-sfp] sent', { user, symbol, tf, side: hit.side, photo: photoOk });
    } else {
      stats.sendErr += 1;
    }
  }
}
