import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'user-settings.json');

export type UserSettingsBlobMap = Record<string, Record<string, unknown>>;

/** PUT 동시 요청이 같은 파일을 깨지 않도록 직렬화 */
let writeChain: Promise<void> = Promise.resolve();

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

function isRetryableFsError(err: unknown): boolean {
  const code = String((err as { code?: string })?.code || '');
  return (
    code === 'UNKNOWN' ||
    code === 'EBUSY' ||
    code === 'EPERM' ||
    code === 'EACCES' ||
    code === 'EAGAIN' ||
    code === 'ENOENT'
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Windows에서 직접 writeFile이 errno -4094(UNKNOWN)로 실패하는 경우가 있어
 * tmp → rename(원자적 교체) + 재시도로 저장한다.
 */
async function writeAll(data: UserSettingsBlobMap) {
  await ensureDataDir();
  const payload = JSON.stringify(data, null, 2);
  const tmp = path.join(
    DATA_DIR,
    `.user-settings.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`
  );

  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await fs.writeFile(tmp, payload, 'utf8');
      try {
        await fs.rename(tmp, SETTINGS_FILE);
      } catch (renameErr) {
        /** Windows: 대상이 열려 있으면 rename 실패 → 복사 후 tmp 삭제 */
        if (isRetryableFsError(renameErr)) {
          await fs.copyFile(tmp, SETTINGS_FILE);
          await fs.unlink(tmp).catch(() => {});
        } else {
          throw renameErr;
        }
      }
      await fs.unlink(tmp).catch(() => {});
      return;
    } catch (err) {
      lastErr = err;
      await fs.unlink(tmp).catch(() => {});
      if (!isRetryableFsError(err) || attempt >= 5) break;
      await sleep(40 + attempt * 60);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function enqueueWrite<T>(job: () => Promise<T>): Promise<T> {
  const run = writeChain.then(job, job);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
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
  await enqueueWrite(async () => {
    const all = await readAll();
    const current = all[key] && typeof all[key] === 'object' ? all[key] : {};
    all[key] = { ...current, ...patch };
    await writeAll(all);
  });
}
