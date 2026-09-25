/**
 * 코인별 성적 장부 — BTC/ETH/BNB/XRP 승패·누적·오늘·루트.
 * 확정 승률·수익 아님.
 */
import { readSignalScorecard, type ScoreClosedTrade } from '@/lib/mergedDeskSignalScorecard';
import { readVirtualSeedLedger } from '@/lib/mergedDeskVirtualSeedLedger';
import {
  buildAutoTradeSymbolMatrix,
  normalizeCoinId,
  type AutoTradeCoinId,
} from '@/lib/mergedDeskEntryRedesign';
import { getSymbolLossGuard, symbolLossCooldownGate } from '@/lib/mergedDeskSymbolLossGuard';

const COINS: AutoTradeCoinId[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];

export function coinRouteKo(coin: AutoTradeCoinId): string {
  if (coin === 'BTC') return 'Dual Fast+S';
  if (coin === 'ETH') return 'Dual Fast+S';
  if (coin === 'BNB') return '구경로OFF·칩만';
  if (coin === 'XRP') return 'Dual Fast+S';
  if (coin === 'SOL') return 'Dual Fast+S';
  return '기타';
}

/** Dual Lane Fast/S 횟수·순손익 (수수료 후 장부 · 확정수익 아님) */
export function buildDualLaneTradeStats(): {
  fastCount: number;
  sCount: number;
  fastPnl: number;
  sPnl: number;
  todayFast: number;
  todayS: number;
  todayFastPnl: number;
  todaySPnl: number;
  summaryKo: string;
} {
  const { closed } = readSignalScorecard();
  const seed = readVirtualSeedLedger();
  const day0 = startOfLocalDayMs();
  const scIds = new Set(closed.map((c) => c.tradeId));
  const seedAs = seed.trades
    .filter((t) => !scIds.has(t.id))
    .map((t) => ({
      source: String(t.source),
      pnlUsdt: t.pnlUsdt,
      closedAt: t.closedAt,
    }));
  const all = [
    ...closed.map((c) => ({
      source: String(c.source || ''),
      pnlUsdt: c.pnlUsdt,
      closedAt: c.closedAt,
    })),
    ...seedAs,
  ];
  let fastCount = 0;
  let sCount = 0;
  let fastPnl = 0;
  let sPnl = 0;
  let todayFast = 0;
  let todayS = 0;
  let todayFastPnl = 0;
  let todaySPnl = 0;
  for (const t of all) {
    const src = t.source;
    const isFast = src === 'rb-scalp' || /초단Fast|rb-scalp|띠SFP/i.test(src);
    const isS = src === 'ai-zone' || /AIZONE/i.test(src);
    if (!isFast && !isS) continue;
    const pnl = Number(t.pnlUsdt) || 0;
    const today = Number(t.closedAt) >= day0;
    if (isFast) {
      fastCount += 1;
      fastPnl += pnl;
      if (today) {
        todayFast += 1;
        todayFastPnl += pnl;
      }
    } else if (isS) {
      sCount += 1;
      sPnl += pnl;
      if (today) {
        todayS += 1;
        todaySPnl += pnl;
      }
    }
  }
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}U`;
  return {
    fastCount,
    sCount,
    fastPnl,
    sPnl,
    todayFast,
    todayS,
    todayFastPnl,
    todaySPnl,
    summaryKo: `Fast ${fastCount}회 ${fmt(fastPnl)} · S ${sCount}회 ${fmt(sPnl)} · 오늘 Fast${todayFast}/${fmt(todayFastPnl)} S${todayS}/${fmt(todaySPnl)} · 확정아님`,
  };
}

function startOfLocalDayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type CoinScoreBoardRow = {
  coin: AutoTradeCoinId;
  routeKo: string;
  tradeCount: number;
  wins: number;
  losses: number;
  slExits: number;
  tpExits: number;
  netPnl: number;
  winPnl: number;
  lossPnl: number;
  avgRoePct: number;
  failRate: number;
  slRate: number;
  liveCount: number;
  virtualCount: number;
  todayCount: number;
  todayPnl: number;
  consecutiveSl: number;
  sizeMult: number;
  cooling: boolean;
  remainSec: number;
  openCount: number;
  statusKo: string;
  whyKo: string;
  actionKo: string;
  needReinforce: boolean;
  /** 누적 손익 기준 순위(1=최고) · 표본0이면 null */
  rank: number | null;
  /** 승/(승+패) · 표시용 · 확정승률 아님 */
  winRatePct: number | null;
};

export type CoinScoreBoard = {
  rows: CoinScoreBoardRow[];
  summaryKo: string;
  todayAllPnl: number;
  todayAllCount: number;
  totalNetPnl: number;
  totalTrades: number;
};

function isSl(reason: string): boolean {
  return /손절|SL|stop|잠금/i.test(reason);
}
function isTp(reason: string): boolean {
  return /익절|TP|러너|본절/i.test(reason) && !isSl(reason);
}

export function buildCoinScoreBoard(): CoinScoreBoard {
  const { closed, open } = readSignalScorecard();
  const seed = readVirtualSeedLedger();
  const matrix = buildAutoTradeSymbolMatrix();
  const day0 = startOfLocalDayMs();

  /** 시드 장부도 코인 집계에 합침(성적부 이전이력) */
  const seedAsClosed: ScoreClosedTrade[] = seed.trades.map((t) => ({
    tradeId: t.id,
    signalKey: `seed|${t.signalKo}|${t.timeframe}`,
    signalKo: t.signalKo,
    source: String(t.source),
    symbol: t.symbol,
    timeframe: t.timeframe,
    direction: t.direction,
    entry: t.entry,
    sl: null,
    tp: null,
    openedAt: t.at,
    mode: 'virtual' as const,
    closedAt: t.closedAt,
    exit: t.exit,
    exitReason: t.exitReason,
    pnlUsdt: t.pnlUsdt,
    roePct: t.roePct,
    win: t.win,
    holdingMs: t.holdingMs,
  }));

  /** scorecard 우선 · seed는 scorecard에 없는 id만 */
  const scIds = new Set(closed.map((c) => c.tradeId));
  const allClosed = [...closed, ...seedAsClosed.filter((s) => !scIds.has(s.tradeId))];

  const rows: CoinScoreBoardRow[] = COINS.map((coin) => {
    const trades = allClosed.filter((t) => normalizeCoinId(t.symbol) === coin);
    let wins = 0;
    let losses = 0;
    let slExits = 0;
    let tpExits = 0;
    let netPnl = 0;
    let winPnl = 0;
    let lossPnl = 0;
    let sumRoe = 0;
    let liveCount = 0;
    let virtualCount = 0;
    let todayCount = 0;
    let todayPnl = 0;

    for (const t of trades) {
      netPnl += t.pnlUsdt;
      sumRoe += t.roePct;
      if (t.win) {
        wins += 1;
        winPnl += t.pnlUsdt;
      } else {
        losses += 1;
        lossPnl += t.pnlUsdt;
      }
      if (isSl(t.exitReason)) slExits += 1;
      if (isTp(t.exitReason)) tpExits += 1;
      if (t.mode === 'live') liveCount += 1;
      else virtualCount += 1;
      if ((t.closedAt || 0) >= day0) {
        todayCount += 1;
        todayPnl += t.pnlUsdt;
      }
    }

    const tradeCount = trades.length;
    const failRate = tradeCount > 0 ? losses / tradeCount : 0;
    const slRate = tradeCount > 0 ? slExits / tradeCount : 0;
    const avgRoePct = tradeCount > 0 ? sumRoe / tradeCount : 0;
    const guard = getSymbolLossGuard(coin);
    const cool = symbolLossCooldownGate(coin);
    const mx = matrix.rows.find((r) => r.coin === coin);
    const openCount = open.filter((o) => normalizeCoinId(o.symbol) === coin).length;
    const needReinforce =
      (tradeCount >= 5 && slRate >= 0.45 && netPnl < 0) ||
      cool.allow === false ||
      guard.consecutiveSl >= 2;

    let statusKo = '관찰';
    if (openCount > 0) statusKo = '진행중';
    else if (needReinforce) statusKo = '보강필요';
    else if (tradeCount >= 5 && failRate <= 0.4 && netPnl > 0) statusKo = '유지(양호)';
    else if (tradeCount === 0) statusKo = '표본없음';

    const decided = wins + losses;
    return {
      coin,
      routeKo: coinRouteKo(coin),
      tradeCount,
      wins,
      losses,
      slExits,
      tpExits,
      netPnl,
      winPnl,
      lossPnl,
      avgRoePct,
      failRate,
      slRate,
      liveCount,
      virtualCount,
      todayCount,
      todayPnl,
      consecutiveSl: guard.consecutiveSl,
      sizeMult: guard.sizeMult,
      cooling: !cool.allow,
      remainSec: cool.remainSec,
      openCount,
      statusKo,
      whyKo: mx?.whyKo || `${coin} · ${tradeCount}회`,
      actionKo: mx?.actionKo || coinRouteKo(coin),
      needReinforce,
      rank: null,
      winRatePct: decided > 0 ? (wins / decided) * 100 : null,
    };
  });

  /** 누적 손익 내림차순 순위 (표본 있는 코인만) */
  const ranked = [...rows]
    .filter((r) => r.tradeCount > 0)
    .sort((a, b) => b.netPnl - a.netPnl || b.wins - a.wins);
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });
  rows.sort((a, b) => {
    const ra = a.rank ?? 99;
    const rb = b.rank ?? 99;
    if (ra !== rb) return ra - rb;
    return a.coin.localeCompare(b.coin);
  });

  const todayAllPnl = rows.reduce((s, r) => s + r.todayPnl, 0);
  const todayAllCount = rows.reduce((s, r) => s + r.todayCount, 0);
  const totalNetPnl = rows.reduce((s, r) => s + r.netPnl, 0);
  const totalTrades = rows.reduce((s, r) => s + r.tradeCount, 0);
  const hot = rows.filter((r) => r.needReinforce || r.cooling).length;
  const top = ranked[0];

  return {
    rows,
    todayAllPnl,
    todayAllCount,
    totalNetPnl,
    totalTrades,
    summaryKo: hot
      ? `코인성적 · 보강주의 ${hot}개 · 오늘 ${todayAllCount}회 ${todayAllPnl >= 0 ? '+' : ''}${todayAllPnl.toFixed(1)}U · 확정아님`
      : top
        ? `코인성적 · 1위 ${top.coin}(${top.netPnl >= 0 ? '+' : ''}${top.netPnl.toFixed(0)}U) · 오늘 ${todayAllCount}회 · 누적 ${totalNetPnl >= 0 ? '+' : ''}${totalNetPnl.toFixed(1)}U · 확정아님`
        : `코인성적 · 5코인 · 오늘 ${todayAllCount}회 · 누적 ${totalNetPnl >= 0 ? '+' : ''}${totalNetPnl.toFixed(1)}U · 확정아님`,
  };
}

export function buildTodayTradeBoard(): {
  rows: Array<{
    coin: AutoTradeCoinId;
    count: number;
    wins: number;
    losses: number;
    pnl: number;
    slExits: number;
  }>;
  summaryKo: string;
  totalPnl: number;
  totalCount: number;
} {
  const board = buildCoinScoreBoard();
  const rows = board.rows.map((r) => ({
    coin: r.coin,
    count: r.todayCount,
    wins: 0,
    losses: 0,
    pnl: r.todayPnl,
    slExits: 0,
  }));
  /** 오늘 승패·손절은 closed에서 재집계 */
  const { closed } = readSignalScorecard();
  const seed = readVirtualSeedLedger();
  const day0 = startOfLocalDayMs();
  const todayTrades = [
    ...closed.filter((t) => t.closedAt >= day0),
    ...seed.trades.filter((t) => t.closedAt >= day0),
  ];
  for (const row of rows) {
    const list = todayTrades.filter((t) => normalizeCoinId(t.symbol) === row.coin);
    row.count = list.length;
    row.pnl = list.reduce((s, t) => s + t.pnlUsdt, 0);
    row.wins = list.filter((t) => t.win).length;
    row.losses = list.filter((t) => !t.win).length;
    row.slExits = list.filter((t) => isSl(t.exitReason)).length;
  }
  const totalPnl = rows.reduce((s, r) => s + r.pnl, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  return {
    rows,
    totalPnl,
    totalCount,
    summaryKo: `오늘 · ${totalCount}회 · 손익 ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}U · 확정아님`,
  };
}

export function downloadCoinScorePack(filenameHint?: string): void {
  if (typeof window === 'undefined') return;
  const pack = {
    exportedAt: new Date().toISOString(),
    noteKo: '코인별 승패·누적·오늘·루트·보강 · 확정승률아님',
    board: buildCoinScoreBoard(),
    today: buildTodayTradeBoard(),
    matrix: buildAutoTradeSymbolMatrix(),
  };
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name = filenameHint || `ailongshort-coin-score-${day}.json`;
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
