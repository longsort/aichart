/**
 * Bitget USDT-M 선물 주문 (서버 무접속 진입용).
 * 키: BITGET_API_KEY / BITGET_API_SECRET / BITGET_API_PASSPHRASE
 */
import crypto from 'crypto';
import { BITGET_BASE } from '@/lib/exchangeConfig';

export type BitgetCreds = {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
};

export function readBitgetCredsFromEnv(): BitgetCreds | null {
  const apiKey = (process.env.BITGET_API_KEY || '').trim();
  const apiSecret = (process.env.BITGET_API_SECRET || '').trim();
  const passphrase = (process.env.BITGET_API_PASSPHRASE || '').trim();
  if (!apiKey || !apiSecret || !passphrase) return null;
  return { apiKey, apiSecret, passphrase };
}

function sign(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string
): string {
  const prehash = `${timestamp}${method.toUpperCase()}${requestPath}${body}`;
  return crypto.createHmac('sha256', secret).update(prehash).digest('base64');
}

async function bitgetPrivate(
  creds: BitgetCreds,
  method: 'GET' | 'POST',
  requestPath: string,
  bodyObj?: Record<string, unknown>
): Promise<{ ok: boolean; code: string; msg: string; data: unknown }> {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const ts = String(Date.now());
  const headers: Record<string, string> = {
    'ACCESS-KEY': creds.apiKey,
    'ACCESS-SIGN': sign(creds.apiSecret, ts, method, requestPath, body),
    'ACCESS-TIMESTAMP': ts,
    'ACCESS-PASSPHRASE': creds.passphrase,
    'Content-Type': 'application/json',
    locale: 'en-US',
  };
  const url = `${BITGET_BASE}${requestPath}`;
  const res = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? body : undefined,
    cache: 'no-store',
  });
  const j = (await res.json().catch(() => ({}))) as {
    code?: string;
    msg?: string;
    data?: unknown;
  };
  return {
    ok: String(j.code || '') === '00000',
    code: String(j.code || res.status),
    msg: String(j.msg || ''),
    data: j.data,
  };
}

export type PpPlaceOrderInput = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  leverage: number;
  /** 마진(USDT). notional ≈ margin * lev */
  marginUsdt: number;
  sizeScale?: number;
  clientOid?: string;
};

export type PpPlaceOrderResult = {
  ok: boolean;
  paper: boolean;
  orderId: string | null;
  msg: string;
  raw?: unknown;
};

/**
 * 시장가 진입 + 미리 지정된 SL/TP (presetStopLoss / presetStopSurplus).
 * 키 없으면 paper 성공(기록용).
 */
export async function placeProfitPatternLiveOrder(
  input: PpPlaceOrderInput,
  creds?: BitgetCreds | null
): Promise<PpPlaceOrderResult> {
  const c = creds === undefined ? readBitgetCredsFromEnv() : creds;
  const sym = String(input.symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const scale = Math.max(0.01, Math.min(1, Number(input.sizeScale) || 1));
  const margin = Math.max(1, Number(input.marginUsdt) || 10) * scale;
  const lev = Math.max(1, Math.min(125, Math.round(Number(input.leverage) || 50)));
  const entry = Number(input.entry);
  if (!(entry > 0) || !(input.sl > 0) || !(input.tp > 0)) {
    return { ok: false, paper: true, orderId: null, msg: '가격 무효' };
  }
  const notional = margin * lev;
  const size = notional / entry;
  const side = input.direction === 'LONG' ? 'buy' : 'sell';
  const holdSide = input.direction === 'LONG' ? 'long' : 'short';

  if (!c) {
    return {
      ok: true,
      paper: true,
      orderId: `paper-${Date.now()}`,
      msg: '키없음 · 페이퍼 기록만 (서버 감지 OK)',
    };
  }

  /** 레버리지 설정 */
  await bitgetPrivate(c, 'POST', '/api/v2/mix/account/set-leverage', {
    symbol: sym,
    productType: 'USDT-FUTURES',
    marginCoin: 'USDT',
    leverage: String(lev),
  });

  const clientOid =
    input.clientOid ||
    `pp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const placed = await bitgetPrivate(c, 'POST', '/api/v2/mix/order/place-order', {
    symbol: sym,
    productType: 'USDT-FUTURES',
    marginMode: 'crossed',
    marginCoin: 'USDT',
    size: String(Number(size.toFixed(6))),
    side,
    tradeSide: 'open',
    orderType: 'market',
    clientOid,
    presetStopLossPrice: String(input.sl),
    presetStopSurplusPrice: String(input.tp),
  });

  if (!placed.ok) {
    return {
      ok: false,
      paper: false,
      orderId: null,
      msg: `주문실패 · ${placed.code} ${placed.msg}`,
      raw: placed.data,
    };
  }

  const data = placed.data as { orderId?: string; clientOid?: string } | null;
  return {
    ok: true,
    paper: false,
    orderId: data?.orderId || data?.clientOid || clientOid,
    msg: `실주문 OK · ${holdSide} · ${sym}`,
    raw: placed.data,
  };
}
