import type { AnalyzeResponse, Candle } from '@/types';
import { loadSettings } from '@/lib/settings';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { buildMonthDeskSmcMoneyPack } from '@/lib/monthDeskSmcMoneyPack';
import { computeMonthDeskMtfFusionBoost, type MonthDeskMtfFusionBoost } from '@/lib/monthDeskMtfFusionBoost';
import {
  resolveMonthDeskUnifiedCoreMoney,
  type MonthDeskUnifiedCoreMoney,
} from '@/lib/monthDeskUnifiedCoreMoney';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import {
  refineMonthDeskBoardVerdict,
  type MonthDeskStructureBoardContext,
} from '@/lib/monthDeskBoardFusion';

export type MonthDeskGateItem = { key: string; label: string; pass: boolean };

export type MonthDeskBoardMetrics = {
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  verdictLabel: string;
  confidence: number | null;
  longScore: number;
  shortScore: number;
  longPct: number;
  shortPct: number;
  mtfAlignment: number | null;
  mtfHtf: string | null;
  mtfMtf: string | null;
  mtfLtf: string | null;
  gates: MonthDeskGateItem[];
  gatesPassCount: number;
  readinessText: string | null;
  readinessTier: string | null;
  mtfBlocked: boolean;
  confirmed: boolean;
  summary: string;
  probLong: number | null;
  probShort: number | null;
  mtfBoost: MonthDeskMtfFusionBoost | null;
  ucm: MonthDeskUnifiedCoreMoney | null;
  fusionLine: string | null;
  closePrice: number | null;
  /** 보드 융합 판정 근거 한 줄 */
  verdictReasonKo: string | null;
  /** 타점·구조 종합 등급 */
  entryGrade: 'A' | 'B' | 'C' | '—';
  structure: MonthDeskStructureBoardContext | null;
};

const READINESS_LABEL: Record<string, string> = {
  none: '확정 0/5',
  building: '확정 쌓는 중',
  prepared: '확정 3/5',
  strong: '확정 4/5',
  full: '5/5 (MTF 통과)',
  mtf_veto: '5/5 (MTF 반대·확정 억제)',
};

export function buildMonthDeskBoardMetrics(params: {
  analysis: AnalyzeResponse | null;
  candles: Candle[] | null;
  board: TfCloseSettleBoard | null;
  timeframe: string;
}): MonthDeskBoardMetrics {
  const { analysis, candles, board, timeframe } = params;
  const settings = loadSettings();
  const safe = candles?.length ? sanitizeChartCandlesForSeries(candles) : [];
  const close = safe.length ? Number(safe.at(-1)?.close) : null;

  const mtfBoost = computeMonthDeskMtfFusionBoost(board, timeframe);

  const refined = refineMonthDeskBoardVerdict({
    analysis,
    candles,
    board,
    timeframe,
    mtfBoost,
  });

  const verdict = refined.verdict;
  const verdictLabel = verdict === 'LONG' ? '롱' : verdict === 'SHORT' ? '숏' : '관망';

  const longScore = refined.longScore;
  const shortScore = refined.shortScore;
  const scoreSum = Math.max(0.01, longScore + shortScore);
  const longPct = Math.round((longScore / scoreSum) * 100);
  const shortPct = 100 - longPct;
  const pack =
    safe.length >= 20 && settings.chartMonthDeskMoneyZoneEnabled !== false
      ? buildMonthDeskSmcMoneyPack(safe, timeframe, settings.smcDeskSwingPivot, 'lite', {
          unifiedEntryMerge: true,
        })
      : null;
  const preferSide = verdict === 'WAIT' ? null : verdict;
  const ucm =
    pack && pack.hud.pools.length > 0
      ? resolveMonthDeskUnifiedCoreMoney({
          pools: pack.hud.pools,
          close: close ?? undefined,
          preferSide,
          fusionDirection: preferSide,
          fusionScoreLong: longScore,
          fusionScoreShort: shortScore,
        })
      : null;

  const cs = analysis?.confirmedSignal;
  const tier = cs?.readinessTier;
  const gates: MonthDeskGateItem[] = cs
    ? [
        { key: 'structure', label: '구조', pass: !!cs.structure },
        { key: 'rsi', label: 'RSI', pass: !!cs.rsi },
        { key: 'sr', label: 'S/R', pass: !!cs.supportResistance },
        { key: 'close', label: '종가', pass: !!cs.close },
        { key: 'fvg', label: 'FVG', pass: !!cs.fvgZone },
      ]
    : [];

  const structLine = refined.structure.summaryKo;
  const fusionLine =
    [refined.verdictReasonKo, structLine, mtfBoost?.summaryKo ? `MTF ${mtfBoost.summaryKo}` : null]
      .filter(Boolean)
      .join(' · ') ||
    (analysis?.summary || '').trim() ||
    null;

  return {
    verdict,
    verdictLabel,
    confidence: refined.confidence,
    longScore,
    shortScore,
    longPct,
    shortPct,
    mtfAlignment: typeof analysis?.mtf?.alignmentScore === 'number' ? analysis.mtf.alignmentScore : null,
    mtfHtf: analysis?.mtf?.htfBias ?? null,
    mtfMtf: analysis?.mtf?.mtfBias ?? null,
    mtfLtf: analysis?.mtf?.ltfBias ?? null,
    gates,
    gatesPassCount: gates.filter((g) => g.pass).length,
    readinessText: tier && tier in READINESS_LABEL ? READINESS_LABEL[tier] : null,
    readinessTier: tier ?? null,
    mtfBlocked: !!cs?.mtfBlocked,
    confirmed: !!cs?.confirmed,
    summary: fusionLine ?? '',
    probLong: analysis?.probability?.longProbability ?? null,
    probShort: analysis?.probability?.shortProbability ?? null,
    mtfBoost,
    ucm,
    fusionLine,
    closePrice: close,
    verdictReasonKo: refined.verdictReasonKo,
    entryGrade: refined.entryGrade,
    structure: refined.structure,
  };
}

/** MTF 행 → 롱/숏 편향 점수 (-1 ~ 1) 시각화용 */
export function mtfRowBiasScore(edge: string, forming: string): number {
  let s = 0;
  if (edge === '롱 유리') s += 0.55;
  if (edge === '숏 유리') s -= 0.55;
  if (forming === '안착') s += edge === '숏 유리' ? -0.25 : 0.25;
  if (forming === '실패') s += edge === '롱 유리' ? -0.2 : edge === '숏 유리' ? 0.2 : 0;
  if (forming === '불안') s *= 0.5;
  return Math.max(-1, Math.min(1, s));
}
