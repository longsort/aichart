/**
 * 타점엔진 — 기관밴드 중심 E / SL / T1 타점 스킬.
 * 확정 수익 아님 · CONFIRMED·실시간활동 합류와 병행.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  computeInstitutionalBandInteractionMarkers,
  computeInstitutionalSuperTrendCore,
  institutionalBandTouchMinGapBars,
  type InstitutionalBandInteractionMarker,
} from '@/lib/institutionalSuperBand';
import { institutionalEnvelopeParamsForTf } from '@/lib/mergedDeskEnvelopeMtfLink';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';

/** A안 기본 — 익절 8% ROE (구 계산 15는 8로) · 손절 8% */
export const INST_BAND_SCALP_A_TP1_ROE = 8;
export const INST_BAND_SCALP_A_SL_ROE = 8;
export const INST_BAND_SCALP_A_LEV = 20;
export const INST_BAND_SCALP_A_TAG = 'inst-band-a';

/** 익절 ROE 계산이 15면 8%로 */
export function resolveInstBandATp1RoePct(raw?: number | null): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return INST_BAND_SCALP_A_TP1_ROE;
  if (Math.round(v) === 15) return INST_BAND_SCALP_A_TP1_ROE;
  return Math.max(1, Math.min(50, v));
}

export type InstBandTapStatus =
  | 'WAIT'
  | 'WATCH_LONG'
  | 'WATCH_SHORT'
  | 'READY_LONG'
  | 'READY_SHORT';

export type InstBandTapPlan = {
  status: InstBandTapStatus;
  direction: 'LONG' | 'SHORT' | null;
  /** 주문·카드용 — READY일 때만 true */
  actionable: boolean;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  rr: number | null;
  grade: 'S' | 'A' | 'B' | 'C' | null;
  confluenceTotal: number;
  bandDir: 'long' | 'short' | null;
  /** 차트 기관밴드1 — 기본 SuperTrend(10, 3) 방향 */
  band1Dir: 'long' | 'short' | null;
  /** 차트 기관밴드2 — 이 타임프레임 SuperTrend 방향 */
  band2Dir: 'long' | 'short' | null;
  upper: number | null;
  mid: number | null;
  lower: number | null;
  /** ATR(14) — 스탑헌팅 패드 */
  atr: number | null;
  /** 최근 밴드 관통 꼬리. 롱=저가, 숏=고가 */
  huntExtreme: number | null;
  /** 캔들 반응 한 줄 */
  candleKo: string;
  reasonKo: string;
  parts: string[];
  touch: InstitutionalBandInteractionMarker | null;
  updatedAt: number;
};

function atrApprox(candles: Candle[], period = 14): number {
  const n = candles.length;
  if (n < 2) return 0;
  const p = Math.min(period, n - 1);
  let sum = 0;
  for (let i = n - p; i < n; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    sum += tr;
  }
  return sum / p;
}

/** 최근 봉이 밴드를 찌른 끝. 롱은 하단 아래 저가, 숏은 상단 위 고가. */
function bandHuntExtreme(
  candles: Candle[],
  dir: 'LONG' | 'SHORT',
  upper: number,
  lower: number,
  atr: number
): number {
  const n = candles.length;
  const from = Math.max(0, n - 24);
  const near = atr > 0 ? atr * 0.35 : (upper - lower) * 0.08;
  if (dir === 'LONG') {
    let x = lower;
    for (let i = from; i < n; i++) {
      const lo = Number(candles[i]!.low);
      if (lo > 0 && lo <= lower + near && lo < x) x = lo;
    }
    return x;
  }
  let x = upper;
  for (let i = from; i < n; i++) {
    const hi = Number(candles[i]!.high);
    if (hi >= upper - near && hi > x) x = hi;
  }
  return x;
}

function candleReactionKo(
  c: Candle,
  dir: 'LONG' | 'SHORT',
  band: number,
  atrLike = 0
): { ok: boolean; ko: string; score: number } {
  const range = Math.max(1e-12, c.high - c.low);
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const atr = atrLike > 0 ? atrLike : range;
  const near =
    Math.abs(c.low - band) <= atr * 0.85 ||
    Math.abs(c.high - band) <= atr * 0.85 ||
    Math.abs(c.low - band) / Math.max(band, 1) < 0.0018 ||
    Math.abs(c.high - band) / Math.max(band, 1) < 0.0018 ||
    (dir === 'LONG' && c.low <= band * 1.0015 && c.close >= band * 0.999) ||
    (dir === 'SHORT' && c.high >= band * 0.9985 && c.close <= band * 1.001);

  if (dir === 'LONG') {
    const reject = lowerWick >= range * 0.38 && c.close >= c.open;
    const eng = c.close > c.open && body >= range * 0.45 && c.close >= band;
    if (reject && near) return { ok: true, ko: '하단터치·아래심지거부', score: 78 };
    if (eng && near) return { ok: true, ko: '하단근접·양봉탈환', score: 72 };
    if (near && c.close > c.open) return { ok: false, ko: '하단근접·반응약함', score: 45 };
    return { ok: false, ko: '롱반응없음', score: 20 };
  }
  const reject = upperWick >= range * 0.38 && c.close <= c.open;
  const eng = c.close < c.open && body >= range * 0.45 && c.close <= band;
  if (reject && near) return { ok: true, ko: '상단터치·위심지거부', score: 78 };
  if (eng && near) return { ok: true, ko: '상단근접·음봉탈환', score: 72 };
  if (near && c.close < c.open) return { ok: false, ko: '상단근접·반응약함', score: 45 };
  return { ok: false, ko: '숏반응없음', score: 20 };
}

function emptyPlan(partial?: Partial<InstBandTapPlan>): InstBandTapPlan {
  return {
    status: 'WAIT',
    direction: null,
    actionable: false,
    entry: null,
    sl: null,
    tp1: null,
    rr: null,
    grade: null,
    confluenceTotal: 0,
    bandDir: null,
    band1Dir: null,
    band2Dir: null,
    upper: null,
    mid: null,
    lower: null,
    atr: null,
    huntExtreme: null,
    candleKo: '대기',
    reasonKo: '기관밴드 데이터 부족',
    parts: [],
    touch: null,
    updatedAt: Date.now(),
    ...partial,
  };
}

/**
 * 기관밴드 + 최근 터치 + 캔들 반응 → E/SL/T1 (A안 ROE).
 * @param timeframe 차트 TF (3m 권장)
 */
export function buildInstitutionalBandTapPlan(
  candles: Candle[],
  timeframe = '3m',
  opts?: { leverage?: number; tp1RoePct?: number; slRoePct?: number }
): InstBandTapPlan {
  if (!candles || candles.length < 24) {
    return emptyPlan({ reasonKo: '봉부족 · 24봉 이상 필요' });
  }

  const tf = normalizeChartTimeframe(String(timeframe || '3m')) || '3m';
  const { period, mult } = institutionalEnvelopeParamsForTf(tf);
  const p = period || INSTITUTIONAL_BAND_DEFAULT_PERIOD;
  const m = mult || INSTITUTIONAL_BAND_DEFAULT_MULT;
  const core = computeInstitutionalSuperTrendCore(candles, p, m);
  if (!core) return emptyPlan({ reasonKo: '밴드코어 계산실패' });
  const core1 = computeInstitutionalSuperTrendCore(
    candles,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT
  );

  const lev = Math.max(
    1,
    Math.min(125, Math.round(Number(opts?.leverage) || INST_BAND_SCALP_A_LEV))
  );
  const tpRoePct = resolveInstBandATp1RoePct(opts?.tp1RoePct);
  const slRoePct = Math.max(
    1,
    Number(opts?.slRoePct) || INST_BAND_SCALP_A_SL_ROE
  );

  const i = candles.length - 1;
  const c = candles[i]!;
  const trend = core.trend[i] === 1 ? 'long' : 'short';
  const upper = Number(core.finalUpper[i]);
  const lower = Number(core.finalLower[i]);
  if (!(upper > 0) || !(lower > 0) || !(upper > lower)) {
    return emptyPlan({ reasonKo: '밴드가격 무효' });
  }
  const mid = (upper + lower) / 2;
  const atr = atrApprox(candles, 14) || (upper - lower) * 0.25;

  const marks = computeInstitutionalBandInteractionMarkers(candles, p, m, {
    minBarsBetween: institutionalBandTouchMinGapBars(tf),
    minTier: 'C',
    confluence: { enabled: true },
  });
  const lastT = Number(c.time);
  const spanSec = tf === '3m' ? 3 * 60 : tf === '1m' ? 60 : 15 * 60;
  const recent = marks
    .filter((x) => {
      const t = Number(x.time);
      const dt = Math.abs(t - lastT);
      /** sec·ms 모두 */
      return dt <= 10 * spanSec || dt <= 10 * spanSec * 1000;
    })
    .slice(-6);
  const byIdx = marks.slice(-4);
  const pool = recent.length ? recent : byIdx;
  const preferDir = trend === 'long' ? 'LONG' : 'SHORT';
  const touch =
    [...pool].reverse().find((x) => x.verdict === preferDir) ||
    [...pool].reverse()[0] ||
    null;

  const bandPx = preferDir === 'LONG' ? lower : upper;
  const react = candleReactionKo(c, preferDir, bandPx, atr);
  const grade = touch?.confluence?.grade ?? null;
  const confTot = Number(touch?.confluence?.total) || 0;
  const parts = [
    `밴드${trend === 'long' ? '롱' : '숏'}`,
    `A안TP${tpRoePct}/SL${slRoePct}`,
    ...(touch?.summaryParts || []).slice(0, 3),
    ...(touch?.confluence?.parts || []).slice(0, 2),
    react.ko,
  ].filter(Boolean);

  let status: InstBandTapStatus = 'WAIT';
  let direction: 'LONG' | 'SHORT' | null = null;

  /** READY: 터치·반응 또는 합류 B↑ + 근접 */
  if (preferDir === 'LONG') {
    if (react.ok || (react.score >= 50 && (grade === 'S' || grade === 'A' || grade === 'B'))) {
      status = 'READY_LONG';
      direction = 'LONG';
    } else if (touch?.verdict === 'LONG' || react.score >= 40) {
      status = 'WATCH_LONG';
      direction = 'LONG';
    }
  } else {
    if (react.ok || (react.score >= 50 && (grade === 'S' || grade === 'A' || grade === 'B'))) {
      status = 'READY_SHORT';
      direction = 'SHORT';
    } else if (touch?.verdict === 'SHORT' || react.score >= 40) {
      status = 'WATCH_SHORT';
      direction = 'SHORT';
    }
  }

  let entry: number | null = null;
  let sl: number | null = null;
  let tp1: number | null = null;
  let rr: number | null = null;

  if (direction === 'LONG' || direction === 'SHORT') {
    entry = Number(c.close);
    const tpFrac = tpRoePct / 100;
    const slFrac = slRoePct / 100;
    tp1 = roeTargetPrice(entry, direction, lev, tpFrac);
    sl =
      direction === 'LONG'
        ? roeTargetPrice(entry, 'SHORT', lev, slFrac)
        : roeTargetPrice(entry, 'LONG', lev, slFrac);
    rr = slRoePct > 0 ? tpRoePct / slRoePct : null;
  }

  /** A안 TP8/SL8 ROE · RR≥1 허용 */
  const rrOk = rr != null && rr >= 1;
  const reactPass = react.ok || react.score >= 50;
  const actionable =
    (status === 'READY_LONG' || status === 'READY_SHORT') &&
    Boolean(direction) &&
    reactPass &&
    rrOk &&
    entry != null &&
    sl != null &&
    tp1 != null;

  if (!actionable && (status === 'READY_LONG' || status === 'READY_SHORT')) {
    status = direction === 'LONG' ? 'WATCH_LONG' : 'WATCH_SHORT';
  }

  const reasonKo = actionable
    ? `기관밴드A ${direction} READY · TP${tpRoePct}%/SL${slRoePct}%ROE · ${react.ko}`
    : status.startsWith('WATCH')
      ? `관망 · ${react.ko} · 합류${grade || '—'}`
      : `대기 · 밴드${trend === 'long' ? '롱' : '숏'} · 터치/반응 대기`;

  return {
    status: actionable
      ? status
      : status === 'READY_LONG'
        ? 'WATCH_LONG'
        : status === 'READY_SHORT'
          ? 'WATCH_SHORT'
          : status,
    direction,
    actionable,
    entry,
    sl,
    tp1,
    rr,
    grade,
    confluenceTotal: confTot,
    bandDir: trend,
    band1Dir: core1 ? (core1.trend[i] === 1 ? 'long' : 'short') : null,
    band2Dir: trend,
    upper,
    mid,
    lower,
    atr,
    huntExtreme: bandHuntExtreme(
      candles,
      direction === 'LONG' || direction === 'SHORT' ? direction : preferDir,
      upper,
      lower,
      atr
    ),
    candleKo: react.ko,
    reasonKo,
    parts,
    touch,
    updatedAt: Date.now(),
  };
}

/** 자동매매 합류 — CONFIRMED 방향과 기관밴드 READY 일치 시에만 true */
export function institutionalBandAlignsWithConfirmed(
  plan:
    | Pick<InstBandTapPlan, 'actionable' | 'direction' | 'candleKo'>
    | { actionable?: boolean; direction?: 'LONG' | 'SHORT' | null; candleKo?: string }
    | null
    | undefined,
  confirmedDir: 'LONG' | 'SHORT' | null | undefined
): { ok: boolean; reasonKo: string } {
  if (!confirmedDir) return { ok: false, reasonKo: 'CONFIRMED없음' };
  if (!plan?.actionable || !plan.direction) {
    return { ok: false, reasonKo: '기관밴드 READY아님 · 합류대기' };
  }
  if (plan.direction !== confirmedDir) {
    return {
      ok: false,
      reasonKo: `밴드${plan.direction}≠확정${confirmedDir} · 충돌스킵`,
    };
  }
  return { ok: true, reasonKo: `기관밴드합류 · ${plan.candleKo || ''}`.trim() };
}
