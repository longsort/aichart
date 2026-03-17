import { Candle } from '@/types';

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m',
  '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

export type WsCandleUpdate = { candle: Candle; isComplete: boolean };

type Listener = (up: WsCandleUpdate) => void;

const connections = new Map<string, { ws: WebSocket; listeners: Set<Listener> }>();

function getStream(symbol: string, timeframe: string): string {
  const tf = timeframe.toLowerCase();
  const interval = INTERVAL_MAP[tf] ?? INTERVAL_MAP[timeframe] ?? '4h';
  return `${symbol.toLowerCase()}@kline_${interval}`;
}

function connect(symbol: string, timeframe: string, onUpdate: Listener): () => void {
  const key = `${symbol}-${timeframe}`;
  const stream = getStream(symbol, timeframe);

  if (connections.has(key)) {
    connections.get(key)!.listeners.add(onUpdate);
    return () => {
      const c = connections.get(key)!;
      c.listeners.delete(onUpdate);
      if (c.listeners.size === 0) {
        c.ws.close();
        connections.delete(key);
      }
    };
  }

  const listeners = new Set<Listener>([onUpdate]);
  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
  connections.set(key, { ws, listeners });

  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data as string);
      const k = d.k;
      if (!k) return;
      const candle: Candle = {
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
      };
      const isComplete = !!k.x;
      connections.get(key)?.listeners.forEach(fn => fn({ candle, isComplete }));
    } catch {}
  };
  ws.onclose = () => connections.delete(key);

  return () => {
    const c = connections.get(key);
    if (c) {
      c.listeners.delete(onUpdate);
      if (c.listeners.size === 0) {
        c.ws.close();
        connections.delete(key);
      }
    }
  };
}

export function subscribeWs(symbol: string, timeframe: string, onUpdate: Listener): () => void {
  return connect(symbol, timeframe, onUpdate);
}
