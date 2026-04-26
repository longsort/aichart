import type { Candle } from '@/types';

/** 반등 정의: 종가 수익률이 각 기준을 초과한 비율 */
export type VolumeShockHorizonStat = {
  bars: number;
  /** 수익률 {'>'} 0% */
  probRebound: number;
  /** 수익률 {'>'} 0.3% */
  probReboundT03: number;
  /** 수익률 {'>'} 0.7% */
  probReboundT07: number;
  probDownFollow: number;
  meanPct: number;
  medianPct: number;
};

export type VolumeShockStat = {
  threshold: number;
  thresholdKind: 'fixed' | 'p95' | 'p99';
  /** 표시용 (고정 / 동적 P95·P99) */
  thresholdLabel: string;
  sampleCount: number;
  /** 표본 30 미만이면 참고용 */
  sampleLowTrust: boolean;
  horizons: VolumeShockHorizonStat[];
};

export type VolumeShockForecastResult = {
  timeframe: string;
  totalBars: number;
  /** 참고용 신뢰 경고 (임의 임계에서 표본 30 미만) */
  lowSampleWarning: boolean;
  /** 동적 임계 계산에 쓴 과거 봉 수 */
  lookbackBars: number;
  /** 동적 임계가 꺼졌거나 데이터 부족이면 null */
  dynamicVolume: { p95: number; p99: number } | null;
  /** 최근 봉들 기준 단기 방향 감(참고) */
  shortTermRegime: {
    windowBars: number;
    changePct: number;
    label: '상승 추세' | '하락 추세' | '횡보 구간';
  };
  /** 현재 봉이 빅숏 이벤트로 얼마나 강한지 0~100 (거래량·음봉·임계 충족 수) */
  currentEventScore: number;
  current: {
    time: number;
    open: number;
    close: number;
    volume: number;
    isBear: boolean;
    hitThresholds: number[];
  };
  /** 사용된 모든 임계값(고정+동적, 오름차순) */
  thresholds: number[];
  eventStats: VolumeShockStat[];
};

function percentileSorted(values: number[], p: number): number {
  if (!values.length) return NaN;
  const idx = (values.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return values[lo];
  return values[lo] + (values[hi] - values[lo]) * (idx - lo);
}

const SAMPLE_TRUST_MIN = 30;

function labelForThreshold(kind: 'fixed' | 'p95' | 'p99', value: number): string {
  const v = Math.round(value);
  if (kind === 'fixed') return `고정 ${v.toLocaleString('ko-KR')}`;
  if (kind === 'p95') return `동적 상위 5% (${v.toLocaleString('ko-KR')})`;
  return `동적 상위 1% (${v.toLocaleString('ko-KR')})`;
}

function nearEqual(a: number, b: number, eps = 1e-3): boolean {
  return Math.abs(a - b) <= eps;
}

function computeShortTermRegime(sorted: Candle[], n: number): { windowBars: number; changePct: number; label: '상승 추세' | '하락 추세' | '횡보 구간' } {
  const windowBars = Math.min(48, n);
  if (windowBars < 12) {
    return { windowBars, changePct: 0, label: '횡보 구간' };
  }
  const slice = sorted.slice(n - windowBars, n);
  const first = slice[0]?.close;
  const lastC = slice[slice.length - 1]?.close;
  if (!first || !lastC || first <= 0) {
    return { windowBars, changePct: 0, label: '횡보 구간' };
  }
  const changePct = ((lastC / first) - 1) * 100;
  if (changePct > 1.1) return { windowBars, changePct, label: '상승 추세' };
  if (changePct < -1.1) return { windowBars, changePct, label: '하락 추세' };
  return { windowBars, changePct, label: '횡보 구간' };
}

function computeEventScore(params: {
  volume: number;
  isBear: boolean;
  hitCount: number;
  p99: number | null;
}): number {
  const { volume, isBear, hitCount, p99 } = params;
  const baseP = p99 && p99 > 0 ? p99 : Math.max(volume, 1);
  const volRatio = Math.min(2.2, volume / baseP);
  const volPart = Math.min(42, volRatio * 19);
  const bearPart = isBear ? 26 : 0;
  const hitPart = Math.min(32, hitCount * 11);
  return Math.min(100, Math.round(volPart + bearPart + hitPart));
}

export function computeVolumeShockForecast(
  candles: Candle[],
  options?: {
    /** 기본 5000, 10000 */
    thresholds?: number[];
    horizons?: number[];
    timeframe?: string;
    /** 최근 거래량 분포로 P95·P99 임계 추가 (기본 true) */
    includeDynamic?: boolean;
    /** 동적 임계용 과거 봉 수 (기본: 약 30일) */
    lookbackBars?: number;
  }
): VolumeShockForecastResult | { error: string } {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  if (n < 120) return { error: `캔들 부족: ${n}` };

  const tf = options?.timeframe ?? '15m';
  const fixedRaw = (options?.thresholds?.length ? options.thresholds : [5000, 10000])
    .map((x) => Math.max(1, Number(x)))
    .filter((x, i, a) => Number.isFinite(x) && a.indexOf(x) === i)
    .sort((a, b) => a - b);

  const horizons = (options?.horizons?.length ? options.horizons : [1, 4, 12])
    .map((x) => Math.max(1, Math.floor(Number(x))))
    .filter((x, i, a) => Number.isFinite(x) && a.indexOf(x) === i)
    .sort((a, b) => a - b);

  const maxH = Math.max(...horizons);
  if (n < maxH + 30) return { error: '선행 구간 대비 데이터 부족' };

  const includeDynamic = options?.includeDynamic !== false;
  const defaultLookback = Math.min(96 * 30, Math.max(200, n - 50));
  const lookbackBars = Math.max(50, Math.min(n - 2, options?.lookbackBars ?? defaultLookback));

  /** 현재 봉 제외, 과거 구간 거래량으로 분위수 */
  const volStart = Math.max(0, n - 1 - lookbackBars);
  const volSlice = sorted.slice(volStart, n - 1).map((c) => c.volume).filter((v) => Number.isFinite(v) && v >= 0);
  const volSorted = [...volSlice].sort((a, b) => a - b);

  type ThEntry = { value: number; kind: 'fixed' | 'p95' | 'p99' };
  const entries: ThEntry[] = [];

  for (const v of fixedRaw) {
    entries.push({ value: v, kind: 'fixed' });
  }

  let dynamicVolume: { p95: number; p99: number } | null = null;
  if (includeDynamic && volSorted.length >= 20) {
    const p95 = percentileSorted(volSorted, 0.95);
    const p99 = percentileSorted(volSorted, 0.99);
    if (Number.isFinite(p95) && Number.isFinite(p99)) {
      dynamicVolume = { p95, p99 };
      if (!entries.some((e) => nearEqual(e.value, p95))) entries.push({ value: p95, kind: 'p95' });
      if (!entries.some((e) => nearEqual(e.value, p99))) entries.push({ value: p99, kind: 'p99' });
    }
  }

  entries.sort((a, b) => a.value - b.value);

  const last = sorted[n - 1];
  const currentHit = entries
    .filter((e) => last.volume >= e.value && last.close < last.open)
    .map((e) => e.value);

  const shortTermRegime = computeShortTermRegime(sorted, n);
  const currentEventScore = computeEventScore({
    volume: last.volume,
    isBear: last.close < last.open,
    hitCount: currentHit.length,
    p99: dynamicVolume?.p99 ?? null,
  });

  const eventStats: VolumeShockStat[] = [];
  let lowSampleWarning = false;

  for (const { value: thr, kind } of entries) {
    const eventIdx: number[] = [];
    for (let i = 0; i < n - maxH; i++) {
      const c = sorted[i];
      if (c.close < c.open && c.volume >= thr) eventIdx.push(i);
    }

    const horizonStats: VolumeShockHorizonStat[] = horizons.map((h) => {
      const rets: number[] = [];
      let rebound = 0;
      let rebound03 = 0;
      let rebound07 = 0;
      let downFollow = 0;
      for (const i of eventIdx) {
        const c0 = sorted[i];
        const c1 = sorted[i + h];
        if (!c0 || !c1 || c0.close <= 0) continue;
        const ret = (c1.close / c0.close - 1) * 100;
        rets.push(ret);
        if (ret > 0) rebound++;
        if (ret > 0.3) rebound03++;
        if (ret > 0.7) rebound07++;
        if (ret < 0) downFollow++;
      }
      rets.sort((a, b) => a - b);
      const len = rets.length;
      return {
        bars: h,
        probRebound: len ? rebound / len : 0,
        probReboundT03: len ? rebound03 / len : 0,
        probReboundT07: len ? rebound07 / len : 0,
        probDownFollow: len ? downFollow / len : 0,
        meanPct: len ? rets.reduce((s, x) => s + x, 0) / len : NaN,
        medianPct: percentileSorted(rets, 0.5),
      };
    });

    const sampleCount = eventIdx.length;
    const sampleLowTrust = sampleCount < SAMPLE_TRUST_MIN;
    if (sampleLowTrust) lowSampleWarning = true;

    eventStats.push({
      threshold: thr,
      thresholdKind: kind,
      thresholdLabel: labelForThreshold(kind, thr),
      sampleCount,
      sampleLowTrust,
      horizons: horizonStats,
    });
  }

  return {
    timeframe: tf,
    totalBars: n,
    lowSampleWarning,
    lookbackBars,
    dynamicVolume,
    shortTermRegime,
    currentEventScore,
    current: {
      time: last.time,
      open: last.open,
      close: last.close,
      volume: last.volume,
      isBear: last.close < last.open,
      hitThresholds: currentHit,
    },
    thresholds: entries.map((e) => e.value),
    eventStats,
  };
}
