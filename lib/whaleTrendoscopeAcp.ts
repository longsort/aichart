/**
 * 고래 모드: Auto Chart Patterns 스타일 오버레이 (Trendoscope® ACP 영감)
 *
 * TradingView Pine `Trendoscope/abstractchartpatterns`, `ZigzagLite` 등은 비공개 라이브러리라
 * 동일 바이너리 동작을 복제할 수 없습니다. CC BY-NC-SA 4.0 — Trendoscope® 표기.
 * 본 모듈은 앱 내에서 독립적으로 구현한 지그재그·기하 규칙 기반 근사입니다.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UserSettings } from '@/lib/settings';
import { normalizeHex6 } from '@/lib/chartHexColor';
import {
  computeAllowedPatternMask,
  computeLastPivotDirectionInts,
  resolveWhaleAcpConfig,
} from '@/lib/whaleTrendoscopeAcpConfig';

/** Pine Display 기본 팔레트(다크 테마)에 가까운 색 — 패턴 인덱스별 */
export const WHALE_ACP_PATTERN_HEX: string[] = [
  '#FBF46D',
  '#8DBA51',
  '#4A9FF5',
  '#FF998C',
  '#FF9500',
  '#00EAD3',
  '#A799B7',
  '#FFD271',
  '#77D970',
  '#5F81E4',
  '#EB92BE',
  '#C68B59',
  '#C89595',
];

export type WhaleAcpOpts = {
  zigzagLength: number;
  depth: number;
  pivotCount: 5 | 6;
  errorPct: number;
  flatPct: number;
  maxPatterns: number;
  showZigzag: boolean;
  showPivotLabels: boolean;
  showPatternLabel: boolean;
  lineWidth: number;
  zigzagHex: string;
};

export type ZgPivot = {
  index: number;
  time: number;
  price: number;
  isHigh: boolean;
};

function isPivotHigh(candles: Candle[], i: number, L: number): boolean {
  const h = candles[i]!.high;
  for (let k = 1; k <= L; k++) {
    if (candles[i - k]!.high >= h) return false;
    if (candles[i + k]!.high >= h) return false;
  }
  return true;
}

function isPivotLow(candles: Candle[], i: number, L: number): boolean {
  const lo = candles[i]!.low;
  for (let k = 1; k <= L; k++) {
    if (candles[i - k]!.low <= lo) return false;
    if (candles[i + k]!.low <= lo) return false;
  }
  return true;
}

/**
 * 교대 지그재그: depth는 최소 가격 변동(종가 대비 depth/10000)으로 근사.
 */
export function buildAlternatingZigzag(candles: Candle[], length: number, depth: number): ZgPivot[] {
  const n = candles.length;
  const L = Math.max(1, Math.min(80, Math.floor(length)));
  if (n < L * 2 + 3) return [];
  const mid = candles[n - 1]!.close;
  const minMove = mid * Math.max(0.00015, Math.min(0.06, depth / 10000));

  const raw: ZgPivot[] = [];
  for (let i = L; i < n - L; i++) {
    const ph = isPivotHigh(candles, i, L);
    const pl = isPivotLow(candles, i, L);
    if (ph && !pl) raw.push({ index: i, time: candles[i]!.time as number, price: candles[i]!.high, isHigh: true });
    else if (pl && !ph) raw.push({ index: i, time: candles[i]!.time as number, price: candles[i]!.low, isHigh: false });
    else if (ph && pl) {
      const last = raw[raw.length - 1];
      if (!last) raw.push({ index: i, time: candles[i]!.time as number, price: candles[i]!.high, isHigh: true });
      else if (last.isHigh) raw.push({ index: i, time: candles[i]!.time as number, price: candles[i]!.low, isHigh: false });
      else raw.push({ index: i, time: candles[i]!.time as number, price: candles[i]!.high, isHigh: true });
    }
  }

  const out: ZgPivot[] = [];
  for (const c of raw) {
    if (!out.length) {
      out.push(c);
      continue;
    }
    const last = out[out.length - 1]!;
    if (c.isHigh === last.isHigh) {
      if (c.isHigh) {
        if (c.price > last.price) out[out.length - 1] = c;
      } else if (c.price < last.price) {
        out[out.length - 1] = c;
      }
      continue;
    }
    if (Math.abs(c.price - last.price) >= minMove) out.push(c);
  }
  return out;
}

function olsSlopeIntercept(points: { x: number; y: number }[]): { m: number; b: number } | null {
  const k = points.length;
  if (k < 2) return null;
  let sx = 0,
    sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / k;
  const my = sy / k;
  let num = 0,
    den = 0;
  for (const p of points) {
    const dx = p.x - mx;
    num += dx * (p.y - my);
    den += dx * dx;
  }
  if (den < 1e-18) return { m: 0, b: my };
  const m = num / den;
  const b = my - m * mx;
  return { m, b };
}

function linePrice(m: number, b: number, x: number): number {
  return m * x + b;
}

/** 패턴 ID 1..12 (색·이름 테이블용) */
function classifyPatternId(
  highs: ZgPivot[],
  lows: ZgPivot[],
  errPct: number,
  flatPct: number,
  iMin: number,
  iMax: number,
  priceMin: number,
  priceMax: number
): number {
  const up = highs.map((h) => ({ x: h.index, y: h.price }));
  const lo = lows.map((l) => ({ x: l.index, y: l.price }));
  const u = olsSlopeIntercept(up);
  const v = olsSlopeIntercept(lo);
  if (!u || !v) return 11;
  const barSpan = Math.max(1, iMax - iMin);
  const priceSpan = Math.max(1e-9, priceMax - priceMin);
  const norm = barSpan / priceSpan;
  const su = u.m * norm;
  const sl = v.m * norm;
  const flatCut = (flatPct / 100) * (priceSpan / barSpan);
  const errCut = (errPct / 100) * Math.max(Math.abs(su), Math.abs(sl), flatCut * 0.25);
  const parallel = Math.abs(su - sl) <= Math.max(errCut, flatCut * 0.35);

  const u0 = linePrice(u.m, u.b, iMin);
  const u1 = linePrice(u.m, u.b, iMax);
  const l0 = linePrice(v.m, v.b, iMin);
  const l1 = linePrice(v.m, v.b, iMax);
  const wStart = u0 - l0;
  const wEnd = u1 - l1;
  const contracting = wEnd < wStart * 0.92 && wStart > 0 && wEnd > 0;
  const expanding = wEnd > wStart * 1.08 && wStart > 0 && wEnd > 0;

  if (parallel) {
    if (su > flatCut && sl > flatCut) return 1;
    if (su < -flatCut && sl < -flatCut) return 2;
    if (Math.abs(su) <= flatCut && Math.abs(sl) <= flatCut) return 3;
  }
  if (su > flatCut && sl > flatCut && !parallel) {
    if (contracting) return 9;
    if (expanding) return 4;
  }
  if (su < -flatCut && sl < -flatCut && !parallel) {
    if (contracting) return 10;
    if (expanding) return 5;
  }
  if (su < -flatCut * 0.2 && sl > flatCut * 0.2 && contracting) return 11;
  if (su > flatCut * 0.2 && sl < -flatCut * 0.2 && expanding) return 6;
  if (su > flatCut && sl < -flatCut * 0.2 && expanding) return 7;
  if (su < -flatCut && sl > flatCut * 0.2 && expanding) return 8;
  if (su > flatCut && sl < -flatCut * 0.2 && contracting) return 13;
  if (su < -flatCut && sl > flatCut * 0.2 && contracting) return 12;
  return 11;
}

const PATTERN_NAMES: Record<number, string> = {
  1: 'Ascending Channel',
  2: 'Descending Channel',
  3: 'Ranging Channel',
  4: 'Rising Wedge (Expanding)',
  5: 'Falling Wedge (Expanding)',
  6: 'Diverging Triangle',
  7: 'Ascending Triangle (Expanding)',
  8: 'Descending Triangle (Expanding)',
  9: 'Rising Wedge (Contracting)',
  10: 'Falling Wedge (Contracting)',
  11: 'Converging Triangle',
  12: 'Descending Triangle (Contracting)',
  13: 'Ascending Triangle (Contracting)',
};

function patternName(id: number): string {
  return PATTERN_NAMES[id] ?? 'Chart Pattern';
}

function passBarRatio(slice: ZgPivot[], check: boolean, limit: number): boolean {
  if (!check) return true;
  if (slice.length < 3) return true;
  const gaps: number[] = [];
  for (let i = 1; i < slice.length; i++) gaps.push(slice[i]!.index - slice[i - 1]!.index);
  const minG = Math.min(...gaps);
  const maxG = Math.max(...gaps);
  if (maxG <= 0) return false;
  return minG / maxG >= limit;
}

function idxRangesOverlap(a: readonly [number, number], b: readonly [number, number]): boolean {
  return Math.max(a[0], b[0]) <= Math.min(a[1], b[1]);
}

type AcpCand = {
  zi: number;
  win: number;
  slice: ZgPivot[];
  pid: number;
  iMin: number;
  iMax: number;
};

function appendPatternOverlays(
  workCandles: Candle[],
  args: {
    lineWidth: number;
    zigzagHex: string;
    showZigzag: boolean;
    showPivotLabels: boolean;
    showPatternLabel: boolean;
    useCustomColors: boolean;
    customColors: string[];
  },
  c: AcpCand
): OverlayItem[] {
  const { slice, pid, iMin, iMax } = c;
  const highs = slice.filter((p) => p.isHigh);
  const lows = slice.filter((p) => !p.isHigh);
  if (highs.length < 2 || lows.length < 2) return [];

  const n = workCandles.length;
  const name = patternName(pid);
  const custom = args.useCustomColors && args.customColors[pid - 1];
  const colHex = normalizeHex6(
    (typeof custom === 'string' && custom.trim() ? custom : WHALE_ACP_PATTERN_HEX[(pid - 1) % WHALE_ACP_PATTERN_HEX.length]) ?? '#8DBA51',
    '#8DBA51'
  );
  const lastIdx = n - 1;
  const tLast = workCandles[lastIdx]!.time as number;

  const upPts = highs.map((h) => ({ x: h.index, y: h.price }));
  const loPts = lows.map((l) => ({ x: l.index, y: l.price }));
  const u = olsSlopeIntercept(upPts);
  const v = olsSlopeIntercept(loPts);
  if (!u || !v) return [];

  const pu0 = linePrice(u.m, u.b, iMin);
  const pu1 = linePrice(u.m, u.b, lastIdx);
  const pl0 = linePrice(v.m, v.b, iMin);
  const pl1 = linePrice(v.m, v.b, lastIdx);
  const t0 = workCandles[iMin]!.time as number;

  const lw = Math.max(1, Math.min(6, Math.floor(args.lineWidth)));
  const zHex = normalizeHex6(args.zigzagHex, '#3B82F6');
  const out: OverlayItem[] = [];
  const stamp = `z${c.zi}-w${c.win}-${iMin}-${iMax}-${pid}`;

  out.push({
    id: `whale-acp-up-${stamp}`,
    kind: 'trendLine',
    label: name,
    category: 'whaleToolkit',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t0,
    time2: tLast,
    price1: pu0,
    price2: pu1,
    confidence: 55,
    color: colHex + 'DD',
    lineLabelColor: colHex,
    lineStrokeWidth: lw,
    noProject: true,
  });
  out.push({
    id: `whale-acp-lo-${stamp}`,
    kind: 'trendLine',
    label: name,
    category: 'whaleToolkit',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t0,
    time2: tLast,
    price1: pl0,
    price2: pl1,
    confidence: 55,
    color: colHex + 'DD',
    lineLabelColor: colHex,
    lineStrokeWidth: lw,
    lineDash: '6 4',
    noProject: true,
  });

  if (args.showZigzag) {
    for (let i = 0; i < slice.length - 1; i++) {
      const a = slice[i]!;
      const b = slice[i + 1]!;
      out.push({
        id: `whale-acp-zg-${stamp}-${i}`,
        kind: 'trendLine',
        label: '',
        category: 'whaleToolkit',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: a.time,
        time2: b.time,
        price1: a.price,
        price2: b.price,
        confidence: 40,
        color: zHex + '99',
        lineLabelColor: zHex,
        lineStrokeWidth: 1,
        lineDash: '3 3',
        noProject: true,
      });
    }
  }

  if (args.showPivotLabels) {
    slice.forEach((p, i) => {
      out.push({
        id: `whale-acp-piv-${stamp}-${i}`,
        kind: 'label',
        label: String(i + 1),
        category: 'whaleToolkit',
        x1: 0.5,
        y1: 0.4,
        time1: p.time,
        price1: p.price,
        confidence: 50,
        color: '#e2e8f0',
        labelBackgroundColor: 'rgba(15,23,42,0.75)',
        labelTextColor: '#f8fafc',
      });
    });
  }

  if (args.showPatternLabel) {
    const mid = slice[Math.floor(slice.length / 2)]!;
    out.push({
      id: `whale-acp-title-${stamp}`,
      kind: 'label',
      label: name,
      category: 'whaleToolkit',
      x1: 0.5,
      y1: 0.12,
      time1: mid.time,
      price1: Math.min(pu0, pl0) + (Math.max(pu0, pl0) - Math.min(pu0, pl0)) * 0.55,
      confidence: 60,
      color: '#c4b5fd',
      labelBackgroundColor: 'rgba(76,29,149,0.88)',
      labelTextColor: '#faf5ff',
    });
    out.push({
      id: `whale-acp-tag-${stamp}`,
      kind: 'label',
      label: name,
      category: 'whaleToolkit',
      x1: 0.5,
      y1: 0.5,
      time1: tLast,
      price1: pl1,
      confidence: 55,
      color: colHex,
      labelBackgroundColor: colHex + 'CC',
      labelTextColor: '#0f172a',
    });
  }

  return out;
}

/**
 * `UserSettings`의 `whaleAcpZigzagLength` / `whaleAcpDepth` / `whaleAcpSettingsJson`을 병합한 Pine 근사 ACP 스캔.
 */
export function buildWhaleTrendoscopeAcpOverlays(candles: Candle[], settings: UserSettings): OverlayItem[] {
  const cfg = resolveWhaleAcpConfig(settings);
  const repaint = cfg.scanning.repaint === true;
  const workCandles = repaint ? candles : candles.slice(0, Math.max(0, candles.length - 1));
  const n = workCandles.length;
  if (n < 40) return [];

  const need = cfg.scanning.numberOfPivots;
  const mask = computeAllowedPatternMask(cfg);
  const lastPivotInts = computeLastPivotDirectionInts(cfg);
  const raw: AcpCand[] = [];

  for (let zi = 0; zi < 4; zi++) {
    const row = cfg.zigzag[zi]!;
    if (!row.use) continue;
    const zig = buildAlternatingZigzag(workCandles, row.length, row.depth);
    if (zig.length < need) continue;

    for (let s = 0; s <= zig.length - need; s++) {
      const slice = zig.slice(s, s + need);
      const highs = slice.filter((p) => p.isHigh);
      const lows = slice.filter((p) => !p.isHigh);
      if (highs.length < 2 || lows.length < 2) continue;

      const idxs = slice.map((p) => p.index);
      const iMin = Math.min(...idxs);
      const iMax = Math.max(...idxs);
      const prices = slice.map((p) => p.price);
      const priceMin = Math.min(...prices);
      const priceMax = Math.max(...prices);

      const pid = classifyPatternId(highs, lows, cfg.scanning.errorPct, cfg.scanning.flatPct, iMin, iMax, priceMin, priceMax);
      if (pid < 1 || pid > 13) continue;
      if (!mask[pid]) continue;

      const lpWant = lastPivotInts[pid] ?? 0;
      if (lpWant !== 0) {
        const last = slice[slice.length - 1]!;
        const lastInt = last.isHigh ? 1 : -1;
        if (lastInt !== lpWant) continue;
      }

      if (!passBarRatio(slice, cfg.scanning.checkBarRatio, cfg.scanning.barRatioLimit)) continue;

      raw.push({ zi, win: s, slice, pid, iMin, iMax });
    }
  }

  const dedup = new Map<string, AcpCand>();
  for (const c of raw) {
    const k = `${c.iMin}-${c.iMax}-${c.pid}`;
    if (!dedup.has(k)) dedup.set(k, c);
  }
  let list = [...dedup.values()];
  list.sort((a, b) => b.iMax - a.iMax);

  const maxPatterns = Math.max(1, Math.min(50, Math.floor(cfg.display.maxPatterns)));
  const picked: AcpCand[] = [];
  const keptRanges: [number, number][] = [];

  for (const c of list) {
    const r: [number, number] = [c.iMin, c.iMax];
    if (cfg.scanning.avoidOverlap) {
      let ok = true;
      for (const pr of keptRanges) {
        if (idxRangesOverlap(r, pr)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }
    picked.push(c);
    keptRanges.push(r);
    if (picked.length >= maxPatterns) break;
  }

  const disp = cfg.display;
  const drawArgs = {
    lineWidth: disp.patternLineWidth,
    zigzagHex: disp.zigzagHex,
    showZigzag: disp.showZigzag,
    showPivotLabels: disp.showPivotLabels,
    showPatternLabel: disp.showPatternLabel,
    useCustomColors: disp.useCustomColors,
    customColors: disp.customColors ?? [],
  };

  const out: OverlayItem[] = [];
  const order = cfg.display.deleteOldPatterns === false ? [...picked].sort((a, b) => a.iMin - b.iMin) : picked;
  for (const c of order) {
    out.push(...appendPatternOverlays(workCandles, drawArgs, c));
  }
  return out;
}
