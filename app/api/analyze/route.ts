import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketCandles } from '@/lib/market';
import { analyzeCandles } from '@/lib/analyze';
import { fetchMarketData } from '@/lib/data/dataService';
import { buildBriefingContext } from '@/lib/briefingContext';
import { buildCloseSettlementBoard } from '@/lib/closeSettlement';
import { computeCloseLevels } from '@/lib/closeLevelEngine';
import { computeCloseState } from '@/lib/closeStateEngine';
import { computeCloseScenario } from '@/lib/closeScenarioEngine';
import { runStrongZonePipeline, strongZonesToOverlays } from '@/lib/zone';
import { computeSwingTapPoint } from '@/lib/swingTapPoint';
import { computeConfirmedSignal } from '@/lib/confirmedSignalEngine';
import { ZONE_PRICE_FLOOR, ZONE_PRICE_CEIL, visibleLimit } from '../../../lib/constants';
import { getOrderbookDepthAtPrice, orderbookDepthLabel } from '@/lib/data/aggregate/orderbookDepthAtPrice';
import { tradesAtPriceZone } from '@/lib/data/aggregate/tradesAtPriceZone';
import { OVERLAY_COLORS, CLOSE_TF_COLORS } from '@/lib/overlayColors';

export const dynamic = 'force-dynamic';

const ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:8000';

type PythonSignal = {
  symbol: string;
  direction: string;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  probability: number;
  liquidity_target: number;
  scenario: string;
  trend: string;
  timestamp: string;
};

async function fetchPythonSignal(symbol: string, timeframe: string): Promise<PythonSignal | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, timeframe, exchange: 'binance' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const HTF_MAP: Record<string, string> = {
  '1m': '5m', '3m': '15m', '5m': '15m', '15m': '1h',
  '1h': '4h', '4h': '1d', '1d': '1w', '1w': '1M', '1M': '1Y', '1Y': '1Y',
};
const LTF_MAP: Record<string, string> = {
  '1m': '1m', '3m': '1m', '5m': '1m', '15m': '5m',
  '1h': '15m', '4h': '1h', '1d': '4h', '1w': '1d', '1M': '1w', '1Y': '1M',
};

function mapVerdict(direction: string): 'LONG' | 'SHORT' | 'WATCH' {
  if (direction === 'long') return 'LONG';
  if (direction === 'short') return 'SHORT';
  return 'WATCH';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '4h';
  const useCollect = searchParams.get('collect') === '1';

  try {
    const htf = HTF_MAP[timeframe] || '1d';
    const ltf = LTF_MAP[timeframe] || '1h';

    let candles: Awaited<ReturnType<typeof fetchMarketCandles>>;
    let marketData: Awaited<ReturnType<typeof fetchMarketData>> | null = null;

    if (useCollect) {
      try {
        marketData = await fetchMarketData(symbol, timeframe);
        candles = marketData.candles;
      } catch {
        candles = await fetchMarketCandles(symbol, timeframe);
      }
    } else {
      candles = await fetchMarketCandles(symbol, timeframe);
    }

    const [pythonSignal, htfCandles, ltfCandles, candles1d, candles1w, candles1M, candles1m, candles5m, candles15m, candles1h, candles4h] = await Promise.all([
      fetchPythonSignal(symbol, timeframe),
      timeframe !== htf ? fetchMarketCandles(symbol, htf) : Promise.resolve(null),
      timeframe !== ltf ? fetchMarketCandles(symbol, ltf) : Promise.resolve(null),
      fetchMarketCandles(symbol, '1d'),
      fetchMarketCandles(symbol, '1w'),
      fetchMarketCandles(symbol, '1M'),
      fetchMarketCandles(symbol, '1m'),
      fetchMarketCandles(symbol, '5m'),
      fetchMarketCandles(symbol, '15m'),
      fetchMarketCandles(symbol, '1h'),
      fetchMarketCandles(symbol, '4h'),
    ]);

    const htfEngine = htfCandles ? analyzeCandles(symbol, htf, htfCandles).engine : null;
    const analysis1M = candles1M?.length ? analyzeCandles(symbol, '1M', candles1M) : null;
    const engine1M = analysis1M?.engine ?? null;
    const trend1M = engine1M?.trend ?? null;
    const analysisOptions: { htfTrend?: 'bullish' | 'bearish' | 'range'; trend1M?: 'bullish' | 'bearish' | 'range' | null; volumeDelta?: number; orderbookImbalance?: number; oiState?: 'increasing' | 'decreasing' | 'neutral'; fundingState?: 'positive' | 'negative' | 'neutral' } = {
      htfTrend: htfEngine?.trend,
      trend1M: trend1M as 'bullish' | 'bearish' | 'range' | null,
    };
    if (marketData) {
      analysisOptions.volumeDelta = marketData.volumeDelta;
      analysisOptions.orderbookImbalance = marketData.orderbookImbalance;
      analysisOptions.oiState = marketData.oiState;
      analysisOptions.fundingState = marketData.fundingState;
    }
    const tsAnalysis = analyzeCandles(symbol, timeframe, candles, analysisOptions);
    const tapSource = tsAnalysis;

    const nowSec = Math.floor(Date.now() / 1000);
    const lastClosed = (arr: { open: number; close: number }[] | null): { open: number; close: number } | null => {
      if (!arr || arr.length === 0) return null;
      const c = arr[arr.length >= 2 ? arr.length - 2 : arr.length - 1];
      return { open: c.open, close: c.close };
    };
    const lastCandleByTf: Record<string, { open: number; close: number }> = {};
    [
      ['1m', candles1m],
      ['5m', candles5m],
      ['15m', candles15m],
      ['1h', candles1h],
      ['4h', candles4h],
      ['1d', candles1d],
      ['1w', candles1w],
      ['1M', candles1M],
    ].forEach(([tf, arr]) => {
      const c = lastClosed(arr as { open: number; close: number }[] | null);
      if (c) lastCandleByTf[tf as string] = c;
    });
    const closeSettlement = buildCloseSettlementBoard(nowSec, tsAnalysis.verdict, Object.keys(lastCandleByTf).length > 0 ? lastCandleByTf : undefined);

    const htfTrend = htfEngine?.trend ?? null;
    const ltfTrend = ltfCandles ? analyzeCandles(symbol, ltf, ltfCandles).engine?.trend : null;
    const multiTF = {
      htf: htfTrend ? (htfTrend === 'bullish' ? '상승' : htfTrend === 'bearish' ? '하락' : '횡보') : null,
      ltf: ltfTrend ? (ltfTrend === 'bullish' ? '상승' : ltfTrend === 'bearish' ? '하락' : '횡보') : null,
      trend1M: trend1M ? (trend1M === 'bullish' ? '상승' : trend1M === 'bearish' ? '하락' : '횡보') : null,
      htfLabel: htf,
      ltfLabel: ltf,
    };

    if (pythonSignal) {
      const pyVerdict = mapVerdict(pythonSignal.direction) as 'LONG' | 'SHORT' | 'WATCH';
      const closeLevels = computeCloseLevels({
        candles1d,
        candles1w,
        candles1M,
        candles1m,
        candles5m,
        candles15m,
        candles1h,
        candles4h,
      });
      const currentPriceClose = candles.length > 0 ? candles[candles.length - 1].close : 0;
      const closeStateResult = computeCloseState(currentPriceClose, closeLevels);
      const rsiSig = tsAnalysis.rsiDivergenceSignal as { verdict?: string; totalScore?: number; longScore?: number; shortScore?: number } | undefined;
      const engineFvgPy = (tsAnalysis.engine as { fvg?: Array<{ low: number; high: number; bias: 'bullish' | 'bearish'; valid?: boolean }> })?.fvg ?? [];
      const fvgBoundariesPy = engineFvgPy.filter((f: { valid?: boolean }) => f.valid).map((f: { low: number; high: number; bias: 'bullish' | 'bearish' }) => ({ low: f.low, high: f.high, bias: f.bias }));
      const confirmedSignal =
        pyVerdict === 'LONG' || pyVerdict === 'SHORT'
          ? computeConfirmedSignal({
              verdict: pyVerdict,
              currentPrice: currentPriceClose,
              supportLevel: tsAnalysis.supportLevel ?? null,
              resistanceLevel: tsAnalysis.resistanceLevel ?? null,
              rsiVerdict: (rsiSig?.verdict as 'LONG' | 'SHORT' | 'WATCH' | 'NONE') ?? 'NONE',
              rsiScore: rsiSig?.totalScore ?? (pyVerdict === 'LONG' ? rsiSig?.longScore : rsiSig?.shortScore) ?? 0,
              dailyState: closeStateResult.dailyState,
              weeklyState: closeStateResult.weeklyState,
              mtfAgainst: {
                htf: (htfTrend as 'bullish' | 'bearish' | 'range') ?? undefined,
                ltf: (ltfTrend as 'bullish' | 'bearish' | 'range') ?? undefined,
                trend1M: (trend1M as 'bullish' | 'bearish' | 'range') ?? undefined,
              },
              fvgBoundaries: fvgBoundariesPy,
            })
          : { confirmed: false, direction: null as 'LONG' | 'SHORT' | null, structure: false, rsi: false, supportResistance: false, close: false, fvgZone: false, reasons: [] };

      return NextResponse.json({
        ...tsAnalysis,
        verdict: pyVerdict,
        confidence: Math.round(pythonSignal.probability),
        entry: pythonSignal.entry.toFixed(2),
        stopLoss: pythonSignal.stop.toFixed(2),
        targets: [
          pythonSignal.tp1.toFixed(2),
          pythonSignal.tp2.toFixed(2),
          pythonSignal.tp3.toFixed(2),
        ],
        summary: `${symbol} ${timeframe} | ${pythonSignal.trend} | 확률 ${pythonSignal.probability.toFixed(0)}% | ${pythonSignal.scenario}`,
        engine: {
          ...tsAnalysis.engine,
          direction: pythonSignal.direction,
          liquidity_target: pythonSignal.liquidity_target,
          scenario: pythonSignal.scenario,
          pythonEngine: true,
          multiTF,
        },
        multiTF,
        engine1M: engine1M ? { trend: engine1M.trend, bos: engine1M.bos, choch: engine1M.choch, fvg: engine1M.fvg, patterns: engine1M.patterns, sweeps: engine1M.sweeps } : null,
        closeSettlement,
        confirmedSignal,
      });
    }

    const mainTrend = tsAnalysis.engine?.trend;
    const trendKo = mainTrend === 'bullish' ? '상승' : mainTrend === 'bearish' ? '하락' : '횡보';
    const summaryWithMTF = multiTF.htf || multiTF.ltf || multiTF.trend1M
      ? `${symbol} ${timeframe} ${trendKo}${multiTF.trend1M ? ` | 1M: ${multiTF.trend1M}` : ''}${multiTF.htf || multiTF.ltf ? ` | HTF ${multiTF.htfLabel}: ${multiTF.htf || '-'} | LTF ${multiTF.ltfLabel}: ${multiTF.ltf || '-'}` : ''}`
      : tsAnalysis.summary;

    const briefingContext = marketData
      ? buildBriefingContext(
          { ...tsAnalysis, summary: summaryWithMTF, multiTF },
          {
            currentPrice: marketData.currentPrice,
            buyPressure: marketData.buyPressure,
            sellPressure: marketData.sellPressure,
            volumeDelta: marketData.volumeDelta,
            oiState: marketData.oiState,
            fundingState: marketData.fundingState,
            orderbookImbalance: marketData.orderbookImbalance,
          }
        )
      : buildBriefingContext({ ...tsAnalysis, summary: summaryWithMTF, multiTF });

    let zonePayload: {
      nearestBuyZone?: typeof tsAnalysis.nearestBuyZone;
      nearestSellZone?: typeof tsAnalysis.nearestSellZone;
      strongZoneOverlays?: typeof tsAnalysis.strongZoneOverlays;
      buyZones?: Array<{ low: number; high: number; probability?: number }>;
      sellZones?: Array<{ low: number; high: number; probability?: number }>;
      verdict?: typeof tsAnalysis.verdict;
      confidence?: number;
      buyZoneProbability?: number;
      sellZoneProbability?: number;
      holdProbability?: number;
      breakProbability?: number;
      trapRisk?: number;
    } = {};
    if (marketData && marketData.currentPrice > 0) {
      try {
        const zoneResult = runStrongZonePipeline(
          marketData.orderbook ?? null,
          marketData.trades ?? [],
          marketData.currentPrice
        );
        const visible = marketData.candles.slice(-visibleLimit(timeframe));
        const strongZoneOverlays = strongZonesToOverlays(
          zoneResult.buyZones,
          zoneResult.sellZones,
          ZONE_PRICE_FLOOR,
          ZONE_PRICE_CEIL,
          visible.length
        );
        zonePayload = {
          nearestBuyZone: zoneResult.nearestBuyZone,
          nearestSellZone: zoneResult.nearestSellZone,
          strongZoneOverlays,
          buyZones: zoneResult.buyZones,
          sellZones: zoneResult.sellZones,
          verdict: zoneResult.verdict,
          confidence: zoneResult.confidence,
          buyZoneProbability: zoneResult.nearestBuyZone?.probability,
          sellZoneProbability: zoneResult.nearestSellZone?.probability,
          holdProbability: zoneResult.nearestBuyZone?.holdProbability,
          breakProbability: zoneResult.nearestSellZone?.breakProbability,
          trapRisk: zoneResult.nearestBuyZone?.trapRisk ?? zoneResult.nearestSellZone?.trapRisk,
        };
      } catch (_) {}
    }

    let supportObOrderbookDepth: 'many' | 'few' | 'medium' | undefined;
    let resistanceObOrderbookDepth: 'many' | 'few' | 'medium' | undefined;
    if (marketData?.orderbook && marketData.orderbook.bids.length > 0 && marketData.orderbook.asks.length > 0) {
      const sup = tsAnalysis.nearestSupportOb;
      const res = tsAnalysis.nearestResistanceOb;
      if (sup) supportObOrderbookDepth = orderbookDepthLabel(marketData.orderbook, (sup.low + sup.high) / 2);
      if (res) resistanceObOrderbookDepth = orderbookDepthLabel(marketData.orderbook, (res.low + res.high) / 2);
    }

    // 돌파 상승 확률: 오더북 매수우위 + 매도체결 감소 시 상향
    let breakoutUpsideProbability: number | undefined;
    let breakoutUpsideReasons: string[] = [];
    if (marketData != null && tapSource.verdict === 'LONG') {
      const base = Math.min(95, tapSource.confidence ?? 70);
      let prob = base;
      const imb = marketData.orderbookImbalance ?? briefingContext?.orderbookImbalance;
      const sellP = marketData.sellPressure ?? briefingContext?.sellPressure;
      if (typeof imb === 'number' && imb > 0.05) {
        prob += 10;
        breakoutUpsideReasons.push('오더북 매수우위');
      }
      if (typeof sellP === 'number' && sellP < 0.45) {
        prob += 10;
        breakoutUpsideReasons.push('매도체결 감소');
      }
      breakoutUpsideProbability = Math.min(95, prob);
      if (breakoutUpsideReasons.length === 0) breakoutUpsideReasons.push('기본 신호');
    }

    // 돌파 구간 가격대별 확률 (차트 "돌파시 매수/매도" 라벨에 표시)
    const pctZone = 0.002;
    let breakoutLevelProbability: number | undefined;
    let invalidationLevelProbability: number | undefined;
    let supportLevelProbability: number | undefined;
    let resistanceLevelProbability: number | undefined;
    let entryHoldProbability: number | undefined;
    let harmonicDProbability: number | undefined;
    if (marketData?.orderbook && marketData.orderbook.bids.length > 0 && marketData.orderbook.asks.length > 0 && marketData.trades.length > 0) {
      const ob = marketData.orderbook;
      const trades = marketData.trades;
      const levelProbability = (price: number, mode: 'support' | 'resistance' | 'breakout' | 'entry-hold') => {
        const depth = getOrderbookDepthAtPrice(ob, price, pctZone);
        const zone = tradesAtPriceZone(trades, price, pctZone);
        let prob = Math.min(95, tapSource.confidence ?? 70);
        if (mode === 'support' || mode === 'entry-hold') {
          if (depth.totalQty > 0 && depth.bidQty > depth.askQty * 1.2) prob += 8;
          if (zone.tradeCount >= 5 && zone.buyPressure > 0.55) prob += 10;
        } else if (mode === 'resistance') {
          if (depth.totalQty > 0 && depth.askQty > depth.bidQty * 1.2) prob += 8;
          if (zone.tradeCount >= 5 && zone.sellPressure > 0.55) prob += 10;
        } else {
          // breakout
          if (depth.totalQty > 0 && depth.askQty < depth.bidQty * 0.75) prob += 10;
          if (zone.tradeCount >= 5 && zone.sellPressure < 0.45) prob += 10;
        }
        return Math.min(95, Math.max(20, Math.round(prob)));
      };
      if (tapSource.breakoutLevel) {
        const price = tapSource.breakoutLevel.price;
        breakoutLevelProbability = levelProbability(price, 'breakout');
      }
      if (tapSource.invalidationLevel) {
        const price = tapSource.invalidationLevel.price;
        const depth = getOrderbookDepthAtPrice(ob, price, pctZone);
        const zone = tradesAtPriceZone(trades, price, pctZone);
        let prob = Math.min(95, tapSource.confidence ?? 70);
        if (depth.totalQty > 0 && depth.bidQty < depth.askQty * 0.7) {
          prob += 10;
        }
        if (zone.tradeCount >= 5 && zone.buyPressure < 0.45) {
          prob += 10;
        }
        invalidationLevelProbability = Math.min(95, prob);
      }
      if (tapSource.supportLevel) {
        supportLevelProbability = levelProbability(tapSource.supportLevel.price, 'support');
      }
      if (tapSource.resistanceLevel) {
        resistanceLevelProbability = levelProbability(tapSource.resistanceLevel.price, 'resistance');
      }
      const entryPriceNum = parseFloat(tapSource.entry);
      if (!isNaN(entryPriceNum) && entryPriceNum > 0) {
        entryHoldProbability = levelProbability(entryPriceNum, 'entry-hold');
      }
      const harmonicList = Array.isArray((tapSource.engine as any)?.harmonics) ? (tapSource.engine as any).harmonics : [];
      const butterfly = harmonicList.find((h: any) => h?.pattern === 'butterfly' && typeof h?.dPrice === 'number');
      if (butterfly?.dPrice) {
        harmonicDProbability = levelProbability(butterfly.dPrice, butterfly.bias === 'bullish' ? 'support' : 'resistance');
      }
    }

    const entryNum = parseFloat(tapSource.entry);
    const currentPriceForExec = briefingContext.currentPrice ?? 0;
    let executionState: 'CONFIRMED' | undefined;
    if (tapSource.verdict === 'LONG' && entryNum > 0 && currentPriceForExec >= entryNum) executionState = 'CONFIRMED';
    if (tapSource.verdict === 'SHORT' && entryNum > 0 && currentPriceForExec <= entryNum) executionState = 'CONFIRMED';
    // 타점 확정: breakout + retest(support) + entry-hold 확률 기준 충족
    const tapPointConfirmed = Boolean(
      (breakoutLevelProbability ?? 0) >= 70 &&
      (supportLevelProbability ?? 0) >= 70 &&
      (entryHoldProbability ?? 0) >= 70 &&
      executionState === 'CONFIRMED'
    );

    const currentPriceClose = briefingContext.currentPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : 0);
    const closeLevels = computeCloseLevels({
      candles1d,
      candles1w,
      candles1M,
      candles1m,
      candles5m,
      candles15m,
      candles1h,
      candles4h,
    });
    const closeStateResult = computeCloseState(currentPriceClose, closeLevels);
    const closeScenarioResult = computeCloseScenario(closeLevels, closeStateResult);

    // 5요소 확정(엄격): 구조 + RSI 85+ + 지지/저항 0.3% + 일·주 종가 모두 + FVG 확정 존 + MTF
    const rsiSig = tapSource.rsiDivergenceSignal as { verdict?: string; totalScore?: number; longScore?: number; shortScore?: number } | undefined;
    const engineFvg = (tapSource.engine as { fvg?: Array<{ low: number; high: number; bias: 'bullish' | 'bearish'; valid?: boolean }> })?.fvg ?? [];
    const fvgBoundaries = engineFvg.filter((f: { valid?: boolean }) => f.valid).map((f: { low: number; high: number; bias: 'bullish' | 'bearish' }) => ({ low: f.low, high: f.high, bias: f.bias }));
    const confirmedSignal =
      tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT'
        ? computeConfirmedSignal({
            verdict: tapSource.verdict,
            currentPrice: currentPriceClose,
            supportLevel: tapSource.supportLevel ?? null,
            resistanceLevel: tapSource.resistanceLevel ?? null,
            rsiVerdict: (rsiSig?.verdict as 'LONG' | 'SHORT' | 'WATCH' | 'NONE') ?? 'NONE',
            rsiScore: rsiSig?.totalScore ?? (tapSource.verdict === 'LONG' ? rsiSig?.longScore : rsiSig?.shortScore) ?? 0,
            dailyState: closeStateResult.dailyState,
            weeklyState: closeStateResult.weeklyState,
            mtfAgainst: {
              htf: (htfTrend as 'bullish' | 'bearish' | 'range') ?? undefined,
              ltf: (ltfTrend as 'bullish' | 'bearish' | 'range') ?? undefined,
              trend1M: (trend1M as 'bullish' | 'bearish' | 'range') ?? undefined,
            },
            fvgBoundaries,
          })
        : { confirmed: false, direction: null as 'LONG' | 'SHORT' | null, structure: false, rsi: false, supportResistance: false, close: false, fvgZone: false, reasons: [] };

    if (zonePayload.nearestBuyZone && closeScenarioResult.buyZoneBoost > 0) {
      zonePayload = {
        ...zonePayload,
        nearestBuyZone: { ...zonePayload.nearestBuyZone, probability: Math.min(95, (zonePayload.nearestBuyZone.probability ?? 0) + closeScenarioResult.buyZoneBoost) },
        buyZoneProbability: Math.min(95, (zonePayload.buyZoneProbability ?? 0) + closeScenarioResult.buyZoneBoost),
      };
    }
    if (zonePayload.nearestSellZone && closeScenarioResult.sellZoneBoost > 0) {
      zonePayload = {
        ...zonePayload,
        nearestSellZone: { ...zonePayload.nearestSellZone, probability: Math.min(95, (zonePayload.nearestSellZone.probability ?? 0) + closeScenarioResult.sellZoneBoost) },
        sellZoneProbability: Math.min(95, (zonePayload.sellZoneProbability ?? 0) + closeScenarioResult.sellZoneBoost),
      };
    }

    // 종가선: 4h/1w 등 어떤 타임프레임에서도 1m~월봉 종가 전부 표시. 가격 범위를 종가 레벨 포함하도록 넓혀서 y비율 계산하고, 클라이언트에 이 범위 전달.
    const limit = visibleLimit(timeframe);
    const visibleForClose = candles.slice(-limit);
    const candleMin = visibleForClose.length ? Math.min(...visibleForClose.map((c: { low: number }) => c.low)) : 0;
    const candleMax = visibleForClose.length ? Math.max(...visibleForClose.map((c: { high: number }) => c.high)) : 0;
    const allCloseLevels = [
      closeLevels.close1m,
      closeLevels.close5m,
      closeLevels.close15m,
      closeLevels.close1h,
      closeLevels.close4h,
      closeLevels.dailyCloseLevel,
      closeLevels.weeklyCloseLevel,
      closeLevels.monthlyCloseLevel,
    ].filter((p): p is number => p != null);
    const rangeMin = allCloseLevels.length ? Math.min(candleMin, ...allCloseLevels) : candleMin;
    const rangeMax = allCloseLevels.length ? Math.max(candleMax, ...allCloseLevels) : candleMax;
    const pad = Math.max(1e-9, (rangeMax - rangeMin) * 0.05) || 1;
    const closeRangeMin = rangeMin - pad;
    const closeRangeMax = rangeMax + pad;
    const toRatioClose = (p: number) => (closeRangeMax - p) / Math.max(1e-9, closeRangeMax - closeRangeMin);
    const closeOverlays: Array<{ id: string; kind: string; label: string; x1: number; y1: number; x2: number; y2: number; confidence: number; color: string; category: string }> = [];
    const closeStateLabel = (state: string | null, prefix: string) =>
      state === 'accepted_above' ? `${prefix} 종가 위 안착` : state === 'accepted_below' ? `${prefix} 종가 아래` : `${prefix} 종가 재진입`;
    const C = OVERLAY_COLORS;
    const closeTfConfig: Array<{ id: string; level: number | null | undefined; state: string | null | undefined; label: string; color: string }> = [
      { id: 'close-1m', level: closeLevels.close1m, state: closeStateResult.state1m, label: '1m', color: CLOSE_TF_COLORS['close-1m']! },
      { id: 'close-5m', level: closeLevels.close5m, state: closeStateResult.state5m, label: '5m', color: CLOSE_TF_COLORS['close-5m']! },
      { id: 'close-15m', level: closeLevels.close15m, state: closeStateResult.state15m, label: '15m', color: CLOSE_TF_COLORS['close-15m']! },
      { id: 'close-1h', level: closeLevels.close1h, state: closeStateResult.state1h, label: '1h', color: CLOSE_TF_COLORS['close-1h']! },
      { id: 'close-4h', level: closeLevels.close4h, state: closeStateResult.state4h, label: '4h', color: CLOSE_TF_COLORS['close-4h']! },
      { id: 'close-daily', level: closeLevels.dailyCloseLevel, state: closeStateResult.dailyState, label: '일봉', color: CLOSE_TF_COLORS['close-daily']! },
      { id: 'close-weekly', level: closeLevels.weeklyCloseLevel, state: closeStateResult.weeklyState, label: '주봉', color: CLOSE_TF_COLORS['close-weekly']! },
      { id: 'close-monthly', level: closeLevels.monthlyCloseLevel, state: closeStateResult.monthlyState, label: '월봉', color: CLOSE_TF_COLORS['close-monthly']! },
    ];
    closeTfConfig.forEach(({ id, level, state, label, color }) => {
      if (level != null) {
        closeOverlays.push({ id, kind: 'keyLevel', label: closeStateLabel(state ?? null, label), x1: 0.02, y1: toRatioClose(level), x2: 0.98, y2: toRatioClose(level), confidence: 85, color, category: 'keyLevel' });
      }
    });
    // 이미지 스타일 타점 안내: BREAKOUT -> RETEST(SUPPORT) -> ENTRY -> TARGET (달봉 분석 공통 적용)
    const tapFullX1 = 0.04;
    const tapFullX2 = 0.98;
    const tapRightX1 = 0.76;
    const tapRightX2 = 0.98;
    const verdictDirChip =
      tapSource.verdict === 'LONG' ? '롱' : tapSource.verdict === 'SHORT' ? '숏' : '관망';
    if (tapSource.breakoutLevel?.price != null) {
      closeOverlays.push({
        id: 'tap-breakout',
        kind: 'keyLevel',
        label: `돌파${breakoutLevelProbability != null ? ` · ${breakoutLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.breakoutLevel.price),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.breakoutLevel.price),
        confidence: breakoutLevelProbability ?? 80,
        color: C.tapBreakout,
        category: 'keyLevel',
      });
    }
    if (tapSource.verdict === 'LONG' && tapSource.resistanceLevel?.price != null && tapSource.breakoutLevel?.price != null) {
      closeOverlays.push({
        id: 'tap-trendline',
        kind: 'scenario',
        label: '추세선',
        x1: 0.22,
        y1: toRatioClose(tapSource.resistanceLevel.price * 1.01),
        x2: 0.74,
        y2: toRatioClose(tapSource.breakoutLevel.price),
        confidence: breakoutLevelProbability ?? 76,
        color: C.tapTrendline,
        category: 'structure',
      });
    }
    if (tapSource.verdict === 'SHORT' && tapSource.supportLevel?.price != null && tapSource.invalidationLevel?.price != null) {
      closeOverlays.push({
        id: 'tap-trendline',
        kind: 'scenario',
        label: '추세선',
        x1: 0.22,
        y1: toRatioClose(tapSource.supportLevel.price * 0.99),
        x2: 0.74,
        y2: toRatioClose(tapSource.invalidationLevel.price),
        confidence: invalidationLevelProbability ?? 76,
        color: C.tapTrendline,
        category: 'structure',
      });
    }
    if (tapSource.supportLevel?.price != null) {
      const supportBoxPad = tapSource.supportLevel.price * 0.0022;
      closeOverlays.push({
        id: 'tap-support-zone',
        kind: 'demandZone',
        label: `지지 구간${supportLevelProbability != null ? ` · ${supportLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.supportLevel.price + supportBoxPad),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.supportLevel.price - supportBoxPad),
        confidence: supportLevelProbability ?? 76,
        color: C.tapSupportZone,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-retest-support',
        kind: 'keyLevel',
        label: `지지선${supportLevelProbability != null ? ` · 지지 ${supportLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.supportLevel.price),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.supportLevel.price),
        confidence: supportLevelProbability ?? 78,
        color: C.tapSupportLine,
        category: 'keyLevel',
      });
      // 이미지 스타일처럼 SUPPORT 라벨 반복 표시
      closeOverlays.push({
        id: 'tap-retest-support-2',
        kind: 'keyLevel',
        label: `지지선`,
        x1: 0.32,
        y1: toRatioClose(tapSource.supportLevel.price),
        x2: 0.66,
        y2: toRatioClose(tapSource.supportLevel.price),
        confidence: supportLevelProbability ?? 76,
        color: C.tapSupportLine,
        category: 'keyLevel',
      });
    }
    if (tapSource.resistanceLevel?.price != null) {
      const resistanceBoxPad = tapSource.resistanceLevel.price * 0.0022;
      closeOverlays.push({
        id: 'tap-resistance-zone',
        kind: 'supplyZone',
        label: `저항 구간${resistanceLevelProbability != null ? ` · ${resistanceLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.resistanceLevel.price + resistanceBoxPad),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.resistanceLevel.price - resistanceBoxPad),
        confidence: resistanceLevelProbability ?? 76,
        color: C.tapResistanceZone,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-resistance',
        kind: 'keyLevel',
        label: `저항선${resistanceLevelProbability != null ? ` · 저항 ${resistanceLevelProbability}%` : ''}`,
        x1: tapFullX1,
        y1: toRatioClose(tapSource.resistanceLevel.price),
        x2: tapFullX2,
        y2: toRatioClose(tapSource.resistanceLevel.price),
        confidence: resistanceLevelProbability ?? 78,
        color: C.tapResistanceLine,
        category: 'keyLevel',
      });
    }
    const entryPrice = parseFloat(tapSource.entry);
    /** 진입가가 현재가와 3% 이상 이격 시 존 미표시 (캔들 아래에 숏존이 붙어 보이는 현상 방지) */
    const ZONE_STALE_PCT = 0.03;
    const isShort = tapSource.verdict === 'SHORT';
    const zoneStale = !isFinite(entryPrice) || entryPrice <= 0 ||
      (isShort && entryPrice > currentPriceClose * (1 + ZONE_STALE_PCT)) ||
      (!isShort && entryPrice < currentPriceClose * (1 - ZONE_STALE_PCT));
    if (!isNaN(entryPrice) && entryPrice > 0 && !zoneStale) {
      const entryPad = entryPrice * 0.0016;
      closeOverlays.push({
        id: 'tap-entry-zone',
        kind: tapSource.verdict === 'LONG' ? 'demandZone' : 'supplyZone',
        label: `진입 구간 · ${verdictDirChip}`,
        x1: tapRightX1,
        y1: toRatioClose(entryPrice + entryPad),
        x2: tapFullX2,
        y2: toRatioClose(entryPrice - entryPad),
        confidence: entryHoldProbability ?? 78,
        color: C.tapEntryZone,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-entry',
        kind: 'keyLevel',
        label: `진입선${entryHoldProbability != null ? ` · 유지 ${entryHoldProbability}%` : ''}`,
        x1: 0.20,
        y1: toRatioClose(entryPrice),
        x2: tapFullX2,
        y2: toRatioClose(entryPrice),
        confidence: entryHoldProbability ?? 80,
        color: C.tapEntryLine,
        category: 'keyLevel',
      });
      closeOverlays.push({
        id: 'tap-breakout-arrow',
        kind: 'label',
        label: '↗ 돌파',
        x1: 0.70,
        y1: toRatioClose(entryPrice + entryPad * 2),
        x2: 0.70,
        y2: toRatioClose(entryPrice + entryPad * 2),
        confidence: breakoutLevelProbability ?? 75,
        color: C.tapBreakout,
        category: 'labels',
      });
    }
    const stopPrice = parseFloat(tapSource.stopLoss);
    if (!isNaN(stopPrice) && stopPrice > 0 && !zoneStale) {
      const stopPad = stopPrice * 0.0016;
      // 손절 zone도 우측 끝까지 확장 (tapFullX2 사용)
      closeOverlays.push({
        id: 'tap-stop-zone',
        kind: tapSource.verdict === 'LONG' ? 'supplyZone' : 'demandZone',
        label: `손절 구간 · ${verdictDirChip}`,
        x1: tapRightX1,
        y1: toRatioClose(stopPrice + stopPad),
        x2: tapFullX2,
        y2: toRatioClose(stopPrice - stopPad),
        confidence: 76,
        color: C.tapStopZone,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-stop',
        kind: 'keyLevel',
        label: '손절',
        x1: 0.84,
        y1: toRatioClose(stopPrice),
        x2: tapRightX2,
        y2: toRatioClose(stopPrice),
        confidence: 78,
        color: C.tapStopLine,
        category: 'keyLevel',
      });
    }
    const target1 = (tapSource.targets ?? [])[0] ? parseFloat(String(tapSource.targets[0])) : NaN;
    if (!isNaN(target1) && target1 > 0 && !zoneStale) {
      const targetPad = target1 * 0.0018;
      closeOverlays.push({
        id: 'tap-target-zone',
        kind: tapSource.verdict === 'LONG' ? 'demandZone' : 'supplyZone',
        label: `목표 구간 · ${verdictDirChip}`,
        x1: tapRightX1,
        y1: toRatioClose(target1 + targetPad),
        x2: tapFullX2,
        y2: toRatioClose(target1 - targetPad),
        confidence: 82,
        color: C.tapTargetZone,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-target',
        kind: 'keyLevel',
        label: '목표',
        x1: 0.18,
        y1: toRatioClose(target1),
        x2: tapFullX2,
        y2: toRatioClose(target1),
        confidence: 82,
        color: C.tapTargetLine,
        category: 'keyLevel',
      });
      // 목표 방향 표시: Entry > Target이면 숏(아래), Entry < Target이면 롱(위)
      const entryPriceForArrow = parseFloat(tapSource.entry);
      const isShort = !isNaN(entryPriceForArrow) && entryPriceForArrow > target1;
      const targetArrow = isShort ? '↘ 목표' : '↗ 목표';
      closeOverlays.push({
        id: 'tap-target-arrow',
        kind: 'label',
        label: targetArrow,
        x1: 0.84,
        y1: toRatioClose(target1 + targetPad * 2),
        x2: 0.84,
        y2: toRatioClose(target1 + targetPad * 2),
        confidence: 82,
        color: C.tapTargetLine,
        category: 'labels',
      });
    }
    // 나비D (Butterfly D) - 달봉 분석 공통
    const harmonicList = Array.isArray((tapSource.engine as any)?.harmonics) ? (tapSource.engine as any).harmonics : [];
    const butterfly = harmonicList.find((h: any) => h?.pattern === 'butterfly' && typeof h?.dPrice === 'number');
    if (butterfly?.dPrice) {
      const dPrice = Number(butterfly.dPrice);
      const dPad = dPrice * 0.0018;
      closeOverlays.push({
        id: 'tap-harmonic-d-zone',
        kind: butterfly.bias === 'bullish' ? 'demandZone' : 'supplyZone',
        label: `나비 D 구간${harmonicDProbability != null ? ` · ${harmonicDProbability}%` : ''}`,
        x1: 0.70,
        y1: toRatioClose(dPrice + dPad),
        x2: 0.98,
        y2: toRatioClose(dPrice - dPad),
        confidence: harmonicDProbability ?? 74,
        color: butterfly.bias === 'bullish' ? C.tapHarmonicZoneBullish : C.tapHarmonicZoneBearish,
        category: 'zones',
      });
      closeOverlays.push({
        id: 'tap-harmonic-d',
        kind: 'keyLevel',
        label: `나비 D ${butterfly.bias === 'bullish' ? '매수' : '매도'}${harmonicDProbability != null ? ` · ${harmonicDProbability}%` : ''}`,
        x1: 0.16,
        y1: toRatioClose(dPrice),
        x2: 0.98,
        y2: toRatioClose(dPrice),
        confidence: harmonicDProbability ?? 74,
        color: butterfly.bias === 'bullish' ? C.tapHarmonicBullish : C.tapHarmonicBearish,
        category: 'keyLevel',
      });
    }
    const engineOverlays = (tsAnalysis.overlays ?? []) as typeof closeOverlays;
    const isExecutionCritical = (o: { id?: string; kind?: string }) =>
      o.id?.startsWith?.('key-mustBreak-') ||
      o.id?.startsWith?.('key-mustHold-') ||
      o.id?.startsWith?.('key-invalidation-') ||
      o.id?.startsWith?.('triple-') ||
      o.id?.startsWith?.('zone-') ||
      o.id?.startsWith?.('diag-') ||
      o.id?.startsWith?.('retest-') ||
      o.id?.startsWith?.('breakout-') ||
      o.id?.startsWith?.('double-') ||
      o.id === 'tailong-support' ||
      o.id === 'tailong-resistance' ||
      o.id === 'tailong-break' ||
      o.id === 'equilibrium' ||
      o.id === 'strong-high' ||
      o.id === 'strong-low' ||
      o.kind === 'bos' ||
      o.kind === 'choch' ||
      o.kind === 'eqh' ||
      o.kind === 'eql' ||
      o.kind === 'liquiditySweep' ||
      o.kind === 'fvg' ||
      o.kind === 'ob' ||
      o.kind === 'supplyZone' ||
      o.kind === 'demandZone' ||
      o.kind === 'supportLine' ||
      o.kind === 'resistanceLine' ||
      o.kind === 'keyLevel';
    const priorityOverlays = engineOverlays.filter((o: { id?: string }) => isExecutionCritical(o));
    const restOverlays = engineOverlays.filter((o: { id?: string }) => !isExecutionCritical(o));
    const restLimit = Math.max(0, 80 - closeOverlays.length - priorityOverlays.length);
    const otherOverlays = [...restOverlays.slice(0, restLimit), ...priorityOverlays];
    const overlaysWithClose = [...otherOverlays, ...closeOverlays];
    const closeOverlayRange = closeOverlays.length > 0 ? { min: closeRangeMin, max: closeRangeMax } : undefined;

    const swingTapPoint = computeSwingTapPoint({
      verdict: tapSource.verdict,
      confidence: tapSource.confidence,
      longScore: tapSource.longScore,
      shortScore: tapSource.shortScore,
      riskFlags: tapSource.riskFlags ?? [],
      mtf: tapSource.mtf,
      closeBias: closeScenarioResult.closeBias,
      dailyState: closeStateResult.dailyState,
      weeklyState: closeStateResult.weeklyState,
      timeframe,
    });

    const swingTapZoneOverlays: typeof closeOverlays = [];
    const isLongOrShort = tapSource.verdict === 'LONG' || tapSource.verdict === 'SHORT';
    if (isLongOrShort && tapSource.entry && tapSource.stopLoss) {
      const entryNum = parseFloat(tapSource.entry);
      const stopNum = parseFloat(tapSource.stopLoss);
      const target1Num = (tapSource.targets ?? [])[0] ? parseFloat(String(tapSource.targets[0])) : null;
      if (!isNaN(entryNum) && !isNaN(stopNum)) {
        const direction = tapSource.verdict as 'LONG' | 'SHORT';
        const highPrice = direction === 'LONG'
          ? (target1Num != null && !isNaN(target1Num) ? Math.max(entryNum, target1Num) : entryNum)
          : stopNum;
        const lowPrice = direction === 'LONG'
          ? stopNum
          : (target1Num != null && !isNaN(target1Num) ? Math.min(entryNum, target1Num) : entryNum);
        const isActive90 = swingTapPoint.active && swingTapPoint.direction === direction;
        // 확정(90% 충족)일 때만 차트에 스윙 타점 구간 표시
        if (isActive90) {
          swingTapZoneOverlays.push({
            id: 'swing-tap-zone',
            kind: direction === 'LONG' ? 'demandZone' : 'supplyZone',
            label: '스윙 90% 타점',
            x1: 0.02,
            y1: toRatioClose(highPrice),
            x2: 0.98,
            y2: toRatioClose(lowPrice),
            confidence: 90,
            color: direction === 'LONG' ? C.swingTapZoneLong : C.swingTapZoneShort,
            category: 'zones',
          });
        }
      }
    }

    const overlaysFinal = [...overlaysWithClose, ...swingTapZoneOverlays];

    return NextResponse.json({
      ...tsAnalysis,
      timeframe,
      candles: visibleForClose,
      overlays: overlaysFinal,
      closeOverlayRange,
      swingTapPoint,
      ...zonePayload,
      executionState,
      dailyCloseLevel: closeLevels.dailyCloseLevel,
      weeklyCloseLevel: closeLevels.weeklyCloseLevel,
      monthlyCloseLevel: closeLevels.monthlyCloseLevel,
      dailyState: closeStateResult.dailyState,
      weeklyState: closeStateResult.weeklyState,
      monthlyState: closeStateResult.monthlyState,
      closeBias: closeScenarioResult.closeBias,
      mustHoldCloseLevel: closeScenarioResult.mustHoldCloseLevel,
      mustReclaimCloseLevel: closeScenarioResult.mustReclaimCloseLevel,
      closeScenarios: closeScenarioResult.closeScenarios,
      supportObOrderbookDepth,
      resistanceObOrderbookDepth,
      learnedPatternsTop5: tsAnalysis.learnedPatternsTop5,
      recallSummary: tsAnalysis.recallSummary,
      summary: summaryWithMTF,
      engine: { ...tsAnalysis.engine, pythonEngine: false, multiTF },
      multiTF,
      engine1M: engine1M ? { trend: engine1M.trend, bos: engine1M.bos, choch: engine1M.choch, fvg: engine1M.fvg, patterns: engine1M.patterns, sweeps: engine1M.sweeps } : null,
      closeSettlement,
      currentPrice: briefingContext.currentPrice,
      buyPressure: briefingContext.buyPressure,
      sellPressure: briefingContext.sellPressure,
      volumeDelta: briefingContext.volumeDelta,
      orderbookImbalance: briefingContext.orderbookImbalance,
      oiState: briefingContext.oiState,
      fundingState: briefingContext.fundingState,
      liquidityState: briefingContext.liquidityState,
      briefingContext,
      breakoutUpsideProbability,
      breakoutUpsideReasons: breakoutUpsideReasons.length > 0 ? breakoutUpsideReasons : undefined,
      breakoutLevelProbability,
      invalidationLevelProbability,
      supportLevelProbability,
      resistanceLevelProbability,
      entryHoldProbability,
      tapPointConfirmed,
      harmonicDProbability,
      confirmedSignal,
    });
  } catch (error: any) {
    return NextResponse.json({
      symbol,
      timeframe,
      verdict: 'WATCH',
      confidence: 50,
      summary: `오류: ${error?.message || '분석 실패'}`,
      entry: '0',
      stopLoss: '0',
      targets: ['0', '0', '0'],
      overlays: [],
      engine: {},
      topReferences: [],
      learnedPatternsTop5: [],
      recallSummary: '',
    });
  }
}
