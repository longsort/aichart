/**
 * 서버 자동매매 ARM — 창/브라우저 없어도 유지.
 * 사용자별 파일 저장. 확정 수익 아님.
 */
import fs from 'fs';
import path from 'path';
import {
  AUTO_TRADE_MAX_CONCURRENT,
  DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS,
  FAST_SL_ROE_PCT,
  FAST_TP1_ROE_PCT,
  type AutoTradeSymbolId,
} from '@/lib/mergedDeskAutoTradeConfig';

export type AutoTradeCoinWatchTone = 'ready' | 'hold' | 'wait' | 'bad' | 'in';

/** 마지막 틱에서 코인마다 남긴 자동매매 상태 */
export type AutoTradeCoinWatch = {
  symbol: string;
  coin: string;
  tone: AutoTradeCoinWatchTone;
  lineKo: string;
};

export type AutoTradeWatchBoard = {
  verdictKo: string;
  alive: boolean;
  updatedAt: number;
  coins: AutoTradeCoinWatch[];
};

const WATCH_TONES = new Set<AutoTradeCoinWatchTone>(['ready', 'hold', 'wait', 'bad', 'in']);

export function parseAutoTradeWatchBoard(v: unknown): AutoTradeWatchBoard | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<AutoTradeWatchBoard>;
  if (typeof o.verdictKo !== 'string' || !Array.isArray(o.coins)) return null;
  const coins: AutoTradeCoinWatch[] = [];
  for (const row of o.coins.slice(0, 8)) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Partial<AutoTradeCoinWatch>;
    const symbol = String(r.symbol || '').toUpperCase();
    if (!symbol) continue;
    const tone = WATCH_TONES.has(r.tone as AutoTradeCoinWatchTone)
      ? (r.tone as AutoTradeCoinWatchTone)
      : 'wait';
    coins.push({
      symbol,
      coin: String(r.coin || symbol.replace(/USDT$/i, '')).slice(0, 12),
      tone,
      lineKo: String(r.lineKo || '확인 중').slice(0, 56),
    });
  }
  return {
    verdictKo: o.verdictKo.slice(0, 80),
    alive: o.alive === true,
    updatedAt: Number(o.updatedAt) || 0,
    coins,
  };
}

export type ServerAutoTradeArm = {
  liveArmed: boolean;
  enabledSymbols: AutoTradeSymbolId[];
  leverage: number;
  marginMode: 'isolated' | 'crossed';
  sizeMode: 'equityPct' | 'fixedUsdt';
  scalpEquityPct: number;
  doksuriEquityPct: number;
  marginUsdt: number;
  strategyScalp: boolean;
  strategyDoksuri1: boolean;
  minRr: number;
  maxConcurrent: number;
  /** 익절 ROE% 기본 5 */
  scalpTp1RoePct: number;
  /** 손절 ROE% 기본 20 */
  scalpSlRoePct: number;
  /** 타점엔진 전용 · Dual/AIZONE 서버주문 OFF */
  tapOnly: boolean;
  updatedAt: number;
  /** 마지막 틱 요약(한글) */
  lastStatusKo?: string | null;
  lastTickAt?: number | null;
  /** 코인별 자동매매가 도는지 · 왜 진입이 없는지 */
  watchBoard?: AutoTradeWatchBoard | null;
};

const DEFAULT: ServerAutoTradeArm = {
  liveArmed: false,
  enabledSymbols: [...DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS],
  leverage: 10,
  marginMode: 'isolated',
  sizeMode: 'equityPct',
  scalpEquityPct: 5,
  doksuriEquityPct: 5,
  marginUsdt: 20,
  strategyScalp: true,
  strategyDoksuri1: true,
  minRr: 1.2,
  maxConcurrent: AUTO_TRADE_MAX_CONCURRENT,
  scalpTp1RoePct: FAST_TP1_ROE_PCT,
  scalpSlRoePct: FAST_SL_ROE_PCT,
  tapOnly: true,
  updatedAt: 0,
  lastStatusKo: null,
  lastTickAt: null,
  watchBoard: null,
};

function dir(): string {
  return path.join(process.cwd(), 'data', 'auto-trade-arm');
}

function fileFor(user: string): string {
  const safe = String(user || 'anon').replace(/[^\w.-]/g, '_');
  return path.join(dir(), `${safe}.json`);
}

function firedFileFor(user: string): string {
  const safe = String(user || 'anon').replace(/[^\w.-]/g, '_');
  return path.join(dir(), `${safe}.fired.json`);
}

function parseSymbols(v: unknown): AutoTradeSymbolId[] {
  if (!Array.isArray(v) || !v.length) return [...DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS];
  const allow = new Set(DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS);
  const out: AutoTradeSymbolId[] = [];
  for (const x of v) {
    const s = String(x || '').toUpperCase() as AutoTradeSymbolId;
    if (allow.has(s) && !out.includes(s)) out.push(s);
  }
  /** 구 ARM에 BNB 없으면 캔들+PPL 매매용으로 추가 */
  if (out.length && !out.includes('BNBUSDT') && allow.has('BNBUSDT')) {
    out.push('BNBUSDT');
  }
  return out.length ? out : [...DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS];
}

export function readServerAutoTradeArm(user: string): ServerAutoTradeArm {
  try {
    const raw = fs.readFileSync(fileFor(user), 'utf8');
    const j = JSON.parse(raw) as Partial<ServerAutoTradeArm>;
    return {
      liveArmed: j.liveArmed === true,
      enabledSymbols: parseSymbols(j.enabledSymbols),
      leverage: Math.max(1, Math.min(125, Number(j.leverage) || 10)),
      marginMode: j.marginMode === 'crossed' ? 'crossed' : 'isolated',
      sizeMode: j.sizeMode === 'fixedUsdt' ? 'fixedUsdt' : 'equityPct',
      scalpEquityPct: Math.max(0.5, Math.min(100, Number(j.scalpEquityPct) || 5)),
      doksuriEquityPct: Math.max(0.5, Math.min(100, Number(j.doksuriEquityPct) || 5)),
      marginUsdt: Math.max(1, Math.min(50000, Number(j.marginUsdt) || 20)),
      strategyScalp: j.strategyScalp !== false,
      strategyDoksuri1: j.strategyDoksuri1 !== false,
      minRr: Math.max(1, Math.min(3, Number(j.minRr) || 1.2)),
      maxConcurrent: Math.max(
        1,
        Math.min(AUTO_TRADE_MAX_CONCURRENT, Number(j.maxConcurrent) || AUTO_TRADE_MAX_CONCURRENT)
      ),
      scalpTp1RoePct: (() => {
        const v = Math.max(
          1,
          Math.min(50, Number(j.scalpTp1RoePct) || FAST_TP1_ROE_PCT)
        );
        return Math.round(v) === 15 ? FAST_TP1_ROE_PCT : v;
      })(),
      scalpSlRoePct: Math.max(
        5,
        Math.min(80, Number(j.scalpSlRoePct) || FAST_SL_ROE_PCT)
      ),
      tapOnly: j.tapOnly !== false,
      updatedAt: Number(j.updatedAt) || 0,
      lastStatusKo: typeof j.lastStatusKo === 'string' ? j.lastStatusKo : null,
      lastTickAt: Number(j.lastTickAt) || null,
      watchBoard: parseAutoTradeWatchBoard(j.watchBoard),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeServerAutoTradeArm(
  user: string,
  patch: Partial<ServerAutoTradeArm>
): ServerAutoTradeArm {
  const prev = readServerAutoTradeArm(user);
  const next: ServerAutoTradeArm = {
    ...prev,
    ...patch,
    enabledSymbols: parseSymbols(
      patch.enabledSymbols != null ? patch.enabledSymbols : prev.enabledSymbols
    ),
    leverage: Math.max(
      1,
      Math.min(125, Number(patch.leverage ?? prev.leverage) || 10)
    ),
    marginMode:
      (patch.marginMode ?? prev.marginMode) === 'crossed' ? 'crossed' : 'isolated',
    sizeMode:
      (patch.sizeMode ?? prev.sizeMode) === 'fixedUsdt' ? 'fixedUsdt' : 'equityPct',
    scalpEquityPct: Math.max(
      0.5,
      Math.min(100, Number(patch.scalpEquityPct ?? prev.scalpEquityPct) || 5)
    ),
    doksuriEquityPct: Math.max(
      0.5,
      Math.min(100, Number(patch.doksuriEquityPct ?? prev.doksuriEquityPct) || 5)
    ),
    marginUsdt: Math.max(
      1,
      Math.min(50000, Number(patch.marginUsdt ?? prev.marginUsdt) || 20)
    ),
    strategyScalp:
      patch.strategyScalp != null ? patch.strategyScalp === true : prev.strategyScalp !== false,
    strategyDoksuri1:
      patch.strategyDoksuri1 != null
        ? patch.strategyDoksuri1 === true
        : prev.strategyDoksuri1 !== false,
    minRr: Math.max(1, Math.min(3, Number(patch.minRr ?? prev.minRr) || 1.2)),
    maxConcurrent: Math.max(
      1,
      Math.min(
        AUTO_TRADE_MAX_CONCURRENT,
        Number(patch.maxConcurrent ?? prev.maxConcurrent) || AUTO_TRADE_MAX_CONCURRENT
      )
    ),
    scalpTp1RoePct: (() => {
      const v = Math.max(
        1,
        Math.min(
          50,
          Number(patch.scalpTp1RoePct ?? prev.scalpTp1RoePct) || FAST_TP1_ROE_PCT
        )
      );
      return Math.round(v) === 15 ? FAST_TP1_ROE_PCT : v;
    })(),
    scalpSlRoePct: Math.max(
      5,
      Math.min(
        80,
        Number(patch.scalpSlRoePct ?? prev.scalpSlRoePct) || FAST_SL_ROE_PCT
      )
    ),
    liveArmed: patch.liveArmed != null ? patch.liveArmed === true : prev.liveArmed === true,
    tapOnly: patch.tapOnly != null ? patch.tapOnly === true : prev.tapOnly !== false,
    updatedAt: Date.now(),
    lastStatusKo:
      patch.lastStatusKo !== undefined ? patch.lastStatusKo : prev.lastStatusKo ?? null,
    lastTickAt: patch.lastTickAt !== undefined ? patch.lastTickAt : prev.lastTickAt ?? null,
    watchBoard:
      patch.watchBoard !== undefined
        ? parseAutoTradeWatchBoard(patch.watchBoard)
        : prev.watchBoard ?? null,
  };
  if (!fs.existsSync(dir())) fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(fileFor(user), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function listServerAutoTradeArmedUsers(): string[] {
  try {
    if (!fs.existsSync(dir())) return [];
    return fs
      .readdirSync(dir())
      .filter(
        (f) =>
          f.endsWith('.json') &&
          !f.endsWith('.fired.json') &&
          !f.endsWith('.exit-phase.json') &&
          !f.endsWith('.entry-memo.json')
      )
      .map((f) => f.replace(/\.json$/, ''))
      .filter((u) => {
        try {
          return readServerAutoTradeArm(u).liveArmed === true;
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

export function wasServerSignalFired(user: string, signalId: string): boolean {
  if (!signalId) return false;
  try {
    const j = JSON.parse(fs.readFileSync(firedFileFor(user), 'utf8')) as Record<
      string,
      number
    >;
    return Boolean(j[signalId]);
  } catch {
    return false;
  }
}

export function markServerSignalFired(user: string, signalId: string): void {
  if (!signalId) return;
  try {
    if (!fs.existsSync(dir())) fs.mkdirSync(dir(), { recursive: true });
    let j: Record<string, number> = {};
    try {
      j = JSON.parse(fs.readFileSync(firedFileFor(user), 'utf8')) as Record<string, number>;
    } catch {
      j = {};
    }
    j[signalId] = Date.now();
    const keys = Object.keys(j);
    if (keys.length > 200) {
      keys
        .sort((a, b) => (j[a] || 0) - (j[b] || 0))
        .slice(0, keys.length - 160)
        .forEach((k) => delete j[k]);
    }
    fs.writeFileSync(firedFileFor(user), JSON.stringify(j), 'utf8');
  } catch {
    /* ignore */
  }
}

/** 서버 진입 신호 메모 — 포지션 탭용 (심볼당 최신 1건) */
export type ServerPositionEntryMemo = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  signalKo: string;
  source: string;
  signalId: string;
  timeframe: string;
  at: number;
  /** 진입 텔레그램 전송 시각. 없으면 다음 틱에서 한 번 보냄 */
  telegramAt?: number;
};

function entryMemoFileFor(user: string): string {
  const safe = String(user || 'anon').replace(/[^\w.-]/g, '_');
  return path.join(dir(), `${safe}.entry-memo.json`);
}

export function readServerPositionEntryMemos(
  user: string
): Record<string, ServerPositionEntryMemo> {
  try {
    const raw = fs.readFileSync(entryMemoFileFor(user), 'utf8');
    const j = JSON.parse(raw) as Record<string, ServerPositionEntryMemo>;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

export function writeServerPositionEntryMemo(
  user: string,
  memo: ServerPositionEntryMemo
): void {
  try {
    if (!fs.existsSync(dir())) fs.mkdirSync(dir(), { recursive: true });
    const map = readServerPositionEntryMemos(user);
    const sym = String(memo.symbol || '').toUpperCase();
    if (!sym) return;
    map[sym] = { ...memo, symbol: sym, at: Date.now() };
    fs.writeFileSync(entryMemoFileFor(user), JSON.stringify(map), 'utf8');
  } catch {
    /* ignore */
  }
}

export function markServerPositionEntryTelegram(user: string, symbol: string): void {
  try {
    const map = readServerPositionEntryMemos(user);
    const sym = String(symbol || '').toUpperCase();
    const row = map[sym];
    if (!row) return;
    row.telegramAt = Date.now();
    if (!fs.existsSync(dir())) fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(entryMemoFileFor(user), JSON.stringify(map), 'utf8');
  } catch {
    /* ignore */
  }
}
