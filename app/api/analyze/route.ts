import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketCandles } from '@/lib/market';
import { analyzeCandles } from '@/lib/analyze';
import { fetchMarketData } from '@/lib/data/dataService';
import { buildBriefingContext } from '@/lib/briefingContext';
import { buildCloseSettlementBoard } from '@/lib/closeSettlement';
import { computeCloseLevels } from '@/lib/closeLevelEngine';
import { computeCloseScenario } from '@/lib/closeScenarioEngine';
import { runStrongZonePipeline, strongZonesToOverlays } from '@/lib/zone';
import { computeSwingTapPoint } from '@/lib/swingTapPoint';
import { computeConfirmedSignal } from '@/lib/confirmedSignalEngine';
import { buildZoneBiasCard } from '@/lib/zoneBiasCard';
import { buildStructureBouncePath, buildStructureBounceOverlays } from '@/lib/structureBouncePath';
import { ZONE_PRICE_FLOOR, ZONE_PRICE_CEIL, visibleLimit } from '../../../lib/constants';
import { getOrderbookDepthAtPrice, orderbookDepthLabel } from '@/lib/data/aggregate/orderbookDepthAtPrice';
import { tradesAtPriceZone } from '@/lib/data/aggregate/tradesAtPriceZone';
import { OVERLAY_COLORS, CLOSE_TF_COLORS } from '@/lib/overlayColors';
import { runChartMvpEngine } from '@/engine';
import { evaluateSignalLearning } from '@/lib/signalLearning';
import { computeTradePlan } from '@/lib/tradePlanner';
import { runFrontRunSignalEngine } from '@/lib/signal-engine';
import {
  readVirtualStore,
  readConfirmedSignals,
  readSoftSignals,
  appendSoftSignal,
  readAlertRules,
  readSmartWorkflowStates,
  appendSmartWorkflowState,
} from '@/lib/serverVirtualStore';
import { buildAnchoredWavePath, buildBriefingPatternText, computeBriefingWavePathFromAnalysis } from '@/lib/briefingWavePath';
import { appendBriefingMemory, buildBriefingFingerprint, findSimilarBriefingMemory } from '@/lib/briefingMemoryStore';
import { persistAnalyzeAnalytics, type GatedPlanInput } from '@/lib/serverAnalyticsStore';
import { mergeParkfTrendlineColors, normalizeHex6, parseHex6Param } from '@/lib/chartHexColor';
import { parseParkfTrendlineOptsFromSearchParams, parkfEngineOptsCacheSegment } from '@/lib/parkfAnalyzeQuery';
import type { ParkfTrendlineOpts } from '@/lib/parkfLinregTrendlineEngine';
import type { CompressionThresholds } from '@/lib/aiModeAutoAnalysis';
import type { AnalyzeResponse } from '@/types';
import { buildSmartOverlayPayload } from '@/lib/smartOverlayPayload';
import { computeAiFusionSignal } from '@/lib/aiFusionSignal';
import { buildAiZoneSignal } from '@/lib/aiZoneSignal';
import { buildAiUnifiedLongShort } from '@/lib/aiUnifiedLongShort';

export const dynamic = 'force-dynamic';

function getClientId(req: NextRequest): string {
  const header = req.headers.get('x-client-id');
  if (header && header.length >= 8) return header;
  const url = new URL(req.url);
  const q = url.searchParams.get('clientId');
  if (q && q.length >= 8) return q;
  return 'default';
}

const ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:8000';
const learningModelRegistry = new Map<string, { threshold: number; updatedAt: number }>();
const ANALYZE_MAX_CONCURRENCY = Number(process.env.ANALYZE_MAX_CONCURRENCY || 4);
/** 동일 키 반복 요청 시 캔들 재조회·재분석 스킵 — 체감 지연 완화 */
const ANALYZE_RESPONSE_CACHE_TTL_MS = Number(process.env.ANALYZE_RESPONSE_CACHE_TTL_MS || 12_000);
/** 로컬에 엔진 없을 때 장시간 대기하지 않도록 상한(TF 전환 체감 속도) */
const PYTHON_ENGINE_FETCH_MS = Number(process.env.PYTHON_ENGINE_FETCH_MS || 1400);
const analyzeResponseCache = new Map<string, { expiresAt: number; data: any }>();
const analyzeResponseInFlight = new Map<string, Promise<any>>();
const SMART_MONEY_ALERT_COOLDOWN_MS = Number(process.env.SMART_MONEY_ALERT_COOLDOWN_MS || 10 * 60 * 1000);
const smartMoneyAlertSentAt = new Map<string, number>();
let analyzeActive = 0;
const analyzeWaiters: Array<() => void> = [];

async function acquireAnalyzeSlot(): Promise<() => void> {
  if (analyzeActive >= ANALYZE_MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => analyzeWaiters.push(resolve));
  }
  analyzeActive += 1;
  return () => {
    analyzeActive = Math.max(0, analyzeActive - 1);
    const next = analyzeWaiters.shift();
    if (next) next();
  };
}

async function sendSmartMoneyWebhook(payload: {
  symbol: string;
  timeframe: string;
  totalScore: number;
  probabilityEdge: number;
  conditionsMet: number;
  conditionsTotal: number;
  entryStyle: 'PULLBACK' | 'BREAKOUT' | 'WAIT';
  state: 'LONG_READY' | 'WATCH' | 'CAUTION';
  ruleId: string;
  alertText: string;
}) {
  const url = process.env.WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
  if (!url) return;
  const statusIcon = payload.state === 'LONG_READY' ? '🟢' : payload.state === 'WATCH' ? '🟡' : '🔴';
  const text =
    `🦅 독수리1호 규칙충족\n` +
    `${payload.symbol} ${payload.timeframe}\n` +
    `${statusIcon} ${payload.state} · 점수 ${payload.totalScore} · 우위 ${payload.probabilityEdge.toFixed(1)}%\n` +
    `조건 ${payload.conditionsMet}/${payload.conditionsTotal} · ${payload.entryStyle}\n` +
    `규칙 ${payload.ruleId}\n` +
    `${payload.alertText}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(url.includes('discord') ? { content: text } : { text }),
    });
  } catch {
    // webhook failure should never fail analysis response
  }
}

type PythonSignal = {
  symbol: string;
  direction: string;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  probability: number;
  liquidity_target: number;
  scenario: string;
  trend: string;
  timestamp: string;
};

async function fetchPythonSignal(symbol: string, timeframe: string): Promise<PythonSignal | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, timeframe, exchange: 'binance' }),
      signal: AbortSignal.timeout(Math.max(300, PYTHON_ENGINE_FETCH_MS)),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const HTF_MAP: Record<string, string> = {
  '1m': '5m', '3m': '15m', '5m': '15m', '15m': '1h',
  '1h': '4h', '4h': '1d', '1d': '1w', '1w': '1M', '1M': '1Y', '1Y': '1Y',
};
const LTF_MAP: Record<string, string> = {
  '1m': '1m', '3m': '1m', '5m': '1m', '15m': '5m',
  '1h': '15m', '4h': '1h', '1d': '4h', '1w': '1d', '1M': '1w', '1Y': '1M',
};

const TF_SEC: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 4 * 3600,
  '1d': 24 * 3600,
  '1w': 7 * 24 * 3600,
  '1M': 30 * 24 * 3600,
};

function computeAtrLike(candles: Array<{ high: number; low: number; close: number }>, period = 14): number {
  if (candles.length < 2) return 0;
  const from = Math.max(1, candles.length - period);
  let sum = 0;
  let n = 0;
  for (let i = from; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    sum += tr;
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

function mapVerdict(direction: string): 'LONG' | 'SHORT' | 'WATCH' {
  if (direction === 'long') return 'LONG';
  if (direction === 'short') return 'SHORT';
  return 'WATCH';
}

/** 자가학습용 캔들 슬라이스 상한 — 메인 fetch 봉 수와 무관하게 CPU 상한 */
function learningCandleLimitByTf(timeframe: string): number {
  const map: Record<string, number> = {
    '1m': 720,
    '3m': 720,
    '5m': 650,
    '15m': 600,
    '1h': 560,
    '4h': 520,
    '1d': 450,
    '1w': 360,
    '1M': 380,
    '1Y': 260,
  };
  return map[timeframe] ?? 520;
}

function computeFeatureProbabilities(
  candles: Array<{ high: number; low: number; close: number }>,
  overlays: Array<{ id?: string; kind?: string; label?: string; price1?: number; price2?: number; confidence?: number }>
) {
  if (!Array.isArray(candles) || candles.length < 40) return [] as Array<{
    key: string;
    label: string;
    riseProb: number;
    fallProb: number;
    supportProb: number;
    resistanceProb: number;
    samples: number;
    directionBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  }>;
  const rows = overlays
    .map((o) => {
      const p1 = typeof o.price1 === 'number' && Number.isFinite(o.price1) ? o.price1 : null;
      const p2 = typeof o.price2 === 'number' && Number.isFinite(o.price2) ? o.price2 : null;
      const level = p1 != null && p2 != null ? (p1 + p2) / 2 : (p1 ?? p2);
      if (level == null || level <= 0) return null;
      const key = `${String(o.kind || 'feature')}|${String(o.id || '')}`;
      const label = String(o.label || o.id || o.kind || '기능');
      return { key, label, level, confidence: typeof o.confidence === 'number' ? o.confidence : 60 };
    })
    .filter((x): x is { key: string; label: string; level: number; confidence: number } => Boolean(x))
    .slice(0, 80);
  if (!rows.length) return [];

  const lookahead = 12;
  const tolRate = 0.0018;
  const out: Array<{
    key: string;
    label: string;
    riseProb: number;
    fallProb: number;
    supportProb: number;
    resistanceProb: number;
    samples: number;
    directionBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  }> = [];

  for (const f of rows) {
    const tol = Math.max(f.level * tolRate, f.level * 0.0006);
    let samples = 0;
    let rises = 0;
    let falls = 0;
    let support = 0;
    let resistance = 0;
    let lastTouch = -9999;
    for (let i = 0; i < candles.length - 2; i += 1) {
      const c = candles[i];
      const touched = c.low <= f.level + tol && c.high >= f.level - tol;
      if (!touched) continue;
      if (i - lastTouch < 3) continue;
      lastTouch = i;
      const end = Math.min(candles.length - 1, i + lookahead);
      let maxHigh = c.high;
      let minLow = c.low;
      for (let j = i + 1; j <= end; j += 1) {
        maxHigh = Math.max(maxHigh, candles[j].high);
        minLow = Math.min(minLow, candles[j].low);
      }
      const upPct = ((maxHigh - f.level) / Math.max(1e-9, f.level)) * 100;
      const downPct = ((f.level - minLow) / Math.max(1e-9, f.level)) * 100;
      samples += 1;
      if (upPct >= downPct) rises += 1;
      if (downPct > upPct) falls += 1;
      if (upPct >= 0.6) support += 1;
      if (downPct >= 0.6) resistance += 1;
    }
    if (samples < 2) continue;
    const riseProb = Math.round((rises / samples) * 100);
    const fallProb = Math.round((falls / samples) * 100);
    const supportProb = Math.round((support / samples) * 100);
    const resistanceProb = Math.round((resistance / samples) * 100);
    out.push({
      key: f.key,
      label: f.label,
      riseProb,
      fallProb,
      supportProb,
      resistanceProb,
      samples,
      directionBias: riseProb - fallProb >= 8 ? 'LONG' : fallProb - riseProb >= 8 ? 'SHORT' : 'NEUTRAL',
    });
  }
  return out.sort((a, b) => (b.samples - a.samples) || (b.supportProb + b.resistanceProb - (a.supportProb + a.resistanceProb))).slice(0, 12);
}

const closeStateFromLastClose = (
  lastClose: number,
  level: number,
  lastOpen?: number
): 'accepted_above' | 'accepted_below' | 'reclaiming' => {
  // 원칙: 확정봉 자체(종가 vs 시가)로 종가 마감 판정 고정
  // level은 오버레이 수평선 표시용으로 유지하고, 상태는 확정봉 몸통 방향 기준.
  if (typeof lastOpen === 'number') {
    if (lastClose > lastOpen) return 'accepted_above';
    if (lastClose < lastOpen) return 'accepted_below';
  }
  // 시가 동가 도지일 때만 보조로 level 비교
  if (lastClose > level) return 'accepted_above';
  if (lastClose < level) return 'accepted_below';
  return 'reclaiming';
};

function computeLatchedCloseStateFromClosedCandles(
  levels: ReturnType<typeof computeCloseLevels>,
  lastCandleByTf: Record<string, { open: number; close: number }>
) {
  const acceptedLevels: Array<{ tf: 'daily' | 'weekly' | 'monthly' | '1m' | '5m' | '15m' | '1h' | '4h'; price: number }> = [];
  const rejectedLevels: Array<{ tf: 'daily' | 'weekly' | 'monthly' | '1m' | '5m' | '15m' | '1h' | '4h'; price: number }> = [];

  const stateAt = (
    tfKey: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M',
    level: number | null | undefined
  ) => {
    if (level == null) return null;
    const c = lastCandleByTf[tfKey];
    if (!c) return null;
    return closeStateFromLastClose(c.close, level, c.open);
  };

  const state1m = stateAt('1m', levels.close1m);
  const state5m = stateAt('5m', levels.close5m);
  const state15m = stateAt('15m', levels.close15m);
  const state1h = stateAt('1h', levels.close1h);
  const state4h = stateAt('4h', levels.close4h);
  const dailyState = stateAt('1d', levels.dailyCloseLevel);
  const weeklyState = stateAt('1w', levels.weeklyCloseLevel);
  const monthlyState = stateAt('1M', levels.monthlyCloseLevel);

  const pushState = (
    tf: 'daily' | 'weekly' | 'monthly' | '1m' | '5m' | '15m' | '1h' | '4h',
    state: 'accepted_above' | 'accepted_below' | 'reclaiming' | null,
    level: number | null | undefined
  ) => {
    if (state == null || level == null) return;
    if (state === 'accepted_above') acceptedLevels.push({ tf, price: level });
    if (state === 'accepted_below') rejectedLevels.push({ tf, price: level });
  };
  pushState('daily', dailyState, levels.dailyCloseLevel);
  pushState('weekly', weeklyState, levels.weeklyCloseLevel);
  pushState('monthly', monthlyState, levels.monthlyCloseLevel);
  pushState('1m', state1m, levels.close1m);
  pushState('5m', state5m, levels.close5m);
  pushState('15m', state15m, levels.close15m);
  pushState('1h', state1h, levels.close1h);
  pushState('4h', state4h, levels.close4h);

  return {
    dailyState,
    weeklyState,
    monthlyState,
    state1m,
    state5m,
    state15m,
    state1h,
    state4h,
    acceptedLevels,
    rejectedLevels,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '4h';
  const useCollect = searchParams.get('collect') === '1';
  const zoneSensitivityRaw = parseFloat(searchParams.get('zoneSensitivity') || '');
  const zoneSensitivity = !isNaN(zoneSensitivityRaw) ? Math.max(0.7, Math.min(1.3, zoneSensitivityRaw)) : 1.0;
  const majorZoneWidthRaw = parseFloat(searchParams.get('majorZoneWidth') || '');
  const majorZoneWidth = !isNaN(majorZoneWidthRaw) ? Math.max(0.6, Math.min(2.0, majorZoneWidthRaw)) : 1.0;
  const majorZoneOpacityRaw = parseFloat(searchParams.get('majorZoneOpacity') || '');
  const majorZoneOpacity = !isNaN(majorZoneOpacityRaw) ? Math.max(0.08, Math.min(0.55, majorZoneOpacityRaw)) : 0.24;
  const majorZoneMinTouchesRaw = parseInt(searchParams.get('majorZoneTouches') || '', 10);
  const majorZoneMinTouches = Number.isFinite(majorZoneMinTouchesRaw) ? Math.max(2, Math.min(6, majorZoneMinTouchesRaw)) : 2;
  const structureBreakout = searchParams.get('structureBreakout') === '1';
  const trendlineLookbackRaw = parseInt(searchParams.get('trendlineLookback') || '', 10);
  const trendlineLookback = Number.isFinite(trendlineLookbackRaw)
    ? Math.max(2, Math.min(15, trendlineLookbackRaw))
    : 3;
  const pre3SimRaw = parseFloat(searchParams.get('pre3Sim') || '');
  const pre3SimilarityThreshold = !isNaN(pre3SimRaw) ? Math.max(0.55, Math.min(1, pre3SimRaw)) : 1;
  const pre3ConfirmOnCloseOnly = searchParams.get('pre3Close') !== '0';
  const aiAvgRaw = parseFloat(searchParams.get('aiAvg') || '');
  const aiMaxRaw = parseFloat(searchParams.get('aiMax') || '');
  const aiImpRRaw = parseFloat(searchParams.get('aiImpR') || '');
  const aiImpBRaw = parseFloat(searchParams.get('aiImpB') || '');
  const aiVolF = searchParams.get('aiVol') === '1';
  const aiModeMax = searchParams.get('amx') === '1';
  const chartPrimeVolumeBg = searchParams.get('cpVolBg') === '1';
  const cpLenRaw = parseInt(searchParams.get('cpLen') || '8', 10);
  const chartPrimeLength = Math.max(2, Math.min(30, Number.isFinite(cpLenRaw) ? cpLenRaw : 8));
  /** cpAuto=0 일 때만 수동 L, 생략·그 외는 자동(ATR%·TF) */
  const chartPrimeAutoLength = searchParams.get('cpAuto') !== '0';
  const chartPrimeWait = searchParams.get('cpWait') !== '0';
  const chartPrimeExtend = searchParams.get('cpExt') === '1';
  const chartPrimeShowLast = searchParams.get('cpShowLast') !== '0';
  const chartPrimeShowFills = searchParams.get('cpFill') !== '0';
  const chartPrimeTopHex = normalizeHex6(parseHex6Param(searchParams.get('cpTop')), '#337C4F');
  const chartPrimeCenterHex = normalizeHex6(parseHex6Param(searchParams.get('cpCtr')), '#9CA3AF');
  const chartPrimeBottomHex = normalizeHex6(parseHex6Param(searchParams.get('cpBot')), '#A52D2D');
  const cpWRaw = parseFloat(searchParams.get('cpW') || '');
  const chartPrimeChannelWidthScale = Number.isFinite(cpWRaw) ? Math.max(0.15, Math.min(4, cpWRaw)) : 1;
  const depthDeltaRegimeFilter = searchParams.get('ddF') !== '0';
  const depthDeltaAlignmentWeight = searchParams.get('ddW') !== '0';
  const depthDeltaTpAdaptive = searchParams.get('ddT') !== '0';
  const aiCompression =
    !isNaN(aiAvgRaw) || !isNaN(aiMaxRaw) || !isNaN(aiImpRRaw) || !isNaN(aiImpBRaw)
      ? {
          avgRangeAtr: !isNaN(aiAvgRaw) ? Math.max(0.35, Math.min(0.65, aiAvgRaw)) : undefined,
          maxRangeAtr: !isNaN(aiMaxRaw) ? Math.max(0.5, Math.min(0.85, aiMaxRaw)) : undefined,
          impulseRangeAtr: !isNaN(aiImpRRaw) ? Math.max(0.95, Math.min(1.45, aiImpRRaw)) : undefined,
          impulseBodyAtr: !isNaN(aiImpBRaw) ? Math.max(0.35, Math.min(0.65, aiImpBRaw)) : undefined,
        }
      : undefined;
  const parkfTrendlineColors = mergeParkfTrendlineColors({
    linRegBaseHex: parseHex6Param(searchParams.get('pfB')),
    linRegLargeHex: parseHex6Param(searchParams.get('pfLg')),
    linRegMediumHex: parseHex6Param(searchParams.get('pfMd')),
    linRegSmallHex: parseHex6Param(searchParams.get('pfSm')),
    trendPrimaryHex: parseHex6Param(searchParams.get('pfTp')),
    trendSecondaryHex: parseHex6Param(searchParams.get('pfTs')),
  });
  const pfColorCacheKey = [
    parkfTrendlineColors.linRegBaseHex,
    parkfTrendlineColors.linRegLargeHex,
    parkfTrendlineColors.linRegMediumHex,
    parkfTrendlineColors.linRegSmallHex,
    parkfTrendlineColors.trendPrimaryHex,
    parkfTrendlineColors.trendSecondaryHex,
  ]
    .join('')
    .replace(/#/g, '');
  const parkfTrendlineOpts = parseParkfTrendlineOptsFromSearchParams(searchParams);
  const pfEngineCacheSeg = parkfEngineOptsCacheSegment(parkfTrendlineOpts);
  const aiKeySeg = aiCompression
    ? `ai${(aiCompression.avgRangeAtr ?? 0).toFixed(2)}${(aiCompression.maxRangeAtr ?? 0).toFixed(2)}${(aiCompression.impulseRangeAtr ?? 0).toFixed(2)}${(aiCompression.impulseBodyAtr ?? 0).toFixed(2)}v${aiVolF ? 1 : 0}`
    : 'aiD';
  const cpColorKey = `${chartPrimeTopHex.replace(/^#/, '')}${chartPrimeCenterHex.replace(/^#/, '')}${chartPrimeBottomHex.replace(/^#/, '')}`;
  const analyzeKey = `${symbol}|${timeframe}|${useCollect ? 1 : 0}|${zoneSensitivity.toFixed(2)}|${majorZoneWidth.toFixed(2)}|${majorZoneOpacity.toFixed(2)}|${majorZoneMinTouches}|sb${structureBreakout ? 1 : 0}|tl${trendlineLookback}|p3${pre3SimilarityThreshold.toFixed(3)}|p3c${pre3ConfirmOnCloseOnly ? 1 : 0}|pf${pfColorCacheKey}|pfe${pfEngineCacheSeg}|${aiKeySeg}|amx${aiModeMax ? 1 : 0}|cp${chartPrimeLength}a${chartPrimeAutoLength ? 1 : 0}w${chartPrimeWait ? 1 : 0}e${chartPrimeExtend ? 1 : 0}s${chartPrimeShowLast ? 1 : 0}v${chartPrimeVolumeBg ? 1 : 0}f${chartPrimeShowFills ? 1 : 0}c${cpColorKey}W${chartPrimeChannelWidthScale.toFixed(4)}d${depthDeltaRegimeFilter ? 1 : 0}${depthDeltaAlignmentWeight ? 1 : 0}${depthDeltaTpAdaptive ? 1 : 0}`;
  const cached = analyzeResponseCache.get(analyzeKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }
  const inFlight = analyzeResponseInFlight.get(analyzeKey);
  if (inFlight) {
    const data = await inFlight;
    return NextResponse.json(data);
  }
  let resolveInFlight: ((v: any) => void) | null = null;
  const inFlightPromise = new Promise<any>((resolve) => {
    resolveInFlight = resolve;
  });
  analyzeResponseInFlight.set(analyzeKey, inFlightPromise);
  const releaseSlot = await acquireAnalyzeSlot();
  const completeSuccess = (payload: any) => {
    analyzeResponseCache.set(analyzeKey, {
      expiresAt: Date.now() + ANALYZE_RESPONSE_CACHE_TTL_MS,
      data: payload,
    });
    if (analyzeResponseCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of analyzeResponseCache.entries()) {
        if (v.expiresAt <= now) analyzeResponseCache.delete(k);
      }
    }
    resolveInFlight?.(payload);
    analyzeResponseInFlight.delete(analyzeKey);
    return NextResponse.json(payload);
  };
  const completeError = (payload: any) => {
    resolveInFlight?.(payload);
    analyzeResponseInFlight.delete(analyzeKey);
    return NextResponse.json(payload);
  };

  try {
    const clientId = getClientId(req);
    const htf = HTF_MAP[timeframe] || '1d';
    const ltf = LTF_MAP[timeframe] || '1h';

    let candles: Awaited<ReturnType<typeof fetchMarketCandles>>;
    /** 동일 TF는 한 번만 네트워크(메인·1d·HTF 등 겹침 제거) */
    const candleByTf = new Map<string, Promise<Awaited<ReturnType<typeof fetchMarketCandles>>>>();
    const getCandlesForTf = (tf: string) => {
      const hit = candleByTf.get(tf);
      if (hit) return hit;
      const p = fetchMarketCandles(symbol, tf);
      candleByTf.set(tf, p);
      return p;
    };

    const pythonSignalPromise = fetchPythonSignal(symbol, timeframe);
    let marketData: Awaited<ReturnType<typeof fetchMarketData>> | null = null;

    if (useCollect) {
      try {
        marketData = await Promise.race([
          fetchMarketData(symbol, timeframe),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('fetchMarketData-timeout')), 16_000)
          ),
        ]);
        candles = marketData.candles;
      } catch {
        candles = await fetchMarketCandles(symbol, timeframe);
      }
      candleByTf.set(timeframe, Promise.resolve(candles));
    }

    /** collect=0 등: 메인 TF를 먼저 await 하지 않고 보조 TF·파이썬과 동시에 시작 → 대기 ≈ max(병렬) not sum */
    const secondaryBatch = Promise.all([
      pythonSignalPromise,
      timeframe !== htf ? getCandlesForTf(htf) : Promise.resolve(null),
      timeframe !== ltf ? getCandlesForTf(ltf) : Promise.resolve(null),
      getCandlesForTf('1d'),
      getCandlesForTf('1w'),
      getCandlesForTf('1M'),
      getCandlesForTf('1m'),
      getCandlesForTf('5m'),
      getCandlesForTf('15m'),
      getCandlesForTf('1h'),
      getCandlesForTf('4h'),
    ]);
    const mainP = useCollect ? Promise.resolve(candles) : getCandlesForTf(timeframe);

    const [[pythonSignal, htfCandles, ltfCandles, candles1d, candles1w, candles1M, candles1m, candles5m, candles15m, candles1h, candles4h], candlesResolved] =
      await Promise.all([secondaryBatch, mainP]);
    candles = candlesResolved;

    const htfEngine = htfCandles ? analyzeCandles(symbol, htf, htfCandles).engine : null;
    const analysis1M = candles1M?.length ? analyzeCandles(symbol, '1M', candles1M) : null;
    const engine1M = analysis1M?.engine ?? null;
    const trend1M = engine1M?.trend ?? null;
    const analysisOptions: {
      htfTrend?: 'bullish' | 'bearish' | 'range';
      trend1M?: 'bullish' | 'bearish' | 'range' | null;
      volumeDelta?: number;
      buyPressure?: number;
      sellPressure?: number;
      orderbookImbalance?: number;
      oiState?: 'increasing' | 'decreasing' | 'neutral';
      fundingState?: 'positive' | 'negative' | 'neutral';
      majorZoneWidthScale?: number;
      majorZoneOpacity?: number;
      majorZoneMinTouches?: number;
      structureBreakoutWithoutRetest?: boolean;
      trendlineLookback?: number;
      pre3SimilarityThreshold?: number;
      pre3ConfirmOnCloseOnly?: boolean;
      parkfTrendlineColors?: ReturnType<typeof mergeParkfTrendlineColors>;
      parkfTrendlineOpts?: Partial<ParkfTrendlineOpts>;
      whaleZones?: { buyZones: ReturnType<typeof runStrongZonePipeline>['buyZones']; sellZones: ReturnType<typeof runStrongZonePipeline>['sellZones'] };
      aiCompression?: Partial<CompressionThresholds>;
      aiCompressionVolumeFilter?: boolean;
      aiModeMax?: boolean;
      htfCandles?: typeof candles;
      htfLabel?: string;
      chartPrimeVolumeBg?: boolean;
      chartPrimeAutoLength?: boolean;
      chartPrimeLength?: number;
      chartPrimeWait?: boolean;
      chartPrimeExtend?: boolean;
      chartPrimeShowLast?: boolean;
      chartPrimeShowFills?: boolean;
      chartPrimeTopHex?: string;
      chartPrimeCenterHex?: string;
      chartPrimeBottomHex?: string;
      chartPrimeChannelWidthScale?: number;
    } = {
      htfTrend: htfEngine?.trend,
      trend1M: trend1M as 'bullish' | 'bearish' | 'range' | null,
      majorZoneWidthScale: majorZoneWidth,
      majorZoneOpacity,
      majorZoneMinTouches,
      structureBreakoutWithoutRetest: structureBreakout,
      trendlineLookback,
      pre3SimilarityThreshold,
      pre3ConfirmOnCloseOnly: pre3ConfirmOnCloseOnly,
      parkfTrendlineColors,
      parkfTrendlineOpts,
      aiCompression,
      aiCompressionVolumeFilter: aiVolF,
      aiModeMax,
      htfCandles: htfCandles ?? undefined,
      htfLabel: htf,
      chartPrimeVolumeBg,
      chartPrimeAutoLength,
      chartPrimeLength,
      chartPrimeWait,
      chartPrimeExtend,
      chartPrimeShowLast,
      chartPrimeShowFills,
      chartPrimeTopHex,
      chartPrimeCenterHex,
      chartPrimeBottomHex,
      chartPrimeChannelWidthScale,
    };
    if (marketData) {
      analysisOptions.volumeDelta = marketData.volumeDelta;
      analysisOptions.orderbookImbalance = marketData.orderbookImbalance;
      analysisOptions.oiState = marketData.oiState;
      analysisOptions.fundingState = marketData.fundingState;
      analysisOptions.buyPressure = marketData.buyPressure;
      analysisOptions.sellPressure = marketData.sellPressure;
    }
    let strongZoneResultForAnalysis: ReturnType<typeof runStrongZonePipeline> | null = null;
    if (marketData && marketData.currentPrice > 0) {
      try {
        strongZoneResultForAnalysis = runStrongZonePipeline(
          marketData.orderbook ?? null,
          marketData.trades ?? [],
          marketData.currentPrice
        );
        analysisOptions.whaleZones = {
          buyZones: strongZoneResultForAnalysis.buyZones,
          sellZones: strongZoneResultForAnalysis.sellZones,
        };
      } catch {
        strongZoneResultForAnalysis = null;
      }
    }
    const tsAnalysis = analyzeCandles(symbol, timeframe, candles, analysisOptions);
    /** Python 엔진이 있으면 판정·E/SL/TP만 덮어쓰고, 이후 호가·오버레이·MVP 등 전체 후단 파이프라인은 그대로 통과 */
    let tapSource = tsAnalysis;
    let usedPythonEngine = false;
    if (pythonSignal) {
      usedPythonEngine = true;
      const pyVerdict = mapVerdict(pythonSignal.direction) as 'LONG' | 'SHORT' | 'WATCH';
      let pyConf = Math.round(pythonSignal.probability);
      const wzc = tsAnalysis.volumeWhaleZoneConfluence;
      if (wzc && wzc.confidenceDelta !== 0) {
        pyConf = Math.min(99, Math.max(30, pyConf + Math.round(wzc.confidenceDelta * 0.55)));
      }
      tapSource = {
        ...tsAnalysis,
        verdict: pyVerdict,
        confidence: pyConf,
        entry: pythonSignal.entry.toFixed(2),
        stopLoss: pythonSignal.stop.toFixed(2),
        targets: [
          pythonSignal.tp1.toFixed(2),
          pythonSignal.tp2.toFixed(2),
          pythonSignal.tp3.toFixed(2),
        ],
        summary: `${symbol} ${timeframe} | ${pythonSignal.trend} | 확률 ${pythonSignal.probability.toFixed(0)}% | ${pythonSignal.scenario}`,
        engine: {
          ...(tsAnalysis.engine as object),
          direction: pythonSignal.direction,
          liquidity_target: pythonSignal.liquidity_target,
          scenario: pythonSignal.scenario,
          pythonEngine: true,
        } as typeof tsAnalysis.engine,
      };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const lastClosed = (arr: ({ time?: number; open: number; close: number }[]) | null, tf: string): { open: number; close: number } | null => {
      if (!arr || arr.length === 0) return null;
      if (arr.length === 1) return { open: arr[0].open, close: arr[0].close };
      const last = arr[arr.length - 1];
      const nowSec = Math.floor(Date.now() / 1000);
      const tfSec = TF_SEC[tf] ?? 3600;
      const lastTime = typeof last.time === 'number' ? last.time : nowSec;
      const useLast = nowSec >= (lastTime + tfSec);
      const c = useLast ? last : arr[arr.length - 2];
      return { open: c.open, close: c.close };
    };
    const lastCandleByTf: Record<string, { open: number; close: number }> = {};
    [
      ['1m', candles1m],
      ['5m', candles5m],
      ['15m', candles15m],
      ['1h', candles1h],
      ['4h', candles4h],
      ['1d', candles1d],
      ['1w', candles1w],
      ['1M', candles1M],
    ].forEach(([tf, arr]) => {
      const c = lastClosed(arr as ({ time?: number; open: number; close: number }[]) | null, tf as string);
      if (c) lastCandleByTf[tf as string] = c;
    });
    const closeSettlement = buildCloseSettlementBoard(nowSec, tapSource.verdict, Object.keys(lastCandleByTf).length > 0 ? lastCandleByTf : undefined);

    const htfTrend = htfEngine?.trend ?? null;
    const ltfTrend = ltfCandles ? analyzeCandles(symbol, ltf, ltfCandles).engine?.trend : null;
    const multiTF = {
      htf: htfTrend ? (htfTrend === 'bullish' ? '상승' : htfTrend === 'bearish' ? '하락' : '횡보') : null,
      ltf: ltfTrend ? (ltfTrend === 'bullish' ? '상승' : ltfTrend === 'bearish' ? '하락' : '횡보') : null,
      trend1M: trend1M ? (trend1M === 'bullish' ? '상승' : trend1M === 'bearish' ? '하락' : '횡보') : null,
      htfLabel: htf,
      ltfLabel: ltf,
    };

    const mainTrend = tapSource.engine?.trend;
    const trendKo = mainTrend === 'bullish' ? '상승' : mainTrend === 'bearish' ? '하락' : '횡보';
    const summaryWithMTF = multiTF.htf || multiTF.ltf || multiTF.trend1M
      ? `${symbol} ${timeframe} ${trendKo}${multiTF.trend1M ? ` | 1M: ${multiTF.trend1M}` : ''}${multiTF.htf || multiTF.ltf ? ` | HTF ${multiTF.htfLabel}: ${multiTF.htf || '-'} | LTF ${multiTF.ltfLabel}: ${multiTF.ltf || '-'}` : ''}`
      : tapSource.summary;

    const briefingContext = marketData
      ? buildBriefingContext(
          { ...tapSource, summary: summaryWithMTF, multiTF },
          {
            currentPrice: marketData.currentPrice,
            buyPressure: marketData.buyPressure,
            sellPressure: marketData.sellPressure,
            volumeDelta: marketData.volumeDelta,
            oiState: marketData.oiState,
            fundingState: marketData.fundingState,
            orderbookImbalance: marketData.orderbookImbalance,
          }
        )
      : buildBriefingContext({ ...tapSource, summary: summaryWithMTF, multiTF });

    let zonePayload: {
      nearestBuyZone?: typeof tsAnalysis.nearestBuyZone;
      nearestSellZone?: typeof tsAnalysis.nearestSellZone;
      strongZoneOverlays?: typeof tsAnalysis.strongZoneOverlays;
      buyZones?: Array<{ low: number; high: number; probability?: number }>;
      sellZones?: Array<{ low: number; high: number; probability?: number }>;
      verdict?: typeof tsAnalysis.verdict;
      confidence?: number;
      buyZoneProbability?: number;
      sellZoneProbability?: number;
      holdProbability?: number;
      breakProbability?: number;
      trapRisk?: number;
    } = {};
    if (strongZoneResultForAnalysis) {
      const zoneResult = strongZoneResultForAnalysis;
      const visible = marketData!.candles.slice(-visibleLimit(timeframe));
      const strongZoneOverlays = strongZonesToOverlays(
        zoneResult.buyZones,
        zoneResult.sellZones,
        ZONE_PRICE_FLOOR,
        ZONE_PRICE_CEIL,
        visible.length
      );
      zonePayload = {
        nearestBuyZone: zoneResult.nearestBuyZone,
        nearestSellZone: zoneResult.nearestSellZone,
        strongZoneOverlays,
        buyZones: zoneResult.buyZones,
        sellZones: zoneResult.sellZones,
        verdict: zoneResult.verdict,
        confidence: zoneResult.confidence,
        buyZoneProbability: zoneResult.nearestBuyZone?.probability,
        sellZoneProbability: zoneResult.nearestSellZone?.probability,
        holdProbability: zoneResult.nearestBuyZone?.holdProbability,
        breakProbability: zoneResult.nearestSellZone?.breakProbability,
        trapRisk: zoneResult.nearestBuyZone?.trapRisk ?? zoneResult.nearestSellZone?.trapRisk,
      };
    }

    let supportObOrderbookDepth: 'many' | 'few' | 'medium' | undefined;
    let resistanceObOrderbookDepth: 'many' | 'few' | 'medium' | undefined;
    if (marketData?.orderbook && marketData.orderbook.bids.length > 0 && marketData.orderbook.asks.length > 0) {
      const sup = tsAnalysis.nearestSupportOb;
      const res = tsAnalysis.nearestResistanceOb;
      if (sup) supportObOrderbookDepth = orderbookDepthLabel(marketData.orderbook, (sup.low + sup.high) / 2);
      if (res) resistanceObOrderbookDepth = orderbookDepthLabel(marketData.orderbook, (res.low + res.high) / 2);
    }

    // 돌파 상승 확률: 오더북 매수우위 + 매도체결 감소 시 상향
    let breakoutUpsideProbability: number | undefined;
    let breakoutUpsideReasons: string[] = [];
    if (marketData != null && tapSource.verdict === 'LONG') {
      const base = Math.min(95, tapSource.confidence ?? 70);
      let prob = base;
      const imb = marketData.orderbookImbalance ?? briefingContext?.orderbookImbalance;
      const sellP = marketData.sellPressure ?? briefingContext?.sellPressure;
      if (typeof imb === 'number' && imb > 0.05) {
        prob += 10;
        breakoutUpsideReasons.push('오더북 매수우위');
      }
      if (typeof sellP === 'number' && sellP < 0.45) {
        prob += 10;
        breakoutUpsideReasons.push('매도체결 감소');
      }
      breakoutUpsideProbability = Math.min(95, prob);
      if (breakoutUpsideReasons.length === 0) breakoutUpsideReasons.push('기본 신호');
    }

    // 돌파 구간 가격대별 확률 (차트 "돌파시 매수/매도" 라벨에 표시)
    const pctZone = 0.002;
    let breakoutLevelProbability: number | undefined;
    let invalidationLevelProbability: number | undefined;
    let supportLevelProbability: number | undefined;
    let resistanceLevelProbability: number | undefined;
    let entryHoldProbability: number | undefined;
    let harmonicDProbability: number | undefined;
    if (marketData?.orderbook && marketData.orderbook.bids.length > 0 && marketData.orderbook.asks.length > 0 && marketData.trades.length > 0) {
      const ob = marketData.orderbook;
      const trades = marketData.trades;
      const levelProbability = (price: number, mode: 'support' | 'resistance' | 'breakout' | 'entry-hold') => {
        const depth = getOrderbookDepthAtPrice(ob, price, pctZone);
        const zone = tradesAtPriceZone(trades, price, pctZone);
        let prob = Math.min(95, tapSource.confidence ?? 70);
        if (mode === 'support' || mode === 'entry-hold') {
          if (depth.totalQty > 0 && depth.bidQty > depth.askQty * 1.2) prob += 8;
          if (zone.tradeCount >= 5 && zone.buyPressure > 0.55) prob += 10;
        } else if (mode === 'resistance') {
          if (depth.totalQty > 0 && depth.askQty > depth.bidQty * 1.2) prob += 8;
          if (zone.tradeCount >= 5 && zone.sellPressure > 0.55) prob += 10;
        } else {
          // breakout
          if (depth.totalQty > 0 && depth.askQty < depth.bidQty * 0.75) prob += 10;
          if (zone.tradeCount >= 5 && zone.sellPressure < 0.45) prob += 10;
        }
        return Math.min(95, Math.max(20, Math.round(prob)));
      };
      if (tapSource.breakoutLevel) {
        const price = tapSource.breakoutLevel.price;
        breakoutLevelProbability = levelProbability(price, 'breakout');
      }
      if (tapSource.invalidationLevel) {
        const price = tapSource.invalidationLevel.price;
        const depth = getOrderbookDepthAtPrice(ob, price, pctZone);
        const zone = tradesAtPriceZone(trades, price, pctZone);
        let prob = Math.min(95, tapSource.confidence ?? 70);
        if (depth.totalQty > 0 && depth.bidQty < depth.askQty * 0.7) {
          prob += 10;
        }
        if (zone.tradeCount >= 5 && zone.buyPressure < 0.45) {
          prob += 10;
        }
        invalidationLevelProbability = Math.min(95, prob);
      }
      if (tapSource.supportLevel) {
        supportLevelProbability = levelProbability(tapSource.supportLevel.price, 'support');
      }
      if (tapSource.resistanceLevel) {
        resistanceLevelProbability = levelProbability(tapSource.resistanceLevel.price, 'resistance');
      }
      const entryPriceNum = parseFloat(tapSource.entry);
      if (!isNaN(entryPriceNum) && entryPriceNum > 0) {
        entryHoldProbability = levelProbability(entryPriceNum, 'entry-hold');
      }
      const harmonicList = Array.isArray((tapSource.engine as any)?.harmonics) ? (tapSource.engine as any).harmonics : [];
      const butterfly = harmonicList.find((h: any) => h?.pattern === 'butterfly' && typeof h?.dPrice === 'number');
      if (butterfly?.dPrice) {
        harmonicDProbability = levelProbability(butterfly.dPrice, butterfly.bias === 'bullish' ? 'support' : 'resistance');
      }
    }

    const entryNum = parseFloat(tapSource.entry);
    const currentPriceForExec = briefingContext.currentPrice ?? 0;
    const execTrend = (tapSource.engine as { trend?: 'bullish' | 'bearish' | 'range' })?.trend ?? 'range';
    const regime = (tapSource.regime ?? (execTrend === 'range' ? 'range' : 'trend')).toLowerCase();
    const isRangeRegime = regime.includes('range') || regime.includes('횡보');
    const tfLastClosed = lastCandleByTf[timeframe];
    const touchedEntry =
      (tapSource.verdict === 'LONG' && entryNum > 0 && currentPriceForExec >= entryNum) ||
      (tapSource.verdict === 'SHORT' && entryNum > 0 && currentPriceForExec <= entryNum);
    // 2단계 실행확정: 엔트리 터치 + 확정봉 종가 유지(해당 TF 종가 기준)
    const closedHoldOk = tfLastClosed
      ? (
          (tapSource.verdict === 'LONG' && tfLastClosed.close >= entryNum && tfLastClosed.close >= tfLastClosed.open) ||
          (tapSource.verdict === 'SHORT' && tfLastClosed.close <= entryNum && tfLastClosed.close <= tfLastClosed.open)
        )
      : true;
    let executionState: 'TOUCHED' | 'CONFIRMED' | undefined;
    if (touchedEntry) executionState = closedHoldOk ? 'CONFIRMED' : 'TOUCHED';
    // 타점 확정(방향 분리): LONG은 breakout+support, SHORT는 invalidation+resistance, 공통으로 entry-hold+실행확정
    const longTapOk =
      tapSource.verdict === 'LONG' &&
      (breakoutLevelProbability ?? 0) >= (isRangeRegime ? 78 : 70) &&
      (supportLevelProbability ?? 0) >= (isRangeRegime ? 75 : 70);
    const shortTapOk =
      tapSource.verdict === 'SHORT' &&
      (invalidationLevelProbability ?? 0) >= (isRangeRegime ? 78 : 70) &&
      (resistanceLevelProbability ?? 0) >= (isRangeRegime ? 75 : 70);
    const stopNum = parseFloat(String(tapSource.stopLoss ?? ''));
    const firstTargetNum = (tapSource.targets ?? [])[0] != null ? parseFloat(String(tapSource.targets[0])) : NaN;
    const risk = !isNaN(entryNum) && !isNaN(stopNum) ? Math.abs(entryNum - stopNum) : NaN;
    const reward = !isNaN(entryNum) && !isNaN(firstTargetNum) ? Math.abs(firstTargetNum - entryNum) : NaN;
    const rrFirst = risk > 0 ? reward / risk : NaN;
    const minRr = isRangeRegime ? 2.0 : 1.6;
    const rrGateOk = !isNaN(rrFirst) && rrFirst >= minRr;
    const tapPointConfirmed = Boolean(
      (longTapOk || shortTapOk) &&
      (entryHoldProbability ?? 0) >= (isRangeRegime ? 75 : 70) &&
      rrGateOk &&
      executionState === 'CONFIRMED'
    );

    const currentPriceClose = briefingContext.currentPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : 0);
    const closeLevels = computeCloseLevels({
      candles1d,
      candles1w,
      candles1M,
      candles1m,
      candles5m,
      candles15m,
      candles1h,
      candles4h,
    });
    const closeStateResult = computeLatchedCloseStateFromClosedCandles(closeLevels, lastCandleByTf);
    const closeScenarioResult = computeCloseScenario(closeLevels, closeStateResult);

    // 5요소 확정(엄격): 구조 + RSI 85+ + 지지/저항 0.3% + 종가(차트 TF·일·주·월 라칭) + FVG 확정 존 + MTF
    const rsiSig = tapSource.rsiDivergenceSignal as { verdict?: string; totalScore?: number; longScore?: number; shortScore?: number } | undefined;
    const engineFvg = (tapSource.engine as { fvg?: Array<{ low: number; high: number; bias: 'bullish' | 'bearish'; valid?: boolean }> })?.fvg ?? [];
    const fvgBoundaries = engineFvg.filter((f: { valid?: boolean }) => f.valid).map((f: { low: number; high: number; bias: 'bullish' | 'bearish' }) => ({ low: f.low, high: f.high, bias: f.bias }));
    const structureMetrics = {
      trend: ((tapSource.engine as any)?.trend ?? null) as 'bullish' | 'bearish' | 'range' | null,
      bosCount: Array.isArray((tapSource.engine as any)?.bos) ? (tapSource.engine as any).bos.length : 0,
      chochCount: Array.isArray((tapSource.engine as any)?.choch) ? (tapSource.engine as any).choch.length : 0,
      obCount: Array.isArray((tapSource.engine as any)?.obs) ? (tapSource.engine as any).obs.length : 0,
      fvgCount: fvgBoundaries.length,
    };
    const confirmedSignal =
      tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT'
        ? computeConfirmedSignal({
            verdict: tapSource.verdict,
            currentPrice: currentPriceClose,
            supportLevel: tapSource.supportLevel ?? null,
            resistanceLevel: tapSource.resistanceLevel ?? null,
            rsiVerdict: (rsiSig?.verdict as 'LONG' | 'SHORT' | 'WATCH' | 'NONE') ?? 'NONE',
            rsiScore: rsiSig?.totalScore ?? (tapSource.verdict === 'LONG' ? rsiSig?.longScore : rsiSig?.shortScore) ?? 0,
            dailyState: closeStateResult.dailyState,
            weeklyState: closeStateResult.weeklyState,
            chartTimeframe: timeframe,
            latchedCloseStates: {
              state1m: closeStateResult.state1m,
              state5m: closeStateResult.state5m,
              state15m: closeStateResult.state15m,
              state1h: closeStateResult.state1h,
              state4h: closeStateResult.state4h,
              dailyState: closeStateResult.dailyState,
              weeklyState: closeStateResult.weeklyState,
              monthlyState: closeStateResult.monthlyState,
            },
            mtfAgainst: {
              htf: (htfTrend as 'bullish' | 'bearish' | 'range') ?? undefined,
              ltf: (ltfTrend as 'bullish' | 'bearish' | 'range') ?? undefined,
              trend1M: (trend1M as 'bullish' | 'bearish' | 'range') ?? undefined,
            },
            fvgBoundaries,
            structureMetrics,
          })
        : {
            confirmed: false,
            direction: null as 'LONG' | 'SHORT' | null,
            structure: false,
            rsi: false,
            supportResistance: false,
            close: false,
            fvgZone: false,
            reasons: [] as string[],
            gatesPassCount: 0,
            readinessTier: 'none' as const,
            mtfBlocked: false,
          };

    const zoneBiasCard = buildZoneBiasCard({
      currentPrice: currentPriceClose,
      verdict: tapSource.verdict,
      nearestSupportOb: tsAnalysis.nearestSupportOb,
      nearestResistanceOb: tsAnalysis.nearestResistanceOb,
      supportLevel: tapSource.supportLevel ?? null,
      resistanceLevel: tapSource.resistanceLevel ?? null,
      invalidationLevel: tapSource.invalidationLevel ?? null,
    });

    if (zonePayload.nearestBuyZone && closeScenarioResult.buyZoneBoost > 0) {
      zonePayload = {
        ...zonePayload,
        nearestBuyZone: { ...zonePayload.nearestBuyZone, probability: Math.min(95, (zonePayload.nearestBuyZone.probability ?? 0) + closeScenarioResult.buyZoneBoost) },
        buyZoneProbability: Math.min(95, (zonePayload.buyZoneProbability ?? 0) + closeScenarioResult.buyZoneBoost),
      };
    }
    if (zonePayload.nearestSellZone && closeScenarioResult.sellZoneBoost > 0) {
      zonePayload = {
        ...zonePayload,
        nearestSellZone: { ...zonePayload.nearestSellZone, probability: Math.min(95, (zonePayload.nearestSellZone.probability ?? 0) + closeScenarioResult.sellZoneBoost) },
        sellZoneProbability: Math.min(95, (zonePayload.sellZoneProbability ?? 0) + closeScenarioResult.sellZoneBoost),
      };
    }

    // 종가선: 4h/1w 등 어떤 타임프레임에서도 1m~월봉 종가 전부 표시. 가격 범위를 종가 레벨 포함하도록 넓혀서 y비율 계산하고, 클라이언트에 이 범위 전달.
    const limit = visibleLimit(timeframe);
    const visibleForClose = candles.slice(-limit);
    const candleMin = visibleForClose.length ? Math.min(...visibleForClose.map((c: { low: number }) => c.low)) : 0;
    const candleMax = visibleForClose.length ? Math.max(...visibleForClose.map((c: { high: number }) => c.high)) : 0;
    const allCloseLevels = [
      closeLevels.close1m,
      closeLevels.close5m,
      closeLevels.close15m,
      closeLevels.close1h,
      closeLevels.close4h,
      closeLevels.dailyCloseLevel,
      closeLevels.weeklyCloseLevel,
      closeLevels.monthlyCloseLevel,
    ].filter((p): p is number => p != null);
    const rangeMin = allCloseLevels.length ? Math.min(candleMin, ...allCloseLevels) : candleMin;
    const rangeMax = allCloseLevels.length ? Math.max(candleMax, ...allCloseLevels) : candleMax;
    const pad = Math.max(1e-9, (rangeMax - rangeMin) * 0.05) || 1;
    const closeRangeMin = rangeMin - pad;
    const closeRangeMax = rangeMax + pad;
    const toRatioClose = (p: number) => (closeRangeMax - p) / Math.max(1e-9, closeRangeMax - closeRangeMin);
    /**
     * AI_ZONE 다층 지지·저항: 가시 캔들에서 스윙 저/고점을 뽑아 위·아래 둘다 밴드로 표시.
     * (라벨은 지저분함 방지 — 빈 문자열, id는 ai- 접두)
     */
    const buildAiSwingLadderZones = (params: {
      candlesSlice: { time?: number; low: number; high: number; close: number }[];
      priceNow: number;
    }) => {
      const out: Array<{
        id: string;
        kind: 'demandZone' | 'supplyZone';
        time1: number;
        time2: number;
        price1: number;
        price2: number;
        confidence: number;
        color: string;
        category: 'zones';
        label: string;
      }> = [];
      const { candlesSlice, priceNow } = params;
      if (!candlesSlice.length || !Number.isFinite(priceNow) || priceNow <= 0) return out;
      const left = 2;
      const right = 2;
      const swingLows: number[] = [];
      const swingHighs: number[] = [];
      for (let i = left; i < candlesSlice.length - right; i += 1) {
        const lo = candlesSlice[i]!.low;
        const hi = candlesSlice[i]!.high;
        const t = Number(candlesSlice[i]!.time);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
        let isLow = true;
        let isHigh = true;
        for (let j = i - left; j <= i + right; j += 1) {
          if (j === i) continue;
          if (candlesSlice[j]!.low < lo) isLow = false;
          if (candlesSlice[j]!.high > hi) isHigh = false;
        }
        if (isLow && Number.isFinite(t)) swingLows.push(lo);
        if (isHigh && Number.isFinite(t)) swingHighs.push(hi);
      }
      const minSep = Math.max(priceNow * 0.0012, 1e-9);
      const uniqueSorted = (vals: number[], side: 'below' | 'above') => {
        const sorted = [...vals].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
        const picked: number[] = [];
        for (const v of sorted) {
          if (side === 'below' && !(v < priceNow - minSep * 0.2)) continue;
          if (side === 'above' && !(v > priceNow + minSep * 0.2)) continue;
          if (picked.some((p) => Math.abs(p - v) < minSep)) continue;
          picked.push(v);
        }
        return side === 'below' ? picked.reverse() : picked;
      };
      let lows = uniqueSorted(swingLows, 'below');
      let highs = uniqueSorted(swingHighs, 'above');
      if (lows.length < 4) {
        const spanBelow = Math.max(1e-9, priceNow - closeRangeMin);
        for (let s = 1; s <= 4; s += 1) {
          const p = priceNow - (spanBelow * s) / 5;
          if (p > closeRangeMin + minSep && !lows.some((x) => Math.abs(x - p) < minSep)) lows.push(p);
        }
        lows = [...new Set(lows)]
          .filter((v) => v < priceNow - minSep * 0.2)
          .sort((a, b) => b - a)
          .slice(0, 6);
      }
      if (highs.length < 4) {
        const spanAbove = Math.max(1e-9, closeRangeMax - priceNow);
        for (let s = 1; s <= 4; s += 1) {
          const p = priceNow + (spanAbove * s) / 5;
          if (p < closeRangeMax - minSep && !highs.some((x) => Math.abs(x - p) < minSep)) highs.push(p);
        }
        highs = [...new Set(highs)]
          .filter((v) => v > priceNow + minSep * 0.2)
          .sort((a, b) => a - b)
          .slice(0, 6);
      }
      const t0 = Number(candlesSlice[0]!.time);
      const t1 = Number(candlesSlice[candlesSlice.length - 1]!.time);
      if (!Number.isFinite(t0) || !Number.isFinite(t1)) return out;
      const band = (p: number) => Math.max(Math.abs(p) * 0.001, 1e-9);
      let bi = 0;
      for (const p of lows.slice(0, 6)) {
        const pad = band(p);
        bi += 1;
        out.push({
          id: `ai-zone-sr-support-${bi}`,
          kind: 'demandZone',
          label: '',
          time1: t0,
          time2: t1,
          price1: p + pad,
          price2: p - pad,
          confidence: 58,
          color: 'rgba(34,197,94,0.1)',
          category: 'zones',
        });
      }
      let ri = 0;
      for (const p of highs.slice(0, 6)) {
        const pad = band(p);
        ri += 1;
        out.push({
          id: `ai-zone-sr-resist-${ri}`,
          kind: 'supplyZone',
          label: '',
          time1: t0,
          time2: t1,
          price1: p + pad,
          price2: p - pad,
          confidence: 58,
          color: 'rgba(239,68,68,0.1)',
          category: 'zones',
        });
      }
      return out;
    };
    const closeOverlays: Array<{
      id: string;
      kind: string;
      label: string;
      x1: number;
      y1: number;
      x2?: number;
      y2?: number;
      confidence: number;
      color?: string;
      category?: string;
      time1?: number;
      time2?: number;
      price1?: number;
      price2?: number;
      noProject?: boolean;
    }> = [];
    // 종가 마감 표기:
    // - accepted_above: 종가 위 마감 확정
    // - accepted_below: 종가 아래 마감 확정
    // - reclaiming/null: 종가 근처(미확정)
    // 기존처럼 무조건 X(실패)로 보이지 않게 상태 자체를 그대로 표시
    const closeStateMark = (state: string | null) =>
      state === 'accepted_above' ? '✓' : state === 'accepted_below' ? '✗' : '•';
    const closeStateText = (state: string | null) =>
      state === 'accepted_above'
        ? '종가 위 마감 확정'
        : state === 'accepted_below'
          ? '종가 아래 마감 확정'
          : '종가 근처(미확정)';
    const closeStateLabel = (state: string | null, prefix: string) =>
      `${closeStateMark(state)} ${prefix} ${closeStateText(state)}`;
    const C = OVERLAY_COLORS;
    const closeTfConfig: Array<{ id: string; level: number | null | undefined; state: string | null | undefined; label: string; color: string }> = [
      { id: 'close-1m', level: closeLevels.close1m, state: closeStateResult.state1m, label: '1m', color: CLOSE_TF_COLORS['close-1m']! },
      { id: 'close-5m', level: closeLevels.close5m, state: closeStateResult.state5m, label: '5m', color: CLOSE_TF_COLORS['close-5m']! },
      { id: 'close-15m', level: closeLevels.close15m, state: closeStateResult.state15m, label: '15m', color: CLOSE_TF_COLORS['close-15m']! },
      { id: 'close-1h', level: closeLevels.close1h, state: closeStateResult.state1h, label: '1h', color: CLOSE_TF_COLORS['close-1h']! },
      { id: 'close-4h', level: closeLevels.close4h, state: closeStateResult.state4h, label: '4h', color: CLOSE_TF_COLORS['close-4h']! },
      { id: 'close-daily', level: closeLevels.dailyCloseLevel, state: closeStateResult.dailyState, label: '일봉', color: CLOSE_TF_COLORS['close-daily']! },
      { id: 'close-weekly', level: closeLevels.weeklyCloseLevel, state: closeStateResult.weeklyState, label: '주봉(월 09:00 KST)', color: CLOSE_TF_COLORS['close-weekly']! },
      { id: 'close-monthly', level: closeLevels.monthlyCloseLevel, state: closeStateResult.monthlyState, label: '월봉', color: CLOSE_TF_COLORS['close-monthly']! },
    ];
    closeTfConfig.forEach(({ id, level, state, label, color }) => {
      if (level != null) {
        /** `price1`/`price2` 명시: 클라 `mapOverlays`가 y·closeOverlayRange 복원에만 의존하지 않게 → 축·캔들과 정확히 일치 */
        closeOverlays.push({
          id,
          kind: 'keyLevel',
          label: closeStateLabel(state ?? null, label),
          x1: 0.02,
          y1: toRatioClose(level),
          x2: 0.98,
          y2: toRatioClose(level),
          price1: level,
          price2: level,
          confidence: 85,
          color,
          category: 'keyLevel',
        });
      }
    });
    if (closeScenarioResult.mustHoldCloseLevel != null) {
      const mh = closeScenarioResult.mustHoldCloseLevel;
      closeOverlays.push({
        id: 'key-mustHold-close',
        kind: 'keyLevel',
        label: `월/주 종가선 유지 ${mh.toLocaleString()}`,
        x1: 0.04,
        y1: toRatioClose(mh),
        x2: 0.98,
        y2: toRatioClose(mh),
        price1: mh,
        price2: mh,
        confidence: 88,
        color: 'rgba(34,197,94,0.92)',
        category: 'keyLevel',
      });
    }
    if (closeScenarioResult.mustReclaimCloseLevel != null) {
      const mr = closeScenarioResult.mustReclaimCloseLevel;
      closeOverlays.push({
        id: 'key-mustReclaim-close',
        kind: 'keyLevel',
        label: `월/주 종가선 재탈환 ${mr.toLocaleString()}`,
        x1: 0.04,
        y1: toRatioClose(mr),
        x2: 0.98,
        y2: toRatioClose(mr),
        price1: mr,
        price2: mr,
        confidence: 88,
        color: 'rgba(248,113,113,0.92)',
        category: 'keyLevel',
      });
    }
    // 텍스트 유사패턴이 차트에 없을 때, 우측 최근 구간에 가이드 작도(쐐기/삼각형)
    const patternTextPool = [
      String((tapSource as any).dominantPattern?.type ?? ''),
      String((tapSource as any).dominantPattern?.label ?? ''),
      String((tapSource as any).dominantPattern?.reason ?? ''),
      String((tapSource as any).patternVisionSummary ?? ''),
      String((tapSource as any).recallSummary ?? ''),
      String((tapSource as any).summary ?? ''),
    ].join(' | ').toLowerCase();
    const hasVisionFw = (tsAnalysis.overlays ?? []).some((o: any) => String(o?.id || '').startsWith('vision-fw-'));
    const hasVisionAsc = (tsAnalysis.overlays ?? []).some((o: any) => String(o?.id || '').startsWith('vision-asc-'));
    const needFwHint = !hasVisionFw && /(falling\s*wedge|하락\s*쐐기|falling wedge breakout)/i.test(patternTextPool);
    const needAscHint = !hasVisionAsc && /(ascending\s*triangle|상승\s*삼각형)/i.test(patternTextPool);
    if ((needFwHint || needAscHint) && candles.length >= 24) {
      const hintBars = candles.slice(-Math.min(42, candles.length));
      const half = Math.max(6, Math.floor(hintBars.length / 2));
      const a = hintBars.slice(0, half);
      const b = hintBars.slice(half);
      const aMax = Math.max(...a.map((c: any) => Number(c.high)));
      const bMax = Math.max(...b.map((c: any) => Number(c.high)));
      const aMin = Math.min(...a.map((c: any) => Number(c.low)));
      const bMin = Math.min(...b.map((c: any) => Number(c.low)));
      if (needFwHint) {
        closeOverlays.push(
          {
            id: 'vision-fw-hint-upper',
            kind: 'scenario',
            label: '하락쐐기 상단',
            x1: 0.64, y1: toRatioClose(aMax * 1.004),
            x2: 0.98, y2: toRatioClose(bMax * 0.998),
            confidence: 72,
            color: 'rgba(248,113,113,0.9)',
            category: 'patternVision',
          },
          {
            id: 'vision-fw-hint-lower',
            kind: 'scenario',
            label: '하락쐐기 하단',
            x1: 0.64, y1: toRatioClose(aMin * 0.999),
            x2: 0.98, y2: toRatioClose(Math.max(bMin * 1.001, aMin * 0.998)),
            confidence: 72,
            color: 'rgba(34,197,94,0.9)',
            category: 'patternVision',
          },
          {
            id: 'vision-fw-hint-label',
            kind: 'label',
            label: 'Falling Wedge Breakout',
            x1: 0.98, y1: toRatioClose((bMax + bMin) / 2), x2: 0.98, y2: toRatioClose((bMax + bMin) / 2),
            confidence: 74,
            color: 'rgba(98,239,224,0.95)',
            category: 'patternVision',
          },
        );
      }
      if (needAscHint) {
        const topFlat = Math.max(bMax, aMax * 0.998);
        closeOverlays.push(
          {
            id: 'vision-asc-hint-top',
            kind: 'scenario',
            label: '상승삼각 상단',
            x1: 0.62, y1: toRatioClose(topFlat),
            x2: 0.98, y2: toRatioClose(topFlat),
            confidence: 73,
            color: 'rgba(248,113,113,0.9)',
            category: 'patternVision',
          },
          {
            id: 'vision-asc-hint-rise',
            kind: 'scenario',
            label: '상승삼각 하단',
            x1: 0.62, y1: toRatioClose(aMin * 0.998),
            x2: 0.98, y2: toRatioClose(bMin * 1.004),
            confidence: 73,
            color: 'rgba(34,197,94,0.9)',
            category: 'patternVision',
          },
          {
            id: 'vision-asc-hint-label',
            kind: 'label',
            label: '상승삼각형 돌파 유사 C',
            x1: 0.98, y1: toRatioClose((topFlat + bMin) / 2), x2: 0.98, y2: toRatioClose((topFlat + bMin) / 2),
            confidence: 75,
            color: 'rgba(98,239,224,0.95)',
            category: 'patternVision',
          },
        );
      }
    }
    // 이미지 스타일 타점 안내: BREAKOUT -> RETEST(SUPPORT) -> ENTRY -> TARGET (달봉 분석 공통 적용)
    const tapFullX1 = 0.04;
    const tapFullX2 = 0.98;
    const tapRightX1 = 0.76;
    const tapRightX2 = 0.98;
    const verdictDirChip =
      tapSource.verdict === 'LONG' ? '롱' : tapSource.verdict === 'SHORT' ? '숏' : '관망';
    if (tapSource.breakoutLevel?.price != null) {
      closeOverlays.push({
        id: 'tap-breakout',
        kind: 'keyLevel',
        label: `돌파${breakoutLevelProbability != null ? ` · ${breakoutLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.breakoutLevel.price),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.breakoutLevel.price),
        confidence: breakoutLevelProbability ?? 80,
        color: C.tapBreakout,
        category: 'keyLevel',
      });
    }
    if (tapSource.verdict === 'LONG' && tapSource.resistanceLevel?.price != null && tapSource.breakoutLevel?.price != null) {
      closeOverlays.push({
        id: 'tap-trendline',
        kind: 'scenario',
        label: '추세선',
        x1: 0.22,
        y1: toRatioClose(tapSource.resistanceLevel.price * 1.01),
        x2: 0.74,
        y2: toRatioClose(tapSource.breakoutLevel.price),
        confidence: breakoutLevelProbability ?? 76,
        color: C.tapTrendline,
        category: 'structure',
      });
    }
    if (tapSource.verdict === 'SHORT' && tapSource.supportLevel?.price != null && tapSource.invalidationLevel?.price != null) {
      closeOverlays.push({
        id: 'tap-trendline',
        kind: 'scenario',
        label: '추세선',
        x1: 0.22,
        y1: toRatioClose(tapSource.supportLevel.price * 0.99),
        x2: 0.74,
        y2: toRatioClose(tapSource.invalidationLevel.price),
        confidence: invalidationLevelProbability ?? 76,
        color: C.tapTrendline,
        category: 'structure',
      });
    }
    if (tapSource.supportLevel?.price != null) {
      const supportBoxPad = tapSource.supportLevel.price * 0.0022;
      closeOverlays.push({
        id: 'tap-support-zone',
        kind: 'demandZone',
        label: `지지 구간${supportLevelProbability != null ? ` · ${supportLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.supportLevel.price + supportBoxPad),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.supportLevel.price - supportBoxPad),
        confidence: supportLevelProbability ?? 76,
        color: C.tapSupportZone,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-retest-support',
        kind: 'keyLevel',
        label: `지지선${supportLevelProbability != null ? ` · 지지 ${supportLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.supportLevel.price),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.supportLevel.price),
        confidence: supportLevelProbability ?? 78,
        color: C.tapSupportLine,
        category: 'keyLevel',
      });
      // 이미지 스타일처럼 SUPPORT 라벨 반복 표시
      closeOverlays.push({
        id: 'tap-retest-support-2',
        kind: 'keyLevel',
        label: `지지선`,
        x1: 0.32,
        y1: toRatioClose(tapSource.supportLevel.price),
        x2: 0.66,
        y2: toRatioClose(tapSource.supportLevel.price),
        confidence: supportLevelProbability ?? 76,
        color: C.tapSupportLine,
        category: 'keyLevel',
      });
    }
    if (tapSource.resistanceLevel?.price != null) {
      const resistanceBoxPad = tapSource.resistanceLevel.price * 0.0022;
      closeOverlays.push({
        id: 'tap-resistance-zone',
        kind: 'supplyZone',
        label: `저항 구간${resistanceLevelProbability != null ? ` · ${resistanceLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.resistanceLevel.price + resistanceBoxPad),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.resistanceLevel.price - resistanceBoxPad),
        confidence: resistanceLevelProbability ?? 76,
        color: C.tapResistanceZone,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-resistance',
        kind: 'keyLevel',
        label: `저항선${resistanceLevelProbability != null ? ` · 저항 ${resistanceLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.resistanceLevel.price),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.resistanceLevel.price),
        confidence: resistanceLevelProbability ?? 78,
        color: C.tapResistanceLine,
        category: 'keyLevel',
      });
    }
    const entryPrice = parseFloat(tapSource.entry);
    /** 진입가가 현재가와 3% 이상 이격 시 존 미표시 (캔들 아래에 숏존이 붙어 보이는 현상 방지) */
    const ZONE_STALE_PCT = 0.03;
    const isShort = tapSource.verdict === 'SHORT';
    const zoneStale = !isFinite(entryPrice) || entryPrice <= 0 ||
      (isShort && entryPrice > currentPriceClose * (1 + ZONE_STALE_PCT)) ||
      (!isShort && entryPrice < currentPriceClose * (1 - ZONE_STALE_PCT));
    if (!isNaN(entryPrice) && entryPrice > 0 && !zoneStale) {
      const entryPad = entryPrice * 0.0016;
      closeOverlays.push({
        id: 'tap-entry-zone',
        kind: tapSource.verdict === 'LONG' ? 'demandZone' : 'supplyZone',
        label: `진입 구간 · ${verdictDirChip}`,
        x1: tapRightX1,
        y1: toRatioClose(entryPrice + entryPad),
        x2: tapFullX2,
        y2: toRatioClose(entryPrice - entryPad),
        confidence: entryHoldProbability ?? 78,
        color: C.tapEntryZone,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-entry',
        kind: 'keyLevel',
        label: `진입선${entryHoldProbability != null ? ` · 유지 ${entryHoldProbability}%` : ''}`,
        x1: 0.20,
        y1: toRatioClose(entryPrice),
        x2: tapFullX2,
        y2: toRatioClose(entryPrice),
        confidence: entryHoldProbability ?? 80,
        color: C.tapEntryLine,
        category: 'keyLevel',
      });
      closeOverlays.push({
        id: 'tap-breakout-arrow',
        kind: 'label',
        label: '↗ 돌파',
        x1: 0.70,
        y1: toRatioClose(entryPrice + entryPad * 2),
        x2: 0.70,
        y2: toRatioClose(entryPrice + entryPad * 2),
        confidence: breakoutLevelProbability ?? 75,
        color: C.tapBreakout,
        category: 'labels',
      });
    }
    const stopPrice = parseFloat(tapSource.stopLoss);
    if (!isNaN(stopPrice) && stopPrice > 0 && !zoneStale) {
      const stopPad = stopPrice * 0.0016;
      // 손절 zone도 우측 끝까지 확장 (tapFullX2 사용)
      closeOverlays.push({
        id: 'tap-stop-zone',
        kind: tapSource.verdict === 'LONG' ? 'supplyZone' : 'demandZone',
        label: `손절 구간 · ${verdictDirChip}`,
        x1: tapRightX1,
        y1: toRatioClose(stopPrice + stopPad),
        x2: tapFullX2,
        y2: toRatioClose(stopPrice - stopPad),
        confidence: 76,
        color: C.tapStopZone,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-stop',
        kind: 'keyLevel',
        label: '손절',
        x1: 0.84,
        y1: toRatioClose(stopPrice),
        x2: tapRightX2,
        y2: toRatioClose(stopPrice),
        confidence: 78,
        color: C.tapStopLine,
        category: 'keyLevel',
      });
    }
    const targetNums = (tapSource.targets ?? [])
      .slice(0, 3)
      .map((v: string) => parseFloat(String(v)))
      .filter((v: number) => !isNaN(v) && v > 0);
    const stopForLs = parseFloat(String(tapSource.stopLoss ?? ''));
    const currentPx = currentPriceClose;
    if (targetNums.length > 0 && !zoneStale) {
      const first = targetNums[0];
      const targetPad = first * 0.0018;
      closeOverlays.push({
        id: 'tap-target-zone',
        kind: tapSource.verdict === 'LONG' ? 'demandZone' : 'supplyZone',
        label: `목표 구간 · ${verdictDirChip}`,
        x1: tapRightX1,
        y1: toRatioClose(first + targetPad),
        x2: tapFullX2,
        y2: toRatioClose(first - targetPad),
        confidence: 82,
        color: C.tapTargetZone,
        category: 'zones',
      });
      targetNums.forEach((tp, idx) => {
        const n = idx + 1;
        const reached =
          tapSource.verdict === 'LONG'
            ? currentPx >= tp
            : currentPx <= tp;
        closeOverlays.push({
          id: `tap-target-${n}`,
          kind: 'keyLevel',
          label: `TP${n}${reached ? ' ✓' : ''}`,
          x1: 0.18,
          y1: toRatioClose(tp),
          x2: tapFullX2,
          y2: toRatioClose(tp),
          confidence: reached ? 90 : 82,
          color: reached ? '#22C55E' : C.tapTargetLine,
          category: 'keyLevel',
        });
      });
      if (!isNaN(stopForLs) && stopForLs > 0) {
        const slHit = tapSource.verdict === 'LONG' ? currentPx <= stopForLs : currentPx >= stopForLs;
        closeOverlays.push({
          id: 'tap-stop-ls',
          kind: 'keyLevel',
          label: `SL${slHit ? ' ✗' : ''}`,
          x1: 0.78,
          y1: toRatioClose(stopForLs),
          x2: tapFullX2,
          y2: toRatioClose(stopForLs),
          confidence: slHit ? 90 : 78,
          color: slHit ? '#EF4444' : C.tapStopLine,
          category: 'keyLevel',
        });
      }
    }
    // 미래 예측 3파: ① 브리핑 카드(유사 참조·과거 학습·가장 유사·주요 패턴) + TP1 우선 ② 실패 시 빔 예측
    const patternTextFull = buildBriefingPatternText(tapSource as any);
    const briefingWave = computeBriefingWavePathFromAnalysis(tapSource as any, currentPriceClose, patternTextFull);
    const xA = [0.90, 0.945, 0.982, 0.996];
    const pushWavePath = (
      idPrefix: string,
      label: string,
      vals: number[],
      color: string,
      confidence: number,
      useShort: boolean
    ) => {
      const quad = [vals[0], vals[1], vals[2], vals[3]] as [number, number, number, number];
      const anchored =
        visibleForClose.length >= 4
          ? buildAnchoredWavePath(visibleForClose, timeframe, quad, useShort)
          : null;
      const times = anchored?.times;
      const prices = anchored?.prices;
      const nSeg = prices && prices.length >= 2 ? prices.length - 1 : 3;
      const fallbackY = (i: number) => toRatioClose(vals[Math.min(i, vals.length - 1)]);
      for (let s = 0; s < nSeg; s++) {
        const i0 = s;
        const i1 = s + 1;
        const hasT = times && prices && typeof times[i0] === 'number' && typeof times[i1] === 'number';
        closeOverlays.push({
          id: `${idPrefix}-${s + 1}`,
          kind: 'scenario',
          label: s === 0 ? label : '',
          noProject: s === nSeg - 1,
          ...(hasT
            ? {
                time1: times![i0],
                time2: times![i1],
                price1: prices![i0],
                price2: prices![i1],
                x1: 0.5,
                y1: 0.5,
                x2: 0.5,
                y2: 0.5,
              }
            : {
                x1: xA[Math.min(s, xA.length - 1)],
                y1: fallbackY(s),
                x2: xA[Math.min(s + 1, xA.length - 1)],
                y2: fallbackY(s + 1),
              }),
          confidence,
          color,
          category: 'scenario',
        });
      }
      const pv = prices ?? vals;
      const lastP = pv[pv.length - 1];
      const wave2Kind = vals[2] > vals[1] ? '반등' : '눌림';
      const pForLabel = (idx: number) =>
        prices && typeof prices[idx] === 'number' ? prices[idx] : vals[Math.min(idx, vals.length - 1)];

      if (pv.length >= 5) {
        closeOverlays.push({
          id: `${idPrefix}-label-0`,
          kind: 'label',
          label: `① ${Math.round(pForLabel(0)).toLocaleString()}`,
          ...(times && typeof times[0] === 'number'
            ? { time1: times[0], price1: pForLabel(0), x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }
            : { x1: xA[0], y1: toRatioClose(vals[0]), x2: xA[0], y2: toRatioClose(vals[0]) }),
          confidence,
          color,
          category: 'labels',
        });
        closeOverlays.push({
          id: `${idPrefix}-label-1`,
          kind: 'label',
          label: `② 1파 ${Math.round(pForLabel(1)).toLocaleString()}`,
          ...(times && typeof times[1] === 'number'
            ? { time1: times[1], price1: pForLabel(1), x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }
            : { x1: xA[1], y1: toRatioClose(vals[1]), x2: xA[1], y2: toRatioClose(vals[1]) }),
          confidence,
          color: 'rgba(226,232,240,0.95)',
          category: 'labels',
        });
        closeOverlays.push({
          id: `${idPrefix}-label-mid`,
          kind: 'label',
          label: `③ ${useShort ? '반등' : '눌림'} ${Math.round(pForLabel(2)).toLocaleString()}`,
          ...(times && typeof times[2] === 'number'
            ? { time1: times[2], price1: pForLabel(2), x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }
            : { x1: xA[2], y1: toRatioClose(vals[2]), x2: xA[2], y2: toRatioClose(vals[2]) }),
          confidence,
          color: 'rgba(226,232,240,0.95)',
          category: 'labels',
        });
        closeOverlays.push({
          id: `${idPrefix}-label-3`,
          kind: 'label',
          label: `④ 현재 ${Math.round(pForLabel(3)).toLocaleString()}`,
          ...(times && typeof times[3] === 'number'
            ? { time1: times[3], price1: pForLabel(3), x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }
            : { x1: xA[2], y1: toRatioClose(vals[2]), x2: xA[2], y2: toRatioClose(vals[2]) }),
          confidence,
          color: 'rgba(226,232,240,0.95)',
          category: 'labels',
        });
        closeOverlays.push({
          id: `${idPrefix}-label-tp`,
          kind: 'label',
          label: `TP1 도착 ${Math.round(lastP).toLocaleString()} (${Math.round(confidence)}%)`,
          ...(times && typeof times[4] === 'number'
            ? { time1: times[4], price1: lastP, x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }
            : { x1: xA[3], y1: toRatioClose(vals[3]), x2: xA[3], y2: toRatioClose(vals[3]) }),
          confidence,
          color,
          category: 'labels',
        });
      } else {
        closeOverlays.push({
          id: `${idPrefix}-label-wave1`,
          kind: 'label',
          label: `1파 ${Math.round(vals[1]).toLocaleString()}`,
          ...(times && typeof times[1] === 'number'
            ? { time1: times[1], price1: vals[1], x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }
            : { x1: xA[1], y1: toRatioClose(vals[1]), x2: xA[1], y2: toRatioClose(vals[1]) }),
          confidence,
          color,
          category: 'labels',
        });
        closeOverlays.push({
          id: `${idPrefix}-label-wave2`,
          kind: 'label',
          label: `2파(${wave2Kind})·현재 ${Math.round(vals[2]).toLocaleString()}`,
          ...(times && typeof times[2] === 'number'
            ? { time1: times[2], price1: vals[2], x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }
            : { x1: xA[2], y1: toRatioClose(vals[2]), x2: xA[2], y2: toRatioClose(vals[2]) }),
          confidence,
          color: 'rgba(226,232,240,0.95)',
          category: 'labels',
        });
        closeOverlays.push({
          id: `${idPrefix}-label-wave3`,
          kind: 'label',
          label: `3파·TP1 도착 ${Math.round(vals[3]).toLocaleString()} (${Math.round(confidence)}%)`,
          ...(times && typeof times[3] === 'number'
            ? { time1: times[3], price1: vals[3], x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }
            : { x1: xA[3], y1: toRatioClose(vals[3]), x2: xA[3], y2: toRatioClose(vals[3]) }),
          confidence,
          color,
          category: 'labels',
        });
      }
      const tpTime1 = times && typeof times[times.length - 2] === 'number' ? times[times.length - 2] : xA[2];
      closeOverlays.push({
        id: `${idPrefix}-target-line`,
        kind: 'keyLevel',
        label: `예측 도착가 ${Math.round(lastP).toLocaleString()}`,
        noProject: true,
        ...(typeof tpTime1 === 'number' && times
          ? {
              time1: tpTime1,
              time2: times[times.length - 1],
              price1: lastP,
              price2: lastP,
              x1: 0.5,
              y1: 0.5,
              x2: 0.5,
              y2: 0.5,
            }
          : { x1: xA[2], y1: toRatioClose(vals[3]), x2: 0.998, y2: toRatioClose(vals[3]) }),
        confidence,
        color,
        category: 'keyLevel',
      });
    };

    if (briefingWave) {
      const mainPath = [briefingWave.preAnchor, briefingWave.w1, briefingWave.w2, briefingWave.w3];
      const mainLabel = `브리핑·예측 3파동 ${briefingWave.useShort ? '하락' : '상승'} ${briefingWave.confidence}% · ${briefingWave.tag}`;
      const mainColor = briefingWave.useShort ? 'rgba(239,68,68,0.95)' : 'rgba(34,197,94,0.95)';
      pushWavePath('tap-beam-path-main', mainLabel, mainPath, mainColor, briefingWave.confidence, briefingWave.useShort);
    } else {
      const beamPath = (tapSource as any).beamPathForecast as
        | {
            dominant?: 'LONG' | 'SHORT' | 'MIXED';
            confidence?: number;
            points?: Array<{ horizon: 3 | 5 | 8; longProb: number; shortProb: number; expectedPriceLong: number; expectedPriceShort: number }>;
          }
        | undefined;
      if (beamPath?.points && beamPath.points.length >= 2) {
        const p3 = beamPath.points.find((p) => p.horizon === 3) ?? beamPath.points[0];
        const p5 = beamPath.points.find((p) => p.horizon === 5) ?? beamPath.points[Math.min(1, beamPath.points.length - 1)];
        const p8 = beamPath.points.find((p) => p.horizon === 8) ?? beamPath.points[beamPath.points.length - 1];
        if (p3 && p5 && p8) {
          const longProbAvg = Math.round((p3.longProb + p5.longProb + p8.longProb) / 3);
          const shortProbAvg = Math.round((p3.shortProb + p5.shortProb + p8.shortProb) / 3);
          const longPath = [currentPriceClose, p3.expectedPriceLong, p5.expectedPriceLong, p8.expectedPriceLong];
          const shortPath = [currentPriceClose, p3.expectedPriceShort, p5.expectedPriceShort, p8.expectedPriceShort];
          const dominantPattern = (tapSource as any).dominantPattern as { confidence?: number; bias?: string; type?: string; label?: string; reason?: string } | undefined;
          const patternText = patternTextFull;
          const hasBullFlagContinuation = /(bull\s*flag|불\s*플래그|불플래그).*(continuation|지속|이어짐|상승)/i.test(patternText);
          const hasBearExpansionBreakdown = /(확장형|expanding|broadening).*(하방\s*이탈|breakdown|하락)/i.test(patternText);
          const bullHint =
            (/(bullish|상승|롱|uptrend|reclaim|지지)/i.test(patternText) ? 1 : 0) +
            (hasBullFlagContinuation ? 2 : 0) +
            (/long/.test(String(dominantPattern?.bias ?? '').toLowerCase()) ? 1 : 0);
          const bearHint =
            (/(bearish|하락|숏|downtrend|이탈|저항)/i.test(patternText) ? 1 : 0) +
            (hasBearExpansionBreakdown ? 2 : 0) +
            (/short/.test(String(dominantPattern?.bias ?? '').toLowerCase()) ? 1 : 0);
          const patternUseShort = bearHint > bullHint;
          const patternStrength = Math.max(
            55,
            Math.min(
              96,
              Math.round(
                Number.isFinite(Number(dominantPattern?.confidence))
                  ? Number(dominantPattern?.confidence)
                  : (Number((tapSource as any).learnedPatternsTop5?.[0]?.score) || (patternUseShort ? shortProbAvg : longProbAvg))
              )
            )
          );
          const patternAmp1 = currentPriceClose * (hasBullFlagContinuation || hasBearExpansionBreakdown ? 0.013 : 0.009);
          const patternAmp2 = currentPriceClose * (hasBullFlagContinuation || hasBearExpansionBreakdown ? 0.008 : 0.006);
          const patternAmp3 = currentPriceClose * (hasBullFlagContinuation || hasBearExpansionBreakdown ? 0.022 : 0.015);
          const patternGuidedPath = patternUseShort
            ? [
                currentPriceClose,
                currentPriceClose - patternAmp1,
                currentPriceClose - patternAmp1 + patternAmp2,
                currentPriceClose - patternAmp3,
              ]
            : [
                currentPriceClose,
                currentPriceClose + patternAmp1,
                currentPriceClose + patternAmp1 - patternAmp2,
                currentPriceClose + patternAmp3,
              ];
          const dominantByProb = shortProbAvg > longProbAvg ? 'SHORT' : longProbAvg > shortProbAvg ? 'LONG' : 'MIXED';
          const dominant = beamPath.dominant && beamPath.dominant !== 'MIXED' ? beamPath.dominant : dominantByProb;
          const useShort = (hasBullFlagContinuation || hasBearExpansionBreakdown)
            ? patternUseShort
            : (dominant === 'SHORT' || (dominant === 'MIXED' && tapSource.verdict === 'SHORT'));
          const basePath = (hasBullFlagContinuation || hasBearExpansionBreakdown)
            ? patternGuidedPath
            : (useShort ? shortPath : longPath);
          const wave1 = Number(basePath[1] ?? currentPriceClose);
          const wave3 = Number(basePath[3] ?? basePath[2] ?? currentPriceClose);
          const preAnchor = useShort
            ? currentPriceClose + Math.abs(wave1 - currentPriceClose) * 0.45
            : currentPriceClose - Math.abs(wave1 - currentPriceClose) * 0.45;
          const mainPath = [preAnchor, wave1, currentPriceClose, wave3];
          const mainProb = (hasBullFlagContinuation || hasBearExpansionBreakdown)
            ? patternStrength
            : (useShort ? shortProbAvg : longProbAvg);
          const patternTag = hasBullFlagContinuation
            ? 'BullFlag'
            : hasBearExpansionBreakdown
              ? '확장형'
              : 'beam';
          const mainLabel = `예측 3파동 ${useShort ? '하락' : '상승'} ${mainProb}% · ${patternTag}`;
          const mainColor = useShort ? 'rgba(239,68,68,0.95)' : 'rgba(34,197,94,0.95)';
          pushWavePath('tap-beam-path-main', mainLabel, mainPath, mainColor, Math.max(55, Math.min(96, mainProb)), useShort);
        }
      }
    }

    const structureBouncePath = buildStructureBouncePath({
      currentPrice: currentPriceClose,
      verdict: tapSource.verdict,
      nearestSupportOb: tsAnalysis.nearestSupportOb,
      nearestResistanceOb: tsAnalysis.nearestResistanceOb,
      supportLevel: tapSource.supportLevel,
      resistanceLevel: tapSource.resistanceLevel,
      invalidationLevel: tapSource.invalidationLevel,
      entry: tapSource.entry,
      stopLoss: tapSource.stopLoss,
      targets: tapSource.targets,
      wavePath: briefingWave,
    });
    if (structureBouncePath) {
      for (const o of buildStructureBounceOverlays(structureBouncePath, toRatioClose)) {
        closeOverlays.push(o);
      }
    }
    const aiZoneSignal = buildAiZoneSignal({
      verdict: tapSource.verdict,
      confidence: tapSource.confidence,
      probability: tapSource.probability ?? null,
      mtf: tapSource.mtf ?? null,
      confirmedSignal,
      zoneBiasCard,
      structureBouncePath,
      supportLevel: tapSource.supportLevel,
      resistanceLevel: tapSource.resistanceLevel,
      invalidationLevel: tapSource.invalidationLevel,
      targets: tapSource.targets,
      currentPrice: currentPriceClose,
    });
    const aiStageBadge =
      aiZoneSignal.stage === 'confirmed' ? '✓ 확정' : aiZoneSignal.stage === 'prepared' ? '◐ 준비' : '● 의견';
    // AI_ZONE 반응 체감용 고정 상태 라벨: zone 유무와 상관없이 항상 1개 표시
    closeOverlays.push({
      id: 'ai-zone-status',
      kind: 'label',
      label: `AI분석 ${aiStageBadge} ${aiZoneSignal.verdict} ${aiZoneSignal.confidence}%`,
      x1: 0.12,
      y1: toRatioClose(currentPriceClose),
      x2: 0.12,
      y2: toRatioClose(currentPriceClose),
      confidence: Math.max(52, aiZoneSignal.confidence),
      color: 'rgba(125,211,252,0.96)',
      category: 'labels',
    });
    if (aiZoneSignal.zone) {
      const z = aiZoneSignal.zone;
      const zPad = Math.max(1e-9, (z.high - z.low) * 0.08);
      closeOverlays.push({
        id: 'ai-zone-main',
        kind: z.side === 'LONG' ? 'demandZone' : 'supplyZone',
        label: `AI분석 ${aiStageBadge} ${z.side} ${aiZoneSignal.confidence}%`,
        x1: 0.10,
        y1: toRatioClose(z.high + zPad),
        x2: 0.995,
        y2: toRatioClose(z.low - zPad),
        confidence: aiZoneSignal.confidence,
        color: z.side === 'LONG' ? 'rgba(34,197,94,0.20)' : 'rgba(239,68,68,0.20)',
        category: 'zones',
      });
      if (z.invalidation != null) {
        closeOverlays.push({
          id: 'ai-zone-invalidation',
          kind: 'keyLevel',
          label: `AI 무효 ${Math.round(z.invalidation).toLocaleString()}`,
          x1: 0.18,
          y1: toRatioClose(z.invalidation),
          x2: 0.995,
          y2: toRatioClose(z.invalidation),
          confidence: Math.max(55, aiZoneSignal.confidence - 6),
          color: 'rgba(248,113,113,0.92)',
          category: 'keyLevel',
        });
      }
      if (z.targetHint != null) {
        closeOverlays.push({
          id: 'ai-zone-target',
          kind: 'keyLevel',
          label: `AI 목표 ${Math.round(z.targetHint).toLocaleString()}`,
          x1: 0.18,
          y1: toRatioClose(z.targetHint),
          x2: 0.995,
          y2: toRatioClose(z.targetHint),
          confidence: Math.max(58, aiZoneSignal.confidence - 4),
          color: 'rgba(56,189,248,0.94)',
          category: 'keyLevel',
        });
      }
    }
    // AI_ZONE에서 롱/숏 기준을 동시에 보이게: 핵심 OB/HOTZONE 참조 박스
    const makeFallbackBand = (center?: number | null) => {
      if (!Number.isFinite(center)) return null;
      const c = Number(center);
      const pad = Math.max(Math.abs(c) * 0.0025, 1e-9);
      return { low: c - pad, high: c + pad, probability: 55 };
    };
    const levelToNum = (v: unknown, fallback: number): number => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (v && typeof v === 'object' && 'price' in (v as object)) {
        const p = (v as { price?: unknown }).price;
        if (typeof p === 'number' && Number.isFinite(p)) return p;
      }
      return fallback;
    };
    const longRef =
      tsAnalysis.nearestSupportOb ??
      zonePayload.nearestBuyZone ??
      makeFallbackBand(levelToNum(tapSource.supportLevel, currentPriceClose));
    const shortRef =
      tsAnalysis.nearestResistanceOb ??
      zonePayload.nearestSellZone ??
      makeFallbackBand(levelToNum(tapSource.resistanceLevel, currentPriceClose));
    const longRefSource = tsAnalysis.nearestSupportOb ? 'BULL OB' : zonePayload.nearestBuyZone ? 'HOTZONE' : 'FALLBACK';
    const shortRefSource = tsAnalysis.nearestResistanceOb ? 'BEAR OB' : zonePayload.nearestSellZone ? 'HOTZONE' : 'FALLBACK';
    if (longRef && Number.isFinite(longRef.low) && Number.isFinite(longRef.high)) {
      closeOverlays.push({
        id: 'ai-zone-long-ref',
        kind: 'demandZone',
        label: `AI 롱 기준존(${longRefSource}) ${Math.round(longRef.low).toLocaleString()}~${Math.round(longRef.high).toLocaleString()}`,
        x1: 0.10,
        y1: toRatioClose(Math.max(longRef.low, longRef.high)),
        x2: 0.995,
        y2: toRatioClose(Math.min(longRef.low, longRef.high)),
        confidence: Math.max(50, Math.round((longRef as any).probability ?? 62)),
        color: 'rgba(34,197,94,0.12)',
        category: 'zones',
      });
    }
    if (shortRef && Number.isFinite(shortRef.low) && Number.isFinite(shortRef.high)) {
      closeOverlays.push({
        id: 'ai-zone-short-ref',
        kind: 'supplyZone',
        label: `AI 숏 기준존(${shortRefSource}) ${Math.round(shortRef.low).toLocaleString()}~${Math.round(shortRef.high).toLocaleString()}`,
        x1: 0.10,
        y1: toRatioClose(Math.max(shortRef.low, shortRef.high)),
        x2: 0.995,
        y2: toRatioClose(Math.min(shortRef.low, shortRef.high)),
        confidence: Math.max(50, Math.round((shortRef as any).probability ?? 62)),
        color: 'rgba(239,68,68,0.12)',
        category: 'zones',
      });
    }
    // zone 박스가 비정상 케이스로 누락돼도 롱/숏 기준선은 항상 보이도록 보강
    if (longRef && Number.isFinite(longRef.low) && Number.isFinite(longRef.high)) {
      const longMid = (longRef.low + longRef.high) / 2;
      closeOverlays.push({
        id: 'ai-zone-long-midline',
        kind: 'keyLevel',
        label: `AI 롱 라인 ${Math.round(longMid).toLocaleString()}`,
        x1: 0.2,
        y1: toRatioClose(longMid),
        x2: 0.995,
        y2: toRatioClose(longMid),
        confidence: Math.max(52, Math.round((longRef as any).probability ?? 62)),
        color: 'rgba(34,197,94,0.9)',
        category: 'keyLevel',
      });
    }
    if (shortRef && Number.isFinite(shortRef.low) && Number.isFinite(shortRef.high)) {
      const shortMid = (shortRef.low + shortRef.high) / 2;
      closeOverlays.push({
        id: 'ai-zone-short-midline',
        kind: 'keyLevel',
        label: `AI 숏 라인 ${Math.round(shortMid).toLocaleString()}`,
        x1: 0.2,
        y1: toRatioClose(shortMid),
        x2: 0.995,
        y2: toRatioClose(shortMid),
        confidence: Math.max(52, Math.round((shortRef as any).probability ?? 62)),
        color: 'rgba(239,68,68,0.9)',
        category: 'keyLevel',
      });
    }
    const aiUnifiedLongShort = buildAiUnifiedLongShort({
      aiZoneSignal,
      currentPrice: currentPriceClose,
      breakoutLevel: tapSource.breakoutLevel ?? null,
      supportLevel: tapSource.supportLevel,
      resistanceLevel: tapSource.resistanceLevel,
      longRef:
        longRef && Number.isFinite(longRef.low) && Number.isFinite(longRef.high)
          ? { low: longRef.low, high: longRef.high, source: longRefSource }
          : null,
      shortRef:
        shortRef && Number.isFinite(shortRef.low) && Number.isFinite(shortRef.high)
          ? { low: shortRef.low, high: shortRef.high, source: shortRefSource }
          : null,
      mustBreak: typeof (tapSource as { mustBreak?: string }).mustBreak === 'string' ? (tapSource as { mustBreak: string }).mustBreak : undefined,
      mustHold: typeof (tapSource as { mustHold?: string }).mustHold === 'string' ? (tapSource as { mustHold: string }).mustHold : undefined,
    });
    for (const z of buildAiSwingLadderZones({ candlesSlice: visibleForClose as any, priceNow: currentPriceClose })) {
      closeOverlays.push({
        id: z.id,
        kind: z.kind,
        label: z.label,
        x1: 0.1,
        y1: toRatioClose(Math.max(z.price1, z.price2)),
        x2: 0.995,
        y2: toRatioClose(Math.min(z.price1, z.price2)),
        confidence: z.confidence,
        color: z.color,
        category: 'zones',
        time1: z.time1,
        time2: z.time2,
        price1: z.price1,
        price2: z.price2,
      });
    }

    // 나비D (Butterfly D) - 달봉 분석 공통
    const harmonicList = Array.isArray((tapSource.engine as any)?.harmonics) ? (tapSource.engine as any).harmonics : [];
    const butterfly = harmonicList.find((h: any) => h?.pattern === 'butterfly' && typeof h?.dPrice === 'number');
    if (butterfly?.dPrice) {
      const dPrice = Number(butterfly.dPrice);
      const dPad = dPrice * 0.0018;
      closeOverlays.push({
        id: 'tap-harmonic-d-zone',
        kind: butterfly.bias === 'bullish' ? 'demandZone' : 'supplyZone',
        label: `나비 D 구간${harmonicDProbability != null ? ` · ${harmonicDProbability}%` : ''}`,
        x1: 0.70,
        y1: toRatioClose(dPrice + dPad),
        x2: 0.98,
        y2: toRatioClose(dPrice - dPad),
        confidence: harmonicDProbability ?? 74,
        color: butterfly.bias === 'bullish' ? C.tapHarmonicZoneBullish : C.tapHarmonicZoneBearish,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-harmonic-d',
        kind: 'keyLevel',
        label: `나비 D ${butterfly.bias === 'bullish' ? '매수' : '매도'}${harmonicDProbability != null ? ` · ${harmonicDProbability}%` : ''}`,
        x1: 0.16,
        y1: toRatioClose(dPrice),
        x2: 0.98,
        y2: toRatioClose(dPrice),
        confidence: harmonicDProbability ?? 74,
        color: butterfly.bias === 'bullish' ? C.tapHarmonicBullish : C.tapHarmonicBearish,
        category: 'keyLevel',
      });
    }
    const engineOverlays = (tsAnalysis.overlays ?? []) as typeof closeOverlays;
    const isExecutionCritical = (o: { id?: string; kind?: string; category?: string }) => {
      const id = String(o.id || '');
      if (id.startsWith('parkf-')) return true;
      if (id.startsWith('lvrb-')) return true;
      if (o.category === 'lvrb') return true;
      if (id.startsWith('vts-')) return true;
      if (o.category === 'volatilityTrendScore') return true;
      return (
        o.id?.startsWith?.('beam-forecast-') ||
        o.id?.startsWith?.('beam-confirm-') ||
        o.id?.startsWith?.('tailong-close-') ||
        o.id?.startsWith?.('key-mustBreak-') ||
        o.id?.startsWith?.('key-mustHold-') ||
        o.id?.startsWith?.('key-mustReclaim-') ||
        o.id?.startsWith?.('key-invalidation-') ||
        o.id?.startsWith?.('vision-fw-hint-') ||
        o.id?.startsWith?.('vision-asc-hint-') ||
        o.id?.startsWith?.('triple-') ||
        o.id?.startsWith?.('zone-') ||
        o.id?.startsWith?.('diag-') ||
        o.id?.startsWith?.('retest-') ||
        o.id?.startsWith?.('breakout-') ||
        o.id?.startsWith?.('double-') ||
        o.id === 'tailong-support' ||
        o.id === 'tailong-resistance' ||
        o.id === 'tailong-break' ||
        o.id === 'equilibrium' ||
        o.id === 'strong-high' ||
        o.id === 'strong-low' ||
        o.kind === 'trendLine' ||
        o.kind === 'bos' ||
        o.kind === 'choch' ||
        o.kind === 'eqh' ||
        o.kind === 'eql' ||
        o.kind === 'liquiditySweep' ||
        o.kind === 'fvg' ||
        o.kind === 'ob' ||
        o.kind === 'supplyZone' ||
        o.kind === 'demandZone' ||
        o.kind === 'supportLine' ||
        o.kind === 'resistanceLine' ||
        o.kind === 'keyLevel'
      );
    };
    const priorityOverlays = engineOverlays.filter((o: { id?: string; kind?: string; category?: string }) =>
      isExecutionCritical(o)
    );
    const restOverlays = engineOverlays.filter((o: { id?: string; kind?: string; category?: string }) => !isExecutionCritical(o));
    /**
     * 예전: restLimit = 예산 - closeOverlays - priority → 종가·빔·LS 등 close 쪽이 많은 TF에서 rest가 0이 되어
     * LinReg 콜아웃·패턴 라벨 등이 **서버에서 통째로 삭제**됨. 달봉은 close 항목이 적어 상대적으로 덜 잘림.
     * 엔진 쪽은 analyzeCandles의 overlayCap으로 이미 상한 — 여기서는 분할·재삭제하지 않고 전부 전달.
     */
    const otherOverlays = [...restOverlays, ...priorityOverlays];
    const overlaysWithClose = [...otherOverlays, ...closeOverlays];
    const closeOverlayRange = closeOverlays.length > 0 ? { min: closeRangeMin, max: closeRangeMax } : undefined;

    const swingTapPoint = computeSwingTapPoint({
      verdict: tapSource.verdict,
      confidence: tapSource.confidence,
      longScore: tapSource.longScore,
      shortScore: tapSource.shortScore,
      riskFlags: tapSource.riskFlags ?? [],
      mtf: tapSource.mtf,
      closeBias: closeScenarioResult.closeBias,
      dailyState: closeStateResult.dailyState,
      weeklyState: closeStateResult.weeklyState,
      monthlyState: closeStateResult.monthlyState,
      latchedCloseStates: {
        state1m: closeStateResult.state1m,
        state5m: closeStateResult.state5m,
        state15m: closeStateResult.state15m,
        state1h: closeStateResult.state1h,
        state4h: closeStateResult.state4h,
        dailyState: closeStateResult.dailyState,
        weeklyState: closeStateResult.weeklyState,
        monthlyState: closeStateResult.monthlyState,
      },
      timeframe,
    });

    const swingTapZoneOverlays: typeof closeOverlays = [];
    const isLongOrShort = tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT';
    if (isLongOrShort && tapSource.entry && tapSource.stopLoss) {
      const entryNum = parseFloat(tapSource.entry);
      const stopNum = parseFloat(tapSource.stopLoss);
      const target1Num = (tapSource.targets ?? [])[0] ? parseFloat(String(tapSource.targets[0])) : null;
      if (!isNaN(entryNum) && !isNaN(stopNum)) {
        const direction = tapSource.verdict as 'LONG' | 'SHORT';
        const highPrice = direction === 'LONG'
          ? (target1Num != null && !isNaN(target1Num) ? Math.max(entryNum, target1Num) : entryNum)
          : stopNum;
        const lowPrice = direction === 'LONG'
          ? stopNum
          : (target1Num != null && !isNaN(target1Num) ? Math.min(entryNum, target1Num) : entryNum);
        const isActive90 = swingTapPoint.active && swingTapPoint.direction === direction;
        // 확정(90% 충족)일 때만 차트에 스윙 타점 구간 표시
        if (isActive90) {
          swingTapZoneOverlays.push({
            id: 'swing-tap-zone',
            kind: direction === 'LONG' ? 'demandZone' : 'supplyZone',
            label: '스윙 90% 타점',
            x1: 0.02,
            y1: toRatioClose(highPrice),
            x2: 0.98,
            y2: toRatioClose(lowPrice),
            confidence: 90,
            color: direction === 'LONG' ? C.swingTapZoneLong : C.swingTapZoneShort,
            category: 'zones',
          });
        }
      }
    }

    const entryForMvp = parseFloat(String(tapSource.entry ?? ''));
    const stopForMvp = parseFloat(String(tapSource.stopLoss ?? ''));
    const targetsForMvp = (tapSource.targets ?? []).map((x: string) => parseFloat(String(x))).filter((n: number) => !isNaN(n));
    const mvp = runChartMvpEngine({
      symbol,
      timeframe,
      candles: visibleForClose,
      htfBias: htfTrend as 'bullish' | 'bearish' | 'range' | null,
      ltfBias: ltfTrend as 'bullish' | 'bearish' | 'range' | null,
      trend: ((tapSource.engine as any)?.trend ?? 'range') as 'bullish' | 'bearish' | 'range',
      verdict: tapSource.verdict,
      confidence: tapSource.confidence,
      supportLevel: tapSource.supportLevel?.price,
      resistanceLevel: tapSource.resistanceLevel?.price,
      breakoutLevel: tapSource.breakoutLevel?.price,
      invalidationLevel: tapSource.invalidationLevel?.price,
      entry: !isNaN(entryForMvp) ? entryForMvp : null,
      stop: !isNaN(stopForMvp) ? stopForMvp : null,
      targets: targetsForMvp,
      rr: tapSource.rr ?? null,
      fvgCount: Array.isArray((tapSource.engine as any)?.fvg) ? (tapSource.engine as any).fvg.length : 0,
      obCount: Array.isArray((tapSource.engine as any)?.obs) ? (tapSource.engine as any).obs.length : 0,
      bosCount: Array.isArray((tapSource.engine as any)?.bos) ? (tapSource.engine as any).bos.length : 0,
      chochCount: Array.isArray((tapSource.engine as any)?.choch) ? (tapSource.engine as any).choch.length : 0,
      entryHoldProbability,
      breakoutLevelProbability,
      invalidationLevelProbability,
      supportLevelProbability,
      resistanceLevelProbability,
      currentPrice: briefingContext.currentPrice ?? null,
      zoneSensitivity,
    });
    const mvpZoneOverlays: typeof closeOverlays = [];
    if (mvp.zoneSignal.entryZone) {
      const [zLow, zHigh] = mvp.zoneSignal.entryZone[0] < mvp.zoneSignal.entryZone[1]
        ? mvp.zoneSignal.entryZone
        : [mvp.zoneSignal.entryZone[1], mvp.zoneSignal.entryZone[0]];
      if (mvp.zoneSignal.zone === 'long_confirm' || mvp.zoneSignal.zone === 'short_confirm') {
        mvpZoneOverlays.push({
          id: mvp.zoneSignal.zone === 'long_confirm' ? 'long-confirm-zone' : 'short-confirm-zone',
          kind: mvp.zoneSignal.zone === 'long_confirm' ? 'demandZone' : 'supplyZone',
          label: mvp.zoneSignal.zone === 'long_confirm' ? 'LONG CONFIRM ZONE' : 'SHORT CONFIRM ZONE',
          x1: 0.04,
          y1: toRatioClose(zHigh),
          x2: 0.98,
          y2: toRatioClose(zLow),
          confidence: Math.max(70, mvp.zoneSignal.score),
          color: mvp.zoneSignal.zone === 'long_confirm' ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)',
          category: 'zones',
        });
      }
    }
    if (mvp.zoneSignal.zone === 'wait') {
      mvpZoneOverlays.push({
        id: 'wait-no-trade-zone',
        kind: 'zone',
        label: 'WAIT / NO TRADE ZONE',
        x1: 0.52,
        y1: 0.58,
        x2: 0.98,
        y2: 0.40,
        confidence: Math.max(50, mvp.zoneSignal.score),
        color: 'rgba(148,163,184,0.20)',
        category: 'zones',
      });
    }
    const mvpLabelOverlays: typeof closeOverlays = mvp.zoneSignal.labels.slice(0, 2).map((label, i) => ({
      id: `mvp-signal-label-${i}`,
      kind: 'label',
      label,
      x1: 0.78,
      y1: 0.14 + i * 0.05,
      x2: 0.78,
      y2: 0.14 + i * 0.05,
      confidence: mvp.zoneSignal.score,
      color: label.includes('LONG') ? '#22C55E' : label.includes('SHORT') ? '#EF4444' : '#94A3B8',
      category: 'labels',
    }));

    const frontRunSignal = runFrontRunSignalEngine({
      timeframe,
      currentPrice: currentPriceClose,
      candles: visibleForClose,
      htfBias: htfTrend === 'bullish' || htfTrend === 'bearish' ? htfTrend : 'neutral',
      regime: isRangeRegime ? 'range' : 'trend',
      premiumDiscount: (mvp.structure.premiumDiscount === 'premium' || mvp.structure.premiumDiscount === 'discount')
        ? mvp.structure.premiumDiscount
        : 'neutral',
      supportLevel: tapSource.supportLevel?.price ?? null,
      resistanceLevel: tapSource.resistanceLevel?.price ?? null,
      bosCount: Array.isArray((tapSource.engine as any)?.bos) ? (tapSource.engine as any).bos.length : 0,
      chochCount: Array.isArray((tapSource.engine as any)?.choch) ? (tapSource.engine as any).choch.length : 0,
      sweeps: Array.isArray((tapSource.engine as any)?.sweeps) ? (tapSource.engine as any).sweeps : [],
      rsiVerdict: (rsiSig?.verdict as any) ?? 'NONE',
      rsiScore: rsiSig?.totalScore ?? 0,
      entryHoldProbability,
      breakoutLevelProbability,
      invalidationLevelProbability,
      supportLevelProbability,
      resistanceLevelProbability,
      oiState: briefingContext.oiState ?? 'neutral',
      fundingState: briefingContext.fundingState ?? 'neutral',
      orderbookImbalance: briefingContext.orderbookImbalance,
      buyPressure: briefingContext.buyPressure,
      sellPressure: briefingContext.sellPressure,
      verdict: tapSource.verdict,
      confidence: tapSource.confidence,
      totalSeed: 1000,
    });
    const frontRunOverlays: typeof closeOverlays = [];
    const frStateKo =
      frontRunSignal.state === 'TRIGGERED'
        ? '확정'
        : frontRunSignal.state === 'READY'
          ? '준비'
          : frontRunSignal.state === 'WATCH'
            ? '관찰'
            : frontRunSignal.state === 'INVALID'
              ? '무효'
              : '신호없음';
    const frDirKo =
      frontRunSignal.direction === 'LONG'
        ? '롱'
        : frontRunSignal.direction === 'SHORT'
          ? '숏'
          : '없음';
    const frColor =
      frontRunSignal.state === 'TRIGGERED' && frontRunSignal.direction === 'LONG'
        ? '#22C55E'
        : frontRunSignal.state === 'TRIGGERED' && frontRunSignal.direction === 'SHORT'
          ? '#EF4444'
          : frontRunSignal.state === 'READY'
            ? '#F59E0B'
            : frontRunSignal.state === 'WATCH'
              ? '#38BDF8'
              : '#94A3B8';
    frontRunOverlays.push({
      id: 'front-run-state',
      kind: 'label',
      label: `선반영 ${frStateKo}${frontRunSignal.direction !== 'NONE' ? ` · ${frDirKo}` : ''}`,
      x1: 0.64,
      y1: 0.10,
      x2: 0.64,
      y2: 0.10,
      confidence: frontRunSignal.confidence,
      color: frColor,
      category: 'labels',
    });
    frontRunOverlays.push({
      id: 'front-run-brief',
      kind: 'label',
      label: `선반영 신뢰도 ${frontRunSignal.confidence}% · 점수 ${frontRunSignal.totalScore}`,
      x1: 0.64,
      y1: 0.14,
      x2: 0.64,
      y2: 0.14,
      confidence: frontRunSignal.confidence,
      color: frColor,
      category: 'labels',
    });
    if (frontRunSignal.entry && frontRunSignal.stop && frontRunSignal.tp1 && frontRunSignal.tp2 && frontRunSignal.tp3) {
      const rrTop = frontRunSignal.direction === 'LONG' ? frontRunSignal.tp1 : frontRunSignal.entry;
      const rrBottom = frontRunSignal.direction === 'LONG' ? frontRunSignal.entry : frontRunSignal.tp1;
      frontRunOverlays.push({
        id: 'front-run-rr-box',
        kind: 'zone',
        label: `선반영 RR ${frontRunSignal.rr?.toFixed(2) ?? '-'}`,
        x1: 0.70,
        y1: toRatioClose(rrTop),
        x2: 0.98,
        y2: toRatioClose(rrBottom),
        confidence: frontRunSignal.confidence,
        color: frontRunSignal.direction === 'LONG' ? 'rgba(34,197,94,0.20)' : 'rgba(239,68,68,0.20)',
        category: 'scenario',
      });
      frontRunOverlays.push({
        id: 'front-run-entry',
        kind: 'entry',
        label: '선반영 진입',
        x1: 0.10,
        y1: toRatioClose(frontRunSignal.entry),
        x2: 0.98,
        y2: toRatioClose(frontRunSignal.entry),
        confidence: frontRunSignal.confidence,
        color: '#E2E8F0',
        category: 'scenario',
      });
      frontRunOverlays.push({
        id: 'front-run-stop',
        kind: 'stop',
        label: '선반영 손절',
        x1: 0.72,
        y1: toRatioClose(frontRunSignal.stop),
        x2: 0.98,
        y2: toRatioClose(frontRunSignal.stop),
        confidence: frontRunSignal.confidence,
        color: '#EF4444',
        category: 'scenario',
      });
      [frontRunSignal.tp1, frontRunSignal.tp2, frontRunSignal.tp3].forEach((tp, i) => {
        frontRunOverlays.push({
          id: `front-run-tp-${i + 1}`,
          kind: 'target',
          label: `선반영 목표${i + 1}`,
          x1: 0.10,
          y1: toRatioClose(tp),
          x2: 0.98,
          y2: toRatioClose(tp),
          confidence: frontRunSignal.confidence,
          color: '#22C55E',
          category: 'scenario',
        });
      });
      frontRunOverlays.push({
        id: 'front-run-risk-brief',
        kind: 'label',
        label: `권장 ${frontRunSignal.leverage?.toFixed(2) ?? '-'}x · RR ${frontRunSignal.rr?.toFixed(2) ?? '-'} · 규모 ${frontRunSignal.positionSize ? Math.round(frontRunSignal.positionSize) : '-'} USDT`,
        x1: 0.64,
        y1: 0.18,
        x2: 0.64,
        y2: 0.18,
        confidence: frontRunSignal.confidence,
        color: frColor,
        category: 'labels',
      });
    }

    if (
      (frontRunSignal.state === 'READY' || frontRunSignal.state === 'TRIGGERED') &&
      (frontRunSignal.direction === 'LONG' || frontRunSignal.direction === 'SHORT')
    ) {
      const frTime = Math.floor((visibleForClose[visibleForClose.length - 1]?.time ?? Date.now() / 1000));
      try {
        appendSoftSignal(clientId, {
          symbol,
          timeframe,
          direction: frontRunSignal.direction,
          state: frontRunSignal.state,
          signalTime: frTime,
          at: Date.now(),
        });
      } catch {}
    }
    const signalHistoryBundle = (() => {
      const base = ((tapSource.rsiDivergenceSignal as any)?.signalHistory as Array<{ time: number; verdict: 'LONG' | 'SHORT' }> | undefined) ?? [];
      const merged = new Map<
        string,
        {
          time: number;
          verdict: 'LONG' | 'SHORT';
          weight: number;
          entryPrice?: number;
          stopLoss?: number;
          takeProfit?: number;
        }
      >();
      let rsiCount = 0;
      let confirmedCount = 0;
      let readyCount = 0;
      let triggeredCount = 0;
      let structureRocketCount = 0;
      for (const h of base) {
        if (!h || (h.verdict !== 'LONG' && h.verdict !== 'SHORT')) continue;
        const t = Number(h.time);
        if (!Number.isFinite(t)) continue;
        rsiCount += 1;
        const k = `${t}|${h.verdict}`;
        const prev = merged.get(k);
        if (!prev || prev.weight < 0.85) merged.set(k, { time: t, verdict: h.verdict, weight: 0.85 });
      }
      try {
        const persisted = readConfirmedSignals(clientId);
        for (const s of persisted) {
          if (!s || s.symbol !== symbol || s.timeframe !== timeframe) continue;
          if (s.direction !== 'LONG' && s.direction !== 'SHORT') continue;
          const t = Number(s.entryTime);
          if (!Number.isFinite(t)) continue;
          confirmedCount += 1;
          merged.set(`${t}|${s.direction}`, { time: t, verdict: s.direction, weight: 1.0 });
        }
      } catch {}
      try {
        const soft = readSoftSignals(clientId);
        for (const s of soft) {
          if (!s || s.symbol !== symbol || s.timeframe !== timeframe) continue;
          if (s.direction !== 'LONG' && s.direction !== 'SHORT') continue;
          const t = Number(s.signalTime);
          if (!Number.isFinite(t)) continue;
          const w = s.state === 'TRIGGERED' ? 0.75 : 0.5;
          if (s.state === 'TRIGGERED') triggeredCount += 1;
          if (s.state === 'READY') readyCount += 1;
          const k = `${t}|${s.direction}`;
          const prev = merged.get(k);
          if (!prev || prev.weight < w) merged.set(k, { time: t, verdict: s.direction, weight: w });
        }
      } catch {}
      try {
        const rockets = (tapSource as { structureRocketSignals?: Array<{ time?: number; direction?: string; entryPrice?: number; stopLoss?: number; takeProfit?: number }> })
          .structureRocketSignals;
        for (const rk of rockets ?? []) {
          if (!rk || (rk.direction !== 'LONG' && rk.direction !== 'SHORT')) continue;
          const t = Number(rk.time);
          if (!Number.isFinite(t)) continue;
          structureRocketCount += 1;
          const dir = rk.direction as 'LONG' | 'SHORT';
          const k = `${t}|${dir}`;
          const prev = merged.get(k);
          const row = {
            time: t,
            verdict: dir,
            weight: 0.88,
            entryPrice: typeof rk.entryPrice === 'number' && Number.isFinite(rk.entryPrice) ? rk.entryPrice : undefined,
            stopLoss: typeof rk.stopLoss === 'number' && Number.isFinite(rk.stopLoss) ? rk.stopLoss : undefined,
            takeProfit: typeof rk.takeProfit === 'number' && Number.isFinite(rk.takeProfit) ? rk.takeProfit : undefined,
          };
          if (!prev) merged.set(k, row);
          else {
            merged.set(k, {
              ...prev,
              weight: Math.max(prev.weight, row.weight),
              entryPrice: prev.entryPrice ?? row.entryPrice,
              stopLoss: prev.stopLoss ?? row.stopLoss,
              takeProfit: prev.takeProfit ?? row.takeProfit,
            });
          }
        }
      } catch {}
      const history = [...merged.values()].sort((a, b) => a.time - b.time);
      return {
        history,
        sources: {
          confirmed: confirmedCount,
          rsi: rsiCount,
          triggered: triggeredCount,
          ready: readyCount,
          merged: history.length,
          structureRockets: structureRocketCount,
        },
      };
    })();
    const learningCandles = candles.slice(-learningCandleLimitByTf(timeframe));
    const signalLearning = evaluateSignalLearning(learningCandles, signalHistoryBundle.history, timeframe);
    const failedContextsTop5 = (() => {
      try {
        const store = readVirtualStore(clientId);
        const failed = Array.isArray(store.failedSignals) ? store.failedSignals as Array<{ patternHash?: string; at?: number }> : [];
        const map = new Map<string, { count: number; lastAt: number }>();
        for (const f of failed) {
          const k = String(f?.patternHash ?? '').trim();
          if (!k) continue;
          const at = Number(f?.at ?? 0);
          const prev = map.get(k) ?? { count: 0, lastAt: 0 };
          map.set(k, { count: prev.count + 1, lastAt: Math.max(prev.lastAt, at) });
        }
        return [...map.entries()]
          .map(([context, v]) => ({ context, count: v.count, lastAt: v.lastAt }))
          .sort((a, b) => (b.count - a.count) || (b.lastAt - a.lastAt))
          .slice(0, 5);
      } catch {
        return [] as Array<{ context: string; count: number; lastAt: number }>;
      }
    })();
    // 학습 알람 라벨: 차트 우측 상단에 승률 기반 브리핑 노출
    const learningAlertLabel: typeof closeOverlays = [];
    {
      const winRate = signalLearning.successRate;
      const failRate = signalLearning.failRate;
      const dir = (tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT') ? tapSource.verdict : 'WATCH';
      const dirKo = dir === 'LONG' ? '롱' : dir === 'SHORT' ? '숏' : '보류';
      const color = dir === 'LONG' ? '#22C55E' : dir === 'SHORT' ? '#EF4444' : '#F59E0B';
      learningAlertLabel.push({
        id: 'learning-alert-briefing',
        kind: 'label',
        label: `학습 ${dirKo} · 승 ${winRate.toFixed(1)}% / 실 ${failRate.toFixed(1)}%`,
        x1: 0.72,
        y1: 0.06,
        x2: 0.72,
        y2: 0.06,
        confidence: Math.max(40, Math.min(95, Math.round((winRate * 0.6) + (tapSource.confidence ?? 50) * 0.4))),
        color,
        category: 'labels',
      });
    }
    const signalSource = tapSource.rsiDivergenceSignal as { verdict?: 'LONG' | 'SHORT' | 'WATCH' | 'NONE'; signalBarTime?: number } | undefined;
    const lsDirection =
      confirmedSignal?.confirmed && confirmedSignal.direction
        ? confirmedSignal.direction
        : (signalSource?.verdict === 'LONG' || signalSource?.verdict === 'SHORT')
          ? signalSource.verdict
          : (tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT')
            ? tapSource.verdict
            : null;
    const lsSignalTime = signalSource?.signalBarTime ?? (visibleForClose.length ? visibleForClose[visibleForClose.length - 1].time : undefined);
    let lsSignalPlan: {
      direction: 'LONG' | 'SHORT';
      signalTime: number;
      entry: number;
      stopLoss: number;
      targets: [number, number, number];
      rr: number;
      structureNote?: string;
      maxTarget?: number;
    } | undefined;
    let smartMoneyMvpSignal:
      | {
          forceScore: number;
          whaleScore: number;
          riseStartScore: number;
          totalScore: number;
          state: 'LONG_READY' | 'WATCH' | 'CAUTION';
          entryStyle: 'PULLBACK' | 'BREAKOUT' | 'WAIT';
          probabilityEdge: number;
          venueCvdBias: 'BUY' | 'SELL' | 'MIXED';
          mtfAlignmentScore: number;
          workflowState: 'IDLE' | 'SETUP' | 'ARMED' | 'TRIGGERED' | 'INVALID';
          conditionsMet: number;
          conditionsTotal: number;
          reasons: string[];
          alertText?: string;
          matchedRuleId?: string | null;
          invalidReason?: string | null;
        }
      | undefined;
    let smartMoneyWorkflowHistory: Array<{
      symbol: string;
      timeframe: string;
      state: 'IDLE' | 'SETUP' | 'ARMED' | 'TRIGGERED' | 'INVALID';
      at: number;
      score: number;
      probabilityEdge: number;
      signalTime?: number;
    }> = [];
    let aiSupportResistancePlan:
      | {
          direction: 'LONG' | 'SHORT';
          support: number | null;
          resistance: number | null;
          breakout: number | null;
          invalidation: number | null;
          expectedMoveTo: number | null;
          structureNote: string;
        }
      | undefined;
    if (lsDirection && typeof lsSignalTime === 'number') {
      const idx = visibleForClose.findIndex((c) => c.time === lsSignalTime);
      const srcIdx = idx >= 0 ? idx : visibleForClose.length - 1;
      const src = visibleForClose[Math.max(0, srcIdx)];
      const lookback = visibleForClose.slice(Math.max(0, srcIdx - 80), srcIdx + 1);
      const rangeLow = Math.min(...lookback.map((x) => x.low));
      const rangeHigh = Math.max(...lookback.map((x) => x.high));
      const atr = Math.max(src.close * 0.003, computeAtrLike(lookback, 14));
      const plan = computeTradePlan({
        signal: lsDirection,
        currentPrice: src.close,
        equilibrium: src.close,
        rangeLow,
        rangeHigh,
        atr,
        timeframe,
      });
      const dd = (tapSource as AnalyzeResponse).depthDeltaContext;
      const supportPx =
        tapSource.supportLevel?.price != null && Number.isFinite(tapSource.supportLevel.price)
          ? tapSource.supportLevel.price
          : null;
      const resistancePx =
        tapSource.resistanceLevel?.price != null && Number.isFinite(tapSource.resistanceLevel.price)
          ? tapSource.resistanceLevel.price
          : null;
      const breakoutPx =
        tapSource.breakoutLevel?.price != null && Number.isFinite(tapSource.breakoutLevel.price)
          ? tapSource.breakoutLevel.price
          : null;
      const invalidationPx =
        tapSource.invalidationLevel?.price != null && Number.isFinite(tapSource.invalidationLevel.price)
          ? tapSource.invalidationLevel.price
          : null;
      let adjEntry = plan.entry;
      let adjStop = plan.stopLoss;
      let adjTargets = [plan.targets[0], plan.targets[1], plan.targets[2]] as [number, number, number];
      if (depthDeltaTpAdaptive && dd) {
        const aligned =
          (lsDirection === 'LONG' && dd.regime === 'buy') || (lsDirection === 'SHORT' && dd.regime === 'sell');
        const contra =
          (lsDirection === 'LONG' && dd.regime === 'sell') || (lsDirection === 'SHORT' && dd.regime === 'buy');
        const s = Math.max(0, Math.min(1, Number(dd.strength) || 0));
        if (aligned && s >= 0.45) {
          const ext = 1 + s * 0.2;
          adjTargets = adjTargets.map((tp) => adjEntry + (tp - adjEntry) * ext) as [number, number, number];
        } else if (contra && s >= 0.35) {
          const red = 1 - Math.min(0.28, s * 0.24);
          adjTargets = adjTargets.map((tp) => adjEntry + (tp - adjEntry) * red) as [number, number, number];
          adjStop = adjEntry + (adjStop - adjEntry) * (1 - Math.min(0.18, s * 0.16));
        }
      }
      if (lsDirection === 'LONG') {
        if (supportPx != null && supportPx < adjEntry) {
          adjEntry = adjEntry * 0.7 + supportPx * 0.3;
        }
        const srStopCandidate =
          invalidationPx != null
            ? invalidationPx
            : supportPx != null
              ? supportPx - Math.max(atr * 0.2, supportPx * 0.0012)
              : null;
        if (srStopCandidate != null && srStopCandidate < adjEntry) {
          adjStop = Math.min(adjStop, srStopCandidate);
        }
        if (resistancePx != null && resistancePx > adjEntry) {
          adjTargets[0] = Math.max(adjEntry + atr * 0.35, Math.min(adjTargets[0], resistancePx));
          const extBase = breakoutPx != null && breakoutPx > resistancePx ? breakoutPx : resistancePx;
          adjTargets[1] = Math.max(adjTargets[1], extBase + atr * 0.9);
          adjTargets[2] = Math.max(adjTargets[2], extBase + atr * 1.8);
        }
      } else {
        if (resistancePx != null && resistancePx > adjEntry) {
          adjEntry = adjEntry * 0.7 + resistancePx * 0.3;
        }
        const srStopCandidate =
          invalidationPx != null
            ? invalidationPx
            : resistancePx != null
              ? resistancePx + Math.max(atr * 0.2, resistancePx * 0.0012)
              : null;
        if (srStopCandidate != null && srStopCandidate > adjEntry) {
          adjStop = Math.max(adjStop, srStopCandidate);
        }
        if (supportPx != null && supportPx < adjEntry) {
          adjTargets[0] = Math.min(adjEntry - atr * 0.35, Math.max(adjTargets[0], supportPx));
          const extBase = breakoutPx != null && breakoutPx < supportPx ? breakoutPx : supportPx;
          adjTargets[1] = Math.min(adjTargets[1], extBase - atr * 0.9);
          adjTargets[2] = Math.min(adjTargets[2], extBase - atr * 1.8);
        }
      }
      if (lsDirection === 'LONG') {
        adjTargets = adjTargets.sort((a, b) => a - b) as [number, number, number];
      } else {
        adjTargets = adjTargets.sort((a, b) => b - a) as [number, number, number];
      }
      const risk = Math.max(1e-9, Math.abs(adjEntry - adjStop));
      const reward = Math.max(0, Math.abs(adjTargets[0] - adjEntry));
      const srRr = reward / risk;
      const structureNote =
        lsDirection === 'LONG'
          ? `지지 ${supportPx != null ? supportPx.toFixed(4) : '-'} 유지 시 저항 ${resistancePx != null ? resistancePx.toFixed(4) : '-'}까지 1차, 돌파 시 확장`
          : `저항 ${resistancePx != null ? resistancePx.toFixed(4) : '-'} 거절 시 지지 ${supportPx != null ? supportPx.toFixed(4) : '-'}까지 1차, 이탈 시 확장`;
      lsSignalPlan = {
        direction: lsDirection,
        signalTime: src.time,
        entry: adjEntry,
        stopLoss: adjStop,
        targets: adjTargets,
        rr: Number.isFinite(srRr) ? srRr : plan.rr,
        structureNote,
        maxTarget: adjTargets[2],
      };
      aiSupportResistancePlan = {
        direction: lsDirection,
        support: supportPx,
        resistance: resistancePx,
        breakout: breakoutPx,
        invalidation: invalidationPx,
        expectedMoveTo: adjTargets[2] ?? null,
        structureNote,
      };
      const lsColor = lsDirection === 'LONG' ? '#22C55E' : '#EF4444';
      const lsPrefix = lsDirection === 'LONG' ? 'LS 롱·SR' : 'LS 숏·SR';
      closeOverlays.push({
        id: 'ls-plan-entry',
        kind: 'keyLevel',
        label: `${lsPrefix}`,
        x1: 0.12,
        y1: toRatioClose(lsSignalPlan.entry),
        x2: 0.98,
        y2: toRatioClose(lsSignalPlan.entry),
        confidence: 82,
        color: lsColor,
        category: 'keyLevel',
      });
      closeOverlays.push({
        id: 'ls-plan-sl',
        kind: 'keyLevel',
        label: `${lsPrefix}`,
        x1: 0.72,
        y1: toRatioClose(lsSignalPlan.stopLoss),
        x2: 0.98,
        y2: toRatioClose(lsSignalPlan.stopLoss),
        confidence: 84,
        color: '#EF4444',
        category: 'keyLevel',
      });
      lsSignalPlan.targets.forEach((tp, i) => {
        closeOverlays.push({
          id: `ls-plan-tp-${i + 1}`,
          kind: 'keyLevel',
          label: `${lsPrefix}`,
          x1: 0.12,
          y1: toRatioClose(tp),
          x2: 0.98,
          y2: toRatioClose(tp),
          confidence: 84,
          color: '#22C55E',
          category: 'keyLevel',
        });
      });
      closeOverlays.push({
        id: 'ls-plan-structure-note',
        kind: 'label',
        label: structureNote,
        x1: 0.12,
        y1: lsDirection === 'LONG' ? 0.12 : 0.16,
        x2: 0.12,
        y2: lsDirection === 'LONG' ? 0.12 : 0.16,
        confidence: 82,
        color: lsDirection === 'LONG' ? '#86efac' : '#fca5a5',
        category: 'labels',
      });
    }
    {
      const reasons: string[] = [];
      const condTotal = 7;
      let condMet = 0;
      const vol = Number(tapSource.volumeDelta ?? briefingContext.volumeDelta ?? 0);
      const volBoost = vol > 0 ? 1 : 0;
      const volumeSpike = vol > 0 ? 15 : 6;
      const hasBos =
        Array.isArray(tapSource.structureRocketSignals) &&
        tapSource.structureRocketSignals.some((s) => s.direction === 'LONG');
      const bosScore = hasBos ? 15 : 0;
      const hasSweep =
        Array.isArray((tapSource.engine as any)?.sweeps) && (tapSource.engine as any).sweeps.length > 0;
      const sweepScore = hasSweep ? 20 : 0;
      const hasFvg = Boolean(tapSource.confirmedSignal?.fvgZone) || String(tapSource.currentZoneSummary || '').includes('FVG');
      const fvgScore = hasFvg ? 10 : 0;
      const obReaction = tapSource.nearestSupportOb != null ? 15 : 0;
      const defense = tapSource.supportLevel != null ? 20 : 8;
      const forceScoreRaw = volumeSpike + bosScore + sweepScore + fvgScore + obReaction + defense;
      const forceScore = Math.max(0, Math.min(100, Math.round(forceScoreRaw)));

      const dd = tapSource.depthDeltaContext;
      const venueLegs = marketData?.unifiedMarketMetrics?.exchangeLegs ?? tapSource.unifiedMarketMetrics?.exchangeLegs ?? [];
      const venueBuy = venueLegs.reduce((acc, leg) => acc + Math.max(0, Number(leg?.volumeDeltaUsd ?? 0)), 0);
      const venueSell = venueLegs.reduce((acc, leg) => acc + Math.max(0, -Number(leg?.volumeDeltaUsd ?? 0)), 0);
      const venueNet = venueBuy - venueSell;
      const venueDen = Math.max(1e-9, venueBuy + venueSell);
      const venueBiasPct = (venueNet / venueDen) * 100;
      const venueCvdBias: 'BUY' | 'SELL' | 'MIXED' =
        venueBiasPct >= 8 ? 'BUY' : venueBiasPct <= -8 ? 'SELL' : 'MIXED';
      const ddBuy = dd?.regime === 'buy' ? 25 : dd?.regime === 'neutral' ? 10 : 0;
      const whaleConfl = tapSource.volumeWhaleZoneConfluence;
      const whaleBias = whaleConfl?.confluentLong ? 20 : whaleConfl?.recentConfluentLong ? 10 : 0;
      const oiInc = briefingContext.oiState === 'increasing' ? 20 : 5;
      const divLike =
        dd?.regime === 'buy' && Math.abs(Number(tapSource.volumeDelta ?? 0)) < 1e-9 && tapSource.verdict !== 'LONG' ? 20 : 8;
      const absorbLike = whaleConfl?.lastBarInBuyZone ? 15 : 5;
      const venueScore = venueCvdBias === 'BUY' ? 18 : venueCvdBias === 'SELL' ? 2 : 10;
      const whaleScoreRaw = ddBuy + whaleBias + oiInc + divLike + absorbLike + venueScore;
      const whaleScore = Math.max(0, Math.min(100, Math.round(whaleScoreRaw)));

      const breakoutUp = tapSource.breakoutLevelProbability != null && tapSource.breakoutLevelProbability >= 65;
      const retestOk = tapSource.supportLevelProbability != null && tapSource.supportLevelProbability >= 62;
      const volumeOk = volBoost === 1;
      const cvdOk = dd?.regime === 'buy' || (dd?.smoothedPct ?? 0) > 0;
      const mtfOk = tapSource.mtf?.htfBias === 'bullish' || tapSource.mtf?.htfBias === '상승';
      const fundingOk = briefingContext.fundingState !== 'positive';
      const oiOk = briefingContext.oiState === 'increasing';
      if (breakoutUp) condMet += 1;
      if (retestOk) condMet += 1;
      if (volumeOk) condMet += 1;
      if (cvdOk) condMet += 1;
      if (mtfOk) condMet += 1;
      if (fundingOk) condMet += 1;
      if (oiOk) condMet += 1;
      const riseStartScoreRaw =
        (breakoutUp ? 25 : 0) +
        (retestOk ? 20 : 0) +
        (volumeOk ? 15 : 0) +
        (cvdOk ? 15 : 0) +
        (mtfOk ? 15 : 0) +
        (fundingOk ? 10 : 0);
      const riseStartScore = Math.max(0, Math.min(100, Math.round(riseStartScoreRaw)));
      const totalScore = Math.round((forceScore * 0.35) + (whaleScore * 0.3) + (riseStartScore * 0.35));
      const longProb = Number(tapSource.probability?.longProbability ?? 50);
      const shortProb = Number(tapSource.probability?.shortProbability ?? 50);
      const probabilityEdge = Math.round((longProb - shortProb) * 10) / 10;
      const mtfHtf = tapSource.mtf?.htfBias;
      const mtfLtf = tapSource.mtf?.ltfBias;
      let mtfAlignmentScore = 50;
      if ((mtfHtf === 'bullish' || mtfHtf === '상승') && (mtfLtf === 'bullish' || mtfLtf === '상승')) mtfAlignmentScore = 86;
      else if ((mtfHtf === 'bullish' || mtfHtf === '상승') || (mtfLtf === 'bullish' || mtfLtf === '상승')) mtfAlignmentScore = 68;
      else if ((mtfHtf === 'bearish' || mtfHtf === '하락') && (mtfLtf === 'bearish' || mtfLtf === '하락')) mtfAlignmentScore = 28;
      const totalScoreAdj = Math.round(totalScore * 0.8 + mtfAlignmentScore * 0.2);
      const stateRaw: 'LONG_READY' | 'WATCH' | 'CAUTION' =
        totalScoreAdj >= 80 ? 'LONG_READY' : totalScoreAdj >= 65 ? 'WATCH' : 'CAUTION';
      const state: 'LONG_READY' | 'WATCH' | 'CAUTION' =
        probabilityEdge >= 20 ? stateRaw : stateRaw === 'LONG_READY' ? 'WATCH' : 'CAUTION';
      const entryStyle: 'PULLBACK' | 'BREAKOUT' | 'WAIT' =
        state === 'LONG_READY' && retestOk ? 'PULLBACK' : state === 'LONG_READY' && breakoutUp ? 'BREAKOUT' : 'WAIT';
      reasons.push(`조건 ${condMet}/${condTotal} 충족`);
      if (breakoutUp) reasons.push('저항 돌파/상승 확률 조건');
      if (retestOk) reasons.push('지지 유지(재지지) 조건');
      if (cvdOk) reasons.push('CVD(Δ) 상승 정렬');
      if (fundingOk) reasons.push('펀딩 과열 아님');
      if (oiOk) reasons.push('OI 증가');
      reasons.push(`거래소CVD ${venueCvdBias}(${venueBiasPct.toFixed(1)}%)`);
      reasons.push(`MTF 정렬 ${mtfAlignmentScore}점`);
      if (probabilityEdge < 20) reasons.push(`확률 우위 부족(${probabilityEdge.toFixed(1)}%)`);
      const alertText = `${symbol} ${timeframe} 조건 ${condMet}/${condTotal} · 우위 ${probabilityEdge.toFixed(1)}% · CVD ${venueCvdBias}`;
      const rules = readAlertRules(clientId).filter((r) => r.enabled !== false);
      const matchedRule =
        rules.find((r) => (r.symbol === '*' || r.symbol === symbol) && (r.timeframe === '*' || r.timeframe === timeframe) &&
          totalScoreAdj >= Number(r.minTotalScore ?? 0) &&
          probabilityEdge >= Number(r.minProbabilityEdge ?? -100) &&
          condMet >= Number(r.minConditionsMet ?? 0)
        ) ?? null;
      const currentPriceForWorkflow =
        Number(
          briefingContext.currentPrice ??
          tapSource.currentPrice ??
          (visibleForClose.length ? visibleForClose[visibleForClose.length - 1].close : 0)
        ) || 0;
      const invalidByEdge = probabilityEdge < 0;
      const invalidByDeltaContra = dd?.regime === 'sell' && (dd?.strength ?? 0) >= 0.7;
      const invalidReason =
        invalidByEdge ? `확률 역전(${probabilityEdge.toFixed(1)}%)` :
        invalidByDeltaContra ? `델타 역행 강함(${Number(dd?.strength ?? 0).toFixed(2)})` :
        null;
      const triggerByPrice = lsSignalPlan
        ? currentPriceForWorkflow >= lsSignalPlan.entry * 0.999
        : false;
      const workflowState: 'IDLE' | 'SETUP' | 'ARMED' | 'TRIGGERED' | 'INVALID' =
        invalidByEdge || invalidByDeltaContra
          ? 'INVALID'
          : condMet <= 2
            ? 'IDLE'
            : state === 'CAUTION'
              ? 'SETUP'
              : state === 'WATCH'
                ? 'SETUP'
                : triggerByPrice
                  ? 'TRIGGERED'
                  : 'ARMED';
      {
        const rows = readSmartWorkflowStates(clientId);
        const same = rows.filter((r) => r.symbol === symbol && r.timeframe === timeframe);
        const prev = same.length ? same[same.length - 1] : null;
        if (!prev || prev.state !== workflowState) {
          const lastSignalTime =
            lsSignalPlan?.signalTime ??
            (visibleForClose.length ? visibleForClose[visibleForClose.length - 1].time : undefined);
          appendSmartWorkflowState(clientId, {
            symbol,
            timeframe,
            state: workflowState,
            at: Date.now(),
            score: totalScoreAdj,
            probabilityEdge,
            signalTime: typeof lastSignalTime === 'number' ? lastSignalTime : undefined,
          });
        }
        const refreshed = readSmartWorkflowStates(clientId)
          .filter((r) => r.symbol === symbol && r.timeframe === timeframe)
          .slice(-20);
        smartMoneyWorkflowHistory = refreshed;
      }
      smartMoneyMvpSignal = {
        forceScore,
        whaleScore,
        riseStartScore,
        totalScore: totalScoreAdj,
        state,
        entryStyle,
        probabilityEdge,
        venueCvdBias,
        mtfAlignmentScore,
        workflowState,
        conditionsMet: condMet,
        conditionsTotal: condTotal,
        reasons: reasons.slice(0, 6),
        alertText: matchedRule ? `${alertText} · 규칙충족 ${matchedRule.id}` : alertText,
        matchedRuleId: matchedRule?.id ?? null,
        invalidReason,
      };
      const watchWebhookEnabled = process.env.SMART_MONEY_WEBHOOK_WATCH_ENABLED === '1';
      if (matchedRule && (state === 'LONG_READY' || (watchWebhookEnabled && state === 'WATCH'))) {
        const key = `${clientId}:${symbol}:${timeframe}:${matchedRule.id}:${state}`;
        const now = Date.now();
        const prev = smartMoneyAlertSentAt.get(key) ?? 0;
        if (now - prev >= SMART_MONEY_ALERT_COOLDOWN_MS) {
          smartMoneyAlertSentAt.set(key, now);
          void sendSmartMoneyWebhook({
            symbol,
            timeframe,
            totalScore: totalScoreAdj,
            probabilityEdge,
            conditionsMet: condMet,
            conditionsTotal: condTotal,
            entryStyle,
            state,
            ruleId: matchedRule.id,
            alertText,
          });
        }
      }
      if (tapSource.supportLevel?.price != null) {
        const sp = tapSource.supportLevel.price;
        const pad = Math.max(sp * 0.0016, 1e-8);
        closeOverlays.push({
          id: 'smartmoney-mvp-support-zone',
          kind: 'zone',
          label: '지지존',
          x1: 0.12,
          y1: toRatioClose(sp + pad),
        x2: 1.12,
          y2: toRatioClose(sp - pad),
          confidence: Math.max(62, forceScore),
          color: 'rgba(59,130,246,0.24)',
          category: 'smcDesk',
        });
        closeOverlays.push({
          id: 'smartmoney-mvp-support-line',
          kind: 'supportLine',
          label: '지지선',
          x1: 0.12,
          y1: toRatioClose(sp),
        x2: 1.12,
          y2: toRatioClose(sp),
          confidence: Math.max(62, forceScore),
          color: '#3b82f6',
          category: 'smcDesk',
        });
      }
      if (tapSource.resistanceLevel?.price != null) {
        const rp = tapSource.resistanceLevel.price;
        const pad = Math.max(rp * 0.0016, 1e-8);
        closeOverlays.push({
          id: 'smartmoney-mvp-resistance-zone',
          kind: 'zone',
          label: '저항존',
          x1: 0.12,
          y1: toRatioClose(rp + pad),
        x2: 1.12,
          y2: toRatioClose(rp - pad),
          confidence: Math.max(62, forceScore),
          color: 'rgba(249,115,22,0.24)',
          category: 'smcDesk',
        });
        closeOverlays.push({
          id: 'smartmoney-mvp-resistance-line',
          kind: 'resistanceLine',
          label: '저항선',
          x1: 0.12,
          y1: toRatioClose(rp),
        x2: 1.12,
          y2: toRatioClose(rp),
          confidence: Math.max(62, forceScore),
          color: '#f97316',
          category: 'smcDesk',
        });
      }
      if (tapSource.breakoutLevel?.price != null) {
        closeOverlays.push({
          id: 'smartmoney-mvp-breakout',
          kind: 'resistanceLine',
          label: '상승선',
          x1: 0.12,
          y1: toRatioClose(tapSource.breakoutLevel.price),
          x2: 1.12,
          y2: toRatioClose(tapSource.breakoutLevel.price),
          confidence: Math.max(60, riseStartScore),
          color: '#22c55e',
          category: 'smcDesk',
        });
      }
      if (tapSource.invalidationLevel?.price != null) {
        closeOverlays.push({
          id: 'smartmoney-mvp-invalidation',
          kind: 'supportLine',
          label: '무효선',
          x1: 0.12,
          y1: toRatioClose(tapSource.invalidationLevel.price),
          x2: 1.12,
          y2: toRatioClose(tapSource.invalidationLevel.price),
          confidence: Math.max(58, riseStartScore - 2),
          color: '#ef4444',
          category: 'smcDesk',
        });
      }
      if (lsSignalPlan) {
        const sigColor = state === 'LONG_READY' ? '#22c55e' : state === 'WATCH' ? '#f59e0b' : '#94a3b8';
        closeOverlays.push({
          id: 'smartmoney-mvp-entry',
          kind: 'entry',
          label:
            entryStyle === 'PULLBACK'
              ? '눌림 진입'
              : entryStyle === 'BREAKOUT'
                ? '돌파 진입'
                : '진입 대기',
          x1: 0.12,
          y1: toRatioClose(lsSignalPlan.entry),
          x2: 1.12,
          y2: toRatioClose(lsSignalPlan.entry),
          confidence: Math.max(65, totalScoreAdj),
          color: sigColor,
          category: 'smcDesk',
        });
        closeOverlays.push({
          id: 'smartmoney-mvp-sl',
          kind: 'stop',
          label: '손절선',
          x1: 0.12,
          y1: toRatioClose(lsSignalPlan.stopLoss),
          x2: 1.12,
          y2: toRatioClose(lsSignalPlan.stopLoss),
          confidence: Math.max(60, totalScoreAdj - 4),
          color: '#ef4444',
          category: 'smcDesk',
        });
        lsSignalPlan.targets.forEach((tp, i) => {
          closeOverlays.push({
            id: `smartmoney-mvp-tp-${i + 1}`,
            kind: 'target',
            label: `목표${i + 1}`,
            x1: 0.12,
            y1: toRatioClose(tp),
            x2: 1.12,
            y2: toRatioClose(tp),
            confidence: Math.max(62, totalScoreAdj - 2),
            color: '#4ade80',
            category: 'smcDesk',
          });
        });
      }
      closeOverlays.push({
        id: 'smartmoney-mvp-alert',
        kind: 'label',
        label: `${workflowState} · ${matchedRule ? `규칙충족 · ${alertText}` : alertText}`,
        x1: 0.74,
        y1: 0.08,
        x2: 0.74,
        y2: 0.08,
        confidence: Math.max(55, totalScoreAdj),
        color: state === 'LONG_READY' ? '#22c55e' : state === 'WATCH' ? '#f59e0b' : '#ef4444',
        category: 'labels',
      });
      {
        const structureState =
          Array.isArray(tapSource.structureRocketSignals) && tapSource.structureRocketSignals.length
            ? tapSource.structureRocketSignals[tapSource.structureRocketSignals.length - 1]?.direction === 'LONG'
              ? '상승'
              : '하락'
            : tapSource.confirmedSignal?.structure
              ? '상승'
              : '중립';
        const hasObPair = Boolean(tapSource.nearestSupportOb || tapSource.nearestResistanceOb);
        const hasSweep =
          Array.isArray((tapSource.engine as any)?.sweeps) && (tapSource.engine as any).sweeps.length !== 0;
        const hasFvg = Boolean(tapSource.confirmedSignal?.fvgZone);
        const smcCompactScore = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (tapSource.smcDeskConfluenceLs
                ? Math.max(
                    Number(tapSource.smcDeskConfluenceLs.longScore || 0),
                    Number(tapSource.smcDeskConfluenceLs.shortScore || 0)
                  )
                : 45) * 0.7 + (mtfAlignmentScore || 50) * 0.3
            )
          )
        );
        const mtfAligned = mtfAlignmentScore >= 68 ? '정렬' : mtfAlignmentScore <= 40 ? '역행' : '혼합';
        closeOverlays.push({
          id: 'smartmoney-mvp-smc-structure',
          kind: 'label',
          label: `구조 ${structureState} · OB ${hasObPair ? '있음' : '없음'} · 스윕 ${hasSweep ? '있음' : '없음'} · FVG ${hasFvg ? '있음' : '없음'}`,
          x1: 0.74,
          y1: 0.115,
          x2: 0.74,
          y2: 0.115,
          confidence: Math.max(55, smcCompactScore),
          color: '#67e8f9',
          category: 'labels',
        });
        closeOverlays.push({
          id: 'smartmoney-mvp-smc-confluence',
          kind: 'label',
          label: `SMC합류 ${smcCompactScore} · MTF ${mtfAligned}(${mtfAlignmentScore})`,
          x1: 0.74,
          y1: 0.145,
          x2: 0.74,
          y2: 0.145,
          confidence: Math.max(55, smcCompactScore),
          color: '#a7f3d0',
          category: 'labels',
        });
      }
      if (workflowState === 'TRIGGERED' && lsSignalPlan) {
        closeOverlays.push({
          id: 'smartmoney-mvp-trigger-marker',
          kind: 'label',
          label: '발동',
          x1: 0.94,
          y1: toRatioClose(lsSignalPlan.entry),
          x2: 0.94,
          y2: toRatioClose(lsSignalPlan.entry),
          confidence: Math.max(72, totalScoreAdj),
          color: '#22c55e',
          category: 'labels',
        });
      }
      {
        const h = smartMoneyWorkflowHistory;
        const prev = h.length >= 2 ? h[h.length - 2] : null;
        const cur = h.length ? h[h.length - 1] : null;
        if (prev && cur && prev.state === 'TRIGGERED' && cur.state === 'INVALID' && lsSignalPlan) {
          closeOverlays.push({
            id: 'smartmoney-mvp-invalid-after-trigger',
            kind: 'label',
            label: `발동 후 무효 전환${invalidReason ? ` · ${invalidReason}` : ''}`,
            x1: 0.86,
            y1: toRatioClose(lsSignalPlan.entry) - 0.04,
            x2: 0.86,
            y2: toRatioClose(lsSignalPlan.entry) - 0.04,
            confidence: 78,
            color: '#ef4444',
            category: 'labels',
          });
        }
      }
    }
    // 선반영 신호는 신호 박스에서만 노출하고, 차트 라벨/작도는 비노출
    const overlaysFinal = [
      ...otherOverlays,
      ...closeOverlays,
      ...swingTapZoneOverlays,
      ...mvpZoneOverlays,
      ...mvpLabelOverlays,
      ...learningAlertLabel,
    ];
    const calcMoveStats = (arr: typeof visibleForClose) => {
      if (arr.length < 12) return { upPct: 0, downPct: 0 };
      const win = Math.min(120, Math.max(20, Math.floor(arr.length * 0.35)));
      const seg = arr.slice(-win);
      let up = 0;
      let down = 0;
      let upN = 0;
      let downN = 0;
      for (let i = 1; i < seg.length; i++) {
        const prev = seg[i - 1].close;
        const cur = seg[i].close;
        if (prev <= 0) continue;
        const r = ((cur - prev) / prev) * 100;
        if (r >= 0) {
          up += r;
          upN += 1;
        } else {
          down += Math.abs(r);
          downN += 1;
        }
      }
      return {
        upPct: upN > 0 ? Math.round((up / upN) * 100) / 100 : 0,
        downPct: downN > 0 ? Math.round((down / downN) * 100) / 100 : 0,
      };
    };
    const moveStats = calcMoveStats(visibleForClose);
    const learningThresholdMap: Record<string, number> = {
      '1m': 62,
      '3m': 61,
      '5m': 60,
      '15m': 59,
      '1h': 58,
      '4h': 57,
      '1d': 56,
      '1w': 55,
      '1M': 55,
    };
    const regimeBoost = isRangeRegime ? 2 : 0;
    const baseThreshold = (learningThresholdMap[timeframe] ?? 58) + regimeBoost;
    const tfRegimeKey = `${symbol}|${timeframe}|${isRangeRegime ? 'range' : 'trend'}`;
    const prevGood = learningModelRegistry.get(tfRegimeKey);
    let learningThreshold = prevGood?.threshold ?? baseThreshold;
    // 워크포워드 OOS 통과 시에만 신규 임계치 적용 (미통과 시 롤백)
    if (signalLearning.walkForward.oosPassed) {
      learningThreshold = Math.round((baseThreshold * 0.45) + (signalLearning.suggestedThreshold * 0.55));
      learningModelRegistry.set(tfRegimeKey, { threshold: learningThreshold, updatedAt: Date.now() });
    }
    const learningScore = Math.round(
      (signalLearning.successRate * 0.65) +
      ((tapSource.confidence ?? 50) * 0.2) +
      ((rrGateOk ? 100 : 40) * 0.15)
    );
    const closedSamples = (signalLearning.tp1Count ?? 0) + (signalLearning.slCount ?? 0);
    const sparseSampleRelax = Math.max(0, Math.min(5, 8 - closedSamples));
    learningThreshold = Math.max(52, learningThreshold - sparseSampleRelax);
    const learningPassed =
      (tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT')
        ? (closedSamples < 4
            ? (tapSource.confidence ?? 50) >= 64
            : learningScore >= learningThreshold)
        : true;
    const learningReasons: string[] = [
      `과거 승률 ${signalLearning.successRate.toFixed(1)}%`,
      `임계치 ${learningThreshold}%`,
      `학습샘플 ${closedSamples}건`,
      `OOS ${signalLearning.walkForward.oosWinRate.toFixed(1)}% (${signalLearning.walkForward.oosSamples}샘플)`,
      signalLearning.walkForward.oosPassed ? '워크포워드 통과(모델 반영)' : '워크포워드 미통과(이전 모델 유지)',
      rrGateOk ? `RR 통과(${rrFirst.toFixed(2)})` : `RR 미달(${isNaN(rrFirst) ? '-' : rrFirst.toFixed(2)})`,
    ];
    const learnDir: 'LONG' | 'SHORT' | 'WATCH' =
      learningPassed && signalLearning.successRate >= 55
        ? (tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT' ? tapSource.verdict : 'WATCH')
        : 'WATCH';
    const learnConfidence = Math.max(
      35,
      Math.min(
        95,
        Math.round(((tapSource.confidence ?? 50) * 0.55) + (signalLearning.successRate * 0.45))
      )
    );
    const adaptiveLearningSignal = {
      direction: learnDir,
      confidence: learnConfidence,
      pastWinRate: signalLearning.successRate,
      pastFailRate: signalLearning.failRate,
      avgUpMovePct: moveStats.upPct,
      avgDownMovePct: moveStats.downPct,
      briefing:
        learnDir === 'WATCH'
          ? `학습필터 보류 · 과거 승률 ${signalLearning.successRate.toFixed(1)}% / 실패 ${signalLearning.failRate.toFixed(1)}%`
          : `학습신호 ${learnDir === 'LONG' ? '롱' : '숏'} · 과거 승률 ${signalLearning.successRate.toFixed(1)}% · 평균 상승 ${moveStats.upPct}% / 하락 ${moveStats.downPct}%`,
    } as const;
    const learningFilter = {
      enabled: true,
      passed: learningPassed,
      score: learningScore,
      threshold: learningThreshold,
      reasons: learningReasons,
    } as const;
    const gatedVerdict = learningPassed ? tapSource.verdict : 'WATCH';
    const analyticsGatedPlan: GatedPlanInput = (() => {
      if (gatedVerdict !== 'LONG' && gatedVerdict !== 'SHORT') return null;
      if (lsSignalPlan && lsSignalPlan.direction === gatedVerdict) {
        return {
          signalBarTime: lsSignalPlan.signalTime,
          direction: lsSignalPlan.direction,
          entry: lsSignalPlan.entry,
          stopLoss: lsSignalPlan.stopLoss,
          targets: lsSignalPlan.targets,
        };
      }
      const entry = Number.parseFloat(String(tapSource.entry ?? '0'));
      const sl = Number.parseFloat(String(tapSource.stopLoss ?? '0'));
      const targets = (tapSource.targets ?? []) as string[];
      const tp1 = Number.parseFloat(String(targets[0] ?? '0'));
      const tp2 = Number.parseFloat(String(targets[1] ?? '0'));
      const tp3 = Number.parseFloat(String(targets[2] ?? '0'));
      const barTime = visibleForClose.length ? visibleForClose[visibleForClose.length - 1].time : Math.floor(Date.now() / 1000);
      if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp1)) return null;
      return {
        signalBarTime: barTime,
        direction: gatedVerdict,
        entry,
        stopLoss: sl,
        targets: [
          tp1,
          Number.isFinite(tp2) ? tp2 : tp1,
          Number.isFinite(tp3) ? tp3 : Number.isFinite(tp2) ? tp2 : tp1,
        ],
      };
    })();
    const gatedTapPointConfirmed = learningPassed ? tapPointConfirmed : false;
    const featureProbabilities = computeFeatureProbabilities(visibleForClose, overlaysFinal as any);
    const briefingPatternText = buildBriefingPatternText(tapSource as any);
    const topPattern = String((tapSource as any)?.learnedPatternsTop5?.[0]?.title ?? (tapSource as any)?.dominantPattern?.label ?? '');
    const fingerprint = buildBriefingFingerprint({
      regime: String((tapSource as any)?.regime ?? (tapSource as any)?.engine?.trend ?? 'unknown'),
      verdict: (tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT') ? tapSource.verdict : 'WATCH',
      confidence: tapSource.confidence ?? 50,
      patternText: briefingPatternText,
      topPattern,
      bosCount: Array.isArray((tapSource as any)?.engine?.bos) ? (tapSource as any).engine.bos.length : 0,
      chochCount: Array.isArray((tapSource as any)?.engine?.choch) ? (tapSource as any).engine.choch.length : 0,
      fvgCount: Array.isArray((tapSource as any)?.engine?.fvg) ? (tapSource as any).engine.fvg.length : 0,
      sweepCount: Array.isArray((tapSource as any)?.engine?.sweeps) ? (tapSource as any).engine.sweeps.length : 0,
      longScore: (tapSource as any)?.longScore ?? 0,
      shortScore: (tapSource as any)?.shortScore ?? 0,
    });
    const similarRaw = findSimilarBriefingMemory(clientId, symbol, timeframe, fingerprint);
    const similarBriefing = similarRaw && similarRaw.similarity >= 74
      ? {
          similarity: similarRaw.similarity,
          at: similarRaw.at,
          summary: similarRaw.summary,
          direction: similarRaw.direction,
          entry: similarRaw.entry,
          stop: similarRaw.stop,
          target1: similarRaw.target1,
          wavePath: similarRaw.wavePath,
        }
      : null;
    appendBriefingMemory(clientId, {
      symbol,
      timeframe,
      at: Date.now(),
      fingerprint,
      summary: summaryWithMTF,
      entry: Number.parseFloat(String(tapSource.entry ?? '0')) || 0,
      stop: Number.parseFloat(String(tapSource.stopLoss ?? '0')) || 0,
      target1: Number.parseFloat(String((tapSource.targets ?? [])[0] ?? '0')) || 0,
      direction: (tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT') ? tapSource.verdict : 'WATCH',
      wavePath: computeBriefingWavePathFromAnalysis(tapSource as any, currentPriceClose, briefingPatternText) ?? undefined,
    });

    try {
      await persistAnalyzeAnalytics({
        clientId,
        useCollect,
        symbol,
        timeframe,
        candles,
        unifiedMarketMetrics: marketData?.unifiedMarketMetrics,
        gatedVerdict,
        gatedPlan: analyticsGatedPlan,
      });
    } catch {
      /* 서버 스토어 실패 시 분석 응답은 그대로 */
    }

    const smartOverlayAnalysis: AnalyzeResponse = {
      ...tapSource,
      verdict: gatedVerdict,
      confidence: usedPythonEngine
        ? (tapSource.confidence ?? 50)
        : (zonePayload.confidence ?? tapSource.confidence ?? 50),
      tapPointConfirmed: gatedTapPointConfirmed,
      currentPrice: briefingContext.currentPrice ?? tapSource.currentPrice,
    };
    const smartOverlay = buildSmartOverlayPayload(smartOverlayAnalysis, visibleForClose);

    const usedConfidenceForFusion = usedPythonEngine
      ? (tapSource.confidence ?? 50)
      : (zonePayload.confidence ?? tapSource.confidence ?? 50);
    const aiFusionSignal = computeAiFusionSignal({
      gatedVerdict,
      gatedConfidence: usedConfidenceForFusion,
      learningPassed,
      smcDeskConfluenceLs: (tapSource as AnalyzeResponse).smcDeskConfluenceLs ?? null,
      confirmedSignal,
      rsiDivergenceSignal: tapSource.rsiDivergenceSignal,
      probability: tapSource.probability,
      zoneSignal: mvp.zoneSignal,
      mtf: tapSource.mtf,
      dominantPattern: tapSource.dominantPattern ?? null,
      volumeWhaleZoneConfluence: tapSource.volumeWhaleZoneConfluence,
      swingTapPoint,
      beamPathForecast: tapSource.beamPathForecast,
      settlementZone: tapSource.settlementZone,
      tapPointConfirmed: gatedTapPointConfirmed,
      analysisPanel: mvp.panel,
      adaptiveLearningSignal,
      pre3Sparkle: tapSource.pre3Sparkle,
      longScore: tapSource.longScore,
      shortScore: tapSource.shortScore,
      depthDeltaContext: tapSource.depthDeltaContext ?? null,
      currentPrice: briefingContext.currentPrice ?? null,
      breakoutLevel: tapSource.breakoutLevel ?? null,
      invalidationLevel: tapSource.invalidationLevel ?? null,
      applyDepthDeltaRegimeFilter: depthDeltaRegimeFilter,
      applyDepthDeltaAlignmentWeight: depthDeltaAlignmentWeight,
    });

    const aiOverlayPool = (overlaysFinal as Array<any>).filter((o) => {
      const id = String(o?.id || '');
      const cat = String(o?.category || '');
      return (
        id.startsWith('ai-') ||
        id.startsWith('whale-') ||
        id.startsWith('hotzone-') ||
        id.startsWith('hypertrend-') ||
        cat === 'chartPrimeTrendChannels' ||
        cat === 'trendlineEngine' ||
        cat === 'autoTrendline' ||
        cat === 'smcDesk'
      );
    });
    const aiZoneStats = (() => {
      const zones = aiOverlayPool.filter((o) =>
        ['zone', 'ob', 'fvg', 'supplyZone', 'demandZone', 'reactionZone', 'bprZone'].includes(String(o?.kind || ''))
      ).length;
      const lines = aiOverlayPool.filter((o) =>
        ['keyLevel', 'supportLine', 'resistanceLine', 'line'].includes(String(o?.kind || ''))
      ).length;
      const trends = aiOverlayPool.filter((o) =>
        String(o?.kind || '') === 'trendLine' ||
        String(o?.id || '').startsWith('diag-') ||
        String(o?.id || '').startsWith('parkf-') ||
        String(o?.id || '').startsWith('cptc-')
      ).length;
      const confidence = Number.isFinite(aiZoneSignal?.confidence) ? Number(aiZoneSignal.confidence) : 50;
      const signalHealth = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            confidence * 0.6 +
            Math.min(100, (Number(confirmedSignal?.gatesPassCount ?? 0) / 5) * 100) * 0.25 +
            Math.min(100, aiOverlayPool.length * 2) * 0.15
          )
        )
      );
      return {
        enabled: true,
        confidence,
        signalHealth,
        overlays: aiOverlayPool.length,
        zones,
        lines,
        trends,
      };
    })();

    return completeSuccess({
      ...tapSource,
      timeframe,
      candles: visibleForClose,
      learningCandleStats: {
        fetched: candles.length,
        visible: visibleForClose.length,
      },
      overlays: overlaysFinal,
      closeOverlayRange,
      swingTapPoint,
      ...zonePayload,
      executionState,
      dailyCloseLevel: closeLevels.dailyCloseLevel,
      weeklyCloseLevel: closeLevels.weeklyCloseLevel,
      monthlyCloseLevel: closeLevels.monthlyCloseLevel,
      closeLevel1m: closeLevels.close1m ?? null,
      closeLevel5m: closeLevels.close5m ?? null,
      closeLevel15m: closeLevels.close15m ?? null,
      closeLevel1h: closeLevels.close1h ?? null,
      closeLevel4h: closeLevels.close4h ?? null,
      dailyState: closeStateResult.dailyState,
      weeklyState: closeStateResult.weeklyState,
      monthlyState: closeStateResult.monthlyState,
      closeBias: closeScenarioResult.closeBias,
      mustHoldCloseLevel: closeScenarioResult.mustHoldCloseLevel,
      mustReclaimCloseLevel: closeScenarioResult.mustReclaimCloseLevel,
      closeScenarios: closeScenarioResult.closeScenarios,
      supportObOrderbookDepth,
      resistanceObOrderbookDepth,
      learnedPatternsTop5: tapSource.learnedPatternsTop5,
      recallSummary: tapSource.recallSummary,
      summary: summaryWithMTF,
      engine: { ...tapSource.engine, pythonEngine: usedPythonEngine, multiTF },
      multiTF,
      engine1M: engine1M ? { trend: engine1M.trend, bos: engine1M.bos, choch: engine1M.choch, fvg: engine1M.fvg, patterns: engine1M.patterns, sweeps: engine1M.sweeps } : null,
      closeSettlement,
      currentPrice: briefingContext.currentPrice,
      buyPressure: briefingContext.buyPressure,
      sellPressure: briefingContext.sellPressure,
      volumeDelta: briefingContext.volumeDelta,
      orderbookImbalance: briefingContext.orderbookImbalance,
      oiState: briefingContext.oiState,
      fundingState: briefingContext.fundingState,
      liquidityState: briefingContext.liquidityState,
      unifiedMarketMetrics: marketData?.unifiedMarketMetrics,
      briefingContext,
      breakoutUpsideProbability,
      breakoutUpsideReasons: breakoutUpsideReasons.length > 0 ? breakoutUpsideReasons : undefined,
      breakoutLevelProbability,
      invalidationLevelProbability,
      supportLevelProbability,
      resistanceLevelProbability,
      entryHoldProbability,
      verdict: gatedVerdict,
      confidence: usedPythonEngine
        ? (tapSource.confidence ?? 50)
        : (zonePayload.confidence ?? tapSource.confidence ?? 50),
      tapPointConfirmed: gatedTapPointConfirmed,
      harmonicDProbability,
      confirmedSignal,
      zoneBiasCard,
      structureBouncePath,
      aiZoneSignal,
      aiUnifiedLongShort,
      aiZoneStats,
      analysisPanel: mvp.panel,
      zoneSignal: mvp.zoneSignal,
      structureState: mvp.structure,
      candleScores: mvp.candleScores.slice(-40),
      schemaVersion: 'analyze-v2',
      zoneSignalSensitivity: zoneSensitivity,
      signalLearning: { ...signalLearning, failedContextsTop5, sampleSources: signalHistoryBundle.sources },
      adaptiveLearningSignal,
      learningFilter,
      featureProbabilities,
      similarBriefing,
      lsSignalPlan,
      aiSupportResistancePlan,
      smartMoneyMvpSignal,
      smartMoneyWorkflowHistory,
      frontRunSignal,
      aiFusionSignal,
      ...(smartOverlay ? { smartOverlay } : {}),
    });
  } catch (error: any) {
    return completeError({
      symbol,
      timeframe,
      verdict: 'WATCH',
      confidence: 50,
      summary: `오류: ${error?.message || '분석 실패'}`,
      entry: '0',
      stopLoss: '0',
      targets: ['0', '0', '0'],
      overlays: [],
      engine: {},
      topReferences: [],
      learnedPatternsTop5: [],
      recallSummary: '',
    });
  } finally {
    releaseSlot();
  }
}
