/**
 * TradingView "Bitcoin Power Law Bands" (Pine v5) 포팅 — 교육·참고용.
 * Pine: request.security('BNC:BLX','D', ta.barssince(start)) → **일봉마다 d가 1씩 증가**.
 * 같은 UTC 날짜의 분봉·시봉은 모두 **동일한 d** (동일 BLX 일봉 값) — 시각(분)으로 소수 일수를 쓰면 안 됨.
 */
import type { Candle } from '@/types';
import type { LineData, UTCTimestamp } from 'lightweight-charts';

/** Pine: timestamp(2010, 7, 19) — First BLX Bitcoin Date */
export const BTC_POWER_LAW_START_SEC = Math.floor(Date.UTC(2010, 6, 19, 0, 0, 0) / 1000);

/** Pine: offset — 2009-01-08 제네시스와 start 사이 일수 */
export const BTC_POWER_LAW_OFFSET = 556;

/** Pine 입력값 (2024-08-16 기준) */
const CENTER_A = -16.4945;
const CENTER_B = 5.68823;
const SUPPORT_A = -16.9945;
const SUPPORT_B = 5.68823;
const RESIST_A = -15.9945;
const RESIST_B = 5.68823;

function priceFromAB(a: number, b: number, d: number): number {
  const e = a + b * Math.log10(d);
  return Math.pow(10, e);
}

/** BLX 시작일(2010-07-19 UTC) 0시부터의 **UTC 달력 일 수** (시작 당일 = 0) */
function daysSincePowerLawStartUtc(tSec: number): number {
  const start = new Date(BTC_POWER_LAW_START_SEC * 1000);
  const t = new Date(tSec * 1000);
  const startMid = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const tMid = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.round((tMid - startMid) / 86400000);
}

/** Pine: d = offset + barssince → 일봉 인덱스에 대응하는 정수 d */
function dayIndexD(candleTimeSec: number): number {
  const days = Math.max(0, daysSincePowerLawStartUtc(candleTimeSec));
  return Math.max(1, BTC_POWER_LAW_OFFSET + days);
}

/** BTC 기축 페어(USDT/USD 등)에서만 의미 있음 */
export function isBitcoinPowerLawChartSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s.startsWith('BTC')) return false;
  if (s.includes('ETH') || s.includes('BNB')) return false;
  return true;
}

export function buildBitcoinPowerLawLineData(candles: Candle[]): {
  center: LineData<UTCTimestamp>[];
  support: LineData<UTCTimestamp>[];
  resistance: LineData<UTCTimestamp>[];
} {
  const center: LineData<UTCTimestamp>[] = [];
  const support: LineData<UTCTimestamp>[] = [];
  const resistance: LineData<UTCTimestamp>[] = [];
  for (const c of candles) {
    const t = typeof c.time === 'number' ? c.time : 0;
    if (t <= 0) continue;
    const d = dayIndexD(t);
    const time = c.time as UTCTimestamp;
    center.push({ time, value: priceFromAB(CENTER_A, CENTER_B, d) });
    support.push({ time, value: priceFromAB(SUPPORT_A, SUPPORT_B, d) });
    resistance.push({ time, value: priceFromAB(RESIST_A, RESIST_B, d) });
  }
  return { center, support, resistance };
}

/** 마지막 봉 기준 중심/지지/저항 대비 가격 괴리율(%) — Pine delta_* 와 동일 부호 규칙 */
export function bitcoinPowerLawDeltasPct(close: number, center: number, support: number, resistance: number): {
  deltaCen: number;
  deltaSup: number;
  deltaRes: number;
} {
  const pct = (line: number) => Math.round((line / close - 1) * 100);
  return {
    deltaCen: pct(center),
    deltaSup: pct(support),
    deltaRes: pct(resistance),
  };
}
