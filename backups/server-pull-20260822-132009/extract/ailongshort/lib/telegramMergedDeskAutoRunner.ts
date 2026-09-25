/**
 * 서버 자동 — 통합·분석 스윙중투 롱/숏 자리 → 텔레그램 HTML + 차트 PNG.
 * 앱 미접속. crontab → /api/cron/telegram-auto-alert
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { UserSettings, UIMode } from '@/lib/settings';
import type { AnalyzeResponse } from '@/types';
import { buildTelegramBackgroundAnalyzeUrlWithSettings } from '@/lib/telegramBackgroundAnalyzeQuery';
import {
  buildTelegramMultiTfPairListFromSettings,
  TELEGRAM_MULTITF_ALLOWED_TFS,
} from '@/lib/telegramMultiTfPairList';
import { telegramEventDedupServerTry } from '@/lib/telegramEventDedupServer';
import { sendTelegramHtmlToEnvChat, sendTelegramPhotoPngToEnvChat } from '@/lib/telegramBotSendHtml';
import {
  formatTelegramUnifiedAlertHtml,
  formatTelegramUnifiedAlertPlainCaption,
  type TelegramUnifiedAlertParams,
  type TelegramServerAlertKind,
} from '@/lib/telegramUnifiedAlertMessage';
import {
  getTelegramServerPhase,
  setTelegramServerPhase,
  type TelegramServerPhaseRow,
} from '@/lib/telegramServerPhaseState';
import { detectTpHitTransition, type TelegramTpHitKind } from '@/lib/telegramServerTpHit';
import { pickNextNewsHint, type MergedDeskNewsHint } from '@/lib/mergedDeskVerdictStrip';
import { evalMergedDeskNewsEntryGate } from '@/lib/mergedDeskEntryHardGates';
import {
  buildTelegramAlertChartSvg,
  telegramAlertChartSvgToPng,
} from '@/lib/telegramAlertChartImage';
import { fetchServerTfCloseSettleBoard } from '@/lib/telegramServerSettleBoard';
import {
  buildTelegramMergedDeskEval,
  detectMergedDeskNotifyKind,
  MERGED_DESK_AUTO_ALERT_TFS,
  type TelegramMergedDeskEval,
} from '@/lib/telegramServerMergedDeskEval';
import {
  applyTelegramSendPolicyToConfirmKind,
  readTelegramSendPolicy,
} from '@/lib/telegramSendPolicy';
import {
  buildMergedDeskHqEntryZonesPack,
  detectHqZoneTouchTransitions,
} from '@/lib/mergedDeskHqEntryZones';
import { buildMergedDeskSwingRetracePack } from '@/lib/mergedDeskSwingRetrace';
import { detectMergedAnalysisKeyZones } from '@/lib/mergedAnalysisKeyZones';
import {
  buildTelegramHqZoneChartSvg,
} from '@/lib/telegramAlertChartImage';
import { runTelegramZoneTouchForFetchedPair } from '@/lib/telegramZoneTouchAutoRunner';
import { runTelegramMoneyEntryTouchForFetchedPair } from '@/lib/telegramMoneyEntryTouchRunner';
import type { ConfirmNotifyKind } from '@/lib/tradeConfirmDesk';

const CONFIRM_COOLDOWN_MS: Record<ConfirmNotifyKind, number> = {
  candidate: 60 * 60_000,
  confirmed: 25 * 60_000,
  confirmed_full: 25 * 60_000,
  at_entry: 35 * 60_000,
  invalid: 12 * 60_000,
};

const TP_COOLDOWN_MS: Record<TelegramTpHitKind, number> = {
  tp1: 30 * 60_000,
  tp2: 30 * 60_000,
  tp3: 30 * 60_000,
};

const HQ_TOUCH_COOLDOWN_MS = 45 * 60_000;

const CHART_PHOTO_KINDS = new Set<TelegramServerAlertKind>([
  'confirmed',
  'confirmed_full',
  'at_entry',
  'invalid',
  'tp1',
  'tp2',
  'tp3',
]);

export type TelegramMergedDeskAutoStats = {
  pairRuns: number;
  planSent: number;
  entrySent: number;
  tpSent: number;
  invalidSent: number;
  hqTouchSent: number;
  zoneTouchSent: number;
  moneyEntrySent: number;
  photoSent: number;
  dedupSkip: number;
  fetchErr: number;
  evalNull: number;
  sendErr: number;
  skippedTf: number;
};

function internalApiBaseUrl(): string {
  const b = (process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (b) return b.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const p = process.env.PORT || '3000';
  return `http://127.0.0.1:${p}`;
}

async function fetchNewsHints(base: string): Promise<MergedDeskNewsHint[]> {
  try {
    const res = await fetch(`${base}/api/news-events`, { cache: 'no-store' });
    if (!res.ok) return [];
    const j = (await res.json().catch(() => ({}))) as {
      events?: Array<{ title?: string; timeMs?: number }>;
    };
    return Array.isArray(j.events)
      ? j.events
          .map((e) => ({ title: String(e?.title || '').trim(), timeMs: Number(e?.timeMs) }))
          .filter((e) => e.title && Number.isFinite(e.timeMs))
      : [];
  } catch {
    return [];
  }
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function gradeFromScore(score: number): string {
  if (score >= 72) return 'A';
  if (score >= 58) return 'B';
  if (score >= 42) return 'C';
  return 'D';
}

function prospectFromSwing(ev: TelegramMergedDeskEval): number {
  let score = 40 + Math.round(ev.swing.confluence * 0.45);
  if (ev.swing.grade === 'A') score += 12;
  if (ev.swing.grade === 'B') score += 6;
  if (ev.swing.stance.startsWith('ENTER')) score += 8;
  if (ev.insideEntry) score += 6;
  return clamp(score, 0, 100);
}

function buildAlertParams(
  symbol: string,
  timeframe: string,
  kind: TelegramServerAlertKind,
  ev: TelegramMergedDeskEval
): TelegramUnifiedAlertParams {
  const prospectScore = prospectFromSwing(ev);
  return {
    symbol,
    timeframe,
    kind,
    desk: ev.desk,
    unified: {
      entry: ev.levels.entry,
      sl: ev.levels.sl,
      tp1: ev.levels.tp1,
      tp2: ev.levels.tp2,
      tp3: ev.levels.tp3,
      inv: ev.levels.inv,
      sourceKo: ev.levels.sourceKo,
    },
    temporalLine: ev.swing.whereKo?.slice(0, 160) ?? null,
    learningLine: ev.learningLine,
    riskLine: ev.riskLine,
    prospectScore,
    prospectGrade: gradeFromScore(prospectScore),
    currentPrice: ev.price,
    serverAuto: true,
  };
}

async function sendUnifiedAlert(
  params: TelegramUnifiedAlertParams,
  ev: TelegramMergedDeskEval,
  chartImageOn: boolean
): Promise<{ ok: boolean; photo: boolean }> {
  const html = formatTelegramUnifiedAlertHtml(params);
  const useChart =
    chartImageOn && CHART_PHOTO_KINDS.has(params.kind) && ev.candles.length >= 4;

  if (useChart) {
    const svg = buildTelegramAlertChartSvg({
      symbol: params.symbol,
      timeframe: params.timeframe,
      candles: ev.candles,
      levels: {
        entry: params.unified?.entry ?? null,
        sl: params.unified?.sl ?? null,
        tp1: params.unified?.tp1 ?? null,
        tp2: params.unified?.tp2 ?? null,
        tp3: params.unified?.tp3 ?? null,
        inv: params.unified?.inv ?? null,
      },
      direction: ev.desk.direction,
      kindLabel:
        params.kind === 'at_entry'
          ? '진입자리'
          : params.kind.startsWith('tp')
            ? `TP ${params.kind.slice(2)}`
            : params.kind === 'confirmed_full'
              ? '돌파안착'
              : params.kind === 'confirmed'
                ? '플랜 ENTER'
                : params.kind === 'invalid'
                  ? '무효'
                  : params.kind,
    });
    const png = await telegramAlertChartSvgToPng(svg);
    if (png) {
      const caption = formatTelegramUnifiedAlertPlainCaption(params);
      const sent = await sendTelegramPhotoPngToEnvChat(caption, png);
      if (sent.ok) return { ok: true, photo: true };
    }
  }

  const sent = await sendTelegramHtmlToEnvChat(html);
  return { ok: sent.ok, photo: false };
}

function shouldResetTpHits(prev: TelegramServerPhaseRow | null, ev: TelegramMergedDeskEval): boolean {
  if (!prev) return true;
  if (ev.desk.phase === 'invalid' || ev.desk.phase === 'wait') return true;
  if (prev.direction !== ev.desk.direction) return true;
  if (prev.phase === 'invalid') return true;
  return false;
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

export function emptyMergedDeskAutoStats(): TelegramMergedDeskAutoStats {
  return {
    pairRuns: 0,
    planSent: 0,
    entrySent: 0,
    tpSent: 0,
    invalidSent: 0,
    hqTouchSent: 0,
    zoneTouchSent: 0,
    moneyEntrySent: 0,
    photoSent: 0,
    dedupSkip: 0,
    fetchErr: 0,
    evalNull: 0,
    sendErr: 0,
    skippedTf: 0,
  };
}

/**
 * 사용자 설정 기준 — 통합 데스크 자동 텔레 (우선 경로).
 */
export async function runTelegramMergedDeskAutoForUser(
  user: string,
  settings: UserSettings,
  stats: TelegramMergedDeskAutoStats
): Promise<void> {
  if (settings.telegramMergedDeskAutoEnabled === false) return;

  const policy = readTelegramSendPolicy(settings);
  if (!policy.masterOn) return;

  const base = internalApiBaseUrl();
  const pairs = buildTelegramMultiTfPairListFromSettings(settings);
  if (!pairs.length) return;

  const chartImageOn = policy.chartImage;
  const hqAlso = policy.hqTouch;
  const uiMode: UIMode = 'MERGED_ANALYSIS_DESK';

  const settleBySymbol = new Map<string, Awaited<ReturnType<typeof fetchServerTfCloseSettleBoard>>>();
  const newsHint = pickNextNewsHint(await fetchNewsHints(base));

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

    if (!settleBySymbol.has(symbol)) {
      settleBySymbol.set(symbol, await fetchServerTfCloseSettleBoard(base, symbol));
    }
    const settleBoard = settleBySymbol.get(symbol) ?? null;

    const prev = getTelegramServerPhase(user, symbol, timeframe);
    const ev = buildTelegramMergedDeskEval(analysis, timeframe, settleBoard, prev, newsHint);
    if (settings.telegramZoneTouchAlertEnabled !== false) {
      const zt = await runTelegramZoneTouchForFetchedPair({
        user,
        settings,
        symbol,
        timeframe,
        analysis,
        candles: ev?.candles,
        price: ev?.price ?? analysis.currentPrice ?? undefined,
      });
      stats.zoneTouchSent += zt.touchSent;
      stats.photoSent += zt.photoSent;
      stats.dedupSkip += zt.dedupSkip;
      stats.sendErr += zt.sendErr;
    }
    /** 핵심: 롱/숏 진입자리 · $$$$ 돈구간 터치 */
    if (settings.telegramMoneyEntryTouchEnabled !== false) {
      const me = await runTelegramMoneyEntryTouchForFetchedPair({
        user,
        settings,
        symbol,
        timeframe,
        analysis,
        candles: ev?.candles,
        price: ev?.price ?? analysis.currentPrice ?? undefined,
        ev: ev ?? null,
      });
      stats.moneyEntrySent += me.touchSent;
      stats.photoSent += me.photoSent;
      stats.dedupSkip += me.dedupSkip;
      stats.sendErr += me.sendErr;
    }
    if (!ev) {
      stats.evalNull += 1;
      continue;
    }

    let confirmKind = applyTelegramSendPolicyToConfirmKind(
      detectMergedDeskNotifyKind(prev, ev),
      ev,
      policy
    );
    if (
      policy.newsSkipEnter &&
      (ev.newsBlocked || evalMergedDeskNewsEntryGate(newsHint)?.blockEnter) &&
      confirmKind &&
      (confirmKind === 'at_entry' || confirmKind === 'confirmed' || confirmKind === 'confirmed_full')
    ) {
      confirmKind = null;
    }
    let tpHitKind: TelegramTpHitKind | null = null;
    if (!confirmKind && policy.tpHit) {
      tpHitKind = detectTpHitTransition(prev, ev.price, ev.desk.direction, {
        tp1: ev.levels.tp1,
        tp2: ev.levels.tp2,
        tp3: ev.levels.tp3,
      });
    }

    let lastTpHitSent: TelegramTpHitKind | null = null;

    if (confirmKind && ev.desk.notifyKey) {
      const dedupeKey = `merged|${user}|${symbol}|${tf}|${confirmKind}|${ev.desk.notifyKey}`;
      const ok = await telegramEventDedupServerTry(dedupeKey, CONFIRM_COOLDOWN_MS[confirmKind]);
      if (!ok) {
        stats.dedupSkip += 1;
      } else {
        const params = buildAlertParams(symbol, timeframe, confirmKind, ev);
        const sent = await sendUnifiedAlert(params, ev, chartImageOn);
        if (sent.ok) {
          if (confirmKind === 'at_entry') stats.entrySent += 1;
          else if (confirmKind === 'invalid') stats.invalidSent += 1;
          else stats.planSent += 1;
          if (sent.photo) stats.photoSent += 1;
          console.info('[telegram-merged-desk] sent', {
            user,
            symbol,
            timeframe,
            kind: confirmKind,
            stance: ev.swing.stance,
            photo: sent.photo,
          });
        } else {
          stats.sendErr += 1;
        }
      }
    }

    if (tpHitKind) {
      const dedupeKey = `merged-tp|${user}|${symbol}|${tf}|${tpHitKind}|${Math.round((ev.levels[tpHitKind] ?? 0) * 100)}`;
      const ok = await telegramEventDedupServerTry(dedupeKey, TP_COOLDOWN_MS[tpHitKind]);
      if (!ok) {
        stats.dedupSkip += 1;
      } else {
        const params = buildAlertParams(symbol, timeframe, tpHitKind, ev);
        const sent = await sendUnifiedAlert(params, ev, chartImageOn);
        if (sent.ok) {
          stats.tpSent += 1;
          if (sent.photo) stats.photoSent += 1;
          lastTpHitSent = tpHitKind;
          console.info('[telegram-merged-desk] tp sent', {
            user,
            symbol,
            timeframe,
            kind: tpHitKind,
            photo: sent.photo,
          });
        } else {
          stats.sendErr += 1;
        }
      }
    }

    // 선택: HQ 존 터치 (ENTER 없을 때만 — 되돌림 자리)
    if (hqAlso && !confirmKind && ev.candles.length >= 24) {
      const swingRetrace = buildMergedDeskSwingRetracePack(ev.candles, timeframe);
      const keyZones = detectMergedAnalysisKeyZones(ev.candles, timeframe);
      const hqPack = buildMergedDeskHqEntryZonesPack({
        candles: ev.candles,
        timeframe,
        keyZones,
        swingRetrace,
        currentPrice: ev.price,
      });
      const touches = detectHqZoneTouchTransitions(hqPack, ev.candles);
      for (const z of touches) {
        if (ev.swing.stance.startsWith('ENTER') && z.side === ev.swing.side) continue;
        const dedupeKey = `merged-hq|${user}|${symbol}|${tf}|${z.side}|${z.grade}|${Math.round(z.mid)}`;
        const ok = await telegramEventDedupServerTry(dedupeKey, HQ_TOUCH_COOLDOWN_MS);
        if (!ok) {
          stats.dedupSkip += 1;
          continue;
        }
        const caption = [
          `🎯 ${z.side === 'LONG' ? '롱자리' : '숏자리'} 터치 · ${symbol} ${timeframe}`,
          z.labelKo,
          `구간 ${fmtPx(z.bot)} ~ ${fmtPx(z.top)}`,
          `현재가 ${fmtPx(ev.price)}`,
          z.reasonKo,
          `스윙중투: ${ev.swing.stance} · 합류 ${ev.swing.confluence}%`,
          `※ 신호등급·합류 참고 — 승률·수익 보장 아님`,
        ].join('\n');
        let sentOk = false;
        let photo = false;
        if (chartImageOn) {
          const svg = buildTelegramHqZoneChartSvg({
            symbol,
            timeframe,
            candles: ev.candles,
            zone: z,
            currentPrice: ev.price,
          });
          const png = await telegramAlertChartSvgToPng(svg);
          if (png) {
            const sent = await sendTelegramPhotoPngToEnvChat(caption, png);
            sentOk = sent.ok;
            photo = sent.ok;
          }
        }
        if (!sentOk) {
          const sent = await sendTelegramHtmlToEnvChat(caption);
          sentOk = sent.ok;
        }
        if (sentOk) {
          stats.hqTouchSent += 1;
          if (photo) stats.photoSent += 1;
        } else {
          stats.sendErr += 1;
        }
      }
    }

    const resetTp = shouldResetTpHits(prev, ev);
    setTelegramServerPhase(user, symbol, timeframe, {
      phase: ev.desk.phase,
      direction: ev.desk.direction,
      entryLo: ev.desk.entryLow,
      entryHi: ev.desk.entryHigh,
      entryMid: ev.levels.entry,
      invalidPrice: ev.levels.sl ?? ev.desk.invalidPrice,
      tp1: ev.levels.tp1,
      tp2: ev.levels.tp2,
      tp3: ev.levels.tp3,
      lastTpHit: lastTpHitSent ?? (resetTp ? null : prev?.lastTpHit ?? null),
      lastPrice: ev.price,
      updatedAt: Date.now(),
      lastNotifyKey: ev.desk.notifyKey,
    });
  }
}
