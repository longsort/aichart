/**
 * AMZ Orderflow — Absorption / Replenishment / Liquidity Pull / Price Impact / Iceberg.
 * 데이터 없으면 null (0 위장 금지). AttackScore ≠ Break Probability.
 */
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';
import type { OrderbookSnapshot } from '@/lib/data/collectors/orderbookCollector';
import { tradesAtPriceZone } from '@/lib/data/aggregate/tradesAtPriceZone';
import { computeVolumeDelta } from '@/lib/data/aggregate/volumeDeltaAggregator';
import { computeOrderbookImbalance } from '@/lib/data/aggregate/orderbookImbalance';
import {
  bookSnapFromDepth,
  replenishmentFromBooks,
  type BookSnap,
  type Eagle1Fill,
  bucketTradesToOfi,
  lastOfi,
} from '@/lib/eagle1/microstructureSeries';
import type { AmzMarketZone, AmzZoneRole } from './types';

export type AmzOrderflowInput = {
  trades: AggTrade[];
  orderbook: OrderbookSnapshot | null;
  /** 시계열 호가 스냅 (2개 미만이면 replenishment/pull = null) */
  bookSnaps?: BookSnap[] | null;
  atr?: number | null;
  currentPrice?: number | null;
};

export type AmzZoneOrderflow = {
  absorptionScore: number | null;
  replenishmentScore: number | null;
  liquidityPullScore: number | null;
  icebergLikelihood: number | null;
  impactScore: number | null;
  tradeArrivalRate: number | null;
  ofi: number | null;
  bookImbalance: number | null;
  zoneTradeCount: number;
  notesKo: string[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function toFills(trades: AggTrade[]): Eagle1Fill[] {
  return trades
    .map((t) => ({
      time: Number(t.time),
      qty: Number(t.qty),
      isBuyerMaker: Boolean(t.isBuyerMaker),
    }))
    .filter((t) => t.time > 0 && t.qty > 0);
}

/**
 * Zone 가격대 체결 vs 가격 이동 → 흡수 추정.
 * 공격량 큰데 mid 이동 작으면 absorption ↑. 표본 부족 시 null.
 */
export function estimateAbsorptionAtZone(params: {
  trades: AggTrade[];
  zoneLo: number;
  zoneHi: number;
  role: AmzZoneRole;
  atr: number;
}): { score: number | null; note: string } {
  const mid = (params.zoneLo + params.zoneHi) / 2;
  const widthPct = Math.max(0.0008, (params.zoneHi - params.zoneLo) / Math.max(mid, 1e-9) / 2);
  const z = tradesAtPriceZone(params.trades, mid, widthPct);
  if (z.tradeCount < 8) {
    return { score: null, note: `Zone 체결 ${z.tradeCount}건 · 흡수 추정 불가` };
  }

  const inZone = params.trades.filter(
    (t) => t.price >= params.zoneLo && t.price <= params.zoneHi
  );
  if (inZone.length < 5) return { score: null, note: 'Zone 내부 체결 부족' };

  const prices = inZone.map((t) => t.price);
  const pLo = Math.min(...prices);
  const pHi = Math.max(...prices);
  const move = pHi - pLo;
  const atr = Math.max(params.atr, mid * 0.001);
  const moveNorm = move / atr;
  const totVol = z.buyVolume + z.sellVolume;
  if (!(totVol > 0)) return { score: null, note: 'Zone 거래대금 0' };

  /** 큰 체결량 + 작은 가격이동 = 흡수 */
  let score = clamp((1 - Math.min(1.2, moveNorm)) * 70 + Math.min(30, Math.log10(totVol + 1) * 8), 0, 100);

  if (params.role === 'DEFENSE_SUPPORT' && z.sellPressure >= 0.55 && moveNorm < 0.45) {
    score = clamp(score + 12, 0, 100); // sell absorption
  }
  if (params.role === 'DEFENSE_RESISTANCE' && z.buyPressure >= 0.55 && moveNorm < 0.45) {
    score = clamp(score + 12, 0, 100); // buy absorption
  }

  return {
    score: Math.round(score),
    note: `체결${z.tradeCount} · 이동/ATR ${moveNorm.toFixed(2)} · 매수${Math.round(z.buyPressure * 100)}%`,
  };
}

/**
 * Liquidity pull: 단일 스냅으로는 불가 → null.
 * 스냅 시리즈에서 Zone 근처 ask/bid가 접근 시 감소하면 pull ↑.
 */
export function estimateLiquidityPull(params: {
  bookSnaps: BookSnap[] | null | undefined;
  zoneLo: number;
  zoneHi: number;
  role: AmzZoneRole;
}): { score: number | null; note: string } {
  const rows = [...(params.bookSnaps ?? [])].filter((s) => s.t > 0).sort((a, b) => a.t - b.t);
  if (rows.length < 3) {
    return {
      score: null,
      note: rows.length <= 0 ? '호가 시리즈 없음 · Pull 불가' : `호가 스냅 ${rows.length} · Pull 시리즈 부족`,
    };
  }

  const sideKey = params.role === 'DEFENSE_SUPPORT' ? 'bidQty' : 'askQty';
  const first = rows[0]![sideKey];
  const last = rows[rows.length - 1]![sideKey];
  if (!(first > 0) || !(last >= 0)) return { score: null, note: '호가 수량 무효' };

  const drop = (first - last) / first;
  if (drop < 0.05) {
    return { score: Math.round(clamp(20 - drop * 100, 0, 40)), note: `유동성 유지/증가 · drop ${(drop * 100).toFixed(0)}%` };
  }
  return {
    score: Math.round(clamp(drop * 100, 0, 95)),
    note: `접근 시 ${sideKey} ${(drop * 100).toFixed(0)}% 감소 · Pull 추정`,
  };
}

/**
 * Iceberg: displayed vs executed 비교. 스냅 시리즈+체결 둘 다 필요.
 * 추정값 — 확정 아님.
 */
export function estimateIcebergLikelihood(params: {
  trades: AggTrade[];
  orderbook: OrderbookSnapshot | null;
  zoneLo: number;
  zoneHi: number;
}): { score: number | null; note: string } {
  const ob = params.orderbook;
  if (!ob || (!ob.bids.length && !ob.asks.length)) {
    return { score: null, note: '호가 스냅 없음 · Iceberg 추정 불가' };
  }
  const mid = (params.zoneLo + params.zoneHi) / 2;
  const nearBids = ob.bids.filter(([p]) => p >= params.zoneLo && p <= params.zoneHi);
  const nearAsks = ob.asks.filter(([p]) => p >= params.zoneLo && p <= params.zoneHi);
  const displayed = [...nearBids, ...nearAsks].reduce((s, [, q]) => s + q, 0);
  const z = tradesAtPriceZone(params.trades, mid, Math.max(0.001, (params.zoneHi - params.zoneLo) / mid / 2));
  const executed = z.buyQty + z.sellQty;
  if (!(displayed > 0) || z.tradeCount < 6) {
    return { score: null, note: `표시호가 ${displayed.toFixed(3)} · 체결표본 부족` };
  }
  /** 체결 >> 표시 → iceberg 가능 */
  const ratio = executed / displayed;
  if (ratio < 1.2) return { score: Math.round(clamp(ratio * 25, 0, 40)), note: `체결/표시 ${ratio.toFixed(2)} · 낮음` };
  return {
    score: Math.round(clamp(40 + Math.min(50, (ratio - 1.2) * 20), 0, 90)),
    note: `체결/표시 ${ratio.toFixed(2)} · IcebergLikelihood 추정(확정 아님)`,
  };
}

/**
 * Price impact: 단위 체결량당 가격변화. ATR 정규화.
 * 표본 부족 시 null.
 */
export function estimatePriceImpact(params: {
  trades: AggTrade[];
  atr: number;
}): { score: number | null; note: string } {
  const sorted = [...params.trades].filter((t) => t.qty > 0 && t.price > 0).sort((a, b) => a.time - b.time);
  if (sorted.length < 20) return { score: null, note: `체결 ${sorted.length} · Impact 표본 부족` };

  const window = sorted.slice(-40);
  const first = window[0]!.price;
  const last = window[window.length - 1]!.price;
  const qty = window.reduce((s, t) => s + t.qty, 0);
  if (!(qty > 0) || !(params.atr > 0)) return { score: null, note: 'Impact 계산 불가' };

  const moveAtr = Math.abs(last - first) / params.atr;
  const impactPerBtc = moveAtr / qty;
  /** 높을수록 유동성 얇음(충격 큼) → score ↑ = 돌파 용이 쪽 Feature */
  const score = clamp(Math.log10(impactPerBtc * 1e6 + 1) * 25, 0, 100);
  return {
    score: Math.round(score),
    note: `ΔATR/수량 ${impactPerBtc.toExponential(2)} · 충격 ${Math.round(score)}`,
  };
}

export function computeZoneOrderflow(
  zone: Pick<AmzMarketZone, 'outerLower' | 'outerUpper' | 'role'>,
  input: AmzOrderflowInput
): AmzZoneOrderflow {
  const notes: string[] = [];
  const trades = input.trades ?? [];
  const atr = input.atr != null && input.atr > 0 ? input.atr : null;
  const books = input.bookSnaps ?? null;

  const abs =
    atr != null
      ? estimateAbsorptionAtZone({
          trades,
          zoneLo: zone.outerLower,
          zoneHi: zone.outerUpper,
          role: zone.role,
          atr,
        })
      : { score: null as number | null, note: 'ATR 없음 · 흡수 불가' };
  notes.push(abs.note);

  const repl = replenishmentFromBooks(books);
  notes.push(repl.note);

  const pull = estimateLiquidityPull({
    bookSnaps: books,
    zoneLo: zone.outerLower,
    zoneHi: zone.outerUpper,
    role: zone.role,
  });
  notes.push(pull.note);

  const ice = estimateIcebergLikelihood({
    trades,
    orderbook: input.orderbook,
    zoneLo: zone.outerLower,
    zoneHi: zone.outerUpper,
  });
  notes.push(ice.note);

  const impact =
    atr != null ? estimatePriceImpact({ trades, atr }) : { score: null as number | null, note: 'ATR 없음 · Impact 불가' };
  notes.push(impact.note);

  let tradeArrivalRate: number | null = null;
  if (trades.length >= 10) {
    const times = trades.map((t) => (t.time > 1e12 ? t.time : t.time * 1000)).sort((a, b) => a - b);
    const span = (times[times.length - 1]! - times[0]!) / 1000;
    if (span > 1) tradeArrivalRate = Math.round((trades.length / span) * 10) / 10;
    else notes.push('체결 시간창 너무 짧음 · arrival null');
  } else {
    notes.push('체결 부족 · arrival null');
  }

  const fills = toFills(trades);
  const ofiBuckets = bucketTradesToOfi(fills, 10_000);
  const ofi = lastOfi(ofiBuckets);

  let bookImbalance: number | null = null;
  if (input.orderbook && input.orderbook.bids.length && input.orderbook.asks.length) {
    bookImbalance = computeOrderbookImbalance(input.orderbook).imbalance;
  } else {
    notes.push('호가 imbalance 없음');
  }

  const mid = (zone.outerLower + zone.outerUpper) / 2;
  const widthPct = Math.max(0.0008, (zone.outerUpper - zone.outerLower) / Math.max(mid, 1e-9) / 2);
  const zTrades = trades.length ? tradesAtPriceZone(trades, mid, widthPct) : null;

  return {
    absorptionScore: abs.score,
    replenishmentScore: repl.score,
    liquidityPullScore: pull.score,
    icebergLikelihood: ice.score,
    impactScore: impact.score,
    tradeArrivalRate,
    ofi,
    bookImbalance,
    zoneTradeCount: zTrades?.tradeCount ?? 0,
    notesKo: notes,
  };
}

/** Orderflow로 Attack/Defense/상태 보정 — 없으면 원본 유지 */
export function applyOrderflowToZone(zone: AmzMarketZone, of: AmzZoneOrderflow): AmzMarketZone {
  let attack = zone.attackScore;
  let defense = zone.defenseScore;
  const explain = [...zone.explainKo];
  const missing = zone.missingDataKo.filter(
    (m) => !m.includes('재보충') && !m.includes('발자국') // 갱신될 항목 정리 후 아래에서 재기입
  );

  if (of.absorptionScore != null) {
    defense = Math.round(clamp(defense * 0.7 + of.absorptionScore * 0.3, 5, 95));
    explain.push(`흡수 ${of.absorptionScore} · Zone체결 ${of.zoneTradeCount}`);
  } else {
    missing.push('흡수: 표본 부족 → null');
  }

  if (of.replenishmentScore != null) {
    defense = Math.round(clamp(defense * 0.85 + of.replenishmentScore * 0.15, 5, 95));
    explain.push(`재보충 ${Math.round(of.replenishmentScore)}`);
  } else {
    missing.push('재보충: 호가 시리즈 부족 → null');
  }

  if (of.liquidityPullScore != null) {
    attack = Math.round(clamp(attack * 0.75 + of.liquidityPullScore * 0.25, 5, 95));
    explain.push(`유동성Pull ${of.liquidityPullScore}`);
  } else {
    missing.push('Liquidity Pull: 시리즈 부족 → null');
  }

  if (of.impactScore != null) {
    attack = Math.round(clamp(attack * 0.85 + of.impactScore * 0.15, 5, 95));
    explain.push(`가격충격 ${of.impactScore}`);
  } else {
    missing.push('Price Impact: 표본 부족 → null');
  }

  if (of.icebergLikelihood != null) {
    explain.push(`Iceberg추정 ${of.icebergLikelihood} (확정 아님)`);
  } else {
    missing.push('Iceberg: 추정 불가 → null');
  }

  missing.push('발자국(Footprint) 없음');
  missing.push('과거 Outcome 표본 미구축 → 확률 WAIT');

  let state = zone.state;
  if (zone.dataQuality !== 'BAD') {
    if (defense <= 40 && attack >= 70 && of.liquidityPullScore != null && of.liquidityPullScore >= 55) {
      state = 'CRITICAL';
    } else if (defense >= 60 && attack <= 45 && of.absorptionScore != null && of.absorptionScore >= 55) {
      state = zone.state === 'APPROACHING' || zone.state === 'FRESH' ? 'DEFENDING' : zone.state;
      if (['APPROACHING', 'TESTING', 'WEAKENING', 'FRESH'].includes(zone.state)) state = 'DEFENDING';
    } else if (attack >= defense + 18 && of.replenishmentScore != null && of.replenishmentScore < 35) {
      state = 'WEAKENING';
    }
  }

  const intensity = Math.round(
    clamp(
      (attack + (100 - defense)) / 2 +
        (of.tradeArrivalRate != null ? Math.min(20, of.tradeArrivalRate * 2) : 0),
      0,
      100
    )
  );

  return {
    ...zone,
    attackScore: attack,
    defenseScore: defense,
    battleIntensity: intensity,
    absorptionScore: of.absorptionScore,
    replenishmentScore: of.replenishmentScore,
    liquidityPullScore: of.liquidityPullScore,
    icebergLikelihood: of.icebergLikelihood,
    impactScore: of.impactScore,
    state,
    stateKo:
      state === 'CRITICAL'
        ? '임계'
        : state === 'DEFENDING'
          ? '방어중'
          : state === 'WEAKENING'
            ? '약화중'
            : zone.stateKo,
    explainKo: explain.slice(0, 8),
    missingDataKo: [...new Set(missing)].slice(0, 8),
  };
}

export function enrichZonesWithOrderflow(
  zones: AmzMarketZone[],
  input: AmzOrderflowInput | null | undefined
): AmzMarketZone[] {
  if (!input || (!input.trades.length && !input.orderbook)) {
    return zones.map((z) => ({
      ...z,
      absorptionScore: null,
      replenishmentScore: null,
      liquidityPullScore: null,
      icebergLikelihood: null,
      impactScore: null,
      missingDataKo: [
        ...z.missingDataKo.filter((m) => !m.includes('재보충')),
        '주문흐름 입력 없음 → absorption/replenish/pull/impact/iceberg = null',
        '발자국(Footprint) 없음',
      ].slice(0, 8),
    }));
  }

  const snaps =
    input.bookSnaps && input.bookSnaps.length
      ? input.bookSnaps
      : input.orderbook
        ? (() => {
            const s = bookSnapFromDepth(input.orderbook);
            return s ? [s] : [];
          })()
        : [];

  const wired: AmzOrderflowInput = { ...input, bookSnaps: snaps };
  return zones.map((z) => applyOrderflowToZone(z, computeZoneOrderflow(z, wired)));
}

/** 글로벌 tape 요약 (Zone 공통) */
export function summarizeTapeOrderflow(input: AmzOrderflowInput): {
  buyPressure: number | null;
  tradeCount: number;
  ofi: number | null;
  replenishmentScore: number | null;
  noteKo: string;
} {
  if (!input.trades.length) {
    return {
      buyPressure: null,
      tradeCount: 0,
      ofi: null,
      replenishmentScore: null,
      noteKo: '체결 없음 · tape null',
    };
  }
  const vd = computeVolumeDelta(input.trades);
  const ofi = lastOfi(bucketTradesToOfi(toFills(input.trades), 10_000));
  const repl = replenishmentFromBooks(input.bookSnaps);
  return {
    buyPressure: vd.tradeCount > 0 ? vd.buyPressure : null,
    tradeCount: vd.tradeCount,
    ofi,
    replenishmentScore: repl.score,
    noteKo: `tape 체결 ${vd.tradeCount} · OFI ${ofi == null ? 'null' : ofi.toFixed(2)} · ${repl.note}`,
  };
}
