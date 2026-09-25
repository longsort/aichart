/**
 * Dual-model pattern memory engine. Server-side only. No UI thread work.
 */
import path from 'path';
import { mkdirp, readUtf8IfExists, writeUtf8 } from '@/lib/patternMemory/nodeFs';
import { chronologicalSplit } from '@/lib/eagle1/chronologicalSplit';
import { walkForwardBacktest } from '@/lib/eagle1/walkForwardBacktest';
import { EAGLE1_MIN_STAT_SAMPLE } from '@/lib/eagle1/noFakeNumbers';
import { validateRawCandles } from '@/lib/eagle1/dataQualityValidator';
import { loadUniqueStore, lastClosedCandle, readStoreMeta, emptyRepair } from '@/lib/patternMemory/uniqueStore';
import { syncPatternMemoryTf } from '@/lib/patternMemory/sync';
import { computeBarFeatures } from '@/lib/patternMemory/features';
import { searchSimilarPatterns } from '@/lib/patternMemory/similarity';
import {
  DEFAULT_PLANS,
  distStats,
  horizonOutcomes,
  scorePlans,
  timeToTarget,
  walkFirstTouch,
  type PlanScore,
} from '@/lib/patternMemory/outcomes';
import { chartTfToEagle1Tf, isoUtc } from '@/lib/patternMemory/tfMap';
import {
  PATTERN_MEMORY_TFS,
  ROUND_TRIP_COST,
  TF_LOOKBACK_MS,
  TF_ROLE,
  FEE_RATE,
  SLIPPAGE_RATE,
  type DualMetrics,
  type FirstTouchResult,
  type InventoryRow,
  type PatternMemoryModel,
  type SimilarityHit,
  type StoredCandle,
  type WaitReason,
} from '@/lib/patternMemory/types';
import { appendPaperTrade, readPaperTrades } from '@/lib/patternMemory/paperStore';
import {
  buildPatternMemorySpotFuture,
  type PatternMemorySpotFuture,
} from '@/lib/patternMemory/spotFutureForecast';
import {
  buildLongShortBoard,
  enrichHitsWithAftermath,
  voteFromHits,
  type HitWithAftermath,
  type LongShortBoard,
} from '@/lib/patternMemory/longShortBoard';

const SEARCH_CAP: Record<string, number> = {
  '5m': 90_000,
  '15m': 110_000,
  '1h': 40_000,
  '4h': 12_000,
  '1d': 4_000,
  '1w': 800,
  '1M': 240,
};

function countMissing(candles: StoredCandle[], tf: string): number {
  if (candles.length < 2) return 0;
  const step = candles[1]!.openTime - candles[0]!.openTime;
  if (!(step > 0)) return 0;
  let miss = 0;
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i]!.openTime - candles[i - 1]!.openTime;
    if (d > step * 1.5) miss += Math.max(0, Math.round(d / step) - 1);
  }
  return miss;
}

function directionFromHits(hits: SimilarityHit[], candles: StoredCandle[], asOf: number): {
  direction: 'LONG' | 'SHORT' | null;
  pLong: number | null;
  sample: number;
} {
  const v = voteFromHits(hits, candles, asOf, 3);
  return { direction: v.direction, pLong: v.pLongWeighted ?? v.pLong, sample: v.sample };
}

function successFailure(hits: SimilarityHit[], candles: StoredCandle[], asOf: number, model: PatternMemoryModel) {
  const byTime = new Map(candles.map((c, i) => [c.openTime, i]));
  const success: number[] = [];
  const failure: number[] = [];
  for (const h of hits) {
    const i = byTime.get(h.openTime);
    if (i == null || i + 5 >= candles.length || i >= asOf) continue;
    const r = candles[i + 5]!.close - candles[i]!.close;
    if (r > 0) success.push(h.cosine);
    else failure.push(h.cosine);
  }
  const s = success.length ? success.reduce((a, b) => a + b, 0) / success.length : 0;
  const f = failure.length ? failure.reduce((a, b) => a + b, 0) / failure.length : 0;
  const failureRisk = s + f > 0 ? f / (s + f) : null;
  return { successSimilarity: success.length ? s : null, failureSimilarity: failure.length ? f : null, failureRisk, model };
}

function metricsFromNets(
  model: PatternMemoryModel,
  nets: number[],
  firstTp: number,
  decided: number,
  mfes: number[] = [],
  maes: number[] = []
): DualMetrics {
  const n = nets.length;
  const wins = nets.filter((x) => x > 0);
  const losses = nets.filter((x) => x < 0);
  const winSum = wins.reduce((a, b) => a + b, 0);
  const lossAbs = Math.abs(losses.reduce((a, b) => a + b, 0));
  let eq = 0;
  let peak = 0;
  let dd = 0;
  let cons = 0;
  let maxCons = 0;
  for (const x of nets) {
    eq += x;
    if (eq > peak) peak = eq;
    dd = Math.max(dd, peak - eq);
    if (x < 0) {
      cons += 1;
      maxCons = Math.max(maxCons, cons);
    } else cons = 0;
  }
  const sorted = [...nets].sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
  return {
    model,
    sampleCount: n,
    winRate: decided >= EAGLE1_MIN_STAT_SAMPLE ? firstTp / decided : null,
    evGross: n ? nets.reduce((a, b) => a + b, 0) / n + ROUND_TRIP_COST : null,
    evNet: n ? nets.reduce((a, b) => a + b, 0) / n : null,
    profitFactor: lossAbs > 0 ? winSum / lossAbs : wins.length ? null : null,
    averageR: n ? nets.reduce((a, b) => a + b, 0) / n : null,
    medianR: med,
    mfeMean: mfes.length ? mfes.reduce((a, b) => a + b, 0) / mfes.length : null,
    maeMean: maes.length ? maes.reduce((a, b) => a + b, 0) / maes.length : null,
    maxDrawdown: n >= EAGLE1_MIN_STAT_SAMPLE ? dd : null,
    consecutiveLoss: n ? maxCons : null,
    firstTouchRate: decided >= EAGLE1_MIN_STAT_SAMPLE ? firstTp / decided : null,
  };
}

function analogMetrics(model: PatternMemoryModel, walks: ReturnType<typeof walkFirstTouch>[]): DualMetrics {
  const decided = walks.filter((w) => w.result === 'TP' || w.result === 'SL');
  const tp = decided.filter((w) => w.result === 'TP').length;
  return metricsFromNets(
    model,
    walks.map((w) => w.netRNet),
    tp,
    decided.length,
    walks.map((w) => w.mfe),
    walks.map((w) => w.mae)
  );
}

function lightBacktest(params: {
  candles: StoredCandle[];
  featsEnd: number;
  model: PatternMemoryModel;
  timeframe: string;
  lowerTf?: StoredCandle[];
}): { metrics: DualMetrics; oos: DualMetrics; plans: PlanScore[]; walksForWf: { index: number; netR: number; tpFirst: boolean; slFirst: boolean; mfe: number; mae: number; family: 'pullback'; regime: string; direction: 'LONG' | 'SHORT'; grossRr: number }[] } {
  const { candles, model, timeframe } = params;
  const stride = timeframe === '5m' ? 160 : timeframe === '15m' ? 48 : timeframe === '1h' ? 16 : 8;
  const start = Math.max(80, candles.length - Math.min(8000, SEARCH_CAP[timeframe] || 8000));
  const nets: number[] = [];
  const oosNets: number[] = [];
  const mfes: number[] = [];
  const maes: number[] = [];
  const oosMfes: number[] = [];
  const oosMaes: number[] = [];
  const split = chronologicalSplit(candles.length);
  let tp = 0;
  let decided = 0;
  let oosTp = 0;
  let oosDecided = 0;
  const planWalks: { plan: (typeof DEFAULT_PLANS)[number]; walk: ReturnType<typeof walkFirstTouch> }[] = [];
  const wf: { index: number; netR: number; tpFirst: boolean; slFirst: boolean; mfe: number; mae: number; family: 'pullback'; regime: string; direction: 'LONG' | 'SHORT'; grossRr: number }[] = [];
  const feats = computeBarFeatures(candles, params.featsEnd);
  let sampled = 0;
  for (let i = start; i < params.featsEnd - 25 && sampled < 24; i += stride) {
    const f = feats.find((x) => x.index === i);
    if (!f) continue;
    const hits = searchSimilarPatterns({
      candles: candles.slice(0, i + 1),
      asOfIndex: i,
      model,
      topK: 50,
      minCosine: 0.78,
      timeframe,
      windows: [10, 20],
    });
    const dir = directionFromHits(hits, candles, i);
    if (!dir.direction) continue;
    sampled += 1;
    const walk = walkFirstTouch({
      candles,
      index: i,
      direction: dir.direction,
      atr: Math.max(f.atr, candles[i]!.close * 0.004),
      plan: DEFAULT_PLANS[1]!,
      horizon: 20,
      lowerTf: params.lowerTf,
    });
    if (walk.result === 'AMBIGUOUS') continue;
    nets.push(walk.netRNet);
    mfes.push(walk.mfe);
    maes.push(walk.mae);
    if (walk.result === 'TP' || walk.result === 'SL') decided += 1;
    if (walk.result === 'TP') tp += 1;
    planWalks.push({ plan: DEFAULT_PLANS[1]!, walk });
    wf.push({
      index: i,
      netR: walk.netRNet,
      tpFirst: walk.result === 'TP',
      slFirst: walk.result === 'SL',
      mfe: walk.mfe,
      mae: walk.mae,
      family: 'pullback',
      regime: f.regime,
      direction: dir.direction,
      grossRr: 2,
    });
    if (i >= split.valEnd) {
      oosNets.push(walk.netRNet);
      oosMfes.push(walk.mfe);
      oosMaes.push(walk.mae);
      if (walk.result === 'TP' || walk.result === 'SL') oosDecided += 1;
      if (walk.result === 'TP') oosTp += 1;
    }
  }
  return {
    metrics: metricsFromNets(model, nets, tp, decided, mfes, maes),
    oos: metricsFromNets(model, oosNets, oosTp, oosDecided, oosMfes, oosMaes),
    plans: scorePlans(planWalks),
    walksForWf: wf,
  };
}

export type PatternMemoryAnalyze = {
  symbol: string;
  timeframe: string;
  role: string;
  asOfIso: string;
  lastClosedIso: string | null;
  incremental: boolean;
  logs: string[];
  inventory: InventoryRow;
  qualityBlocked: boolean;
  unfinished: boolean;
  searchMs: number;
  candleHits: HitWithAftermath[];
  volumeHits: HitWithAftermath[];
  candleDir: 'LONG' | 'SHORT' | null;
  volumeDir: 'LONG' | 'SHORT' | null;
  candleVote: { up: number; down: number; sample: number; pLong: number | null };
  volumeVote: { up: number; down: number; sample: number; pLong: number | null };
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  waitReasons: WaitReason[];
  /** WAIT여도 롱/숏 기울기·투표 보드 */
  longShortBoard: LongShortBoard;
  outcomesSample: ReturnType<typeof horizonOutcomes>;
  firstTouch: { result: FirstTouchResult; bars: number; mfe: number; mae: number } | null;
  mfeMae: ReturnType<typeof distStats>;
  timeToTarget: ReturnType<typeof timeToTarget>;
  plans: PlanScore[];
  successFailureCandle: ReturnType<typeof successFailure>;
  successFailureVolume: ReturnType<typeof successFailure>;
  backtestCandle: DualMetrics;
  backtestVolume: DualMetrics;
  oosCandle: DualMetrics;
  oosVolume: DualMetrics;
  walkForward: ReturnType<typeof walkForwardBacktest> | null;
  calibration: { bin: string; n: number; predicted: number; actual: number | null }[];
  paperRecent: ReturnType<typeof readPaperTrades>;
  mtf: { tf: string; role: string; verdict: string }[];
  mtfConflict: boolean;
  /** 유사구간 이후 현물 상승/하락 % 참고 (거래량 네모·패턴기억 연동) */
  spotFuture: PatternMemorySpotFuture;
  note: string;
};

function inventoryOf(symbol: string, timeframe: string, candles: StoredCandle[], repair = emptyRepair(), extraDup = 0): InventoryRow {
  const q = validateRawCandles(
    candles.map((c) => ({
      exchange: 'bitget' as const,
      symbol,
      market_type: 'usdt-futures' as const,
      timeframe: chartTfToEagle1Tf(timeframe),
      open_time: c.openTime,
      close_time: c.closeTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      base_volume: c.baseVolume,
      quote_volume: c.quoteTurnover,
      source: 'bitget-merged' as const,
      downloaded_at: Date.now(),
    })),
    { symbol, timeframe: chartTfToEagle1Tf(timeframe) }
  );
  return {
    symbol,
    timeframe,
    count: candles.length,
    firstOpenTime: candles[0]?.openTime ?? null,
    lastOpenTime: candles[candles.length - 1]?.openTime ?? null,
    lastClosedOpenTime: lastClosedCandle(candles)?.openTime ?? null,
    missingCount: countMissing(candles, timeframe),
    duplicateCount: q.duplicate_count + extraDup,
    repair,
    qualitySeverity: q.severity,
    source: 'csv+overlay+bitget',
  };
}

export async function analyzePatternMemory(params: {
  symbol?: string;
  timeframe?: string;
  asOfMs?: number;
  skipBacktest?: boolean;
  skipSync?: boolean;
  fastSync?: boolean;
}): Promise<PatternMemoryAnalyze> {
  const symbol = String(params.symbol || 'BTCUSDT').toUpperCase();
  const timeframe = params.timeframe || '15m';
  const asOfMs = params.asOfMs;
  const t0 = Date.now();
  const sync = params.skipSync
    ? {
        logs: ['skipSync'],
        incremental: true,
        candles: loadUniqueStore(symbol, timeframe, {
          asOfMs,
          lookbackMs: TF_LOOKBACK_MS[timeframe] ?? null,
        }).candles.filter((c) => c.isClosed && (asOfMs == null || c.closeTime <= asOfMs)),
        repair: emptyRepair(),
        csvCount: 0,
        overlayCount: 0,
        symbol,
        timeframe,
      }
    : await syncPatternMemoryTf({
        symbol,
        timeframe,
        asOfMs,
        headFill: !params.fastSync,
        fast: !!params.fastSync,
      });

  let candles = sync.candles.filter((c) => c.isClosed && (asOfMs == null || c.closeTime <= asOfMs));
  const cap = SEARCH_CAP[timeframe] || 40_000;
  const searchSlice = candles.length > cap ? candles.slice(-cap) : candles;
  const last = lastClosedCandle(searchSlice, asOfMs ?? Date.now());
  const unfinished = !last;
  const asOfIndex = last ? searchSlice.findIndex((c) => c.openTime === last.openTime) : -1;
  const inv = inventoryOf(symbol, timeframe, candles, sync.repair, 0);
  const qualityBlocked = inv.qualitySeverity === 'fail';

  const waitReasons: WaitReason[] = [];
  if (unfinished) waitReasons.push('미완성 Candle');
  if (qualityBlocked) waitReasons.push('Data Quality BAD');
  if (searchSlice.length < 80) waitReasons.push('데이터 부족');

  let candleHits: SimilarityHit[] = [];
  let volumeHits: SimilarityHit[] = [];
  if (asOfIndex >= 50 && !unfinished) {
    candleHits = searchSimilarPatterns({
      candles: searchSlice,
      asOfIndex,
      model: 'CANDLE_ONLY',
      topK: 100,
      timeframe,
    });
    volumeHits = searchSimilarPatterns({
      candles: searchSlice,
      asOfIndex,
      model: 'CANDLE_VOLUME',
      topK: 100,
      timeframe,
    });
  }
  const searchMs = Date.now() - t0;
  if (candleHits.length < EAGLE1_MIN_STAT_SAMPLE) waitReasons.push('표본 부족');
  if (candleHits[0] && candleHits[0].cosine < 0.75) waitReasons.push('Similarity 낮음');

  const candleDir = directionFromHits(candleHits, searchSlice, asOfIndex);
  const volumeDir = directionFromHits(volumeHits, searchSlice, asOfIndex);
  if (candleDir.direction && volumeDir.direction && candleDir.direction !== volumeDir.direction) {
    waitReasons.push('Candle과 Volume 결과 충돌');
  }

  const feats = asOfIndex >= 0 ? computeBarFeatures(searchSlice, asOfIndex + 1) : [];
  const lower =
    timeframe === '15m' || timeframe === '1h'
      ? loadUniqueStore(symbol, '5m', { asOfMs }).candles.filter((c) => c.isClosed).slice(-24_000)
      : [];
  const walks: ReturnType<typeof walkFirstTouch>[] = [];
  const volumeWalks: ReturnType<typeof walkFirstTouch>[] = [];
  const walkDir = candleDir.direction;
  if (walkDir) {
    for (const h of candleHits.slice(0, 80)) {
      const i = searchSlice.findIndex((c) => c.openTime === h.openTime);
      if (i < 0 || i + 8 >= asOfIndex) continue;
      const f = feats.find((x) => x.index === i);
      walks.push(
        walkFirstTouch({
          candles: searchSlice,
          index: i,
          direction: walkDir,
          atr: Math.max(f?.atr || 0, searchSlice[i]!.close * 0.004),
          plan: DEFAULT_PLANS[1]!,
          lowerTf: lower,
        })
      );
    }
  }
  const volDir = volumeDir.direction || walkDir;
  if (volDir) {
    for (const h of volumeHits.slice(0, 80)) {
      const i = searchSlice.findIndex((c) => c.openTime === h.openTime);
      if (i < 0 || i + 8 >= asOfIndex) continue;
      const f = feats.find((x) => x.index === i);
      volumeWalks.push(
        walkFirstTouch({
          candles: searchSlice,
          index: i,
          direction: volDir,
          atr: Math.max(f?.atr || 0, searchSlice[i]!.close * 0.004),
          plan: DEFAULT_PLANS[1]!,
          lowerTf: lower,
        })
      );
    }
  }
  const decidedFt = walks.filter((w) => w.result === 'TP' || w.result === 'SL');
  const tpN = decidedFt.filter((w) => w.result === 'TP').length;
  const slN = decidedFt.filter((w) => w.result === 'SL').length;
  if (decidedFt.length >= 20 && Math.abs(tpN - slN) / decidedFt.length < 0.08) {
    waitReasons.push('First Touch 차이 작음');
  }

  const sfC = successFailure(candleHits, searchSlice, asOfIndex, 'CANDLE_ONLY');
  const sfV = successFailure(volumeHits, searchSlice, asOfIndex, 'CANDLE_VOLUME');
  if (sfC.failureRisk != null && sfC.failureRisk > 0.58) waitReasons.push('Failure Risk 높음');

  const firstTouch = walks[0]
    ? { result: walks[0].result, bars: walks[0].bars, mfe: walks[0].mfe, mae: walks[0].mae }
    : null;

  const cacheRel = path.join('index', `${symbol}_${timeframe}_bt.json`);
  let backtestCandle: DualMetrics = metricsFromNets('CANDLE_ONLY', [], 0, 0);
  let backtestVolume: DualMetrics = metricsFromNets('CANDLE_VOLUME', [], 0, 0);
  let oosCandle = backtestCandle;
  let oosVolume = backtestVolume;
  let plans: PlanScore[] = [];
  let wf: ReturnType<typeof walkForwardBacktest> | null = null;
  let usedCache = false;
  try {
    const cachedText = readUtf8IfExists(cacheRel);
    if (cachedText == null) throw new Error('pattern-memory cache missing');
    const cached = JSON.parse(cachedText) as {
      lastClosed: number;
      backtestCandle: DualMetrics;
      backtestVolume: DualMetrics;
      oosCandle: DualMetrics;
      oosVolume: DualMetrics;
      plans: PlanScore[];
      wf: ReturnType<typeof walkForwardBacktest>;
    };
    backtestCandle = cached.backtestCandle;
    backtestVolume = cached.backtestVolume;
    oosCandle = cached.oosCandle;
    oosVolume = cached.oosVolume;
    plans = cached.plans || [];
    wf = cached.wf;
    if (cached.lastClosed === last?.openTime) {
      usedCache = true;
      sync.logs.push('backtest cache hit');
    } else {
      sync.logs.push('backtest cache stale — 재계산은 backtest=1');
    }
  } catch {
    usedCache = false;
  }
  if (!usedCache && walks.length) {
    const analogC = analogMetrics('CANDLE_ONLY', walks);
    const analogV = analogMetrics('CANDLE_VOLUME', volumeWalks.length ? volumeWalks : walks);
    backtestCandle = analogC;
    backtestVolume = analogV;
    oosCandle = analogC;
    oosVolume = analogV;
    sync.logs.push(`analog first-touch nC=${walks.length} nV=${volumeWalks.length} (full WF는 backtest=1)`);
  }
  if (params.skipBacktest === false && asOfIndex > 200 && !usedCache) {
    const a = lightBacktest({ candles: searchSlice, featsEnd: asOfIndex, model: 'CANDLE_ONLY', timeframe, lowerTf: lower });
    const b = lightBacktest({ candles: searchSlice, featsEnd: asOfIndex, model: 'CANDLE_VOLUME', timeframe, lowerTf: lower });
    backtestCandle = a.metrics;
    backtestVolume = b.metrics;
    oosCandle = a.oos;
    oosVolume = b.oos;
    plans = a.plans;
    wf = walkForwardBacktest(a.walksForWf);
    try {
      mkdirp('index');
      writeUtf8(
        cacheRel,
        JSON.stringify({
          lastClosed: last?.openTime,
          backtestCandle,
          backtestVolume,
          oosCandle,
          oosVolume,
          plans,
          wf,
        })
      );
    } catch {
      /* ignore */
    }
  }
  if (backtestCandle.sampleCount >= EAGLE1_MIN_STAT_SAMPLE && backtestCandle.evNet != null && backtestCandle.evNet <= 0) {
    waitReasons.push('EV 부족');
  }
  if (plans[0]?.stability != null && plans[0].stability < 0.35) waitReasons.push('Parameter Stability 낮음');

  const mtf: { tf: string; role: string; verdict: string }[] = [];
  const mtfSearch = new Set(['15m', '1h', '4h', '1d']);
  for (const tf of PATTERN_MEMORY_TFS) {
    if (tf === timeframe) {
      mtf.push({ tf, role: TF_ROLE[tf] || '', verdict: candleDir.direction || 'WAIT' });
      continue;
    }
    const rows = loadUniqueStore(symbol, tf, { asOfMs, lookbackMs: TF_LOOKBACK_MS[tf] ?? null }).candles.filter(
      (c) => c.isClosed && (asOfMs == null || c.closeTime <= asOfMs)
    );
    if (rows.length < 40) {
      mtf.push({ tf, role: TF_ROLE[tf] || '', verdict: 'WAIT' });
      continue;
    }
    if (!mtfSearch.has(tf) || params.fastSync || params.skipBacktest !== false) {
      const a = rows[rows.length - 1]!.close;
      const b = rows[Math.max(0, rows.length - 12)]!.close;
      const verdictLite = a > b * 1.01 ? 'LONG' : a < b * 0.99 ? 'SHORT' : 'WAIT';
      mtf.push({ tf, role: TF_ROLE[tf] || '', verdict: verdictLite });
      continue;
    }
    const slice = rows.slice(-2200);
    const li = slice.length - 1;
    const hits = searchSimilarPatterns({
      candles: slice,
      asOfIndex: li,
      model: 'CANDLE_ONLY',
      topK: 40,
      minCosine: 0.74,
      timeframe: tf,
      windows: [20],
    });
    const d = directionFromHits(hits, slice, li);
    mtf.push({ tf, role: TF_ROLE[tf] || '', verdict: d.direction || 'WAIT' });
  }
  const dirs = mtf.map((m) => m.verdict).filter((v) => v === 'LONG' || v === 'SHORT');
  const mtfConflict = dirs.includes('LONG') && dirs.includes('SHORT');
  if (mtfConflict) waitReasons.push('TF 충돌 심함');

  const uniqueWait = [...new Set(waitReasons)];
  let verdict: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  const modelsAgree =
    !!candleDir.direction &&
    (!volumeDir.direction || volumeDir.direction === candleDir.direction);
  /** 하드 게이트가 비어 있고 두 모델이 같으면 확정 쪽 표시 */
  if (!uniqueWait.length && modelsAgree && candleDir.direction) {
    verdict = candleDir.direction;
  } else if (
    modelsAgree &&
    candleDir.direction &&
    candleDir.sample >= EAGLE1_MIN_STAT_SAMPLE &&
    !uniqueWait.some((r) =>
      r === 'Data Quality BAD' ||
      r === '미완성 Candle' ||
      r === '데이터 부족' ||
      r === 'Candle과 Volume 결과 충돌'
    )
  ) {
    /** 약한 게이트(EV/표본/유사도)만 남은 경우에도 모델 합의면 방향 표시 — 카드에서 참고·기울기로 구분 */
    const softOnly = uniqueWait.every((r) =>
      [
        '표본 부족',
        'Similarity 낮음',
        'EV 부족',
        'Failure Risk 높음',
        'First Touch 차이 작음',
        'Parameter Stability 낮음',
        'TF 충돌 심함',
      ].includes(r)
    );
    if (softOnly && candleDir.pLong != null && (candleDir.pLong >= 0.58 || candleDir.pLong <= 0.42)) {
      verdict = candleDir.direction;
    }
  }

  const calibBins = [
    { lo: 0.5, hi: 0.6 },
    { lo: 0.6, hi: 0.7 },
    { lo: 0.7, hi: 0.8 },
    { lo: 0.8, hi: 0.9 },
    { lo: 0.9, hi: 1.01 },
  ];
  const hitIdx = new Map(searchSlice.map((c, i) => [c.openTime, i]));
  const calibRows: { conf: number; hit: boolean }[] = [];
  const calibDir = candleDir.direction;
  if (calibDir) {
    for (const h of candleHits) {
      const i = hitIdx.get(h.openTime);
      if (i == null || i + 3 >= asOfIndex) continue;
      const up = searchSlice[i + 3]!.close > searchSlice[i]!.close;
      calibRows.push({ conf: h.cosine, hit: calibDir === 'LONG' ? up : !up });
    }
  }
  const calibration = calibBins.map((b) => {
    const xs = calibRows.filter((r) => r.conf >= b.lo && r.conf < b.hi);
    const actual = xs.length ? xs.filter((x) => x.hit).length / xs.length : null;
    return {
      bin: `${Math.round(b.lo * 100)}-${Math.round(b.hi * 100)}`,
      n: xs.length,
      predicted: (b.lo + b.hi) / 2,
      actual,
    };
  });

  if (last) {
    const prev = readPaperTrades(symbol, 20);
    const dup = prev.some((p) => p.signalTime === last.openTime && p.timeframe === timeframe);
    if (!dup) {
      appendPaperTrade({
        symbol,
        timeframe,
        signalTime: last.openTime,
        direction: verdict,
        entry: last.close,
        sl: null,
        tp: null,
        predictedProbability: candleDir.pLong,
        confidence: candleHits[0]?.cosine ?? null,
        expectedMfe: walks.length ? walks.reduce((s, w) => s + w.mfe, 0) / walks.length : null,
        expectedMae: walks.length ? walks.reduce((s, w) => s + w.mae, 0) / walks.length : null,
        actualMfe: null,
        actualMae: null,
        tpHit: null,
        slHit: null,
        outcome: verdict === 'WAIT' ? 'WAIT' : 'OPEN',
        fee: FEE_RATE,
        slippage: SLIPPAGE_RATE,
        model: 'BOTH',
      });
    }
  }

  const spotHits = volumeHits.length >= 12 ? volumeHits : candleHits;
  const spotFuture = buildPatternMemorySpotFuture({
    candles: searchSlice,
    hits: spotHits,
    asOfIndex: Math.max(0, asOfIndex),
    side: verdict,
    horizonBars: 10,
  });

  const candleHitsOut = enrichHitsWithAftermath(candleHits.slice(0, 12), searchSlice, Math.max(0, asOfIndex));
  const volumeHitsOut = enrichHitsWithAftermath(volumeHits.slice(0, 12), searchSlice, Math.max(0, asOfIndex));
  const candleVoteFull = voteFromHits(candleHits, searchSlice, Math.max(0, asOfIndex), 3);
  const volumeVoteFull = voteFromHits(volumeHits, searchSlice, Math.max(0, asOfIndex), 3);

  const longShortBoard = buildLongShortBoard({
    candleHits,
    volumeHits,
    candles: searchSlice,
    asOfIndex: Math.max(0, asOfIndex),
    firstTouchTp: tpN,
    firstTouchSl: slN,
    mtfVerdicts: mtf.map((m) => m.verdict),
    spotClosePct: spotFuture.closePct,
    hardVerdict: verdict,
  });

  /** 하드 WAIT인데 보드 기울기가 분명하면 표시용 쪽을 보강(판정 자체는 WAIT 유지 가능) */
  if (verdict === 'WAIT' && longShortBoard.lean !== 'WAIT' && Math.abs(longShortBoard.leanScore) >= 28) {
    sync.logs.push(`lean=${longShortBoard.lean} score=${longShortBoard.leanScore} (hard WAIT 유지)`);
  }

  return {
    symbol,
    timeframe,
    role: TF_ROLE[timeframe] || '',
    asOfIso: isoUtc(asOfMs ?? Date.now()),
    lastClosedIso: last ? isoUtc(last.openTime) : null,
    incremental: sync.incremental,
    logs: sync.logs,
    inventory: inv,
    qualityBlocked,
    unfinished,
    searchMs,
    candleHits: candleHitsOut,
    volumeHits: volumeHitsOut,
    candleDir: candleDir.direction,
    volumeDir: volumeDir.direction,
    candleVote: {
      up: candleVoteFull.up,
      down: candleVoteFull.down,
      sample: candleVoteFull.sample,
      pLong: candleVoteFull.pLongWeighted ?? candleVoteFull.pLong,
    },
    volumeVote: {
      up: volumeVoteFull.up,
      down: volumeVoteFull.down,
      sample: volumeVoteFull.sample,
      pLong: volumeVoteFull.pLongWeighted ?? volumeVoteFull.pLong,
    },
    verdict,
    waitReasons: uniqueWait,
    longShortBoard,
    outcomesSample: (() => {
      const src = candleHits.find((h) => {
        const i = searchSlice.findIndex((c) => c.openTime === h.openTime);
        return i >= 0 && i + 20 < asOfIndex;
      });
      if (!src) return [];
      const i = searchSlice.findIndex((c) => c.openTime === src.openTime);
      return i >= 0 ? horizonOutcomes(searchSlice, i) : [];
    })(),
    firstTouch,
    mfeMae: distStats(walks.map((w) => w.mfe)),
    timeToTarget: timeToTarget(walks),
    plans,
    successFailureCandle: sfC,
    successFailureVolume: sfV,
    backtestCandle,
    backtestVolume,
    oosCandle,
    oosVolume,
    walkForward: wf,
    calibration,
    paperRecent: readPaperTrades(symbol, 8),
    mtf,
    mtfConflict,
    spotFuture,
    note: '승률·EV·기울기는 표본·유사도 가중 참고. 확정 수익 아님. Candle+Volume이 항상 우월하지 않음.',
  };
}

export function listInventory(symbol = 'BTCUSDT'): InventoryRow[] {
  return PATTERN_MEMORY_TFS.map((tf) => {
    const lookback = TF_LOOKBACK_MS[tf] ?? null;
    const { candles, duplicateDropped } = loadUniqueStore(symbol, tf, { lookbackMs: lookback });
    const closed = candles.filter((c) => c.isClosed);
    const meta = readStoreMeta(symbol, tf);
    return inventoryOf(symbol, tf, closed, meta?.repair || emptyRepair(), duplicateDropped);
  });
}
