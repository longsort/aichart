import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { AppRole } from '@/lib/appSiteAuth';

type UserRecord = {
  user: string;
  passwordHash: string;
  role: AppRole;
  createdAt: number;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'site-users.json');

function hashPassword(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function defaultUsers(): UserRecord[] {
  const now = Date.now();
  const base: UserRecord[] = [
    { user: 'masteradmin', passwordHash: hashPassword('longshortmaster'), role: 'master_admin', createdAt: now },
  ];
  for (let i = 1; i <= 10; i += 1) {
    const user = `aichart${i}`;
    const pass = `longshort${i}`;
    base.push({
      user,
      passwordHash: hashPassword(pass),
      role: i === 1 ? 'master_admin' : 'user',
      createdAt: now,
    });
  }
  return base;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readUsers(): Promise<UserRecord[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as UserRecord[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  const seeded = defaultUsers();
  await writeUsers(seeded);
  return seeded;
}

export async function writeUsers(users: UserRecord[]) {
  await ensureDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

export async function verifyUser(userInput: string, passwordInput: string): Promise<UserRecord | null> {
  const user = userInput.trim().toLowerCase();
  const password = passwordInput.trim();
  if (!user || !password) return null;
  const users = await readUsers();
  const found = users.find(u => u.user.toLowerCase() === user);
  if (!found) return null;
  return found.passwordHash === hashPassword(password) ? found : null;
}

export async function createUser(userInput: string, passwordInput: string, role: AppRole = 'user'): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = userInput.trim().toLowerCase();
  const password = passwordInput.trim();
  if (!/^[a-z0-9._-]{4,32}$/.test(user)) return { ok: false, error: '아이디 형식이 올바르지 않습니다. (4~32, 영문/숫자/._-)' };
  if (password.length < 6 || password.length > 64) return { ok: false, error: '비밀번호는 6~64자로 입력하세요.' };
  const users = await readUsers();
  if (users.some(u => u.user.toLowerCase() === user)) return { ok: false, error: '이미 존재하는 아이디입니다.' };
  users.push({ user, passwordHash: hashPassword(password), role, createdAt: Date.now() });
  await writeUsers(users);
  return { ok: true };
}
