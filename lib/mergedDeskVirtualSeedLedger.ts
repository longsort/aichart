/**
 * 가상매매 시드 장부 + 신호 진입 보강용 기록.
 * 사용자가 다운로드해 에이전트에 주면 전략 보강에 사용.
 * 확정 수익·승률 아님.
 */
import type { VirtualEntrySource } from '@/lib/mergedDeskVirtualTradeSession';
import { markTapointAccumDirty } from '@/lib/tapointAccumDirty';

const LEDGER_KEY = 'ailongshort.mergedDesk.virtualSeed.ledger.v1';
export const VIRTUAL_SEED_EVENT = 'ailongshort-merged-desk-virtual-seed';
const MAX_TRADES = 1200;

/** 보강용 결과 라벨 — 승패만으로 합치지 않고 사유와 함께 저장 */
export type VirtualSeedOutcome = 'SUCCESS' | 'FAIL' | 'PARTIAL' | 'FLAT';

export type VirtualSeedTradeRecord = {
  id: string;
  at: number;
  closedAt: number;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  signalKo: string;
  source: VirtualEntrySource | string;
  analysisTags?: string[] | null;
  fourStrategyId?: string | null;
  fourSupporting?: string[] | null;
  entryScore?: number | null;
  regime?: string | null;
  entry: number;
  exit: number;
  size: number;
  marginUsdt: number;
  leverage: number;
  /** 이번 거래 손익 USDT */
  pnlUsdt: number;
  /** 증거금 대비 ROE % */
  roePct: number;
  seedBefore: number;
  seedAfter: number;
  win: boolean;
  /** 성공 / 실패 / 부분익절 / 본절 */
  outcome: VirtualSeedOutcome;
  outcomeKo: string;
  exitReason: string;
  holdingMs: number;
  /** 부분 청산 비중 */
  frac?: number;
  meta?: Record<string, string | number | boolean | null>;
};

export function classifyVirtualSeedOutcome(params: {
  pnlUsdt: number;
  exitReason: string;
  frac?: number;
}): { outcome: VirtualSeedOutcome; outcomeKo: string; win: boolean } {
  const reason = String(params.exitReason || '');
  const frac = params.frac ?? 1;
  const pnl = Number(params.pnlUsdt) || 0;
  const partial =
    frac < 0.99 ||
    /부분|TP1|반익/i.test(reason);
  if (partial && pnl > 0) {
    return { outcome: 'PARTIAL', outcomeKo: '부분성공', win: true };
  }
  if (partial && pnl < 0) {
    return { outcome: 'FAIL', outcomeKo: '부분실패', win: false };
  }
  if (Math.abs(pnl) < 0.01 || /본절|BE/i.test(reason)) {
    return { outcome: 'FLAT', outcomeKo: '본절·무승부', win: false };
  }
  if (pnl > 0) {
    return { outcome: 'SUCCESS', outcomeKo: '성공', win: true };
  }
  return { outcome: 'FAIL', outcomeKo: '실패', win: false };
}

export type VirtualSeedLedger = {
  /** 사용자가 설정한 시작 시드 */
  seedUsdt: number;
  /** 현재 시드(=누적 손익 반영) */
  equityUsdt: number;
  trades: VirtualSeedTradeRecord[];
  updatedAt: number;
};

function emptyLedger(seed = 1000): VirtualSeedLedger {
  const s = Math.max(10, Number(seed) || 1000);
  return { seedUsdt: s, equityUsdt: s, trades: [], updatedAt: Date.now() };
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readVirtualSeedLedger(): VirtualSeedLedger {
  if (typeof window === 'undefined') return emptyLedger();
  const j = safeParse<Partial<VirtualSeedLedger>>(window.localStorage.getItem(LEDGER_KEY), {});
  const seed = Math.max(10, Number(j.seedUsdt) || 1000);
  const equity = Math.max(0, Number(j.equityUsdt) || seed);
  const trades = Array.isArray(j.trades)
    ? (j.trades as VirtualSeedTradeRecord[]).map((t) => {
        if (t.outcome && t.outcomeKo) return t;
        const c = classifyVirtualSeedOutcome({
          pnlUsdt: t.pnlUsdt,
          exitReason: t.exitReason,
          frac: t.frac,
        });
        return { ...t, outcome: c.outcome, outcomeKo: c.outcomeKo, win: t.win ?? c.win };
      })
    : [];
  return {
    seedUsdt: seed,
    equityUsdt: equity,
    trades,
    updatedAt: Number(j.updatedAt) || Date.now(),
  };
}

export function writeVirtualSeedLedger(next: VirtualSeedLedger): VirtualSeedLedger {
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(VIRTUAL_SEED_EVENT));
  } catch {
    /* ignore */
  }
  markTapointAccumDirty();
  return next;
}

/** 시작 전 시드만 설정 (매매 중이면 equity도 같이 리셋할지 선택) */
export function setVirtualSeedUsdt(seedUsdt: number, resetEquity = true): VirtualSeedLedger {
  const prev = readVirtualSeedLedger();
  const s = Math.max(10, Math.min(1_000_000, Number(seedUsdt) || 1000));
  return writeVirtualSeedLedger({
    ...prev,
    seedUsdt: s,
    equityUsdt: resetEquity ? s : Math.max(0, prev.equityUsdt),
    updatedAt: Date.now(),
  });
}

/**
 * 가상시드 초기화 — 거래기록 비우고 시작시드=현재시드=입력값.
 * 사용자가 「시드초기화」칩으로 호출.
 */
export function resetVirtualSeedLedger(seedUsdt?: number): VirtualSeedLedger {
  const prev = readVirtualSeedLedger();
  const s = Math.max(
    10,
    Math.min(1_000_000, Number(seedUsdt) > 0 ? Number(seedUsdt) : prev.seedUsdt || 1000)
  );
  return writeVirtualSeedLedger({
    seedUsdt: s,
    equityUsdt: s,
    trades: [],
    updatedAt: Date.now(),
  });
}

/** 가상 1회 증거금 = 현재시드 × 5% */
export const VIRTUAL_SEED_RISK_PCT = 5;

export function virtualRiskMarginUsdt(equityUsdt: number, pct = VIRTUAL_SEED_RISK_PCT): number {
  const eq = Math.max(0, Number(equityUsdt) || 0);
  const p = Math.max(1, Math.min(100, Number(pct) || VIRTUAL_SEED_RISK_PCT));
  return Math.max(1, Math.round(((eq * p) / 100) * 100) / 100);
}

export function summarizeVirtualSeed(ledger: VirtualSeedLedger): {
  tradeCount: number;
  winCount: number;
  lossCount: number;
  totalPnl: number;
  winPnl: number;
  lossPnl: number;
  seedStart: number;
  seedNow: number;
  seedDelta: number;
} {
  let winCount = 0;
  let lossCount = 0;
  let winPnl = 0;
  let lossPnl = 0;
  for (const t of ledger.trades) {
    if (t.win) {
      winCount += 1;
      winPnl += t.pnlUsdt;
    } else {
      lossCount += 1;
      lossPnl += t.pnlUsdt;
    }
  }
  const totalPnl = ledger.equityUsdt - ledger.seedUsdt;
  return {
    tradeCount: ledger.trades.length,
    winCount,
    lossCount,
    totalPnl,
    winPnl,
    lossPnl,
    seedStart: ledger.seedUsdt,
    seedNow: ledger.equityUsdt,
    seedDelta: totalPnl,
  };
}

export function applyVirtualSeedTradeClose(params: {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  signalKo: string;
  source: string;
  entry: number;
  exit: number;
  size: number;
  marginUsdt: number;
  leverage: number;
  openedAt: number;
  exitReason: string;
  fourStrategyId?: string | null;
  fourSupporting?: string[] | null;
  entryScore?: number | null;
  regime?: string | null;
  analysisTags?: string[] | null;
  meta?: Record<string, string | number | boolean | null>;
  /** 부분 청산 비중 0~1 */
  frac?: number;
}): VirtualSeedLedger {
  const prev = readVirtualSeedLedger();
  const frac = Math.max(0.01, Math.min(1, params.frac ?? 1));
  const size = params.size * frac;
  const diff =
    params.direction === 'LONG' ? params.exit - params.entry : params.entry - params.exit;
  const pnlUsdt = diff * size;
  const margin = Math.max(0.01, params.marginUsdt * frac);
  const roePct = (pnlUsdt / margin) * 100;
  const seedBefore = prev.equityUsdt;
  const seedAfter = Math.max(0, seedBefore + pnlUsdt);
  const classified = classifyVirtualSeedOutcome({
    pnlUsdt,
    exitReason: params.exitReason,
    frac,
  });
  const row: VirtualSeedTradeRecord = {
    id: `vs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: params.openedAt || Date.now(),
    closedAt: Date.now(),
    symbol: String(params.symbol || '').toUpperCase(),
    timeframe: params.timeframe,
    direction: params.direction,
    signalKo: params.signalKo || params.source,
    source: params.source,
    analysisTags: params.analysisTags ?? null,
    fourStrategyId: params.fourStrategyId ?? null,
    fourSupporting: params.fourSupporting ?? null,
    entryScore: params.entryScore ?? null,
    regime: params.regime ?? null,
    entry: params.entry,
    exit: params.exit,
    size,
    marginUsdt: margin,
    leverage: params.leverage,
    pnlUsdt,
    roePct,
    seedBefore,
    seedAfter,
    win: classified.win,
    outcome: classified.outcome,
    outcomeKo: classified.outcomeKo,
    exitReason: params.exitReason,
    holdingMs: Math.max(0, Date.now() - (params.openedAt || Date.now())),
    frac,
    meta: {
      ...(params.meta || {}),
      outcome: classified.outcome,
      outcomeKo: classified.outcomeKo,
      reinforce: true,
    },
  };
  return writeVirtualSeedLedger({
    seedUsdt: prev.seedUsdt,
    equityUsdt: seedAfter,
    trades: [row, ...prev.trades].slice(0, MAX_TRADES),
    updatedAt: Date.now(),
  });
}

/** 실시간 보강 보드 — 실패 많은 분석/신호 우선 표시 */
export type ReinforceBoardRow = {
  key: string;
  labelKo: string;
  kind: 'signal' | 'tag' | 'strategy';
  count: number;
  wins: number;
  losses: number;
  netPnl: number;
  failRate: number;
  avgRoePct: number;
  needReinforce: boolean;
  statusKo: string;
};

export function buildLiveReinforceBoard(minTrades = 3): {
  rows: ReinforceBoardRow[];
  urgentKo: string[];
  summaryKo: string;
} {
  const ledger = readVirtualSeedLedger();
  const byKey = new Map<
    string,
    { label: string; kind: ReinforceBoardRow['kind']; count: number; wins: number; losses: number; netPnl: number; sumRoe: number }
  >();

  const bump = (key: string, label: string, kind: ReinforceBoardRow['kind'], t: VirtualSeedTradeRecord) => {
    const cur = byKey.get(key) || { label, kind, count: 0, wins: 0, losses: 0, netPnl: 0, sumRoe: 0 };
    cur.count += 1;
    cur.netPnl += t.pnlUsdt;
    cur.sumRoe += t.roePct;
    if (t.win) cur.wins += 1;
    else cur.losses += 1;
    byKey.set(key, cur);
  };

  for (const t of ledger.trades) {
    bump(`sig:${t.signalKo}`, t.signalKo, 'signal', t);
    bump(`src:${t.source}`, String(t.source), 'signal', t);
    if (t.fourStrategyId) bump(`st:${t.fourStrategyId}`, t.fourStrategyId, 'strategy', t);
    for (const tag of t.analysisTags || []) {
      bump(`tag:${tag}`, tag, 'tag', t);
    }
  }

  const rows: ReinforceBoardRow[] = [...byKey.entries()].map(([key, v]) => {
    const failRate = v.count > 0 ? v.losses / v.count : 0;
    const need =
      v.count >= minTrades && (failRate >= 0.55 || v.netPnl < 0);
    return {
      key,
      labelKo: v.label,
      kind: v.kind,
      count: v.count,
      wins: v.wins,
      losses: v.losses,
      netPnl: v.netPnl,
      failRate,
      avgRoePct: v.count > 0 ? v.sumRoe / v.count : 0,
      needReinforce: need,
      statusKo: need ? '보강필요' : v.netPnl > 0 ? '양호' : v.count < minTrades ? '표본부족' : '관찰',
    };
  });

  rows.sort((a, b) => {
    if (a.needReinforce !== b.needReinforce) return a.needReinforce ? -1 : 1;
    return b.failRate - a.failRate || a.netPnl - b.netPnl;
  });

  const urgent = rows.filter((r) => r.needReinforce).slice(0, 8);
  return {
    rows: rows.slice(0, 40),
    urgentKo: urgent.map(
      (r) =>
        `${r.labelKo} · 패${r.losses}/${r.count} · ${fmtBoardPnl(r.netPnl)} · ${r.statusKo}`
    ),
    summaryKo:
      urgent.length > 0
        ? `보강우선 ${urgent.length}건 · 실패 많은 분석부터 손보기`
        : ledger.trades.length
          ? `거래 ${ledger.trades.length}건 · 긴급보강 없음 (표본·손익 관찰중)`
          : '아직 가상 체결 없음 · 시드 설정 후 시작',
  };
}

function fmtBoardPnl(n: number): string {
  const s = n > 0 ? '+' : '';
  return `${s}${n.toFixed(2)}U`;
}

/**
 * 보강용 다운로드 팩 — 신호·시드·성과.
 * 파일명을 사용자에게 주고 에이전트에 첨부하면 전략 보강.
 */
export type ReinforcementExportPack = {
  version: 2;
  exportedAt: number;
  purposeKo: string;
  ledger: VirtualSeedLedger;
  summary: ReturnType<typeof summarizeVirtualSeed> & {
    successCount: number;
    failCount: number;
    partialCount: number;
    flatCount: number;
  };
  /** 신호별 집계 */
  bySignal: Array<{
    signalKo: string;
    count: number;
    wins: number;
    losses: number;
    successCount: number;
    failCount: number;
    netPnl: number;
    avgRoePct: number;
  }>;
  /** 4전략별 집계 */
  byFourStrategy: Array<{
    strategyId: string;
    count: number;
    wins: number;
    fails: number;
    netPnl: number;
  }>;
  /** 성공만 · 실패만 · 부분 — 보강용 분리 */
  successTrades: VirtualSeedTradeRecord[];
  failTrades: VirtualSeedTradeRecord[];
  partialTrades: VirtualSeedTradeRecord[];
  allTrades: VirtualSeedTradeRecord[];
  recentTrades: VirtualSeedTradeRecord[];
  liveReinforce?: ReturnType<typeof buildLiveReinforceBoard>;
};

export function buildReinforcementExportPack(): ReinforcementExportPack {
  const ledger = readVirtualSeedLedger();
  const base = summarizeVirtualSeed(ledger);
  let successCount = 0;
  let failCount = 0;
  let partialCount = 0;
  let flatCount = 0;
  const bySignalMap = new Map<
    string,
    {
      count: number;
      wins: number;
      losses: number;
      successCount: number;
      failCount: number;
      netPnl: number;
      sumRoe: number;
    }
  >();
  const byFour = new Map<string, { count: number; wins: number; fails: number; netPnl: number }>();
  for (const t of ledger.trades) {
    if (t.outcome === 'SUCCESS') successCount += 1;
    else if (t.outcome === 'FAIL') failCount += 1;
    else if (t.outcome === 'PARTIAL') partialCount += 1;
    else flatCount += 1;
    const sk = t.signalKo || t.source || '미상';
    const s = bySignalMap.get(sk) || {
      count: 0,
      wins: 0,
      losses: 0,
      successCount: 0,
      failCount: 0,
      netPnl: 0,
      sumRoe: 0,
    };
    s.count += 1;
    s.netPnl += t.pnlUsdt;
    s.sumRoe += t.roePct;
    if (t.win) s.wins += 1;
    else s.losses += 1;
    if (t.outcome === 'SUCCESS' || t.outcome === 'PARTIAL') s.successCount += 1;
    if (t.outcome === 'FAIL') s.failCount += 1;
    bySignalMap.set(sk, s);
    if (t.fourStrategyId) {
      const f = byFour.get(t.fourStrategyId) || { count: 0, wins: 0, fails: 0, netPnl: 0 };
      f.count += 1;
      f.netPnl += t.pnlUsdt;
      if (t.win) f.wins += 1;
      if (t.outcome === 'FAIL') f.fails += 1;
      byFour.set(t.fourStrategyId, f);
    }
  }
  const successTrades = ledger.trades.filter((t) => t.outcome === 'SUCCESS' || t.outcome === 'PARTIAL');
  const failTrades = ledger.trades.filter((t) => t.outcome === 'FAIL');
  const partialTrades = ledger.trades.filter((t) => t.outcome === 'PARTIAL');
  return {
    version: 2,
    exportedAt: Date.now(),
    purposeKo:
      '독수리1호 가상매매 보강용(성공·실패 전부). 에이전트에게 첨부하면 신호·전략·실패패턴을 보고 진입/필터를 보강한다. 확정 수익 아님.',
    ledger,
    summary: { ...base, successCount, failCount, partialCount, flatCount },
    bySignal: [...bySignalMap.entries()].map(([signalKo, v]) => ({
      signalKo,
      count: v.count,
      wins: v.wins,
      losses: v.losses,
      successCount: v.successCount,
      failCount: v.failCount,
      netPnl: v.netPnl,
      avgRoePct: v.count > 0 ? v.sumRoe / v.count : 0,
    })),
    byFourStrategy: [...byFour.entries()].map(([strategyId, v]) => ({
      strategyId,
      count: v.count,
      wins: v.wins,
      fails: v.fails,
      netPnl: v.netPnl,
    })),
    successTrades,
    failTrades,
    partialTrades,
    allTrades: ledger.trades,
    recentTrades: ledger.trades.slice(0, 200),
    liveReinforce: buildLiveReinforceBoard(3),
  };
}

export function downloadReinforcementPack(filenameHint?: string): void {
  if (typeof window === 'undefined') return;
  const pack = buildReinforcementExportPack();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name =
    filenameHint || `doksuri1-virtual-reinforce-${day}.json`;
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
