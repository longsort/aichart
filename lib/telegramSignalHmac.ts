import crypto from 'crypto';

const BUCKET_MS = 30_000;

export function telegramSignalHmacTimeBucket(t = Date.now()): number {
  return Math.floor(t / BUCKET_MS);
}

function hmacForBucket(user: string, secret: string, bucket: number): string {
  return crypto
    .createHmac('sha256', String(secret).trim())
    .update(`${user.trim()}|${bucket}`)
    .digest('hex');
}

/** 세션 `user` + 30초 time bucket — 서버 전용 시크릿 */
export function signTelegramSignal(user: string, secret: string, t = Date.now()): string {
  return hmacForBucket(user, secret, telegramSignalHmacTimeBucket(t));
}

export function verifyTelegramSignal(token: string, user: string, secret: string, t = Date.now()): boolean {
  if (!token || !user || !secret) return false;
  const s = String(secret).trim();
  const u = user.trim();
  const b0 = telegramSignalHmacTimeBucket(t);
  for (const d of [-1, 0, 1]) {
    const expected = hmacForBucket(u, s, b0 + d);
    if (safeEqHex(token, expected)) return true;
  }
  return false;
}

function safeEqHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return a === b;
  }
}
