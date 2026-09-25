/**
 * 분봉 볼륨폭발 진입 신호 — 실측 ROE7%@20x 조건과 동일 규칙.
 * 녹봉+RVOL≥3 → 롱후보 · 빨봉+RVOL≥3 → 숏후보.
 * RSI는 참고만(단독 게이트 아님). 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';

export const VOL_ROE_BURST_RVOL_MIN = 3;
export const VOL_ROE_BURST_TARGET_ROE = 7;
export const VOL_ROE_BURST_LEVERAGE = 20;
/** 실측에서 조건 효과가 큰 TF — 감지는 이 둘만 */
export const VOL_ROE_BURST_DETECT_TFS = ['5m', '15m'] as const;

/** 20배 ROE7% → 필요 가격 변동률(%) */
export function volRoeBurstPriceMovePct(
  roePct = VOL_ROE_BURST_TARGET_ROE,
  leverage = VOL_ROE_BURST_LEVERAGE
): number {
  const lev = Math.max(1, leverage);
  return (Math.max(0.1, roePct) / lev);
}

export type VolRoeBurstSignal = {
  fired: boolean;
  direction: 'LONG' | 'SHORT' | null;
  rvol: number;
  candle: 'green' | 'red' | 'doji';
  rsi: number | null;
  barTime: number;
  barIndex: number;
  /** 감지 TF (5m|15m) */
  detectTf: string;
  targetRoePct: number;
  leverage: number;
  priceMovePct: number;
  noteKo: string;
  reasonKo: string;
};

function rsiAt(closes: number[], i: number, period = 14): number | null {
  if (i < period) return null;
  let au = 0;
  let ad = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const d = closes[k]! - closes[k - 1]!;
    if (d >= 0) au += d;
    else ad -= d;
  }
  au /= period;
  ad /= period;
  if (ad <= 1e-12) return 100;
  const rs = au / ad;
  return 100 - 100 / (1 + rs);
}

function empty(noteKo: string, detectTf = ''): VolRoeBurstSignal {
  return {
    fired: false,
    direction: null,
    rvol: 0,
    candle: 'doji',
    rsi: null,
    barTime: 0,
    barIndex: -1,
    detectTf,
    targetRoePct: VOL_ROE_BURST_TARGET_ROE,
    leverage: VOL_ROE_BURST_LEVERAGE,
    priceMovePct: volRoeBurstPriceMovePct(),
    noteKo,
    reasonKo: noteKo,
  };
}

/**
 * 마감봉(기본 n-2, 형성중 제외) 기준 볼륨폭발 신호.
 */
export function evaluateVolRoeBurstSignal(
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>,
  opts?: {
    /** 마감봉 인덱스 · 기본 length-2 */
    asOfIndex?: number;
    rvolMin?: number;
    smaPeriod?: number;
    leverage?: number;
    targetRoePct?: number;
    detectTf?: string;
  }
): VolRoeBurstSignal {
  const detectTf = String(opts?.detectTf || '');
  const rows = (candles || []).filter(
    (c) => Number(c.close) > 0 && Number(c.time) > 0
  ) as Candle[];
  const smaN = Math.max(8, opts?.smaPeriod ?? 20);
  const rvolMin = opts?.rvolMin ?? VOL_ROE_BURST_RVOL_MIN;
  const lev = opts?.leverage ?? VOL_ROE_BURST_LEVERAGE;
  const roe = opts?.targetRoePct ?? VOL_ROE_BURST_TARGET_ROE;
  const priceMovePct = volRoeBurstPriceMovePct(roe, lev);

  if (rows.length < smaN + 3) {
    return empty('통계 부족 · 캔들부족', detectTf);
  }

  const i = opts?.asOfIndex ?? Math.max(0, rows.length - 2);
  if (i < smaN - 1 || i >= rows.length) {
    return empty('통계 부족 · 인덱스', detectTf);
  }

  const bar = rows[i]!;
  let sma = 0;
  for (let k = i - smaN + 1; k <= i; k++) sma += Number(rows[k]!.volume) || 0;
  sma /= smaN;
  const vol = Math.max(0, Number(bar.volume) || 0);
  const rvol = sma > 0 ? vol / sma : 0;

  const body = Math.abs(bar.close - bar.open);
  const range = Math.max(bar.high - bar.low, 1e-9);
  const doji = body / range < 0.12;
  const candle: VolRoeBurstSignal['candle'] = doji
    ? 'doji'
    : bar.close >= bar.open
      ? 'green'
      : 'red';

  const closes = rows.map((c) => c.close);
  const rsi = rsiAt(closes, i);
  const tfTag = detectTf ? `${detectTf} · ` : '';

  if (!(rvol >= rvolMin)) {
    return {
      ...empty(`${tfTag}RVOL ${rvol.toFixed(1)} < ${rvolMin}`, detectTf),
      rvol,
      candle,
      rsi,
      barTime: Number(bar.time),
      barIndex: i,
      detectTf,
      targetRoePct: roe,
      leverage: lev,
      priceMovePct,
    };
  }

  if (candle === 'doji') {
    return {
      fired: false,
      direction: null,
      rvol,
      candle,
      rsi,
      barTime: Number(bar.time),
      barIndex: i,
      detectTf,
      targetRoePct: roe,
      leverage: lev,
      priceMovePct,
      noteKo: `${tfTag}RVOL ${rvol.toFixed(1)}× · 도지 · 방향불명`,
      reasonKo: '볼륨폭발이나 도지라 롱/숏 미지정',
    };
  }

  const direction: 'LONG' | 'SHORT' = candle === 'green' ? 'LONG' : 'SHORT';
  const rsiTag =
    rsi == null
      ? ''
      : rsi < 30
        ? ' · RSI과매도(참고)'
        : rsi > 70
          ? ' · RSI과매수(참고)'
          : '';

  return {
    fired: true,
    direction,
    rvol,
    candle,
    rsi,
    barTime: Number(bar.time),
    barIndex: i,
    detectTf,
    targetRoePct: roe,
    leverage: lev,
    priceMovePct,
    noteKo: `${tfTag}${direction === 'LONG' ? '롱' : '숏'}후보 · ${candle === 'green' ? '녹' : '빨'}봉 · RVOL ${rvol.toFixed(1)}× · ROE${roe}%@${lev}x(≈${priceMovePct.toFixed(2)}%)${rsiTag}`,
    reasonKo: `5m·15m 볼륨폭발신호 · 확정아님 · 타점게이트 합류용`,
  };
}

type BurstCandleRow = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/**
 * 감지 TF = 5m · 15m 만.
 * 둘 다 발화 시 15m 우선(실측 효과 더 큼) · 같은 방향이면 rvol 큰 쪽.
 */
export function evaluateVolRoeBurstOnDetectTfs(params: {
  candles5m?: BurstCandleRow[] | null;
  candles15m?: BurstCandleRow[] | null;
  leverage?: number;
  targetRoePct?: number;
}): VolRoeBurstSignal {
  const opts = {
    leverage: params.leverage ?? VOL_ROE_BURST_LEVERAGE,
    targetRoePct: params.targetRoePct ?? VOL_ROE_BURST_TARGET_ROE,
  };
  const s15 = evaluateVolRoeBurstSignal(params.candles15m || [], {
    ...opts,
    detectTf: '15m',
  });
  const s5 = evaluateVolRoeBurstSignal(params.candles5m || [], {
    ...opts,
    detectTf: '5m',
  });

  if (s15.fired && s5.fired) {
    if (s15.direction === s5.direction) {
      return s15.rvol >= s5.rvol ? s15 : s5;
    }
    /** 충돌 시 15m 우선 */
    return s15;
  }
  if (s15.fired) return s15;
  if (s5.fired) return s5;
  if ((params.candles15m?.length || 0) >= 24) return s15;
  if ((params.candles5m?.length || 0) >= 24) return s5;
  return empty('5m·15m 캔들부족 · 볼륨폭발 대기');
}

/** 타점 방향과 볼륨신호 정렬 시 가산 */
export function volRoeBurstAlignBoost(
  burst: VolRoeBurstSignal,
  direction: 'LONG' | 'SHORT' | null
): { flowBoost: number; setupBoost: number; microSoft: boolean; tag: string } {
  if (!burst.fired || !burst.direction) {
    return { flowBoost: 0, setupBoost: 0, microSoft: false, tag: '' };
  }
  if (direction && direction !== burst.direction) {
    return {
      flowBoost: -8,
      setupBoost: 0,
      microSoft: false,
      tag: `VOL_BURST_CONFLICT:${burst.detectTf || ''}${burst.direction}`,
    };
  }
  return {
    flowBoost: 14,
    setupBoost: 8,
    microSoft: true,
    tag: `VOL_BURST_${burst.detectTf || 'TF'}_${burst.direction}`,
  };
}
