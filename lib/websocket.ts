/**
 * Binance 스팟 캔들 WebSocket — 끊김 시 재연결 + 묵묵한 정체 감지.
 */
import { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
  /** 월봉 스트림은 바이낸스 스팟 WS에 없음 — 구독 자체를 막음 */
};

const STALL_MS = 48_000;

export type WsCandleUpdate = { candle: Candle; isComplete: boolean };

type Listener = (up: WsCandleUpdate) => void;

type Conn = {
  ws: WebSocket | null;
  listeners: Set<Listener>;
  stallTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  lastCandleAt: number;
  symbol: string;
  timeframe: string;
  stream: string;
  stopped: boolean;
};

const connections = new Map<string, Conn>();

function getStream(symbol: string, timeframe: string): string | null {
  /** 1M.toLowerCase()==='1m' 버그 방지 — 월봉을 1분봉으로 구독하면 차트 붕괴 */
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1M' || tf === '1Y' || tf === '1w') return null;
  const interval = INTERVAL_MAP[tf];
  if (!interval) return null;
  return `${symbol.toLowerCase()}@kline_${interval}`;
}

function connKey(symbol: string, timeframe: string): string {
  return `${String(symbol).toUpperCase()}|${normalizeChartTimeframe(timeframe)}`;
}

function clearTimers(c: Conn): void {
  if (c.stallTimer) {
    clearInterval(c.stallTimer);
    c.stallTimer = null;
  }
  if (c.reconnectTimer) {
    clearTimeout(c.reconnectTimer);
    c.reconnectTimer = null;
  }
}

function scheduleReconnect(c: Conn): void {
  if (c.stopped || c.listeners.size === 0) return;
  if (c.reconnectTimer) return;
  c.reconnectTimer = setTimeout(() => {
    c.reconnectTimer = null;
    if (c.stopped || c.listeners.size === 0) return;
    connectSocket(c);
  }, 1600);
}

function forceReconnect(c: Conn): void {
  if (c.stopped || c.listeners.size === 0) return;
  try {
    c.ws?.close();
  } catch {
    /* ignore */
  }
  c.ws = null;
  clearTimers(c);
  scheduleReconnect(c);
}

function connectSocket(c: Conn): void {
  clearTimers(c);
  try {
    c.ws?.close();
  } catch {
    /* ignore */
  }

  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${c.stream}`);
  c.ws = ws;
  c.lastCandleAt = Date.now();

  ws.onopen = () => {
    if (c.stopped || c.ws !== ws) return;
    c.lastCandleAt = Date.now();
    c.stallTimer = setInterval(() => {
      if (c.stopped || c.ws !== ws) return;
      if (Date.now() - c.lastCandleAt < STALL_MS) return;
      forceReconnect(c);
    }, 12_000);
  };

  ws.onmessage = (e) => {
    if (c.stopped) return;
    try {
      const d = JSON.parse(e.data as string);
      const k = d.k;
      if (!k) return;
      const vol = parseFloat(k.v);
      const tbRaw = k.V != null ? parseFloat(String(k.V)) : NaN;
      const candle: Candle = {
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: vol,
        ...(Number.isFinite(tbRaw) && vol > 0 && tbRaw >= 0 && tbRaw <= vol * 1.001
          ? { takerBuyBaseVolume: tbRaw }
          : {}),
      };
      const isComplete = !!k.x;
      c.lastCandleAt = Date.now();
      c.listeners.forEach((fn) => {
        try {
          fn({ candle, isComplete });
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  };

  ws.onclose = () => {
    if (c.ws === ws) c.ws = null;
    clearTimers(c);
    if (!c.stopped && c.listeners.size > 0) scheduleReconnect(c);
  };

  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
}

export function subscribeWs(symbol: string, timeframe: string, onUpdate: Listener): () => void {
  const tf = normalizeChartTimeframe(timeframe);
  const stream = getStream(symbol, tf);
  if (!stream || typeof WebSocket === 'undefined') {
    return () => {};
  }
  const key = connKey(symbol, tf);
  let conn = connections.get(key);
  if (!conn) {
    conn = {
      ws: null,
      listeners: new Set(),
      stallTimer: null,
      reconnectTimer: null,
      lastCandleAt: Date.now(),
      symbol: String(symbol || 'BTCUSDT').toUpperCase(),
      timeframe: tf,
      stream,
      stopped: false,
    };
    connections.set(key, conn);
    connectSocket(conn);
  }
  conn.stopped = false;
  conn.listeners.add(onUpdate);

  return () => {
    const c = connections.get(key);
    if (!c) return;
    c.listeners.delete(onUpdate);
    if (c.listeners.size === 0) {
      c.stopped = true;
      clearTimers(c);
      try {
        c.ws?.close();
      } catch {
        /* ignore */
      }
      c.ws = null;
      connections.delete(key);
    }
  };
}
