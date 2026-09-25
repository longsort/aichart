/**
 * 실전 ActiveTrade — E/SL/TP 한 번 결정 후 잠금.
 * 성공(TP1 도달) · 실패(SL/무효 이탈) · 심볼/TF 변경 시에만 해제.
 * 확정 수익·승률 보장 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { Eagle1CanonicalTradeDisplay } from '@/lib/eagle1/canonicalTradeDisplay';
import { calcTradeRewardRisk, strengthenUnifiedDeskTradePlan } from '@/lib/mergedDeskUnifiedTradeRails';
import * as SuperStatsSwingTf from '@/lib/mergedDeskSuperStatsSwingTf';

export type MergedDeskFrozenTradeOutcome = 'open' | 'success' | 'fail';

export type MergedDeskFrozenTradeSnapshot = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationPrice: number;
  invalidationKo: string;
  rr: number;
  source: MergedDeskActiveTradePlan['source'];
  sourceKo: string;
  status: MergedDeskActiveTradePlan['status'];
  statusKo: string;
  entryAllowed: boolean;
  lockedAtMs: number;
  outcome: MergedDeskFrozenTradeOutcome;
};

const STORAGE_PREFIX = 'ailongshort.mergedDesk.frozenTrade.v1:';
const COOLDOWN_PREFIX = 'ailongshort.mergedDesk.frozenTradeCooldown.v1:';
const COOLDOWN_MS = 20 * 60 * 1000;

function storageKey(symbol: string, timeframe: string): string {
  return `${STORAGE_PREFIX}${String(symbol || '').toUpperCase()}:${String(timeframe || '')}`;
}

function cooldownKey(symbol: string, timeframe: string): string {
  return `${COOLDOWN_PREFIX}${String(symbol || '').toUpperCase()}:${String(timeframe || '')}`;
}

type CooldownSnap = { entry: number; direction: string; untilMs: number };

function readCooldown(symbol: string, timeframe: string): CooldownSnap | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(cooldownKey(symbol, timeframe));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CooldownSnap;
    if (!parsed || !(parsed.untilMs > Date.now())) {
      window.sessionStorage.removeItem(cooldownKey(symbol, timeframe));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCooldown(symbol: string, timeframe: string, entry: number, direction: string): void {
  if (typeof window === 'undefined') return;
  try {
    const snap: CooldownSnap = {
      entry,
      direction,
      untilMs: Date.now() + COOLDOWN_MS,
    };
    window.sessionStorage.setItem(cooldownKey(symbol, timeframe), JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

function inCooldown(
  symbol: string,
  timeframe: string,
  entry: number,
  direction: string
): boolean {
  const cd = readCooldown(symbol, timeframe);
  if (!cd) return false;
  if (cd.direction !== direction) return false;
  const ref = Math.max(Math.abs(cd.entry), 1e-9);
  return Math.abs(cd.entry - entry) / ref < 0.0015;
}

function geometryOk(direction: 'LONG' | 'SHORT', entry: number, stopLoss: number, tp1: number): boolean {
  if (!(entry > 0) || !(stopLoss > 0) || !(tp1 > 0)) return false;
  if (direction === 'LONG') return stopLoss < entry && tp1 > entry;
  return stopLoss > entry && tp1 < entry;
}

function normalizePlanLevels(plan: MergedDeskActiveTradePlan): MergedDeskActiveTradePlan {
  if (plan.direction !== 'LONG' && plan.direction !== 'SHORT') return plan;
  const strengthened = strengthenUnifiedDeskTradePlan({
    direction: plan.direction,
    entry: plan.entry,
    stopLoss: plan.stopLoss,
    tp1: plan.tp1,
    tp2: plan.tp2,
    tp3: plan.tp3,
    invalidationKo: plan.invalidationKo,
    sourceKo: plan.sourceKo,
    alignedWithChart: plan.asUnifiedPlan.alignedWithChart,
    warningsKo: [...plan.asUnifiedPlan.warningsKo],
  });
  let direction = strengthened.direction === 'LONG' || strengthened.direction === 'SHORT'
    ? strengthened.direction
    : plan.direction;
  let { entry, stopLoss, tp1, tp2, tp3 } = strengthened;

  /** 방향 vs SL 충돌 — 손절을 방향에 맞게 뒤집거나, TP가 반대면 방향 교정 */
  const risk = Math.abs(entry - stopLoss) || Math.abs(entry) * 0.008;
  if (direction === 'LONG' && stopLoss >= entry) {
    if (tp1 > 0 && tp1 < entry && stopLoss > entry) {
      direction = 'SHORT';
    } else {
      stopLoss = entry - risk;
    }
  } else if (direction === 'SHORT' && stopLoss <= entry) {
    if (tp1 > 0 && tp1 > entry && stopLoss < entry) {
      direction = 'LONG';
    } else {
      stopLoss = entry + risk;
    }
  }

  const fixed = strengthenUnifiedDeskTradePlan({
    direction,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    invalidationKo: plan.invalidationKo,
    sourceKo: plan.sourceKo,
    alignedWithChart: true,
    warningsKo: [...plan.asUnifiedPlan.warningsKo],
  });

  const inval =
    direction === 'LONG'
      ? Math.min(fixed.stopLoss, plan.invalidationPrice > 0 ? plan.invalidationPrice : fixed.stopLoss)
      : Math.max(fixed.stopLoss, plan.invalidationPrice > 0 ? plan.invalidationPrice : fixed.stopLoss);

  return {
    ...plan,
    direction,
    entry: fixed.entry,
    stopLoss: fixed.stopLoss,
    tp1: fixed.tp1,
    tp2: fixed.tp2,
    tp3: fixed.tp3,
    invalidationPrice: inval,
    rr: calcTradeRewardRisk(fixed.entry, fixed.stopLoss, fixed.tp1) ?? plan.rr,
    asUnifiedPlan: {
      ...plan.asUnifiedPlan,
      ...fixed,
      direction,
    },
  };
}

function snapshotFromPlan(
  plan: MergedDeskActiveTradePlan,
  symbol: string,
  timeframe: string
): MergedDeskFrozenTradeSnapshot | null {
  if (plan.direction !== 'LONG' && plan.direction !== 'SHORT') return null;
  const n = normalizePlanLevels(plan);
  if (n.direction !== 'LONG' && n.direction !== 'SHORT') return null;
  if (!geometryOk(n.direction, n.entry, n.stopLoss, n.tp1)) return null;
  return {
    symbol: String(symbol || '').toUpperCase(),
    timeframe: String(timeframe || ''),
    direction: n.direction,
    entry: n.entry,
    stopLoss: n.stopLoss,
    tp1: n.tp1,
    tp2: n.tp2,
    tp3: n.tp3,
    invalidationPrice: n.invalidationPrice,
    invalidationKo: n.invalidationKo,
    rr: n.rr,
    source: n.source,
    sourceKo: n.sourceKo,
    status: n.status,
    statusKo: n.statusKo,
    entryAllowed: n.entryAllowed,
    lockedAtMs: Date.now(),
    outcome: 'open',
  };
}

function planFromSnapshot(snap: MergedDeskFrozenTradeSnapshot): MergedDeskActiveTradePlan {
  return {
    direction: snap.direction,
    entry: snap.entry,
    stopLoss: snap.stopLoss,
    tp1: snap.tp1,
    tp2: snap.tp2,
    tp3: snap.tp3,
    invalidationPrice: snap.invalidationPrice,
    invalidationKo: snap.invalidationKo,
    rr: snap.rr,
    status: snap.status,
    statusKo: snap.statusKo,
    source: snap.source,
    sourceKo: snap.sourceKo,
    entryAllowed: snap.entryAllowed && snap.status === 'ENTER',
    asUnifiedPlan: {
      direction: snap.direction,
      entry: snap.entry,
      stopLoss: snap.stopLoss,
      tp1: snap.tp1,
      tp2: snap.tp2,
      tp3: snap.tp3,
      invalidationKo: snap.invalidationKo,
      sourceKo: snap.sourceKo,
      alignedWithChart: true,
      warningsKo: ['실전 잠금 · TP1 성공 또는 SL/무효 실패 시에만 해제'],
    },
  };
}

function evalOutcome(
  snap: MergedDeskFrozenTradeSnapshot,
  close: number,
  last: Candle | null | undefined
): MergedDeskFrozenTradeOutcome {
  if (!(close > 0)) return 'open';
  const hi = Number(last?.high) > 0 ? Number(last!.high) : close;
  const lo = Number(last?.low) > 0 ? Number(last!.low) : close;
  const inv = snap.invalidationPrice > 0 ? snap.invalidationPrice : snap.stopLoss;

  if (snap.direction === 'LONG') {
    if (lo <= snap.stopLoss || close < inv) return 'fail';
    if (hi >= snap.tp1) return 'success';
  } else {
    if (hi >= snap.stopLoss || close > inv) return 'fail';
    if (lo <= snap.tp1) return 'success';
  }
  return 'open';
}

export function readMergedDeskFrozenTrade(
  symbol: string,
  timeframe: string
): MergedDeskFrozenTradeSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(symbol, timeframe));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MergedDeskFrozenTradeSnapshot;
    if (!parsed || parsed.symbol !== String(symbol || '').toUpperCase()) return null;
    if (parsed.timeframe !== String(timeframe || '')) return null;
    if (parsed.outcome !== 'open') return null;
    if (!geometryOk(parsed.direction, parsed.entry, parsed.stopLoss, parsed.tp1)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMergedDeskFrozenTrade(snap: MergedDeskFrozenTradeSnapshot | null): void {
  if (typeof window === 'undefined') return;
  try {
    const key = storageKey(snap?.symbol ?? '', snap?.timeframe ?? '');
    if (!snap) {
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(storageKey(snap.symbol, snap.timeframe), JSON.stringify(snap));
  } catch {
    /* ignore quota */
  }
}

export function clearMergedDeskFrozenTrade(symbol: string, timeframe: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(storageKey(symbol, timeframe));
  } catch {
    /* ignore */
  }
}

/**
 * 라이브 해석 → 실전 잠금 적용.
 * TOUCH/ENTER 최초 결정 시 잠금 · 성공/실패 시 해제 후 무효/완료 상태 반환.
 */
export function applyMergedDeskFrozenTradePlan(params: {
  live: MergedDeskActiveTradePlan | null | undefined;
  symbol: string;
  timeframe: string;
  close: number;
  lastCandle?: Candle | null;
}): MergedDeskActiveTradePlan {
  const live = params.live;
  if (!live) {
    return {
      direction: 'NEUTRAL',
      entry: 0,
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      invalidationPrice: 0,
      invalidationKo: '플랜 없음',
      rr: 0,
      status: 'WAIT',
      statusKo: '대기',
      source: 'none',
      sourceKo: '없음',
      entryAllowed: false,
      asUnifiedPlan: {
        direction: 'NEUTRAL',
        entry: 0,
        stopLoss: 0,
        tp1: 0,
        tp2: 0,
        tp3: 0,
        invalidationKo: '플랜 없음',
        sourceKo: '없음',
        alignedWithChart: false,
        warningsKo: [],
      },
    };
  }

  const normalizedLive = normalizePlanLevels(live);
  let frozen = readMergedDeskFrozenTrade(params.symbol, params.timeframe);

  if (frozen) {
    const outcome = evalOutcome(frozen, params.close, params.lastCandle);
    if (outcome === 'success') {
      clearMergedDeskFrozenTrade(params.symbol, params.timeframe);
      writeCooldown(params.symbol, params.timeframe, frozen.entry, frozen.direction);
      const done = planFromSnapshot({ ...frozen, outcome: 'success', status: 'INVALID', statusKo: '성공', entryAllowed: false });
      return {
        ...done,
        status: 'INVALID',
        statusKo: '성공',
        entryAllowed: false,
        invalidationKo: `TP1 ${frozen.tp1} 도달 · 실전 성공 종료`,
        asUnifiedPlan: {
          ...done.asUnifiedPlan,
          invalidationKo: `TP1 도달 · 성공 종료`,
          warningsKo: ['실전 성공(TP1) · 새 타점 대기'],
        },
      };
    }
    if (outcome === 'fail') {
      clearMergedDeskFrozenTrade(params.symbol, params.timeframe);
      writeCooldown(params.symbol, params.timeframe, frozen.entry, frozen.direction);
      const dead = planFromSnapshot({ ...frozen, outcome: 'fail', status: 'INVALID', statusKo: '실패', entryAllowed: false });
      return {
        ...dead,
        status: 'INVALID',
        statusKo: '실패',
        entryAllowed: false,
        invalidationKo: `SL/무효 이탈 · 실전 실패 종료`,
        asUnifiedPlan: {
          ...dead.asUnifiedPlan,
          invalidationKo: 'SL/무효 이탈 · 실패 종료',
          warningsKo: ['실전 실패 · 새 타점 대기'],
        },
      };
    }

    /** 잠금 유지 — 가격선·레벨 고정, 상태만 터치/진입 반영 */
    const status =
      normalizedLive.status === 'ENTER' || frozen.status === 'ENTER'
        ? 'ENTER'
        : normalizedLive.status === 'TOUCH' || frozen.status === 'TOUCH'
          ? 'TOUCH'
          : frozen.status;
    const locked: MergedDeskFrozenTradeSnapshot = {
      ...frozen,
      status,
      statusKo: status === 'ENTER' ? '진입' : status === 'TOUCH' ? '터치' : frozen.statusKo,
      entryAllowed: status === 'ENTER' && (normalizedLive.entryAllowed || frozen.entryAllowed),
      outcome: 'open',
    };
    writeMergedDeskFrozenTrade(locked);
    return planFromSnapshot(locked);
  }

  /** 신규 잠금: TOUCH/ENTER + 정상 기하 · 직전 종료 쿨다운 제외 */
  const nextSnap = snapshotFromPlan(normalizedLive, params.symbol, params.timeframe);
  if (
    nextSnap &&
    !inCooldown(params.symbol, params.timeframe, nextSnap.entry, nextSnap.direction)
  ) {
    writeMergedDeskFrozenTrade(nextSnap);
    return planFromSnapshot(nextSnap);
  }

  return normalizedLive;
}

export type Eagle1CanonicalTradeDisplayFrozen = Eagle1CanonicalTradeDisplay & {
  /** sessionStorage 실전 잠금 여부 */
  frozen?: boolean;
  frozenOutcome?: MergedDeskFrozenTradeOutcome;
  frozenOutcomeKo?: string;
};

function snapshotFromCanonical(
  c: Eagle1CanonicalTradeDisplay,
  symbol: string,
  timeframe: string
): MergedDeskFrozenTradeSnapshot | null {
  if (c.direction !== 'LONG' && c.direction !== 'SHORT') return null;
  const entry = c.entry ?? 0;
  const stopLoss = c.stopLoss ?? 0;
  const tp1 = c.tp1 ?? 0;
  const tp2 = c.tp2 ?? 0;
  const tp3 = c.tp3 ?? 0;
  if (!geometryOk(c.direction, entry, stopLoss, tp1)) return null;
  const inval =
    c.direction === 'LONG'
      ? Math.min(stopLoss, stopLoss)
      : Math.max(stopLoss, stopLoss);
  return {
    symbol: String(symbol || '').toUpperCase(),
    timeframe: String(timeframe || ''),
    direction: c.direction,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    invalidationPrice: inval,
    invalidationKo: c.superStats.invalidationKo || c.noteKo || '무효 이탈',
    rr: calcTradeRewardRisk(entry, stopLoss, tp1) ?? 0,
    source: 'unified',
    sourceKo: c.sourceKo || '超强统计',
    status: c.entryAllowed ? 'ENTER' : 'WAIT',
    statusKo: c.directionKo || (c.direction === 'LONG' ? '롱' : '숏'),
    entryAllowed: c.entryAllowed,
    lockedAtMs: Date.now(),
    outcome: 'open',
  };
}

function canonicalFromSnapshot(
  snap: MergedDeskFrozenTradeSnapshot,
  live: Eagle1CanonicalTradeDisplay,
  frozen: boolean,
  outcome?: MergedDeskFrozenTradeOutcome,
  outcomeKo?: string,
  timeframe?: string
): Eagle1CanonicalTradeDisplayFrozen {
  const buildSwing =
    typeof SuperStatsSwingTf.buildSuperStatsSwingSpotPack === 'function'
      ? SuperStatsSwingTf.buildSuperStatsSwingSpotPack
      : null;
  const swingSpot = buildSwing
    ? buildSwing({
        direction: snap.direction,
        entry: snap.entry,
        stopLoss: snap.stopLoss,
        tp1: snap.tp1,
        tp2: snap.tp2 > 0 ? snap.tp2 : null,
        tp3: snap.tp3 > 0 ? snap.tp3 : null,
        timeframe: timeframe || snap.timeframe || '1H',
        atrPct: live.superStats.swingSpot?.atrPct ?? null,
      })
    : live.superStats.swingSpot ?? null;
  return {
    ...live,
    direction: snap.direction,
    directionKo: snap.statusKo || live.directionKo,
    entry: snap.entry,
    entryHigh: snap.entry,
    stopLoss: snap.stopLoss,
    tp1: snap.tp1,
    tp2: snap.tp2 > 0 ? snap.tp2 : null,
    tp3: snap.tp3 > 0 ? snap.tp3 : null,
    entryAllowed: snap.entryAllowed,
    sourceKo: snap.sourceKo || live.sourceKo,
    noteKo: frozen
      ? (live.noteKo ? `${live.noteKo} · 실전 잠금 E/SL/TP` : '실전 잠금 E/SL/TP')
      : outcomeKo || live.noteKo,
    superStats: {
      ...live.superStats,
      entry: snap.entry,
      stopLoss: snap.stopLoss,
      tp1: snap.tp1,
      tp2: snap.tp2 > 0 ? snap.tp2 : null,
      tp3: snap.tp3 > 0 ? snap.tp3 : null,
      swingSpot,
    },
    frozen,
    frozenOutcome: outcome,
    frozenOutcomeKo: outcomeKo,
  };
}

/**
 * Hub/超强统计 화면 타점 — 판정 시 E/SL/TP 잠금 · TP1/SL 결과까지 유지.
 */
export function applyMergedDeskFrozenCanonicalDisplay(params: {
  live: Eagle1CanonicalTradeDisplay;
  symbol: string;
  timeframe: string;
  close: number;
  lastCandle?: Candle | null;
}): Eagle1CanonicalTradeDisplayFrozen {
  const live = params.live;
  let frozen = readMergedDeskFrozenTrade(params.symbol, params.timeframe);

  if (frozen) {
    const outcome = evalOutcome(frozen, params.close, params.lastCandle);
    if (outcome === 'success') {
      clearMergedDeskFrozenTrade(params.symbol, params.timeframe);
      writeCooldown(params.symbol, params.timeframe, frozen.entry, frozen.direction);
      return canonicalFromSnapshot(
        frozen,
        live,
        false,
        'success',
        `TP1 ${frozen.tp1} 도달 · 결과 기록`,
        params.timeframe
      );
    }
    if (outcome === 'fail') {
      clearMergedDeskFrozenTrade(params.symbol, params.timeframe);
      writeCooldown(params.symbol, params.timeframe, frozen.entry, frozen.direction);
      return canonicalFromSnapshot(
        frozen,
        live,
        false,
        'fail',
        `SL/무효 이탈 · 결과 기록`,
        params.timeframe
      );
    }
    return canonicalFromSnapshot(frozen, live, true, 'open', undefined, params.timeframe);
  }

  const nextSnap = snapshotFromCanonical(live, params.symbol, params.timeframe);
  if (
    nextSnap &&
    !inCooldown(params.symbol, params.timeframe, nextSnap.entry, nextSnap.direction)
  ) {
    writeMergedDeskFrozenTrade(nextSnap);
    return canonicalFromSnapshot(nextSnap, live, true, 'open', undefined, params.timeframe);
  }

  return { ...live, frozen: false };
}
