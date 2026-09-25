/**
 * 코인매매진행 — Dual코어4 + 신호B(로켓·장바·하락·번개) 분리 · 믹스금지.
 * 확정 승률·수익 아님.
 */
import { appendTradeJournalEvent } from '@/lib/mergedDeskTradeEventJournal';
import type { Candle } from '@/types';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import {
  computeMergedDeskRbEdgeConfluenceGate,
  detectRbRailSfp,
} from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { aiZoneEvidenceGate } from '@/lib/mergedDeskAiZoneEvidenceGate';
import { aiZoneFeeRrGate } from '@/lib/mergedDeskAiZoneFeeGate';
import {
  readAiZoneEntrySnapshot,
  type AiZoneEntrySnapshot,
} from '@/lib/mergedDeskAiZoneSnapshot';
import { aiZoneEntryGate } from '@/lib/mergedDeskAiZoneEntryGate';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import { isUltraScalpCoreTf } from '@/lib/doksuri1/ultraScalpEngine';
import { normalizeCoinId, type AutoTradeCoinId } from '@/lib/mergedDeskEntryRedesign';
import { rbScalpPlaceFastOk } from '@/lib/mergedDeskRbScalpDriveTrade';
import {
  BPR_DUAL_EVIDENCE_KO,
  evaluateBprDualEvidence,
  fetchBprCandles15m,
  peekBprCandles15m,
} from '@/lib/mergedDeskBprDualEvidence';
import { buildMergedDeskChartTfStructureRockets } from '@/lib/mergedAnalysisDeskMarkers';
import { detectMergedAnalysisKeyZones } from '@/lib/mergedAnalysisKeyZones';
import { detectMergedCriticalZones } from '@/lib/mergedAnalysisCriticalZones';
import { scanMergedLeadingCandleSignals } from '@/lib/mergedAnalysisLeadingSignals';
import {
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  computeInstitutionalBandInteractionMarkersUnion,
  institutionalBandTouchMinGapBars,
} from '@/lib/institutionalSuperBand';

export const COIN_PROGRESS_EVENT = 'ailongshort.coinTradeProgress';

const STORE_KEY = 'ailongshort.mergedDesk.coinTradeProgress.v3';
const LOG_DEDUP_MS = 45_000;
/** 신호B와 동일 — 로켓→확인 ≤5봉 */
const SIGNAL_B_SEQ_WINDOW = 5;

export type GaugeSlotId =
  | 'place'
  | 'sfp'
  | 'evidence'
  | 'fee'
  | 'rocket'
  | 'cart'
  | 'downGraph'
  | 'lightning';

export type CoinTradeProgressStatus = '대기' | '진입가능' | '차단';

export type CoinTradeProgressLane = '초단레인' | '품질레인' | '듀얼';

export type CoinTradeGauge = {
  place: boolean;
  sfp: boolean;
  evidence: boolean;
  fee: boolean;
  /** 별도신호 · 롱 로켓 (기존 코어와 믹스 금지) */
  rocket: boolean;
  /** 별도신호 · 롱 장바구니 */
  cart: boolean;
  /** 별도신호 · 숏 하락그래프 */
  downGraph: boolean;
  /** 별도신호 · 숏 번개 */
  lightning: boolean;
};

export type CoinTradeProgressRow = {
  coin: AutoTradeCoinId;
  symbol: string;
  laneKo: CoinTradeProgressLane;
  status: CoinTradeProgressStatus;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  waitingKo: string;
  blockKo: string;
  gauge: CoinTradeGauge;
  /** Dual Fast 코어만 · 믹스 금지 */
  passN: number;
  totalN: 4;
  /** 별도신호 로켓·장바 / 하락·번개 */
  signalPassN: number;
  signalTotalN: 2;
  /** Dual Fast 코어4 READY */
  dualReady: boolean;
  /** 신호B: 롱=로켓+장바 · 숏=하락+번개 */
  signalBReady: boolean;
  signalBDir: 'LONG' | 'SHORT' | 'NEUTRAL';
  todayEntry: number;
  todaySkip: number;
  reinforceSkip: number;
  updatedAt: number;
  timeframe?: string;
};

type ProgressStore = {
  rows: Record<string, CoinTradeProgressRow>;
  dayKey: string;
  updatedAt: number;
};

const lastLogAt = new Map<string, number>();

function dayKeyNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function emptyGauge(): CoinTradeGauge {
  return {
    place: false,
    sfp: false,
    evidence: false,
    fee: false,
    rocket: false,
    cart: false,
    downGraph: false,
    lightning: false,
  };
}

/** Dual Fast 진입 코어4 — 로켓/장바와 믹스 금지 */
function corePassCount(g: CoinTradeGauge): number {
  return (g.place ? 1 : 0) + (g.sfp ? 1 : 0) + (g.evidence ? 1 : 0) + (g.fee ? 1 : 0);
}

function passCount(g: CoinTradeGauge): number {
  return corePassCount(g);
}

/** 롱: 로켓+장바 · 숏: 하락+번개 */
export function signalBPassCount(g: CoinTradeGauge): {
  passN: number;
  totalN: 2;
  ready: boolean;
  dir: 'LONG' | 'SHORT' | 'NEUTRAL';
} {
  const longN = (g.rocket ? 1 : 0) + (g.cart ? 1 : 0);
  const shortN = (g.downGraph ? 1 : 0) + (g.lightning ? 1 : 0);
  if (longN >= 2) return { passN: 2, totalN: 2, ready: true, dir: 'LONG' };
  if (shortN >= 2) return { passN: 2, totalN: 2, ready: true, dir: 'SHORT' };
  if (longN >= shortN && longN > 0) {
    return { passN: longN, totalN: 2, ready: false, dir: 'LONG' };
  }
  if (shortN > 0) {
    return { passN: shortN, totalN: 2, ready: false, dir: 'SHORT' };
  }
  return { passN: 0, totalN: 2, ready: false, dir: 'NEUTRAL' };
}

function normalizeGauge(g: Partial<CoinTradeGauge> | null | undefined): CoinTradeGauge {
  return {
    place: g?.place === true,
    sfp: g?.sfp === true,
    evidence: g?.evidence === true,
    fee: g?.fee === true,
    rocket: g?.rocket === true,
    cart: g?.cart === true,
    downGraph: g?.downGraph === true,
    lightning: g?.lightning === true,
  };
}

function defaultRow(coin: AutoTradeCoinId): CoinTradeProgressRow {
  return {
    coin,
    symbol: `${coin}USDT`,
    laneKo: '듀얼',
    status: '대기',
    direction: 'NEUTRAL',
    waitingKo: '스캔대기',
    blockKo: '',
    gauge: emptyGauge(),
    passN: 0,
    totalN: 4,
    signalPassN: 0,
    signalTotalN: 2,
    dualReady: false,
    signalBReady: false,
    signalBDir: 'NEUTRAL',
    todayEntry: 0,
    todaySkip: 0,
    reinforceSkip: 0,
    updatedAt: 0,
  };
}

/**
 * 별도신호 4칸 — Dual과 독립 · 진입과 동일 규칙.
 * 롱: 로켓→장바 ≤5봉 시퀀스 · 숏: 하락→번개 ≤5봉.
 * (근처만 있으면 게이지 OFF — 가짜 진입가능 방지)
 */
export function detectRocketCartGaugeFlags(params: {
  candles: Candle[];
  timeframe: string;
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL';
  lookback?: number;
}): {
  rocket: boolean;
  cart: boolean;
  downGraph: boolean;
  lightning: boolean;
} {
  const candles = params.candles;
  const n = candles.length;
  if (n < 12) {
    return { rocket: false, cart: false, downGraph: false, lightning: false };
  }
  const tf = String(params.timeframe || '3m');
  const window = SIGNAL_B_SEQ_WINDOW;
  const closedIdx = Math.max(0, n - 2);

  const idxAtTime = (t: number): number => {
    if (!(t > 0)) return -1;
    for (let i = candles.length - 1; i >= 0; i--) {
      if (Number(candles[i]!.time) === t) return i;
    }
    return -1;
  };

  let rockets: Array<{ time: number; direction: 'LONG' | 'SHORT' }> = [];
  try {
    rockets = buildMergedDeskChartTfStructureRockets(candles, tf)
      .filter((rk) => rk.direction === 'LONG' || rk.direction === 'SHORT')
      .map((rk) => ({ time: Number(rk.time), direction: rk.direction }));
  } catch {
    rockets = [];
  }

  let carts: Array<{ time: number; direction: 'LONG' | 'SHORT' }> = [];
  try {
    const keyZones = detectMergedAnalysisKeyZones(candles, tf);
    const criticalZones = detectMergedCriticalZones({
      candles,
      timeframe: tf,
      keyZones,
    });
    const leading = scanMergedLeadingCandleSignals({
      candles,
      timeframe: tf,
      keyZones,
      criticalZones,
    });
    carts = leading
      .filter((s) => s.tier === 'confirmed' || s.tier === 'strong')
      .map((s) => ({ time: s.time, direction: s.direction }));
  } catch {
    carts = [];
  }

  /** 숏 번개 — 신호B와 동일하게 기관밴드 SHORT 접촉도 확인 */
  let bandShortTimes: number[] = [];
  try {
    const marks = computeInstitutionalBandInteractionMarkersUnion(
      candles,
      INSTITUTIONAL_BAND_DEFAULT_PERIOD,
      INSTITUTIONAL_BAND_DEFAULT_MULT,
      {
        minBarsBetween: institutionalBandTouchMinGapBars(tf),
        tierEnabled: { A: true, B: true, C: false },
      }
    );
    bandShortTimes = marks
      .filter((m) => m.verdict === 'SHORT')
      .map((m) => Number(m.time));
  } catch {
    bandShortTimes = [];
  }

  let rocket = false;
  let cart = false;
  let downGraph = false;
  let lightning = false;

  for (const rk of rockets) {
    const rocketIdx = idxAtTime(rk.time);
    if (rocketIdx < 0 || rocketIdx > closedIdx) continue;
    if (closedIdx - rocketIdx > window) continue;

    if (rk.direction === 'LONG') {
      rocket = true;
      for (const c of carts) {
        if (c.direction !== 'LONG') continue;
        const confirmIdx = idxAtTime(c.time);
        if (confirmIdx < rocketIdx || confirmIdx > closedIdx) continue;
        if (confirmIdx - rocketIdx > window) continue;
        if (c.time < rk.time) continue;
        cart = true;
        break;
      }
    } else {
      downGraph = true;
      for (const c of carts) {
        if (c.direction !== 'SHORT') continue;
        const confirmIdx = idxAtTime(c.time);
        if (confirmIdx < rocketIdx || confirmIdx > closedIdx) continue;
        if (confirmIdx - rocketIdx > window) continue;
        if (c.time < rk.time) continue;
        lightning = true;
        break;
      }
      if (!lightning) {
        for (const bt of bandShortTimes) {
          const confirmIdx = idxAtTime(bt);
          if (confirmIdx < rocketIdx || confirmIdx > closedIdx) continue;
          if (confirmIdx - rocketIdx > window) continue;
          if (bt < rk.time) continue;
          lightning = true;
          break;
        }
      }
    }
  }

  return { rocket, cart, downGraph, lightning };
}

function readStore(): ProgressStore {
  if (typeof localStorage === 'undefined') {
    return { rows: {}, dayKey: dayKeyNow(), updatedAt: 0 };
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { rows: {}, dayKey: dayKeyNow(), updatedAt: 0 };
    const j = JSON.parse(raw) as ProgressStore;
    const dk = dayKeyNow();
    if (j.dayKey !== dk) {
      const rows: Record<string, CoinTradeProgressRow> = {};
      for (const [k, r] of Object.entries(j.rows || {})) {
        rows[k] = { ...r, todayEntry: 0, todaySkip: 0, reinforceSkip: 0 };
      }
      return { rows, dayKey: dk, updatedAt: Date.now() };
    }
    return {
      rows: j.rows || {},
      dayKey: j.dayKey || dk,
      updatedAt: Number(j.updatedAt) || 0,
    };
  } catch {
    return { rows: {}, dayKey: dayKeyNow(), updatedAt: 0 };
  }
}

function writeStore(s: ProgressStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(COIN_PROGRESS_EVENT));
  }
}

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

export type CoinProgressProbe = {
  coin: AutoTradeCoinId;
  symbol: string;
  laneKo: CoinTradeProgressLane;
  gauge: CoinTradeGauge;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  status: CoinTradeProgressStatus;
  waitingKo: string;
  blockKo: string;
  canEnter: boolean;
};

/** Lane Fast 프로브 — null 없이 게이지 분해 */
export function probeRbScalpProgress(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  leverage: number;
  minRr?: number;
  tp1RoePct?: number;
  snap?: AiZoneEntrySnapshot | null;
  price?: number | null;
  /** 15m ICT BPR 추가근거 (없으면 캐시 peek) */
  candles15m?: Candle[] | null;
}): CoinProgressProbe | null {
  const symbol = String(params.symbol || '').toUpperCase();
  const coin = normalizeCoinId(symbol);
  if (!coin || (coin !== 'BTC' && coin !== 'ETH' && coin !== 'SOL' && coin !== 'XRP'))
    return null;
  const tf = String(params.timeframe || '');
  const gauge = emptyGauge();
  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  let waitingKo = '자리대기';
  let blockKo = '';
  let status: CoinTradeProgressStatus = '대기';

  if (!isUltraScalpCoreTf(tf)) {
    return {
      coin,
      symbol,
      laneKo: '초단레인',
      gauge,
      direction,
      status: '대기',
      waitingKo: '1·3·5분차트필요',
      blockKo: '',
      canEnter: false,
    };
  }
  const candles = params.candles;
  if (!Array.isArray(candles) || candles.length < 36) {
    return {
      coin,
      symbol,
      laneKo: '초단레인',
      gauge,
      direction,
      status: '대기',
      waitingKo: '캔들부족',
      blockKo: '',
      canEnter: false,
    };
  }

  const n = candles.length;
  const closed = candles[n - 2]!;
  const entry =
    Number(params.price) > 0 ? Number(params.price) : Number(closed.close);
  if (!(entry > 0)) {
    return {
      coin,
      symbol,
      laneKo: '초단레인',
      gauge,
      direction,
      status: '대기',
      waitingKo: '가격없음',
      blockKo: '',
      canEnter: false,
    };
  }

  const atr = atrApprox(candles);
  const ch = buildMergedDeskBlueRedChannels(candles, tf);
  const geom = ch.geoms.find((g) => g.primary) ?? ch.geoms[0] ?? null;
  if (!geom) {
    waitingKo = '파랑빨강자리없음';
  } else {
    const gate = computeMergedDeskRbEdgeConfluenceGate({
      candles: candles.slice(0, n - 1),
      geom,
      masterSide: null,
    });
    const sfp =
      gate.sfp ?? detectRbRailSfp(candles.slice(0, n - 1), geom, atr);
    if (gate.side === 'LONG' || gate.side === 'SHORT') direction = gate.side;
    else if (sfp) direction = sfp.side === 'bull' ? 'LONG' : 'SHORT';

    gauge.place = rbScalpPlaceFastOk({
      placeRefOk: gate.placeRefOk === true,
      coreHitCount: gate.coreHitCount,
      entry,
      atr,
      tipUpper: geom.tipUpper,
      tipLower: geom.tipLower,
      hasSfp: Boolean(sfp),
      direction: direction === 'SHORT' ? 'SHORT' : 'LONG',
    });
    if (!gauge.place) {
      waitingKo =
        gate.coreHitCount < 1
          ? '자리완화대기 · 핵심합류0·레일밖'
          : '자리미달 · 파랑빨강기준';
    } else if (!gate.placeRefOk) {
      waitingKo = '자리완화통과 · 스윕회수대기';
    }

    if (sfp) {
      const sfpDir = sfp.side === 'bull' ? 'LONG' : 'SHORT';
      gauge.sfp = direction !== 'NEUTRAL' && sfpDir === direction;
      if (!gauge.sfp) waitingKo = '스윕회수 방향불일치';
      else waitingKo = sfp.side === 'bull' ? '스윕회수↑' : '스윕회수↓';
    } else {
      waitingKo = gauge.place ? '스윕회수대기' : waitingKo;
    }

    const snap = params.snap ?? readAiZoneEntrySnapshot(symbol);
    let baseAlignedN = 0;
    if (direction !== 'NEUTRAL' && snap) {
      const ev = aiZoneEvidenceGate({ direction, price: entry, snap });
      baseAlignedN = ev.alignedN;
      gauge.evidence = !(ev.conflictN > 0);
      if (!gauge.evidence) {
        blockKo = '상위역행차단';
        status = '차단';
      }
    } else {
      gauge.evidence = true;
    }

    /** 15m BPR 재터치 · Dual 추가근거 (단독 주문·충돌해제 아님) */
    if (direction !== 'NEUTRAL' && status !== '차단') {
      const c15 =
        params.candles15m ?? peekBprCandles15m(symbol) ?? null;
      const bpr = evaluateBprDualEvidence({
        candles15m: c15,
        direction,
        baseAlignedN,
      });
      if (bpr.alignOk) {
        gauge.evidence = true;
        if (!waitingKo.includes(BPR_DUAL_EVIDENCE_KO)) {
          waitingKo = waitingKo
            ? `${waitingKo} · ${BPR_DUAL_EVIDENCE_KO}`
            : BPR_DUAL_EVIDENCE_KO;
        }
      } else if (
        bpr.reasonKo &&
        !gauge.evidence &&
        /재터치|형성|이탈|터치|BPR/.test(bpr.reasonKo)
      ) {
        /* 근거 미달일 때만 BPR 대기사유 힌트 */
        if (!waitingKo || waitingKo === '자리대기') {
          waitingKo = bpr.reasonKo;
        }
      }
    }

    if (direction !== 'NEUTRAL' && gauge.place && gauge.sfp) {
      const lev = Math.max(1, Math.min(125, Number(params.leverage) || 40));
      const tpRoe = Math.max(5, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT) / 100;
      const tp = roeTargetPrice(entry, direction, lev, tpRoe);
      const buf = Math.max(atr * 0.12, entry * 0.00035);
      let sl =
        direction === 'LONG'
          ? Math.min(geom.tipLower - buf, entry - atr * 0.35)
          : Math.max(geom.tipUpper + buf, entry + atr * 0.35);
      const reward = Math.abs(tp - entry);
      const minRr = Math.max(1.2, Number(params.minRr) || 1.2);
      const maxRisk = reward / minRr;
      if (direction === 'LONG') sl = Math.max(sl, entry - maxRisk);
      else sl = Math.min(sl, entry + maxRisk);
      const fee = aiZoneFeeRrGate({
        entry,
        sl,
        tp,
        direction,
        leverage: lev,
        minRr,
      });
      gauge.fee = fee.ok === true;
      if (!gauge.fee) {
        waitingKo = '수수료게이트미달';
        blockKo = fee.reasonKo || '수수료·손익비미달';
      }
    }
  }

  const canEnter =
    gauge.place &&
    gauge.sfp &&
    gauge.evidence &&
    gauge.fee &&
    direction !== 'NEUTRAL' &&
    status !== '차단';
  if (canEnter) {
    status = '진입가능';
    waitingKo = '조건충족 · 주문대기';
  } else if (status !== '차단') {
    status = '대기';
  }

  const rc = detectRocketCartGaugeFlags({
    candles,
    timeframe: tf,
    direction,
  });
  gauge.rocket = rc.rocket;
  gauge.cart = rc.cart;
  gauge.downGraph = rc.downGraph;
  gauge.lightning = rc.lightning;

  return {
    coin,
    symbol,
    laneKo: '초단레인',
    gauge,
    direction,
    status,
    waitingKo,
    blockKo,
    canEnter,
  };
}

/** Lane S(AIZONE) 프로브 */
export function probeAiZoneProgress(params: {
  symbol: string;
  leverage: number;
  snap?: AiZoneEntrySnapshot | null;
  price?: number | null;
  triggerOk?: boolean;
  triggerKo?: string | null;
  minRr?: number;
  /** 로켓·장바 신호칸용 */
  candles?: Candle[] | null;
  timeframe?: string | null;
}): CoinProgressProbe | null {
  const symbol = String(params.symbol || '').toUpperCase();
  const coin = normalizeCoinId(symbol);
  if (!coin || (coin !== 'BTC' && coin !== 'ETH' && coin !== 'SOL' && coin !== 'XRP'))
    return null;
  const snap = params.snap ?? readAiZoneEntrySnapshot(symbol);
  const gauge = emptyGauge();
  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  let waitingKo = '면·방스냅대기';
  let blockKo = '';
  let status: CoinTradeProgressStatus = '대기';

  if (!snap) {
    return {
      coin,
      symbol,
      laneKo: '품질레인',
      gauge,
      direction,
      status: '대기',
      waitingKo: 'AIZONE스냅대기',
      blockKo: '',
      canEnter: false,
    };
  }

  const price = Number(params.price) > 0 ? Number(params.price) : Number(snap.price);
  const lp = snap.longPct;
  const sp = snap.shortPct;
  if (lp != null && sp != null) {
    if (lp >= sp && lp >= 67) direction = 'LONG';
    else if (sp > lp && sp >= 67) direction = 'SHORT';
  } else if (lp != null && lp >= 67) direction = 'LONG';
  else if (sp != null && sp >= 67) direction = 'SHORT';

  if (direction !== 'NEUTRAL') {
    gauge.place = (direction === 'LONG' ? (lp ?? 0) : (sp ?? 0)) >= 67;
    if (!gauge.place) waitingKo = '면점수미달';

    gauge.sfp = params.triggerOk === true;
    if (!gauge.sfp) waitingKo = '스윕회수·흡수대기';
    else waitingKo = params.triggerKo || '스윕회수OK';

    const ev = aiZoneEvidenceGate({ direction, price, snap });
    gauge.evidence = ev.ok === true;
    if (!gauge.evidence) {
      if (ev.conflictN > 0) {
        status = '차단';
        blockKo = '상위역행차단';
      } else waitingKo = '근거축미달';
    }

    const eg = aiZoneEntryGate({
      symbol,
      direction,
      price,
      snap,
      leverage: params.leverage || 30,
    });
    const sl = eg.suggestSl != null && eg.suggestSl > 0 ? eg.suggestSl : 0;
    const tp = eg.suggestTp != null && eg.suggestTp > 0 ? eg.suggestTp : 0;
    if (sl > 0 && tp > 0) {
      const fee = aiZoneFeeRrGate({
        entry: price,
        sl,
        tp,
        direction,
        leverage: params.leverage || 30,
        minRr: params.minRr || 1.2,
      });
      gauge.fee = fee.ok === true;
      if (!gauge.fee) {
        waitingKo = '수수료게이트미달';
        blockKo = fee.reasonKo || blockKo;
      }
    } else if (gauge.place && gauge.sfp && gauge.evidence) {
      gauge.fee = false;
      waitingKo = eg.allow ? '손익비·수수료계산불가' : eg.reasonKo || '진입게이트미달';
    }
  } else {
    waitingKo = '면점수대기(≥67)';
  }

  const canEnter =
    gauge.place &&
    gauge.sfp &&
    gauge.evidence &&
    gauge.fee &&
    direction !== 'NEUTRAL' &&
    status !== '차단';
  if (canEnter) {
    status = '진입가능';
    waitingKo = '조건충족 · 주문대기';
  } else if (status !== '차단') status = '대기';

  if (params.candles && params.candles.length >= 12) {
    const rc = detectRocketCartGaugeFlags({
      candles: params.candles,
      timeframe: params.timeframe || '3m',
      direction,
    });
    gauge.rocket = rc.rocket;
    gauge.cart = rc.cart;
    gauge.downGraph = rc.downGraph;
    gauge.lightning = rc.lightning;
  }

  return {
    coin,
    symbol,
    laneKo: '품질레인',
    gauge,
    direction,
    status,
    waitingKo,
    blockKo,
    canEnter,
  };
}

function mergeLaneKo(
  prev: CoinTradeProgressLane | undefined,
  next: CoinTradeProgressLane
): CoinTradeProgressLane {
  if (!prev || prev === next) return next;
  return '듀얼';
}

/** 진행 스냅 갱신 + (선택) 장부 기록 */
export function upsertCoinTradeProgress(params: {
  probe: CoinProgressProbe;
  timeframe?: string;
  kind?: 'skip' | 'entry' | 'tick';
  reasonKo?: string;
  price?: number | null;
  writeJournal?: boolean;
}): CoinTradeProgressRow {
  const store = readStore();
  const coin = params.probe.coin;
  const prev = store.rows[coin] || defaultRow(coin);
  const g = normalizeGauge(params.probe.gauge);
  const passN = passCount(g);
  const coreN = corePassCount(g);
  const sig = signalBPassCount(g);
  const dualReady =
    params.probe.canEnter === true &&
    coreN >= 4 &&
    params.probe.direction !== 'NEUTRAL';
  const kind = params.kind || 'tick';
  let todayEntry = prev.todayEntry;
  let todaySkip = prev.todaySkip;
  let reinforceSkip = prev.reinforceSkip;
  if (kind === 'entry') todayEntry += 1;
  if (kind === 'skip') {
    todaySkip += 1;
    if (coreN >= 3) reinforceSkip += 1;
  }

  /** Dual 코어4만 진입가능 · 신호B는 시퀀스 진짜 READY일 때만 (가짜 2/2 금지) */
  const raceBlocked =
    typeof params.reasonKo === 'string' &&
    (/시퀀스대기|A대기|후보없음|3m차트필요|캔들필요|레이스 · 대기/.test(params.reasonKo) ||
      /시퀀스확인·추격금지|수수료미달|자리미달|상위역행/.test(params.reasonKo));

  const status: CoinTradeProgressStatus =
    params.probe.status === '차단' || (params.reasonKo && /차단/.test(params.reasonKo))
      ? '차단'
      : dualReady
        ? '진입가능'
        : sig.ready && !raceBlocked
          ? '진입가능'
          : '대기';

  let waitingKo = params.probe.waitingKo;
  let displayDir: CoinTradeProgressRow['direction'] = params.probe.direction;
  if (dualReady && sig.ready) {
    waitingKo = `Dual코어·신호B동시READY · 레이스선도착주문`;
  } else if (dualReady) {
    waitingKo = 'Dual코어충족 · 주문대기';
  } else if (sig.ready && !raceBlocked) {
    waitingKo = `신호B충족(${sig.dir === 'LONG' ? '로켓·장바' : '하락·번개'}) · 주문대기`;
    displayDir = sig.dir;
  } else if (sig.passN > 0 && sig.dir !== 'NEUTRAL' && !dualReady) {
    /** Dual 방향과 신호B 방향이 다르면 신호B 쪽을 표시 (가짜 숏+롱게이지 혼동 방지) */
    if (
      params.probe.direction !== 'NEUTRAL' &&
      sig.dir !== params.probe.direction
    ) {
      displayDir = sig.dir;
      waitingKo = `신호B(${sig.dir === 'LONG' ? '롱' : '숏'})부분 · Dual(${params.probe.direction === 'LONG' ? '롱' : '숏'})과방향다름`;
    }
  }
  if (raceBlocked && params.reasonKo) {
    waitingKo = params.reasonKo;
  }

  const row: CoinTradeProgressRow = {
    ...prev,
    coin,
    symbol: params.probe.symbol,
    laneKo: mergeLaneKo(prev.laneKo, params.probe.laneKo),
    status,
    direction: displayDir,
    waitingKo,
    blockKo: params.reasonKo || params.probe.blockKo || '',
    gauge: g,
    passN,
    totalN: 4,
    signalPassN: sig.passN,
    signalTotalN: 2,
    dualReady,
    signalBReady: sig.ready && !raceBlocked,
    signalBDir: sig.dir,
    todayEntry,
    todaySkip,
    reinforceSkip,
    updatedAt: Date.now(),
    timeframe: params.timeframe || prev.timeframe,
  };
  store.rows[coin] = row;
  store.updatedAt = Date.now();
  store.dayKey = dayKeyNow();
  writeStore(store);

  if (params.writeJournal !== false && (kind === 'skip' || kind === 'entry')) {
    const logKey = `${coin}|${kind}|${row.blockKo || row.waitingKo}|${g.place}${g.sfp}${g.evidence}${g.fee}|${g.rocket}${g.cart}${g.downGraph}${g.lightning}`;
    const now = Date.now();
    const last = lastLogAt.get(logKey) || 0;
    if (now - last >= LOG_DEDUP_MS) {
      lastLogAt.set(logKey, now);
      appendTradeJournalEvent({
        symbol: params.probe.symbol,
        chartTf: params.timeframe || '—',
        kind: 'NOTE',
        direction: params.probe.direction,
        price: params.price != null && params.price > 0 ? params.price : 0,
        levelPrice: params.price != null && params.price > 0 ? params.price : 0,
        levelLabel: kind === 'entry' ? '진입' : '스킵',
        noteKo:
          kind === 'entry'
            ? `진입 · ${params.probe.laneKo} · Dual${coreN}/4 · 신호B${sig.passN}/2 · ${waitingKo}`
            : `스킵 · ${params.reasonKo || waitingKo}${
                coreN >= 3 ? ' · Dual합류모였으나진입불가·보강후보' : ''
              }`,
        meta: {
          ledger: 'coin-trade-progress',
          reinforce: coreN >= 3 && kind === 'skip',
          kind,
          laneKo: params.probe.laneKo,
          status: row.status,
          waitingKo: row.waitingKo,
          gauge: g,
          dualReady,
          signalBReady: sig.ready,
        },
      });
    }
  }

  return row;
}

export function readCoinTradeProgressBoard(): {
  rows: CoinTradeProgressRow[];
  summaryKo: string;
} {
  const store = readStore();
  const order: AutoTradeCoinId[] = ['BTC', 'ETH', 'SOL', 'XRP'];
  const rows = order.map((c) => {
    const r = store.rows[c] || defaultRow(c);
    const g = normalizeGauge(r.gauge);
    const sig = signalBPassCount(g);
    const dualReady =
      r.dualReady === true ||
      (corePassCount(g) >= 4 && r.direction !== 'NEUTRAL' && r.status !== '차단');
    const raceBlocked =
      typeof r.blockKo === 'string' &&
      (/시퀀스대기|A대기|후보없음|3m차트필요|캔들필요|레이스 · 대기/.test(r.blockKo) ||
        /시퀀스확인·추격금지|수수료미달|자리미달|상위역행/.test(r.blockKo));
    const signalBReady = sig.ready && !raceBlocked;
    /** 저장본 가짜 진입가능 교정 — Dual4 또는 신호B진짜READY만 */
    let status = r.status;
    if (status === '진입가능' && !dualReady && !signalBReady) {
      status = '대기';
    } else if (dualReady || signalBReady) {
      status = r.status === '차단' ? '차단' : '진입가능';
    }
    return {
      ...r,
      status,
      gauge: g,
      totalN: 4 as const,
      passN: corePassCount(g),
      signalPassN: sig.passN,
      signalTotalN: 2 as const,
      dualReady,
      signalBReady,
      signalBDir: sig.dir,
    };
  });
  const wait = rows.filter((r) => r.status === '대기').length;
  const ready = rows.filter((r) => r.status === '진입가능').length;
  const block = rows.filter((r) => r.status === '차단').length;
  const rein = rows.reduce((s, r) => s + r.reinforceSkip, 0);
  return {
    rows,
    summaryKo: `대기${wait} · 진입가능${ready} · 차단${block} · 보강후보스킵${rein} · 확정아님`,
  };
}

export function gaugeSlots(
  g: CoinTradeGauge
): Array<{ id: GaugeSlotId; ko: string; ok: boolean }> {
  const n = normalizeGauge(g);
  return [
    { id: 'place', ko: '자리', ok: n.place },
    { id: 'sfp', ko: '스윕회수', ok: n.sfp },
    { id: 'evidence', ko: '근거', ok: n.evidence },
    { id: 'fee', ko: '수수료', ok: n.fee },
  ];
}

/** 아래 행 — 별도신호 (Dual 코어와 믹스 금지) */
export function gaugeSignalSlots(
  g: CoinTradeGauge
): Array<{ id: GaugeSlotId; ko: string; ok: boolean }> {
  const n = normalizeGauge(g);
  return [
    { id: 'rocket', ko: '로켓', ok: n.rocket },
    { id: 'cart', ko: '장바구니', ok: n.cart },
    { id: 'downGraph', ko: '하락그래프', ok: n.downGraph },
    { id: 'lightning', ko: '번개', ok: n.lightning },
  ];
}

const DUAL_SCAN_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'] as const;

/**
 * 칩 ON 코인 전부 백그라운드 프로브 — 1m·3m 중 합류 높은 쪽 채택.
 * 진입 주문은 하지 않음 · 게이지·대기사유만.
 */
export async function scanAllCoinTradeProgress(params?: {
  leverage?: number;
  minRr?: number;
  scalpMode?: 'FAST' | 'S' | 'DUAL';
  enabledSymbols?: string[] | null;
  timeframe?: string;
}): Promise<{ scanned: number; ready: number }> {
  if (typeof fetch === 'undefined') return { scanned: 0, ready: 0 };
  const tfs =
    params?.timeframe != null && String(params.timeframe).trim()
      ? [String(params.timeframe).toLowerCase()]
      : ['1m', '3m'];
  const mode = params?.scalpMode || 'FAST';
  const lev = Math.max(1, Number(params?.leverage) || 40);
  const minRr = Math.max(1.2, Number(params?.minRr) || 1.2);
  const enabledList =
    params?.enabledSymbols && params.enabledSymbols.length > 0
      ? params.enabledSymbols
      : [...DUAL_SCAN_SYMBOLS];
  const enabled = new Set(enabledList.map((s) => String(s).toUpperCase()));
  let scanned = 0;
  let ready = 0;

  for (const sym of DUAL_SCAN_SYMBOLS) {
    if (
      params?.enabledSymbols &&
      params.enabledSymbols.length > 0 &&
      !enabled.has(sym) &&
      !enabled.has(sym.replace(/USDT$/, ''))
    ) {
      continue;
    }

    let bestOverall: CoinProgressProbe | null = null;
    let bestTf = tfs[0] || '3m';

    let candles15m: Candle[] = [];
    try {
      candles15m = await fetchBprCandles15m(sym);
    } catch {
      candles15m = peekBprCandles15m(sym) || [];
    }

    for (const tf of tfs) {
      try {
        const q = new URLSearchParams({
          symbol: sym,
          timeframe: tf,
          depth: 'recent',
        });
        const res = await fetch(`/api/market?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as {
          candles?: Candle[];
        };
        const candles = Array.isArray(json.candles) ? json.candles : [];
        if (candles.length < 36) continue;

        let best: CoinProgressProbe | null = null;
        if (mode !== 'S') {
          best = probeRbScalpProgress({
            symbol: sym,
            timeframe: tf,
            candles,
            leverage: lev,
            minRr,
            price: Number(candles[candles.length - 1]?.close) || null,
            candles15m: candles15m.length >= 12 ? candles15m : null,
          });
        }
        if (mode !== 'FAST') {
          const snap = readAiZoneEntrySnapshot(sym);
          let triggerOk = false;
          let triggerKo: string | null = null;
          try {
            const atr = atrApprox(candles);
            const ch = buildMergedDeskBlueRedChannels(candles, tf);
            const geom = ch.geoms.find((g) => g.primary) ?? ch.geoms[0] ?? null;
            const sfp = geom
              ? detectRbRailSfp(
                  candles.slice(0, Math.max(1, candles.length - 1)),
                  geom,
                  atr
                )
              : null;
            if (sfp && snap) {
              const prefer =
                (snap.longPct ?? 0) >= (snap.shortPct ?? 0) ? 'LONG' : 'SHORT';
              const sfpDir = sfp.side === 'bull' ? 'LONG' : 'SHORT';
              if (sfpDir === prefer) {
                triggerOk = true;
                triggerKo = sfp.side === 'bull' ? '스윕회수↑' : '스윕회수↓';
              }
            }
          } catch {
            /* ignore */
          }
          const probeS = probeAiZoneProgress({
            symbol: sym,
            leverage: lev,
            snap,
            price: Number(candles[candles.length - 1]?.close) || null,
            triggerOk,
            triggerKo,
            minRr,
            candles,
            timeframe: tf,
          });
          if (probeS) {
            /**
             * Dual/품질 게이지 OR 병합 금지 — 가짜 진입가능·주문미발화 원인.
             * 한쪽 레인만 채택 · 신호B칸만 표시용 OR.
             */
            if (!best) {
              best = probeS;
            } else {
              const pickS =
                (probeS.canEnter && !best.canEnter) ||
                (probeS.canEnter === best.canEnter &&
                  passCount(probeS.gauge) > passCount(best.gauge));
              const base = pickS ? probeS : best;
              const other = pickS ? best : probeS;
              best = {
                ...base,
                laneKo: mode === 'DUAL' ? '듀얼' : base.laneKo,
                gauge: normalizeGauge({
                  ...base.gauge,
                  rocket: base.gauge.rocket || other.gauge.rocket,
                  cart: base.gauge.cart || other.gauge.cart,
                  downGraph: base.gauge.downGraph || other.gauge.downGraph,
                  lightning: base.gauge.lightning || other.gauge.lightning,
                }),
                canEnter: base.canEnter === true,
                status: base.canEnter
                  ? '진입가능'
                  : base.status === '차단' || other.status === '차단'
                    ? '차단'
                    : '대기',
              };
            }
          }
        }
        if (best) {
          const bestPass = passCount(best.gauge);
          const curPass = bestOverall ? passCount(bestOverall.gauge) : -1;
          if (
            !bestOverall ||
            bestPass > curPass ||
            (best.canEnter && !bestOverall.canEnter)
          ) {
            bestOverall = best;
            bestTf = tf;
          }
        }
      } catch {
        /* ignore tf */
      }
    }

    if (bestOverall) {
      scanned += 1;
      if (bestOverall.canEnter) ready += 1;
      upsertCoinTradeProgress({
        probe: bestOverall,
        timeframe: bestTf,
        kind: 'tick',
        writeJournal: false,
      });
    } else {
      const coin = normalizeCoinId(sym);
      if (coin !== 'OTHER') {
        upsertCoinTradeProgress({
          probe: {
            coin,
            symbol: sym,
            laneKo:
              mode === 'S' ? '품질레인' : mode === 'DUAL' ? '듀얼' : '초단레인',
            gauge: emptyGauge(),
            direction: 'NEUTRAL',
            status: '대기',
            waitingKo: '캔들수집중',
            blockKo: '',
            canEnter: false,
          },
          timeframe: bestTf,
          kind: 'tick',
          writeJournal: false,
        });
      }
    }
  }
  return { scanned, ready };
}
