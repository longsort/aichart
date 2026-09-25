/**
 * BTC 3분 구조로켓 1년 walk-forward 리플레이.
 * 청크 analyze로 로켓 수집 → 헌팅SL·이후봉 성과 · 레버·수수료 권장.
 * 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { analyzeCandles } from '@/lib/analyze';
import {
  BTC_3M_ROCKET_SYMBOL,
  BTC_3M_ROCKET_TF,
  resolveBtcRocketHuntSl,
} from '@/lib/mergedDeskBtc3mRocketTrade';
import {
  BITGET_TAKER_FEE_RATE,
  DEFAULT_FUNDING_RATE_8H,
  estimateScalpNetRoe,
} from '@/lib/mergedDeskScalpNetRoe';
import { buildFailEntryBands, type FailEntryBand } from '@/lib/doksuri1/coinYearReplayShared';

export const BTC_ROCKET_YEAR_TF = BTC_3M_ROCKET_TF;
export const BTC_ROCKET_YEAR_BARS = 180_000;

function atr14(candles: Candle[], endExclusive: number): number {
  const from = Math.max(1, endExclusive - 14);
  let s = 0;
  let c = 0;
  for (let i = from; i < endExclusive; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    c += 1;
  }
  return c > 0 ? s / c : Number(candles[endExclusive - 1]?.close || 0) * 0.008;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

function percentile(nums: number[], p: number): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const i = Math.max(0, Math.min(a.length - 1, Math.floor((a.length - 1) * p)));
  return a[i]!;
}

type RocketEvent = {
  time: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  signalSl: number | null;
  barIdx: number;
  rocketHigh: number;
  rocketLow: number;
};

export type BtcRocketReplayTrade = {
  direction: 'LONG' | 'SHORT';
  entryTime: number;
  entry: number;
  stop: number;
  slDistPct: number;
  exitReason: 'TP_MFE' | 'SL' | 'TIME';
  exitPrice: number;
  barsHeld: number;
  /** 방향 기준 유리 +% */
  movePct: number;
  mfePct: number;
  maePct: number;
  win: boolean;
  /** 30x 가정 총 ROE (수수료 전) */
  grossRoe30: number;
};

export type BtcRocketLevRow = {
  leverage: number;
  /** 권장 TP ROE% (가격평균상승 × lev) */
  suggestTpRoePct: number;
  /** 권장 SL ROE% */
  suggestSlRoePct: number;
  roundTripFeeMarginPct: number;
  avgWinNetRoePct: number;
  avgLossNetRoePct: number;
  netEvRoePct: number;
  feeShareOfWinPct: number;
  okKo: string;
};

export type BtcRocketYearReplayPack = {
  symbol: typeof BTC_3M_ROCKET_SYMBOL;
  timeframe: typeof BTC_3M_ROCKET_TF;
  candleCount: number;
  daysCovered: number;
  fromTime: number;
  toTime: number;
  rocketLong: number;
  rocketShort: number;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  longWins: number;
  shortWins: number;
  tpHits: number;
  slHits: number;
  timeExits: number;
  /** 평균 유리 움직임 % (MFE) */
  avgMfePct: number;
  /** 평균 불리 움직임 % (MAE) */
  avgMaePct: number;
  /** 승일 때 평균 가격% */
  avgWinMovePct: number;
  /** 패일 때 평균 가격% */
  avgLossMovePct: number;
  medianSlDistPct: number;
  /** 권장: SL을 진입 대비 이 %에 (중앙 MAE·헌팅SL 혼합) */
  suggestSlPricePct: number;
  /** 권장: TP1 가격 % (중앙 MFE의 0.65) */
  suggestTpPricePct: number;
  /** 레버 30 기준 */
  lev30: {
    suggestTpRoePct: number;
  suggestSlRoePct: number;
    feeRoundTripMarginPct: number;
    fundingHalfHourMarginPct: number;
    netTpRoeAfterFeePct: number;
    detailKo: string[];
  };
  leverageTable: BtcRocketLevRow[];
  bestLeverage: number;
  bestLevKo: string;
  preferTfs?: string[];
  skipTfs?: string[];
  failBands?: FailEntryBand[];
  sampleTrades: BtcRocketReplayTrade[];
  equityCurve: Array<{ i: number; cumMovePct: number; cumRoe30: number }>;
  summaryKo: string;
  hintKo: string;
};

function simulateFromEntry(params: {
  candles: Candle[];
  fromIdx: number;
  side: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  /** 동적 TP: 권장 가격% 또는 MFE 캡 */
  tpPricePct: number;
  maxHold: number;
}): {
  exitReason: 'TP_MFE' | 'SL' | 'TIME';
  exitPrice: number;
  barsHeld: number;
  movePct: number;
  mfePct: number;
  maePct: number;
  win: boolean;
} {
  const { candles, fromIdx, side, entry, stop, tpPricePct, maxHold } = params;
  const tp =
    side === 'LONG' ? entry * (1 + tpPricePct / 100) : entry * (1 - tpPricePct / 100);
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
      const hitTp = hi >= tp;
      if (hitSl && hitTp) {
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
          exitReason: 'TP_MFE',
          exitPrice: tp,
          barsHeld: i - fromIdx,
          movePct: ((tp - entry) / entry) * 100,
          mfePct: mfe * 100,
          maePct: mae * 100,
          win: true,
        };
      }
    } else {
      mfe = Math.max(mfe, (entry - lo) / entry);
      mae = Math.max(mae, (hi - entry) / entry);
      const hitSl = hi >= stop;
      const hitTp = lo <= tp;
      if (hitSl && hitTp) {
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
          exitReason: 'TP_MFE',
          exitPrice: tp,
          barsHeld: i - fromIdx,
          movePct: ((entry - tp) / entry) * 100,
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

/** 청크 analyze로 로켓 이벤트 수집 (mergeMax 한계 우회) */
export function collectBtc3mRocketsChunked(candles: Candle[]): {
  events: RocketEvent[];
  chunks: number;
} {
  const WIN = 720;
  const STEP = 480;
  const events: RocketEvent[] = [];
  const seen = new Set<string>();
  let chunks = 0;

  for (let end = WIN; end <= candles.length; end += STEP) {
    const start = end - WIN;
    const slice = candles.slice(start, end);
    chunks += 1;
    let pack: { structureRocketSignals?: Array<{
      time?: number;
      direction?: 'LONG' | 'SHORT';
      stopLoss?: number | null;
      entryPrice?: number | null;
    }> } | null = null;
    try {
      pack = analyzeCandles(BTC_3M_ROCKET_SYMBOL, BTC_3M_ROCKET_TF, slice) as typeof pack;
    } catch {
      continue;
    }
    const rockets = pack?.structureRocketSignals ?? [];
    for (const r of rockets) {
      if (r.direction !== 'LONG' && r.direction !== 'SHORT') continue;
      const t = Number(r.time);
      if (!Number.isFinite(t)) continue;
      const key = `${r.direction}:${Math.round(t)}`;
      if (seen.has(key)) continue;
      /** 창 가장자리 노이즈 제외 */
      let barIdx = -1;
      let best = Infinity;
      for (let i = start + 40; i < end - 8; i++) {
        const d = Math.abs(Number(candles[i]!.time) - t);
        if (d < best) {
          best = d;
          barIdx = i;
        }
      }
      if (barIdx < 0 || best > 180) continue;
      seen.add(key);
      const bar = candles[barIdx]!;
      const entry =
        r.entryPrice != null && Number(r.entryPrice) > 0
          ? Number(r.entryPrice)
          : Number(bar.close);
      events.push({
        time: t,
        direction: r.direction,
        entry,
        signalSl: r.stopLoss != null && Number(r.stopLoss) > 0 ? Number(r.stopLoss) : null,
        barIdx,
        rocketHigh: Number(bar.high),
        rocketLow: Number(bar.low),
      });
    }
  }

  events.sort((a, b) => a.barIdx - b.barIdx);
  return { events, chunks };
}

/**
 * 1차: 로켓 후 순수 MFE/MAE 측정 (TP 고정 없이) → 권장 SL/TP 산출
 * 2차: 권장 TP로 재시뮬
 */
export function runBtc3mRocketYearReplay(params: {
  candles: Candle[];
  baseLeverage?: number;
}): BtcRocketYearReplayPack {
  const candles = params.candles;
  const baseLev = Math.max(1, Math.min(125, params.baseLeverage ?? 30));
  const { events } = collectBtc3mRocketsChunked(candles);
  const maxHold = 48;

  /** Pass1 — 측정용: TP를 매우 높게 두고 MFE/MAE·헌팅SL만 */
  const probeSl: number[] = [];
  const probeMfe: number[] = [];
  const probeMae: number[] = [];

  for (const ev of events) {
    const atr = atr14(candles, ev.barIdx + 1);
    const hunt = resolveBtcRocketHuntSl({
      direction: ev.direction,
      rocketBar: { high: ev.rocketHigh, low: ev.rocketLow },
      signalSl: ev.signalSl,
      atr,
      entry: ev.entry,
    });
    if (ev.direction === 'LONG' && !(hunt.sl < ev.entry)) continue;
    if (ev.direction === 'SHORT' && !(hunt.sl > ev.entry)) continue;
    const slDist = (Math.abs(ev.entry - hunt.sl) / ev.entry) * 100;
    probeSl.push(slDist);

    const sim = simulateFromEntry({
      candles,
      fromIdx: ev.barIdx,
      side: ev.direction,
      entry: ev.entry,
      stop: hunt.sl,
      tpPricePct: 8,
      maxHold,
    });
    probeMfe.push(sim.mfePct);
    probeMae.push(sim.maePct);
  }

  const medianSl = median(probeSl);
  const medMfe = median(probeMfe.filter((x) => x > 0));
  const medMae = median(probeMae.filter((x) => x > 0));
  const suggestSlPricePct = Math.max(
    0.08,
    Math.min(1.2, median([medianSl, medMae * 1.05].filter((x) => x > 0)) || medianSl || 0.25)
  );
  const suggestTpPricePct = Math.max(
    0.12,
    Math.min(2.5, (medMfe > 0 ? medMfe * 0.65 : 0.35) || 0.35)
  );

  /** Pass2 — 권장 TP/실제 헌팅SL */
  const trades: BtcRocketReplayTrade[] = [];
  let nextOk = -1;
  for (const ev of events) {
    if (ev.barIdx < nextOk) continue;
    const atr = atr14(candles, ev.barIdx + 1);
    const hunt = resolveBtcRocketHuntSl({
      direction: ev.direction,
      rocketBar: { high: ev.rocketHigh, low: ev.rocketLow },
      signalSl: ev.signalSl,
      atr,
      entry: ev.entry,
    });
    if (ev.direction === 'LONG' && !(hunt.sl < ev.entry)) continue;
    if (ev.direction === 'SHORT' && !(hunt.sl > ev.entry)) continue;

    const sim = simulateFromEntry({
      candles,
      fromIdx: ev.barIdx,
      side: ev.direction,
      entry: ev.entry,
      stop: hunt.sl,
      tpPricePct: suggestTpPricePct,
      maxHold,
    });
    const slDistPct = (Math.abs(ev.entry - hunt.sl) / ev.entry) * 100;
    trades.push({
      direction: ev.direction,
      entryTime: ev.time,
      entry: ev.entry,
      stop: hunt.sl,
      slDistPct,
      exitReason: sim.exitReason,
      exitPrice: sim.exitPrice,
      barsHeld: sim.barsHeld,
      movePct: sim.movePct,
      mfePct: sim.mfePct,
      maePct: sim.maePct,
      win: sim.win,
      grossRoe30: sim.movePct * 30,
    });
    nextOk = ev.barIdx + Math.max(6, sim.barsHeld);
  }

  const wins = trades.filter((t) => t.win);
  const losses = trades.filter((t) => !t.win);
  const n = trades.length;
  const avgMfePct = n ? trades.reduce((s, t) => s + t.mfePct, 0) / n : 0;
  const avgMaePct = n ? trades.reduce((s, t) => s + t.maePct, 0) / n : 0;
  const avgWinMovePct = wins.length
    ? wins.reduce((s, t) => s + t.movePct, 0) / wins.length
    : 0;
  const avgLossMovePct = losses.length
    ? losses.reduce((s, t) => s + t.movePct, 0) / losses.length
    : 0;
  const medianSlDistPct = median(trades.map((t) => t.slDistPct));

  const fee = BITGET_TAKER_FEE_RATE;
  const feeRoundTripMarginPct = fee * 2 * baseLev * 100;
  const fundingHalfHourMarginPct = DEFAULT_FUNDING_RATE_8H * (0.5 / 8) * baseLev * 100;
  const suggestTpRoePct = suggestTpPricePct * baseLev;
  const suggestSlRoePct = suggestSlPricePct * baseLev;
  const netTp = estimateScalpNetRoe({
    grossRoePct: suggestTpRoePct,
    leverage: baseLev,
    holdHours: 0.5,
  });

  const winRate = n > 0 ? wins.length / n : 0;
  const leverageTable: BtcRocketLevRow[] = [];
  for (const lev of [10, 15, 20, 25, 30, 40, 50]) {
    const tpRoe = suggestTpPricePct * lev;
    const slRoe = suggestSlPricePct * lev;
    const feeM = fee * 2 * lev * 100;
    const avgWinGross = avgWinMovePct * lev;
    const avgLossGross = avgLossMovePct * lev;
    const avgWinNet = avgWinGross - feeM;
    const avgLossNet = avgLossGross - feeM;
    const netEv = winRate * avgWinNet + (1 - winRate) * avgLossNet;
    const feeShare = avgWinGross > 0 ? (feeM / avgWinGross) * 100 : 100;
    let okKo = '비추천';
    if (feeShare <= 35 && netEv > 0 && avgWinNet > feeM * 0.5) okKo = '가능';
    if (feeShare <= 25 && netEv > 0.3) okKo = '양호';
    if (feeShare <= 20 && netEv > 0.6) okKo = '적합';
    leverageTable.push({
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
  const ranked = [...leverageTable].sort((a, b) => b.netEvRoePct - a.netEvRoePct);
  const best =
    ranked.find((r) => r.okKo === '적합' || r.okKo === '양호' || r.okKo === '가능') ??
    ranked[0]!;

  let cum = 0;
  let cumRoe = 0;
  const equityCurve: BtcRocketYearReplayPack['equityCurve'] = [];
  trades.forEach((t, i) => {
    cum += t.movePct;
    cumRoe += t.movePct * 30;
    if (i % Math.max(1, Math.floor(trades.length / 40)) === 0 || i === trades.length - 1) {
      equityCurve.push({ i, cumMovePct: cum, cumRoe30: cumRoe });
    }
  });

  const fromTime = Number(candles[0]?.time) || 0;
  const toTime = Number(candles[candles.length - 1]?.time) || 0;
  const daysCovered = fromTime > 0 && toTime > fromTime ? (toTime - fromTime) / 86400 : 0;
  const rocketLong = events.filter((e) => e.direction === 'LONG').length;
  const rocketShort = events.filter((e) => e.direction === 'SHORT').length;

  const failBands = buildFailEntryBands(
    trades.map((t) => ({
      timeframe: BTC_3M_ROCKET_TF,
      direction: t.direction,
      entryTime: t.entryTime,
      entry: t.entry,
      stop: t.stop,
      tp1: t.entry,
      slDistPct: t.slDistPct,
      tpDistPct: 0,
      exitReason: t.exitReason === 'SL' ? 'SL' : t.exitReason === 'TIME' ? 'TIME' : 'TP1',
      exitPrice: t.exitPrice,
      barsHeld: t.barsHeld,
      movePct: t.movePct,
      mfePct: t.mfePct,
      maePct: t.maePct,
      win: t.win,
    }))
  );

  return {
    symbol: BTC_3M_ROCKET_SYMBOL,
    timeframe: BTC_3M_ROCKET_TF,
    candleCount: candles.length,
    daysCovered,
    fromTime,
    toTime,
    rocketLong,
    rocketShort,
    tradeCount: n,
    wins: wins.length,
    losses: losses.length,
    winRate: n > 0 ? wins.length / n : null,
    longWins: wins.filter((t) => t.direction === 'LONG').length,
    shortWins: wins.filter((t) => t.direction === 'SHORT').length,
    tpHits: trades.filter((t) => t.exitReason === 'TP_MFE').length,
    slHits: trades.filter((t) => t.exitReason === 'SL').length,
    timeExits: trades.filter((t) => t.exitReason === 'TIME').length,
    avgMfePct,
    avgMaePct,
    avgWinMovePct,
    avgLossMovePct,
    medianSlDistPct,
    suggestSlPricePct,
    suggestTpPricePct,
    lev30: {
      suggestTpRoePct,
      suggestSlRoePct,
      feeRoundTripMarginPct,
      fundingHalfHourMarginPct,
      netTpRoeAfterFeePct: netTp.netRoePct,
      detailKo: [
        ...netTp.detailKo,
        `로켓상승🚀 ${rocketLong} · 로켓하락📉 ${rocketShort}`,
        `헌팅SL중앙 ${medianSlDistPct.toFixed(3)}% · 권장SL ${suggestSlPricePct.toFixed(3)}% · 권장TP ${suggestTpPricePct.toFixed(3)}%`,
        failBands.length ? `실패가격구간 ${failBands.length}개 배제` : '실패가격구간 없음',
      ],
    },
    leverageTable,
    bestLeverage: best.leverage,
    bestLevKo: `${best.leverage}x · ${best.okKo} · 순기대ROE ${best.netEvRoePct.toFixed(2)}%p · 수수료비중 ${best.feeShareOfWinPct.toFixed(0)}%`,
    preferTfs: ['3m', '5m'],
    skipTfs: [],
    failBands,
    sampleTrades: trades.slice(0, 50),
    equityCurve,
    summaryKo: `BTC 3m 로켓 · ${daysCovered.toFixed(0)}일 · 🚀${rocketLong}/📉${rocketShort} · 거래${n} · 승${wins.length} · 권장 ${baseLev}x TP ${suggestTpRoePct.toFixed(1)}%ROE / SL ${suggestSlRoePct.toFixed(1)}%ROE · 실패구간${failBands.length} · 확정아님`,
    hintKo:
      '숏=로켓하락 고가 위 SL · 롱=로켓상승 저가 아래 SL · 테이커 0.06%×2·펀딩 가정 · 확정 수익·승률 아님',
  };
}
