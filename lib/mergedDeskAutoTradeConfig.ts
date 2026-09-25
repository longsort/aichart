/**
 * 통합모드 자동매매 클라이언트 설정 (레버리지·증거금비중·전략·실주문 ARM).
 * API 시크릿은 여기 두지 않음 — 서버 exchange-keys.
 */
import type { UltraStrategySpeed, UltraTradingMode } from '@/lib/doksuri1/ultraScalpEngine';

export type AutoTradeStrategy = 'scalp' | 'doksuri1';

export type AutoTradeSizeMode = 'equityPct' | 'fixedUsdt';

/** 초단 익절 모드 */
export type ScalpExitMode = 'TP1_CUT' | 'TP2_RUNNER' | 'TP3_RUNNER';

export type AutoTradeSymbolId =
  | 'BTCUSDT'
  | 'ETHUSDT'
  | 'BNBUSDT'
  | 'XRPUSDT'
  | 'SOLUSDT';

/** 동시 오픈 포지션 상한 (자동매매 심볼 합산) */
export const AUTO_TRADE_MAX_CONCURRENT = 20;

export const AUTO_TRADE_SYMBOL_OPTIONS: Array<{ id: AutoTradeSymbolId; chipKo: string }> = [
  { id: 'BTCUSDT', chipKo: 'BTC' },
  { id: 'ETHUSDT', chipKo: 'ETH' },
  { id: 'BNBUSDT', chipKo: 'BNB' },
  { id: 'XRPUSDT', chipKo: 'XRP' },
  { id: 'SOLUSDT', chipKo: 'SOL' },
];

export const DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS: AutoTradeSymbolId[] = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
];

/** BTC 구경로(로켓 등) OFF · AIZONE Tier S는 칩 ON으로 주문 */
export const BTC_AUTO_SIGNALS_DEFAULT_OFF = false;

/** 같은 코인 롱·숏 헷지 오픈 기본 금지 */
export const ALLOW_HEDGE_ENTRY_DEFAULT = false;

export function autoTradeSymbolChipKo(id: string): string {
  const s = String(id || '').toUpperCase();
  const hit = AUTO_TRADE_SYMBOL_OPTIONS.find((o) => o.id === s);
  if (hit) return hit.chipKo;
  return s.replace(/USDT$/i, '') || s;
}

function isKnownAutoTradeSymbol(s: string): s is AutoTradeSymbolId {
  return (
    s === 'BTCUSDT' ||
    s === 'ETHUSDT' ||
    s === 'BNBUSDT' ||
    s === 'XRPUSDT' ||
    s === 'SOLUSDT'
  );
}

/**
 * Bitget 심볼 → 자동매매 심볼만 매칭 (앱 외 코인·유사심볼 오탐 금지).
 * includes('BTC') 같은 부분문자열 매칭 쓰지 않음.
 */
export function matchAutoTradeSymbolId(symbol: string): AutoTradeSymbolId | null {
  const u = String(symbol || '')
    .toUpperCase()
    .replace(/_UMCBL|_CMCBL|_DMCBL/g, '')
    .trim();
  if (!u) return null;
  if (isKnownAutoTradeSymbol(u)) return u;
  for (const id of DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS) {
    if (u === id || u.startsWith(`${id}_`) || u.startsWith(`${id}-`)) return id;
  }
  return null;
}

export function isAutoTradeWatchSymbol(symbol: string): boolean {
  return matchAutoTradeSymbolId(symbol) != null;
}

/** 포지션 목록에서 BTC/ETH/BNB/XRP/SOL 만 (앱 외 코인 제외) */
export function filterAutoTradePositions<T extends { symbol: string; size?: number }>(
  positions: T[] | null | undefined
): T[] {
  if (!Array.isArray(positions) || !positions.length) return [];
  const out: T[] = [];
  const seen = new Set<AutoTradeSymbolId>();
  for (const p of positions) {
    if (!(Number(p.size) > 0)) continue;
    const id = matchAutoTradeSymbolId(p.symbol);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...p, symbol: id });
  }
  return out;
}


/** Dual Lane: FAST=초단띠 · S=AIZONE품질 · DUAL=둘다 */
export type AutoTradeScalpMode = 'FAST' | 'S' | 'DUAL';

export function parseAutoTradeScalpMode(v: unknown): AutoTradeScalpMode {
  if (v === 'S' || v === 'DUAL' || v === 'FAST') return v;
  return 'FAST';
}

export const SCALP_EXIT_MODE_KO: Record<ScalpExitMode, string> = {
  TP1_CUT: 'TP1컷(전량)',
  TP2_RUNNER: 'TP2러너',
  TP3_RUNNER: 'TP3러너',
};

export const AUTO_TRADE_SCALP_MODE_KO: Record<AutoTradeScalpMode, string> = {
  FAST: '초단Fast',
  S: '품질S',
  DUAL: 'Dual',
};

export type MergedDeskAutoTradeConfig = {
  /** 창/엔진 활성 (페이퍼 포함) */
  enabled: boolean;
  /** 실주문 ARM — API 키+테스트OK 필수 */
  liveArmed: boolean;
  /**
   * OFF / SIGNAL_ONLY / PAPER(기본) / SHADOW / LIVE
   * LIVE는 liveArmed 없으면 PAPER로 강등.
   */
  tradingMode: UltraTradingMode;
  /** NORMAL · SCALP · ULTRA_SCALP(1·3·5·15m) */
  strategySpeed: UltraStrategySpeed;
  leverage: number;
  /**
   * 사이징: equityPct=계좌자산×비중% (수익 나면 절대금액도 같이 커짐).
   * fixedUsdt=고정 USDT.
   */
  sizeMode: AutoTradeSizeMode;
  /**
   * 단타(초단) 회당 증거금 비중 % — FIRE 실주문에 적용.
   * 구버전 equityPct 와 동기화 유지.
   */
  scalpEquityPct: number;
  /** 독수리1호 회당 증거금 비중 % */
  doksuriEquityPct: number;
  /**
   * @deprecated scalpEquityPct 와 동일하게 유지 (구 설정·설정키 호환)
   */
  equityPct: number;
  /** sizeMode=fixedUsdt 일 때만 */
  marginUsdt: number;
  marginMode: 'isolated' | 'crossed';
  /** 폭락→SFP→로켓 초단 */
  strategyScalp: boolean;
  /** 독수리1호 CONFIRMED_LONG/SHORT */
  strategyDoksuri1: boolean;
  /** 초단 TP1 목표 ROE% (증거금, 기본 5) — 레버에 따라 가격% 환산 */
  scalpTp1RoePct: number;
  /** 초단 손절 ROE% (증거금, 기본 30) */
  scalpSlRoePct: number;
  /** 초단 TP2 목표 ROE% (기본 10) */
  scalpTp2RoePct: number;
  /** 초단 TP3 목표 ROE% (러너3 모드, 기본 12) */
  scalpTp3RoePct: number;
  /**
   * 익절 방식:
   * TP1_CUT = TP1에서 전량
   * TP2_RUNNER = TP1 반익 + 수익잠금 + TP2 잔량
   * TP3_RUNNER = TP1 반익 + 잠금 + TP2 일부 + TP3 잔량
   */
  scalpExitMode: ScalpExitMode;
  /** TP1 이후 잔량 손절을 본절이 아니라 +ROE% 잠금 (기본 2) */
  scalpLockRoePct: number;
  /**
   * true면 1·3·5·15m 차트에서만 초단 진입.
   * false면 1m~1M 전부 (폭락존·SFP·로켓·4전략 동일 파이프).
   */
  ultraScalpOnlyLtf: boolean;
  /**
   * 자동매매 허용 심볼 칩 — ETH / BNB / XRP / SOL (BTC 기본 OFF).
   * 차트 심볼·백그라운드 스캔이 여기 있을 때만 진입.
   */
  enabledSymbols: AutoTradeSymbolId[];
  /** 동시 오픈 상한 (기본 4) */
  maxConcurrent: number;
  /** 진입 시 존/구조 SL 필수 (없으면 주문 거부) — BNB/XRP 캔들LS는 스윙SL 허용 */
  requireZoneSl: boolean;
  /** TP1 최소 R배수 (기본 1.2) */
  minRr: number;
  /** false면 같은코인 반대방향 헷지 오픈 금지 */
  allowHedgeEntry: boolean;
  /** true면 AIZONE 주도 (Lane S) */
  aiZoneDriveEnabled: boolean;
  /** Dual Lane: FAST=띠초단 · S=AIZONE · DUAL=둘다 · 기본 FAST */
  autoTradeScalpMode: AutoTradeScalpMode;
  /**
   * 전량 청산(손절·익절) 직후 전방향 재진입 금지 초 (기본 20).
   * 0이면 즉시 허용.
   */
  postFlatCooldownSec: number;
  /**
   * 익절 후 같은방향 눌림 재진입 직전 추격 금지 초 (기본 45).
   * 0이면 즉시 눌림 검사.
   */
  reentryCooldownSec: number;
  /**
   * 익절 후 같은방향 재진입 ARM 유지 분 (기본 10).
   * 만료 후 전방향 스캔.
   */
  reentryExpireMin: number;
  updatedAt: number;
};

const KEY = 'ailongshort.mergedDesk.autoTrade.config.v1';

function clampPct(n: number): number {
  return Math.max(0.5, Math.min(100, n));
}

/** 전 코인 빠른익절 — ROE 8% 전량 컷 후 재스캔 (수수료 감안) */
export const FAST_TP1_ROE_PCT = 8;
/** 전 코인 손절 — ROE -20% */
export const FAST_SL_ROE_PCT = 30;

export const DEFAULT_AUTO_TRADE_CONFIG: MergedDeskAutoTradeConfig = {
  enabled: false,
  liveArmed: false,
  tradingMode: 'PAPER',
  strategySpeed: 'ULTRA_SCALP',
  leverage: 10,
  sizeMode: 'equityPct',
  scalpEquityPct: 5,
  doksuriEquityPct: 5,
  equityPct: 5,
  marginUsdt: 20,
  marginMode: 'isolated',
  strategyScalp: true,
  strategyDoksuri1: true,
  scalpTp1RoePct: 8,
  scalpSlRoePct: 30,
  scalpTp2RoePct: 12,
  scalpTp3RoePct: 15,
  /** 전 코인 · ROE 8%에서 전량 컷 → 재스캔 */
  scalpExitMode: 'TP1_CUT',
  scalpLockRoePct: 2,
  ultraScalpOnlyLtf: false,
  /** ETH·BNB·XRP·SOL 기본 ON · BTC 자동신호 기본 OFF */
  enabledSymbols: [...DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS],
  maxConcurrent: AUTO_TRADE_MAX_CONCURRENT,
  requireZoneSl: true,
  minRr: 1.2,
  allowHedgeEntry: ALLOW_HEDGE_ENTRY_DEFAULT,
  aiZoneDriveEnabled: true,
  autoTradeScalpMode: 'FAST',
  /** 익절 후 빠른 재스캔 */
  postFlatCooldownSec: 8,
  reentryCooldownSec: 20,
  reentryExpireMin: 10,
  updatedAt: 0,
};

function clampRoePct(n: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(3, Math.min(20, v));
}

/** 익절1 계산이 15면 8% */
function clampScalpTp1RoePct(n: number): number {
  const v = clampRoePct(n, FAST_TP1_ROE_PCT);
  return Math.round(v) === 15 ? FAST_TP1_ROE_PCT : v;
}

function clampLockRoePct(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 2;
  return Math.max(0.5, Math.min(5, v));
}

function clampSlRoePct(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 3;
  /** 사용자 설정값 유지 · 상한 100% ROE */
  return Math.max(0.5, Math.min(100, v));
}

/** 청산 후 전방향 대기 초 · 0~600 */
export function clampPostFlatCooldownSec(n: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 20;
  return Math.max(0, Math.min(600, v));
}

/** 익절 후 추격금지 초 · 0~600 */
export function clampReentryCooldownSec(n: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 45;
  return Math.max(0, Math.min(600, v));
}

/** 같은방향 재진입 창 분 · 1~60 */
export function clampReentryExpireMin(n: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 10;
  return Math.max(1, Math.min(60, v));
}

export function resolveReentryTimingMs(
  cfg?: Pick<
    MergedDeskAutoTradeConfig,
    'postFlatCooldownSec' | 'reentryCooldownSec' | 'reentryExpireMin'
  > | null
): { postFlatMs: number; reentryCooldownMs: number; reentryExpireMs: number } {
  const postFlatCooldownSec = clampPostFlatCooldownSec(cfg?.postFlatCooldownSec ?? 20);
  const reentryCooldownSec = clampReentryCooldownSec(cfg?.reentryCooldownSec ?? 45);
  const reentryExpireMin = clampReentryExpireMin(cfg?.reentryExpireMin ?? 10);
  return {
    postFlatMs: postFlatCooldownSec * 1000,
    reentryCooldownMs: reentryCooldownSec * 1000,
    reentryExpireMs: reentryExpireMin * 60_000,
  };
}

function parseScalpExitMode(v: unknown): ScalpExitMode {
  if (v === 'TP1_CUT' || v === 'TP2_RUNNER' || v === 'TP3_RUNNER') return v;
  return 'TP2_RUNNER';
}

function parseTradingMode(v: unknown): UltraTradingMode {
  if (v === 'OFF' || v === 'SIGNAL_ONLY' || v === 'PAPER' || v === 'SHADOW' || v === 'LIVE') return v;
  return 'PAPER';
}

function parseStrategySpeed(v: unknown): UltraStrategySpeed {
  if (v === 'NORMAL' || v === 'SCALP' || v === 'ULTRA_SCALP') return v;
  return 'ULTRA_SCALP';
}

function parseEnabledSymbols(v: unknown): AutoTradeSymbolId[] {
  /** 미설정 → 기본 ON · 빈 배열 → 전부 OFF(매매금지) */
  if (!Array.isArray(v)) return [...DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS];
  if (v.length === 0) return [];
  const out: AutoTradeSymbolId[] = [];
  for (const x of v) {
    const s = String(x || '').toUpperCase();
    if (isKnownAutoTradeSymbol(s) && !out.includes(s)) {
      out.push(s);
    }
  }
  return out;
}

/** 1회: 기존 설정에서 BTC 칩 제거 (구경로 취소 시절) — 지금은 OFF */
function migrateStripBtcAuto(list: AutoTradeSymbolId[]): AutoTradeSymbolId[] {
  if (typeof window === 'undefined' || !BTC_AUTO_SIGNALS_DEFAULT_OFF) return list;
  const migKey = 'ailongshort.mergedDesk.autoTrade.btcOffMigrated.v1';
  try {
    if (window.localStorage.getItem(migKey) === '1') return list;
    window.localStorage.setItem(migKey, '1');
  } catch {
    return list.filter((s) => s !== 'BTCUSDT');
  }
  const next = list.filter((s) => s !== 'BTCUSDT');
  return next.length ? next : [...DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS];
}

/** 1회: AIZONE Tier S용 BTC 칩 복구 */
function migrateEnableBtcAiZone(list: AutoTradeSymbolId[]): AutoTradeSymbolId[] {
  if (typeof window === 'undefined') return list;
  const migKey = 'ailongshort.mergedDesk.autoTrade.btcAiZoneOn.v1';
  try {
    if (window.localStorage.getItem(migKey) === '1') return list;
    window.localStorage.setItem(migKey, '1');
  } catch {
    return list.includes('BTCUSDT') ? list : (['BTCUSDT', ...list] as AutoTradeSymbolId[]);
  }
  if (list.includes('BTCUSDT')) return list;
  return ['BTCUSDT', ...list];
}

/** 1회: Dual Lane · 매매진행용 ETH 칩 ON */
function migrateEnableEthDual(list: AutoTradeSymbolId[]): AutoTradeSymbolId[] {
  if (typeof window === 'undefined') return list;
  const migKey = 'ailongshort.mergedDesk.autoTrade.ethDualOn.v1';
  try {
    if (window.localStorage.getItem(migKey) === '1') return list;
    window.localStorage.setItem(migKey, '1');
  } catch {
    return list.includes('ETHUSDT') ? list : ([...list, 'ETHUSDT'] as AutoTradeSymbolId[]);
  }
  if (list.includes('ETHUSDT')) return list;
  return [...list, 'ETHUSDT'];
}

/** 1회: BNB 캔들+PPL 매매 칩 ON */
function migrateEnableBnbPpl(list: AutoTradeSymbolId[]): AutoTradeSymbolId[] {
  if (typeof window === 'undefined') return list;
  const migKey = 'ailongshort.mergedDesk.autoTrade.bnbPplOn.v1';
  try {
    if (window.localStorage.getItem(migKey) === '1') return list;
    window.localStorage.setItem(migKey, '1');
  } catch {
    return list.includes('BNBUSDT') ? list : ([...list, 'BNBUSDT'] as AutoTradeSymbolId[]);
  }
  if (list.includes('BNBUSDT')) return list;
  return [...list, 'BNBUSDT'];
}

function parseMaxConcurrent(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return AUTO_TRADE_MAX_CONCURRENT;
  return Math.max(1, Math.min(AUTO_TRADE_MAX_CONCURRENT, n));
}

export function isAutoTradeSymbolEnabled(
  cfg: Pick<MergedDeskAutoTradeConfig, 'enabledSymbols'>,
  symbol: string
): boolean {
  const id = matchAutoTradeSymbolId(symbol);
  if (!id) return false;
  const list = cfg.enabledSymbols;
  /** undefined → 기본 ON · [] → 전부 OFF */
  if (!Array.isArray(list)) return DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS.includes(id);
  return list.includes(id);
}

/** 차트 심볼 전환 시 — 칩 OFF를 다시 ON으로 강제하지 않음 */
export function ensureAutoTradeSymbolEnabled(
  cfg: MergedDeskAutoTradeConfig,
  _symbol: string
): MergedDeskAutoTradeConfig {
  if (cfg.liveArmed && !cfg.enabled) {
    return writeAutoTradeConfig({ enabled: true, liveArmed: true, tradingMode: 'LIVE' });
  }
  return cfg;
}

export function toggleAutoTradeSymbol(
  cfg: MergedDeskAutoTradeConfig,
  id: AutoTradeSymbolId
): MergedDeskAutoTradeConfig {
  const cur = [
    ...(Array.isArray(cfg.enabledSymbols)
      ? cfg.enabledSymbols
      : [...DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS]),
  ];
  const i = cur.indexOf(id);
  if (i >= 0) {
    cur.splice(i, 1); /** 마지막 칩도 OFF 허용 → 매매금지 */
  } else {
    cur.push(id);
  }
  return writeAutoTradeConfig({ enabledSymbols: cur });
}

export function readAutoTradeConfig(): MergedDeskAutoTradeConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_AUTO_TRADE_CONFIG };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_AUTO_TRADE_CONFIG };
    const j = JSON.parse(raw) as Partial<MergedDeskAutoTradeConfig>;
    const legacy = clampPct(Number(j.equityPct) || 5);
    const scalp = clampPct(
      Number(j.scalpEquityPct) > 0 ? Number(j.scalpEquityPct) : legacy
    );
    const dok = clampPct(
      Number(j.doksuriEquityPct) > 0 ? Number(j.doksuriEquityPct) : legacy
    );
    return {
      enabled: j.enabled === true || j.liveArmed === true,
      liveArmed: j.liveArmed === true,
      tradingMode: parseTradingMode(j.tradingMode),
      strategySpeed: parseStrategySpeed(j.strategySpeed),
      leverage: Math.max(1, Math.min(125, Number(j.leverage) || 10)),
      sizeMode: j.sizeMode === 'fixedUsdt' ? 'fixedUsdt' : 'equityPct',
      scalpEquityPct: scalp,
      doksuriEquityPct: dok,
      equityPct: scalp,
      marginUsdt: Math.max(1, Math.min(50000, Number(j.marginUsdt) || 20)),
      marginMode: j.marginMode === 'crossed' ? 'crossed' : 'isolated',
      strategyScalp: j.strategyScalp !== false,
      strategyDoksuri1: j.strategyDoksuri1 !== false,
      scalpTp1RoePct: clampScalpTp1RoePct(Number(j.scalpTp1RoePct)),
      scalpSlRoePct: Math.max(
        5,
        Math.min(80, Number(j.scalpSlRoePct) || FAST_SL_ROE_PCT)
      ),
      scalpTp2RoePct: clampRoePct(Number(j.scalpTp2RoePct), 10),
      scalpTp3RoePct: clampRoePct(Number(j.scalpTp3RoePct), 12),
      /** 무조건 TP1 전량컷 (빠른익절→재스캔) */
      scalpExitMode: 'TP1_CUT',
      scalpLockRoePct: clampLockRoePct(Number(j.scalpLockRoePct)),
      ultraScalpOnlyLtf: false,
      enabledSymbols: migrateEnableBnbPpl(
        migrateEnableEthDual(
          migrateEnableBtcAiZone(migrateStripBtcAuto(parseEnabledSymbols(j.enabledSymbols)))
        )
      ),
      maxConcurrent: parseMaxConcurrent(j.maxConcurrent),
      requireZoneSl: j.requireZoneSl !== false,
      minRr: Math.max(1, Math.min(3, Number(j.minRr) || 1.2)),
      allowHedgeEntry: false,
      aiZoneDriveEnabled: j.aiZoneDriveEnabled !== false,
      autoTradeScalpMode: parseAutoTradeScalpMode(j.autoTradeScalpMode),
      postFlatCooldownSec: clampPostFlatCooldownSec(
        j.postFlatCooldownSec != null ? Number(j.postFlatCooldownSec) : 8
      ),
      reentryCooldownSec: clampReentryCooldownSec(
        j.reentryCooldownSec != null ? Number(j.reentryCooldownSec) : 20
      ),
      reentryExpireMin: clampReentryExpireMin(
        j.reentryExpireMin != null ? Number(j.reentryExpireMin) : 10
      ),
      updatedAt: Number(j.updatedAt) || 0,
    };
  } catch {
    return { ...DEFAULT_AUTO_TRADE_CONFIG };
  }
}

export const AUTO_TRADE_CFG_EVENT = 'ailongshort:autoTradeConfig';

export function writeAutoTradeConfig(patch: Partial<MergedDeskAutoTradeConfig>): MergedDeskAutoTradeConfig {
  const prev = readAutoTradeConfig();
  const nextSizeMode = (patch.sizeMode ?? prev.sizeMode) === 'fixedUsdt' ? 'fixedUsdt' : 'equityPct';
  let scalp = clampPct(Number(patch.scalpEquityPct ?? prev.scalpEquityPct) || 5);
  let dok = clampPct(Number(patch.doksuriEquityPct ?? prev.doksuriEquityPct) || 5);
  if (patch.equityPct != null && patch.scalpEquityPct == null) {
    scalp = clampPct(Number(patch.equityPct) || scalp);
  }
  let tp1 = clampScalpTp1RoePct(Number(patch.scalpTp1RoePct ?? prev.scalpTp1RoePct));
  let tp2 = clampRoePct(Number(patch.scalpTp2RoePct ?? prev.scalpTp2RoePct), 12);
  let tp3 = clampRoePct(Number(patch.scalpTp3RoePct ?? prev.scalpTp3RoePct), 15);
  if (tp2 <= tp1) tp2 = Math.min(20, tp1 + 2);
  if (tp3 <= tp2) tp3 = Math.min(20, tp2 + 2);
  const liveArmedNext =
    patch.liveArmed === true ? true : patch.liveArmed === false ? false : prev.liveArmed;
  /** 실전 ARM이면 엔진 enabled 강제 유지 — 심볼 전환·설정동기화로 실전 끊김 방지 */
  const enabledNext =
    liveArmedNext === true
      ? true
      : patch.enabled != null
        ? patch.enabled === true
        : prev.enabled === true;
  const tradingModeNext = liveArmedNext
    ? 'LIVE'
    : parseTradingMode(patch.tradingMode ?? prev.tradingMode);
  const next: MergedDeskAutoTradeConfig = {
    ...prev,
    ...patch,
    enabled: enabledNext,
    tradingMode: tradingModeNext,
    strategySpeed: parseStrategySpeed(patch.strategySpeed ?? prev.strategySpeed),
    leverage: Math.max(1, Math.min(125, Number(patch.leverage ?? prev.leverage) || 10)),
    sizeMode: nextSizeMode,
    scalpEquityPct: scalp,
    doksuriEquityPct: dok,
    equityPct: scalp,
    marginUsdt: Math.max(1, Math.min(50000, Number(patch.marginUsdt ?? prev.marginUsdt) || 20)),
    marginMode:
      (patch.marginMode ?? prev.marginMode) === 'crossed' ? 'crossed' : 'isolated',
    scalpTp1RoePct: tp1,
    scalpSlRoePct: Math.max(
      5,
      Math.min(
        80,
        Number(patch.scalpSlRoePct ?? prev.scalpSlRoePct) || FAST_SL_ROE_PCT
      )
    ),
    scalpTp2RoePct: tp2,
    scalpTp3RoePct: tp3,
    scalpExitMode: 'TP1_CUT',
    scalpLockRoePct: clampLockRoePct(Number(patch.scalpLockRoePct ?? prev.scalpLockRoePct)),
    ultraScalpOnlyLtf: false,
    enabledSymbols: parseEnabledSymbols(
      patch.enabledSymbols != null ? patch.enabledSymbols : prev.enabledSymbols
    ),
    maxConcurrent: parseMaxConcurrent(
      patch.maxConcurrent != null ? patch.maxConcurrent : prev.maxConcurrent
    ),
    requireZoneSl:
      patch.requireZoneSl != null ? patch.requireZoneSl !== false : prev.requireZoneSl !== false,
    minRr: Math.max(1, Math.min(3, Number(patch.minRr ?? prev.minRr) || 1.2)),
    allowHedgeEntry: false,
    aiZoneDriveEnabled:
      patch.aiZoneDriveEnabled != null
        ? patch.aiZoneDriveEnabled !== false
        : prev.aiZoneDriveEnabled !== false,
    autoTradeScalpMode: parseAutoTradeScalpMode(
      patch.autoTradeScalpMode != null ? patch.autoTradeScalpMode : prev.autoTradeScalpMode
    ),
    postFlatCooldownSec: clampPostFlatCooldownSec(
      Number(patch.postFlatCooldownSec ?? prev.postFlatCooldownSec ?? 8)
    ),
    reentryCooldownSec: clampReentryCooldownSec(
      Number(patch.reentryCooldownSec ?? prev.reentryCooldownSec ?? 20)
    ),
    reentryExpireMin: clampReentryExpireMin(
      Number(patch.reentryExpireMin ?? prev.reentryExpireMin ?? 10)
    ),
    liveArmed: liveArmedNext,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(AUTO_TRADE_CFG_EVENT, { detail: next }));
    } catch {
      /* ignore */
    }
  }
  return next;
}

/** 전략별 회당 비중% */
export function equityPctForSource(
  cfg: MergedDeskAutoTradeConfig,
  source: 'scalp' | 'doksuri1' | 'manual'
): number {
  if (source === 'doksuri1') return clampPct(cfg.doksuriEquityPct || cfg.equityPct || 5);
  return clampPct(cfg.scalpEquityPct || cfg.equityPct || 5);
}

const FIRED_KEY = 'ailongshort.mergedDesk.autoTrade.fired.v1';

export function wasAutoTradeSignalFired(signalId: string): boolean {
  if (typeof window === 'undefined' || !signalId) return false;
  try {
    const j = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') as Record<string, number>;
    return Boolean(j[signalId]);
  } catch {
    return false;
  }
}

export function markAutoTradeSignalFired(signalId: string): void {
  if (typeof window === 'undefined' || !signalId) return;
  try {
    const j = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') as Record<string, number>;
    j[signalId] = Date.now();
    const keys = Object.keys(j);
    if (keys.length > 80) {
      keys
        .sort((a, b) => (j[a] || 0) - (j[b] || 0))
        .slice(0, keys.length - 60)
        .forEach((k) => delete j[k]);
    }
    localStorage.setItem(FIRED_KEY, JSON.stringify(j));
  } catch {
    /* ignore */
  }
}
