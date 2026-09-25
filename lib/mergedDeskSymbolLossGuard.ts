/**
 * 심볼별 연속 손절 가드 — 쿨다운·사이즈 축소로 손실 줄이기.
 * 신호 삭제가 아니라 BTC/ETH/BNB/XRP 진입 빈도만 조절. 확정 수익 아님.
 */
const KEY = 'ailongshort.mergedDesk.symbolLossGuard.v1';
export const SYMBOL_LOSS_GUARD_EVENT = 'ailongshort-merged-desk-symbol-loss-guard';

const COOLDOWN_MS = 10 * 60 * 1000;
const SIZE_AFTER_1_SL = 0.7;
const SIZE_AFTER_2_SL = 0.5;

export type SymbolLossGuardRow = {
  symbol: string;
  consecutiveSl: number;
  lastSlAt: number;
  lastWinAt: number;
  sizeMult: number;
  cooldownUntil: number;
};

type Store = { bySymbol: Record<string, SymbolLossGuardRow>; updatedAt: number };

function normSym(symbol: string): string {
  return String(symbol || '')
    .toUpperCase()
    .replace(/USDT$/, '')
    .replace(/[_-]/g, '');
}

function empty(): Store {
  return { bySymbol: {}, updatedAt: 0 };
}

function emit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(SYMBOL_LOSS_GUARD_EVENT));
  } catch {
    /* ignore */
  }
}

export function readSymbolLossGuardStore(): Store {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const j = JSON.parse(raw) as Partial<Store>;
    return {
      bySymbol: j.bySymbol && typeof j.bySymbol === 'object' ? j.bySymbol : {},
      updatedAt: Number(j.updatedAt) || 0,
    };
  } catch {
    return empty();
  }
}

function writeStore(next: Store): Store {
  const out = { ...next, updatedAt: Date.now() };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(out));
    } catch {
      /* ignore */
    }
  }
  emit();
  return out;
}

function rowFor(symbol: string): SymbolLossGuardRow {
  const id = normSym(symbol);
  const prev = readSymbolLossGuardStore().bySymbol[id];
  if (prev) return prev;
  return {
    symbol: id,
    consecutiveSl: 0,
    lastSlAt: 0,
    lastWinAt: 0,
    sizeMult: 1,
    cooldownUntil: 0,
  };
}

export function getSymbolLossGuard(symbol: string): SymbolLossGuardRow {
  return rowFor(symbol);
}

/** 연속 손절 쿨다운 중이면 진입 거부 */
export function symbolLossCooldownGate(symbol: string): {
  allow: boolean;
  remainSec: number;
  reasonKo: string;
  sizeMult: number;
} {
  const r = rowFor(symbol);
  const now = Date.now();
  const left = r.cooldownUntil - now;
  if (left > 0) {
    return {
      allow: false,
      remainSec: Math.ceil(left / 1000),
      reasonKo: `${r.symbol} 연속손절 쿨다운 ${Math.ceil(left / 1000)}초 · 손실축소`,
      sizeMult: r.sizeMult,
    };
  }
  return {
    allow: true,
    remainSec: 0,
    reasonKo:
      r.consecutiveSl > 0
        ? `${r.symbol} 연속손절 ${r.consecutiveSl} · 다음비중 ×${r.sizeMult}`
        : `${r.symbol} 가드정상`,
    sizeMult: r.sizeMult > 0 ? r.sizeMult : 1,
  };
}

export function noteSymbolStopLoss(symbol: string, exitReason?: string): SymbolLossGuardRow {
  const isSl = /손절|SL|stop|잠금/i.test(String(exitReason || '손절'));
  if (!isSl && exitReason != null && exitReason !== '') {
    /** 손절이 아니면 무시(익절 경로는 noteSymbolWin) */
    return rowFor(symbol);
  }
  const prev = readSymbolLossGuardStore();
  const id = normSym(symbol);
  const cur = rowFor(symbol);
  const consecutiveSl = cur.consecutiveSl + 1;
  const sizeMult =
    consecutiveSl >= 2 ? SIZE_AFTER_2_SL : consecutiveSl >= 1 ? SIZE_AFTER_1_SL : 1;
  const cooldownUntil = consecutiveSl >= 2 ? Date.now() + COOLDOWN_MS : 0;
  const next: SymbolLossGuardRow = {
    ...cur,
    symbol: id,
    consecutiveSl,
    lastSlAt: Date.now(),
    sizeMult,
    cooldownUntil,
  };
  writeStore({
    bySymbol: { ...prev.bySymbol, [id]: next },
    updatedAt: Date.now(),
  });
  return next;
}

export function noteSymbolWinOrFlat(symbol: string): SymbolLossGuardRow {
  const prev = readSymbolLossGuardStore();
  const id = normSym(symbol);
  const next: SymbolLossGuardRow = {
    ...rowFor(symbol),
    symbol: id,
    consecutiveSl: 0,
    lastWinAt: Date.now(),
    sizeMult: 1,
    cooldownUntil: 0,
  };
  writeStore({
    bySymbol: { ...prev.bySymbol, [id]: next },
    updatedAt: Date.now(),
  });
  return next;
}

export function listSymbolLossGuards(): SymbolLossGuardRow[] {
  const s = readSymbolLossGuardStore();
  return Object.values(s.bySymbol).sort((a, b) => b.consecutiveSl - a.consecutiveSl);
}
