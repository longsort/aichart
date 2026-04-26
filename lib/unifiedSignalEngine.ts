import type { AnalyzeResponse, Candle } from '@/types';
import type {
  BuildUnifiedLsSignalOptions,
  FeatureFamily,
  SignalChannelId,
  UnifiedChannelContribution,
  UnifiedFeatureContribution,
  UnifiedLsSignal,
  UnifiedSignalDirection,
  UnifiedSignalProfile,
  SignalGrade,
} from '@/lib/unifiedSignalTypes';
import { CHANNEL_LABEL_KO, DEFAULT_UNIFIED_SIGNAL_PROFILE, SIGNAL_GRADE_LABEL_KO } from '@/lib/unifiedSignalTypes';
import { ema, macd } from '@/lib/indicators';
import { buildMacdHistogramDivergenceSegments } from '@/lib/macdHistogramDivergence';
import { computeObvSeries } from '@/lib/institutionalBandPrecisionGates';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';

function verdictReasonKo(v: string | undefined): string {
  if (!v) return '';
  const u = String(v).toUpperCase();
  if (u === 'LONG') return '롱';
  if (u === 'SHORT') return '숏';
  if (u === 'WATCH') return '관망';
  return String(v);
}

function closeStateReasonKo(s: string): string {
  const m: Record<string, string> = {
    accepted_above: '종가 상방 수용',
    accepted_below: '종가 하방 수용',
  };
  return m[s] ?? `종가:${s}`;
}

function zoneBucketKo(b: string): string {
  const m: Record<string, string> = { strong: '강', valid: '유효', normal: '보통', invalid: '무효' };
  return m[b] ?? b;
}

function zoneSignalZoneKo(z: string): string {
  if (z === 'long_confirm') return '롱 확인';
  if (z === 'short_confirm') return '숏 확인';
  return z;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function to100(v: number) {
  if (!Number.isFinite(v)) return 0;
  return clamp(Math.round(v), 0, 100);
}

function famWeight(family: FeatureFamily, profile: UnifiedSignalProfile): number {
  const w = profile.familyWeights[family];
  return Number.isFinite(w) && w! > 0 ? w! : 1;
}

function featWeight(id: string, profile: UnifiedSignalProfile): number {
  const w = profile.featureWeights[id];
  return Number.isFinite(w) && w! > 0 ? w! : 1;
}

function chanWeight(channel: SignalChannelId, profile: UnifiedSignalProfile): number {
  const w = profile.channelWeights[channel];
  if (w === 0) return 0;
  return Number.isFinite(w) && w! > 0 ? w! : 1;
}

type Extractor = {
  id: string;
  family: FeatureFamily;
  channel: SignalChannelId;
  label: string;
  extract: (a: AnalyzeResponse) => Omit<UnifiedFeatureContribution, 'id' | 'family' | 'channel' | 'label' | 'weight'> | null;
};

const EXTRACTORS: Extractor[] = [
  {
    id: 'structure_scores',
    family: 'structure',
    channel: 'core_structure',
    label: '구조 L/S 점수',
    extract: (a) => {
      const l = Number(a.longScore ?? 50);
      const s = Number(a.shortScore ?? 50);
      if (!Number.isFinite(l) && !Number.isFinite(s)) return null;
      return {
        longScore: to100(l),
        shortScore: to100(s),
        confidence: 0.85,
        reasons: [`롱점수 ${to100(l)} · 숏점수 ${to100(s)}`],
      };
    },
  },
  {
    id: 'zone_nearest',
    family: 'zone',
    channel: 'zone',
    label: '근접 강한 존',
    extract: (a) => {
      const buy = Number(a.nearestBuyZone?.probability ?? a.entryHoldProbability ?? NaN);
      const sell = Number(a.nearestSellZone?.probability ?? a.invalidationLevelProbability ?? NaN);
      if (!Number.isFinite(buy) && !Number.isFinite(sell)) return null;
      const longScore = Number.isFinite(buy) ? to100(buy) : 45;
      const shortScore = Number.isFinite(sell) ? to100(sell) : 45;
      return {
        longScore,
        shortScore,
        confidence: 0.75,
        reasons: ['매수존·매도존 근접 또는 진입·무효화 확률'],
      };
    },
  },
  {
    id: 'zone_signal',
    family: 'zone',
    channel: 'zone',
    label: '존 시그널',
    extract: (a) => {
      const z = a.zoneSignal;
      if (!z) return null;
      const longScore = z.zone === 'long_confirm' ? to100(50 + z.score / 2) : z.zone === 'short_confirm' ? to100(50 - z.score / 2) : 50;
      const shortScore = z.zone === 'short_confirm' ? to100(50 + z.score / 2) : z.zone === 'long_confirm' ? to100(50 - z.score / 2) : 50;
      const conf = z.bucket === 'strong' ? 0.9 : z.bucket === 'valid' ? 0.75 : z.bucket === 'normal' ? 0.55 : 0.35;
      return {
        longScore: to100(longScore),
        shortScore: to100(shortScore),
        confidence: conf,
        reasons: z.reasons?.length
          ? z.reasons.slice(0, 3)
          : [`${zoneSignalZoneKo(z.zone)} · 단계 ${zoneBucketKo(z.bucket)}`],
        meta: { bucket: z.bucket },
      };
    },
  },
  {
    id: 'pattern_dominant',
    family: 'pattern',
    channel: 'pattern',
    label: '지배 패턴',
    extract: (a) => {
      const d = a.dominantPattern;
      if (!d) return null;
      const c = to100(Number(d.confidence ?? 50));
      const bullish = d.bias === 'bullish';
      const bearish = d.bias === 'bearish';
      if (!bullish && !bearish) {
        return { longScore: c, shortScore: c, confidence: 0.5, reasons: [d.label || d.type || '중립 패턴'] };
      }
      return {
        longScore: bullish ? c : to100(c - 15),
        shortScore: bearish ? c : to100(c - 15),
        confidence: 0.7,
        reasons: [d.reason || `${d.type} ${d.bias}`],
      };
    },
  },
  {
    id: 'pattern_vision_top',
    family: 'pattern',
    channel: 'pattern',
    label: '비전 패턴(상위)',
    extract: (a) => {
      const arr = a.detectedVisionPatterns;
      if (!arr?.length) return null;
      const top = [...arr].sort((x, y) => Number(y.confidence ?? 0) - Number(x.confidence ?? 0))[0];
      const c = to100(Number(top.confidence ?? 50));
      const b = String(top.bias || '').toLowerCase();
      const bullish = b.includes('bull') || b.includes('long');
      const bearish = b.includes('bear') || b.includes('short');
      if (!bullish && !bearish) {
        return { longScore: c, shortScore: c, confidence: 0.45, reasons: [top.label || top.type] };
      }
      return {
        longScore: bullish ? c : to100(c - 12),
        shortScore: bearish ? c : to100(c - 12),
        confidence: 0.55,
        reasons: [top.reason || top.label || top.type],
      };
    },
  },
  {
    id: 'momentum_rsi_div',
    family: 'momentum',
    channel: 'momentum',
    label: 'RSI 다이버전스',
    extract: (a) => {
      const rsi = a.rsiDivergenceSignal;
      if (!rsi) return null;
      const l = to100(Number(rsi.longScore ?? 50));
      const s = to100(Number(rsi.shortScore ?? 50));
      const bump = rsi.verdict === 'LONG' || rsi.verdict === 'SHORT' ? 0.15 : 0;
      return {
        longScore: l,
        shortScore: s,
        confidence: clamp(0.55 + bump, 0.5, 1),
        reasons: rsi.reasons?.slice(0, 2) ?? [rsi.verdict],
      };
    },
  },
  {
    id: 'momentum_probability',
    family: 'momentum',
    channel: 'momentum',
    label: '확률 엔진',
    extract: (a) => {
      const p = a.probability;
      if (!p) return null;
      const l = to100(Number(p.longProbability ?? 50));
      const s = to100(Number(p.shortProbability ?? 50));
      return {
        longScore: l,
        shortScore: s,
        confidence: clamp(Number(p.score ?? 60) / 100, 0.4, 0.95),
        reasons: p.reason?.slice(0, 2) ?? [],
      };
    },
  },
  {
    id: 'close_tf_states',
    family: 'close',
    channel: 'close',
    label: '종가 TF 상태',
    extract: (a) => {
      const states = [a.dailyState, a.weeklyState, a.monthlyState].filter(Boolean) as string[];
      if (!states.length) return null;
      let longAdj = 0;
      let shortAdj = 0;
      for (const s of states) {
        if (s === 'accepted_above') {
          longAdj += 16;
          shortAdj -= 8;
        } else if (s === 'accepted_below') {
          shortAdj += 16;
          longAdj -= 8;
        }
      }
      return {
        longScore: to100(50 + longAdj),
        shortScore: to100(50 + shortAdj),
        confidence: 0.65,
        reasons: states.map((s) => closeStateReasonKo(s)),
      };
    },
  },
  {
    id: 'liquidity_flow',
    family: 'liquidity',
    channel: 'liquidity',
    label: '매수·매도 압력',
    extract: (a) => {
      const buy = Number(a.buyPressure);
      const sell = Number(a.sellPressure);
      if (!Number.isFinite(buy) && !Number.isFinite(sell)) return null;
      const b = Number.isFinite(buy) ? buy : 50;
      const se = Number.isFinite(sell) ? sell : 50;
      return {
        longScore: to100(50 + (b - se)),
        shortScore: to100(50 + (se - b)),
        confidence: 0.6,
        reasons: [`매수압력 ${b.toFixed(0)} · 매도압력 ${se.toFixed(0)}`],
      };
    },
  },
  {
    id: 'unified_exchange_micro',
    family: 'liquidity',
    channel: 'liquidity',
    label: '집계 CVD·OI·청산·CMF',
    extract: (a) => {
      const m = a.unifiedMarketMetrics;
      if (!m) return null;
      let longB = 0;
      let shortB = 0;
      const scale = 7e5;
      const cvdN = clamp(m.aggregatedCvdUsd / scale, -1, 1);
      if (cvdN > 0) longB += 18 * cvdN;
      else shortB += 18 * -cvdN;
      if (m.cmf20 != null) {
        if (m.cmf20 > 0.04) longB += 10;
        if (m.cmf20 < -0.04) shortB += 10;
      }
      if (m.oiDeltaPct != null) {
        if (m.oiDeltaPct > 0.12) {
          longB += 5;
          shortB += 5;
        }
        if (m.oiDeltaPct < -0.12) {
          longB -= 3;
          shortB -= 3;
        }
      }
      const lnet = m.liquidationLongUsd - m.liquidationShortUsd;
      const lq = clamp(lnet / 7e5, -1, 1);
      if (lq > 0.15) shortB += 6 * lq;
      if (lq < -0.15) longB += 6 * -lq;
      const reasons: string[] = [
        `집계 CVD 약 ${(m.aggregatedCvdUsd / 1e6).toFixed(2)}M USDT`,
        m.cmf20 != null ? `CMF(20) ${m.cmf20.toFixed(3)}` : '',
        m.oiDeltaPct != null ? `OI 변화 ${m.oiDeltaPct >= 0 ? '+' : ''}${m.oiDeltaPct.toFixed(3)}%` : '',
        `청산 롱/숏 ${(m.liquidationLongUsd / 1e3).toFixed(0)}K / ${(m.liquidationShortUsd / 1e3).toFixed(0)}K USDT`,
      ].filter(Boolean);
      return {
        longScore: to100(50 + longB - shortB * 0.35),
        shortScore: to100(50 + shortB - longB * 0.35),
        confidence: 0.58,
        reasons,
      };
    },
  },
  {
    id: 'execution_tap',
    family: 'execution',
    channel: 'execution',
    label: '타점·실행',
    extract: (a) => {
      const tap = a.tapPointConfirmed === true;
      const swing = a.swingTapPoint;
      const exec = a.executionState;
      if (!tap && !swing?.active && !exec) return null;
      let longScore = 50;
      let shortScore = 50;
      let conf = 0.55;
      const reasons: string[] = [];
      if (swing?.active && swing.direction) {
        if (swing.direction === 'LONG') {
          longScore = to100(55 + swing.confidence / 2);
          shortScore = to100(45 - swing.confidence / 4);
        } else {
          shortScore = to100(55 + swing.confidence / 2);
          longScore = to100(45 - swing.confidence / 4);
        }
        conf = clamp(0.5 + swing.confidence / 200, 0.5, 0.95);
        reasons.push(...(swing.reasons || []).slice(0, 2));
      }
      if (tap) {
        conf = Math.min(0.95, conf + 0.12);
        reasons.push('타점 확정');
      }
      if (exec === 'CONFIRMED') {
        conf = Math.min(0.95, conf + 0.08);
        reasons.push('실행 상태 확정');
      }
      return { longScore, shortScore, confidence: conf, reasons: reasons.length ? reasons : ['실행 힌트'] };
    },
  },
  {
    id: 'micro_last_candle',
    family: 'micro',
    channel: 'micro',
    label: '최근 캔들 점수',
    extract: (a) => {
      const arr = a.candleScores;
      if (!arr?.length) return null;
      const last = arr[arr.length - 1];
      const sc = Number(last.score ?? 50);
      const bull = last.bullish === true;
      const bear = last.bullish === false;
      return {
        longScore: bull ? to100(sc) : bear ? to100(100 - sc) : 50,
        shortScore: bear ? to100(sc) : bull ? to100(100 - sc) : 50,
        confidence: 0.45,
        reasons: [`봉 ${last.index} · 강도 ${last.strength ?? '–'}`],
      };
    },
  },
  {
    id: 'structure_rocket',
    family: 'structure',
    channel: 'core_structure',
    label: '구조 로켓',
    extract: (a) => {
      const rockets = a.structureRocketSignals;
      if (!rockets?.length) return null;
      const recent = rockets.slice(-5);
      let longN = 0;
      let shortN = 0;
      for (const r of recent) {
        if (r.direction === 'LONG') longN += 1;
        else shortN += 1;
      }
      const max = Math.max(longN, shortN, 1);
      return {
        longScore: to100(50 + (longN / max) * 35),
        shortScore: to100(50 + (shortN / max) * 35),
        confidence: 0.7,
        reasons: [`recent rockets L=${longN} S=${shortN}`],
      };
    },
  },
  {
    id: 'mtf_alignment',
    family: 'structure',
    channel: 'core_structure',
    label: 'MTF 정렬',
    extract: (a) => {
      const m = a.mtf;
      if (!m) return null;
      const al = Number(m.alignmentScore ?? 50);
      const htf = (m.htfBias || '').toLowerCase();
      let longScore = 50;
      let shortScore = 50;
      if (htf.includes('bull') || htf.includes('long')) longScore = to100(50 + al / 4);
      if (htf.includes('bear') || htf.includes('short')) shortScore = to100(50 + al / 4);
      return {
        longScore,
        shortScore,
        confidence: 0.55,
        reasons: [m.summary || `상위 TF 편향 ${m.htfBias ?? '–'} · 정렬 ${al}`],
      };
    },
  },
  {
    id: 'briefing_similar',
    family: 'structure',
    channel: 'briefing',
    label: '유사 브리핑',
    extract: (a) => {
      const sb = a.similarBriefing;
      if (!sb || (sb.similarity ?? 0) < 28) return null;
      const sim = clamp(Number(sb.similarity) / 100, 0.3, 0.95);
      if (sb.direction === 'LONG') {
        return {
          longScore: to100(50 + sim * 28),
          shortScore: to100(50 - sim * 18),
          confidence: sim,
          reasons: [sb.summary?.slice(0, 80) || `유사도 ${sb.similarity}%`],
        };
      }
      if (sb.direction === 'SHORT') {
        return {
          longScore: to100(50 - sim * 18),
          shortScore: to100(50 + sim * 28),
          confidence: sim,
          reasons: [sb.summary?.slice(0, 80) || `유사도 ${sb.similarity}%`],
        };
      }
      return {
        longScore: 50,
        shortScore: 50,
        confidence: sim * 0.6,
        reasons: ['유사도만 참고(관망)'],
      };
    },
  },
  {
    id: 'strategy_top_refs',
    family: 'structure',
    channel: 'strategy_ref',
    label: '참조 라이브러리',
    extract: (a) => {
      const refs = a.topReferences?.slice(0, 6) ?? [];
      if (!refs.length) return null;
      let longW = 0;
      let shortW = 0;
      let wSum = 0;
      for (const r of refs) {
        const sc = Number(r.score ?? 50) / 100;
        const tags = (r.tags || []).map((t) => String(t).toLowerCase()).join(' ');
        const bear = /bear|short|sell|dump/.test(tags);
        const bull = /bull|long|buy|pump|flag/.test(tags);
        wSum += sc;
        if (bear && !bull) shortW += sc;
        else if (bull && !bear) longW += sc;
        else {
          longW += sc * 0.5;
          shortW += sc * 0.5;
        }
      }
      if (wSum <= 0) return null;
      return {
        longScore: to100((longW / wSum) * 100),
        shortScore: to100((shortW / wSum) * 100),
        confidence: clamp(wSum / Math.max(refs.length, 1) * 0.5, 0.35, 0.75),
        reasons: refs.slice(0, 2).map((r) => r.title || r.id),
      };
    },
  },
  {
    id: 'learning_signal_stats',
    family: 'momentum',
    channel: 'learning_ls',
    label: '자율학습 통계',
    extract: (a) => {
      const sl = a.signalLearning;
      if (!sl || sl.total < 2) return null;
      const t = Math.max(1, sl.total);
      const lr = sl.longCount / t;
      const sr = sl.shortCount / t;
      const win = clamp(Number(sl.successRate ?? 50) / 100, 0.2, 0.95);
      return {
        longScore: to100(lr * 100),
        shortScore: to100(sr * 100),
        confidence: win * 0.55,
        reasons: [`샘플 ${sl.total}건 · 성공률 ${Math.round(sl.successRate)}%`],
      };
    },
  },
  {
    id: 'learning_adaptive',
    family: 'momentum',
    channel: 'learning_ls',
    label: '적응형 학습 신호',
    extract: (a) => {
      const ad = a.adaptiveLearningSignal;
      if (!ad) return null;
      const c = clamp(Number(ad.confidence ?? 55) / 100, 0.35, 0.9);
      if (ad.direction === 'LONG') {
        return { longScore: to100(55 + c * 20), shortScore: to100(45 - c * 10), confidence: c, reasons: [ad.briefing?.slice(0, 60) || '적응형 롱'] };
      }
      if (ad.direction === 'SHORT') {
        return { longScore: to100(45 - c * 10), shortScore: to100(55 + c * 20), confidence: c, reasons: [ad.briefing?.slice(0, 60) || '적응형 숏'] };
      }
      return { longScore: 50, shortScore: 50, confidence: c * 0.5, reasons: ['적응형 관망'] };
    },
  },
  {
    id: 'misc_feature_probs',
    family: 'pattern',
    channel: 'misc',
    label: '기능별 확률(캔들)',
    extract: (a) => {
      const fps = a.featureProbabilities;
      if (!fps?.length) return null;
      let l = 0;
      let s = 0;
      let n = 0;
      for (const f of fps) {
        if (f.directionBias === 'LONG') l += 1;
        else if (f.directionBias === 'SHORT') s += 1;
        n += 1;
      }
      if (!n) return null;
      return {
        longScore: to100((l / n) * 100),
        shortScore: to100((s / n) * 100),
        confidence: 0.4,
        reasons: [`롱우세 ${l} · 숏우세 ${s} / ${n}`],
      };
    },
  },
  {
    id: 'virtual_verdict_proxy',
    family: 'momentum',
    channel: 'virtual_trade',
    label: '가상매매(원판정 보조)',
    extract: (a) => {
      if (a.verdict !== 'LONG' && a.verdict !== 'SHORT') return null;
      return {
        longScore: a.verdict === 'LONG' ? 58 : 42,
        shortScore: a.verdict === 'SHORT' ? 58 : 42,
        confidence: 0.22,
        reasons: [`메인 원판정 ${verdictReasonKo(a.verdict)} (낮은 가중)`],
      };
    },
  },
];

/**
 * 차트에서만 계산 가능한 RSI·MACD hist·OBV·EMA를 한 피처로 합성 — 개별 차트 선 대신 통합 롱/숏에만 반영.
 */
function extractOmniChartFusion(a: AnalyzeResponse, candles: Candle[]): Omit<
  UnifiedFeatureContribution,
  'id' | 'family' | 'channel' | 'label' | 'weight'
> | null {
  const safe = sanitizeChartCandlesForSeries(candles);
  if (safe.length < 30) return null;
  let l = 0;
  let s = 0;
  const reasons: string[] = [];

  const rsi = a.rsiDivergenceSignal;
  if (rsi?.divergence?.bullish) {
    l += 14;
    reasons.push('RSI 강세 괴리');
  }
  if (rsi?.divergence?.bearish) {
    s += 14;
    reasons.push('RSI 약세 괴리');
  }

  const { hist } = macd(safe);
  const macdSegs = buildMacdHistogramDivergenceSegments(safe, hist);
  if (macdSegs.some((x) => x.type === 'bullish')) {
    l += 12;
    reasons.push('MACD hist 강세 괴리');
  }
  if (macdSegs.some((x) => x.type === 'bearish')) {
    s += 12;
    reasons.push('MACD hist 약세 괴리');
  }

  const obv = computeObvSeries(safe);
  const n = obv.length;
  if (n >= 16) {
    const slope = obv[n - 1] - obv[n - 11];
    const thr = Math.max(1e-9, Math.abs(obv[n - 1]) * 0.001);
    if (slope > thr) {
      l += 8;
      reasons.push('OBV 상승');
    } else if (slope < -thr) {
      s += 8;
      reasons.push('OBV 하락');
    }
  }

  const closes = safe.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const last = safe.length - 1;
  if (last >= 0 && Number.isFinite(e20[last]) && Number.isFinite(e50[last])) {
    if (e20[last] > e50[last]) {
      l += 7;
      reasons.push('EMA20>50');
    } else if (e20[last] < e50[last]) {
      s += 7;
      reasons.push('EMA20<50');
    }
  }

  if (!reasons.length) return null;

  return {
    longScore: to100(50 + l - s * 0.35),
    shortScore: to100(50 + s - l * 0.35),
    confidence: clamp(0.55 + Math.min(0.22, reasons.length * 0.035), 0.5, 0.88),
    reasons: reasons.slice(0, 5),
  };
}

function runExtractors(
  analysis: AnalyzeResponse,
  profile: UnifiedSignalProfile,
  opts?: BuildUnifiedLsSignalOptions,
): UnifiedFeatureContribution[] {
  const out: UnifiedFeatureContribution[] = [];
  const skipRsiDiv = Boolean(opts?.candles && opts.candles.length >= 30);
  for (const ex of EXTRACTORS) {
    if (skipRsiDiv && ex.id === 'momentum_rsi_div') continue;
    const raw = ex.extract(analysis);
    if (!raw) continue;
    const cw = chanWeight(ex.channel, profile);
    if (cw <= 0) continue;
    const w = featWeight(ex.id, profile) * famWeight(ex.family, profile) * cw;
    out.push({
      id: ex.id,
      family: ex.family,
      channel: ex.channel,
      label: ex.label,
      longScore: to100(raw.longScore),
      shortScore: to100(raw.shortScore),
      confidence: clamp(raw.confidence, 0.05, 1),
      weight: w,
      reasons: raw.reasons,
      meta: raw.meta,
    });
  }
  if (opts?.candles?.length) {
    const omni = extractOmniChartFusion(analysis, opts.candles);
    if (omni) {
      const cw = chanWeight('momentum', profile);
      if (cw > 0) {
        const w = featWeight('omni_chart_fusion', profile) * famWeight('momentum', profile) * cw;
        out.push({
          id: 'omni_chart_fusion',
          family: 'momentum',
          channel: 'momentum',
          label: '차트 합성(RSI·MACD·OBV·EMA)',
          longScore: to100(omni.longScore),
          shortScore: to100(omni.shortScore),
          confidence: omni.confidence,
          weight: w,
          reasons: omni.reasons,
        });
      }
    }
  }
  return out;
}

function aggregateChannelContributions(features: UnifiedFeatureContribution[]): UnifiedChannelContribution[] {
  const map = new Map<
    SignalChannelId,
    { wL: number; wS: number; w: number; labels: string[] }
  >();
  for (const f of features) {
    const ch = f.channel;
    const w = f.confidence * f.weight;
    if (w <= 0) continue;
    const cur = map.get(ch) || { wL: 0, wS: 0, w: 0, labels: [] };
    cur.wL += f.longScore * w;
    cur.wS += f.shortScore * w;
    cur.w += w;
    if (!cur.labels.includes(f.label)) cur.labels.push(f.label);
    map.set(ch, cur);
  }
  const rows: UnifiedChannelContribution[] = [];
  for (const [channel, v] of map) {
    rows.push({
      channel,
      label: CHANNEL_LABEL_KO[channel],
      longDisplay: v.w > 0 ? to100(v.wL / v.w) : 50,
      shortDisplay: v.w > 0 ? to100(v.wS / v.w) : 50,
      weightSum: v.w,
      featureLabels: v.labels.slice(0, 5),
    });
  }
  rows.sort((a, b) => b.weightSum - a.weightSum);
  return rows;
}

function weightedDisplay(features: UnifiedFeatureContribution[]): { longDisplay: number; shortDisplay: number } {
  if (!features.length) return { longDisplay: 50, shortDisplay: 50 };
  let wLong = 0;
  let wShort = 0;
  let sumWL = 0;
  let sumWS = 0;
  for (const f of features) {
    const w = f.confidence * f.weight;
    sumWL += w;
    sumWS += w;
    wLong += f.longScore * w;
    wShort += f.shortScore * w;
  }
  const longDisplay = sumWL > 0 ? to100(wLong / sumWL) : 50;
  const shortDisplay = sumWS > 0 ? to100(wShort / sumWS) : 50;
  return { longDisplay, shortDisplay };
}

function resolveGrade(
  edge: number,
  longDisplay: number,
  shortDisplay: number,
  gatesFailed: string[],
  t: UnifiedSignalProfile['thresholds'],
): { grade: SignalGrade; direction: UnifiedSignalDirection } {
  const absEdge = Math.abs(edge);
  let direction: UnifiedSignalDirection = 'NEUTRAL';
  if (edge > 0.5) direction = 'LONG';
  else if (edge < -0.5) direction = 'SHORT';

  const conflict =
    longDisplay >= t.conflictSideMin &&
    shortDisplay >= t.conflictSideMin &&
    absEdge <= t.conflictMaxEdge;

  if (conflict) return { grade: 'CONFLICT', direction: 'NEUTRAL' };

  let grade: SignalGrade = 'NONE';
  if (absEdge >= t.confirmEdge && (longDisplay >= t.confirmSideMin || shortDisplay >= t.confirmSideMin)) {
    grade = 'CONFIRMED';
  } else if (absEdge >= t.leanEdge) {
    grade = 'LEAN';
  } else if (absEdge >= t.watchEdge) {
    grade = 'WATCH';
  }

  if (gatesFailed.length && grade !== 'NONE') {
    if (grade === 'CONFIRMED') grade = 'LEAN';
    else if (grade === 'LEAN') grade = 'WATCH';
  }

  if (grade === 'NONE') direction = 'NEUTRAL';

  return { grade, direction };
}

function evaluateGates(analysis: AnalyzeResponse): { passed: string[]; failed: string[] } {
  const passed: string[] = [];
  const failed: string[] = [];
  const flags = analysis.riskFlags;
  if (flags?.length) failed.push(`riskFlags:${flags.length}`);
  else passed.push('no_risk_flags');
  if (analysis.zoneSignal?.bucket === 'invalid') failed.push('zone_bucket_invalid');
  else passed.push('zone_bucket_ok');
  return { passed, failed };
}

export function buildUnifiedLsSignal(
  analysis: AnalyzeResponse,
  profile: UnifiedSignalProfile = DEFAULT_UNIFIED_SIGNAL_PROFILE,
  options?: BuildUnifiedLsSignalOptions,
): UnifiedLsSignal {
  const merged: UnifiedSignalProfile = {
    familyWeights: { ...DEFAULT_UNIFIED_SIGNAL_PROFILE.familyWeights, ...profile.familyWeights },
    featureWeights: { ...DEFAULT_UNIFIED_SIGNAL_PROFILE.featureWeights, ...profile.featureWeights },
    channelWeights: { ...DEFAULT_UNIFIED_SIGNAL_PROFILE.channelWeights, ...profile.channelWeights },
    thresholds: { ...DEFAULT_UNIFIED_SIGNAL_PROFILE.thresholds, ...profile.thresholds },
  };

  const features = runExtractors(analysis, merged, options);
  const channelContributions = aggregateChannelContributions(features);
  const { longDisplay, shortDisplay } = weightedDisplay(features);
  const edge = longDisplay - shortDisplay;
  const { passed, failed } = evaluateGates(analysis);
  const { grade, direction } = resolveGrade(edge, longDisplay, shortDisplay, failed, merged.thresholds);

  const explain: string[] = [];
  explain.push(
    `격차 ${edge > 0 ? '+' : ''}${edge.toFixed(0)} · 롱 ${longDisplay} · 숏 ${shortDisplay} · 등급 ${SIGNAL_GRADE_LABEL_KO[grade]}`,
  );
  const top = [...features]
    .sort((a, b) => Math.max(b.longScore, b.shortScore) * b.confidence * b.weight - Math.max(a.longScore, a.shortScore) * a.confidence * a.weight)
    .slice(0, 3);
  for (const f of top) explain.push(`${f.label}: 롱${f.longScore}/숏${f.shortScore}`);

  return {
    direction,
    grade,
    longDisplay,
    shortDisplay,
    edge,
    features,
    channelContributions,
    gatesPassed: passed,
    gatesFailed: failed,
    explain,
    sourceVerdict: analysis.verdict,
  };
}

export function listUnifiedSignalExtractorIds(): string[] {
  return EXTRACTORS.map((e) => e.id);
}
