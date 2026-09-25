/**
 * 진입·손절·TP1/2/3 방향 정렬 + ATR 보강.
 * 롱: SL < E < TP1 < TP2 < TP3
 * 숏: TP3 < TP2 < TP1 < E < SL
 */
export type TapExecLevels = {
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
};

function n(v: number | null | undefined): number | null {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
}

export function inferTapDirectionFromLevels(
  entry: number | null,
  sl: number | null,
  direction: 'LONG' | 'SHORT' | null
): 'LONG' | 'SHORT' | null {
  if (direction === 'LONG' || direction === 'SHORT') return direction;
  const e = n(entry);
  const s = n(sl);
  if (e == null || s == null) return null;
  if (s > e) return 'SHORT';
  if (s < e) return 'LONG';
  return null;
}

export function sanitizeTapExecLevels(
  direction: 'LONG' | 'SHORT' | null,
  levels: TapExecLevels
): TapExecLevels {
  const entry = n(levels.entry);
  let sl = n(levels.sl);
  const raw = [n(levels.tp1), n(levels.tp2), n(levels.tp3)].filter(
    (x): x is number => x != null
  );
  if (entry == null) {
    return { entry: null, sl, tp1: n(levels.tp1), tp2: n(levels.tp2), tp3: n(levels.tp3) };
  }
  const dir = inferTapDirectionFromLevels(entry, sl, direction);
  if (!dir) {
    return { entry, sl, tp1: n(levels.tp1), tp2: n(levels.tp2), tp3: n(levels.tp3) };
  }

  if (dir === 'LONG') {
    if (sl != null && !(sl < entry)) sl = null;
    const tps = raw.filter((p) => p > entry).sort((a, b) => a - b);
    return {
      entry,
      sl,
      tp1: tps[0] ?? null,
      tp2: tps[1] ?? null,
      tp3: tps[2] ?? null,
    };
  }

  if (sl != null && !(sl > entry)) sl = null;
  const tps = raw.filter((p) => p < entry).sort((a, b) => b - a);
  return {
    entry,
    sl,
    tp1: tps[0] ?? null,
    tp2: tps[1] ?? null,
    tp3: tps[2] ?? null,
  };
}

/** 잘못된/누락 TP·SL을 ATR로 보강 — 대기 중 EXEC_LEVELS_BAD 과다 방지 */
export function repairTapExecLevels(
  direction: 'LONG' | 'SHORT' | null,
  levels: TapExecLevels,
  atr: number
): TapExecLevels {
  const fixed = sanitizeTapExecLevels(direction, levels);
  const entry = fixed.entry;
  const dir = inferTapDirectionFromLevels(entry, fixed.sl, direction);
  const a = Number(atr);
  if (entry == null || !dir || !(a > 0)) return fixed;

  let sl = fixed.sl;
  let tp1 = fixed.tp1;
  let tp2 = fixed.tp2;
  let tp3 = fixed.tp3;

  if (dir === 'LONG') {
    if (sl == null || !(sl < entry)) sl = entry - a * 1.2;
    if (tp1 == null || !(tp1 > entry)) tp1 = entry + a * 1.2;
    if (tp2 == null || !(tp2 > tp1)) tp2 = tp1 + a * 1.2;
    if (tp3 == null || !(tp3 > tp2)) tp3 = tp2 + a * 0.8;
  } else {
    if (sl == null || !(sl > entry)) sl = entry + a * 1.2;
    if (tp1 == null || !(tp1 < entry)) tp1 = entry - a * 1.2;
    if (tp2 == null || !(tp2 < tp1)) tp2 = tp1 - a * 1.2;
    if (tp3 == null || !(tp3 < tp2)) tp3 = tp2 - a * 0.8;
  }

  return { entry, sl, tp1, tp2, tp3 };
}

export function tapExecLevelsGeometryOk(
  direction: 'LONG' | 'SHORT' | null,
  levels: TapExecLevels
): boolean {
  const e = n(levels.entry);
  const s = n(levels.sl);
  const t = n(levels.tp1);
  if (e == null || s == null || t == null || !direction) return false;
  if (direction === 'LONG') return s < e && t > e;
  return s > e && t < e;
}
