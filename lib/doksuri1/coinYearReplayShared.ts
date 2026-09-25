/**
 * 코인 1년 리플레이 공용 — TP1/SL/시간 · 레버·수수료 표.
 * 확정 승률·수익 아님.
 */
import {
  BITGET_TAKER_FEE_RATE,
  DEFAULT_FUNDING_RATE_8H,
  estimateScalpNetRoe,
} from '@/lib/mergedDeskScalpNetRoe';
import type { Candle } from '@/types';

export type YearSimSide = 'LONG' | 'SHORT';

export type YearSimTrade = {
  timeframe: string;
  direction: YearSimSide;
  entryTime: number;
  entry: number;
  stop: number;
  tp1: number;
  slDistPct: number;
  tpDistPct: number;
  exitReason: 'TP1' | 'SL' | 'TIME';
  exitPrice: number;
  barsHeld: number;
  movePct: number;
  mfePct: number;
  maePct: number;
  win: boolean;
  tag?: string;
};

export type YearLevRow = {
  leverage: number;
  suggestTpRoePct: number;
  suggestSlRoePct: number;
  roundTripFeeMarginPct: number;
  avgWinNetRoePct: number;
  avgLossNetRoePct: number;
  netEvRoePct: number;
  feeShareOfWinPct: number;
  okKo: string;
};

export function medianNum(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

export function yearBarTarget(tf: string): number {
  if (tf === '3m') return 180_000;
  if (tf === '5m') return 110_000;
  if (tf === '15m') return 40_000;
  return 40_000;
}

export function strideForYearTf(tf: string): number {
  if (tf === '3m') return 4;
  if (tf === '5m') return 3;
  return 2;
}

export function simulateTpSlTrade(params: {
  candles: Candle[];
  fromIdx: number;
  side: YearSimSide;
  entry: number;
  stop: number;
  tp1: number;
  maxHold: number;
}): Omit<
  YearSimTrade,
  'timeframe' | 'direction' | 'entryTime' | 'entry' | 'stop' | 'tp1' | 'slDistPct' | 'tpDistPct' | 'tag'
> {
  const { candles, fromIdx, side, entry, stop, tp1, maxHold } = params;
  let mfe = 0;
  let mae = 0;
  const end = Math.min(candles.length - 1, fromIdx + maxHold);
  for (let i = fromIdx + 1; i <= end; i++) {
    const c = candles[i]!;
    const hi = Number(c.high);
    const lo = Number(c.low);
    const cl = Number(c.close);
    if (side === 'LONG') {
      mfe = Math.max(mfe, (hi - entry) / entry);
      mae = Math.max(mae, (entry - lo) / entry);
      const hitSl = lo <= stop;
      const hitTp = hi >= tp1;
      if (hitSl) {
        return {
          exitReason: 'SL',
          exitPrice: stop,
          barsHeld: i - fromIdx,
          movePct: ((stop - entry) / entry) * 100,
          mfePct: mfe * 100,
          maePct: mae * 100,
          win: false,
        };
      }
      if (hitTp) {
        return {
          exitReason: 'TP1',
          exitPrice: tp1,
          barsHeld: i - fromIdx,
          movePct: ((tp1 - entry) / entry) * 100,
          mfePct: mfe * 100,
          maePct: mae * 100,
          win: true,
        };
      }
    } else {
      mfe = Math.max(mfe, (entry - lo) / entry);
      mae = Math.max(mae, (hi - entry) / entry);
      const hitSl = hi >= stop;
      const hitTp = lo <= tp1;
      if (hitSl) {
        return {
          exitReason: 'SL',
          exitPrice: stop,
          barsHeld: i - fromIdx,
          movePct: ((entry - stop) / entry) * 100,
          mfePct: mfe * 100,
          maePct: mae * 100,
          win: false,
        };
      }
      if (hitTp) {
        return {
          exitReason: 'TP1',
          exitPrice: tp1,
          barsHeld: i - fromIdx,
          movePct: ((entry - tp1) / entry) * 100,
          mfePct: mfe * 100,
          maePct: mae * 100,
          win: true,
        };
      }
    }
    if (i === end) {
      const movePct =
        side === 'LONG' ? ((cl - entry) / entry) * 100 : ((entry - cl) / entry) * 100;
      return {
        exitReason: 'TIME',
        exitPrice: cl,
        barsHeld: i - fromIdx,
        movePct,
        mfePct: mfe * 100,
        maePct: mae * 100,
        win: movePct > 0,
      };
    }
  }
  const last = candles[Math.min(end, candles.length - 1)]!;
  const cl = Number(last.close);
  const movePct =
    side === 'LONG' ? ((cl - entry) / entry) * 100 : ((entry - cl) / entry) * 100;
  return {
    exitReason: 'TIME',
    exitPrice: cl,
    barsHeld: Math.max(1, end - fromIdx),
    movePct,
    mfePct: mfe * 100,
    maePct: mae * 100,
    win: movePct > 0,
  };
}

export function buildLeverageFeeTable(params: {
  suggestTpPricePct: number;
  suggestSlPricePct: number;
  avgWinMovePct: number;
  avgLossMovePct: number;
  winRate: number;
  levs?: number[];
}): { rows: YearLevRow[]; best: YearLevRow } {
  const levs = params.levs ?? [10, 15, 20, 25, 30, 40, 50];
  const fee = BITGET_TAKER_FEE_RATE;
  const rows: YearLevRow[] = [];
  for (const lev of levs) {
    const tpRoe = params.suggestTpPricePct * lev;
    const slRoe = params.suggestSlPricePct * lev;
    const feeM = fee * 2 * lev * 100;
    const avgWinGross = params.avgWinMovePct * lev;
    const avgLossGross = params.avgLossMovePct * lev;
    const avgWinNet = avgWinGross - feeM;
    const avgLossNet = avgLossGross - feeM;
    const netEv = params.winRate * avgWinNet + (1 - params.winRate) * avgLossNet;
    const feeShare = avgWinGross > 0 ? (feeM / avgWinGross) * 100 : 100;
    let okKo = '비추천';
    if (feeShare <= 35 && netEv > 0 && avgWinNet > feeM * 0.5) okKo = '가능';
    if (feeShare <= 25 && netEv > 0.3) okKo = '양호';
    if (feeShare <= 20 && netEv > 0.6) okKo = '적합';
    rows.push({
      leverage: lev,
      suggestTpRoePct: tpRoe,
      suggestSlRoePct: slRoe,
      roundTripFeeMarginPct: feeM,
      avgWinNetRoePct: avgWinNet,
      avgLossNetRoePct: avgLossNet,
      netEvRoePct: netEv,
      feeShareOfWinPct: feeShare,
      okKo,
    });
  }
  const ranked = [...rows].sort((a, b) => b.netEvRoePct - a.netEvRoePct);
  const best =
    ranked.find((r) => r.okKo === '적합' || r.okKo === '양호' || r.okKo === '가능') ?? ranked[0]!;
  return { rows, best };
}

export function lev30FeeBlock(params: {
  suggestTpPricePct: number;
  suggestSlPricePct: number;
  baseLev: number;
}): {
  suggestTpRoePct: number;
  suggestSlRoePct: number;
  feeRoundTripMarginPct: number;
  fundingHalfHourMarginPct: number;
  netTpRoeAfterFeePct: number;
  detailKo: string[];
} {
  const baseLev = params.baseLev;
  const suggestTpRoePct = params.suggestTpPricePct * baseLev;
  const suggestSlRoePct = params.suggestSlPricePct * baseLev;
  const feeRoundTripMarginPct = BITGET_TAKER_FEE_RATE * 2 * baseLev * 100;
  const fundingHalfHourMarginPct =
    DEFAULT_FUNDING_RATE_8H * (0.5 / 8) * baseLev * 100;
  const netTp = estimateScalpNetRoe({
    grossRoePct: suggestTpRoePct,
    leverage: baseLev,
    holdHours: 0.5,
  });
  return {
    suggestTpRoePct,
    suggestSlRoePct,
    feeRoundTripMarginPct,
    fundingHalfHourMarginPct,
    netTpRoeAfterFeePct: netTp.netRoePct,
    detailKo: netTp.detailKo,
  };
}

export type CoinYearAggPack = {
  symbol: string;
  routeKo: string;
  baseLeverage: number;
  candleMeta: Array<{ timeframe: string; count: number; days: number; source?: string }>;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  longCount: number;
  shortCount: number;
  tpHits: number;
  slHits: number;
  timeExits: number;
  avgMfePct: number;
  avgMaePct: number;
  avgWinMovePct: number;
  avgLossMovePct: number;
  medianSlDistPct: number;
  medianTpDistPct: number;
  suggestSlPricePct: number;
  suggestTpPricePct: number;
  preferTfs?: string[];
  skipTfs?: string[];
  failBands?: FailEntryBand[];
  lev30: ReturnType<typeof lev30FeeBlock>;
  leverageTable: YearLevRow[];
  bestLeverage: number;
  bestLevKo: string;
  byTf: Array<{
    timeframe: string;
    tradeCount: number;
    winRate: number | null;
    tpHits: number;
    slHits: number;
    noteKo: string;
  }>;
  sampleTrades: YearSimTrade[];
  equityCurve: Array<{ i: number; cumMovePct: number; cumRoe30: number }>;
  summaryKo: string;
  hintKo: string;
};

/** 손절 다발 진입가 클러스터 → 실전 배제 밴드 */
export type FailEntryBand = {
  timeframe: string;
  direction: YearSimSide;
  midPrice: number;
  /** 진입가 대비 ±% */
  halfPct: number;
  slCount: number;
};

export function buildFailEntryBands(trades: YearSimTrade[], minSl = 4): FailEntryBand[] {
  type Bucket = { sum: number; n: number; timeframe: string; direction: YearSimSide };
  const map = new Map<string, Bucket>();
  for (const t of trades) {
    if (t.exitReason !== 'SL') continue;
    const entry = Number(t.entry);
    if (!(entry > 0)) continue;
    /** 0.5% 가격 버킷 — 과도한 배제 완화 */
    const bucket = Math.round(entry / (entry * 0.005));
    const key = `${t.timeframe}|${t.direction}|${bucket}`;
    const cur = map.get(key);
    if (cur) {
      cur.sum += entry;
      cur.n += 1;
    } else {
      map.set(key, {
        sum: entry,
        n: 1,
        timeframe: t.timeframe,
        direction: t.direction,
      });
    }
  }
  const out: FailEntryBand[] = [];
  for (const b of map.values()) {
    if (b.n < minSl) continue;
    const mid = b.sum / b.n;
    out.push({
      timeframe: b.timeframe,
      direction: b.direction,
      midPrice: mid,
      halfPct: 0.22,
      slCount: b.n,
    });
  }
  out.sort((a, b) => b.slCount - a.slCount);
  return out.slice(0, 24);
}

export function aggregateCoinYearTrades(params: {
  symbol: string;
  routeKo: string;
  trades: YearSimTrade[];
  baseLeverage: number;
  candleMeta: CoinYearAggPack['candleMeta'];
  hintKo: string;
  /** 목표 TP ROE%를 가격%로 환산한 값 (예: 5/30≈0.1667) · *100 금지 */
  fixedTpPricePct?: number | null;
  preferTfs?: string[];
  skipTfs?: string[];
}): CoinYearAggPack {
  const trades = params.trades;
  const n = trades.length;
  const wins = trades.filter((t) => t.win);
  const losses = trades.filter((t) => !t.win);
  const avgMfePct = n ? trades.reduce((s, t) => s + t.mfePct, 0) / n : 0;
  const avgMaePct = n ? trades.reduce((s, t) => s + t.maePct, 0) / n : 0;
  const avgWinMovePct = wins.length
    ? wins.reduce((s, t) => s + t.movePct, 0) / wins.length
    : 0;
  const avgLossMovePct = losses.length
    ? losses.reduce((s, t) => s + t.movePct, 0) / losses.length
    : 0;
  const medianSlDistPct = medianNum(trades.map((t) => t.slDistPct));
  const medianTpDistPct = medianNum(trades.map((t) => t.tpDistPct));
  const medMfe = medianNum(trades.map((t) => t.mfePct).filter((x) => x > 0));

  let suggestSlPricePct = Math.max(
    0.08,
    Math.min(1.2, medianNum([medianSlDistPct, avgMaePct * 1.05].filter((x) => x > 0)) || 0.25)
  );
  /** 목표 가격TP · MFE 85% 캡 (실현 불가능한 16% TP 방지) */
  const targetTp = params.fixedTpPricePct != null && params.fixedTpPricePct > 0
    ? params.fixedTpPricePct
    : medMfe > 0
      ? medMfe * 0.7
      : medianTpDistPct || 0.2;
  let suggestTpPricePct = targetTp;
  if (medMfe > 0) {
    suggestTpPricePct = Math.min(targetTp, medMfe * 0.85);
  }
  suggestTpPricePct = Math.max(suggestTpPricePct, suggestSlPricePct * 1.25);
  if (medMfe > 0) {
    suggestTpPricePct = Math.min(suggestTpPricePct, Math.max(medMfe * 0.9, suggestSlPricePct * 1.25));
  }
  suggestTpPricePct = Math.min(Math.max(suggestTpPricePct, 0.1), 2.5);

  const winRate = n > 0 ? wins.length / n : 0;
  const { rows, best } = buildLeverageFeeTable({
    suggestTpPricePct,
    suggestSlPricePct,
    avgWinMovePct,
    avgLossMovePct,
    winRate,
  });
  const lev30 = lev30FeeBlock({
    suggestTpPricePct,
    suggestSlPricePct,
    baseLev: params.baseLeverage,
  });

  const tfs = [...new Set(trades.map((t) => t.timeframe))];
  const byTf = tfs.map((tf) => {
    const list = trades.filter((t) => t.timeframe === tf);
    const w = list.filter((t) => t.win).length;
    return {
      timeframe: tf,
      tradeCount: list.length,
      winRate: list.length ? w / list.length : null,
      tpHits: list.filter((t) => t.exitReason === 'TP1').length,
      slHits: list.filter((t) => t.exitReason === 'SL').length,
      noteKo: `${tf} · ${list.length}회 · 승${w} · 확정아님`,
    };
  });

  /** TF 승률 보고 skip/prefer — 성공쪽 유지·실패/열위 TF 배제 */
  const preferTfs = [...(params.preferTfs ?? [])];
  const skipTfs = [...(params.skipTfs ?? [])];
  const bestWr = Math.max(0, ...byTf.map((r) => r.winRate ?? 0));
  const overallWr = n > 0 ? wins.length / n : 0;
  for (const row of byTf) {
    if (row.tradeCount < 8 || row.winRate == null) continue;
    const weakAbs = row.winRate < 0.48;
    const weakRel = bestWr - row.winRate >= 0.08;
    const moreSl = row.slHits > row.tpHits * 1.15;
    const belowOverall = overallWr > 0 && row.winRate < overallWr - 0.05;
    if ((weakAbs || weakRel || moreSl || belowOverall) && !skipTfs.includes(row.timeframe)) {
      skipTfs.push(row.timeframe);
    }
    if (row.tradeCount >= 10 && row.winRate >= 0.55 && !preferTfs.includes(row.timeframe)) {
      preferTfs.unshift(row.timeframe);
    }
  }
  /** prefer에 있는데 skip이면 skip 우선(열위) */
  const preferClean = preferTfs.filter((t) => !skipTfs.includes(t));

  /** 손절(실패) 진입가 구간 — 같은 TF·방향·가격대 재진입 배제 */
  const failBands = buildFailEntryBands(trades);

  let cum = 0;
  let cumRoe = 0;
  const equityCurve: CoinYearAggPack['equityCurve'] = [];
  trades.forEach((t, i) => {
    cum += t.movePct;
    cumRoe += t.movePct * 30;
    if (i % Math.max(1, Math.floor(trades.length / 40)) === 0 || i === trades.length - 1) {
      equityCurve.push({ i, cumMovePct: cum, cumRoe30: cumRoe });
    }
  });

  const days = Math.max(0, ...params.candleMeta.map((m) => m.days));
  const skipKo = skipTfs.length ? ` · 스킵TF ${skipTfs.join(',')}` : '';
  const failKo = failBands.length ? ` · 실패구간 ${failBands.length}` : '';
  const preferKo = preferClean.length ? ` · 선호TF ${preferClean.join(',')}` : '';
  return {
    symbol: params.symbol,
    routeKo: params.routeKo,
    baseLeverage: params.baseLeverage,
    candleMeta: params.candleMeta,
    tradeCount: n,
    wins: wins.length,
    losses: losses.length,
    winRate: n > 0 ? wins.length / n : null,
    longCount: trades.filter((t) => t.direction === 'LONG').length,
    shortCount: trades.filter((t) => t.direction === 'SHORT').length,
    tpHits: trades.filter((t) => t.exitReason === 'TP1').length,
    slHits: trades.filter((t) => t.exitReason === 'SL').length,
    timeExits: trades.filter((t) => t.exitReason === 'TIME').length,
    avgMfePct,
    avgMaePct,
    avgWinMovePct,
    avgLossMovePct,
    medianSlDistPct,
    medianTpDistPct,
    suggestSlPricePct,
    suggestTpPricePct,
    preferTfs: [...new Set(preferClean)],
    skipTfs: [...new Set(skipTfs)],
    failBands,
    lev30,
    leverageTable: rows,
    bestLeverage: best.leverage,
    bestLevKo: `${best.leverage}x · ${best.okKo} · 순기대ROE ${best.netEvRoePct.toFixed(2)}%p · 수수료비중 ${best.feeShareOfWinPct.toFixed(0)}%${skipKo}${preferKo}${failKo}`,
    byTf,
    sampleTrades: trades.slice(0, 40),
    equityCurve,
    summaryKo: `${params.routeKo} · ${days}일 · 거래${n} · 승${wins.length} · SL ${suggestSlPricePct.toFixed(3)}% / TP ${suggestTpPricePct.toFixed(3)}% · 30x ROE TP${lev30.suggestTpRoePct.toFixed(1)} / SL${lev30.suggestSlRoePct.toFixed(1)}${skipKo}${failKo} · 확정아님`,
    hintKo: params.hintKo,
  };
}
