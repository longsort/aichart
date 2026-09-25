/**
 * Bitget HMAC 인증 코어 — 공식 preHash + Base64 서명 + 서버시간 보정.
 * Secret/Passphrase/전체 Key/Sign 로그 금지.
 * 확정 수익 아님.
 */
import crypto from 'crypto';
import { BITGET_BASE } from '@/lib/exchangeConfig';

export type BitgetCreds = {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  /** 기본 plain (공식 SDK). hmac은 구버전 호환 시도용 */
  passphraseMode?: 'plain' | 'hmac';
};

export type BitgetAuthFailClass =
  | 'AUTH_INVALID_API_KEY'
  | 'AUTH_INVALID_PASSPHRASE'
  | 'AUTH_INVALID_SIGNATURE'
  | 'AUTH_TIMESTAMP_EXPIRED'
  | 'AUTH_IP_NOT_ALLOWED'
  | 'AUTH_PERMISSION_DENIED'
  | 'AUTH_UNKNOWN'
  | 'AUTH_OK';

export type BitgetProbeStepId =
  | 'SERVER_TIME'
  | 'HMAC_ACCOUNT'
  | 'POSITION'
  | 'OPEN_ORDERS'
  | 'OUTBOUND_IP';

export type BitgetProbeStep = {
  id: BitgetProbeStepId;
  ok: boolean;
  labelKo: string;
  detailKo: string;
  code?: string;
  failClass?: BitgetAuthFailClass;
  ms?: number;
};

/** 서버시간 오프셋(ms) — private 요청 timestamp에 가산 */
let clockOffsetMs = 0;
let lastServerTimeMs = 0;
let lastTimeDiffMs = 0;

export function getBitgetClockOffsetMs(): number {
  return clockOffsetMs;
}

export function getBitgetTimeDiag(): { serverTime: number; timeDiffMs: number; offsetMs: number } {
  return {
    serverTime: lastServerTimeMs,
    timeDiffMs: lastTimeDiffMs,
    offsetMs: clockOffsetMs,
  };
}

export function normalizeBitgetCreds(creds: BitgetCreds): BitgetCreds {
  const strip = (s: string) =>
    String(s || '')
      .replace(/[\s\u200b-\u200d\ufeff]/g, '')
      .trim();
  return {
    apiKey: strip(creds.apiKey),
    apiSecret: strip(creds.apiSecret),
    /** Passphrase: 앞뒤 공백·ZWSP만 제거 (중간 공백은 유지 — 사용자가 의도했을 수 있음) */
    passphrase: String(creds.passphrase || '')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .trim(),
    passphraseMode: creds.passphraseMode === 'hmac' ? 'hmac' : 'plain',
  };
}

/** Key/Secret 칸 바뀜·RSA 감지 (Secret 값 미노출) */
export function diagnoseBitgetCredShape(creds: BitgetCreds): {
  looksSwapped: boolean;
  looksRsa: boolean;
  keyLooksOk: boolean;
  hintsKo: string[];
} {
  const c = normalizeBitgetCreds(creds);
  const looksRsa =
    /BEGIN (RSA )?PRIVATE KEY|BEGIN PRIVATE KEY/i.test(c.apiSecret) || c.apiSecret.includes('-----');
  const secretLooksLikeKey = /^bg_/i.test(c.apiSecret) || (c.apiSecret.length < 20 && c.apiKey.length > 40);
  const keyLooksLikeSecret = c.apiKey.length > 60 && !/^bg_/i.test(c.apiKey) && /^[A-Za-z0-9+/=]+$/.test(c.apiKey);
  const looksSwapped = Boolean(
    (secretLooksLikeKey && /^bg_/i.test(c.apiKey) === false && c.apiSecret.startsWith('bg_')) ||
      (c.apiSecret.startsWith('bg_') && !c.apiKey.startsWith('bg_'))
  );
  const keyLooksOk = /^bg_/i.test(c.apiKey) || (c.apiKey.length >= 16 && c.apiKey.length <= 128);
  const hintsKo: string[] = [];
  if (looksSwapped) hintsKo.push('API Key와 Secret 칸이 바뀐 것으로 보입니다');
  if (looksRsa) hintsKo.push('RSA Private Key 감지 · HMAC(시스템발급) 키를 쓰세요');
  if (!keyLooksOk) hintsKo.push('API Key 형식이 비정상입니다 (bg_ 로 시작하는지 확인)');
  if (c.passphrase.length < 8) hintsKo.push('Passphrase가 너무 짧습니다 (보통 8자+)');
  if (c.apiSecret.length < 16) hintsKo.push('Secret 길이가 비정상적으로 짧습니다');
  return { looksSwapped, looksRsa, keyLooksOk, hintsKo };
}

function maskKey(k: string): string {
  const s = String(k || '');
  if (s.length <= 4) return '****';
  return `${s.slice(0, 4)}****`;
}

/** Secret/Passphrase/Sign 절대 출력 금지 */
export function bitgetAuthLog(safe: Record<string, string | number | boolean | null | undefined>): void {
  try {
    const line = Object.entries(safe)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .join(' · ');
    console.info(`[bitget-auth] ${line}`);
  } catch {
    /* ignore */
  }
}

export function classifyBitgetAuthFail(code: string, msg: string): BitgetAuthFailClass {
  const c = String(code || '');
  const m = String(msg || '').toLowerCase();
  if (!c && !m) return 'AUTH_UNKNOWN';
  if (m.includes('ip') || m.includes('whitelist') || c === '40014' || c === '40018' || c === '40037') {
    return 'AUTH_IP_NOT_ALLOWED';
  }
  if (m.includes('timestamp') || m.includes('expired') || c === '40008' || c === '40005') {
    return 'AUTH_TIMESTAMP_EXPIRED';
  }
  /** 40009 = sign error · 서명 문제 */
  if (c === '40009' || m.includes('signature') || (m.includes('sign') && !m.includes('password'))) {
    return 'AUTH_INVALID_SIGNATURE';
  }
  /** 40012 = apikey/password incorrect · 키 또는 패스프레이즈 (서명 통과 후 거절) */
  if (c === '40012' || m.includes('passphrase') || m.includes('password is incorrect')) {
    return 'AUTH_INVALID_PASSPHRASE';
  }
  if (m.includes('apikey') || m.includes('api key') || c === '40001' || c === '40002' || c === '40006') {
    return 'AUTH_INVALID_API_KEY';
  }
  if (m.includes('permission') || m.includes('권한') || c === '40003' || c === '40014') {
    return 'AUTH_PERMISSION_DENIED';
  }
  return 'AUTH_UNKNOWN';
}

export function failClassKo(fc: BitgetAuthFailClass): string {
  const m: Record<BitgetAuthFailClass, string> = {
    AUTH_OK: '정상',
    AUTH_INVALID_API_KEY: 'API Key 불일치·형식오류',
    AUTH_INVALID_PASSPHRASE: 'API Key 또는 Passphrase 불일치 (40012)',
    AUTH_INVALID_SIGNATURE: '서명(HMAC) 오류 (40009)',
    AUTH_TIMESTAMP_EXPIRED: '시간 동기화 필요',
    AUTH_IP_NOT_ALLOWED: 'IP 화이트리스트 차단',
    AUTH_PERMISSION_DENIED: '권한 부족',
    AUTH_UNKNOWN: '원인 미분류',
  };
  return m[fc] || fc;
}

function encryptPassphraseHeader(secret: string, passphrase: string): string {
  return crypto.createHmac('sha256', secret).update(passphrase, 'utf8').digest('base64');
}

function passphraseHeader(creds: BitgetCreds): string {
  const c = normalizeBitgetCreds(creds);
  if (c.passphraseMode === 'hmac') return encryptPassphraseHeader(c.apiSecret, c.passphrase);
  return c.passphrase;
}

/**
 * 공식 ACCESS-SIGN:
 * Base64(HMAC_SHA256(secret, timestamp + METHOD + requestPath + queryString + body))
 * queryString 은 있으면 "?a=b&c=d" 형태 (물음표 포함).
 */
export function buildBitgetSign(params: {
  secretKey: string;
  timestamp: string;
  method: string;
  requestPath: string;
  queryString?: string;
  body?: string;
}): string {
  const method = params.method.toUpperCase();
  const qs = params.queryString
    ? params.queryString.startsWith('?')
      ? params.queryString
      : `?${params.queryString}`
    : '';
  const body = params.body || '';
  const preHash = `${params.timestamp}${method}${params.requestPath}${qs}${body}`;
  return crypto.createHmac('sha256', params.secretKey).update(preHash, 'utf8').digest('base64');
}

export async function syncBitgetServerTime(): Promise<{
  ok: boolean;
  serverTime: number;
  localTime: number;
  timeDiffMs: number;
  msg: string;
}> {
  const localTime = Date.now();
  try {
    const res = await fetch(`${BITGET_BASE}/api/v2/public/time`, { cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as any;
    const serverTime = Number(json?.data?.serverTime ?? json?.requestTime ?? 0);
    if (!(serverTime > 0) || String(json?.code) !== '00000') {
      return {
        ok: false,
        serverTime: 0,
        localTime,
        timeDiffMs: 0,
        msg: String(json?.msg || 'server time 실패'),
      };
    }
    const timeDiffMs = serverTime - localTime;
    clockOffsetMs = timeDiffMs;
    lastServerTimeMs = serverTime;
    lastTimeDiffMs = timeDiffMs;
    bitgetAuthLog({
      step: 'SERVER_TIME',
      ok: true,
      serverTime,
      localTime,
      timeDiffMs,
      base: BITGET_BASE,
    });
    return {
      ok: true,
      serverTime,
      localTime,
      timeDiffMs,
      msg: `timeDiff ${timeDiffMs}ms`,
    };
  } catch (e) {
    return {
      ok: false,
      serverTime: 0,
      localTime,
      timeDiffMs: 0,
      msg: e instanceof Error ? e.message : 'network',
    };
  }
}

function nowTs(): string {
  return String(Date.now() + clockOffsetMs);
}

export type BitgetPrivateResult = {
  status: number;
  json: any;
  requestPath: string;
  method: string;
  timestamp: string;
};

/**
 * Private REST. body 는 서명·전송에 동일 문자열 사용.
 */
export async function bitgetSignedRequest(
  creds: BitgetCreds,
  method: 'GET' | 'POST',
  requestPath: string,
  opts?: { query?: string; bodyObj?: Record<string, unknown> | null }
): Promise<BitgetPrivateResult> {
  if (!lastServerTimeMs) {
    await syncBitgetServerTime();
  }
  const c = normalizeBitgetCreds(creds);
  const timestamp = nowTs();
  /** query 는 "?" 없이 통일 · 서명에는 "?qs" 형태로만 붙임 */
  const rawQ = String(opts?.query || '').trim();
  const query = rawQ.startsWith('?') ? rawQ.slice(1) : rawQ;
  const bodyStr =
    method === 'POST' && opts?.bodyObj != null ? JSON.stringify(opts.bodyObj) : '';
  const sign = buildBitgetSign({
    secretKey: c.apiSecret,
    timestamp,
    method,
    requestPath,
    queryString: query,
    body: bodyStr,
  });
  const url = `${BITGET_BASE}${requestPath}${query ? `?${query}` : ''}`;
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      'ACCESS-KEY': c.apiKey,
      'ACCESS-SIGN': sign,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': passphraseHeader(c),
      'Content-Type': 'application/json',
      locale: 'en-US',
    },
    ...(bodyStr ? { body: bodyStr } : {}),
  });
  const json = await res.json().catch(() => ({}));
  bitgetAuthLog({
    method,
    requestPath,
    query: query || '-',
    timestamp,
    http: res.status,
    code: String(json?.code || ''),
    msg: String(json?.msg || '').slice(0, 60),
    key: maskKey(c.apiKey),
    bodyLen: bodyStr.length,
    timeDiffMs: lastTimeDiffMs,
  });
  return { status: res.status, json, requestPath, method, timestamp };
}

export async function fetchOutboundPublicIp(): Promise<{ ok: boolean; ip: string; msg: string }> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    const j = (await res.json().catch(() => ({}))) as { ip?: string };
    const ip = String(j.ip || '').trim();
    if (!ip) return { ok: false, ip: '', msg: 'IP 조회 실패' };
    return { ok: true, ip, msg: ip };
  } catch (e) {
    return { ok: false, ip: '', msg: e instanceof Error ? e.message : 'IP network' };
  }
}

const PRODUCT = 'USDT-FUTURES';

/**
 * 연결 테스트 STEP1~4 (+ outbound IP).
 * 주문 전송 없음.
 */
export async function runBitgetConnectionProbe(creds: BitgetCreds): Promise<{
  ok: boolean;
  readyForPaper: boolean;
  readyHintKo: string;
  steps: BitgetProbeStep[];
  failClass: BitgetAuthFailClass;
  passphraseMode?: 'plain' | 'hmac';
  availableUsdt?: number;
  equityUsdt?: number;
  diag: {
    keyPrefix: string;
    keyLen: number;
    secretLen: number;
    passLen: number;
    timeDiffMs: number;
    outboundIp: string;
    shapeHints?: string[];
    looksSwapped?: boolean;
    looksRsa?: boolean;
    passphraseAttempts?: Array<{ mode: 'plain' | 'hmac'; code: string; msg: string }>;
  };
}> {
  const c = normalizeBitgetCreds(creds);
  const shape = diagnoseBitgetCredShape(c);
  const steps: BitgetProbeStep[] = [];
  const diag = {
    keyPrefix: c.apiKey.slice(0, 4) || '?',
    keyLen: c.apiKey.length,
    secretLen: c.apiSecret.length,
    passLen: c.passphrase.length,
    timeDiffMs: 0,
    outboundIp: '',
    shapeHints: shape.hintsKo,
    looksSwapped: shape.looksSwapped,
    looksRsa: shape.looksRsa,
  };

  if (!c.apiKey || !c.apiSecret || !c.passphrase) {
    return {
      ok: false,
      readyForPaper: false,
      readyHintKo: 'Key/Secret/Passphrase 입력 필요',
      steps,
      failClass: 'AUTH_INVALID_API_KEY',
      diag,
    };
  }

  if (shape.hintsKo.length) {
    bitgetAuthLog({
      step: 'CRED_SHAPE',
      hints: shape.hintsKo.join('|'),
      key: maskKey(c.apiKey),
    });
  }

  const t0 = Date.now();
  const time = await syncBitgetServerTime();
  diag.timeDiffMs = time.timeDiffMs;
  steps.push({
    id: 'SERVER_TIME',
    ok: time.ok,
    labelKo: 'Server Time',
    detailKo: time.ok
      ? `PASS · diff ${time.timeDiffMs}ms`
      : `FAIL · ${time.msg}`,
    ms: Date.now() - t0,
    failClass: time.ok ? 'AUTH_OK' : 'AUTH_TIMESTAMP_EXPIRED',
  });

  const ip0 = Date.now();
  const ip = await fetchOutboundPublicIp();
  diag.outboundIp = ip.ip;
  steps.push({
    id: 'OUTBOUND_IP',
    ok: ip.ok,
    labelKo: 'Outbound IP',
    detailKo: ip.ok
      ? `PASS · ${ip.ip} (Bitget whitelist에 이 공인IP 등록)`
      : `FAIL · ${ip.msg}`,
    ms: Date.now() - ip0,
  });

  let passphraseMode: 'plain' | 'hmac' | undefined;
  let availableUsdt: number | undefined;
  let equityUsdt: number | undefined;
  let failClass: BitgetAuthFailClass = 'AUTH_UNKNOWN';
  let accountOk = false;
  const passphraseAttempts: Array<{ mode: 'plain' | 'hmac'; code: string; msg: string }> = [];

  const modes: Array<'plain' | 'hmac'> = ['plain', 'hmac'];
  for (const mode of modes) {
    const trial = { ...c, passphraseMode: mode };
    const a0 = Date.now();
    const acc = await bitgetSignedRequest(trial, 'GET', '/api/v2/mix/account/accounts', {
      query: `productType=${PRODUCT}`,
    });
    const code = String(acc.json?.code || '');
    const msg = String(acc.json?.msg || '');
    passphraseAttempts.push({ mode, code, msg: msg.slice(0, 80) });
    if (code === '00000') {
      accountOk = true;
      passphraseMode = mode;
      failClass = 'AUTH_OK';
      const list = Array.isArray(acc.json?.data) ? acc.json.data : [];
      const usdt =
        list.find((x: any) => String(x?.marginCoin || '').toUpperCase() === 'USDT') || list[0];
      if (usdt) {
        equityUsdt = Number(usdt.accountEquity ?? usdt.usdtEquity ?? usdt.equity ?? 0) || undefined;
        availableUsdt = Number(usdt.available ?? usdt.crossedMaxAvailable ?? equityUsdt) || undefined;
      }
      steps.push({
        id: 'HMAC_ACCOUNT',
        ok: true,
        labelKo: 'HMAC · Account',
        detailKo: `PASS · passphrase=${mode} · equity≈${equityUsdt ?? '?'}U`,
        code,
        ms: Date.now() - a0,
        failClass: 'AUTH_OK',
      });
      break;
    }
    failClass = classifyBitgetAuthFail(code, msg);
  }

  if (!accountOk) {
    const plainA = passphraseAttempts.find((a) => a.mode === 'plain');
    const hmacA = passphraseAttempts.find((a) => a.mode === 'hmac');
    steps.push({
      id: 'HMAC_ACCOUNT',
      ok: false,
      labelKo: 'HMAC · Account',
      detailKo: `FAIL · ${failClassKo(failClass)} · plain=${plainA?.code || '?'} hmac=${hmacA?.code || '?'} · ${
        plainA?.msg || hmacA?.msg || ''
      }`,
      code: plainA?.code || hmacA?.code,
      failClass,
    });
  }

  /** 진단용 — Secret/Passphrase 미포함 */
  (diag as { passphraseAttempts?: typeof passphraseAttempts }).passphraseAttempts = passphraseAttempts;

  if (accountOk && passphraseMode) {
    const p0 = Date.now();
    const pos = await bitgetSignedRequest(
      { ...c, passphraseMode },
      'GET',
      '/api/v2/mix/position/all-position',
      { query: `productType=${PRODUCT}&marginCoin=USDT` }
    );
    const pOk = String(pos.json?.code) === '00000';
    steps.push({
      id: 'POSITION',
      ok: pOk,
      labelKo: 'Position',
      detailKo: pOk
        ? `PASS · rows ${Array.isArray(pos.json?.data) ? pos.json.data.length : 0}`
        : `FAIL · ${pos.json?.msg || pos.json?.code}`,
      code: String(pos.json?.code || ''),
      ms: Date.now() - p0,
    });

    const o0 = Date.now();
    const orders = await bitgetSignedRequest(
      { ...c, passphraseMode },
      'GET',
      '/api/v2/mix/order/orders-pending',
      { query: `productType=${PRODUCT}` }
    );
    const oOk = String(orders.json?.code) === '00000';
    steps.push({
      id: 'OPEN_ORDERS',
      ok: oOk,
      labelKo: 'Open Orders',
      detailKo: oOk ? 'PASS' : `FAIL · ${orders.json?.msg || orders.json?.code}`,
      code: String(orders.json?.code || ''),
      ms: Date.now() - o0,
    });
  }

  const coreOk = steps.some((s) => s.id === 'SERVER_TIME' && s.ok) && accountOk;
  const readOk =
    coreOk &&
    steps.some((s) => s.id === 'POSITION' && s.ok) &&
    steps.some((s) => s.id === 'OPEN_ORDERS' && s.ok);

  let readyHintKo = readOk
    ? 'READY FOR PAPER · 실전은 실전매매 ARM 후'
    : coreOk
      ? 'AUTH PASS · Position/Orders 일부 실패 · 권한·IP 확인'
      : `AUTH FAIL · ${failClassKo(failClass)}`;
  if (!coreOk && shape.hintsKo.length) {
    readyHintKo += ` · ${shape.hintsKo[0]}`;
  }
  if (!coreOk && failClass === 'AUTH_INVALID_PASSPHRASE') {
    readyHintKo +=
      ' · Bitget에서 Key 만들 때 설정한 Passphrase를 그대로 · 로그인비번 아님 · 잊었으면 키 재발급';
  }

  return {
    ok: coreOk,
    readyForPaper: readOk,
    readyHintKo,
    steps,
    failClass,
    passphraseMode,
    availableUsdt,
    equityUsdt,
    diag,
  };
}
