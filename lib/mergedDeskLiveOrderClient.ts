/**
 * 클라이언트 → 서버 실주문 헬퍼.
 */
export type LiveOrderRequest = {
  action: 'open' | 'reduce' | 'close' | 'set-sl' | 'set-tp' | 'ensure-sl-tp';
  symbol: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  /** equityPct | fixedUsdt — 서버가 자산×비중으로 증거금 재산정 */
  sizeMode?: 'equityPct' | 'fixedUsdt';
  equityPct?: number;
  marginUsdt?: number;
  /** reduce/close 시 기초자산 size (없어도 서버가 실잔량 조회) */
  size?: string;
  /** 부분청산 비중 0~1 — 서버가 실잔량×frac */
  frac?: number;
  price: number;
  marginMode?: 'isolated' | 'crossed';
  sl?: number | null;
  tp?: number | null;
  /** set-sl 잠금가 (sl과 동일 가능) */
  lockPrice?: number | null;
  clientOid?: string;
  signalId?: string;
  source?: 'scalp' | 'doksuri1' | 'manual';
  tp1RoePct?: number;
  slRoePct?: number;
  userSlPrice?: number | null;
  /** 신호 TF — 타점 SL·분봉 TP 스케일 */
  timeframe?: string | null;
  /** 로켓/존 구조 SL — ROE 한도 2배까지 허용 */
  preserveStructureSl?: boolean;
  /** 세판정 — 밴드 손절·반대밴드 익절 가격 유지 */
  lockStructurePrices?: boolean;
  /** 텔레그램 진입신호·근거 */
  signalKo?: string | null;
  evidenceKo?: string | null;
  noteKo?: string | null;
  fourStrategyId?: string | null;
  analysisTags?: string[] | null;
  entryScore?: number | null;
  /** 동일방향·하락 후 꼬리 재진입 추가매수 */
  allowDca?: boolean;
  /** 같은코인 반대방향 헷지 (헷지모드+강한신호) */
  allowHedge?: boolean;
};

export type LiveOrderResponse = {
  ok: boolean;
  paper?: boolean;
  orderId?: string;
  clientOid?: string;
  size?: string;
  marginUsdt?: number;
  equityUsdt?: number;
  equityPct?: number;
  sizeMode?: string;
  msg?: string;
  error?: string;
  outcome?: string;
  blockStep?: string;
  blockReason?: string;
  code?: string;
  httpStatus?: number;
  fillStatus?: string;
  positionOpen?: boolean;
  endpoint?: string;
  appPosMode?: string;
  bitgetPosMode?: string;
  telegramOk?: boolean;
  telegramErr?: string;
  telegramQueued?: boolean;
};

export async function postLiveOrder(body: LiveOrderRequest): Promise<LiveOrderResponse> {
  try {
    const res = await fetch('/api/merged-desk/live-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as LiveOrderResponse;
    if (!res.ok) {
      const err =
        json.error ||
        json.msg ||
        (json.blockReason
          ? `ORDER BLOCKED · STEP=${json.blockStep} · REASON=${json.blockReason}`
          : `HTTP ${res.status}`);
      return {
        ...json,
        ok: false,
        error: err,
        outcome: json.outcome || 'ORDER_BLOCKED_BEFORE_BITGET',
      };
    }
    return json;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' };
  }
}

export type ExchangeKeysStatus = {
  ok: boolean;
  configured: boolean;
  user?: string;
  meta?: {
    apiKeyMasked: string;
    lastTestOk: boolean | null;
    lastTestAt: number | null;
    lastTestMsg: string | null;
    availableUsdt?: number;
    equityUsdt?: number;
  };
  error?: string;
};

export async function fetchExchangeKeysStatus(): Promise<ExchangeKeysStatus> {
  try {
    const res = await fetch('/api/merged-desk/exchange-keys', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, configured: false, error: json.error || 'auth' };
    return {
      ok: true,
      configured: Boolean(json.configured),
      user: typeof json.user === 'string' ? json.user : undefined,
      meta: json.meta,
    };
  } catch (e) {
    return { ok: false, configured: false, error: e instanceof Error ? e.message : 'network' };
  }
}

/** 로그인 사용자 개인 API 기준 실포지션 */
export type LivePosition = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  marginMode: 'isolated' | 'crossed';
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

export type LivePositionResponse = {
  ok: boolean;
  configured: boolean;
  user?: string;
  apiKeyMasked?: string;
  position: LivePosition | null;
  positions?: LivePosition[];
  btcPosition?: LivePosition | null;
  ethPosition?: LivePosition | null;
  bnbPosition?: LivePosition | null;
  xrpPosition?: LivePosition | null;
  solPosition?: LivePosition | null;
  openCount?: number;
  availableUsdt?: number | null;
  equityUsdt?: number | null;
  msg?: string;
  error?: string;
};

export async function fetchLivePosition(symbol: string): Promise<LivePositionResponse> {
  try {
    const q = encodeURIComponent(symbol || 'BTCUSDT');
    const res = await fetch(`/api/merged-desk/position?symbol=${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({}))) as LivePositionResponse & {
      authFailed?: boolean;
    };
    /** HTTP 실패여도 서버가 configured를 주면 유지 — ETH 조회 실패로 API 끊김 표시 방지 */
    const configured =
      typeof json.configured === 'boolean' ? json.configured : res.ok ? Boolean(json.configured) : false;
    const base = {
      configured,
      user: json.user,
      apiKeyMasked: json.apiKeyMasked,
      position: json.position ?? null,
      positions: Array.isArray(json.positions) ? json.positions : [],
      btcPosition: json.btcPosition ?? null,
      ethPosition: json.ethPosition ?? null,
      bnbPosition: json.bnbPosition ?? null,
      xrpPosition: json.xrpPosition ?? null,
      solPosition: json.solPosition ?? null,
      openCount: typeof json.openCount === 'number' ? json.openCount : undefined,
      availableUsdt: json.availableUsdt ?? null,
      equityUsdt: json.equityUsdt ?? null,
      msg: json.msg,
    };
    if (!res.ok) {
      return {
        ok: false,
        ...base,
        error: json.error || json.msg || `HTTP ${res.status}`,
      };
    }
    return {
      ok: Boolean(json.ok),
      ...base,
      error: json.error,
    };
  } catch (e) {
    return {
      ok: false,
      configured: false,
      position: null,
      positions: [],
      error: e instanceof Error ? e.message : 'network',
    };
  }
}
