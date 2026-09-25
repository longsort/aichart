/**
 * 통합·분석 — 채널머니 업그레이드.
 * 우선상태 1개 · 거래량·다봉 확인 · 축선 최소화 · E/SL/TP는 ActiveTrade.
 * 확정 수익·승률 보장 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import {
  calcTradeRewardRisk,
  strengthenUnifiedDeskTradePlan,
} from '@/lib/mergedDeskUnifiedTradeRails';
import {
  buildMergedDeskBlueRedChannels,
  promoteMergedDeskChannelPrimary,
  stampMergedDeskBlueRedMoneyCaptions,
  type MergedDeskChannelConfluence,
  type MergedDeskChannelGeom,
  type MergedDeskChannelHorizon,
} from '@/lib/mergedDeskBlueRedChannels';
import { explainMergedDeskRbLabel } from '@/lib/mergedDeskBlueRedLabelGuide';
import { rbLastBarSignalPin } from '@/lib/mergedDeskRbSignalDraw';
import { buildMergedDeskRbCorridorPhaseVisuals } from '@/lib/mergedDeskRbCorridorPhase';
import {
  buildMergedDeskRbCoreBreakSetFromMoney,
  type MergedDeskRbCoreBreakSet,
} from '@/lib/mergedDeskRbCoreBreakSet';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { SmcZoneBattleVerdict } from '@/lib/assets353SmcZoneConflictIntel';
import { buildMergedDeskRbAiZoneFacePack } from '@/lib/mergedDeskRbAiZoneFace';
import type { MirageZoneProactiveIntel } from '@/lib/mergedDeskMirageZoneExchangeIntel';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import { loadSettings } from '@/lib/settings';
import { collectRbGateTargetMagnets, snapRbGateTargets } from '@/lib/mergedDeskRbGateTargets';
import { computeMergedDeskRbVolumeSync } from '@/lib/mergedDeskRbVolumeSync';
import type { MergedDeskRbVolumeSyncPack } from '@/lib/mergedDeskRbVolumeSync';
import {
  computeMergedDeskRbCorridorPaint,
  type MergedDeskRbCorridorPaint,
} from '@/lib/mergedDeskRbCorridorPaint';
import {
  computeMergedDeskRbChipConfluence,
  type MergedDeskRbChipConfluence,
} from '@/lib/mergedDeskRbChipConfluence';
import type { MergedDeskCycleProgressPack } from '@/lib/mergedDeskCycleProgress';
import {
  evalMergedDeskNewsEntryGate,
  type MergedDeskNewsHintLite,
} from '@/lib/mergedDeskEntryHardGates';
import type { MergedDeskActionablePatternBrief } from '@/lib/mergedDeskActionablePattern';
import type { MonthDeskMoneyZoneHud } from '@/lib/monthDeskMoneyZone';
import {
  applyRbMasterStanceHysteresis,
  computeMergedDeskRbMasterStance,
  lockEdgeCandidatesToMaster,
  type MergedDeskRbMasterStance,
} from '@/lib/mergedDeskRbMasterStance';
import {
  preferMergedDeskRbHorizonForStyle,
  mergedDeskRbStyleWeights,
  normalizeMergedDeskRbTradeStyle,
} from '@/lib/mergedDeskRbAiStyleBrain';
import { applyMergedDeskRbWaveLock, type MergedDeskRbWaveLockPack } from '@/lib/mergedDeskRbWaveLock';
import {
  buildMergedDeskRbWaveHorizonForecast,
  applyRbHorizonForecastToGeomsAndOverlays,
  buildRbHorizonTipZones,
  type MergedDeskRbWaveHorizonForecast,
} from '@/lib/mergedDeskRbWaveHorizonForecast';
import { buildMergedDeskRbFuturePathPack } from '@/lib/mergedDeskRbFuturePath';
import {
  buildMergedDeskWavePathPack,
  type MergedDeskWavePathPack,
} from '@/lib/mergedDeskWavePathEngine';
import {
  computeMergedDeskRbEdgeConfluenceGate,
  stampRbOverlaysWithEdgeGate,
  type MergedDeskRbEdgeConfluenceGatePack,
} from '@/lib/mergedDeskRbEdgeConfluenceGate';
import type { MergedDeskAnchoredVwapPack } from '@/lib/mergedDeskAnchoredVwap';
import type { AvwapFibLeg } from '@/lib/vwap/avwapFibConfluence';
import {
  applyRbFullConfluenceToMoneyPlan,
  computeMergedDeskRbFullConfluence,
} from '@/lib/mergedDeskRbFullConfluence';
import { buildMergedDeskRbWaveStructureDraw, stampRbOverlaysWithWaveAutoLabels } from '@/lib/mergedDeskRbWaveStructureDraw';
import { applyRbRailLedFogPack } from '@/lib/mergedDeskRbRailLedFog';
import {
  buildMergedDeskRbCoreSrCluster,
  snapChannelPlanToRbCoreSr,
  type MergedDeskRbCoreSrClusterPack,
} from '@/lib/mergedDeskRbCoreSrCluster';
import type { MergedDeskCoreSrPack } from '@/lib/mergedDeskCoreSrZones';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';

export type MergedDeskChannelMoneyStatus = 'WAIT' | 'TOUCH' | 'ENTER' | 'INVALID';

export type MergedDeskChannelEdgeState =
  | '돌파가능'
  | '돌파'
  | '안착확정'
  | '돌파실패'
  | '지지가능'
  | '저항가능'
  | '중가';

export type MergedDeskChannelEdgeRead = {
  geom: MergedDeskChannelGeom;
  upper: MergedDeskChannelEdgeState;
  lower: MergedDeskChannelEdgeState;
  captionKo: string;
  pos: number;
  volRatio: number;
  confirmedBars: number;
  /** 상단 돌파 안착 단계 */
  upperSettle: 'none' | 'attempt' | 'settled' | 'failed';
  /** 하단 돌파 안착 단계 */
  lowerSettle: 'none' | 'attempt' | 'settled' | 'failed';
};

export type MergedDeskChannelPrimaryDecision = {
  stateKo: MergedDeskChannelEdgeState;
  horizon: MergedDeskChannelHorizon;
  horizonKo: string;
  edge: 'lower' | 'upper';
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  mode: 'bounce' | 'breakout' | 'wait';
  captionKo: string;
  score: number;
  reasonsKo: string[];
};

export type MergedDeskChannelMoneyPlan = {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationPrice: number;
  invalidationKo: string;
  rr: number;
  status: MergedDeskChannelMoneyStatus;
  statusKo: string;
  entryAllowed: boolean;
  reasonsKo: string[];
  confluence: boolean;
  edge: 'lower' | 'upper';
  mode: 'bounce' | 'breakout';
  edgeStateKo: MergedDeskChannelEdgeState;
  horizonKo: string;
  sourceKo: string;
  tp1Ko?: string;
  tp2Ko?: string;
  tp3Ko?: string;
  tpSnapSummaryKo?: string;
};

export type MergedDeskChannelMoneyEdgePack = {
  overlays: OverlayItem[];
  plan: MergedDeskChannelMoneyPlan | null;
  priceLines: AtlasPulsePriceLine[];
  markers: AtlasPulseMarker[];
  /** 핵심 돌파/안착 캔들색 — ChartView settle paint에 합류 */
  settlePaint: Map<number, import('@/lib/monthDeskSettleCandlePaint').MonthDeskSettleCandleCell>;
  core: MergedDeskRbCoreBreakSet | null;
  summaryKo: string;
  geoms: MergedDeskChannelGeom[];
  edgeReads: MergedDeskChannelEdgeRead[];
  primary: MergedDeskChannelPrimaryDecision | null;
  /** Zone패널 합류 AI 채널면 요약 */
  aiFaceSummaryKo?: string;
  stance?: MergedDeskRbMasterStance | null;
  corridorPaint?: MergedDeskRbCorridorPaint | null;
  chipConfluence?: MergedDeskRbChipConfluence | null;
  /** 파동 LOCK/FREEZE/REBUILD */
  waveLock?: MergedDeskRbWaveLockPack | null;
  /** 레일 합류 게이트 */
  edgeGate?: MergedDeskRbEdgeConfluenceGatePack | null;
  /** 이미지 스펙 FREEZE/LOCK/REBUILD 작도 */
  waveStructure?: import('@/lib/mergedDeskRbWaveStructureDraw').MergedDeskRbWaveStructureDrawPack | null;
  /** 엘리엇·피보·기간 변동 전망 */
  waveHorizon?: MergedDeskRbWaveHorizonForecast | null;
  /** 미래 움직임 시나리오(조건부 투영) */
  futurePath?: import('@/lib/mergedDeskRbFuturePath').MergedDeskRbFuturePathPack | null;
  /** 파동 이동경로 카탈로그 매칭·작도 */
  wavePath?: MergedDeskWavePathPack | null;
  /** 레일 핵심 지지 1 · 저항 1 */
  coreSrCluster?: MergedDeskRbCoreSrClusterPack | null;
};

export type MergedDeskChannelMoneyEdgeOpts = {
  zoneBattle?: SmcZoneBattleVerdict | null;
  zoneBattles?: SmcZoneBattleVerdict[] | null;
  mtfAggregate?: SmcZoneBattleVerdict | null;
  mirageIntel?: MirageZoneProactiveIntel | null;
  mirageIntelList?: MirageZoneProactiveIntel[];
  hotZones?: MergedDeskHotZoneEntry[];
  analysis?: AnalyzeResponse | null;
  volSync?: MergedDeskRbVolumeSyncPack | null;
  cycle?: MergedDeskCycleProgressPack | null;
  pattern?: MergedDeskActionablePatternBrief | null;
  moneyHud?: MonthDeskMoneyZoneHud | null;
  rocketDir?: 'LONG' | 'SHORT' | null;
  stanceKey?: string;
  /** ActiveTrade가 E/SL/무효 전폭선을 맡을 때 채널 중복 레일 생략 */
  omitTradeRails?: boolean;
  newsHint?: MergedDeskNewsHintLite | null;
  /** VRVP POC — 파랑빨강띠 AI 연동 */
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  tradeStyle?: import('@/lib/mergedDeskRbAiStyleBrain').MergedDeskRbTradeStyle | null;
  /** AVWAP · 피보 GP 합류 */
  avwapHigh?: MergedDeskAnchoredVwapPack | null;
  avwapLow?: MergedDeskAnchoredVwapPack | null;
  fibLegs?: AvwapFibLeg[] | null;
  /** 파동 LOCK 키 (symbol:tf) */
  waveLockKey?: string;
  /** 파동 이동경로 작도 ON (기본 true) */
  wavePathEnabled?: boolean;
  /** 레일 핵심 지지·저항 클러스터 (4h는 레일 겹침만) */
  coreSr?: MergedDeskCoreSrPack | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
  keyZones?: MergedKeyZone[] | null;
  criticalZones?: MergedCriticalZone[] | null;
};

function fmt(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) {
    const c = Number(candles[n - 1]?.close) || 0;
    return c > 0 ? c * 0.008 : 0;
  }
  const start = Math.max(1, n - 14);
  let sum = 0;
  let cnt = 0;
  for (let i = start; i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    const pc = Number(candles[i - 1]!.close);
    if (![h, l, pc].every(Number.isFinite)) continue;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    cnt += 1;
  }
  if (cnt <= 0) {
    const c = Number(candles[n - 1]?.close) || 0;
    return c > 0 ? c * 0.008 : 0;
  }
  return sum / cnt;
}

function volRatio(candles: Candle[]): number {
  const n = candles.length;
  if (n < 8) return 1;
  const last = Number(candles[n - 1]?.volume) || 0;
  let sum = 0;
  let cnt = 0;
  for (let i = Math.max(0, n - 21); i < n - 1; i++) {
    const v = Number(candles[i]?.volume);
    if (Number.isFinite(v) && v >= 0) {
      sum += v;
      cnt += 1;
    }
  }
  if (cnt <= 0 || !(last > 0)) return 1;
  return last / (sum / cnt);
}

function statusKoOf(s: MergedDeskChannelMoneyStatus): string {
  if (s === 'ENTER') return '진입';
  if (s === 'TOUCH') return '터치';
  if (s === 'INVALID') return '무효';
  return '대기';
}

function horizonKey(horizonKo: string): MergedDeskChannelHorizon {
  if (horizonKo === '장기') return 'long';
  if (horizonKo === '스윙') return 'fb';
  return 'short';
}

function tipPos(close: number, g: MergedDeskChannelGeom): number {
  if (!(g.width > 0)) return 0.5;
  return (close - g.tipLower) / g.width;
}

function countBreakBars(
  candles: Candle[],
  level: number,
  side: 'above' | 'below',
  buf: number,
  maxLook = 3
): number {
  let n = 0;
  for (let k = 1; k <= maxLook; k++) {
    const c = candles[candles.length - k];
    if (!c) break;
    const close = Number(c.close);
    if (!Number.isFinite(close)) break;
    const ok = side === 'above' ? close > level + buf : close < level - buf;
    if (!ok) break;
    n += 1;
  }
  return n;
}

/**
 * 돌파 후 안착·실패 판별.
 * - attempt: 방금 돌파(종가 이탈) · 아직 안착 아님 → 진입 금지
 * - settled: 다봉 유지 또는 재테스트 홀드 → 진입 허용
 * - failed: 돌파했다가 채널 안으로 종가 복귀 → 실패
 */
function assessBreakoutSettle(
  candles: Candle[],
  level: number,
  side: 'above' | 'below',
  buf: number,
  atr: number,
  volR: number
): { phase: 'none' | 'attempt' | 'settled' | 'failed'; barsOut: number; retestHold: boolean } {
  const n = candles.length;
  if (n < 4 || !(level > 0)) return { phase: 'none', barsOut: 0, retestHold: false };
  const look = Math.min(10, n - 1);
  const last = candles[n - 1]!;
  const close = Number(last.close);
  const low = Number(last.low);
  const high = Number(last.high);
  if (![close, low, high].every((x) => Number.isFinite(x) && x > 0)) {
    return { phase: 'none', barsOut: 0, retestHold: false };
  }

  const outside = (c: number) =>
    side === 'above' ? c > level + buf : c < level - buf;
  const insideHard = (c: number) =>
    side === 'above' ? c < level - buf * 0.35 : c > level + buf * 0.35;

  let hadOutside = false;
  let maxRun = 0;
  let run = 0;
  for (let k = 1; k <= look; k++) {
    const c = Number(candles[n - k]?.close);
    if (!Number.isFinite(c)) break;
    if (outside(c)) {
      hadOutside = true;
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }

  const barsOut = countBreakBars(candles, level, side, buf, 4);
  const retestPad = Math.max(buf * 1.2, atr * 0.15);

  /** 재테스트 홀드: 돌파 후 저/고가 레벨 터치 + 종가는 밖 */
  let retestHold = false;
  if (outside(close) && barsOut >= 1) {
    for (let k = 1; k <= Math.min(4, look); k++) {
      const bar = candles[n - k]!;
      const c = Number(bar.close);
      const lo = Number(bar.low);
      const hi = Number(bar.high);
      if (side === 'above') {
        if (outside(c) && lo <= level + retestPad && lo >= level - buf * 2) {
          retestHold = true;
          break;
        }
      } else if (outside(c) && hi >= level - retestPad && hi <= level + buf * 2) {
        retestHold = true;
        break;
      }
    }
  }

  /** 실패: 최근 look 안에 밖 종가 있었는데 지금 안으로 복귀 */
  if (hadOutside && insideHard(close) && !outside(close)) {
    /** 하방: 하단 레일 근처에 다시 앉으면 가짜돌파 실패가 아니라 안착 */
    if (side === 'below') {
      const nearRail = close <= level + Math.max(buf * 3.2, atr * 0.38);
      if (nearRail) {
        return { phase: 'settled', barsOut: Math.max(1, maxRun), retestHold: true };
      }
    }
    return { phase: 'failed', barsOut: 0, retestHold: false };
  }

  if (!outside(close)) {
    return { phase: 'none', barsOut: 0, retestHold: false };
  }

  /** 안착: 2봉+ 밖 유지, 또는 1봉+재테스트홀드, 또는 강한 거래량+몸통 */
  const body = Math.abs(close - Number(last.open));
  const range = Math.max(1e-9, high - low);
  const strongBody = body / range >= 0.45 && outside(close);
  const settled =
    barsOut >= 2 ||
    (barsOut >= 1 && retestHold) ||
    (barsOut >= 1 && volR >= 1.15 && strongBody && maxRun >= 1);

  if (settled) return { phase: 'settled', barsOut, retestHold };
  return { phase: 'attempt', barsOut, retestHold };
}

export function classifyMergedDeskChannelEdges(
  candles: Candle[],
  g: MergedDeskChannelGeom,
  atr: number,
  volR: number
): MergedDeskChannelEdgeRead | null {
  const last = candles[candles.length - 1];
  if (!last) return null;
  const close = Number(last.close);
  const open = Number(last.open);
  const high = Number(last.high);
  const low = Number(last.low);
  if (![close, open, high, low].every((x) => Number.isFinite(x) && x > 0)) return null;
  if (!(g.width > 0) || !(g.tipUpper > g.tipLower)) return null;

  const buf = Math.max(atr * 0.1, g.width * 0.035);
  const pad = Math.max(atr * 0.18, g.width * 0.07);
  const pos = tipPos(close, g);
  const bull = close > open;
  const bear = close < open;
  const body = Math.abs(close - open);
  const range = Math.max(1e-9, high - low);
  const bodyRatio = body / range;

  const upSettle = assessBreakoutSettle(candles, g.tipUpper, 'above', buf, atr, volR);
  const loSettle = assessBreakoutSettle(candles, g.tipLower, 'below', buf, atr, volR);

  let upper: MergedDeskChannelEdgeState = '중가';
  if (upSettle.phase === 'failed') upper = '돌파실패';
  else if (upSettle.phase === 'settled') upper = '안착확정';
  else if (upSettle.phase === 'attempt') upper = '돌파';
  else if (high >= g.tipUpper - pad * 0.4 && close <= g.tipUpper + buf) {
    if (bear && bodyRatio > 0.35 && high >= g.tipUpper - pad * 0.15) upper = '저항가능';
    else if (pos >= 0.7 || high >= g.tipUpper) upper = '돌파가능';
  } else if (pos >= 0.72) {
    upper = bear && bodyRatio > 0.4 ? '저항가능' : '돌파가능';
  }

  let lower: MergedDeskChannelEdgeState = '중가';
  if (loSettle.phase === 'failed') lower = '돌파실패';
  else if (loSettle.phase === 'settled') lower = '안착확정';
  else if (loSettle.phase === 'attempt') lower = '돌파';
  else if (low <= g.tipLower + pad * 0.4 && close >= g.tipLower - buf) {
    if (bull && bodyRatio > 0.35 && close > (high + low) / 2) lower = '지지가능';
    else if (bear && close <= g.tipLower + buf) lower = '돌파가능';
    else lower = '지지가능';
  } else if (pos <= 0.28) {
    lower = bull || close >= g.tipLower ? '지지가능' : '돌파가능';
  }

  let captionKo = '중가';
  if (upper === '안착확정') captionKo = '상안착확정';
  else if (lower === '안착확정') captionKo = '하안착확정';
  else if (upper === '돌파실패') captionKo = '상돌파실패';
  else if (lower === '돌파실패') captionKo = '하돌파실패';
  else if (upper === '돌파') captionKo = '상돌파·안착대기';
  else if (lower === '돌파') captionKo = '하돌파·안착대기';
  else if (lower === '지지가능') captionKo = '지지가능';
  else if (upper === '저항가능') captionKo = '저항가능';
  else if (upper === '돌파가능') captionKo = '상돌파가능';
  else if (lower === '돌파가능') captionKo = '하돌파가능';

  const confirmedBars = Math.max(
    upSettle.phase === 'settled' || upSettle.phase === 'attempt' ? upSettle.barsOut : 0,
    loSettle.phase === 'settled' || loSettle.phase === 'attempt' ? loSettle.barsOut : 0
  );

  return {
    geom: g,
    upper,
    lower,
    captionKo,
    pos,
    volRatio: volR,
    confirmedBars,
    upperSettle: upSettle.phase,
    lowerSettle: loSettle.phase,
  };
}

type EdgeCandidate = {
  direction: 'LONG' | 'SHORT';
  edge: 'lower' | 'upper';
  mode: 'bounce' | 'breakout';
  edgeStateKo: MergedDeskChannelEdgeState;
  geom: MergedDeskChannelGeom;
  near: boolean;
  reject: boolean;
  score: number;
  reasons: string[];
};

function scoreFromEdgeRead(
  candles: Candle[],
  read: MergedDeskChannelEdgeRead,
  atr: number
): EdgeCandidate[] {
  const g = read.geom;
  const last = candles[candles.length - 1]!;
  const close = Number(last.close);
  const open = Number(last.open);
  const high = Number(last.high);
  const low = Number(last.low);
  const pad = Math.max(atr * 0.15, g.width * 0.08);
  const qBoost = (g.quality - 50) * 0.25;
  const volBoost = read.volRatio >= 1.15 ? 10 : read.volRatio >= 0.95 ? 4 : -4;
  const out: EdgeCandidate[] = [];

  if (read.lower === '돌파실패') {
    out.push({
      direction: 'SHORT',
      edge: 'lower',
      mode: 'breakout',
      edgeStateKo: '돌파실패',
      geom: g,
      near: true,
      reject: false,
      score: 40 + qBoost,
      reasons: [`${g.horizonKo} 하돌파실패 · 종가 복귀`, '진입 금지'],
    });
  }
  if (read.upper === '돌파실패') {
    out.push({
      direction: 'LONG',
      edge: 'upper',
      mode: 'breakout',
      edgeStateKo: '돌파실패',
      geom: g,
      near: true,
      reject: false,
      score: 40 + qBoost,
      reasons: [`${g.horizonKo} 상돌파실패 · 종가 복귀`, '진입 금지'],
    });
  }

  if (read.lower === '안착확정') {
    out.push({
      direction: 'SHORT',
      edge: 'lower',
      mode: 'breakout',
      edgeStateKo: '안착확정',
      geom: g,
      near: true,
      reject: false,
      score:
        78 +
        qBoost +
        volBoost +
        read.confirmedBars * 8 +
        Math.round(qBoost * 0.2) +
        (g.descending ? 6 : 0),
      reasons: [
        `${g.horizonKo} 하안착확정(종가×${read.confirmedBars})`,
        read.lowerSettle === 'settled' ? '다봉/재테스트 홀드' : '안착',
        '진입 허용(조건부)',
      ],
    });
  }
  if (read.upper === '안착확정') {
    out.push({
      direction: 'LONG',
      edge: 'upper',
      mode: 'breakout',
      edgeStateKo: '안착확정',
      geom: g,
      near: true,
      reject: false,
      score:
        78 +
        qBoost +
        volBoost +
        read.confirmedBars * 8 +
        Math.round(qBoost * 0.2) +
        (!g.descending ? 6 : 0),
      reasons: [
        `${g.horizonKo} 상안착확정(종가×${read.confirmedBars})`,
        read.upperSettle === 'settled' ? '다봉/재테스트 홀드' : '안착',
        '진입 허용(조건부)',
      ],
    });
  }

  if (read.lower === '돌파') {
    out.push({
      direction: 'SHORT',
      edge: 'lower',
      mode: 'breakout',
      edgeStateKo: '돌파',
      geom: g,
      near: true,
      reject: false,
      score:
        48 +
        qBoost +
        volBoost +
        read.confirmedBars * 4 +
        Math.round(qBoost * 0.15),
      reasons: [
        `${g.horizonKo} 하돌파 · 안착 대기`,
        '안착확정 전 진입 금지',
      ],
    });
  }
  if (read.upper === '돌파') {
    out.push({
      direction: 'LONG',
      edge: 'upper',
      mode: 'breakout',
      edgeStateKo: '돌파',
      geom: g,
      near: true,
      reject: false,
      score:
        48 +
        qBoost +
        volBoost +
        read.confirmedBars * 4 +
        Math.round(qBoost * 0.15),
      reasons: [
        `${g.horizonKo} 상돌파 · 안착 대기`,
        '안착확정 전 진입 금지',
      ],
    });
  }

  if (read.lower === '지지가능') {
    const rejectLong =
      low <= g.tipLower + pad * 1.2 &&
      close > open &&
      close >= g.tipLower - atr * 0.05 &&
      close > (low + high) / 2;
    out.push({
      direction: 'LONG',
      edge: 'lower',
      mode: 'bounce',
      edgeStateKo: '지지가능',
      geom: g,
      near: true,
      reject: rejectLong,
      score:
        (rejectLong ? 52 : 32) * (g.descending ? 0.92 : 1.12) +
        qBoost +
        Math.round(qBoost * 0.15) +
        (1 - Math.min(1, Math.max(0, read.pos))) * 14,
      reasons: [
        `${g.horizonKo} 하단·지지가능`,
        rejectLong ? '거절봉' : '하단 근접',
        `터치품질 ${g.touchLow}`,
      ],
    });
  }

  if (read.upper === '저항가능') {
    const rejectShort =
      high >= g.tipUpper - pad * 1.2 &&
      close < open &&
      close <= g.tipUpper + atr * 0.05 &&
      close < (low + high) / 2;
    out.push({
      direction: 'SHORT',
      edge: 'upper',
      mode: 'bounce',
      edgeStateKo: '저항가능',
      geom: g,
      near: true,
      reject: rejectShort,
      score:
        (rejectShort ? 52 : 32) * (g.descending ? 1.12 : 0.92) +
        qBoost +
        Math.round(qBoost * 0.15) +
        Math.min(1, Math.max(0, read.pos)) * 14,
      reasons: [
        `${g.horizonKo} 상단·저항가능`,
        rejectShort ? '거절봉' : '상단 근접',
        `터치품질 ${g.touchHigh}`,
      ],
    });
  }

  if (read.upper === '돌파가능') {
    out.push({
      direction: 'LONG',
      edge: 'upper',
      mode: 'breakout',
      edgeStateKo: '돌파가능',
      geom: g,
      near: true,
      reject: false,
      score: 22 + Math.round(qBoost * 0.2) + qBoost * 0.5,
      reasons: [`${g.horizonKo} 상돌파가능`, '종가 확인 전 대기'],
    });
  }
  if (read.lower === '돌파가능') {
    out.push({
      direction: 'SHORT',
      edge: 'lower',
      mode: 'breakout',
      edgeStateKo: '돌파가능',
      geom: g,
      near: true,
      reject: false,
      score: 22 + Math.round(qBoost * 0.2) + qBoost * 0.5,
      reasons: [`${g.horizonKo} 하돌파가능`, '종가 확인 전 대기'],
    });
  }

  return out;
}

function pickPrimaryDecision(
  candidates: EdgeCandidate[],
  edgeReads: MergedDeskChannelEdgeRead[],
  master?: MergedDeskRbMasterStance | null
): MergedDeskChannelPrimaryDecision | null {
  if (!candidates.length) {
    const primaryRead =
      edgeReads.find((r) => r.geom.primary) ?? edgeReads[0] ?? null;
    if (!primaryRead) return null;
    const waitDir =
      master?.side === 'LONG' || master?.side === 'SHORT' ? master.side : 'NEUTRAL';
    return {
      stateKo: '중가',
      horizon: primaryRead.geom.horizon,
      horizonKo: primaryRead.geom.horizonKo,
      edge: primaryRead.pos <= 0.5 ? 'lower' : 'upper',
      direction: waitDir,
      mode: 'wait',
      captionKo: master?.captionKo || '◆관망·엣지대기',
      score: master ? Math.abs(master.margin) : 0,
      reasonsKo: master?.reasonsKo?.length ? master.reasonsKo : ['채널 중가 · 엣지 대기'],
    };
  }

  const best = candidates[0]!;
  const dirKo = best.direction === 'LONG' ? '매수' : '매도';
  let phase = '대기';
  if (best.edgeStateKo === '안착확정') phase = '안착참고';
  else if (best.edgeStateKo === '돌파실패') phase = '실패·금지';
  else if (best.edgeStateKo === '돌파') phase = '안착대기';
  else if (best.edgeStateKo === '돌파가능') phase = '돌파대기';
  else if (best.reject) phase = '반응대기';
  const masterTag =
    master?.side === best.direction ? master.actionKo : dirKo === '매수' ? '매수관점' : '매도관점';

  return {
    stateKo: best.edgeStateKo,
    horizon: best.geom.horizon,
    horizonKo: best.geom.horizonKo,
    edge: best.edge,
    direction: best.direction,
    mode: best.mode,
    captionKo: `◆${masterTag}·${phase}`,
    score: best.score,
    reasonsKo: best.reasons,
  };
}

function buildMasterStanceVisuals(
  stance: MergedDeskRbMasterStance,
  candles: Candle[],
  close: number,
  _atr: number
): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[] } {
  const n = candles.length;
  const tLast = Number(candles[n - 1]?.time) || 0;
  const tFrom = Number(candles[Math.max(0, n - 3)]?.time) || tLast;
  if (!(tLast > 0) || !(close > 0)) return { overlays: [], priceLines: [] };

  const isLong = stance.side === 'LONG';
  const isShort = stance.side === 'SHORT';
  const color = isLong ? '#22C55E' : isShort ? '#EF4444' : '#94A3B8';
  const bg = isLong ? 'rgba(20,83,45,0.95)' : isShort ? 'rgba(127,29,29,0.95)' : 'rgba(51,65,85,0.94)';

  const priceLines: AtlasPulsePriceLine[] = [
    {
      price: close,
      color,
      title: stance.captionKo,
      lineWidth: isLong || isShort ? 4 : 2,
      lineStyle: isLong || isShort ? 'solid' : 'dashed',
      axisLabel: false,
    },
  ];

  const overlays: OverlayItem[] = [
    rbLastBarSignalPin({
      id: 'merged-desk-rb-master-stance',
      label: stance.captionKo,
      price: close,
      tFrom,
      tLast,
      color,
      bg,
      tooltip: explainMergedDeskRbLabel(stance.captionKo, stance.summaryKo),
      extraClass: [
        'merged-desk-rb-master-stance',
        isLong ? 'merged-desk-rb-master--long' : isShort ? 'merged-desk-rb-master--short' : 'merged-desk-rb-master--wait',
      ].join(' '),
      faceBase: stance.actionKo,
      bias: isLong ? 'bullish' : isShort ? 'bearish' : undefined,
    }),
  ];

  return { overlays, priceLines };
}

function buildPlanFromEdge(
  edge: EdgeCandidate,
  longGeom: MergedDeskChannelGeom | null,
  atr: number,
  close: number,
  volR: number,
  snapCtx?: {
    candles: Candle[];
    geoms: MergedDeskChannelGeom[];
    confluence?: MergedDeskChannelConfluence | null;
    hotZones?: MergedDeskHotZoneEntry[] | null;
    analysis?: AnalyzeResponse | null;
  }
): MergedDeskChannelMoneyPlan | null {
  const g = edge.geom;
  const w = g.width;
  const buf = Math.max(atr * 0.25, w * 0.055);

  let entry = close;
  let stopLoss = 0;
  let tp1 = 0;
  let tp2 = 0;
  let tp3 = 0;

  if (edge.mode === 'breakout' && (edge.edgeStateKo === '돌파' || edge.edgeStateKo === '안착확정' || edge.edgeStateKo === '돌파실패')) {
    /** 측정이동 — 채널폭을 돌파 방향으로 투사 */
    const m = Math.max(w, atr * 1.2);
    if (edge.direction === 'LONG') {
      entry = Math.max(close, g.tipUpper);
      stopLoss = Math.min(g.tipUpper - buf, g.tipMid);
      if (!(stopLoss < entry)) stopLoss = entry - buf;
      tp1 = entry + m * 0.62;
      tp2 = entry + m * 1.0;
      tp3 =
        longGeom && longGeom.tipUpper > entry + m * 0.5
          ? Math.max(entry + m * 1.35, longGeom.tipUpper)
          : entry + m * 1.62;
    } else {
      entry = Math.min(close, g.tipLower);
      stopLoss = Math.max(g.tipLower + buf, g.tipMid);
      if (!(stopLoss > entry)) stopLoss = entry + buf;
      tp1 = entry - m * 0.62;
      tp2 = entry - m * 1.0;
      tp3 =
        longGeom && longGeom.tipLower < entry - m * 0.5
          ? Math.min(entry - m * 1.35, longGeom.tipLower)
          : entry - m * 1.62;
    }
  } else if (edge.mode === 'breakout' && edge.edgeStateKo === '돌파가능') {
    /** 대기 진입가 = 채널 상/하단 돌파 확인선 (종가가 이 선을 넘으면 진입 후보) */
    const m = Math.max(w, atr * 1.2);
    if (edge.direction === 'LONG') {
      entry = g.tipUpper;
      stopLoss = Math.min(g.tipUpper - Math.max(buf, w * 0.12), g.tipMid);
      if (!(stopLoss < entry - atr * 0.05)) stopLoss = entry - Math.max(buf, atr * 0.35);
      tp1 = entry + m * 0.62;
      tp2 = entry + m * 1.0;
      tp3 = entry + m * 1.62;
    } else {
      entry = g.tipLower;
      stopLoss = Math.max(g.tipLower + Math.max(buf, w * 0.12), g.tipMid);
      if (!(stopLoss > entry + atr * 0.05)) stopLoss = entry + Math.max(buf, atr * 0.35);
      tp1 = entry - m * 0.62;
      tp2 = entry - m * 1.0;
      tp3 = entry - m * 1.62;
    }
  } else if (edge.direction === 'LONG') {
    entry = Math.max(close, Math.min(g.tipLower + buf * 0.3, g.tipMid));
    if (edge.reject) entry = Math.max(close, g.tipLower);
    stopLoss = g.tipLower - buf;
    tp1 = g.tipMid;
    tp2 = g.tipUpper;
    tp3 = longGeom && longGeom.tipUpper > tp2 ? longGeom.tipUpper : tp2 + w * 0.5;
  } else {
    entry = Math.min(close, Math.max(g.tipUpper - buf * 0.3, g.tipMid));
    if (edge.reject) entry = Math.min(close, g.tipUpper);
    stopLoss = g.tipUpper + buf;
    tp1 = g.tipMid;
    tp2 = g.tipLower;
    tp3 = longGeom && longGeom.tipLower < tp2 ? longGeom.tipLower : tp2 - w * 0.5;
  }

  const geoOk =
    edge.direction === 'LONG'
      ? stopLoss < entry && tp1 > entry
      : stopLoss > entry && tp1 < entry;
  if (!geoOk) return null;

  const strengthened = strengthenUnifiedDeskTradePlan({
    direction: edge.direction,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    invalidationKo: `종가 ${fmt(stopLoss)} 이탈 시 채널 무효`,
    sourceKo: '채널머니',
    alignedWithChart: true,
    warningsKo: [...edge.reasons, `${edge.edgeStateKo} · 확정 수익 아님`].slice(0, 5),
  });

  /** 안착·돌파 계열 RR 완화 · 바운스는 기존 */
  const minRr =
    edge.edgeStateKo === '안착확정' || edge.edgeStateKo === '돌파' || edge.edgeStateKo === '돌파실패'
      ? 1.05
      : edge.edgeStateKo === '돌파가능'
        ? 1.0
        : 1.2;

  let outTp1 = strengthened.tp1;
  let outTp2 = strengthened.tp2;
  let outTp3 = strengthened.tp3;
  let tp1Ko = edge.mode === 'breakout' ? '채널폭측정' : `${g.horizonKo}중선`;
  let tp2Ko =
    edge.mode === 'breakout'
      ? '채널폭측정'
      : edge.direction === 'LONG'
        ? `${g.horizonKo}상단`
        : `${g.horizonKo}하단`;
  let tp3Ko = longGeom ? '장기레일' : '채널확장';
  let tpSnapSummaryKo = `${tp1Ko} · ${tp2Ko} · ${tp3Ko}`;

  if (snapCtx?.candles?.length) {
    const magnets = collectRbGateTargetMagnets({
      candles: snapCtx.candles,
      geoms: snapCtx.geoms?.length ? snapCtx.geoms : [g, ...(longGeom ? [longGeom] : [])],
      confluence: snapCtx.confluence,
      hotZones: snapCtx.hotZones,
      analysis: snapCtx.analysis,
    });
    const snapped = snapRbGateTargets({
      direction: edge.direction,
      entry: strengthened.entry,
      stopLoss: strengthened.stopLoss,
      tp1: outTp1,
      tp2: outTp2,
      tp3: outTp3,
      magnets,
      atr,
    });
    const rrSnap =
      calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, snapped.tp1) || 0;
    if (rrSnap >= minRr * 0.92) {
      outTp1 = snapped.tp1;
      outTp2 = snapped.tp2;
      outTp3 = snapped.tp3;
      tp1Ko = snapped.tp1Ko;
      tp2Ko = snapped.tp2Ko;
      tp3Ko = snapped.tp3Ko;
      tpSnapSummaryKo = snapped.summaryKo;
    }
  }

  const rr = calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, outTp1) || 0;
  if (rr < minRr) return null;

  const confluence =
    !!longGeom &&
    ((edge.direction === 'LONG' && !longGeom.descending) ||
      (edge.direction === 'SHORT' && longGeom.descending) ||
      (edge.direction === 'LONG' && tipPos(close, longGeom) <= 0.38) ||
      (edge.direction === 'SHORT' && tipPos(close, longGeom) >= 0.62));

  /**
   * 진입 규칙 (핵심):
   * - 안착확정 → ENTER (허용)
   * - 돌파(시도) → WAIT · 안착 대기 · 진입 금지
   * - 돌파가능 → WAIT · 돌파 전 · 진입 금지
   * - 돌파실패 → INVALID · 진입 금지
   * - 지지/저항 바운스 → TOUCH/ENTER (기존)
   */
  let status: MergedDeskChannelMoneyStatus = 'WAIT';
  if (edge.edgeStateKo === '돌파실패') {
    status = 'INVALID';
  } else if (edge.edgeStateKo === '안착확정' && rr >= 1.05) {
    status = 'ENTER';
  } else if (edge.edgeStateKo === '돌파' || edge.edgeStateKo === '돌파가능') {
    status = 'WAIT';
  } else if (edge.reject && rr >= 1.5 && (confluence || edge.score >= 50)) {
    status = 'ENTER';
  } else if (
    edge.near &&
    (edge.edgeStateKo === '지지가능' || edge.edgeStateKo === '저항가능')
  ) {
    status = rr >= 1.35 ? 'TOUCH' : 'WAIT';
  } else if (edge.near) {
    status = 'WAIT';
  } else {
    return null;
  }

  /** 안착이 아니면 돌파 계열 ENTER 절대 금지 */
  if (
    status === 'ENTER' &&
    edge.mode === 'breakout' &&
    edge.edgeStateKo !== '안착확정'
  ) {
    status = edge.edgeStateKo === '돌파실패' ? 'INVALID' : 'WAIT';
  }
  if (status === 'ENTER' && rr < 1.35 && edge.edgeStateKo !== '안착확정') status = 'TOUCH';

  const statusNote =
    edge.edgeStateKo === '안착확정'
      ? '안착확정→진입가능'
      : edge.edgeStateKo === '돌파'
        ? '돌파후안착대기→진입금지'
        : edge.edgeStateKo === '돌파가능'
          ? '돌파전대기→진입금지'
          : edge.edgeStateKo === '돌파실패'
            ? '돌파실패→진입금지'
            : statusKoOf(status);

  return {
    direction: strengthened.direction === 'NEUTRAL' ? edge.direction : strengthened.direction,
    entry: strengthened.entry,
    stopLoss: strengthened.stopLoss,
    tp1: outTp1,
    tp2: outTp2,
    tp3: outTp3,
    invalidationPrice: strengthened.stopLoss,
    invalidationKo:
      edge.edgeStateKo === '돌파실패'
        ? `돌파실패 · 종가 채널 복귀 · 진입 금지`
        : strengthened.invalidationKo,
    rr,
    status,
    statusKo: statusKoOf(status),
    entryAllowed: status === 'ENTER' && edge.edgeStateKo === '안착확정',
    reasonsKo: [
      ...edge.reasons,
      confluence ? '단기·장기 정렬' : '단기 단독(장기 확인)',
      statusNote,
      `RR≈${rr.toFixed(1)} · ${statusKoOf(status)}`,
      tpSnapSummaryKo,
    ],
    confluence,
    edge: edge.edge,
    mode: edge.mode,
    edgeStateKo: edge.edgeStateKo,
    horizonKo: g.horizonKo,
    sourceKo: '채널게이트',
    tp1Ko,
    tp2Ko,
    tp3Ko,
    tpSnapSummaryKo,
  };
}

/** 축선 최소화 — 핫 엣지 1~2본만 (중선 제거) */
function slimStructurePriceLines(
  primary: MergedDeskChannelPrimaryDecision,
  geoms: MergedDeskChannelGeom[]
): AtlasPulsePriceLine[] {
  const g =
    geoms.find((x) => x.horizon === primary.horizon) ??
    geoms.find((x) => x.primary) ??
    geoms[0];
  if (!g) return [];

  const hotUpper =
    primary.edge === 'upper' ||
    primary.stateKo === '돌파' ||
    primary.stateKo === '돌파가능' ||
    primary.stateKo === '안착확정' ||
    primary.stateKo === '돌파실패' ||
    primary.stateKo === '저항가능';
  const hotLower =
    primary.edge === 'lower' ||
    primary.stateKo === '돌파' ||
    primary.stateKo === '돌파가능' ||
    primary.stateKo === '안착확정' ||
    primary.stateKo === '돌파실패' ||
    primary.stateKo === '지지가능';

  const lines: AtlasPulsePriceLine[] = [];
  if (hotUpper || primary.stateKo === '중가') {
    const isSettled = primary.stateKo === '안착확정' && primary.edge === 'upper';
    const isFail = primary.stateKo === '돌파실패' && primary.edge === 'upper';
    lines.push({
      price: g.tipUpper,
      color: isFail
        ? 'rgba(148,163,184,0.75)'
        : isSettled
          ? 'rgba(74,222,128,0.95)'
          : g.useBearFill
            ? 'rgba(248,113,113,0.9)'
            : 'rgba(96,165,250,0.9)',
      title:
        primary.edge === 'upper' && primary.stateKo !== '중가'
          ? `채널상단·${primary.stateKo}`
          : '채널상단·저항',
      lineWidth: isSettled || primary.edge === 'upper' ? 2 : 1,
      lineStyle: isSettled ? 'solid' : isFail ? 'dotted' : 'dashed',
      axisLabel: false,
    });
  }
  if (hotLower) {
    const isSettled = primary.stateKo === '안착확정' && primary.edge === 'lower';
    const isFail = primary.stateKo === '돌파실패' && primary.edge === 'lower';
    lines.push({
      price: g.tipLower,
      color: isFail
        ? 'rgba(148,163,184,0.75)'
        : isSettled
          ? 'rgba(74,222,128,0.95)'
          : g.useBearFill
            ? 'rgba(185,28,28,0.9)'
            : 'rgba(37,99,235,0.9)',
      title:
        primary.edge === 'lower' && primary.stateKo !== '중가'
          ? `채널하단·${primary.stateKo}`
          : '채널하단·지지',
      lineWidth: isSettled || primary.edge === 'lower' ? 2 : 1,
      lineStyle: isSettled ? 'solid' : isFail ? 'dotted' : 'dashed',
      axisLabel: false,
    });
  }
  return lines;
}

/**
 * 채널게이트 매매 세트 — E/SL/TP/무효 전폭선 + 마지막봉 핀.
 * 면 네모(게이트스팟·목표존)는 쓰지 않음. 파랑빨강띠는 유지.
 */
function buildChannelTradeSetVisuals(
  plan: MergedDeskChannelMoneyPlan,
  candles: Candle[],
  _atr: number
): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[] } {
  if (!(plan.entry > 0) || !(plan.stopLoss > 0) || !(plan.tp1 > 0)) {
    return { overlays: [], priceLines: [] };
  }
  const n = candles.length;
  const tLast = Number(candles[n - 1]?.time) || 0;
  const tFrom = Number(candles[Math.max(0, n - 3)]?.time) || tLast;
  if (!(tLast > 0)) return { overlays: [], priceLines: [] };

  const isLong = plan.direction === 'LONG';
  const viewKo = isLong ? '매수관점' : '매도관점';
  const go = plan.status === 'ENTER' && plan.entryAllowed;
  const stance = plan.statusKo;
  const waitingBreak =
    plan.edgeStateKo === '돌파가능' ||
    plan.edgeStateKo === '돌파' ||
    (plan.status === 'WAIT' && plan.mode === 'breakout');
  const settled = plan.edgeStateKo === '안착확정';
  const failed = plan.edgeStateKo === '돌파실패';

  /** 레일LED 스타일 — 한글 실선 (점선 남발 금지) */
  const entryKo = isLong ? '롱진입' : '숏진입';
  const entryTitle = failed
    ? `${entryKo}·실패금지 ${fmt(plan.entry)}`
    : settled
      ? `${entryKo}·안착참고 ${fmt(plan.entry)}`
      : plan.edgeStateKo === '돌파'
        ? `${entryKo}·안착대기 ${fmt(plan.entry)}`
        : plan.edgeStateKo === '돌파가능'
          ? `${entryKo}·돌파전대기 ${fmt(plan.entry)}`
          : `${entryKo} ${fmt(plan.entry)}·${stance}`;

  const priceLines: AtlasPulsePriceLine[] = [
    {
      price: plan.entry,
      color: failed
        ? 'rgba(148,163,184,0.7)'
        : settled
          ? isLong
            ? '#4ADE80'
            : '#FB7185'
          : waitingBreak
            ? '#FDE047'
            : go
              ? '#FACC15'
              : '#CA8A04',
      title: entryTitle,
      lineWidth: settled || waitingBreak ? 3 : 2,
      lineStyle: 'solid',
      axisLabel: true,
    },
    {
      price: plan.stopLoss,
      color: '#F87171',
      title: `손절 ${fmt(plan.stopLoss)}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    },
  ];
  const tp1Color = isLong ? '#FBBF24' : '#F472B6';
  const tp2Color = isLong ? '#FB923C' : '#E879F9';
  const tp3Color = isLong ? '#2DD4BF' : '#FB7185';
  if (plan.tp1 > 0) {
    priceLines.push({
      price: plan.tp1,
      color: tp1Color,
      title: `목표1 ${fmt(plan.tp1)}${plan.tp1Ko ? `·${plan.tp1Ko}` : ''}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (plan.tp2 > 0) {
    priceLines.push({
      price: plan.tp2,
      color: tp2Color,
      title: `목표2 ${fmt(plan.tp2)}${plan.tp2Ko ? `·${plan.tp2Ko}` : ''}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (plan.tp3 > 0) {
    priceLines.push({
      price: plan.tp3,
      color: tp3Color,
      title: `목표3 ${fmt(plan.tp3)}${plan.tp3Ko ? `·${plan.tp3Ko}` : ''}`,
      lineWidth: 1,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  priceLines.push({
    price: plan.invalidationPrice > 0 ? plan.invalidationPrice : plan.stopLoss,
    color: 'rgba(250,204,21,0.9)',
    title: `무효화 ${fmt(plan.invalidationPrice > 0 ? plan.invalidationPrice : plan.stopLoss)}`,
    lineWidth: 2,
    lineStyle: 'solid',
    axisLabel: true,
  });

  const overlays: OverlayItem[] = [];
  const gatePinLabel = failed
    ? `◆${viewKo}·실패금지`
    : settled
      ? `◆${viewKo}·안착참고`
      : plan.edgeStateKo === '돌파'
        ? `◆${viewKo}·안착대기`
        : plan.edgeStateKo === '돌파가능'
          ? `◆${viewKo}·돌파전대기`
          : `◆${viewKo}`;
  const gatePinBg = failed
    ? 'rgba(71,85,105,0.94)'
    : settled
      ? isLong
        ? 'rgba(22,101,52,0.95)'
        : 'rgba(159,18,57,0.95)'
      : isLong
        ? 'rgba(253,224,71,0.96)'
        : 'rgba(244,63,94,0.94)';
  const gatePinColor = failed
    ? '#94A3B8'
    : settled
      ? isLong
        ? '#4ADE80'
        : '#FB7185'
      : isLong
        ? '#FDE047'
        : '#FB7185';

  overlays.push(
    rbLastBarSignalPin({
      id: 'merged-desk-rb-entry-pin',
      label: gatePinLabel,
      price: plan.entry,
      tFrom,
      tLast,
      color: gatePinColor,
      bg: gatePinBg,
      tooltip: explainMergedDeskRbLabel(
        gatePinLabel,
        [
          isLong ? '지금 관점 = 매수쪽 (숏 게이트 숨김)' : '지금 관점 = 매도쪽 (롱 게이트 숨김)',
          failed
            ? '돌파실패 · 진입 금지'
            : settled
              ? '안착참고(조건부) · 확정 아님'
              : plan.edgeStateKo === '돌파'
                ? '안착 전 진입 금지'
                : '돌파 전 대기',
          `E ${fmt(plan.entry)} · SL ${fmt(plan.stopLoss)} · TP1 ${fmt(plan.tp1)}`,
          `${plan.horizonKo} · 전폭 가격선이 목표`,
        ].join(' · ')
      ),
      extraClass: [
        'merged-desk-rb-entry-pin',
        'merged-desk-rb-gate-rail',
        isLong ? 'merged-desk-rb-gate--long' : 'merged-desk-rb-gate--short',
        settled ? 'merged-desk-rb-gate--settled' : '',
        failed ? 'merged-desk-rb-gate--failed' : '',
      ]
        .filter(Boolean)
        .join(' '),
      faceBase: `◆${viewKo}`,
      faceSignal: failed ? '금지' : settled ? '안착참고' : waitingBreak ? '대기' : stance,
      bias: isLong ? 'bullish' : 'bearish',
    })
  );

  if (plan.tp1 > 0) {
    overlays.push(
      rbLastBarSignalPin({
        id: 'merged-desk-rb-tp-zone',
        label: isLong ? '◆매수목표' : '◆매도목표',
        price: plan.tp1,
        tFrom,
        tLast,
        color: tp1Color,
        bg: isLong ? 'rgba(20,83,45,0.92)' : 'rgba(127,29,29,0.92)',
        tooltip: explainMergedDeskRbLabel(
          isLong ? '◆매수목표' : '◆매도목표',
          [
            isLong ? '매수관점 TP 가격선 · 파란빨강띠 세트' : '매도관점 TP 가격선 · 파란빨강띠 세트',
            `TP1 ${plan.tp1Ko || '참고'} ${fmt(plan.tp1)} · TP2 ${plan.tp2Ko || '참고'} ${fmt(plan.tp2)} · TP3 ${plan.tp3Ko || '참고'} ${fmt(plan.tp3)}`,
            plan.tpSnapSummaryKo || `${plan.horizonKo} · 띠·합류 스냅 · 참고`,
            `RR≈${plan.rr.toFixed(1)} · 도달·수익 보장 아님`,
          ].join(' · ')
        ),
        extraClass: 'merged-desk-rb-tp-zone merged-desk-rb-gate-tp',
        faceBase: isLong ? '매수목표' : '매도목표',
        faceSignal: plan.tp1Ko || 'TP1',
        bias: isLong ? 'bullish' : 'bearish',
      })
    );
  }

  return { overlays, priceLines };
}

export function buildMergedDeskChannelMoneyEdgePack(
  candles: Candle[],
  timeframe: string,
  opts?: MergedDeskChannelMoneyEdgeOpts
): MergedDeskChannelMoneyEdgePack {
  const rawPack = buildMergedDeskBlueRedChannels(candles, timeframe, {
    hideSecondaryLabel: false,
  });
  const lockKey = `${opts?.waveLockKey || opts?.stanceKey || timeframe}:door-v5`;
  let { pack, wave: waveLock } = applyMergedDeskRbWaveLock({
    pack: rawPack,
    candles,
    lockKey,
  });

  const primaryForHorizon =
    pack.geoms.find((g) => g.primary) ??
    pack.geoms.find((g) => g.horizon === 'short') ??
    pack.geoms[0] ??
    null;
  const waveHorizon = buildMergedDeskRbWaveHorizonForecast({
    candles,
    fibLegs: opts?.fibLegs,
    channelTipUpper: primaryForHorizon?.tipUpper,
    channelTipLower: primaryForHorizon?.tipLower,
  });
  if (waveHorizon.tDoor > 0 || waveHorizon.tLive > 0) {
    const applied = applyRbHorizonForecastToGeomsAndOverlays({
      geoms: pack.geoms as never,
      overlays: pack.overlays,
      forecast: waveHorizon,
      preferHorizon: waveLock.horizon,
      candles,
    });
    pack = {
      ...pack,
      geoms: applied.geoms as typeof pack.geoms,
      overlays: applied.overlays,
      summaryKo: `${pack.summaryKo} · ${waveHorizon.shortKo}`,
    };
    if (waveLock.lockedGeom) {
      const g = applied.geoms.find((x) => x.primary) ?? applied.geoms[0];
      if (g) {
        waveLock = {
          ...waveLock,
          lockedGeom: {
            ...waveLock.lockedGeom,
            /** tip은 채널 레일 유지 — 전망으로 부풀리지 않음 */
            tipUpper: Number(g.tipUpper),
            tipLower: Number(g.tipLower),
            tipMid: Number(g.tipMid),
            width: Number(g.width),
            tEnd: Number(g.tEnd),
            up2: Number(g.up2),
            lo2: Number(g.lo2),
          },
          summaryKo: `${waveLock.summaryKo} · ${waveHorizon.shortKo}`,
        };
      }
    }
  }

  const horizonTipZones = buildRbHorizonTipZones({
    forecast: waveHorizon,
    tStart: primaryForHorizon?.tStart ?? 0,
    channelTipUpper: primaryForHorizon?.tipUpper,
    channelTipLower: primaryForHorizon?.tipLower,
  });

  const geoms0 = pack.geoms;
  if (!geoms0.length || candles.length < 12) {
    return {
      overlays: [...pack.overlays, ...horizonTipZones],
      plan: null,
      priceLines: [...waveLock.priceLines, ...waveHorizon.priceLines],
      markers: [],
      settlePaint: new Map(),
      core: null,
      summaryKo: pack.summaryKo || '채널머니 — 봉/피벗 부족',
      geoms: [],
      edgeReads: [],
      primary: null,
      waveLock,
      edgeGate: null,
      waveHorizon,
      coreSrCluster: null,
      wavePath: null,
    };
  }

  let aiFaceOn = true;
  try {
    aiFaceOn = loadSettings().chartMergedDeskRbAiZoneFaceEnabled !== false;
  } catch {
    /* ignore */
  }

  const close = Number(candles[candles.length - 1]?.close) || 0;
  const atr = atrApprox(candles);
  const volR = volRatio(candles);
  const longG = geoms0.find((g) => g.horizon === 'long') ?? null;
  const conf = pack.confluence;
  const inConfluence =
    !!conf &&
    close >= conf.tipLower &&
    close <= conf.tipUpper;

  const edgeReads = geoms0
    .map((g) => classifyMergedDeskChannelEdges(candles, g, atr, volR))
    .filter((r): r is MergedDeskChannelEdgeRead => !!r);

  const candidates: EdgeCandidate[] = [];
  for (const read of edgeReads) {
    candidates.push(...scoreFromEdgeRead(candles, read, atr));
  }
  /** 중착 복도 안이면 가점 · 정렬이면 추가 */
  if (inConfluence && conf) {
    for (const c of candidates) {
      c.score += 10 + (conf.aligned ? 8 : 0) + conf.overlapPct * 12;
      c.reasons = [...c.reasons, conf.aligned ? '중착복도·정렬' : '중착복도'].slice(0, 5);
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  /** 단기·장기 동방이면 둘 다 소폭 가점(단기에만 몰빵하지 않음) */
  const shortCand = candidates.filter((c) => c.geom.horizon === 'short');
  const longCand = candidates.filter((c) => c.geom.horizon === 'long');
  if (shortCand[0] && longCand[0] && shortCand[0].direction === longCand[0].direction) {
    for (const base of [shortCand[0], longCand[0]]) {
      const idx = candidates.indexOf(base);
      if (idx < 0) continue;
      candidates[idx] = {
        ...candidates[idx]!,
        score: candidates[idx]!.score + 7,
        reasons: [...candidates[idx]!.reasons, '단기·장기 동방'].slice(0, 5),
      };
    }
    candidates.sort((a, b) => b.score - a.score);
  }

  const aiExtra = {
    zoneBattle: opts?.zoneBattle,
    zoneBattles: opts?.zoneBattles,
    mtfAggregate: opts?.mtfAggregate,
    mirageIntel: opts?.mirageIntel,
    mirageIntelList: opts?.mirageIntelList,
    hotZones: opts?.hotZones,
  };
  /** Zone 패널 합류 — 1차 후보 기준 tip으로 AI면·가점 (숫자 라벨 없이 면만) */
  let aiFace = aiFaceOn
    ? buildMergedDeskRbAiZoneFacePack({
        candles,
        timeframe,
        geoms: geoms0,
        edgeReads,
        primary: null,
        volRatio: volR,
        ...aiExtra,
      })
    : null;
  if (aiFace && candidates.length && (aiFace.scoreBoost !== 0 || aiFace.scoreReasonsKo.length)) {
    const top = candidates[0]!;
    const aligned = candidates.filter((c) => c.direction === top.direction);
    for (const c of aligned) {
      const idx = candidates.indexOf(c);
      if (idx < 0) continue;
      candidates[idx] = {
        ...candidates[idx]!,
        score: candidates[idx]!.score + aiFace.scoreBoost,
        reasons: [...candidates[idx]!.reasons, ...aiFace.scoreReasonsKo].slice(0, 6),
      };
    }
    candidates.sort((a, b) => b.score - a.score);
  }

  const volSync =
    opts?.volSync ??
    computeMergedDeskRbVolumeSync({
      candles,
      timeframe,
      geoms: geoms0,
    });
  const lastBarTime = Number(candles[candles.length - 1]?.time) || 0;
  let tradeStyle = opts?.tradeStyle ?? null;
  if (!tradeStyle) {
    try {
      tradeStyle = normalizeMergedDeskRbTradeStyle(loadSettings().chartMergedDeskRbTradeStyle);
    } catch {
      tradeStyle = 'swing';
    }
  }
  const styleW = mergedDeskRbStyleWeights(tradeStyle);
  const vrvpPoc = opts?.vrvpPoc ?? null;
  const vrvpVaLow = opts?.vrvpVaLow ?? null;
  const vrvpVaHigh = opts?.vrvpVaHigh ?? null;

  const stanceRaw = computeMergedDeskRbMasterStance({
    candles,
    geoms: geoms0,
    volSync,
    analysis: opts?.analysis,
    cycle: opts?.cycle,
    pattern: opts?.pattern,
    hotZones: opts?.hotZones,
    moneyHud: opts?.moneyHud,
    rocketDir: opts?.rocketDir,
    aiFaceSummaryKo: aiFace?.summaryKo,
    vrvpPoc,
    vrvpVaLow,
    vrvpVaHigh,
    tradeStyle,
  });
  const stance = applyRbMasterStanceHysteresis(
    opts?.stanceKey || `${timeframe}`,
    stanceRaw,
    lastBarTime
  );

  const locked = lockEdgeCandidatesToMaster(candidates, stance);
  locked.sort((a, b) => b.score - a.score);

  const primary = pickPrimaryDecision(locked, edgeReads, stance);
  const best = locked[0] ?? null;
  const plan =
    best &&
    primary &&
    primary.direction !== 'NEUTRAL' &&
    stance.side !== 'WAIT' &&
    best.direction === stance.side
      ? buildPlanFromEdge(best, longG, atr, close, volR, {
          candles,
          geoms: geoms0,
          confluence: conf,
          hotZones: opts?.hotZones,
          analysis: opts?.analysis,
        })
      : null;

  /** 이긴 구조(단기|장기)를 면 강조로 승격 — 스타일(단타/스윙/중투) 선호 호라이즌 반영 */
  let decisionHorizon: MergedDeskChannelHorizon =
    primary?.horizon ?? best?.geom.horizon ?? styleW.preferredHorizon;
  const availH = geoms0.map((g) => g.horizon);
  const preferG = geoms0.find((g) => g.horizon === styleW.preferredHorizon) ?? null;
  const preferSide =
    preferG == null
      ? null
      : Math.abs(preferG.slopePct) < 0.0032
        ? ('WAIT' as const)
        : preferG.descending
          ? ('SHORT' as const)
          : ('LONG' as const);
  decisionHorizon = preferMergedDeskRbHorizonForStyle({
    style: styleW.style,
    decisionHorizon,
    available: availH,
    preferredGeomSide: preferSide,
    masterSide: stance.side,
  });
  const promoted = promoteMergedDeskChannelPrimary(pack, decisionHorizon);
  const geoms = promoted.geoms;

  /** primary 확정 후 AI면 재계산(상태·면 정렬) */
  if (aiFaceOn) {
    aiFace = buildMergedDeskRbAiZoneFacePack({
      candles,
      timeframe,
      geoms,
      edgeReads,
      primary,
      volRatio: volR,
      ...aiExtra,
    });
  }

  /** 일봉↑·주봉↓ 같은 상위역방향 — 진입 보류, 면만 보여 대기 */
  let planOut = plan;
  if (planOut && (aiFace?.states.includes('mtfConflict') || stance.side === 'WAIT')) {
    planOut = {
      ...planOut,
      status: 'WAIT',
      statusKo: stance.side === 'WAIT' ? '관망' : '상위역방향대기',
      entryAllowed: false,
      reasonsKo: [
        ...planOut.reasonsKo,
        stance.side === 'WAIT' ? stance.captionKo : '상위TF역방향·되돌림·대기',
      ].slice(0, 8),
    };
  }
  if (planOut && stance.side !== 'WAIT' && planOut.direction !== stance.side) {
    planOut = null;
  }
  const newsGate = evalMergedDeskNewsEntryGate(opts?.newsHint);
  if (planOut && newsGate?.blockEnter) {
    planOut = {
      ...planOut,
      status: 'WAIT',
      statusKo: '뉴스창대기',
      entryAllowed: false,
      reasonsKo: [...planOut.reasonsKo, newsGate.reasonKo].slice(0, 8),
    };
  }

  const primaryGeom =
    geoms.find((g) => g.primary) ??
    geoms.find((g) => g.horizon === decisionHorizon) ??
    geoms[0] ??
    null;
  const edgeGate = computeMergedDeskRbEdgeConfluenceGate({
    candles,
    geom: primaryGeom,
    volSync,
    avwapHigh: opts?.avwapHigh,
    avwapLow: opts?.avwapLow,
    fibLegs: opts?.fibLegs,
    vrvpPoc,
    vrvpVaLow,
    vrvpVaHigh,
    hotZones: opts?.hotZones,
    moneyHud: opts?.moneyHud,
    analysis: opts?.analysis,
    wavePhase: waveLock.phase,
    masterSide: stance.side,
  });
  const futurePath = buildMergedDeskRbFuturePathPack({
    candles,
    forecast: waveHorizon,
    edgeGate,
    geom: primaryGeom,
    masterSide: stance.side,
  });
  /** 도식 칩 합류 — 파동경로보다 먼저 (반등/저항/폭락 주입) */
  const chipConfluence = computeMergedDeskRbChipConfluence({
    candles,
    geoms,
    cycle: opts?.cycle,
  });
  const wavePathEnabled = opts?.wavePathEnabled !== false;
  const topPin = chipConfluence.topPin;
  const fullConf = computeMergedDeskRbFullConfluence({
    candles,
    geoms,
    volSync,
    analysis: opts?.analysis,
    cycle: opts?.cycle,
    pattern: opts?.pattern,
    hotZones: opts?.hotZones,
    moneyHud: opts?.moneyHud,
    rocketDir: opts?.rocketDir,
    moneyPlan: planOut,
    aiFaceSummaryKo: aiFace?.summaryKo,
    masterSide: stance.side,
    avwapHigh: opts?.avwapHigh,
    avwapLow: opts?.avwapLow,
    fibLegs: opts?.fibLegs,
    vrvpPoc,
    vrvpVaLow,
    vrvpVaHigh,
    wavePhase: waveLock.phase,
    edgeGate,
  });
  planOut = applyRbFullConfluenceToMoneyPlan(planOut, fullConf);

  let coreSrCluster: MergedDeskRbCoreSrClusterPack | null = null;
  try {
    coreSrCluster = buildMergedDeskRbCoreSrCluster({
      candles,
      geoms,
      analysis: opts?.analysis,
      hotZones: opts?.hotZones,
      vrvpPoc,
      vrvpVaLow,
      vrvpVaHigh,
      coreSr: opts?.coreSr,
      dumpZones: opts?.dumpZones,
      keyZones: opts?.keyZones,
      criticalZones: opts?.criticalZones,
    });
  } catch {
    coreSrCluster = null;
  }
  planOut = snapChannelPlanToRbCoreSr(planOut, coreSrCluster, {
    atr,
    placeRefOk: !!edgeGate.placeRefOk && stance.side !== 'WAIT',
  });

  const primaryForWave =
    geoms.find((g) => g.primary) ?? preferG ?? geoms[0] ?? null;
  const wavePath = wavePathEnabled
    ? buildMergedDeskWavePathPack({
        candles,
        enabled: true,
        timeframe,
        descending: primaryForWave?.descending ?? null,
        tStart: primaryForWave?.tStart ?? null,
        tEnd: primaryForWave?.tEnd ?? null,
        tipUpper: primaryForWave?.tipUpper ?? null,
        tipLower: primaryForWave?.tipLower ?? null,
        elliottRead: waveHorizon.elliott ?? opts?.cycle?.elliott ?? null,
        elliottBiasHint:
          waveHorizon.elliott?.bias === 'bullish' || waveHorizon.elliott?.bias === 'bearish'
            ? waveHorizon.elliott.bias
            : stance.side === 'LONG'
              ? 'bullish'
              : stance.side === 'SHORT'
                ? 'bearish'
                : null,
        chipConsensus: chipConfluence.consensus,
        bouncePx: chipConfluence.bouncePx ?? topPin?.bounceTo ?? null,
        resistPx: chipConfluence.resistPx ?? null,
        dumpPx: topPin?.dumpTo ?? null,
        schoolSummaryKo: chipConfluence.summaryKo || null,
        wyckoffRead: opts?.cycle?.wyckoff ?? null,
        fibLegs: opts?.fibLegs ?? null,
        analysis: opts?.analysis ?? null,
        hotZones: opts?.hotZones ?? null,
        stanceSide: stance.side,
        planLevels: planOut
          ? {
              entry: planOut.entry,
              stopLoss: planOut.stopLoss,
              tp1: planOut.tp1,
              tp2: planOut.tp2,
              tp3: planOut.tp3,
              invalidationPrice: planOut.invalidationPrice,
            }
          : null,
        vrvpPoc,
        vrvpVaLow,
        vrvpVaHigh,
        coreSupport: coreSrCluster?.support?.price ?? null,
        coreResist: coreSrCluster?.resist?.price ?? null,
        targetHi: planOut?.tp2 || planOut?.tp1 || null,
        targetLo: planOut?.stopLoss || null,
      })
    : null;

  const tradeSet =
    !opts?.omitTradeRails && planOut && stance.side !== 'WAIT'
      ? buildChannelTradeSetVisuals(planOut, candles, atr)
      : null;
  const masterVis = buildMasterStanceVisuals(stance, candles, close, atr);

  /** 핵심 돌파/안착 zone · 캔들색 · 이모티콘 — 채널 게이트와 한 세트 */
  const core = buildMergedDeskRbCoreBreakSetFromMoney({
    candles,
    timeframe,
    geoms,
    edgeReads,
    plan: planOut,
    primary,
  });

  /** 마스터 관점 캡션 = 결정 호라이즌만. 반대쪽 게이트 문구 금지 */
  const captionByHorizon: Partial<Record<MergedDeskChannelHorizon, string>> = {};
  captionByHorizon[decisionHorizon] = stance.captionKo;
  if (planOut && primary && stance.side !== 'WAIT') {
    const viewKo = planOut.direction === 'LONG' ? '매수관점' : '매도관점';
    captionByHorizon[decisionHorizon] =
      planOut.status === 'WAIT' && aiFace?.states.includes('mtfConflict')
        ? `◆${viewKo}·상위역방향대기`
        : planOut.edgeStateKo === '안착확정'
          ? `◆${viewKo}·안착참고`
          : planOut.edgeStateKo === '돌파실패'
            ? `◆${viewKo}·실패금지`
            : planOut.edgeStateKo === '돌파'
              ? `◆${viewKo}·안착대기`
              : planOut.edgeStateKo === '돌파가능'
                ? `◆${viewKo}·돌파전대기`
                : `◆${viewKo}·${planOut.statusKo}`;
  }

  const stamped = stampMergedDeskBlueRedMoneyCaptions(promoted, captionByHorizon, {
    keepStructureOnOthers: true,
  });

  const structLines = primary ? slimStructurePriceLines(primary, geoms) : [];
  /** 매매세트 선이 있으면 구조선은 핫 엣지 1본만(중복 축 라벨 감소) */
  const slimStruct =
    tradeSet && tradeSet.priceLines.length
      ? structLines.filter((l) => /돌파|지지|저항/.test(String(l.title || '')))
      : structLines;

  const phaseVis = buildMergedDeskRbCorridorPhaseVisuals({
    candles,
    geoms,
    edgeReads,
    volSync,
  });
  const corridorPaint = computeMergedDeskRbCorridorPaint({
    candles,
    geoms,
    volSync,
    stanceSide: stance.side,
    edgeReads,
    primaryDir: primary?.direction,
    primaryMode: primary?.mode,
    primaryEdge: primary?.edge,
    aiStates: aiFace?.states,
    hotZones: opts?.hotZones,
    rocketDir: opts?.rocketDir,
    schoolLongN: chipConfluence.longN,
    schoolShortN: chipConfluence.shortN,
    schoolWaitN: chipConfluence.waitN,
    vrvpPoc,
    vrvpVaLow,
    vrvpVaHigh,
    tradeStyle,
  });
  const aiSum = aiFace?.summaryKo ? ` · ${aiFace.summaryKo}` : '';
  const phaseSum = phaseVis.summaryKo ? ` · ${phaseVis.summaryKo}` : '';

  const stampedGate = stampRbOverlaysWithEdgeGate(stamped.overlays, edgeGate);
  const waveStructure = buildMergedDeskRbWaveStructureDraw({
    candles,
    wave: waveLock,
    edgeRead: primary
      ? edgeReads.find((r) => r.geom.horizon === primary.horizon) ?? edgeReads[0] ?? null
      : edgeReads[0] ?? null,
    ghostKey: lockKey,
  });
  if (waveHorizon.shortKo) {
    waveStructure.bandCaptionKo = `${waveStructure.bandCaptionKo} · ${futurePath.shortKo}`;
  }
  const stampedStruct = stampRbOverlaysWithWaveAutoLabels(stampedGate, waveStructure);

  const summaryKo = `${stance.summaryKo}${
    planOut
      ? ` · E${fmt(planOut.entry)} SL${fmt(planOut.stopLoss)} TP1${fmt(planOut.tp1)}${
          planOut.tp1Ko ? `(${planOut.tp1Ko})` : ''
        } · ${planOut.statusKo}`
      : ''
  }${inConfluence ? ' · 중착' : ''}${core.summaryKo ? ` · ${core.summaryKo}` : ''}${aiSum}${phaseSum}${
    corridorPaint.summaryKo ? ` · ${corridorPaint.summaryKo}` : ''
  } · ${waveStructure.summaryKo} · ${futurePath.summaryKo}${
    wavePath?.ok ? ` · ${wavePath.shortKo}` : ''
  } · ${waveHorizon.summaryKo} · ${edgeGate.summaryKo}${
    coreSrCluster?.summaryKo ? ` · ${coreSrCluster.summaryKo}` : ''
  } · 레일LED·안개·구조문`;

  const railLed = applyRbRailLedFogPack({
    overlays: [
      ...stampedStruct,
      ...waveStructure.overlays,
      ...horizonTipZones,
      ...(wavePath?.ok
        ? futurePath.overlays.filter((o) => {
            const id = String(o.id || '');
            return (
              !id.includes('future-main-path') &&
              !id.includes('future-alt-path') &&
              !String(o.overlayZoneExtraClass || '').includes('merged-desk-rb-future-path')
            );
          })
        : futurePath.overlays),
      ...(wavePath?.overlays ?? []),
      ...(aiFace?.overlays ?? []),
      ...masterVis.overlays,
      ...(tradeSet?.overlays ?? []),
      ...core.overlays,
      ...phaseVis.overlays,
      ...(coreSrCluster?.overlays ?? []),
    ],
    priceLines: [
      ...waveStructure.priceLines,
      ...waveHorizon.priceLines,
      ...futurePath.priceLines,
      ...(wavePath?.priceLines ?? []),
      ...masterVis.priceLines,
      ...(tradeSet?.priceLines ?? []),
      ...slimStruct,
      ...core.priceLines,
      ...phaseVis.priceLines,
      ...edgeGate.priceLines,
      ...(coreSrCluster?.priceLines ?? []),
    ],
    plan: planOut,
    candles,
  });

  return {
    overlays: railLed.overlays,
    plan: planOut,
    priceLines: railLed.priceLines,
    markers: [...core.markers, ...edgeGate.markers],
    settlePaint: core.settlePaint,
    core,
    summaryKo,
    geoms,
    edgeReads,
    primary,
    aiFaceSummaryKo: aiFace?.summaryKo || '',
    stance,
    corridorPaint,
    chipConfluence,
    waveLock,
    edgeGate,
    waveStructure,
    waveHorizon,
    futurePath,
    wavePath,
    coreSrCluster,
  };
}
