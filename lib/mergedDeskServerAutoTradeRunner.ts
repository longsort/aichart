/**
 * 서버 자동매매 틱 — tapOnly면 타점엔진만 · 아니면 Dual 레이스 + BNB(PPL+캔들).
 * 구 스캔 함수는 유지(삭제 아님). 확정 수익 아님.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { analyzeCandles } from '@/lib/analyze';
import type { AnalyzeResponse, Candle } from '@/types';
import {
  bitgetFetchAllOpenPositions,
  bitgetFetchPositionMode,
  bitgetOpenLongShort,
  equityPctToMarginUsdt,
  bitgetFetchAccountSummary,
} from '@/lib/bitgetPrivateTrade';
import {
  HEDGE_SIZE_MULT,
  hedgeNoteKo,
  isStrongHedgeSignal,
} from '@/lib/mergedDeskHedgeEntry';
import { readExchangeKeysMeta, readExchangeKeysPlain } from '@/lib/serverExchangeKeysStore';
import {
  listServerAutoTradeArmedUsers,
  markServerSignalFired,
  readServerAutoTradeArm,
  wasServerSignalFired,
  writeServerAutoTradeArm,
  writeServerPositionEntryMemo,
  readServerPositionEntryMemos,
  markServerPositionEntryTelegram,
  type AutoTradeCoinWatch,
  type AutoTradeWatchBoard,
  type ServerAutoTradeArm,
} from '@/lib/serverMergedDeskAutoTradeStore';
import { runServerLiveRoeExits } from '@/lib/mergedDeskServerLiveRoeExit';
import {
  listBgScanTimeframes,
  scanDumpTouchOnClosedBar,
} from '@/lib/mergedDeskBgDumpTouchEngine';
import {
  listEthChartSignalScanTimeframes,
  scanEthChartSignalsOnClosedBar,
} from '@/lib/mergedDeskEthChartSignalEngine';
import {
  buildCandleLsSignal,
  listCandleLsScanTimeframes,
  voteCandleLsOnClosedBar,
} from '@/lib/mergedDeskCandleLsSignal';
import { notifyMergedDeskPositionEntry } from '@/lib/mergedDeskLiveEntryTelegram';
import {
  DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS,
  filterAutoTradePositions,
  matchAutoTradeSymbolId,
  FAST_TP1_ROE_PCT,
  FAST_SL_ROE_PCT,
} from '@/lib/mergedDeskAutoTradeConfig';
import { runTapointOrchestrator } from '@/lib/eagle1Tapoint/orchestrator';
import { loadTapointHtfMacroCandles } from '@/lib/eagle1Tapoint/htfCandleLoader';
import { resolveInstBandTripleEntry, tapointAutoBarSlot } from '@/lib/eagle1Tapoint/instBandTripleEntry';
import {
  INST_BAND_SCALP_A_TAG,
} from '@/lib/eagle1Tapoint/institutionalBandTapPlan';
import {
  loadTapSetupSourceHints,
  recordDualRaceAsSetupHint,
} from '@/lib/eagle1Tapoint/setupSourceBridge.server';
import {
  markTapLifecycleExecuted,
  markTapLifecycleManage,
} from '@/lib/eagle1Tapoint/entryLifecycleTap';
import { evaluateTapointCandleQuality } from '@/lib/eagle1Tapoint/tapointQualityRepaintGate';
import { readServerExclusiveSkillMap } from '@/lib/serverCoinExclusiveSkillsStore';
import type { CoinExclusiveSkillMap } from '@/lib/mergedDeskCoinExclusiveSkills';
import { TAPOINT_SOURCE } from '@/lib/eagle1Tapoint/types';
import { resolveTapointEntryTf } from '@/lib/eagle1Tapoint/symbolEntryTf';
import { resolveTapointSlRoePct } from '@/lib/eagle1Tapoint/slRoeByTf';
import { resolveTapointSymbolLevTp } from '@/lib/eagle1Tapoint/symbolLevTp';
import {
  normalizeCoinSkillRisk,
  resolveCoinSkillRiskForSymbol,
  type CoinSkillRiskMap,
} from '@/lib/mergedDeskCoinSkillRisk';
import { readServerCoinSkillRiskMap } from '@/lib/serverCoinSkillRiskStore';
import { normalizeCoinKey } from '@/lib/mergedDeskCoinExitProfile';
import { runTapointDecideShared } from '@/lib/serverTapointDecideShare';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import {
  WICK_15M_TF,
  WICK_15M_PCT_MIN,
  scanWick15mOnClosedBar,
  resolveWick15mLeverage,
} from '@/lib/mergedDeskWick15mTrade';
import {
  XRP_4STRAT_SYMBOL,
  listXrpFourStrategyTimeframes,
  scanXrpFourStrategyOnClosedBar,
} from '@/lib/mergedDeskXrpFourStrategyTrade';
import {
  DUMP_WATCH_WICK_TF,
  DUMP_WATCH_WICK_PCT_MIN,
  scanDumpWatchWickShortOnClosedBar,
} from '@/lib/mergedDeskDumpWatchWickShort';
import {
  listHtfDumpTouchTimeframes,
  scanHtfDumpTouchOnClosedBar,
} from '@/lib/mergedDeskHtfDumpTouchTrade';
import {
  pickBtcSignalRaceWinner,
  runBtcSignalRace,
  type BtcRaceLaneCandidate,
} from '@/lib/mergedDeskBtcSignalRace';
import {
  BTC_ROCKET_CART_SOURCE,
  ROCKET_CART_SYMBOLS,
} from '@/lib/mergedDeskBtcRocketCartSignal';
import { STRUCTURE_S_SOURCE } from '@/lib/mergedDeskStructureSSignal';
import {
  ACCOUNT_RISK_PCT_DEFAULT,
  resolveStructureAwareLevSlTp,
} from '@/lib/mergedDeskLiveSlTp';
import {
  clearDualStructurePending,
  listDualStructurePendings,
  refineDualRaceToStructureEntry,
  resolvePendingTouchOrAiZone,
  upsertDualStructurePending,
} from '@/lib/mergedDeskDualStructureEntry';
import {
  BNB_PPL_SYMBOL,
  listBnbPplAutoTimeframes,
  scanBnbPplCandleOnClosedBar,
} from '@/lib/mergedDeskBnbPplCandleTrade';

const LOCK_DIR = path.join(process.cwd(), 'data', 'merged-desk-auto-trade-locks');
const LOCK_STALE_MS = 4 * 60_000;
/** 동시 유저 틱 수 · 개인키·주문은 유저별 분리 */
const USER_TICK_CONCURRENCY = Math.max(
  1,
  Math.min(6, Number(process.env.AUTO_TRADE_USER_CONCURRENCY || 3) || 3)
);
/** Dual 서버 레이스 대상 */
const DUAL_SERVER_SYMS = new Set(
  (ROCKET_CART_SYMBOLS as readonly string[]).map((s) => s.toUpperCase())
);

export type ServerAutoTradeTickStats = {
  users: number;
  scanned: number;
  opened: number;
  skipped: number;
  errors: number;
  notes: string[];
};

type EntryCand = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  signalId: string;
  noteKo: string;
  source: string;
  analysisTags?: string[];
  /** 밴드 구조 SL/TP 유지 · 고정 ROE로 다시 쓰지 않음 */
  structureLock?: boolean;
  /** 스탑헌팅 거리에 맞춘 레버 */
  fitLev?: number;
};

function userLockPath(user: string): string {
  const safe = String(user || 'anon').replace(/[^\w.-]/g, '_');
  return path.join(LOCK_DIR, `${safe}.lock`);
}

async function tryAcquireUserLock(user: string): Promise<boolean> {
  await fs.mkdir(LOCK_DIR, { recursive: true });
  const lockPath = userLockPath(user);
  const now = Date.now();
  try {
    await fs.writeFile(lockPath, `${process.pid}|${now}`, { flag: 'wx' });
    return true;
  } catch {
    try {
      const raw = await fs.readFile(lockPath, 'utf8');
      const ts = Number(String(raw).split('|')[1] || 0);
      if (ts > 0 && now - ts < LOCK_STALE_MS) return false;
      await fs.writeFile(lockPath, `${process.pid}|${now}`, { flag: 'w' });
      return true;
    } catch {
      return false;
    }
  }
}

async function releaseUserLock(user: string): Promise<void> {
  try {
    await fs.unlink(userLockPath(user));
  } catch {
    /* ignore */
  }
}

/** 제한 병렬 — 유저 A 대기가 유저 B를 막지 않음 */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) || 1 }, async () => {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function scanDump(symbol: string, arm: ServerAutoTradeArm): Promise<EntryCand[]> {
  const out: EntryCand[] = [];
  const tfs = listBgScanTimeframes().filter((tf) =>
    ['5m', '15m', '1h', '4h'].includes(tf)
  );
  for (const tf of tfs) {
    try {
      const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
        recentOnly: true,
      });
      const sig = scanDumpTouchOnClosedBar({
        symbol,
        timeframe: tf,
        candles,
        leverage: arm.leverage,
        minRr: arm.minRr,
      });
      if (sig) {
        out.push({
          symbol,
          timeframe: sig.timeframe,
          direction: sig.direction,
          entry: sig.entry,
          sl: sig.sl,
          tp: sig.tp1,
          signalId: `srv-${sig.signalId}`,
          noteKo: sig.noteKo,
          source: 'dump-zone',
        });
      }
    } catch {
      /* skip tf */
    }
  }
  return out;
}

async function scanChart(symbol: string, arm: ServerAutoTradeArm): Promise<EntryCand[]> {
  const out: EntryCand[] = [];
  const tfs = listEthChartSignalScanTimeframes();
  for (const tf of tfs) {
    try {
      const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
        recentOnly: true,
      });
      const sig = scanEthChartSignalsOnClosedBar({
        symbol,
        timeframe: tf,
        candles,
        leverage: arm.leverage,
        minRr: arm.minRr,
        /** ETH 미진입 완화: 합류 점수 2 */
        minScore: symbol.toUpperCase().startsWith('ETH') ? 2 : 3,
      });
      if (sig) {
        out.push({
          symbol,
          timeframe: sig.timeframe,
          direction: sig.direction,
          entry: sig.entry,
          sl: sig.sl,
          tp: sig.tp1,
          signalId: `srv-${sig.signalId}`,
          noteKo: sig.noteKo,
          source: 'cart-signal',
        });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

async function scanCandleLs(symbol: string, arm: ServerAutoTradeArm): Promise<EntryCand[]> {
  const votes = [];
  for (const tf of listCandleLsScanTimeframes()) {
    try {
      const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
        recentOnly: true,
      });
      const v = voteCandleLsOnClosedBar({ timeframe: tf, candles });
      if (v) votes.push(v);
    } catch {
      /* skip */
    }
  }
  const sig = buildCandleLsSignal({
    symbol,
    votes,
    leverage: arm.leverage,
    minRr: arm.minRr,
  });
  if (!sig) return [];
  return [
    {
      symbol,
      timeframe: sig.timeframe,
      direction: sig.direction,
      entry: sig.entry,
      sl: sig.sl,
      tp: sig.tp1,
      signalId: `srv-${sig.signalId}`,
      noteKo: sig.noteKo,
      source: 'candle-ls',
    },
  ];
}

async function scanWick15m(symbol: string, arm: ServerAutoTradeArm): Promise<EntryCand[]> {
  try {
    const { candles } = await loadBitgetFuturesChartCandles(symbol, WICK_15M_TF, {
      recentOnly: true,
    });
    let longPct = 0;
    let shortPct = 0;
    try {
      const pack = analyzeCandles(symbol, WICK_15M_TF, candles) as {
        longScore?: number;
        shortScore?: number;
        aiZonePack?: { longPct?: number | null; shortPct?: number | null } | null;
      };
      longPct =
        pack.aiZonePack?.longPct != null
          ? Number(pack.aiZonePack.longPct)
          : Number(pack.longScore) || 0;
      shortPct =
        pack.aiZonePack?.shortPct != null
          ? Number(pack.aiZonePack.shortPct)
          : Number(pack.shortScore) || 0;
    } catch {
      /* ignore */
    }
    const sig = scanWick15mOnClosedBar({
      symbol,
      candles,
      longPct,
      shortPct,
      leverage: resolveWick15mLeverage(arm.leverage),
      pctMin: WICK_15M_PCT_MIN,
      tp1RoePct: FAST_TP1_ROE_PCT,
    });
    if (!sig) return [];
    return [
      {
        symbol: sig.symbol,
        timeframe: sig.timeframe,
        direction: sig.direction,
        entry: sig.entry,
        sl: sig.sl,
        tp: sig.tp1,
        signalId: `srv-${sig.signalId}`,
        noteKo: sig.noteKo,
        source: 'wick-15m',
      },
    ];
  } catch {
    return [];
  }
}

/** 클라이언트와 동일 — XRP 독수리1호 4패턴(필수3) */
async function scanXrpFour(arm: ServerAutoTradeArm): Promise<EntryCand[]> {
  const out: EntryCand[] = [];
  const lev = resolveWick15mLeverage(arm.leverage);
  for (const tf of listXrpFourStrategyTimeframes()) {
    try {
      const { candles } = await loadBitgetFuturesChartCandles(XRP_4STRAT_SYMBOL, tf, {
        recentOnly: true,
      });
      const sig = scanXrpFourStrategyOnClosedBar({
        candles,
        timeframe: tf,
        leverage: lev,
        tp1RoePct: FAST_TP1_ROE_PCT,
      });
      if (sig) {
        out.push({
          symbol: sig.symbol,
          timeframe: sig.timeframe,
          direction: sig.direction,
          entry: sig.entry,
          sl: sig.sl,
          tp: sig.tp1,
          signalId: `srv-${sig.signalId}`,
          noteKo: sig.noteKo,
          source: 'four-strategy',
        });
      }
    } catch {
      /* skip tf */
    }
  }
  return out;
}

/** 15m 폭락감시+윗꼬리+저항≥70+연속매도량 — 코인별 추가 숏 */
async function scanDumpWatchWick(
  symbol: string,
  arm: ServerAutoTradeArm
): Promise<EntryCand[]> {
  try {
    const { candles } = await loadBitgetFuturesChartCandles(symbol, DUMP_WATCH_WICK_TF, {
      recentOnly: true,
    });
    let longPct = 0;
    let shortPct = 0;
    try {
      const pack = analyzeCandles(symbol, DUMP_WATCH_WICK_TF, candles) as {
        longScore?: number;
        shortScore?: number;
        aiZonePack?: { longPct?: number | null; shortPct?: number | null } | null;
      };
      longPct =
        pack.aiZonePack?.longPct != null
          ? Number(pack.aiZonePack.longPct)
          : Number(pack.longScore) || 0;
      shortPct =
        pack.aiZonePack?.shortPct != null
          ? Number(pack.aiZonePack.shortPct)
          : Number(pack.shortScore) || 0;
    } catch {
      /* ignore */
    }
    const sig = scanDumpWatchWickShortOnClosedBar({
      symbol,
      candles,
      longPct,
      shortPct,
      leverage: resolveWick15mLeverage(arm.leverage),
      pctMin: DUMP_WATCH_WICK_PCT_MIN,
      tp1RoePct: FAST_TP1_ROE_PCT,
    });
    if (!sig) return [];
    return [
      {
        symbol: sig.symbol,
        timeframe: sig.timeframe,
        direction: sig.direction,
        entry: sig.entry,
        sl: sig.sl,
        tp: sig.tp1,
        signalId: `srv-${sig.signalId}`,
        noteKo: sig.noteKo,
        source: 'dump-watch-wick',
      },
    ];
  } catch {
    return [];
  }
}

/** HTF 1h·4h·1d·1w·1M 폭락존 터치 롱/숏 — 상위 TF 1건 */
async function scanHtfDump(symbol: string, arm: ServerAutoTradeArm): Promise<EntryCand[]> {
  const found: EntryCand[] = [];
  const lev = resolveWick15mLeverage(arm.leverage);
  const tfs = listHtfDumpTouchTimeframes();
  for (const tf of tfs) {
    try {
      const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
        recentOnly: true,
      });
      const sig = scanHtfDumpTouchOnClosedBar({
        symbol,
        timeframe: tf,
        candles,
        leverage: lev,
        slRoePct: FAST_SL_ROE_PCT,
      });
      if (sig) {
        found.push({
          symbol: sig.symbol,
          timeframe: sig.timeframe,
          direction: sig.direction,
          entry: sig.entry,
          sl: sig.sl,
          tp: sig.tp1,
          signalId: `srv-${sig.signalId}`,
          noteKo: sig.noteKo,
          source: 'htf-dump-touch',
        });
      }
    } catch {
      /* skip */
    }
  }
  if (!found.length) return [];
  const rank = (tf: string) => {
    const i = tfs.indexOf(tf);
    return i >= 0 ? i : -1;
  };
  found.sort((a, b) => rank(b.timeframe) - rank(a.timeframe));
  return [found[0]!];
}

async function loadTf(symbol: string, tf: string): Promise<Candle[]> {
  try {
    const pack = await loadBitgetFuturesChartCandles(symbol, tf, { recentOnly: true });
    return Array.isArray(pack.candles) ? pack.candles : [];
  } catch {
    return [];
  }
}

/** BNB 전용 — SFP 중지 · 캔들분석 + Parallel Pivot Lines 터치 진입 */
async function scanBnbPplServer(arm: ServerAutoTradeArm): Promise<EntryCand[]> {
  const out: EntryCand[] = [];
  const tfs = listBnbPplAutoTimeframes();
  const lev = Math.max(1, Math.min(125, Math.round(Number(arm.leverage) || 20)));
  for (const tf of tfs) {
    try {
      const candles = await loadTf(BNB_PPL_SYMBOL, tf);
      if (candles.length < 64) continue;
      let analysis: AnalyzeResponse | null = null;
      let longPct: number | null = null;
      let shortPct: number | null = null;
      try {
        analysis = analyzeCandles(BNB_PPL_SYMBOL, tf, candles) as AnalyzeResponse;
        const pack = analysis as {
          longScore?: number;
          shortScore?: number;
          aiZonePack?: { longPct?: number | null; shortPct?: number | null } | null;
        };
        longPct =
          pack.aiZonePack?.longPct != null
            ? Number(pack.aiZonePack.longPct)
            : Number(pack.longScore) || null;
        shortPct =
          pack.aiZonePack?.shortPct != null
            ? Number(pack.aiZonePack.shortPct)
            : Number(pack.shortScore) || null;
      } catch {
        analysis = null;
      }
      const sig = scanBnbPplCandleOnClosedBar({
        candles,
        timeframe: tf,
        leverage: lev,
        minRr: arm.minRr || 1.2,
        analysis,
        longPct,
        shortPct,
      });
      if (!('signalId' in sig) || !('mode' in sig)) continue;
      if (sig.mode !== 'enter_now') continue;
      out.push({
        symbol: BNB_PPL_SYMBOL,
        timeframe: sig.timeframe,
        direction: sig.direction,
        entry: sig.entry,
        sl: sig.sl,
        tp: sig.tp1,
        signalId: `srv-${sig.signalId}`,
        noteKo: sig.noteKo,
        source: 'bnb-ppl-candle',
      });
    } catch {
      /* skip tf */
    }
  }
  out.sort((a, b) => {
    const rank = (tf: string) => (tf === '15m' ? 2 : tf === '5m' ? 1 : 0);
    return rank(b.timeframe) - rank(a.timeframe);
  });
  return out.slice(0, 1);
}

/**
 * Dual 서버 레이스 — 구조타점 터치 후 진입 (추격 시장가 금지).
 * BNBUSDT는 Dual 대신 캔들분석+PPL 롱숏만.
 */

/** 타점엔진 서버 스캔 — CONFIRMED만 후보 · 볼륨폭발은 5m·15m 감지 */
/**
 * tapOnly 모드 — Dual 레이스는 주문 없이 SETUP 힌트만 기록.
 * 기존 Dual 스캔 로직 재사용 · 삭제 아님.
 */
async function recordDualSetupHintsOnly(symbol: string): Promise<void> {
  const sym = String(symbol || '').toUpperCase();
  if (!DUAL_SERVER_SYMS.has(sym)) return;
  try {
    const [c1, c3, c15] = await Promise.all([
      loadTf(sym, '1m'),
      loadTf(sym, '3m'),
      loadTf(sym, '15m'),
    ]);
    if (c1.length < 36 && c3.length < 36 && c15.length < 40) return;
    const price =
      Number(c1[c1.length - 1]?.close) ||
      Number(c3[c3.length - 1]?.close) ||
      Number(c15[c15.length - 1]?.close) ||
      0;
    const raceOpts = {
      symbol: sym,
      candles3m: c3.length >= 40 ? c3 : null,
      candlesS: c15.length >= 40 ? c15 : null,
      leverage: 20,
      minRr: 1.2,
      tp1RoePct: FAST_TP1_ROE_PCT,
      price: price > 0 ? price : null,
      candles15m: c15.length >= 12 ? c15 : null,
    };
    const pool: BtcRaceLaneCandidate[] = [];
    if (c1.length >= 36) {
      const r1 = runBtcSignalRace({
        ...raceOpts,
        candlesFast: c1,
        timeframeFast: '1m',
      });
      if (r1.signalA) pool.push(r1.signalA);
      if (r1.signalB) pool.push(r1.signalB);
      if (r1.signalC) pool.push(r1.signalC);
    }
    if (c3.length >= 36) {
      const r3 = runBtcSignalRace({
        ...raceOpts,
        candlesFast: c3,
        timeframeFast: '3m',
      });
      if (r3.signalA) pool.push(r3.signalA);
      if (r3.signalB) pool.push(r3.signalB);
      if (r3.signalC) pool.push(r3.signalC);
    }
    const seen = new Set<string>();
    for (const w of pool) {
      if (seen.has(w.signalId)) continue;
      seen.add(w.signalId);
      const src =
        w.source === BTC_ROCKET_CART_SOURCE
          ? BTC_ROCKET_CART_SOURCE
          : w.source === STRUCTURE_S_SOURCE
            ? STRUCTURE_S_SOURCE
            : 'rb-scalp';
      recordDualRaceAsSetupHint({
        symbol: sym,
        source: src,
        direction: w.direction,
        signalId: w.signalId,
        timeframe:
          w.slot === 'B'
            ? '3m'
            : w.slot === 'C'
              ? '15m'
              : /-(1m|3m|5m)-/.exec(w.signalId)?.[1] || '1m',
        noteKo: `${w.slotKo || w.slot} · ${w.signalKo || ''} · SETUP힌트`,
        grade: src === STRUCTURE_S_SOURCE ? 'S' : null,
      });
    }
  } catch {
    /* 힌트 실패는 주문 경로에 영향 없음 */
  }
}

type WatchDraft = Pick<AutoTradeCoinWatch, 'tone' | 'lineKo'>;

function dirKo(dir: string | null | undefined): string {
  if (dir === 'LONG') return '롱';
  if (dir === 'SHORT') return '숏';
  return '';
}

function coinWatch(
  sym: string,
  tone: AutoTradeCoinWatch['tone'],
  lineKo: string
): AutoTradeCoinWatch {
  const symbol = String(sym || '').toUpperCase();
  return {
    symbol,
    coin: symbol.replace(/USDT$/i, ''),
    tone,
    lineKo: lineKo.slice(0, 56),
  };
}

function verdictFromCoins(coins: AutoTradeCoinWatch[]): string {
  const readyN = coins.filter((c) => c.tone === 'ready').length;
  const holdN = coins.filter((c) => c.tone === 'hold').length;
  const inN = coins.filter((c) => c.tone === 'in').length;
  if (inN > 0) return `자동매매 동작 중 · 방금 ${inN}건 진입`;
  if (readyN > 0) return `자동매매 동작 중 · ${readyN}개 진입 가능`;
  if (holdN > 0 && holdN === coins.length) return '자동매매 동작 중 · 전부 보유라 추가 안 함';
  if (coins.some((c) => c.tone === 'bad')) return '자동매매 동작 중 · 일부 코인 스캔 실패';
  return '자동매매 동작 중 · 지금은 들어갈 자리 없음';
}

function stampWatch(
  user: string,
  arm: ServerAutoTradeArm,
  verdictKo: string,
  lineKo: string,
  alive: boolean,
  lastStatusKo?: string
): void {
  const symbols = (
    arm.enabledSymbols?.length ? arm.enabledSymbols : DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS
  ).map((s) => s.toUpperCase());
  const board: AutoTradeWatchBoard = {
    verdictKo,
    alive,
    updatedAt: Date.now(),
    coins: symbols.map((s) => coinWatch(s, 'wait', lineKo)),
  };
  writeServerAutoTradeArm(user, {
    watchBoard: board,
    lastStatusKo: lastStatusKo ?? verdictKo,
    lastTickAt: Date.now(),
  });
}

async function scanTapointServer(
  symbol: string,
  _arm: ServerAutoTradeArm,
  exclusiveMap?: CoinExclusiveSkillMap | null,
  watchOut?: { draft: WatchDraft | null },
  skillRiskMap?: CoinSkillRiskMap | null
): Promise<EntryCand[]> {
  const mark = (tone: WatchDraft['tone'], lineKo: string) => {
    if (watchOut) watchOut.draft = { tone, lineKo };
  };
  const sym = String(symbol || '').toUpperCase();
  const tf = resolveTapointEntryTf(sym);
  try {
    await recordDualSetupHintsOnly(sym);
    const dual = loadTapSetupSourceHints(sym);
    const { report } = await runTapointDecideShared(sym, tf, async () => {
      const [{ candles }, c5, c15, htf] = await Promise.all([
        loadBitgetFuturesChartCandles(sym, tf, { recentOnly: true }),
        loadBitgetFuturesChartCandles(sym, '5m', { recentOnly: true }).catch(() => ({
          candles: [] as Awaited<ReturnType<typeof loadBitgetFuturesChartCandles>>['candles'],
        })),
        loadBitgetFuturesChartCandles(sym, '15m', { recentOnly: true }).catch(() => ({
          candles: [] as Awaited<ReturnType<typeof loadBitgetFuturesChartCandles>>['candles'],
        })),
        loadTapointHtfMacroCandles(sym),
      ]);
      const q = evaluateTapointCandleQuality({
        symbol: sym,
        timeframe: tf,
        candles: candles || [],
        minBars: 64,
      });
      return runTapointOrchestrator({
        symbol: sym,
        timeframe: tf,
        candles: candles || [],
        dailyCandles: htf.dailyCandles || [],
        weeklyCandles: htf.weeklyCandles || [],
        monthlyCandles: htf.monthlyCandles || [],
        macroCandles: htf.pack,
        candles5m: c5.candles || [],
        candles15m: c15.candles || [],
        qualityOk: q.qualityOk,
        qualityNoteKo: q.noteKo,
        setupSources: [
          'eagle1-pipeline',
          'server-tap',
          'adv-volume',
          'daily-face',
          'vol-burst-5m15m',
          'p2-macro-htf',
          'quality-repaint-gate',
          ...dual.sources,
        ],
        setupHint: dual.setupHint,
      });
    });
    const skillLev = resolveCoinSkillRiskForSymbol(sym, skillRiskMap).leverage;
    const aligned = resolveInstBandTripleEntry(report, {
      leverage: Math.max(1, Math.round(Number(skillLev) || Number(_arm.leverage) || 10)),
      exclusiveMap,
    });
    if (
      !aligned.ok ||
      !aligned.direction ||
      aligned.entry == null ||
      aligned.sl == null ||
      aligned.tp == null
    ) {
      mark('wait', aligned.reasonKo);
      return [];
    }
    if (aligned.paperOnly || aligned.allowLive === false) {
      mark('wait', aligned.reasonKo);
      return [];
    }
    mark('ready', aligned.reasonKo);
    const dir = aligned.direction;
    const barKey = tapointAutoBarSlot(tf);
    return [
      {
        symbol: sym,
        timeframe: tf,
        direction: dir,
        entry: aligned.entry,
        sl: aligned.sl,
        tp: aligned.tp,
        signalId: `band15-auto-${sym}-${aligned.eventId || barKey}-${dir}`,
        noteKo: aligned.reasonKo,
        source: TAPOINT_SOURCE,
        structureLock: true,
        fitLev: aligned.leverage && aligned.leverage > 0 ? aligned.leverage : undefined,
        analysisTags: [
          'eagle1-vmax',
          'tap-only',
          'server-tap',
          'INST_BAND_15M_PAPER',
          'band15Auto',
          'BAND15_AUTO',
          INST_BAND_SCALP_A_TAG,
          `ib:${report.instBandPlan?.status || ''}`,
        ],
      },
    ];
  } catch {
    mark('bad', '스캔 오류');
    return [];
  }
}

async function collectCandidates(
  symbol: string,
  arm: ServerAutoTradeArm,
  exclusiveMap?: CoinExclusiveSkillMap | null,
  watchOut?: { draft: WatchDraft | null },
  skillRiskMap?: CoinSkillRiskMap | null
): Promise<EntryCand[]> {
  const sym = String(symbol || '').toUpperCase();

  /** 타점엔진 전용 — Dual/BNB-PPL/구경로 서버주문 OFF */
  if (arm.tapOnly !== false) {
    return scanTapointServer(sym, arm, exclusiveMap, watchOut, skillRiskMap);
  }
  if (watchOut) watchOut.draft = { tone: 'wait', lineKo: '기관밴드 경로 아님' };

  if (sym === BNB_PPL_SYMBOL || sym.startsWith('BNB')) {
    return scanBnbPplServer(arm);
  }

  if (!DUAL_SERVER_SYMS.has(sym)) return [];

  const [c1, c3, c15] = await Promise.all([
    loadTf(sym, '1m'),
    loadTf(sym, '3m'),
    loadTf(sym, '15m'),
  ]);
  if (c1.length < 36 && c3.length < 36 && c15.length < 40) return [];

  const price =
    Number(c1[c1.length - 1]?.close) ||
    Number(c3[c3.length - 1]?.close) ||
    Number(c15[c15.length - 1]?.close) ||
    0;
  const maxLev = Math.max(1, Math.min(125, Math.round(Number(arm.leverage) || 20)));
  const out: EntryCand[] = [];

  /** 타점 대기 — 터치 또는 AIZONE≥70 · 불일치 포기 */
  for (const pend of listDualStructurePendings(sym)) {
    let longPct: number | null = null;
    let shortPct: number | null = null;
    try {
      const candlesAi = c3.length >= 40 ? c3 : c1;
      const pack = analyzeCandles(sym, pend.timeframe || '3m', candlesAi) as {
        longScore?: number;
        shortScore?: number;
        aiZonePack?: { longPct?: number | null; shortPct?: number | null } | null;
      };
      longPct =
        pack.aiZonePack?.longPct != null
          ? Number(pack.aiZonePack.longPct)
          : Number(pack.longScore) || null;
      shortPct =
        pack.aiZonePack?.shortPct != null
          ? Number(pack.aiZonePack.shortPct)
          : Number(pack.shortScore) || null;
    } catch {
      /* 추정 없으면 터치만 */
    }
    const resolved = resolvePendingTouchOrAiZone({
      pending: pend,
      mark: price,
      leverage: maxLev,
      tp1RoePct: arm.scalpTp1RoePct || FAST_TP1_ROE_PCT,
      longPct,
      shortPct,
    });
    if (resolved.mode === 'abandon') {
      clearDualStructurePending(sym, pend.signalId);
      continue;
    }
    if (resolved.mode === 'wait') continue;
    clearDualStructurePending(sym, pend.signalId);
    out.push({
      symbol: sym,
      timeframe: pend.timeframe,
      direction: pend.direction,
      entry: resolved.entry,
      sl: resolved.sl,
      tp: resolved.tp,
      signalId: pend.signalId,
      noteKo: `${pend.signalKo} · ${resolved.reasonKo}`,
      source: pend.source,
    });
  }
  if (out.length) return out;
  if (listDualStructurePendings(sym).length > 0) return [];

  const raceOpts = {
    symbol: sym,
    candles3m: c3.length >= 40 ? c3 : null,
    candlesS: c15.length >= 40 ? c15 : null,
    leverage: maxLev,
    minRr: arm.minRr || 1.2,
    tp1RoePct: arm.scalpTp1RoePct || FAST_TP1_ROE_PCT,
    price: price > 0 ? price : null,
    candles15m: c15.length >= 12 ? c15 : null,
  };

  const pool: BtcRaceLaneCandidate[] = [];
  if (c1.length >= 36) {
    const r1 = runBtcSignalRace({
      ...raceOpts,
      candlesFast: c1,
      timeframeFast: '1m',
    });
    if (r1.signalA) pool.push(r1.signalA);
    if (r1.signalB) pool.push(r1.signalB);
    if (r1.signalC) pool.push(r1.signalC);
  }
  if (c3.length >= 36) {
    const r3 = runBtcSignalRace({
      ...raceOpts,
      candlesFast: c3,
      timeframeFast: '3m',
    });
    if (r3.signalA) pool.push(r3.signalA);
    if (r3.signalB) pool.push(r3.signalB);
    if (r3.signalC) pool.push(r3.signalC);
  }

  const seen = new Set<string>();
  const uniq = pool.filter((w) => {
    if (seen.has(w.signalId)) return false;
    seen.add(w.signalId);
    return true;
  });
  const win = pickBtcSignalRaceWinner(uniq);
  if (!win) return [];

  const src =
    win.source === BTC_ROCKET_CART_SOURCE
      ? BTC_ROCKET_CART_SOURCE
      : win.source === STRUCTURE_S_SOURCE
        ? STRUCTURE_S_SOURCE
        : 'rb-scalp';
  const tf =
    win.slot === 'B'
      ? '3m'
      : win.slot === 'C'
        ? '15m'
        : /-(1m|3m|5m)-/.exec(win.signalId)?.[1] || '1m';
  const candles =
    tf === '3m' ? (c3.length >= 36 ? c3 : c1) : tf === '15m' ? c15 : c1.length >= 36 ? c1 : c3;

  const refined = refineDualRaceToStructureEntry({
    win,
    candles,
    timeframe: tf,
    markPrice: price,
    leverage: maxLev,
    tp1RoePct: arm.scalpTp1RoePct || FAST_TP1_ROE_PCT,
  });

  if (refined.mode === 'wait_touch') {
    upsertDualStructurePending({ ...refined.pending, symbol: sym });
    recordDualRaceAsSetupHint({
      symbol: sym,
      source: src,
      direction: win.direction,
      signalId: win.signalId,
      timeframe: tf,
      noteKo: `${win.slotKo} · wait_touch · SETUP힌트`,
      grade: src === STRUCTURE_S_SOURCE ? 'S' : null,
    });
    return [];
  }
  if (refined.mode === 'reject') return [];

  recordDualRaceAsSetupHint({
    symbol: sym,
    source: src,
    direction: win.direction,
    signalId: win.signalId,
    timeframe: tf,
    noteKo: `${win.slotKo} · ${win.signalKo} · SETUP힌트`,
    grade: src === STRUCTURE_S_SOURCE ? 'S' : null,
  });

  return [
    {
      symbol: sym,
      timeframe: tf,
      direction: win.direction,
      entry: refined.entry,
      sl: refined.sl,
      tp: refined.tp,
      signalId: win.signalId,
      noteKo: `${win.slotKo} · ${win.signalKo} · ${refined.reasonKo}`,
      source: src,
    },
  ];
}

async function runForUser(user: string): Promise<{
  opened: number;
  skipped: number;
  errors: number;
  note: string;
}> {
  const arm = readServerAutoTradeArm(user);
  const skillRiskMap = readServerCoinSkillRiskMap(user);
  const exclusiveMap = readServerExclusiveSkillMap(user);
  if (!arm.liveArmed) {
    stampWatch(user, arm, '자동매매 꺼짐', '꺼져 있음', false);
    return { opened: 0, skipped: 1, errors: 0, note: `${user} · ARM꺼짐` };
  }
  /** 타점전용(tapOnly)은 strategyScalp OFF가 정상 · 초단 Dual만 막을 뿐 타점 진입은 허용 */
  if (arm.tapOnly === false && !arm.strategyScalp) {
    stampWatch(user, arm, '자동매매 안 됨 · 단타 전략 꺼짐', '단타 OFF', false);
    return { opened: 0, skipped: 1, errors: 0, note: `${user} · 단타전략OFF` };
  }
  const meta = readExchangeKeysMeta(user);
  if (!meta || meta.lastTestOk === false) {
    stampWatch(user, arm, '자동매매 안 됨 · 거래소 키 확인', '키 점검 실패', false);
    return { opened: 0, skipped: 1, errors: 0, note: `${user} · API미준비` };
  }
  const creds = readExchangeKeysPlain(user);
  if (!creds) {
    stampWatch(user, arm, '자동매매 안 됨 · 거래소 키 없음', '키 없음', false);
    return { opened: 0, skipped: 1, errors: 0, note: `${user} · 키없음` };
  }

  /** 진입 전에 ROE 익절 — 직전 25초 내 익절틱이 있으면 스킵(중복 Bitget 완화) */
  let exitNotes: string[] = [];
  const lastExitAt = Number(
    (globalThis as { __alsLastRoeExitAt?: Record<string, number> }).__alsLastRoeExitAt?.[
      user
    ] || 0
  );
  const skipExit = lastExitAt > 0 && Date.now() - lastExitAt < 25_000;
  if (!skipExit) {
    try {
      const ex = await runServerLiveRoeExits({
        user,
        creds,
        tp1RoePct: arm.scalpTp1RoePct || FAST_TP1_ROE_PCT,
        slRoePct: arm.scalpSlRoePct || FAST_SL_ROE_PCT,
        marginMode: arm.marginMode,
      });
      const g = globalThis as { __alsLastRoeExitAt?: Record<string, number> };
      if (!g.__alsLastRoeExitAt) g.__alsLastRoeExitAt = {};
      g.__alsLastRoeExitAt[user] = Date.now();
      exitNotes = ex.notes;
      if (ex.closed > 0) {
        writeServerAutoTradeArm(user, {
          lastStatusKo: `익절 ${ex.closed}건 · ${ex.notes[0] || ''}`,
          lastTickAt: Date.now(),
        });
      }
    } catch (e) {
      exitNotes = [e instanceof Error ? e.message : 'exit err'];
    }
  } else {
    exitNotes = ['익절직전스킵'];
  }

  const symbols = (arm.enabledSymbols?.length
    ? arm.enabledSymbols
    : DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS
  ).map((s) => s.toUpperCase());

  const posPack = await bitgetFetchAllOpenPositions(creds);
  /** 앱 외 코인(DOGE 등) 포지션은 동시 한도·차단에 넣지 않음 */
  const autoOpen = filterAutoTradePositions(posPack.positions || []).filter((p) =>
    symbols.includes(String(matchAutoTradeSymbolId(p.symbol) || p.symbol).toUpperCase())
  );
  /** 열린 포지션인데 진입 텔레그램이 없으면 한 번 보냄 (ETH·BNB 누락 포함) */
  const entryMemos = readServerPositionEntryMemos(user);
  for (const pos of autoOpen) {
    if (!(Number(pos.size) > 0) || !(Number(pos.entryPrice) > 0)) continue;
    const sym = String(matchAutoTradeSymbolId(pos.symbol) || pos.symbol).toUpperCase();
    if (entryMemos[sym]?.telegramAt) continue;
    const memo = entryMemos[sym];
    const tg = await notifyMergedDeskPositionEntry({
      symbol: sym,
      direction: pos.direction,
      price: Number(pos.entryPrice),
      sl: pos.slPrice,
      tp: pos.tpPrice,
      size: String(pos.size),
      leverage: Number(pos.leverage) || null,
      source: memo?.source || TAPOINT_SOURCE,
      signalId: memo?.signalId || null,
      mode: 'live',
      timeframe: memo?.timeframe || null,
      signalKo: memo?.signalKo || `${sym.replace(/USDT$/i, '')} 진입`,
      evidenceKo: '진입 텔레그램 누락 보정',
      noteKo: '서버 진입 알림',
    }).catch((e) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : 'telegram fail',
    }));
    if (tg.ok) {
      if (!memo) {
        writeServerPositionEntryMemo(user, {
          symbol: sym,
          direction: pos.direction,
          signalKo: `${sym.replace(/USDT$/i, '')} 진입`,
          source: TAPOINT_SOURCE,
          signalId: `pos-tg-${sym}`,
          timeframe: '',
          at: Date.now(),
        });
      }
      markServerPositionEntryTelegram(user, sym);
      console.log(`[entry-tg] catchup ${sym} ${pos.direction} sent`);
    } else {
      console.log(`[entry-tg] catchup ${sym} ${pos.direction} fail ${tg.error || '?'}`);
    }
  }
  if (autoOpen.length >= arm.maxConcurrent) {
    const note =
      exitNotes.length > 0
        ? `${user} · ${exitNotes[0]} · 보유한도대기`
        : `${user} · 자동매매보유${autoOpen.length}/${arm.maxConcurrent} · 대기`;
    const limitCoins = symbols.map((sym) => {
      const held = autoOpen.find(
        (p) => matchAutoTradeSymbolId(p.symbol) === sym && Number(p.size) > 0
      );
      return held
        ? coinWatch(sym, 'hold', `보유 ${dirKo(held.direction)} · 한도라 추가 없음`)
        : coinWatch(sym, 'wait', '보유 한도 · 신규 진입 없음');
    });
    writeServerAutoTradeArm(user, {
      lastStatusKo: note,
      lastTickAt: Date.now(),
      watchBoard: {
        verdictKo: '자동매매 동작 중 · 보유 한도',
        alive: true,
        updatedAt: Date.now(),
        coins: limitCoins,
      },
    });
    return { opened: 0, skipped: 1, errors: 0, note };
  }

  let opened = 0;
  let skipped = 0;
  let errors = 0;
  const notes: string[] = [];
  const watchRows: AutoTradeCoinWatch[] = [];

  for (const sym of symbols) {
    if (autoOpen.length + opened >= arm.maxConcurrent) {
      const held = autoOpen.find(
        (p) => matchAutoTradeSymbolId(p.symbol) === sym && Number(p.size) > 0
      );
      watchRows.push(
        held
          ? coinWatch(sym, 'hold', `보유 ${dirKo(held.direction)} · 한도라 추가 없음`)
          : coinWatch(sym, 'wait', '보유 한도 · 신규 진입 없음')
      );
      continue;
    }
    const sameSymPos = autoOpen.filter((p) => matchAutoTradeSymbolId(p.symbol) === sym);
    const sameDirOpen = (dir: 'LONG' | 'SHORT') =>
      sameSymPos.find((p) => p.direction === dir && Number(p.size) > 0);
    let cands: EntryCand[] = [];
    const watchOut: { draft: WatchDraft | null } = { draft: null };
    let picked: WatchDraft | null = null;
    let pickRank = 0;
    const prefer = (rank: number, tone: WatchDraft['tone'], lineKo: string) => {
      if (rank >= pickRank) {
        picked = { tone, lineKo };
        pickRank = rank;
      }
    };
    try {
      cands = await collectCandidates(sym, arm, exclusiveMap, watchOut, skillRiskMap);
    } catch {
      errors += 1;
      watchRows.push(coinWatch(sym, 'bad', '스캔 오류'));
      continue;
    }
    for (const c of cands) {
      if (wasServerSignalFired(user, c.signalId)) {
        skipped += 1;
        prefer(1, 'wait', '이 신호는 이미 주문함');
        continue;
      }
      if (autoOpen.length + opened >= arm.maxConcurrent) break;

      const holdSame = sameDirOpen(c.direction);
      const holdOpp = sameDirOpen(c.direction === 'LONG' ? 'SHORT' : 'LONG');
      let isHedge = false;
      let marginMult = 1;

      if (holdSame) {
        skipped += 1;
        prefer(4, 'hold', `보유 ${dirKo(c.direction)} · 추가 진입 안 함`);
        continue; /** 같은방향 이미 있음 · 서버 DCA 없음 */
      }
      if (holdOpp) {
        const strong = isStrongHedgeSignal({
          source: c.source,
          analysisSource: c.source,
          signalId: c.signalId,
          signalKo: c.noteKo,
          noteKo: c.noteKo,
          allowHedgeEntry: false,
        });
        if (!strong.ok) {
          skipped += 1;
          continue;
        }
        const modePack = await bitgetFetchPositionMode(creds, c.symbol);
        if (!modePack.ok || modePack.posMode !== 'hedge_mode') {
          skipped += 1;
          notes.push(`${sym.replace('USDT', '')}헷지모드필요`);
          continue;
        }
        isHedge = true;
        marginMult = HEDGE_SIZE_MULT;
      }

      const acct = await bitgetFetchAccountSummary(creds);
      const equity = acct.equityUsdt ?? acct.availableUsdt ?? 0;
      if (!(c.entry > 0) || !(c.sl > 0)) {
        skipped += 1;
        continue;
      }

      /**
       * 스킬창 코인별 세팅(타점) 우선 · 없으면 ARM/코드기본.
       * - maxLev · TP/SL ROE · 비중%
       */
      const isTap = c.source === TAPOINT_SOURCE || c.source === 'eagle1-tap-engine';
      const coinKey = normalizeCoinKey(c.symbol);
      const skillSaved =
        isTap && coinKey && skillRiskMap[coinKey]
          ? normalizeCoinSkillRisk(coinKey, skillRiskMap[coinKey])
          : isTap
            ? resolveCoinSkillRiskForSymbol(c.symbol, skillRiskMap)
            : null;
      const tapFallback = isTap ? resolveTapointSymbolLevTp(c.symbol) : null;
      const maxLev = Math.max(
        1,
        Math.min(
          125,
          Math.round(
            Number(skillSaved?.leverage ?? tapFallback?.leverage ?? arm.leverage) || 20
          )
        )
      );
      const tp1Roe =
        skillSaved?.tp1RoePct ??
        tapFallback?.tp1RoePct ??
        arm.scalpTp1RoePct ??
        FAST_TP1_ROE_PCT;
      const slRoeMax = isTap
        ? skillSaved?.slRoePct && skillSaved.slRoePct > 0
          ? skillSaved.slRoePct
          : resolveTapointSlRoePct(c.timeframe)
        : arm.scalpSlRoePct || FAST_SL_ROE_PCT;
      const lockLev =
        c.structureLock && c.fitLev && c.fitLev > 0
          ? Math.max(1, Math.min(maxLev, Math.round(c.fitLev)))
          : maxLev;
      const structureSlRoe =
        c.structureLock && c.entry > 0
          ? (Math.abs(c.entry - c.sl) / c.entry) * 100 * lockLev
          : 0;
      const structureTpRoe =
        c.structureLock && c.entry > 0
          ? (Math.abs(c.tp - c.entry) / c.entry) * 100 * lockLev
          : 0;
      const tuned = c.structureLock
        ? {
            ok: c.sl > 0 && c.tp > 0,
            lev: lockLev,
            sl: c.sl,
            tp: c.tp,
            slRoePct: structureSlRoe,
            reasonKo: `밴드구조 SL${structureSlRoe.toFixed(1)}% · TP${structureTpRoe.toFixed(1)}% · ${lockLev}x`,
          }
        : resolveStructureAwareLevSlTp({
            entry: c.entry,
            direction: c.direction,
            signalSl: c.sl,
            maxLev,
            minLev: Math.min(5, maxLev),
            maxSlRoePct: slRoeMax,
            tp1RoePct: tp1Roe,
          });
      if (!tuned.ok) {
        skipped += 1;
        notes.push(`${sym.replace('USDT', '')}레버조정불가`);
        prefer(2, 'bad', '레버리지 조정 불가');
        continue;
      }
      const orderTpRoe = c.structureLock ? structureTpRoe : tp1Roe;
      const orderSlRoe = c.structureLock ? structureSlRoe : slRoeMax;
      const orderLev = tuned.lev;
      const orderSl = tuned.sl;
      const orderTp = tuned.tp;

      const equityPctForOrder =
        skillSaved?.equityPct && skillSaved.equityPct > 0
          ? skillSaved.equityPct
          : Number(arm.scalpEquityPct) > 0
            ? Number(arm.scalpEquityPct)
            : ACCOUNT_RISK_PCT_DEFAULT;
      /** 비중 · 스킬창% 우선 · 거래소 가용 기준 */
      let marginUsdt =
        arm.sizeMode === 'fixedUsdt'
          ? Math.max(1, arm.marginUsdt)
          : equityPctToMarginUsdt(equity, equityPctForOrder);
      marginUsdt = Math.max(1, Math.round(marginUsdt * marginMult * 100) / 100);
      if (!(marginUsdt > 0)) {
        skipped += 1;
        continue;
      }
      const riskKo = `스킬비중${equityPctForOrder}% · ${marginUsdt.toFixed(1)}U · ${orderLev}x · TP${orderTpRoe.toFixed(1)}% · SL${orderSlRoe.toFixed(1)}% · 구조SL`;

      const signalKo = isHedge && holdOpp
        ? hedgeNoteKo(c.noteKo, holdOpp.direction)
        : c.noteKo;

      const placed = await bitgetOpenLongShort({
        creds,
        symbol: c.symbol,
        direction: c.direction,
        marginUsdt,
        leverage: orderLev,
        price: c.entry,
        marginMode: arm.marginMode,
        sl: orderSl,
        tp: orderTp,
        clientOid: c.signalId.replace(/[^0-9A-Za-z_:#+\-]/g, '').slice(0, 32),
        tp1RoePct: orderTpRoe,
        slRoePct: c.structureLock ? structureSlRoe : tuned.slRoePct,
        timeframe: c.timeframe,
        userSlPrice: orderSl,
        preserveStructureSl: true,
        lockStructurePrices: c.structureLock === true,
        hedgeOpen: isHedge,
      });

      if (placed.ok) {
        prefer(5, 'in', `방금 ${dirKo(c.direction)} 진입`);
        markServerSignalFired(user, c.signalId);
        writeServerPositionEntryMemo(user, {
          symbol: c.symbol,
          direction: c.direction,
          signalKo: signalKo || c.noteKo || '서버진입',
          source: c.source,
          signalId: c.signalId,
          timeframe: c.timeframe,
          at: Date.now(),
        });
        try {
          markTapLifecycleExecuted({
            signalId: c.signalId,
            symbol: c.symbol,
            direction: c.direction,
            entryPrice: c.entry,
            paper: false,
            noteKo: `서버실체결 · ${c.source}`,
          });
          markTapLifecycleManage(c.signalId, '서버 · MANAGE');
        } catch {
          /* lifecycle 실패 무시 */
        }
        opened += 1;
        notes.push(
          `${c.symbol.replace('USDT', '')}${c.direction === 'LONG' ? '롱' : '숏'}${isHedge ? '헷지' : '진입'}${orderLev}x`
        );
        const tg = await notifyMergedDeskPositionEntry({
          symbol: c.symbol,
          direction: c.direction,
          price: c.entry,
          sl: orderSl,
          tp: orderTp,
          size: placed.size,
          marginUsdt,
          equityPct: (marginUsdt / Math.max(equity, 1)) * 100,
          leverage: orderLev,
          orderId: placed.orderId || placed.clientOid || null,
          source: c.source,
          signalId: c.signalId,
          mode: 'live',
          timeframe: c.timeframe,
          signalKo: signalKo || null,
          evidenceKo: `${tuned.reasonKo} · ${riskKo}${
            Array.isArray(c.analysisTags) && c.analysisTags.some((t) => /3봉내연속스윕|sweep-consec/i.test(t))
              ? ' · 스킬 3봉내연속스윕진입'
              : ''
          }`,
          noteKo: `${isTap ? '서버타점' : '서버Dual'} · ${orderLev}x · 구조SL · ${riskKo} · ${signalKo}`,
          analysisTags: c.analysisTags || null,
        }).catch((e) => ({
          ok: false as const,
          error: e instanceof Error ? e.message : 'telegram fail',
        }));
        if (!tg.ok) {
          notes.push(`TG실패:${tg.error || '?'}`);
          console.log(`[entry-tg] ${c.symbol} ${c.direction} fail ${tg.error || '?'}`);
        } else {
          markServerPositionEntryTelegram(user, c.symbol);
          console.log(`[entry-tg] ${c.symbol} ${c.direction} sent`);
        }
        break; /** 심볼당 틱당 1건 */
      } else {
        errors += 1;
        notes.push(`${c.symbol.replace('USDT', '')}실패`);
        prefer(2, 'bad', '주문 실패');
        /** 실패 신호는 마킹 안 함 → 재시도 */
      }
    }
    const base =
      picked ||
      watchOut.draft ||
      (cands.length
        ? { tone: 'ready' as const, lineKo: '진입 후보' }
        : { tone: 'wait' as const, lineKo: '자리 없음' });
    watchRows.push(coinWatch(sym, base.tone, base.lineKo));
  }

  const verdictKo = verdictFromCoins(watchRows);
  const note =
    notes.length > 0
      ? `${verdictKo} · ${notes.slice(0, 3).join('·')}`
      : verdictKo;
  writeServerAutoTradeArm(user, {
    lastStatusKo: note,
    lastTickAt: Date.now(),
    watchBoard: {
      verdictKo,
      alive: true,
      updatedAt: Date.now(),
      coins: watchRows,
    },
  });
  return { opened, skipped, errors, note };
}

export async function runMergedDeskServerAutoTradeTick(
  source: 'self' | 'cron' | 'manual' = 'self'
): Promise<{
  ok: boolean;
  skippedLock?: boolean;
  source: string;
  stats?: ServerAutoTradeTickStats;
  error?: string;
}> {
  try {
    const users = listServerAutoTradeArmedUsers();
    const stats: ServerAutoTradeTickStats = {
      users: users.length,
      scanned: 0,
      opened: 0,
      skipped: 0,
      errors: 0,
      notes: [],
    };
    if (!users.length) {
      return { ok: true, source, stats };
    }

    const results = await mapPool(users, USER_TICK_CONCURRENCY, async (user) => {
      const got = await tryAcquireUserLock(user);
      if (!got) {
        return {
          user,
          opened: 0,
          skipped: 1,
          errors: 0,
          note: `${user} · 틱진행중(스킵)`,
        };
      }
      try {
        const r = await runForUser(user);
        return { user, ...r };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          user,
          opened: 0,
          skipped: 0,
          errors: 1,
          note: `${user} · 틱오류 · ${msg.slice(0, 48)}`,
        };
      } finally {
        await releaseUserLock(user);
      }
    });

    for (const r of results) {
      stats.scanned += 1;
      stats.opened += r.opened;
      stats.skipped += r.skipped;
      stats.errors += r.errors;
      stats.notes.push(r.note);
    }
    console.info('[merged-desk-auto-trade]', source, {
      users: stats.users,
      concurrency: USER_TICK_CONCURRENCY,
      opened: stats.opened,
      errors: stats.errors,
    });
    return { ok: true, source, stats };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[merged-desk-auto-trade] tick failed', source, msg);
    return { ok: false, source, error: msg };
  }
}
