/**
 * AI 200x 타점 zone — 폭락구간형 라이프사이클·근거·앵커.
 * 감시 → ARMED → 타점확정. 확정 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';
import { macd, rsi } from '@/lib/indicators';
import { mergedLeadingMomentumGate } from '@/lib/mergedAnalysisLeadingBar';
import type { Scalp200BandTouchEvidence } from '@/lib/mergedDeskScalp200BandTouchBridge';
import { buildVolumeTfBarMetrics } from '@/lib/mergedDeskVolumeTfMetrics';
import { findLastPriceTouchBar, touchHugTimes } from '@/lib/mergedDeskStructureReactionBundle';

export type Scalp200EngineState = 'WAIT' | 'ARMED' | 'FIRE' | 'MISSED' | 'INVALID';

export type Scalp200ZoneLifeState =
  | 'WATCH'
  | 'ARMED'
  | 'CONFIRM_ENTRY'
  | 'MISSED'
  | 'INVALID';

export const SCALP200_ZONE_LIFE_KO: Record<Scalp200ZoneLifeState, string> = {
  WATCH: '감시',
  ARMED: 'ARMED',
  CONFIRM_ENTRY: '타점확정',
  MISSED: '놓침',
  INVALID: '무효',
};

export type Scalp200AiZoneLife = {
  lifeState: Scalp200ZoneLifeState;
  lifeKo: string;
  aiScore: number;
  evidenceKo: string[];
  reasonsKo: string[];
  formedTime: number;
  touchTime1: number;
  touchTime2: number;
  zoneSpanOnly: boolean;
  rsi: number | null;
  macdHist: number | null;
  momentumOk: boolean;
  volumeOk: boolean;
};

function lastRsiMacd(candles: Candle[]): {
  rsi: number | null;
  macdHist: number | null;
  prevHist: number | null;
} {
  if (candles.length < 20) return { rsi: null, macdHist: null, prevHist: null };
  const rsiS = rsi(candles, 14);
  const macdP = macd(candles, 12, 26, 9);
  const n = candles.length - 1;
  const r = rsiS[n];
  const h = macdP.hist[n];
  const ph = n > 0 ? macdP.hist[n - 1] : null;
  return {
    rsi: Number.isFinite(r) ? Number(r) : null,
    macdHist: Number.isFinite(h) ? Number(h) : null,
    prevHist: ph != null && Number.isFinite(ph) ? Number(ph) : null,
  };
}

function macdAligned(
  direction: 'LONG' | 'SHORT',
  hist: number | null,
  prev: number | null
): boolean {
  if (hist == null || !Number.isFinite(hist)) return false;
  if (direction === 'LONG') {
    if (hist >= 0) return true;
    return prev != null && hist > prev;
  }
  if (hist <= 0) return true;
  return prev != null && hist < prev;
}

export function evaluateScalp200AiZoneLife(params: {
  candles: Candle[];
  direction: 'LONG' | 'SHORT';
  entry: number;
  engineState: Scalp200EngineState;
  entryAllowed: boolean;
  journalTouchOk: boolean;
  hotTouch: boolean;
  practiceFire: boolean;
  masterOk: boolean;
  gatesPassed: number;
  gatesTotal: number;
  invBroken: boolean;
  journalConflict: boolean;
  missDist: number;
  missThreshold: number;
  spotPx?: number | null;
  bandTouch?: Scalp200BandTouchEvidence | null;
}): Scalp200AiZoneLife {
  const {
    candles,
    direction,
    entry,
    engineState,
    entryAllowed,
    journalTouchOk,
    hotTouch,
    practiceFire,
    masterOk,
    gatesPassed,
    invBroken,
    journalConflict,
    missDist,
    missThreshold,
  } = params;
  const bandTouch = params.bandTouch ?? null;

  const evidence: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  const { rsi: rsiVal, macdHist, prevHist } = lastRsiMacd(candles);
  const momentumOk =
    rsiVal != null && mergedLeadingMomentumGate(rsiVal, direction, true);
  const macdOk = macdAligned(direction, macdHist, prevHist);

  const volM = buildVolumeTfBarMetrics({
    candles,
    barIdx: candles.length - 1,
    spotPx: params.spotPx,
    rsiSeries: rsi(candles, 14),
    macdHistSeries: macd(candles, 12, 26, 9).hist,
    last: true,
  });
  const volumeOk =
    Boolean(volM) &&
    (volM!.rvol == null || volM!.rvol >= 1.05) &&
    (direction === 'LONG' ? volM!.buyDominant || volM!.buyPct >= 0.5 : volM!.sellDominant || volM!.sellPct >= 0.5);

  if (journalTouchOk) {
    score += 2;
    evidence.push('기록부E');
  }
  if (bandTouch?.wickTouch) {
    score += 2;
    evidence.push(...bandTouch.evidenceKo.slice(0, 2));
  }
  if (bandTouch?.journalBandTouch) {
    score += 1;
  }
  if (hotTouch) {
    score += 2;
    evidence.push('Hot존');
  }
  if (practiceFire) {
    score += 2;
    evidence.push('실전AI');
  }
  if (momentumOk && rsiVal != null) {
    score += 1;
    evidence.push(`RSI${Math.round(rsiVal)}`);
  }
  if (macdOk) {
    score += 1;
    evidence.push(macdHist != null && macdHist >= 0 ? 'MACD+' : 'MACD−');
  }
  if (volumeOk && volM) {
    score += 2;
    if (volM.rvol != null && volM.rvol >= 1.2) evidence.push(`RVOL${volM.rvol.toFixed(1)}`);
    else evidence.push('수급');
  }
  if (masterOk) {
    score += 1;
    evidence.push('마스터');
  }
  if (gatesPassed >= 8) {
    score += 1;
    reasons.push(`${gatesPassed}/${params.gatesTotal}게이트`);
  }

  const touch = findLastPriceTouchBar(candles, entry, 96);
  const touchIdx = touch?.index ?? Math.max(0, candles.length - 24);
  const hug = touchHugTimes(candles, touchIdx, 1);
  const formedTime = touch?.time ?? Number(candles[touchIdx]?.time) ?? 0;

  let lifeState: Scalp200ZoneLifeState = 'WATCH';

  if (invBroken || journalConflict || engineState === 'INVALID') {
    lifeState = 'INVALID';
    reasons.push(invBroken ? '무효선이탈' : '충돌·무효');
  } else if (engineState === 'MISSED' || missDist > missThreshold) {
    lifeState = 'MISSED';
    reasons.push('E이탈');
  } else if (
    engineState === 'FIRE' &&
    entryAllowed &&
    (journalTouchOk || bandTouch?.wickTouch) &&
    momentumOk &&
    (macdOk || bandTouch?.dumpFloorBounce) &&
    score >= (bandTouch?.dumpFloorBounce ? 5 : 6)
  ) {
    lifeState = 'CONFIRM_ENTRY';
    reasons.push(bandTouch?.dumpFloorBounce ? 'V반등·AI타점확정' : 'AI타점확정');
  } else if (
    engineState === 'ARMED' ||
    engineState === 'FIRE' ||
    journalTouchOk ||
    hotTouch ||
    bandTouch?.wickTouch ||
    missDist <= missThreshold * 0.6
  ) {
    lifeState = 'ARMED';
    if (!momentumOk) reasons.push('RSI대기');
    if (!macdOk) reasons.push('MACD대기');
  } else {
    lifeState = 'WATCH';
  }

  const zoneSpanOnly =
    lifeState === 'CONFIRM_ENTRY' ||
    (lifeState === 'ARMED' && (journalTouchOk || bandTouch?.wickTouch));

  return {
    lifeState,
    lifeKo: SCALP200_ZONE_LIFE_KO[lifeState],
    aiScore: score,
    evidenceKo: evidence.slice(0, 5),
    reasonsKo: reasons.slice(0, 4),
    formedTime,
    touchTime1: zoneSpanOnly ? hug.time1 : formedTime,
    touchTime2: zoneSpanOnly ? hug.time2 : formedTime,
    zoneSpanOnly,
    rsi: rsiVal,
    macdHist,
    momentumOk,
    volumeOk,
  };
}

/** 폭락구간 dumpLifeVisual 패턴 — AI 200x 타점 zone 색 */
export function scalp200ZoneLifeVisual(state: Scalp200ZoneLifeState): {
  fill: string;
  border: string;
  labelBg: string;
  labelFg: string;
  line: string;
  lifeClass: string;
} {
  if (state === 'CONFIRM_ENTRY') {
    return {
      fill: 'rgba(99,102,241,0.24)',
      border: 'rgba(99,102,241,0.92)',
      labelBg: 'rgba(49,46,129,0.94)',
      labelFg: '#E0E7FF',
      line: '#6366F1',
      lifeClass: 'merged-desk-ai200-entry',
    };
  }
  if (state === 'ARMED') {
    return {
      fill: 'rgba(250,204,21,0.18)',
      border: 'rgba(250,204,21,0.78)',
      labelBg: 'rgba(113,63,18,0.92)',
      labelFg: '#fef08a',
      line: '#facc15',
      lifeClass: 'merged-desk-scalp200-armed',
    };
  }
  if (state === 'MISSED') {
    return {
      fill: 'rgba(100,116,139,0.1)',
      border: 'rgba(148,163,184,0.45)',
      labelBg: 'rgba(30,41,59,0.88)',
      labelFg: '#94a3b8',
      line: '#64748b',
      lifeClass: 'merged-desk-scalp200-missed',
    };
  }
  if (state === 'INVALID') {
    return {
      fill: 'rgba(248,113,113,0.12)',
      border: 'rgba(248,113,113,0.5)',
      labelBg: 'rgba(127,29,29,0.9)',
      labelFg: '#fecaca',
      line: '#f87171',
      lifeClass: 'merged-desk-scalp200-invalid',
    };
  }
  return {
    fill: 'rgba(100,116,139,0.11)',
    border: 'rgba(148,163,184,0.55)',
    labelBg: 'rgba(30,41,59,0.92)',
    labelFg: '#cbd5e1',
    line: '#94a3b8',
    lifeClass: 'merged-desk-scalp200-watch',
  };
}
