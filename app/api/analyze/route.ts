import { NextRequest, NextResponse } from 'next/server';
import type { Candle } from '@/types';
import { getCandlesFromServer } from '@/lib/candlesFromServer';
import { analyzeCandles } from '@/lib/analyze';
import { fetchMarketData } from '@/lib/data/dataService';
import { buildBriefingContext } from '@/lib/briefingContext';
import { buildCloseSettlementBoard } from '@/lib/closeSettlement';
import { computeCloseLevels } from '@/lib/closeLevelEngine';
import { computeCloseState } from '@/lib/closeStateEngine';
import { computeCloseScenario } from '@/lib/closeScenarioEngine';
import { runStrongZonePipeline, strongZonesToOverlays } from '@/lib/zone';
import { ZONE_PRICE_FLOOR, ZONE_PRICE_CEIL } from '@/lib/constants';
import { visibleLimit } from '@/lib/constants';
import { getOrderbookDepthAtPrice, orderbookDepthLabel } from '@/lib/data/aggregate/orderbookDepthAtPrice';
import { tradesAtPriceZone } from '@/lib/data/aggregate/tradesAtPriceZone';

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

    const getCandles = async (sym: string, tf: string) => {
      const fromServer = await getCandlesFromServer(sym, tf);
      return fromServer && fromServer.length > 0 ? fromServer : [];
    };

    let candles: Candle[] = [];
    let marketData: Awaited<ReturnType<typeof fetchMarketData>> | null = null;

    if (useCollect) {
      try {
        marketData = await fetchMarketData(symbol, timeframe);
        candles = marketData.candles;
      } catch {
        candles = await getCandles(symbol, timeframe);
      }
    } else {
      candles = await getCandles(symbol, timeframe);
    }

    const [pythonSignal, htfCandles, ltfCandles, candles1d, candles1w, candles1M] = await Promise.all([
      fetchPythonSignal(symbol, timeframe),
      timeframe !== htf ? getCandles(symbol, htf) : Promise.resolve(null),
      timeframe !== ltf ? getCandles(symbol, ltf) : Promise.resolve(null),
      getCandles(symbol, '1d'),
      getCandles(symbol, '1w'),
      getCandles(symbol, '1M'),
    ]);

    const htfEngine = htfCandles ? analyzeCandles(symbol, htf, htfCandles).engine : null;
    const analysisOptions: { htfTrend?: 'bullish' | 'bearish' | 'range'; volumeDelta?: number; orderbookImbalance?: number; oiState?: 'increasing' | 'decreasing' | 'neutral'; fundingState?: 'positive' | 'negative' | 'neutral' } = { htfTrend: htfEngine?.trend };
    if (marketData) {
      analysisOptions.volumeDelta = marketData.volumeDelta;
      analysisOptions.orderbookImbalance = marketData.orderbookImbalance;
      analysisOptions.oiState = marketData.oiState;
      analysisOptions.fundingState = marketData.fundingState;
    }
    const tsAnalysis = analyzeCandles(symbol, timeframe, candles, analysisOptions);

    const nowSec = Math.floor(Date.now() / 1000);
    const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
    const lastCandleByTf = lastCandle ? { [timeframe]: { open: lastCandle.open, close: lastCandle.close } } : undefined;
    const closeSettlement = buildCloseSettlementBoard(nowSec, tsAnalysis.verdict, lastCandleByTf);

    const htfTrend = htfEngine?.trend ?? null;
    const ltfTrend = ltfCandles ? analyzeCandles(symbol, ltf, ltfCandles).engine?.trend : null;
    const multiTF = {
      htf: htfTrend ? (htfTrend === 'bullish' ? '상승' : htfTrend === 'bearish' ? '하락' : '횡보') : null,
      ltf: ltfTrend ? (ltfTrend === 'bullish' ? '상승' : ltfTrend === 'bearish' ? '하락' : '횡보') : null,
      htfLabel: htf,
      ltfLabel: ltf,
    };

    if (pythonSignal) {
      return NextResponse.json({
        ...tsAnalysis,
        verdict: mapVerdict(pythonSignal.direction),
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
        closeSettlement,
      });
    }

    const mainTrend = tsAnalysis.engine?.trend;
    const trendKo = mainTrend === 'bullish' ? '상승' : mainTrend === 'bearish' ? '하락' : '횡보';
    const summaryWithMTF = multiTF.htf || multiTF.ltf
      ? `${symbol} ${timeframe} ${trendKo} | HTF ${multiTF.htfLabel}: ${multiTF.htf || '-'} | LTF ${multiTF.ltfLabel}: ${multiTF.ltf || '-'}`
      : tsAnalysis.summary;

    const briefingContext = marketData
      ? buildBriefingContext(
          { ...tsAnalysis, summary: summaryWithMTF },
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
      : buildBriefingContext({ ...tsAnalysis, summary: summaryWithMTF });

    let zonePayload: {
      nearestBuyZone?: typeof tsAnalysis.nearestBuyZone;
      nearestSellZone?: typeof tsAnalysis.nearestSellZone;
      strongZoneOverlays?: typeof tsAnalysis.strongZoneOverlays;
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
    if (marketData != null && tsAnalysis.verdict === 'LONG') {
      const base = Math.min(95, tsAnalysis.confidence ?? 70);
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
    if (marketData?.orderbook && marketData.orderbook.bids.length > 0 && marketData.orderbook.asks.length > 0 && marketData.trades.length > 0) {
      const ob = marketData.orderbook;
      const trades = marketData.trades;
      if (tsAnalysis.breakoutLevel) {
        const price = tsAnalysis.breakoutLevel.price;
        const depth = getOrderbookDepthAtPrice(ob, price, pctZone);
        const zone = tradesAtPriceZone(trades, price, pctZone);
        let prob = Math.min(95, tsAnalysis.confidence ?? 70);
        if (depth.totalQty > 0 && depth.askQty < depth.bidQty * 0.7) {
          prob += 10;
        }
        if (zone.tradeCount >= 5 && zone.sellPressure < 0.45) {
          prob += 10;
        }
        breakoutLevelProbability = Math.min(95, prob);
      }
      if (tsAnalysis.invalidationLevel) {
        const price = tsAnalysis.invalidationLevel.price;
        const depth = getOrderbookDepthAtPrice(ob, price, pctZone);
        const zone = tradesAtPriceZone(trades, price, pctZone);
        let prob = Math.min(95, tsAnalysis.confidence ?? 70);
        if (depth.totalQty > 0 && depth.bidQty < depth.askQty * 0.7) {
          prob += 10;
        }
        if (zone.tradeCount >= 5 && zone.buyPressure < 0.45) {
          prob += 10;
        }
        invalidationLevelProbability = Math.min(95, prob);
      }
    }

    const entryNum = parseFloat(tsAnalysis.entry);
    const currentPriceForExec = briefingContext.currentPrice ?? 0;
    let executionState: 'CONFIRMED' | undefined;
    if (tsAnalysis.verdict === 'LONG' && entryNum > 0 && currentPriceForExec >= entryNum) executionState = 'CONFIRMED';
    if (tsAnalysis.verdict === 'SHORT' && entryNum > 0 && currentPriceForExec <= entryNum) executionState = 'CONFIRMED';

    const currentPriceClose = briefingContext.currentPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : 0);
    const closeLevels = computeCloseLevels({ candles1d, candles1w, candles1M });
    const closeStateResult = computeCloseState(currentPriceClose, closeLevels);
    const closeScenarioResult = computeCloseScenario(closeLevels, closeStateResult);

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

    const limit = visibleLimit(timeframe);
    const visibleForClose = candles.slice(-limit);
    const minP = visibleForClose.length ? Math.min(...visibleForClose.map((c: { low: number }) => c.low)) : 0;
    const maxP = visibleForClose.length ? Math.max(...visibleForClose.map((c: { high: number }) => c.high)) : 0;
    const toRatioClose = (p: number) => (maxP - p) / Math.max(1e-9, maxP - minP);
    const closeOverlays: Array<{ id: string; kind: string; label: string; x1: number; y1: number; x2: number; y2: number; confidence: number; color: string; category: string }> = [];
    const closeStateLabel = (state: string | null, prefix: string) =>
      state === 'accepted_above' ? `${prefix} 종가 위 안착` : state === 'accepted_below' ? `${prefix} 종가 아래` : `${prefix} 종가 재진입`;
    if (closeLevels.dailyCloseLevel != null && closeLevels.dailyCloseLevel >= minP && closeLevels.dailyCloseLevel <= maxP) {
      closeOverlays.push({ id: 'close-daily', kind: 'keyLevel', label: closeStateLabel(closeStateResult.dailyState, '일봉'), x1: 0.02, y1: toRatioClose(closeLevels.dailyCloseLevel), x2: 0.98, y2: toRatioClose(closeLevels.dailyCloseLevel), confidence: 85, color: 'rgba(255,235,180,0.9)', category: 'keyLevel' });
    }
    if (closeLevels.weeklyCloseLevel != null && closeLevels.weeklyCloseLevel >= minP && closeLevels.weeklyCloseLevel <= maxP) {
      closeOverlays.push({ id: 'close-weekly', kind: 'keyLevel', label: closeStateLabel(closeStateResult.weeklyState, '주봉'), x1: 0.02, y1: toRatioClose(closeLevels.weeklyCloseLevel), x2: 0.98, y2: toRatioClose(closeLevels.weeklyCloseLevel), confidence: 85, color: 'rgba(255,165,0,0.95)', category: 'keyLevel' });
    }
    if (closeLevels.monthlyCloseLevel != null && closeLevels.monthlyCloseLevel >= minP && closeLevels.monthlyCloseLevel <= maxP) {
      closeOverlays.push({ id: 'close-monthly', kind: 'keyLevel', label: closeStateLabel(closeStateResult.monthlyState, '월봉'), x1: 0.02, y1: toRatioClose(closeLevels.monthlyCloseLevel), x2: 0.98, y2: toRatioClose(closeLevels.monthlyCloseLevel), confidence: 85, color: 'rgba(180,140,255,0.95)', category: 'keyLevel' });
    }
    const overlaysWithClose = [...(tsAnalysis.overlays ?? []), ...closeOverlays];

    return NextResponse.json({
      ...tsAnalysis,
      overlays: overlaysWithClose.length > 80 ? overlaysWithClose.slice(0, 80) : overlaysWithClose,
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
