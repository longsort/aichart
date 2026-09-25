/**
 * STEP 9–12: Life / Fatigue / Reaction Decay /
 * Compression / Acceptance / Rejection /
 * Break · Fake Break · Sweep · Flip (close confirm, no wick-only).
 * 형성봉으로 확정 금지. 확률 Calibration 전 표시 금지.
 */
import type { Candle } from '@/types';
import type { AmzMarketZone, AmzZoneRole, AmzZoneState } from './types';

const STATE_KO: Record<AmzZoneState, string> = {
  DETECTED: '탐지',
  CONFIRMED: '확정',
  FRESH: '신선',
  APPROACHING: '접근중',
  TESTING: '테스트중',
  DEFENDING: '방어중',
  WEAKENING: '약화중',
  CRITICAL: '임계',
  BREAK_ATTEMPT: '돌파시도',
  BROKEN: '붕괴',
  REJECTED: '거부',
  FAILED_BREAK: '돌파실패',
  RETEST: '재테스트',
  HOLD: '유지',
  FAILED_RETEST: '재테스트실패',
  FLIPPED: '역할전환',
  INVALID: '무효',
  DATA_INSUFFICIENT: '데이터부족',
  WAIT: '대기',
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export type AmzTouchEvent = {
  barIdx: number;
  penetration: number;
  reactionPct: number;
  mfePct: number;
  maePct: number;
  held: boolean;
};

function isSupportLike(role: AmzZoneRole): boolean {
  return role === 'DEFENSE_SUPPORT' || role === 'FLIP';
}

function isResistLike(role: AmzZoneRole): boolean {
  return role === 'DEFENSE_RESISTANCE';
}

/** Zone 터치 이력 — 닫힌 봉만 (endExclusive) */
export function collectZoneTouches(params: {
  candles: Candle[];
  endExclusive: number;
  zoneLo: number;
  zoneHi: number;
  role: AmzZoneRole;
  atr: number;
  lookback?: number;
}): AmzTouchEvent[] {
  const { candles, endExclusive, zoneLo, zoneHi, role, atr } = params;
  const look = Math.min(params.lookback ?? 80, endExclusive);
  const from = Math.max(1, endExclusive - look);
  const out: AmzTouchEvent[] = [];
  const mid = (zoneLo + zoneHi) / 2;
  const width = Math.max(zoneHi - zoneLo, atr * 0.15);

  for (let i = from; i < endExclusive; i++) {
    const c = candles[i]!;
    const hi = Number(c.high);
    const lo = Number(c.low);
    const cl = Number(c.close);
    const overlaps = hi >= zoneLo && lo <= zoneHi;
    if (!overlaps) continue;

    let penetration = 0;
    if (isSupportLike(role)) {
      penetration = clamp((zoneHi - Math.min(lo, zoneHi)) / width, 0, 1.2);
    } else if (isResistLike(role)) {
      penetration = clamp((Math.max(hi, zoneLo) - zoneLo) / width, 0, 1.2);
    } else {
      const depth = Math.min(Math.abs(cl - mid), width) / width;
      penetration = clamp(depth, 0, 1);
    }

    /** 이후 N봉 반응 (닫힌 봉만) */
    const horizon = Math.min(5, endExclusive - 1 - i);
    if (horizon < 1) {
      out.push({
        barIdx: i,
        penetration,
        reactionPct: 0,
        mfePct: 0,
        maePct: 0,
        held: false,
      });
      continue;
    }

    const entry = cl;
    let mfe = 0;
    let mae = 0;
    for (let j = i + 1; j <= i + horizon; j++) {
      const x = candles[j]!;
      if (isSupportLike(role) || (!isResistLike(role) && role !== 'FAST_PASS')) {
        mfe = Math.max(mfe, Number(x.high) - entry);
        mae = Math.max(mae, entry - Number(x.low));
      } else {
        mfe = Math.max(mfe, entry - Number(x.low));
        mae = Math.max(mae, Number(x.high) - entry);
      }
    }
    const closeAt = Number(candles[i + horizon]!.close);
    const reactionPct =
      isResistLike(role)
        ? ((entry - closeAt) / entry) * 100
        : ((closeAt - entry) / entry) * 100;
    const mfePct = (mfe / entry) * 100;
    const maePct = (mae / entry) * 100;
    const held = reactionPct >= 0.08 && mfePct >= 0.08 && !((isSupportLike(role) && closeAt < zoneLo) || (isResistLike(role) && closeAt > zoneHi));

    out.push({
      barIdx: i,
      penetration,
      reactionPct,
      mfePct,
      maePct,
      held,
    });
  }

  /** 연속 터치 압축 — 최소 2봉 간격 */
  const filtered: AmzTouchEvent[] = [];
  for (const t of out) {
    if (filtered.length && t.barIdx - filtered[filtered.length - 1]!.barIdx < 2) continue;
    filtered.push(t);
  }
  return filtered.slice(-12);
}

export function computeReactionDecay(touches: AmzTouchEvent[]): number {
  if (touches.length < 2) return 0;
  const recent = touches.slice(-4);
  const reactions = recent.map((t) => Math.max(0, t.reactionPct));
  if (reactions.length < 2) return 0;
  let decayHits = 0;
  for (let i = 1; i < reactions.length; i++) {
    if (reactions[i]! < reactions[i - 1]! * 0.85) decayHits += 1;
  }
  const avgPen = recent.reduce((s, t) => s + t.penetration, 0) / recent.length;
  return clamp(decayHits * 22 + avgPen * 25, 0, 95);
}

export function computeLifeFatigue(params: {
  initialStrength: number;
  touches: AmzTouchEvent[];
  reactionDecay: number;
  dwellBars: number;
  penetration: number;
  absorptionScore: number | null;
  replenishmentScore: number | null;
}): { life: number; fatigue: number; stability: number } {
  const touchN = params.touches.length;
  const holdRate =
    touchN > 0 ? params.touches.filter((t) => t.held).length / touchN : 0.5;
  const fatigue = clamp(
    touchN * 8 +
      params.reactionDecay * 0.45 +
      params.dwellBars * 4 +
      params.penetration * 0.2 +
      (params.replenishmentScore != null && params.replenishmentScore < 30 ? 12 : 0),
    0,
    95
  );
  const lifeBoost =
    (params.absorptionScore != null ? params.absorptionScore * 0.15 : 0) +
    (params.replenishmentScore != null ? params.replenishmentScore * 0.1 : 0) +
    holdRate * 20;
  const life = clamp(params.initialStrength + lifeBoost - fatigue * 0.55, 5, 95);
  const stability = clamp(100 - fatigue * 0.55 - (1 - holdRate) * 30, 5, 95);
  return {
    life: Math.round(life),
    fatigue: Math.round(fatigue),
    stability: Math.round(stability),
  };
}

/** Compression: HL 반복(저항 아래) / LH 반복(지지 위) + 거리 감소 */
export function computeCompressionScore(params: {
  candles: Candle[];
  endExclusive: number;
  zoneLo: number;
  zoneHi: number;
  role: AmzZoneRole;
  atr: number;
}): { score: number; velocity: number; note: string } {
  const look = Math.min(16, params.endExclusive);
  const from = Math.max(1, params.endExclusive - look);
  const mid = (params.zoneLo + params.zoneHi) / 2;
  let hl = 0;
  let lh = 0;
  let distSum = 0;
  let distN = 0;
  let prevLo = Infinity;
  let prevHi = -Infinity;
  const dists: number[] = [];

  for (let i = from; i < params.endExclusive; i++) {
    const c = params.candles[i]!;
    const lo = Number(c.low);
    const hi = Number(c.high);
    const cl = Number(c.close);
    if (lo > prevLo) hl += 1;
    if (hi < prevHi) lh += 1;
    prevLo = lo;
    prevHi = hi;
    const dist =
      isResistLike(params.role)
        ? Math.max(0, params.zoneLo - cl) / params.atr
        : isSupportLike(params.role)
          ? Math.max(0, cl - params.zoneHi) / params.atr
          : Math.abs(cl - mid) / params.atr;
    dists.push(dist);
    distSum += dist;
    distN += 1;
  }

  const pattern =
    isResistLike(params.role) ? hl : isSupportLike(params.role) ? lh : (hl + lh) / 2;
  let velocity = 0;
  if (dists.length >= 4) {
    const a = dists.slice(0, Math.floor(dists.length / 2));
    const b = dists.slice(Math.floor(dists.length / 2));
    const ma = a.reduce((s, x) => s + x, 0) / a.length;
    const mb = b.reduce((s, x) => s + x, 0) / b.length;
    velocity = clamp((ma - mb) * 40, -40, 60); // 거리 감소면 +
  }
  const avgDist = distN > 0 ? distSum / distN : 2;
  const score = clamp(pattern * 10 + Math.max(0, velocity) + (avgDist < 1.2 ? 15 : 0), 0, 95);
  return {
    score: Math.round(score),
    velocity: Math.round(velocity),
    note: `압축 ${Math.round(score)} · HL/LH패턴 ${pattern} · 거리변화 ${velocity > 0 ? '축소' : '확대'}`,
  };
}

/**
 * Acceptance / Rejection — Zone 밖 종가 체류 vs 빠른 복귀.
 * 꼬리만으로는 Break 확정 안 함.
 */
export function computeAcceptanceRejection(params: {
  candles: Candle[];
  endExclusive: number;
  zoneLo: number;
  zoneHi: number;
  role: AmzZoneRole;
}): { acceptance: number | null; rejection: number | null; note: string } {
  const look = Math.min(10, params.endExclusive);
  if (look < 3) return { acceptance: null, rejection: null, note: 'Acceptance 표본 부족' };

  let outsideBars = 0;
  let reclaimBars = 0;
  let brokeClose = false;

  for (let i = params.endExclusive - look; i < params.endExclusive; i++) {
    const c = params.candles[i]!;
    const cl = Number(c.close);
    const outside =
      isSupportLike(params.role) ? cl < params.zoneLo : isResistLike(params.role) ? cl > params.zoneHi : false;
    if (outside) {
      outsideBars += 1;
      brokeClose = true;
    } else if (brokeClose && cl >= params.zoneLo && cl <= params.zoneHi) {
      reclaimBars += 1;
    } else if (
      brokeClose &&
      ((isSupportLike(params.role) && cl > params.zoneHi) ||
        (isResistLike(params.role) && cl < params.zoneLo))
    ) {
      /* accepted away */
    }
  }

  if (!brokeClose && outsideBars === 0) {
    /** 아직 돌파 종가 없음 — rejection/acceptance 모두 약하거나 null */
    const inside = look;
    return {
      acceptance: null,
      rejection: Math.round(clamp(40 + inside * 3, 0, 70)),
      note: '종가 돌파 없음 · 거부 추정만 (약한)',
    };
  }

  const acceptance = clamp(outsideBars * 14 - reclaimBars * 10, 0, 95);
  const rejection = clamp(reclaimBars * 18 - outsideBars * 6, 0, 95);
  return {
    acceptance: Math.round(acceptance),
    rejection: Math.round(rejection),
    note: `종가밖 ${outsideBars} · 복귀 ${reclaimBars} · 수용${Math.round(acceptance)}/거부${Math.round(rejection)}`,
  };
}

export type AmzBreakVerdict =
  | 'NONE'
  | 'BREAK_ATTEMPT'
  | 'BROKEN'
  | 'FAKE_BREAK'
  | 'SWEEP_REVERSAL'
  | 'HOLD'
  | 'FLIPPED'
  | 'RETEST';

/**
 * Break 규칙:
 * - 꼬리만 = BREAK 확정 금지
 * - 종가 확인 + 후속 1봉 지속 → BROKEN
 * - 종가 돌파 후 N봉 내 Zone 복귀 → FAKE_BREAK
 * - 얕은 돌파 + 빠른 반대 종가 → SWEEP_REVERSAL
 */
export function evaluateBreakHoldFlip(params: {
  candles: Candle[];
  endExclusive: number;
  zoneLo: number;
  zoneHi: number;
  role: AmzZoneRole;
  atr: number;
  acceptance: number | null;
  rejection: number | null;
  compression: number;
  attack: number;
  defense: number;
}): { verdict: AmzBreakVerdict; note: string } {
  const { candles, endExclusive, zoneLo, zoneHi, role, atr } = params;
  if (endExclusive < 4) return { verdict: 'NONE', note: '봉 부족' };

  const c0 = candles[endExclusive - 1]!;
  const c1 = candles[endExclusive - 2]!;
  const c2 = candles[endExclusive - 3]!;
  const close0 = Number(c0.close);
  const close1 = Number(c1.close);
  const high0 = Number(c0.high);
  const low0 = Number(c0.low);

  const wickBeyondSupport = isSupportLike(role) && low0 < zoneLo && close0 >= zoneLo;
  const wickBeyondResist = isResistLike(role) && high0 > zoneHi && close0 <= zoneHi;
  if (wickBeyondSupport || wickBeyondResist) {
    const reclaim = close0 >= zoneLo && close0 <= zoneHi;
    if (reclaim && (params.rejection ?? 0) >= 45) {
      return { verdict: 'SWEEP_REVERSAL', note: '꼬리돌파+종가복귀 · Sweep/Reversal (꼬리≠Break)' };
    }
    return { verdict: 'NONE', note: '꼬리만 돌파 · Break 미확정' };
  }

  const closeBroke =
    (isSupportLike(role) && close0 < zoneLo - atr * 0.05) ||
    (isResistLike(role) && close0 > zoneHi + atr * 0.05);

  const prevBroke =
    (isSupportLike(role) && close1 < zoneLo) || (isResistLike(role) && close1 > zoneHi);

  if (closeBroke && prevBroke && (params.acceptance ?? 0) >= 40) {
    /** Retest hold → flip */
    const backInside =
      (isSupportLike(role) && close0 >= zoneLo && close0 <= zoneHi) ||
      (isResistLike(role) && close0 >= zoneLo && close0 <= zoneHi);
    if (backInside) return { verdict: 'RETEST', note: 'Break 후 Zone 재진입 · Retest' };

    const flippedHold =
      (isSupportLike(role) && close0 < zoneLo && Number(c2.close) < zoneLo) ||
      (isResistLike(role) && close0 > zoneHi && Number(c2.close) > zoneHi);
    if (flippedHold && (params.acceptance ?? 0) >= 55) {
      return { verdict: 'FLIPPED', note: '종가확인 지속 · Flip 후보' };
    }
    return { verdict: 'BROKEN', note: '종가확인+지속 · BROKEN' };
  }

  if (closeBroke && !prevBroke) {
    return { verdict: 'BREAK_ATTEMPT', note: '종가 1회 돌파 · BREAK_ATTEMPT' };
  }

  if (prevBroke && !closeBroke) {
    return { verdict: 'FAKE_BREAK', note: '이전 종가돌파 후 복귀 · FAKE_BREAK' };
  }

  if (
    !closeBroke &&
    params.defense >= params.attack + 8 &&
    (params.rejection ?? 50) >= 40 &&
    params.compression < 70
  ) {
    return { verdict: 'HOLD', note: '방어 우세 · HOLD 참고' };
  }

  return { verdict: 'NONE', note: '명확한 Break/Hold 없음' };
}

function verdictToState(v: AmzBreakVerdict, prev: AmzZoneState): AmzZoneState {
  switch (v) {
    case 'BREAK_ATTEMPT':
      return 'BREAK_ATTEMPT';
    case 'BROKEN':
      return 'BROKEN';
    case 'FAKE_BREAK':
      return 'FAILED_BREAK';
    case 'SWEEP_REVERSAL':
      return 'REJECTED';
    case 'HOLD':
      return prev === 'TESTING' || prev === 'APPROACHING' || prev === 'DEFENDING' ? 'HOLD' : 'DEFENDING';
    case 'FLIPPED':
      return 'FLIPPED';
    case 'RETEST':
      return 'RETEST';
    default:
      return prev;
  }
}

export function enrichZonesWithLifecycle(
  zones: AmzMarketZone[],
  candles: Candle[]
): AmzMarketZone[] {
  const n = candles.length;
  if (n < 40) return zones;
  const endExclusive = n - 1;

  let atrSum = 0;
  let atrN = 0;
  for (let i = Math.max(1, endExclusive - 14); i < endExclusive; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    atrSum += Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    atrN += 1;
  }
  const atr = atrN > 0 ? atrSum / atrN : Number(candles[endExclusive - 1]?.close) * 0.004;

  return zones.map((z) => {
    if (z.dataQuality === 'BAD' || z.state === 'DATA_INSUFFICIENT') {
      return {
        ...z,
        acceptanceScore: null,
        rejectionScore: null,
        touchCount: 0,
        lastReactionPct: null,
        reactionMfePct: null,
        reactionMaePct: null,
        stateLogKo: ['DATA INSUFFICIENT · lifecycle 중단'],
      };
    }

    const touches = collectZoneTouches({
      candles,
      endExclusive,
      zoneLo: z.outerLower,
      zoneHi: z.outerUpper,
      role: z.role,
      atr,
    });
    const decay = computeReactionDecay(touches);
    const { life, fatigue, stability } = computeLifeFatigue({
      initialStrength: z.initialStrength,
      touches,
      reactionDecay: decay,
      dwellBars: z.dwellBars,
      penetration: z.penetration,
      absorptionScore: z.absorptionScore,
      replenishmentScore: z.replenishmentScore,
    });
    const comp = computeCompressionScore({
      candles,
      endExclusive,
      zoneLo: z.outerLower,
      zoneHi: z.outerUpper,
      role: z.role,
      atr,
    });
    const ar = computeAcceptanceRejection({
      candles,
      endExclusive,
      zoneLo: z.outerLower,
      zoneHi: z.outerUpper,
      role: z.role,
    });
    const br = evaluateBreakHoldFlip({
      candles,
      endExclusive,
      zoneLo: z.outerLower,
      zoneHi: z.outerUpper,
      role: z.role,
      atr,
      acceptance: ar.acceptance,
      rejection: ar.rejection,
      compression: comp.score,
      attack: z.attackScore,
      defense: z.defenseScore,
    });

    let state = verdictToState(br.verdict, z.state);
    if (fatigue >= 70 && z.attackScore >= z.defenseScore + 10 && state !== 'BROKEN' && state !== 'FLIPPED') {
      state = 'CRITICAL';
    } else if (decay >= 55 && state === 'DEFENDING') {
      state = 'WEAKENING';
    } else if (touches.length > 0 && z.state === 'APPROACHING') {
      state = state === 'BREAK_ATTEMPT' || state === 'BROKEN' ? state : 'TESTING';
    }

    const last = touches[touches.length - 1];
    const log = [
      `터치 ${touches.length}회 · 감쇠 ${Math.round(decay)}`,
      comp.note,
      ar.note,
      br.note,
      `생명 ${life} · 피로 ${fatigue} · 안정 ${stability}`,
    ];

    const explain = [...z.explainKo];
    if (decay >= 40) explain.push(`반응감쇠 ${Math.round(decay)} · 방어 약화 가능`);
    if (comp.score >= 50) explain.push(`압축 ${comp.score} · 경계 압박`);
    if (br.verdict !== 'NONE') explain.push(br.note);

    return {
      ...z,
      lifeScore: life,
      fatigueScore: fatigue,
      stabilityScore: stability,
      reactionDecayScore: Math.round(decay),
      compressionScore: Math.max(z.compressionScore, comp.score),
      currentStrength: Math.round(clamp(life * 0.6 + z.defenseScore * 0.4 - fatigue * 0.15, 5, 95)),
      acceptanceScore: ar.acceptance,
      rejectionScore: ar.rejection,
      touchCount: touches.length,
      lastReactionPct: last ? Math.round(last.reactionPct * 100) / 100 : null,
      reactionMfePct: last ? Math.round(last.mfePct * 100) / 100 : null,
      reactionMaePct: last ? Math.round(last.maePct * 100) / 100 : null,
      state,
      stateKo: STATE_KO[state],
      stateLogKo: log,
      explainKo: explain.slice(0, 10),
      /** 역할 Flip 시 라벨만 참고 — 확정 Flip은 FLIPPED 상태 */
      role: state === 'FLIPPED' ? 'FLIP' : z.role,
      roleKo: state === 'FLIPPED' ? '지지·저항 전환' : z.roleKo,
    };
  });
}
