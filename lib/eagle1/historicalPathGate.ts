/**
 * PHASE 15 — Historical Path gate.
 * Insufficient sample / no outcomes → PATH UNAVAILABLE.
 * No arbitrary zigzag coordinates; path points must be evidence-backed (ENTRY/SL/TP…).
 */
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { Eagle1SmartPath, Eagle1PathScenario, Eagle1PathUiState } from './smartPath';
import type { FrozenPathPoint } from './tradeManage';

export type HistoricalPathGateReason = 'OK' | 'LOW_SAMPLE' | 'NO_OUTCOMES' | 'NO_STRUCTURE' | 'UNAVAILABLE';

export type HistoricalPathGate = {
  available: boolean;
  reason: HistoricalPathGateReason;
  sampleSize: number;
  note: string;
  summaryKo: string;
};

const EVIDENCE_LABELS = new Set(['ENTRY', 'TP1', 'TP2', 'TP3', 'STOP', 'SL', 'INVALIDATION', 'POC', 'CORE']);

/** Path points must carry structure/target labels — pure zigzag decoration is rejected. */
export function isEvidenceBackedPathPoints(
  points: Array<{ price: number; label?: string } | FrozenPathPoint> | null | undefined
): boolean {
  if (!points || points.length === 0) return true;
  if (points.length === 1) {
    const lab = String(points[0]?.label || '').toUpperCase();
    return EVIDENCE_LABELS.has(lab) && Number.isFinite(points[0]!.price);
  }
  for (const p of points) {
    if (!Number.isFinite(p.price)) return false;
    const lab = String(p.label || '').toUpperCase();
    if (!EVIDENCE_LABELS.has(lab)) return false;
  }
  if (points.length >= 4) {
    let flips = 0;
    for (let i = 2; i < points.length; i++) {
      const d0 = points[i - 1]!.price - points[i - 2]!.price;
      const d1 = points[i]!.price - points[i - 1]!.price;
      if (d0 === 0 || d1 === 0) continue;
      if (Math.sign(d0) !== Math.sign(d1)) flips += 1;
    }
    const hasTarget = points.some((p) => {
      const l = String(p.label || '').toUpperCase();
      return l === 'TP1' || l === 'TP2' || l === 'TP3' || l === 'STOP' || l === 'SL';
    });
    if (flips >= 2 && !hasTarget) return false;
  }
  return true;
}

export function runHistoricalPathGate(params: {
  sampleSize?: number | null;
  outcomeCount?: number | null;
  hasStructureTargets?: boolean;
  minSample?: number;
}): HistoricalPathGate {
  const minSample = params.minSample ?? EAGLE1_MIN_STAT_SAMPLE;
  const sampleSize = Math.max(0, Math.floor(Number(params.sampleSize) || 0));
  const outcomeCount =
    params.outcomeCount != null && Number.isFinite(params.outcomeCount)
      ? Math.max(0, Math.floor(Number(params.outcomeCount)))
      : null;
  const hasStructure = Boolean(params.hasStructureTargets);

  if (outcomeCount != null && outcomeCount <= 0) {
    return {
      available: false,
      reason: 'NO_OUTCOMES',
      sampleSize,
      note: 'no historical outcomes',
      summaryKo: 'PATH UNAVAILABLE · 성과 표본 없음',
    };
  }
  if (sampleSize < minSample) {
    return {
      available: false,
      reason: sampleSize <= 0 ? 'UNAVAILABLE' : 'LOW_SAMPLE',
      sampleSize,
      note: `n=${sampleSize}<${minSample}`,
      summaryKo:
        sampleSize <= 0
          ? 'PATH UNAVAILABLE · 데이터 없음'
          : `PATH UNAVAILABLE · LOW SAMPLE (n=${sampleSize})`,
    };
  }
  if (!hasStructure) {
    return {
      available: false,
      reason: 'NO_STRUCTURE',
      sampleSize,
      note: 'missing entry/stop/tp structure targets',
      summaryKo: 'PATH UNAVAILABLE · 구조 목표가 없음',
    };
  }
  return {
    available: true,
    reason: 'OK',
    sampleSize,
    note: `n=${sampleSize} structure targets ok`,
    summaryKo: `PATH OK · n=${sampleSize}`,
  };
}

function scenarioUnavailable(s: Eagle1PathScenario, note: string): Eagle1PathScenario {
  return {
    ...s,
    state: '대기',
    uiState: 'PATH_UNAVAILABLE' as Eagle1PathUiState,
    points: [],
    probability: null,
    expectedMovePct: null,
    expectedTimeSec: null,
    note: `${note} · PATH UNAVAILABLE`,
  };
}

export function applyHistoricalPathGateToSmartPath(
  path: Eagle1SmartPath,
  gate: HistoricalPathGate
): Eagle1SmartPath {
  if (gate.available) {
    const scrub = (s: Eagle1PathScenario): Eagle1PathScenario =>
      isEvidenceBackedPathPoints(s.points) ? s : { ...s, points: [], note: `${s.note} · zigzag 제거` };
    return {
      ...path,
      main: scrub(path.main),
      alt: scrub(path.alt),
      invalid: scrub(path.invalid),
      break: scrub(path.break),
    };
  }
  const note = gate.summaryKo;
  return {
    ...path,
    frozen: false,
    main: scenarioUnavailable(path.main, note),
    alt: scenarioUnavailable(path.alt, note),
    invalid: scenarioUnavailable(path.invalid, note),
    break: scenarioUnavailable(path.break, note),
  };
}

export function historicalPathAcceptanceJ(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];

  const low = runHistoricalPathGate({
    sampleSize: 5,
    outcomeCount: 5,
    hasStructureTargets: true,
  });
  if (low.available) notes.push('low sample must be unavailable');
  if (low.reason !== 'LOW_SAMPLE') notes.push(`low reason→${low.reason}`);

  const noOut = runHistoricalPathGate({
    sampleSize: 40,
    outcomeCount: 0,
    hasStructureTargets: true,
  });
  if (noOut.available || noOut.reason !== 'NO_OUTCOMES') notes.push('no outcomes');

  const noStruct = runHistoricalPathGate({
    sampleSize: 40,
    outcomeCount: 40,
    hasStructureTargets: false,
  });
  if (noStruct.available || noStruct.reason !== 'NO_STRUCTURE') notes.push('no structure');

  const okGate = runHistoricalPathGate({
    sampleSize: 40,
    outcomeCount: 40,
    hasStructureTargets: true,
  });
  if (!okGate.available || okGate.reason !== 'OK') notes.push('ok path');

  const zigzag = [
    { time: 1, price: 100, label: 'ZIG' },
    { time: 2, price: 112, label: 'ZAG' },
    { time: 3, price: 98, label: 'ZIG' },
    { time: 4, price: 120, label: 'ZAG' },
  ];
  if (isEvidenceBackedPathPoints(zigzag)) notes.push('zigzag must reject');

  const evidence = [
    { time: 1, price: 100, label: 'ENTRY' },
    { time: 2, price: 110, label: 'TP1' },
    { time: 3, price: 118, label: 'TP2' },
  ];
  if (!isEvidenceBackedPathPoints(evidence)) notes.push('structure targets must pass');
  if (!isEvidenceBackedPathPoints([])) notes.push('empty points honest');

  const fakePath: Eagle1SmartPath = {
    frozen: false,
    main: {
      id: 'main',
      labelKo: '주경로',
      labelEn: 'MAIN PATH',
      state: '진행중',
      uiState: 'ON_TRACK',
      points: zigzag as FrozenPathPoint[],
      probability: 0.99,
      sampleSize: 5,
      expectedMovePct: 12,
      expectedTimeSec: 60,
      tp1: 110,
      tp2: null,
      tp3: null,
      invalidation: 90,
      note: 'fake',
    },
    alt: {
      id: 'alt',
      labelKo: '대체',
      labelEn: 'ALT',
      state: '대기',
      uiState: 'WAIT',
      points: [],
      probability: null,
      sampleSize: 5,
      expectedMovePct: null,
      expectedTimeSec: null,
      tp1: null,
      tp2: null,
      tp3: null,
      invalidation: null,
      note: '',
    },
    invalid: {
      id: 'invalid',
      labelKo: '무효',
      labelEn: 'INVALID',
      state: '대기',
      uiState: 'WAIT',
      points: [],
      probability: null,
      sampleSize: 5,
      expectedMovePct: null,
      expectedTimeSec: null,
      tp1: null,
      tp2: null,
      tp3: null,
      invalidation: null,
      note: '',
    },
    break: {
      id: 'break',
      labelKo: '이탈',
      labelEn: 'BREAK',
      state: '대기',
      uiState: 'WAIT',
      points: zigzag as FrozenPathPoint[],
      probability: null,
      sampleSize: 5,
      expectedMovePct: null,
      expectedTimeSec: null,
      tp1: null,
      tp2: null,
      tp3: null,
      invalidation: null,
      note: '',
    },
  };
  const cleared = applyHistoricalPathGateToSmartPath(fakePath, low);
  if (cleared.main.points.length > 0) notes.push('low sample must clear points');
  if (cleared.main.uiState !== 'PATH_UNAVAILABLE') notes.push('uiState PATH_UNAVAILABLE');
  if (cleared.main.probability != null) notes.push('prob must null when unavailable');

  return { ok: notes.length === 0, notes };
}
