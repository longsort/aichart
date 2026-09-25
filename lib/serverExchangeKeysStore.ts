/**
 * 사용자별 Bitget API 키 — AES-256-GCM 암호화 저장.
 * 평문 secret은 디스크에 쓰지 않음. 응답에는 마스킹만.
 * credentialId 로 Key+Secret+Passphrase 한 세트 묶음.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAppSessionSecret } from '@/lib/appSiteAuth';
import {
  compareCredRoundtrip,
  maskApiKeyEnds,
  newCredentialId,
  sanitizeBitgetCredsInput,
  type BitgetPlainCreds,
  type CredRoundtripReport,
  type CredSanitizeReport,
} from '@/lib/bitgetCredentialIntegrity';

export type StoredExchangeKeysMeta = {
  exchange: 'bitget';
  apiKeyMasked: string;
  credentialId: string | null;
  hasSecret: boolean;
  hasPassphrase: boolean;
  updatedAt: number;
  lastTestOk: boolean | null;
  lastTestAt: number | null;
  lastTestMsg: string | null;
};

type EncBlob = {
  v: 1 | 2;
  exchange: 'bitget';
  credentialId: string;
  iv: string;
  tag: string;
  data: string;
  apiKeyMasked: string;
  updatedAt: number;
  lastTestOk: boolean | null;
  lastTestAt: number | null;
  lastTestMsg: string | null;
};

export type PlainKeys = BitgetPlainCreds;

function dir(): string {
  return path.join(process.cwd(), 'data', 'exchange-keys');
}

function fileFor(user: string): string {
  const safe = String(user || 'anon').replace(/[^\w.-]/g, '_');
  return path.join(dir(), `${safe}.bitget.json`);
}

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(`exk:${getAppSessionSecret()}`).digest();
}

function encrypt(plain: PlainKeys): { iv: string; tag: string; data: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  };
}

function decrypt(blob: EncBlob): PlainKeys | null {
  try {
    const iv = Buffer.from(blob.iv, 'base64');
    const tag = Buffer.from(blob.tag, 'base64');
    const data = Buffer.from(blob.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    const raw = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    const j = JSON.parse(raw) as PlainKeys;
    if (!j.apiKey || !j.apiSecret || !j.passphrase) return null;
    /** blob.credentialId 와 평문 묶음 일치 강제 */
    if (blob.credentialId && j.credentialId && blob.credentialId !== j.credentialId) {
      return null;
    }
    if (!j.credentialId && blob.credentialId) {
      j.credentialId = blob.credentialId;
    }
    return j;
  } catch {
    return null;
  }
}

export function readExchangeKeysMeta(user: string): StoredExchangeKeysMeta | null {
  try {
    const raw = fs.readFileSync(fileFor(user), 'utf8');
    const blob = JSON.parse(raw) as EncBlob;
    if (!blob?.data) return null;
    return {
      exchange: 'bitget',
      apiKeyMasked: blob.apiKeyMasked || '****',
      credentialId: blob.credentialId || null,
      hasSecret: true,
      hasPassphrase: true,
      updatedAt: blob.updatedAt || 0,
      lastTestOk: blob.lastTestOk ?? null,
      lastTestAt: blob.lastTestAt ?? null,
      lastTestMsg: blob.lastTestMsg ?? null,
    };
  } catch {
    return null;
  }
}

export function readExchangeKeysPlain(user: string): PlainKeys | null {
  try {
    const raw = fs.readFileSync(fileFor(user), 'utf8');
    const blob = JSON.parse(raw) as EncBlob;
    return decrypt(blob);
  } catch {
    return null;
  }
}

/**
 * 저장 + 즉시 복호화 라운드트립 검증.
 * HMAC 호출 전에 반드시 이 결과 ok 확인.
 */
export function writeExchangeKeysWithIntegrity(
  user: string,
  input: { apiKey: string; apiSecret: string; passphrase: string; passphraseMode?: 'plain' | 'hmac' },
  test?: { ok: boolean; msg: string }
): {
  meta: StoredExchangeKeysMeta;
  sanitize: CredSanitizeReport;
  roundtrip: CredRoundtripReport;
  decrypted: PlainKeys | null;
} {
  const sanitize = sanitizeBitgetCredsInput(input);
  const credentialId = newCredentialId();
  const toStore: PlainKeys = {
    ...sanitize.cleaned,
    credentialId,
  };

  fs.mkdirSync(dir(), { recursive: true });
  const enc = encrypt(toStore);
  const blob: EncBlob = {
    v: 2,
    exchange: 'bitget',
    credentialId,
    ...enc,
    apiKeyMasked: maskApiKeyEnds(toStore.apiKey),
    updatedAt: Date.now(),
    lastTestOk: test?.ok ?? null,
    lastTestAt: test ? Date.now() : null,
    lastTestMsg: test?.msg ?? null,
  };
  fs.writeFileSync(fileFor(user), JSON.stringify(blob), 'utf8');

  const decrypted = readExchangeKeysPlain(user);
  const roundtrip = compareCredRoundtrip(toStore, decrypted);

  return {
    meta: {
      exchange: 'bitget',
      apiKeyMasked: blob.apiKeyMasked,
      credentialId,
      hasSecret: true,
      hasPassphrase: true,
      updatedAt: blob.updatedAt,
      lastTestOk: blob.lastTestOk,
      lastTestAt: blob.lastTestAt,
      lastTestMsg: blob.lastTestMsg,
    },
    sanitize,
    roundtrip,
    decrypted,
  };
}

/** 기존 호환 — integrity 없이 덮어쓰기 (passphraseMode 갱신 등) */
export function writeExchangeKeys(
  user: string,
  keys: PlainKeys,
  test?: { ok: boolean; msg: string }
): StoredExchangeKeysMeta {
  const sanitize = sanitizeBitgetCredsInput(keys);
  const credentialId = keys.credentialId || newCredentialId();
  const toStore: PlainKeys = { ...sanitize.cleaned, credentialId };
  fs.mkdirSync(dir(), { recursive: true });
  const enc = encrypt(toStore);
  const prev = readExchangeKeysMeta(user);
  const blob: EncBlob = {
    v: 2,
    exchange: 'bitget',
    credentialId,
    ...enc,
    apiKeyMasked: maskApiKeyEnds(toStore.apiKey),
    updatedAt: Date.now(),
    lastTestOk: test?.ok ?? prev?.lastTestOk ?? null,
    lastTestAt: test ? Date.now() : prev?.lastTestAt ?? null,
    lastTestMsg: test?.msg ?? prev?.lastTestMsg ?? null,
  };
  fs.writeFileSync(fileFor(user), JSON.stringify(blob), 'utf8');
  return {
    exchange: 'bitget',
    apiKeyMasked: blob.apiKeyMasked,
    credentialId,
    hasSecret: true,
    hasPassphrase: true,
    updatedAt: blob.updatedAt,
    lastTestOk: blob.lastTestOk,
    lastTestAt: blob.lastTestAt,
    lastTestMsg: blob.lastTestMsg,
  };
}

export function updateExchangeKeysTest(
  user: string,
  test: { ok: boolean; msg: string }
): StoredExchangeKeysMeta | null {
  try {
    const p = fileFor(user);
    const raw = fs.readFileSync(p, 'utf8');
    const blob = JSON.parse(raw) as EncBlob;
    blob.lastTestOk = test.ok;
    blob.lastTestAt = Date.now();
    blob.lastTestMsg = test.msg;
    fs.writeFileSync(p, JSON.stringify(blob), 'utf8');
    return readExchangeKeysMeta(user);
  } catch {
    return null;
  }
}

export function deleteExchangeKeys(user: string): boolean {
  try {
    fs.unlinkSync(fileFor(user));
    return true;
  } catch {
    return false;
  }
}

/** 저장된 키 자체 라운드트립(재암호화 없이 읽기만) — 메타용 */
export function verifyStoredCredIntegrity(user: string): CredRoundtripReport | null {
  const plain = readExchangeKeysPlain(user);
  if (!plain) return null;
  return compareCredRoundtrip(plain, plain);
}
