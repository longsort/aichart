/**
 * MTFSmartZoneEngine — Zone family 합병 파사드.
 * combination + display clusters → A+ LONG / A+ SHORT (차트 영문 등급).
 * Confirmed zone 좌표는 cluster bounds 그대로 (이동 금지).
 */
import type { CombinationReport } from './combinationEngine';
import type { ZoneCluster } from './zoneEngine';
import type { UnifiedZoneDesk } from './unifiedZoneDesk';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export type MtfSmartZoneGrade = 'A_PLUS' | 'A' | 'WATCH' | null;

export type MtfSmartZone = {
  zoneId: string;
  side: 'LONG' | 'SHORT';
  grade: Exclude<MtfSmartZoneGrade, null>;
  labelEn: 'A+ LONG' | 'A+ SHORT' | 'A LONG' | 'A SHORT' | 'WATCH LONG' | 'WATCH SHORT';
  labelKo: string;
  upper: number;
  lower: number;
  mid: number;
  sources: string[];
  sampleSize: number;
  note: string;
};

export type MtfSmartZoneReport = {
  long: MtfSmartZone | null;
  short: MtfSmartZone | null;
  primary: MtfSmartZone | null;
  summaryKo: string;
};

type Bounds = {
  zoneId: string;
  lower: number;
  upper: number;
  sources: string[];
  sampleSize: number;
};

function gradeFromCombo(
  combo: CombinationReport | null | undefined,
  side: 'LONG' | 'SHORT'
): { grade: MtfSmartZoneGrade; note: string; sample: number } {
  const hit = (combo?.hits ?? []).find((h) => h.direction === side);
  if (!hit) return { grade: null, note: '데이터 없음', sample: 0 };
  if (hit.promote && combo?.promoted) {
    return { grade: 'A_PLUS', note: hit.note, sample: hit.sampleSize };
  }
  if (hit.complete && hit.sampleSize >= EAGLE1_MIN_STAT_SAMPLE) {
    return { grade: 'A', note: hit.note, sample: hit.sampleSize };
  }
  if (hit.complete || hit.present.length >= 3) {
    return { grade: 'WATCH', note: '조합 감시 · 표본/승격 미달', sample: hit.sampleSize };
  }
  return { grade: null, note: hit.note || '강신호 없음', sample: hit.sampleSize };
}

function labelEn(side: 'LONG' | 'SHORT', grade: Exclude<MtfSmartZoneGrade, null>): MtfSmartZone['labelEn'] {
  if (grade === 'A_PLUS') return side === 'LONG' ? 'A+ LONG' : 'A+ SHORT';
  if (grade === 'A') return side === 'LONG' ? 'A LONG' : 'A SHORT';
  return side === 'LONG' ? 'WATCH LONG' : 'WATCH SHORT';
}

function labelKo(side: 'LONG' | 'SHORT', grade: Exclude<MtfSmartZoneGrade, null>): string {
  if (grade === 'A_PLUS') return side === 'LONG' ? 'A+ 롱 합의구간' : 'A+ 숏 합의구간';
  if (grade === 'A') return side === 'LONG' ? 'A 롱 구간' : 'A 숏 구간';
  return side === 'LONG' ? '롱 감시구간' : '숏 감시구간';
}

function pickBounds(
  side: 'LONG' | 'SHORT',
  support: ZoneCluster[],
  resist: ZoneCluster[],
  promoteId: string | null | undefined,
  unified: UnifiedZoneDesk | null | undefined
): Bounds | null {
  const pool = side === 'LONG' ? support : resist;
  const fromPool = (c: ZoneCluster): Bounds => ({
    zoneId: c.cluster_id,
    lower: c.lower,
    upper: c.upper,
    sources: c.sources.map(String),
    sampleSize: c.sampleSize,
  });
  if (promoteId) {
    const hit = pool.find((c) => c.cluster_id === promoteId);
    if (hit) return fromPool(hit);
  }
  const tierS = pool.find((c) => c.tier === 'S');
  if (tierS) return fromPool(tierS);
  if (pool[0]) return fromPool(pool[0]);
  const card = side === 'LONG' ? unified?.support[0] : unified?.resist[0];
  if (!card) return null;
  return {
    zoneId: card.clusterId,
    lower: card.lower,
    upper: card.upper,
    sources: card.sources.map(String),
    sampleSize: card.sampleSize,
  };
}

function toZone(
  side: 'LONG' | 'SHORT',
  bounds: Bounds | null,
  combo: CombinationReport | null | undefined
): MtfSmartZone | null {
  const g = gradeFromCombo(combo, side);
  if (!bounds || g.grade == null) return null;
  return {
    zoneId: bounds.zoneId,
    side,
    grade: g.grade,
    labelEn: labelEn(side, g.grade),
    labelKo: labelKo(side, g.grade),
    upper: bounds.upper,
    lower: bounds.lower,
    mid: (bounds.lower + bounds.upper) / 2,
    sources: bounds.sources,
    sampleSize: g.sample || bounds.sampleSize || 0,
    note: g.note,
  };
}

export function runMtfSmartZoneEngine(params: {
  combination?: CombinationReport | null;
  displaySupport?: ZoneCluster[] | null;
  displayResist?: ZoneCluster[] | null;
  unifiedZones?: UnifiedZoneDesk | null;
}): MtfSmartZoneReport {
  const support = params.displaySupport ?? [];
  const resist = params.displayResist ?? [];
  const combo = params.combination ?? null;
  const long = toZone(
    'LONG',
    pickBounds('LONG', support, resist, combo?.promoteClusterId, params.unifiedZones),
    combo
  );
  const short = toZone(
    'SHORT',
    pickBounds('SHORT', support, resist, combo?.promoteClusterId, params.unifiedZones),
    combo
  );

  let primary: MtfSmartZone | null = null;
  const rank = { A_PLUS: 3, A: 2, WATCH: 1 } as const;
  if (long && short) {
    const lr = rank[long.grade];
    const sr = rank[short.grade];
    primary = lr >= sr ? long : short;
  } else {
    primary = long ?? short;
  }

  const summaryKo = primary
    ? `${primary.labelEn} · ${primary.labelKo} · ${primary.note}`
    : combo?.summaryKo || 'A+ 존 없음 · 통계/합의 부족';

  return { long, short, primary, summaryKo };
}
