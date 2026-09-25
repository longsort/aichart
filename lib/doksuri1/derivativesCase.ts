/**
 * Doksuri-1 — OI/CVD/Funding CASE (unifiedMarketMetrics 실측만).
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { Doksuri1Fact } from '@/lib/doksuri1/types';

function priceDeltaPct(candles: Candle[]): number | null {
  if (candles.length < 4) return null;
  const a = Number(candles[candles.length - 4]?.close);
  const b = Number(candles[candles.length - 1]?.close);
  if (!(a > 0) || !(b > 0)) return null;
  return ((b - a) / a) * 100;
}

export function readDoksuri1DerivativesCase(params: {
  analysis: AnalyzeResponse | null | undefined;
  candles: Candle[];
  enabled: boolean;
}): {
  cvdState: Doksuri1Fact['cvdState'];
  oiState: Doksuri1Fact['oiState'];
  fundingState: 'POSITIVE' | 'NEGATIVE' | 'FLAT' | null;
  caseKo: string | null;
  fundingKo: string | null;
  liqKo: string | null;
  has: boolean;
} {
  if (!params.enabled) {
    return {
      cvdState: null,
      oiState: null,
      fundingState: null,
      caseKo: null,
      fundingKo: null,
      liqKo: null,
      has: false,
    };
  }
  const a = params.analysis;
  if (!a) {
    return {
      cvdState: null,
      oiState: null,
      fundingState: null,
      caseKo: null,
      fundingKo: null,
      liqKo: null,
      has: false,
    };
  }

  const um = a.unifiedMarketMetrics;
  const oiPct =
    um?.oiDeltaPct != null && Number.isFinite(um.oiDeltaPct)
      ? um.oiDeltaPct
      : a.oiState === 'increasing'
        ? 0.2
        : a.oiState === 'decreasing'
          ? -0.2
          : null;

  let cvdSlope: number | null = null;
  if (um && Number.isFinite(um.aggregatedCvdUsd)) {
    const buy = um.buyVolumeUsd ?? 0;
    const sell = um.sellVolumeUsd ?? 0;
    const tot = buy + sell;
    if (tot > 0) cvdSlope = (buy - sell) / tot;
    else if (Number.isFinite(um.futuresCumulativeCvdUsd)) {
      cvdSlope = um.futuresCumulativeCvdUsd > 0 ? 0.1 : um.futuresCumulativeCvdUsd < 0 ? -0.1 : 0;
    }
  } else if (typeof a.volumeDelta === 'number' && Number.isFinite(a.volumeDelta)) {
    cvdSlope = a.volumeDelta;
  } else if (typeof a.buyPressure === 'number' && typeof a.sellPressure === 'number') {
    cvdSlope = a.buyPressure - a.sellPressure;
  }

  const has = oiPct != null || cvdSlope != null || Boolean(a.fundingState && a.fundingState !== 'neutral');
  if (!has) {
    return {
      cvdState: null,
      oiState: null,
      fundingState: null,
      caseKo: null,
      fundingKo: null,
      liqKo: null,
      has: false,
    };
  }

  const cvdState: Doksuri1Fact['cvdState'] =
    cvdSlope == null ? null : cvdSlope > 0.05 ? 'POSITIVE' : cvdSlope < -0.05 ? 'NEGATIVE' : 'FLAT';
  const oiState: Doksuri1Fact['oiState'] =
    oiPct == null
      ? a.oiState === 'increasing'
        ? 'RISING'
        : a.oiState === 'decreasing'
          ? 'FALLING'
          : a.oiState === 'neutral'
            ? 'FLAT'
            : null
      : oiPct > 0.05
        ? 'RISING'
        : oiPct < -0.05
          ? 'FALLING'
          : 'FLAT';

  const fundingState: 'POSITIVE' | 'NEGATIVE' | 'FLAT' | null =
    a.fundingState === 'positive'
      ? 'POSITIVE'
      : a.fundingState === 'negative'
        ? 'NEGATIVE'
        : a.fundingState === 'neutral'
          ? 'FLAT'
          : null;

  const dPct = priceDeltaPct(params.candles);
  const pxUp = dPct != null && dPct > 0.08;
  const pxDn = dPct != null && dPct < -0.08;

  let caseKo: string | null = null;
  /** CASE A–F — 실측 조합만 */
  if (cvdState === 'POSITIVE' && oiState === 'RISING' && pxUp) {
    caseKo = 'CASE A · CVD↑ OI↑ 가격↑ · 신규 롱 유입(조건부)';
  } else if (cvdState === 'NEGATIVE' && oiState === 'RISING' && pxDn) {
    caseKo = 'CASE B · CVD↓ OI↑ 가격↓ · 신규 숏 공격(조건부)';
  } else if (cvdState === 'POSITIVE' && oiState === 'FALLING') {
    caseKo = 'CASE C · CVD↑ OI↓ · 숏커버·청산성격 가능(조건부)';
  } else if (cvdState === 'NEGATIVE' && oiState === 'FALLING') {
    caseKo = 'CASE D · CVD↓ OI↓ · 롱 정리·이탈 가능(조건부)';
  } else if (oiState === 'RISING' && pxUp && cvdState === 'NEGATIVE') {
    caseKo = 'CASE E · 가격↑·CVD↓·OI↑ · 약세 다이버전스 감시(조건부)';
  } else if (oiState === 'RISING' && pxDn && cvdState === 'POSITIVE') {
    caseKo = 'CASE F · 가격↓·CVD↑·OI↑ · 강세 다이버전스 감시(조건부)';
  } else if (cvdState === 'NEGATIVE' && oiState === 'RISING') {
    caseKo = 'CVD↓·OI↑ · 신규 숏 공격 가능성(조건부)';
  } else if (cvdState === 'POSITIVE' && oiState === 'RISING') {
    caseKo = 'CVD↑·OI↑ · 신규 롱 유입 가능성(조건부)';
  } else if (oiState === 'FALLING' && cvdState === 'NEGATIVE') {
    caseKo = 'OI↓·CVD↓ · 롱 정리 성격 가능(조건부)';
  } else if (cvdState === 'POSITIVE' && oiState === 'FALLING') {
    caseKo = 'OI↓·CVD↑ · 숏커버 성격 가능(조건부)';
  }

  const fundingKo =
    fundingState === 'POSITIVE'
      ? '펀딩 + (롱 지불)'
      : fundingState === 'NEGATIVE'
        ? '펀딩 − (숏 지불)'
        : fundingState === 'FLAT'
          ? '펀딩 중립'
          : null;

  let liqKo: string | null = null;
  if (um) {
    const lLong = um.liquidationLongUsd ?? 0;
    const lShort = um.liquidationShortUsd ?? 0;
    const tot = lLong + lShort;
    if (tot > 0) {
      liqKo = `청산 롱 ${Math.round((lLong / tot) * 100)}% / 숏 ${Math.round((lShort / tot) * 100)}%`;
    }
    const longP = um.liqClusterLongPrice;
    const shortP = um.liqClusterShortPrice;
    if (longP != null && longP > 0) {
      liqKo = (liqKo ? `${liqKo} · ` : '') + `롱청산밀집 ${Math.round(longP)}`;
    }
    if (shortP != null && shortP > 0) {
      liqKo = (liqKo ? `${liqKo} · ` : '') + `숏청산밀집 ${Math.round(shortP)}`;
    }
  }

  return { cvdState, oiState, fundingState, caseKo, fundingKo, liqKo, has: true };
}
