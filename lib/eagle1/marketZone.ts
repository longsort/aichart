/**
 * MarketZone — MASTER 공통 Zone 계약.
 * 기존 Eagle1Zone을 삭제·교체하지 않고 어댑터로 합병한다.
 * CONFIRMED 이후 lower/upper/midpoint는 미래 봉으로 이동시키지 않는다.
 */

import type { Eagle1Zone, ZoneLifecycle, ZoneSource, ZoneTier } from './zoneEngine';

/** MASTER Zone State (확장). 기존 ZoneLifecycle과 양방향 alias. */
export type MarketZoneState =
  | 'PENDING'
  | 'CONFIRMED'
  | 'FRESH'
  | 'APPROACHING'
  | 'TESTING'
  | 'DEFENDING'
  | 'WEAKENING'
  | 'BREAK_ATTEMPT'
  | 'BROKEN'
  | 'RECLAIMED'
  | 'FLIPPED'
  | 'INVALID'
  | 'DELETED'
  /** 기존 Eagle1 호환 — UI/엔진 내부 유지 */
  | 'TESTED'
  | 'WEAK';

export type MarketZoneDirection = 'bullish' | 'bearish' | 'neutral';

export type MarketZoneEvidence = {
  id: string;
  group:
    | 'STRUCTURE'
    | 'PROFILE'
    | 'LIQUIDITY'
    | 'FLOW'
    | 'POSITIONING'
    | 'VOLATILITY'
    | 'HTF'
    | 'HISTORICAL'
    | 'OTHER';
  label: string;
  /** 없으면 UNAVAILABLE — 0으로 위장하지 않음 */
  score: number | null;
  available: boolean;
};

export type MarketZone = {
  id: string;
  symbol: string;
  type: ZoneSource | string;
  direction: MarketZoneDirection;
  /** 필수 — 생성 TF */
  sourceTimeframe: string;
  upper: number;
  lower: number;
  midpoint: number;
  createdAt: number;
  confirmedAt: number | null;
  state: MarketZoneState;
  freshness: number | null;
  testCount: number;
  structuralScore: number | null;
  volumeScore: number | null;
  flowScore: number | null;
  liquidityScore: number | null;
  historicalScore: number | null;
  evidenceCount: number;
  evidence: MarketZoneEvidence[];
  historicalSample: number | null;
  reactionRate: number | null;
  breakRate: number | null;
  medianMFE: number | null;
  medianMAE: number | null;
  medianReaction: number | null;
  medianDuration: number | null;
  /** Eagle1 전용 필드 보존 */
  strength: number;
  strengthKind: 'heuristic' | '통계 부족';
  reason: string;
  tier: ZoneTier;
  frozen: boolean;
  lastTestAt: number | null;
};

/** 기존 lifecycle → MASTER state (정보 손실 최소화) */
export function zoneLifecycleToMarketState(status: ZoneLifecycle): MarketZoneState {
  switch (status) {
    case 'PENDING':
      return 'PENDING';
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'FRESH':
      return 'FRESH';
    case 'TESTED':
      return 'TESTING';
    case 'WEAK':
      return 'WEAKENING';
    case 'BROKEN':
      return 'BROKEN';
    case 'INVALID':
      return 'INVALID';
    case 'DELETED':
      return 'DELETED';
    default:
      return 'PENDING';
  }
}

/**
 * MASTER state → 기존 ZoneLifecycle.
 * APPROACHING/DEFENDING/BREAK_ATTEMPT/RECLAIMED/FLIPPED 등은
 * 기존 enum에 없으면 가장 가까운 상태로 매핑 (삭제 없이 호환).
 */
export function marketStateToZoneLifecycle(state: MarketZoneState): ZoneLifecycle {
  switch (state) {
    case 'PENDING':
      return 'PENDING';
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'FRESH':
      return 'FRESH';
    case 'APPROACHING':
      return 'FRESH';
    case 'TESTING':
    case 'TESTED':
    case 'DEFENDING':
    case 'BREAK_ATTEMPT':
    case 'RECLAIMED':
      return 'TESTED';
    case 'WEAKENING':
    case 'WEAK':
      return 'WEAK';
    case 'BROKEN':
    case 'FLIPPED':
      return 'BROKEN';
    case 'INVALID':
      return 'INVALID';
    case 'DELETED':
      return 'DELETED';
    default:
      return 'PENDING';
  }
}

/** Eagle1 → MarketZone (라운드트립 가능하도록 원본 필드 보존) */
export function eagle1ZoneToMarketZone(
  z: Eagle1Zone,
  opts?: {
    symbol?: string;
    confirmedAt?: number | null;
    evidence?: MarketZoneEvidence[];
    historicalSample?: number | null;
    reactionRate?: number | null;
    breakRate?: number | null;
    medianMFE?: number | null;
    medianMAE?: number | null;
    medianReaction?: number | null;
    medianDuration?: number | null;
    structuralScore?: number | null;
    volumeScore?: number | null;
    flowScore?: number | null;
    liquidityScore?: number | null;
    historicalScore?: number | null;
    freshness?: number | null;
  }
): MarketZone {
  const evidence = opts?.evidence ?? [];
  const availableEvidence = evidence.filter((e) => e.available && e.score != null);
  return {
    id: z.zone_id,
    symbol: opts?.symbol ?? '',
    type: z.source_type,
    direction: z.bias,
    sourceTimeframe: z.timeframe,
    upper: z.upper,
    lower: z.lower,
    midpoint: z.midpoint,
    createdAt: z.created_at,
    confirmedAt:
      opts?.confirmedAt !== undefined
        ? opts.confirmedAt
        : z.frozen || z.status === 'CONFIRMED' || z.status === 'FRESH'
          ? z.created_at
          : null,
    state: zoneLifecycleToMarketState(z.status),
    freshness: opts?.freshness ?? null,
    testCount: z.test_count,
    structuralScore: opts?.structuralScore ?? null,
    volumeScore: opts?.volumeScore ?? null,
    flowScore: opts?.flowScore ?? null,
    liquidityScore: opts?.liquidityScore ?? null,
    historicalScore: opts?.historicalScore ?? null,
    evidenceCount: availableEvidence.length,
    evidence,
    historicalSample: opts?.historicalSample ?? null,
    reactionRate: opts?.reactionRate ?? null,
    breakRate: opts?.breakRate ?? null,
    medianMFE: opts?.medianMFE ?? null,
    medianMAE: opts?.medianMAE ?? null,
    medianReaction: opts?.medianReaction ?? null,
    medianDuration: opts?.medianDuration ?? null,
    strength: z.strength,
    strengthKind: z.strengthKind,
    reason: z.reason,
    tier: z.tier,
    frozen: z.frozen,
    lastTestAt: z.last_test_at,
  };
}

/** MarketZone → Eagle1Zone (엔진/오버레이 기존 경로 유지) */
export function marketZoneToEagle1Zone(m: MarketZone): Eagle1Zone {
  const source = (m.type || 'sr') as ZoneSource;
  return {
    zone_id: m.id,
    source_type: source,
    timeframe: m.sourceTimeframe,
    created_at: m.createdAt,
    lower: m.lower,
    upper: m.upper,
    midpoint: m.midpoint,
    strength: m.strength,
    strengthKind: m.strengthKind,
    reason: m.reason,
    status: marketStateToZoneLifecycle(m.state),
    test_count: m.testCount,
    last_test_at: m.lastTestAt,
    bias: m.direction,
    tier: m.tier,
    frozen: m.frozen,
  };
}

/** 가격 경계만 비교 (상태 변경은 허용) */
export function marketZoneBoundsEqual(a: MarketZone, b: MarketZone, eps = 1e-8): boolean {
  return (
    Math.abs(a.lower - b.lower) <= eps &&
    Math.abs(a.upper - b.upper) <= eps &&
    Math.abs(a.midpoint - b.midpoint) <= eps
  );
}

/**
 * CONFIRMED(또는 frozen) Zone에 미래 가격을 덮어쓰지 않음.
 * 상태·testCount 등만 갱신하고 bounds는 동결본 유지.
 */
export function applyMarketZoneStateWithoutMovingBounds(
  frozen: MarketZone,
  next: Partial<Pick<MarketZone, 'state' | 'testCount' | 'lastTestAt' | 'reason' | 'freshness' | 'evidence' | 'evidenceCount'>>
): MarketZone {
  if (!(frozen.frozen || frozen.state === 'CONFIRMED' || frozen.state === 'FRESH' || frozen.confirmedAt != null)) {
    return { ...frozen, ...next };
  }
  return {
    ...frozen,
    ...next,
    lower: frozen.lower,
    upper: frozen.upper,
    midpoint: frozen.midpoint,
    createdAt: frozen.createdAt,
    confirmedAt: frozen.confirmedAt,
    sourceTimeframe: frozen.sourceTimeframe,
    frozen: true,
  };
}

/** Round-trip: Eagle1 → Market → Eagle1 핵심 필드 보존 */
export function marketZoneRoundTripOk(z: Eagle1Zone, symbol = 'BTCUSDT'): boolean {
  const m = eagle1ZoneToMarketZone(z, { symbol });
  const back = marketZoneToEagle1Zone(m);
  return (
    back.zone_id === z.zone_id &&
    back.source_type === z.source_type &&
    back.timeframe === z.timeframe &&
    back.lower === z.lower &&
    back.upper === z.upper &&
    back.midpoint === z.midpoint &&
    back.created_at === z.created_at &&
    back.status === z.status &&
    back.test_count === z.test_count &&
    back.bias === z.bias &&
    back.tier === z.tier &&
    back.frozen === z.frozen &&
    m.sourceTimeframe === z.timeframe &&
    m.symbol === symbol
  );
}

/** Phase 2 selftest — 어댑터·동결·lifecycle alias */
export function marketZoneAdapterSelftest(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const base: Eagle1Zone = {
    zone_id: 'ob:test:1',
    source_type: 'ob',
    timeframe: '15m',
    created_at: 1_700_000_000,
    lower: 64210,
    upper: 64360,
    midpoint: 64285,
    strength: 62,
    strengthKind: 'heuristic',
    reason: 'bullish OB',
    status: 'CONFIRMED',
    test_count: 0,
    last_test_at: null,
    bias: 'bullish',
    tier: 'A',
    frozen: true,
  };

  if (!marketZoneRoundTripOk(base)) {
    notes.push('round-trip failed');
  }

  const m = eagle1ZoneToMarketZone(base, { symbol: 'BTCUSDT' });
  if (m.sourceTimeframe !== '15m') notes.push('sourceTimeframe missing');
  if (m.state !== 'CONFIRMED') notes.push('CONFIRMED map failed');
  if (m.confirmedAt == null) notes.push('confirmedAt should be set when frozen');

  const moved = applyMarketZoneStateWithoutMovingBounds(m, {
    state: 'TESTING',
    testCount: 2,
    lastTestAt: 1_700_000_100,
    reason: 'retest',
  });
  if (!marketZoneBoundsEqual(m, moved)) {
    notes.push('CONFIRMED bounds moved — REPAINT FAIL');
  }
  if (moved.state !== 'TESTING' || moved.testCount !== 2) {
    notes.push('state update failed');
  }
  if (marketStateToZoneLifecycle('TESTING') !== 'TESTED') {
    notes.push('TESTING→TESTED alias failed');
  }
  if (zoneLifecycleToMarketState('WEAK') !== 'WEAKENING') {
    notes.push('WEAK→WEAKENING alias failed');
  }
  if (marketStateToZoneLifecycle('FLIPPED') !== 'BROKEN') {
    notes.push('FLIPPED→BROKEN alias failed');
  }

  /** 점수 없음 = null (0 위장 금지) */
  if (m.flowScore !== null || m.volumeScore !== null) {
    notes.push('missing scores must stay null');
  }

  return { ok: notes.length === 0, notes };
}
