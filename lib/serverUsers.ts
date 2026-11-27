/**
 * 사이트 사용자 저장소 (data/site-users.json).
 * 비밀번호는 bcrypt 해시만 저장. 옛 SHA-256 해시는 로그인 성공 시 bcrypt 로 승격.
 *
 * 개발 시드: u1 / u1 (role=inventory) — 실서버에서는 반드시 비밀번호 변경.
 */
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

/** appSiteAuth 와 동일 규칙 — 순환 import 방지용 로컬 복사 */
export type AppRole = 'master_admin' | 'charts' | 'inventory' | 'both' | 'user';

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

/** 시드·누락 계정 보장 (bcrypt). u1/u1 은 로컬·개발용 — 실서버에서 변경하세요. */
export async function ensureSeedUsers(users: UserRecord[]): Promise<UserRecord[]> {
  let next = [...users];
  let changed = false;
  const now = Date.now();

  const ensure = async (user: string, password: string, role: AppRole) => {
    const idx = next.findIndex((u) => u.user.toLowerCase() === user.toLowerCase());
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
    // 역할만 비어 있거나 옛 user 인 경우 정규화; u1 은 inventory 유지
    const normalized = normalizeAppRole(row.role);
    if (row.role !== normalized && user !== 'u1') {
      next[idx] = { ...row, role: normalized };
      changed = true;
    }
    if (user === 'u1' && normalizeAppRole(row.role) !== 'inventory' && normalizeAppRole(row.role) !== 'both') {
      next[idx] = { ...next[idx], role: 'inventory' };
      changed = true;
    }
    // 빈 해시(플레이스홀더)면 bcrypt 로 채움
    if (!row.passwordHash) {
      next[idx] = {
        ...next[idx],
        passwordHash: await hashPasswordBcrypt(password),
        hashAlgo: 'bcrypt',
      };
      changed = true;
    }
  };

  await ensure('masteradmin', 'longshortmaster', 'master_admin');
  await ensure('u1', 'u1', 'inventory');

  for (let i = 1; i <= 10; i += 1) {
    const user = `aichart${i}`;
    const pass = `longshort${i}`;
    const role: AppRole = i === 1 ? 'master_admin' : 'charts';
    const idx = next.findIndex((u) => u.user.toLowerCase() === user);
    if (idx < 0) {
      next.push({
        user,
        passwordHash: await hashPasswordBcrypt(pass),
        role,
        createdAt: now,
        hashAlgo: 'bcrypt',
      });
      changed = true;
    } else if (next[idx].role === 'user') {
      next[idx] = { ...next[idx], role };
      changed = true;
    }
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
  const user = userInput.trim().toLowerCase();
  const password = passwordInput.trim();
  if (!user || !password) return null;
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
 * 회원가입·관리자 계정 생성.
 * 비밀번호는 bcrypt 해시만 저장. 평문 저장 금지.
 */
export async function createUser(
  userInput: string,
  passwordInput: string,
  role: AppRole = 'inventory'
): Promise<{ ok: true; role: AppRole } | { ok: false; error: string }> {
  const user = userInput.trim().toLowerCase();
  const password = passwordInput.trim();
  // u1 같은 짧은 개발 계정·자가가입 허용 (2~32). 실서버에서는 강한 비번 권장.
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
