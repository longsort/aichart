/**
 * 통합·분석 — 차트 가시 구간 핵심 zone (지지·반등 / 저항·거부).
 * Strike E/SL/TP 외 과거·중간 스윙 구간을 TF별로 표시. 조건부 참고용.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import {
  mergedAnalysisChartZoneTimesSnapped,
  mergedWorkCandles,
  MERGED_ARES_ZONE_CAPTION_CLASS,
  mergedZoneNumberedLabel,
} from '@/lib/mergedAnalysisOverlayTimes';
import { mergedDevelopingBar } from '@/lib/mergedAnalysisLeadingBar';
import { isMergedDeskChartTimeframe } from '@/lib/mergedDesk4hReference';

function keyZoneSourceCandles(candles: Candle[], timeframe: string): Candle[] {
  return mergedWorkCandles(candles, timeframe);
}

export type MergedKeyZonePattern =
  | 'support_bounce'
  | 'resist_reject'
  | 'double_support'
  | 'double_resist'
  | 'decline_bounce'
  | 'rally_reject';

export type MergedKeyZone = {
  id: string;
  kind: 'demand' | 'supply';
  pattern: MergedKeyZonePattern;
  price: number;
  top: number;
  bot: number;
  time1: number;
  time2: number;
  score: number;
  labelKo: string;
  bouncePct: number;
};

type PivotCfg = {
  left: number;
  right: number;
  confirmBars: number;
  maxZones: number;
  minBounceAtr: number;
};

/** 4h 참조 pivot — 통합분석 전 TF 동일 */
const MERGED_DESK_4H_KEY_PIVOT: PivotCfg = {
  left: 5,
  right: 5,
  confirmBars: 6,
  maxZones: 6,
  minBounceAtr: 0.48,
};

function pivotCfg(timeframe: string): PivotCfg {
  if (isMergedDeskChartTimeframe(timeframe)) return MERGED_DESK_4H_KEY_PIVOT;
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, PivotCfg> = {
    '1m': { left: 3, right: 3, confirmBars: 12, maxZones: 6, minBounceAtr: 0.45 },
    '3m': { left: 3, right: 3, confirmBars: 10, maxZones: 6, minBounceAtr: 0.48 },
    '5m': { left: 3, right: 3, confirmBars: 10, maxZones: 6, minBounceAtr: 0.5 },
    '15m': { left: 4, right: 4, confirmBars: 8, maxZones: 5, minBounceAtr: 0.52 },
    '1h': { left: 5, right: 5, confirmBars: 7, maxZones: 5, minBounceAtr: 0.55 },
    '4h': MERGED_DESK_4H_KEY_PIVOT,
    '1d': { left: 6, right: 6, confirmBars: 5, maxZones: 4, minBounceAtr: 0.6 },
    '1w': { left: 4, right: 4, confirmBars: 4, maxZones: 3, minBounceAtr: 0.62 },
    '1M': { left: 3, right: 3, confirmBars: 3, maxZones: 3, minBounceAtr: 0.65 },
  };
  return map[tf] ?? map['1h']!;
}

function pivotLow(candles: Candle[], i: number, L: number, R: number): boolean {
  const lo = candles[i]!.low;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.low <= lo) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.low < lo) return false;
  }
  return true;
}

function pivotHigh(candles: Candle[], i: number, L: number, R: number): boolean {
  const hi = candles[i]!.high;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.high >= hi) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.high > hi) return false;
  }
  return true;
}

function estimateAtr(candles: Candle[], endIdx: number, period = 14): number {
  const start = Math.max(1, endIdx - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIdx; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!.close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
    n++;
  }
  return n > 0 ? sum / n : Math.abs(candles[endIdx]?.close ?? 1) * 0.01;
}

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(0);
  if (a >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function wickRejectSupport(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  const lower = Math.min(c.open, c.close) - c.low;
  return lower > body * 1.05 && lower > (c.high - c.low) * 0.38;
}

function wickRejectResist(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  const upper = c.high - Math.max(c.open, c.close);
  return upper > body * 1.05 && upper > (c.high - c.low) * 0.38;
}

function mergeNearby(zones: MergedKeyZone[], atr: number): MergedKeyZone[] {
  const tol = atr * 0.55;
  const sorted = [...zones].sort((a, b) => b.score - a.score);
  const out: MergedKeyZone[] = [];
  for (const z of sorted) {
    if (out.some((o) => o.kind === z.kind && Math.abs(o.price - z.price) <= tol)) continue;
    out.push(z);
  }
  return out;
}

/** 최근 N봉 — 피벗 확정 전 하락 후 반등·급등 후 되돌림 (가시 구간 하단/상단) */
function detectRecentSwingReactionZones(
  source: Candle[],
  timeframe: string,
  cfg: PivotCfg
): MergedKeyZone[] {
  const n = source.length;
  if (n < 24) return [];

  // 4h 참조 tail — 전 TF 동일 (55)
  const tailBars = 55;
  const start = Math.max(cfg.left + 2, n - tailBars);
  const atr = estimateAtr(source, n - 1);
  if (!(atr > 0)) return [];

  const tEnd = Number(source[n - 1]!.time);
  const out: MergedKeyZone[] = [];

  /** 하락 후 반등 — tail 구간 최저 + 이후 반등폭 */
  let minIdx = start;
  let minLow = Infinity;
  for (let i = start; i < n; i++) {
    const lo = source[i]!.low;
    if (lo < minLow) {
      minLow = lo;
      minIdx = i;
    }
  }

  if (Number.isFinite(minLow) && minIdx < n - 1) {
    let bounceHigh = minLow;
    for (let j = minIdx; j < n; j++) bounceHigh = Math.max(bounceHigh, source[j]!.high);
    const bounce = bounceHigh - minLow;
    const priorIdx = Math.max(0, minIdx - Math.max(6, cfg.left + 2));
    const priorHigh = Math.max(...source.slice(priorIdx, minIdx + 1).map((c) => c.high));
    const hadDecline = priorHigh - minLow >= atr * 0.55;
    const minBounce = atr * Math.max(0.38, cfg.minBounceAtr - 0.12);

    if (hadDecline && bounce >= minBounce) {
      const t1 = Number(source[Math.max(start, minIdx - cfg.left)]!.time);
      const bouncePct = (bounce / Math.max(minLow, 1e-9)) * 100;
      out.push({
        id: `merged-ares-key-decline-bounce-${Math.round(minLow)}`,
        kind: 'demand',
        pattern: 'decline_bounce',
        price: minLow,
        top: minLow + atr * 0.55,
        bot: minLow - atr * 0.22,
        time1: t1,
        time2: tEnd,
        score: bounce / atr + 18 + (n - 1 - minIdx <= 12 ? 12 : 0),
        labelKo: '하락후·반등',
        bouncePct,
      });
    }
  }

  /** 급등 후 되돌림 — tail 구간 최고 + 이후 하락폭 */
  let maxIdx = start;
  let maxHigh = -Infinity;
  for (let i = start; i < n - 1; i++) {
    const hi = source[i]!.high;
    if (hi > maxHigh) {
      maxHigh = hi;
      maxIdx = i;
    }
  }

  if (Number.isFinite(maxHigh) && maxIdx < n - 1) {
    let dropLow = maxHigh;
    for (let j = maxIdx; j < n; j++) dropLow = Math.min(dropLow, source[j]!.low);
    const drop = maxHigh - dropLow;
    const priorIdx = Math.max(0, maxIdx - Math.max(6, cfg.left + 2));
    const priorLow = Math.min(...source.slice(priorIdx, maxIdx + 1).map((c) => c.low));
    const hadRally = maxHigh - priorLow >= atr * 0.55;
    const minDrop = atr * Math.max(0.38, cfg.minBounceAtr - 0.12);

    if (hadRally && drop >= minDrop) {
      const t1 = Number(source[Math.max(start, maxIdx - cfg.left)]!.time);
      const bouncePct = (drop / Math.max(maxHigh, 1e-9)) * 100;
      out.push({
        id: `merged-ares-key-rally-reject-${Math.round(maxHigh)}`,
        kind: 'supply',
        pattern: 'rally_reject',
        price: maxHigh,
        top: maxHigh + atr * 0.22,
        bot: maxHigh - atr * 0.55,
        time1: t1,
        time2: tEnd,
        score: drop / atr + 16 + (n - 1 - maxIdx <= 12 ? 10 : 0),
        labelKo: '급등후·되돌림',
        bouncePct,
      });
    }
  }

  const last = source[n - 1]!;
  const dev = mergedDevelopingBar(last);
  const atrLast = estimateAtr(source, n - 1);
  if (atrLast > 0 && minIdx < n - 1 && Number.isFinite(minLow)) {
    if (dev.low <= minLow + atrLast * 0.3 && last.close > minLow) {
      out.push({
        id: `merged-ares-key-leading-bounce-${Math.round(minLow)}`,
        kind: 'demand',
        pattern: 'decline_bounce',
        price: minLow,
        top: minLow + atrLast * 0.5,
        bot: minLow - atrLast * 0.22,
        time1: Number(source[minIdx]!.time),
        time2: tEnd,
        score: 28,
        labelKo: '선행·하락후반등',
        bouncePct: ((last.close - minLow) / Math.max(minLow, 1e-9)) * 100,
      });
    }
  }

  return out;
}

/** TF 가시 봉에서 지지·반등 / 저항·거부 핵심 zone */
export function detectMergedAnalysisKeyZones(candles: Candle[], timeframe: string): MergedKeyZone[] {
  const source = keyZoneSourceCandles(candles, timeframe);
  const cfg = pivotCfg(timeframe);
  const n = source.length;
  if (n < cfg.left + cfg.right + cfg.confirmBars + 4) return [];

  const tEnd = Number(source[n - 1]!.time);
  const zones: MergedKeyZone[] = [];
  const pivotLows: Array<{ i: number; price: number }> = [];
  const pivotHighs: Array<{ i: number; price: number }> = [];

  for (let i = cfg.left; i < n - cfg.right - cfg.confirmBars; i++) {
    const atr = estimateAtr(source, i);
    if (!(atr > 0)) continue;

    if (pivotLow(source, i, cfg.left, cfg.right)) {
      const pivot = source[i]!;
      const pLow = pivot.low;
      pivotLows.push({ i, price: pLow });

      let bounceHigh = pLow;
      let confirmIdx = i;
      let wickBonus = wickRejectSupport(pivot) ? 12 : 0;
      for (let j = i + 1; j <= Math.min(n - 1, i + cfg.confirmBars); j++) {
        const c = source[j]!;
        bounceHigh = Math.max(bounceHigh, c.high);
        if (wickRejectSupport(c)) wickBonus += 6;
        if (c.low <= pLow + atr * 0.35) wickBonus += 4;
        if (bounceHigh - pLow >= atr * cfg.minBounceAtr) {
          confirmIdx = j;
          break;
        }
      }

      const bounce = bounceHigh - pLow;
      if (bounce < atr * cfg.minBounceAtr) continue;

      const doubleTouch = pivotLows.filter(
        (p) => p.i !== i && Math.abs(p.price - pLow) <= atr * 0.4
      ).length;
      const pattern: MergedKeyZonePattern = doubleTouch > 0 ? 'double_support' : 'support_bounce';
      const bouncePct = (bounce / Math.max(pLow, 1e-9)) * 100;
      const avgVol =
        source.slice(Math.max(0, i - 10), i + 1).reduce((s, c) => s + (c.volume > 0 ? c.volume : 1), 0) /
        Math.max(1, Math.min(11, i + 1));
      const volBonus =
        pivot.volume > avgVol * 1.25 ? 8 : pivot.volume > avgVol * 1.05 ? 4 : 0;
      const score = bounce / atr + wickBonus + volBonus + (doubleTouch > 0 ? 10 : 0);

      const t1 = Number(source[Math.max(0, i - cfg.left)]!.time);
      const t2 = Number(source[confirmIdx]!.time);
      zones.push({
        id: `merged-ares-key-support-${i}-${Math.round(pLow)}`,
        kind: 'demand',
        pattern,
        price: pLow,
        top: pLow + atr * 0.42,
        bot: pLow - atr * 0.18,
        time1: t1,
        time2: Math.max(t1, t2),
        score,
        labelKo: pattern === 'double_support' ? '핵심·이중지지' : '핵심·지지반등',
        bouncePct,
      });
    }

    if (pivotHigh(source, i, cfg.left, cfg.right)) {
      const pivot = source[i]!;
      const pHigh = pivot.high;
      pivotHighs.push({ i, price: pHigh });

      let dropLow = pHigh;
      let confirmIdx = i;
      let wickBonus = wickRejectResist(pivot) ? 12 : 0;
      for (let j = i + 1; j <= Math.min(n - 1, i + cfg.confirmBars); j++) {
        const c = source[j]!;
        dropLow = Math.min(dropLow, c.low);
        if (wickRejectResist(c)) wickBonus += 6;
        if (c.high >= pHigh - atr * 0.35) wickBonus += 4;
        if (pHigh - dropLow >= atr * cfg.minBounceAtr) {
          confirmIdx = j;
          break;
        }
      }

      const drop = pHigh - dropLow;
      if (drop < atr * cfg.minBounceAtr) continue;

      const doubleTouch = pivotHighs.filter(
        (p) => p.i !== i && Math.abs(p.price - pHigh) <= atr * 0.4
      ).length;
      const pattern: MergedKeyZonePattern = doubleTouch > 0 ? 'double_resist' : 'resist_reject';
      const bouncePct = (drop / Math.max(pHigh, 1e-9)) * 100;
      const score = drop / atr + wickBonus + (doubleTouch > 0 ? 10 : 0);

      const t1 = Number(source[Math.max(0, i - cfg.left)]!.time);
      const t2 = Number(source[confirmIdx]!.time);
      zones.push({
        id: `merged-ares-key-resist-${i}-${Math.round(pHigh)}`,
        kind: 'supply',
        pattern,
        price: pHigh,
        top: pHigh + atr * 0.18,
        bot: pHigh - atr * 0.42,
        time1: t1,
        time2: Math.max(t1, t2),
        score,
        labelKo: pattern === 'double_resist' ? '핵심·이중저항' : '핵심·저항거부',
        bouncePct,
      });
    }
  }

  const atrLast = estimateAtr(source, n - 1);
  const recent = detectRecentSwingReactionZones(source, timeframe, cfg);
  const merged = mergeNearby([...zones, ...recent], atrLast);
  const ranked = merged.sort((a, b) => {
    const recencyA = Math.abs(tEnd - a.time2);
    const recencyB = Math.abs(tEnd - b.time2);
    const recentBoostA =
      a.pattern === 'decline_bounce' || a.pattern === 'rally_reject' ? 25 : 0;
    const recentBoostB =
      b.pattern === 'decline_bounce' || b.pattern === 'rally_reject' ? 25 : 0;
    return (
      b.score + recentBoostB - (a.score + recentBoostA) ||
      recencyA - recencyB
    );
  });

  return ranked.slice(0, cfg.maxZones + 2);
}

export function buildMergedKeyZoneOverlays(
  candles: Candle[],
  timeframe: string,
  zones?: MergedKeyZone[],
  zoneIndexById?: Map<string, number>
): OverlayItem[] {
  const list = zones ?? detectMergedAnalysisKeyZones(candles, timeframe);
  if (!list.length) return [];

  const tf = normalizeChartTimeframe(timeframe);
  const work = mergedWorkCandles(candles, tf);
  const { t1, t2 } = mergedAnalysisChartZoneTimesSnapped(work, tf);
  const out: OverlayItem[] = [];

  for (const z of list) {
    const demand = z.kind === 'demand';
    const idx = zoneIndexById?.get(z.id);
    const numberedLabel =
      idx != null ? mergedZoneNumberedLabel(idx, z.price) : `${z.labelKo} ${fmtPx(z.price)}`;
    out.push({
      id: z.id,
      kind: demand ? 'demandZone' : 'supplyZone',
      label: numberedLabel,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: z.top,
      price2: z.bot,
      confidence: Math.min(98, 72 + Math.round(z.score * 4)),
      color: demand ? 'rgba(34,211,238,0.2)' : 'rgba(251,146,60,0.18)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-key-zone',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        demand ? 'merged-ares-key-demand' : 'merged-ares-key-supply',
        z.pattern === 'decline_bounce' ? 'merged-ares-key-decline-bounce' : '',
        z.pattern === 'rally_reject' ? 'merged-ares-key-rally-reject' : '',
        `merged-ares-key-${z.pattern}`,
      ]
        .filter(Boolean)
        .join(' '),
      lineLabelColor: demand ? '#67e8f9' : '#fdba74',
      labelBackgroundColor: demand ? 'rgba(8,78,99,0.92)' : 'rgba(124,45,18,0.9)',
      labelTextColor: '#f8fafc',
      labelTooltip: `${z.labelKo} · 반등/하락 ${z.bouncePct.toFixed(1)}% · TF ${normalizeChartTimeframe(timeframe)}`,
    });
  }

  return out;
}

/** 지지반등·저항거부 확인 마커 — zone 형성 봉 + 터치 봉 */
export function buildMergedKeyZoneMarkers(
  candles: Candle[],
  timeframe: string,
  zones?: MergedKeyZone[]
): AtlasPulseMarker[] {
  const list = zones ?? detectMergedAnalysisKeyZones(candles, timeframe);
  const source = mergedWorkCandles(candles, timeframe);
  const out: AtlasPulseMarker[] = [];
  const seen = new Set<number>();

  for (const z of list.slice(0, 8)) {
    const demand = z.kind === 'demand';
    for (const tRaw of [z.time2, z.time1]) {
      const t = Number(tRaw) as UTCTimestamp;
      if (!Number.isFinite(t) || seen.has(t)) continue;
      out.push({
        time: t,
        position: demand ? 'belowBar' : 'aboveBar',
        shape: 'circle',
        color: demand ? '#22d3ee' : '#fb923c',
        text: demand ? '↥' : '↧',
        size: 1,
        id: `${z.id}-mark-${t}`,
      });
      seen.add(t);
    }
  }

  for (let i = Math.max(0, source.length - 120); i < source.length; i++) {
    const c = source[i]!;
    const t = Number(c.time);
    if (!Number.isFinite(t) || seen.has(t)) continue;
    for (const z of list) {
      if (z.kind === 'demand' && c.low <= z.top && c.low >= z.bot && c.close >= z.bot) {
        out.push({
          time: t as UTCTimestamp,
          position: 'belowBar',
          shape: 'circle',
          color: '#22d3ee',
          text: '↥',
          size: 1,
          id: `${z.id}-touch-${t}`,
        });
        seen.add(t);
        break;
      }
      if (z.kind === 'supply' && c.high >= z.bot && c.high <= z.top && c.close <= z.top) {
        out.push({
          time: t as UTCTimestamp,
          position: 'aboveBar',
          shape: 'circle',
          color: '#fb923c',
          text: '↧',
          size: 1,
          id: `${z.id}-touch-${t}`,
        });
        seen.add(t);
        break;
      }
    }
  }

  return out.slice(-48);
}
