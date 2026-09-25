/**
 * MTF 통계 히스토리 저장·결과 평가·누적 대시보드.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import fs from 'fs';
import path from 'path';
import type { MtfStatTier, UnifiedMtfAnalysisStatistics } from '@/lib/unifiedMtfAnalysisStatistics';

const DATA_DIR = path.join(process.cwd(), 'data', 'mtf-statistics-history');
const memoryFallback = new Map<string, MtfStatisticsHistoryRecord[]>();

export type MtfStatisticsOutcomeStatus = 'OPEN' | 'TP1' | 'TP2' | 'TP3' | 'SL' | 'NEUTRAL';

export type MtfStatisticsHistoryRecord = {
  id: string;
  symbol: string;
  chartTf: string;
  at: number;
  priceAtSnapshot: number;
  statisticalVerdict: 'LONG' | 'SHORT' | 'NEUTRAL';
  weightedLongPct: number;
  weightedShortPct: number;
  confidence: number;
  longVotes: number;
  shortVotes: number;
  liveTfCount: number;
  activeSide: 'LONG' | 'SHORT' | 'NEUTRAL';
  strike: {
    entry: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
  } | null;
  tierVerdicts: Partial<Record<MtfStatTier, 'LONG' | 'SHORT' | 'NEUTRAL'>>;
  headlineKo: string;
  outcome: {
    status: MtfStatisticsOutcomeStatus;
    evaluatedAt: number;
    exitPrice: number;
    returnPct: number;
  };
};

export type MtfStatisticsTierAggregate = {
  tier: MtfStatTier;
  labelKo: string;
  total: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number;
  longCalls: number;
  longWins: number;
  shortCalls: number;
  shortWins: number;
};

export type MtfStatisticsHistoryDashboard = {
  totalRecords: number;
  closedCount: number;
  openCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  lossRate: number;
  longCallWinRate: number;
  shortCallWinRate: number;
  longCalls: number;
  shortCalls: number;
  tp1Count: number;
  tp2Count: number;
  tp3Count: number;
  slCount: number;
  avgReturnPct: number;
  tierStats: MtfStatisticsTierAggregate[];
  recent: MtfStatisticsHistoryRecord[];
  cumulativeSeries: Array<{ at: number; winRate: number; samples: number }>;
  headlineKo: string;
  summaryKo: string;
};

const TIER_LABEL: Record<MtfStatTier, string> = {
  minute: '분봉',
  hour: '시간',
  day: '일봉',
  week: '주봉',
  month: '월봉',
};

function safeKey(clientId: string): string {
  return clientId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

function ensureDir(): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function filePath(clientId: string): string {
  return path.join(DATA_DIR, `${safeKey(clientId)}.json`);
}

export function readMtfStatisticsHistory(clientId: string): MtfStatisticsHistoryRecord[] {
  const mem = memoryFallback.get(safeKey(clientId));
  if (mem) return mem;
  try {
    const p = filePath(clientId);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf-8');
    const arr = JSON.parse(raw) as MtfStatisticsHistoryRecord[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeMtfStatisticsHistory(clientId: string, records: MtfStatisticsHistoryRecord[]): boolean {
  const trimmed = records.slice(-800);
  try {
    if (!ensureDir()) throw new Error('no dir');
    fs.writeFileSync(filePath(clientId), JSON.stringify(trimmed, null, 2), 'utf-8');
    memoryFallback.set(safeKey(clientId), trimmed);
    return true;
  } catch {
    memoryFallback.set(safeKey(clientId), trimmed);
    return false;
  }
}

export function recordFromStatistics(
  stats: UnifiedMtfAnalysisStatistics,
  priceAtSnapshot: number
): MtfStatisticsHistoryRecord {
  const strike = stats.activeStrike ?? stats.longStrike ?? stats.shortStrike;
  const side = stats.statisticalVerdict;
  const tierVerdicts: Partial<Record<MtfStatTier, 'LONG' | 'SHORT' | 'NEUTRAL'>> = {};
  for (const t of stats.tiers) {
    tierVerdicts[t.tier] = t.dominantDirection;
  }

  return {
    id: `${stats.symbol}_${stats.chartTf}_${Date.now()}`,
    symbol: stats.symbol,
    chartTf: stats.chartTf,
    at: Date.now(),
    priceAtSnapshot,
    statisticalVerdict: stats.statisticalVerdict,
    weightedLongPct: stats.weightedLongPct,
    weightedShortPct: stats.weightedShortPct,
    confidence: stats.confidence,
    longVotes: stats.longVotes,
    shortVotes: stats.shortVotes,
    liveTfCount: stats.liveTfCount,
    activeSide: side,
    strike: strike
      ? { entry: strike.entry, sl: strike.sl, tp1: strike.tp1, tp2: strike.tp2, tp3: strike.tp3 }
      : null,
    tierVerdicts,
    headlineKo: stats.headlineKo,
    outcome: {
      status: side === 'NEUTRAL' ? 'NEUTRAL' : 'OPEN',
      evaluatedAt: Date.now(),
      exitPrice: priceAtSnapshot,
      returnPct: 0,
    },
  };
}

function evaluateOutcome(
  rec: MtfStatisticsHistoryRecord,
  currentPrice: number
): MtfStatisticsHistoryRecord['outcome'] {
  if (rec.statisticalVerdict === 'NEUTRAL' || !rec.strike) {
    return {
      status: 'NEUTRAL',
      evaluatedAt: Date.now(),
      exitPrice: currentPrice,
      returnPct: 0,
    };
  }

  const { entry, sl, tp1, tp2, tp3 } = rec.strike;
  const isLong = rec.statisticalVerdict === 'LONG';

  if (isLong) {
    if (currentPrice <= sl) {
      return {
        status: 'SL',
        evaluatedAt: Date.now(),
        exitPrice: currentPrice,
        returnPct: ((currentPrice - entry) / entry) * 100,
      };
    }
    if (currentPrice >= tp3) {
      return {
        status: 'TP3',
        evaluatedAt: Date.now(),
        exitPrice: currentPrice,
        returnPct: ((currentPrice - entry) / entry) * 100,
      };
    }
    if (currentPrice >= tp2) {
      return {
        status: 'TP2',
        evaluatedAt: Date.now(),
        exitPrice: currentPrice,
        returnPct: ((currentPrice - entry) / entry) * 100,
      };
    }
    if (currentPrice >= tp1) {
      return {
        status: 'TP1',
        evaluatedAt: Date.now(),
        exitPrice: currentPrice,
        returnPct: ((currentPrice - entry) / entry) * 100,
      };
    }
    return {
      status: 'OPEN',
      evaluatedAt: Date.now(),
      exitPrice: currentPrice,
      returnPct: ((currentPrice - entry) / entry) * 100,
    };
  }

  if (currentPrice >= sl) {
    return {
      status: 'SL',
      evaluatedAt: Date.now(),
      exitPrice: currentPrice,
      returnPct: ((entry - currentPrice) / entry) * 100,
    };
  }
  if (currentPrice <= tp3) {
    return { status: 'TP3', evaluatedAt: Date.now(), exitPrice: currentPrice, returnPct: ((entry - currentPrice) / entry) * 100 };
  }
  if (currentPrice <= tp2) {
    return { status: 'TP2', evaluatedAt: Date.now(), exitPrice: currentPrice, returnPct: ((entry - currentPrice) / entry) * 100 };
  }
  if (currentPrice <= tp1) {
    return { status: 'TP1', evaluatedAt: Date.now(), exitPrice: currentPrice, returnPct: ((entry - currentPrice) / entry) * 100 };
  }
  return {
    status: 'OPEN',
    evaluatedAt: Date.now(),
    exitPrice: currentPrice,
    returnPct: ((entry - currentPrice) / entry) * 100,
  };
}

function isWin(status: MtfStatisticsOutcomeStatus): boolean {
  return status === 'TP1' || status === 'TP2' || status === 'TP3';
}

function isLoss(status: MtfStatisticsOutcomeStatus): boolean {
  return status === 'SL';
}

function isClosed(status: MtfStatisticsOutcomeStatus): boolean {
  return isWin(status) || isLoss(status) || status === 'NEUTRAL';
}

export function evaluateMtfStatisticsHistory(
  records: MtfStatisticsHistoryRecord[],
  currentPrice: number | null,
  symbol?: string,
  chartTf?: string
): MtfStatisticsHistoryRecord[] {
  if (!currentPrice || !Number.isFinite(currentPrice)) return records;
  return records.map((rec) => {
    if (symbol && rec.symbol.toUpperCase() !== symbol.toUpperCase()) return rec;
    if (chartTf && rec.chartTf !== chartTf) return rec;
    if (rec.outcome.status !== 'OPEN') return rec;
    return { ...rec, outcome: evaluateOutcome(rec, currentPrice) };
  });
}

export function appendMtfStatisticsSnapshot(
  clientId: string,
  stats: UnifiedMtfAnalysisStatistics,
  currentPrice: number
): { appended: boolean; record: MtfStatisticsHistoryRecord | null } {
  if (stats.statisticalVerdict === 'NEUTRAL' && stats.liveTfCount < 3) {
    return { appended: false, record: null };
  }

  const list = readMtfStatisticsHistory(clientId);
  const last = [...list]
    .reverse()
    .find((r) => r.symbol === stats.symbol && r.chartTf === stats.chartTf);

  const dedupeMs = 3 * 60_000;
  if (
    last &&
    Date.now() - last.at < dedupeMs &&
    last.statisticalVerdict === stats.statisticalVerdict &&
    Math.abs(last.weightedLongPct - stats.weightedLongPct) < 3
  ) {
    return { appended: false, record: last };
  }

  const record = recordFromStatistics(stats, currentPrice);
  list.push(record);
  writeMtfStatisticsHistory(clientId, list);
  return { appended: true, record };
}

export function buildMtfStatisticsHistoryDashboard(
  records: MtfStatisticsHistoryRecord[],
  symbol?: string,
  chartTf?: string
): MtfStatisticsHistoryDashboard {
  let filtered = records;
  if (symbol) filtered = filtered.filter((r) => r.symbol.toUpperCase() === symbol.toUpperCase());
  if (chartTf) filtered = filtered.filter((r) => r.chartTf === chartTf);

  const closed = filtered.filter((r) => isClosed(r.outcome.status) && r.outcome.status !== 'NEUTRAL');
  const wins = closed.filter((r) => isWin(r.outcome.status));
  const losses = closed.filter((r) => isLoss(r.outcome.status));
  const open = filtered.filter((r) => r.outcome.status === 'OPEN');

  const winRate = closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : 0;
  const lossRate = closed.length ? Math.round((losses.length / closed.length) * 1000) / 10 : 0;

  const longCalls = filtered.filter((r) => r.statisticalVerdict === 'LONG');
  const shortCalls = filtered.filter((r) => r.statisticalVerdict === 'SHORT');
  const longWins = longCalls.filter((r) => isWin(r.outcome.status));
  const shortWins = shortCalls.filter((r) => isWin(r.outcome.status));
  const longClosed = longCalls.filter((r) => isWin(r.outcome.status) || isLoss(r.outcome.status));
  const shortClosed = shortCalls.filter((r) => isWin(r.outcome.status) || isLoss(r.outcome.status));

  const longCallWinRate = longClosed.length
    ? Math.round((longWins.length / longClosed.length) * 1000) / 10
    : 0;
  const shortCallWinRate = shortClosed.length
    ? Math.round((shortWins.length / shortClosed.length) * 1000) / 10
    : 0;

  const avgReturnPct =
    closed.length > 0
      ? Math.round((closed.reduce((s, r) => s + r.outcome.returnPct, 0) / closed.length) * 100) / 100
      : 0;

  const tierStats: MtfStatisticsTierAggregate[] = (
    ['minute', 'hour', 'day', 'week', 'month'] as MtfStatTier[]
  ).map((tier) => {
    const tierRecords = filtered.filter((r) => r.tierVerdicts[tier]);
    const tierClosed = tierRecords.filter(
      (r) =>
        r.tierVerdicts[tier] === r.statisticalVerdict &&
        (isWin(r.outcome.status) || isLoss(r.outcome.status))
    );
    const tierWins = tierClosed.filter((r) => isWin(r.outcome.status));
    const tierLosses = tierClosed.filter((r) => isLoss(r.outcome.status));
    const tierOpen = tierRecords.filter((r) => r.outcome.status === 'OPEN');
    const longT = tierRecords.filter((r) => r.tierVerdicts[tier] === 'LONG');
    const shortT = tierRecords.filter((r) => r.tierVerdicts[tier] === 'SHORT');

    return {
      tier,
      labelKo: TIER_LABEL[tier],
      total: tierRecords.length,
      wins: tierWins.length,
      losses: tierLosses.length,
      open: tierOpen.length,
      winRate: tierClosed.length ? Math.round((tierWins.length / tierClosed.length) * 1000) / 10 : 0,
      longCalls: longT.length,
      longWins: longT.filter((r) => isWin(r.outcome.status)).length,
      shortCalls: shortT.length,
      shortWins: shortT.filter((r) => isWin(r.outcome.status)).length,
    };
  });

  const cumulativeSeries: MtfStatisticsHistoryDashboard['cumulativeSeries'] = [];
  const sorted = [...filtered].sort((a, b) => a.at - b.at);
  let w = 0;
  let c = 0;
  for (const rec of sorted) {
    if (!isWin(rec.outcome.status) && !isLoss(rec.outcome.status)) continue;
    c++;
    if (isWin(rec.outcome.status)) w++;
    if (c % 3 === 0 || c === sorted.filter((r) => isWin(r.outcome.status) || isLoss(r.outcome.status)).length) {
      cumulativeSeries.push({
        at: rec.at,
        winRate: Math.round((w / c) * 1000) / 10,
        samples: c,
      });
    }
  }

  const recent = [...filtered].sort((a, b) => b.at - a.at).slice(0, 15);

  const headlineKo =
    closed.length > 0
      ? `누적 승률 ${winRate}% · ${wins.length}W/${losses.length}L · 표본 ${closed.length}건`
      : `히스토리 ${filtered.length}건 · 종료 대기 ${open.length}건`;

  const summaryKo = [
    headlineKo,
    longCalls.length ? `롱 적중 ${longCallWinRate}% (${longWins.length}/${longClosed.length || longCalls.length})` : null,
    shortCalls.length ? `숏 적중 ${shortCallWinRate}% (${shortWins.length}/${shortClosed.length || shortCalls.length})` : null,
    avgReturnPct ? `평균 수익률 ${avgReturnPct > 0 ? '+' : ''}${avgReturnPct}%` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    totalRecords: filtered.length,
    closedCount: closed.length,
    openCount: open.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate,
    lossRate,
    longCallWinRate,
    shortCallWinRate,
    longCalls: longCalls.length,
    shortCalls: shortCalls.length,
    tp1Count: filtered.filter((r) => r.outcome.status === 'TP1').length,
    tp2Count: filtered.filter((r) => r.outcome.status === 'TP2').length,
    tp3Count: filtered.filter((r) => r.outcome.status === 'TP3').length,
    slCount: filtered.filter((r) => r.outcome.status === 'SL').length,
    avgReturnPct,
    tierStats,
    recent,
    cumulativeSeries,
    headlineKo,
    summaryKo,
  };
}

export function persistEvaluatedRecords(
  clientId: string,
  evaluated: MtfStatisticsHistoryRecord[]
): void {
  writeMtfStatisticsHistory(clientId, evaluated);
}
