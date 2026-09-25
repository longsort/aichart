/**
 * Bitget USDT-M 선물 개인 API — 서명·레버리지·시장가 진입/청산.
 * 인증 코어: lib/bitgetAuth.ts (공식 HMAC + 서버시간).
 * 서버 전용. 확정 수익·투자 권유 아님.
 */
import {
  bitgetSignedRequest,
  normalizeBitgetCreds,
  runBitgetConnectionProbe,
  syncBitgetServerTime,
  failClassKo,
  type BitgetCreds,
} from '@/lib/bitgetAuth';
import { bitgetFailMsgKo } from '@/lib/bitgetErrorKo';
import {
  logOrderAccepted,
  logOrderBlockedBeforeBitget,
  logOrderRejected,
  logOrderSentToBitget,
  logSafeOrderRequest,
  normalizeMarginMode,
  orderTraceLog,
} from '@/lib/bitgetOrderTrace';
import { resolveLiveOrderSlTp } from '@/lib/mergedDeskLiveSlTp';
import {
  assertDirectionSlTp,
  markClearOfStop,
  widenSlToMinDistance,
  MIN_SL_PRICE_FRAC,
} from '@/lib/mergedDeskDirectionSlGuard';

export type { BitgetCreds } from '@/lib/bitgetAuth';

export type BitgetMarginMode = 'isolated' | 'crossed';

/** Bitget 계정 실제 포지션 모드 (추정 금지) */
export type BitgetPosMode = 'one_way_mode' | 'hedge_mode';

export type BitgetContractRules = {
  symbol: string;
  minTradeNum: number;
  sizeMultiplier: number;
  volumePlace: number;
  pricePlace: number;
  priceEndStep: number;
  raw?: unknown;
};

export type BitgetPlaceResult = {
  ok: boolean;
  orderId?: string;
  clientOid?: string;
  code?: string;
  msg?: string;
  raw?: unknown;
  /** 40774 복구 등으로 주문에서 SL/TP 프리셋을 빼고 낸 경우 */
  droppedPresets?: boolean;
  httpStatus?: number;
  fillStatus?: string;
  positionOpen?: boolean;
  blockReason?: string;
  blockStep?: string;
  endpoint?: string;
  appPosMode?: BitgetPosMode;
  bitgetPosMode?: BitgetPosMode;
};

const PRODUCT = 'USDT-FUTURES';
const MARGIN = 'USDT';

async function bitgetPrivate(
  creds: BitgetCreds,
  method: 'GET' | 'POST',
  requestPath: string,
  opts?: { query?: string; body?: Record<string, unknown> }
): Promise<{ status: number; json: any }> {
  const r = await bitgetSignedRequest(creds, method, requestPath, {
    query: opts?.query,
    bodyObj: opts?.body ?? null,
  });
  return { status: r.status, json: r.json };
}

/** 계좌 equity만 (주문 사이징용 · 프로브 아님) · 짧은 TTL 캐시 */
const acctCache = new Map<
  string,
  {
    at: number;
    payload: {
      ok: boolean;
      availableUsdt?: number;
      equityUsdt?: number;
      msg: string;
      code?: string;
    };
  }
>();

export async function bitgetFetchAccountSummary(creds: BitgetCreds): Promise<{
  ok: boolean;
  availableUsdt?: number;
  equityUsdt?: number;
  msg: string;
  code?: string;
}> {
  const cacheKey = String(creds.apiKey || '').slice(0, 12) || 'anon';
  const hit = acctCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 4_000) {
    return hit.payload;
  }
  const clean = normalizeBitgetCreds(creds);
  await syncBitgetServerTime();
  const { json } = await bitgetPrivate(clean, 'GET', '/api/v2/mix/account/accounts', {
    query: `productType=${PRODUCT}`,
  });
  const code = String(json?.code || '');
  if (code !== '00000') {
    return { ok: false, code, msg: String(json?.msg || 'account 실패') };
  }
  const list = Array.isArray(json?.data) ? json.data : [];
  const usdt =
    list.find((x: any) => String(x?.marginCoin || '').toUpperCase() === 'USDT') || list[0];
  const equityUsdt = Number(usdt?.accountEquity ?? usdt?.usdtEquity ?? usdt?.equity ?? 0) || undefined;
  const availableUsdt =
    Number(usdt?.available ?? usdt?.crossedMaxAvailable ?? equityUsdt) || undefined;
  const payload = { ok: true as const, availableUsdt, equityUsdt, msg: 'ok', code };
  acctCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

/**
 * 계정 실제 포지션 모드 조회 — 추정·재시도 금지.
 * GET /api/v2/mix/account/account
 */
export async function bitgetFetchPositionMode(
  creds: BitgetCreds,
  symbol = 'BTCUSDT'
): Promise<{
  ok: boolean;
  posMode: BitgetPosMode | null;
  msg: string;
  code?: string;
  raw?: unknown;
}> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const q = `symbol=${encodeURIComponent(sym)}&productType=${PRODUCT}&marginCoin=${MARGIN}`;
  let { json } = await bitgetPrivate(creds, 'GET', '/api/v2/mix/account/account', { query: q });
  let code = String(json?.code || '');
  let data = json?.data;

  /** 단일 계정 실패 시 accounts 목록에서 posMode 보조 조회 */
  if (code !== '00000' || !data) {
    const acc = await bitgetPrivate(creds, 'GET', '/api/v2/mix/account/accounts', {
      query: `productType=${PRODUCT}`,
    });
    json = acc.json;
    code = String(json?.code || '');
    const list = Array.isArray(json?.data) ? json.data : [];
    data =
      list.find((x: any) => String(x?.marginCoin || '').toUpperCase() === 'USDT') || list[0];
  }

  if (code !== '00000') {
    return {
      ok: false,
      posMode: null,
      code,
      msg: String(json?.msg || 'posMode 조회 실패'),
      raw: json,
    };
  }

  const rawMode = String(
    data?.posMode || data?.holdMode || data?.positionMode || ''
  ).toLowerCase();
  let posMode: BitgetPosMode | null = null;
  if (rawMode.includes('hedge')) posMode = 'hedge_mode';
  else if (rawMode.includes('one') || rawMode.includes('unilateral')) posMode = 'one_way_mode';
  if (!posMode) {
    return {
      ok: false,
      posMode: null,
      code,
      msg: `posMode 파싱 실패 · raw=${rawMode || '?'}`,
      raw: data,
    };
  }
  return { ok: true, posMode, msg: posMode, code, raw: data };
}

/**
 * 계약 주문 제약 — GET /api/v2/mix/market/contracts
 */
export async function bitgetFetchContractRules(
  symbol: string
): Promise<{ ok: boolean; rules: BitgetContractRules | null; msg: string }> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  try {
    const url = `https://api.bitget.com/api/v2/mix/market/contracts?productType=${PRODUCT}&symbol=${encodeURIComponent(sym)}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (String(json?.code) !== '00000') {
      return { ok: false, rules: null, msg: String(json?.msg || 'contracts 실패') };
    }
    const list = Array.isArray(json?.data) ? json.data : [];
    const row =
      list.find((x: any) => String(x?.symbol || '').toUpperCase() === sym) || list[0];
    if (!row) return { ok: false, rules: null, msg: 'contracts 없음' };
    const rules: BitgetContractRules = {
      symbol: sym,
      minTradeNum: Number(row.minTradeNum ?? row.minOrderQty ?? 0) || 0,
      sizeMultiplier: Number(row.sizeMultiplier ?? row.sizeMulti ?? 0) || 0,
      volumePlace: Number(row.volumePlace ?? row.quantityPlace ?? 0) || 0,
      pricePlace: Number(row.pricePlace ?? 0) || 0,
      priceEndStep: Number(row.priceEndStep ?? row.priceStep ?? 0) || 0,
      raw: row,
    };
    return { ok: true, rules, msg: 'ok' };
  } catch (e) {
    return { ok: false, rules: null, msg: e instanceof Error ? e.message : 'contracts network' };
  }
}

/** size가 min/step/precision을 만족하는지 */
export function validateOrderSizeAgainstRules(
  sizeStr: string,
  rules: BitgetContractRules
): { ok: boolean; reason?: string; size: string } {
  const size = Number(sizeStr);
  if (!(size > 0)) return { ok: false, reason: 'SIZE_ZERO', size: sizeStr };
  if (rules.minTradeNum > 0 && size + 1e-12 < rules.minTradeNum) {
    return {
      ok: false,
      reason: `SIZE_BELOW_MIN · size=${size} min=${rules.minTradeNum}`,
      size: sizeStr,
    };
  }
  if (rules.sizeMultiplier > 0) {
    const steps = size / rules.sizeMultiplier;
    if (Math.abs(steps - Math.round(steps)) > 1e-8) {
      return {
        ok: false,
        reason: `SIZE_STEP · size=${size} step=${rules.sizeMultiplier}`,
        size: sizeStr,
      };
    }
  }
  if (rules.volumePlace >= 0) {
    const decimals = (String(sizeStr).split('.')[1] || '').length;
    if (decimals > rules.volumePlace) {
      return {
        ok: false,
        reason: `SIZE_PRECISION · decimals=${decimals} max=${rules.volumePlace}`,
        size: sizeStr,
      };
    }
  }
  return { ok: true, size: sizeStr };
}

/**
 * Bitget 계약 min/step/volumePlace에 맞게 수량 내림 정렬.
 * ETH 0.095 → step 0.01 → 0.09 처럼 SIZE_STEP 차단을 피함.
 */
export function snapOrderSizeToRules(
  sizeStr: string,
  rules: BitgetContractRules
): { size: string; snapped: boolean; reason?: string } {
  let size = Number(sizeStr);
  if (!(size > 0)) return { size: sizeStr, snapped: false, reason: 'SIZE_ZERO' };

  const step = rules.sizeMultiplier > 0 ? rules.sizeMultiplier : 0;
  const place =
    rules.volumePlace >= 0
      ? rules.volumePlace
      : step > 0 && step < 1
        ? Math.min(8, Math.max(0, Math.round(-Math.log10(step) + 1e-12)))
        : 4;

  let snapped = false;
  if (step > 0) {
    const aligned = Math.floor(size / step + 1e-12) * step;
    if (Math.abs(aligned - size) > 1e-12) snapped = true;
    size = aligned;
  }

  if (rules.minTradeNum > 0 && size + 1e-12 < rules.minTradeNum) {
    size = rules.minTradeNum;
    if (step > 0) {
      size = Math.ceil(size / step - 1e-12) * step;
    }
    snapped = true;
  }

  if (!(size > 0)) {
    return { size: '0', snapped: true, reason: 'SIZE_SNAP_ZERO' };
  }

  const out = Number(size.toFixed(place)).toFixed(place);
  if (out !== String(sizeStr)) snapped = true;
  return { size: out, snapped };
}

/**
 * 주문 상세 — GET /api/v2/mix/order/detail
 * status: live|partially_filled|filled|cancelled|…
 */
export async function bitgetFetchOrderDetail(params: {
  creds: BitgetCreds;
  symbol: string;
  orderId?: string;
  clientOid?: string;
}): Promise<{
  ok: boolean;
  status: string;
  fillStatus: 'NEW' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'UNKNOWN';
  orderId?: string;
  clientOid?: string;
  msg: string;
  raw?: unknown;
}> {
  const sym = String(params.symbol || 'BTCUSDT').toUpperCase();
  const parts = [`symbol=${encodeURIComponent(sym)}`, `productType=${PRODUCT}`];
  if (params.orderId) parts.push(`orderId=${encodeURIComponent(params.orderId)}`);
  if (params.clientOid) parts.push(`clientOid=${encodeURIComponent(params.clientOid)}`);
  const { json } = await bitgetPrivate(params.creds, 'GET', '/api/v2/mix/order/detail', {
    query: parts.join('&'),
  });
  const code = String(json?.code || '');
  if (code !== '00000') {
    return {
      ok: false,
      status: '',
      fillStatus: 'UNKNOWN',
      msg: String(json?.msg || 'order detail 실패'),
      raw: json,
    };
  }
  const d = json?.data || {};
  const st = String(d.status || d.state || '').toLowerCase();
  let fillStatus: 'NEW' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'UNKNOWN' =
    'UNKNOWN';
  if (st === 'filled' || st === 'full_fill') fillStatus = 'FILLED';
  else if (st.includes('partial')) fillStatus = 'PARTIAL';
  else if (st === 'canceled' || st === 'cancelled') fillStatus = 'CANCELLED';
  else if (st === 'rejected') fillStatus = 'REJECTED';
  else if (st === 'new' || st === 'init' || st === 'live') fillStatus = 'NEW';
  return {
    ok: true,
    status: st,
    fillStatus,
    orderId: d.orderId != null ? String(d.orderId) : params.orderId,
    clientOid: d.clientOid != null ? String(d.clientOid) : params.clientOid,
    msg: 'ok',
    raw: d,
  };
}

/**
 * 조회 성공 ≠ 주문 권한.
 * pending 주문 API로 트레이드 읽기 권한만 확인 (쓰기 권한은 실주문 응답으로 판정).
 */
export async function bitgetProbeTradePermission(creds: BitgetCreds): Promise<{
  ok: boolean;
  tradeReadOk: boolean;
  /** 쓰기 권한은 실주문 전엔 단정 불가 — 읽기 실패면 FAIL */
  tradePermission: 'PASS' | 'FAIL' | 'UNVERIFIED';
  msg: string;
  code?: string;
}> {
  const { json } = await bitgetPrivate(creds, 'GET', '/api/v2/mix/order/orders-pending', {
    query: `productType=${PRODUCT}`,
  });
  const code = String(json?.code || '');
  const msg = String(json?.msg || '');
  if (code === '00000') {
    return {
      ok: true,
      tradeReadOk: true,
      tradePermission: 'UNVERIFIED',
      msg: '주문조회 PASS · 쓰기권한은 실주문 시 확인',
      code,
    };
  }
  const permFail =
    /40006|40014|40018|401|permission|권한|not allow|no permission|forbidden/i.test(
      `${code} ${msg}`
    );
  if (permFail) {
    return {
      ok: false,
      tradeReadOk: false,
      tradePermission: 'FAIL',
      msg: `TRADE PERMISSION FAIL · ${code} ${msg}`,
      code,
    };
  }
  return {
    ok: false,
    tradeReadOk: false,
    tradePermission: 'FAIL',
    msg: `주문조회 실패 · ${code} ${msg}`,
    code,
  };
}

/** 키 유효성 — ServerTime + HMAC Account 프로브 */
export async function bitgetTestCredentials(creds: BitgetCreds): Promise<{
  ok: boolean;
  readyForPaper?: boolean;
  availableUsdt?: number;
  equityUsdt?: number;
  msg: string;
  passphraseMode?: 'plain' | 'hmac';
  failClass?: string;
  steps?: Array<{ id: string; ok: boolean; labelKo: string; detailKo: string; code?: string }>;
  diag?: Record<string, unknown>;
}> {
  const clean = normalizeBitgetCreds(creds);
  await syncBitgetServerTime();
  const probe = await runBitgetConnectionProbe(clean);
  const looksRsa =
    /BEGIN (RSA )?PRIVATE KEY|BEGIN PRIVATE KEY/i.test(clean.apiSecret) ||
    clean.apiSecret.includes('-----');
  return {
    ok: probe.ok,
    readyForPaper: probe.readyForPaper,
    availableUsdt: probe.availableUsdt,
    equityUsdt: probe.equityUsdt,
    msg: probe.ok
      ? `OK · ${failClassKo('AUTH_OK')} · ${probe.readyHintKo}`
      : `${failClassKo(probe.failClass)} · ${probe.readyHintKo}`,
    passphraseMode: probe.passphraseMode,
    failClass: probe.failClass,
    steps: probe.steps.map((s) => ({
      id: s.id,
      ok: s.ok,
      labelKo: s.labelKo,
      detailKo: s.detailKo,
      code: s.code,
    })),
    diag: {
      keyLen: probe.diag.keyLen,
      secretLen: probe.diag.secretLen,
      passLen: probe.diag.passLen,
      keyPrefix: probe.diag.keyPrefix,
      looksRsa,
      looksSwapped: (probe.diag as { looksSwapped?: boolean }).looksSwapped,
      shapeHints: (probe.diag as { shapeHints?: string[] }).shapeHints,
      timeDiffMs: probe.diag.timeDiffMs,
      outboundIp: probe.diag.outboundIp,
      failClass: probe.failClass,
      readyHintKo: probe.readyHintKo,
      steps: probe.steps.map((s) => ({
        id: s.id,
        ok: s.ok,
        detailKo: s.detailKo,
        code: s.code,
      })),
      attempts: probe.steps
        .filter((s) => !s.ok)
        .map((s) => ({
          mode: s.id,
          path: s.id,
          code: s.code || '?',
          msg: s.detailKo,
        })),
    },
  };
}

/** 회당 증거금 = 자산 × 비중% (수익 반영 자산) */
export function equityPctToMarginUsdt(equityUsdt: number, equityPct: number): number {
  const pct = Math.max(0.5, Math.min(100, equityPct));
  const eq = Math.max(0, equityUsdt);
  return Math.max(1, Math.round(((eq * pct) / 100) * 100) / 100);
}

export async function bitgetSetLeverage(params: {
  creds: BitgetCreds;
  symbol: string;
  leverage: number;
  marginMode?: BitgetMarginMode;
  holdSide?: 'long' | 'short';
}): Promise<BitgetPlaceResult> {
  const lev = Math.max(1, Math.min(125, Math.round(params.leverage)));
  const body: Record<string, unknown> = {
    symbol: params.symbol.toUpperCase(),
    productType: PRODUCT,
    marginCoin: MARGIN,
    leverage: String(lev),
  };
  if (params.holdSide) body.holdSide = params.holdSide;
  const { json } = await bitgetPrivate(params.creds, 'POST', '/api/v2/mix/account/set-leverage', {
    body,
  });
  if (String(json?.code) !== '00000') {
    return { ok: false, code: String(json?.code || ''), msg: String(json?.msg || '레버리지 실패'), raw: json };
  }
  return { ok: true, msg: 'leverage ok', raw: json };
}

/**
 * 포지션 모드 맞추기 — 단방향(one_way) / 헷지(hedge).
 * 40774(단방향 계정+헷지형 주문) 복구용.
 */
export async function bitgetSetPositionMode(params: {
  creds: BitgetCreds;
  hedged: boolean;
}): Promise<BitgetPlaceResult> {
  const body = {
    productType: PRODUCT,
    posMode: params.hedged ? 'hedge_mode' : 'one_way_mode',
  };
  const { json } = await bitgetPrivate(
    params.creds,
    'POST',
    '/api/v2/mix/account/set-position-mode',
    { body }
  );
  if (String(json?.code) !== '00000') {
    return {
      ok: false,
      code: String(json?.code || ''),
      msg: bitgetFailMsgKo(String(json?.code || ''), String(json?.msg || '포지션모드 실패')),
      raw: json,
    };
  }
  return { ok: true, msg: params.hedged ? '헷지모드' : '단방향모드', raw: json };
}

/** 증거금(USDT) → 기초자산 size */
export function marginToBaseSize(marginUsdt: number, leverage: number, price: number): number {
  if (!(marginUsdt > 0) || !(leverage > 0) || !(price > 0)) return 0;
  return (marginUsdt * leverage) / price;
}

/** Bitget USDT-M 가격 틱 (SL/TP·트리거) — 미정렬 시 code 45115 */
export function bitgetPriceTick(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.startsWith('BTC')) return 0.1;
  if (s.startsWith('ETH')) return 0.01;
  if (s.startsWith('BNB')) return 0.01;
  if (s.startsWith('XRP')) return 0.0001;
  if (s.startsWith('SOL')) return 0.01;
  return 0.01;
}

/** SL/TP/트리거가를 심볼 틱에 맞춰 반올림 문자열 */
export function formatBitgetPrice(price: number, symbol: string): string {
  const tick = bitgetPriceTick(symbol);
  if (!(price > 0) || !(tick > 0)) return '0';
  const rounded = Math.round(price / tick) * tick;
  const decimals =
    tick >= 1 ? 0 : Math.min(8, Math.max(0, Math.round(-Math.log10(tick) + 1e-12)));
  /** float 잔여 제거 */
  const fixed = Number(rounded.toFixed(decimals));
  return fixed.toFixed(decimals);
}

/**
 * 방향에 맞게 SL/TP 틱 정렬.
 * LONG SL=내림(현재가 아래) · SHORT SL=올림(현재가 위)
 * LONG TP=올림 · SHORT TP=내림
 */
export function formatBitgetPriceDirected(
  price: number,
  symbol: string,
  mode: 'sl-long' | 'sl-short' | 'tp-long' | 'tp-short' | 'round'
): string {
  const tick = bitgetPriceTick(symbol);
  if (!(price > 0) || !(tick > 0)) return '0';
  let aligned: number;
  if (mode === 'sl-long' || mode === 'tp-short') {
    aligned = Math.floor(price / tick) * tick;
  } else if (mode === 'sl-short' || mode === 'tp-long') {
    aligned = Math.ceil(price / tick) * tick;
  } else {
    aligned = Math.round(price / tick) * tick;
  }
  const decimals =
    tick >= 1 ? 0 : Math.min(8, Math.max(0, Math.round(-Math.log10(tick) + 1e-12)));
  return Number(aligned.toFixed(decimals)).toFixed(decimals);
}

export function formatBitgetSize(size: number, symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.startsWith('BTC')) return Math.max(0.0001, size).toFixed(4);
  /** ETH Bitget step 보통 0.01 — 0.001 고정이면 SIZE_STEP 유발 */
  if (s.startsWith('ETH')) return Math.max(0.01, size).toFixed(2);
  if (s.startsWith('BNB')) return Math.max(0.01, size).toFixed(2);
  if (s.startsWith('XRP')) return Math.max(1, Math.round(size)).toFixed(0);
  if (s.startsWith('SOL')) return Math.max(0.1, size).toFixed(1);
  if (size >= 1) return size.toFixed(2);
  if (size >= 0.1) return size.toFixed(3);
  return size.toFixed(4);
}

/**
 * 시장가 진입/청산.
 * 단방향(one-way): tradeSide 금지 · 청산은 reduceOnly=YES.
 * 헷지: tradeSide open|close 필수 · 청산 시 side=포지션방향(buy=롱/sell=숏).
 * 포지션 모드는 Bitget 계정 조회값만 사용 — 추정·HEDGE/ONE-WAY 혼용 재시도 금지.
 */
export async function bitgetPlaceMarket(params: {
  creds: BitgetCreds;
  symbol: string;
  side: 'buy' | 'sell';
  size: string;
  marginMode?: BitgetMarginMode;
  reduceOnly?: boolean;
  clientOid?: string;
  /** hedge: open|close — 단방향이면 보내지 않음 */
  tradeSide?: 'open' | 'close';
  /** 앱이 의도한 모드(있으면 Bitget과 비교). 없으면 Bitget 모드를 따름 */
  appPosMode?: BitgetPosMode;
  /** 미리 심은 SL/TP (가격) */
  presetStopLossPrice?: number;
  presetTakeProfitPrice?: number;
}): Promise<BitgetPlaceResult> {
  const ENDPOINT = '/api/v2/mix/order/place-order';
  const clientOid =
    params.clientOid ||
    `als${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 32);

  orderTraceLog('BitgetClient', 'PASS', 'placeMarket enter');

  const mmNorm = normalizeMarginMode(params.marginMode || 'isolated');
  if (!mmNorm) {
    const reason = `INVALID_MARGIN_MODE · raw=${params.marginMode}`;
    logOrderBlockedBeforeBitget('BitgetClient', reason);
    return {
      ok: false,
      msg: reason,
      blockReason: reason,
      blockStep: 'BitgetClient',
      clientOid,
    };
  }

  /** 신규 진입인데 reduceOnly 바디가 들어가면 아래에서 재검사 */
  if (params.reduceOnly && params.tradeSide === 'open') {
    const reason = 'REDUCE_ONLY_ON_OPEN';
    logOrderBlockedBeforeBitget('BitgetClient', reason);
    return { ok: false, msg: reason, blockReason: reason, blockStep: 'BitgetClient', clientOid };
  }

  const modePack = await bitgetFetchPositionMode(params.creds, params.symbol);
  if (!modePack.ok || !modePack.posMode) {
    const reason = `POSITION_MODE_FETCH_FAIL · ${modePack.msg}`;
    orderTraceLog('BitgetClient', 'ERROR', reason);
    logOrderBlockedBeforeBitget('BitgetClient', reason);
    return {
      ok: false,
      msg: reason,
      code: modePack.code,
      blockReason: reason,
      blockStep: 'BitgetClient',
      clientOid,
      raw: modePack.raw,
    };
  }
  const bitgetPosMode = modePack.posMode;

  /** 앱 의도: 명시값 또는 tradeSide 유무 · 없으면 Bitget 따름 */
  let appPosMode: BitgetPosMode =
    params.appPosMode ||
    (params.tradeSide != null ? 'hedge_mode' : bitgetPosMode);
  /** 단방향 청산(reduceOnly)인데 tradeSide 없으면 앱=단방향 */
  if (params.reduceOnly && params.tradeSide == null && !params.appPosMode) {
    appPosMode = bitgetPosMode;
  }

  orderTraceLog(
    'BitgetClient',
    'PASS',
    `APP POSITION MODE=${appPosMode} · BITGET POSITION MODE=${bitgetPosMode}`
  );

  if (appPosMode !== bitgetPosMode) {
    const reason = 'POSITION_MODE_MISMATCH';
    orderTraceLog('BitgetClient', 'BLOCK', reason);
    logOrderBlockedBeforeBitget('BitgetClient', reason);
    return {
      ok: false,
      msg: reason,
      blockReason: reason,
      blockStep: 'BitgetClient',
      clientOid,
      appPosMode,
      bitgetPosMode,
    };
  }

  const mode: 'oneway' | 'hedge' = bitgetPosMode === 'hedge_mode' ? 'hedge' : 'oneway';

  const buildBody = (m: 'oneway' | 'hedge'): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      symbol: params.symbol.toUpperCase(),
      productType: PRODUCT,
      marginMode: mmNorm,
      marginCoin: MARGIN,
      size: params.size,
      orderType: 'market',
      clientOid,
    };

    if (m === 'oneway') {
      body.side = params.side;
      if (params.reduceOnly) body.reduceOnly = 'YES';
      /** tradeSide 절대 금지 */
    } else {
      const closing = Boolean(params.reduceOnly || params.tradeSide === 'close');
      if (closing) {
        body.side = params.side === 'sell' ? 'buy' : 'sell';
        body.tradeSide = 'close';
      } else {
        body.side = params.side;
        body.tradeSide = params.tradeSide || 'open';
      }
    }

    if (!params.reduceOnly && params.presetStopLossPrice && params.presetStopLossPrice > 0) {
      const slMode = params.side === 'buy' ? 'sl-long' : 'sl-short';
      body.presetStopLossPrice = formatBitgetPriceDirected(
        params.presetStopLossPrice,
        params.symbol,
        slMode
      );
    }
    if (!params.reduceOnly && params.presetTakeProfitPrice && params.presetTakeProfitPrice > 0) {
      const tpMode = params.side === 'buy' ? 'tp-long' : 'tp-short';
      body.presetStopSurplusPrice = formatBitgetPriceDirected(
        params.presetTakeProfitPrice,
        params.symbol,
        tpMode
      );
    }
    return body;
  };

  /** 신규 진입인데 reduceOnly 필드가 들어가면 안 됨 */
  const body = buildBody(mode);
  if (
    !params.reduceOnly &&
    String(body.reduceOnly || '').toUpperCase() === 'YES'
  ) {
    const reason = 'REDUCE_ONLY_ON_OPEN';
    logOrderBlockedBeforeBitget('BitgetClient', reason);
    return {
      ok: false,
      msg: reason,
      blockReason: reason,
      blockStep: 'BitgetClient',
      clientOid,
      appPosMode,
      bitgetPosMode,
    };
  }

  logSafeOrderRequest({
    endpoint: ENDPOINT,
    symbol: body.symbol,
    productType: body.productType,
    marginMode: body.marginMode,
    marginCoin: body.marginCoin,
    size: body.size,
    price: body.price,
    side: body.side,
    tradeSide: body.tradeSide,
    orderType: body.orderType,
    force: body.force,
    reduceOnly: body.reduceOnly ?? null,
    clientOid: body.clientOid,
    presetStopLossPrice: body.presetStopLossPrice,
    presetStopSurplusPrice: body.presetStopSurplusPrice,
  });

  orderTraceLog('HTTP', 'PASS', `POST ${ENDPOINT}`);
  const { status: httpStatus, json } = await bitgetPrivate(
    params.creds,
    'POST',
    ENDPOINT,
    { body }
  );

  const code = String(json?.code || '');
  const msg = String(json?.msg || '');
  const orderId = json?.data?.orderId != null ? String(json.data.orderId) : '';
  const respClientOid =
    json?.data?.clientOid != null ? String(json.data.clientOid) : clientOid;

  logOrderSentToBitget(ENDPOINT, code, msg, httpStatus);
  orderTraceLog(
    'Response',
    code === '00000' ? 'PASS' : 'BLOCK',
    `HTTP=${httpStatus} CODE=${code} MSG=${msg} ORDER_ID=${orderId || '-'}`
  );

  if (code !== '00000') {
    logOrderRejected({
      http: httpStatus,
      code,
      msg,
      orderId,
      clientOid: respClientOid,
    });
    return {
      ok: false,
      code,
      msg: bitgetFailMsgKo(code, msg || '주문 거절'),
      clientOid: respClientOid,
      orderId: orderId || undefined,
      raw: json,
      httpStatus,
      endpoint: ENDPOINT,
      appPosMode,
      bitgetPosMode,
      blockReason: `BITGET_REJECT · ${code} · ${msg}`,
      blockStep: 'Response',
    };
  }

  /** code=00000만으로 성공 단정 금지 — 주문상세 + 포지션 확인 */
  let fillStatus = 'NEW';
  let positionOpen = false;
  try {
    const detail = await bitgetFetchOrderDetail({
      creds: params.creds,
      symbol: params.symbol,
      orderId: orderId || undefined,
      clientOid: respClientOid,
    });
    fillStatus = detail.fillStatus;
    orderTraceLog('FillConfirm', detail.ok ? 'PASS' : 'ERROR', `FILL STATUS=${fillStatus}`);
  } catch (e) {
    orderTraceLog(
      'FillConfirm',
      'ERROR',
      e instanceof Error ? e.message : 'detail fail'
    );
  }

  if (!params.reduceOnly) {
    try {
      const pos = await bitgetFetchOpenPosition(params.creds, params.symbol);
      positionOpen = Boolean(pos.ok && pos.position && Number(pos.position.size) > 0);
      orderTraceLog(
        'PositionConfirm',
        positionOpen ? 'PASS' : 'BLOCK',
        positionOpen ? 'POSITION OPEN' : 'size=0 after accept'
      );
    } catch {
      orderTraceLog('PositionConfirm', 'ERROR', 'position fetch fail');
    }
  }

  logOrderAccepted({
    code: '00000',
    orderId,
    clientOid: respClientOid,
    fillStatus,
  });

  return {
    ok: true,
    orderId,
    clientOid: respClientOid,
    msg: positionOpen ? 'POSITION OPEN' : '완료',
    raw: json,
    httpStatus,
    fillStatus,
    positionOpen,
    endpoint: ENDPOINT,
    appPosMode,
    bitgetPosMode,
  };
}

export async function bitgetOpenLongShort(params: {
  creds: BitgetCreds;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  marginUsdt: number;
  leverage: number;
  price: number;
  marginMode?: BitgetMarginMode;
  sl?: number | null;
  tp?: number | null;
  clientOid?: string;
  /** 익절 ROE% (기본 5) — 분봉 스케일·사용자 설정 */
  tp1RoePct?: number;
  /** 손절 최대 ROE% (기본 3) — 타점 SL이 멀면 이 한도 */
  slRoePct?: number;
  /** 사용자 절대 손절가(선택) */
  userSlPrice?: number | null;
  /** 신호 TF — 타점 진입·분봉 TP 스케일 */
  timeframe?: string | null;
  /** 로켓/존 구조 SL — ROE 한도 2배까지 허용 */
  preserveStructureSl?: boolean;
  /** 세판정 — 넘긴 SL/TP 가격을 ROE로 다시 그리지 않음 */
  lockStructurePrices?: boolean;
  /** 반대방향 헷지 오픈 — 헷지모드+tradeSide open 강제 */
  hedgeOpen?: boolean;
}): Promise<
  BitgetPlaceResult & {
    size?: string;
    marginUsdtUsed?: number;
    actualSl?: number | null;
    actualTp?: number | null;
    slTpNotes?: string;
  }
> {
  orderTraceLog('OrderManager', 'PASS', `open ${params.direction} ${params.symbol}`);

  const mm = normalizeMarginMode(params.marginMode || 'isolated');
  if (!mm) {
    const reason = `INVALID_MARGIN_MODE · raw=${params.marginMode}`;
    logOrderBlockedBeforeBitget('OrderManager', reason);
    return { ok: false, msg: reason, blockReason: reason, blockStep: 'OrderManager' };
  }

  const lev = Math.max(1, Math.min(125, Math.round(params.leverage)));
  const setLev = async (holdSide?: 'long' | 'short') =>
    bitgetSetLeverage({
      creds: params.creds,
      symbol: params.symbol,
      leverage: lev,
      marginMode: mm,
      holdSide,
    });

  let levSet = await setLev();
  if (!levSet.ok) {
    /** 헷지 계정은 holdSide 필요 · 방향별 재시도 */
    const hs = params.direction === 'LONG' ? 'long' : 'short';
    levSet = await setLev(hs);
  }
  if (!levSet.ok) {
    const reason = `LEVERAGE_SET_FAIL · ${lev}x · ${levSet.msg || 'fail'}`;
    logOrderBlockedBeforeBitget('OrderManager', reason);
    return {
      ok: false,
      msg: reason,
      blockReason: reason,
      blockStep: 'OrderManager',
      code: levSet.code,
      raw: levSet.raw,
    };
  }
  orderTraceLog('OrderManager', 'PASS', `leverage set ${lev}x · ${mm}`);

  const base = marginToBaseSize(params.marginUsdt, lev, params.price);
  let size = formatBitgetSize(base, params.symbol);
  orderTraceLog(
    'OrderManager',
    'PASS',
    `marginUsdt=${params.marginUsdt} → base=${base} → size=${size} (not USDT-as-size)`
  );

  const rulesPack = await bitgetFetchContractRules(params.symbol);
  if (rulesPack.ok && rulesPack.rules) {
    const snapped = snapOrderSizeToRules(size, rulesPack.rules);
    if (snapped.snapped) {
      orderTraceLog(
        'OrderManager',
        'PASS',
        `SIZE SNAP · ${size} → ${snapped.size}${snapped.reason ? ` · ${snapped.reason}` : ''}`
      );
      size = snapped.size;
    }
    const v = validateOrderSizeAgainstRules(size, rulesPack.rules);
    if (!v.ok) {
      const reason = v.reason || 'SIZE_INVALID';
      orderTraceLog('OrderManager', 'BLOCK', reason);
      logOrderBlockedBeforeBitget('OrderManager', reason);
      return {
        ok: false,
        msg: reason,
        blockReason: reason,
        blockStep: 'OrderManager',
        size,
      };
    }
    orderTraceLog(
      'OrderManager',
      'PASS',
      `SIZE VALID · min=${rulesPack.rules.minTradeNum} step=${rulesPack.rules.sizeMultiplier} place=${rulesPack.rules.volumePlace} size=${size}`
    );
  } else {
    orderTraceLog('OrderManager', 'PASS', `contracts skip · ${rulesPack.msg}`);
  }

  if (!(Number(size) > 0)) {
    const reason = 'SIZE_CALC_FAIL';
    logOrderBlockedBeforeBitget('OrderManager', reason);
    return { ok: false, msg: reason, blockReason: reason, blockStep: 'OrderManager' };
  }

  const side = params.direction === 'LONG' ? 'buy' : 'sell';
  const px = Number(params.price);

  /** 타점 SL 우선 · ROE%는 최대 한도 · TP는 분봉/사용자 ROE */
  const fixed = resolveLiveOrderSlTp({
    entry: px,
    direction: params.direction,
    leverage: lev,
    signalSl: params.sl,
    userSlPrice: params.userSlPrice,
    tp1RoePct: params.tp1RoePct ?? 8,
    slRoePct: params.slRoePct ?? 20,
    timeframe: params.timeframe,
    signalTp: params.tp,
    preserveStructureSl: params.preserveStructureSl === true,
    lockStructurePrices: params.lockStructurePrices === true,
  });
  let sl: number | null = fixed.sl > 0 ? fixed.sl : null;
  let tp: number | null = fixed.tp > 0 ? fixed.tp : null;
  if (fixed.clampedSl) {
    orderTraceLog(
      'OrderManager',
      'PASS',
      `SL clamped to max ${fixed.slRoePct}%ROE · 타점이 너무 멂 · ≈${fixed.priceMoveSlPct.toFixed(3)}%px @ ${lev}x`
    );
  } else if (fixed.usedSignalSl) {
    orderTraceLog('OrderManager', 'PASS', `SL = 신호타점 · ROE한도 ${fixed.slRoePct}% 안`);
  }
  orderTraceLog(
    'OrderManager',
    'PASS',
    `TP=${tp} (${fixed.tp1RoePct}%ROE) SL=${sl} (${fixed.usedSignalSl ? '타점' : fixed.slRoePct + '%ROE'})`
  );

  if (sl != null && px > 0) {
    if (params.direction === 'LONG') {
      if (!(sl < px)) {
        /** 틱2개로 때우지 않음 — ROE 손절로 재계산 */
        const fixSl = resolveLiveOrderSlTp({
          entry: px,
          direction: params.direction,
          leverage: lev,
          tp1RoePct: params.tp1RoePct ?? 8,
          slRoePct: params.slRoePct ?? 20,
          preserveStructureSl: false,
        });
        sl = fixSl.sl > 0 && fixSl.sl < px ? fixSl.sl : null;
      }
    } else if (!(sl > px)) {
      const fixSl = resolveLiveOrderSlTp({
        entry: px,
        direction: params.direction,
        leverage: lev,
        tp1RoePct: params.tp1RoePct ?? 8,
        slRoePct: params.slRoePct ?? 20,
        preserveStructureSl: false,
      });
      sl = fixSl.sl > 0 && fixSl.sl > px ? fixSl.sl : null;
    }
  }
  if (!params.lockStructurePrices && tp != null && px > 0) {
        const minTpMove = (Math.max(3, Math.min(20, Number(params.tp1RoePct) || 8)) / 100 / lev) * 0.85;
    const tpDistOk =
      params.direction === 'LONG'
        ? tp > px * (1 + minTpMove)
        : tp < px * (1 - minTpMove);
    if (!tpDistOk) {
      /** 진입가+틱2개 금지 — 그게 0.12% 조기익절 원인 */
      const fixTp = resolveLiveOrderSlTp({
        entry: px,
        direction: params.direction,
        leverage: lev,
        tp1RoePct: params.tp1RoePct ?? 8,
        slRoePct: params.slRoePct ?? 20,
        preserveStructureSl: false,
      });
      tp = fixTp.tp > 0 ? fixTp.tp : null;
      orderTraceLog(
        'OrderManager',
        'PASS',
        `TP 재계산 · ROE ${fixTp.tp1RoePct}% → ${tp}`
      );
    }
  }

  /** 최종 기하 가드 — 역방향 SL/TP·이미관통이면 Bitget 호출 전 차단 */
  if (sl != null && px > 0) {
    const geo = assertDirectionSlTp({
      direction: params.direction,
      entry: px,
      sl,
      tp,
      minFrac: MIN_SL_PRICE_FRAC,
    });
    if (!geo.ok) {
      const reason = `DIR_SL_TP_REJECT · ${geo.reasonKo}`;
      logOrderBlockedBeforeBitget('OrderManager', reason);
      orderTraceLog('OrderManager', 'BLOCK', reason);
      return {
        ok: false,
        msg: reason,
        blockReason: reason,
        blockStep: 'OrderManager',
      };
    }
    sl = geo.sl;
    if (geo.tp != null) tp = geo.tp;

    const clear = markClearOfStop({
      direction: params.direction,
      mark: px,
      sl,
      bufferFrac: MIN_SL_PRICE_FRAC * 0.5,
    });
    if (!clear.ok) {
      const reason = `SL_ALREADY_HIT · ${clear.reasonKo}`;
      logOrderBlockedBeforeBitget('OrderManager', reason);
      orderTraceLog('OrderManager', 'BLOCK', reason);
      return {
        ok: false,
        msg: reason,
        blockReason: reason,
        blockStep: 'OrderManager',
      };
    }
  }

  /** tradeSide/posMode — 헷지오픈이면 명시 */
  const placed = await bitgetPlaceMarket({
    creds: params.creds,
    symbol: params.symbol,
    side,
    size,
    marginMode: mm,
    clientOid: params.clientOid,
    presetStopLossPrice: sl ?? undefined,
    presetTakeProfitPrice: tp ?? undefined,
    ...(params.hedgeOpen
      ? { tradeSide: 'open' as const, appPosMode: 'hedge_mode' as const }
      : {}),
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function forceEnsureSlTp(tag: string): Promise<{
    note: string;
    actualSl: number | null;
    actualTp: number | null;
  }> {
    if (sl == null && tp == null) {
      return { note: '', actualSl: sl, actualTp: tp };
    }
    /** 포지션 반영 대기 → 체결평단 기준 SL 재정렬(체결이 손절선 넘으면 즉시터짐 방지) */
    await sleep(450);
    let fillPx = px;
    try {
      const posPack = await bitgetFetchOpenPosition(params.creds, params.symbol);
      const pos = posPack.position;
      if (
        pos &&
        pos.direction === params.direction &&
        Number(pos.entryPrice) > 0
      ) {
        fillPx = Number(pos.entryPrice);
      }
    } catch {
      /* ignore */
    }

    let useSl = sl;
    let useTp = tp;
    if (useSl != null && fillPx > 0) {
      useSl = widenSlToMinDistance({
        direction: params.direction,
        entry: fillPx,
        sl: useSl,
        minFrac: MIN_SL_PRICE_FRAC,
      });
      const geo = assertDirectionSlTp({
        direction: params.direction,
        entry: fillPx,
        sl: useSl,
        tp: useTp,
        minFrac: MIN_SL_PRICE_FRAC,
      });
      if (geo.ok) {
        useSl = geo.sl;
        if (geo.tp != null) useTp = geo.tp;
      }
      const clear = markClearOfStop({
        direction: params.direction,
        mark: fillPx,
        sl: useSl,
        bufferFrac: MIN_SL_PRICE_FRAC * 0.45,
      });
      if (!clear.ok) {
        /** 체결이 이미 SL 관통 → 더 넓혀 재시도 */
        useSl = widenSlToMinDistance({
          direction: params.direction,
          entry: fillPx,
          sl: useSl,
          minFrac: MIN_SL_PRICE_FRAC * 2.2,
        });
        orderTraceLog(
          'OrderManager',
          'PASS',
          `fill-rebase SL · ${clear.reasonKo} → widen ${useSl}`
        );
      }
    }

    let ens = await bitgetEnsurePositionSlTp({
      creds: params.creds,
      symbol: params.symbol,
      direction: params.direction,
      stopLossPrice: useSl,
      takeProfitPrice: useTp,
    });
    if (!ens.tpOk && useTp != null) {
      await sleep(350);
      ens = await bitgetEnsurePositionSlTp({
        creds: params.creds,
        symbol: params.symbol,
        direction: params.direction,
        stopLossPrice: null,
        takeProfitPrice: useTp,
        size,
      });
    }
    const note = `${tag} · fill=${fillPx} · ${ens.notes.join(' · ')}`;
    orderTraceLog(
      'OrderManager',
      ens.slOk && ens.tpOk ? 'PASS' : 'BLOCK',
      note
    );
    return { note, actualSl: useSl, actualTp: useTp };
  }

  if (
    !placed.ok &&
    (sl != null || tp != null) &&
    (/45115/.test(String(placed.code || '')) ||
      /45115|틱 단위|손절가|익절가|multiple of|price you enter/i.test(
        String(placed.msg || '')
      ))
  ) {
    const bare = await bitgetPlaceMarket({
      creds: params.creds,
      symbol: params.symbol,
      side,
      size,
      marginMode: mm,
      clientOid: params.clientOid
        ? `${String(params.clientOid).slice(0, 28)}r`
        : undefined,
      ...(params.hedgeOpen
        ? { tradeSide: 'open' as const, appPosMode: 'hedge_mode' as const }
        : {}),
    });
    if (bare.ok) {
      const ens = await forceEnsureSlTp('bare+ensure');
      invalidateBitgetAllPositionsCache(params.creds);
      return {
        ...bare,
        size,
        marginUsdtUsed: params.marginUsdt,
        actualSl: ens.actualSl ?? sl,
        actualTp: ens.actualTp ?? tp,
        slTpNotes: ens.note,
      };
    }
    return { ...bare, size, marginUsdtUsed: params.marginUsdt, actualSl: sl, actualTp: tp };
  }

  if (placed.ok && (sl != null || tp != null)) {
    const ens = await forceEnsureSlTp('ensure');
    invalidateBitgetAllPositionsCache(params.creds);
    return {
      ...placed,
      size,
      marginUsdtUsed: params.marginUsdt,
      actualSl: ens.actualSl ?? sl,
      actualTp: ens.actualTp ?? tp,
      slTpNotes: ens.note,
    };
  }

  return {
    ...placed,
    size,
    marginUsdtUsed: params.marginUsdt,
    actualSl: sl,
    actualTp: tp,
  };
}

export async function bitgetReduceOrClose(params: {
  creds: BitgetCreds;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size: string;
  marginMode?: BitgetMarginMode;
  clientOid?: string;
}): Promise<BitgetPlaceResult> {
  /** 단방향 청산: 롱=sell / 숏=buy + reduceOnly (tradeSide 금지) */
  const side = params.direction === 'LONG' ? 'sell' : 'buy';
  return bitgetPlaceMarket({
    creds: params.creds,
    symbol: params.symbol,
    side,
    size: params.size,
    marginMode: params.marginMode || 'isolated',
    reduceOnly: true,
    clientOid: params.clientOid,
  });
}

/**
 * 포지션 손절(락) 갱신 — Bitget place-tpsl-order (pos_loss).
 * TP1 반익 후 잔량 보호용. 실패해도 주문 자체는 유지.
 */
export async function bitgetSetPositionStopLoss(params: {
  creds: BitgetCreds;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  stopLossPrice: number;
  /** 지정 시 해당 수량, 없으면 전체 포지션 */
  size?: string;
}): Promise<BitgetPlaceResult> {
  const trigger = Number(params.stopLossPrice);
  if (!(trigger > 0)) {
    return { ok: false, msg: '손절가 없음' };
  }
  const holdSide = params.direction === 'LONG' ? 'long' : 'short';
  const body: Record<string, unknown> = {
    symbol: params.symbol.toUpperCase(),
    productType: PRODUCT,
    marginCoin: MARGIN,
    planType: 'pos_loss',
    triggerPrice: formatBitgetPriceDirected(
      trigger,
      params.symbol,
      params.direction === 'LONG' ? 'sl-long' : 'sl-short'
    ),
    triggerType: 'mark_price',
    executePrice: '0',
    holdSide,
  };
  if (params.size && Number(params.size) > 0) {
    body.size = params.size;
  }
  let { json } = await bitgetPrivate(params.creds, 'POST', '/api/v2/mix/order/place-tpsl-order', {
    body,
  });
  /** 일부 계정은 loss_plan */
  if (String(json?.code) !== '00000') {
    const retry = { ...body, planType: 'loss_plan' };
    ({ json } = await bitgetPrivate(params.creds, 'POST', '/api/v2/mix/order/place-tpsl-order', {
      body: retry,
    }));
  }
  /** 단방향: holdSide 없이 */
  if (String(json?.code) !== '00000') {
    const bare = { ...body };
    delete bare.holdSide;
    ({ json } = await bitgetPrivate(params.creds, 'POST', '/api/v2/mix/order/place-tpsl-order', {
      body: bare,
    }));
  }
  if (String(json?.code) !== '00000') {
    return {
      ok: false,
      code: String(json?.code || ''),
      msg: bitgetFailMsgKo(String(json?.code || ''), String(json?.msg || '손절 갱신 실패')),
      raw: json,
    };
  }
  return {
    ok: true,
    orderId: String(json?.data?.orderId || json?.data?.planOrderId || ''),
    msg: `손절갱신 ${formatBitgetPriceDirected(
      trigger,
      params.symbol,
      params.direction === 'LONG' ? 'sl-long' : 'sl-short'
    )}`,
    raw: json,
  };
}

/**
 * 포지션 익절 프리셋 — place-tpsl-order (pos_profit).
 * 숏/롱 모두 holdSide 명시. 프리셋 누락 보완용.
 * size 없으면 전량 포지션 기준(권장).
 */
export async function bitgetSetPositionTakeProfit(params: {
  creds: BitgetCreds;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  takeProfitPrice: number;
  size?: string;
}): Promise<BitgetPlaceResult> {
  const trigger = Number(params.takeProfitPrice);
  if (!(trigger > 0)) {
    return { ok: false, msg: '익절가 없음' };
  }
  const holdSide = params.direction === 'LONG' ? 'long' : 'short';
  const triggerPrice = formatBitgetPriceDirected(
    trigger,
    params.symbol,
    params.direction === 'LONG' ? 'tp-long' : 'tp-short'
  );
  const baseBody: Record<string, unknown> = {
    symbol: params.symbol.toUpperCase(),
    productType: PRODUCT,
    marginCoin: MARGIN,
    planType: 'pos_profit',
    triggerPrice,
    triggerType: 'mark_price',
    executePrice: '0',
    holdSide,
  };
  if (params.size && Number(params.size) > 0) {
    baseBody.size = params.size;
  }

  const attempts: Record<string, unknown>[] = [
    baseBody,
    { ...baseBody, planType: 'profit_plan' },
    (() => {
      const b = { ...baseBody };
      delete b.holdSide;
      return b;
    })(),
    (() => {
      const b = { ...baseBody, planType: 'profit_plan' };
      delete b.holdSide;
      delete b.size;
      return b;
    })(),
    (() => {
      /** 전량 · holdSide만 */
      return {
        symbol: params.symbol.toUpperCase(),
        productType: PRODUCT,
        marginCoin: MARGIN,
        planType: 'pos_profit',
        triggerPrice,
        triggerType: 'fill_price',
        executePrice: '0',
        holdSide,
      };
    })(),
  ];

  let lastJson: any = null;
  for (const body of attempts) {
    const { json } = await bitgetPrivate(params.creds, 'POST', '/api/v2/mix/order/place-tpsl-order', {
      body,
    });
    lastJson = json;
    if (String(json?.code) === '00000') {
      return {
        ok: true,
        orderId: String(json?.data?.orderId || json?.data?.planOrderId || ''),
        msg: `익절갱신 ${triggerPrice}`,
        raw: json,
      };
    }
  }
  return {
    ok: false,
    code: String(lastJson?.code || ''),
    msg: bitgetFailMsgKo(
      String(lastJson?.code || ''),
      String(lastJson?.msg || '익절 갱신 실패')
    ),
    raw: lastJson,
  };
}

/**
 * 체결 직후·보유 중 SL/TP 보장.
 * place-order 프리셋이 빠져도 place-tpsl로 다시 심음.
 * TP는 size 없이(전량) 먼저 시도 — size 지정 시 Bitget이 자주 거절.
 */
export async function bitgetEnsurePositionSlTp(params: {
  creds: BitgetCreds;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  size?: string;
}): Promise<{ slOk: boolean; tpOk: boolean; notes: string[] }> {
  const notes: string[] = [];
  let slOk = true;
  let tpOk = true;
  if (params.stopLossPrice != null && params.stopLossPrice > 0) {
    let r = await bitgetSetPositionStopLoss({
      creds: params.creds,
      symbol: params.symbol,
      direction: params.direction,
      stopLossPrice: params.stopLossPrice,
      /** SL도 전량 우선 — size 생략 */
    });
    if (!r.ok && params.size && Number(params.size) > 0) {
      r = await bitgetSetPositionStopLoss({
        creds: params.creds,
        symbol: params.symbol,
        direction: params.direction,
        stopLossPrice: params.stopLossPrice,
        size: params.size,
      });
    }
    if (!r.ok) {
      const trigger = Number(params.stopLossPrice);
      const body: Record<string, unknown> = {
        symbol: params.symbol.toUpperCase(),
        productType: PRODUCT,
        marginCoin: MARGIN,
        planType: 'pos_loss',
        triggerPrice: formatBitgetPriceDirected(
          trigger,
          params.symbol,
          params.direction === 'LONG' ? 'sl-long' : 'sl-short'
        ),
        triggerType: 'mark_price',
        executePrice: '0',
      };
      const { json } = await bitgetPrivate(
        params.creds,
        'POST',
        '/api/v2/mix/order/place-tpsl-order',
        { body }
      );
      if (String(json?.code) === '00000') {
        r = { ok: true, msg: '손절 ok(oneway)' };
      }
    }
    slOk = Boolean(r.ok);
    notes.push(r.ok ? `SL OK ${params.stopLossPrice}` : `SL FAIL ${r.msg}`);
  }
  if (params.takeProfitPrice != null && params.takeProfitPrice > 0) {
    /** 1) 전량(사이즈 없음) 2) 실패 시 size 재시도 */
    let r = await bitgetSetPositionTakeProfit({
      creds: params.creds,
      symbol: params.symbol,
      direction: params.direction,
      takeProfitPrice: params.takeProfitPrice,
    });
    if (!r.ok && params.size && Number(params.size) > 0) {
      r = await bitgetSetPositionTakeProfit({
        creds: params.creds,
        symbol: params.symbol,
        direction: params.direction,
        takeProfitPrice: params.takeProfitPrice,
        size: params.size,
      });
    }
    tpOk = Boolean(r.ok);
    notes.push(r.ok ? `TP OK ${params.takeProfitPrice}` : `TP FAIL ${r.msg}`);
  }
  return { slOk, tpOk, notes };
}

/**
 * 실포지션 잔량 × frac → Bitget size 문자열.
 * frac>=0.95 이면 전량.
 */
export function positionSizeForReduce(
  posSize: number,
  frac: number,
  symbol: string
): string {
  const f = Math.max(0.05, Math.min(1, frac));
  const use = f >= 0.95 ? posSize : posSize * f;
  return formatBitgetSize(use, symbol);
}

/** 로그인 사용자 키로 조회한 실포지션 (화면 카드용) */
export type BitgetOpenPosition = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  marginMode: BitgetMarginMode;
  size: number;
  marginUsdt: number;
  entryPrice: number;
  markPrice: number;
  liqPrice: number | null;
  unrealizedPnl: number;
  realizedPnl: number;
  roePct: number | null;
  mmrPct: number | null;
  tpPrice: number | null;
  slPrice: number | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Bitget USDT-M 오픈 포지션 파싱 (one-way/hedge · BTC·ETH).
 */
function normPosSymbol(s: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/_UMCBL|_CMCBL|_DMCBL/g, '');
}

function parseBitgetPositionRow(open: any, fallbackSym: string): BitgetOpenPosition | null {
  const size = Math.abs(
    num(
      open?.total ??
        open?.available ??
        open?.holdSize ??
        open?.size ??
        open?.posSize ??
        open?.openSize ??
        open?.holdVol
    )
  );
  if (!(size > 0)) return null;

  const hold = String(open?.holdSide || open?.posSide || open?.side || '').toLowerCase();
  const signed = num(open?.total ?? open?.available ?? open?.size);
  let direction: 'LONG' | 'SHORT' = 'LONG';
  if (hold === 'short' || hold === 'sell' || hold === 's') direction = 'SHORT';
  else if (hold === 'long' || hold === 'buy' || hold === 'l') direction = 'LONG';
  else if (signed < 0) direction = 'SHORT';

  const symRaw = normPosSymbol(String(open?.symbol || fallbackSym || ''));
  const symbol = symRaw || fallbackSym.toUpperCase();

  const marginRaw = Math.abs(num(open.marginSize ?? open.locked ?? open.im ?? 0));
  const entryPrice = num(open.openPriceAvg ?? open.averageOpenPrice ?? open.openPrice);
  const markPrice = num(open.markPrice ?? open.marketPrice);
  const liqRaw = num(open.liquidationPrice ?? open.liqPrice);
  const unrealizedPnl = num(open.unrealizedPL ?? open.upl ?? open.unrealizedPnl);
  const realizedPnl = num(open.achievedProfits ?? open.realizedPL ?? open.realizedPnl);
  const leverage = Math.max(1, Math.round(num(open.leverage) || 1));
  /** marginSize 누락·이상치 시 명목/레버로 추정 — tiny margin이면 ROE 폭증→조기익절 버그 */
  const notional = size > 0 && entryPrice > 0 ? size * entryPrice : 0;
  const marginFromLev = notional > 0 ? notional / leverage : 0;
  const marginUsdt =
    marginRaw > 0 && (marginFromLev <= 0 || marginRaw >= marginFromLev * 0.25)
      ? marginRaw
      : marginFromLev > 0
        ? marginFromLev
        : marginRaw;
  const marginMode: BitgetMarginMode =
    String(open.marginMode || '').toLowerCase().includes('cross') ? 'crossed' : 'isolated';
  const keep = num(open.keepMarginRate ?? open.mmr);
  const mmrPct = keep > 0 ? (keep <= 1 ? keep * 100 : keep) : null;
  /** Bitget이 비율(0.05=5%)로 주면 %로 환산 */
  const plrRaw = num(open.unrealizedPLR ?? open.unrealizedPnlRate ?? open.profitRate);
  let roePct: number | null =
    marginUsdt > 0 ? (unrealizedPnl / marginUsdt) * 100 : null;
  if (plrRaw !== 0 && Number.isFinite(plrRaw)) {
    const plrAsPct = Math.abs(plrRaw) <= 1 ? plrRaw * 100 : plrRaw;
    if (roePct == null || !Number.isFinite(roePct)) roePct = plrAsPct;
  }
  const tpPrice = num(open.takeProfit ?? open.presetTakeProfitPrice) || null;
  const slPrice = num(open.stopLoss ?? open.presetStopLossPrice) || null;

  return {
    symbol,
    direction,
    leverage,
    marginMode,
    size,
    marginUsdt,
    entryPrice,
    markPrice,
    liqPrice: liqRaw > 0 ? liqRaw : null,
    unrealizedPnl,
    realizedPnl,
    roePct: roePct != null && Number.isFinite(roePct) ? roePct : null,
    mmrPct,
    tpPrice: tpPrice && tpPrice > 0 ? tpPrice : null,
    slPrice: slPrice && slPrice > 0 ? slPrice : null,
  };
}

/**
 * Bitget USDT-M 단일 심볼 오픈 포지션.
 * GET /api/v2/mix/position/all-position
 */
export async function bitgetFetchOpenPosition(
  creds: BitgetCreds,
  symbol: string
): Promise<{ ok: boolean; position: BitgetOpenPosition | null; msg: string; raw?: unknown }> {
  const sym = normPosSymbol(symbol);
  const q = `productType=${PRODUCT}&marginCoin=${MARGIN}`;
  const { json } = await bitgetPrivate(creds, 'GET', '/api/v2/mix/position/all-position', {
    query: q,
  });
  if (String(json?.code) !== '00000') {
    return { ok: false, position: null, msg: String(json?.msg || json?.code || '포지션 조회 실패'), raw: json };
  }
  const list = Array.isArray(json?.data) ? json.data : [];
  const rows = list.filter((r: any) => {
    const rs = normPosSymbol(String(r?.symbol || ''));
    /** 정확 매칭만 — 앱 외 코인·유사티커(WBTC 등) 오탐으로 진입 막지 않음 */
    return rs === sym || rs.startsWith(`${sym}_`) || rs.startsWith(`${sym}-`);
  });
  for (const row of rows) {
    const parsed = parseBitgetPositionRow(row, sym);
    if (parsed) {
      return { ok: true, position: { ...parsed, symbol: sym }, msg: 'ok', raw: row };
    }
  }
  return { ok: true, position: null, msg: '포지션 없음', raw: list };
}

/** 한 번에 전체 오픈 포지션 (BTC+ETH 동시 감지) · 짧은 TTL 캐시로 폴링 폭주 완화 */
const allPosCache = new Map<
  string,
  {
    at: number;
    payload: { ok: boolean; positions: BitgetOpenPosition[]; msg: string; raw?: unknown };
  }
>();
const ALL_POS_TTL_MS = Math.max(
  800,
  Math.min(8_000, Number(process.env.BITGET_ALL_POS_TTL_MS || 2_000) || 2_000)
);

export async function bitgetFetchAllOpenPositions(
  creds: BitgetCreds
): Promise<{ ok: boolean; positions: BitgetOpenPosition[]; msg: string; raw?: unknown }> {
  const cacheKey = String(creds.apiKey || '').slice(0, 12) || 'anon';
  const hit = allPosCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ALL_POS_TTL_MS) {
    return hit.payload;
  }
  const q = `productType=${PRODUCT}&marginCoin=${MARGIN}`;
  const { json } = await bitgetPrivate(creds, 'GET', '/api/v2/mix/position/all-position', {
    query: q,
  });
  if (String(json?.code) !== '00000') {
    return {
      ok: false,
      positions: [],
      msg: String(json?.msg || json?.code || '포지션 조회 실패'),
      raw: json,
    };
  }
  const list = Array.isArray(json?.data) ? json.data : [];
  const positions: BitgetOpenPosition[] = [];
  for (const row of list) {
    const parsed = parseBitgetPositionRow(row, String(row?.symbol || ''));
    if (parsed) positions.push(parsed);
  }
  const payload = { ok: true as const, positions, msg: 'ok', raw: list as unknown };
  allPosCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

/** 주문 직후 등 — 포지션 캐시 무효화 */
export function invalidateBitgetAllPositionsCache(creds?: BitgetCreds): void {
  if (creds?.apiKey) {
    allPosCache.delete(String(creds.apiKey).slice(0, 12));
  } else {
    allPosCache.clear();
  }
}

