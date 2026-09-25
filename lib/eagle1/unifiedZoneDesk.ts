/**
 * Unified zone desk view-model. Clusters already cap support/resist at 2.
 * Stats come from historical sample on the cluster — never invented %.
 */
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { ZoneCluster, ZoneSource } from './zoneEngine';
import type { FamilyStats } from './zoneExpectancy';
import type { Eagle1MoneyPressure } from './moneyPressureBand';

export type UnifiedZoneCard = {
  clusterId: string;
  titleKo: string;
  side: 'support' | 'resist';
  lower: number;
  upper: number;
  statusKo: string;
  sources: ZoneSource[];
  sourceLabels: string[];
  sampleSize: number;
  holdProbability: number | null;
  breakProbability: number | null;
  medianReaction: number | null;
  mfe: number | null;
  mae: number | null;
  testCount: number;
  moneyFlowKo: string;
  cvdKo: string;
  oiKo: string;
  volumeKo: string;
  invalidation: string;
  nextTarget: string;
  statLabel: 'ok' | '통계 부족' | '데이터 없음';
};

export type UnifiedZoneDesk = {
  support: UnifiedZoneCard[];
  resist: UnifiedZoneCard[];
};

const SOURCE_KO: Record<ZoneSource, string> = {
  poc: 'POC',
  hvn: 'Volume Support',
  lvn: 'LVN',
  vah: 'VAH',
  val: 'VAL',
  ob: 'OB',
  fvg: 'FVG',
  bpr: 'BPR',
  breaker: 'Breaker',
  demand: 'Demand',
  supply: 'Supply',
  sr: 'Swing',
  liquidity: 'Liquidity',
};

function statOrNull(n: number, v: number | null | undefined): number | null {
  if (n < EAGLE1_MIN_STAT_SAMPLE || v == null || !Number.isFinite(v)) return null;
  return v;
}

function cardFromCluster(
  c: ZoneCluster,
  side: 'support' | 'resist',
  families: FamilyStats[] | undefined,
  extras: {
    money?: Eagle1MoneyPressure | null;
    oiKo: string;
    cvdKo: string;
    nextTarget: string;
  }
): UnifiedZoneCard {
  const fam = families?.find((f) =>
    c.sources.includes('poc')
      ? f.family === 'poc_hold' || f.family === 'poc_reclaim'
      : c.sources.includes('ob')
        ? f.family === 'ob_retest'
        : c.sources.includes('fvg')
          ? f.family === 'fvg_retest'
          : f.family === 'sweep_reversal'
  );
  const n = Math.max(c.sampleSize, fam?.sampleSize ?? 0);
  const hold = statOrNull(n, fam?.tpBeforeSlRate ?? null);
  const brk = hold != null ? 1 - hold : statOrNull(n, fam?.slFirstRate ?? null);
  const testCount = c.components.reduce((s, z) => s + (z.test_count || 0), 0);
  const frozen = c.components.some((z) => z.frozen);
  const statusKo = frozen ? 'CONFIRMED' : c.reactionLabel || c.components[0]?.status || 'PENDING';
  return {
    clusterId: c.cluster_id,
    titleKo: side === 'support' ? '핵심 지지 (Unified Zone)' : '핵심 저항 (Unified Zone)',
    side,
    lower: c.lower,
    upper: c.upper,
    statusKo,
    sources: c.sources,
    sourceLabels: c.sources.map((s) => SOURCE_KO[s] || s),
    sampleSize: n,
    holdProbability: hold,
    breakProbability: brk,
    medianReaction: statOrNull(n, fam?.medianMfe ?? null),
    mfe: statOrNull(n, fam?.medianMfe ?? null),
    mae: statOrNull(n, fam?.medianMae ?? null),
    testCount,
    moneyFlowKo: extras.money?.stateKo || '데이터 없음',
    cvdKo: extras.cvdKo,
    oiKo: extras.oiKo,
    volumeKo: n > 0 ? `표본 ${n}` : '데이터 없음',
    invalidation: side === 'support' ? `${c.lower.toFixed(0)} 아래 종가` : `${c.upper.toFixed(0)} 위 종가`,
    nextTarget: extras.nextTarget,
    statLabel: n <= 0 ? '데이터 없음' : n < EAGLE1_MIN_STAT_SAMPLE ? '통계 부족' : 'ok',
  };
}

export function buildUnifiedZoneDesk(params: {
  displaySupport?: ZoneCluster[] | null;
  displayResist?: ZoneCluster[] | null;
  families?: FamilyStats[] | null;
  money?: Eagle1MoneyPressure | null;
  oiState?: 'increasing' | 'decreasing' | 'neutral' | null;
  hasCvd?: boolean;
  nextSupportTarget?: number | null;
  nextResistTarget?: number | null;
}): UnifiedZoneDesk {
  const oiKo =
    params.oiState === 'increasing' ? 'OI 증가' : params.oiState === 'decreasing' ? 'OI 감소' : '데이터 없음';
  const cvdKo = params.hasCvd ? (params.money?.note || 'CVD 추정') : '데이터 없음';
  const support = (params.displaySupport ?? []).slice(0, 2).map((c, i, arr) =>
    cardFromCluster(c, 'support', params.families ?? undefined, {
      money: params.money,
      oiKo,
      cvdKo,
      nextTarget:
        params.nextResistTarget != null
          ? String(Math.round(params.nextResistTarget))
          : arr[i + 1]
            ? String(Math.round(arr[i + 1]!.upper))
            : '데이터 없음',
    })
  );
  const resist = (params.displayResist ?? []).slice(0, 2).map((c, i, arr) =>
    cardFromCluster(c, 'resist', params.families ?? undefined, {
      money: params.money,
      oiKo,
      cvdKo,
      nextTarget:
        params.nextSupportTarget != null
          ? String(Math.round(params.nextSupportTarget))
          : arr[i + 1]
            ? String(Math.round(arr[i + 1]!.lower))
            : '데이터 없음',
    })
  );
  return { support, resist };
}
