/**
 * MTF 분석 통계 — 1m~1M 수집·가중 집계·롱/숏 타점·분/시/일/주/월 tier.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  MERGED_MTF_CONSENSUS_TFS,
  type MergedMtfConsensusResult,
} from '@/lib/mergedAnalysisMtfConsensus';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import { mergeMtfAnalyzesWithChart } from '@/lib/mergedIntegratedMtfBoard';

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

export type MtfStatTier = 'minute' | 'hour' | 'day' | 'week' | 'month';

export type MtfStrikeLevels = {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number | null;
};

export type MtfTfAnalysisDetail = {
  tf: string;
  tfKo: string;
  tier: MtfStatTier;
  isChartTf: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';
  longScore: number;
  shortScore: number;
  confidence: number;
  weight: number;
  price: number | null;
  longStrike: MtfStrikeLevels | null;
  shortStrike: MtfStrikeLevels | null;
  activeStrike: MtfStrikeLevels | null;
  summaryKo: string;
  live: boolean;
};

export type MtfTierStatistics = {
  tier: MtfStatTier;
  labelKo: string;
  emoji: string;
  tfs: string[];
  longCount: number;
  shortCount: number;
  neutralCount: number;
  waitCount: number;
  dominantDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  longPct: number;
  shortPct: number;
  avgConfidence: number;
  weightedLongPct: number;
  longStrike: MtfStrikeLevels | null;
  shortStrike: MtfStrikeLevels | null;
  headlineKo: string;
  details: MtfTfAnalysisDetail[];
};

export type UnifiedMtfAnalysisStatistics = {
  symbol: string;
  chartTf: string;
  updatedAt: number;
  sampleCount: number;
  liveTfCount: number;
  statisticalVerdict: 'LONG' | 'SHORT' | 'NEUTRAL';
  longVotes: number;
  shortVotes: number;
  neutralVotes: number;
  weightedLongPct: number;
  weightedShortPct: number;
  confidence: number;
  headlineKo: string;
  summaryKo: string;
  longStrike: MtfStrikeLevels | null;
  shortStrike: MtfStrikeLevels | null;
  activeStrike: (MtfStrikeLevels & { side: 'LONG' | 'SHORT' | 'NEUTRAL' }) | null;
  tiers: MtfTierStatistics[];
  tfDetails: MtfTfAnalysisDetail[];
  learningKo: string | null;
};

const TIER_DEF: Array<{ tier: MtfStatTier; labelKo: string; emoji: string; tfs: string[] }> = [
  { tier: 'minute', labelKo: '분봉', emoji: '분', tfs: ['1m', '3m', '5m', '15m'] },
  { tier: 'hour', labelKo: '시간', emoji: '시', tfs: ['1h', '4h'] },
  { tier: 'day', labelKo: '일봉', emoji: '일', tfs: ['1d'] },
  { tier: 'week', labelKo: '주봉', emoji: '주', tfs: ['1w'] },
  { tier: 'month', labelKo: '월봉', emoji: '월', tfs: ['1M'] },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parsePrice(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dirFromAnalyze(a: AnalyzeResponse | null, longScore: number, shortScore: number): 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT' {
  if (!a) return 'WAIT';
  const v = String(a.verdict ?? '').toUpperCase();
  if (v === 'LONG') return 'LONG';
  if (v === 'SHORT') return 'SHORT';
  if (v === 'WATCH' || v === 'WAIT') return 'WAIT';
  if (longScore > shortScore + 4) return 'LONG';
  if (shortScore > longScore + 4) return 'SHORT';
  return 'NEUTRAL';
}

function rr(entry: number, sl: number, tp1: number): number | null {
  if (!entry || !sl || !tp1) return null;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp1 - entry);
  if (risk < 1e-9) return null;
  return Math.round((reward / risk) * 100) / 100;
}

function buildStrikeFromAnalyze(a: AnalyzeResponse, side: 'LONG' | 'SHORT'): MtfStrikeLevels | null {
  const price = a.currentPrice ?? null;
  if (!price) return null;

  const entryRaw = parsePrice(a.entry);
  const slRaw = parsePrice(a.stopLoss) ?? a.invalidationLevel?.price ?? null;
  const sup = a.supportLevel?.price ?? null;
  const res = a.resistanceLevel?.price ?? null;
  const tps = (a.nextTargets ?? [])
    .map(parsePrice)
    .filter((n): n is number => n != null && n > 0);

  if (side === 'LONG') {
    const entry = sup ?? entryRaw ?? price;
    const sl = slRaw ?? (sup ? sup - Math.abs(price - sup) * 0.35 : price * 0.985);
    const tp1 = tps[0] ?? res ?? entry * 1.012;
    const tp2 = tps[1] ?? tp1 * 1.018;
    const tp3 = tps[2] ?? tp2 * 1.015;
    return { entry, sl, tp1, tp2, tp3, rr: rr(entry, sl, tp1) };
  }

  const entry = res ?? entryRaw ?? price;
  const sl = slRaw ?? (res ? res + Math.abs(res - price) * 0.35 : price * 1.015);
  const tp1 = tps[0] ?? sup ?? entry * 0.988;
  const tp2 = tps[1] ?? tp1 * 0.982;
  const tp3 = tps[2] ?? tp2 * 0.985;
  return { entry, sl, tp1, tp2, tp3, rr: rr(entry, sl, tp1) };
}

function weightedAvgStrike(rows: MtfTfAnalysisDetail[], side: 'LONG' | 'SHORT'): MtfStrikeLevels | null {
  const picks = rows
    .filter((r) => r.live && (side === 'LONG' ? r.direction === 'LONG' : r.direction === 'SHORT'))
    .map((r) => (side === 'LONG' ? r.longStrike : r.shortStrike))
    .filter(Boolean) as MtfStrikeLevels[];
  if (!picks.length) {
    const fallback = rows.filter((r) => r.live).map((r) => (side === 'LONG' ? r.longStrike : r.shortStrike)).filter(Boolean) as MtfStrikeLevels[];
    if (!fallback.length) return null;
    picks.push(...fallback.slice(0, 3));
  }
  let wSum = 0;
  let e = 0;
  let sl = 0;
  let tp1 = 0;
  let tp2 = 0;
  let tp3 = 0;
  for (const row of rows.filter((r) => r.live)) {
    const strike = side === 'LONG' ? row.longStrike : row.shortStrike;
    if (!strike) continue;
    const w = row.weight * (row.direction === side ? 1.4 : row.direction === 'NEUTRAL' ? 0.7 : 0.35);
    wSum += w;
    e += strike.entry * w;
    sl += strike.sl * w;
    tp1 += strike.tp1 * w;
    tp2 += strike.tp2 * w;
    tp3 += strike.tp3 * w;
  }
  if (wSum <= 0) return null;
  const entry = e / wSum;
  const stop = sl / wSum;
  const t1 = tp1 / wSum;
  const t2 = tp2 / wSum;
  const t3 = tp3 / wSum;
  return { entry, sl: stop, tp1: t1, tp2: t2, tp3: t3, rr: rr(entry, stop, t1) };
}

function tierFromTf(tf: string): MtfStatTier {
  if (['1m', '3m', '5m', '15m'].includes(tf)) return 'minute';
  if (['1h', '4h'].includes(tf)) return 'hour';
  if (tf === '1d') return 'day';
  if (tf === '1w') return 'week';
  return 'month';
}

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

function buildTierStats(tierDef: (typeof TIER_DEF)[0], details: MtfTfAnalysisDetail[]): MtfTierStatistics {
  const tierDetails = details.filter((d) => d.tier === tierDef.tier);
  let longW = 0;
  let shortW = 0;
  let longCount = 0;
  let shortCount = 0;
  let neutralCount = 0;
  let waitCount = 0;
  let confSum = 0;
  let confN = 0;

  for (const d of tierDetails) {
    if (!d.live) {
      waitCount++;
      continue;
    }
    confSum += d.confidence;
    confN++;
    if (d.direction === 'LONG') {
      longCount++;
      longW += d.weight * (d.longScore / 100);
    } else if (d.direction === 'SHORT') {
      shortCount++;
      shortW += d.weight * (d.shortScore / 100);
    } else if (d.direction === 'WAIT') waitCount++;
    else neutralCount++;
  }

  const totalW = longW + shortW || 1;
  const longPct = Math.round((longW / totalW) * 100);
  const shortPct = 100 - longPct;
  const weightedLongPct = tierDetails.filter((d) => d.live).length
    ? Math.round(
        (tierDetails
          .filter((d) => d.live)
          .reduce((s, d) => s + d.longScore * d.weight, 0) /
          tierDetails.filter((d) => d.live).reduce((s, d) => s + d.weight, 0)) *
          100
      )
    : 50;

  let dominantDirection: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (longW > shortW + 0.35) dominantDirection = 'LONG';
  else if (shortW > longW + 0.35) dominantDirection = 'SHORT';

  const longStrike = weightedAvgStrike(tierDetails, 'LONG');
  const shortStrike = weightedAvgStrike(tierDetails, 'SHORT');

  const headlineKo = tierDetails.filter((d) => d.live).length
    ? `${tierDef.labelKo} ${dirKo(dominantDirection)} · L${longPct}% · ${longCount}L/${shortCount}S/${neutralCount}N`
    : `${tierDef.labelKo} · 데이터 대기`;

  return {
    tier: tierDef.tier,
    labelKo: tierDef.labelKo,
    emoji: tierDef.emoji,
    tfs: tierDef.tfs,
    longCount,
    shortCount,
    neutralCount,
    waitCount,
    dominantDirection,
    longPct,
    shortPct,
    avgConfidence: confN ? Math.round(confSum / confN) : 0,
    weightedLongPct,
    longStrike,
    shortStrike,
    headlineKo,
    details: tierDetails,
  };
}

export function buildUnifiedMtfAnalysisStatistics(params: {
  symbol: string;
  chartTf: string;
  chartAnalysis: AnalyzeResponse | null | undefined;
  mtfAnalyzes: Array<{ tf: string; analyze: AnalyzeResponse | null }>;
  consensus?: MergedMtfConsensusResult | null;
  trade?: MergedTradeSignal | null;
}): UnifiedMtfAnalysisStatistics {
  const chart = normalizeChartTimeframe(params.chartTf);
  const merged = mergeMtfAnalyzesWithChart(params.chartTf, params.chartAnalysis, params.mtfAnalyzes);
  const consensusMap = new Map(
    (params.consensus?.rows ?? []).map((r) => [normalizeChartTimeframe(r.tf), r])
  );

  const tfDetails: MtfTfAnalysisDetail[] = MERGED_MTF_CONSENSUS_TFS.map((tf) => {
    const analyze = merged.find((r) => normalizeChartTimeframe(r.tf) === tf)?.analyze ?? null;
    const crow = consensusMap.get(tf);
    const longScore = crow?.longScore ?? Math.round(Number(analyze?.longScore ?? 50));
    const shortScore = crow?.shortScore ?? Math.round(Number(analyze?.shortScore ?? 50));
    const direction = crow?.direction ?? dirFromAnalyze(analyze, longScore, shortScore);
    const confidence = crow?.confidence ?? Math.round(Number(analyze?.confidence ?? 0));
    const weight = TF_WEIGHT[tf] ?? 1;
    const live = !!analyze;
    const longStrike = analyze ? buildStrikeFromAnalyze(analyze, 'LONG') : null;
    const shortStrike = analyze ? buildStrikeFromAnalyze(analyze, 'SHORT') : null;
    const activeStrike =
      direction === 'LONG' ? longStrike : direction === 'SHORT' ? shortStrike : null;

    const summaryKo = live
      ? `${dirKo(direction)} L${longScore} S${shortScore}${activeStrike ? ` · E${Math.round(activeStrike.entry)}` : ''}`
      : '로드 대기';

    return {
      tf,
      tfKo: TF_KO[tf] ?? tf,
      tier: tierFromTf(tf),
      isChartTf: tf === chart,
      direction,
      longScore,
      shortScore,
      confidence,
      weight,
      price: analyze?.currentPrice ?? null,
      longStrike,
      shortStrike,
      activeStrike,
      summaryKo,
      live,
    };
  });

  const liveRows = tfDetails.filter((d) => d.live);
  let longVotes = 0;
  let shortVotes = 0;
  let neutralVotes = 0;
  let wLong = 0;
  let wShort = 0;

  for (const d of liveRows) {
    if (d.direction === 'LONG') {
      longVotes++;
      wLong += d.weight * (d.longScore / 100);
    } else if (d.direction === 'SHORT') {
      shortVotes++;
      wShort += d.weight * (d.shortScore / 100);
    } else {
      neutralVotes++;
      wLong += d.weight * 0.12;
      wShort += d.weight * 0.12;
    }
  }

  const wTotal = wLong + wShort || 1;
  const weightedLongPct = clamp(Math.round((wLong / wTotal) * 100), 5, 95);
  const weightedShortPct = 100 - weightedLongPct;

  let statisticalVerdict: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (wLong > wShort + 0.45) statisticalVerdict = 'LONG';
  else if (wShort > wLong + 0.45) statisticalVerdict = 'SHORT';
  else if (params.consensus?.finalDirection && params.consensus.finalDirection !== 'NEUTRAL') {
    statisticalVerdict = params.consensus.finalDirection;
  }

  const tiers = TIER_DEF.map((t) => buildTierStats(t, tfDetails));
  let longStrike = weightedAvgStrike(liveRows, 'LONG');
  let shortStrike = weightedAvgStrike(liveRows, 'SHORT');

  if (params.trade && params.trade.primary !== 'NEUTRAL') {
    const t = params.trade;
    const tradeStrike: MtfStrikeLevels = {
      entry: t.entry,
      sl: t.stopLoss,
      tp1: t.tp1,
      tp2: t.tp2,
      tp3: t.tp3,
      rr: rr(t.entry, t.stopLoss, t.tp1),
    };
    if (t.primary === 'LONG') longStrike = tradeStrike;
    else shortStrike = tradeStrike;
  }

  const activeSide = statisticalVerdict;
  const activeStrikeRaw =
    activeSide === 'LONG' ? longStrike : activeSide === 'SHORT' ? shortStrike : null;
  const activeStrike = activeStrikeRaw ? { ...activeStrikeRaw, side: activeSide } : null;

  const avgConf = liveRows.length
    ? Math.round(liveRows.reduce((s, d) => s + d.confidence, 0) / liveRows.length)
    : 0;

  const learning = params.chartAnalysis?.signalLearning;
  const learningKo = learning
    ? `과거 확정 ${learning.longCount + learning.shortCount}건 · TP1 ${learning.tp1Count} SL ${learning.slCount} · 표본 성공률 ${Math.round(learning.successRate * 100)}%(검증)`
    : null;

  const headlineKo = `통계 ${dirKo(statisticalVerdict)} · L${weightedLongPct}% S${weightedShortPct}% · ${liveRows.length}/${MERGED_MTF_CONSENSUS_TFS.length} TF`;
  const summaryKo = [
    headlineKo,
    `표결 ${longVotes}L/${shortVotes}S/${neutralVotes}N · 신뢰 ${avgConf}%`,
    activeStrike ? `타점 E ${Math.round(activeStrike.entry)} SL ${Math.round(activeStrike.sl)} TP1 ${Math.round(activeStrike.tp1)}` : null,
    tiers.map((t) => `${t.emoji}${dirKo(t.dominantDirection)}`).join(' '),
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    symbol: params.symbol,
    chartTf: params.chartTf,
    updatedAt: Date.now(),
    sampleCount: MERGED_MTF_CONSENSUS_TFS.length,
    liveTfCount: liveRows.length,
    statisticalVerdict,
    longVotes,
    shortVotes,
    neutralVotes,
    weightedLongPct,
    weightedShortPct,
    confidence: params.consensus?.confidence ?? avgConf,
    headlineKo,
    summaryKo,
    longStrike,
    shortStrike,
    activeStrike,
    tiers,
    tfDetails,
    learningKo,
  };
}
