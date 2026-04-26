import type { AnalyzeResponse, Candle } from '@/types';
import { detectZigzagPivots } from '@/lib/candleAnalysisElliottMvp';

/**
 * 캔들분석: "상승/하락 확정" 휴리스틱 (교육용 MVP)
 * — 한 캔들 ❌ / 구조 전환 + 종가 돌파·이탈 + 2봉 유지(반등 실패) ⭕
 * 실전 엔진 아님; 스윙·API 레벨과 결합한 참고 신호.
 */

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : parseFloat(String(x ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function relEps(px: number): number {
  return Math.max(2e-5, 3e-6 * px);
}

function volSma(candles: Candle[], endExclusive: number, len: number): number {
  const to = Math.min(endExclusive, candles.length) - 1;
  const from = Math.max(0, to - len + 1);
  let s = 0;
  let c = 0;
  for (let i = from; i <= to; i++) {
    s += candles[i].volume || 0;
    c++;
  }
  return c > 0 ? s / c : 0;
}

export type StructureConfirmAxis = {
  structure: boolean;
  /** 종가 기준 주요 레벨 돌파(상승) / 이탈(하락) */
  breakoutClose: boolean;
  /** 돌파·이탈 후 최소 2봉 유지(상승) / 재진입 실패(하락) */
  holdBars: boolean;
  /** 돌파·이탈 봉 거래량 ≥ 최근 평균(돌파 캔들 의미 보조) */
  volumeConfirm: boolean;
  /** 구조·돌파·유지 3요소 충족 수 (0~3) */
  score: number;
  detailKo: string[];
};

export type CandleAnalysisConfirmation = {
  bull: StructureConfirmAxis;
  bear: StructureConfirmAxis;
  headline: 'BULL_CONFIRM' | 'BEAR_CONFIRM' | 'NONE';
  headlineKo: string;
  /** 미확정 시 한 줄 진행 상황 */
  progressKo: string;
};

function priorMaxClose(candles: Candle[], excludeLast: number): number {
  const n = candles.length;
  const to = Math.max(0, n - excludeLast);
  let m = 0;
  for (let i = Math.max(0, to - 45); i < to; i++) {
    m = Math.max(m, candles[i].close);
  }
  return m;
}

function priorMinClose(candles: Candle[], excludeLast: number): number {
  const n = candles.length;
  const to = Math.max(0, n - excludeLast);
  let m = Number.POSITIVE_INFINITY;
  for (let i = Math.max(0, to - 45); i < to; i++) {
    m = Math.min(m, candles[i].close);
  }
  return Number.isFinite(m) ? m : 0;
}

/** evalBull / evalBear 공통 저항·지지 후보 */
function resolveConfirmationReferenceLevels(
  pivots: ReturnType<typeof detectZigzagPivots>,
  analysis: AnalyzeResponse | null,
  candles: Candle[]
): { resist: number | null; support: number | null } {
  const highs = pivots.filter((p) => p.isHigh);
  const lows = pivots.filter((p) => !p.isHigh);
  const br = analysis?.breakoutLevel?.price != null ? num(analysis.breakoutLevel.price) : null;
  const resApi = analysis?.resistanceLevel?.price != null ? num(analysis.resistanceLevel.price) : null;
  const swingRes = highs.length >= 2 ? highs[highs.length - 2].price : null;
  const resist =
    br ?? resApi ?? swingRes ?? (priorMaxClose(candles, 4) > 0 ? priorMaxClose(candles, 4) : null);

  const inv = analysis?.invalidationLevel?.price != null ? num(analysis.invalidationLevel.price) : null;
  const supApi = analysis?.supportLevel?.price != null ? num(analysis.supportLevel.price) : null;
  const swingSup = lows.length >= 2 ? lows[lows.length - 2].price : null;
  const support =
    inv ?? supApi ?? swingSup ?? (priorMinClose(candles, 4) > 0 ? priorMinClose(candles, 4) : null);

  return { resist, support };
}

function evalBull(
  candles: Candle[],
  analysis: AnalyzeResponse | null | undefined,
  pivots: ReturnType<typeof detectZigzagPivots>
): StructureConfirmAxis {
  const n = candles.length;
  const px = candles[n - 1]?.close ?? 1;
  const eps = relEps(px);
  const detail: string[] = [];

  const highs = pivots.filter((p) => p.isHigh);
  const lows = pivots.filter((p) => !p.isHigh);
  let structure = false;
  if (highs.length >= 2 && lows.length >= 2) {
    const h0 = highs[highs.length - 2].price;
    const h1 = highs[highs.length - 1].price;
    const l0 = lows[lows.length - 2].price;
    const l1 = lows[lows.length - 1].price;
    structure = h1 > h0 && l1 > l0;
  }
  detail.push(structure ? '구조: HH+HL(상승 전환)' : '구조: 상승 전환 미충족');

  const { resist } = resolveConfirmationReferenceLevels(pivots, analysis, candles);

  let breakoutClose = false;
  let breakIdx = -1;
  if (resist != null && resist > 0) {
    const from = Math.max(0, n - 22);
    for (let i = n - 1; i >= from; i--) {
      if (candles[i].close > resist * (1 + eps)) {
        breakoutClose = true;
        breakIdx = i;
        break;
      }
    }
  }
  detail.push(
    breakoutClose
      ? `돌파: 종가 > 저항(${resist != null ? resist.toFixed(4) : '-'})`
      : '돌파: 종가 돌파(저항) 미충족'
  );

  let holdBars = false;
  if (breakoutClose && breakIdx >= 0 && breakIdx <= n - 3) {
    const r = resist!;
    let ok = true;
    for (let j = 1; j <= 2; j++) {
      const c = candles[breakIdx + j];
      if (!c) {
        ok = false;
        break;
      }
      if (c.close < r * (1 - 2.5 * eps) || c.low < r * (1 - 5 * eps)) ok = false;
    }
    holdBars = ok;
  }
  detail.push(holdBars ? '유지: 돌파 후 2봉 지지' : '유지: 2봉 유지 미충족');

  let volumeConfirm = false;
  if (breakIdx >= 0) {
    const v = candles[breakIdx].volume || 0;
    const ma = volSma(candles, breakIdx, 20);
    volumeConfirm = ma > 0 && v >= ma * 1.12;
  }
  detail.push(volumeConfirm ? '거래량: 돌파봉 평균 이상' : '거래량: 보조(미충족 가능)');

  const score = (structure ? 1 : 0) + (breakoutClose ? 1 : 0) + (holdBars ? 1 : 0);
  return { structure, breakoutClose, holdBars, volumeConfirm, score, detailKo: detail };
}

function evalBear(
  candles: Candle[],
  analysis: AnalyzeResponse | null | undefined,
  pivots: ReturnType<typeof detectZigzagPivots>
): StructureConfirmAxis {
  const n = candles.length;
  const px = candles[n - 1]?.close ?? 1;
  const eps = relEps(px);
  const detail: string[] = [];

  const highs = pivots.filter((p) => p.isHigh);
  const lows = pivots.filter((p) => !p.isHigh);
  let structure = false;
  if (highs.length >= 2 && lows.length >= 2) {
    const h0 = highs[highs.length - 2].price;
    const h1 = highs[highs.length - 1].price;
    const l0 = lows[lows.length - 2].price;
    const l1 = lows[lows.length - 1].price;
    structure = h1 < h0 && l1 < l0;
  }
  detail.push(structure ? '구조: LH+LL(하락 전환)' : '구조: 하락 전환 미충족');

  const { support } = resolveConfirmationReferenceLevels(pivots, analysis, candles);

  let breakoutClose = false;
  let breakIdx = -1;
  if (support != null && support > 0) {
    const from = Math.max(0, n - 22);
    for (let i = n - 1; i >= from; i--) {
      if (candles[i].close < support * (1 - eps)) {
        breakoutClose = true;
        breakIdx = i;
        break;
      }
    }
  }
  detail.push(
    breakoutClose
      ? `이탈: 종가 < 지지(${support != null ? support.toFixed(4) : '-'})`
      : '이탈: 종가 이탈(지지) 미충족'
  );

  let holdBars = false;
  if (breakoutClose && breakIdx >= 0 && breakIdx <= n - 3) {
    const s = support!;
    let ok = true;
    for (let j = 1; j <= 2; j++) {
      const c = candles[breakIdx + j];
      if (!c) {
        ok = false;
        break;
      }
      if (c.close > s * (1 + 2.5 * eps) || c.high > s * (1 + 5 * eps)) ok = false;
    }
    holdBars = ok;
  }
  detail.push(holdBars ? '반등실패: 이탈 후 2봉 재진입 못함' : '반등실패: 2봉 기준 미충족');

  let volumeConfirm = false;
  if (breakIdx >= 0) {
    const v = candles[breakIdx].volume || 0;
    const ma = volSma(candles, breakIdx, 20);
    volumeConfirm = ma > 0 && v >= ma * 1.12;
  }
  detail.push(volumeConfirm ? '거래량: 이탈봉 평균 이상' : '거래량: 보조(미충족 가능)');

  const score = (structure ? 1 : 0) + (breakoutClose ? 1 : 0) + (holdBars ? 1 : 0);
  return { structure, breakoutClose, holdBars, volumeConfirm, score, detailKo: detail };
}

export function computeCandleAnalysisConfirmation(
  candles: Candle[],
  analysis: AnalyzeResponse | null | undefined
): CandleAnalysisConfirmation {
  const emptyAxis: StructureConfirmAxis = {
    structure: false,
    breakoutClose: false,
    holdBars: false,
    volumeConfirm: false,
    score: 0,
    detailKo: ['데이터 부족'],
  };

  if (!candles.length || candles.length < 30) {
    return {
      bull: emptyAxis,
      bear: emptyAxis,
      headline: 'NONE',
      headlineKo: '확정 판별: 캔들 부족',
      progressKo: '최소 약 30봉 필요',
    };
  }

  const pivots = detectZigzagPivots(candles, 2, 2);
  const bull = evalBull(candles, analysis ?? null, pivots);
  const bear = evalBear(candles, analysis ?? null, pivots);

  const b3 = bull.score >= 3;
  const s3 = bear.score >= 3;

  let headline: CandleAnalysisConfirmation['headline'] = 'NONE';
  let headlineKo = '확정 없음 (구조·돌파/이탈·유지 점검)';

  if (b3 && s3) {
    const v = analysis?.verdict;
    if (v === 'SHORT') {
      headline = 'BEAR_CONFIRM';
      headlineKo = '하락 확정 (구조+종가이탈+유지)';
    } else {
      headline = 'BULL_CONFIRM';
      headlineKo = '상승 확정 (구조+종가돌파+유지)';
    }
  } else if (b3) {
    headline = 'BULL_CONFIRM';
    headlineKo = '상승 확정 (구조+종가돌파+유지)';
  } else if (s3) {
    headline = 'BEAR_CONFIRM';
    headlineKo = '하락 확정 (구조+종가이탈+유지)';
  }

  const chipB = `상↑ ${bull.score}/3`;
  const chipS = `하↓ ${bear.score}/3`;
  const progressKo =
    headline !== 'NONE'
      ? headlineKo
      : `${chipB} · ${chipS} — 한 캔들이 아니라 3요소 동시 충족 시 확정`;

  return { bull, bear, headline, headlineKo, progressKo };
}

/** smartOverlay JSON용 직렬화 (차트·헤더 공통) */
export function confirmationToSmartPayload(c: CandleAnalysisConfirmation) {
  return {
    headline: c.headline,
    headline_ko: c.headlineKo,
    progress_ko: c.progressKo,
    bull: {
      score: c.bull.score,
      structure: c.bull.structure,
      breakout_close: c.bull.breakoutClose,
      hold_bars: c.bull.holdBars,
      volume_confirm: c.bull.volumeConfirm,
    },
    bear: {
      score: c.bear.score,
      structure: c.bear.structure,
      breakout_close: c.bear.breakoutClose,
      hold_bars: c.bear.holdBars,
      volume_confirm: c.bear.volumeConfirm,
    },
    bull_detail: c.bull.detailKo,
    bear_detail: c.bear.detailKo,
  };
}
