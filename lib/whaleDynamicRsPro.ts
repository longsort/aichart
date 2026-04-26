/**
 * Pine 호환 요약: "Resistance & Support Dynamic PRO [ChartWhizzperer]"
 * — 스윙 피벗 + ATR 두께 + 거래량 필터 + ATR×간격 비중복 + 측당 최대 N존. (미래 빈 축 연장 없음 — 마지막 캔들 시각까지)
 * 완전 동일한 box/라인 객체·알파감쇄·완화(3회)는 단계적 확장 가능.
 */
import type { Candle, OverlayItem } from '@/types';
import { atrSeries } from '@/lib/indicators';

const SWING = 10;
const ATR_LEN = 50;
const VOL_SMA = 20;
const MAX_PER_SIDE = 3;
const OVERLAP_ATR_MUL = 4;
/** BOX_THICKNESS_FACTOR / 10 — Pine 기본 10 → 1.0 */
const THICKNESS_MUL = 1.0;

/** SMC 데스크: 더 큰 스윙·측당 2존·넓은 중복 배제 → 잡음 감소·가독성 */
const SMC_DESK_SWING = 12;
const SMC_DESK_MAX_PER_SIDE = 2;
const SMC_DESK_OVERLAP_ATR_MUL = 5.25;

export type WhaleDynamicRsProPreset = 'default' | 'smcDesk' | 'whaleClean';

function resolveDynamicRsProPreset(preset?: WhaleDynamicRsProPreset) {
  /** WHALE 모드: DRS — 로즈(저) / 틸(지) + 낮은 알파로 LQB(보라/시안)과 색 겹침 감소 */
  if (preset === 'whaleClean') {
    return {
      swing: SWING,
      maxPerSide: MAX_PER_SIDE,
      overlapAtrMul: OVERLAP_ATR_MUL * 1.1,
      confidence: 72,
      resColor: 'rgba(244, 63, 94, 0.26)',
      supColor: 'rgba(13, 148, 136, 0.25)',
      resLine: '#E11D48',
      supLine: '#0D9488',
      zonePulse: false,
    };
  }
  if (preset === 'smcDesk') {
    return {
      swing: SMC_DESK_SWING,
      maxPerSide: SMC_DESK_MAX_PER_SIDE,
      overlapAtrMul: SMC_DESK_OVERLAP_ATR_MUL,
      confidence: 78,
      resColor: 'rgba(239,68,68,0.38)',
      supColor: 'rgba(34,197,94,0.36)',
      resLine: '#EF4444',
      supLine: '#16A34A',
      /** 반짝임은 맥락 없이 혼란 유발 → SMC에서는 정적 강조만(캡션·테두리) */
      zonePulse: false,
    };
  }
  return {
    swing: SWING,
    maxPerSide: MAX_PER_SIDE,
    overlapAtrMul: OVERLAP_ATR_MUL,
    confidence: 72,
    resColor: 'rgba(239,68,68,0.32)',
    supColor: 'rgba(34,197,94,0.30)',
    resLine: '#B91C1C',
    supLine: '#15803D',
    zonePulse: false,
  };
}

function smaAt(values: number[], period: number, i: number): number {
  if (i < period - 1) return NaN;
  let s = 0;
  for (let j = i - period + 1; j <= i; j++) s += values[j];
  return s / period;
}

function isPivotHigh(candles: Candle[], p: number, L: number): boolean {
  const h = candles[p].high;
  for (let j = p - L; j <= p + L; j++) {
    if (j < 0 || j >= candles.length) return false;
    if (j !== p && candles[j].high >= h) return false;
  }
  return true;
}

function isPivotLow(candles: Candle[], p: number, L: number): boolean {
  const lo = candles[p].low;
  for (let j = p - L; j <= p + L; j++) {
    if (j < 0 || j >= candles.length) return false;
    if (j !== p && candles[j].low <= lo) return false;
  }
  return true;
}

type Z = { center: number; top: number; bot: number; time1: number };

function nonOverlapping(center: number, atrRef: number, res: Z[], sup: Z[], overlapAtrMul: number): boolean {
  const th = atrRef * overlapAtrMul;
  for (const z of res) {
    const m = (z.top + z.bot) * 0.5;
    if (Math.abs(m - center) <= th) return false;
  }
  for (const z of sup) {
    const m = (z.top + z.bot) * 0.5;
    if (Math.abs(m - center) <= th) return false;
  }
  return true;
}

function pushLimited(arr: Z[], z: Z, max: number): void {
  if (arr.length >= max) arr.shift();
  arr.push(z);
}

export function buildWhaleDynamicRsProOverlays(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  useVolFilter?: boolean;
  /** SMC 데스크: 스윙·존 수·중복 배제 강화 + 시각 펄스 */
  preset?: WhaleDynamicRsProPreset;
}): OverlayItem[] {
  const { candles, useVolFilter = true, preset } = params;
  const o = resolveDynamicRsProPreset(preset);
  const { swing, maxPerSide, overlapAtrMul } = o;
  if (candles.length < swing * 2 + 5) return [];

  const atr = atrSeries(candles, ATR_LEN);
  const vols = candles.map((c) => Number(c.volume) || 0);
  const n = candles.length;
  /** 우측 끝: 실제 데이터 마지막 봉 시각만 사용 — 미래 빈 축으로 뻗지 않아 확대·축소 시 캔들에 붙어 보임 */
  const lastT = candles[n - 1].time as number;

  const resZones: Z[] = [];
  const supZones: Z[] = [];

  for (let conf = 2 * swing; conf < n; conf++) {
    const p = conf - swing;
    const pivotAtr = Number(atr[p]);
    if (!Number.isFinite(pivotAtr) || pivotAtr <= 0) continue;

    const volP = vols[p];
    const avgVol = smaAt(vols, VOL_SMA, p);
    const volOk = !useVolFilter || !Number.isFinite(avgVol) || avgVol <= 0 || volP > avgVol;

    if (isPivotHigh(candles, p, swing) && volOk) {
      const center = candles[p].high;
      if (!nonOverlapping(center, pivotAtr, resZones, supZones, overlapAtrMul)) continue;
      const thick = pivotAtr * THICKNESS_MUL;
      const top = center + thick * 0.5;
      const bot = center - thick * 0.5;
      const time1 = candles[p].time as number;
      pushLimited(resZones, { center, top, bot, time1 }, maxPerSide);
    }

    if (isPivotLow(candles, p, swing) && volOk) {
      const center = candles[p].low;
      if (!nonOverlapping(center, pivotAtr, resZones, supZones, overlapAtrMul)) continue;
      const thick = pivotAtr * THICKNESS_MUL;
      const top = center + thick * 0.5;
      const bot = center - thick * 0.5;
      const time1 = candles[p].time as number;
      pushLimited(supZones, { center, top, bot, time1 }, maxPerSide);
    }
  }

  const out: OverlayItem[] = [];
  let ir = 0;
  for (const z of resZones) {
    out.push({
      id: `whale-drs-res-${ir++}-${Math.round(z.time1)}`,
      kind: 'supplyZone',
      label: 'DRS 저항',
      category: 'whaleToolkit',
      time1: z.time1,
      time2: lastT,
      price1: z.top,
      price2: z.bot,
      confidence: o.confidence,
      color: o.resColor,
      lineLabelColor: o.resLine,
      zoneSpanOnly: true,
      zonePulse: o.zonePulse,
      x1: 0,
      y1: 0,
      labelTooltip:
        preset === 'whaleClean'
          ? `고래 DRS — 로즈톤=저항띠 (LQB BSL 보라·SSL 시안과 색 분리)`
          : preset === 'smcDesk'
            ? `Dynamic R/S (SMC 데스크) — 스윙 ${swing} · 측당 최대 ${maxPerSide}존 · 중복 배제 ${overlapAtrMul.toFixed(2)}×ATR`
            : undefined,
    });
  }
  let is = 0;
  for (const z of supZones) {
    out.push({
      id: `whale-drs-sup-${is++}-${Math.round(z.time1)}`,
      kind: 'demandZone',
      label: 'DRS 지지',
      category: 'whaleToolkit',
      time1: z.time1,
      time2: lastT,
      price1: z.top,
      price2: z.bot,
      confidence: o.confidence,
      color: o.supColor,
      lineLabelColor: o.supLine,
      zoneSpanOnly: true,
      zonePulse: o.zonePulse,
      x1: 0,
      y1: 0,
      labelTooltip:
        preset === 'whaleClean'
          ? `고래 DRS — 틸톤=지지띠 (HotZone·LQB와 구분)`
          : preset === 'smcDesk'
            ? `Dynamic R/S (SMC 데스크) — 스윙 ${swing} · 측당 최대 ${maxPerSide}존 · 중복 배제 ${overlapAtrMul.toFixed(2)}×ATR`
            : undefined,
    });
  }
  return out;
}
