/**
 * 로그인 OTP 챌린지 저장소 — 메모리 + data/login-otp-store.json
 * (PM2 fork 단일 프로세스 기준)
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type LoginOtpChallenge = {
  id: string;
  user: string;
  role: string;
  ip: string;
  codeHash: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
};

const OTP_TTL_MS = 10 * 60 * 1000; // 10분
const MAX_ATTEMPTS = 5;
const STORE_FILE = path.join(process.cwd(), 'data', 'login-otp-store.json');

type StoreFile = {
  challenges: LoginOtpChallenge[];
  /** IP → send timestamps (rate limit) */
  sendLog: Record<string, number[]>;
};

const mem: StoreFile = { challenges: [], sendLog: {} };
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as StoreFile;
      mem.challenges = Array.isArray(raw.challenges) ? raw.challenges : [];
      mem.sendLog = raw.sendLog && typeof raw.sendLog === 'object' ? raw.sendLog : {};
    }
  } catch {
    /* fresh */
  }
  prune();
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(mem, null, 0), { mode: 0o600 });
  } catch {
    /* ignore disk errors — memory still works */
  }
}

function prune() {
  const now = Date.now();
  mem.challenges = mem.challenges.filter((c) => c.expiresAt > now);
  for (const [ip, times] of Object.entries(mem.sendLog)) {
    const kept = times.filter((t) => now - t < 15 * 60 * 1000);
    if (kept.length) mem.sendLog[ip] = kept;
    else delete mem.sendLog[ip];
  }
}

export function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(`otp:${code}`).digest('hex');
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

/** 15분에 IP당 최대 5회 발송 */
export function canSendOtp(ip: string): { ok: true } | { ok: false; error: string } {
  ensureLoaded();
  prune();
  const times = mem.sendLog[ip] || [];
  if (times.length >= 5) {
    return { ok: false, error: 'OTP 요청이 너무 많습니다. 잠시 후 다시 시도하세요.' };
  }
  return { ok: true };
}

export function recordOtpSend(ip: string) {
  ensureLoaded();
  const times = mem.sendLog[ip] || [];
  times.push(Date.now());
  mem.sendLog[ip] = times;
  persist();
}

export function createOtpChallenge(input: {
  user: string;
  role: string;
  ip: string;
  code: string;
}): LoginOtpChallenge {
  ensureLoaded();
  prune();
  const now = Date.now();
  const challenge: LoginOtpChallenge = {
    id: crypto.randomBytes(16).toString('hex'),
    user: input.user,
    role: input.role,
    ip: input.ip,
    codeHash: hashOtpCode(input.code),
    createdAt: now,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
  };
  mem.challenges.push(challenge);
  persist();
  return challenge;
}

export function verifyOtpChallenge(
  id: string,
  code: string,
  ip: string,
):
  | { ok: true; user: string; role: string }
  | { ok: false; error: string } {
  ensureLoaded();
  prune();
  const c = mem.challenges.find((x) => x.id === id);
  if (!c) return { ok: false, error: '인증 세션이 만료되었거나 없습니다. 다시 로그인하세요.' };
  if (Date.now() >= c.expiresAt) {
    mem.challenges = mem.challenges.filter((x) => x.id !== id);
    persist();
    return { ok: false, error: 'OTP가 만료되었습니다. 다시 로그인하세요.' };
  }
  if (c.ip !== ip) {
    return { ok: false, error: '접속 IP가 변경되었습니다. 다시 로그인하세요.' };
  }
  if (c.attempts >= MAX_ATTEMPTS) {
    mem.challenges = mem.challenges.filter((x) => x.id !== id);
    persist();
    return { ok: false, error: 'OTP 시도 횟수를 초과했습니다. 다시 로그인하세요.' };
  }
  c.attempts += 1;
  let ok = false;
  try {
    const a = Buffer.from(c.codeHash, 'hex');
    const b = Buffer.from(hashOtpCode(String(code || '').trim()), 'hex');
    ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    ok = false;
  }
  if (!ok) {
    persist();
    return { ok: false, error: '인증 코드가 올바르지 않습니다.' };
  }
  mem.challenges = mem.challenges.filter((x) => x.id !== id);
  persist();
  return { ok: true, user: c.user, role: c.role };
}

export function otpTtlMinutes(): number {
  return Math.round(OTP_TTL_MS / 60000);
}

/** 관리자 SSH용 — 평문 코드 1회 기록 (메일 미설정/백업) */
export function writeAdminOtpFallback(info: {
  user: string;
  ip: string;
  code: string;
  challengeId: string;
}) {
  try {
    const file = path.join(process.cwd(), 'data', 'login-otp-admin.txt');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const line = [
      new Date().toISOString(),
      `user=${info.user}`,
      `ip=${info.ip}`,
      `code=${info.code}`,
      `challenge=${info.challengeId}`,
      `expires_min=${otpTtlMinutes()}`,
    ].join(' | ');
    fs.writeFileSync(file, `${line}\n`, { mode: 0o600 });
  } catch {
    /* ignore */
  }
}
