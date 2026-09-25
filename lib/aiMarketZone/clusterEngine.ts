/**
 * Evidence 클러스터링 + Edge/Core + Attack/Defense (캔들 파생).
 * L2/아이스버그 없으면 null — 0으로 위장하지 않음.
 */
import type { Candle } from '@/types';
import type {
  AmzDataQuality,
  AmzEvidence,
  AmzEvidenceGroup,
  AmzMarketZone,
  AmzProbabilities,
  AmzZoneRole,
  AmzZoneState,
} from './types';

const ROLE_KO: Record<AmzZoneRole, string> = {
  DEFENSE_SUPPORT: '강한 지지',
  DEFENSE_RESISTANCE: '강한 저항',
  MAGNET: '가격 자석',
  LIQUIDITY_TRAP: '유동성 함정',
  FAST_PASS: '관통구간',
  FLIP: '지지·저항 전환',
  BALANCE: '균형구간',
  UNKNOWN: '판단 보류',
};

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

function atrLike(rows: Candle[], endExclusive: number): number {
  const from = Math.max(1, endExclusive - 14);
  let s = 0;
  let c = 0;
  for (let i = from; i < endExclusive; i++) {
    const a = rows[i]!;
    const b = rows[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  const px = Number(rows[endExclusive - 1]?.close) || 1;
  return c > 0 ? s / c : px * 0.004;
}

/** 같은 group 중복 가산 감쇠 */
function groupWeight(evidence: AmzEvidence[]): number {
  const seen = new Set<AmzEvidenceGroup>();
  let w = 0;
  for (const e of evidence.sort((a, b) => b.strength - a.strength)) {
    if (seen.has(e.group)) w += e.strength * 0.35;
    else {
      seen.add(e.group);
      w += e.strength;
    }
  }
  return w;
}

function classifyRole(evs: AmzEvidence[], close: number, mid: number): AmzZoneRole {
  const kinds = new Set(evs.map((e) => e.kind));
  if (kinds.has('lvn') && !kinds.has('hvn') && !kinds.has('bullish_ob') && !kinds.has('bearish_ob')) {
    return 'FAST_PASS';
  }
  if (kinds.has('liquidity_pool') || kinds.has('eqh') || kinds.has('eql')) {
    if (kinds.has('poc') || kinds.has('hvn')) return 'MAGNET';
    return 'LIQUIDITY_TRAP';
  }
  if (kinds.has('poc') || kinds.has('hvn') || kinds.has('bpr')) {
    if (kinds.has('bullish_ob') || kinds.has('demand') || kinds.has('swing_low')) {
      return mid <= close ? 'DEFENSE_SUPPORT' : 'BALANCE';
    }
    if (kinds.has('bearish_ob') || kinds.has('supply') || kinds.has('swing_high')) {
      return mid >= close ? 'DEFENSE_RESISTANCE' : 'BALANCE';
    }
    return 'MAGNET';
  }
  const bull = evs.filter((e) => e.kind === 'bullish_ob' || e.kind === 'demand' || e.kind === 'swing_low').length;
  const bear = evs.filter((e) => e.kind === 'bearish_ob' || e.kind === 'supply' || e.kind === 'swing_high').length;
  if (bull > bear) return 'DEFENSE_SUPPORT';
  if (bear > bull) return 'DEFENSE_RESISTANCE';
  return 'UNKNOWN';
}

function emptyProbs(reason: string): AmzProbabilities {
  return {
    hold: null,
    breakTrue: null,
    fakeBreak: null,
    sweep: null,
    range: null,
    flip: null,
    sampleSize: 0,
    calibrated: false,
    abstainReasonKo: reason,
  };
}

function volumeCoreBand(
  rows: Candle[],
  endExclusive: number,
  outerLo: number,
  outerHi: number
): { coreLo: number; coreHi: number; defensePx: number | null } {
  const bins = 16;
  const step = (outerHi - outerLo) / bins;
  if (!(step > 0)) return { coreLo: outerLo, coreHi: outerHi, defensePx: null };
  const dens = new Array(bins).fill(0) as number[];
  const from = Math.max(0, endExclusive - 80);
  for (let i = from; i < endExclusive; i++) {
    const c = rows[i]!;
    const mid = (Number(c.high) + Number(c.low)) / 2;
    if (mid < outerLo || mid > outerHi) continue;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((mid - outerLo) / step)));
    dens[idx]! += Math.max(0, Number(c.volume) || 0);
  }
  let best = 0;
  let bestI = 0;
  for (let i = 0; i < bins; i++) {
    if (dens[i]! > best) {
      best = dens[i]!;
      bestI = i;
    }
  }
  const coreLo = outerLo + Math.max(0, bestI - 1) * step;
  const coreHi = outerLo + Math.min(bins, bestI + 2) * step;
  const defensePx = outerLo + (bestI + 0.5) * step;
  return { coreLo, coreHi, defensePx: best > 0 ? defensePx : null };
}

function attackDefenseFromCandles(
  rows: Candle[],
  endExclusive: number,
  zoneLo: number,
  zoneHi: number,
  role: AmzZoneRole
): { attack: number; defense: number; intensity: number; compression: number; penetration: number; dwell: number } {
  const look = Math.min(12, endExclusive);
  let buyPress = 0;
  let sellPress = 0;
  let dwell = 0;
  let deep = 0;
  let hlCount = 0;
  let lhCount = 0;
  let prevLow = Infinity;
  let prevHigh = -Infinity;
  for (let i = endExclusive - look; i < endExclusive; i++) {
    if (i < 1) continue;
    const c = rows[i]!;
    const body = Number(c.close) - Number(c.open);
    const vol = Math.max(0, Number(c.volume) || 0);
    const mid = (Number(c.high) + Number(c.low)) / 2;
    if (mid >= zoneLo && mid <= zoneHi) {
      dwell += 1;
      const depth = (mid - zoneLo) / Math.max(1e-9, zoneHi - zoneLo);
      deep = Math.max(deep, role.includes('SUPPORT') ? 1 - depth : depth);
    }
    if (body >= 0) buyPress += vol * (1 + body / Math.max(1e-9, Number(c.close)));
    else sellPress += vol * (1 + Math.abs(body) / Math.max(1e-9, Number(c.close)));
    if (Number(c.low) > prevLow) hlCount += 1;
    if (Number(c.high) < prevHigh) lhCount += 1;
    prevLow = Number(c.low);
    prevHigh = Number(c.high);
  }
  const tot = buyPress + sellPress || 1;
  let attack = 50;
  let defense = 50;
  if (role === 'DEFENSE_SUPPORT' || role === 'FLIP') {
    attack = clamp((sellPress / tot) * 100, 5, 95);
    defense = clamp((buyPress / tot) * 100, 5, 95);
  } else if (role === 'DEFENSE_RESISTANCE') {
    attack = clamp((buyPress / tot) * 100, 5, 95);
    defense = clamp((sellPress / tot) * 100, 5, 95);
  } else {
    attack = clamp(Math.abs(buyPress - sellPress) / tot * 100, 5, 90);
    defense = clamp(100 - attack, 5, 90);
  }
  const compression =
    role === 'DEFENSE_RESISTANCE'
      ? clamp(hlCount * 12, 0, 90)
      : role === 'DEFENSE_SUPPORT'
        ? clamp(lhCount * 12, 0, 90)
        : clamp((hlCount + lhCount) * 6, 0, 70);
  const intensity = clamp((attack + (100 - defense)) / 2 + dwell * 3, 0, 100);
  return {
    attack: Math.round(attack),
    defense: Math.round(defense),
    intensity: Math.round(intensity),
    compression: Math.round(compression),
    penetration: Math.round(deep * 100),
    dwell,
  };
}

export function clusterAmzEvidence(params: {
  evidence: AmzEvidence[];
  candles: Candle[];
  timeframe: string;
  symbol: string;
  dataQuality: AmzDataQuality;
}): AmzMarketZone[] {
  const { evidence, candles, timeframe, symbol, dataQuality } = params;
  const n = candles.length;
  if (n < 40 || evidence.length === 0) return [];
  const endExclusive = n - 1;
  const atr = atrLike(candles, endExclusive);
  const close = Number(candles[endExclusive - 1]?.close) || 0;
  const clusterDist = atr * 0.85;

  const sorted = [...evidence].sort((a, b) => a.mid - b.mid);
  const clusters: AmzEvidence[][] = [];
  for (const e of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push([e]);
      continue;
    }
    const lastMid = last.reduce((s, x) => s + x.mid, 0) / last.length;
    if (Math.abs(e.mid - lastMid) <= clusterDist) last.push(e);
    else clusters.push([e]);
  }

  const zones: AmzMarketZone[] = [];
  for (let ci = 0; ci < clusters.length; ci++) {
    const evs = clusters[ci]!;
    if (evs.length < 1) continue;
    const outerLower = Math.min(...evs.map((e) => e.lower));
    const outerUpper = Math.max(...evs.map((e) => e.upper));
    if (!(outerUpper > outerLower)) continue;
    const mid = (outerLower + outerUpper) / 2;
    const role = classifyRole(evs, close, mid);
    const { coreLo, coreHi, defensePx } = volumeCoreBand(candles, endExclusive, outerLower, outerUpper);
    const scores = attackDefenseFromCandles(candles, endExclusive, outerLower, outerUpper, role);
    const initStr = clamp(groupWeight(evs) / Math.max(1, evs.length), 20, 95);
    const distAtr = Math.abs(close - mid) / Math.max(atr, 1e-9);

    let state: AmzZoneState = 'CONFIRMED';
    if (dataQuality === 'BAD') state = 'DATA_INSUFFICIENT';
    else if (distAtr <= 0.35) state = scores.attack > scores.defense + 15 ? 'WEAKENING' : 'DEFENDING';
    else if (distAtr <= 1.1) state = 'APPROACHING';
    else state = 'FRESH';

    if (scores.penetration >= 70 && scores.attack > 65) state = 'BREAK_ATTEMPT';
    if (dataQuality === 'DEGRADED' && state === 'CONFIRMED') state = 'FRESH';

    const missing: string[] = [];
    if (dataQuality !== 'GOOD') missing.push('데이터 품질 제한');
    missing.push('L2 호가 연속스트림 없음 → 재보충/풀/아이스버그=추정불가');
    missing.push('발자국(Footprint) 없음');
    missing.push('과거 Outcome 표본 미구축 → 확률 Calibration 대기');

    const probs =
      dataQuality === 'BAD'
        ? emptyProbs('DATA INSUFFICIENT')
        : emptyProbs('표본 부족 — WAIT (캘리브레이션 전 확률 표시 금지)');

    const life = clamp(initStr - scores.dwell * 2 - scores.penetration * 0.15, 10, 95);
    const fatigue = clamp(scores.dwell * 8 + scores.penetration * 0.25, 0, 95);
    const stability = clamp(100 - fatigue * 0.6 - (100 - scores.defense) * 0.3, 5, 95);

    const explain: string[] = [
      `증거 ${evs.length}개 · 그룹감쇠 적용`,
      `역할 ${ROLE_KO[role]} · 상태 ${STATE_KO[state]}`,
      `핵심방어대 ${coreLo.toFixed(0)}~${coreHi.toFixed(0)}` +
        (defensePx != null ? ` · 핵심가격≈${defensePx.toFixed(0)}` : ''),
      `공격 ${scores.attack} / 방어 ${scores.defense} (캔들수급 파생 · 호가전투 아님)`,
    ];
    if (scores.compression >= 40) explain.push(`압축 ${scores.compression} — 경계 압박 증가`);

    zones.push({
      id: `amz-${symbol}-${timeframe}-${ci}-${Math.round(mid)}`,
      symbol,
      role,
      roleKo: ROLE_KO[role],
      evidence: evs,
      timeframeSet: [timeframe],
      outerUpper,
      outerLower,
      coreUpper: coreHi,
      coreLower: coreLo,
      criticalEdge:
        role === 'DEFENSE_SUPPORT'
          ? outerLower
          : role === 'DEFENSE_RESISTANCE'
            ? outerUpper
            : null,
      coreDefensePrice: defensePx,
      coreAttackPrice: null,
      maxAbsorptionPrice: null,
      createdAt: Number(candles[evs[0]!.createdAtBar]?.time) || Date.now() / 1000,
      confirmedAt: state === 'DATA_INSUFFICIENT' ? null : Number(candles[endExclusive - 1]?.time) || null,
      state,
      stateKo: STATE_KO[state],
      initialStrength: Math.round(initStr),
      currentStrength: Math.round(clamp(initStr - fatigue * 0.2, 5, 95)),
      lifeScore: Math.round(life),
      fatigueScore: Math.round(fatigue),
      stabilityScore: Math.round(stability),
      attackScore: scores.attack,
      defenseScore: scores.defense,
      battleIntensity: scores.intensity,
      absorptionScore: null,
      replenishmentScore: null,
      liquidityPullScore: null,
      icebergLikelihood: null,
      impactScore: null,
      compressionScore: scores.compression,
      reactionDecayScore: 0,
      penetration: scores.penetration,
      dwellBars: scores.dwell,
      acceptanceScore: null,
      rejectionScore: null,
      touchCount: 0,
      lastReactionPct: null,
      reactionMfePct: null,
      reactionMaePct: null,
      stateLogKo: [],
      probabilities: probs,
      confidence: dataQuality === 'GOOD' ? 'LOW' : 'NONE',
      dataQuality,
      explainKo: explain,
      missingDataKo: missing,
    });
  }

  /** 가격 근접 + 강도 순 — 지지 2 / 저항 2 / 기타 1 */
  const supports = zones
    .filter((z) => z.role === 'DEFENSE_SUPPORT' || (z.role === 'MAGNET' && z.outerUpper <= close))
    .sort((a, b) => Math.abs((a.outerLower + a.outerUpper) / 2 - close) - Math.abs((b.outerLower + b.outerUpper) / 2 - close));
  const resists = zones
    .filter((z) => z.role === 'DEFENSE_RESISTANCE' || (z.role === 'MAGNET' && z.outerLower >= close))
    .sort((a, b) => Math.abs((a.outerLower + a.outerUpper) / 2 - close) - Math.abs((b.outerLower + b.outerUpper) / 2 - close));
  const other = zones
    .filter((z) => z.role === 'FAST_PASS' || z.role === 'LIQUIDITY_TRAP' || z.role === 'BALANCE' || z.role === 'UNKNOWN')
    .sort((a, b) => b.currentStrength - a.currentStrength);

  const picked = [...supports.slice(0, 2), ...resists.slice(0, 2), ...other.slice(0, 1)];
  const ids = new Set(picked.map((z) => z.id));
  return zones.filter((z) => ids.has(z.id)).sort((a, b) => a.outerLower - b.outerLower);
}
