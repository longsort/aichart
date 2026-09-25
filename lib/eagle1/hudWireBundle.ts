/**
 * Eagle1 HUD — hero·사이드·플랜·연구 카드 공통 연동 번들 (동일 entry/SL/TP·점수).
 * AI超级变身统计(canonicalTrade)가 있으면 타점·합의·시나리오 경로를 Hub 기준으로 덮어쓴다.
 */
import type { AnalyzeResponse } from '@/types';
import type { Eagle1MainPlan } from './signalEngine';
import type { Eagle1HudPack } from './hudPack';
import type { HistoricalOutcomeReport } from './historicalStatisticsEngine';
import type { SchematicCompareReport } from './schematicCompare';
import type { StructureAcceptanceReport } from './structureAcceptanceEngine';
import { buildEagle1HudSynthesis } from './hudSynthesis';
import { formatPriceCompact } from './chartUx';
import type { Eagle1CanonicalTradeDisplay } from './canonicalTradeDisplay';
import {
  buildHubScenarioPathCluster,
  hubCombinationSupplementKo,
  hubEvidenceLines,
  type HubScenarioPathRow,
} from './hudSuperStatsBridge';
import { AI_SUPER_BIANSHEN_STATS } from './aiSuperBianShenStats';
import {
  resolveHudAiScoreDisplay,
  resolveHudBigLongCandidate,
  resolveHudBitgetCoverageRows,
  resolveHudBreakQualityFactors,
  resolveHudCascadeShortCandidate,
  resolveHudClockFlowDetail,
  resolveHudCombinationEngineKo,
  resolveHudCombinationMiningKo,
  resolveHudCompassConflict,
  resolveHudConfirmBadge,
  resolveHudExecutionLevelsFallback,
  resolveHudFlowSyncKo,
  resolveHudHistoricalReachRows,
  resolveHudInvalidationKo,
  resolveHudLiqZonesKo,
  resolveHudLobResiliencyKo,
  resolveHudMtfCompassRows,
  resolveHudMtfSmartZoneDetail,
  resolveHudPlanEntryRange,
  resolveHudPremiumDiscountPct,
  resolveHudSchematicCompare,
  resolveHudScoreCalibrationFallback,
  resolveHudUnifiedZoneKo,
  resolveHudZoneLevels,
  type HudCandidatePack,
  type HudCompassRow,
  type HudConfirmBadge,
  type HudZoneLevels,
} from './hudCardFallbacks';

export type HudWireBundle = {
  confirm: HudConfirmBadge;
  zoneLevels: HudZoneLevels;
  aiScore: number | null;
  aiScoreText: string;
  calibratedText: string;
  longBias: number;
  shortBias: number;
  heroVerdict: 'LONG' | 'SHORT' | 'WAIT';
  planEntry: string;
  invalidation: string;
  unifiedZone: { lines: string[]; hasAny: boolean };
  liqZones: { summary: string; lines: string[] };
  combinationEngine: { summary: string; hits: string[] };
  combinationMining: { summary: string; rows: string[] };
  lobResiliency: string;
  bitgetCoverage: Array<{ tf: string; text: string }>;
  premiumDiscountPct: number | null;
  historicalReach: { rows: string[]; reaction: string };
  flowSync: string;
  clockFlow: ReturnType<typeof resolveHudClockFlowDetail>;
  sampleSize: number;
  mtfCompass: HudCompassRow[];
  compassConflict: string | null;
  schematic: SchematicCompareReport;
  bigLong: HudCandidatePack;
  cascadeShort: HudCandidatePack;
  mtfSmartZone: ReturnType<typeof resolveHudMtfSmartZoneDetail>;
  breakQualityFactors: ReturnType<typeof resolveHudBreakQualityFactors>;
  /** Hub 시나리오 경로 (과거 PATH UNAVAILABLE 보완) */
  hubPaths: HubScenarioPathRow[];
  hubEvidence: string[];
  hubSourceKo: string;
};

export function buildHudWireBundle(input: {
  analysis: AnalyzeResponse | null;
  hud: Eagle1HudPack | null;
  plan: Eagle1MainPlan | null;
  timeframe: string;
  hist: HistoricalOutcomeReport | null | undefined;
  prem: AnalyzeResponse['eagle1PremiumDiscount'] | null | undefined;
  px: number | null;
  canonicalTrade?: Eagle1CanonicalTradeDisplay | null;
}): HudWireBundle {
  const { analysis, hud, plan, timeframe, hist, prem, px, canonicalTrade = null } = input;
  const confirm = resolveHudConfirmBadge(analysis, plan);
  const zoneLevels = resolveHudZoneLevels(analysis);
  const scoreFb = resolveHudScoreCalibrationFallback(hud, analysis, plan);
  const execLv = resolveHudExecutionLevelsFallback(hud, plan);
  const synthesis = buildEagle1HudSynthesis(analysis);
  const dir = plan?.direction ?? analysis?.verdict;
  let heroVerdict: 'LONG' | 'SHORT' | 'WAIT' =
    synthesis?.verdict ?? (dir === 'LONG' || dir === 'SHORT' ? dir : 'WAIT');
  let longBias = Math.max(0, Math.min(100, Number(analysis?.longScore) || 50));
  let shortBias = Math.max(0, Math.min(100, Number(analysis?.shortScore) || 50));
  let aiScore =
    hud?.scoreCalibration?.aiScore ??
    scoreFb.aiScore ??
    (typeof analysis?.longScore === 'number'
      ? Math.round((analysis.longScore + (analysis.shortScore ?? analysis.longScore)) / 2)
      : null);
  let calibratedText =
    hud?.scoreCalibration?.calibratedText ?? scoreFb.calibratedText ?? '표본 대기';
  const sampleSize = plan?.sampleSize ?? hist?.totalSample ?? 0;
  const mtfCompass = resolveHudMtfCompassRows(hud, analysis);
  const acc = analysis?.eagle1Acceptance as StructureAcceptanceReport | null | undefined;

  let planEntry = resolveHudPlanEntryRange(
    plan,
    execLv,
    zoneLevels,
    dir === 'LONG' || dir === 'SHORT' ? dir : null
  );
  let invalidation = resolveHudInvalidationKo(plan, dir === 'LONG' || dir === 'SHORT' ? dir : null);

  const comboEngine = resolveHudCombinationEngineKo(hud, analysis, plan);
  const comboMining = resolveHudCombinationMiningKo(hud, plan);
  const hubSupp = hubCombinationSupplementKo(canonicalTrade?.superStats, sampleSize);

  if (canonicalTrade?.superStats) {
    const s = canonicalTrade.superStats;
    heroVerdict =
      canonicalTrade.direction === 'LONG' || canonicalTrade.direction === 'SHORT'
        ? canonicalTrade.direction
        : 'WAIT';
    longBias = Math.max(0, Math.min(100, s.longPct));
    shortBias = Math.max(0, Math.min(100, s.shortPct));
    aiScore = Math.round((s.longPct + s.shortPct) / 2 + s.strength * 0.15);
    calibratedText = s.sampleHintKo || calibratedText;
    if (s.entry != null && s.entry > 0) {
      planEntry = formatPriceCompact(s.entry);
    }
    if (s.invalidationKo) invalidation = s.invalidationKo;
  }

  return {
    confirm,
    zoneLevels,
    aiScore,
    aiScoreText: canonicalTrade?.superStats
      ? `${AI_SUPER_BIANSHEN_STATS} · ${Math.round(canonicalTrade.superStats.strength)}`
      : resolveHudAiScoreDisplay(hud, analysis, plan),
    calibratedText,
    longBias,
    shortBias,
    heroVerdict,
    planEntry,
    invalidation,
    unifiedZone: resolveHudUnifiedZoneKo(analysis, zoneLevels),
    liqZones: resolveHudLiqZonesKo(hud, analysis, zoneLevels, plan),
    combinationEngine: {
      summary: hubSupp ? `${comboEngine.summary} · ${hubSupp}` : comboEngine.summary,
      hits: comboEngine.hits,
    },
    combinationMining: {
      summary: hubSupp ? `${comboMining.summary} · ${hubSupp}` : comboMining.summary,
      rows: comboMining.rows,
    },
    lobResiliency: resolveHudLobResiliencyKo(hud, analysis),
    bitgetCoverage: resolveHudBitgetCoverageRows(hud, analysis, timeframe),
    premiumDiscountPct: resolveHudPremiumDiscountPct(prem, plan, px),
    historicalReach: resolveHudHistoricalReachRows(hist, plan),
    flowSync: resolveHudFlowSyncKo(hud, analysis),
    clockFlow: resolveHudClockFlowDetail(hud, analysis),
    sampleSize,
    mtfCompass,
    compassConflict: resolveHudCompassConflict(mtfCompass) ?? hud?.compassConflict ?? null,
    schematic: resolveHudSchematicCompare(hud, analysis, plan),
    bigLong: resolveHudBigLongCandidate(hud, analysis, plan),
    cascadeShort: resolveHudCascadeShortCandidate(hud, analysis, plan),
    mtfSmartZone: resolveHudMtfSmartZoneDetail(hud, analysis, plan),
    breakQualityFactors: resolveHudBreakQualityFactors(acc, plan),
    hubPaths: buildHubScenarioPathCluster(canonicalTrade),
    hubEvidence: hubEvidenceLines(canonicalTrade),
    hubSourceKo: canonicalTrade?.sourceKo || AI_SUPER_BIANSHEN_STATS,
  };
}
