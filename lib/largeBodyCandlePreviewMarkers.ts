import type { Candle } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';

/** 차트 시리즈 마커와 동일 형태 */
export type LargeBodyChartMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  shape: 'circle';
  color: string;
  text: string;
  size?: number;
};

export type LargeBodyCandlePreviewResult = {
  markers: LargeBodyChartMarker[];
  /** 마지막 봉 클릭 시 툴팁 한 줄(해당 봉에 신호가 있을 때만) */
  detailLineKo?: string;
};

export type LargeBodyPreviewOptions = {
  /** 스캔할 최근 봉 수(기본 720) */
  lookbackBars?: number;
  /** 마커 개수 상한 — 초과 시 최신 쪽만 유지(기본 480) */
  maxMarkers?: number;
};

function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

/** 봉별 Wilder ATR(14) */
function wilderAtr14(candles: Candle[]): number[] {
  const n = candles.length;
  const out = new Array(n).fill(NaN);
  const period = 14;
  if (n < period + 1) return out;
  const tr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    const pc = i > 0 ? Number(candles[i - 1].close) : cl;
    if (![h, l, cl, pc].every((x) => Number.isFinite(x))) tr[i] = 0;
    else tr[i] = trueRange(h, l, pc);
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    out[i] = (out[i - 1]! * (period - 1) + tr[i]) / period;
  }
  return out;
}

function tfRangeBodyTuning(tf: string): { tightAvg: number } {
  const t = String(tf || '');
  if (t === '1m' || t === '3m') return { tightAvg: 0.44 };
  if (t === '5m') return { tightAvg: 0.43 };
  if (t === '15m') return { tightAvg: 0.42 };
  if (t === '1h') return { tightAvg: 0.41 };
  if (t === '4h') return { tightAvg: 0.4 };
  return { tightAvg: 0.38 };
}

/**
 * SMC 흐름에서 말하는 displacement·강한 마감에 가깝게:
 * - 상/하단 마감(레인지 위·아래쪽 종가)
 * - 직전 3봉 **절대 몸통** 평균 대비 확대
 * - 레인지는 ATR 대비 너무 작지 않게(노이즈 제거)
 * - (보조) 직전 봉 고가 돌파 시 상단 마감 임계를 약간 완화
 */
type SmcLargeTuning = {
  closeEdge: number;
  minBodyRatio: number;
  dispMult: number;
  atrFloor: number;
  breakEdge: number;
};

function smcLargeBodyTuning(tf: string): SmcLargeTuning {
  const t = String(tf || '');
  if (t === '1m' || t === '3m') return { closeEdge: 0.58, minBodyRatio: 0.51, dispMult: 1.3, atrFloor: 0.7, breakEdge: 0.5 };
  if (t === '5m') return { closeEdge: 0.59, minBodyRatio: 0.52, dispMult: 1.32, atrFloor: 0.72, breakEdge: 0.51 };
  if (t === '15m') return { closeEdge: 0.6, minBodyRatio: 0.53, dispMult: 1.34, atrFloor: 0.74, breakEdge: 0.52 };
  if (t === '1h') return { closeEdge: 0.61, minBodyRatio: 0.54, dispMult: 1.35, atrFloor: 0.75, breakEdge: 0.52 };
  if (t === '4h') return { closeEdge: 0.62, minBodyRatio: 0.55, dispMult: 1.36, atrFloor: 0.76, breakEdge: 0.53 };
  return { closeEdge: 0.63, minBodyRatio: 0.56, dispMult: 1.38, atrFloor: 0.78, breakEdge: 0.54 };
}

function avgPrevAbsBodies(candles: Candle[], i: number, span: number): number {
  let s = 0;
  let c = 0;
  for (let j = i - span; j < i; j++) {
    if (j < 0) continue;
    const cj = candles[j]!;
    s += Math.abs(Number(cj.close) - Number(cj.open));
    c++;
  }
  return c > 0 ? s / c : 0;
}

function smcClassifyLarge(
  candles: Candle[],
  i: number,
  atr: number,
  s: SmcLargeTuning
): '장양' | '장음' | null {
  const c = candles[i]!;
  const h = Number(c.high);
  const l = Number(c.low);
  const o = Number(c.open);
  const cl = Number(c.close);
  if (![h, l, o, cl].every((x) => Number.isFinite(x))) return null;

  const range = Math.max(1e-12, h - l);
  const body = Math.abs(cl - o);
  const br = body / range;
  if (br < s.minBodyRatio) return null;
  if (range < atr * s.atrFloor) return null;

  const prevHigh = i > 0 ? Number(candles[i - 1]!.high) : NaN;
  const prevLow = i > 0 ? Number(candles[i - 1]!.low) : NaN;
  const brokeUp = Number.isFinite(prevHigh) && cl > prevHigh;
  const brokeDown = Number.isFinite(prevLow) && cl < prevLow;

  const avgAbs = avgPrevAbsBodies(candles, i, 3);
  const baseForDisp = Math.max(avgAbs, atr * 0.12);
  if (body < s.dispMult * baseForDisp) return null;

  if (cl > o) {
    const locFromLow = (cl - l) / range;
    const need = brokeUp ? s.breakEdge : s.closeEdge;
    if (locFromLow >= need) return '장양';
  } else if (cl < o) {
    const locFromHigh = (h - cl) / range;
    const need = brokeDown ? s.breakEdge : s.closeEdge;
    if (locFromHigh >= need) return '장음';
  }
  return null;
}

/**
 * 최근 봉 구간에 SMC 장양·장음이 있었는지(차트에서 장 라벨은 숨겨도 동일 규칙).
 * MTF 요약 패널 등 게이지용.
 */
export function recentSmcJangPresence(candles: Candle[], timeframe: string, tailBars = 16): { jangYang: boolean; jangEum: boolean } {
  const n = candles.length;
  const out = { jangYang: false, jangEum: false };
  if (n < 18) return out;
  const atrArr = wilderAtr14(candles);
  const smc = smcLargeBodyTuning(timeframe);
  const span = Math.max(8, Math.min(56, tailBars));
  const i0 = Math.max(14, n - span);
  for (let i = i0; i < n; i++) {
    const atr = atrArr[i];
    if (atr == null || !Number.isFinite(atr) || atr <= 0) continue;
    const k = smcClassifyLarge(candles, i, atr, smc);
    if (k === '장양') out.jangYang = true;
    if (k === '장음') out.jangEum = true;
  }
  return out;
}

/** 마지막 봉에 SMC 장양·장음 분류(차트 라벨 숨김과 동일 규칙) */
export function lastBarSmcLargeKind(candles: Candle[], timeframe: string): '장양' | '장음' | null {
  const n = candles.length;
  if (n < 18) return null;
  const atrArr = wilderAtr14(candles);
  const smc = smcLargeBodyTuning(timeframe);
  const i = n - 1;
  const atr = atrArr[i];
  if (atr == null || !Number.isFinite(atr) || atr <= 0) return null;
  return smcClassifyLarge(candles, i, atr, smc);
}

/** 특정 인덱스 봉의 SMC 장양·장음(게이지 전봉용, 인덱스 14 미만이면 null) */
export function smcLargeKindAt(candles: Candle[], timeframe: string, barIndex: number): '장양' | '장음' | null {
  const n = candles.length;
  if (n < 18 || barIndex < 14 || barIndex >= n) return null;
  const atrArr = wilderAtr14(candles);
  const smc = smcLargeBodyTuning(timeframe);
  const atr = atrArr[barIndex];
  if (atr == null || !Number.isFinite(atr) || atr <= 0) return null;
  return smcClassifyLarge(candles, barIndex, atr, smc);
}

/** 직전 3봉(겹치면 i-3..i-1) 평균 몸통/레인지 비율 — 낮을수록 압축 */
function compressionScore(candles: Candle[], i: number): number | null {
  let sumBr = 0;
  let cnt = 0;
  for (let j = Math.max(1, i - 3); j < i; j++) {
    const cj = candles[j]!;
    const rj = Number(cj.high) - Number(cj.low);
    if (!Number.isFinite(rj) || rj <= 0) continue;
    sumBr += Math.abs(Number(cj.close) - Number(cj.open)) / rj;
    cnt++;
  }
  if (cnt === 0) return null;
  return sumBr / cnt;
}

/** 장대 전 설정 봉: 직전 구간 압축 + 아직 SMC 장대 아님 + 과도한 확장 봉 제외 */
function setupBarBeforeLarge(
  candles: Candle[],
  i: number,
  atrArr: number[],
  tun: ReturnType<typeof tfRangeBodyTuning>,
  smc: SmcLargeTuning
): boolean {
  const atr = atrArr[i];
  if (atr == null || !Number.isFinite(atr) || atr <= 0) return false;
  if (smcClassifyLarge(candles, i, atr, smc)) return false;
  const sc = compressionScore(candles, i);
  if (sc == null || sc >= tun.tightAvg) return false;
  const c = candles[i]!;
  const h = Number(c.high);
  const l = Number(c.low);
  const o = Number(c.open);
  const cl = Number(c.close);
  const range = h - l;
  if (!Number.isFinite(range) || range <= 0) return false;
  const br = Math.abs(cl - o) / range;
  if (range >= atr * 1.08 && br >= 0.58) return false;
  return true;
}

type DeltaKind = '△양' | '△음';

type DeltaPick = { kind: DeltaKind; strength: number };

/**
 * 후행 검증: 인덱스 J에서 SMC 장대가 나왔을 때만, J-2 또는 J-3을 후보로 두고
 * 압축 점수가 더 좋은 설정 봉 1곳에 △ 표시. 동일 k에 이벤트가 겹치면 장대 강도(range/ATR)가 큰 쪽 채택.
 */
function buildForwardDeltaMap(
  candles: Candle[],
  atrArr: number[],
  tun: ReturnType<typeof tfRangeBodyTuning>,
  smc: SmcLargeTuning,
  start: number,
  n: number
): Map<number, DeltaKind> {
  const bestByK = new Map<number, DeltaPick>();

  const consider = (J: number, large: '장양' | '장음') => {
    const atrJ = atrArr[J];
    if (atrJ == null || !Number.isFinite(atrJ) || atrJ <= 0) return;
    const cJ = candles[J]!;
    const rJ = Number(cJ.high) - Number(cJ.low);
    if (!Number.isFinite(rJ) || rJ <= 0) return;
    const strength = rJ / atrJ;

    const dir: DeltaKind = large === '장양' ? '△양' : '△음';
    type Cand = { k: number; score: number };
    const cands: Cand[] = [];
    for (const off of [3, 2] as const) {
      const k = J - off;
      if (k < 14 || k < start) continue;
      if (!setupBarBeforeLarge(candles, k, atrArr, tun, smc)) continue;
      const sc = compressionScore(candles, k);
      if (sc == null) continue;
      cands.push({ k, score: sc });
    }
    if (cands.length === 0) return;
    const bestCand = cands.reduce((a, b) => (a.score <= b.score ? a : b));

    const prev = bestByK.get(bestCand.k);
    if (!prev || strength > prev.strength) {
      bestByK.set(bestCand.k, { kind: dir, strength });
    }
  };

  const J0 = Math.max(14, start + 3);
  for (let J = J0; J < n; J++) {
    const large = smcClassifyLarge(candles, J, atrArr[J]!, smc);
    if (large === '장양' || large === '장음') consider(J, large);
  }

  const out = new Map<number, DeltaKind>();
  for (const [k, v] of bestByK) out.set(k, v.kind);
  return out;
}

type Kind = '장양' | '장음' | '△양' | '△음' | '△양·예' | '△음·예';

/** 설정 봉에서 롱 임펄스 선행 힌트(넓히면 거짓 신호↑ — 보수적으로) */
function bullSetupHint(candles: Candle[], i: number): boolean {
  const c = candles[i]!;
  const h = Number(c.high);
  const l = Number(c.low);
  const o = Number(c.open);
  const cl = Number(c.close);
  const range = h - l;
  if (!Number.isFinite(range) || range <= 0) return false;
  const loc = (cl - l) / range;
  return cl >= o || loc >= 0.48;
}

/** 설정 봉에서 숏 임펄스 선행 힌트 */
function bearSetupHint(candles: Candle[], i: number): boolean {
  const c = candles[i]!;
  const h = Number(c.high);
  const l = Number(c.low);
  const o = Number(c.open);
  const cl = Number(c.close);
  const range = h - l;
  if (!Number.isFinite(range) || range <= 0) return false;
  const loc = (h - cl) / range;
  return cl <= o || loc >= 0.48;
}

/**
 * 차트 **오른쪽 끝**에서만: 아직 이후 봉에 SMC 장대가 확정되지 않았고,
 * 반대 방향 장대가 먼저 나오지도 않은 상태에서 압축 설정이면 △·예 후보 표시.
 * (과거 구간 전체에 쓰면 압축만 맞고 장대가 안 나온 구간까지 전부 찍혀 거짓 신호 폭증)
 */
function buildLiveEdgeProspectiveMap(
  candles: Candle[],
  atrArr: number[],
  tun: ReturnType<typeof tfRangeBodyTuning>,
  smc: SmcLargeTuning,
  confirmed: Map<number, DeltaKind>,
  start: number,
  n: number
): Map<number, '△양·예' | '△음·예'> {
  const out = new Map<number, '△양·예' | '△음·예'>();
  if (n < 18) return out;
  /** 마지막 몇 봉만: 이후에 SMC 장대가 한 번도 안 나온 ‘미완성’ 구간에서만 선행 표시 */
  const edgeLo = Math.max(14, start, n - 5);
  const edgeHi = n - 2;
  if (edgeLo > edgeHi) return out;
  const tightMult = 0.87;

  for (let i = edgeLo; i <= edgeHi; i++) {
    if (confirmed.has(i)) continue;
    if (!setupBarBeforeLarge(candles, i, atrArr, tun, smc)) continue;
    const sc = compressionScore(candles, i);
    if (sc == null || sc > tun.tightAvg * tightMult) continue;

    let firstDisp: '장양' | '장음' | null = null;
    for (let j = i + 1; j < n; j++) {
      const L = smcClassifyLarge(candles, j, atrArr[j]!, smc);
      if (L) {
        firstDisp = L;
        break;
      }
    }
    if (firstDisp !== null) continue;

    const yangOk = bullSetupHint(candles, i);
    const eumOk = bearSetupHint(candles, i);
    if (yangOk && !eumOk) out.set(i, '△양·예');
    else if (eumOk && !yangOk) out.set(i, '△음·예');
  }

  return out;
}

function classifyBar(
  candles: Candle[],
  i: number,
  atrArr: number[],
  tun: ReturnType<typeof tfRangeBodyTuning>,
  smc: SmcLargeTuning,
  forwardDelta: Map<number, DeltaKind>,
  prospectiveDelta: Map<number, '△양·예' | '△음·예'>
): Kind | null {
  if (i < 14 || i >= candles.length) return null;
  const atr = atrArr[i];
  if (atr == null || !Number.isFinite(atr) || atr <= 0) return null;

  const c = candles[i]!;
  const h = Number(c.high);
  const l = Number(c.low);
  const o = Number(c.open);
  const cl = Number(c.close);
  if (![h, l, o, cl].every((x) => Number.isFinite(x))) return null;

  const smcLarge = smcClassifyLarge(candles, i, atr, smc);
  if (smcLarge) return smcLarge;

  const d = forwardDelta.get(i);
  if (d) return d;

  const p = prospectiveDelta.get(i);
  if (p) return p;

  return null;
}

function markerForKind(c: Candle, kind: Kind): LargeBodyChartMarker {
  const bull = kind === '장양' || kind === '△양' || kind === '△양·예';
  if (kind === '장양' || kind === '장음') {
    return {
      time: c.time as UTCTimestamp,
      position: 'inBar',
      shape: 'circle',
      color: bull ? 'rgba(34,197,94,0.92)' : 'rgba(248,113,113,0.92)',
      text: kind,
      size: 1,
    };
  }
  const prospective = kind === '△양·예' || kind === '△음·예';
  return {
    time: c.time as UTCTimestamp,
    position: bull ? 'belowBar' : 'aboveBar',
    shape: 'circle',
    color: prospective
      ? bull
        ? 'rgba(134,239,172,0.72)'
        : 'rgba(253,164,175,0.72)'
      : bull
        ? '#86efac'
        : '#fda4af',
    text: kind,
    size: prospective ? 0.95 : 1,
  };
}

function detailForLastBar(
  kind: Kind,
  tun: ReturnType<typeof tfRangeBodyTuning>,
  smc: SmcLargeTuning,
  avgBrPct: number | null
): string {
  if (kind === '장양') {
    return `SMC식 장대 양봉(참고): 상단 마감(저가~종가/레인지≥${(smc.closeEdge * 100).toFixed(0)}%·돌파 시 ${(smc.breakEdge * 100).toFixed(0)}%) · 몸통≥직전3봉×${smc.dispMult.toFixed(2)} · 레인지≥ATR×${smc.atrFloor.toFixed(2)} — 수익·승률 보장 아님.`;
  }
  if (kind === '장음') {
    return `SMC식 장대 음봉(참고): 하단 마감(고가~종가/레인지≥${(smc.closeEdge * 100).toFixed(0)}%·돌파 시 ${(smc.breakEdge * 100).toFixed(0)}%) · 몸통≥직전3봉×${smc.dispMult.toFixed(2)} · 레인지≥ATR×${smc.atrFloor.toFixed(2)} — 수익·승률 보장 아님.`;
  }
  const pct = avgBrPct != null ? `${avgBrPct.toFixed(0)}%` : '낮은';
  if (kind === '△양·예') {
    return `△양·예(선행 후보·미확정): 차트 우측 미완성 구간—압축 설정·방향 힌트만 충족, 아직 SMC 장대 양봉 미발생. 이후 장대가 나오면 동일 봉이 △양(후행)으로 바뀔 수 있음 — 확정 아님.`;
  }
  if (kind === '△음·예') {
    return `△음·예(선행 후보·미확정): 차트 우측 미완성 구간—압축 설정·방향 힌트만 충족, 아직 SMC 장대 음봉 미발생. 이후 장대가 나오면 동일 봉이 △음(후행)으로 바뀔 수 있음 — 확정 아님.`;
  }
  return kind === '△양'
    ? `△양(후행 검증): 직전 3봉 평균 몸통비 ${pct}(압축·구간≤${(tun.tightAvg * 100).toFixed(0)}%) 뒤 2~3봉에서 SMC 장대 양봉 발생과 패턴 정렬 — 선행 예측 아님.`
    : `△음(후행 검증): 직전 3봉 평균 몸통비 ${pct}(압축·구간≤${(tun.tightAvg * 100).toFixed(0)}%) 뒤 2~3봉에서 SMC 장대 음봉 발생과 패턴 정렬 — 선행 예측 아님.`;
}

function avgBodyRatioBefore(candles: Candle[], i: number): number | null {
  let sumBr = 0;
  let cnt = 0;
  for (let j = Math.max(1, i - 3); j < i; j++) {
    const cj = candles[j]!;
    const rj = Number(cj.high) - Number(cj.low);
    if (!Number.isFinite(rj) || rj <= 0) continue;
    sumBr += Math.abs(Number(cj.close) - Number(cj.open)) / rj;
    cnt++;
  }
  if (cnt === 0) return null;
  return (sumBr / cnt) * 100;
}

/**
 * 마감·안착 보조: SMC식 장대(장양/장음)는 내부 판정만, 캔들 라벨은 △만.
 * △(후행): 2~3봉 뒤 실제 장대가 나온 경우에만 설정 봉에 표시.
 * △·예(선행 후보): 차트 오른쪽 끝 몇 봉만—아직 장대 미발생·반대 장대도 없을 때 압축+방향 힌트
 * (거짓 신호 완화 위해 과거 전구간에는 적용하지 않음).
 */
export function computeLargeBodyCandlePreview(
  candles: Candle[],
  timeframe: string,
  options?: LargeBodyPreviewOptions
): LargeBodyCandlePreviewResult {
  const n = candles.length;
  if (n < 18) return { markers: [] };

  const lookback = Math.max(120, Math.min(2500, Math.floor(options?.lookbackBars ?? 720)));
  const maxMarkers = Math.max(80, Math.min(900, Math.floor(options?.maxMarkers ?? 480)));

  const atrArr = wilderAtr14(candles);
  const tun = tfRangeBodyTuning(timeframe);
  const smc = smcLargeBodyTuning(timeframe);
  const start = Math.max(14, n - lookback);
  const forwardDelta = buildForwardDeltaMap(candles, atrArr, tun, smc, start, n);
  const prospectiveDelta = buildLiveEdgeProspectiveMap(candles, atrArr, tun, smc, forwardDelta, start, n);
  const out: LargeBodyChartMarker[] = [];

  for (let i = start; i < n; i++) {
    const kind = classifyBar(candles, i, atrArr, tun, smc, forwardDelta, prospectiveDelta);
    if (!kind) continue;
    // 차트 라벨은 △만 표시 — 장양·장음 마커는 숨김(내부 판정은 유지)
    if (kind === '장양' || kind === '장음') continue;
    out.push(markerForKind(candles[i]!, kind));
  }

  let markers = out;
  if (markers.length > maxMarkers) {
    markers = markers.slice(-maxMarkers);
  }

  const lastIdx = n - 1;
  const lastKind = classifyBar(candles, lastIdx, atrArr, tun, smc, forwardDelta, prospectiveDelta);
  let detailLineKo: string | undefined;
  if (lastKind && lastKind !== '장양' && lastKind !== '장음') {
    const pct = avgBodyRatioBefore(candles, lastIdx);
    detailLineKo = detailForLastBar(lastKind, tun, smc, pct);
  }

  return { markers, detailLineKo };
}
