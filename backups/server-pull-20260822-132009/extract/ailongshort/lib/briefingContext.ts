import type { AnalyzeResponse } from '@/types';

export type OIState = 'increasing' | 'decreasing' | 'neutral';
export type FundingState = 'positive' | 'negative' | 'neutral';
export type LiquidityState = 'above' | 'below' | 'neutral';

export type LongShortRatioState = 'long_heavy' | 'short_heavy' | 'neutral';

export type BriefingContext = {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  signal: string;
  confidence: number;
  /** 달봉 트렌드 (분·시간·일·주 공통, 상승/하락/횡보) */
  trend1M?: string | null;
  buyPressure: number;
  sellPressure: number;
  volumeDelta: number;
  orderbookImbalance: number;
  oiState: OIState;
  fundingState: FundingState;
  longShortRatioState: LongShortRatioState;
  liquidityState: LiquidityState;
  bosCount: number;
  chochCount: number;
  fvgCount: number;
  obCount: number;
  sweepCount: number;
  patterns: number;
  structureSummary: string;
  regime: string;
  confidenceGrade: string;
  mtfAlignment: string;
  dominantPattern: { type: string; label?: string; confidence: number; bias: string } | null;
  learnedPatternsTop5: Array<{ title: string; score: number; outcome: string }>;
  probability: { long: number; short: number; score: number; reason: string[] };
  entry: string;
  stop: string;
  stopLoss?: string;
  targets: string[];
  rr: number;
  riskFlags: string[];
  verdict: string;
  summary: string;
  trend?: string;
  /** 일/주/월 종가선 안착·이탈·재진입 요약 (AI 브리핑용) */
  closeLevelSummary?: string;
};

/** 분석 결과 + 선택적 시장 데이터로 브리핑용 요약 구조 생성. OpenAI는 이걸 입력으로만 사용 */
export function buildBriefingContext(
  analysis: AnalyzeResponse & {
    regime?: string;
    longScore?: number;
    shortScore?: number;
    confidenceGrade?: string;
    riskFlags?: string[];
    rr?: number;
    mtf?: { summary?: string; alignmentScore?: number };
    multiTF?: { trend1M?: string | null };
    dominantPattern?: { type: string; label?: string; confidence: number; bias: string } | null;
    learnedPatternsTop5?: Array<{ title: string; score: number; outcome: string }>;
  },
  marketData?: {
    currentPrice?: number;
    buyPressure?: number;
    sellPressure?: number;
    volumeDelta?: number;
    oiState?: OIState;
    fundingState?: FundingState;
    orderbookImbalance?: number;
    longShortRatio?: number;
  }
): BriefingContext {
  const e = analysis.engine || {};
  const visible = (e.visibleCandles as { close?: number }[]) || [];
  const lastClose = visible.length ? visible[visible.length - 1]?.close : 0;
  const currentPrice = marketData?.currentPrice ?? lastClose ?? 0;

  const prob = analysis.probability;
  const probability = prob
    ? { long: prob.longProbability, short: prob.shortProbability, score: prob.score, reason: prob.reason || [] }
    : { long: analysis.longScore ?? 50, short: analysis.shortScore ?? 50, score: analysis.confidence, reason: [] };

  const rangeLow = (e.discount ?? e.rangeLow) as number | undefined;
  const rangeHigh = (e.premium ?? e.rangeHigh) as number | undefined;
  const eq = e.equilibrium as number | undefined;
  let liquidityState: LiquidityState = 'neutral';
  if (eq != null && rangeHigh != null && rangeLow != null && currentPrice > 0) {
    const band = (rangeHigh - rangeLow) * 0.15;
    if (currentPrice <= rangeLow + band) liquidityState = 'below';
    else if (currentPrice >= rangeHigh - band) liquidityState = 'above';
  }

  const obImb = marketData?.orderbookImbalance ?? 0;
  let longShortRatioState: LongShortRatioState = 'neutral';
  if (marketData?.longShortRatio != null) {
    if (marketData.longShortRatio > 1.1) longShortRatioState = 'long_heavy';
    else if (marketData.longShortRatio < 0.9) longShortRatioState = 'short_heavy';
  }

  const bos = (e.bos as unknown[]) || [];
  const choch = (e.choch as unknown[]) || [];
  const fvg = (e.fvg as unknown[]) || [];
  const obs = (e.obs as unknown[]) || [];
  const sweeps = (e.sweeps as unknown[]) || [];
  const patterns = (e.patterns as unknown[]) || [];

  return {
    symbol: analysis.symbol,
    timeframe: analysis.timeframe,
    currentPrice,
    signal: analysis.verdict,
    confidence: analysis.confidence,
    trend1M: analysis.multiTF?.trend1M ?? null,
    buyPressure: marketData?.buyPressure ?? 0.5,
    sellPressure: marketData?.sellPressure ?? 0.5,
    volumeDelta: marketData?.volumeDelta ?? 0,
    orderbookImbalance: obImb,
    oiState: marketData?.oiState ?? 'neutral',
    fundingState: marketData?.fundingState ?? 'neutral',
    longShortRatioState,
    liquidityState: obImb > 0.05 ? 'below' : obImb < -0.05 ? 'above' : liquidityState,
    bosCount: bos.length,
    chochCount: choch.length,
    fvgCount: fvg.length,
    obCount: obs.length,
    sweepCount: sweeps.length,
    patterns: patterns.length,
    structureSummary: analysis.summary || '',
    regime: analysis.regime ?? 'range',
    confidenceGrade: analysis.confidenceGrade ?? 'C',
    mtfAlignment: analysis.mtf?.summary ?? `${analysis.mtf?.alignmentScore ?? 0}%`,
    dominantPattern: analysis.dominantPattern ?? null,
    learnedPatternsTop5: (analysis.learnedPatternsTop5 || []).map(p => ({ title: p.title, score: p.score, outcome: p.outcome })),
    probability,
    entry: analysis.entry || '0',
    stop: analysis.stopLoss || '0',
    stopLoss: analysis.stopLoss || '0',
    targets: analysis.targets || [],
    rr: analysis.rr ?? 0,
    riskFlags: analysis.riskFlags || [],
    verdict: analysis.verdict,
    summary: analysis.summary || '',
    trend: e.trend,
    closeLevelSummary: (() => {
      const d = analysis.dailyCloseLevel;
      const w = analysis.weeklyCloseLevel;
      const m = analysis.monthlyCloseLevel;
      const stateKo = (s: string | null | undefined) => (s === 'accepted_above' ? '위 안착' : s === 'accepted_below' ? '아래' : s === 'reclaiming' ? '재진입' : s || '');
      const ds = stateKo(analysis.dailyState);
      const ws = stateKo(analysis.weeklyState);
      const ms = stateKo(analysis.monthlyState);
      const parts: string[] = [];
      if (d != null && ds) parts.push(`일봉 종가 ${d.toLocaleString()} ${ds}`);
      if (w != null && ws) parts.push(`주봉 종가 ${w.toLocaleString()} ${ws}`);
      if (m != null && ms) parts.push(`월봉 종가 ${m.toLocaleString()} ${ms}`);
      if (analysis.closeBias) parts.push(`종가선 기준: ${analysis.closeBias === 'bullish' ? '매수 우세' : analysis.closeBias === 'bearish' ? '매도 우세' : '중립'}`);
      if (analysis.mustHoldCloseLevel != null) parts.push(`유지해야 할 종가선: ${analysis.mustHoldCloseLevel.toLocaleString()}`);
      if (analysis.mustReclaimCloseLevel != null) parts.push(`재탈환해야 할 종가선: ${analysis.mustReclaimCloseLevel.toLocaleString()}`);
      return parts.length ? parts.join(' | ') : undefined;
    })(),
  };
}

/** BriefingContext를 OpenAI user prompt용 문자열로 변환 (거래소 수집/집계/분석 결과 요약) */
export function briefingContextToPromptText(ctx: BriefingContext): string {
  const buyP = typeof ctx.buyPressure === 'number' ? (ctx.buyPressure * 100).toFixed(1) : String(ctx.buyPressure ?? '-');
  const sellP = typeof ctx.sellPressure === 'number' ? (ctx.sellPressure * 100).toFixed(1) : String(ctx.sellPressure ?? '-');
  const volD = typeof ctx.volumeDelta === 'number' ? ctx.volumeDelta.toFixed(0) : String(ctx.volumeDelta ?? '-');
  const obImb = typeof ctx.orderbookImbalance === 'number' ? (ctx.orderbookImbalance * 100).toFixed(1) : String(ctx.orderbookImbalance ?? '-');
  const lines = [
    '[Chart context – server engine result only, do not collect or decide]',
    `symbol: ${ctx.symbol} | timeframe: ${ctx.timeframe} | currentPrice: ${ctx.currentPrice}`,
    `신호: ${ctx.signal} | 신뢰도: ${ctx.confidence}% (${ctx.confidenceGrade})${ctx.trend1M ? ` | 1M 트렌드: ${ctx.trend1M}` : ''}`,
    `buyPressure: ${buyP}% | sellPressure: ${sellP}% | volumeDelta: ${volD} | orderbookImbalance: ${obImb}%`,
    `oiState: ${ctx.oiState} | fundingState: ${ctx.fundingState} | liquidityState: ${ctx.liquidityState}`,
    `bosCount: ${ctx.bosCount} | chochCount: ${ctx.chochCount} | fvgCount: ${ctx.fvgCount} | obCount: ${ctx.obCount} | sweepCount: ${ctx.sweepCount} | patterns: ${ctx.patterns}`,
    `regime: ${ctx.regime} | mtfAlignment: ${ctx.mtfAlignment}`,
    `summary: ${ctx.summary || ctx.structureSummary}`,
    `dominantPattern: ${ctx.dominantPattern ? `${ctx.dominantPattern.label ?? ctx.dominantPattern.type} ${ctx.dominantPattern.confidence}%` : '-'}`,
    `entry: ${ctx.entry} | stopLoss: ${ctx.stop} | targets: ${ctx.targets.join(', ')} | rr: ${ctx.rr}`,
    `riskFlags: ${ctx.riskFlags?.length ? ctx.riskFlags.join(', ') : 'none'}`,
    ...(ctx.closeLevelSummary ? [`closeLevels: ${ctx.closeLevelSummary}`] : []),
  ];
  return lines.join('\n');
}
