import type { Verdict } from '@/types';

/**
 * 앱 전역 분석 피처(엔진 verdict, 확정 신호, 존, MTF, 패턴, 고래 등)를 한데 모아
 * 재현 가능한 롱/숏/관망 + 등급(확정/유력/관망)을 산출합니다.
 * LLM은 쓰지 않으며, narrative는 규칙 기반 한글 문장입니다.
 */
export type AiFusionTier = 'confirmed' | 'likely' | 'watch';

export type AiFusionSignal = {
  verdict: Verdict;
  tier: AiFusionTier;
  confidence: number;
  /** 차트 마커용 짧은 한글 */
  markerLabel: string;
  /** 클릭 시 패널용 한 줄 요약(· 구분) */
  narrative: string;
  /** Gemini 등으로 다듬은 한글 설명(클라이언트 보강) */
  narrativeLlm?: string;
  /** 디버그·로그용 */
  reasonCodes: string[];
  longHits: number;
  shortHits: number;
};

export type AiFusionInput = {
  gatedVerdict: Verdict;
  gatedConfidence: number;
  learningPassed: boolean;
  /** SMC 데스크: LinReg+OB+BOS/CHOCH 합류 메타 — 엔진과 동일 소스(`analyzeCandles`) */
  smcDeskConfluenceLs?: {
    side: 'LONG' | 'SHORT';
    longScore?: number;
    shortScore?: number;
    differsFromVerdict?: boolean;
  } | null;
  confirmedSignal?: {
    confirmed?: boolean;
    direction?: 'LONG' | 'SHORT' | null;
    reasons?: string[];
  } | null;
  rsiDivergenceSignal?: {
    verdict?: 'LONG' | 'SHORT' | 'WATCH' | 'NONE';
    totalScore?: number;
  } | null;
  probability?: { longProbability?: number; shortProbability?: number } | null;
  zoneSignal?: { zone?: string; score?: number } | null;
  mtf?: { alignmentScore?: number; htfBias?: string } | null;
  dominantPattern?: { bias?: string } | null;
  volumeWhaleZoneConfluence?: {
    confluentLong?: boolean;
    confluentShort?: boolean;
  } | null;
  swingTapPoint?: { active?: boolean; direction?: 'LONG' | 'SHORT' | null } | null;
  beamPathForecast?: { dominant?: string; confidence?: number } | null;
  settlementZone?: { direction?: string; state?: string } | null;
  tapPointConfirmed?: boolean;
  analysisPanel?: {
    longConfirmed?: boolean;
    shortConfirmed?: boolean;
    zoneState?: string;
  } | null;
  adaptiveLearningSignal?: { direction?: 'LONG' | 'SHORT' | 'WATCH' } | null;
  pre3Sparkle?: { matched?: boolean; direction?: 'LONG' | 'SHORT' | 'NONE' } | null;
  longScore?: number;
  shortScore?: number;
  depthDeltaContext?: {
    regime?: 'buy' | 'sell' | 'neutral';
    persistenceBars?: number;
    strength?: number;
    trapLong?: boolean;
    trapShort?: boolean;
    flip?: 'up' | 'down' | 'none';
  } | null;
  currentPrice?: number | null;
  breakoutLevel?: { price?: number | null } | null;
  invalidationLevel?: { price?: number | null } | null;
  applyDepthDeltaRegimeFilter?: boolean;
  applyDepthDeltaAlignmentWeight?: boolean;
};

function addHit(
  longHits: number,
  shortHits: number,
  side: 'LONG' | 'SHORT' | null | undefined,
  weight = 1
): { l: number; s: number } {
  if (side === 'LONG') return { l: longHits + weight, s: shortHits };
  if (side === 'SHORT') return { l: longHits, s: shortHits + weight };
  return { l: longHits, s: shortHits };
}

function patternBiasToSide(bias: string | undefined): 'LONG' | 'SHORT' | null {
  const b = String(bias || '').toLowerCase();
  if (b.includes('bull') || b === 'long') return 'LONG';
  if (b.includes('bear') || b === 'short') return 'SHORT';
  return null;
}

export function computeAiFusionSignal(input: AiFusionInput): AiFusionSignal {
  const reasonCodes: string[] = [];
  let longHits = 0;
  let shortHits = 0;

  const { gatedVerdict, gatedConfidence, learningPassed } = input;

  if (gatedVerdict === 'LONG') {
    longHits += 1;
    reasonCodes.push('engine_long');
  } else if (gatedVerdict === 'SHORT') {
    shortHits += 1;
    reasonCodes.push('engine_short');
  }

  const cs = input.confirmedSignal;
  if (cs?.confirmed && cs.direction === 'LONG') {
    longHits += 2;
    reasonCodes.push('confirmed_long');
  } else if (cs?.confirmed && cs.direction === 'SHORT') {
    shortHits += 2;
    reasonCodes.push('confirmed_short');
  }

  const rsi = input.rsiDivergenceSignal;
  if (rsi?.verdict === 'LONG' && (rsi.totalScore ?? 0) >= 72) {
    const h = addHit(longHits, shortHits, 'LONG', 1);
    longHits = h.l;
    shortHits = h.s;
    reasonCodes.push('rsi_long');
  } else if (rsi?.verdict === 'SHORT' && (rsi.totalScore ?? 0) >= 72) {
    const h = addHit(longHits, shortHits, 'SHORT', 1);
    longHits = h.l;
    shortHits = h.s;
    reasonCodes.push('rsi_short');
  } else if (rsi?.verdict === 'LONG') {
    const h = addHit(longHits, shortHits, 'LONG', 0.5);
    longHits = h.l;
    shortHits = h.s;
    reasonCodes.push('rsi_long_soft');
  } else if (rsi?.verdict === 'SHORT') {
    const h = addHit(longHits, shortHits, 'SHORT', 0.5);
    longHits = h.l;
    shortHits = h.s;
    reasonCodes.push('rsi_short_soft');
  }

  const prob = input.probability;
  if (prob && typeof prob.longProbability === 'number' && typeof prob.shortProbability === 'number') {
    const d = prob.longProbability - prob.shortProbability;
    if (d >= 14) {
      longHits += 1;
      reasonCodes.push('prob_long');
    } else if (d <= -14) {
      shortHits += 1;
      reasonCodes.push('prob_short');
    }
  }

  const zs = input.zoneSignal?.zone;
  if (zs === 'long_confirm') {
    longHits += 1;
    reasonCodes.push('zone_long_confirm');
  } else if (zs === 'short_confirm') {
    shortHits += 1;
    reasonCodes.push('zone_short_confirm');
  }

  const mtf = input.mtf;
  const align = mtf?.alignmentScore ?? 50;
  const htf = String(mtf?.htfBias || '');
  if (align >= 78 && gatedVerdict === 'LONG' && (htf === 'bullish' || htf === 'range')) {
    longHits += 1;
    reasonCodes.push('mtf_align_long');
  } else if (align >= 78 && gatedVerdict === 'SHORT' && (htf === 'bearish' || htf === 'range')) {
    shortHits += 1;
    reasonCodes.push('mtf_align_short');
  } else if (align <= 42 && gatedVerdict === 'LONG' && htf === 'bearish') {
    shortHits += 0.5;
    reasonCodes.push('mtf_contra_long');
  } else if (align <= 42 && gatedVerdict === 'SHORT' && htf === 'bullish') {
    longHits += 0.5;
    reasonCodes.push('mtf_contra_short');
  }

  const pat = patternBiasToSide(input.dominantPattern?.bias);
  if (pat === 'LONG') {
    const h = addHit(longHits, shortHits, 'LONG', 1);
    longHits = h.l;
    shortHits = h.s;
    reasonCodes.push('vision_long');
  } else if (pat === 'SHORT') {
    const h = addHit(longHits, shortHits, 'SHORT', 1);
    longHits = h.l;
    shortHits = h.s;
    reasonCodes.push('vision_short');
  }

  const vw = input.volumeWhaleZoneConfluence;
  if (vw?.confluentLong) {
    longHits += 1;
    reasonCodes.push('whale_long');
  }
  if (vw?.confluentShort) {
    shortHits += 1;
    reasonCodes.push('whale_short');
  }

  const smcLs = input.smcDeskConfluenceLs;
  if (smcLs?.side === 'LONG') {
    const w = smcLs.differsFromVerdict ? 0.75 : 1.25;
    const h = addHit(longHits, shortHits, 'LONG', w);
    longHits = h.l;
    shortHits = h.s;
    reasonCodes.push(smcLs.differsFromVerdict ? 'smc_ls_long_soft' : 'smc_ls_long');
  } else if (smcLs?.side === 'SHORT') {
    const w = smcLs.differsFromVerdict ? 0.75 : 1.25;
    const h = addHit(longHits, shortHits, 'SHORT', w);
    longHits = h.l;
    shortHits = h.s;
    reasonCodes.push(smcLs.differsFromVerdict ? 'smc_ls_short_soft' : 'smc_ls_short');
  }

  const st = input.swingTapPoint;
  if (st?.active && st.direction === 'LONG') {
    longHits += 1;
    reasonCodes.push('swing_tap_long');
  } else if (st?.active && st.direction === 'SHORT') {
    shortHits += 1;
    reasonCodes.push('swing_tap_short');
  }

  const beam = input.beamPathForecast?.dominant;
  if (beam === 'LONG') {
    longHits += 0.5;
    reasonCodes.push('beam_long');
  } else if (beam === 'SHORT') {
    shortHits += 0.5;
    reasonCodes.push('beam_short');
  }

  const sz = input.settlementZone;
  if (sz?.state === 'confirmed' && sz.direction === 'LONG') {
    longHits += 1;
    reasonCodes.push('settle_long');
  } else if (sz?.state === 'confirmed' && sz.direction === 'SHORT') {
    shortHits += 1;
    reasonCodes.push('settle_short');
  }

  if (input.tapPointConfirmed === true && gatedVerdict === 'LONG') {
    longHits += 1;
    reasonCodes.push('tap_confirm_long');
  } else if (input.tapPointConfirmed === true && gatedVerdict === 'SHORT') {
    shortHits += 1;
    reasonCodes.push('tap_confirm_short');
  }

  const panel = input.analysisPanel;
  if (panel?.longConfirmed) {
    longHits += 1;
    reasonCodes.push('panel_long');
  }
  if (panel?.shortConfirmed) {
    shortHits += 1;
    reasonCodes.push('panel_short');
  }

  const learn = input.adaptiveLearningSignal?.direction;
  if (learn === 'LONG') {
    longHits += 0.5;
    reasonCodes.push('learn_long');
  } else if (learn === 'SHORT') {
    shortHits += 0.5;
    reasonCodes.push('learn_short');
  }

  const p3 = input.pre3Sparkle;
  if (p3?.matched && p3.direction === 'LONG') {
    longHits += 0.5;
    reasonCodes.push('pre3_long');
  } else if (p3?.matched && p3.direction === 'SHORT') {
    shortHits += 0.5;
    reasonCodes.push('pre3_short');
  }

  const ls = input.longScore ?? 0;
  const ss = input.shortScore ?? 0;
  if (ls - ss >= 10) {
    longHits += 0.5;
    reasonCodes.push('score_long');
  } else if (ss - ls >= 10) {
    shortHits += 0.5;
    reasonCodes.push('score_short');
  }

  const dd = input.depthDeltaContext;
  const ddRegimeOn = input.applyDepthDeltaRegimeFilter !== false;
  const ddWeightOn = input.applyDepthDeltaAlignmentWeight !== false;
  if (ddWeightOn) {
    if (dd?.regime === 'buy') {
      const w = 0.45 + Math.min(0.85, (dd.strength ?? 0) * 1.15) + Math.min(0.4, (dd.persistenceBars ?? 0) * 0.04);
      longHits += w;
      reasonCodes.push('dd_regime_buy');
    } else if (dd?.regime === 'sell') {
      const w = 0.45 + Math.min(0.85, (dd.strength ?? 0) * 1.15) + Math.min(0.4, (dd.persistenceBars ?? 0) * 0.04);
      shortHits += w;
      reasonCodes.push('dd_regime_sell');
    }
    if (dd?.flip === 'up') {
      longHits += 0.45;
      reasonCodes.push('dd_flip_up');
    } else if (dd?.flip === 'down') {
      shortHits += 0.45;
      reasonCodes.push('dd_flip_down');
    }
  }

  if (ddRegimeOn) {
    // Stop-hunt 방지: 돌파 방향과 반대 델타 우세면 추격 감점.
    if (dd?.trapLong) {
      longHits = Math.max(0, longHits - 1.25);
      shortHits += 0.35;
      reasonCodes.push('dd_trap_long');
    }
    if (dd?.trapShort) {
      shortHits = Math.max(0, shortHits - 1.25);
      longHits += 0.35;
      reasonCodes.push('dd_trap_short');
    }
  }

  const margin = longHits - shortHits;
  let verdict: Verdict = 'WATCH';
  if (margin > 0.75) verdict = 'LONG';
  else if (margin < -0.75) verdict = 'SHORT';
  else if (gatedVerdict === 'LONG' || gatedVerdict === 'SHORT') verdict = gatedVerdict;

  let tier: AiFusionTier = 'watch';
  const absMargin = Math.abs(longHits - shortHits);
  const winLong = longHits > shortHits;

  const htfAgainst =
    verdict === 'LONG' && htf === 'bearish' && align < 48
      ? true
      : verdict === 'SHORT' && htf === 'bullish' && align < 48;

  const confirmedMatch = cs?.confirmed === true && cs.direction === verdict;

  if (verdict === 'LONG' || verdict === 'SHORT') {
    if (confirmedMatch && absMargin >= 2.5 && !htfAgainst && learningPassed) {
      tier = 'confirmed';
    } else if (confirmedMatch && absMargin >= 1.5 && learningPassed) {
      tier = 'likely';
    } else if (absMargin >= 4 && !htfAgainst && learningPassed) {
      tier = 'confirmed';
    } else if (absMargin >= 2.5 && learningPassed) {
      tier = 'likely';
    } else if (absMargin >= 1.5) {
      tier = 'likely';
    } else if (gatedVerdict === verdict && (gatedConfidence ?? 0) >= 78 && absMargin >= 1) {
      tier = 'likely';
    }
  }

  if (!learningPassed && tier === 'confirmed') {
    tier = 'likely';
    reasonCodes.push('demote_learning');
  }
  if (htfAgainst && tier === 'confirmed') {
    tier = 'likely';
    reasonCodes.push('demote_htf');
  }

  const markerLabel =
    verdict === 'WATCH'
      ? 'AI 관망'
      : tier === 'confirmed'
        ? verdict === 'LONG'
          ? 'AI 롱확정'
          : 'AI 숏확정'
        : tier === 'likely'
          ? verdict === 'LONG'
            ? 'AI 롱유력'
            : 'AI 숏유력'
          : verdict === 'LONG'
            ? 'AI 롱'
            : 'AI 숏';

  const narrativeParts: string[] = [
    `AI 종합: ${verdict === 'LONG' ? '롱' : verdict === 'SHORT' ? '숏' : '관망'} · ${tier === 'confirmed' ? '확정' : tier === 'likely' ? '유력' : '관망'} · 신뢰 ${Math.round(Math.min(95, 40 + absMargin * 8 + (confirmedMatch ? 12 : 0)))}%`,
    `근거 가중치 롱 ${longHits.toFixed(1)} / 숏 ${shortHits.toFixed(1)}`,
  ];
  if (reasonCodes.length) narrativeParts.push(`코드: ${reasonCodes.slice(0, 12).join(', ')}`);
  const narrative = narrativeParts.join(' · ');

  const confidence = Math.round(
    Math.min(
      96,
      Math.max(
        38,
        gatedConfidence * 0.35 + absMargin * 10 + (confirmedMatch ? 14 : 0) + (align >= 70 ? 8 : 0)
      )
    )
  );

  return {
    verdict,
    tier,
    confidence,
    markerLabel,
    narrative,
    reasonCodes,
    longHits,
    shortHits,
  };
}
