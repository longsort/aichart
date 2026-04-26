import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'user-settings.json');

export type UserSettingsBlobMap = Record<string, Record<string, unknown>>;

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readAll(): Promise<UserSettingsBlobMap> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as UserSettingsBlobMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(data: UserSettingsBlobMap) {
  await ensureDataDir();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function readUserSettings(user: string): Promise<Record<string, unknown> | null> {
  const all = await readAll();
  const key = String(user || '').trim();
  if (!key) return null;
  const settings = all[key];
  return settings && typeof settings === 'object' ? settings : null;
}

/** 멀티TF 크론 등: 전체 사용자 키 → 설정 스냅샷 */
export async function readAllUserSettingsMap(): Promise<UserSettingsBlobMap> {
  return readAll();
}

export async function writeUserSettings(user: string, patch: Record<string, unknown>) {
  const key = String(user || '').trim();
  if (!key) return;
  const all = await readAll();
  const current = (all[key] && typeof all[key] === 'object') ? all[key] : {};
  all[key] = { ...current, ...patch };
  await writeAll(all);
}
