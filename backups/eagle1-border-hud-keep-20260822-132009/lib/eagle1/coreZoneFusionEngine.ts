/**
 * CoreZoneFusionEngine — 다수 Zone Evidence → CORE SUPPORT / CORE RESISTANCE (각 최대 1).
 * min/max 전체 합치지 않고 ZoneDensityProfile peak로 압축.
 * 기존 Eagle1Zone / cluster / unifiedZoneDesk 삭제 없음 — 상위 표시 계층.
 */

import type { Eagle1Zone, ZoneCluster } from './zoneEngine';
import type { MarketZone } from './marketZone';
import { eagle1ZoneToMarketZone } from './marketZone';
import {
  buildZoneDensityProfile,
  densityPeakForDirection,
  zonesToDensityEvidence,
  type ZoneDensityProfile,
} from './zoneDensityProfile';

export type CoreZoneSide = 'SUPPORT' | 'RESISTANCE';

export type CoreZone = {
  id: string;
  side: CoreZoneSide;
  labelEn: 'CORE SUPPORT' | 'CORE RESISTANCE';
  labelKo: string;
  sourceTimeframe: string;
  lower: number;
  upper: number;
  midpoint: number;
  /** 0~100 휴리스틱 강도 — 확률 아님 */
  score: number | null;
  evidenceIds: string[];
  evidenceSources: string[];
  evidenceCount: number;
  density: ZoneDensityProfile;
  state: MarketZone['state'];
  frozen: boolean;
  createdAt: number;
  confirmedAt: number | null;
};

export type CoreZoneFusionReport = {
  support: CoreZone | null;
  resistance: CoreZone | null;
  /** Practical: 화면에 그릴 CORE만 (최대 2) */
  practical: CoreZone[];
  /** 입력 evidence 개수 (개별 박스 수 — 화면 금지용) */
  rawEvidenceCount: number;
  densitySupport: ZoneDensityProfile;
  densityResist: ZoneDensityProfile;
  note: string;
};

function alive(z: Eagle1Zone): boolean {
  return z.status !== 'DELETED' && z.status !== 'INVALID' && z.status !== 'BROKEN';
}

function pickSupportCandidates(zones: Eagle1Zone[], price: number): Eagle1Zone[] {
  return zones.filter((z) => {
    if (!alive(z)) return false;
    if (z.bias === 'bearish' && z.source_type !== 'poc' && z.source_type !== 'hvn' && z.source_type !== 'val') {
      return false;
    }
    /** 지지: 현재가 아래이거나 구간이 가격을 포함 */
    return z.upper <= price * 1.002 || (z.lower <= price && price <= z.upper) || z.bias === 'bullish';
  });
}

function pickResistCandidates(zones: Eagle1Zone[], price: number): Eagle1Zone[] {
  return zones.filter((z) => {
    if (!alive(z)) return false;
    if (z.bias === 'bullish' && z.source_type !== 'poc' && z.source_type !== 'hvn' && z.source_type !== 'vah') {
      return false;
    }
    return z.lower >= price * 0.998 || (z.lower <= price && price <= z.upper) || z.bias === 'bearish';
  });
}

function scoreFromDensity(d: ZoneDensityProfile, evidenceCount: number): number | null {
  if (!d.peakBand || d.evidenceCount <= 0) return null;
  const mix = Math.min(40, evidenceCount * 8);
  const dens = Math.min(50, (d.peakBand.score / Math.max(d.peakScore, 1e-9)) * 50);
  const src = Math.min(10, (d.peakBand.sources.length || 0) * 2);
  return Math.round(Math.min(100, mix + dens + src));
}

function buildCore(params: {
  side: CoreZoneSide;
  timeframe: string;
  density: ZoneDensityProfile;
  candidates: Eagle1Zone[];
  now: number;
}): CoreZone | null {
  const band = params.density.peakBand;
  if (!band || !(band.upper > band.lower)) return null;
  const ids = params.candidates.map((z) => z.zone_id);
  const frozen = params.candidates.some((z) => z.frozen);
  const createdAt = Math.min(...params.candidates.map((z) => z.created_at), params.now);
  return {
    id: `core-${params.side.toLowerCase()}-${params.timeframe}-${Math.round(band.lower)}-${Math.round(band.upper)}`,
    side: params.side,
    labelEn: params.side === 'SUPPORT' ? 'CORE SUPPORT' : 'CORE RESISTANCE',
    labelKo: params.side === 'SUPPORT' ? `CORE SUPPORT ${params.timeframe}` : `CORE RESISTANCE ${params.timeframe}`,
    sourceTimeframe: params.timeframe,
    lower: band.lower,
    upper: band.upper,
    midpoint: (band.lower + band.upper) / 2,
    score: scoreFromDensity(params.density, params.candidates.length),
    evidenceIds: ids,
    evidenceSources: band.sources,
    evidenceCount: params.candidates.length,
    density: params.density,
    state: frozen ? 'CONFIRMED' : 'FRESH',
    frozen,
    createdAt,
    confirmedAt: frozen ? createdAt : null,
  };
}

/**
 * 기존 display clusters가 있으면 density 입력에 포함 (삭제 없이 강화).
 */
export function clustersAsSyntheticZones(clusters: ZoneCluster[], timeframe: string): Eagle1Zone[] {
  return clusters.map((c, i) => ({
    zone_id: `cluster:${c.cluster_id}`,
    source_type: c.sources[0] ?? 'sr',
    timeframe,
    created_at: c.components[0]?.created_at ?? 0,
    lower: c.lower,
    upper: c.upper,
    midpoint: (c.lower + c.upper) / 2,
    strength: c.tier === 'S' ? 80 : c.tier === 'A' ? 65 : 45,
    strengthKind: 'heuristic' as const,
    reason: c.labelKo,
    status: 'CONFIRMED' as const,
    test_count: c.components.reduce((s, z) => s + z.test_count, 0),
    last_test_at: null,
    bias: c.bias,
    tier: c.tier,
    frozen: c.components.some((z) => z.frozen),
  }));
}

export function runCoreZoneFusionEngine(params: {
  zones: Eagle1Zone[];
  timeframe: string;
  price: number;
  symbol?: string;
  displaySupport?: ZoneCluster[] | null;
  displayResist?: ZoneCluster[] | null;
  /** 외부 어댑터 evidence (Mirage/whale 등) — 선택 */
  extraZones?: Eagle1Zone[] | null;
  now?: number;
}): CoreZoneFusionReport {
  const price = params.price;
  const tf = params.timeframe || '15m';
  const now = params.now ?? Math.floor(Date.now() / 1000);
  if (!(price > 0) || !params.zones?.length) {
    const empty = buildZoneDensityProfile({ evidence: [] });
    return {
      support: null,
      resistance: null,
      practical: [],
      rawEvidenceCount: 0,
      densitySupport: empty,
      densityResist: empty,
      note: 'UNAVAILABLE',
    };
  }

  const extras = [
    ...(params.extraZones ?? []),
    ...clustersAsSyntheticZones(params.displaySupport ?? [], tf),
    ...clustersAsSyntheticZones(params.displayResist ?? [], tf),
  ];
  const pool = [...params.zones.filter(alive), ...extras];
  const rawEvidenceCount = pool.length;

  const supportCand = pickSupportCandidates(pool, price);
  const resistCand = pickResistCandidates(pool, price);

  const supportEv = zonesToDensityEvidence(supportCand, params.symbol ?? '');
  const resistEv = zonesToDensityEvidence(resistCand, params.symbol ?? '');

  const densitySupport = densityPeakForDirection(supportEv, 'bullish');
  const densityResist = densityPeakForDirection(resistEv, 'bearish');

  const support = buildCore({
    side: 'SUPPORT',
    timeframe: tf,
    density: densitySupport,
    candidates: supportCand,
    now,
  });
  const resistance = buildCore({
    side: 'RESISTANCE',
    timeframe: tf,
    density: densityResist,
    candidates: resistCand,
    now,
  });

  /** Acceptance: 개별 4박스 대신 CORE 최대 1+1 */
  const practical = [support, resistance].filter((z): z is CoreZone => z != null);

  return {
    support,
    resistance,
    practical,
    rawEvidenceCount,
    densitySupport,
    densityResist,
    note:
      practical.length === 0
        ? 'CORE 없음'
        : `CORE ${practical.map((z) => z.labelEn).join(' · ')} · evidence ${rawEvidenceCount}→${practical.length}`,
  };
}

/** CORE → MarketZone (후속 Strategy fusion 입력) */
export function coreZoneToMarketZone(core: CoreZone, symbol: string): MarketZone {
  return {
    id: core.id,
    symbol,
    type: core.side === 'SUPPORT' ? 'demand' : 'supply',
    direction: core.side === 'SUPPORT' ? 'bullish' : 'bearish',
    sourceTimeframe: core.sourceTimeframe,
    upper: core.upper,
    lower: core.lower,
    midpoint: core.midpoint,
    createdAt: core.createdAt,
    confirmedAt: core.confirmedAt,
    state: core.state,
    freshness: null,
    testCount: 0,
    structuralScore: core.score,
    volumeScore: null,
    flowScore: null,
    liquidityScore: null,
    historicalScore: null,
    evidenceCount: core.evidenceCount,
    evidence: core.evidenceSources.map((s, i) => ({
      id: core.evidenceIds[i] ?? s,
      group: s === 'poc' || s === 'hvn' || s === 'vah' || s === 'val' ? 'PROFILE' : 'STRUCTURE',
      label: s,
      score: null,
      available: true,
    })),
    historicalSample: null,
    reactionRate: null,
    breakRate: null,
    medianMFE: null,
    medianMAE: null,
    medianReaction: null,
    medianDuration: null,
    strength: core.score ?? 0,
    strengthKind: 'heuristic',
    reason: core.labelKo,
    tier: (core.score ?? 0) >= 70 ? 'S' : (core.score ?? 0) >= 50 ? 'A' : 'B',
    frozen: core.frozen,
    lastTestAt: null,
  };
}

/**
 * Acceptance A selftest 입력 — 4개 박스 → CORE SUPPORT 1개, 폭이 full demand보다 좁음.
 */
export function coreZoneFusionAcceptanceA(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const tf = '4H';
  const zones: Eagle1Zone[] = [
    {
      zone_id: 'poc',
      source_type: 'poc',
      timeframe: tf,
      created_at: 1,
      lower: 64270,
      upper: 64290,
      midpoint: 64280,
      strength: 70,
      strengthKind: 'heuristic',
      reason: 'POC',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'neutral',
      tier: 'S',
      frozen: true,
    },
    {
      zone_id: 'ob',
      source_type: 'ob',
      timeframe: tf,
      created_at: 1,
      lower: 64180,
      upper: 64420,
      midpoint: 64300,
      strength: 65,
      strengthKind: 'heuristic',
      reason: 'Bullish OB',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'bullish',
      tier: 'A',
      frozen: true,
    },
    {
      zone_id: 'fvg',
      source_type: 'fvg',
      timeframe: tf,
      created_at: 1,
      lower: 64250,
      upper: 64390,
      midpoint: 64320,
      strength: 60,
      strengthKind: 'heuristic',
      reason: 'FVG',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'bullish',
      tier: 'A',
      frozen: true,
    },
    {
      zone_id: 'demand',
      source_type: 'demand',
      timeframe: tf,
      created_at: 1,
      lower: 64100,
      upper: 64500,
      midpoint: 64300,
      strength: 55,
      strengthKind: 'heuristic',
      reason: 'Demand',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'bullish',
      tier: 'B',
      frozen: true,
    },
  ];

  const price = 65000; // 위쪽 — 전부 지지 후보
  const report = runCoreZoneFusionEngine({ zones, timeframe: tf, price, symbol: 'BTCUSDT' });

  if (report.rawEvidenceCount < 4) notes.push('expected 4+ evidence');
  if (!report.support) notes.push('CORE SUPPORT missing');
  if (report.practical.filter((z) => z.side === 'SUPPORT').length !== 1) {
    notes.push('must show single CORE SUPPORT not 4 boxes');
  }
  if (report.support) {
    const fullSpan = 64500 - 64100;
    const coreSpan = report.support.upper - report.support.lower;
    if (!(coreSpan < fullSpan * 0.85)) {
      notes.push(`CORE not compressed: ${coreSpan.toFixed(0)} vs demand ${fullSpan}`);
    }
    /** density peak는 POC/OB/FVG 겹침 근처 */
    if (report.support.lower > 64360 || report.support.upper < 64210) {
      notes.push(`CORE band away from density: ${report.support.lower}-${report.support.upper}`);
    }
  }

  return { ok: notes.length === 0, notes };
}
