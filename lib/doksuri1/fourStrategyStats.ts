/**
 * 4전략 성과 DB — Strategy×Symbol×TF×Regime 분리.
 * Paper/Live 분리. 삭제 금지 · status만 변경.
 */
import type {
  FourStrategyCardView,
  FourStrategyClosedTrade,
  FourStrategyId,
  FourStrategyStatsBucket,
  FourStrategyStatus,
  MarketRegime,
} from '@/lib/doksuri1/fourStrategyTypes';
import { FOUR_STRATEGY_IDS, FOUR_STRATEGY_KO } from '@/lib/doksuri1/fourStrategyTypes';
import { normalizeChartTimeframe } from '@/lib/constants';

const STATS_KEY = 'ailongshort.doksuri1.fourStrategy.stats.v1';
const TRADES_KEY = 'ailongshort.doksuri1.fourStrategy.trades.v1';
const MAX_TRADES = 800;

const SAMPLE_LEARNING = 30;
const SAMPLE_PROVISIONAL = 100;
const SAMPLE_FULL = 300;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function fourStrategyBucketKey(
  strategyId: FourStrategyId,
  symbol: string,
  timeframe: string,
  regime: MarketRegime
): string {
  return `${strategyId}|${String(symbol || '').toUpperCase()}|${normalizeChartTimeframe(timeframe)}|${regime}`;
}

function emptyBucket(
  strategyId: FourStrategyId,
  symbol: string,
  timeframe: string,
  regime: MarketRegime
): FourStrategyStatsBucket {
  return {
    strategyId,
    symbol: String(symbol || '').toUpperCase(),
    timeframe: normalizeChartTimeframe(timeframe),
    regime,
    tradeCount: 0,
    wins: 0,
    losses: 0,
    sumWinRoe: 0,
    sumLossRoe: 0,
    sumMfe: 0,
    sumMae: 0,
    sumFeeRoe: 0,
    maxConsecLoss: 0,
    consecLoss: 0,
    netEv: 0,
    profitFactor: 0,
    status: 'LEARNING',
    updatedAt: Date.now(),
  };
}

function recompute(b: FourStrategyStatsBucket): FourStrategyStatsBucket {
  const n = b.tradeCount;
  const winRate = n > 0 ? b.wins / n : 0;
  const avgWin = b.wins > 0 ? b.sumWinRoe / b.wins : 0;
  const avgLoss = b.losses > 0 ? Math.abs(b.sumLossRoe / b.losses) : 0;
  const netEv = n > 0 ? (winRate * avgWin - (1 - winRate) * avgLoss) : 0;
  const grossWin = b.sumWinRoe;
  const grossLoss = Math.abs(b.sumLossRoe);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 3 : 0;
  let status: FourStrategyStatus = 'LEARNING';
  if (n >= SAMPLE_FULL) {
    if (netEv > 0.15 && profitFactor >= 1.15) status = 'ACTIVE';
    else if (netEv > 0 && profitFactor >= 1.0) status = 'RECOVERY';
    else if (netEv > -0.2 && profitFactor >= 0.9) status = 'CAUTION';
    else status = 'DISABLED';
  } else if (n >= SAMPLE_PROVISIONAL) {
    if (netEv > 0.1 && profitFactor >= 1.1) status = 'ACTIVE';
    else if (netEv >= 0) status = 'CAUTION';
    else status = 'CAUTION';
  } else if (n >= SAMPLE_LEARNING) {
    status = netEv >= 0 ? 'LEARNING' : 'CAUTION';
  }
  return { ...b, netEv, profitFactor, status, updatedAt: Date.now() };
}

export function readFourStrategyStatsMap(): Record<string, FourStrategyStatsBucket> {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(STATS_KEY), {});
}

export function getFourStrategyBucket(
  strategyId: FourStrategyId,
  symbol: string,
  timeframe: string,
  regime: MarketRegime
): FourStrategyStatsBucket {
  const map = readFourStrategyStatsMap();
  const k = fourStrategyBucketKey(strategyId, symbol, timeframe, regime);
  return map[k] ?? emptyBucket(strategyId, symbol, timeframe, regime);
}

/** 심볼+TF 합산 뷰 */
export function getFourStrategyStatsForSymbolTf(
  strategyId: FourStrategyId,
  symbol: string,
  timeframe: string
): FourStrategyStatsBucket {
  const map = readFourStrategyStatsMap();
  const sym = String(symbol || '').toUpperCase();
  const tf = normalizeChartTimeframe(timeframe);
  const rows = Object.values(map).filter(
    (b) => b.strategyId === strategyId && b.symbol === sym && b.timeframe === tf
  );
  if (!rows.length) return emptyBucket(strategyId, symbol, timeframe, 'UNKNOWN');
  const merged = emptyBucket(strategyId, symbol, timeframe, 'UNKNOWN');
  for (const r of rows) {
    merged.tradeCount += r.tradeCount;
    merged.wins += r.wins;
    merged.losses += r.losses;
    merged.sumWinRoe += r.sumWinRoe;
    merged.sumLossRoe += r.sumLossRoe;
    merged.sumMfe += r.sumMfe;
    merged.sumMae += r.sumMae;
    merged.sumFeeRoe += r.sumFeeRoe;
    merged.maxConsecLoss = Math.max(merged.maxConsecLoss, r.maxConsecLoss);
  }
  return recompute(merged);
}

export function recordFourStrategyClosedTrade(trade: FourStrategyClosedTrade): FourStrategyStatsBucket {
  if (typeof window === 'undefined') {
    return emptyBucket(trade.strategyId, trade.symbol, trade.timeframe, trade.regime);
  }
  /** Paper만 기본 학습 버킷에 반영 (Live 별도 키 확장 여지) */
  const map = readFourStrategyStatsMap();
  const k = fourStrategyBucketKey(trade.strategyId, trade.symbol, trade.timeframe, trade.regime);
  let b = map[k] ?? emptyBucket(trade.strategyId, trade.symbol, trade.timeframe, trade.regime);
  b = { ...b };
  b.tradeCount += 1;
  b.sumMfe += trade.mfeRoePct;
  b.sumMae += trade.maeRoePct;
  b.sumFeeRoe += trade.feeRoePct + trade.slippageRoePct;
  if (trade.win) {
    b.wins += 1;
    b.sumWinRoe += Math.max(0, trade.netRoePct);
    b.consecLoss = 0;
  } else {
    b.losses += 1;
    b.sumLossRoe += Math.min(0, trade.netRoePct);
    b.consecLoss += 1;
    b.maxConsecLoss = Math.max(b.maxConsecLoss, b.consecLoss);
  }
  b = recompute(b);
  map[k] = b;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(map));
    const trades = safeParse<FourStrategyClosedTrade[]>(window.localStorage.getItem(TRADES_KEY), []);
    const next = [trade, ...trades.filter((t) => t.tradeId !== trade.tradeId)].slice(0, MAX_TRADES);
    window.localStorage.setItem(TRADES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return b;
}

export function readFourStrategyTrades(symbol?: string): FourStrategyClosedTrade[] {
  if (typeof window === 'undefined') return [];
  const rows = safeParse<FourStrategyClosedTrade[]>(window.localStorage.getItem(TRADES_KEY), []);
  if (!symbol) return rows;
  const s = String(symbol).toUpperCase();
  return rows.filter((t) => t.symbol === s);
}

export function buildFourStrategyCards(
  symbol: string,
  timeframe: string,
  setupById?: Partial<Record<FourStrategyId, string>>
): FourStrategyCardView[] {
  return FOUR_STRATEGY_IDS.map((id) => {
    const b = getFourStrategyStatsForSymbolTf(id, symbol, timeframe);
    const winRate = b.tradeCount > 0 ? b.wins / b.tradeCount : null;
    /** best regime by netEv among buckets */
    const map = readFourStrategyStatsMap();
    let bestRegime: MarketRegime | null = null;
    let bestEv = -999;
    for (const row of Object.values(map)) {
      if (row.strategyId !== id || row.symbol !== String(symbol).toUpperCase()) continue;
      if (row.tradeCount < 5) continue;
      if (row.netEv > bestEv) {
        bestEv = row.netEv;
        bestRegime = row.regime;
      }
    }
    return {
      strategyId: id,
      labelKo: FOUR_STRATEGY_KO[id],
      status: b.status,
      tradeCount: b.tradeCount,
      winRate,
      netEv: b.netEv,
      profitFactor: b.profitFactor,
      bestRegime,
      setupKo: setupById?.[id] ?? '대기',
    };
  });
}

/** LIVE 허용: ACTIVE만. PAPER: DISABLED 제외 */
export function strategyAllowsPaper(status: FourStrategyStatus): boolean {
  return status !== 'DISABLED';
}

export function strategyAllowsLive(status: FourStrategyStatus): boolean {
  return status === 'ACTIVE';
}

export function sizeMultForStatus(status: FourStrategyStatus): number {
  if (status === 'ACTIVE') return 1;
  if (status === 'RECOVERY') return 0.75;
  if (status === 'CAUTION' || status === 'LEARNING') return 0.4;
  return 0;
}
