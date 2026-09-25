/**
 * 기관밴드1·2가 같은 방향일 때 연속 터치가 모이면,
 * 그 **시작 캔들** 위·아래에 +7% / -7% 를 붙인다.
 * (도달 봉·가로 가격선이 아님. 이후 롱·숏 7%가 출발할 수 있는 봉.)
 */
import type { Candle } from '@/types';
import {
  computeInstitutionalBandInteractionMarkers,
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
} from '@/lib/institutionalSuperBand';

function band2Params(chartTf?: string): { period: number; mult: number } {
  const tf = String(chartTf || '3m').toLowerCase();
  if (tf === '1m') return { period: 8, mult: 2.7 };
  if (tf === '3m') return { period: 9, mult: 2.8 };
  if (tf === '5m') return { period: 9, mult: 2.85 };
  if (tf === '15m') return { period: 10, mult: 3 };
  if (tf === '1h' || tf === '60m') return { period: 10, mult: 3 };
  if (tf === '4h') return { period: 12, mult: 3.1 };
  if (tf === '1d') return { period: 14, mult: 3.25 };
  return { period: 9, mult: 2.8 };
}

export type BandMove7Marker = {
  time: number;
  price: number;
  label: string;
  color: string;
  position: 'aboveBar' | 'belowBar';
  shape: 'circle';
};

const CLUSTER_GAP = 10;
const CLUSTER_MIN = 2;
const MIN_START_GAP = 8;

type Side = 1 | -1;

export function buildBandMove7Overlay(candles: Candle[], chartTf?: string): {
  markers: BandMove7Marker[];
  lines: [];
} {
  const empty = { markers: [] as BandMove7Marker[], lines: [] as [] };
  if (!candles || candles.length < 24) return empty;

  const b1 = computeInstitutionalSuperTrendCore(
    candles,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT
  );
  const p2 = band2Params(chartTf);
  const b2 = computeInstitutionalSuperTrendCore(candles, p2.period, p2.mult);
  if (!b1 || !b2) return empty;

  const timeToIdx = new Map<number, number>();
  candles.forEach((c, i) => timeToIdx.set(Number(c.time), i));

  const events: Array<{ i: number; dir: Side }> = [];
  const pushMarks = (
    marks: ReturnType<typeof computeInstitutionalBandInteractionMarkers>
  ) => {
    for (const m of marks) {
      const i = timeToIdx.get(Number(m.time));
      if (i == null) continue;
      events.push({ i, dir: m.verdict === 'LONG' ? 1 : -1 });
    }
  };
  pushMarks(
    computeInstitutionalBandInteractionMarkers(
      candles,
      INSTITUTIONAL_BAND_DEFAULT_PERIOD,
      INSTITUTIONAL_BAND_DEFAULT_MULT,
      { minBarsBetween: 5 }
    )
  );
  pushMarks(
    computeInstitutionalBandInteractionMarkers(candles, p2.period, p2.mult, {
      minBarsBetween: 5,
    })
  );
  events.sort((a, b) => a.i - b.i);

  const starts: Array<{ i: number; dir: Side }> = [];
  let buf: Array<{ i: number; dir: Side }> = [];
  const flush = () => {
    if (buf.length < CLUSTER_MIN) {
      buf = [];
      return;
    }
    const dir = buf[0]!.dir;
    const same = buf.filter((e) => e.dir === dir);
    if (same.length < CLUSTER_MIN) {
      buf = [];
      return;
    }
    const i = same[0]!.i;
    const d1: Side = b1.trend[i] === 1 ? 1 : -1;
    const d2: Side = b2.trend[i] === 1 ? 1 : -1;
    if (d1 === d2 && d1 === dir) starts.push({ i, dir });
    buf = [];
  };
  for (const e of events) {
    if (!buf.length) {
      buf = [e];
      continue;
    }
    const prev = buf[buf.length - 1]!;
    if (e.i - prev.i <= CLUSTER_GAP && e.dir === prev.dir) buf.push(e);
    else {
      flush();
      buf = [e];
    }
  }
  flush();

  const markers: BandMove7Marker[] = [];
  let lastStart = -MIN_START_GAP;
  for (const s of starts) {
    if (s.i - lastStart < MIN_START_GAP) continue;
    const bar = candles[s.i];
    if (!bar) continue;
    lastStart = s.i;
    const long = s.dir === 1;
    markers.push({
      time: Number(bar.time),
      price: long ? Number(bar.low) : Number(bar.high),
      label: long ? '+7%' : '-7%',
      color: long ? '#facc15' : '#fb7185',
      position: long ? 'belowBar' : 'aboveBar',
      shape: 'circle',
    });
  }
  return { markers: markers.slice(-24), lines: [] };
}
