import type { Candle } from '@/types';

export type TailongCloseStrength = 'weak' | 'medium' | 'strong';

export type TailongCloseSignal = {
  id: string;
  /** 짧은 차트 라벨 */
  label: string;
  /** 한글 상세 설명 (교재식) */
  detailKo: string;
  strength: TailongCloseStrength;
  price: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
};

type TfBucket = 'scalp' | 'htf4' | 'daily' | 'weekly';

function timeframeBucket(tf: string): TfBucket {
  if (tf === '4h') return 'htf4';
  if (tf === '1d') return 'daily';
  if (tf === '1w' || tf === '1M' || tf === '1Y') return 'weekly';
  return 'scalp';
}

/** TF별 보수 임계값 — 상위 TF일수록 엄격 */
const TF_THRESHOLDS: Record<
  TfBucket,
  {
    breakoutWickMax: number;
    breakoutBodyMin: number;
    longBodyPct: number;
    longBodyAtr: number;
    absorbWickMin: number;
    absorbBodyMin: number;
    /** 상위 TF: 흐름 연계 신호에 필요한 최소 몸통 비율(도지 제외) */
    flowBodyMin: number;
  }
> = {
  scalp: {
    breakoutWickMax: 0.28,
    breakoutBodyMin: 0.5,
    longBodyPct: 0.62,
    longBodyAtr: 0.85,
    absorbWickMin: 0.44,
    absorbBodyMin: 0.28,
    flowBodyMin: 0,
  },
  htf4: {
    breakoutWickMax: 0.22,
    breakoutBodyMin: 0.55,
    longBodyPct: 0.66,
    longBodyAtr: 0.95,
    absorbWickMin: 0.48,
    absorbBodyMin: 0.32,
    flowBodyMin: 0.22,
  },
  daily: {
    breakoutWickMax: 0.18,
    breakoutBodyMin: 0.58,
    longBodyPct: 0.68,
    longBodyAtr: 1.02,
    absorbWickMin: 0.5,
    absorbBodyMin: 0.34,
    flowBodyMin: 0.24,
  },
  weekly: {
    breakoutWickMax: 0.15,
    breakoutBodyMin: 0.6,
    longBodyPct: 0.7,
    longBodyAtr: 1.08,
    absorbWickMin: 0.52,
    absorbBodyMin: 0.36,
    flowBodyMin: 0.28,
  },
};

function strengthFromConfidence(conf: number, bucket: TfBucket): TailongCloseStrength {
  const bands =
    bucket === 'weekly'
      ? { strong: 88, medium: 76 }
      : bucket === 'daily'
        ? { strong: 85, medium: 74 }
        : bucket === 'htf4'
          ? { strong: 83, medium: 72 }
          : { strong: 80, medium: 70 };
  if (conf >= bands.strong) return 'strong';
  if (conf >= bands.medium) return 'medium';
  return 'weak';
}

function strengthKo(s: TailongCloseStrength): string {
  return s === 'strong' ? '강' : s === 'medium' ? '중' : '약';
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 타이롱식 봉마감 규칙 (이미지·교재 요지):
 * - 판단은 확정봉 종가 중심 (꼬리만 길고 몸통이 안쪽이면 경고)
 * - 상위 TF일수록 임계값 보수적으로
 */
export function detectTailongCloseSignals(visible: Candle[], atrVal: number, timeframe: string): TailongCloseSignal[] {
  const bucket = timeframeBucket(timeframe);
  const th = TF_THRESHOLDS[bucket];
  const n = visible.length;
  if (n < 12) return [];
  const last = visible[n - 1];
  const prev = visible[n - 2];
  const range = Math.max(1e-9, last.high - last.low);
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const bodyPct = body / range;
  const upperPct = upperWick / range;
  const lowerPct = lowerWick / range;
  const bodyAtr = body / Math.max(atrVal, 1e-9);
  const bullClose = last.close > last.open;
  const bearClose = last.close < last.open;

  const recent = visible.slice(Math.max(0, n - 22), n - 1);
  const recentHigh = recent.length ? Math.max(...recent.map((c) => c.high)) : prev.high;
  const recentLow = recent.length ? Math.min(...recent.map((c) => c.low)) : prev.low;

  const out: TailongCloseSignal[] = [];

  if (bullClose && last.close > recentHigh) {
    const ok = upperPct <= th.breakoutWickMax && bodyPct >= th.breakoutBodyMin;
    const conf = ok
      ? clamp(82 + Math.round((1 - upperPct / th.breakoutWickMax) * 8) + Math.round((bodyPct - th.breakoutBodyMin) * 40), 78, 94)
      : clamp(68 + Math.round(upperPct * 20), 64, 78);
    const strength = strengthFromConfidence(conf, bucket);
    out.push({
      id: ok ? 'tailong-close-breakout-up-ok' : 'tailong-close-breakout-up-risk',
      label: `${strengthKo(strength)} ${ok ? '매물대 돌파(마감)' : '돌파·윗꼬리 경고'}`,
      detailKo: ok
        ? `종가가 직전 구간 고점을 넘겨 마감했고, 윗꼬리 비중이 ${(upperPct * 100).toFixed(0)}%로 제한적이라 돌파 확인에 가깝습니다.`
        : `고점 돌파 시도 후 종가는 위쪽이나 윗꼬리 ${(upperPct * 100).toFixed(0)}%로 길어 휩쏘·실패 가능성을 열어둡니다.`,
      strength,
      price: last.close,
      bias: ok ? 'bullish' : 'neutral',
      confidence: conf,
    });
  }
  if (bearClose && last.close < recentLow) {
    const ok = lowerPct <= th.breakoutWickMax && bodyPct >= th.breakoutBodyMin;
    const conf = ok
      ? clamp(82 + Math.round((1 - lowerPct / th.breakoutWickMax) * 8) + Math.round((bodyPct - th.breakoutBodyMin) * 40), 78, 94)
      : clamp(68 + Math.round(lowerPct * 20), 64, 78);
    const strength = strengthFromConfidence(conf, bucket);
    out.push({
      id: ok ? 'tailong-close-breakdown-ok' : 'tailong-close-breakdown-risk',
      label: `${strengthKo(strength)} ${ok ? '지지 이탈(마감)' : '이탈·아랫꼬리 경고'}`,
      detailKo: ok
        ? `종가가 직전 구간 저점 아래로 마감했고, 아래꼬리 비중이 ${(lowerPct * 100).toFixed(0)}%로 짧아 이탈 확인에 가깝습니다.`
        : `저점 이탈 시도 후 종가는 아래쪽이나 아래꼬리 ${(lowerPct * 100).toFixed(0)}%로 길어 되돌림·실패 가능성을 열어둡니다.`,
      strength,
      price: last.close,
      bias: ok ? 'bearish' : 'neutral',
      confidence: conf,
    });
  }

  if (bullClose && bodyPct >= th.longBodyPct && bodyAtr >= th.longBodyAtr) {
    const conf = clamp(Math.round(74 + bodyPct * 18 + bodyAtr * 8), 72, 94);
    const strength = strengthFromConfidence(conf, bucket);
    out.push({
      id: 'tailong-close-long-bull',
      label: `${strengthKo(strength)} 장대양봉(마감)`,
      detailKo: `몸통이 전체 범위의 ${(bodyPct * 100).toFixed(0)}%, ATR 대비 ${bodyAtr.toFixed(2)}배로 마감 주도권이 매수 쪽에 있습니다.`,
      strength,
      price: last.close,
      bias: 'bullish',
      confidence: conf,
    });
  }
  if (bearClose && bodyPct >= th.longBodyPct && bodyAtr >= th.longBodyAtr) {
    const conf = clamp(Math.round(74 + bodyPct * 18 + bodyAtr * 8), 72, 94);
    const strength = strengthFromConfidence(conf, bucket);
    out.push({
      id: 'tailong-close-long-bear',
      label: `${strengthKo(strength)} 장대음봉(마감)`,
      detailKo: `몸통이 전체 범위의 ${(bodyPct * 100).toFixed(0)}%, ATR 대비 ${bodyAtr.toFixed(2)}배로 마감 주도권이 매도 쪽에 있습니다.`,
      strength,
      price: last.close,
      bias: 'bearish',
      confidence: conf,
    });
  }

  if (bullClose && lowerPct >= th.absorbWickMin && bodyPct >= th.absorbBodyMin) {
    const conf = clamp(Math.round(66 + lowerPct * 28 + bodyPct * 12), 66, 90);
    const strength = strengthFromConfidence(conf, bucket);
    out.push({
      id: 'tailong-close-lower-wick-absorb',
      label: `${strengthKo(strength)} 아래꼬리 매수흡수`,
      detailKo: `시중 하락 후 아래꼬리 ${(lowerPct * 100).toFixed(0)}%로 되돌려 종가를 몸통 위로 마감 — 매수가 매도를 흡수한 형태입니다.`,
      strength,
      price: Math.min(last.open, last.close),
      bias: 'bullish',
      confidence: conf,
    });
  }
  if (bearClose && upperPct >= th.absorbWickMin && bodyPct >= th.absorbBodyMin) {
    const conf = clamp(Math.round(66 + upperPct * 28 + bodyPct * 12), 66, 90);
    const strength = strengthFromConfidence(conf, bucket);
    out.push({
      id: 'tailong-close-upper-wick-absorb',
      label: `${strengthKo(strength)} 윗꼬리 매도흡수`,
      detailKo: `상승 시도 후 윗꼬리 ${(upperPct * 100).toFixed(0)}%로 눌려 종가를 몸통 아래로 마감 — 매도가 매수를 흡수한 형태입니다.`,
      strength,
      price: Math.max(last.open, last.close),
      bias: 'bearish',
      confidence: conf,
    });
  }

  const c1 = visible[n - 3];
  const c2 = visible[n - 2];
  const c3 = visible[n - 1];
  const risingFlow = c1.close < c2.close && c2.close < c3.close;
  const fallingFlow = c1.close > c2.close && c2.close > c3.close;
  if (risingFlow && bullClose && bodyPct >= th.flowBodyMin) {
    const conf = bucket === 'weekly' ? 72 : bucket === 'daily' ? 73 : 74;
    const strength = strengthFromConfidence(conf, bucket);
    out.push({
      id: 'tailong-close-flow-up',
      label: `${strengthKo(strength)} 하위흐름 상승 연계`,
      detailKo: '직전 세 봉 종가가 단계적으로 상승하며 마지막 봉이 양봉으로 마감 — 단기 흐름이 상위 봉 마감과 같은 방향으로 정렬되었습니다.',
      strength,
      price: c3.close,
      bias: 'bullish',
      confidence: conf,
    });
  } else if (fallingFlow && bearClose && bodyPct >= th.flowBodyMin) {
    const conf = bucket === 'weekly' ? 72 : bucket === 'daily' ? 73 : 74;
    const strength = strengthFromConfidence(conf, bucket);
    out.push({
      id: 'tailong-close-flow-down',
      label: `${strengthKo(strength)} 하위흐름 하락 연계`,
      detailKo: '직전 세 봉 종가가 단계적으로 하락하며 마지막 봉이 음봉으로 마감 — 단기 흐름이 상위 봉 마감과 같은 방향으로 정렬되었습니다.',
      strength,
      price: c3.close,
      bias: 'bearish',
      confidence: conf,
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}
