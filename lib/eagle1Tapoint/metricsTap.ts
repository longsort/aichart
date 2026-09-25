/**
 * §30 평가지표 — 승률만 최적화 금지.
 * 표본 부족 시 null (가짜 숫자 금지).
 */
export type TapTradeOutcomeLite = {
  netR: number;
  tpFirst: boolean;
  slFirst: boolean;
  mfe: number;
  mae: number;
};

export type TapMetricsPack = {
  n: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  netEv: number | null;
  avgMfe: number | null;
  avgMae: number | null;
  maxDrawdown: number | null;
  avgWinner: number | null;
  avgLoser: number | null;
  winLossRatio: number | null;
  consecutiveLossMax: number;
  labelKo: '검증' | '통계 부족';
  noteKo: string;
};

const MIN = 30;

export function computeTapMetrics(rows: TapTradeOutcomeLite[]): TapMetricsPack {
  const n = rows.length;
  const empty = (note: string): TapMetricsPack => ({
    n,
    winRate: null,
    profitFactor: null,
    expectancy: null,
    netEv: null,
    avgMfe: null,
    avgMae: null,
    maxDrawdown: null,
    avgWinner: null,
    avgLoser: null,
    winLossRatio: null,
    consecutiveLossMax: 0,
    labelKo: '통계 부족',
    noteKo: note,
  });
  if (n < MIN) return empty(n ? `N=${n}<${MIN}` : '데이터 없음');

  const nets = rows.map((r) => r.netR);
  const wins = nets.filter((x) => x > 0);
  const losses = nets.filter((x) => x < 0);
  const winRate = wins.length / n;
  const sumW = wins.reduce((a, b) => a + b, 0);
  const sumL = Math.abs(losses.reduce((a, b) => a + b, 0));
  const pf = sumL > 0 ? sumW / sumL : wins.length ? null : null;
  const expectancy = nets.reduce((a, b) => a + b, 0) / n;
  const avgMfe = rows.reduce((a, r) => a + r.mfe, 0) / n;
  const avgMae = rows.reduce((a, r) => a + r.mae, 0) / n;
  const avgWinner = wins.length ? sumW / wins.length : null;
  const avgLoser = losses.length ? -sumL / losses.length : null;
  const winLossRatio =
    avgWinner != null && avgLoser != null && Math.abs(avgLoser) > 0
      ? avgWinner / Math.abs(avgLoser)
      : null;

  let eq = 0;
  let peak = 0;
  let maxDd = 0;
  let streak = 0;
  let maxStreak = 0;
  for (const x of nets) {
    eq += x;
    if (eq > peak) peak = eq;
    maxDd = Math.max(maxDd, peak - eq);
    if (x < 0) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else streak = 0;
  }

  return {
    n,
    winRate,
    profitFactor: pf,
    expectancy,
    netEv: expectancy,
    avgMfe,
    avgMae,
    maxDrawdown: maxDd,
    avgWinner,
    avgLoser,
    winLossRatio,
    consecutiveLossMax: maxStreak,
    labelKo: '검증',
    noteKo: `N=${n} WR=${(winRate * 100).toFixed(0)}% PF=${pf != null ? pf.toFixed(2) : '—'} EV=${expectancy.toFixed(3)} (확정아님)`,
  };
}
