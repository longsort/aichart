/**
 * 최근 캔들 스윙 형태 ↔ 교재 도식 자리 유사도.
 * 정규화 RMSE + 다리 방향. 확정 카운트 아님.
 */
import type { Candle } from '@/types';
import { detectZigzagPivots } from '@/lib/candleAnalysisElliottMvp';
import type { MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';
import {
  listSchoolHotspots,
  type ClickableSchool,
  type SchoolSchematicPin,
} from '@/lib/mergedDeskSchoolSchematicCatalog';

export type SchematicTwin = {
  key: string;
  left: number;
  top: number;
  score: number;
  labelKo: string;
  engine: boolean;
};

export type SchematicShapeHit = {
  school: ClickableSchool;
  figureId: string;
  hotspotKey: string;
  left: number;
  top: number;
  score: number;
  labelKo: string;
  similarKo: string;
  twins: SchematicTwin[];
};

/** 교재 도식에 찍힌 약어와 동일 — Phase B UT 같은 풀어쓰기 금지 */
const LAB: Record<string, string> = {
  p0: '0',
  '0': '0',
  '1': '(1)',
  '2': '(2)',
  '3': '(3)',
  '4': '(4)',
  '5': '(5)',
  A: 'A',
  B: 'B',
  C: 'C',
  w3: 'W3',
  w5: 'W5',
  w1: 'W1',
  '4x': 'W4',
  '5x': 'W5',
  PS: 'PS',
  SC: 'SC',
  AR: 'AR',
  ST_A: 'ST',
  ST_B: 'ST',
  SPRING: 'Spring',
  TEST: 'Test',
  LPS: 'LPS',
  SOS: 'SOS',
  BU: 'BU',
  E: 'E',
  PSY: 'PSY',
  BC: 'BC',
  UTAD: 'UTAD',
  LPSY: 'LPSY',
  SOW: 'SOW',
  SOW_B: 'SOW',
  UT_B: 'UT',
  ACC: 'Accumulation',
  MARKUP: 'Markup',
  DIST: 'Distribution',
  MARKDOWN: 'Markdown',
  HH2: 'HH',
  HL2: 'HL',
  HH3: 'HH',
  LH2: 'LH',
  LL2: 'LL',
  LH3: 'LH',
  NOW: '지금',
  BREAK: 'break',
  HEAD: 'Head',
  LS: 'LS',
  RS: 'RS',
  NECK: 'neckline',
  P1: 'P1',
  P2: 'P2',
  T1: 'T1',
  T2: 'T2',
  APEX: 'apex',
  COIL: 'coil',
  FLAG: 'flag',
  POLE: 'pole',
  BRK: 'break',
  HANDLE: 'handle',
  CUP: 'cup',
  RIM: 'rim',
  RES: 'R',
  SUP: 'S',
  LOW: 'low',
  HIGH: 'high',
  END: 'end',
  D: 'D',
  X: 'X',
  BOS: 'BOS',
  CHOCH: 'CHoCH',
  FVG: 'FVG',
  OB: 'OB',
  SWEEP: 'Sweep',
  PO3: 'PO3',
  H1: 'H1',
  H2: 'H2',
  TR: 'TR',
  PB: 'PB',
  TREND: 'trend',
  r382: '0.382',
  r50: '0.50',
  r618: '0.618',
  r786: '0.786',
  e100: '1.0',
  e127: '1.272',
  e162: '1.618',
  ABOVE: 'above',
  BELOW: 'below',
  INSIDE: 'inside',
  POC: 'POC',
  VAH: 'VAH',
  VAL: 'VAL',
  MED: 'median',
  UP: 'upper',
  P0: 'P0',
  P1b: 'P1',
  hammer: 'hammer',
  star: 'shooting',
  engulf: 'engulf',
  doji: 'doji',
  morning: 'morning',
  climax: 'climax',
  nodemand: 'no demand',
  nosupply: 'no supply',
  absorb: 'absorption',
  TK: 'Tenkan',
  BI: 'bi',
  ZS: 'ZS',
  BOX: 'box',
  CREST: 'crest',
  TROUGH: 'trough',
  MID: 'mid',
  TOP: 'top',
  BOT: 'bot',
  O: 'O',
};

export function schematicHotspotLabelKo(key: string): string {
  return LAB[key] ?? String(key || '').replace(/_/g, ' ');
}

/** 도식 약어 + 확신 낮으면 부근 */
export function schematicSeatPhrase(key: string, score: number): string {
  const lab = schematicHotspotLabelKo(key);
  if (!(score > 0)) return lab;
  if (score >= 68) return lab;
  if (score >= 42) return `${lab} 부근`;
  return `${lab} 후보`;
}

function resample(ys: number[], n: number): number[] {
  if (ys.length === 0) return Array(n).fill(0.5);
  if (ys.length === 1) return Array(n).fill(ys[0]);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / Math.max(1, n - 1)) * (ys.length - 1);
    const j = Math.floor(t);
    const f = t - j;
    const a = ys[j]!;
    const b = ys[Math.min(ys.length - 1, j + 1)]!;
    out.push(a + (b - a) * f);
  }
  return out;
}

function scoreSeries(live: number[], tmpl: number[]): number {
  const n = Math.min(8, Math.max(3, Math.min(live.length, tmpl.length)));
  if (live.length < 2 || tmpl.length < 2) return 0;
  const a = resample(live.slice(-Math.max(n, live.length)), n);
  const b = resample(tmpl.slice(-Math.max(n, tmpl.length)), n);
  let sse = 0;
  let dir = 0;
  for (let i = 0; i < n; i++) sse += (a[i]! - b[i]!) ** 2;
  for (let i = 1; i < n; i++) {
    const da = a[i]! - a[i - 1]!;
    const db = b[i]! - b[i - 1]!;
    if (Math.abs(da) < 1e-9 && Math.abs(db) < 1e-9) dir += 1;
    else if (da === 0 || db === 0) dir += 0.4;
    else if (Math.sign(da) === Math.sign(db)) dir += 1;
  }
  const rmse = Math.sqrt(sse / n);
  const shape = 1 - Math.min(1, rmse * 1.35);
  const dirHit = dir / Math.max(1, n - 1);
  return Math.round(100 * (0.58 * shape + 0.42 * dirHit));
}

function liveNormYs(candles: Candle[] | undefined, elliott?: MergedDeskElliottRead | null): number[] {
  const prices: number[] = [];
  const L = elliott?.levels;
  if (L) {
    prices.push(L.p0, L.p1, L.p2);
    if (L.p3 != null) prices.push(L.p3);
    if (L.p4 != null) prices.push(L.p4);
    if (L.p5 != null) prices.push(L.p5);
    if (L.a != null) prices.push(L.a);
    if (L.b != null) prices.push(L.b);
    if (L.c != null) prices.push(L.c);
  } else if (candles && candles.length >= 24) {
    detectZigzagPivots(candles, 4, 4)
      .slice(-8)
      .forEach((p) => prices.push(p.price));
  }
  if (candles?.length) prices.push(candles[candles.length - 1]!.close);
  const finite = prices.filter((p) => Number.isFinite(p));
  if (finite.length < 2) return [];
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const span = hi - lo || 1;
  return finite.map((p) => (p - lo) / span);
}

function tmplNormYs(spots: Array<{ top: number }>, endIdx: number): number[] {
  const slice = spots.slice(0, endIdx + 1);
  const ys = slice.map((s) => 1 - s.top / 100);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  return ys.map((y) => (y - lo) / span);
}

export function matchSchematicShape(params: {
  school: ClickableSchool;
  figureId: string;
  candles?: Candle[];
  pin?: SchoolSchematicPin | null;
  elliott?: MergedDeskElliottRead | null;
  wyckoff?: MergedDeskWyckoffRead | null;
}): SchematicShapeHit | null {
  const spots = listSchoolHotspots(params.school, params.figureId);
  if (!spots.length) return null;
  const live = liveNormYs(params.candles, params.school === 'elliott' ? params.elliott : null);
  const engineKey = params.pin?.hotspotKey ?? '';
  const twins: SchematicTwin[] = spots.map((s, i) => {
    let score = live.length >= 2 ? scoreSeries(live, tmplNormYs(spots, i)) : 40;
    if (engineKey && s.key === engineKey) score = Math.min(100, score + 22);
    if (params.elliott && params.school === 'elliott') {
      const w = params.elliott.wave;
      if (s.key === w || (w === '4' && s.key === '4x') || (w === '5' && s.key === '5x')) {
        score = Math.min(100, score + 18);
      }
    }
    if (params.wyckoff && params.school === 'wyckoff') {
      const ev = String(params.wyckoff.event || '');
      if (ev && s.key.toUpperCase().includes(ev.toUpperCase().slice(0, 3))) {
        score = Math.min(100, score + 12);
      }
    }
    return {
      key: s.key,
      left: s.left,
      top: s.top,
      score,
      labelKo: schematicHotspotLabelKo(s.key),
      engine: !!engineKey && s.key === engineKey,
    };
  });
  twins.sort((a, b) => b.score - a.score);
  const best = twins[0]!;
  const alt = twins[1];
  const bestPhrase = schematicSeatPhrase(best.key, best.score);
  const similarKo =
    best.score < 38
      ? `유사 낮음 · 가까운 자리 ${bestPhrase}`
      : `지금 ≈ ${bestPhrase}${alt ? ` · 차선 ${schematicSeatPhrase(alt.key, alt.score)}` : ''}`;
  return {
    school: params.school,
    figureId: params.figureId,
    hotspotKey: best.key,
    left: best.left,
    top: best.top,
    score: best.score,
    labelKo: best.labelKo,
    similarKo,
    twins: twins.sort((a, b) => a.left - b.left || a.top - b.top),
  };
}
