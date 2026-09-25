/**
 * 신호 성적부 — 매매 생명주기(진입→청산) + 신호별 유지/관찰/보강.
 * 목표: 잘 맞는 신호 유지 · 손절 많은 신호 보강 큐 · 표본 부족 시 자동 차단 안 함.
 * 확정 승률·수익 아님.
 */
import { listSymbolLossGuards } from '@/lib/mergedDeskSymbolLossGuard';
import { markTapointAccumDirty } from '@/lib/tapointAccumDirty';

const STORE_KEY = 'ailongshort.mergedDesk.signalScorecard.v1';
export const SIGNAL_SCORECARD_EVENT = 'ailongshort-merged-desk-signal-scorecard';

const MAX_CLOSED = 800;
const MIN_SAMPLE_KEEP = 5;
/** 손절 많으면 비중만 먼저 축소 */
const MIN_SAMPLE_SIZE_HALVE = 5;
/** 그다음 일시 대기 */
const MIN_SAMPLE_SOFT_SKIP = 8;
/** 신규·표본 부족 신호는 첫 N회 반사이즈 */
export const NEW_SIGNAL_HALF_SAMPLE = 3;
export const NEW_SIGNAL_SIZE_MULT = 0.5;

export type ScoreMode = 'virtual' | 'live';

export type ScoreVerdict = 'keep' | 'observe' | 'reinforce';

export type ScoreOpenTrade = {
  tradeId: string;
  signalKey: string;
  signalKo: string;
  source: string;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number | null;
  tp: number | null;
  openedAt: number;
  mode: ScoreMode;
  analysisTags?: string[] | null;
  fourStrategyId?: string | null;
  /** 기초자산 수량 (손익 환산) */
  size?: number | null;
  /** 증거금 USDT */
  marginUsdt?: number | null;
  leverage?: number | null;
};

export type ScoreClosedTrade = ScoreOpenTrade & {
  closedAt: number;
  exit: number;
  exitReason: string;
  pnlUsdt: number;
  roePct: number;
  win: boolean;
  holdingMs: number;
};

export type SignalScoreRow = {
  signalKey: string;
  signalKo: string;
  count: number;
  wins: number;
  losses: number;
  slExits: number;
  tpExits: number;
  netPnl: number;
  avgRoePct: number;
  failRate: number;
  slRate: number;
  verdict: ScoreVerdict;
  verdictKo: string;
  softSkip: boolean;
  /** 다음 진입 비중 배수 (보강 중이면 0.5) */
  sizeMult: number;
  /** 유지/보강 이유 (한국어) */
  whyKo: string;
  /** 다음에 손볼 액션 */
  actionKo: string;
};

export type SignalScorecardStore = {
  open: ScoreOpenTrade[];
  closed: ScoreClosedTrade[];
  updatedAt: number;
};

function empty(): SignalScorecardStore {
  return { open: [], closed: [], updatedAt: 0 };
}

function emit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(SIGNAL_SCORECARD_EVENT));
  } catch {
    /* ignore */
  }
}

export function makeSignalKey(params: {
  source?: string | null;
  signalKo?: string | null;
  timeframe?: string | null;
  fourStrategyId?: string | null;
  analysisTags?: string[] | null;
}): string {
  const src = String(params.source || 'signal').toLowerCase();
  const ko = String(params.signalKo || src)
    .replace(/\s+/g, '')
    .slice(0, 40);
  const tf = String(params.timeframe || '').toLowerCase() || 'na';
  const st = params.fourStrategyId ? String(params.fourStrategyId) : '';
  const tag0 = params.analysisTags?.[0] ? String(params.analysisTags[0]) : '';
  return [src, ko, tf, st, tag0].filter(Boolean).join('|');
}

/**
 * 진입·청산가로 USDT 손익 추정.
 * size 우선 · 없으면 margin×lev/entry 로 수량 복원.
 */
export function estimateScorePnlUsdt(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  size?: number | null;
  marginUsdt?: number | null;
  leverage?: number | null;
}): number {
  const entry = Number(params.entry);
  const exit = Number(params.exit);
  if (!(entry > 0) || !(exit > 0)) return 0;
  const diff = params.direction === 'LONG' ? exit - entry : entry - exit;
  const sz = Number(params.size);
  if (sz > 0) return diff * sz;
  const margin = Number(params.marginUsdt);
  const lev = Math.max(1, Number(params.leverage) || 10);
  if (margin > 0) return (diff / entry) * margin * lev;
  /** 최후: 가격차만 (부호·승패용, USDT 스케일 약함) */
  return diff;
}

/** 기존 pnl=0 청산건을 entry/exit로 보정 (한 번 호출) */
export function repairZeroPnlClosedTrades(opts?: {
  defaultLeverage?: number;
  defaultMarginUsdt?: number;
}): number {
  const prev = readSignalScorecard();
  const levDef = Math.max(1, opts?.defaultLeverage || 30);
  const marginDef = Math.max(0.5, opts?.defaultMarginUsdt || 8);
  let n = 0;
  const closed = prev.closed.map((t) => {
    if (Math.abs(Number(t.pnlUsdt) || 0) > 0.0001) return t;
    if (!(t.entry > 0) || !(t.exit > 0)) return t;
    const size = Number((t as ScoreOpenTrade).size);
    const margin = Number((t as ScoreOpenTrade).marginUsdt) || marginDef;
    const lev = Number((t as ScoreOpenTrade).leverage) || levDef;
    const pnl = estimateScorePnlUsdt({
      direction: t.direction,
      entry: t.entry,
      exit: t.exit,
      size: size > 0 ? size : null,
      marginUsdt: margin,
      leverage: lev,
    });
    if (!(Math.abs(pnl) > 0.0001)) return t;
    n += 1;
    const roe = (pnl / Math.max(0.01, margin)) * 100;
    const isSl = /손절|SL|stop|잠금/i.test(t.exitReason);
    const isTp = /익절|TP|러너/i.test(t.exitReason);
    return {
      ...t,
      pnlUsdt: pnl,
      roePct: roe,
      win: isTp ? pnl >= -0.01 : isSl ? false : pnl > 0.01,
      marginUsdt: (t as ScoreOpenTrade).marginUsdt ?? margin,
      leverage: (t as ScoreOpenTrade).leverage ?? lev,
    };
  });
  if (n > 0) writeStore({ ...prev, closed });
  return n;
}

export function readSignalScorecard(): SignalScorecardStore {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return empty();
    const j = JSON.parse(raw) as Partial<SignalScorecardStore>;
    return {
      open: Array.isArray(j.open) ? (j.open as ScoreOpenTrade[]) : [],
      closed: Array.isArray(j.closed) ? (j.closed as ScoreClosedTrade[]) : [],
      updatedAt: Number(j.updatedAt) || 0,
    };
  } catch {
    return empty();
  }
}

function writeStore(next: SignalScorecardStore): SignalScorecardStore {
  const out = { ...next, updatedAt: Date.now() };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(out));
    } catch {
      /* ignore */
    }
  }
  emit();
  markTapointAccumDirty();
  return out;
}

export function openSignalScoreTrade(params: {
  tradeId?: string;
  signalKo: string;
  source: string;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl?: number | null;
  tp?: number | null;
  mode: ScoreMode;
  analysisTags?: string[] | null;
  fourStrategyId?: string | null;
  size?: number | null;
  marginUsdt?: number | null;
  leverage?: number | null;
}): ScoreOpenTrade {
  const prev = readSignalScorecard();
  const signalKey = makeSignalKey(params);
  const tradeId =
    params.tradeId ||
    `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const row: ScoreOpenTrade = {
    tradeId,
    signalKey,
    signalKo: params.signalKo || params.source,
    source: params.source,
    symbol: String(params.symbol || '').toUpperCase(),
    timeframe: params.timeframe,
    direction: params.direction,
    entry: params.entry,
    sl: params.sl != null && params.sl > 0 ? params.sl : null,
    tp: params.tp != null && params.tp > 0 ? params.tp : null,
    openedAt: Date.now(),
    mode: params.mode,
    analysisTags: params.analysisTags ?? null,
    fourStrategyId: params.fourStrategyId ?? null,
    size: params.size != null && Number(params.size) > 0 ? Number(params.size) : null,
    marginUsdt:
      params.marginUsdt != null && Number(params.marginUsdt) > 0
        ? Number(params.marginUsdt)
        : null,
    leverage:
      params.leverage != null && Number(params.leverage) > 0
        ? Number(params.leverage)
        : null,
  };
  const open = [row, ...prev.open.filter((o) => o.tradeId !== tradeId)].slice(0, 40);
  writeStore({ ...prev, open });
  return row;
}

export function closeSignalScoreTrade(params: {
  tradeId?: string | null;
  symbol?: string | null;
  exit: number;
  exitReason: string;
  pnlUsdt: number;
  roePct?: number;
  marginUsdt?: number;
}): ScoreClosedTrade | null {
  const prev = readSignalScorecard();
  const sym = params.symbol ? String(params.symbol).toUpperCase() : '';
  let idx = -1;
  if (params.tradeId) {
    idx = prev.open.findIndex((o) => o.tradeId === params.tradeId);
  }
  if (idx < 0 && sym) {
    idx = prev.open.findIndex((o) => o.symbol === sym);
  }
  if (idx < 0) return null;
  const openRow = prev.open[idx]!;
  let pnl = Number(params.pnlUsdt);
  if (!Number.isFinite(pnl)) pnl = 0;
  if (!(Math.abs(pnl) > 0.0001) && openRow.entry > 0 && params.exit > 0) {
    pnl = estimateScorePnlUsdt({
      direction: openRow.direction,
      entry: openRow.entry,
      exit: params.exit,
      size: openRow.size,
      marginUsdt: params.marginUsdt ?? openRow.marginUsdt,
      leverage: openRow.leverage,
    });
  }
  const margin = Math.max(
    0.01,
    Number(params.marginUsdt) ||
      Number(openRow.marginUsdt) ||
      openRow.entry * 0.01
  );
  const roe =
    params.roePct != null && Number.isFinite(params.roePct)
      ? Number(params.roePct)
      : (pnl / margin) * 100;
  const reason = String(params.exitReason || '');
  const isSl = /손절|SL|stop|잠금/i.test(reason);
  const isTp = /익절|TP|러너/i.test(reason);
  const closed: ScoreClosedTrade = {
    ...openRow,
    closedAt: Date.now(),
    exit: params.exit,
    exitReason: reason,
    pnlUsdt: pnl,
    roePct: roe,
    win: isTp ? pnl >= -0.01 : isSl ? false : pnl > 0.01,
    holdingMs: Math.max(0, Date.now() - openRow.openedAt),
  };
  const open = prev.open.filter((_, i) => i !== idx);
  const closedList = [closed, ...prev.closed].slice(0, MAX_CLOSED);
  writeStore({ open, closed: closedList, updatedAt: Date.now() });
  return closed;
}

/**
 * 거래소에서 이미 사라진 실전 오픈성적 → 청산 기록으로 마감.
 * (거래소 SL/TP/수동청산으로 앱이 못 본 경우)
 */
export function reconcileLiveScoreOpens(params: {
  /** 현재 실포지션 있는 심볼 대문자 집합 */
  liveSymbols: Set<string>;
  /** 심볼별 마지막 마크가 (있으면) */
  lastMarkBySymbol?: Record<string, number>;
  /** 심볼별 미실현손익 (있으면) */
  lastPnlBySymbol?: Record<string, number>;
}): ScoreClosedTrade[] {
  const prev = readSignalScorecard();
  const out: ScoreClosedTrade[] = [];
  for (const o of prev.open) {
    if (o.mode !== 'live') continue;
    const sym = String(o.symbol || '').toUpperCase();
    if (!sym || params.liveSymbols.has(sym)) continue;
    const mark = params.lastMarkBySymbol?.[sym];
    const exit = mark != null && mark > 0 ? mark : o.entry;
    let pnl =
      params.lastPnlBySymbol?.[sym] != null && Number.isFinite(params.lastPnlBySymbol[sym]!)
        ? Number(params.lastPnlBySymbol[sym])
        : 0;
    if (!(Math.abs(pnl) > 0.0001)) {
      pnl = estimateScorePnlUsdt({
        direction: o.direction,
        entry: o.entry,
        exit,
        size: o.size,
        marginUsdt: o.marginUsdt,
        leverage: o.leverage,
      });
    }
    /** SL/TP 근처로 사유 추정 */
    let reason = '거래소청산';
    if (o.sl != null && o.sl > 0 && Math.abs(exit - o.sl) / o.entry < 0.004) {
      reason = '거래소손절';
    } else if (o.tp != null && o.tp > 0 && Math.abs(exit - o.tp) / o.entry < 0.004) {
      reason = '거래소익절';
    } else if (pnl < -0.01) {
      reason = '거래소손절(추정)';
    } else if (pnl > 0.01) {
      reason = '거래소익절(추정)';
    }
    const closed = closeSignalScoreTrade({
      tradeId: o.tradeId,
      symbol: o.symbol,
      exit,
      exitReason: reason,
      pnlUsdt: pnl,
      marginUsdt: o.marginUsdt ?? undefined,
    });
    if (closed) out.push(closed);
  }
  return out;
}

function isSlExit(reason: string): boolean {
  return /손절|SL|stop/i.test(reason);
}

function isTpExit(reason: string): boolean {
  return /익절|TP|러너|본절/i.test(reason) && !isSlExit(reason);
}

export function verdictForStats(params: {
  count: number;
  failRate: number;
  slRate: number;
  netPnl: number;
  avgRoePct: number;
  wins: number;
  losses: number;
  slExits: number;
  tpExits: number;
}): {
  verdict: ScoreVerdict;
  verdictKo: string;
  softSkip: boolean;
  sizeMult: number;
  whyKo: string;
  actionKo: string;
} {
  const { count, failRate, slRate, netPnl, avgRoePct, wins, losses, slExits, tpExits } =
    params;
  if (count < MIN_SAMPLE_KEEP) {
    return {
      verdict: 'observe',
      verdictKo: '관찰(표본부족)',
      softSkip: false,
      sizeMult: 1,
      whyKo: `표본 ${count}회(<${MIN_SAMPLE_KEEP}) · 아직 유지/보강 판정 보류`,
      actionKo: '더 체결·청산 후 재평가',
    };
  }

  const statsKo = `승${wins}/패${losses} · 손절${slExits} · 익절${tpExits} · 실패${(failRate * 100).toFixed(0)}% · 손절률${(slRate * 100).toFixed(0)}% · 손익${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(1)}U · 평균ROE ${avgRoePct.toFixed(1)}%`;

  if (failRate >= 0.55 && slRate >= 0.4 && netPnl < 0) {
    const softSkip = count >= MIN_SAMPLE_SOFT_SKIP && failRate >= 0.6 && slRate >= 0.5;
    const sizeHalve =
      !softSkip && count >= MIN_SAMPLE_SIZE_HALVE && failRate >= 0.5 && slRate >= 0.4;
    return {
      verdict: 'reinforce',
      verdictKo: softSkip ? '보강·일시대기' : '보강필요',
      softSkip,
      sizeMult: softSkip ? 0 : sizeHalve ? 0.5 : 0.7,
      whyKo: `손절·실패가 많아 기대값이 음수 · ${statsKo}`,
      actionKo: softSkip
        ? '진입 일시정지 · SL버퍼·늦은진입·조건 손본 뒤 재개'
        : sizeHalve
          ? '비중 절반 · SL최소거리·늦은진입 금지부터 손보기'
          : '비중 축소 · 손절 사유·타점 SL 점검',
    };
  }

  if (failRate <= 0.4 && netPnl > 0 && avgRoePct > 0) {
    return {
      verdict: 'keep',
      verdictKo: '유지(양호)',
      softSkip: false,
      sizeMult: 1,
      whyKo: `실패율·손익·ROE가 함께 양호 · ${statsKo}`,
      actionKo: '조건 유지 · 과도한 SL 축소·무리한 비중확대 금지',
    };
  }
  if (netPnl > 0 && failRate < 0.5) {
    return {
      verdict: 'keep',
      verdictKo: '유지',
      softSkip: false,
      sizeMult: 1,
      whyKo: `순손익 플러스·실패율 절반 미만 · ${statsKo}`,
      actionKo: '유지 · 손절률만 주기적으로 확인',
    };
  }
  return {
    verdict: 'observe',
    verdictKo: '관찰',
    softSkip: false,
    sizeMult: 1,
    whyKo: `아직 뚜렷한 유지/보강 기준 미달 · ${statsKo}`,
    actionKo: '관찰 계속 · 손절 연속 시 심볼 쿨다운이 먼저 동작',
  };
}

export function buildSignalScoreRows(minSample = MIN_SAMPLE_KEEP): {
  rows: SignalScoreRow[];
  keepKo: string[];
  reinforceKo: string[];
  summaryKo: string;
} {
  const { closed } = readSignalScorecard();
  const map = new Map<
    string,
    {
      signalKo: string;
      count: number;
      wins: number;
      losses: number;
      slExits: number;
      tpExits: number;
      netPnl: number;
      sumRoe: number;
    }
  >();

  for (const t of closed) {
    const cur = map.get(t.signalKey) || {
      signalKo: t.signalKo,
      count: 0,
      wins: 0,
      losses: 0,
      slExits: 0,
      tpExits: 0,
      netPnl: 0,
      sumRoe: 0,
    };
    cur.count += 1;
    cur.netPnl += t.pnlUsdt;
    cur.sumRoe += t.roePct;
    if (t.win) cur.wins += 1;
    else cur.losses += 1;
    if (isSlExit(t.exitReason)) cur.slExits += 1;
    if (isTpExit(t.exitReason)) cur.tpExits += 1;
    map.set(t.signalKey, cur);
  }

  const rows: SignalScoreRow[] = [...map.entries()].map(([signalKey, v]) => {
    const failRate = v.count > 0 ? v.losses / v.count : 0;
    const slRate = v.count > 0 ? v.slExits / v.count : 0;
    const avgRoePct = v.count > 0 ? v.sumRoe / v.count : 0;
    const ver = verdictForStats({
      count: v.count,
      failRate,
      slRate,
      netPnl: v.netPnl,
      avgRoePct,
      wins: v.wins,
      losses: v.losses,
      slExits: v.slExits,
      tpExits: v.tpExits,
    });
    return {
      signalKey,
      signalKo: v.signalKo,
      count: v.count,
      wins: v.wins,
      losses: v.losses,
      slExits: v.slExits,
      tpExits: v.tpExits,
      netPnl: v.netPnl,
      avgRoePct,
      failRate,
      slRate,
      verdict: ver.verdict,
      verdictKo: ver.verdictKo,
      softSkip: ver.softSkip,
      sizeMult: ver.sizeMult,
      whyKo: ver.whyKo,
      actionKo: ver.actionKo,
    };
  });

  rows.sort((a, b) => {
    const rank = (v: ScoreVerdict) => (v === 'reinforce' ? 0 : v === 'observe' ? 1 : 2);
    if (rank(a.verdict) !== rank(b.verdict)) return rank(a.verdict) - rank(b.verdict);
    return b.slRate - a.slRate || a.netPnl - b.netPnl;
  });

  const keep = rows.filter((r) => r.verdict === 'keep').slice(0, 8);
  const reinforce = rows.filter((r) => r.verdict === 'reinforce').slice(0, 8);
  const summaryKo =
    reinforce.length > 0
      ? `보강 ${reinforce.length} · 유지 ${keep.length} · 손절많은 신호부터 손보기 (확정아님)`
      : rows.length
        ? `신호 ${rows.length}종 · 긴급보강 없음 · 표본≥${minSample}부터 판정`
        : '아직 청산 성적 없음 · 진입·청산 후 자동 집계';

  return {
    rows,
    keepKo: keep.map(
      (r) => `${r.signalKo} · ${r.verdictKo} · ${r.whyKo.slice(0, 72)}`
    ),
    reinforceKo: reinforce.map(
      (r) => `${r.signalKo} · ${r.verdictKo} · ${r.actionKo}`
    ),
    summaryKo,
  };
}

/** 진입 직전 — 손절 많은 신호는 일시 대기·비중축소(손실 축소). 표본 부족은 통과. */
export function signalScoreSoftGate(params: {
  source?: string | null;
  signalKo?: string | null;
  timeframe?: string | null;
  fourStrategyId?: string | null;
  analysisTags?: string[] | null;
}): {
  allow: boolean;
  reasonKo: string;
  verdict: ScoreVerdict | 'new';
  sizeMult: number;
  whyKo: string;
  actionKo: string;
} {
  const key = makeSignalKey(params);
  const { rows } = buildSignalScoreRows();
  const row = rows.find((r) => r.signalKey === key);
  if (!row) {
    /** 초단 핵심 경로 — 반사이즈 관찰 제외 · 설정 equity% 풀 */
    const src = String(params.source || '');
    if (
      src === 'wick-15m' ||
      src === 'bpr-retest' ||
      src === 'structure-rocket' ||
      src === 'dump-zone' ||
      src === 'dump-confirm'
    ) {
      return {
        allow: true,
        reasonKo: `${src} · 풀사이즈`,
        verdict: 'new',
        sizeMult: 1,
        whyKo: '초단핵심 · 설정비중 그대로',
        actionKo: '풀사이즈 진입',
      };
    }
    return {
      allow: true,
      reasonKo: '신규신호 · 반사이즈관찰',
      verdict: 'new',
      sizeMult: NEW_SIGNAL_SIZE_MULT,
      whyKo: `성적 없음 · 첫 ${NEW_SIGNAL_HALF_SAMPLE}회 반사이즈`,
      actionKo: '반사이즈 진입 · 표본 수집',
    };
  }
  if (row.softSkip) {
    return {
      allow: false,
      reasonKo: `성적부 대기 · ${row.signalKo} · 손절률 ${(row.slRate * 100).toFixed(0)}%`,
      verdict: row.verdict,
      sizeMult: 0,
      whyKo: row.whyKo,
      actionKo: row.actionKo,
    };
  }
  if (row.count < NEW_SIGNAL_HALF_SAMPLE) {
    const src = String(params.source || '');
    if (
      src === 'wick-15m' ||
      src === 'bpr-retest' ||
      src === 'structure-rocket' ||
      src === 'dump-zone' ||
      src === 'dump-confirm'
    ) {
      return {
        allow: true,
        reasonKo: `${src} · 풀사이즈`,
        verdict: row.verdict,
        sizeMult: 1,
        whyKo: row.whyKo,
        actionKo: '초단핵심 풀사이즈',
      };
    }
    return {
      allow: true,
      reasonKo: `표본부족 · 반사이즈 (${row.count}/${NEW_SIGNAL_HALF_SAMPLE})`,
      verdict: row.verdict,
      sizeMult: Math.min(row.sizeMult > 0 ? row.sizeMult : 1, NEW_SIGNAL_SIZE_MULT),
      whyKo: row.whyKo,
      actionKo: '반사이즈 · 표본 더 필요',
    };
  }
  if (row.verdict === 'keep') {
    return {
      allow: true,
      reasonKo: `유지신호 · ${row.signalKo}`,
      verdict: 'keep',
      sizeMult: 1,
      whyKo: row.whyKo,
      actionKo: row.actionKo,
    };
  }
  return {
    allow: true,
    reasonKo: row.verdictKo,
    verdict: row.verdict,
    sizeMult: row.sizeMult > 0 ? row.sizeMult : 1,
    whyKo: row.whyKo,
    actionKo: row.actionKo,
  };
}

export function listOpenScoreTrades(): ScoreOpenTrade[] {
  return readSignalScorecard().open;
}

export function recentClosedScoreTrades(limit = 20): ScoreClosedTrade[] {
  return readSignalScorecard().closed.slice(0, limit);
}

/** 시드 장부가 있고 성적부가 비면 1회 이식(과거 표본으로 유지/보강 판정 시작) */
export function hydrateScorecardFromSeedTrades(
  seedTrades: Array<{
    id: string;
    at: number;
    closedAt: number;
    symbol: string;
    timeframe: string;
    direction: 'LONG' | 'SHORT';
    signalKo: string;
    source: string;
    entry: number;
    exit: number;
    pnlUsdt: number;
    roePct: number;
    win: boolean;
    exitReason: string;
    holdingMs: number;
    fourStrategyId?: string | null;
    analysisTags?: string[] | null;
  }>
): boolean {
  const prev = readSignalScorecard();
  if (prev.closed.length > 0 || !seedTrades.length) return false;
  const closed: ScoreClosedTrade[] = seedTrades.slice(0, 400).map((t) => {
    const signalKey = makeSignalKey({
      source: t.source,
      signalKo: t.signalKo,
      timeframe: t.timeframe,
      fourStrategyId: t.fourStrategyId,
      analysisTags: t.analysisTags,
    });
    return {
      tradeId: t.id,
      signalKey,
      signalKo: t.signalKo || t.source,
      source: String(t.source),
      symbol: String(t.symbol || '').toUpperCase(),
      timeframe: t.timeframe,
      direction: t.direction,
      entry: t.entry,
      sl: null,
      tp: null,
      openedAt: t.at,
      mode: 'virtual' as const,
      analysisTags: t.analysisTags ?? null,
      fourStrategyId: t.fourStrategyId ?? null,
      closedAt: t.closedAt,
      exit: t.exit,
      exitReason: t.exitReason,
      pnlUsdt: t.pnlUsdt,
      roePct: t.roePct,
      win: t.win,
      holdingMs: t.holdingMs,
    };
  });
  writeStore({ open: prev.open, closed, updatedAt: Date.now() });
  return true;
}

/** 보강필요·유지 사유 + 해당 청산기록 패키지 (에이전트 첨부용) */
export function buildReinforceNeededExportPack(): {
  exportedAt: string;
  noteKo: string;
  reinforce: Array<SignalScoreRow & { trades: ScoreClosedTrade[] }>;
  keep: Array<Pick<SignalScoreRow, 'signalKey' | 'signalKo' | 'verdictKo' | 'whyKo' | 'actionKo' | 'count' | 'netPnl' | 'failRate' | 'slRate'>>;
  observe: Array<Pick<SignalScoreRow, 'signalKey' | 'signalKo' | 'verdictKo' | 'whyKo' | 'actionKo' | 'count'>>;
  allReinforceTrades: ScoreClosedTrade[];
  open: ScoreOpenTrade[];
  symbolGuards?: unknown;
} {
  const { rows } = buildSignalScoreRows();
  const { closed, open } = readSignalScorecard();
  const reinforceRows = rows.filter((r) => r.verdict === 'reinforce');
  const keepRows = rows.filter((r) => r.verdict === 'keep');
  const observeRows = rows.filter((r) => r.verdict === 'observe');
  const reinforceKeys = new Set(reinforceRows.map((r) => r.signalKey));
  const allReinforceTrades = closed.filter((t) => reinforceKeys.has(t.signalKey));
  return {
    exportedAt: new Date().toISOString(),
    noteKo:
      '보강필요 신호·청산기록 · whyKo=왜보강 · actionKo=손볼점 · keep은 좋은성적 사유 참고 · 확정승률아님',
    reinforce: reinforceRows.map((r) => ({
      ...r,
      trades: closed.filter((t) => t.signalKey === r.signalKey).slice(0, 80),
    })),
    keep: keepRows.map((r) => ({
      signalKey: r.signalKey,
      signalKo: r.signalKo,
      verdictKo: r.verdictKo,
      whyKo: r.whyKo,
      actionKo: r.actionKo,
      count: r.count,
      netPnl: r.netPnl,
      failRate: r.failRate,
      slRate: r.slRate,
    })),
    observe: observeRows.map((r) => ({
      signalKey: r.signalKey,
      signalKo: r.signalKo,
      verdictKo: r.verdictKo,
      whyKo: r.whyKo,
      actionKo: r.actionKo,
      count: r.count,
    })),
    allReinforceTrades,
    open,
    symbolGuards: listSymbolLossGuards(),
  };
}

export function downloadReinforceNeededPack(filenameHint?: string): void {
  if (typeof window === 'undefined') return;
  const pack = buildReinforceNeededExportPack();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name = filenameHint || `ailongshort-reinforce-needed-${day}.json`;
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
