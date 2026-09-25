/**
 * 가상매매 저장소 — 4요소 확정 L/S 신호 시 자동 진입, 성공/실패 기록
 * localStorage + 서버 동기화 (data/virtual-store)
 */

import type { Candle } from '@/types';
import { fetchVirtualApi } from '@/lib/fetchVirtualApi';

const STORAGE_KEY = 'ailongshort-virtual-trades';
const FAILED_SIGNALS_KEY = 'ailongshort-failed-signals';
const FAILED_CONTEXT_ALLOW_KEY = 'ailongshort-failed-context-allow';

export type VirtualTrade = {
  id: string;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopPrice: number;
  targetPrices: number[];
  entryTime: number;
  /** 'open' | 'hit_stop' | 'hit_tp1' | 'hit_tp2' | 'hit_tp3' | 'timeout' */
  status: string;
  exitPrice?: number;
  exitTime?: number;
  pnlPct?: number;
  /** 진입 시 포지션 규모(USDT) — 시드 기반 리스크 5% 산출 */
  positionSizeUsdt?: number;
  /** 시드 기준 자동 산출 레버리지 */
  leverage?: number;
  /** 시드 5% 리스크 금액 */
  riskAmountUsdt?: number;
  /** 진입 당시 RR */
  rr?: number;
  /** 신호 근거 요약 */
  signalReasons?: string[];
  /** 진입 당시 TP/SL 적용 모드 */
  tpSlMode?: 'auto' | 'manual';
  /** 자율학습용: 실패 시 패턴 특징 해시 */
  patternHash?: string;
};

export type FailedSignalRecord = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  at: number;
  patternHash: string;
  contextKey?: string;
};

let _memoryTrades: VirtualTrade[] | null = null;
let _memoryFailedSignals: FailedSignalRecord[] | null = null;
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 500;

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, data: unknown) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function loadTrades(): VirtualTrade[] {
  if (_memoryTrades != null) return _memoryTrades;
  return loadFromStorage(STORAGE_KEY, []);
}

function saveTrades(trades: VirtualTrade[]) {
  const trimmed = trades.slice(-500);
  _memoryTrades = trimmed;
  saveToStorage(STORAGE_KEY, trimmed);
  schedulePersist();
}

function loadFailedSignals(): FailedSignalRecord[] {
  if (_memoryFailedSignals != null) return _memoryFailedSignals;
  return loadFromStorage(FAILED_SIGNALS_KEY, []);
}

function saveFailedSignals(list: FailedSignalRecord[]) {
  const trimmed = list.slice(-500);
  _memoryFailedSignals = trimmed;
  saveToStorage(FAILED_SIGNALS_KEY, trimmed);
  schedulePersist();
}

function schedulePersist() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    persistToServer();
  }, PERSIST_DEBOUNCE_MS);
}

/** 서버에 현재 상태 저장 (fire-and-forget) */
export async function persistToServer(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const trades = _memoryTrades ?? loadFromStorage(STORAGE_KEY, []);
    const failedSignals = _memoryFailedSignals ?? loadFromStorage(FAILED_SIGNALS_KEY, []);
    await fetchVirtualApi('/api/virtual-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trades, failedSignals }),
    });
  } catch {
    // 서버 미연결 시 무시
  }
}

/** 서버에서 로드 후 메모리·localStorage에 반영 */
export async function hydrateFromServer(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetchVirtualApi('/api/virtual-store');
    const data = await res.json();
    if (data?.ok && Array.isArray(data.trades)) {
      _memoryTrades = data.trades;
      _memoryFailedSignals = Array.isArray(data.failedSignals) ? data.failedSignals : [];
      saveToStorage(STORAGE_KEY, _memoryTrades);
      saveToStorage(FAILED_SIGNALS_KEY, _memoryFailedSignals);
      return true;
    }
  } catch {
    // 서버 미연결 시 localStorage 사용
  }
  return false;
}

export function getVirtualTrades(): VirtualTrade[] {
  return loadTrades();
}

/** 시드(USDT)와 진입/손절 가격으로 포지션 규모 산출 — 리스크 5% */
export function computePositionSizeUsdt(seedUsdt: number, entryPrice: number, stopPrice: number): number {
  const riskUsdt = seedUsdt * 0.05;
  const stopDistPct = Math.abs(entryPrice - stopPrice) / entryPrice * 100;
  if (stopDistPct <= 0) return 0;
  return riskUsdt / (stopDistPct / 100);
}

export function computeLeverageFromRisk(seedUsdt: number, entryPrice: number, stopPrice: number): number {
  const positionSize = computePositionSizeUsdt(seedUsdt, entryPrice, stopPrice);
  const riskUsdt = seedUsdt * 0.05;
  if (riskUsdt <= 0 || !isFinite(positionSize) || positionSize <= 0) return 1;
  // 사용자 요청식: 레버리지 = 포지션규모 / (시드 5% 리스크 금액)
  return Math.max(1, positionSize / riskUsdt);
}

export function computeRr(direction: 'LONG' | 'SHORT', entryPrice: number, stopPrice: number, targetPrice: number): number {
  const risk = Math.abs(entryPrice - stopPrice);
  const reward = direction === 'LONG'
    ? Math.abs(targetPrice - entryPrice)
    : Math.abs(entryPrice - targetPrice);
  if (!isFinite(risk) || risk <= 0) return 0;
  return reward / risk;
}

export function addVirtualTrade(
  trade: Omit<VirtualTrade, 'id' | 'status' | 'positionSizeUsdt'>,
  seedUsdt?: number
): VirtualTrade {
  const trades = loadTrades();
  const id = `vt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const positionSizeUsdt = seedUsdt != null && seedUsdt > 0
    ? computePositionSizeUsdt(seedUsdt, trade.entryPrice, trade.stopPrice)
    : undefined;
  const leverage = seedUsdt != null && seedUsdt > 0
    ? computeLeverageFromRisk(seedUsdt, trade.entryPrice, trade.stopPrice)
    : undefined;
  const riskAmountUsdt = seedUsdt != null && seedUsdt > 0 ? seedUsdt * 0.05 : undefined;
  const newTrade: VirtualTrade = { ...trade, id, status: 'open', positionSizeUsdt, leverage, riskAmountUsdt };
  trades.push(newTrade);
  saveTrades(trades);
  return newTrade;
}

export function updateVirtualTrade(id: string, update: Partial<VirtualTrade>) {
  const trades = loadTrades();
  const idx = trades.findIndex(t => t.id === id);
  if (idx >= 0) {
    trades[idx] = { ...trades[idx], ...update };
    saveTrades(trades);
  }
}

export function getOpenPosition(symbol: string, timeframe: string): VirtualTrade | null {
  return loadTrades().find(t => t.status === 'open' && t.symbol === symbol && t.timeframe === timeframe) ?? null;
}

/** 모든 오픈 포지션 (백그라운드 청산 체크용) */
export function getAllOpenPositions(): VirtualTrade[] {
  return loadTrades().filter(t => t.status === 'open');
}

/** 최근 진입 방지 — 동일 심볼/TF에서 60초 내 중복 진입 금지 */
export function canEnterNew(symbol: string, timeframe: string): boolean {
  if (getOpenPosition(symbol, timeframe)) return false;
  const list = loadTrades();
  const last = list.filter(t => t.symbol === symbol && t.timeframe === timeframe).pop();
  if (!last) return true;
  const secAgo = Math.floor(Date.now() / 1000) - last.entryTime;
  return secAgo >= 60;
}

/** 캔들 데이터로 청산 여부 판정 (SL/TP1 우선). entryTime 이후 종료된 캔들만 검사 */
export function checkPositionOutcome(
  position: VirtualTrade,
  candles: Candle[],
  targetProfitPct = 5
): { status: string; exitPrice: number; exitTime: number; pnlPct: number } | null {
  const future = candles.filter(c => c.time > position.entryTime).sort((a, b) => a.time - b.time);
  if (future.length === 0) return null;
  const entry = position.entryPrice;
  const stop = position.stopPrice;
  const tp1 = position.targetPrices[0] ?? entry * 1.02;
  const dir = position.direction;

  for (const c of future) {
    const { high, low, time } = c;
    if (dir === 'LONG') {
      if (position.leverage && position.leverage > 0) {
        const levPnlPctAtHigh = ((high - entry) / entry) * 100 * position.leverage;
        if (levPnlPctAtHigh >= targetProfitPct) {
          const requiredSpotPct = targetProfitPct / position.leverage;
          const exitPrice = entry * (1 + requiredSpotPct / 100);
          return { status: 'hit_user_tp', exitPrice, exitTime: time, pnlPct: ((exitPrice - entry) / entry) * 100 };
        }
      }
      if (low <= stop) return { status: 'hit_stop', exitPrice: stop, exitTime: time, pnlPct: -Math.abs(((stop - entry) / entry) * 100) };
      if (high >= tp1) return { status: 'hit_tp1', exitPrice: tp1, exitTime: time, pnlPct: Math.abs(((tp1 - entry) / entry) * 100) };
      const tp2 = position.targetPrices[1];
      if (tp2 && high >= tp2) return { status: 'hit_tp2', exitPrice: tp2, exitTime: time, pnlPct: Math.abs(((tp2 - entry) / entry) * 100) };
      const tp3 = position.targetPrices[2];
      if (tp3 && high >= tp3) return { status: 'hit_tp3', exitPrice: tp3, exitTime: time, pnlPct: Math.abs(((tp3 - entry) / entry) * 100) };
    } else {
      if (position.leverage && position.leverage > 0) {
        const levPnlPctAtLow = ((entry - low) / entry) * 100 * position.leverage;
        if (levPnlPctAtLow >= targetProfitPct) {
          const requiredSpotPct = targetProfitPct / position.leverage;
          const exitPrice = entry * (1 - requiredSpotPct / 100);
          return { status: 'hit_user_tp', exitPrice, exitTime: time, pnlPct: ((entry - exitPrice) / entry) * 100 };
        }
      }
      if (high >= stop) return { status: 'hit_stop', exitPrice: stop, exitTime: time, pnlPct: -Math.abs(((entry - stop) / entry) * 100) };
      if (low <= tp1) return { status: 'hit_tp1', exitPrice: tp1, exitTime: time, pnlPct: Math.abs(((entry - tp1) / entry) * 100) };
      const tp2 = position.targetPrices[1];
      if (tp2 && low <= tp2) return { status: 'hit_tp2', exitPrice: tp2, exitTime: time, pnlPct: Math.abs(((entry - tp2) / entry) * 100) };
      const tp3 = position.targetPrices[2];
      if (tp3 && low <= tp3) return { status: 'hit_tp3', exitPrice: tp3, exitTime: time, pnlPct: Math.abs(((entry - tp3) / entry) * 100) };
    }
  }
  return null;
}

/** 실패 신호 기록 (자율학습용 — 틀린 신호 패턴 보정) */
export function recordFailedSignal(record: FailedSignalRecord) {
  if (typeof window === 'undefined') return;
  try {
    const list = loadFailedSignals();
    list.push(record);
    saveFailedSignals(list);
  } catch {}
}

export function getFailedSignals(): FailedSignalRecord[] {
  return loadFailedSignals();
}

/** 동일 조건(symbol+timeframe+direction) 최근 N시간 내 손절 건수 — 자율보정용 */
export function getRecentFailedCount(
  symbol: string,
  timeframe: string,
  direction: 'LONG' | 'SHORT',
  withinHours = 24
): number {
  const list = getFailedSignals();
  const cutoff = Math.floor(Date.now() / 1000) - withinHours * 3600;
  return list.filter(
    f => f.symbol === symbol && f.timeframe === timeframe && f.direction === direction && f.at >= cutoff
  ).length;
}

/** 동일 컨텍스트 패턴 최근 손절 건수 (시간대/변동성/등급 조합 역필터) */
export function getRecentFailedPatternCount(
  patternHash: string,
  withinHours = 72
): number {
  if (!patternHash) return 0;
  const list = getFailedSignals();
  const cutoff = Math.floor(Date.now() / 1000) - withinHours * 3600;
  return list.filter(f => f.patternHash === patternHash && f.at >= cutoff).length;
}

/** 역필터 예외(수동 허용) 컨텍스트 목록 */
export function getAllowedFailedContexts(): string[] {
  return loadFromStorage<string[]>(FAILED_CONTEXT_ALLOW_KEY, []).filter(Boolean);
}

export function isFailedContextAllowed(context: string): boolean {
  if (!context) return false;
  return getAllowedFailedContexts().includes(context);
}

export function setFailedContextAllowed(context: string, allowed: boolean): string[] {
  const curr = new Set(getAllowedFailedContexts());
  if (allowed) curr.add(context);
  else curr.delete(context);
  const next = [...curr].slice(-200);
  saveToStorage(FAILED_CONTEXT_ALLOW_KEY, next);
  return next;
}

export function clearAllowedFailedContexts(): string[] {
  saveToStorage(FAILED_CONTEXT_ALLOW_KEY, []);
  return [];
}

/** 자율보정: 최근 손절 3건 이상이면 가상 진입 억제 */
export const RECENT_FAIL_SKIP_THRESHOLD = 3;
