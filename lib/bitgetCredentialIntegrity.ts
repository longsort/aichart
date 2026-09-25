/**
 * Bitget credential 저장·복호화 무결성 검증.
 * Secret/Passphrase 평문·전체 Key 로그 금지. HMAC 서명 로직 수정 금지.
 */
import crypto from 'crypto';

export type BitgetPlainCreds = {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  credentialId?: string;
  passphraseMode?: 'plain' | 'hmac';
};

export type CredFieldIssue = {
  field: 'apiKey' | 'apiSecret' | 'passphrase';
  issues: string[];
};

export type CredSanitizeReport = {
  ok: boolean;
  cleaned: BitgetPlainCreds;
  fieldIssues: CredFieldIssue[];
  apiKeyMasked: string;
  apiKeyLength: number;
  secretKeyLength: number;
  passphraseLength: number;
};

export type CredRoundtripReport = {
  ok: boolean;
  credentialId: string;
  apiKeyMasked: string;
  apiKeyLength: { original: number; decrypted: number; match: boolean };
  secretKeyLength: { original: number; decrypted: number; match: boolean };
  passphraseLength: { original: number; decrypted: number; match: boolean };
  /** SHA256 앞 8자만 — 전체 해시·평문 미노출 */
  apiKeyHashMatch: boolean;
  secretHashMatch: boolean;
  passphraseHashMatch: boolean;
  apiKeyHashPrefix: string;
  secretHashPrefix: string;
  passphraseHashPrefix: string;
  issuesKo: string[];
};

/** 앞4 + … + 뒤4 — Bitget 화면과 대조용 */
export function maskApiKeyEnds(apiKey: string): string {
  const s = String(apiKey || '');
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function hashPrefix(s: string): string {
  return sha256Hex(s).slice(0, 8);
}

/** 저장 전 오염 문자 탐지 (값 자체는 반환하지 않음) */
export function scanCredFieldDirty(raw: string, field: CredFieldIssue['field']): string[] {
  const issues: string[] = [];
  const s = String(raw ?? '');
  if (s !== s.trim()) issues.push('앞뒤공백');
  if (/\n/.test(s)) issues.push('줄바꿈(\\n)');
  if (/\r/.test(s)) issues.push('캐리지리턴(\\r)');
  if (/\t/.test(s)) issues.push('탭');
  if (/[\u200b-\u200d\ufeff]/.test(s)) issues.push('invisible(ZWSP/BOM)');
  if (/[\u00a0\u2028\u2029]/.test(s)) issues.push('특수공백');
  /** 제어문자 */
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)) issues.push('제어문자');
  return issues;
}

/**
 * 저장 직전 sanitize.
 * Key/Secret: 모든 공백·ZWSP 제거.
 * Passphrase: 앞뒤 trim + \\n\\r\\t·ZWSP 제거 (중간 일반 공백은 유지하지 않음 — 복사 오염 방지로 전부 제거).
 */
export function sanitizeBitgetCredsInput(input: {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  credentialId?: string;
  passphraseMode?: 'plain' | 'hmac';
}): CredSanitizeReport {
  const rawKey = String(input.apiKey ?? '');
  const rawSecret = String(input.apiSecret ?? '');
  const rawPass = String(input.passphrase ?? '');

  const fieldIssues: CredFieldIssue[] = [];
  const kIss = scanCredFieldDirty(rawKey, 'apiKey');
  const sIss = scanCredFieldDirty(rawSecret, 'apiSecret');
  const pIss = scanCredFieldDirty(rawPass, 'passphrase');
  if (kIss.length) fieldIssues.push({ field: 'apiKey', issues: kIss });
  if (sIss.length) fieldIssues.push({ field: 'apiSecret', issues: sIss });
  if (pIss.length) fieldIssues.push({ field: 'passphrase', issues: pIss });

  const stripAllWs = (s: string) =>
    s.replace(/[\s\u200b-\u200d\ufeff\u00a0\u2028\u2029]/g, '').replace(/[\x00-\x1f]/g, '');

  const cleaned: BitgetPlainCreds = {
    apiKey: stripAllWs(rawKey),
    apiSecret: stripAllWs(rawSecret),
    passphrase: stripAllWs(rawPass),
    credentialId: input.credentialId,
    passphraseMode: input.passphraseMode === 'hmac' ? 'hmac' : 'plain',
  };

  return {
    ok: Boolean(cleaned.apiKey && cleaned.apiSecret && cleaned.passphrase),
    cleaned,
    fieldIssues,
    apiKeyMasked: maskApiKeyEnds(cleaned.apiKey),
    apiKeyLength: cleaned.apiKey.length,
    secretKeyLength: cleaned.apiSecret.length,
    passphraseLength: cleaned.passphrase.length,
  };
}

export function newCredentialId(): string {
  return `cred_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 원본 vs 복호화 값 비교.
 * Secret/Passphrase 평문·전체 해시 미출력 — prefix 8자 + length + match만.
 */
export function compareCredRoundtrip(
  original: BitgetPlainCreds,
  decrypted: BitgetPlainCreds | null
): CredRoundtripReport {
  const credentialId = original.credentialId || decrypted?.credentialId || '';
  const issuesKo: string[] = [];

  if (!decrypted) {
    return {
      ok: false,
      credentialId,
      apiKeyMasked: maskApiKeyEnds(original.apiKey),
      apiKeyLength: { original: original.apiKey.length, decrypted: 0, match: false },
      secretKeyLength: { original: original.apiSecret.length, decrypted: 0, match: false },
      passphraseLength: { original: original.passphrase.length, decrypted: 0, match: false },
      apiKeyHashMatch: false,
      secretHashMatch: false,
      passphraseHashMatch: false,
      apiKeyHashPrefix: hashPrefix(original.apiKey),
      secretHashPrefix: hashPrefix(original.apiSecret),
      passphraseHashPrefix: hashPrefix(original.passphrase),
      issuesKo: ['복호화 실패 · AES/세션시크릿 확인'],
    };
  }

  if (original.credentialId && decrypted.credentialId && original.credentialId !== decrypted.credentialId) {
    issuesKo.push('credentialId 불일치 · 다른 키 세트 혼입 가능');
  }

  const apiKeyHashMatch = sha256Hex(original.apiKey) === sha256Hex(decrypted.apiKey);
  const secretHashMatch = sha256Hex(original.apiSecret) === sha256Hex(decrypted.apiSecret);
  const passphraseHashMatch = sha256Hex(original.passphrase) === sha256Hex(decrypted.passphrase);

  if (!apiKeyHashMatch) issuesKo.push('API Key 복호화 값 변경');
  if (!secretHashMatch) issuesKo.push('Secret 복호화 값 변경');
  if (!passphraseHashMatch) issuesKo.push('Passphrase 복호화 값 변경');
  if (original.apiKey.length !== decrypted.apiKey.length) issuesKo.push('API Key 길이 불일치');
  if (original.apiSecret.length !== decrypted.apiSecret.length) issuesKo.push('Secret 길이 불일치');
  if (original.passphrase.length !== decrypted.passphrase.length) issuesKo.push('Passphrase 길이 불일치');

  const ok = apiKeyHashMatch && secretHashMatch && passphraseHashMatch && issuesKo.length === 0;

  return {
    ok,
    credentialId: decrypted.credentialId || original.credentialId || credentialId,
    apiKeyMasked: maskApiKeyEnds(decrypted.apiKey),
    apiKeyLength: {
      original: original.apiKey.length,
      decrypted: decrypted.apiKey.length,
      match: original.apiKey.length === decrypted.apiKey.length,
    },
    secretKeyLength: {
      original: original.apiSecret.length,
      decrypted: decrypted.apiSecret.length,
      match: original.apiSecret.length === decrypted.apiSecret.length,
    },
    passphraseLength: {
      original: original.passphrase.length,
      decrypted: decrypted.passphrase.length,
      match: original.passphrase.length === decrypted.passphrase.length,
    },
    apiKeyHashMatch,
    secretHashMatch,
    passphraseHashMatch,
    apiKeyHashPrefix: hashPrefix(original.apiKey),
    secretHashPrefix: hashPrefix(original.apiSecret),
    passphraseHashPrefix: hashPrefix(original.passphrase),
    issuesKo,
  };
}

export function classifyBitgetHttpCode(code: string, msg: string): {
  classId: string;
  meaningKo: string;
} {
  const c = String(code || '');
  const m = String(msg || '').toLowerCase();
  if (c === '00000') return { classId: 'OK', meaningKo: '성공' };
  if (c === '40012') return { classId: 'CREDENTIAL_MISMATCH', meaningKo: 'API Key / Passphrase 불일치' };
  if (c === '40009') return { classId: 'SIGNATURE_ERROR', meaningKo: 'Signature(HMAC) 오류' };
  if (c === '40008' || c === '40005') return { classId: 'TIMESTAMP', meaningKo: 'Timestamp 만료/오류' };
  if (c === '40014' || c === '40003') return { classId: 'PERMISSION', meaningKo: '권한 오류' };
  if (c === '40018' || c === '40037' || m.includes('ip') || m.includes('whitelist')) {
    return { classId: 'IP_WHITELIST', meaningKo: 'IP whitelist' };
  }
  return { classId: 'OTHER', meaningKo: msg || c || '미분류' };
}
