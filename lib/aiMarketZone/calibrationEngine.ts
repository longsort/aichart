/**
 * STEP18 — Probability Calibration + Consensus / Abstention.
 * Empiric(통계) ⊕ ML(kNN) · Score→확률 금지 · 불일치 시 WAIT.
 */
import { empiricRatesFromStats } from './empiricRates';
import { extractAmzFeatures } from './featureVector';
import { predictAmzMlFromCases, type AmzMlCase, type AmzMlPrediction } from './mlPredict';
import type { AmzStatsFile } from './statsTypes';
import type { AmzMarketZone, AmzProbabilities } from './types';

const DISAGREE_MAX = 0.28;
const EMPIRIC_W = 0.55;
const ML_W = 0.45;

type RateBundle = {
  hold: number | null;
  breakTrue: number | null;
  fakeBreak: number | null;
  sweep: number | null;
  range: number | null;
  flip: number | null;
};

function peakKind(r: RateBundle): { kind: keyof RateBundle; v: number } | null {
  const entries: Array<[keyof RateBundle, number]> = [
    ['hold', r.hold ?? -1],
    ['breakTrue', r.breakTrue ?? -1],
    ['fakeBreak', r.fakeBreak ?? -1],
    ['sweep', r.sweep ?? -1],
    ['range', r.range ?? -1],
    ['flip', r.flip ?? -1],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  if (!top || top[1] < 0) return null;
  return { kind: top[0], v: top[1] };
}

function renormalize(r: RateBundle): RateBundle {
  const vals = [r.hold, r.breakTrue, r.fakeBreak, r.sweep, r.range, r.flip];
  const sum = vals.reduce<number>((s, x) => s + (x != null && Number.isFinite(x) ? x : 0), 0);
  if (sum <= 0) return r;
  const f = (x: number | null) => (x != null && Number.isFinite(x) ? x / sum : null);
  return {
    hold: f(r.hold),
    breakTrue: f(r.breakTrue),
    fakeBreak: f(r.fakeBreak),
    sweep: f(r.sweep),
    range: f(r.range),
    flip: f(r.flip),
  };
}

function blend(a: RateBundle, b: RateBundle, wa: number, wb: number): RateBundle {
  const mix = (x: number | null, y: number | null) => {
    if (x == null && y == null) return null;
    if (x == null) return y;
    if (y == null) return x;
    return x * wa + y * wb;
  };
  return renormalize({
    hold: mix(a.hold, b.hold),
    breakTrue: mix(a.breakTrue, b.breakTrue),
    fakeBreak: mix(a.fakeBreak, b.fakeBreak),
    sweep: mix(a.sweep, b.sweep),
    range: mix(a.range, b.range),
    flip: mix(a.flip, b.flip),
  });
}

function waitProb(sampleSize: number, reason: string): AmzProbabilities {
  return {
    hold: null,
    breakTrue: null,
    fakeBreak: null,
    sweep: null,
    range: null,
    flip: null,
    sampleSize,
    calibrated: false,
    abstainReasonKo: reason,
  };
}

/**
 * Layer2 통계 + Layer3 ML → Layer4 보정 + Layer5 합의.
 */
export function calibrateAmzProbabilities(params: {
  zone: AmzMarketZone;
  stats: AmzStatsFile | null | undefined;
  atr: number | null;
}): { probabilities: AmzProbabilities; ml: AmzMlPrediction | null; confidence: AmzMarketZone['confidence'] } {
  const { zone, stats, atr } = params;
  const empiric = empiricRatesFromStats(stats ?? null, zone.role);
  const cases: AmzMlCase[] = stats?.mlCases ?? [];
  const features = extractAmzFeatures(zone, atr);
  const ml = predictAmzMlFromCases({ features, role: zone.role, cases });

  const empiricReady = empiric.calibrated;
  const mlReady = ml.ready;

  if (!empiricReady && !mlReady) {
    return {
      probabilities: waitProb(
        Math.max(empiric.sampleSize, ml.neighborCount),
        empiric.abstainReasonKo || ml.abstainReasonKo || '캘리브레이션 WAIT'
      ),
      ml,
      confidence: 'NONE',
    };
  }

  if (empiricReady && mlReady) {
    const eBundle: RateBundle = {
      hold: empiric.hold,
      breakTrue: empiric.breakTrue,
      fakeBreak: empiric.fakeBreak,
      sweep: empiric.sweep,
      range: empiric.range,
      flip: empiric.flip,
    };
    const mBundle: RateBundle = {
      hold: ml.hold,
      breakTrue: ml.breakTrue,
      fakeBreak: ml.fakeBreak,
      sweep: ml.sweep,
      range: ml.range,
      flip: ml.flip,
    };
    const pe = peakKind(eBundle);
    const pm = peakKind(mBundle);
    if (pe && pm && pe.kind !== pm.kind) {
      const gap = Math.abs(pe.v - (mBundle[pe.kind] ?? 0));
      const gap2 = Math.abs(pm.v - (eBundle[pm.kind] ?? 0));
      if (Math.max(gap, gap2) >= DISAGREE_MAX) {
        return {
          probabilities: waitProb(
            empiric.sampleSize,
            `합의 실패 · 통계=${pe.kind} ML=${pm.kind} · UNCERTAIN/WAIT`
          ),
          ml,
          confidence: 'LOW',
        };
      }
    }
    const blended = blend(eBundle, mBundle, EMPIRIC_W, ML_W);
    return {
      probabilities: {
        ...blended,
        sampleSize: empiric.sampleSize,
        calibrated: true,
        abstainReasonKo: null,
      },
      ml,
      confidence: empiric.sampleSize >= 80 && ml.neighborCount >= 20 ? 'HIGH' : 'MED',
    };
  }

  if (empiricReady) {
    return {
      probabilities: {
        hold: empiric.hold,
        breakTrue: empiric.breakTrue,
        fakeBreak: empiric.fakeBreak,
        sweep: empiric.sweep,
        range: empiric.range,
        flip: empiric.flip,
        sampleSize: empiric.sampleSize,
        calibrated: true,
        abstainReasonKo: null,
      },
      ml,
      confidence: 'MED',
    };
  }

  /** ML만 준비 — 경험률 없을 때 참고용, calibrated=false 유지(순수 ML≠확정 보정) */
  return {
    probabilities: {
      hold: ml.hold,
      breakTrue: ml.breakTrue,
      fakeBreak: ml.fakeBreak,
      sweep: ml.sweep,
      range: ml.range,
      flip: ml.flip,
      sampleSize: ml.neighborCount,
      calibrated: false,
      abstainReasonKo: '통계 부족 · ML 유사사례만 참고 · 확정 보정 아님',
    },
    ml,
    confidence: 'LOW',
  };
}
