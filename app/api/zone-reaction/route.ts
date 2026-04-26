import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketData } from '@/lib/data/dataService';
import { computeVolumeDelta } from '@/lib/data/aggregate/volumeDeltaAggregator';
import { tradesAtPriceZone } from '@/lib/data/aggregate/tradesAtPriceZone';
import { ruleBasedTapeBias } from '@/lib/zoneReactionMetrics';

export const dynamic = 'force-dynamic';

function parseNum(v: string | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type EdgeSnap = {
  key: string;
  price: number;
  distPct: number | null;
  buyPressure: number;
  sellPressure: number;
  tradeCount: number;
  biasScore: number;
  biasLabel: string;
};

/**
 * GET ?symbol=&timeframe=&price=&pct=&instLo=&instHi=&cpTop=&cpBot=
 * - 체결 테이프 + 기준가 + 선택적 기관/CP 밴드 가격대별 근접 체결
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '4h';
  const priceParam = searchParams.get('price');
  const pctRaw = searchParams.get('pct');
  const pct = Math.min(0.02, Math.max(0.0005, parseFloat(pctRaw || '0.003') || 0.003));

  const instLo = parseNum(searchParams.get('instLo'));
  const instHi = parseNum(searchParams.get('instHi'));
  const cpTop = parseNum(searchParams.get('cpTop'));
  const cpBot = parseNum(searchParams.get('cpBot'));

  try {
    const m = await fetchMarketData(symbol, timeframe);
    const vd = computeVolumeDelta(m.trades);
    const tapeBias = ruleBasedTapeBias(vd.buyPressure, vd.sellPressure);

    const refFromQuery = priceParam != null && Number.isFinite(Number(priceParam)) ? Number(priceParam) : null;
    const referencePrice = refFromQuery != null && refFromQuery > 0 ? refFromQuery : m.currentPrice > 0 ? m.currentPrice : null;

    const atReference =
      referencePrice != null && referencePrice > 0 ? tradesAtPriceZone(m.trades, referencePrice, pct) : null;
    const nearBias =
      atReference && atReference.tradeCount > 0
        ? ruleBasedTapeBias(atReference.buyPressure, atReference.sellPressure)
        : null;

    const snapEdge = (key: string, price: number | null): EdgeSnap | null => {
      if (price == null || price <= 0) return null;
      const z = tradesAtPriceZone(m.trades, price, pct);
      const b = ruleBasedTapeBias(z.buyPressure, z.sellPressure);
      const distPct =
        referencePrice != null && referencePrice > 0 ? Math.abs(referencePrice - price) / referencePrice : null;
      return {
        key,
        price,
        distPct,
        buyPressure: z.buyPressure,
        sellPressure: z.sellPressure,
        tradeCount: z.tradeCount,
        biasScore: b.score,
        biasLabel: b.label,
      };
    };

    const edgeList: EdgeSnap[] = [];
    const a = snapEdge('inst-lower', instLo);
    const b = snapEdge('inst-upper', instHi);
    const c = snapEdge('cp-top', cpTop);
    const d = snapEdge('cp-bottom', cpBot);
    if (a) edgeList.push(a);
    if (b) edgeList.push(b);
    if (c) edgeList.push(c);
    if (d) edgeList.push(d);

    let nearestEdge: { key: string; distPct: number; price: number; biasLabel: string; biasScore: number } | null =
      null;
    if (referencePrice != null && referencePrice > 0 && edgeList.length) {
      let best: EdgeSnap | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const e of edgeList) {
        if (e.distPct == null) continue;
        if (e.distPct < bestD) {
          bestD = e.distPct;
          best = e;
        }
      }
      if (best != null) {
        nearestEdge = {
          key: best.key,
          distPct: best.distPct,
          price: best.price,
          biasLabel: best.biasLabel,
          biasScore: best.biasScore,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      currentPrice: m.currentPrice,
      referencePrice,
      proximityPct: pct,
      tape: {
        buyPressure: vd.buyPressure,
        sellPressure: vd.sellPressure,
        volumeDelta: vd.volumeDelta,
        buyVolume: vd.buyVolume,
        sellVolume: vd.sellVolume,
        tradeCount: vd.tradeCount,
        biasScore: tapeBias.score,
        biasLabel: tapeBias.label,
      },
      atReference: atReference
        ? {
            ...atReference,
            biasScore: nearBias?.score ?? 50,
            biasLabel: nearBias?.label ?? '표본 부족',
          }
        : null,
      edgeSnaps: edgeList,
      nearestEdge,
      oiState: m.oiState,
      fundingState: m.fundingState,
      orderbookImbalance: m.orderbookImbalance,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'zone-reaction failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
