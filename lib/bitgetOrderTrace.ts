/**
 * Bitget 실주문 경로 추적 로그 (시크릿 비출력).
 * UI → Signal → Risk → OrderManager → BitgetClient → HTTP → Response
 * 확정 수익 아님.
 */

export type OrderTraceVerdict = 'PASS' | 'BLOCK' | 'ERROR';

export type OrderTraceStepId =
  | 'UI'
  | 'Signal'
  | 'RiskGate'
  | 'OrderManager'
  | 'BitgetClient'
  | 'HTTP'
  | 'Response'
  | 'FillConfirm'
  | 'PositionConfirm';

export type OrderTraceStep = {
  step: OrderTraceStepId | string;
  verdict: OrderTraceVerdict;
  reason?: string;
  detail?: Record<string, unknown>;
};

export type OrderSafeRequestLog = {
  endpoint: string;
  symbol?: unknown;
  productType?: unknown;
  marginMode?: unknown;
  marginCoin?: unknown;
  size?: unknown;
  price?: unknown;
  side?: unknown;
  tradeSide?: unknown;
  orderType?: unknown;
  force?: unknown;
  reduceOnly?: unknown;
  clientOid?: unknown;
  presetStopLossPrice?: unknown;
  presetStopSurplusPrice?: unknown;
};

const PREFIX = '[ORDER_TRACE]';

export function orderTraceLog(step: string, verdict: OrderTraceVerdict, extra?: string): void {
  const line = extra ? `${PREFIX} ${step} ${verdict} · ${extra}` : `${PREFIX} ${step} ${verdict}`;
  if (verdict === 'BLOCK') console.warn(line);
  else if (verdict === 'ERROR') console.error(line);
  else console.info(line);
}

export function orderTraceSteps(steps: OrderTraceStep[]): void {
  for (const s of steps) {
    const bits = [s.reason, s.detail ? JSON.stringify(s.detail) : ''].filter(Boolean).join(' · ');
    orderTraceLog(s.step, s.verdict, bits || undefined);
  }
}

/** Secret/Passphrase/Signature 제외 · 주문 직전 안전 필드만 */
export function logSafeOrderRequest(req: OrderSafeRequestLog): void {
  console.info(`${PREFIX} ORDER_REQUEST_BODY`, {
    endpoint: req.endpoint,
    symbol: req.symbol,
    productType: req.productType,
    marginMode: req.marginMode,
    marginCoin: req.marginCoin,
    size: req.size,
    price: req.price ?? null,
    side: req.side,
    tradeSide: req.tradeSide ?? null,
    orderType: req.orderType,
    force: req.force ?? null,
    reduceOnly: req.reduceOnly ?? null,
    clientOid: req.clientOid,
    presetStopLossPrice: req.presetStopLossPrice ?? null,
    presetStopSurplusPrice: req.presetStopSurplusPrice ?? null,
  });
}

export function logOrderBlockedBeforeBitget(step: string, reason: string): void {
  console.warn(
    `${PREFIX} ORDER BLOCKED BEFORE BITGET\nSTEP = ${step}\nREASON = ${reason}`
  );
}

export function logOrderSentToBitget(endpoint: string, code: string, msg: string, http?: number): void {
  console.info(
    `${PREFIX} ORDER SENT TO BITGET\nENDPOINT = ${endpoint}\nHTTP = ${http ?? '?'}\nCODE = ${code}\nMSG = ${msg}`
  );
}

export function logOrderAccepted(opts: {
  code: string;
  orderId?: string;
  clientOid?: string;
  fillStatus?: string;
}): void {
  console.info(
    `${PREFIX} ORDER ACCEPTED\nCODE = ${opts.code}\nORDER_ID = ${opts.orderId || '-'}\nCLIENT_OID = ${opts.clientOid || '-'}\nFILL STATUS = ${opts.fillStatus || 'PENDING'}`
  );
}

export function logOrderRejected(opts: {
  http?: number;
  code: string;
  msg: string;
  orderId?: string;
  clientOid?: string;
}): void {
  console.warn(
    `${PREFIX} ORDER REJECTED\nHTTP = ${opts.http ?? '?'}\nCODE = ${opts.code}\nMSG = ${opts.msg}\nORDER_ID = ${opts.orderId || '-'}\nCLIENT_OID = ${opts.clientOid || '-'}`
  );
}

export function normalizeMarginMode(raw: unknown): 'isolated' | 'crossed' | null {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'isolated') return 'isolated';
  if (s === 'crossed') return 'crossed';
  /** 잘못된 별칭 — 전송 금지 */
  if (s === 'cross' || s === 'isolate' || s === 'isolation') return null;
  return null;
}
