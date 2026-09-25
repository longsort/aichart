/**
 * 서버 자동 — 통합·분석 스윙중투 롱/숏 자리 → 텔레그램 HTML + 차트 PNG.
 * 앱 미접속. crontab → /api/cron/telegram-auto-alert
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { UserSettings, UIMode } from '@/lib/settings';
import type { AnalyzeResponse, Candle } from '@/types';
import { buildTelegramBackgroundAnalyzeUrlWithSettings } from '@/lib/telegramBackgroundAnalyzeQuery';
import {
  buildTelegramMultiTfPairListFromSettings,
  TELEGRAM_MULTITF_ALLOWED_TFS,
} from '@/lib/telegramMultiTfPairList';
import { telegramEventDedupServerTry } from '@/lib/telegramEventDedupServer';
import { sendTelegramHtmlCaptionToEnvChat } from '@/lib/telegramBotSendHtml';
import {
  buildTelegramAlertChartSvg,
} from '@/lib/telegramAlertChartImage';
import { sendTelegramDeskAlertPhoto } from '@/lib/telegramMergedDeskPhotoSend';
import {
  type TelegramUnifiedAlertParams,
  type TelegramServerAlertKind,
} from '@/lib/telegramUnifiedAlertMessage';
import { formatTelegramRealBattleBriefHtml } from '@/lib/telegramRealBattleBriefing';
import {
  buildTelegramRbChannelBriefFromMergedPack,
  mergeTelegramHtmlWithRbChannelBrief,
} from '@/lib/telegramRbChannelBrief';
import {
  buildDoksuri1Pack,
} from '@/lib/doksuri1/buildDoksuri1Pack';
import { fetchDoksuri1WhaleBeamPackServer } from '@/lib/doksuri1/whaleFetchServer';
import {
  buildDoksuri1StateFingerprint,
  shouldEmitDoksuri1StateChange,
} from '@/lib/doksuri1/stateDedupe';
import { buildDoksuri1TelegramAlert, formatDoksuri1PhotoCaptionHtml } from '@/lib/doksuri1/telegramBridge';
import { buildDumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import { buildMergedDeskMtfDumpZonePack } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  getTelegramServerPhase,
  setTelegramServerPhase,
  type TelegramServerPhaseRow,
} from '@/lib/telegramServerPhaseState';
import { detectTpHitTransition, type TelegramTpHitKind } from '@/lib/telegramServerTpHit';
import { pickNextNewsHint, type MergedDeskNewsHint } from '@/lib/mergedDeskVerdictStrip';
import { evalMergedDeskNewsEntryGate } from '@/lib/mergedDeskEntryHardGates';
import {
  buildTelegramAlertChartContext,
  instBandExtraLines,
  type TelegramAlertChartContext,
} from '@/lib/telegramMtfAlertContext';
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
  collectTelegramZoneTouchHits,
  zoneTouchHitBriefInput,
  ZONE_TOUCH_COOLDOWN_MS,
} from '@/lib/telegramZoneTouchAutoRunner';
import {
  collectMoneyEntryTouchHits,
  moneyEntryTouchHitBriefInput,
  MONEY_ENTRY_TOUCH_COOLDOWN_MS,
} from '@/lib/telegramMoneyEntryTouchRunner';
import {
  collectTelegramPrecisionTouchesForPair,
  precisionTouchHitBriefInput,
  PRECISION_TOUCH_COOLDOWN_MS,
} from '@/lib/telegramPrecisionTouchRunner';
import type { ConfirmNotifyKind } from '@/lib/tradeConfirmDesk';
import {
  analysisMatchesTelegramSymbol,
  analysisPriceMatchesTelegramSymbol,
  sanitizeTelegramTradeLevels,
  telegramAssetPricePlausible,
} from '@/lib/telegramSymbolPriceGuard';
import {
  claimDeskBundleSections,
  sendBundledDeskAlert,
  tallyDeskBundleStats,
  type DeskBundleSection,
} from '@/lib/telegramDeskAlertBundle';
import { telegramPriceBucket } from '@/lib/telegramEventDedupServer';
import type { TelegramDeskBriefingInput } from '@/lib/telegramAlertBriefing';

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
  precisionTouchSent: number;
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
    if (!analysisMatchesTelegramSymbol(analysis, symbol)) return null;
    if (!analysisPriceMatchesTelegramSymbol(analysis, symbol)) return null;
    return analysis;
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
  const scrub = sanitizeTelegramTradeLevels(symbol, ev.price, {
    entry: ev.levels.entry,
    sl: ev.levels.sl,
    tp1: ev.levels.tp1,
    tp2: ev.levels.tp2,
    tp3: ev.levels.tp3,
    inv: ev.levels.inv,
  });
  return {
    symbol,
    timeframe,
    kind,
    desk: ev.desk,
    unified: {
      entry: scrub.entry,
      sl: scrub.sl,
      tp1: scrub.tp1,
      tp2: scrub.tp2,
      tp3: scrub.tp3,
      inv: scrub.inv,
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

function confirmKindTagKo(kind: ConfirmNotifyKind | TelegramTpHitKind): string {
  if (kind === 'invalid') return '⚠ 무효 이탈';
  if (kind === 'at_entry') return '★ 타점 진입';
  if (kind === 'confirmed_full') return '✓ 돌파안착';
  if (kind === 'confirmed') return '● 확정';
  if (kind === 'candidate') return '◐ 후보';
  if (kind === 'tp1' || kind === 'tp2' || kind === 'tp3') return `🎯 ${kind.toUpperCase()}`;
  return String(kind);
}

function unifiedToBrief(
  symbol: string,
  timeframe: string,
  kind: TelegramServerAlertKind,
  ev: TelegramMergedDeskEval
): TelegramDeskBriefingInput {
  const params = buildAlertParams(symbol, timeframe, kind, ev);
  const scrub = params.unified!;
  const side =
    ev.desk.direction === 'LONG' || ev.desk.direction === 'SHORT' ? ev.desk.direction : undefined;
  const lo = Math.min(ev.swing.entryLow || ev.price, ev.swing.entryHigh || ev.price);
  const hi = Math.max(ev.swing.entryLow || ev.price, ev.swing.entryHigh || ev.price);
  return {
    emoji: kind === 'invalid' ? '⚠' : '●',
    kindKo: confirmKindTagKo(kind as ConfirmNotifyKind),
    symbol,
    timeframe,
    titleKo: `${confirmKindTagKo(kind as ConfirmNotifyKind)} · ${ev.desk.phaseKo}`,
    side,
    top: hi,
    bot: lo,
    price: ev.price,
    detailKo: String(ev.desk.notifyBody || ev.desk.entryKo || '').slice(0, 120),
    briefingKo: ev.desk.confirmKo,
    invalidKo: kind === 'invalid' ? '무효 이탈 · 재검토' : ev.desk.confirmKo,
    levels: {
      entry: scrub.entry,
      sl: scrub.sl,
      tp1: scrub.tp1,
      tp2: scrub.tp2,
      tp3: scrub.tp3,
    },
  };
}

function precisionTagKo(kind: string): string {
  if (kind === 'dump') return '통합폭락경로';
  if (kind === 'precision-e') return '정밀타점E';
  if (kind === 'vol-burst-1' || kind === 'vol-burst-2') return '빅볼륨터짐';
  return '정밀터치';
}

function zoneTagKo(kind: string): string {
  if (kind === 'hot') return 'HotZone';
  if (kind === 'band') return '밴드존';
  if (kind === 'settle') return '안착구간';
  return '존터치';
}

function moneyTagKo(kind: string, kindKo: string): string {
  if (kind === 'money') return '$$$$돈구간';
  if (kind === 'entry-long') return '롱진입자리';
  if (kind === 'entry-short') return '숏진입자리';
  return kindKo.slice(0, 12);
}

async function sendUnifiedAlert(
  params: TelegramUnifiedAlertParams,
  ev: TelegramMergedDeskEval,
  settings: UserSettings,
  apiBase: string,
  chartImageOn: boolean,
  chartContext?: TelegramAlertChartContext | null,
  analysis?: AnalyzeResponse | null
): Promise<{ ok: boolean; photo: boolean }> {
  /** 실측만 — 가짜 LIVE/확률 문구 금지. 폭락존은 차트 TF 캔들로 재계산 */
  const chartTf = normalizeChartTimeframe(params.timeframe);
  const dumpPack =
    ev.pack?.mtfDumpPack ??
    (ev.candles.length >= 12
      ? buildMergedDeskMtfDumpZonePack({
          chartCandles: ev.candles,
          chartTf,
          candlesByTf: { [chartTf]: ev.candles },
          displayMode: 'mtf',
        })
      : null);
  const zones = dumpPack?.zones?.length ? dumpPack.zones : null;
  const srPath =
    zones && zones.length
      ? buildDumpSupportResistPath({
          zones: zones.map((z) => ({
            sourceTf: z.sourceTf,
            sourceTfKo: z.sourceTfKo || z.sourceTf,
            bandRole: z.bandRole,
            mid: z.mid,
            top: z.top,
            bot: z.bot,
            lifeState: z.lifeState,
            evidenceScore: z.evidenceScore,
          })),
          bounceCap: null,
          priceNow: ev.price,
          chartCandles: ev.candles,
        })
      : null;

  const doksuriOn = settings.chartMergedDeskDoksuri1BriefingEnabled !== false;
  const whale = await fetchDoksuri1WhaleBeamPackServer({
    apiBase,
    symbol: params.symbol,
    timeframe: chartTf,
    candles: ev.candles,
  });

  const structureLite =
    ev.pack?.deskHud?.structureVerdictKo
      ? {
          verdict: ev.pack.deskHud.structureVerdict,
          labelKo: ev.pack.deskHud.structureVerdictKo,
          summaryKo: ev.pack.deskHud.supportReboundKo || ev.pack.deskHud.structureVerdictKo,
          detailKo: '',
          confidence: 55,
          overlays: [],
        }
      : null;

  const doksuriPack = doksuriOn
    ? buildDoksuri1Pack({
        symbol: params.symbol,
        timeframe: params.timeframe,
        price: ev.price,
        candles: ev.candles,
        dumpZones: zones,
        srPath,
        whale,
        structure: structureLite,
        swing: {
          side: String(ev.swing.side || 'WAIT'),
          stance: String(ev.swing.stance || 'WAIT'),
          entryLow: ev.swing.entryLow,
          entryHigh: ev.swing.entryHigh,
          entryMid: (ev.swing.entryLow + ev.swing.entryHigh) / 2,
          stopLoss: params.unified?.sl ?? 0,
          tp1: params.unified?.tp1 ?? 0,
          tp2: params.unified?.tp2 ?? undefined,
          tp3: params.unified?.tp3 ?? undefined,
          grade: ev.swing.grade,
          confluence: ev.swing.confluence,
        },
        levels: params.unified
          ? {
              entry: params.unified.entry,
              sl: params.unified.sl,
              tp1: params.unified.tp1,
              tp2: params.unified.tp2,
              tp3: params.unified.tp3,
            }
          : null,
        derivEnabled: true,
        orderflowEnabled: true,
        analysis: analysis ?? null,
        enabled: true,
        accountUsdt: Number(settings.swingSeedUsdt) || 1000,
        riskPct: Number(settings.chartMergedDeskDoksuri1RiskPct) || 5,
        hqEntryZones: ev.pack?.hqEntryZones ?? null,
        deskHud: ev.pack?.deskHud
          ? {
              mtfDumpKo: ev.pack.deskHud.mtfDumpKo,
              mtfAlignKo: ev.pack.deskHud.mtfAlignKo,
              hqEntryZonesKo: ev.pack.deskHud.hqEntryZonesKo,
              hotZoneEntryKo: ev.pack.deskHud.hotZoneEntryKo,
              aiForceZonesKo: ev.pack.deskHud.aiForceZonesKo,
              swingMidEntryKo: ev.pack.deskHud.swingMidEntryKo,
              activeTradePlanKo: ev.pack.deskHud.activeTradePlanKo,
              coreSrKo: ev.pack.deskHud.coreSrKo,
              chochObPathKo: ev.pack.deskHud.chochObPathKo,
              projectedDownsideKo: ev.pack.deskHud.projectedDownsideKo,
              projectedUpsideKo: ev.pack.deskHud.projectedUpsideKo,
              rbLiveEntryKo: ev.pack.deskHud.rbLiveEntryKo,
              rbLiveEntryGradeKo: ev.pack.deskHud.rbLiveEntryGradeKo,
              candleCardConfluenceKo: ev.pack.deskHud.candleCardConfluenceKo,
              candleEventVerdictKo: ev.pack.deskHud.candleEventVerdictKo,
            }
          : null,
        masterGrade: ev.pack?.masterFutures?.grade ?? null,
        masterSide: ev.pack?.masterFutures?.side ?? null,
      })
    : null;

  if (doksuriPack) {
    const scope = `tg|${params.symbol}|${params.timeframe}`;
    const fp = buildDoksuri1StateFingerprint({
      factHash: doksuriPack.fact.factHash,
      dominantSide: doksuriPack.fact.dominantSide,
      bigMoneyState: doksuriPack.fact.bigMoneyState,
      action: doksuriPack.fact.action,
      zoneScores: doksuriPack.fact.zoneScores,
      candleEventFingerprint: doksuriPack.fact.candleEventFingerprint,
    });
    if (!shouldEmitDoksuri1StateChange(scope, fp) && params.kind === 'candidate') {
      return { ok: true, photo: false };
    }
  }

  const htmlBase = doksuriPack
    ? doksuriPack.storyHtml
    : formatTelegramRealBattleBriefHtml({
        symbol: params.symbol,
        timeframe: params.timeframe,
        price: ev.price,
        kindTitleKo: confirmKindTagKo(params.kind as ConfirmNotifyKind),
        desk: params.desk,
        levels: params.unified
          ? {
              entry: params.unified.entry,
              sl: params.unified.sl,
              tp1: params.unified.tp1,
              tp2: params.unified.tp2,
              tp3: params.unified.tp3,
              inv: params.unified.inv ?? null,
              sourceKo: params.unified.sourceKo,
            }
          : null,
        dumpZones: zones,
        srPath,
        whale,
        swing: {
          stance: ev.swing.stance,
          side: ev.swing.side,
          confluence: ev.swing.confluence,
          grade: ev.swing.grade,
          entryLow: ev.swing.entryLow,
          entryHigh: ev.swing.entryHigh,
          whereKo: ev.swing.whereKo,
        },
        learningLine: params.learningLine,
        riskLine: params.riskLine,
        serverAuto: true,
      });

  const rbOn = settings.chartMergedDeskBlueRedChannelsEnabled !== false;
  const rbHtml = rbOn
    ? buildTelegramRbChannelBriefFromMergedPack({
        symbol: params.symbol,
        timeframe: params.timeframe,
        price: ev.price,
        pack: ev.pack,
        serverAuto: true,
        stub: Boolean(doksuriPack),
      })
    : null;
  const html = mergeTelegramHtmlWithRbChannelBrief(htmlBase, rbHtml);

  const useChart =
    chartImageOn && CHART_PHOTO_KINDS.has(params.kind) && ev.candles.length >= 4;

  if (useChart) {
    const sendR = await sendTelegramDeskAlertPhoto({
      captionHtml: html,
      photoCaptionHtml: doksuriPack ? formatDoksuri1PhotoCaptionHtml(doksuriPack) : undefined,
      forceFullFollowUp: Boolean(doksuriPack),
      symbol: params.symbol,
      timeframe: params.timeframe,
      candles: ev.candles,
      settings,
      apiBase,
      buildSvg: () =>
        buildTelegramAlertChartSvg({
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
          mtfZones: chartContext?.mtfZones,
          extraLines: chartContext ? instBandExtraLines(chartContext) : undefined,
        }),
    });
    if (sendR.ok) return { ok: true, photo: sendR.photo };
  }

  const sent = await sendTelegramHtmlCaptionToEnvChat(html);
  return { ok: sent.ok, photo: false };
}

function shouldResetTpHits(prev: TelegramServerPhaseRow | null, ev: TelegramMergedDeskEval): boolean {
  if (!prev) return true;
  if (ev.desk.phase === 'invalid' || ev.desk.phase === 'wait') return true;
  if (prev.direction !== ev.desk.direction) return true;
  if (prev.phase === 'invalid') return true;
  return false;
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
    precisionTouchSent: 0,
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
    if (!analysisMatchesTelegramSymbol(analysis, symbol) || !analysisPriceMatchesTelegramSymbol(analysis, symbol)) {
      stats.fetchErr += 1;
      continue;
    }

    if (!settleBySymbol.has(symbol)) {
      settleBySymbol.set(symbol, await fetchServerTfCloseSettleBoard(base, symbol));
    }
    const settleBoard = settleBySymbol.get(symbol) ?? null;

    const prev = getTelegramServerPhase(user, symbol, timeframe);
    const ev = buildTelegramMergedDeskEval(analysis, timeframe, settleBoard, prev, newsHint);
    if (ev && !telegramAssetPricePlausible(symbol, ev.price)) {
      stats.evalNull += 1;
      continue;
    }

    let chartContext: TelegramAlertChartContext | null = null;
    const chartCandles =
      ev?.candles?.length >= 8
        ? ev.candles
        : ((analysis as AnalyzeResponse & { candles?: Candle[] }).candles ?? []);
    if (chartImageOn && chartCandles.length >= 8) {
      try {
        chartContext = await buildTelegramAlertChartContext({
          base,
          symbol,
          chartTf: timeframe,
          chartCandles,
        });
      } catch {
        chartContext = null;
      }
    }

    /**
     * 데스크 터치·HQ·확정/무효 — 수집 후 심볼×TF당 1통 번들.
     * 탐지기(폭락/정밀/Hot/$$$$/진입/HQ)는 유지, 발송만 합침.
     */
    const bundleSections: DeskBundleSection[] = [];
    const candlesForTouch =
      ev?.candles?.length && ev.candles.length >= 8
        ? ev.candles
        : chartCandles;
    const priceForTouch = (() => {
      if (ev?.price && ev.price > 0) return ev.price;
      const fromAnalysis = Number(analysis.currentPrice);
      if (fromAnalysis > 0) return fromAnalysis;
      return Number(candlesForTouch[candlesForTouch.length - 1]?.close) || 0;
    })();

    if (settings.telegramPrecisionTouchEnabled !== false && candlesForTouch.length >= 8) {
      const pt = await collectTelegramPrecisionTouchesForPair({
        symbol,
        timeframe,
        analysis,
        candles: candlesForTouch,
        price: priceForTouch,
        apiBase: base,
      });
      for (const hit of pt.hits) {
        if (!telegramAssetPricePlausible(symbol, hit.mid)) continue;
        const bucket = telegramPriceBucket(pt.price, hit.mid);
        const role = hit.dumpRole || 'na';
        const dedupeKey =
          hit.kind === 'dump'
            ? `dump-path|${user}|${symbol}|${tf}|${hit.side}|${role}|b${bucket}`
            : `precision-touch|${user}|${symbol}|${tf}|${hit.kind}|${hit.side}|${role}|b${bucket}`;
        const cooldown =
          hit.kind === 'dump'
            ? hit.cooldownMs && hit.cooldownMs > 0
              ? hit.cooldownMs
              : 10 * 60 * 60_000
            : hit.cooldownMs && hit.cooldownMs > 0
              ? hit.cooldownMs
              : PRECISION_TOUCH_COOLDOWN_MS;
        bundleSections.push({
          tagKo: precisionTagKo(hit.kind),
          brief: precisionTouchHitBriefInput(symbol, timeframe, hit, pt.price, chartContext),
          dedupeKey,
          cooldownMs: cooldown,
          mid: hit.mid,
          statKey: 'precision',
        });
      }
    }

    if (settings.telegramZoneTouchAlertEnabled !== false && candlesForTouch.length >= 8) {
      const zHits = collectTelegramZoneTouchHits(analysis, candlesForTouch, timeframe, priceForTouch).slice(
        0,
        2
      );
      for (const hit of zHits) {
        const midPx = (hit.top + hit.bot) / 2;
        if (!telegramAssetPricePlausible(symbol, midPx)) continue;
        const bucket = telegramPriceBucket(priceForTouch, midPx);
        bundleSections.push({
          tagKo: zoneTagKo(hit.kind),
          brief: zoneTouchHitBriefInput(symbol, timeframe, hit, priceForTouch, chartContext),
          dedupeKey: `zone-touch|${user}|${symbol}|${tf}|${hit.kind}|${hit.side}|b${bucket}`,
          cooldownMs: ZONE_TOUCH_COOLDOWN_MS,
          mid: midPx,
          statKey: 'zone',
        });
      }
    }

    if (settings.telegramMoneyEntryTouchEnabled !== false && candlesForTouch.length >= 8) {
      const mHits = collectMoneyEntryTouchHits({
        candles: candlesForTouch,
        timeframe,
        price: priceForTouch,
        ev: ev ?? null,
      }).slice(0, 3);
      const deskDir = ev?.desk.direction ?? ev?.swing.side ?? null;
      for (const hit of mHits) {
        if (!telegramAssetPricePlausible(symbol, hit.mid)) continue;
        const bucket = telegramPriceBucket(priceForTouch, hit.mid);
        const levels =
          deskDir && deskDir === hit.side && ev
            ? {
                entry: ev.levels.entry,
                sl: ev.levels.sl,
                tp1: ev.levels.tp1,
                tp2: ev.levels.tp2,
                tp3: ev.levels.tp3,
              }
            : undefined;
        bundleSections.push({
          tagKo: moneyTagKo(hit.kind, hit.kindKo),
          brief: moneyEntryTouchHitBriefInput(
            symbol,
            timeframe,
            hit,
            priceForTouch,
            chartContext,
            levels
          ),
          dedupeKey: `money-entry|${user}|${symbol}|${tf}|${hit.kind}|${hit.side}|b${bucket}`,
          cooldownMs: MONEY_ENTRY_TOUCH_COOLDOWN_MS,
          mid: hit.mid,
          statKey: 'money',
        });
      }
    }

    if (!ev) {
      stats.evalNull += 1;
      if (bundleSections.length) {
        const { claimed, dedup } = await claimDeskBundleSections(bundleSections);
        stats.dedupSkip += dedup;
        if (claimed.length) {
          const doksuriTg = await buildDoksuri1TelegramAlert({
            settings,
            apiBase: base,
            symbol,
            timeframe,
            price: priceForTouch,
            candles: candlesForTouch,
            analysis,
            dumpZones: null,
            skipIfUnchanged: false,
          });
          const sent = await sendBundledDeskAlert({
            sections: claimed,
            symbol,
            timeframe,
            price: priceForTouch,
            candles: candlesForTouch,
            chartImageOn,
            chartContext,
            settings,
            apiBase: base,
            doksuriHtml: doksuriTg.status === 'ok' ? doksuriTg.html : null,
            doksuriPhotoCaptionHtml:
              doksuriTg.status === 'ok' ? doksuriTg.photoCaptionHtml : null,
            forceFullFollowUp: doksuriTg.status === 'ok',
          });
          if (sent.ok) {
            const tallied = tallyDeskBundleStats(claimed);
            stats.precisionTouchSent += tallied.precision;
            stats.zoneTouchSent += tallied.zone;
            stats.moneyEntrySent += tallied.money;
            if (sent.photo) stats.photoSent += 1;
          } else {
            stats.sendErr += 1;
          }
        }
      }
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

    // HQ 존 터치 — 번들에 포함
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
      const touches = detectHqZoneTouchTransitions(hqPack, ev.candles).slice(0, 1);
      for (const z of touches) {
        if (ev.swing.stance.startsWith('ENTER') && z.side === ev.swing.side) continue;
        const brief: TelegramDeskBriefingInput = {
          emoji: '🎯',
          kindKo: z.side === 'LONG' ? '롱자리' : '숏자리',
          symbol,
          timeframe,
          titleKo: `${z.side === 'LONG' ? '롱자리' : '숏자리'} 터치 · ${z.labelKo}`,
          side: z.side,
          top: z.top,
          bot: z.bot,
          price: ev.price,
          detailKo: z.reasonKo,
          briefingKo: `스윙중투 ${ev.swing.stance} · 합류 ${ev.swing.confluence}%`,
          invalidKo: '신호등급·합류 참고 — 승률·수익 보장 아님',
        };
        bundleSections.push({
          tagKo: `🎯 ${z.side === 'LONG' ? '롱자리' : '숏자리'}`,
          brief,
          dedupeKey: `merged-hq|${user}|${symbol}|${tf}|${z.side}|${z.grade}|${Math.round(z.mid)}`,
          cooldownMs: HQ_TOUCH_COOLDOWN_MS,
          mid: z.mid,
          statKey: 'hq',
        });
      }
    }

    // 확정/무효/TP — 터치와 같은 사이클이면 번들에 합침
    let confirmClaimedSeparately = false;
    if (confirmKind && ev.desk.notifyKey) {
      const dedupeKey = `merged|${user}|${symbol}|${tf}|${confirmKind}|${ev.desk.notifyKey}`;
      if (bundleSections.length) {
        bundleSections.push({
          tagKo: confirmKindTagKo(confirmKind),
          brief: unifiedToBrief(symbol, timeframe, confirmKind, ev),
          dedupeKey,
          cooldownMs: CONFIRM_COOLDOWN_MS[confirmKind],
          mid: ev.price,
          statKey: 'confirm',
        });
      } else {
        const ok = await telegramEventDedupServerTry(dedupeKey, CONFIRM_COOLDOWN_MS[confirmKind]);
        if (!ok) {
          stats.dedupSkip += 1;
        } else {
          confirmClaimedSeparately = true;
          const params = buildAlertParams(symbol, timeframe, confirmKind, ev);
          const sent = await sendUnifiedAlert(params, ev, settings, base, chartImageOn, chartContext, analysis);
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
    }

    if (tpHitKind) {
      const dedupeKey = `merged-tp|${user}|${symbol}|${tf}|${tpHitKind}|${Math.round((ev.levels[tpHitKind] ?? 0) * 100)}`;
      if (bundleSections.length) {
        bundleSections.push({
          tagKo: confirmKindTagKo(tpHitKind),
          brief: unifiedToBrief(symbol, timeframe, tpHitKind, ev),
          dedupeKey,
          cooldownMs: TP_COOLDOWN_MS[tpHitKind],
          mid: ev.price,
          statKey: 'tp',
        });
      } else {
        const ok = await telegramEventDedupServerTry(dedupeKey, TP_COOLDOWN_MS[tpHitKind]);
        if (!ok) {
          stats.dedupSkip += 1;
        } else {
          const params = buildAlertParams(symbol, timeframe, tpHitKind, ev);
          const sent = await sendUnifiedAlert(params, ev, settings, base, chartImageOn, chartContext, analysis);
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
    }

    if (bundleSections.length) {
      // 우선순위: 폭락 → 정밀 → Hot/존 → 돈/진입 → HQ → 확정
      const rank = (s: DeskBundleSection) => {
        if (s.tagKo.includes('폭락')) return 0;
        if (s.tagKo.includes('정밀')) return 1;
        if (s.tagKo.includes('Hot') || s.tagKo.includes('밴드') || s.tagKo.includes('안착')) return 2;
        if (s.tagKo.includes('돈') || s.tagKo.includes('진입')) return 3;
        if (s.statKey === 'hq') return 4;
        if (s.statKey === 'confirm' || s.statKey === 'tp') return 5;
        return 6;
      };
      bundleSections.sort((a, b) => rank(a) - rank(b));
      const { claimed, dedup } = await claimDeskBundleSections(bundleSections);
      stats.dedupSkip += dedup;
      if (claimed.length) {
        const doksuriTg = await buildDoksuri1TelegramAlert({
          settings,
          apiBase: base,
          symbol,
          timeframe,
          price: ev.price,
          candles: ev.candles.length >= 4 ? ev.candles : candlesForTouch,
          analysis,
          swing: {
            side: String(ev.swing.side || 'WAIT'),
            stance: String(ev.swing.stance || 'WAIT'),
            entryLow: ev.swing.entryLow,
            entryHigh: ev.swing.entryHigh,
            entryMid: (ev.swing.entryLow + ev.swing.entryHigh) / 2,
            stopLoss: ev.levels.sl ?? 0,
            tp1: ev.levels.tp1 ?? 0,
            tp2: ev.levels.tp2 ?? undefined,
            tp3: ev.levels.tp3 ?? undefined,
            grade: ev.swing.grade,
            confluence: ev.swing.confluence,
          },
          levels: {
            entry: ev.levels.entry,
            sl: ev.levels.sl,
            tp1: ev.levels.tp1,
            tp2: ev.levels.tp2,
            tp3: ev.levels.tp3,
          },
          structureLabelKo: ev.pack?.deskHud?.structureVerdictKo ?? null,
          structureSummaryKo: ev.pack?.deskHud?.supportReboundKo ?? null,
          structureVerdict: ev.pack?.deskHud?.structureVerdict ?? null,
          dumpZones: ev.pack?.mtfDumpPack?.zones ?? null,
          hqEntryZones: ev.pack?.hqEntryZones ?? null,
          deskHud: ev.pack?.deskHud
            ? {
                mtfDumpKo: ev.pack.deskHud.mtfDumpKo,
                mtfAlignKo: ev.pack.deskHud.mtfAlignKo,
                hqEntryZonesKo: ev.pack.deskHud.hqEntryZonesKo,
                hotZoneEntryKo: ev.pack.deskHud.hotZoneEntryKo,
                aiForceZonesKo: ev.pack.deskHud.aiForceZonesKo,
                swingMidEntryKo: ev.pack.deskHud.swingMidEntryKo,
                activeTradePlanKo: ev.pack.deskHud.activeTradePlanKo,
                coreSrKo: ev.pack.deskHud.coreSrKo,
                chochObPathKo: ev.pack.deskHud.chochObPathKo,
                projectedDownsideKo: ev.pack.deskHud.projectedDownsideKo,
                projectedUpsideKo: ev.pack.deskHud.projectedUpsideKo,
                rbLiveEntryKo: ev.pack.deskHud.rbLiveEntryKo,
                rbLiveEntryGradeKo: ev.pack.deskHud.rbLiveEntryGradeKo,
                candleCardConfluenceKo: ev.pack.deskHud.candleCardConfluenceKo,
                candleEventVerdictKo: ev.pack.deskHud.candleEventVerdictKo,
              }
            : null,
          masterGrade: ev.pack?.masterFutures?.grade ?? null,
          masterSide: ev.pack?.masterFutures?.side ?? null,
          skipIfUnchanged: false,
        });
        const rbOnBundle = settings.chartMergedDeskBlueRedChannelsEnabled !== false;
        const rbBundleHtml = rbOnBundle
          ? buildTelegramRbChannelBriefFromMergedPack({
              symbol,
              timeframe,
              price: ev.price,
              pack: ev.pack,
              serverAuto: true,
              stub: doksuriTg.status === 'ok',
            })
          : null;
        const doksuriMergedHtml =
          doksuriTg.status === 'ok'
            ? mergeTelegramHtmlWithRbChannelBrief(doksuriTg.html, rbBundleHtml)
            : rbBundleHtml;
        const sent = await sendBundledDeskAlert({
          sections: claimed,
          symbol,
          timeframe,
          price: ev.price,
          candles: ev.candles.length >= 4 ? ev.candles : candlesForTouch,
          chartImageOn,
          chartContext,
          settings,
          apiBase: base,
          doksuriHtml: doksuriMergedHtml,
          doksuriPhotoCaptionHtml:
            doksuriTg.status === 'ok' ? doksuriTg.photoCaptionHtml : null,
          forceFullFollowUp: Boolean(doksuriMergedHtml),
        });
        if (sent.ok) {
          const tallied = tallyDeskBundleStats(claimed);
          stats.precisionTouchSent += tallied.precision;
          stats.zoneTouchSent += tallied.zone;
          stats.moneyEntrySent += tallied.money;
          stats.hqTouchSent += tallied.hq;
          if (tallied.confirm) {
            const hasInvalid = claimed.some((c) => c.tagKo.includes('무효'));
            const hasEntry = claimed.some((c) => c.tagKo.includes('타점 진입'));
            if (hasInvalid) stats.invalidSent += 1;
            else if (hasEntry) stats.entrySent += 1;
            else stats.planSent += 1;
          }
          if (tallied.tp) {
            stats.tpSent += tallied.tp;
            const tpSec = claimed.find((c) => c.statKey === 'tp');
            if (tpSec?.tagKo.includes('TP1')) lastTpHitSent = 'tp1';
            else if (tpSec?.tagKo.includes('TP2')) lastTpHitSent = 'tp2';
            else if (tpSec?.tagKo.includes('TP3')) lastTpHitSent = 'tp3';
          }
          if (sent.photo) stats.photoSent += 1;
          console.info('[telegram-merged-desk] bundled', {
            user,
            symbol,
            timeframe,
            tags: claimed.map((c) => c.tagKo),
            photo: sent.photo,
          });
        } else {
          stats.sendErr += 1;
        }
      }
    }

    void confirmClaimedSeparately;

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
