/**
 * API 없이 실시간 차트 기준 가상매매 세션.
 * 클릭 = 신호 대기(ARM). 진입은 초단 FIRE / 독수리 CONFIRMED / 플랜E 터치만.
 * 실주문·Bitget 호출 없음. 확정 수익 아님.
 */
import {
  readAutoTradeConfig,
  resolveReentryTimingMs,
  FAST_TP1_ROE_PCT,
  FAST_SL_ROE_PCT,
  type MergedDeskAutoTradeConfig,
} from '@/lib/mergedDeskAutoTradeConfig';
import { resolveLiveOrderSlTp } from '@/lib/mergedDeskLiveSlTp';
import { nextInstBandProfitLockSl } from '@/lib/eagle1Tapoint/instBandProfitLock';
import {
  nearSlPartialPlan,
  resolveReinforcedEntrySlTp,
  shouldSkipSlForEntryGrace,
} from '@/lib/mergedDeskEntryRedesign';
import {
  formatBitgetSize,
  marginToBaseSize,
} from '@/lib/bitgetPrivateTrade';
import { appendTradeJournalEvent } from '@/lib/mergedDeskTradeEventJournal';
import {
  closeSignalScoreTrade,
  openSignalScoreTrade,
} from '@/lib/mergedDeskSignalScorecard';
import {
  noteSymbolStopLoss,
  noteSymbolWinOrFlat,
} from '@/lib/mergedDeskSymbolLossGuard';
import {
  applyVirtualSeedTradeClose,
  readVirtualSeedLedger,
  setVirtualSeedUsdt,
  VIRTUAL_SEED_RISK_PCT,
  virtualRiskMarginUsdt,
} from '@/lib/mergedDeskVirtualSeedLedger';

const KEY = 'ailongshort.mergedDesk.virtualTrade.session.v1';
export const VIRTUAL_TRADE_EVENT = 'ailongshort-merged-desk-virtual-trade';

/** 플랜 진입가 터치 허용 (±0.12%) */
export const VIRTUAL_PLAN_ENTRY_TOL = 0.0012;

export type VirtualEntrySource =
  | 'scalp-fire'
  | 'doksuri1'
  | 'plan-touch'
  | 'mtf-rr'
  | 'mtf-reentry'
  | 'dump-zone'
  | 'candle-ls'
  | 'cart-signal'
  | 'inst-band-lh'
  | 'sfp-signal'
  | 'hot-zone'
  | 'swing-mid'
  | 'structure-rocket'
  | 'four-strategy'
  | 'wick-15m'
  | 'bpr-retest'
  | 'dump-watch-wick'
  | 'dump-confirm'
  | 'htf-dump-touch'
  | 'ai-zone'
  | 'rb-scalp'
  | 'btc-rocket-cart'
  | 'structure-s';

export type VirtualPosition = {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  size: number;
  sizeStr: string;
  marginUsdt: number;
  leverage: number;
  equityPct: number;
  sl: number | null;
  tp: number | null;
  /** TP1 이후 잔량 러너 목표 (ROE 5~7% 추가 구간) */
  runnerTp?: number | null;
  openedAt: number;
  source: VirtualEntrySource;
  signalKo: string;
  tp1Done?: boolean;
  fourStrategyId?: string | null;
  fourSupporting?: string[] | null;
  entryScore?: number | null;
  analysisTags?: string[] | null;
  /** SL 근접 부분축소 1회 완료 */
  nearSlPartialDone?: boolean;
};

/** TP/러너 익절 후 같은 방향 재진입 감시 (추격 금지 · 눌림만) */
export type VirtualReentryWatch = {
  direction: 'LONG' | 'SHORT';
  exitPrice: number;
  /** 익절 후 고점/저점 추적 — 눌림 판정 */
  extremePrice: number;
  exitAt: number;
  cooldownUntil: number;
  /** 이 시각 이후에는 방향 잠금 해제 · 전방향 분석 재개 */
  expiresAt?: number;
  reasonKo: string;
};

export type VirtualTradeSession = {
  active: boolean;
  startedAt: number;
  symbol: string;
  timeframe: string;
  /** 사용자 설정 시작 시드 */
  seedUsdt: number;
  /** 현재 가상 시드 (손익 반영) */
  equityUsdt: number;
  /** 대기 중 선호 방향 (플랜/수동) */
  preferDirection: 'LONG' | 'SHORT' | null;
  watchEntry: number | null;
  watchSl: number | null;
  watchTp: number | null;
  position: VirtualPosition | null;
  reentryWatch: VirtualReentryWatch | null;
  lastMsgKo: string;
  /** 전량 청산(익절/손절) 시각 — 연속 재스캔 키 */
  lastFlatAt?: number;
  /** 청산 횟수(사이클) — 같은 봉에서도 재진입 스캔 허용 */
  flatCycle?: number;
};

/** 전량 청산 직후 즉시 재진입 금지 (기본값 · 실제는 설정 postFlatCooldownSec) */
export const VIRTUAL_POST_FLAT_COOLDOWN_MS = 20_000;
/** 익절 재진입 ARM 만료 후 전방향 재스캔 (기본값 · 실제는 설정 reentryExpireMin) */
export const VIRTUAL_REENTRY_EXPIRE_MS = 10 * 60_000;

/** 재진입 쿨다운 (ms) — 익절 직후 바로 추격 금지 (기본값 · 실제는 설정 reentryCooldownSec) */
export const VIRTUAL_REENTRY_COOLDOWN_MS = 45_000;
/** 롱: 익절가 대비 최소 눌림 비율 (추격 방지) */
export const VIRTUAL_REENTRY_PULLBACK_MIN = 0.0025;
/** 롱: 익절 고점 대비 너무 위면 재진입 금지 */
export const VIRTUAL_REENTRY_CHASE_MAX = 0.012;

function empty(symbol = 'BTCUSDT', timeframe = '15m'): VirtualTradeSession {
  const led = typeof window !== 'undefined' ? readVirtualSeedLedger() : { seedUsdt: 1000, equityUsdt: 1000 };
  return {
    active: false,
    startedAt: 0,
    symbol,
    timeframe,
    seedUsdt: led.seedUsdt,
    equityUsdt: led.equityUsdt,
    preferDirection: null,
    watchEntry: null,
    watchSl: null,
    watchTp: null,
    position: null,
    reentryWatch: null,
    lastMsgKo: '가상매매 대기 · 시드 설정 후 시작',
    lastFlatAt: 0,
    flatCycle: 0,
  };
}

function emit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(VIRTUAL_TRADE_EVENT));
  } catch {
    /* ignore */
  }
}

export function readVirtualTradeSession(): VirtualTradeSession {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const j = JSON.parse(raw) as Partial<VirtualTradeSession>;
    const led = readVirtualSeedLedger();
    return {
      active: j.active === true,
      startedAt: Number(j.startedAt) || 0,
      symbol: String(j.symbol || 'BTCUSDT'),
      timeframe: String(j.timeframe || '15m'),
      seedUsdt: Number(j.seedUsdt) > 0 ? Number(j.seedUsdt) : led.seedUsdt,
      equityUsdt: Number(j.equityUsdt) > 0 ? Number(j.equityUsdt) : led.equityUsdt,
      preferDirection:
        j.preferDirection === 'LONG' || j.preferDirection === 'SHORT' ? j.preferDirection : null,
      watchEntry: Number(j.watchEntry) > 0 ? Number(j.watchEntry) : null,
      watchSl: Number(j.watchSl) > 0 ? Number(j.watchSl) : null,
      watchTp: Number(j.watchTp) > 0 ? Number(j.watchTp) : null,
      position: j.position && typeof j.position === 'object' ? (j.position as VirtualPosition) : null,
      reentryWatch:
        j.reentryWatch && typeof j.reentryWatch === 'object'
          ? (j.reentryWatch as VirtualReentryWatch)
          : null,
      lastMsgKo: String(j.lastMsgKo || '가상매매 대기 · 시드 설정 후 시작'),
      lastFlatAt: Number(j.lastFlatAt) > 0 ? Number(j.lastFlatAt) : 0,
      flatCycle: Number(j.flatCycle) > 0 ? Number(j.flatCycle) : 0,
    };
  } catch {
    return empty();
  }
}

export function writeVirtualTradeSession(next: VirtualTradeSession): VirtualTradeSession {
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  emit();
  return next;
}

export function stopVirtualTradeSession(msg = '가상매매 중지', markPrice?: number): VirtualTradeSession {
  const prev = readVirtualTradeSession();
  const pos = prev.position;
  let equityUsdt = readVirtualSeedLedger().equityUsdt;
  let lastMsgKo = msg;
  if (pos) {
    const px =
      markPrice != null && markPrice > 0
        ? markPrice
        : pos.entry;
    const reason = markPrice != null && markPrice > 0 ? '수동청산' : '수동중지';
    const r = recordCloseAndSync(prev, pos, px, reason, 1);
    equityUsdt = r.equityUsdt;
    lastMsgKo = `${r.outcomeKo} · ${reason} · ${msg}`;
  }
  const led = readVirtualSeedLedger();
  return writeVirtualTradeSession({
    ...empty(prev.symbol, prev.timeframe),
    seedUsdt: led.seedUsdt,
    equityUsdt,
    lastMsgKo,
  });
}

function recordCloseAndSync(
  prev: VirtualTradeSession,
  pos: VirtualPosition,
  exit: number,
  exitReason: string,
  frac = 1
): { equityUsdt: number; outcomeKo: string; outcome: string; pnlUsdt: number } {
  const ledBefore = readVirtualSeedLedger();
  const led = applyVirtualSeedTradeClose({
    symbol: pos.symbol,
    timeframe: prev.timeframe,
    direction: pos.direction,
    signalKo: pos.signalKo,
    source: pos.source,
    entry: pos.entry,
    exit,
    size: pos.size,
    marginUsdt: pos.marginUsdt,
    leverage: pos.leverage,
    openedAt: pos.openedAt,
    exitReason,
    fourStrategyId: pos.fourStrategyId,
    fourSupporting: pos.fourSupporting,
    entryScore: pos.entryScore,
    analysisTags: pos.analysisTags,
    frac,
    meta: { reinforce: true, virtual: true },
  });
  const row = led.trades[0];
  const outcomeKo = row?.outcomeKo || (led.equityUsdt >= ledBefore.equityUsdt ? '성공' : '실패');
  const outcome = row?.outcome || 'FAIL';
  const pnlUsdt = row?.pnlUsdt ?? 0;
  const kind =
    /손절|SL/i.test(exitReason)
      ? 'AUTO_SCALP_SL'
      : /TP1|부분/i.test(exitReason)
        ? 'AUTO_SCALP_TP1'
        : /러너|TP2|TP3|익절/i.test(exitReason)
          ? 'AUTO_SCALP_TP2'
          : 'AUTO_SCALP_CLOSE';
  appendTradeJournalEvent({
    symbol: pos.symbol,
    chartTf: prev.timeframe,
    kind,
    direction: pos.direction,
    price: exit,
    levelPrice: exit,
    levelLabel: `${outcomeKo}·${exitReason}`,
    noteKo: `${outcomeKo} · ${exitReason} · ${pnlUsdt >= 0 ? '+' : ''}${pnlUsdt.toFixed(2)}U · ${pos.signalKo} · 보강저장`,
    signalId: `${pos.id}-out-${Date.now().toString(36)}`,
    meta: {
      paper: true,
      virtual: true,
      reinforce: true,
      outcome,
      outcomeKo,
      exitReason,
      pnlUsdt,
      frac,
      entry: pos.entry,
      exit,
    },
  });
  if (frac >= 0.95) {
    closeSignalScoreTrade({
      tradeId: pos.id,
      symbol: pos.symbol,
      exit,
      exitReason,
      pnlUsdt,
      roePct: row?.roePct,
      marginUsdt: pos.marginUsdt * frac,
    });
    if (/손절|SL|stop/i.test(exitReason) || pnlUsdt < -0.01) {
      noteSymbolStopLoss(pos.symbol, exitReason);
    } else if (pnlUsdt >= 0) {
      noteSymbolWinOrFlat(pos.symbol);
    }
  }
  return { equityUsdt: led.equityUsdt, outcomeKo, outcome, pnlUsdt };
}

/** 전량 청산 후 연속 분석용 메타 */
function withFlatMeta(
  prev: VirtualTradeSession,
  patch: Partial<VirtualTradeSession>
): VirtualTradeSession {
  const now = Date.now();
  return {
    ...prev,
    ...patch,
    lastFlatAt: now,
    flatCycle: (prev.flatCycle || 0) + 1,
  };
}

/** 청산 직후 쿨다운 중이면 신규 진입 금지 */
export function isVirtualPostFlatCooldown(
  session?: VirtualTradeSession | null
): { cooling: boolean; remainSec: number } {
  const s = session ?? (typeof window !== 'undefined' ? readVirtualTradeSession() : null);
  const at = s?.lastFlatAt || 0;
  if (!(at > 0)) return { cooling: false, remainSec: 0 };
  const { postFlatMs } = resolveReentryTimingMs(
    typeof window !== 'undefined' ? readAutoTradeConfig() : null
  );
  const left = postFlatMs - (Date.now() - at);
  if (left <= 0) return { cooling: false, remainSec: 0 };
  return { cooling: true, remainSec: Math.ceil(left / 1000) };
}

function buildSize(
  cfg: MergedDeskAutoTradeConfig,
  symbol: string,
  price: number,
  availableUsdt: number | null,
  _source: VirtualEntrySource,
  sizeMult = 1
): { marginUsdt: number; size: number; sizeStr: string; equityPct: number; equityUsdt: number } {
  /** 가상매매: 사용자 전체시드 중 매번 5%만 운영 (수익·손실 반영된 현재시드 기준) */
  const led = typeof window !== 'undefined' ? readVirtualSeedLedger() : { equityUsdt: 1000 };
  const equityUsdt =
    led.equityUsdt > 0
      ? led.equityUsdt
      : availableUsdt != null && availableUsdt > 0
        ? availableUsdt
        : 1000;
  const equityPct = VIRTUAL_SEED_RISK_PCT;
  const mult = Math.max(0.25, Math.min(1, Number(sizeMult) || 1));
  const marginUsdt = virtualRiskMarginUsdt(equityUsdt, equityPct) * mult;
  void cfg;
  const size = marginToBaseSize(marginUsdt, Math.max(1, cfg.leverage || 10), price);
  return {
    marginUsdt,
    size,
    sizeStr: formatBitgetSize(size, symbol),
    equityPct: Math.round(equityPct * mult * 10) / 10,
    equityUsdt,
  };
}

export function entrySourceKo(source: VirtualEntrySource | string): string {
  if (source === 'scalp-fire') return '초단 FIRE';
  if (source === 'four-strategy') return '독수리1호 4패턴';
  if (source === 'doksuri1') return '독수리1호 확정';
  if (source === 'mtf-rr') return 'MTF감시 RR·ROE';
  if (source === 'mtf-reentry') return '추세지속 재진입';
  if (source === 'dump-zone') return '폭락존반응';
  if (source === 'candle-ls') return '캔들롱숏';
  if (source === 'cart-signal') return '장바구니신호';
  if (source === 'inst-band-lh') return '기관밴드LH';
  if (source === 'sfp-signal') return 'SFP스윕';
  if (source === 'hot-zone') return '핫존';
  if (source === 'swing-mid') return '스윙미드';
  if (source === 'structure-rocket') return '구조로켓';
  if (source === 'wick-15m') return '15m꼬리추정';
  if (source === 'dump-watch-wick') return '폭락감시윗꼬리숏';
  if (source === 'htf-dump-touch') return 'HTF폭락존터치';
  if (source === 'dump-confirm') return '폭락확정';
  if (source === 'bpr-retest') return 'BPR재터치';
  if (source === 'plan-touch') return '플랜진입가터치';
  if (source === 'ai-zone') return 'AIZONE주도';
  if (source === 'rb-scalp') return '초단Fast·띠SFP';
  if (source === 'btc-rocket-cart') return '신호B·로켓장바';
  if (source === 'structure-s') return '신호C·S급구조';
  return String(source);
}

/**
 * 신호로만 가상 진입. 세션 active + 미보유일 때만.
 */
export function openVirtualPosition(params: {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  sl?: number | null;
  tp?: number | null;
  source: VirtualEntrySource;
  availableUsdt?: number | null;
  cfg?: MergedDeskAutoTradeConfig;
  signalKo?: string;
  fourStrategyId?: string | null;
  fourSupporting?: string[] | null;
  entryScore?: number | null;
  analysisTags?: string[] | null;
  /** 실시간 마크 — 있으면 체결가를 마크로 스냅(0.25% 초과 시 거부) */
  liveMark?: number | null;
  /** 연속손절·보강 신호 비중 (0.25~1) */
  sizeMult?: number;
  /** 상위(unified)에서 이미 SL 보강했으면 중복 스킵 */
  skipSlReinforce?: boolean;
}): { ok: boolean; session: VirtualTradeSession; msg: string } {
  const prev = readVirtualTradeSession();
  if (!prev.active) {
    return { ok: false, session: prev, msg: '가상매매 세션 OFF · 시작 후 신호 대기' };
  }
  if (prev.position) {
    return { ok: false, session: prev, msg: '이미 가상 포지션 있음' };
  }
  let price = Number(params.price);
  const mark = Number(params.liveMark);
  if (mark > 0) {
    if (!(price > 0)) price = mark;
    else {
      const slip = Math.abs(price - mark) / mark;
      if (slip > 0.0025) {
        return {
          ok: false,
          session: prev,
          msg: `진입가 이탈 · 신호 ${price.toFixed(0)} vs 마크 ${mark.toFixed(0)}`,
        };
      }
      price = mark;
    }
  }
  if (!(price > 0)) {
    return { ok: false, session: prev, msg: '가상 진입 실패 · 가격 없음' };
  }
  const cfg = params.cfg ?? readAutoTradeConfig();
  if (params.source === 'scalp-fire' && !cfg.strategyScalp) {
    return { ok: false, session: prev, msg: '단타 전략 OFF' };
  }
  if (params.source === 'doksuri1' && !cfg.strategyDoksuri1) {
    return { ok: false, session: prev, msg: '독수리 전략 OFF' };
  }

  const sized = buildSize(
    cfg,
    params.symbol,
    price,
    params.availableUsdt ?? prev.equityUsdt ?? null,
    params.source,
    params.sizeMult ?? 1
  );
  const preserveStructureSl =
    params.source === 'scalp-fire' ||
    params.source === 'structure-rocket' ||
    params.source === 'dump-zone' ||
    params.source === 'sfp-signal' ||
    params.source === 'four-strategy' ||
    params.source === 'wick-15m';
  const fixed = params.skipSlReinforce
    ? {
        ...resolveLiveOrderSlTp({
          entry: price,
          direction: params.direction,
          leverage: cfg.leverage || 10,
          signalSl: params.sl,
          tp1RoePct: FAST_TP1_ROE_PCT,
          slRoePct: FAST_SL_ROE_PCT,
          timeframe: params.timeframe,
          preserveStructureSl,
        }),
        ok: true as const,
        widened: false,
        reasonKo: '상위보강SL',
      }
    : resolveReinforcedEntrySlTp({
        symbol: params.symbol,
        entry: price,
        direction: params.direction,
        leverage: cfg.leverage || 10,
        signalSl: params.sl,
        tp1RoePct: FAST_TP1_ROE_PCT,
        slRoePct: FAST_SL_ROE_PCT,
        timeframe: params.timeframe,
        preserveStructureSl,
      });
  if (!params.skipSlReinforce && !fixed.ok) {
    return { ok: false, session: prev, msg: fixed.reasonKo };
  }
  const lockBand =
    (params.analysisTags || []).includes('triple-align') &&
    Number(params.sl) > 0 &&
    Number(params.tp) > 0;
  const slPx = lockBand
    ? Number(params.sl)
    : fixed.sl > 0
      ? fixed.sl
      : params.sl != null && params.sl > 0
        ? params.sl
        : prev.watchSl;
  const tpPx = lockBand
    ? Number(params.tp)
    : fixed.tp > 0
      ? fixed.tp
      : params.tp != null && params.tp > 0
        ? params.tp
        : prev.watchTp;
  const signalKo = params.signalKo || entrySourceKo(params.source);
  const openedAt = Date.now();
  const pos: VirtualPosition = {
    id: `virt-${openedAt.toString(36)}`,
    symbol: params.symbol.toUpperCase(),
    direction: params.direction,
    entry: price,
    size: sized.size,
    sizeStr: sized.sizeStr,
    marginUsdt: sized.marginUsdt,
    leverage: cfg.leverage,
    equityPct: sized.equityPct,
    sl: slPx,
    tp: tpPx,
    openedAt,
    source: params.source,
    signalKo,
    fourStrategyId: params.fourStrategyId ?? null,
    fourSupporting: params.fourSupporting ?? null,
    entryScore: params.entryScore ?? null,
    analysisTags: params.analysisTags ?? null,
    nearSlPartialDone: false,
  };
  const session = writeVirtualTradeSession({
    ...prev,
    symbol: params.symbol.toUpperCase(),
    timeframe: params.timeframe,
    position: pos,
    reentryWatch: null,
    preferDirection: pos.direction,
    lastMsgKo: `가상 진입 · ${signalKo} · ${params.timeframe} · ${
      pos.direction === 'LONG' ? '롱' : '숏'
    } @ ${price.toLocaleString('en-US')} · SL ${
      fixed.usedSignalSl ? `타점 ${slPx?.toFixed?.(0) ?? slPx}` : `ROE ${fixed.slRoePct}%`
    }${fixed.clampedSl ? '(한도)' : ''} · TP ROE ${fixed.tp1RoePct}%`,
  });
  appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.timeframe,
    kind: 'AUTO_SCALP_FIRE',
    direction: pos.direction,
    price: pos.entry,
    levelPrice: typeof slPx === 'number' && slPx > 0 ? slPx : pos.entry,
    levelLabel: fixed.usedSignalSl ? '타점SL' : 'ROE손절',
    noteKo: `가상 ${pos.direction === 'LONG' ? '롱' : '숏'} · ${params.timeframe} · ${signalKo}${
      params.entryScore != null && params.entryScore > 0
        ? ` · 점수${Math.round(params.entryScore)}`
        : ''
    }`,
    signalId: pos.id,
    meta: {
      live: false,
      paper: true,
      virtual: true,
      source: params.source,
      usedSignalSl: fixed.usedSignalSl,
      clampedSl: fixed.clampedSl,
      sl: slPx,
      tp: tpPx,
      timeframe: params.timeframe,
      entryScore: params.entryScore ?? null,
      leverage: cfg.leverage || null,
      marginUsdt: sized.marginUsdt || null,
      size: pos.size || null,
      fourStrategyId: params.fourStrategyId ?? null,
      tags: Array.isArray(params.analysisTags)
        ? params.analysisTags.filter(Boolean).slice(0, 12).join('|')
        : null,
      ledger: 'coin-trade',
    },
  });
  openSignalScoreTrade({
    tradeId: pos.id,
    signalKo,
    source: params.source,
    symbol: pos.symbol,
    timeframe: params.timeframe,
    direction: pos.direction,
    entry: pos.entry,
    sl: typeof slPx === 'number' ? slPx : null,
    tp: typeof tpPx === 'number' ? tpPx : null,
    mode: 'virtual',
    analysisTags: params.analysisTags,
    fourStrategyId: params.fourStrategyId,
    size: pos.size > 0 ? pos.size : null,
    marginUsdt: sized.marginUsdt > 0 ? sized.marginUsdt : null,
    leverage: cfg.leverage || null,
  });
  return {
    ok: true,
    session,
    msg: session.lastMsgKo,
  };
}

/**
 * 가상매매 시작 = ARM만. 즉시 진입 금지.
 * 시드(USDT)를 사용자가 먼저 설정한 뒤 시작 버튼으로만 동작.
 */
export function startVirtualTradeSession(params: {
  symbol: string;
  timeframe: string;
  preferDirection?: 'LONG' | 'SHORT' | null;
  watchEntry?: number | null;
  watchSl?: number | null;
  watchTp?: number | null;
  /** 시작 시드 USDT — 필수 */
  seedUsdt: number;
  cfg?: MergedDeskAutoTradeConfig;
}): { ok: boolean; session: VirtualTradeSession; msg: string; detailKo: string[] } {
  const seed = Math.max(10, Math.min(1_000_000, Number(params.seedUsdt) || 0));
  if (!(seed >= 10)) {
    const prev = readVirtualTradeSession();
    return {
      ok: false,
      session: prev,
      msg: '시드를 먼저 입력하세요 (최소 10 USDT)',
      detailKo: ['가상매매 시드 미설정', '시드 입력 후 「가상매매 시작」 클릭'],
    };
  }
  const led = setVirtualSeedUsdt(seed, true);
  const cfg = params.cfg ?? readAutoTradeConfig();
  const watchEntry =
    params.watchEntry != null && params.watchEntry > 0 ? params.watchEntry : null;
  const session = writeVirtualTradeSession({
    active: true,
    startedAt: Date.now(),
    symbol: params.symbol.toUpperCase(),
    timeframe: params.timeframe,
    seedUsdt: led.seedUsdt,
    equityUsdt: led.equityUsdt,
    preferDirection: params.preferDirection ?? null,
    watchEntry,
    watchSl: params.watchSl != null && params.watchSl > 0 ? params.watchSl : null,
    watchTp: params.watchTp != null && params.watchTp > 0 ? params.watchTp : null,
    position: null,
    reentryWatch: null,
    lastMsgKo: `신호 대기 · 시드 ${led.seedUsdt.toLocaleString('en-US')} USDT (즉시진입 아님)`,
    lastFlatAt: 0,
    flatCycle: 0,
  });

  const detailKo = [
    `시작 시드 ${led.seedUsdt.toLocaleString('en-US')} USDT`,
    '클릭 = 대기 시작 (즉시 진입 아님)',
    '① MTF 스스로 감시 · RR≥2 · ROE 5~10% · TP1 수량 50%',
    '② TP1 후 잔량 러너 → 익절/본절 청산 시 같은 방향 재진입 ARM',
    '③ 초단 FIRE / 4전략 · 폭락존→SFP→로켓',
    '④ 독수리1호 CONFIRMED (진입가 0.8% 이내)',
    watchEntry
      ? `⑤ 플랜 진입가 터치 ±0.12% · ${watchEntry.toLocaleString('en-US')}`
      : '⑤ 플랜 진입가 없음 · 주문탭에 있으면 터치 대기',
    `단타 ${cfg.scalpEquityPct ?? cfg.equityPct}% · 독수리 ${cfg.doksuriEquityPct ?? cfg.equityPct}% · ${cfg.leverage}배 · 실주문 없음`,
  ];

  appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.timeframe,
    kind: 'NOTE',
    direction: params.preferDirection || 'NEUTRAL',
    price: watchEntry || 0,
    levelPrice: watchEntry || 0,
    levelLabel: '가상매매대기',
    noteKo: `가상매매 신호 대기 시작 · 시드 ${led.seedUsdt} · 즉시진입 아님`,
    signalId: `virt-arm-${Date.now().toString(36)}`,
    meta: { paper: true, virtual: true, armOnly: true, seedUsdt: led.seedUsdt },
  });

  return {
    ok: true,
    session,
    msg: `가상매매 대기 시작 · 시드 ${led.seedUsdt.toLocaleString('en-US')} USDT`,
    detailKo,
  };
}

/** 플랜 진입가 도달 여부 */
export function isPlanEntryTouched(
  markPrice: number,
  watchEntry: number | null | undefined,
  tol = VIRTUAL_PLAN_ENTRY_TOL
): boolean {
  if (!(markPrice > 0) || !(watchEntry != null && watchEntry > 0)) return false;
  return Math.abs(markPrice - watchEntry) / watchEntry <= tol;
}

export function virtualUnrealizedPnl(
  pos: VirtualPosition,
  markPrice: number
): { pnl: number; roePct: number | null } {
  if (!(markPrice > 0) || !(pos.entry > 0)) return { pnl: 0, roePct: null };
  const diff =
    pos.direction === 'LONG' ? markPrice - pos.entry : pos.entry - markPrice;
  const pnl = diff * pos.size;
  const roePct = pos.marginUsdt > 0 ? (pnl / pos.marginUsdt) * 100 : null;
  return { pnl, roePct };
}

/** TP1 도달 — 전량컷 후 재스캔(빠른익절 정책) */
export function maybeVirtualTp1Half(
  markPrice: number,
  _tp1Frac = 0.5
): VirtualTradeSession {
  const prev = readVirtualTradeSession();
  const pos = prev.position;
  if (!prev.active || !pos || !(markPrice > 0) || pos.tp == null) return prev;
  if (pos.tp1Done) return prev;
  const hit =
    pos.direction === 'LONG' ? markPrice >= pos.tp : markPrice <= pos.tp;
  if (!hit) return prev;

  /** 전 코인: ROE≈5% TP1 전량컷 → 재진입 대기·재스캔 */
  const { equityUsdt, outcomeKo } = recordCloseAndSync(prev, pos, pos.tp, 'TP1전량익절', 1);
  const watch = armReentryWatch(prev, pos, pos.tp, 'TP1컷 후 재진입 대기');
  return writeVirtualTradeSession(
    withFlatMeta(prev, {
      equityUsdt,
      position: null,
      reentryWatch: watch,
      preferDirection: pos.direction,
      lastMsgKo: `${outcomeKo} · TP1컷 전량 · 시드 ${equityUsdt.toFixed(2)}U`,
    })
  );
}

function armReentryWatch(
  prev: VirtualTradeSession,
  pos: VirtualPosition,
  exitPrice: number,
  reasonKo: string
): VirtualReentryWatch {
  const now = Date.now();
  const { reentryCooldownMs, reentryExpireMs } = resolveReentryTimingMs(
    typeof window !== 'undefined' ? readAutoTradeConfig() : null
  );
  return {
    direction: pos.direction,
    exitPrice,
    extremePrice: exitPrice,
    exitAt: now,
    cooldownUntil: now + reentryCooldownMs,
    expiresAt: now + reentryExpireMs,
    reasonKo,
  };
}

/** 잔량: 본절 SL 또는 러너 TP 도달 → 전량 청산 후 같은 방향 재진입 ARM */
export function maybeVirtualRunnerOrBeClose(markPrice: number): VirtualTradeSession {
  const prev = readVirtualTradeSession();
  const pos = prev.position;
  if (!prev.active || !pos || !(markPrice > 0) || !pos.tp1Done) return prev;

  const hitBe =
    pos.sl != null &&
    pos.sl > 0 &&
    (pos.direction === 'LONG' ? markPrice <= pos.sl : markPrice >= pos.sl);
  const runner = pos.runnerTp != null && pos.runnerTp > 0 ? pos.runnerTp : null;
  const hitRunner =
    runner != null &&
    (pos.direction === 'LONG' ? markPrice >= runner : markPrice <= runner);

  if (!hitBe && !hitRunner) {
    /** 재진입용 고점/저점만 갱신 (포지션 유지 중에도 extreme 추적 가능하도록 세션에 없음 — 청산 시 exit) */
    return prev;
  }

  const exitPrice = hitRunner && runner != null ? runner : markPrice;
  const reasonKo = hitRunner
    ? '러너 익절 · 추세지속 재진입 대기'
    : '본절 청산 · 같은 방향 재진입 대기(눌림만)';
  const { equityUsdt, outcomeKo } = recordCloseAndSync(prev, pos, exitPrice, reasonKo, 1);
  const watch = armReentryWatch(prev, pos, exitPrice, reasonKo);
  return writeVirtualTradeSession(
    withFlatMeta(prev, {
      equityUsdt,
      position: null,
      reentryWatch: watch,
      preferDirection: pos.direction,
      lastMsgKo: `${outcomeKo} · ${reasonKo} · 연속분석 · 시드 ${equityUsdt.toFixed(2)}U`,
    })
  );
}

/** TP1 전 손절 → 유예·근접부분축소 후 전량 (기능 삭제 없음) */
export function maybeVirtualSlBeforeTp1(markPrice: number): VirtualTradeSession {
  const prev = readVirtualTradeSession();
  const pos = prev.position;
  if (!prev.active || !pos || !(markPrice > 0) || pos.tp1Done) return prev;
  if (pos.sl == null || !(pos.sl > 0)) return prev;

  if ((pos.analysisTags || []).includes('triple-align')) {
    const lock = nextInstBandProfitLockSl({
      entry: pos.entry,
      direction: pos.direction,
      leverage: pos.leverage,
      tp: pos.tp,
      currentSl: pos.sl,
      mark: markPrice,
    });
    const tighter =
      lock != null &&
      (pos.direction === 'LONG' ? lock.sl > pos.sl : lock.sl < pos.sl);
    if (lock && tighter) {
      writeVirtualTradeSession({
        ...prev,
        position: { ...pos, sl: lock.sl },
        lastMsgKo: `손절 ${lock.lockRoePct.toFixed(1)}% · 수수료 후 ${lock.netRoePct.toFixed(1)}% · ${pos.signalKo}`,
      });
      return maybeVirtualSlBeforeTp1(markPrice);
    }
  }

  const grace = shouldSkipSlForEntryGrace({
    symbol: pos.symbol,
    openedAt: pos.openedAt,
    entry: pos.entry,
    direction: pos.direction,
    sl: pos.sl,
    mark: markPrice,
  });
  if (grace.skip) {
    if (prev.lastMsgKo?.includes('진입유예')) return prev;
    return writeVirtualTradeSession({
      ...prev,
      lastMsgKo: `${grace.reasonKo} · ${pos.signalKo}`,
    });
  }

  const hit =
    pos.direction === 'LONG' ? markPrice <= pos.sl : markPrice >= pos.sl;

  if (!hit) {
    const plan = nearSlPartialPlan({
      symbol: pos.symbol,
      entry: pos.entry,
      direction: pos.direction,
      sl: pos.sl,
      mark: markPrice,
      alreadyDone: pos.nearSlPartialDone,
    });
    if (plan.doPartial) {
      const { equityUsdt, outcomeKo } = recordCloseAndSync(
        prev,
        pos,
        markPrice,
        plan.reasonKo,
        plan.frac
      );
      const remainFrac = Math.max(0.05, 1 - plan.frac);
      const nextPos: VirtualPosition = {
        ...pos,
        size: pos.size * remainFrac,
        sizeStr: formatBitgetSize(pos.size * remainFrac, pos.symbol),
        marginUsdt: pos.marginUsdt * remainFrac,
        nearSlPartialDone: true,
      };
      return writeVirtualTradeSession({
        ...prev,
        equityUsdt,
        position: nextPos,
        lastMsgKo: `${outcomeKo} · ${plan.reasonKo} · 잔량 ${(remainFrac * 100).toFixed(0)}% · ${pos.signalKo}`,
      });
    }
    return prev;
  }

  const { equityUsdt, outcomeKo } = recordCloseAndSync(prev, pos, pos.sl, '손절', 1);
  return writeVirtualTradeSession(
    withFlatMeta(prev, {
      equityUsdt,
      position: null,
      reentryWatch: null,
      lastMsgKo: `${outcomeKo} · 손절 · 연속분석 · 시드 ${equityUsdt.toFixed(2)}U · ${pos.signalKo}`,
    })
  );
}

/** 재진입 감시 중 고점/저점 갱신 (추격 방지용) */
export function touchVirtualReentryExtreme(markPrice: number): VirtualTradeSession {
  const prev = readVirtualTradeSession();
  const w = prev.reentryWatch;
  if (!prev.active || !w || prev.position || !(markPrice > 0)) return prev;
  const nextExt =
    w.direction === 'LONG'
      ? Math.max(w.extremePrice, markPrice)
      : Math.min(w.extremePrice, markPrice);
  if (nextExt === w.extremePrice) return prev;
  return writeVirtualTradeSession({
    ...prev,
    reentryWatch: { ...w, extremePrice: nextExt },
  });
}

/** 눌림 재진입 가능 여부 — 추격 금지 · ARM 만료 시 전방향 허용 */
export function canVirtualReentryNow(
  markPrice: number,
  direction: 'LONG' | 'SHORT'
): { ok: boolean; reasonKo: string } {
  const prev = readVirtualTradeSession();
  const w = prev.reentryWatch;
  if (!prev.active) return { ok: false, reasonKo: '세션 OFF' };
  if (prev.position) return { ok: false, reasonKo: '포지션 보유중' };
  const flatCd = isVirtualPostFlatCooldown(prev);
  if (flatCd.cooling) {
    return { ok: false, reasonKo: `청산후 쿨다운 ${flatCd.remainSec}s · 연속분석중` };
  }
  if (!w) return { ok: true, reasonKo: '일반 진입' };
  if (w.expiresAt != null && Date.now() >= w.expiresAt) {
    return { ok: true, reasonKo: '재진입 ARM 만료 · 전방향 분석' };
  }
  if (w.direction !== direction) {
    return { ok: false, reasonKo: `재진입은 ${w.direction}만 (만료 전)` };
  }
  if (Date.now() < w.cooldownUntil) {
    const sec = Math.ceil((w.cooldownUntil - Date.now()) / 1000);
    return { ok: false, reasonKo: `쿨다운 ${sec}s` };
  }
  if (!(markPrice > 0)) return { ok: false, reasonKo: '가격 없음' };

  if (direction === 'LONG') {
    const fromExt = (w.extremePrice - markPrice) / w.extremePrice;
    if (markPrice > w.extremePrice * (1 + VIRTUAL_REENTRY_CHASE_MAX)) {
      return { ok: false, reasonKo: '고점 추격 금지 · 눌림 대기' };
    }
    if (fromExt < VIRTUAL_REENTRY_PULLBACK_MIN) {
      return { ok: false, reasonKo: '롱 재진입 · 아직 눌림 부족' };
    }
  } else {
    const fromExt = (markPrice - w.extremePrice) / w.extremePrice;
    if (markPrice < w.extremePrice * (1 - VIRTUAL_REENTRY_CHASE_MAX)) {
      return { ok: false, reasonKo: '저점 추격 금지 · 반등 대기' };
    }
    if (fromExt < VIRTUAL_REENTRY_PULLBACK_MIN) {
      return { ok: false, reasonKo: '숏 재진입 · 아직 반등 부족' };
    }
  }
  return { ok: true, reasonKo: '재진입 조건 OK' };
}
