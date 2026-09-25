/**
 * 마감·안착 — 정밀 융합 분석 (게이트 부분점수·거리·MTF 가중)
 * 엄격 확정(5/5)과 별도 — HUD·융합 점수용
 */
import type { AnalyzeResponse } from '@/types';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import type { MonthDeskStructureBoardContext } from '@/lib/monthDeskBoardFusion';

export type MonthDeskGatePartial = {
  key: string;
  label: string;
  score: number;
  pass: boolean;
  detailKo: string;
};

export type MonthDeskPrecisionSnapshot = {
  precisionScore: number;
  precisionGrade: 'A' | 'B' | 'C' | 'D';
  gatePartials: MonthDeskGatePartial[];
  fusionScore: number;
  fusionLabel: string;
  breakdownKo: string[];
  mtfWeight: number;
  structureSub: number;
  edgeBps: number | null;
};

const RSI_TARGET = 85;
const SR_PASS_PCT = 0.003;
const SR_FALLOFF_PCT = 0.02;

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function srPartialScore(price: number, level: number | null | undefined): { score: number; detailKo: string } {
  if (level == null || level <= 0 || price <= 0) return { score: 0, detailKo: '레벨 없음' };
  const distPct = Math.abs(price - level) / level;
  if (distPct <= SR_PASS_PCT) return { score: 100, detailKo: `${(distPct * 100).toFixed(2)}% 이내` };
  if (distPct >= SR_FALLOFF_PCT) return { score: 8, detailKo: `${(distPct * 100).toFixed(2)}% 거리` };
  const t = (distPct - SR_PASS_PCT) / (SR_FALLOFF_PCT - SR_PASS_PCT);
  return { score: Math.round(100 - t * 92), detailKo: `${(distPct * 100).toFixed(2)}% (0.3% 목표)` };
}

export function computeMonthDeskPrecisionAnalysis(
  analysis: AnalyzeResponse | null,
  metrics: MonthDeskBoardMetrics,
  levels: MonthDeskCoreLevels,
  structureCtx?: MonthDeskStructureBoardContext | null
): MonthDeskPrecisionSnapshot | null {
  if (!analysis || metrics.verdict === 'WAIT') return null;

  const cs = analysis.confirmedSignal;
  const dir = metrics.verdict;
  const price = levels.close ?? analysis.currentPrice ?? 0;
  if (price <= 0) return null;

  const eng = (analysis as unknown as { engine?: Record<string, unknown> }).engine;
  const sm = {
    trend: eng?.trend as 'bullish' | 'bearish' | 'range' | null | undefined,
    bos: Array.isArray(eng?.bos) ? (eng.bos as unknown[]).length : 0,
    choch: Array.isArray(eng?.choch) ? (eng.choch as unknown[]).length : 0,
    ob: Array.isArray(eng?.obs) ? (eng.obs as unknown[]).length : 0,
  };

  const trendAligned =
    (dir === 'LONG' && sm.trend === 'bullish') || (dir === 'SHORT' && sm.trend === 'bearish');
  let structBoard = 0;
  let structDetail = `정합 ${sm.trend ?? '—'}`;
  const sc = structureCtx ?? metrics.structure;
  if (sc?.bias) {
    const structDirOk =
      (dir === 'LONG' && sc.bias === 'bullish') || (dir === 'SHORT' && sc.bias === 'bearish');
    if (sc.phase === 'confirmed') {
      structBoard += structDirOk ? 22 : -8;
      structDetail = `${sc.tag ?? '구조'} 확정·${structDirOk ? '방향 일치' : '방향 엇갈림'}`;
    } else if (sc.phase === 'settling' || sc.phase === 'breakout') {
      structBoard += structDirOk ? 12 : -4;
      structDetail = `${sc.tag ?? '구조'} ${sc.phase === 'breakout' ? '돌파' : '안착중'}`;
    } else if (sc.phase === 'failed') {
      structBoard -= 10;
      structDetail = '구조 실패';
    }
    structBoard += Math.min(8, sc.scoreLong + sc.scoreShort);
  }
  const structureRaw =
    (trendAligned ? 42 : sm.trend === 'range' ? 16 : 0) +
    Math.min(20, sm.bos * 7) +
    Math.min(16, sm.choch * 5) +
    (cs?.structure ? 14 : 0) +
    structBoard;
  const structureSub = clamp(structureRaw);
  const structureScore = clamp((structureSub / 62) * 100);

  const rsiSig = analysis.rsiDivergenceSignal as
    | { verdict?: string; totalScore?: number; longScore?: number; shortScore?: number }
    | undefined;
  const rsiVal =
    rsiSig?.totalScore ??
    (dir === 'LONG' ? rsiSig?.longScore : rsiSig?.shortScore) ??
    0;
  const rsiMatch = rsiSig?.verdict === dir;
  const rsiScore = rsiMatch ? clamp((rsiVal / RSI_TARGET) * 100) : clamp(rsiVal * 0.35);

  const level =
    dir === 'LONG' ? analysis.supportLevel?.price : analysis.resistanceLevel?.price;
  const sr = srPartialScore(price, level);
  const edgeBps = level != null && level > 0 ? Math.round((Math.abs(price - level) / level) * 10000) : null;

  const closeScore = cs?.close ? 100 : metrics.mtfAlignment != null ? clamp(metrics.mtfAlignment) : 35;

  const engineFvg = (Array.isArray(eng?.fvg) ? eng.fvg : []) as Array<{
    low: number;
    high: number;
    bias: string;
    valid?: boolean;
  }>;
  const matchBias = dir === 'LONG' ? 'bullish' : 'bearish';
  const dirFvgs = engineFvg.filter((f) => f.valid !== false && f.bias === matchBias);
  let fvgScore = 0;
  let fvgDetail = 'FVG 없음';
  if (dirFvgs.length > 0) {
    let best = 0;
    for (const f of dirFvgs) {
      const mid = (f.low + f.high) / 2;
      const pad = (f.high - f.low) * 0.2 || price * SR_PASS_PCT;
      if (price >= f.low - pad && price <= f.high + pad) {
        best = 100;
        fvgDetail = '존 내부';
        break;
      }
      const d = Math.abs(price - mid) / price;
      best = Math.max(best, clamp(100 - (d / SR_FALLOFF_PCT) * 100));
      fvgDetail = `${(d * 100).toFixed(2)}% from zone`;
    }
    fvgScore = best;
  }

  const gatePartials: MonthDeskGatePartial[] = [
    {
      key: 'structure',
      label: '구조',
      score: structureScore,
      pass: !!cs?.structure,
      detailKo: `${structDetail} · ${structureSub}/62`,
    },
    {
      key: 'rsi',
      label: 'RSI',
      score: rsiScore,
      pass: !!cs?.rsi,
      detailKo: rsiMatch ? `${rsiVal}pt / ${RSI_TARGET}` : `방향 ${rsiSig?.verdict ?? '—'}`,
    },
    {
      key: 'sr',
      label: 'S/R',
      score: sr.score,
      pass: !!cs?.supportResistance,
      detailKo: sr.detailKo,
    },
    {
      key: 'close',
      label: '종가',
      score: closeScore,
      pass: !!cs?.close,
      detailKo: cs?.close ? 'TF·일·주 정배열' : `MTF ${metrics.mtfAlignment ?? '—'}%`,
    },
    {
      key: 'fvg',
      label: 'FVG',
      score: fvgScore,
      pass: !!cs?.fvgZone,
      detailKo: fvgDetail,
    },
  ];

  const avgPartial =
    gatePartials.reduce((s, g) => s + g.score, 0) / Math.max(1, gatePartials.length);

  const htf = metrics.mtfHtf?.toLowerCase() ?? '';
  const ltf = metrics.mtfLtf?.toLowerCase() ?? '';
  let mtfWeight = 50;
  if (dir === 'LONG') {
    if (htf.includes('bull') || htf.includes('long')) mtfWeight += 25;
    if (htf.includes('bear') || htf.includes('short')) mtfWeight -= 22;
    if (ltf.includes('bull')) mtfWeight += 12;
    if (ltf.includes('bear')) mtfWeight -= 12;
  } else {
    if (htf.includes('bear') || htf.includes('short')) mtfWeight += 25;
    if (htf.includes('bull') || htf.includes('long')) mtfWeight -= 22;
    if (ltf.includes('bear')) mtfWeight += 12;
    if (ltf.includes('bull')) mtfWeight -= 12;
  }
  if (metrics.mtfBlocked) mtfWeight = Math.min(mtfWeight, 28);
  mtfWeight = clamp(mtfWeight);

  const conf = metrics.confidence ?? 50;
  const dom = Math.abs(metrics.longPct - metrics.shortPct);
  const precisionScore = clamp(
    avgPartial * 0.42 + conf * 0.22 + mtfWeight * 0.18 + dom * 0.12 + (cs?.gatesPassCount ?? 0) * 4
  );

  const fusionScore = clamp(precisionScore * 0.55 + avgPartial * 0.45);
  let fusionLabel = '관망·정밀 스캔';
  if (fusionScore >= 78) fusionLabel = '정밀·고밀도 구간';
  else if (fusionScore >= 62) fusionLabel = '정밀·추적 가능';
  else if (fusionScore >= 48) fusionLabel = '정밀·선별';

  const precisionGrade: MonthDeskPrecisionSnapshot['precisionGrade'] =
    precisionScore >= 75 ? 'A' : precisionScore >= 58 ? 'B' : precisionScore >= 42 ? 'C' : 'D';

  const breakdownKo = [
    `정밀 융합 ${Math.round(precisionScore)}점 (등급 ${precisionGrade}) — 게이트 부분평균 ${Math.round(avgPartial)}`,
    ...gatePartials.map((g) => `${g.label} ${g.score}%${g.pass ? ' ✓' : ''} · ${g.detailKo}`),
    edgeBps != null ? `S/R 이격 ${edgeBps}bp` : '',
    metrics.mtfBlocked ? 'MTF 반대 — 확정 억제 가능' : `MTF 가중 ${Math.round(mtfWeight)}%`,
  ].filter(Boolean);

  return {
    precisionScore: Math.round(precisionScore),
    precisionGrade,
    gatePartials,
    fusionScore: Math.round(fusionScore),
    fusionLabel,
    breakdownKo,
    mtfWeight: Math.round(mtfWeight),
    structureSub,
    edgeBps,
  };
}
