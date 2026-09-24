/**
 * 3분 · 기관밴드1·2가 같은 방향일 때 터치가 연속되면
 * 그 종가 기준 ±7% 가격선을 고정하고, 나중에 그 가격을 찍은 봉에만 +7%/-7% 를 붙인다.
 * 같은 방향의 다음 터치는 선을 움직이지 않는다. 밴드가 반대로 같이 돌아설 때만 다시 잡는다.
 */
import type { Candle } from '@/types';
import {
  computeInstitutionalBandInteractionMarkers,
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
} from '@/lib/institutionalSuperBand';

/** 3분 기관밴드2 — period 9, mult 2.8 */
const BAND2_3M = { period: 9, mult: 2.8 };

type Move7Marker = {
  time: number;
  price: number;
  label: string;
  color: string;
  position: 'aboveBar' | 'belowBar';
  shape: 'circle';
};

type Move7Line = {
  id: string;
  price: number;
  title: string;
  color: string;
  lineWidth: 1 | 2 | 3;
  lineStyle: 'dashed';
  group: 'exec';
};

const MOVE_PCT = 0.07;
const CLUSTER_GAP = 10;
const CLUSTER_MIN = 2;

type Side = 1 | -1;

type Anchor = { i: number; dir: Side; entry: number };

export function buildBandMove7Overlay(candles: Candle[]): {
  markers: Move7Marker[];
  lines: Move7Line[];
} {
  const empty = { markers: [] as Move7Marker[], lines: [] as Move7Line[] };
  if (!candles || candles.length < 40) return empty;

  const b1 = computeInstitutionalSuperTrendCore(
    candles,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT
  );
  const p2 = BAND2_3M;
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
      if (i == null || i >= candles.length - 1) continue;
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

  const clusters: Anchor[] = [];
  let buf: Array<{ i: number; dir: Side }> = [];
  const flush = () => {
    if (buf.length < CLUSTER_MIN) {
      buf = [];
      return;
    }
    const dir = buf[buf.length - 1]!.dir;
    const same = buf.filter((e) => e.dir === dir);
    if (same.length < CLUSTER_MIN) {
      buf = [];
      return;
    }
    const i = buf[buf.length - 1]!.i;
    const d1: Side = b1.trend[i] === 1 ? 1 : -1;
    const d2: Side = b2.trend[i] === 1 ? 1 : -1;
    const entry = Number(candles[i]?.close);
    if (d1 === d2 && d1 === dir && entry > 0) clusters.push({ i, dir, entry });
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
  if (!clusters.length) return empty;

  const markers: Move7Marker[] = [];
  let active: Anchor | null = null;
  let scanFrom = -1;

  const takeHit = (from: number, to: number, entry: number): { j: number; side: Side } | null => {
    const up = entry * (1 + MOVE_PCT);
    const dn = entry * (1 - MOVE_PCT);
    for (let j = from + 1; j <= to; j++) {
      const bar = candles[j];
      if (!bar) continue;
      const hitUp = bar.high >= up;
      const hitDn = bar.low <= dn;
      if (hitUp && !hitDn) return { j, side: 1 };
      if (hitDn && !hitUp) return { j, side: -1 };
      if (hitUp && hitDn) {
        const du = Math.abs(bar.open - up);
        const dd = Math.abs(bar.open - dn);
        return { j, side: du <= dd ? 1 : -1 };
      }
    }
    return null;
  };

  const stamp = (j: number, side: Side) => {
    const bar = candles[j];
    if (!bar) return;
    const up = side === 1;
    markers.push({
      time: Number(bar.time),
      price: up ? Number(bar.high) : Number(bar.low),
      label: up ? '+7%' : '-7%',
      color: up ? '#facc15' : '#fb7185',
      position: up ? 'aboveBar' : 'belowBar',
      shape: 'circle',
    });
  };

  const lastIdx = candles.length - 1;
  for (const cluster of clusters) {
    if (active) {
      const hit = takeHit(scanFrom, cluster.i, active.entry);
      if (hit) {
        stamp(hit.j, hit.side);
        active = null;
      }
    }
    if (!active) {
      active = cluster;
      scanFrom = cluster.i;
      continue;
    }
    const d1: Side = b1.trend[cluster.i] === 1 ? 1 : -1;
    const d2: Side = b2.trend[cluster.i] === 1 ? 1 : -1;
    if (cluster.dir !== active.dir && d1 === d2 && d1 === cluster.dir) {
      active = cluster;
      scanFrom = cluster.i;
    }
  }

  const lines: Move7Line[] = [];
  if (active) {
    const hit = takeHit(scanFrom, lastIdx, active.entry);
    if (hit) stamp(hit.j, hit.side);
    else {
      lines.push(
        {
          id: 'm7-up',
          price: active.entry * (1 + MOVE_PCT),
          title: '+7%',
          color: 'rgba(250,204,21,0.92)',
          lineWidth: 1,
          lineStyle: 'dashed',
          group: 'exec',
        },
        {
          id: 'm7-dn',
          price: active.entry * (1 - MOVE_PCT),
          title: '-7%',
          color: 'rgba(251,113,133,0.92)',
          lineWidth: 1,
          lineStyle: 'dashed',
          group: 'exec',
        }
      );
    }
  }

  return { markers: markers.slice(-12), lines };
}
