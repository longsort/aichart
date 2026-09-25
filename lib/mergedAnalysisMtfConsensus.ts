/**
 * 통합·분석 — MTF AI 합의 카드 (핵심보드 + 트레이드 + 마감안착 + MTF digest).
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  buildMonthDeskBoardMetrics,
  type MonthDeskBoardMetrics,
} from '@/lib/monthDeskBoardMetrics';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import { computeMonthDeskMtfFusionBoost } from '@/lib/monthDeskMtfFusionBoost';
import {
  digestMtfSignalBoard,
  type MtfSignalBoardDigest,
} from '@/lib/mtfSignalBoardDigest';
import type { TfCloseSettleBoard, TfCloseSettleRow, TfCloseSettleTf } from '@/lib/tfCloseSettleAssessment';
import { chartTfToCloseSettleTf } from '@/lib/tfCloseSettleAssessment';

export const MERGED_MTF_CONSENSUS_TFS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
] as const;

export type MergedMtfConsensusTf = (typeof MERGED_MTF_CONSENSUS_TFS)[number];

const TF_KO: Record<string, string> = {
  '1m': '1분',
  '3m': '3분',
  '5m': '5분',
  '15m': '15분',
  '1h': '1시간',
  '4h': '4시간',
  '1d': '일',
  '1w': '주',
  '1M': '월',
};

const TF_WEIGHT: Record<string, number> = {
  '1m': 0.45,
  '3m': 0.55,
  '5m': 0.65,
  '15m': 0.85,
  '1h': 1.0,
  '4h': 1.35,
  '1d': 1.65,
  '1w': 2.0,
  '1M': 2.4,
};

export type MergedMtfConsensusVoteSource = {
  key: string;
  labelKo: string;
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  weight: number;
};

export type MergedMtfConsensusTfRow = {
  tf: string;
  tfKo: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';
  longScore: number;
  shortScore: number;
  confidence: number;
  sources: MergedMtfConsensusVoteSource[];
  isChartTf: boolean;
};

export type MergedMtfConsensusResult = {
  rows: MergedMtfConsensusTfRow[];
  finalDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  longPct: number;
  shortPct: number;
  confidence: number;
  grade: 'A' | 'B' | 'C' | '—';
  alignedTfCount: number;
  conflict: boolean;
  mtfBlocked: boolean;
  gatesPassCount: number;
  summaryKo: string;
  headlineKo: string;
  reasonsKo: string[];
  trade: {
    entry: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    rr: number | null;
  };
  boardMetrics: MonthDeskBoardMetrics | null;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function dirFromScores(long: number, short: number, margin = 4): 'LONG' | 'SHORT' | 'NEUTRAL' {
  if (long > short + margin) return 'LONG';
  if (short > long + margin) return 'SHORT';
  return 'NEUTRAL';
}

function settleRowVote(row: TfCloseSettleRow): MergedMtfConsensusVoteSource[] {
  const out: MergedMtfConsensusVoteSource[] = [];
  if (row.confirmedEdge === '롱 유리') {
    out.push({ key: 'settle-edge', labelKo: `${row.tfKo} 마감·롱`, bias: 'LONG', weight: 1.6 });
  } else if (row.confirmedEdge === '숏 유리') {
    out.push({ key: 'settle-edge', labelKo: `${row.tfKo} 마감·숏`, bias: 'SHORT', weight: 1.6 });
  }
  if (row.formingVerdict === '안착') {
    if (row.vsPriorClose === '위') {
      out.push({ key: 'settle-form', labelKo: `${row.tfKo} 안착↑`, bias: 'LONG', weight: 1.2 });
    } else if (row.vsPriorClose === '아래') {
      out.push({ key: 'settle-form', labelKo: `${row.tfKo} 안착↓`, bias: 'SHORT', weight: 1.2 });
    }
  } else if (row.formingVerdict === '실패') {
    if (row.confirmedEdge === '롱 유리') {
      out.push({ key: 'settle-fail', labelKo: `${row.tfKo} 안착실패`, bias: 'SHORT', weight: 0.9 });
    } else if (row.confirmedEdge === '숏 유리') {
      out.push({ key: 'settle-fail', labelKo: `${row.tfKo} 안착실패`, bias: 'LONG', weight: 0.9 });
    }
  }
  return out;
}

function analyzeVote(analyze: AnalyzeResponse | null, tag: string): MergedMtfConsensusVoteSource[] {
  if (!analyze) return [];
  const long = Number(analyze.longScore ?? 50);
  const short = Number(analyze.shortScore ?? 50);
  const bias = dirFromScores(long, short, 6);
  if (bias === 'NEUTRAL') return [];
  return [
    {
      key: `analyze-${tag}`,
      labelKo: `AI ${bias === 'LONG' ? '롱' : '숏'} ${Math.round(Math.max(long, short))}%`,
      bias,
      weight: 1.4,
    },
  ];
}

function digestVote(digest: MtfSignalBoardDigest | null | undefined): MergedMtfConsensusVoteSource[] {
  if (!digest) return [];
  const out: MergedMtfConsensusVoteSource[] = [];
  const last = digest.lastBar;
  const prev = digest.prevBar;
  if (last.rocketLong || prev.rocketLong) {
    out.push({ key: 'rocket-l', labelKo: '구조로켓↑', bias: 'LONG', weight: 1.1 });
  }
  if (last.rocketShort || prev.rocketShort) {
    out.push({ key: 'rocket-s', labelKo: '구조로켓↓', bias: 'SHORT', weight: 1.1 });
  }
  if (last.bandLong || prev.bandLong) {
    out.push({ key: 'band-l', labelKo: '밴드↑', bias: 'LONG', weight: 1.0 });
  }
  if (last.bandShort || prev.bandShort) {
    out.push({ key: 'band-s', labelKo: '밴드↓', bias: 'SHORT', weight: 1.0 });
  }
  if (last.closingLong || prev.closingLong) {
    out.push({ key: 'close-l', labelKo: '마감존↑', bias: 'LONG', weight: 1.15 });
  }
  if (last.closingShort || prev.closingShort) {
    out.push({ key: 'close-s', labelKo: '마감존↓', bias: 'SHORT', weight: 1.15 });
  }
  return out;
}

function sourcesToScores(sources: MergedMtfConsensusVoteSource[]): { long: number; short: number; conf: number } {
  let long = 50;
  let short = 50;
  let wSum = 0;
  for (const s of sources) {
    wSum += s.weight;
    if (s.bias === 'LONG') long += 12 * s.weight;
    else if (s.bias === 'SHORT') short += 12 * s.weight;
  }
  const margin = Math.abs(long - short);
  const conf = wSum > 0 ? clamp(48 + margin * 0.85 + wSum * 4, 42, 92) : 45;
  return { long: clamp(long, 0, 100), short: clamp(short, 0, 100), conf };
}

function settleTfForChart(tf: string): TfCloseSettleTf | null {
  return chartTfToCloseSettleTf(tf);
}

function findSettleRow(board: TfCloseSettleBoard | null | undefined, tf: string): TfCloseSettleRow | null {
  if (!board?.rows?.length) return null;
  const mapped = settleTfForChart(tf);
  if (!mapped) return null;
  return board.rows.find((r) => r.tf === mapped) ?? null;
}

function gradeFromConsensus(params: {
  aligned: number;
  conflict: boolean;
  confidence: number;
  gates: number;
  mtfBlocked: boolean;
}): 'A' | 'B' | 'C' | '—' {
  if (params.mtfBlocked) return 'C';
  if (params.conflict) return 'C';
  if (params.aligned >= 6 && params.gates >= 4 && params.confidence >= 72) return 'A';
  if (params.aligned >= 4 && params.confidence >= 58) return 'B';
  if (params.confidence >= 48) return 'C';
  return '—';
}

export function buildMergedMtfConsensus(params: {
  chartTf: string;
  analysis: AnalyzeResponse | null | undefined;
  candles: Candle[] | null | undefined;
  settleBoard: TfCloseSettleBoard | null | undefined;
  mtfAnalyzes: Array<{ tf: string; analyze: AnalyzeResponse | null }>;
  trade: MergedTradeSignal | null | undefined;
  judgment: MergedTradeJudgment | null | undefined;
}): MergedMtfConsensusResult {
  const chartTf = normalizeChartTimeframe(params.chartTf);
  const mtfMap = new Map(params.mtfAnalyzes.map((r) => [normalizeChartTimeframe(r.tf), r.analyze]));

  const boardMetrics =
    params.candles?.length && params.analysis
      ? buildMonthDeskBoardMetrics({
          analysis: params.analysis,
          candles: params.candles,
          board: params.settleBoard ?? null,
          timeframe: chartTf,
        })
      : null;

  const mtfBoost = computeMonthDeskMtfFusionBoost(params.settleBoard, chartTf);
  const gatesPassCount = boardMetrics?.gatesPassCount ?? params.analysis?.confirmedSignal?.gatesPassCount ?? 0;
  const mtfBlocked = !!(boardMetrics?.mtfBlocked ?? params.analysis?.confirmedSignal?.mtfBlocked);

  const rows: MergedMtfConsensusTfRow[] = [];

  for (const tf of MERGED_MTF_CONSENSUS_TFS) {
    const isChartTf = tf === chartTf;
    const sources: MergedMtfConsensusVoteSource[] = [];

    const settleRow = findSettleRow(params.settleBoard, tf);
    if (settleRow) sources.push(...settleRowVote(settleRow));

    const analyze =
      isChartTf ? params.analysis ?? null : mtfMap.get(tf) ?? null;
    if (analyze) {
      sources.push(...analyzeVote(analyze, tf));
      const digest = digestMtfSignalBoard({
        candles: analyze.candles as Candle[] | undefined,
        timeframe: tf,
        structureRocketSignals: analyze.structureRocketSignals,
        overlays: analyze.overlays as OverlayItemLite[] | undefined,
      });
      sources.push(...digestVote(digest));
    }

    if (isChartTf && boardMetrics) {
      if (boardMetrics.verdict === 'LONG' || boardMetrics.verdict === 'SHORT') {
        sources.push({
          key: 'core-board',
          labelKo: `핵심보드 ${boardMetrics.verdictLabel}`,
          bias: boardMetrics.verdict,
          weight: 2.2,
        });
      }
      if (boardMetrics.structure?.summaryKo) {
        const st = boardMetrics.structure;
        const stBias =
          st.bias === 'bullish' ? 'LONG' : st.bias === 'bearish' ? 'SHORT' : 'NEUTRAL';
        if (stBias !== 'NEUTRAL') {
          sources.push({ key: 'structure', labelKo: '구조', bias: stBias, weight: 1.5 });
        }
      }
    }

    if (isChartTf && params.trade?.primary && params.trade.primary !== 'NEUTRAL') {
      sources.push({
        key: 'trade',
        labelKo: `트레이드 ${params.trade.primary === 'LONG' ? '롱' : '숏'}`,
        bias: params.trade.primary,
        weight: 2.0,
      });
    }

    if (isChartTf && params.judgment?.direction && params.judgment.direction !== 'NEUTRAL') {
      sources.push({
        key: 'judgment',
        labelKo: `판단 ${params.judgment.stanceKo}`,
        bias: params.judgment.direction,
        weight: 1.6,
      });
    }

    const { long, short, conf } = sourcesToScores(sources);
    const direction: MergedMtfConsensusTfRow['direction'] =
      sources.length === 0 ? 'WAIT' : dirFromScores(long, short, 5);

    rows.push({
      tf,
      tfKo: TF_KO[tf] ?? tf,
      direction,
      longScore: Math.round(long),
      shortScore: Math.round(short),
      confidence: Math.round(conf),
      sources,
      isChartTf,
    });
  }

  let totalLong = 0;
  let totalShort = 0;
  let weightSum = 0;
  let alignedLong = 0;
  let alignedShort = 0;
  const reasonsKo: string[] = [];

  for (const row of rows) {
    if (row.direction === 'WAIT') continue;
    const w = TF_WEIGHT[row.tf] ?? 1;
    weightSum += w;
    totalLong += row.longScore * w;
    totalShort += row.shortScore * w;
    if (row.direction === 'LONG') alignedLong++;
    if (row.direction === 'SHORT') alignedShort++;
    if (row.isChartTf && row.sources[0]) {
      reasonsKo.push(`${row.tfKo}: ${row.sources.slice(0, 2).map((s) => s.labelKo).join(' · ')}`);
    }
  }

  if (mtfBoost?.summaryKo) reasonsKo.unshift(mtfBoost.summaryKo);
  if (boardMetrics?.verdictReasonKo) reasonsKo.unshift(boardMetrics.verdictReasonKo);

  const scoreSum = Math.max(1e-9, totalLong + totalShort);
  const longPct = weightSum > 0 ? Math.round((totalLong / scoreSum) * 100) : 50;
  const shortPct = 100 - longPct;
  const finalDirection = dirFromScores(longPct, shortPct, 8);
  const alignedTfCount = Math.max(alignedLong, alignedShort);
  const conflict = alignedLong >= 2 && alignedShort >= 2;
  const avgConf =
    rows.filter((r) => r.direction !== 'WAIT').reduce((a, r) => a + r.confidence, 0) /
      Math.max(1, rows.filter((r) => r.direction !== 'WAIT').length);
  const confidence = Math.round(clamp(avgConf + (alignedTfCount >= 5 ? 6 : 0) - (conflict ? 10 : 0), 40, 92));

  const grade = gradeFromConsensus({
    aligned: alignedTfCount,
    conflict,
    confidence,
    gates: gatesPassCount,
    mtfBlocked,
  });

  const trade = params.trade;
  const entry = trade?.entry ?? 0;
  const sl = trade?.stopLoss ?? 0;
  const rr =
    trade && entry > 0 && sl > 0 && trade.tp1 > 0
      ? Math.abs(trade.tp1 - entry) / Math.max(Math.abs(entry - sl), 1e-9)
      : null;

  const headlineKo =
    finalDirection === 'LONG'
      ? `MTF 합의 · 롱 (${alignedTfCount}/${rows.length} TF)`
      : finalDirection === 'SHORT'
        ? `MTF 합의 · 숏 (${alignedTfCount}/${rows.length} TF)`
        : conflict
          ? 'MTF 합의 · 롱·숏 혼재'
          : 'MTF 합의 · 관망';

  const summaryKo = [
    headlineKo,
    `L ${longPct}% / S ${shortPct}% · 신뢰 ${confidence}% · 등급 ${grade}`,
    gatesPassCount > 0 ? `확정 ${gatesPassCount}/5` : null,
    mtfBlocked ? 'MTF 반대·확정 억제' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    rows,
    finalDirection,
    longPct,
    shortPct,
    confidence,
    grade,
    alignedTfCount,
    conflict,
    mtfBlocked,
    gatesPassCount,
    summaryKo,
    headlineKo,
    reasonsKo: [...new Set(reasonsKo)].slice(0, 8),
    trade: {
      entry,
      stopLoss: sl,
      tp1: trade?.tp1 ?? 0,
      tp2: trade?.tp2 ?? 0,
      tp3: trade?.tp3 ?? 0,
      rr: rr != null ? Math.round(rr * 100) / 100 : null,
    },
    boardMetrics,
  };
}

type OverlayItemLite = { label?: string; kind?: string; time1?: number; time2?: number };

export function summarizeMergedMtfConsensusKo(r: MergedMtfConsensusResult): string {
  return r.summaryKo;
}
