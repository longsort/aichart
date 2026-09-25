/**
 * §25 상관 클러스터 — BTC/ETH/SOL/XRP/BNB 동일방향 동시확정 위험도 제한.
 * 확정 수익 아님 · 베타 리스크 가드.
 */
import { TAPOINT_SYMBOLS } from './types';

export type TapCorrClusterSnap = {
  clusterId: string;
  sameDirCount: number;
  symbols: string[];
  direction: 'LONG' | 'SHORT' | null;
  riskHigh: boolean;
  allowNew: boolean;
  noteKo: string;
};

type Slot = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  at: number;
  signalId: string;
};

/** 서버·프로세스 메모리 — 최근 동시 확정 슬롯 */
const g = globalThis as unknown as {
  __tapCorrSlots?: Slot[];
};

function slots(): Slot[] {
  if (!g.__tapCorrSlots) g.__tapCorrSlots = [];
  return g.__tapCorrSlots;
}

const TTL_MS = 45 * 60 * 1000;
const MAX_SAME_DIR = 2;

function prune(now = Date.now()) {
  const s = slots();
  g.__tapCorrSlots = s.filter((x) => now - x.at < TTL_MS);
}

export function registerTapConfirmedCluster(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  signalId: string;
}): void {
  prune();
  const sym = String(params.symbol || '').toUpperCase();
  if (!(TAPOINT_SYMBOLS as readonly string[]).includes(sym) && !sym.endsWith('USDT')) {
    return;
  }
  const list = slots().filter((x) => x.symbol !== sym);
  list.push({
    symbol: sym,
    direction: params.direction,
    at: Date.now(),
    signalId: params.signalId,
  });
  g.__tapCorrSlots = list.slice(-20);
}

export function evaluateTapCorrCluster(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT' | null;
}): TapCorrClusterSnap {
  prune();
  const dir = params.direction;
  const sym = String(params.symbol || '').toUpperCase();
  if (!dir) {
    return {
      clusterId: 'crypto-beta',
      sameDirCount: 0,
      symbols: [],
      direction: null,
      riskHigh: false,
      allowNew: true,
      noteKo: '방향없음 · 클러스터 미적용',
    };
  }
  const peers = slots().filter((x) => x.direction === dir && x.symbol !== sym);
  const symbols = peers.map((p) => p.symbol);
  const sameDirCount = peers.length;
  const riskHigh = sameDirCount >= MAX_SAME_DIR;
  const allowNew = !riskHigh;
  return {
    clusterId: 'crypto-beta',
    sameDirCount,
    symbols,
    direction: dir,
    riskHigh,
    allowNew,
    noteKo: riskHigh
      ? `상관클러스터 · ${dir} 동시 ${sameDirCount}개(${symbols.join(',')}) · 신규차단`
      : sameDirCount > 0
        ? `상관 · ${dir} 동시 ${sameDirCount} · 여유`
        : '상관 · 동시확정 없음',
  };
}
