/**
 * Dual 구조타점 진입 — 추격 시장가 금지.
 * 신호 READY 후 레일/로켓/OB 타점 존 터치(또는 존 안)일 때만 진입.
 * 타점 미도달 시: AIZONE 보던방향 추정≥70 → 진입 · 반대≥70·불일치 → 포기.
 * 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import {
  buildParallelPivotLines,
  nearestParallelPivotTip,
} from '@/lib/mergedDeskParallelPivotLines';
import {
  assertDirectionSlTp,
  assertPivotSideForDirection,
  assertRailSideForDirection,
} from '@/lib/mergedDeskDirectionSlGuard';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import type { BtcRaceLaneCandidate } from '@/lib/mergedDeskBtcSignalRace';
import { AIZONE_PCT_MIN_NORMAL } from '@/lib/mergedDeskAiZoneEntryGate';
import { readAiZoneEntrySnapshot } from '@/lib/mergedDeskAiZoneSnapshot';

export type DualStructureTouchPending = {
  signalId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  /** 터치 대기 중심가 */
  entry: number;
  entryLo: number;
  entryHi: number;
  sl: number;
  tp: number;
  source: string;
  timeframe: string;
  signalKo: string;
  evidenceKo: string;
  analysisTags: string[];
  score: number;
  slot: 'A' | 'B' | 'C';
  expiresAt: number;
  createdAt: number;
};

export type DualStructureEntryResult =
  | {
      mode: 'enter_now';
      entry: number;
      sl: number;
      tp: number;
      reasonKo: string;
    }
  | {
      mode: 'wait_touch';
      pending: DualStructureTouchPending;
      reasonKo: string;
    }
  | { mode: 'reject'; reasonKo: string };

const TOUCH_EXPIRE_MS = 12 * 60_000; /** 약 1m×12봉 / 3m×4봉 여유 */
const pendingMem = new Map<string, DualStructureTouchPending>();

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(
      a.high - a.low,
      Math.abs(a.high - b.close),
      Math.abs(a.low - b.close)
    );
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function pendingKey(symbol: string, signalId: string): string {
  return `${String(symbol).toUpperCase()}|${signalId}`;
}

export function upsertDualStructurePending(
  p: DualStructureTouchPending
): void {
  pendingMem.set(pendingKey(p.symbol, p.signalId), p);
}

export function clearDualStructurePending(
  symbol: string,
  signalId: string
): void {
  pendingMem.delete(pendingKey(symbol, signalId));
}

export function listDualStructurePendings(
  symbol?: string
): DualStructureTouchPending[] {
  const now = Date.now();
  const out: DualStructureTouchPending[] = [];
  for (const [k, p] of pendingMem) {
    if (p.expiresAt < now) {
      pendingMem.delete(k);
      continue;
    }
    if (symbol && p.symbol !== String(symbol).toUpperCase()) continue;
    out.push(p);
  }
  return out;
}

/** 마크가 타점 존에 들어왔는지 */
export function markTouchesStructureZone(
  mark: number,
  p: Pick<DualStructureTouchPending, 'entryLo' | 'entryHi' | 'direction'>
): boolean {
  if (!(mark > 0)) return false;
  return mark >= p.entryLo && mark <= p.entryHi;
}

/**
 * 레이스 승자 → 구조타점 정제.
 * A: 파랑빨강 레일 + Parallel Pivot Lines(LuxAlgo 수식) 조합
 * B: 로켓 존 재터치 · C: OB 존 유지 — 가능하면 PPL 합류.
 */
export function refineDualRaceToStructureEntry(params: {
  win: BtcRaceLaneCandidate;
  candles: Candle[];
  timeframe: string;
  markPrice?: number | null;
  leverage?: number;
  tp1RoePct?: number;
}): DualStructureEntryResult {
  const win = params.win;
  const candles = params.candles;
  const n = candles.length;
  if (n < 20) return { mode: 'reject', reasonKo: '타점 · 캔들부족' };

  const mark =
    Number(params.markPrice) > 0
      ? Number(params.markPrice)
      : Number(candles[n - 1]?.close) || win.entry;
  if (!(mark > 0)) return { mode: 'reject', reasonKo: '타점 · 가격없음' };

  const atr = atrApprox(candles);
  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 20));
  const tpRoe =
    Math.max(3, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT) / 100;
  const dir = win.direction;
  const now = Date.now();

  let target = win.entry;
  let zonePad = atr * 0.35;
  let sl = win.sl;
  let tag = '구조타점';

  const ppl = buildParallelPivotLines(candles);
  const pplTip = nearestParallelPivotTip(ppl, dir, mark);
  const pplPrice = pplTip?.tipPrice ?? 0;

  if (win.slot === 'A') {
    const ch = buildMergedDeskBlueRedChannels(candles, params.timeframe);
    const geom = ch.geoms.find((g) => g.primary) ?? ch.geoms[0] ?? null;
    if (!geom && !(pplPrice > 0)) {
      return { mode: 'reject', reasonKo: '타점 · 레일·피벗선없음' };
    }
    if (geom) {
      const railSide = assertRailSideForDirection({
        direction: dir,
        mark,
        tipUpper: geom.tipUpper,
        tipLower: geom.tipLower,
        atr,
      });
      if (!railSide.ok) {
        return { mode: 'reject', reasonKo: `타점 · ${railSide.reasonKo}` };
      }
    }
    const plTip =
      nearestParallelPivotTip(ppl, 'LONG', mark)?.tipPrice ?? null;
    const phTip =
      nearestParallelPivotTip(ppl, 'SHORT', mark)?.tipPrice ?? null;
    const pivSide = assertPivotSideForDirection({
      direction: dir,
      mark,
      plTip,
      phTip,
      atr,
    });
    if (!pivSide.ok && ppl.lines.length > 0) {
      return { mode: 'reject', reasonKo: `타점 · ${pivSide.reasonKo}` };
    }
    /** 롱=하단 레일 · 숏=상단 레일 (추격 금지) */
    const rail =
      geom != null
        ? dir === 'LONG'
          ? geom.tipLower
          : geom.tipUpper
        : 0;
    if (rail > 0 && pplPrice > 0 && Math.abs(rail - pplPrice) <= atr * 2.2) {
      /** 레일 + Parallel Pivot 합류 → 중점 타점 */
      target = (rail + pplPrice) / 2;
      tag = '레일+피벗선합류타점';
    } else if (pplPrice > 0) {
      target = pplPrice;
      tag = '피벗선되돌림타점';
    } else {
      target = rail;
      tag = '레일되돌림타점';
    }
    zonePad = Math.max(atr * 0.28, target * 0.00035);
    const buf = Math.max(atr * 0.12, target * 0.00035);
    const railSl =
      geom != null
        ? dir === 'LONG'
          ? geom.tipLower - buf
          : geom.tipUpper + buf
        : dir === 'LONG'
          ? target - atr * 0.45
          : target + atr * 0.45;
    sl =
      dir === 'LONG'
        ? Math.min(railSl, target - atr * 0.35)
        : Math.max(railSl, target + atr * 0.35);
  } else if (win.slot === 'B') {
    /** 신호 SL이 로켓 밖 — 타점은 진입과 SL 사이 61.8% 되돌림(로켓쪽) */
    const span = Math.abs(win.entry - win.sl);
    if (!(span > 0)) return { mode: 'reject', reasonKo: '타점 · 로켓거리0' };
    const rocket =
      dir === 'LONG'
        ? win.sl + span * 0.618
        : win.sl - span * 0.618;
    if (pplPrice > 0 && Math.abs(rocket - pplPrice) <= atr * 2.5) {
      target = (rocket + pplPrice) / 2;
      tag = '로켓+피벗선합류타점';
    } else {
      target = rocket;
      tag = '로켓되돌림타점';
    }
    zonePad = Math.max(atr * 0.25, span * 0.12);
    sl = win.sl;
  } else {
    /** C: OB 안 — win.entry가 이미 OB 터치가. PPL 있으면 합류 */
    if (pplPrice > 0 && Math.abs(win.entry - pplPrice) <= atr * 2.2) {
      target = (win.entry + pplPrice) / 2;
      tag = 'OB+피벗선합류타점';
    } else {
      target = win.entry;
      tag = 'OB존타점';
    }
    zonePad = Math.max(atr * 0.3, target * 0.0004);
    sl = win.sl;
  }

  if (!(sl > 0)) return { mode: 'reject', reasonKo: '타점 · SL무효' };
  if (dir === 'LONG' && !(sl < target)) {
    return { mode: 'reject', reasonKo: '타점 · 롱SL방향' };
  }
  if (dir === 'SHORT' && !(sl > target)) {
    return { mode: 'reject', reasonKo: '타점 · 숏SL방향' };
  }

  /** 방향성 존: 롱은 target 중심 아래쪽 더 허용(수요), 숏은 위쪽 */
  const lo =
    dir === 'LONG' ? target - zonePad * 1.15 : target - zonePad * 0.85;
  const hi =
    dir === 'LONG' ? target + zonePad * 0.85 : target + zonePad * 1.15;

  const tp = roeTargetPrice(target, dir, lev, tpRoe);
  const inZone = mark >= lo && mark <= hi;

  /** 추격: 롱인데 존보다 한참 위 / 숏인데 한참 아래 */
  const chased =
    dir === 'LONG' ? mark > hi + zonePad * 0.5 : mark < lo - zonePad * 0.5;

  if (inZone) {
    const geo = assertDirectionSlTp({
      direction: dir,
      entry: mark,
      sl,
      tp: roeTargetPrice(mark, dir, lev, tpRoe),
    });
    if (!geo.ok) {
      return { mode: 'reject', reasonKo: `타점 · ${geo.reasonKo}` };
    }
    /** 존 안이면 현재가 진입(이미 타점) · SL/TP는 구조 기준 */
    return {
      mode: 'enter_now',
      entry: mark,
      sl: geo.sl,
      tp: geo.tp ?? roeTargetPrice(mark, dir, lev, tpRoe),
      reasonKo: `${tag} · 존터치진입`,
    };
  }

  if (chased || !inZone) {
    const pending: DualStructureTouchPending = {
      signalId: win.signalId,
      symbol: win.symbol || '',
      direction: dir,
      entry: target,
      entryLo: Math.min(lo, hi),
      entryHi: Math.max(lo, hi),
      sl,
      tp,
      source: win.source,
      timeframe: params.timeframe,
      signalKo: `${win.signalKo} · ${tag}대기`,
      evidenceKo: `${tag} · E ${target.toFixed(4)} · 존[${lo.toFixed(4)}~${hi.toFixed(4)}]`,
      analysisTags: [...(win.analysisTags || []), tag, '타점대기'],
      score: win.score,
      slot: win.slot,
      expiresAt: now + TOUCH_EXPIRE_MS,
      createdAt: now,
    };
    return {
      mode: 'wait_touch',
      pending,
      reasonKo: chased
        ? `${tag} · 추격금지·되돌림대기`
        : `${tag} · 타점터치대기`,
    };
  }

  return { mode: 'reject', reasonKo: '타점 · 판정불가' };
}

/** pending 마크 터치 시 진입 파라미터 */
export function resolvePendingTouchEntry(
  p: DualStructureTouchPending,
  mark: number,
  leverage?: number,
  tp1RoePct?: number
): { ok: true; entry: number; sl: number; tp: number } | { ok: false } {
  if (!markTouchesStructureZone(mark, p)) return { ok: false };
  if (p.expiresAt < Date.now()) return { ok: false };
  const lev = Math.max(1, Math.min(125, Number(leverage) || 20));
  const tpRoe =
    Math.max(3, Number(tp1RoePct) || FAST_TP1_ROE_PCT) / 100;
  const tp = roeTargetPrice(mark, p.direction, lev, tpRoe);
  const geo = assertDirectionSlTp({
    direction: p.direction,
    entry: mark,
    sl: p.sl,
    tp,
  });
  if (!geo.ok) return { ok: false };
  return {
    ok: true,
    entry: mark,
    sl: geo.sl,
    tp: geo.tp ?? tp,
  };
}

export type PendingAiZoneResolve =
  | {
      mode: 'enter';
      entry: number;
      sl: number;
      tp: number;
      reasonKo: string;
      via: 'touch' | 'aizone70';
    }
  | { mode: 'abandon'; reasonKo: string }
  | { mode: 'wait'; reasonKo: string };

/**
 * 타점 터치 우선 · 미도달 시 AIZONE 보던방향 ≥70 진입 · 반대≥70 불일치 포기.
 */
export function resolvePendingTouchOrAiZone(params: {
  pending: DualStructureTouchPending;
  mark: number;
  leverage?: number;
  tp1RoePct?: number;
  longPct?: number | null;
  shortPct?: number | null;
  pctMin?: number;
}): PendingAiZoneResolve {
  const p = params.pending;
  const mark = Number(params.mark);
  if (p.expiresAt < Date.now()) {
    return { mode: 'abandon', reasonKo: '타점대기만료 · 포기' };
  }
  if (!(mark > 0)) {
    return { mode: 'wait', reasonKo: '타점대기 · 가격없음' };
  }

  const touch = resolvePendingTouchEntry(
    p,
    mark,
    params.leverage,
    params.tp1RoePct
  );
  if (touch.ok) {
    return {
      mode: 'enter',
      entry: touch.entry,
      sl: touch.sl,
      tp: touch.tp,
      reasonKo: '타점터치진입',
      via: 'touch',
    };
  }

  const snap = readAiZoneEntrySnapshot(p.symbol);
  const longPct =
    params.longPct != null && Number.isFinite(Number(params.longPct))
      ? Number(params.longPct)
      : snap?.longPct != null
        ? Number(snap.longPct)
        : null;
  const shortPct =
    params.shortPct != null && Number.isFinite(Number(params.shortPct))
      ? Number(params.shortPct)
      : snap?.shortPct != null
        ? Number(snap.shortPct)
        : null;

  const pctMin = Math.max(50, Number(params.pctMin) || AIZONE_PCT_MIN_NORMAL);
  const same =
    p.direction === 'LONG' ? longPct : shortPct;
  const opp =
    p.direction === 'LONG' ? shortPct : longPct;

  /** 양쪽 ≥70 이고 갭 작으면 무리 진입 금지 */
  if (
    longPct != null &&
    shortPct != null &&
    longPct >= pctMin &&
    shortPct >= pctMin &&
    Math.abs(longPct - shortPct) <= 8
  ) {
    return {
      mode: 'wait',
      reasonKo: `타점미달 · 양쪽추정 롱${longPct.toFixed(0)}/숏${shortPct.toFixed(0)} · WAIT`,
    };
  }

  /** 반대 방향 ≥70 이고 보던쪽보다 강하면 포기 */
  if (
    opp != null &&
    opp >= pctMin &&
    (same == null || opp >= same + 5)
  ) {
    return {
      mode: 'abandon',
      reasonKo: `AIZONE불일치 · ${p.direction === 'LONG' ? '숏' : '롱'}추정${opp.toFixed(0)}%≥${pctMin} · 타점포기`,
    };
  }

  /** 보던 방향 ≥70 → 타점 못 맞춰도 진입 */
  if (same != null && same >= pctMin) {
    const lev = Math.max(1, Math.min(125, Number(params.leverage) || 20));
    const tpRoe =
      Math.max(3, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT) / 100;
    const tp = roeTargetPrice(mark, p.direction, lev, tpRoe);
    const geo = assertDirectionSlTp({
      direction: p.direction,
      entry: mark,
      sl: p.sl,
      tp,
    });
    if (!geo.ok) {
      return {
        mode: 'wait',
        reasonKo: `AIZONE${same.toFixed(0)}% · SL기하실패 · ${geo.reasonKo}`,
      };
    }
    return {
      mode: 'enter',
      entry: mark,
      sl: geo.sl,
      tp: geo.tp ?? tp,
      reasonKo: `타점미달·AIZONE${p.direction === 'LONG' ? '롱' : '숏'}${same.toFixed(0)}%≥${pctMin}진입`,
      via: 'aizone70',
    };
  }

  const sameKo =
    same != null ? `${same.toFixed(0)}%` : '—';
  return {
    mode: 'wait',
    reasonKo: `타점대기 · AIZONE${p.direction === 'LONG' ? '롱' : '숏'}${sameKo}<${pctMin}`,
  };
}
