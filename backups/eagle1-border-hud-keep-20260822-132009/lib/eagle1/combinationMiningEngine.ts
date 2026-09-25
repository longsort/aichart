/**
 * CombinationMiningEngine — family×regime 통계. n<30 → 통계 부족.
 * combination + zoneExpectancy 재사용. 가짜 % 금지.
 */
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { CombinationReport } from './combinationEngine';
import type { SetupOutcome, SetupFamily } from './zoneExpectancy';
import { summarizeFamilies } from './zoneExpectancy';

export type CombinationMineRow = {
  family: SetupFamily | string;
  regime: string;
  sampleSize: number;
  tpBeforeSl: number | null;
  slBeforeTp: number | null;
  medianMfe: number | null;
  medianMae: number | null;
  netExpectancy: number | null;
  statLabel: 'ok' | '통계 부족' | '데이터 없음';
};

export type CombinationMiningReport = {
  rows: CombinationMineRow[];
  top: CombinationMineRow | null;
  combinationSummaryKo: string;
  summaryKo: string;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? null;
}

function rate(n: number, hit: number): number | null {
  if (n < EAGLE1_MIN_STAT_SAMPLE) return null;
  return hit / n;
}

export function runCombinationMiningEngine(params: {
  outcomes?: SetupOutcome[] | null;
  combination?: CombinationReport | null;
}): CombinationMiningReport {
  const outcomes = params.outcomes ?? [];
  const byKey = new Map<string, SetupOutcome[]>();
  for (const row of outcomes) {
    const key = `${row.family}|${row.regime || 'UNKNOWN'}`;
    const xs = byKey.get(key) ?? [];
    xs.push(row);
    byKey.set(key, xs);
  }

  const rows: CombinationMineRow[] = [];
  for (const [key, xs] of byKey) {
    const [family, regime] = key.split('|');
    const n = xs.length;
    const tp = xs.filter((r) => r.tpFirst).length;
    const sl = xs.filter((r) => r.slFirst).length;
    rows.push({
      family: (family as SetupFamily) || 'pullback',
      regime: regime || 'UNKNOWN',
      sampleSize: n,
      tpBeforeSl: rate(n, tp),
      slBeforeTp: rate(n, sl),
      medianMfe: n >= EAGLE1_MIN_STAT_SAMPLE ? median(xs.map((r) => r.mfe)) : null,
      medianMae: n >= EAGLE1_MIN_STAT_SAMPLE ? median(xs.map((r) => r.mae)) : null,
      netExpectancy:
        n >= EAGLE1_MIN_STAT_SAMPLE ? xs.reduce((a, r) => a + r.netR, 0) / n : null,
      statLabel: n === 0 ? '데이터 없음' : n < EAGLE1_MIN_STAT_SAMPLE ? '통계 부족' : 'ok',
    });
  }

  /** family 요약도 유지 (regime 무관) — HUD 보조 */
  for (const f of summarizeFamilies(outcomes)) {
    if (f.sampleSize === 0) continue;
    const exists = rows.some((r) => r.family === f.family && r.regime === 'ALL');
    if (exists) continue;
    rows.push({
      family: f.family,
      regime: 'ALL',
      sampleSize: f.sampleSize,
      tpBeforeSl: f.tpBeforeSlRate,
      slBeforeTp: f.slFirstRate,
      medianMfe: f.medianMfe,
      medianMae: f.medianMae,
      netExpectancy: f.netExpectancy,
      statLabel:
        f.sampleSize < EAGLE1_MIN_STAT_SAMPLE
          ? '통계 부족'
          : f.netExpectancy == null
            ? '데이터 없음'
            : 'ok',
    });
  }

  rows.sort((a, b) => {
    const ae = a.netExpectancy ?? -999;
    const be = b.netExpectancy ?? -999;
    if (be !== ae) return be - ae;
    return b.sampleSize - a.sampleSize;
  });

  const top = rows.find((r) => r.statLabel === 'ok') ?? rows[0] ?? null;
  const combo = params.combination?.summaryKo || '조합 없음';
  const summaryKo = top
    ? top.statLabel === 'ok'
      ? `채굴 ${top.family}/${top.regime} · n=${top.sampleSize} · EV ${top.netExpectancy?.toFixed(2) ?? '—'}`
      : `채굴 ${top.family}/${top.regime} · n=${top.sampleSize} · ${top.statLabel}`
    : outcomes.length
      ? '통계 부족'
      : '데이터 없음';

  return {
    rows: rows.slice(0, 24),
    top,
    combinationSummaryKo: combo,
    summaryKo,
  };
}
