'use client';

import type { AnalyzeResponse, Verdict } from '@/types';

export type AxisKey = 'structure' | 'zone' | 'pattern' | 'momentum' | 'close' | 'liquidity';
export type AxisScore = { key: AxisKey; label: string; score: number };

type LearningStats = {
  wins: number;
  losses: number;
  lossStreak: number;
};
type GateConfig = {
  minOverall: number;
  minEdge: number;
  unlockWins: number;
  autoTune: boolean;
};
export type GatePreset = 'aggressive' | 'balanced' | 'conservative';

type ActiveSignal = {
  id: string;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  tp: number;
  createdAt: number;
};

export type LearningState = {
  axisWeights: Record<AxisKey, number>;
  stats: LearningStats;
  gate: GateConfig;
  activeSignal: ActiveSignal | null;
  recentOutcomes: Array<{ at: number; direction: 'LONG' | 'SHORT'; result: 'win' | 'loss'; symbol: string; timeframe: string }>;
  blacklist: Record<string, { until: number; reason: string; unlockProgress: number }>;
};

const KEY = 'ailongshort-unified-trade-learning-v1';
const AXIS_LABEL: Record<AxisKey, string> = {
  structure: '구조',
  zone: '존',
  pattern: '패턴',
  momentum: '모멘텀',
  close: '종가마감',
  liquidity: '유동성',
};

const defaultState: LearningState = {
  axisWeights: {
    structure: 1,
    zone: 1,
    pattern: 1,
    momentum: 1,
    close: 1,
    liquidity: 1,
  },
  stats: { wins: 0, losses: 0, lossStreak: 0 },
  gate: { minOverall: 58, minEdge: 8, unlockWins: 2, autoTune: true },
  activeSignal: null,
  recentOutcomes: [],
  blacklist: {},
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function to100(v: number) {
  if (!Number.isFinite(v)) return 0;
  return clamp(Math.round(v), 0, 100);
}

export function loadLearningState(): LearningState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<LearningState>;
    return {
      axisWeights: { ...defaultState.axisWeights, ...(parsed.axisWeights || {}) },
      stats: { ...defaultState.stats, ...(parsed.stats || {}) },
      gate: { ...defaultState.gate, ...(parsed.gate || {}) },
      activeSignal: parsed.activeSignal ?? null,
      recentOutcomes: Array.isArray(parsed.recentOutcomes) ? parsed.recentOutcomes as LearningState['recentOutcomes'] : [],
      blacklist: (parsed.blacklist && typeof parsed.blacklist === 'object') ? parsed.blacklist as LearningState['blacklist'] : {},
    };
  } catch {
    return defaultState;
  }
}

let lastPersistMs = 0;
function persistLearningToServer(state: LearningState, force = false) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (!force && now - lastPersistMs < 15000) return;
  lastPersistMs = now;
  void fetch('/api/trade-learning', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  }).catch(() => {});
}

function saveLearningState(state: LearningState, forcePersist = false) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  persistLearningToServer(state, forcePersist);
}

function applyAutoTune(state: LearningState) {
  if (!state.gate.autoTune) return;
  const sample = state.recentOutcomes.slice(0, 24);
  if (sample.length < 6) return;
  const wins = sample.filter((x) => x.result === 'win').length;
  const winRate = (wins / sample.length) * 100;
  if (winRate < 42) {
    state.gate.minOverall = clamp(state.gate.minOverall + 1, 45, 85);
    state.gate.minEdge = clamp(state.gate.minEdge + 1, 4, 25);
  } else if (winRate > 62) {
    state.gate.minOverall = clamp(state.gate.minOverall - 1, 45, 85);
    state.gate.minEdge = clamp(state.gate.minEdge - 1, 4, 25);
  }
}

function axisRawScores(analysis: AnalyzeResponse, direction: 'LONG' | 'SHORT'): Record<AxisKey, number> {
  const structure = direction === 'LONG' ? Number(analysis.longScore ?? 50) : Number(analysis.shortScore ?? 50);
  const zone = direction === 'LONG'
    ? Number(analysis.nearestBuyZone?.probability ?? analysis.entryHoldProbability ?? 50)
    : Number(analysis.nearestSellZone?.probability ?? analysis.invalidationLevelProbability ?? 50);
  const dominant = analysis.dominantPattern;
  const dominantConf = dominant?.confidence != null
    ? Number(dominant.confidence)
    : (analysis.detectedVisionPatterns?.length ? Math.max(...analysis.detectedVisionPatterns.map((p) => Number(p.confidence || 0))) : 45);
  const pattern = dominant?.bias === 'bullish'
    ? (direction === 'LONG' ? dominantConf : dominantConf - 20)
    : dominant?.bias === 'bearish'
      ? (direction === 'SHORT' ? dominantConf : dominantConf - 20)
      : dominantConf;
  const rsi = analysis.rsiDivergenceSignal;
  const momentumBase = direction === 'LONG' ? Number(rsi?.longScore ?? 50) : Number(rsi?.shortScore ?? 50);
  const momentum = rsi
    ? ((direction === 'LONG' && rsi.verdict === 'LONG') || (direction === 'SHORT' && rsi.verdict === 'SHORT')
      ? momentumBase + 10
      : ((direction === 'LONG' && rsi.verdict === 'SHORT') || (direction === 'SHORT' && rsi.verdict === 'LONG')
        ? momentumBase - 10
        : momentumBase))
    : momentumBase;
  const states = [analysis.dailyState, analysis.weeklyState, analysis.monthlyState];
  let close = 50;
  for (const s of states) {
    if (!s) continue;
    if (direction === 'LONG') {
      if (s === 'accepted_above') close += 16;
      else if (s === 'accepted_below') close -= 16;
    } else {
      if (s === 'accepted_below') close += 16;
      else if (s === 'accepted_above') close -= 16;
    }
  }
  const buy = Number(analysis.buyPressure ?? 50);
  const sell = Number(analysis.sellPressure ?? 50);
  let liquidity = direction === 'LONG' ? 50 + (buy - sell) : 50 + (sell - buy);
  const um = analysis.unifiedMarketMetrics;
  if (um) {
    const ref = 6e5;
    const cvdN = Math.max(-1, Math.min(1, um.aggregatedCvdUsd / ref));
    liquidity += (direction === 'LONG' ? 1 : -1) * cvdN * 10;
    if (um.cmf20 != null) {
      if (um.cmf20 > 0.05) liquidity += direction === 'LONG' ? 6 : -6;
      if (um.cmf20 < -0.05) liquidity += direction === 'SHORT' ? 6 : -6;
    }
    if (um.oiDeltaPct != null) {
      if (direction === 'LONG') {
        if (um.oiDeltaPct > 0.12) liquidity += 4;
        if (um.oiDeltaPct < -0.12) liquidity -= 3;
      } else {
        if (um.oiDeltaPct > 0.12) liquidity += 4;
        if (um.oiDeltaPct < -0.12) liquidity -= 3;
      }
    }
    const lnet = um.liquidationLongUsd - um.liquidationShortUsd;
    const lq = Math.max(-1, Math.min(1, lnet / 8e5));
    liquidity += (direction === 'LONG' ? -1 : 1) * lq * 6;
    liquidity = clamp(liquidity, 8, 92);
  }
  return {
    structure: to100(structure),
    zone: to100(zone),
    pattern: to100(pattern),
    momentum: to100(momentum),
    close: to100(close),
    liquidity: to100(liquidity),
  };
}

export function buildUnifiedSnapshot(analysis: AnalyzeResponse): {
  rows: AxisScore[];
  longRows: AxisScore[];
  shortRows: AxisScore[];
  overall: number;
  longOverall: number;
  shortOverall: number;
  edge: number;
  verdict: Verdict;
  gatePassed: boolean;
  reason: string;
  blacklisted: boolean;
  blacklistReason?: string;
} {
  const learning = loadLearningState();
  const longRaw = axisRawScores(analysis, 'LONG');
  const shortRaw = axisRawScores(analysis, 'SHORT');
  const longRows: AxisScore[] = (Object.keys(longRaw) as AxisKey[]).map((k) => ({
    key: k,
    label: AXIS_LABEL[k],
    score: to100(longRaw[k] * (learning.axisWeights[k] ?? 1)),
  }));
  const shortRows: AxisScore[] = (Object.keys(shortRaw) as AxisKey[]).map((k) => ({
    key: k,
    label: AXIS_LABEL[k],
    score: to100(shortRaw[k] * (learning.axisWeights[k] ?? 1)),
  }));
  const longOverall = to100(longRows.reduce((s, r) => s + r.score, 0) / longRows.length);
  const shortOverall = to100(shortRows.reduce((s, r) => s + r.score, 0) / shortRows.length);
  const overall = Math.max(longOverall, shortOverall);
  const scoreEdge = Math.abs(longOverall - shortOverall);
  const conservativeBoost = learning.stats.lossStreak >= 2 ? 5 : 0;
  const minOverall = Number(learning.gate.minOverall ?? defaultState.gate.minOverall) + conservativeBoost;
  const minEdge = Number(learning.gate.minEdge ?? defaultState.gate.minEdge) + conservativeBoost;
  const gatePassed = overall >= minOverall && scoreEdge >= minEdge;
  const preVerdict: Verdict = gatePassed
    ? (longOverall >= shortOverall ? 'LONG' : 'SHORT')
    : 'WATCH';
  const blacklistKey = `${analysis.symbol}|${analysis.timeframe}|${preVerdict}`;
  const bl = learning.blacklist?.[blacklistKey];
  const blocked = (preVerdict === 'LONG' || preVerdict === 'SHORT') && !!bl && bl.until > Date.now();
  const verdict: Verdict = blocked ? 'WATCH' : preVerdict;
  const rows = verdict === 'SHORT' ? shortRows : longRows;
  const reasonBase = gatePassed
    ? `통합게이트 통과 (overall ${overall}, edge ${scoreEdge.toFixed(0)})`
    : `통합게이트 대기 (overall ${overall}/${minOverall}, edge ${scoreEdge.toFixed(0)}/${minEdge})`;
  const reason = blocked ? `${reasonBase} · 블랙리스트(${bl?.reason ?? 'loss_streak'})` : reasonBase;
  return { rows, longRows, shortRows, overall, longOverall, shortOverall, edge: to100(scoreEdge), verdict, gatePassed: gatePassed && !blocked, reason, blacklisted: blocked, blacklistReason: bl?.reason };
}

export function updateLearningFromAnalysis(analysis: AnalyzeResponse | null): LearningState {
  const state = loadLearningState();
  if (!analysis) return state;
  const currentPrice = Number((analysis as any).currentPrice);
  const hasPrice = Number.isFinite(currentPrice) && currentPrice > 0;
  const confirmed = (analysis as any)?.confirmedSignal?.confirmed === true;
  const direction = analysis.verdict;
  const entry = Number(analysis.entry);
  const stop = Number(analysis.stopLoss);
  const tp = Number((analysis.targets || [])[0]);

  // Resolve active signal first
  const active = state.activeSignal;
  if (active && hasPrice && analysis.symbol === active.symbol && analysis.timeframe === active.timeframe) {
    const hitTp = active.direction === 'LONG' ? currentPrice >= active.tp : currentPrice <= active.tp;
    const hitSl = active.direction === 'LONG' ? currentPrice <= active.stop : currentPrice >= active.stop;
    if (hitTp || hitSl) {
      const isWin = hitTp && !hitSl;
      const snap = buildUnifiedSnapshot(analysis);
      const rowsForDirection = active.direction === 'LONG' ? snap.longRows : snap.shortRows;
      for (const row of rowsForDirection) {
        const w = state.axisWeights[row.key] ?? 1;
        const delta = row.score >= 55 ? (isWin ? 0.02 : -0.03) : (isWin ? 0.005 : -0.01);
        state.axisWeights[row.key] = clamp(w + delta, 0.6, 1.4);
      }
      if (isWin) {
        state.stats.wins += 1;
        state.stats.lossStreak = 0;
        const blKey = `${active.symbol}|${active.timeframe}|${active.direction}`;
        const bl = state.blacklist[blKey];
        if (bl) {
          bl.unlockProgress = (bl.unlockProgress ?? 0) + 1;
          const need = Math.max(1, Number(state.gate.unlockWins ?? defaultState.gate.unlockWins));
          if (bl.unlockProgress >= need) delete state.blacklist[blKey];
          else state.blacklist[blKey] = bl;
        }
      } else {
        state.stats.losses += 1;
        state.stats.lossStreak += 1;
        if (state.stats.lossStreak >= 3) {
          state.blacklist[`${active.symbol}|${active.timeframe}|${active.direction}`] = {
            until: Date.now() + 6 * 60 * 60 * 1000,
            reason: `loss_streak_${state.stats.lossStreak}`,
            unlockProgress: 0,
          };
        }
      }
      state.recentOutcomes.unshift({
        at: Date.now(),
        direction: active.direction,
        result: isWin ? 'win' : 'loss',
        symbol: active.symbol,
        timeframe: active.timeframe,
      });
      if (state.recentOutcomes.length > 80) state.recentOutcomes = state.recentOutcomes.slice(0, 80);
      applyAutoTune(state);
      state.activeSignal = null;
      saveLearningState(state, true);
    }
  }

  // Register new active confirmed signal
  if (confirmed && (direction === 'LONG' || direction === 'SHORT') && entry > 0 && stop > 0 && tp > 0) {
    const id = `${analysis.symbol}|${analysis.timeframe}|${direction}|${entry}|${stop}|${tp}`;
    if (!state.activeSignal || state.activeSignal.id !== id) {
      state.activeSignal = {
        id,
        symbol: analysis.symbol,
        timeframe: analysis.timeframe,
        direction,
        entry,
        stop,
        tp,
        createdAt: Date.now(),
      };
    }
  }

  saveLearningState(state, false);
  return state;
}

export async function syncLearningFromServer(): Promise<LearningState> {
  const local = loadLearningState();
  if (typeof window === 'undefined') return local;
  try {
    const res = await fetch('/api/trade-learning', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return local;
    const data = await res.json() as { state?: Partial<LearningState> | null };
    if (!data?.state) return local;
    const merged: LearningState = {
      axisWeights: { ...defaultState.axisWeights, ...(data.state.axisWeights || {}), ...(local.axisWeights || {}) },
      stats: { ...defaultState.stats, ...(data.state.stats || {}), ...(local.stats || {}) },
      gate: { ...defaultState.gate, ...(data.state.gate || {}), ...(local.gate || {}) },
      activeSignal: local.activeSignal ?? data.state.activeSignal ?? null,
      recentOutcomes: Array.isArray(local.recentOutcomes) && local.recentOutcomes.length
        ? local.recentOutcomes
        : Array.isArray(data.state.recentOutcomes)
          ? data.state.recentOutcomes as LearningState['recentOutcomes']
          : [],
      blacklist: { ...(data.state.blacklist || {}), ...(local.blacklist || {}) } as LearningState['blacklist'],
    };
    saveLearningState(merged, false);
    return merged;
  } catch {
    return local;
  }
}

export function updateGateConfig(patch: Partial<GateConfig>): LearningState {
  const state = loadLearningState();
  state.gate = {
    ...state.gate,
    ...patch,
    minOverall: clamp(Number(patch.minOverall ?? state.gate.minOverall), 45, 85),
    minEdge: clamp(Number(patch.minEdge ?? state.gate.minEdge), 4, 25),
    unlockWins: clamp(Math.round(Number(patch.unlockWins ?? state.gate.unlockWins)), 1, 5),
    autoTune: patch.autoTune ?? state.gate.autoTune,
  };
  saveLearningState(state, true);
  return state;
}

export function applyGatePreset(preset: GatePreset): LearningState {
  if (preset === 'aggressive') {
    return updateGateConfig({ minOverall: 54, minEdge: 6, unlockWins: 1 });
  }
  if (preset === 'conservative') {
    return updateGateConfig({ minOverall: 64, minEdge: 12, unlockWins: 3 });
  }
  return updateGateConfig({ minOverall: 58, minEdge: 8, unlockWins: 2 });
}

export function getDirectionalAccuracy(state: LearningState): {
  longWinRate: number;
  shortWinRate: number;
  longCount: number;
  shortCount: number;
} {
  const longRows = state.recentOutcomes.filter((x) => x.direction === 'LONG');
  const shortRows = state.recentOutcomes.filter((x) => x.direction === 'SHORT');
  const longWins = longRows.filter((x) => x.result === 'win').length;
  const shortWins = shortRows.filter((x) => x.result === 'win').length;
  return {
    longWinRate: longRows.length ? Math.round((longWins / longRows.length) * 100) : 0,
    shortWinRate: shortRows.length ? Math.round((shortWins / shortRows.length) * 100) : 0,
    longCount: longRows.length,
    shortCount: shortRows.length,
  };
}

export function getRecentTrend(state: LearningState): {
  recentWinRate: number;
  recentLongRate: number;
  recentShortRate: number;
  streak: number;
  streakType: 'win' | 'loss' | 'none';
} {
  const rows = state.recentOutcomes.slice(0, 12);
  if (!rows.length) {
    return { recentWinRate: 0, recentLongRate: 0, recentShortRate: 0, streak: 0, streakType: 'none' };
  }
  const wins = rows.filter((x) => x.result === 'win').length;
  const longRows = rows.filter((x) => x.direction === 'LONG');
  const shortRows = rows.filter((x) => x.direction === 'SHORT');
  const longWins = longRows.filter((x) => x.result === 'win').length;
  const shortWins = shortRows.filter((x) => x.result === 'win').length;
  let streak = 0;
  let streakType: 'win' | 'loss' | 'none' = 'none';
  for (const row of rows) {
    if (streak === 0) {
      streakType = row.result;
      streak = 1;
      continue;
    }
    if (row.result === streakType) streak += 1;
    else break;
  }
  return {
    recentWinRate: Math.round((wins / rows.length) * 100),
    recentLongRate: longRows.length ? Math.round((longWins / longRows.length) * 100) : 0,
    recentShortRate: shortRows.length ? Math.round((shortWins / shortRows.length) * 100) : 0,
    streak,
    streakType,
  };
}

export function getActiveBlacklists(state: LearningState): Array<{
  key: string;
  reason: string;
  remainMs: number;
  unlockProgress: number;
}> {
  const now = Date.now();
  return Object.entries(state.blacklist || {})
    .map(([key, v]) => ({
      key,
      reason: v.reason,
      remainMs: Math.max(0, Number(v.until || 0) - now),
      unlockProgress: Number(v.unlockProgress || 0),
    }))
    .filter((x) => x.remainMs > 0)
    .sort((a, b) => a.remainMs - b.remainMs);
}

export function getPerformanceRanking(state: LearningState): Array<{
  key: string;
  winRate: number;
  wins: number;
  losses: number;
  total: number;
}> {
  const map = new Map<string, { wins: number; losses: number }>();
  for (const row of state.recentOutcomes) {
    const key = `${row.symbol}|${row.timeframe}|${row.direction}`;
    const prev = map.get(key) || { wins: 0, losses: 0 };
    if (row.result === 'win') prev.wins += 1;
    else prev.losses += 1;
    map.set(key, prev);
  }
  return Array.from(map.entries())
    .map(([key, v]) => {
      const total = v.wins + v.losses;
      const winRate = total ? Math.round((v.wins / total) * 100) : 0;
      return { key, winRate, wins: v.wins, losses: v.losses, total };
    })
    .filter((x) => x.total >= 2)
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.total - a.total;
    });
}
