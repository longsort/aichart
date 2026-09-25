/**
 * 15m clock flow — UTC :00/:15/:30/:45 종가 봉의 공격체결(또는 몸통) 흐름.
 * 10초/30초는 Bitget OFI 10s 시리즈가 해당 창에 있을 때만 표시한다.
 * 이후 1봉(15m)·4봉(1H)·16봉(4H) 같은방향 도달은 표본 n>=30일 때만 %.
 */
import { formatSamplePct } from './noFakeNumbers';
import type { Eagle1Bar } from './structureEngine';
import { clockSubMinuteLabel, ofiInWindow, type OfiBucket } from './microstructureSeries';

export type ClockSlot = '00' | '15' | '30' | '45';

export type ClockFlowReport = {
  labelKo: string;
  note: string;
  slot: ClockSlot | null;
  source: 'taker' | 'body' | 'none';
  lastFlow: number | null;
  after15m: string;
  after1h: string;
  after4h: string;
  subMinute: string;
  sampleSize: number;
};

function toMs(t: number): number {
  return t > 1e12 ? t : t * 1000;
}

export function clockSlotUtc(time: number): ClockSlot | null {
  const m = new Date(toMs(time)).getUTCMinutes();
  if (m === 0) return '00';
  if (m === 15) return '15';
  if (m === 30) return '30';
  if (m === 45) return '45';
  return null;
}

function barFlow(b: Eagle1Bar): { score: number; source: 'taker' | 'body' } {
  const vol = Number(b.volume) || 0;
  if (vol > 0 && b.takerBuyBaseVolume != null && Number.isFinite(b.takerBuyBaseVolume)) {
    return { score: (b.takerBuyBaseVolume / vol) * 2 - 1, source: 'taker' };
  }
  const range = Math.max(b.high - b.low, 1e-9);
  return { score: ((b.close - b.open) / range) * 0.8, source: 'body' };
}

function hitRate(rows: boolean[], n: number): string {
  if (n <= 0) return '데이터 없음';
  const p = rows.length / n;
  return formatSamplePct(n, p);
}

export function runClockFlowEngine(params: {
  candles15m?: Eagle1Bar[] | null;
  endExclusive?: number;
  asOfTime?: number | null;
  ofi10s?: OfiBucket[] | null;
}): ClockFlowReport {
  const empty: ClockFlowReport = {
    labelKo: '데이터 없음',
    note: '15m 시계열 없음',
    slot: null,
    source: 'none',
    lastFlow: null,
    after15m: '데이터 없음',
    after1h: '데이터 없음',
    after4h: '데이터 없음',
    subMinute: '데이터 없음',
    sampleSize: 0,
  };
  const rawAll = params.candles15m ?? [];
  const n = Math.min(rawAll.length, params.endExclusive ?? rawAll.length);
  let series = rawAll.slice(0, n);
  if (params.asOfTime != null && Number.isFinite(Number(params.asOfTime))) {
    const t = Number(params.asOfTime);
    series = series.filter((b) => Number(b.time) <= t);
  }
  const bars = series.filter((b) => clockSlotUtc(Number(b.time)) != null);
  if (bars.length < 8) return { ...empty, note: bars.length ? '15m 경계 봉 부족' : '15m 시계열 없음' };

  const closed = bars.slice(0, Math.max(0, bars.length - 1));
  const last = closed[closed.length - 1] ?? bars[bars.length - 1]!;
  const lastSlot = clockSlotUtc(Number(last.time));
  const lastF = barFlow(last);

  const aligned15: boolean[] = [];
  const aligned1h: boolean[] = [];
  const aligned4h: boolean[] = [];
  for (let i = 0; i < closed.length; i++) {
    const a = closed[i]!;
    const flow = barFlow(a).score;
    if (Math.abs(flow) < 0.04) continue;
    const dir = flow >= 0 ? 1 : -1;
    const b15 = closed[i + 1];
    if (b15 && a.close > 0) {
      aligned15.push(Math.sign(b15.close - a.close) === dir);
    }
    const b1h = closed[i + 4];
    if (b1h && a.close > 0) {
      aligned1h.push(Math.sign(b1h.close - a.close) === dir);
    }
    const b4h = closed[i + 16];
    if (b4h && a.close > 0) {
      aligned4h.push(Math.sign(b4h.close - a.close) === dir);
    }
  }

  const srcKo = lastF.source === 'taker' ? '공격체결' : '봉 몸통';
  const ofiAll = params.ofi10s ?? [];
  const asOfMs =
    params.asOfTime != null && Number.isFinite(Number(params.asOfTime)) ? toMs(Number(params.asOfTime)) : null;
  const ofiClip = asOfMs != null ? ofiAll.filter((b) => b.t <= asOfMs) : ofiAll;
  const slotCloseMs = toMs(Number(last.time)) + 15 * 60 * 1000;
  const nowLabel = clockSubMinuteLabel({ ofi10s: ofiClip, slotCloseMs });
  const aligned10: boolean[] = [];
  for (let i = 0; i < closed.length; i++) {
    const a = closed[i]!;
    const flow = barFlow(a).score;
    if (Math.abs(flow) < 0.04) continue;
    const dir = flow >= 0 ? 1 : -1;
    const closeMs = toMs(Number(a.time)) + 15 * 60 * 1000;
    const o10 = ofiInWindow(ofiClip, closeMs, closeMs + 10_000);
    if (o10 == null || Math.abs(o10) < 0.04) continue;
    aligned10.push(Math.sign(o10) === dir);
  }
  const ofiHit = formatSamplePct(
    aligned10.length,
    aligned10.length > 0 ? aligned10.filter(Boolean).length / aligned10.length : null
  );
  const subMinute =
    nowLabel === '데이터 없음'
      ? '데이터 없음'
      : `${nowLabel} · ${ofiHit}`;

  return {
    labelKo: lastSlot ? `${lastSlot}분 경계 · ${lastF.score >= 0 ? '매수우세' : '매도우세'}` : '데이터 없음',
    note: ofiClip.length
      ? `${srcKo} · OFI 10s n=${ofiClip.length}`
      : `${srcKo} · 10초/30초 OFI 시리즈 없음`,
    slot: lastSlot,
    source: lastF.source,
    lastFlow: lastF.score,
    after15m: hitRate(aligned15.filter(Boolean), aligned15.length),
    after1h: hitRate(aligned1h.filter(Boolean), aligned1h.length),
    after4h: hitRate(aligned4h.filter(Boolean), aligned4h.length),
    subMinute,
    sampleSize: aligned15.length,
  };
}
