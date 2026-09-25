/**
 * PHASE 13 — Smart path. Geometry freezes at confirm. Not a prophecy.
 * Probability only when sample >= 30. Alt/break % are independent measured rates — never 1-p splits.
 * PHASE 15 — Insufficient sample / no outcomes → PATH_UNAVAILABLE (no invented zigzags).
 */
import { buildFrozenPath, type FrozenPathPoint, type FrozenTrade } from './tradeManage';
import type { Eagle1RiskPlan } from './riskEngine';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export type Eagle1PathUiState = 'ON_TRACK' | 'DEVIATING' | 'INVALID' | 'WAIT' | 'PATH_UNAVAILABLE';

export type Eagle1PathScenario = {
  id: 'main' | 'alt' | 'invalid' | 'break';
  labelKo: string;
  labelEn: string;
  state: '진행중' | '이탈주의' | '무효' | '대기';
  uiState: Eagle1PathUiState;
  points: FrozenPathPoint[];
  probability: number | null;
  sampleSize: number;
  expectedMovePct: number | null;
  expectedTimeSec: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  invalidation: number | null;
  note: string;
};

export type Eagle1SmartPath = {
  main: Eagle1PathScenario;
  alt: Eagle1PathScenario;
  invalid: Eagle1PathScenario;
  break: Eagle1PathScenario;
  frozen: boolean;
};

function uiStateFrom(state: Eagle1PathScenario['state']): Eagle1PathUiState {
  if (state === '진행중') return 'ON_TRACK';
  if (state === '이탈주의') return 'DEVIATING';
  if (state === '무효') return 'INVALID';
  return 'WAIT';
}

function emptyScenario(
  id: Eagle1PathScenario['id'],
  labelKo: string,
  labelEn: string,
  opts?: { uiState?: Eagle1PathUiState; note?: string; sampleSize?: number }
): Eagle1PathScenario {
  return {
    id,
    labelKo,
    labelEn,
    state: '대기',
    uiState: opts?.uiState ?? 'WAIT',
    points: [],
    probability: null,
    sampleSize: opts?.sampleSize ?? 0,
    expectedMovePct: null,
    expectedTimeSec: null,
    tp1: null,
    tp2: null,
    tp3: null,
    invalidation: null,
    note: opts?.note ?? '데이터 없음',
  };
}

function unavailableBundle(sampleSize: number, note: string): Eagle1SmartPath {
  const o = { uiState: 'PATH_UNAVAILABLE' as const, note, sampleSize };
  return {
    main: emptyScenario('main', '주경로', 'MAIN PATH', o),
    alt: emptyScenario('alt', '대체경로', 'ALTERNATIVE PATH', {
      ...o,
      note: `${note} · 반대 셋업 대기`,
    }),
    invalid: emptyScenario('invalid', '무효', 'INVALID', o),
    break: emptyScenario('break', '이탈경로', 'BREAK/EXTREME PATH', o),
    frozen: false,
  };
}

function measuredP(n: number, p: number | null | undefined): number | null {
  if (n < EAGLE1_MIN_STAT_SAMPLE || p == null || !Number.isFinite(p)) return null;
  return p;
}

export function buildSmartPath(params: {
  lastTime: number;
  tfSec: number;
  direction: 'LONG' | 'SHORT' | null;
  risk: Eagle1RiskPlan;
  trade?: FrozenTrade | null;
  sampleSize?: number;
  /** Historical outcomes count — 0 → PATH UNAVAILABLE */
  outcomeCount?: number;
  calibratedProbability?: number | null;
  slFirstRate?: number | null;
  medianMfePct?: number | null;
  meanReactionSec?: number | null;
}): Eagle1SmartPath {
  const dir = params.direction ?? params.risk.direction;
  const entry =
    params.risk.entryLow != null && params.risk.entryHigh != null
      ? (params.risk.entryLow + params.risk.entryHigh) / 2
      : null;
  const sl = params.risk.executableSl;
  const n = params.sampleSize ?? 0;
  const outcomeCount = params.outcomeCount ?? n;

  if (outcomeCount <= 0) {
    return unavailableBundle(n, 'PATH UNAVAILABLE · 성과 표본 없음');
  }
  if (n < EAGLE1_MIN_STAT_SAMPLE) {
    return unavailableBundle(
      n,
      n <= 0 ? 'PATH UNAVAILABLE · 데이터 없음' : `PATH UNAVAILABLE · LOW SAMPLE (n=${n})`
    );
  }

  const p = measuredP(n, params.calibratedProbability);
  const pNote = p != null ? '표본 보정' : n <= 0 ? '데이터 없음' : '통계 부족';
  const breakP = measuredP(n, params.slFirstRate);
  const move = n >= EAGLE1_MIN_STAT_SAMPLE ? params.medianMfePct ?? null : null;
  const tsec = n >= EAGLE1_MIN_STAT_SAMPLE ? params.meanReactionSec ?? null : null;

  if (!dir || entry == null || sl == null || params.risk.tp1 == null) {
    return {
      main: emptyScenario('main', '주경로', 'MAIN PATH', {
        sampleSize: n,
        note: 'PATH UNAVAILABLE · 구조 목표가 없음',
        uiState: 'PATH_UNAVAILABLE',
      }),
      alt: {
        ...emptyScenario('alt', '대체경로', 'ALTERNATIVE PATH', {
          sampleSize: n,
          uiState: 'PATH_UNAVAILABLE',
          note: '반대 셋업이 따로 확정되기 전엔 대기',
        }),
      },
      invalid: emptyScenario('invalid', '무효', 'INVALID', {
        sampleSize: n,
        uiState: 'PATH_UNAVAILABLE',
        note: 'PATH UNAVAILABLE · 구조 목표가 없음',
      }),
      break: emptyScenario('break', '이탈경로', 'BREAK/EXTREME PATH', {
        sampleSize: n,
        uiState: 'PATH_UNAVAILABLE',
        note: 'PATH UNAVAILABLE · 구조 목표가 없음',
      }),
      frozen: false,
    };
  }

  const built = params.trade
    ? { path: params.trade.path, altPath: params.trade.altPath }
    : buildFrozenPath({
        lastTime: params.lastTime,
        tfSec: params.tfSec,
        direction: dir,
        entry,
        sl,
        tp1: params.risk.tp1,
        tp2: params.risk.tp2,
        tp3: params.risk.tp3,
      });

  const state = params.trade?.pathState ?? '진행중';
  const main: Eagle1PathScenario = {
    id: 'main',
    labelKo: '주경로',
    labelEn: 'MAIN PATH',
    state,
    uiState: uiStateFrom(state),
    points: built.path,
    probability: p,
    sampleSize: n,
    expectedMovePct: move,
    expectedTimeSec: tsec,
    tp1: params.risk.tp1,
    tp2: params.risk.tp2,
    tp3: params.risk.tp3,
    invalidation: sl,
    note: `${dir === 'LONG' ? '위쪽' : '아래쪽'} 구조 목표 · ${pNote}`,
  };
  const alt: Eagle1PathScenario = {
    id: 'alt',
    labelKo: '대체경로',
    labelEn: 'ALTERNATIVE PATH',
    state: state === '무효' ? '진행중' : '대기',
    uiState: state === '무효' ? 'ON_TRACK' : 'WAIT',
    points: [],
    probability: null,
    sampleSize: n,
    expectedMovePct: null,
    expectedTimeSec: null,
    tp1: null,
    tp2: null,
    tp3: null,
    invalidation: sl,
    note: '반대 셋업이 따로 확정되기 전엔 대기 · 확률 분할 없음',
  };
  const brk: Eagle1PathScenario = {
    id: 'break',
    labelKo: '이탈경로',
    labelEn: 'BREAK/EXTREME PATH',
    state: state === '무효' ? '무효' : '대기',
    uiState: state === '무효' ? 'INVALID' : 'WAIT',
    points: built.altPath,
    probability: breakP,
    sampleSize: n,
    expectedMovePct: null,
    expectedTimeSec: tsec,
    tp1: null,
    tp2: null,
    tp3: null,
    invalidation: sl,
    note: breakP != null ? '손절선 선도달 표본' : n <= 0 ? '데이터 없음' : '통계 부족',
  };
  return {
    main,
    alt,
    invalid: {
      ...brk,
      id: 'invalid',
      labelKo: '무효',
      labelEn: 'INVALID',
    },
    break: brk,
    frozen: Boolean(params.trade),
  };
}

export function smartPathShellKo(path: Eagle1SmartPath | null | undefined): string {
  if (!path) return '데이터 없음';
  if (path.main.uiState === 'PATH_UNAVAILABLE') return path.main.note || 'PATH UNAVAILABLE';
  const p = path.main.probability != null ? `검증확률 ${Math.round(path.main.probability * 100)}%` : '통계 부족';
  return `${path.main.labelKo} ${path.main.state} · ${p}`;
}
