/**
 * 통합·분석 — 선행 핵심 구간 (최상급 합류: HTF · EQH/EQL · OB · VRVP · Strike · AI).
 * 하락/상승 전 "이 구간이 핵심" — 조건부 참고용.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe, TIMEFRAME_ORDER, visibleLimit } from '@/lib/constants';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import {
  mergedAnalysisChartZoneTimesSnapped,
  mergedAresOverlayTimes,
  mergedDeskLastCandleZoneTimes,
  mergedWorkCandles,
  MERGED_ARES_ZONE_CAPTION_CLASS,
  mergedZoneNumberedLabel,
} from '@/lib/mergedAnalysisOverlayTimes';
import { mergedDevelopingBar } from '@/lib/mergedAnalysisLeadingBar';
import { detectMonthDeskMoneyZones } from '@/lib/monthDeskMoneyZone';
import { isMergedDeskChartTimeframe } from '@/lib/mergedDesk4hReference';

export type MergedCriticalScenario = 'if_decline' | 'if_rally';
export type MergedCriticalTier = 'S' | 'A' | 'B';

export type MergedCriticalZone = {
  id: string;
  scenario: MergedCriticalScenario;
  kind: 'demand' | 'supply';
  price: number;
  top: number;
  bot: number;
  time1: number;
  score: number;
  distancePct: number;
  sources: string[];
  labelKo: string;
  statusKo: string;
  tier: MergedCriticalTier;
  confluenceCount: number;
  htfLabel: string | null;
  isPrimary: boolean;
  headlineKo: string;
};

type Candidate = {
  scenario: MergedCriticalScenario;
  kind: 'demand' | 'supply';
  price: number;
  top: number;
  bot: number;
  time1: number;
  sources: string[];
  weight: number;
  touchCount?: number;
};

const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
  '1Y': 31_536_000_000,
};

function sourceCandles(candles: Candle[], timeframe: string): Candle[] {
  return mergedWorkCandles(candles, timeframe);
}

function isCoarseTimeframe(tf: string): boolean {
  const t = normalizeChartTimeframe(tf);
  return t === '1d' || t === '1w' || t === '1M' || t === '1Y';
}

function htfParentChain(chartTf: string): string[] {
  const out: string[] = [];
  let cur = parentTimeframe(chartTf);
  for (let i = 0; i < 2 && cur; i++) {
    out.push(cur);
    cur = parentTimeframe(cur);
  }
  return out;
}

function parentTimeframe(tf: string): string | null {
  const n = normalizeChartTimeframe(tf);
  const i = TIMEFRAME_ORDER.indexOf(n as (typeof TIMEFRAME_ORDER)[number]);
  if (i < 0 || i >= TIMEFRAME_ORDER.length - 1) return null;
  return TIMEFRAME_ORDER[i + 1] ?? null;
}

function resampleCandlesToTf(candles: Candle[], targetTf: string): Candle[] {
  const bucketMs = TF_MS[normalizeChartTimeframe(targetTf)];
  if (!bucketMs || candles.length < 4) return [];
  const buckets = new Map<number, Candle[]>();
  for (const c of candles) {
    const tMs = c.time * 1000;
    const key = Math.floor(Math.floor(tMs / bucketMs) * bucketMs / 1000);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }
  const out: Candle[] = [];
  for (const [key, arr] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    arr.sort((a, b) => a.time - b.time);
    const first = arr[0]!;
    const last = arr[arr.length - 1]!;
    out.push({
      time: key,
      open: first.open,
      high: Math.max(...arr.map((x) => x.high)),
      low: Math.min(...arr.map((x) => x.low)),
      close: last.close,
      volume: arr.reduce((s, x) => s + (x.volume > 0 ? x.volume : 0), 0),
    });
  }
  return out;
}

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(0);
  if (a >= 1) return p.toFixed(1);
  return p.toFixed(3);
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

function pivotCfg(timeframe: string): { left: number; right: number; maxAheadPct: number; maxZones: number } {
  /** 통합분석 — 4h 참조 고정 */
  if (isMergedDeskChartTimeframe(timeframe)) {
    return { left: 5, right: 5, maxAheadPct: 9, maxZones: 6 };
  }
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, { left: number; right: number; maxAheadPct: number; maxZones: number }> = {
    '1m': { left: 3, right: 3, maxAheadPct: 2.5, maxZones: 5 },
    '3m': { left: 3, right: 3, maxAheadPct: 3, maxZones: 5 },
    '5m': { left: 3, right: 3, maxAheadPct: 3.5, maxZones: 5 },
    '15m': { left: 4, right: 4, maxAheadPct: 4.5, maxZones: 5 },
    '1h': { left: 5, right: 5, maxAheadPct: 6, maxZones: 6 },
    '4h': { left: 5, right: 5, maxAheadPct: 9, maxZones: 6 },
    '1d': { left: 4, right: 4, maxAheadPct: 32, maxZones: 6 },
    '1w': { left: 3, right: 3, maxAheadPct: 38, maxZones: 5 },
    '1M': { left: 2, right: 2, maxAheadPct: 45, maxZones: 5 },
    '1Y': { left: 2, right: 2, maxAheadPct: 55, maxZones: 4 },
  };
  return map[tf] ?? map['1h']!;
}

function clampPad(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 2.5) return fallback;
  return Math.min(0.75, Math.max(0.1, value));
}

function demandStillValid(candles: Candle[], bot: number, atr: number, timeframe: string): boolean {
  const coarse = isCoarseTimeframe(timeframe);
  const tail = candles.slice(Math.max(0, candles.length - (coarse ? 18 : 8)));
  const breakLevel = bot - atr * (coarse ? 0.55 : 0.35);
  const breaks = tail.filter((c) => c.close < breakLevel && c.close < c.open);
  return coarse ? breaks.length <= 1 : breaks.length === 0;
}

function supplyStillValid(candles: Candle[], top: number, atr: number, timeframe: string): boolean {
  const coarse = isCoarseTimeframe(timeframe);
  const tail = candles.slice(Math.max(0, candles.length - (coarse ? 18 : 8)));
  const breakLevel = top + atr * (coarse ? 0.55 : 0.35);
  const breaks = tail.filter((c) => c.close > breakLevel && c.close > c.open);
  return coarse ? breaks.length <= 1 : breaks.length === 0;
}

function withinAheadPct(
  close: number,
  price: number,
  scenario: MergedCriticalScenario,
  maxPct: number,
  timeframe: string
): boolean {
  const distPct =
    scenario === 'if_decline'
      ? ((close - price) / Math.max(close, 1e-9)) * 100
      : ((price - close) / Math.max(close, 1e-9)) * 100;
  const minDist = isCoarseTimeframe(timeframe) ? 0.05 : 0.12;
  return distPct >= minDist && distPct <= maxPct;
}

function pushCandidate(list: Candidate[], c: Candidate, atr: number): void {
  if (!Number.isFinite(c.price) || c.price <= 0) return;
  const tol = atr * 0.48;
  const existing = list.find(
    (o) => o.scenario === c.scenario && Math.abs(o.price - c.price) <= tol
  );
  if (existing) {
    existing.weight += c.weight * 0.72;
    for (const s of c.sources) {
      if (!existing.sources.includes(s)) existing.sources.push(s);
    }
    existing.top = Math.max(existing.top, c.top);
    existing.bot = Math.min(existing.bot, c.bot);
    existing.time1 = Math.min(existing.time1, c.time1);
    existing.touchCount = Math.max(existing.touchCount ?? 0, c.touchCount ?? 0);
    return;
  }
  list.push({ ...c, sources: [...c.sources] });
}

function addLevelCandidate(
  list: Candidate[],
  params: {
    scenario: MergedCriticalScenario;
    price: number;
    atr: number;
    close: number;
    maxAheadPct: number;
    source: string;
    weight: number;
    topPad?: number;
    botPad?: number;
    time1?: number;
    touchCount?: number;
    skipValidity?: boolean;
    timeframe: string;
  },
  candles: Candle[]
): void {
  const {
    scenario,
    price,
    atr,
    close,
    maxAheadPct,
    source,
    weight,
    topPad = 0.22,
    botPad = 0.35,
    time1,
    touchCount,
    skipValidity,
    timeframe,
  } = params;
  const aheadCap = isCoarseTimeframe(timeframe) ? maxAheadPct * 1.12 : maxAheadPct;
  if (!withinAheadPct(close, price, scenario, aheadCap, timeframe)) return;
  const top = price + atr * clampPad(topPad, isCoarseTimeframe(timeframe) ? 0.32 : 0.22);
  const bot = price - atr * clampPad(botPad, isCoarseTimeframe(timeframe) ? 0.48 : 0.35);
  if (!skipValidity) {
    if (scenario === 'if_decline' && !demandStillValid(candles, bot, atr, timeframe)) return;
    if (scenario === 'if_rally' && !supplyStillValid(candles, top, atr, timeframe)) return;
  }
  pushCandidate(
    list,
    {
      scenario,
      kind: scenario === 'if_decline' ? 'demand' : 'supply',
      price,
      top,
      bot,
      time1: time1 ?? Date.now() / 1000 - 86400,
      sources: [source],
      weight,
      touchCount,
    },
    atr
  );
}

function collectSwingCandidates(
  source: Candle[],
  cfg: ReturnType<typeof pivotCfg>,
  close: number,
  atr: number,
  timeframe: string
): Candidate[] {
  const out: Candidate[] = [];
  const n = source.length;
  const L = cfg.left;
  const R = cfg.right;

  for (let i = L; i < n - R; i++) {
    if (pivotLow(source, i, L, R)) {
      const p = source[i]!.low;
      if (p >= close) continue;
      addLevelCandidate(out, {
        scenario: 'if_decline',
        price: p,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct,
        source: '스윙저점',
        weight: 15,
        time1: Number(source[Math.max(0, i - L)]!.time),
        timeframe,
      }, source);
    }
    if (pivotHigh(source, i, L, R)) {
      const p = source[i]!.high;
      if (p <= close) continue;
      addLevelCandidate(out, {
        scenario: 'if_rally',
        price: p,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct,
        source: '스윙고점',
        weight: 15,
        time1: Number(source[Math.max(0, i - L)]!.time),
        timeframe,
      }, source);
    }
  }
  return out;
}

function collectHtfCandidates(
  candles: Candle[],
  chartTf: string,
  close: number,
  atr: number,
  cfg: ReturnType<typeof pivotCfg>
): Candidate[] {
  const out: Candidate[] = [];
  const minHtfBars = isCoarseTimeframe(chartTf) ? 8 : 12;

  for (const parent of htfParentChain(chartTf)) {
    const htf = resampleCandlesToTf(candles, parent);
    if (htf.length < minHtfBars) continue;

    const htfLabel = parent.toUpperCase();
    const htfAtr = estimateAtr(htf, htf.length - 1);
    const L = Math.max(2, cfg.left - (isCoarseTimeframe(chartTf) ? 1 : 0));
    const R = L;
    const maxPct = cfg.maxAheadPct * (parent === htfParentChain(chartTf)[0] ? 1.35 : 1.55);

    for (let i = L; i < htf.length - R; i++) {
      if (pivotLow(htf, i, L, R)) {
        const p = htf[i]!.low;
        addLevelCandidate(out, {
          scenario: 'if_decline',
          price: p,
          atr: htfAtr,
          close,
          maxAheadPct: maxPct,
          source: `HTF${htfLabel}저`,
          weight: parent === htfParentChain(chartTf)[0] ? 24 : 20,
          time1: Number(htf[Math.max(0, i - L)]!.time),
          skipValidity: isCoarseTimeframe(chartTf),
          timeframe: chartTf,
        }, candles);
      }
      if (pivotHigh(htf, i, L, R)) {
        const p = htf[i]!.high;
        addLevelCandidate(out, {
          scenario: 'if_rally',
          price: p,
          atr: htfAtr,
          close,
          maxAheadPct: maxPct,
          source: `HTF${htfLabel}고`,
          weight: parent === htfParentChain(chartTf)[0] ? 24 : 20,
          time1: Number(htf[Math.max(0, i - L)]!.time),
          skipValidity: isCoarseTimeframe(chartTf),
          timeframe: chartTf,
        }, candles);
      }
    }

    const last = htf[htf.length - 1]!;
    const developingLow = Math.min(last.open, last.close, last.low);
    const developingHigh = Math.max(last.open, last.close, last.high);
    if (developingLow < close) {
      addLevelCandidate(out, {
        scenario: 'if_decline',
        price: developingLow,
        atr: htfAtr,
        close,
        maxAheadPct: maxPct * 0.9,
        source: `HTF${htfLabel}몸`,
        weight: 18,
        time1: Number(last.time),
        skipValidity: isCoarseTimeframe(chartTf),
        timeframe: chartTf,
      }, candles);
    }
    if (developingHigh > close) {
      addLevelCandidate(out, {
        scenario: 'if_rally',
        price: developingHigh,
        atr: htfAtr,
        close,
        maxAheadPct: maxPct * 0.9,
        source: `HTF${htfLabel}몸`,
        weight: 18,
        time1: Number(last.time),
        skipValidity: isCoarseTimeframe(chartTf),
        timeframe: chartTf,
      }, candles);
    }
  }

  return out;
}

function collectLiquidityCandidates(
  candles: Candle[],
  timeframe: string,
  close: number,
  atr: number,
  cfg: ReturnType<typeof pivotCfg>
): Candidate[] {
  const out: Candidate[] = [];
  const hud = detectMonthDeskMoneyZones(candles, timeframe, 2, 6);
  for (const pool of hud.pools) {
    const mid = pool.priceMid;
    if (pool.side === 'LONG' && mid < close) {
      addLevelCandidate(out, {
        scenario: 'if_decline',
        price: mid,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct * 1.15,
        source: pool.touchCount >= 2 ? 'EQL클러' : 'EQL',
        weight: 20 + Math.min(10, pool.touchCount * 3),
        topPad: (pool.priceTop - mid) / Math.max(atr, 1e-9),
        botPad: (mid - pool.priceBot) / Math.max(atr, 1e-9),
        time1: pool.barTimeStart,
        touchCount: pool.touchCount,
        timeframe,
      }, candles);
    }
    if (pool.side === 'SHORT' && mid > close) {
      addLevelCandidate(out, {
        scenario: 'if_rally',
        price: mid,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct * 1.15,
        source: pool.touchCount >= 2 ? 'EQH클러' : 'EQH',
        weight: 20 + Math.min(10, pool.touchCount * 3),
        topPad: (pool.priceTop - mid) / Math.max(atr, 1e-9),
        botPad: (mid - pool.priceBot) / Math.max(atr, 1e-9),
        time1: pool.barTimeStart,
        touchCount: pool.touchCount,
        timeframe,
      }, candles);
    }
  }
  return out;
}

function collectEngineEqCandidates(
  analysis: AnalyzeResponse | null | undefined,
  close: number,
  atr: number,
  cfg: ReturnType<typeof pivotCfg>,
  candles: Candle[],
  timeframe: string
): Candidate[] {
  const out: Candidate[] = [];
  const eng = analysis?.engine as
    | { eqh?: Array<{ price: number }>; eql?: Array<{ price: number }> }
    | undefined;
  if (!eng) return out;

  for (const x of eng.eql ?? []) {
    if (x.price < close) {
      addLevelCandidate(out, {
        scenario: 'if_decline',
        price: x.price,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct,
        source: '엔진EQL',
        weight: 19,
        timeframe,
      }, candles);
    }
  }
  for (const x of eng.eqh ?? []) {
    if (x.price > close) {
      addLevelCandidate(out, {
        scenario: 'if_rally',
        price: x.price,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct,
        source: '엔진EQH',
        weight: 19,
        timeframe,
      }, candles);
    }
  }
  return out;
}

function collectObAndPathCandidates(
  analysis: AnalyzeResponse | null | undefined,
  close: number,
  atr: number,
  cfg: ReturnType<typeof pivotCfg>,
  candles: Candle[],
  timeframe: string
): Candidate[] {
  const out: Candidate[] = [];
  const supOb = analysis?.nearestSupportOb;
  if (supOb && supOb.high < close) {
    const mid = (supOb.low + supOb.high) / 2;
    addLevelCandidate(out, {
      scenario: 'if_decline',
      price: mid,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct * 1.2,
      source: '지지OB',
      weight: 21,
      topPad: (supOb.high - mid) / Math.max(atr, 1e-9),
      botPad: (mid - supOb.low) / Math.max(atr, 1e-9),
      timeframe,
    }, candles);
  }

  const resOb = analysis?.nearestResistanceOb;
  if (resOb && resOb.low > close) {
    const mid = (resOb.low + resOb.high) / 2;
    addLevelCandidate(out, {
      scenario: 'if_rally',
      price: mid,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct * 1.2,
      source: '저항OB',
      weight: 21,
      topPad: (resOb.high - mid) / Math.max(atr, 1e-9),
      botPad: (mid - resOb.low) / Math.max(atr, 1e-9),
      timeframe,
    }, candles);
  }

  const zbc = analysis?.zoneBiasCard;
  if (zbc) {
    const mid = (zbc.low + zbc.high) / 2;
    if (zbc.side === 'LONG' && mid < close) {
      addLevelCandidate(out, {
        scenario: 'if_decline',
        price: mid,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct * 1.1,
        source: '존바이어스',
        weight: 17,
        topPad: (zbc.high - mid) / Math.max(atr, 1e-9),
        botPad: (mid - zbc.low) / Math.max(atr, 1e-9),
        timeframe,
      }, candles);
    }
    if (zbc.side === 'SHORT' && mid > close) {
      addLevelCandidate(out, {
        scenario: 'if_rally',
        price: mid,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct * 1.1,
        source: '존바이어스',
        weight: 17,
        topPad: (zbc.high - mid) / Math.max(atr, 1e-9),
        botPad: (mid - zbc.low) / Math.max(atr, 1e-9),
        timeframe,
      }, candles);
    }
  }

  const path = analysis?.structureBouncePath;
  if (path?.steps?.length) {
    for (const step of path.steps) {
      const mid = (step.low + step.high) / 2;
      if (step.kind === 'range_low' || step.kind === 'reaction') {
        if (mid < close) {
          addLevelCandidate(out, {
            scenario: 'if_decline',
            price: mid,
            atr,
            close,
            maxAheadPct: cfg.maxAheadPct * 1.25,
            source: '구조반응',
            weight: 16,
            topPad: (step.high - mid) / Math.max(atr, 1e-9),
            botPad: (mid - step.low) / Math.max(atr, 1e-9),
            timeframe,
          }, candles);
        }
      }
      if (step.kind === 'range_high' || (step.kind === 'reaction' && mid > close)) {
        if (mid > close) {
          addLevelCandidate(out, {
            scenario: 'if_rally',
            price: mid,
            atr,
            close,
            maxAheadPct: cfg.maxAheadPct * 1.25,
            source: '구조반응',
            weight: 16,
            topPad: (step.high - mid) / Math.max(atr, 1e-9),
            botPad: (mid - step.low) / Math.max(atr, 1e-9),
            timeframe,
          }, candles);
        }
      }
    }
  }

  return out;
}

function collectStructureCandidates(
  close: number,
  atr: number,
  analysis: AnalyzeResponse | null | undefined,
  vrvp: MergedVrvpProfile | null,
  bundle: MonthDeskStrikeDeskBundle | null | undefined,
  cfg: ReturnType<typeof pivotCfg>,
  candles: Candle[],
  timeframe: string
): Candidate[] {
  const out: Candidate[] = [];
  const tAnchor = Number(candles[candles.length - 1]?.time) ?? Date.now() / 1000;

  const support = analysis?.supportLevel?.price;
  if (support != null && support < close) {
    addLevelCandidate(out, {
      scenario: 'if_decline',
      price: support,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct,
      source: 'AI지지',
      weight: 18,
      time1: tAnchor - 86400,
      timeframe,
    }, candles);
  }

  const resist = analysis?.resistanceLevel?.price;
  if (resist != null && resist > close) {
    addLevelCandidate(out, {
      scenario: 'if_rally',
      price: resist,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct,
      source: 'AI저항',
      weight: 18,
      time1: tAnchor - 86400,
      timeframe,
    }, candles);
  }

  const inv =
    typeof analysis?.invalidationLevel === 'number'
      ? analysis.invalidationLevel
      : analysis?.invalidationLevel?.price;
  if (typeof inv === 'number' && inv < close) {
    addLevelCandidate(out, {
      scenario: 'if_decline',
      price: inv,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct * 1.15,
      source: '무효참고',
      weight: 16,
      time1: tAnchor - 86400,
      timeframe,
    }, candles);
  }

  if (vrvp?.vaLow != null && vrvp.vaLow < close) {
    addLevelCandidate(out, {
      scenario: 'if_decline',
      price: vrvp.vaLow,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct,
      source: '집중하단',
      weight: 20,
      time1: tAnchor - 86400,
      timeframe,
    }, candles);
  }

  if (vrvp?.vaHigh != null && vrvp.vaHigh > close) {
    addLevelCandidate(out, {
      scenario: 'if_rally',
      price: vrvp.vaHigh,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct,
      source: '집중상단',
      weight: 20,
      time1: tAnchor - 86400,
      timeframe,
    }, candles);
  }

  if (vrvp?.poc != null) {
    if (vrvp.poc < close * 0.998) {
      addLevelCandidate(out, {
        scenario: 'if_decline',
        price: vrvp.poc,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct,
        source: '최다거래',
        weight: 17,
        time1: tAnchor - 86400,
        timeframe,
      }, candles);
    } else if (vrvp.poc > close * 1.002) {
      addLevelCandidate(out, {
        scenario: 'if_rally',
        price: vrvp.poc,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct,
        source: '최다거래',
        weight: 17,
        time1: tAnchor - 86400,
        timeframe,
      }, candles);
    }
  }

  const longLeg = bundle?.long;
  if (longLeg && longLeg.zoneBot < close) {
    const mid = (longLeg.zoneTop + longLeg.zoneBot) / 2;
    addLevelCandidate(out, {
      scenario: 'if_decline',
      price: mid,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct * 1.2,
      source: 'Strike롱',
      weight: 23,
      topPad: (longLeg.zoneTop - mid) / Math.max(atr, 1e-9),
      botPad: (mid - longLeg.zoneBot) / Math.max(atr, 1e-9),
      time1: tAnchor - 86400,
      timeframe,
    }, candles);
  }

  const shortLeg = bundle?.short;
  if (shortLeg && shortLeg.zoneTop > close) {
    const mid = (shortLeg.zoneTop + shortLeg.zoneBot) / 2;
    addLevelCandidate(out, {
      scenario: 'if_rally',
      price: mid,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct * 1.2,
      source: 'Strike숏',
      weight: 23,
      topPad: (shortLeg.zoneTop - mid) / Math.max(atr, 1e-9),
      botPad: (mid - shortLeg.zoneBot) / Math.max(atr, 1e-9),
      time1: tAnchor - 86400,
      timeframe,
    }, candles);
  }

  return out;
}

/** 1d·1w 등 coarse TF — 후보가 없을 때 최근 스윙 기준 fallback */
function collectCoarseFallbackCandidates(
  source: Candle[],
  close: number,
  atr: number,
  timeframe: string,
  cfg: ReturnType<typeof pivotCfg>
): Candidate[] {
  if (!isCoarseTimeframe(timeframe)) return [];
  const out: Candidate[] = [];
  const n = source.length;
  const look = Math.min(n - 1, 80); // 4h 참조 lookback
  const start = Math.max(0, n - look);

  let bestLow = Infinity;
  let bestLowIdx = start;
  let bestHigh = -Infinity;
  let bestHighIdx = start;
  for (let i = start; i < n; i++) {
    if (source[i]!.low < bestLow) {
      bestLow = source[i]!.low;
      bestLowIdx = i;
    }
    if (source[i]!.high > bestHigh) {
      bestHigh = source[i]!.high;
      bestHighIdx = i;
    }
  }

  if (bestLow < close) {
    addLevelCandidate(out, {
      scenario: 'if_decline',
      price: bestLow,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct * 1.2,
      source: '일봉저점',
      weight: 16,
      time1: Number(source[bestLowIdx]!.time),
      skipValidity: true,
      timeframe,
    }, source);
  }
  if (bestHigh > close) {
    addLevelCandidate(out, {
      scenario: 'if_rally',
      price: bestHigh,
      atr,
      close,
      maxAheadPct: cfg.maxAheadPct * 1.2,
      source: '일봉고점',
      weight: 16,
      time1: Number(source[bestHighIdx]!.time),
      skipValidity: true,
      timeframe,
    }, source);
  }
  return out;
}

function boostKeyZoneOverlap(candidates: Candidate[], keyZones: MergedKeyZone[], atr: number): void {
  for (const c of candidates) {
    for (const kz of keyZones) {
      if (c.scenario === 'if_decline' && kz.kind !== 'demand') continue;
      if (c.scenario === 'if_rally' && kz.kind !== 'supply') continue;
      if (Math.abs(c.price - kz.price) <= atr * 0.55) {
        c.weight += 12;
        if (!c.sources.includes('스윙확인')) c.sources.push('스윙확인');
      }
    }
  }
}

/** analyze 패턴 학습(top5) — 시나리오 방향 가중 (고정 승률 아님) */
function boostLearnedPatternBias(
  candidates: Candidate[],
  analysis: AnalyzeResponse | null | undefined
): void {
  const patterns = analysis?.learnedPatternsTop5 ?? [];
  if (!patterns.length) return;
  let bull = 0;
  let bear = 0;
  for (const p of patterns) {
    if (p.bias === 'bullish') bull++;
    else if (p.bias === 'bearish') bear++;
  }
  if (bull === bear) return;
  for (const c of candidates) {
    if (c.scenario === 'if_rally' && bull > bear) {
      c.weight += 5 + Math.min(4, bull);
      if (!c.sources.includes('패턴학습')) c.sources.push('패턴학습');
    }
    if (c.scenario === 'if_decline' && bear > bull) {
      c.weight += 5 + Math.min(4, bear);
      if (!c.sources.includes('패턴학습')) c.sources.push('패턴학습');
    }
  }
}

/** whale-memory zone 겹침 — 터치 가중 */
function boostWhaleMemoryOverlap(
  candidates: Candidate[],
  whaleZones: Array<{ price1: number; price2: number; confidence?: number }> | undefined,
  atr: number
): void {
  if (!whaleZones?.length) return;
  for (const c of candidates) {
    for (const w of whaleZones) {
      const mid = (w.price1 + w.price2) / 2;
      const half = Math.abs(w.price1 - w.price2) / 2 + atr * 0.15;
      if (Math.abs(c.price - mid) <= half) {
        c.weight += 8 + Math.min(6, (w.confidence ?? 50) / 15);
        if (!c.sources.includes('고래메모리')) c.sources.push('고래메모리');
        break;
      }
    }
  }
}

function mtfAlignmentBonus(
  analysis: AnalyzeResponse | null | undefined,
  scenario: MergedCriticalScenario
): number {
  const bias = String(analysis?.mtf?.htfBias ?? '').toLowerCase();
  if (!bias) return 0;
  if (scenario === 'if_rally' && (bias.includes('bull') || bias.includes('long') || bias === 'up')) {
    return 8;
  }
  if (scenario === 'if_decline' && (bias.includes('bear') || bias.includes('short') || bias === 'down')) {
    return 8;
  }
  return 0;
}

function resolveTier(score: number, confluence: number, hasHtf: boolean): MergedCriticalTier {
  if (score >= 48 || confluence >= 4 || (hasHtf && confluence >= 3 && score >= 38)) return 'S';
  if (score >= 34 || confluence >= 3) return 'A';
  return 'B';
}

function finalizeZones(
  candidates: Candidate[],
  close: number,
  chartTf: string,
  cfg: ReturnType<typeof pivotCfg>,
  analysis: AnalyzeResponse | null | undefined
): MergedCriticalZone[] {
  const parent = parentTimeframe(chartTf);
  const htfLabel = parent ? parent.toUpperCase() : null;

  const byScenario = (s: MergedCriticalScenario) =>
    candidates
      .filter((c) => c.scenario === s)
      .sort((a, b) => {
        const scoreA =
          a.weight + a.sources.length * 5 + (a.touchCount ?? 0) * 2 + mtfAlignmentBonus(analysis, s);
        const scoreB =
          b.weight + b.sources.length * 5 + (b.touchCount ?? 0) * 2 + mtfAlignmentBonus(analysis, s);
        return scoreB - scoreA || Math.abs(close - a.price) - Math.abs(close - b.price);
      })
      .slice(0, cfg.maxZones);

  const toZone = (c: Candidate, rank: number): MergedCriticalZone => {
    const distPct =
      c.scenario === 'if_decline'
        ? ((close - c.price) / Math.max(close, 1e-9)) * 100
        : ((c.price - close) / Math.max(close, 1e-9)) * 100;
    const confluence = c.sources.length;
    const hasHtf = c.sources.some((s) => s.startsWith('HTF'));
    const mtfBonus = mtfAlignmentBonus(analysis, c.scenario);
    const score = Math.round(c.weight + confluence * 5 + (c.touchCount ?? 0) * 2 + mtfBonus);
    const tier = resolveTier(score, confluence, hasHtf);
    const srcKo = c.sources.slice(0, 5).join('·');
    const labelKo =
      c.scenario === 'if_decline'
        ? `${tier} 하락핵심 · ${fmtPx(c.price)}`
        : `${tier} 상승핵심 · ${fmtPx(c.price)}`;
    const statusKo =
      c.scenario === 'if_decline'
        ? `하락 시 ${fmtPx(c.bot)}~${fmtPx(c.top)} — ${srcKo}${hasHtf && htfLabel ? ` · HTF${htfLabel}합류` : ''}`
        : `상승 시 ${fmtPx(c.bot)}~${fmtPx(c.top)} — ${srcKo}${hasHtf && htfLabel ? ` · HTF${htfLabel}합류` : ''}`;
    const headlineKo =
      c.scenario === 'if_decline'
        ? `▼ ${tier} ${fmtPx(c.price)} (${confluence}합류${hasHtf ? '+HTF' : ''})`
        : `▲ ${tier} ${fmtPx(c.price)} (${confluence}합류${hasHtf ? '+HTF' : ''})`;

    return {
      id: `merged-ares-critical-${c.scenario}-${Math.round(c.price)}-${tier}`,
      scenario: c.scenario,
      kind: c.kind,
      price: c.price,
      top: c.top,
      bot: c.bot,
      time1: c.time1,
      score,
      distancePct: distPct,
      sources: c.sources,
      labelKo,
      statusKo,
      tier,
      confluenceCount: confluence,
      htfLabel: hasHtf ? htfLabel : null,
      isPrimary: rank === 0,
      headlineKo,
    };
  };

  const decline = byScenario('if_decline').map((c, i) => toZone(c, i));
  const rally = byScenario('if_rally').map((c, i) => toZone(c, i));
  return [...decline, ...rally];
}

function collectDailyNativeCandidates(
  source: Candle[],
  close: number,
  atr: number,
  timeframe: string,
  cfg: ReturnType<typeof pivotCfg>
): Candidate[] {
  if (normalizeChartTimeframe(timeframe) !== '1d') return [];
  const out: Candidate[] = [];
  const n = source.length;
  const windows = [20, 45, 90];
  for (const w of windows) {
    const start = Math.max(0, n - w);
    let lo = Infinity;
    let hi = -Infinity;
    let loIdx = start;
    let hiIdx = start;
    for (let i = start; i < n; i++) {
      if (source[i]!.low < lo) {
        lo = source[i]!.low;
        loIdx = i;
      }
      if (source[i]!.high > hi) {
        hi = source[i]!.high;
        hiIdx = i;
      }
    }
    if (lo < close) {
      addLevelCandidate(out, {
        scenario: 'if_decline',
        price: lo,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct * 1.15,
        source: w <= 25 ? '일봉20저' : w <= 50 ? '일봉45저' : '일봉90저',
        weight: w <= 25 ? 19 : w <= 50 ? 17 : 15,
        time1: Number(source[loIdx]!.time),
        skipValidity: true,
        timeframe,
      }, source);
    }
    if (hi > close) {
      addLevelCandidate(out, {
        scenario: 'if_rally',
        price: hi,
        atr,
        close,
        maxAheadPct: cfg.maxAheadPct * 1.15,
        source: w <= 25 ? '일봉20고' : w <= 50 ? '일봉45고' : '일봉90고',
        weight: w <= 25 ? 19 : w <= 50 ? 17 : 15,
        time1: Number(source[hiIdx]!.time),
        skipValidity: true,
        timeframe,
      }, source);
    }
  }
  return out;
}

function collectChartDevelopingCandidates(
  source: Candle[],
  close: number,
  atr: number,
  chartTf: string,
  cfg: ReturnType<typeof pivotCfg>
): Candidate[] {
  const out: Candidate[] = [];
  const last = source[source.length - 1];
  if (!last) return out;
  const dev = mergedDevelopingBar(last);
  const maxPct = cfg.maxAheadPct * 1.1;

  if (dev.low < close) {
    addLevelCandidate(
      out,
      {
        scenario: 'if_decline',
        price: dev.low,
        atr,
        close,
        maxAheadPct: maxPct,
        source: `${chartTf.toUpperCase()}선행저`,
        weight: 24,
        time1: Number(last.time),
        skipValidity: true,
        timeframe: chartTf,
      },
      source
    );
  }
  if (dev.high > close) {
    addLevelCandidate(
      out,
      {
        scenario: 'if_rally',
        price: dev.high,
        atr,
        close,
        maxAheadPct: maxPct,
        source: `${chartTf.toUpperCase()}선행고`,
        weight: 24,
        time1: Number(last.time),
        skipValidity: true,
        timeframe: chartTf,
      },
      source
    );
  }

  const tail = isCoarseTimeframe(chartTf) ? 30 : 18;
  let swingLo = Infinity;
  let swingHi = -Infinity;
  for (let i = Math.max(0, source.length - tail); i < source.length - 1; i++) {
    swingLo = Math.min(swingLo, source[i]!.low);
    swingHi = Math.max(swingHi, source[i]!.high);
  }
  if (Number.isFinite(swingLo) && dev.low <= swingLo * 1.001 && close >= swingLo - atr * 0.5) {
    addLevelCandidate(
      out,
      {
        scenario: 'if_decline',
        price: swingLo,
        atr,
        close,
        maxAheadPct: maxPct,
        source: '선행스윙저',
        weight: 22,
        time1: Number(last.time),
        skipValidity: true,
        timeframe: chartTf,
      },
      source
    );
  }
  if (Number.isFinite(swingHi) && dev.high >= swingHi * 0.999 && close <= swingHi + atr * 0.5) {
    addLevelCandidate(
      out,
      {
        scenario: 'if_rally',
        price: swingHi,
        atr,
        close,
        maxAheadPct: maxPct,
        source: '선행스윙고',
        weight: 22,
        time1: Number(last.time),
        skipValidity: true,
        timeframe: chartTf,
      },
      source
    );
  }
  return out;
}

export function detectMergedCriticalZones(params: {
  candles: Candle[];
  timeframe: string;
  analysis?: AnalyzeResponse | null;
  vrvp?: MergedVrvpProfile | null;
  bundle?: MonthDeskStrikeDeskBundle | null;
  keyZones?: MergedKeyZone[];
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
}): MergedCriticalZone[] {
  const { candles, timeframe, analysis, vrvp, bundle, keyZones, whaleMemoryZones } = params;
  const chartTf = normalizeChartTimeframe(timeframe);
  const minBars = isCoarseTimeframe(chartTf) ? 8 : 24;
  if (candles.length < minBars) return [];

  const source = sourceCandles(candles, timeframe);
  const close = source[source.length - 1]!.close;
  const atr = estimateAtr(source, source.length - 1);
  const cfg = pivotCfg(timeframe);

  const merged: Candidate[] = [
    ...collectSwingCandidates(source, cfg, close, atr, chartTf),
    ...collectHtfCandidates(candles, chartTf, close, atr, cfg),
    ...collectLiquidityCandidates(source, chartTf, close, atr, cfg),
    ...collectEngineEqCandidates(analysis, close, atr, cfg, source, chartTf),
    ...collectObAndPathCandidates(analysis, close, atr, cfg, source, chartTf),
    ...collectStructureCandidates(close, atr, analysis, vrvp ?? null, bundle, cfg, source, chartTf),
    ...collectDailyNativeCandidates(source, close, atr, chartTf, cfg),
    ...collectChartDevelopingCandidates(source, close, atr, chartTf, cfg),
  ];

  if (keyZones?.length) boostKeyZoneOverlap(merged, keyZones, atr);
  boostLearnedPatternBias(merged, analysis);
  boostWhaleMemoryOverlap(merged, whaleMemoryZones, atr);

  let zones = finalizeZones(merged, close, chartTf, cfg, analysis);
  if (!zones.length && isCoarseTimeframe(chartTf)) {
    const fallback = collectCoarseFallbackCandidates(source, close, atr, chartTf, cfg);
    if (fallback.length) {
      zones = finalizeZones(fallback, close, chartTf, cfg, analysis);
    }
  }
  return zones;
}

function mergedAresOverlayTimesLocal(
  candles: Candle[],
  timeframe: string,
  zoneTime1: number
): { t1: number; t2: number } {
  const { t1, t2 } = mergedAresOverlayTimes(candles, timeframe, zoneTime1);
  return { t1: Number(t1), t2: Number(t2) };
}

export { mergedAresOverlayTimes, mergedWorkCandles, MERGED_ARES_ZONE_CAPTION_CLASS };

export function buildMergedCriticalZoneOverlays(
  candles: Candle[],
  zones: MergedCriticalZone[],
  timeframe?: string,
  zoneIndexById?: Map<string, number>
): OverlayItem[] {
  if (!zones.length || candles.length < 2) return [];
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const work = mergedWorkCandles(candles, tf);
  const { t1, t2 } = mergedAnalysisChartZoneTimesSnapped(work, tf);
  const out: OverlayItem[] = [];

  for (const z of zones) {
    const decline = z.scenario === 'if_decline';
    const tierClass =
      z.tier === 'S'
        ? 'merged-ares-critical-tier-s'
        : z.tier === 'A'
          ? 'merged-ares-critical-tier-a'
          : 'merged-ares-critical-tier-b';
    const idx = zoneIndexById?.get(z.id);
    const numberedLabel =
      idx != null ? mergedZoneNumberedLabel(idx, z.price) : z.labelKo;
    out.push({
      id: z.id,
      kind: decline ? 'demandZone' : 'supplyZone',
      label: numberedLabel,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1 as UTCTimestamp,
      time2: t2 as UTCTimestamp,
      price1: z.top,
      price2: z.bot,
      confidence: Math.min(98, 76 + Math.round(z.score * 0.35)),
      color: decline ? 'rgba(167,139,250,0.22)' : 'rgba(251,191,36,0.2)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-critical-zone',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        decline ? 'merged-ares-critical-decline' : 'merged-ares-critical-rally',
        tierClass,
        z.htfLabel ? 'merged-ares-critical-htf' : '',
        z.isPrimary ? 'merged-ares-critical-primary' : '',
      ]
        .filter(Boolean)
        .join(' '),
      lineLabelColor: decline ? '#c4b5fd' : '#fcd34d',
      labelBackgroundColor: decline ? 'rgba(76,29,149,0.92)' : 'rgba(120,53,15,0.9)',
      labelTextColor: '#fafafa',
      labelTooltip: `${z.statusKo} · ${z.distancePct.toFixed(1)}% · ${z.confluenceCount}합류 · 조건부 참고`,
    });
  }

  return out;
}

export function buildMergedCriticalZoneLines(
  zones: MergedCriticalZone[],
  candles: Candle[],
  timeframe?: string,
  zoneIndexById?: Map<string, number>
): OverlayItem[] {
  if (!zones.length || candles.length < 2) return [];
  const tf = normalizeChartTimeframe(timeframe ?? '1d');
  const { t1, t2 } = mergedDeskLastCandleZoneTimes(candles, tf);
  const t1n = Number(t1);
  const t2n = Number(t2);
  if (!Number.isFinite(t1n) || !Number.isFinite(t2n)) return [];
  const out: OverlayItem[] = [];

  for (const z of zones.slice(0, 8)) {
    const decline = z.scenario === 'if_decline';
    const idx = zoneIndexById?.get(z.id);
    const numberedLabel =
      idx != null ? mergedZoneNumberedLabel(idx, z.price) : `${z.labelKo} ${fmtPx(z.price)}`;
    out.push({
      id: `${z.id}-line`,
      kind: 'keyLevel',
      label: numberedLabel,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1n as UTCTimestamp,
      time2: t2n as UTCTimestamp,
      price1: z.price,
      confidence: z.tier === 'S' ? 96 : z.tier === 'A' ? 92 : 88,
      color: decline ? (z.tier === 'S' ? '#8b5cf6' : '#a78bfa') : z.tier === 'S' ? '#f59e0b' : '#fbbf24',
      category: 'structure',
      lineDash: z.tier === 'S' ? '16 4' : '14 7',
      lineStrokeWidth: z.tier === 'S' ? 2.5 : z.isPrimary ? 2 : 1.5,
      overlayZoneExtraClass: [
        'merged-ares-critical-line',
        decline ? 'merged-ares-critical-line--decline' : 'merged-ares-critical-line--rally',
        z.tier === 'S' ? 'merged-ares-critical-line--tier-s' : '',
        z.isPrimary ? 'merged-ares-critical-line--primary' : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  return out;
}

export function summarizeMergedCriticalZonesKo(zones: MergedCriticalZone[]): string {
  if (!zones.length) return '선행 핵심 없음 — TF·봉 수 확인';
  const decline = zones.filter((z) => z.scenario === 'if_decline').slice(0, 2);
  const rally = zones.filter((z) => z.scenario === 'if_rally').slice(0, 2);
  const parts: string[] = [];
  if (decline.length) {
    parts.push(decline.map((z) => z.headlineKo.replace('▼ ', '▼')).join(' · '));
  }
  if (rally.length) {
    parts.push(rally.map((z) => z.headlineKo.replace('▲ ', '▲')).join(' · '));
  }
  return parts.join('  |  ');
}

export function summarizeMergedCriticalPrimaryKo(zones: MergedCriticalZone[]): string {
  const d = zones.find((z) => z.scenario === 'if_decline' && z.isPrimary);
  const r = zones.find((z) => z.scenario === 'if_rally' && z.isPrimary);
  const lines: string[] = [];
  if (d) lines.push(`하락 → ${d.tier} ${fmtPx(d.price)} (${d.sources.slice(0, 3).join('·')})`);
  if (r) lines.push(`상승 → ${r.tier} ${fmtPx(r.price)} (${r.sources.slice(0, 3).join('·')})`);
  return lines.length ? lines.join(' · ') : summarizeMergedCriticalZonesKo(zones);
}
