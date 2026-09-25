/**
 * 통합·분석 — TradingView식 Anchored VWAP(고정 VWAP).
 *
 * 세팅(가이드·Discord·이미지):
 * - 주봉/일봉(또는 차트) 최고점·최저점 캔들에 앵커
 * - 소스: 고점·저점 모두 **고가+시가** (몸통·꼬리)
 * - 분·시·일·주 봉에서 동일 앵커 시각으로 공용 표시
 * - volume=0 → 가중치 1 (선 유지)
 * - 확정수익·승률 문구 없음
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';

export type AnchoredVwapSource = 'high' | 'open' | 'low' | 'close' | 'hl2' | 'hlc3';
export type AnchoredVwapAnchorMode =
  | 'manual'
  | 'swing_high'
  | 'swing_low'
  | 'range_start'
  /** 차트(또는 HTF) 절대 최고고점 */
  | 'chart_high'
  /** 차트(또는 HTF) 절대 최저저점 */
  | 'chart_low'
  /** 고점+저점 동시 (기본 추천) */
  | 'chart_both';

export type AnchoredVwapPoint = { time: number; value: number };

export type MergedDeskAnchoredVwapPack = {
  anchorIndex: number;
  anchorTime: number;
  anchorMode: AnchoredVwapAnchorMode;
  bias: 'bearish_from_high' | 'bullish_from_low' | 'range';
  /** 앵커 캔들 역할 — 절대고점봉 / 절대저점봉 */
  candleRole: 'high' | 'low';
  extremeLine: AnchoredVwapPoint[];
  /** VWAP extreme 소스 — 고·저 앵커 모두 high(고가) */
  extremeSource: 'high' | 'low';
  openLine: AnchoredVwapPoint[];
  bandUpper: AnchoredVwapPoint[];
  bandLower: AnchoredVwapPoint[];
  note: string;
  /** HTF에서 잡힌 앵커면 '1d'|'1w' 등 */
  htfTf?: string | null;
};

export type MergedDeskAvwapUserPin = {
  id: string;
  /** 표시 번호 1,2,3… (추가 순) */
  n: number;
  /** 앵커 캔들 unix sec (찍은 TF 봉 open time) */
  time: number;
  /** 찍을 당시 차트 TF — 1w에 찍으면 1w로 계산·하위 TF에 투영 */
  anchorTf: string;
  /** 고점봉/저점봉 구분(색·라벨) — 소스는 둘 다 고가+시가 */
  role: 'high' | 'low';
  hidden: boolean;
};

export const AVWAP_USER_PIN_MAX = 12;

export function createAvwapUserPinId(): string {
  return `avp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAvwapUserPins(raw: unknown): MergedDeskAvwapUserPin[] {
  if (!Array.isArray(raw)) return [];
  const out: MergedDeskAvwapUserPin[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const time = Number(r.time);
    if (!Number.isFinite(time)) continue;
    const role = r.role === 'low' ? 'low' : 'high';
    const id =
      typeof r.id === 'string' && r.id.trim()
        ? String(r.id).slice(0, 64)
        : createAvwapUserPinId();
    const nRaw = Number(r.n);
    const tfRaw = String(r.anchorTf || r.tf || '').trim();
    const anchorTf = normalizeChartTimeframe(tfRaw) || tfRaw || '1d';
    out.push({
      id,
      n: Number.isFinite(nRaw) && nRaw >= 1 ? Math.floor(nRaw) : out.length + 1,
      time,
      anchorTf,
      role,
      hidden: r.hidden === true,
    });
    if (out.length >= AVWAP_USER_PIN_MAX) break;
  }
  /** 번호 재정렬 — 1..N 연속 */
  return out.map((p, i) => ({ ...p, n: i + 1 }));
}

/** 클릭 가격이 봉 중점 이상이면 고점 역할, 미만이면 저점 역할 */
export function resolveAvwapClickRole(candle: Candle, price: number): 'high' | 'low' {
  const h = Number(candle.high);
  const l = Number(candle.low);
  if (!Number.isFinite(h) || !Number.isFinite(l)) return 'high';
  const mid = (h + l) / 2;
  return Number(price) >= mid ? 'high' : 'low';
}

/**
 * 사용자 핀 시각 → 차트 봉 인덱스 (TradingView식).
 * - 우선: time >= pinTime 인 첫 봉 (하위 TF 투영)
 * - 없으면: 가장 가까운 봉
 * - 절대저/고 자동탐색 없음
 */
export function resolveUserPinAnchorIndex(
  candles: Candle[],
  pinTime: number
): number | null {
  const n = candles?.length ?? 0;
  if (n < 1 || !Number.isFinite(pinTime)) return null;
  for (let i = 0; i < n; i++) {
    const t = Number(candles[i]?.time);
    if (Number.isFinite(t) && t >= pinTime) return i;
  }
  return findManualAnchorIndex(candles, pinTime);
}

/** 차트 히스토리가 핀 시각까지 덮는지 (첫 봉 <= pinTime) */
export function chartHistoryCoversPinTime(candles: Candle[], pinTime: number): boolean {
  if (!candles?.length || !Number.isFinite(pinTime)) return false;
  const first = Number(candles[0]?.time);
  return Number.isFinite(first) && first <= pinTime;
}

/**
 * HTF AVWAP → LTF 봉 시각 forward-fill 투영.
 * 주봉에서 찍은 값을 1h에 올리며, 1h 저점 재탐색을 하지 않음.
 */
export function projectAvwapPointsToChartTimes(
  src: AnchoredVwapPoint[],
  chartCandles: Candle[]
): AnchoredVwapPoint[] {
  if (!src.length || !chartCandles?.length) return [];
  const out: AnchoredVwapPoint[] = [];
  let j = 0;
  let last = src[0]!.value;
  const t0 = Number(src[0]!.time);
  for (const c of chartCandles) {
    const t = Number(c.time);
    if (!Number.isFinite(t) || t < t0) continue;
    while (j < src.length) {
      const st = Number(src[j]!.time);
      if (!Number.isFinite(st) || st > t) break;
      last = src[j]!.value;
      j += 1;
    }
    out.push({ time: t, value: last });
  }
  return out;
}

export function buildUserAnchoredVwapPack(
  candles: Candle[],
  pin: MergedDeskAvwapUserPin
): MergedDeskAnchoredVwapPack | null {
  if (!candles || candles.length < 2 || pin.hidden) return null;
  const idx = resolveUserPinAnchorIndex(candles, Number(pin.time));
  if (idx == null) return null;
  return packFromAnchor(candles, idx, 'manual', pin.role, pin.anchorTf || null);
}

/**
 * 차트 TF용 사용자 AVWAP.
 * - 히스토리가 pin.time 까지 있으면: 차트 TF로 계산
 * - 부족하면: 찍은 anchorTf 로 계산 후 차트에 투영 (1h 저점 오인 방지)
 */
export function buildUserAvwapPackForChart(
  chartCandles: Candle[],
  chartTf: string,
  pin: MergedDeskAvwapUserPin,
  anchorCandlesByTf?: Record<string, Candle[] | null | undefined> | null
): MergedDeskAnchoredVwapPack | null {
  if (!chartCandles?.length || pin.hidden) return null;
  const cTf = normalizeChartTimeframe(chartTf) || chartTf;
  const aTf = normalizeChartTimeframe(pin.anchorTf) || pin.anchorTf || '1d';

  if (chartHistoryCoversPinTime(chartCandles, Number(pin.time)) || cTf === aTf) {
    return buildUserAnchoredVwapPack(chartCandles, pin);
  }

  const anchorBars = anchorCandlesByTf?.[aTf];
  if (!anchorBars || anchorBars.length < 2) return null;
  const base = buildUserAnchoredVwapPack(anchorBars, pin);
  if (!base) return null;

  const extremeLine = projectAvwapPointsToChartTimes(base.extremeLine, chartCandles);
  const openLine = projectAvwapPointsToChartTimes(base.openLine, chartCandles);
  if (extremeLine.length < 2 || openLine.length < 2) return null;
  const { bandUpper, bandLower } = buildBand(extremeLine, openLine);
  return {
    ...base,
    extremeLine,
    openLine,
    bandUpper,
    bandLower,
    htfTf: aTf,
    note: `앵커=${aTf} · 차트=${cTf} 투영 · AVWAP 고가/시가`,
  };
}

export function buildUserAnchoredVwapPacks(
  candles: Candle[],
  pins: MergedDeskAvwapUserPin[],
  chartTf?: string,
  anchorCandlesByTf?: Record<string, Candle[] | null | undefined> | null
): Array<{ pin: MergedDeskAvwapUserPin; pack: MergedDeskAnchoredVwapPack }> {
  const out: Array<{ pin: MergedDeskAvwapUserPin; pack: MergedDeskAnchoredVwapPack }> = [];
  for (const pin of pins) {
    if (pin.hidden) continue;
    const pack =
      chartTf != null
        ? buildUserAvwapPackForChart(candles, chartTf, pin, anchorCandlesByTf)
        : buildUserAnchoredVwapPack(candles, pin);
    if (pack) out.push({ pin, pack });
  }
  return out;
}

export function uniqueAvwapAnchorTfs(pins: MergedDeskAvwapUserPin[]): string[] {
  const set = new Set<string>();
  for (const p of normalizeAvwapUserPins(pins)) {
    const tf = normalizeChartTimeframe(p.anchorTf) || p.anchorTf;
    if (tf) set.add(tf);
  }
  return [...set];
}

/** AI超级变身统计 · AVWAP 한 줄 요약 (차트 핀 → 고가/시가 종가) */
export type AvwapSuperStatsRow = {
  n: number;
  role: 'high' | 'low';
  anchorTf: string;
  extreme: number | null;
  open: number | null;
};

export function summarizeAvwapForSuperStats(
  candles: Candle[],
  chartTf: string,
  pins: MergedDeskAvwapUserPin[],
  opts?: {
    enabled?: boolean;
    pinsHidden?: boolean;
    anchorCandlesByTf?: Record<string, Candle[] | null | undefined> | null;
  }
): { rows: AvwapSuperStatsRow[]; lineKo: string } {
  if (opts?.enabled === false || opts?.pinsHidden === true || !candles?.length) {
    return { rows: [], lineKo: '' };
  }
  const packs = buildUserAnchoredVwapPacks(
    candles,
    pins,
    chartTf,
    opts?.anchorCandlesByTf
  );
  const rows: AvwapSuperStatsRow[] = [];
  for (const { pin, pack } of packs) {
    const ext = pack.extremeLine[pack.extremeLine.length - 1];
    const op = pack.openLine[pack.openLine.length - 1];
    rows.push({
      n: pin.n,
      role: pin.role,
      anchorTf: pin.anchorTf || chartTf,
      extreme: ext && Number.isFinite(ext.value) ? ext.value : null,
      open: op && Number.isFinite(op.value) ? op.value : null,
    });
  }
  if (!rows.length) return { rows: [], lineKo: '' };
  const fmt = (v: number | null) =>
    v == null || !Number.isFinite(v) ? '—' : v >= 1000 ? v.toFixed(0) : v.toFixed(2);
  const lineKo = rows
    .slice(0, 4)
    .map(
      (r) =>
        `${r.n}${r.role === 'high' ? '고' : '저'}·${r.anchorTf} 고가${fmt(r.extreme)}/시가${fmt(r.open)}`
    )
    .join(' · ');
  return { rows, lineKo: `AVWAP ${lineKo}` };
}

/**
 * 핀 추가(항상 새 번호) — 기존 유지.
 */
export function appendAvwapUserPin(
  pins: MergedDeskAvwapUserPin[],
  time: number,
  role: 'high' | 'low',
  anchorTf?: string | null
): MergedDeskAvwapUserPin[] {
  const t = Number(time);
  if (!Number.isFinite(t)) return normalizeAvwapUserPins(pins);
  const tf = normalizeChartTimeframe(String(anchorTf || '')) || String(anchorTf || '') || '1d';
  const next = normalizeAvwapUserPins(pins).map((p) => ({ ...p }));
  const hit = next.findIndex(
    (p) => Math.abs(Number(p.time) - t) < 1 && p.role === role && p.anchorTf === tf
  );
  if (hit >= 0) {
    next[hit] = { ...next[hit]!, hidden: false };
    return normalizeAvwapUserPins(next);
  }
  next.push({
    id: createAvwapUserPinId(),
    n: next.length + 1,
    time: t,
    anchorTf: tf,
    role,
    hidden: false,
  });
  if (next.length > AVWAP_USER_PIN_MAX) {
    return normalizeAvwapUserPins(next.slice(next.length - AVWAP_USER_PIN_MAX));
  }
  return normalizeAvwapUserPins(next);
}

/** @deprecated use appendAvwapUserPin */
export function upsertAvwapUserPin(
  pins: MergedDeskAvwapUserPin[],
  time: number,
  role: 'high' | 'low',
  anchorTf?: string | null
): MergedDeskAvwapUserPin[] {
  return appendAvwapUserPin(pins, time, role, anchorTf);
}

export function setAvwapUserPinsHiddenFlag(
  pins: MergedDeskAvwapUserPin[],
  hidden: boolean
): MergedDeskAvwapUserPin[] {
  return normalizeAvwapUserPins(pins).map((p) => ({ ...p, hidden }));
}

export function removeAvwapUserPinsByIds(
  pins: MergedDeskAvwapUserPin[],
  ids: string[]
): MergedDeskAvwapUserPin[] {
  const drop = new Set(ids.filter(Boolean));
  if (!drop.size) return normalizeAvwapUserPins(pins);
  return normalizeAvwapUserPins(pins.filter((p) => !drop.has(p.id)));
}

export function toggleAvwapUserPinHidden(
  pins: MergedDeskAvwapUserPin[],
  id: string
): MergedDeskAvwapUserPin[] {
  return normalizeAvwapUserPins(pins).map((p) =>
    p.id === id ? { ...p, hidden: !p.hidden } : p
  );
}

export type MergedDeskAnchoredVwapDualPack = {
  high: MergedDeskAnchoredVwapPack | null;
  low: MergedDeskAnchoredVwapPack | null;
  htfTf: string | null;
  note: string;
};

const DEFAULT_LOOKBACK = 120;
const RANGE_LOOKBACK = 40;

export type BuildAnchoredVwapOpts = {
  mode?: AnchoredVwapAnchorMode;
  manualAnchorTime?: number | null;
  pivotL?: number;
  pivotR?: number;
  /** 주봉·일봉 등 상위 TF 캔들 — 있으면 절대고/저 앵커를 여기서 잡음 */
  htfCandles?: Candle[] | null;
  htfTf?: string | null;
};

function isPivotHigh(candles: Candle[], i: number, L: number, R: number): boolean {
  const h = Number(candles[i]?.high);
  if (!Number.isFinite(h)) return false;
  for (let j = i - L; j < i; j++) {
    if (j < 0) return false;
    const hj = Number(candles[j]?.high);
    if (!Number.isFinite(hj) || hj >= h) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length) return false;
    const hj = Number(candles[j]?.high);
    if (!Number.isFinite(hj) || hj > h) return false;
  }
  return true;
}

function isPivotLow(candles: Candle[], i: number, L: number, R: number): boolean {
  const l = Number(candles[i]?.low);
  if (!Number.isFinite(l)) return false;
  for (let j = i - L; j < i; j++) {
    if (j < 0) return false;
    const lj = Number(candles[j]?.low);
    if (!Number.isFinite(lj) || lj <= l) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length) return false;
    const lj = Number(candles[j]?.low);
    if (!Number.isFinite(lj) || lj < l) return false;
  }
  return true;
}

function sourcePrice(c: Candle, source: AnchoredVwapSource): number {
  const o = Number(c.open);
  const h = Number(c.high);
  const l = Number(c.low);
  const cl = Number(c.close);
  if (source === 'high') return Number.isFinite(h) ? h : NaN;
  if (source === 'low') return Number.isFinite(l) ? l : NaN;
  if (source === 'close') return Number.isFinite(cl) ? cl : NaN;
  if (source === 'hl2') {
    if (Number.isFinite(h) && Number.isFinite(l)) return (h + l) / 2;
    return NaN;
  }
  if (source === 'hlc3') {
    if (Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(cl)) return (h + l + cl) / 3;
    return NaN;
  }
  return Number.isFinite(o) ? o : NaN;
}

function volumeWeight(c: Candle): number {
  const v = Number(c.volume);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** 확정봉만(마지막 진행봉 제외) — 차트 절대 최고고점 */
export function findChartExtremeHighIndex(candles: Candle[]): number | null {
  const n = candles?.length ?? 0;
  if (n < 2) return null;
  const end = Math.max(0, n - 2);
  let maxI = 0;
  let maxH = -Infinity;
  for (let i = 0; i <= end; i++) {
    const h = Number(candles[i]?.high);
    if (!Number.isFinite(h)) continue;
    if (h > maxH) {
      maxH = h;
      maxI = i;
    }
  }
  return Number.isFinite(maxH) && maxH > -Infinity ? maxI : null;
}

/** 확정봉만 — 차트 절대 최저저점 */
export function findChartExtremeLowIndex(candles: Candle[]): number | null {
  const n = candles?.length ?? 0;
  if (n < 2) return null;
  const end = Math.max(0, n - 2);
  let minI = 0;
  let minL = Infinity;
  for (let i = 0; i <= end; i++) {
    const l = Number(candles[i]?.low);
    if (!Number.isFinite(l)) continue;
    if (l < minL) {
      minL = l;
      minI = i;
    }
  }
  return Number.isFinite(minL) && minL < Infinity ? minI : null;
}

/**
 * HTF 앵커 시각 → LTF 시작 인덱스.
 * HTF 봉 open time 이상인 첫 LTF 봉 (없으면 가장 가까운 봉).
 */
export function mapHtfAnchorToLtfIndex(ltfCandles: Candle[], htfAnchorTime: number): number | null {
  const n = ltfCandles?.length ?? 0;
  if (n < 1 || !Number.isFinite(htfAnchorTime)) return null;
  for (let i = 0; i < n; i++) {
    const t = Number(ltfCandles[i]?.time);
    if (Number.isFinite(t) && t >= htfAnchorTime) return i;
  }
  return findManualAnchorIndex(ltfCandles, htfAnchorTime);
}

export function findSwingHighAnchorIndex(
  candles: Candle[],
  pivotL = 3,
  pivotR = 3
): number | null {
  const n = candles?.length ?? 0;
  if (n < pivotL + pivotR + 2) return null;

  let lastPivot: number | null = null;
  const lastConfirmable = n - 1 - pivotR;
  for (let i = pivotL; i <= lastConfirmable; i++) {
    if (isPivotHigh(candles, i, pivotL, pivotR)) lastPivot = i;
  }
  if (lastPivot != null) return lastPivot;

  const lookback = Math.min(n - 1, DEFAULT_LOOKBACK);
  const start = Math.max(0, n - 1 - lookback);
  const end = Math.max(start, n - 2);
  let maxI = start;
  let maxH = -Infinity;
  for (let i = start; i <= end; i++) {
    const h = Number(candles[i]?.high);
    if (!Number.isFinite(h)) continue;
    if (h > maxH) {
      maxH = h;
      maxI = i;
    }
  }
  return Number.isFinite(maxH) && maxH > -Infinity ? maxI : null;
}

export const findReboundHighAnchorIndex = findSwingHighAnchorIndex;

export function findSwingLowAnchorIndex(
  candles: Candle[],
  pivotL = 3,
  pivotR = 3
): number | null {
  const n = candles?.length ?? 0;
  if (n < pivotL + pivotR + 2) return null;

  let lastPivot: number | null = null;
  const lastConfirmable = n - 1 - pivotR;
  for (let i = pivotL; i <= lastConfirmable; i++) {
    if (isPivotLow(candles, i, pivotL, pivotR)) lastPivot = i;
  }
  if (lastPivot != null) return lastPivot;

  const lookback = Math.min(n - 1, DEFAULT_LOOKBACK);
  const start = Math.max(0, n - 1 - lookback);
  const end = Math.max(start, n - 2);
  let minI = start;
  let minL = Infinity;
  for (let i = start; i <= end; i++) {
    const l = Number(candles[i]?.low);
    if (!Number.isFinite(l)) continue;
    if (l < minL) {
      minL = l;
      minI = i;
    }
  }
  return Number.isFinite(minL) && minL < Infinity ? minI : null;
}

export function findRangeStartAnchorIndex(
  candles: Candle[],
  pivotL = 3,
  pivotR = 3
): number | null {
  const n = candles?.length ?? 0;
  if (n < 30) return null;

  const end = n - 1;
  const start = Math.max(0, end - (RANGE_LOOKBACK - 1));
  let maxH = -Infinity;
  let minL = Infinity;
  let minLowIdx = start;
  for (let i = start; i <= end; i++) {
    const h = Number(candles[i]?.high);
    const l = Number(candles[i]?.low);
    if (Number.isFinite(h) && h > maxH) maxH = h;
    if (Number.isFinite(l) && l < minL) {
      minL = l;
      minLowIdx = i;
    }
  }
  if (!(Number.isFinite(maxH) && Number.isFinite(minL) && maxH > minL)) {
    return findSwingHighAnchorIndex(candles, pivotL, pivotR);
  }

  const mid = (maxH + minL) / 2;
  const range = maxH - minL;
  const close = Number(candles[end]?.close);
  if (!Number.isFinite(close)) {
    return findSwingHighAnchorIndex(candles, pivotL, pivotR);
  }

  const inMiddle = Math.abs(close - mid) <= range * 0.25;
  if (inMiddle) {
    return minLowIdx <= end - 1 ? minLowIdx : Math.max(0, end - 1);
  }

  if (close < mid) {
    return findSwingHighAnchorIndex(candles, pivotL, pivotR);
  }
  return findSwingLowAnchorIndex(candles, pivotL, pivotR);
}

function findManualAnchorIndex(candles: Candle[], manualAnchorTime: number): number | null {
  const n = candles?.length ?? 0;
  if (n < 1 || !Number.isFinite(manualAnchorTime)) return null;
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < n; i++) {
    const t = Number(candles[i]?.time);
    if (!Number.isFinite(t)) continue;
    const d = Math.abs(t - manualAnchorTime);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}

export function computeAnchoredVwapSeries(
  candles: Candle[],
  anchorIndex: number,
  source: AnchoredVwapSource
): AnchoredVwapPoint[] {
  const n = candles?.length ?? 0;
  if (n < 1 || anchorIndex < 0 || anchorIndex >= n) return [];

  const out: AnchoredVwapPoint[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (let i = anchorIndex; i < n; i++) {
    const c = candles[i];
    if (!c) continue;
    const src = sourcePrice(c, source);
    if (!Number.isFinite(src)) continue;
    const w = volumeWeight(c);
    cumPV += src * w;
    cumV += w;
    const value = cumV > 0 ? cumPV / cumV : src;
    out.push({ time: Number(c.time), value });
  }
  return out;
}

function buildBand(
  extreme: AnchoredVwapPoint[],
  open: AnchoredVwapPoint[]
): { bandUpper: AnchoredVwapPoint[]; bandLower: AnchoredVwapPoint[] } {
  const n = Math.min(extreme.length, open.length);
  const bandUpper: AnchoredVwapPoint[] = [];
  const bandLower: AnchoredVwapPoint[] = [];
  for (let i = 0; i < n; i++) {
    const e = extreme[i]!;
    const o = open[i]!;
    const t = e.time;
    bandUpper.push({ time: t, value: Math.max(e.value, o.value) });
    bandLower.push({ time: t, value: Math.min(e.value, o.value) });
  }
  return { bandUpper, bandLower };
}

function resolveModeBias(
  mode: AnchoredVwapAnchorMode,
  candleRole: 'high' | 'low'
): MergedDeskAnchoredVwapPack['bias'] {
  if (mode === 'range_start') return 'range';
  if (candleRole === 'low') return 'bullish_from_low';
  return 'bearish_from_high';
}

function resolveRangeExtreme(candles: Candle[], anchorIndex: number): 'high' | 'low' {
  const n = candles.length;
  const end = n - 1;
  const start = Math.max(0, end - (RANGE_LOOKBACK - 1));
  let maxH = -Infinity;
  let minL = Infinity;
  for (let i = start; i <= end; i++) {
    const h = Number(candles[i]?.high);
    const l = Number(candles[i]?.low);
    if (Number.isFinite(h) && h > maxH) maxH = h;
    if (Number.isFinite(l) && l < minL) minL = l;
  }
  const mid = (maxH + minL) / 2;
  const ah = Number(candles[anchorIndex]?.high);
  const al = Number(candles[anchorIndex]?.low);
  const anchorMid = (Number.isFinite(ah) && Number.isFinite(al) ? (ah + al) / 2 : ah) as number;
  if (Number.isFinite(anchorMid) && Number.isFinite(mid) && anchorMid < mid) return 'low';
  return 'high';
}

function packFromAnchor(
  candles: Candle[],
  anchorIndex: number,
  mode: AnchoredVwapAnchorMode,
  candleRole: 'high' | 'low',
  htfTf?: string | null
): MergedDeskAnchoredVwapPack | null {
  const anchor = candles[anchorIndex];
  if (!anchor) return null;
  /** 고점·저점 앵커 모두 고가+시가 */
  const extremeLine = computeAnchoredVwapSeries(candles, anchorIndex, 'high');
  const openLine = computeAnchoredVwapSeries(candles, anchorIndex, 'open');
  if (extremeLine.length < 2 || openLine.length < 2) return null;
  const { bandUpper, bandLower } = buildBand(extremeLine, openLine);
  const bias = resolveModeBias(mode, candleRole);
  const modeLabel =
    mode === 'manual'
      ? '클릭앵커'
      : mode === 'swing_low'
        ? '스윙저점'
        : mode === 'range_start'
          ? '범위시작'
          : mode === 'chart_high' || (mode === 'chart_both' && candleRole === 'high')
            ? '절대고점'
            : mode === 'chart_low' || (mode === 'chart_both' && candleRole === 'low')
              ? '절대저점'
              : '스윙고점';
  const htfPart = htfTf ? ` · ${htfTf}앵커` : '';
  const note = `앵커=${modeLabel}${htfPart} · AVWAP 고가/시가 · 사이=POI밴드`;

  return {
    anchorIndex,
    anchorTime: Number(anchor.time),
    anchorMode: mode,
    bias,
    candleRole,
    extremeLine,
    extremeSource: 'high',
    openLine,
    bandUpper,
    bandLower,
    note,
    htfTf: htfTf ?? null,
  };
}

/** 단일 팩 (기존 API 유지) */
export function buildMergedDeskAnchoredVwapPack(
  candles: Candle[],
  opts?: BuildAnchoredVwapOpts
): MergedDeskAnchoredVwapPack | null {
  if (!candles || candles.length < 30) return null;

  const mode: AnchoredVwapAnchorMode = opts?.mode ?? 'chart_both';
  const pivotL = opts?.pivotL ?? 3;
  const pivotR = opts?.pivotR ?? 3;
  const htf = opts?.htfCandles && opts.htfCandles.length >= 3 ? opts.htfCandles : null;
  const htfTf = opts?.htfTf ? normalizeChartTimeframe(opts.htfTf) || opts.htfTf : null;

  if (mode === 'chart_both') {
    const dual = buildMergedDeskAnchoredVwapDualPack(candles, opts);
    return dual?.high ?? dual?.low ?? null;
  }

  let anchorIndex: number | null = null;
  let extSrc: 'high' | 'low' = 'high';

  if (mode === 'manual') {
    const mt = opts?.manualAnchorTime;
    if (mt != null && Number.isFinite(mt)) {
      anchorIndex = findManualAnchorIndex(candles, Number(mt));
    }
    if (anchorIndex == null) {
      anchorIndex = findChartExtremeHighIndex(candles);
    }
    extSrc = 'high';
  } else if (mode === 'swing_low') {
    anchorIndex = findSwingLowAnchorIndex(candles, pivotL, pivotR);
    extSrc = 'low';
  } else if (mode === 'range_start') {
    anchorIndex = findRangeStartAnchorIndex(candles, pivotL, pivotR);
    if (anchorIndex != null) extSrc = resolveRangeExtreme(candles, anchorIndex);
  } else if (mode === 'chart_low') {
    if (htf) {
      const hi = findChartExtremeLowIndex(htf);
      if (hi != null) {
        const t = Number(htf[hi]?.time);
        anchorIndex = mapHtfAnchorToLtfIndex(candles, t);
      }
    }
    if (anchorIndex == null) anchorIndex = findChartExtremeLowIndex(candles);
    extSrc = 'low';
  } else if (mode === 'chart_high') {
    if (htf) {
      const hi = findChartExtremeHighIndex(htf);
      if (hi != null) {
        const t = Number(htf[hi]?.time);
        anchorIndex = mapHtfAnchorToLtfIndex(candles, t);
      }
    }
    if (anchorIndex == null) anchorIndex = findChartExtremeHighIndex(candles);
    extSrc = 'high';
  } else {
    /** swing_high 기본 */
    anchorIndex = findSwingHighAnchorIndex(candles, pivotL, pivotR);
    extSrc = 'high';
  }

  if (anchorIndex == null) return null;
  return packFromAnchor(candles, anchorIndex, mode, extSrc, htf ? htfTf : null);
}

/**
 * 고점·저점 이중 AVWAP — 둘 다 고가+시가.
 * HTF 캔들이 있으면 절대고/저를 HTF에서 잡고 LTF에 투영.
 */
export function buildMergedDeskAnchoredVwapDualPack(
  chartCandles: Candle[],
  opts?: BuildAnchoredVwapOpts
): MergedDeskAnchoredVwapDualPack | null {
  if (!chartCandles || chartCandles.length < 30) return null;

  const mode: AnchoredVwapAnchorMode = opts?.mode ?? 'chart_both';
  const htf = opts?.htfCandles && opts.htfCandles.length >= 3 ? opts.htfCandles : null;
  const htfTf = opts?.htfTf ? normalizeChartTimeframe(opts.htfTf) || String(opts.htfTf) : null;
  const extremeSource = htf ?? chartCandles;

  const wantHigh =
    mode === 'chart_both' ||
    mode === 'chart_high' ||
    mode === 'swing_high' ||
    mode === 'manual' ||
    mode === 'range_start';
  const wantLow = mode === 'chart_both' || mode === 'chart_low' || mode === 'swing_low';

  let high: MergedDeskAnchoredVwapPack | null = null;
  let low: MergedDeskAnchoredVwapPack | null = null;

  if (wantHigh) {
    let idx: number | null = null;
    if (mode === 'manual' && opts?.manualAnchorTime != null) {
      idx = findManualAnchorIndex(chartCandles, Number(opts.manualAnchorTime));
    } else if (mode === 'swing_high') {
      idx = findSwingHighAnchorIndex(chartCandles, opts?.pivotL ?? 3, opts?.pivotR ?? 3);
    } else {
      const srcI = findChartExtremeHighIndex(extremeSource);
      if (srcI != null) {
        const t = Number(extremeSource[srcI]?.time);
        idx = htf ? mapHtfAnchorToLtfIndex(chartCandles, t) : srcI;
      }
    }
    if (idx != null) {
      high = packFromAnchor(
        chartCandles,
        idx,
        mode === 'chart_both' ? 'chart_high' : mode,
        'high',
        htf ? htfTf : null
      );
    }
  }

  if (wantLow) {
    let idx: number | null = null;
    if (mode === 'swing_low') {
      idx = findSwingLowAnchorIndex(chartCandles, opts?.pivotL ?? 3, opts?.pivotR ?? 3);
    } else {
      const srcI = findChartExtremeLowIndex(extremeSource);
      if (srcI != null) {
        const t = Number(extremeSource[srcI]?.time);
        idx = htf ? mapHtfAnchorToLtfIndex(chartCandles, t) : srcI;
      }
    }
    if (idx != null) {
      low = packFromAnchor(
        chartCandles,
        idx,
        mode === 'chart_both' ? 'chart_low' : mode,
        'low',
        htf ? htfTf : null
      );
    }
  }

  if (!high && !low) return null;

  const htfPart = htfTf ? `${htfTf} ` : '';
  const note = `${htfPart}절대고/저 · 둘 다 고가·시가 AVWAP · 분·시봉 공용`;

  return { high, low, htfTf: htf ? htfTf : null, note };
}

/** HTF 선택: 차트 TF가 이미 일/주면 자기 자신, 아니면 설정 htf */
export function resolveAvwapHtfTf(chartTf: string, preferred?: string | null): string {
  const c = normalizeChartTimeframe(chartTf) || chartTf;
  if (c === '1w' || c === '1M') return c;
  if (c === '1d') return preferred === '1w' ? '1w' : '1d';
  const p = preferred ? normalizeChartTimeframe(preferred) || preferred : '1d';
  return p === '1w' ? '1w' : '1d';
}

export function mergedDeskAnchoredVwapAcceptance(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const bars: Candle[] = [];
  const t0 = 1_700_000_000;
  for (let i = 0; i < 60; i++) {
    let open: number;
    let high: number;
    let low: number;
    let close: number;
    if (i < 40) {
      open = 100 + i * 0.5;
      high = open + 0.8;
      low = open - 0.4;
      close = open + 0.2;
    } else if (i === 40) {
      open = 118;
      high = 130;
      low = 117;
      close = 119;
    } else {
      open = 118 - (i - 40) * 0.6;
      high = open + 0.5;
      low = open - 0.7;
      close = open - 0.2;
    }
    bars.push({
      time: t0 + i * 3600,
      open,
      high,
      low,
      close,
      volume: i % 5 === 0 ? 0 : 10 + (i % 3),
    });
  }

  const absH = findChartExtremeHighIndex(bars);
  if (absH !== 40) notes.push(`chart extreme high expected 40 got ${absH}`);

  const dual = buildMergedDeskAnchoredVwapDualPack(bars, { mode: 'chart_both' });
  if (!dual?.high || !dual?.low) notes.push('dual pack missing high/low');
  else {
    if (dual.high.extremeSource !== 'high') notes.push('high pack extreme should be high');
    if (dual.low.extremeSource !== 'high') notes.push('low pack extreme should also be high');
    if (dual.high.candleRole !== 'high') notes.push('high candleRole');
    if (dual.low.candleRole !== 'low') notes.push('low candleRole');
  }

  /** HTF → LTF map */
  const htf: Candle[] = [
    { time: t0, open: 100, high: 105, low: 99, close: 102, volume: 10 },
    { time: t0 + 86400, open: 102, high: 140, low: 101, close: 110, volume: 10 },
    { time: t0 + 2 * 86400, open: 110, high: 112, low: 108, close: 109, volume: 10 },
  ];
  const ltf: Candle[] = [];
  for (let i = 0; i < 50; i++) {
    ltf.push({
      time: t0 + 86400 + i * 3600,
      open: 120,
      high: 121,
      low: 119,
      close: 120,
      volume: 5,
    });
  }
  const mapped = mapHtfAnchorToLtfIndex(ltf, t0 + 86400);
  if (mapped !== 0) notes.push(`htf map expected 0 got ${mapped}`);

  const dualHtf = buildMergedDeskAnchoredVwapDualPack(ltf, {
    mode: 'chart_both',
    htfCandles: htf,
    htfTf: '1d',
  });
  if (!dualHtf?.high) notes.push('htf dual high missing');
  else if (dualHtf.high.htfTf !== '1d') notes.push('htfTf flag missing');

  const short = bars.slice(0, 20);
  if (buildMergedDeskAnchoredVwapPack(short) != null) notes.push('pack should null under 30 bars');

  return { ok: notes.length === 0, notes };
}
