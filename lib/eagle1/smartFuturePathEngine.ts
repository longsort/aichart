/**
 * Phase 16 — Smart Future Path 뷰/트래킹 파사드.
 * 기하(점)는 확정 시 freeze. 실시간은 ON_TRACK/DEVIATING/INVALID만.
 * 임의 점선·확률 분할 금지.
 * PHASE 15 — Historical path gate → PATH_UNAVAILABLE when sample/outcomes insufficient.
 */
import { buildSmartPath, type Eagle1SmartPath, type Eagle1PathUiState } from './smartPath';
import type { Eagle1RiskPlan } from './riskEngine';
import type { FrozenTrade } from './tradeManage';
import {
  applyHistoricalPathGateToSmartPath,
  runHistoricalPathGate,
  type HistoricalPathGate,
} from './historicalPathGate';

export type SmartFuturePathReport = {
  path: Eagle1SmartPath;
  trackState: Eagle1PathUiState;
  cluster: Array<{ id: 'MAIN' | 'ALT' | 'BREAK'; labelKo: string; uiState: Eagle1PathUiState; note: string }>;
  geometryFrozen: boolean;
  arbitraryDashedForbidden: true;
  summaryKo: string;
  /** PHASE 15 */
  historicalPathGate?: HistoricalPathGate;
};

function trackFromClose(params: {
  path: Eagle1SmartPath;
  lastClose: number | null | undefined;
  direction: 'LONG' | 'SHORT' | null;
}): Eagle1PathUiState {
  const base = params.path.main.uiState;
  if (base === 'PATH_UNAVAILABLE') return 'PATH_UNAVAILABLE';
  if (!params.path.frozen) return base;
  const close = params.lastClose;
  const inv = params.path.main.invalidation;
  const tp1 = params.path.main.tp1;
  if (close == null || !Number.isFinite(close) || inv == null) return base;
  const dir = params.direction;
  if (dir === 'LONG') {
    if (close <= inv) return 'INVALID';
    if (tp1 != null && close >= tp1) return 'ON_TRACK';
    const mid = (inv + (tp1 ?? close)) / 2;
    if (close < mid) return 'DEVIATING';
    return 'ON_TRACK';
  }
  if (dir === 'SHORT') {
    if (close >= inv) return 'INVALID';
    if (tp1 != null && close <= tp1) return 'ON_TRACK';
    const mid = (inv + (tp1 ?? close)) / 2;
    if (close > mid) return 'DEVIATING';
    return 'ON_TRACK';
  }
  return base;
}

function stateKo(ui: Eagle1PathUiState): '진행중' | '이탈주의' | '무효' | '대기' {
  if (ui === 'ON_TRACK') return '진행중';
  if (ui === 'DEVIATING') return '이탈주의';
  if (ui === 'INVALID') return '무효';
  return '대기';
}

export function runSmartFuturePathEngine(params: {
  lastTime: number;
  tfSec: number;
  direction: 'LONG' | 'SHORT' | null;
  risk: Eagle1RiskPlan;
  trade?: FrozenTrade | null;
  sampleSize?: number;
  outcomeCount?: number;
  calibratedProbability?: number | null;
  slFirstRate?: number | null;
  medianMfePct?: number | null;
  meanReactionSec?: number | null;
  lastClose?: number | null;
  /** Optional precomputed gate; otherwise derived from sample/outcomes/structure */
  historicalPathGate?: HistoricalPathGate;
}): SmartFuturePathReport {
  const hasStructureTargets =
    params.risk.entryLow != null &&
    params.risk.entryHigh != null &&
    params.risk.executableSl != null &&
    params.risk.tp1 != null;

  const gate =
    params.historicalPathGate ??
    runHistoricalPathGate({
      sampleSize: params.sampleSize,
      outcomeCount: params.outcomeCount ?? params.sampleSize,
      hasStructureTargets,
    });

  let path = buildSmartPath({
    ...params,
    outcomeCount: params.outcomeCount ?? params.sampleSize,
  });
  const trackState = trackFromClose({
    path,
    lastClose: params.lastClose,
    direction: params.direction,
  });

  if (path.frozen && trackState !== path.main.uiState && trackState !== 'PATH_UNAVAILABLE') {
    path = {
      ...path,
      main: {
        ...path.main,
        uiState: trackState,
        state: stateKo(trackState),
        note: `${path.main.note} · 추적 ${trackState}`,
      },
      break:
        trackState === 'INVALID'
          ? {
              ...path.break,
              uiState: 'INVALID',
              state: '무효',
            }
          : path.break,
    };
  }

  const cluster: SmartFuturePathReport['cluster'] = [
    { id: 'MAIN', labelKo: path.main.labelKo, uiState: path.main.uiState, note: path.main.note },
    { id: 'ALT', labelKo: path.alt.labelKo, uiState: path.alt.uiState, note: path.alt.note },
    { id: 'BREAK', labelKo: path.break.labelKo, uiState: path.break.uiState, note: path.break.note },
  ];

  const base: SmartFuturePathReport = {
    path,
    trackState,
    cluster,
    geometryFrozen: path.frozen,
    arbitraryDashedForbidden: true,
    summaryKo: path.frozen
      ? `경로 ${trackState} · 기하 고정`
      : trackState === 'PATH_UNAVAILABLE'
        ? gate.summaryKo
        : `경로 ${trackState} · 확정 전 대기`,
    historicalPathGate: gate,
  };

  const gatedPath = applyHistoricalPathGateToSmartPath(base.path, gate);
  const gatedTrack: Eagle1PathUiState = gate.available ? base.trackState : 'PATH_UNAVAILABLE';
  return {
    ...base,
    path: gatedPath,
    trackState: gatedTrack,
    geometryFrozen: gate.available ? base.geometryFrozen : false,
    cluster: [
      { id: 'MAIN', labelKo: gatedPath.main.labelKo, uiState: gatedPath.main.uiState, note: gatedPath.main.note },
      { id: 'ALT', labelKo: gatedPath.alt.labelKo, uiState: gatedPath.alt.uiState, note: gatedPath.alt.note },
      { id: 'BREAK', labelKo: gatedPath.break.labelKo, uiState: gatedPath.break.uiState, note: gatedPath.break.note },
    ],
    summaryKo: gate.available ? base.summaryKo : gate.summaryKo,
    historicalPathGate: gate,
  };
}
