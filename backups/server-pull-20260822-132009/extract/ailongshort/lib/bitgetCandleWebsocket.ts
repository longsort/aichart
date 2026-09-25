/**
 * Bitget USDT-M 공개 캔들 WebSocket — 거래소와 동일 OHLC 실시간.
 * REST(`/api/market-bitget`)와 같은 버킷: candle1D/1W/1M (UTC 채널 아님).
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';

const WS_URL = 'wss://ws.bitget.com/v2/ws/public';

const CHANNEL_BY_TF: Record<string, string> = {
  '1m': 'candle1m',
  /** Bitget WS에 candle3m 없음 — REST tip 폴링만 */
  '5m': 'candle5m',
  '15m': 'candle15m',
  '1h': 'candle1H',
  '4h': 'candle4H',
  '1d': 'candle1D',
  '1w': 'candle1W',
  '1M': 'candle1M',
};

export type BitgetWsCandleUpdate = { candle: Candle; isComplete: boolean };

type Listener = (up: BitgetWsCandleUpdate) => void;

type Conn = {
  ws: WebSocket | null;
  listeners: Set<Listener>;
  pingTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  symbol: string;
  timeframe: string;
  stopped: boolean;
};

const connections = new Map<string, Conn>();

export function bitgetCandleChannel(timeframe: string): string | null {
  const tf = normalizeChartTimeframe(timeframe);
  return CHANNEL_BY_TF[tf] ?? null;
}

function parseRow(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const tsMs = Number(row[0]);
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);
  const volume = Number(row[5]);
  if (![tsMs, open, high, low, close].every(Number.isFinite)) return null;
  return {
    time: Math.floor(tsMs / 1000),
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
  };
}

function connKey(symbol: string, timeframe: string): string {
  return `${String(symbol).toUpperCase()}|${normalizeChartTimeframe(timeframe)}`;
}

function clearTimers(c: Conn): void {
  if (c.pingTimer) {
    clearInterval(c.pingTimer);
    c.pingTimer = null;
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
    connect(c);
  }, 1600);
}

function connect(c: Conn): void {
  clearTimers(c);
  const channel = bitgetCandleChannel(c.timeframe);
  if (!channel) return;

  try {
    c.ws?.close();
  } catch {
    /* ignore */
  }

  const ws = new WebSocket(WS_URL);
  c.ws = ws;
  const instId = String(c.symbol || 'BTCUSDT').toUpperCase();

  ws.onopen = () => {
    if (c.stopped || c.ws !== ws) return;
    ws.send(
      JSON.stringify({
        op: 'subscribe',
        args: [{ instType: 'USDT-FUTURES', channel, instId }],
      })
    );
    c.pingTimer = setInterval(() => {
      if (c.stopped || c.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send('ping');
      } catch {
        /* ignore */
      }
    }, 25_000);
  };

  ws.onmessage = (ev) => {
    if (c.stopped) return;
    const raw = typeof ev.data === 'string' ? ev.data : '';
    if (!raw || raw === 'pong') return;
    try {
      const msg = JSON.parse(raw) as { action?: string; data?: unknown[]; event?: string };
      if (msg.event === 'error' || msg.event === 'subscribe') return;
      if (!Array.isArray(msg.data) || !msg.data.length) return;
      for (const row of msg.data) {
        const candle = parseRow(row);
        if (!candle) continue;
        c.listeners.forEach((fn) => {
          try {
            fn({ candle, isComplete: false });
          } catch {
            /* ignore */
          }
        });
      }
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

/**
 * Bitget 캔들 구독. 1m~1M 지원. 해제 함수 반환.
 */
export function subscribeBitgetCandleWs(
  symbol: string,
  timeframe: string,
  onUpdate: Listener
): () => void {
  const tf = normalizeChartTimeframe(timeframe);
  if (!bitgetCandleChannel(tf) || typeof WebSocket === 'undefined') {
    return () => {};
  }
  const key = connKey(symbol, tf);
  let conn = connections.get(key);
  if (!conn) {
    conn = {
      ws: null,
      listeners: new Set(),
      pingTimer: null,
      reconnectTimer: null,
      symbol: String(symbol || 'BTCUSDT').toUpperCase(),
      timeframe: tf,
      stopped: false,
    };
    connections.set(key, conn);
    connect(conn);
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
