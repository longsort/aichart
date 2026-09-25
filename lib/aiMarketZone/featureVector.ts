/**
 * STEP17 — AMZ Feature Vector (룰/통계/ML 공통 입력).
 * Score→확률 직접변환 금지. 결측은 null 유지 후 정규화 시 0.5 중립.
 */
import type { AmzMarketZone, AmzZoneRole } from './types';

export const AMZ_FEATURE_KEYS = [
  'roleSupport',
  'roleResist',
  'roleMagnet',
  'roleTrap',
  'roleFast',
  'widthAtr',
  'ageNorm',
  'strength',
  'life',
  'fatigue',
  'attack',
  'defense',
  'battle',
  'touchNorm',
  'penetration',
  'dwellNorm',
  'reactionDecay',
  'compression',
  'acceptance',
  'rejection',
  'absorption',
  'replenishment',
  'liqPull',
  'iceberg',
  'stability',
] as const;

export type AmzFeatureKey = (typeof AMZ_FEATURE_KEYS)[number];

export type AmzFeatureVector = {
  keys: typeof AMZ_FEATURE_KEYS;
  /** 0~1 정규화. 결측은 0.5 */
  values: number[];
  raw: Record<AmzFeatureKey, number | null>;
};

function n01(v: number | null | undefined, scale = 100): number {
  if (v == null || !Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, Number(v) / scale));
}

function roleBits(role: AmzZoneRole): Pick<
  Record<AmzFeatureKey, number | null>,
  'roleSupport' | 'roleResist' | 'roleMagnet' | 'roleTrap' | 'roleFast'
> {
  return {
    roleSupport: role === 'DEFENSE_SUPPORT' || role === 'FLIP' ? 1 : 0,
    roleResist: role === 'DEFENSE_RESISTANCE' ? 1 : 0,
    roleMagnet: role === 'MAGNET' ? 1 : 0,
    roleTrap: role === 'LIQUIDITY_TRAP' ? 1 : 0,
    roleFast: role === 'FAST_PASS' ? 1 : 0,
  };
}

/**
 * Zone → Feature. ATR 있으면 폭을 ATR 대비로, 없으면 mid 대비 %.
 */
export function extractAmzFeatures(
  zone: AmzMarketZone,
  atr: number | null
): AmzFeatureVector {
  const mid = (zone.outerLower + zone.outerUpper) / 2;
  const width = Math.max(0, zone.outerUpper - zone.outerLower);
  const widthAtr =
    atr && atr > 0 ? Math.min(1, width / (atr * 4)) : mid > 0 ? Math.min(1, width / mid / 0.02) : 0.5;

  const ageBars =
    zone.confirmedAt != null && zone.createdAt
      ? Math.max(0, (zone.confirmedAt - zone.createdAt) / 60000)
      : zone.dwellBars;
  const ageNorm = Math.min(1, ageBars / 48);

  const raw: Record<AmzFeatureKey, number | null> = {
    ...roleBits(zone.role),
    widthAtr,
    ageNorm,
    strength: n01(zone.currentStrength),
    life: n01(zone.lifeScore),
    fatigue: n01(zone.fatigueScore),
    attack: n01(zone.attackScore),
    defense: n01(zone.defenseScore),
    battle: n01(zone.battleIntensity),
    touchNorm: Math.min(1, zone.touchCount / 8),
    penetration: n01(zone.penetration),
    dwellNorm: Math.min(1, zone.dwellBars / 24),
    reactionDecay: n01(zone.reactionDecayScore),
    compression: n01(zone.compressionScore),
    acceptance: n01(zone.acceptanceScore),
    rejection: n01(zone.rejectionScore),
    absorption: n01(zone.absorptionScore),
    replenishment: n01(zone.replenishmentScore),
    liqPull: n01(zone.liquidityPullScore),
    iceberg: n01(zone.icebergLikelihood),
    stability: n01(zone.stabilityScore),
  };

  const values = AMZ_FEATURE_KEYS.map((k) => {
    const v = raw[k];
    return v == null || !Number.isFinite(v) ? 0.5 : Math.max(0, Math.min(1, v));
  });

  return { keys: AMZ_FEATURE_KEYS, values, raw };
}

export function featureDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 1;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0.5) - (b[i] ?? 0.5);
    s += d * d;
  }
  return Math.sqrt(s / n);
}
