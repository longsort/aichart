/**
 * 사이트 사용자 저장소 (data/site-users.json).
 * 비밀번호는 bcrypt 해시만 저장. 옛 SHA-256 해시는 로그인 성공 시 bcrypt 로 승격.
 *
 * 허용 계정만: u1, aichart1, aichart2, aichart3. 회원가입 비활성.
 */
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

/** appSiteAuth 와 동일 규칙 — 순환 import 방지용 로컬 복사 */
export type AppRole = 'master_admin' | 'charts' | 'inventory' | 'both' | 'user';

/** 로그인·시드 허용 계정 (이 외 전부/가입 거부). 오타 aicahrt3 → aichart3 로 교정 */
export const ALLOWED_SITE_USERS = ['u1', 'aichart1', 'aichart2', 'aichart3'] as const;
export type AllowedSiteUser = (typeof ALLOWED_SITE_USERS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_SITE_USERS.map((u) => u.toLowerCase()));

/** 알려진 오타 아이디 → 정식 아이디 */
const USER_TYPO_ALIASES: Record<string, AllowedSiteUser> = {
  aicahrt3: 'aichart3',
};

export function isAllowedSiteUser(user: string | undefined | null): boolean {
  const u = String(user || '')
    .trim()
    .toLowerCase();
  if (!u) return false;
  const fixed = USER_TYPO_ALIASES[u] || u;
  return ALLOWED_SET.has(fixed);
}

function normalizeAppRole(role: string | undefined | null): Exclude<AppRole, 'user'> {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'master_admin') return 'master_admin';
  if (r === 'inventory') return 'inventory';
  if (r === 'both') return 'both';
  if (r === 'charts' || r === 'user') return 'charts';
  return 'charts';
}

export type UserRecord = {
  user: string;
  passwordHash: string;
  role: AppRole;
  createdAt: number;
  /** bcrypt | sha256 — 없으면 해시 형태로 추정 */
  hashAlgo?: 'bcrypt' | 'sha256';
};

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'site-users.json');
const BCRYPT_ROUNDS = 10;

function sha256Hex(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function looksLikeBcrypt(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash);
}

async function hashPasswordBcrypt(raw: string): Promise<string> {
  return bcrypt.hash(raw, BCRYPT_ROUNDS);
}

async function verifyPassword(raw: string, record: UserRecord): Promise<boolean> {
  const hash = record.passwordHash || '';
  if (record.hashAlgo === 'bcrypt' || looksLikeBcrypt(hash)) {
    return bcrypt.compare(raw, hash);
  }
  // 레거시 SHA-256
  return hash === sha256Hex(raw);
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function writeUsers(users: UserRecord[]) {
  await ensureDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

/** 시드·누락 계정 보장 (bcrypt). 허용 4계정만 유지. */
export async function ensureSeedUsers(users: UserRecord[]): Promise<UserRecord[]> {
  let next = [...users];
  let changed = false;
  const now = Date.now();

  // 오타 aicahrt3 → aichart3 (비밀번호·역할 유지, 정식 아이디로 합침)
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const raw = next[i].user.toLowerCase();
    const fixed = USER_TYPO_ALIASES[raw];
    if (!fixed) continue;
    const existingIdx = next.findIndex((u) => u.user.toLowerCase() === fixed);
    if (existingIdx >= 0 && existingIdx !== i) {
      next.splice(i, 1);
    } else {
      next[i] = { ...next[i], user: fixed };
    }
    changed = true;
  }

  const ensure = async (user: AllowedSiteUser, password: string, role: AppRole) => {
    const idx = next.findIndex((u) => u.user.toLowerCase() === user);
    if (idx < 0) {
      next.push({
        user,
        passwordHash: await hashPasswordBcrypt(password),
        role: normalizeAppRole(role),
        createdAt: now,
        hashAlgo: 'bcrypt',
      });
      changed = true;
      return;
    }
    const row = next[idx];
    const normalized = normalizeAppRole(row.role);
    if (user === 'u1') {
      if (normalized !== 'inventory' && normalized !== 'both') {
        next[idx] = { ...next[idx], role: 'inventory' };
        changed = true;
      }
    } else if (row.role !== normalized) {
      next[idx] = { ...row, role: normalized };
      changed = true;
    }
    if (!row.passwordHash) {
      next[idx] = {
        ...next[idx],
        passwordHash: await hashPasswordBcrypt(password),
        hashAlgo: 'bcrypt',
      };
      changed = true;
    }
  };

  await ensure('u1', 'u1', 'inventory');
  await ensure('aichart1', 'longshort1', 'master_admin');
  await ensure('aichart2', 'longshort2', 'charts');
  await ensure('aichart3', 'longshort3', 'charts');

  const pruned = next.filter((u) => ALLOWED_SET.has(u.user.toLowerCase()));
  if (pruned.length !== next.length) {
    next = pruned;
    changed = true;
  }

  if (changed) await writeUsers(next);
  return next;
}

export async function readUsers(): Promise<UserRecord[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as UserRecord[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return ensureSeedUsers(parsed);
    }
  } catch {}
  const seeded = await ensureSeedUsers([]);
  return seeded;
}

export async function verifyUser(userInput: string, passwordInput: string): Promise<UserRecord | null> {
  const raw = userInput.trim().toLowerCase();
  const user = USER_TYPO_ALIASES[raw] || raw;
  const password = passwordInput.trim();
  if (!user || !password) return null;
  if (!isAllowedSiteUser(user)) return null;
  const users = await readUsers();
  const foundIdx = users.findIndex((u) => u.user.toLowerCase() === user);
  if (foundIdx < 0) return null;
  const found = users[foundIdx];
  const ok = await verifyPassword(password, found);
  if (!ok) return null;

  // SHA-256 → bcrypt 승격 (다음부터는 bcrypt만 비교)
  if (!looksLikeBcrypt(found.passwordHash) || found.hashAlgo === 'sha256') {
    const upgraded: UserRecord = {
      ...found,
      passwordHash: await hashPasswordBcrypt(password),
      hashAlgo: 'bcrypt',
      role: normalizeAppRole(found.role),
    };
    users[foundIdx] = upgraded;
    await writeUsers(users);
    return upgraded;
  }

  return { ...found, role: normalizeAppRole(found.role) };
}

export type CreateUserOptions = {
  /** 기본 inventory (자가 가입). 관리자만 charts/both/master_admin 지정 */
  role?: AppRole;
};

/**
 * 관리자 계정 생성(허용 목록만). 공개 회원가입은 비활성 — /api/auth/signup 사용 금지.
 * 비밀번호는 bcrypt 해시만 저장. 평문 저장 금지.
 */
export async function createUser(
  userInput: string,
  passwordInput: string,
  role: AppRole = 'inventory'
): Promise<{ ok: true; role: AppRole } | { ok: false; error: string }> {
  const raw = userInput.trim().toLowerCase();
  const user = USER_TYPO_ALIASES[raw] || raw;
  const password = passwordInput.trim();
  if (!isAllowedSiteUser(user)) {
    return { ok: false, error: '허용되지 않은 계정입니다. 가입이 막혀 있습니다.' };
  }
  if (!/^[a-z0-9._-]{2,32}$/.test(user)) {
    return { ok: false, error: '아이디는 2~32자, 영문·숫자·._- 만 가능합니다.' };
  }
  if (password.length < 2 || password.length > 64) {
    return { ok: false, error: '비밀번호는 2~64자로 입력하세요.' };
  }
  const users = await readUsers();
  if (users.some((u) => u.user.toLowerCase() === user)) {
    return { ok: false, error: '이미 존재하는 아이디입니다.' };
  }
  const normalized = normalizeAppRole(role);
  users.push({
    user,
    passwordHash: await hashPasswordBcrypt(password),
    role: normalized,
    createdAt: Date.now(),
    hashAlgo: 'bcrypt',
  });
  await writeUsers(users);
  return { ok: true, role: normalized };
}
