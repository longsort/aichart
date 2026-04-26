import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { buildCandleAnalysisAutoFullPack } from '@/lib/candleAnalysisAutoFullPack';
import {
  buildCandleAnalysisMemoryPathOverlays,
  type CandleAnalysisPathTuning,
} from '@/lib/candleAnalysisMemoryPath';

/**
 * 캔들분석 모드 — 이미지·자료 기반 자동 오버레이 (교육용 휴리스틱, 실전 신호 아님)
 *
 * 1) 3캔들 오더블럭: G→R→G (상방) / R→G→R (하방), 마지막 봉 몸통이 가운데 봉 몸통을 장악할 때,
 *    존 = 가운데 봉 몸통(open~close).
 * 2) 2촉 장악형 오더블럭: 직전 대비 장악 캔들이 나오면 존 = 장악 **당한** 직전 봉 몸통.
 * 3) 가시 구간 VP 스타일: 저~고에 거래량을 쌓아 **매집대**(거래 많이 쌓인 가격)·**저거래대**(거래 듬성·급통과) 띠로 표시. (영문 HVP/LVP는 내부 id만 유지)
 * 4) 횡보 매물대: 롤링 구간에서 (고-저)/중가가 좁을 때 박스 구간을 A,B,… 순으로 표시.
 * 5) 매물대 상·하단 연장 띠(박스 종료~이탈 또는 최신봉), 이탈 봉에 수직 만료선.
 * 6) HVP/LVP 가격대 리테스트(↑↓)·단순 SR 전환(종가 기준) 핀 라벨.
 * 7) `candleAnalysisAutoFullPack`: 횡보/추세 배경, UTC 아시안(추정), 브로드닝, 피보, VP·미분 변곡, 시나리오 점선, 승·패(추정).
 * 8) n캔들 장악형 OB (4~10캔, 마지막 몸통이 앞 (n−1)개 몸통 전부 장악).
 */

function bodyBounds(c: Candle): { bot: number; top: number } {
  return { bot: Math.min(c.open, c.close), top: Math.max(c.open, c.close) };
}

function bodySize(c: Candle): number {
  const b = bodyBounds(c);
  return Math.max(b.top - b.bot, 0);
}

function isBull(c: Candle): boolean {
  return c.close > c.open;
}

function isBear(c: Candle): boolean {
  return c.close < c.open;
}

/** a 몸통이 b 몸통을 덮음 */
function bodyEngulfs(a: Candle, b: Candle): boolean {
  const A = bodyBounds(a);
  const B = bodyBounds(b);
  return A.bot <= B.bot && A.top >= B.top;
}

/** 자료식 n캔들 장악: 마지막 봉 몸통이 앞 (n−1)개 봉 몸통을 모두 덮음 → OB = (n−1)번째 봉 몸통 */
function bodyEngulfsAll(engulfer: Candle, victims: Candle[]): boolean {
  for (const v of victims) {
    if (!bodyEngulfs(engulfer, v)) return false;
  }
  return true;
}

function twoCandleBullEngulf(prev: Candle, cur: Candle): boolean {
  if (!isBear(prev) || !isBull(cur)) return false;
  if (!bodyEngulfs(cur, prev)) return false;
  return bodySize(cur) > bodySize(prev) * 1.005;
}

function twoCandleBearEngulf(prev: Candle, cur: Candle): boolean {
  if (!isBull(prev) || !isBear(cur)) return false;
  if (!bodyEngulfs(cur, prev)) return false;
  return bodySize(cur) > bodySize(prev) * 1.005;
}

export type AutoObKind = 'ob3-bull' | 'ob3-bear' | 'ob2-bull' | 'ob2-bear' | string;

export type DetectedAutoOb = {
  kind: AutoObKind;
  /** 오더블럭으로 쓰는 봉 인덱스 (3캔들=가운데, 2촉=장악 직전) */
  obIndex: number;
  patternEndIndex: number;
  bias: 'bullish' | 'bearish';
};

/** 최근 쪽부터 스캔해 고유 obIndex 기준 상위 max개 */
export function detectCandleAnalysisAutoOrderBlocks(candles: Candle[], opts?: { max?: number }): DetectedAutoOb[] {
  const max = Math.max(1, Math.min(16, opts?.max ?? 12));
  const n = candles.length;
  if (n < 3) return [];

  const usedOb = new Set<number>();
  const raw: DetectedAutoOb[] = [];

  for (let i = 2; i < n; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];
    if (isBull(c0) && isBear(c1) && isBull(c2) && bodyEngulfs(c2, c1)) {
      if (!usedOb.has(i - 1)) {
        usedOb.add(i - 1);
        raw.push({ kind: 'ob3-bull', obIndex: i - 1, patternEndIndex: i, bias: 'bullish' });
      }
    } else if (isBear(c0) && isBull(c1) && isBear(c2) && bodyEngulfs(c2, c1)) {
      if (!usedOb.has(i - 1)) {
        usedOb.add(i - 1);
        raw.push({ kind: 'ob3-bear', obIndex: i - 1, patternEndIndex: i, bias: 'bearish' });
      }
    }
  }

  for (let i = 1; i < n; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (twoCandleBullEngulf(prev, cur) && !usedOb.has(i - 1)) {
      usedOb.add(i - 1);
      raw.push({ kind: 'ob2-bull', obIndex: i - 1, patternEndIndex: i, bias: 'bullish' });
    } else if (twoCandleBearEngulf(prev, cur) && !usedOb.has(i - 1)) {
      usedOb.add(i - 1);
      raw.push({ kind: 'ob2-bear', obIndex: i - 1, patternEndIndex: i, bias: 'bearish' });
    }
  }

  const bodySizes = candles.map((c) => bodySize(c)).filter((x) => x > 0);
  const medBody =
    bodySizes.length === 0
      ? 0
      : [...bodySizes].sort((a, b) => a - b)[Math.floor(bodySizes.length / 2)];

  for (let e = n - 1; e >= 3; e--) {
    const obIx = e - 1;
    if (usedOb.has(obIx)) continue;
    const maxN = Math.min(10, e + 1);
    for (let nlen = maxN; nlen >= 4; nlen--) {
      const s = e - nlen + 1;
      const victims = candles.slice(s, e);
      if (victims.length !== nlen - 1) continue;
      const L = candles[e];
      if (!bodyEngulfsAll(L, victims)) continue;
      if (medBody > 0 && bodySize(L) < medBody * 0.35) continue;
      usedOb.add(obIx);
      const bull = isBull(L);
      raw.push({
        kind: `ob${nlen}-${bull ? 'bull' : 'bear'}`,
        obIndex: obIx,
        patternEndIndex: e,
        bias: bull ? 'bullish' : 'bearish',
      });
      break;
    }
  }

  raw.sort((a, b) => b.patternEndIndex - a.patternEndIndex);
  const seen = new Set<number>();
  const out: DetectedAutoOb[] = [];
  for (const x of raw) {
    if (seen.has(x.obIndex)) continue;
    seen.add(x.obIndex);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

function clamp(i: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, i));
}

export type VpLevelCenters = { hvp: number[]; lvp: number[]; halfBand: number };

/** HVP/LVP 가격 중심 — 리테스트·SR 라벨과 존 렌더 공통 */
export function computeCandleAnalysisVpLevelCenters(candles: Candle[]): VpLevelCenters | null {
  const n = candles.length;
  if (n < 24) return null;
  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of candles) {
    if (c.low < pMin) pMin = c.low;
    if (c.high > pMax) pMax = c.high;
  }
  if (!(pMax > pMin) || !(pMin > 0)) return null;

  const numBins = clamp(Math.round(n * 0.22), 36, 96);
  const step = (pMax - pMin) / numBins;
  if (!(step > 0)) return null;

  const raw = new Array<number>(numBins).fill(0);
  for (const c of candles) {
    const v = c.volume > 0 ? c.volume : 1;
    let i0 = Math.floor((c.low - pMin) / step);
    let i1 = Math.floor((c.high - pMin) / step);
    i0 = clamp(i0, 0, numBins - 1);
    i1 = clamp(i1, 0, numBins - 1);
    if (i0 > i1) [i0, i1] = [i1, i0];
    const span = i1 - i0 + 1;
    const add = v / span;
    for (let i = i0; i <= i1; i++) raw[i] += add;
  }

  const smooth = raw.map((_, i) => {
    if (i === 0 || i === numBins - 1) return raw[i];
    return (raw[i - 1] + raw[i] * 2 + raw[i + 1]) / 4;
  });

  const sum = smooth.reduce((a, b) => a + b, 0);
  const mean = sum / numBins || 1;

  const peakIdx: number[] = [];
  const valleyIdx: number[] = [];
  for (let i = 1; i < numBins - 1; i++) {
    if (smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1] && smooth[i] > mean * 1.12) peakIdx.push(i);
    if (smooth[i] <= smooth[i - 1] && smooth[i] <= smooth[i + 1] && smooth[i] < mean * 0.88) valleyIdx.push(i);
  }

  const halfBand = Math.max(step * 0.35, pMax * 1e-6);

  const pickPeaks = peakIdx
    .map((i) => ({ i, v: smooth[i] }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 10);

  const usedPeak = new Set<number>();
  const hvpBins: number[] = [];
  for (const { i } of pickPeaks) {
    if (hvpBins.length >= 5) break;
    let clash = false;
    for (const u of usedPeak) {
      if (Math.abs(i - u) <= 2) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    usedPeak.add(i);
    hvpBins.push(i);
  }

  const pickValleys = valleyIdx
    .map((i) => ({ i, v: smooth[i] }))
    .sort((a, b) => a.v - b.v)
    .slice(0, 12);

  const usedValley = new Set<number>();
  const lvpBins: number[] = [];
  for (const { i } of pickValleys) {
    if (lvpBins.length >= 4) break;
    let clash = false;
    for (const u of usedValley) {
      if (Math.abs(i - u) <= 2) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    usedValley.add(i);
    lvpBins.push(i);
  }

  hvpBins.sort((a, b) => a - b);
  lvpBins.sort((a, b) => a - b);

  const hvp = hvpBins.map((bi) => pMin + (bi + 0.5) * step);
  const lvp = lvpBins.map((bi) => pMin + (bi + 0.5) * step);
  return { hvp, lvp, halfBand };
}

function buildVpHvpLvpZonesFromCenters(vp: VpLevelCenters, t1: number, t2: number): OverlayItem[] {
  const { hvp, lvp, halfBand } = vp;
  const out: OverlayItem[] = [];

  let hRank = 0;
  for (const center of hvp) {
    hRank += 1;
    const id = `candle-analysis-auto-hvp-${Math.round(center * 1e6)}`;
    out.push({
      id,
      kind: 'zone',
      label: `매집대 ${hRank}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: center + halfBand,
      price2: center - halfBand,
      confidence: 72,
      color: 'rgba(45, 212, 191, 0.15)',
      lineLabelColor: '#2dd4bf',
      category: 'labels',
    });
  }

  let lRank = 0;
  for (const center of lvp) {
    lRank += 1;
    const id = `candle-analysis-auto-lvp-${Math.round(center * 1e6)}`;
    out.push({
      id,
      kind: 'zone',
      label: `저거래·급통과 ${lRank}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: center + halfBand,
      price2: center - halfBand,
      confidence: 70,
      color: 'rgba(167, 139, 250, 0.13)',
      lineLabelColor: '#c4b5fd',
      category: 'labels',
    });
  }

  return out;
}

function atrLike(candles: Candle[], look = 14): number {
  const n = candles.length;
  if (n < 2) return 0;
  const from = Math.max(1, n - look);
  let sum = 0;
  let c = 0;
  for (let i = from; i < n; i++) {
    const prev = candles[i - 1];
    const cu = candles[i];
    const tr = Math.max(cu.high - cu.low, Math.abs(cu.high - prev.close), Math.abs(cu.low - prev.close));
    sum += tr;
    c++;
  }
  if (c <= 0) return Math.max(candles[n - 1].high - candles[n - 1].low, 1e-12);
  return Math.max(sum / c, 1e-12);
}

function mergeNearbyLevels(levels: number[], minSep: number): number[] {
  if (levels.length === 0) return [];
  const s = [...levels].sort((a, b) => a - b);
  const out: number[] = [s[0]];
  for (let i = 1; i < s.length; i++) {
    if (s[i] - out[out.length - 1] >= minSep) out.push(s[i]);
  }
  return out;
}

/** HVP/LVP 근처 종가·저고가 리테스트 + 단순 SR 플립(교육용) */
function buildVpTouchAndSrLabels(candles: Candle[], vp: VpLevelCenters): OverlayItem[] {
  const n = candles.length;
  if (n < 8) return [];
  const atr = atrLike(candles);
  const merged = mergeNearbyLevels([...vp.hvp, ...vp.lvp], Math.max(vp.halfBand * 2.2, atr * 0.35));
  if (merged.length === 0) return [];

  type Mark = { t: number; price: number; label: string; color: string; id: string };
  const marks: Mark[] = [];

  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const t = c.time as number;
    for (const level of merged) {
      const d = Math.max(level * 1.15e-4, atr * 0.11, vp.halfBand * 0.9);
      const touchedLow = c.low <= level + d && c.low >= level - d * 1.35;
      const touchedHigh = c.high >= level - d && c.high <= level + d * 1.35;
      const nearPrev = Math.abs(prev.close - level) < d * 3.5;
      const lr = Math.round(level * 1e6);

      if (nearPrev && prev.close < level && c.close > level + d * 0.08) {
        marks.push({
          t,
          price: level,
          label: 'SR·지지전환',
          color: 'rgba(96, 165, 250, 0.95)',
          id: `candle-analysis-auto-srflip-up-${t}-${lr}`,
        });
      } else if (nearPrev && prev.close > level && c.close < level - d * 0.08) {
        marks.push({
          t,
          price: level,
          label: 'SR·저항전환',
          color: 'rgba(251, 191, 36, 0.95)',
          id: `candle-analysis-auto-srflip-dn-${t}-${lr}`,
        });
      } else if (touchedLow && c.close > level + d * 0.12) {
        marks.push({
          t,
          price: Math.min(c.low, level) * (1 - 2e-5),
          label: '리테스트↑',
          color: 'rgba(74, 222, 128, 0.95)',
          id: `candle-analysis-auto-touch-up-${t}-${lr}`,
        });
      } else if (touchedHigh && c.close < level - d * 0.12) {
        marks.push({
          t,
          price: Math.max(c.high, level) * (1 + 2e-5),
          label: '리테스트↓',
          color: 'rgba(248, 113, 113, 0.95)',
          id: `candle-analysis-auto-touch-dn-${t}-${lr}`,
        });
      }
    }
  }

  marks.sort((a, b) => b.t - a.t);
  const seen = new Set<string>();
  const dedup: Mark[] = [];
  for (const m of marks) {
    const key = `${m.t}|${m.label}|${Math.round(m.price * 1e6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(m);
    if (dedup.length >= 14) break;
  }

  return dedup.map((m) => ({
    id: m.id,
    kind: 'label' as const,
    label: m.label,
    x1: 0,
    y1: 0,
    time1: m.t,
    price1: m.price,
    confidence: 66,
    color: m.color,
    labelBackgroundColor: 'rgba(8,15,25,0.72)',
    category: 'labels' as const,
  }));
}

type TightWin = { s: number; e: number; hi: number; lo: number; ratio: number };

function detectTightConsolidationWindows(candles: Candle[]): TightWin[] {
  const n = candles.length;
  if (n < 28) return [];
  const w = clamp(Math.floor(n / 9), 14, 44);
  const wins: TightWin[] = [];
  for (let e = w - 1; e < n; e++) {
    const s = e - w + 1;
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = s; i <= e; i++) {
      if (candles[i].high > hi) hi = candles[i].high;
      if (candles[i].low < lo) lo = candles[i].low;
    }
    const mid = (hi + lo) / 2;
    if (!(mid > 0)) continue;
    const ratio = (hi - lo) / mid;
    if (ratio > 0.032) continue;
    wins.push({ s, e, hi, lo, ratio });
  }
  wins.sort((a, b) => a.ratio - b.ratio || a.s - b.s);
  const picked: TightWin[] = [];
  for (const x of wins) {
    if (picked.length >= 4) break;
    const overlap = picked.some((p) => !(x.e < p.s || x.s > p.e));
    if (overlap) continue;
    picked.push(x);
  }
  picked.sort((a, b) => a.s - b.s || a.e - b.e);
  return picked;
}

function findVzoneBreakIndex(candles: Candle[], z: TightWin, pad: number): number | null {
  const hi = z.hi + pad;
  const lo = z.lo - pad;
  for (let j = z.e + 1; j < candles.length; j++) {
    const c = candles[j];
    if (c.close > hi || c.close < lo) return j;
  }
  return null;
}

/** 매물대 박스 + 상·하단 연장 띠 + 이탈 시 수직 만료선 */
function buildVolumeZonePackage(candles: Candle[]): OverlayItem[] {
  const picked = detectTightConsolidationWindows(candles);
  if (!picked.length) return [];
  const n = candles.length;
  const tEnd = candles[n - 1].time as number;
  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of candles) {
    if (c.low < pMin) pMin = c.low;
    if (c.high > pMax) pMax = c.high;
  }
  if (!(pMax > pMin)) return [];

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const out: OverlayItem[] = [];
  let k = 0;
  for (const z of picked) {
    const letter = letters[k] ?? String(k + 1);
    k += 1;
    const tA = candles[z.s].time as number;
    const tB = candles[z.e].time as number;
    const pad = Math.max((z.hi - z.lo) * 0.04, z.hi * 1e-5);
    const idBox = `candle-analysis-auto-vzone-${tA}-${tB}`;
    out.push({
      id: idBox,
      kind: 'zone',
      label: `매물대 ${letter}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tA,
      time2: tB,
      price1: z.hi + pad,
      price2: z.lo - pad,
      confidence: Math.round(88 - z.ratio * 900),
      color: 'rgba(251, 176, 71, 0.11)',
      lineLabelColor: '#fb923c',
      category: 'labels',
    });

    const brIdx = findVzoneBreakIndex(candles, z, pad);
    const tExt2 = brIdx != null ? (candles[brIdx].time as number) : tEnd;
    const thin = Math.max((z.hi - z.lo) * 0.06, z.hi * 1e-5);

    out.push({
      id: `candle-analysis-auto-vzone-ext-${tA}-${tB}-hi`,
      kind: 'zone',
      label: `${letter}·상단연장`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tB,
      time2: tExt2,
      price1: z.hi + thin * 0.45,
      price2: z.hi - thin * 0.45,
      confidence: 62,
      color: 'rgba(251, 176, 71, 0.07)',
      lineLabelColor: '#fdba74',
      category: 'labels',
    });
    out.push({
      id: `candle-analysis-auto-vzone-ext-${tA}-${tB}-lo`,
      kind: 'zone',
      label: `${letter}·하단연장`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tB,
      time2: tExt2,
      price1: z.lo + thin * 0.45,
      price2: z.lo - thin * 0.45,
      confidence: 62,
      color: 'rgba(251, 176, 71, 0.07)',
      lineLabelColor: '#fdba74',
      category: 'labels',
    });

    if (brIdx != null) {
      const tx = candles[brIdx].time as number;
      out.push({
        id: `candle-analysis-auto-vzone-expiry-${tA}-${tB}`,
        kind: 'trendLine',
        label: '매물대 만료',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: tx,
        time2: tx,
        price1: pMax * 1.002,
        price2: pMin * 0.998,
        confidence: 58,
        color: 'rgba(148, 163, 184, 0.55)',
        lineLabelColor: '#94a3b8',
        lineDash: '4 6',
        lineStrokeWidth: 1.1,
        category: 'labels',
        noProject: true,
      });
    }
  }
  return out;
}

function fmtCommentaryPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return p.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** 차트 번호 ①..⑫ (상단 가격부터 순번과 맞춤) */
function circledObIndex(n: number): string {
  if (n >= 1 && n <= 12) return String.fromCodePoint(0x2460 + (n - 1));
  return String(n);
}

type ObZoneRow = { id: string; mid: number; lo: number; hi: number; bull: boolean; label: string };

function collectAutoObRows(overlays: OverlayItem[]): ObZoneRow[] {
  const rows: ObZoneRow[] = [];
  for (const o of overlays) {
    const id = String(o.id || '');
    if (!id.startsWith('candle-analysis-auto-ob-') || o.kind !== 'zone') continue;
    if (typeof o.price1 !== 'number' || typeof o.price2 !== 'number') continue;
    const hi = Math.max(o.price1, o.price2);
    const lo = Math.min(o.price1, o.price2);
    const mid = (hi + lo) / 2;
    const lb = String(o.label || '');
    const bull = lb.includes('롱') || lb.includes('수요');
    rows.push({ id, mid, lo, hi, bull, label: lb });
  }
  return rows;
}

/** 종가 기준 “애널리스트 메모” 스타일 통합 문장(규칙 기반, 비 LLM) */
export function deriveCandleAnalysisObNarrative(overlays: OverlayItem[], lastClose: number): string[] {
  const rows = collectAutoObRows(overlays);
  if (!rows.length || !(lastClose > 0)) return [];

  const above = rows.filter((r) => r.mid > lastClose);
  const below = rows.filter((r) => r.mid < lastClose);
  const nearestAbove = above.length ? [...above].sort((a, b) => a.mid - b.mid)[0] : null;
  const nearestBelow = below.length ? [...below].sort((a, b) => b.mid - a.mid)[0] : null;

  const inBand = rows.filter((r) => {
    const d = Math.abs(r.mid - lastClose) / lastClose;
    return d <= 0.02;
  });
  const bullN = rows.filter((r) => r.bull).length;
  const bearN = rows.length - bullN;

  const lines: string[] = [];
  lines.push(
    `통합 해석: 종가 ${fmtCommentaryPrice(lastClose)} 기준 자동 OB 후보 ${rows.length}개(수요 성격 ${bullN}·공급 성격 ${bearN}). 초록·빨강 박스가 한 좁은 구간에 겹치면, 단기로는 방향보다 **가격이 어느 쪽 박스를 먼저 이탈하는지**를 보는 편이 단순합니다.`
  );

  if (nearestAbove || nearestBelow) {
    const parts: string[] = [];
    if (nearestAbove) {
      parts.push(
        `위쪽 가장 가까운 존 중심 ~${fmtCommentaryPrice(nearestAbove.mid)} (${nearestAbove.bull ? '수요' : '공급'} 성격)`
      );
    }
    if (nearestBelow) {
      parts.push(
        `아래쪽 ~${fmtCommentaryPrice(nearestBelow.mid)} (${nearestBelow.bull ? '수요' : '공급'} 성격)`
      );
    }
    lines.push(`인접 관심: ${parts.join(', ')}.`);
  }

  if (inBand.length >= 3) {
    lines.push(
      `종가 ±2% 안에 존이 ${inBand.length}개 몰려 있어 우측 눈금이 복잡해 보일 수 있습니다. 차트에는 수요①·지지·공급②·저항 형태로만 짧게 표시합니다.`
    );
  } else {
    lines.push(
      '차트의 짧은 라벨(수요①·지지 / 공급②·저항)은 위에서 아래로 갈수록 번호가 매겨집니다. 긴 설명은 해설 패널 또는 존에 마우스를 올려 확인하세요.'
    );
  }

  lines.push('(규칙 기반 자동 문장 · 교육용이며 매매 권유가 아닙니다.)');
  return lines;
}

/** 해설용 — 차트 번호와 동일 순서(고가→저가) 상세 줄 */
function deriveCandleAnalysisObDetailBullets(overlays: OverlayItem[]): string[] {
  const rows = collectAutoObRows(overlays);
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => b.mid - a.mid);
  return sorted.map((r, i) => {
    const circ = circledObIndex(i + 1);
    const kind = r.bull ? '수요' : '공급';
    return `${circ} ${kind} — ${r.label} · 중심 ~${fmtCommentaryPrice(r.mid)}`;
  });
}

function applyCompactObChartLabels(obZones: OverlayItem[]): OverlayItem[] {
  const rows = collectAutoObRows(obZones);
  if (!rows.length) return obZones;
  const sorted = [...rows].sort((a, b) => b.mid - a.mid);
  const rank = new Map<string, number>();
  sorted.forEach((r, i) => rank.set(r.id, i + 1));
  return obZones.map((o) => {
    const id = String(o.id || '');
    if (!id.startsWith('candle-analysis-auto-ob-')) return o;
    const k = rank.get(id);
    if (k == null) return o;
    const circ = circledObIndex(k);
    const lb = String(o.label || '');
    const bull = lb.includes('롱') || lb.includes('수요');
    const shortL = bull ? `수요${circ}·지지` : `공급${circ}·저항`;
    return { ...o, labelTooltip: lb, label: shortL };
  });
}

/** 전체 리스트에서 자동 OB만 짧은 라벨로 바꿈(차트전부 모드에서도 우측 눈금 정리) */
function allOverlaysWithCompactAutoObLabels(all: OverlayItem[]): OverlayItem[] {
  const obOnly = all.filter((o) => String(o.id || '').startsWith('candle-analysis-auto-ob-'));
  if (!obOnly.length) return all;
  const compacted = applyCompactObChartLabels(obOnly);
  const m = new Map(compacted.map((o) => [o.id, o]));
  return all.map((o) => m.get(o.id) ?? o);
}

function deriveEngineBiasAndDirectionLines(
  analysis: AnalyzeResponse | null | undefined,
  ctx?: { lastClose: number; overlays: OverlayItem[] }
): string[] {
  const lines: string[] = [];
  lines.push(
    '작도 안내: 캔들·존·FVG·추세선 등 차트에 그려지는 것은 분석 엔진(규칙) 출력입니다. OpenAI 등 API는 해설의 「AI」버튼을 켰을 때 **텍스트 요약**에만 쓰이며, 캔들 위에 선·박스를 그리지 않습니다.'
  );
  lines.push(
    '보라·청록 점선: **보라(3단)**은 되돌림→돌파→목표 참고 시나리오, **더 옅은 보라 한 줄**은 현재가→목표 **직진**(헤더 「직진」). **청록**은 유사 과거 평균 궤적입니다. 「핵심」 뷰에서 그립니다. 기울기는 이론·유사경로 스티픈으로 조절합니다.'
  );
  if (ctx && ctx.lastClose > 0) {
    lines.push(
      '우측 눈금 **수요·공급**: 수요(초록)=매수·**지지** 성격의 존, 공급(빨강)=매도·**저항** 성격의 존입니다. 종가 **아래**에 있는 초록은 가격이 내려올 때 받침 후보, **위**에 있는 초록은 반등 시 **저항·되돌림** 관심대가 되는 경우가 많습니다. 라벨은 방향 예측이 아니라 **구간 성격** 표시입니다.'
    );
    const rows = collectAutoObRows(ctx.overlays);
    const inDemand = rows.some((r) => r.bull && ctx.lastClose >= r.lo && ctx.lastClose <= r.hi);
    const so = analysis?.smartOverlay;
    if (so && (Number.isFinite(Number(so.prob_long)) || Number.isFinite(Number(so.prob_short)))) {
      const pl = Math.round(Number(so.prob_long) || 0);
      lines.push(
        `지지(하향 시 버팀) **참고치**: 엔진 롱 비중 **약 ${pl}%** — 통계적 “지지 확률”이 아니라 엔진이 본 맥락 가늠치입니다.${inDemand ? ' 종가가 수요 존 안에 있어 지지대 위에서 거래 중인 상태로 볼 수 있습니다.' : ''}`
      );
    } else {
      lines.push(
        '지지 참고 %: 엔진 smartOverlay(롱·숏 비중)가 붙으면 그 롱 비중을 참고치로 표시합니다. 없으면 패널 verdict만으로는 숫자를 만들지 않습니다.'
      );
    }
  }
  if (!analysis) return lines;
  const so = analysis.smartOverlay;
  if (so) {
    const pl = Math.round(Number(so.prob_long) || 0);
    const ps = Math.round(Number(so.prob_short) || 0);
    const lean =
      pl > ps + 8 ? '롱 맥락이 더 큼' : ps > pl + 8 ? '숏 맥락이 더 큼' : '롱·숏 엇비슷(중립에 가까움)';
    lines.push(`방향(엔진 참고·확정 아님): ${so.status} — 비중 롱 ${pl}% · 숏 ${ps}% → ${lean}.`);
    if (so.support_zone && so.support_zone.length === 2) {
      const a = so.support_zone[0];
      const b = so.support_zone[1];
      lines.push(
        `엔진 지지·안착 맥락: ${fmtCommentaryPrice(Math.min(a, b))} ~ ${fmtCommentaryPrice(Math.max(a, b))}.`
      );
    }
    if (so.resist_zone && so.resist_zone.length === 2) {
      const a = so.resist_zone[0];
      const b = so.resist_zone[1];
      lines.push(
        `엔진 상단 저항 맥락: ${fmtCommentaryPrice(Math.min(a, b))} ~ ${fmtCommentaryPrice(Math.max(a, b))}.`
      );
    }
  } else {
    const v = analysis.verdict;
    if (v === 'LONG') {
      lines.push('방향(패널 verdict·참고): 롱 편향으로 분류된 상태입니다. (자동 OB 색만으로 방향이 확정된 것은 아닙니다.)');
    } else if (v === 'SHORT') {
      lines.push('방향(패널 verdict·참고): 숏 편향으로 분류된 상태입니다.');
    } else {
      lines.push(`방향(패널 verdict·참고): ${v === 'WATCH' ? '관망·경계' : String(v)} 구간으로 분류된 상태입니다.`);
    }
  }
  return lines;
}

/** 자동 OB만으로 종가 아래 지지·위쪽 저항 후보를 한 줄씩 정리 */
function deriveAutoObSupportResistanceLines(overlays: OverlayItem[], lastClose: number): string[] {
  const rows = collectAutoObRows(overlays);
  if (!rows.length || !(lastClose > 0)) return [];
  const lines: string[] = [];
  lines.push('— 지지·저항(자동 OB 기준·교육용) —');

  const supp = rows.filter((r) => r.bull && r.mid < lastClose).sort((a, b) => b.mid - a.mid);
  const resistBear = rows.filter((r) => !r.bull && r.mid > lastClose).sort((a, b) => a.mid - b.mid);
  const overheadDem = rows.filter((r) => r.bull && r.mid > lastClose).sort((a, b) => a.mid - b.mid);

  if (supp.length) {
    const fmt = supp.slice(0, 5).map((r) => fmtCommentaryPrice(r.mid));
    lines.push(`▼ 내려올 때 지지 후보(수요 존 중심, 가까운 순): ${fmt.join(' → ')}.`);
  } else {
    lines.push('▼ 종가 아래쪽 자동 수요 OB가 거의 없거나 종가와 겹칩니다.');
  }

  if (resistBear.length) {
    const fmt = resistBear.slice(0, 5).map((r) => fmtCommentaryPrice(r.mid));
    lines.push(`▲ 올라갈 때 저항 후보(공급 존 중심, 가까운 순): ${fmt.join(' → ')}.`);
  } else {
    lines.push('▲ 종가 위쪽 자동 공급 OB가 거의 없습니다.');
  }

  if (overheadDem.length) {
    const fmt = overheadDem.slice(0, 4).map((r) => fmtCommentaryPrice(r.mid));
    lines.push(
      `▲ 종가보다 위의 초록(수요) 박스는 “아래 지지”가 아니라, 미회복 시 **되돌림·저항 관심대**로 보는 경우가 많습니다: ${fmt.join(', ')}.`
    );
  }

  return lines;
}

function buildCandleAnalysisAutoCommentary(
  all: OverlayItem[],
  lastClose: number,
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[],
  timeframe: string,
  attachMemoryPathCommentary: boolean,
  pathTuning?: CandleAnalysisPathTuning
): string[] {
  const head = deriveEngineBiasAndDirectionLines(analysis, { lastClose, overlays: all });
  if (attachMemoryPathCommentary && candles.length > 0) {
    const mem = buildCandleAnalysisMemoryPathOverlays(candles, timeframe, analysis ?? null, pathTuning);
    if (mem.commentaryLine) head.splice(2, 0, mem.commentaryLine);
  }
  head.push(...deriveAutoObSupportResistanceLines(all, lastClose));
  const obStory = deriveCandleAnalysisObNarrative(all, lastClose);
  const obBullets = deriveCandleAnalysisObDetailBullets(all);
  const rest = deriveCandleAnalysisAutoCommentaryLines(all);
  const out: string[] = [...head, ...obStory];
  if (obBullets.length) {
    out.push('— 차트 번호와 대응하는 OB 상세 —');
    out.push(...obBullets);
  }
  out.push(...rest);
  return out;
}

function midOverlayPrice(o: OverlayItem): number | null {
  if (typeof o.price1 === 'number' && typeof o.price2 === 'number') return (o.price1 + o.price2) / 2;
  if (typeof o.price1 === 'number') return o.price1;
  return null;
}

/** 자동 오버레이 전체를 읽어 해설용 한 줄 요약(차트에 안 그릴 때 사용) */
export function deriveCandleAnalysisAutoCommentaryLines(overlays: OverlayItem[]): string[] {
  const hvp: string[] = [];
  const lvp: string[] = [];
  const vz = new Set<string>();
  const cycle = new Set<string>();
  const asian = new Set<string>();
  const mega: string[] = [];
  const fib: string[] = [];
  const vpderiv: string[] = [];
  const pins: string[] = [];
  let hasScen = false;

  for (const o of overlays) {
    const id = String(o.id || '');
    if (!id.startsWith('candle-analysis-auto-')) continue;
    if (id.startsWith('candle-analysis-auto-ob-')) continue;

    if (o.kind === 'zone') {
      if (id.startsWith('candle-analysis-auto-hvp-')) {
        const m = midOverlayPrice(o);
        if (m != null) hvp.push(fmtCommentaryPrice(m));
      } else if (id.startsWith('candle-analysis-auto-lvp-')) {
        const m = midOverlayPrice(o);
        if (m != null) lvp.push(fmtCommentaryPrice(m));
      } else if (id.startsWith('candle-analysis-auto-vzone-')) {
        const m = midOverlayPrice(o);
        const lb = String(o.label || '').trim();
        vz.add(m != null && lb ? `${lb} (~${fmtCommentaryPrice(m)})` : lb || '매물대');
      } else if (id.startsWith('candle-analysis-auto-cycle-')) {
        cycle.add(String(o.label || '').trim());
      } else if (id.startsWith('candle-analysis-auto-asian-')) {
        asian.add(String(o.label || '').trim());
      } else if (id.startsWith('candle-analysis-auto-megaphone-')) {
        const m = midOverlayPrice(o);
        mega.push(m != null ? `${o.label} (중심 ~${fmtCommentaryPrice(m)})` : String(o.label || ''));
      } else if (id.startsWith('candle-analysis-auto-fib-')) {
        const m = midOverlayPrice(o);
        fib.push(m != null ? `${o.label} · ${fmtCommentaryPrice(m)}` : String(o.label || ''));
      } else if (id.startsWith('candle-analysis-auto-vpderiv-')) {
        const m = midOverlayPrice(o);
        if (m != null) vpderiv.push(fmtCommentaryPrice(m));
      }
    } else if (o.kind === 'label') {
      const p = typeof o.price1 === 'number' ? fmtCommentaryPrice(o.price1) : '';
      pins.push(p ? `${o.label} @ ${p}` : String(o.label || ''));
    } else if (o.kind === 'trendLine' && id.startsWith('candle-analysis-auto-scen-')) {
      hasScen = true;
    }
  }

  const lines: string[] = [];
  if (hvp.length) lines.push(`매집대(거래 집중가): ${[...new Set(hvp)].join(', ')}`);
  if (lvp.length) lines.push(`저거래·급통과: ${[...new Set(lvp)].join(', ')}`);
  if (vz.size) lines.push(`횡보·매물대: ${[...vz].join(' · ')}`);
  if (cycle.size) lines.push(`사이클(추정): ${[...cycle].join(', ')}`);
  if (asian.size) lines.push(`아시안 구간(UTC·추정): ${asian.size}일`);
  if (mega.length) lines.push(`브로드닝·확장: ${mega.slice(-3).join(' / ')}`);
  if (fib.length) lines.push(`피보 되돌림: ${fib.join(' · ')}`);
  if (vpderiv.length) lines.push(`거래·변곡(미분피크): ${[...new Set(vpderiv)].join(', ')}`);
  if (hasScen) lines.push('시나리오: 돌파↑ → 리테·휩소·이탈↓ 점선 참고(차트에 전부 켜면 복잡해질 수 있음).');
  if (pins.length) lines.push(`터치·SR·승패 핀: ${pins.slice(-12).join(' · ')}`);
  if (!lines.length) lines.push('자동 분석 요약: 이번 구간에서 OB 외 패턴이 거의 잡히지 않았습니다.');
  return lines;
}

/** 전체 자동 레이어 빌드(내부) */
function buildAllCandleAnalysisAutoOverlays(
  candles: Candle[],
  _analysis: AnalyzeResponse | null | undefined,
  _timeframe: string
): OverlayItem[] {
  if (candles.length < 3) return [];
  const tEnd = candles[candles.length - 1].time as number;
  const tStart = candles[0].time as number;
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const detected = detectCandleAnalysisAutoOrderBlocks(candles, { max: 12 });
  const out: OverlayItem[] = [];

  for (const d of detected) {
    const c = candles[d.obIndex];
    const { bot, top } = bodyBounds(c);
    if (!(top > bot) || !(bot > 0)) continue;
    const t1 = c.time as number;
    const pad = Math.max(top * 2e-5, 1e-8);
    const zHi = top + pad;
    const zLo = bot - pad;
    const id = `candle-analysis-auto-ob-${t1}-${d.kind}`;
    const obNumMatch = /^ob(\d+)-(bull|bear)$/.exec(d.kind);
    let nOb = obNumMatch ? parseInt(obNumMatch[1], 10) : 0;
    if (nOb === 0 && d.kind.startsWith('ob3')) nOb = 3;
    if (nOb === 0 && d.kind.startsWith('ob2')) nOb = 2;
    const isBull = d.bias === 'bullish';
    /**
     * "롱·지지" = 패턴이 **상승(수요) 쪽 OB**라는 뜻이지, 항상 현재가 아래 지지는 아님.
     * 현재가가 존 아래면 존은 **위에 있음** → 반등 시 저항·되돌림 관심 구간으로 표기.
     */
    /** 종가 대비 존의 가격대: 존이 종가보다 높으면 위쪽, 낮으면 아래쪽(차트 Y와 동일) */
    const relToLast =
      lastClose > 0
        ? lastClose > zHi
          ? '·종가아래존'
          : lastClose < zLo
            ? '·종가위존'
            : '·종가존내'
        : '';
    /** 롱(수요) / 숏(공급) 패턴명 + 현재가 대존 위치. 3캔·n캔 장악은 채도↑, 2촉 장악은 옅게 */
    let color: string;
    let lineLabelColor: string;
    let label: string;
    let conf: number;
    if (nOb >= 4 && isBull) {
      color = 'rgba(5, 150, 105, 0.23)';
      lineLabelColor = '#059669';
      label = `OB·${nOb}캔·롱·수요${relToLast}`;
      conf = 82;
    } else if (nOb >= 4 && !isBull) {
      color = 'rgba(225, 29, 72, 0.21)';
      lineLabelColor = '#e11d48';
      label = `OB·${nOb}캔·숏·공급${relToLast}`;
      conf = 82;
    } else if (nOb === 3 && isBull) {
      color = 'rgba(16, 185, 129, 0.24)';
      lineLabelColor = '#10b981';
      label = `OB·3캔·롱·수요${relToLast}`;
      conf = 81;
    } else if (nOb === 3 && !isBull) {
      color = 'rgba(244, 63, 94, 0.22)';
      lineLabelColor = '#fb7185';
      label = `OB·3캔·숏·공급${relToLast}`;
      conf = 81;
    } else if (isBull) {
      color = 'rgba(52, 211, 153, 0.18)';
      lineLabelColor = '#34d399';
      label = `OB·장악·롱·수요${relToLast}`;
      conf = 78;
    } else {
      color = 'rgba(251, 113, 133, 0.18)';
      lineLabelColor = '#f472b6';
      label = `OB·장악·숏·공급${relToLast}`;
      conf = 78;
    }

    out.push({
      id,
      kind: 'zone',
      label,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: tEnd,
      price1: top + pad,
      price2: bot - pad,
      confidence: conf,
      color,
      lineLabelColor,
      category: 'labels',
    });
  }

  const vp = computeCandleAnalysisVpLevelCenters(candles);
  const vpPrices = vp ? [...vp.hvp, ...vp.lvp] : null;
  if (vp) {
    out.push(...buildVpHvpLvpZonesFromCenters(vp, tStart, tEnd));
    out.push(...buildVpTouchAndSrLabels(candles, vp));
  }
  out.push(...buildVolumeZonePackage(candles));
  out.push(...buildCandleAnalysisAutoFullPack(candles, _analysis, _timeframe, vpPrices));

  return out;
}

/**
 * chartMinimal=true(기본 권장): 차트에는 OB 존만, 나머지 자동 분석은 derive → 해설 패널.
 */
export function splitCandleAnalysisAutoOverlays(
  candles: Candle[],
  analysis: AnalyzeResponse | null | undefined,
  timeframe: string,
  chartMinimal: boolean,
  opts?: { attachMemoryPathCommentary?: boolean; pathTuning?: CandleAnalysisPathTuning }
): { chartOverlays: OverlayItem[]; commentaryLines: string[] } {
  const all = buildAllCandleAnalysisAutoOverlays(candles, analysis, timeframe);
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const commentaryLines = buildCandleAnalysisAutoCommentary(
    all,
    lastClose,
    analysis ?? null,
    candles,
    timeframe,
    opts?.attachMemoryPathCommentary === true,
    opts?.pathTuning
  );
  const allChart = allOverlaysWithCompactAutoObLabels(all);
  if (!chartMinimal) {
    return { chartOverlays: allChart, commentaryLines };
  }
  const chartOverlays = allChart.filter((o) => String(o.id || '').startsWith('candle-analysis-auto-ob-'));
  return { chartOverlays, commentaryLines };
}

/**
 * 캔들분석 차트용 자동 존 — opts.chartMinimal=false 일 때만 전부 차트에 그림.
 */
export function buildCandleAnalysisAutoOverlays(
  candles: Candle[],
  analysis: AnalyzeResponse | null | undefined,
  timeframe: string,
  opts?: { chartMinimal?: boolean }
): OverlayItem[] {
  const chartMinimal = opts?.chartMinimal !== false;
  return splitCandleAnalysisAutoOverlays(candles, analysis, timeframe, chartMinimal).chartOverlays;
}
