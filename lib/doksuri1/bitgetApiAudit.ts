/**
 * [BITGET API AUDIT] — 독수리1호 통합모드 Private API
 * 차트/Zone/SFP 등 분석 기능은 수정하지 않음. 인증·주문 연결만.
 */
export const BITGET_API_AUDIT = {
  relatedFiles: {
    privateTrade: 'lib/bitgetPrivateTrade.ts',
    keyStore: 'lib/serverExchangeKeysStore.ts',
    exchangeBase: 'lib/exchangeConfig.ts (BITGET_API_BASE)',
    routes: [
      'app/api/merged-desk/exchange-keys/route.ts',
      'app/api/merged-desk/live-order/route.ts',
      'app/api/merged-desk/position/route.ts',
    ],
    client: [
      'lib/mergedDeskLiveOrderClient.ts',
      'lib/mergedDeskAutoTradeRunner.ts',
      'app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx',
    ],
    publicMarketOnly: [
      'lib/bitgetFuturesMarket.ts',
      'lib/data/collectors/bitget*',
    ],
  },
  authMethod: 'HMAC-SHA256 → Base64 (ACCESS-SIGN)',
  signature: 'timestamp + METHOD + requestPath + (?query) + body',
  apiVersion: 'v2 mix Classic Futures (/api/v2/mix/...)',
  endpoints: {
    serverTime: 'GET /api/v2/public/time',
    account: 'GET /api/v2/mix/account/accounts?productType=USDT-FUTURES',
    position: 'GET /api/v2/mix/position/all-position',
    placeOrder: 'POST /api/v2/mix/order/place-order',
    tpsl: 'POST /api/v2/mix/order/place-tpsl-order',
  },
  env: {
    BITGET_API_BASE: 'optional · default https://api.bitget.com',
    keys: 'per-user AES store data/exchange-keys/*.bitget.json (not .env plaintext)',
  },
  ip: 'Outbound public IPv4 via ipify · Bitget whitelist must match',
  localServer: 'RUN_MODE + LIVE_INSTANCE_LOCK (lib/bitgetLiveInstanceLock.ts)',
  failureLikely: [
    'Passphrase mismatch (most common)',
    'Key/Secret swapped in UI fields',
    'Clock skew — fixed via syncBitgetServerTime in bitgetAuth',
    'IP whitelist not set yet (register outbound public IP)',
    'RSA key instead of HMAC',
  ],
  newFiles: [
    'lib/bitgetAuth.ts',
    'lib/doksuri1/bitgetApiAudit.ts',
    'lib/bitgetLiveInstanceLock.ts',
    'app/api/merged-desk/bitget-probe/route.ts',
  ],
  modify: [
    'lib/bitgetPrivateTrade.ts (use bitgetAuth signer + clock)',
    'app/api/merged-desk/exchange-keys/route.ts',
    'app/api/merged-desk/live-order/route.ts (lock + light account)',
    'MergedDeskAutoTradePanel.tsx (probe UI)',
  ],
  testOrder: [
    '1 Public server time',
    '2 Private account',
    '3 Position',
    '4 Open orders (optional)',
    '5 Small test order (manual later)',
  ],
  doNotTouch: ['chart', 'zone', 'SFP', 'BOS', 'CHOCH', 'whale DNA UI'],
} as const;
