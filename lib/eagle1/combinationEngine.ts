/**
 * CombinationEngine — OB+FVG+BPR+POC+Sweep+Absorption 등을 묶고,
 * 표본 n>=30 이고 기대값이 양수일 때만 강한 존으로 승격.
 * 단독 FVG/OB는 강신호 금지. OFI는 Bitget 체결 시리즈가 있을 때만 참여한다.
 */
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { StructureSnapshot } from './structureEngine';
import type { ZoneCluster, ZoneSource } from './zoneEngine';
import type { FamilyStats, SetupFamily } from './zoneExpectancy';
import type { Eagle1MoneyPressure, Eagle1MoneyPressureLive } from './moneyPressureBand';
import type { CandleEventMark } from './candleEventEngine';

export type CombinationKind =
  | 'reversal_cluster_long'
  | 'reversal_cluster_short'
  | 'breakout_continuation_long'
  | 'breakout_continuation_short';

export type CombinationFeatureId =
  | 'ob'
  | 'fvg'
  | 'bpr'
  | 'poc'
  | 'sweep'
  | 'absorption'
  | 'cvd'
  | 'ofi'
  | 'choch'
  | 'bos';

export type CombinationHit = {
  id: CombinationKind;
  labelKo: string;
  direction: 'LONG' | 'SHORT';
  present: CombinationFeatureId[];
  missing: CombinationFeatureId[];
  complete: boolean;
  sampleSize: number;
  tpBeforeSl: number | null;
  netExpectancy: number | null;
  promote: boolean;
  note: string;
};

export type CombinationReport = {
  features: Record<CombinationFeatureId, boolean | null>;
  hits: CombinationHit[];
  promoted: CombinationKind | null;
  promoteClusterId: string | null;
  summaryKo: string;
};

const LONG_REV: CombinationFeatureId[] = ['ob', 'fvg', 'bpr', 'poc', 'sweep', 'absorption', 'cvd', 'ofi'];
const SHORT_REV: CombinationFeatureId[] = ['ob', 'fvg', 'bpr', 'poc', 'sweep', 'absorption', 'cvd', 'ofi'];
const LONG_BO: CombinationFeatureId[] = ['bos', 'poc', 'cvd'];
const SHORT_BO: CombinationFeatureId[] = ['bos', 'poc', 'cvd'];

function srcSet(clusters: ZoneCluster[]): Set<ZoneSource> {
  const s = new Set<ZoneSource>();
  for (const c of clusters) for (const x of c.sources) s.add(x);
  return s;
}

function famStats(families: FamilyStats[] | undefined, ids: SetupFamily[]): FamilyStats | null {
  const rows = (families ?? []).filter((f) => ids.includes(f.family));
  if (!rows.length) return null;
  return rows.reduce((a, b) => (b.sampleSize > a.sampleSize ? b : a));
}

function tri(v: boolean | null | undefined): boolean | null {
  if (v == null) return null;
  return v;
}

export function runCombinationEngine(params: {
  clusters?: ZoneCluster[] | null;
  recommended?: ZoneCluster | null;
  structure: StructureSnapshot;
  money?: Eagle1MoneyPressure | null;
  live?: Eagle1MoneyPressureLive | null;
  candleEvents?: CandleEventMark[] | null;
  families?: FamilyStats[] | null;
}): CombinationReport {
  const clusters = params.clusters ?? [];
  const sources = srcSet(clusters);
  const lastSweep = [...params.structure.events].reverse().find((e) => e.kind === 'SWEEP');
  const lastChoch = [...params.structure.events].reverse().find((e) => e.kind === 'CHOCH');
  const lastBos = [...params.structure.events].reverse().find((e) => e.kind === 'BOS');
  const absorb = (params.candleEvents ?? []).some((e) => e.kind === 'ABSORB' && e.confirmed);
  const cvdUp =
    params.live?.has_cvd && typeof params.live.volumeDelta === 'number' ? params.live.volumeDelta > 0 : null;
  const ofiVal =
    params.live?.has_ofi && typeof params.live.ofi === 'number' && Number.isFinite(params.live.ofi)
      ? params.live.ofi
      : null;
  const ofi = ofiVal == null ? null : ofiVal > 0;

  const features: CombinationReport['features'] = {
    ob: sources.has('ob'),
    fvg: sources.has('fvg'),
    bpr: sources.has('bpr'),
    poc: sources.has('poc') || sources.has('hvn'),
    sweep: lastSweep != null,
    absorption: absorb,
    cvd: cvdUp,
    ofi,
    choch: lastChoch != null,
    bos: lastBos != null,
  };

  const evalHit = (
    id: CombinationKind,
    labelKo: string,
    direction: 'LONG' | 'SHORT',
    need: CombinationFeatureId[],
    extraOk: boolean,
    familyIds: SetupFamily[]
  ): CombinationHit => {
    const featOf = (k: CombinationFeatureId): boolean | null => {
      if (k !== 'ofi') return features[k];
      if (ofiVal == null) return null;
      return direction === 'LONG' ? ofiVal > 0 : ofiVal < 0;
    };
    const measurable = need.filter((k) => featOf(k) !== null);
    const present = measurable.filter((k) => featOf(k) === true);
    const missing = measurable.filter((k) => featOf(k) === false);
    const unknown = need.filter((k) => featOf(k) == null);
    const needCount = Math.max(3, Math.min(4, measurable.length));
    const complete = extraOk && present.length >= needCount;
    const st = famStats(params.families ?? undefined, familyIds);
    const n = st?.sampleSize ?? 0;
    const tp = n >= EAGLE1_MIN_STAT_SAMPLE ? st?.tpBeforeSlRate ?? null : null;
    const ev = n >= EAGLE1_MIN_STAT_SAMPLE ? st?.netExpectancy ?? null : null;
    const promote = complete && n >= EAGLE1_MIN_STAT_SAMPLE && ev != null && ev > 0;
    const note = !extraOk
      ? '방향 조건 미충족'
      : !complete
        ? unknown.length && present.length === 0
          ? '데이터 없음'
          : `조합 미완 · 충족 ${present.length}/${needCount}`
        : n < EAGLE1_MIN_STAT_SAMPLE
          ? n <= 0
            ? '데이터 없음'
            : `통계 부족 (n=${n})`
          : promote
            ? '표본 기대값 양수 · 존 승격'
            : '표본 기대값 비양수 · 승격 안 함';
    return { id, labelKo, direction, present, missing, complete, sampleSize: n, tpBeforeSl: tp, netExpectancy: ev, promote, note };
  };

  const longSweep = lastSweep?.bias === 'bullish';
  const shortSweep = lastSweep?.bias === 'bearish';
  const longBos = lastBos?.bias === 'bullish';
  const shortBos = lastBos?.bias === 'bearish';
  const moneyLong = params.money == null ? true : params.money.score >= 0;
  const moneyShort = params.money == null ? true : params.money.score <= 0;

  const hits: CombinationHit[] = [
    evalHit(
      'reversal_cluster_long',
      '반전 클러스터 롱',
      'LONG',
      LONG_REV,
      longSweep && (lastChoch?.bias !== 'bearish') && moneyLong,
      ['sweep_reversal', 'ob_retest', 'fvg_retest', 'poc_reclaim']
    ),
    evalHit(
      'reversal_cluster_short',
      '반전 클러스터 숏',
      'SHORT',
      SHORT_REV,
      shortSweep && (lastChoch?.bias !== 'bullish') && moneyShort,
      ['sweep_reversal', 'ob_retest', 'fvg_retest', 'poc_hold']
    ),
    evalHit(
      'breakout_continuation_long',
      '돌파 지속 롱',
      'LONG',
      LONG_BO,
      longBos && moneyLong,
      ['poc_reclaim', 'pullback']
    ),
    evalHit(
      'breakout_continuation_short',
      '돌파 지속 숏',
      'SHORT',
      SHORT_BO,
      shortBos && moneyShort,
      ['poc_hold', 'pullback']
    ),
  ];

  const promotedHit = hits.find((h) => h.promote) ?? null;
  const rec = params.recommended;
  const promoteClusterId =
    promotedHit && rec
      ? (promotedHit.direction === 'LONG' && rec.bias !== 'bearish') ||
        (promotedHit.direction === 'SHORT' && rec.bias !== 'bullish')
        ? rec.cluster_id
        : null
      : null;

  const summaryKo = promotedHit
    ? `${promotedHit.labelKo} · ${promotedHit.note}`
    : hits.some((h) => h.complete)
      ? '조합은 맞으나 표본 승격 조건 미달'
      : '강신호 조합 없음 · 단독 SMC 금지';

  return {
    features,
    hits,
    promoted: promoteClusterId ? promotedHit?.id ?? null : null,
    promoteClusterId,
    summaryKo,
  };
}

export function applyCombinationZonePromotion(
  clusters: ZoneCluster[],
  report: CombinationReport
): ZoneCluster[] {
  if (!report.promoteClusterId) return clusters;
  return clusters.map((c) =>
    c.cluster_id === report.promoteClusterId
      ? { ...c, tier: 'S' as const, detail: `${c.detail} · ${report.summaryKo}`.trim() }
      : c
  );
}
