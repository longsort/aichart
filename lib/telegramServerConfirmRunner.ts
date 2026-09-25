/**
 * 서버 텔레 자동 알림.
 * 우선: 통합·분석 스윙중투 ENTER·★타점·TP·무효(+PNG) — 앱 미접속.
 * 레거시: HQ 진입존만 / 확정·HTF (통합텔레 OFF일 때).
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { UserSettings } from '@/lib/settings';
import type { AnalyzeResponse } from '@/types';
import type { UIMode } from '@/lib/settings';
import { buildTelegramBackgroundAnalyzeUrlWithSettings } from '@/lib/telegramBackgroundAnalyzeQuery';
import {
  buildTelegramMultiTfPairListFromSettings,
  TELEGRAM_MULTITF_ALLOWED_TFS,
} from '@/lib/telegramMultiTfPairList';
import { telegramEventDedupServerTry } from '@/lib/telegramEventDedupServer';
import {
  formatTelegramUnifiedAlertHtml,
  type TelegramServerAlertKind,
  type TelegramUnifiedAlertParams,
} from '@/lib/telegramUnifiedAlertMessage';
import {
  sendTelegramHtmlCaptionToEnvChat,
  sendTelegramHtmlToEnvChat,
  sendTelegramPhotoPngHtmlCaption,
} from '@/lib/telegramBotSendHtml';
import { trimTelegramHtmlCaption } from '@/lib/telegramFormatHtml';
import {
  buildTelegramServerDeskBundle,
  detectPriceAtEntryTransition,
} from '@/lib/telegramServerDeskEval';
import {
  detectConfirmNotifyTransition,
  type ConfirmNotifyKind,
  type ConfirmPhase,
} from '@/lib/tradeConfirmDesk';
import {
  getTelegramServerPhase,
  setTelegramServerPhase,
  type TelegramServerPhaseRow,
} from '@/lib/telegramServerPhaseState';
import { evaluateBackgroundHtfTelegram } from '@/lib/telegramBackgroundHtfEval';
import { resolveServerUnifiedLevels } from '@/lib/telegramServerUnifiedLevels';
import { detectTpHitTransition, type TelegramTpHitKind } from '@/lib/telegramServerTpHit';
import {
  buildTelegramAlertChartSvg,
  telegramAlertChartSvgToPng,
} from '@/lib/telegramAlertChartImage';
import {
  emptyHqZoneStats,
  runTelegramHqZoneTouchForUser,
  type TelegramHqZoneStats,
} from '@/lib/telegramHqZoneTouchRunner';
import {
  emptyTelegramSfpAlertStats,
  runTelegramSfpAlertForUser,
} from '@/lib/telegramSfpAlertRunner';
import {
  emptyMergedDeskAutoStats,
  runTelegramMergedDeskAutoForUser,
  type TelegramMergedDeskAutoStats,
} from '@/lib/telegramMergedDeskAutoRunner';
import {
  emptyZoneTouchStats,
  runTelegramZoneTouchForUser,
  type TelegramZoneTouchStats,
} from '@/lib/telegramZoneTouchAutoRunner';

const CONFIRM_COOLDOWN_MS: Record<ConfirmNotifyKind, number> = {
  candidate: 60 * 60_000,
  confirmed: 20 * 60_000,
  confirmed_full: 20 * 60_000,
  at_entry: 30 * 60_000,
  invalid: 10 * 60_000,
};

const TP_COOLDOWN_MS: Record<TelegramTpHitKind, number> = {
  tp1: 30 * 60_000,
  tp2: 30 * 60_000,
  tp3: 30 * 60_000,
};

const CHART_PHOTO_KINDS = new Set<TelegramServerAlertKind>([
  'confirmed',
  'confirmed_full',
  'at_entry',
  'tp1',
  'tp2',
  'tp3',
]);

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function gradeFromScore(score: number): string {
  if (score >= 72) return 'A';
  if (score >= 58) return 'B';
  if (score >= 42) return 'C';
  return 'D';
}

function simpleProspectScore(
  desk: ReturnType<typeof buildTelegramServerDeskBundle>['desk'],
  bundle: NonNullable<ReturnType<typeof buildTelegramServerDeskBundle>>
): number {
  let score = 38;
  score += desk.gatesPassCount * 9;
  if (desk.isFullConfirm) score += 14;
  if (bundle.ta.whaleAligned === true) score += 8;
  if (bundle.ta.whaleAligned === false) score -= 6;
  if (desk.mtfBlocked) score -= 10;
  return clamp(Math.round(score), 0, 100);
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
  const analyzeHeaderSecret = (process.env.INTERNAL_ANALYZE_SECRET || process.env.TELEGRAM_MULTITF_CRON_SECRET || '').trim();
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

function buildAlertParams(
  symbol: string,
  timeframe: string,
  kind: TelegramServerAlertKind,
  bundle: NonNullable<ReturnType<typeof buildTelegramServerDeskBundle>>,
  analysis: AnalyzeResponse,
  unified: ReturnType<typeof resolveServerUnifiedLevels>
): TelegramUnifiedAlertParams {
  const prospectScore = simpleProspectScore(bundle.desk, bundle);
  return {
    symbol,
    timeframe,
    kind,
    desk: bundle.desk,
    unified: {
      entry: unified.entry,
      sl: unified.sl,
      tp1: unified.tp1,
      tp2: unified.tp2,
      tp3: unified.tp3,
      sourceKo: unified.sourceKo,
    },
    temporalLine: bundle.temporalLine,
    learningLine: bundle.learningLine,
    prospectScore,
    prospectGrade: gradeFromScore(prospectScore),
    currentPrice: analysis.currentPrice ?? bundle.levels.close,
    serverAuto: true,
  };
}

async function sendUnifiedAlert(
  params: TelegramUnifiedAlertParams,
  bundle: NonNullable<ReturnType<typeof buildTelegramServerDeskBundle>>,
  chartImageOn: boolean
): Promise<{ ok: boolean; photo: boolean }> {
  const html = formatTelegramUnifiedAlertHtml(params);
  const useChart =
    chartImageOn &&
    CHART_PHOTO_KINDS.has(params.kind) &&
    bundle.candles.length >= 4;

  if (useChart) {
    const svg = buildTelegramAlertChartSvg({
      symbol: params.symbol,
      timeframe: params.timeframe,
      candles: bundle.candles,
      levels: {
        entry: params.unified?.entry ?? null,
        sl: params.unified?.sl ?? null,
        tp1: params.unified?.tp1 ?? null,
        tp2: params.unified?.tp2 ?? null,
        tp3: params.unified?.tp3 ?? null,
      },
      direction: bundle.desk.direction,
      kindLabel: params.kind.startsWith('tp') ? `TP ${params.kind.slice(2)}` : params.kind,
    });
    const png = await telegramAlertChartSvgToPng(svg);
    if (png) {
      const caption = trimTelegramHtmlCaption(
        `${html.split('\n').slice(0, 6).join('\n')}\n<i>▼ 상세 브리핑 이어짐</i>`
      );
      const sent = await sendTelegramPhotoPngHtmlCaption(caption, png);
      if (sent.ok) {
        await sendTelegramHtmlCaptionToEnvChat(html);
        return { ok: true, photo: true };
      }
    }
  }

  const sent = await sendTelegramHtmlCaptionToEnvChat(html);
  return { ok: sent.ok, photo: false };
}

function shouldResetTpHits(
  prev: TelegramServerPhaseRow | null,
  bundle: NonNullable<ReturnType<typeof buildTelegramServerDeskBundle>>
): boolean {
  if (!prev) return true;
  if (bundle.desk.phase === 'invalid' || bundle.desk.phase === 'wait') return true;
  if (prev.direction !== bundle.desk.direction) return true;
  if (prev.phase === 'invalid') return true;
  return false;
}

export type TelegramAutoAlertStats = {
  users: number;
  confirmUsers: number;
  htfUsers: number;
  hqUsers: number;
  mergedDeskUsers: number;
  pairRuns: number;
  confirmSent: number;
  tpSent: number;
  photoSent: number;
  htfSent: number;
  hqTouchSent: number;
  zoneTouchSent: number;
  moneyEntrySent: number;
  precisionTouchSent: number;
  mergedPlanSent: number;
  mergedEntrySent: number;
  mergedTpSent: number;
  mergedInvalidSent: number;
  skippedCandidate: number;
  dedupSkip: number;
  fetchErr: number;
  evalNull: number;
  sendErr: number;
  noTouch: number;
  skippedTf: number;
  sfpSent: number;
};

export async function runTelegramAutoAlertForUser(
  user: string,
  settings: UserSettings,
  stats: TelegramAutoAlertStats
): Promise<void> {
  const sfpStats = emptyTelegramSfpAlertStats();
  await runTelegramSfpAlertForUser(user, settings, sfpStats);
  stats.pairRuns += sfpStats.pairRuns;
  stats.sfpSent += sfpStats.sent;
  stats.photoSent += sfpStats.photoSent;
  stats.dedupSkip += sfpStats.dedupSkip;
  stats.fetchErr += sfpStats.fetchErr;
  stats.sendErr += sfpStats.sendErr;
  stats.noTouch += sfpStats.noHit;

  /** 통합·분석 스윙중투 자동 (기본 ON) — 앱 미접속 서버 분석·캡처 */
  const mergedOn = settings.telegramMergedDeskAutoEnabled !== false;
  if (mergedOn) {
    const mStats: TelegramMergedDeskAutoStats = emptyMergedDeskAutoStats();
    await runTelegramMergedDeskAutoForUser(user, settings, mStats);
    stats.pairRuns += mStats.pairRuns;
    stats.mergedPlanSent += mStats.planSent;
    stats.mergedEntrySent += mStats.entrySent;
    stats.mergedTpSent += mStats.tpSent;
    stats.mergedInvalidSent += mStats.invalidSent;
    stats.hqTouchSent += mStats.hqTouchSent;
    stats.zoneTouchSent += mStats.zoneTouchSent;
    stats.moneyEntrySent = (stats.moneyEntrySent || 0) + (mStats.moneyEntrySent || 0);
    stats.precisionTouchSent = (stats.precisionTouchSent || 0) + (mStats.precisionTouchSent || 0);
    stats.photoSent += mStats.photoSent;
    stats.dedupSkip += mStats.dedupSkip;
    stats.fetchErr += mStats.fetchErr;
    stats.evalNull += mStats.evalNull;
    stats.sendErr += mStats.sendErr;
    stats.skippedTf += mStats.skippedTf;
    stats.tpSent += mStats.tpSent;
    return;
  }

  /** 레거시: HQ 진입존만 ON이면 확정/HTF 스킵 */
  const hqOn = settings.telegramHqZoneTouchEnabled !== false;
  if (hqOn) {
    const hqStats: TelegramHqZoneStats = emptyHqZoneStats();
    await runTelegramHqZoneTouchForUser(user, settings, hqStats);
    stats.pairRuns += hqStats.pairRuns;
    stats.hqTouchSent += hqStats.touchSent;
    stats.photoSent += hqStats.photoSent;
    stats.dedupSkip += hqStats.dedupSkip;
    stats.fetchErr += hqStats.fetchErr;
    stats.sendErr += hqStats.sendErr;
    stats.noTouch += hqStats.noTouch;
    if (settings.telegramZoneTouchAlertEnabled !== false) {
      const zt: TelegramZoneTouchStats = emptyZoneTouchStats();
      await runTelegramZoneTouchForUser(user, settings, zt);
      stats.pairRuns += zt.pairRuns;
      stats.zoneTouchSent += zt.touchSent;
      stats.photoSent += zt.photoSent;
      stats.dedupSkip += zt.dedupSkip;
      stats.fetchErr += zt.fetchErr;
      stats.sendErr += zt.sendErr;
      stats.noTouch += zt.noTouch;
    }
    return;
  }

  if (settings.telegramZoneTouchAlertEnabled !== false) {
    const zt: TelegramZoneTouchStats = emptyZoneTouchStats();
    await runTelegramZoneTouchForUser(user, settings, zt);
    stats.pairRuns += zt.pairRuns;
    stats.zoneTouchSent += zt.touchSent;
    stats.photoSent += zt.photoSent;
    stats.dedupSkip += zt.dedupSkip;
    stats.fetchErr += zt.fetchErr;
    stats.sendErr += zt.sendErr;
    stats.noTouch += zt.noTouch;
  }

  const confirmOn = settings.telegramConfirmEnabled === true;
  const htfOn = settings.telegramMultiTfEnabled === true;
  if (!confirmOn && !htfOn) return;

  const base = internalApiBaseUrl();
  const pairs = buildTelegramMultiTfPairListFromSettings(settings);
  if (!pairs.length) return;
  const candidateOn = settings.telegramConfirmCandidate === true;
  const chartImageOn = settings.telegramConfirmChartImageEnabled !== false;

  for (const [symbol, timeframe] of pairs) {
    const tf = String(timeframe || '').toLowerCase();
    if (!TELEGRAM_MULTITF_ALLOWED_TFS.has(tf)) continue;
    stats.pairRuns += 1;

    const uiMode: UIMode = 'MERGED_ANALYSIS_DESK';
    const analysis = await fetchAnalyze(base, settings, symbol, timeframe, uiMode);
    if (!analysis) {
      stats.fetchErr += 1;
      continue;
    }

    if (confirmOn) {
      const bundle = buildTelegramServerDeskBundle(analysis, timeframe);
      if (!bundle) {
        stats.evalNull += 1;
      } else {
        const prev = getTelegramServerPhase(user, symbol, timeframe);
        const prevPhase: ConfirmPhase | null = prev?.phase ?? null;
        const unified = resolveServerUnifiedLevels(analysis, bundle);
        const price = analysis.currentPrice ?? bundle.levels.close;

        let confirmKind =
          detectConfirmNotifyTransition(prevPhase, bundle.desk) ??
          detectPriceAtEntryTransition(prevPhase, bundle);

        if (confirmKind === 'candidate' && !candidateOn) {
          stats.skippedCandidate += 1;
          confirmKind = null;
        }

        let tpHitKind: TelegramTpHitKind | null = null;
        if (!confirmKind) {
          tpHitKind = detectTpHitTransition(prev, price, bundle.desk.direction, {
            tp1: unified.tp1,
            tp2: unified.tp2,
            tp3: unified.tp3,
          });
        }

        let lastTpHitSent: TelegramTpHitKind | null = null;

        if (confirmKind && bundle.desk.notifyKey) {
          const dedupeKey = `confirm|${user}|${symbol}|${tf}|${confirmKind}|${bundle.desk.notifyKey}`;
          const ok = await telegramEventDedupServerTry(dedupeKey, CONFIRM_COOLDOWN_MS[confirmKind]);
          if (!ok) {
            stats.dedupSkip += 1;
          } else {
            const params = buildAlertParams(symbol, timeframe, confirmKind, bundle, analysis, unified);
            const sent = await sendUnifiedAlert(params, bundle, chartImageOn);
            if (sent.ok) {
              stats.confirmSent += 1;
              if (sent.photo) stats.photoSent += 1;
              console.info('[telegram-auto-alert] confirm sent', { user, symbol, timeframe, kind: confirmKind, photo: sent.photo });
            } else {
              stats.sendErr += 1;
            }
          }
        }

        if (tpHitKind) {
          const dedupeKey = `tp|${user}|${symbol}|${tf}|${tpHitKind}|${Math.round((unified[tpHitKind] ?? 0) * 100)}`;
          const ok = await telegramEventDedupServerTry(dedupeKey, TP_COOLDOWN_MS[tpHitKind]);
          if (!ok) {
            stats.dedupSkip += 1;
          } else {
            const params = buildAlertParams(symbol, timeframe, tpHitKind, bundle, analysis, unified);
            const sent = await sendUnifiedAlert(params, bundle, chartImageOn);
            if (sent.ok) {
              stats.tpSent += 1;
              if (sent.photo) stats.photoSent += 1;
              lastTpHitSent = tpHitKind;
              console.info('[telegram-auto-alert] tp sent', { user, symbol, timeframe, kind: tpHitKind, photo: sent.photo });
            } else {
              stats.sendErr += 1;
            }
          }
        }

        const resetTp = shouldResetTpHits(prev, bundle);
        setTelegramServerPhase(user, symbol, timeframe, {
          phase: bundle.desk.phase,
          direction: bundle.desk.direction,
          entryLo: bundle.desk.entryLow,
          entryHi: bundle.desk.entryHigh,
          entryMid: bundle.levels.entryMid,
          invalidPrice: bundle.desk.invalidPrice,
          tp1: unified.tp1 ?? bundle.desk.tp1,
          tp2: unified.tp2,
          tp3: unified.tp3,
          lastTpHit: lastTpHitSent ?? (resetTp ? null : prev?.lastTpHit ?? null),
          lastPrice: price,
          updatedAt: Date.now(),
          lastNotifyKey: bundle.desk.notifyKey,
        });
      }
    }

    if (htfOn) {
      const ev = evaluateBackgroundHtfTelegram(analysis, symbol, timeframe, settings);
      if (!ev) continue;
      const ok = await telegramEventDedupServerTry(`htf|${ev.eventKey}`, ev.cooldownMs);
      if (!ok) {
        stats.dedupSkip += 1;
        continue;
      }
      const sent = await sendTelegramHtmlToEnvChat(ev.fullBrief);
      if (sent.ok) {
        stats.htfSent += 1;
        console.info('[telegram-auto-alert] htf sent', { user, symbol, timeframe, eventKey: ev.eventKey });
      } else {
        stats.sendErr += 1;
      }
    }
  }
}

export async function runTelegramAutoAlertAll(
  allUsers: Record<string, Record<string, unknown> | null | undefined>
): Promise<TelegramAutoAlertStats> {
  const stats: TelegramAutoAlertStats = {
    users: 0,
    confirmUsers: 0,
    htfUsers: 0,
    hqUsers: 0,
    mergedDeskUsers: 0,
    pairRuns: 0,
    confirmSent: 0,
    tpSent: 0,
    photoSent: 0,
    htfSent: 0,
    hqTouchSent: 0,
    zoneTouchSent: 0,
    moneyEntrySent: 0,
    precisionTouchSent: 0,
    mergedPlanSent: 0,
    mergedEntrySent: 0,
    mergedTpSent: 0,
    mergedInvalidSent: 0,
    skippedCandidate: 0,
    dedupSkip: 0,
    fetchErr: 0,
    evalNull: 0,
    sendErr: 0,
    noTouch: 0,
    skippedTf: 0,
    sfpSent: 0,
  };

  const { mergeUserSettingsFromServerJson } = await import('@/lib/mergeUserSettingsFromServerJson');

  for (const [user, raw] of Object.entries(allUsers)) {
    if (!raw || typeof raw !== 'object') continue;
    const st = mergeUserSettingsFromServerJson(raw);
    const mergedOn = st.telegramMergedDeskAutoEnabled !== false;
    const hqOn = !mergedOn && st.telegramHqZoneTouchEnabled !== false;
    const confirmOn = !mergedOn && !hqOn && st.telegramConfirmEnabled === true;
    const htfOn = !mergedOn && !hqOn && st.telegramMultiTfEnabled === true;
    const zoneOn = st.telegramZoneTouchAlertEnabled !== false;
    if (!mergedOn && !hqOn && !confirmOn && !htfOn && !zoneOn) continue;
    stats.users += 1;
    if (mergedOn) stats.mergedDeskUsers += 1;
    if (hqOn) stats.hqUsers += 1;
    if (confirmOn) stats.confirmUsers += 1;
    if (htfOn) stats.htfUsers += 1;
    await runTelegramAutoAlertForUser(user, st, stats);
  }

  return stats;
}
