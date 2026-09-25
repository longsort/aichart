/**
 * ConfluenceEngine — 독립 Evidence Group으로 합의.
 * OB+FVG+BPR 같은 SMC 계열은 상관 중복을 감안해 과대평가하지 않음.
 * Setup Score ≠ Historical Win Rate.
 */

import type { StructureSnapshot } from './structureEngine';
import type { ZoneEngineResult, PocState } from './zoneEngine';
import type { FlowConfirmationReport } from './flowConfirmationEngine';
import type { CoreZoneFusionReport } from './coreZoneFusionEngine';
import type { StrategyZoneFusionReport } from './strategyZoneFusionEngine';
import type { PremiumDiscountReport } from './premiumDiscountEngine';
import type { MtfSequenceReport } from './mtfSequence';
import { smcWyckoffConfluence } from './smcConfluence';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { Eagle1Bar } from './structureEngine';

export type EvidenceGroupId =
  | 'STRUCTURE'
  | 'PROFILE'
  | 'LIQUIDITY'
  | 'FLOW'
  | 'POSITIONING'
  | 'VOLATILITY'
  | 'HTF'
  | 'HISTORICAL';

export type EvidenceGroupVote = {
  group: EvidenceGroupId;
  /** -1 short .. +1 long, null = UNAVAILABLE */
  signed: number | null;
  available: boolean;
  weight: number;
  note: string;
  /** SMC 계열 하위 피처 수 (상관 감안용) */
  smcFeatureCount?: number;
};

export type ConfluenceReport = {
  longScore: number | null;
  shortScore: number | null;
  /** 0~100 setup 강도 — 승률 아님 */
  setupScore: number | null;
  historicalWinRate: number | null;
  historicalSample: number | null;
  groups: EvidenceGroupVote[];
  independentHits: number;
  aPlusLongOk: boolean;
  aPlusShortOk: boolean;
  summaryKo: string;
};

function clamp01(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

/**
 * SMC 하위 피처가 많을수록 추가분 체감 감소 (√n 스케일).
 */
function smcDampen(featureCount: number, raw: number): number {
  if (featureCount <= 1) return raw;
  const damp = Math.sqrt(featureCount) / featureCount;
  return raw * Math.max(0.35, damp * featureCount * 0.45);
}

export function runConfluenceEngine(params: {
  structure: StructureSnapshot;
  zones: ZoneEngineResult;
  flow: FlowConfirmationReport | null;
  core: CoreZoneFusionReport | null;
  strategyFusion: StrategyZoneFusionReport | null;
  premiumDiscount?: PremiumDiscountReport | null;
  mtf?: MtfSequenceReport | null;
  candles?: Eagle1Bar[] | null;
  endExclusive?: number;
  historicalSample?: number | null;
  historicalTpBeforeSl?: number | null;
}): ConfluenceReport {
  const groups: EvidenceGroupVote[] = [];
  const smc = smcWyckoffConfluence({
    structure: params.structure,
    pocState: params.zones.profile.pocState,
    candles: params.candles,
    endExclusive: params.endExclusive,
  });

  /** STRUCTURE — BOS/CHoCH + SMC (상관 감안) */
  {
    const last = [...params.structure.events].reverse()[0];
    let signed: number | null = null;
    let smcN = 0;
    if (last) {
      signed = last.bias === 'bullish' ? 0.4 : -0.4;
      if (last.kind === 'BOS' || last.kind === 'CHOCH') signed *= 1.2;
    }
    if (smc.longAligned) {
      smcN = 3;
      signed = clamp01((signed ?? 0) + smcDampen(smcN, 0.55));
    } else if (smc.shortAligned) {
      smcN = 3;
      signed = clamp01((signed ?? 0) - smcDampen(smcN, 0.55));
    } else if (smc.wyckoffOnly) {
      smcN = 1;
      /** 단독 와이코프는 약하게만 */
      signed = clamp01((signed ?? 0) + (params.structure.wyckoff.label.includes('ACCUM') ? 0.1 : params.structure.wyckoff.label.includes('DIST') ? -0.1 : 0));
    }
    groups.push({
      group: 'STRUCTURE',
      signed,
      available: signed != null,
      weight: 1.2,
      note: smc.notes[0] || last?.kind || 'UNAVAILABLE',
      smcFeatureCount: smcN || undefined,
    });
  }

  /** PROFILE — POC state */
  {
    const st: PocState | null = params.zones.profile.pocState;
    let signed: number | null = null;
    if (st === 'RECLAIMED' || st === 'HOLD_SUCCESS' || st === 'CLOSED_ABOVE') signed = 0.55;
    else if (st === 'LOST' || st === 'REJECTION' || st === 'CLOSED_BELOW') signed = -0.55;
    else if (st === 'APPROACH' || st === 'RETEST') signed = 0.1;
    else if (st) signed = 0;
    groups.push({
      group: 'PROFILE',
      signed,
      available: st != null && st.length > 0,
      weight: 1.0,
      note: st || 'UNAVAILABLE',
    });
  }

  /** LIQUIDITY — core + sweep */
  {
    const core = params.core;
    let signed: number | null = null;
    if (core?.support && !core.resistance) signed = 0.35;
    else if (core?.resistance && !core.support) signed = -0.35;
    else if (core?.support && core.resistance) {
      const px = params.candles?.[Math.max(0, (params.endExclusive ?? params.candles.length) - 1)]?.close;
      if (px != null) {
        const ds = Math.abs(px - core.support.midpoint);
        const dr = Math.abs(px - core.resistance.midpoint);
        signed = ds < dr ? 0.25 : -0.25;
      } else signed = 0;
    }
    const sweep = [...params.structure.events].reverse().find((e) => e.kind === 'SWEEP');
    if (sweep) {
      signed = clamp01((signed ?? 0) + (sweep.bias === 'bullish' ? 0.25 : -0.25));
    }
    groups.push({
      group: 'LIQUIDITY',
      signed,
      available: signed != null,
      weight: 1.0,
      note: core?.note || sweep?.kind || 'UNAVAILABLE',
    });
  }

  /** FLOW */
  {
    const f = params.flow;
    let signed: number | null = null;
    if (!f || f.bias === 'UNAVAILABLE' || f.score == null) {
      signed = null;
    } else {
      signed = clamp01(f.score / 100);
    }
    groups.push({
      group: 'FLOW',
      signed,
      available: signed != null,
      weight: 1.1,
      note: f?.summaryKo || 'UNAVAILABLE',
    });
  }

  /** POSITIONING — premium/discount */
  {
    const pd = params.premiumDiscount;
    let signed: number | null = null;
    if (pd?.zone === 'DISCOUNT') signed = 0.35;
    else if (pd?.zone === 'PREMIUM') signed = -0.35;
    else if (pd?.zone === 'EQUILIBRIUM') signed = 0;
    groups.push({
      group: 'POSITIONING',
      signed,
      available: pd?.zone != null,
      weight: 0.7,
      note: pd?.zone || 'UNAVAILABLE',
    });
  }

  /** VOLATILITY — strategy VCP presence as soft */
  {
    const hasVcp = params.strategyFusion?.strategies.some((s) => s.strategyType === 'VCP');
    groups.push({
      group: 'VOLATILITY',
      signed: hasVcp ? 0.15 : 0,
      available: hasVcp === true,
      weight: 0.5,
      note: hasVcp ? 'VCP present' : 'UNAVAILABLE',
    });
  }

  /** HTF — mtf sequence */
  {
    const mtf = params.mtf;
    let signed: number | null = null;
    if (mtf?.aligned === true) {
      const regime = params.structure.regime;
      if (regime === 'BULL' || regime === 'STRONG_BULL') signed = 0.45;
      else if (regime === 'BEAR' || regime === 'STRONG_BEAR') signed = -0.45;
      else signed = 0.15;
    } else if (mtf?.aligned === false) {
      signed = 0;
    } else if (mtf) {
      signed = null;
    }
    groups.push({
      group: 'HTF',
      signed,
      available: signed != null,
      weight: 1.15,
      note: mtf?.note || (mtf?.aligned == null ? 'UNAVAILABLE' : mtf.aligned ? 'aligned' : 'conflict'),
    });
  }

  /** HISTORICAL — sample gated */
  {
    const n = params.historicalSample ?? null;
    const wr = params.historicalTpBeforeSl ?? null;
    let signed: number | null = null;
    if (n != null && n >= EAGLE1_MIN_STAT_SAMPLE && wr != null) {
      signed = clamp01((wr - 0.5) * 2);
    }
    groups.push({
      group: 'HISTORICAL',
      signed,
      available: signed != null,
      weight: 1.0,
      note:
        n == null || n <= 0
          ? 'UNAVAILABLE'
          : n < EAGLE1_MIN_STAT_SAMPLE
            ? 'LOW SAMPLE'
            : `n=${n}`,
    });
  }

  const avail = groups.filter((g) => g.available && g.signed != null);
  const independentHits = avail.length;
  if (!avail.length) {
    return {
      longScore: null,
      shortScore: null,
      setupScore: null,
      historicalWinRate:
        params.historicalSample != null &&
        params.historicalSample >= EAGLE1_MIN_STAT_SAMPLE &&
        params.historicalTpBeforeSl != null
          ? params.historicalTpBeforeSl
          : null,
      historicalSample: params.historicalSample ?? null,
      groups,
      independentHits: 0,
      aPlusLongOk: false,
      aPlusShortOk: false,
      summaryKo: 'CONFLUENCE UNAVAILABLE',
    };
  }

  let longAcc = 0;
  let shortAcc = 0;
  let wSum = 0;
  for (const g of avail) {
    const s = g.signed!;
    longAcc += Math.max(0, s) * g.weight;
    shortAcc += Math.max(0, -s) * g.weight;
    wSum += g.weight;
  }
  const longScore = Math.round((longAcc / wSum) * 100);
  const shortScore = Math.round((shortAcc / wSum) * 100);
  const setupScore = Math.max(longScore, shortScore);

  /** PHASE 14: historical win rate is walk-forward sample only — never setupScore/100 */
  let histWr =
    params.historicalSample != null &&
    params.historicalSample >= EAGLE1_MIN_STAT_SAMPLE &&
    params.historicalTpBeforeSl != null
      ? params.historicalTpBeforeSl
      : null;
  if (
    histWr != null &&
    setupScore != null &&
    Math.round(histWr * 100) === Math.round(setupScore)
  ) {
    histWr = null;
  }

  const flowOk = params.flow?.usableForConfirm !== false || params.flow?.bias === 'UNAVAILABLE';
  const aPlusLongOk =
    Boolean(params.strategyFusion?.aPlusLong) &&
    Boolean(params.core?.support) &&
    longScore >= 55 &&
    independentHits >= 4 &&
    (params.flow?.bias === 'BUY' ||
      params.flow?.bias === 'STRONG_BUY' ||
      params.flow?.bias === 'NEUTRAL' ||
      params.flow?.bias === 'UNAVAILABLE');
  const aPlusShortOk =
    Boolean(params.strategyFusion?.aPlusShort) &&
    Boolean(params.core?.resistance) &&
    shortScore >= 55 &&
    independentHits >= 4 &&
    (params.flow?.bias === 'SELL' ||
      params.flow?.bias === 'STRONG_SELL' ||
      params.flow?.bias === 'NEUTRAL' ||
      params.flow?.bias === 'UNAVAILABLE');

  void flowOk;

  return {
    longScore,
    shortScore,
    setupScore,
    historicalWinRate: histWr,
    historicalSample: params.historicalSample ?? null,
    groups,
    independentHits,
    aPlusLongOk,
    aPlusShortOk,
    summaryKo: `L${longScore}/S${shortScore} · groups ${independentHits} · setup ${setupScore}${histWr != null ? ` · hist ${(histWr * 100).toFixed(0)}%` : ' · hist UNAVAILABLE'}`,
  };
}

export function smcDampenForTest(featureCount: number, raw: number): number {
  return smcDampen(featureCount, raw);
}

/** SMC 과대평가 방지 스모크: OB+FVG+BPR만으로 STRUCTURE가 폭주하지 않음 */
export function confluenceSmcDampSelftest(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const one = smcDampen(1, 0.55);
  const three = smcDampen(3, 0.55);
  if (!(three < one)) notes.push('3 SMC features should dampen vs 1');
  if (three > 0.55) notes.push('dampened value should not exceed raw');
  return { ok: notes.length === 0, notes };
}
