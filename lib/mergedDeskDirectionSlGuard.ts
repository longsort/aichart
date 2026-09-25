/**
 * 전코인 롱/숏 기하 가드 — 역행 진입·반대 SL 차단.
 * 롱: 하단(지지) 쪽만 · SL < entry < TP
 * 숏: 상단(저항) 쪽만 · TP < entry < SL
 * + 최소 손절거리(즉시손절 방지)
 * 확정 승률·수익 아님.
 */

/** 가격 최소 손절폭 — 레버·틱·스프레드로 진입 직후 터지는 것 방지 */
export const MIN_SL_PRICE_FRAC = 0.0015; // 0.15%

export type DirectionSlTpOk = {
  ok: true;
  entry: number;
  sl: number;
  tp: number | null;
};

export type DirectionSlTpFail = {
  ok: false;
  reasonKo: string;
};

/**
 * SL을 방향에 맞게 최소 거리 확보.
 * 롱: SL을 더 아래로 · 숏: SL을 더 위로 (여유↑).
 */
export function widenSlToMinDistance(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  minFrac?: number;
}): number {
  const entry = Number(params.entry);
  const sl = Number(params.sl);
  const minFrac = Math.max(MIN_SL_PRICE_FRAC, Number(params.minFrac) || MIN_SL_PRICE_FRAC);
  if (!(entry > 0) || !(sl > 0)) return sl;
  if (params.direction === 'LONG') {
    const floor = entry * (1 - minFrac);
    return Math.min(sl, floor);
  }
  const ceil = entry * (1 + minFrac);
  return Math.max(sl, ceil);
}

/**
 * 현재가가 이미 손절선에 닿았거나 넘어가면 진입 거부.
 * (시장가 체결 직후 즉시손절의 주원인)
 */
export function markClearOfStop(params: {
  direction: 'LONG' | 'SHORT';
  mark: number;
  sl: number;
  bufferFrac?: number;
}): { ok: true } | { ok: false; reasonKo: string } {
  const mark = Number(params.mark);
  const sl = Number(params.sl);
  const buf = Math.max(0.0004, Number(params.bufferFrac) || 0.0006);
  if (!(mark > 0) || !(sl > 0)) {
    return { ok: false, reasonKo: '마크/SL무효' };
  }
  if (params.direction === 'LONG') {
    if (mark <= sl * (1 + buf)) {
      return { ok: false, reasonKo: '롱거부 · 현재가가 손절선 안·이미관통' };
    }
  } else if (mark >= sl * (1 - buf)) {
    return { ok: false, reasonKo: '숏거부 · 현재가가 손절선 안·이미관통' };
  }
  return { ok: true };
}

/**
 * SL/TP가 방향과 맞는지 강제 검사 + 최소거리.
 * 어긋나면 거부(자동 뒤집기 금지 — 잘못된 신호 진입 방지).
 */
export function assertDirectionSlTp(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp?: number | null;
  minFrac?: number;
}): DirectionSlTpOk | DirectionSlTpFail {
  const entry = Number(params.entry);
  let sl = Number(params.sl);
  const tp =
    params.tp != null && Number(params.tp) > 0 ? Number(params.tp) : null;
  const dir = params.direction;
  const minFrac = Math.max(MIN_SL_PRICE_FRAC, Number(params.minFrac) || MIN_SL_PRICE_FRAC);

  if (!(entry > 0)) return { ok: false, reasonKo: '진입가무효' };
  if (!(sl > 0)) return { ok: false, reasonKo: 'SL무효' };

  sl = widenSlToMinDistance({ direction: dir, entry, sl, minFrac });

  if (dir === 'LONG') {
    if (!(sl < entry)) {
      return { ok: false, reasonKo: '롱SL이 진입가 이상 · 역방향손절거부' };
    }
    if (tp != null && !(tp > entry)) {
      return { ok: false, reasonKo: '롱TP가 진입가 이하 · 거부' };
    }
  } else {
    if (!(sl > entry)) {
      return { ok: false, reasonKo: '숏SL이 진입가 이하 · 역방향손절거부' };
    }
    if (tp != null && !(tp < entry)) {
      return { ok: false, reasonKo: '숏TP가 진입가 이상 · 거부' };
    }
  }

  const risk = Math.abs(entry - sl) / entry;
  if (!(risk >= minFrac * 0.95)) {
    return { ok: false, reasonKo: `SL너무가까움(<${(minFrac * 100).toFixed(2)}%)` };
  }

  const clear = markClearOfStop({
    direction: dir,
    mark: entry,
    sl,
    bufferFrac: minFrac * 0.35,
  });
  if (!clear.ok) return { ok: false, reasonKo: clear.reasonKo };

  return { ok: true, entry, sl, tp };
}

/**
 * 레일/피벗 기준 — 롱은 하단·숏은 상단 근처만 허용.
 * 상단에서 롱 / 하단에서 숏 = 즉시 반대방향 손절의 주원인 → 거부.
 */
export function assertRailSideForDirection(params: {
  direction: 'LONG' | 'SHORT';
  mark: number;
  tipUpper: number;
  tipLower: number;
  atr?: number;
}): { ok: true } | { ok: false; reasonKo: string } {
  const mark = Number(params.mark);
  const up = Number(params.tipUpper);
  const lo = Number(params.tipLower);
  if (!(mark > 0) || !(up > 0) || !(lo > 0)) {
    return { ok: false, reasonKo: '레일좌표무효' };
  }
  const hi = Math.max(up, lo);
  const dn = Math.min(up, lo);
  const span = Math.max(hi - dn, Math.abs(mark) * 0.001);
  const atr = Math.max(Number(params.atr) || 0, span * 0.08, mark * 0.0004);
  const mid = (hi + dn) / 2;
  const distHi = Math.abs(mark - hi);
  const distLo = Math.abs(mark - dn);

  if (params.direction === 'LONG') {
    if (distHi + atr * 0.15 < distLo && mark >= mid - atr * 0.1) {
      return {
        ok: false,
        reasonKo: '롱거부 · 상단레일(저항)근접 · 역행손절위험',
      };
    }
    if (mark > mid + atr * 0.85 && distLo > atr * 1.1) {
      return {
        ok: false,
        reasonKo: '롱거부 · 하단타점 미도달·추격',
      };
    }
    return { ok: true };
  }

  if (distLo + atr * 0.15 < distHi && mark <= mid + atr * 0.1) {
    return {
      ok: false,
      reasonKo: '숏거부 · 하단레일(지지)근접 · 역행손절위험',
    };
  }
  if (mark < mid - atr * 0.85 && distHi > atr * 1.1) {
    return {
      ok: false,
      reasonKo: '숏거부 · 상단타점 미도달·추격',
    };
  }
  return { ok: true };
}

/**
 * Parallel Pivot — 롱은 PL, 숏은 PH만. 반대선 근접 시 거부.
 */
export function assertPivotSideForDirection(params: {
  direction: 'LONG' | 'SHORT';
  mark: number;
  plTip: number | null | undefined;
  phTip: number | null | undefined;
  atr?: number;
}): { ok: true } | { ok: false; reasonKo: string } {
  const mark = Number(params.mark);
  if (!(mark > 0)) return { ok: false, reasonKo: '마크무효' };
  const pl =
    params.plTip != null && Number(params.plTip) > 0 ? Number(params.plTip) : null;
  const ph =
    params.phTip != null && Number(params.phTip) > 0 ? Number(params.phTip) : null;
  const atr = Math.max(Number(params.atr) || 0, mark * 0.0005);

  if (params.direction === 'LONG') {
    if (pl == null) return { ok: false, reasonKo: '롱 · PL없음' };
    if (ph != null && Math.abs(mark - ph) + atr * 0.2 < Math.abs(mark - pl)) {
      return { ok: false, reasonKo: '롱거부 · PH(저항)이 더 가까움' };
    }
    return { ok: true };
  }

  if (ph == null) return { ok: false, reasonKo: '숏 · PH없음' };
  if (pl != null && Math.abs(mark - pl) + atr * 0.2 < Math.abs(mark - ph)) {
    return { ok: false, reasonKo: '숏거부 · PL(지지)이 더 가까움' };
  }
  return { ok: true };
}
