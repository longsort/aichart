/**
 * MTF 통계 activeStrike를 통합 타점(unifiedTradePlan)과 정렬.
 */
import type { UnifiedMtfAnalysisStatistics, MtfStrikeLevels } from '@/lib/unifiedMtfAnalysisStatistics';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';

function rr(entry: number, sl: number, tp1: number): number | null {
  if (!entry || !sl || !tp1) return null;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp1 - entry);
  if (risk < 1e-9) return null;
  return Math.round((reward / risk) * 100) / 100;
}

function strikeFromPlan(plan: UnifiedDeskTradePlan): MtfStrikeLevels | null {
  if (plan.direction === 'NEUTRAL' || plan.entry <= 0) return null;
  return {
    entry: plan.entry,
    sl: plan.stopLoss,
    tp1: plan.tp1,
    tp2: plan.tp2,
    tp3: plan.tp3,
    rr: rr(plan.entry, plan.stopLoss, plan.tp1),
  };
}

export function alignMtfStatisticsToUnifiedPlan(
  stats: UnifiedMtfAnalysisStatistics,
  plan: UnifiedDeskTradePlan
): UnifiedMtfAnalysisStatistics {
  const aligned = strikeFromPlan(plan);
  if (!aligned) return stats;

  const side = plan.direction;
  const longStrike = side === 'LONG' ? aligned : stats.longStrike;
  const shortStrike = side === 'SHORT' ? aligned : stats.shortStrike;
  const activeStrike =
    side === 'LONG' || side === 'SHORT' ? { ...aligned, side } : stats.activeStrike;

  const summaryKo = [
    stats.headlineKo.split(' · 타점')[0],
    `타점 E ${Math.round(aligned.entry)} SL ${Math.round(aligned.sl)} TP1 ${Math.round(aligned.tp1)} · 통합 정렬`,
    stats.tiers
      .map((t) => {
        const d =
          t.dominantDirection === 'LONG' ? '롱' : t.dominantDirection === 'SHORT' ? '숏' : '관망';
        return `${t.emoji}${d}`;
      })
      .join(' '),
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    ...stats,
    longStrike,
    shortStrike,
    activeStrike,
    summaryKo,
  };
}
