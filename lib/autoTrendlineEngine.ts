/**
 * 평행채널 스타일 자동 추세선 (TradingView 평행채널)
 * - 고점: 양봉이면 몸통(상단), 음봉이면 꼬리(고가). 저점: 음봉이면 몸통(하단), 양봉이면 꼬리(저가). 호출 측에서 피벗 가격 적용.
 * - 상단선(저항): 최근 2고점 연결 후 우측 연장.
 * - 하단선(지지): 상단선과 동일 기울기로 최근 저점 하나를 지나 우측 연장 → 평행채널.
 * - 돌파 시 색상 변경.
 */

export type PivotPoint = { index: number; price: number };

export type TrendlineSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  broken?: boolean;
};

export type AutoTrendlineResult = {
  resistance: TrendlineSegment | null;
  support: TrendlineSegment | null;
  /** 평행채널 중앙선 (저항·지지 중간) */
  median: TrendlineSegment | null;
  resistanceBroken: boolean;
  supportBroken: boolean;
};

/** 가격 → 차트 비율 (0=고가 쪽, 1=저가 쪽). 클라이언트 pickPrice(y)=maxPrice-y*range 와 일치 */
function toRatio(price: number, min: number, max: number): number {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

const MIN_PIVOT_BAR_DISTANCE = 2; // 최소 봉 간격 (2 이상이면 채널이 그려지도록 완화)

/**
 * 두 피벗을 잇는 직선을 우측 끝(마지막 봉)까지 연장한 선분의 비율 좌표 (x,y 0~1) 반환.
 * (x1,y1) = 왼쪽(과거) 피벗, (x2,y2) = 우측 끝에서의 연장 가격.
 */
function lineThroughTwoPointsExtended(
  i1: number,
  p1: number,
  i2: number,
  p2: number,
  visibleLen: number,
  min: number,
  max: number
): { x1: number; y1: number; x2: number; y2: number } {
  const n = visibleLen;
  const rightIdx = n - 1;
  const denom = Math.max(1, n - 1);

  const x1 = i1 / denom;
  const y1 = toRatio(p1, min, max);

  let priceAtRight: number;
  if (i2 === i1) {
    priceAtRight = p1;
  } else {
    priceAtRight = p1 + (p2 - p1) * ((rightIdx - i1) / (i2 - i1));
  }
  const x2 = Math.min(0.995, rightIdx / denom);
  const y2 = toRatio(priceAtRight, min, max);
  return { x1, y1, x2, y2 };
}

/** 마지막 2개 피벗이 너무 가까우면, 더 왼쪽 피벗을 써서 기울기를 안정화 */
function pickTwoPivots(pivots: PivotPoint[], minBarDistance: number): PivotPoint[] | null {
  if (pivots.length < 2) return null;
  const last = pivots[pivots.length - 1];
  const prev = pivots[pivots.length - 2];
  if (last.index - prev.index >= minBarDistance) return [prev, last];
  if (pivots.length >= 3) {
    const older = pivots[pivots.length - 3];
    if (last.index - older.index >= minBarDistance) return [older, last];
  }
  return [prev, last];
}

/**
 * index 위치에서의 직선 위 가격
 */
function priceAtIndex(i1: number, p1: number, i2: number, p2: number, idx: number): number {
  if (i2 === i1) return p1;
  return p1 + (p2 - p1) * ((idx - i1) / (i2 - i1));
}

/**
 * 상단선과 평행한 하단선: 동일 기울기로 pivotLow 하나를 지나 우측까지 연장
 */
function parallelLineThroughPoint(
  slope: number,
  throughIdx: number,
  throughPrice: number,
  visibleLen: number,
  min: number,
  max: number
): { x1: number; y1: number; x2: number; y2: number } {
  const n = visibleLen;
  const rightIdx = n - 1;
  const denom = Math.max(1, n - 1);
  const x1 = throughIdx / denom;
  const y1 = toRatio(throughPrice, min, max);
  const priceAtRight = throughPrice + slope * (rightIdx - throughIdx);
  const x2 = Math.min(0.995, rightIdx / denom);
  const y2 = toRatio(priceAtRight, min, max);
  return { x1, y1, x2, y2 };
}

/** 상단선·하단선 중간 가격으로 중앙선(median) 좌표 생성 */
function medianLineSegment(
  resSeg: { x1: number; y1: number; x2: number; y2: number },
  supSeg: { x1: number; y1: number; x2: number; y2: number }
): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: resSeg.x1,
    y1: (resSeg.y1 + supSeg.y1) / 2,
    x2: resSeg.x2,
    y2: (resSeg.y2 + supSeg.y2) / 2,
  };
}

export function computeAutoTrendlines(
  visible: Array<{ high: number; low: number; close: number }>,
  swingHighs: PivotPoint[],
  swingLows: PivotPoint[],
  min: number,
  max: number
): AutoTrendlineResult {
  const visibleLen = visible.length;
  if (visibleLen < 3) {
    return { resistance: null, support: null, median: null, resistanceBroken: false, supportBroken: false };
  }

  const lastClose = visible[visibleLen - 1]?.close ?? 0;
  const rightIdx = visibleLen - 1;

  // 1번·2번: 가격이 가장 높은 두 고점 (시간순으로 왼쪽=1, 오른쪽=2) → 하락 추세선
  const sortedHighsByPrice = [...swingHighs].sort((a, b) => b.price - a.price);
  const topTwoHighs = sortedHighsByPrice.slice(0, 2).sort((a, b) => a.index - b.index);
  const lastTwoHighs = topTwoHighs.length >= 2 ? topTwoHighs : (pickTwoPivots(swingHighs, MIN_PIVOT_BAR_DISTANCE) ?? (swingHighs.length >= 2 ? swingHighs.slice(-2) : null));

  // 3번: 두 고점 사이(또는 그 이후)에서 가격이 가장 낮은 저점 → 평행 하단선이 지나갈 점
  function pickChannelLow(highA: PivotPoint, highB: PivotPoint): PivotPoint | null {
    if (swingLows.length === 0) return null;
    const iMin = Math.min(highA.index, highB.index);
    const iMax = Math.max(highA.index, highB.index);
    const inRange = swingLows.filter((p) => p.index >= iMin && p.index <= iMax);
    const afterRange = swingLows.filter((p) => p.index >= iMax);
    const candidates = inRange.length > 0 ? inRange : afterRange;
    if (candidates.length === 0) return swingLows[swingLows.length - 1];
    return candidates.reduce((low, p) => (p.price < low.price ? p : low));
  }

  let resistance: TrendlineSegment | null = null;
  let support: TrendlineSegment | null = null;
  let median: TrendlineSegment | null = null;
  let resistanceBroken = false;
  let supportBroken = false;

  if (lastTwoHighs && lastTwoHighs.length >= 2) {
    const [a, b] = lastTwoHighs;
    const seg = lineThroughTwoPointsExtended(a.index, a.price, b.index, b.price, visibleLen, min, max);
    const priceAtLastBar = priceAtIndex(a.index, a.price, b.index, b.price, rightIdx);
    resistanceBroken = lastClose > priceAtLastBar;
    resistance = { ...seg, broken: resistanceBroken };

    const channelLow = pickChannelLow(a, b);
    if (channelLow && a.index !== b.index) {
      const slope = (b.price - a.price) / (b.index - a.index);
      const supportSeg = parallelLineThroughPoint(slope, channelLow.index, channelLow.price, visibleLen, min, max);
      const supportPriceAtLastBar = channelLow.price + slope * (rightIdx - channelLow.index);
      supportBroken = lastClose < supportPriceAtLastBar;
      support = { ...supportSeg, broken: supportBroken };
      median = resistance && support ? { ...medianLineSegment(resistance, support) } : null;
    }
  }

  if (!support && swingLows.length >= 2) {
    const lastTwoLows = pickTwoPivots(swingLows, MIN_PIVOT_BAR_DISTANCE) ?? swingLows.slice(-2);
    if (lastTwoLows && lastTwoLows.length >= 2) {
      const [a, b] = lastTwoLows;
      const seg = lineThroughTwoPointsExtended(a.index, a.price, b.index, b.price, visibleLen, min, max);
      const priceAtLastBar = priceAtIndex(a.index, a.price, b.index, b.price, rightIdx);
      supportBroken = lastClose < priceAtLastBar;
      support = { ...seg, broken: supportBroken };
    }
  }

  return {
    resistance,
    support,
    median,
    resistanceBroken,
    supportBroken,
  };
}
