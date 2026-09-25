/**
 * 서버 기동 후 프로세스 내부에서 폭락존·SFP·기관밴드 자동 감지.
 * 브라우저 접속·crontab 없어도 PM2/Next만 살아 있으면 동작.
 * crontab과 병행해도 파일 락 + 이벤트 디듀프로 중복 발송을 막음.
 */
import { promises as fs } from 'fs';
import path from 'path';

const LOCK_PATH = path.join(process.cwd(), 'data', 'telegram-auto-alert.lock');
/** 한 바퀴가 길 수 있어 락 TTL은 여유 있게 */
const LOCK_STALE_MS = 6 * 60_000;
const DEFAULT_INTERVAL_MS = 150_000;
const BOOT_DELAY_MS = 55_000;

type GlobalTg = typeof globalThis & {
  __ailongTelegramAutoAlertLoop?: {
    started: boolean;
    timer?: ReturnType<typeof setInterval>;
    running: boolean;
  };
};

function loopState() {
  const g = globalThis as GlobalTg;
  if (!g.__ailongTelegramAutoAlertLoop) {
    g.__ailongTelegramAutoAlertLoop = { started: false, running: false };
  }
  return g.__ailongTelegramAutoAlertLoop;
}

async function tryAcquireLock(): Promise<boolean> {
  await fs.mkdir(path.dirname(LOCK_PATH), { recursive: true });
  const now = Date.now();
  try {
    await fs.writeFile(LOCK_PATH, `${process.pid}|${now}`, { flag: 'wx' });
    return true;
  } catch {
    try {
      const raw = await fs.readFile(LOCK_PATH, 'utf8');
      const ts = Number(String(raw).split('|')[1] || 0);
      if (ts > 0 && now - ts < LOCK_STALE_MS) return false;
      await fs.writeFile(LOCK_PATH, `${process.pid}|${now}`, { flag: 'w' });
      return true;
    } catch {
      return false;
    }
  }
}

async function releaseLock(): Promise<void> {
  try {
    await fs.unlink(LOCK_PATH);
  } catch {
    /* ignore */
  }
}

/** 크론 라우트·자체 루프 공통 — 동시 실행 1회만 */
export async function runTelegramAutoAlertTick(source: 'self' | 'cron' | 'manual' = 'self'): Promise<{
  ok: boolean;
  skippedLock?: boolean;
  source: string;
  stats?: Record<string, unknown>;
  error?: string;
}> {
  const got = await tryAcquireLock();
  if (!got) {
    return { ok: true, skippedLock: true, source };
  }
  try {
    const { readAllUserSettingsMap } = await import('@/lib/serverUserSettings');
    const { runTelegramAutoAlertAll } = await import('@/lib/telegramServerConfirmRunner');
    const all = await readAllUserSettingsMap();
    const stats = await runTelegramAutoAlertAll(all);
    console.info('[telegram-auto-alert]', source, {
      users: stats.users,
      sfpSent: stats.sfpSent,
      precisionTouchSent: stats.precisionTouchSent,
      zoneTouchSent: stats.zoneTouchSent,
      fetchErr: stats.fetchErr,
      sendErr: stats.sendErr,
      dedupSkip: stats.dedupSkip,
    });
    return { ok: true, source, stats: stats as unknown as Record<string, unknown> };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[telegram-auto-alert] tick failed', source, msg);
    return { ok: false, source, error: msg };
  } finally {
    await releaseLock();
  }
}

function intervalMs(): number {
  const raw = Number(process.env.TELEGRAM_AUTO_ALERT_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw)) return DEFAULT_INTERVAL_MS;
  return Math.max(60_000, Math.min(10 * 60_000, Math.floor(raw)));
}

/**
 * Next instrumentation / start.js 에서 1회 호출.
 * TELEGRAM_AUTO_ALERT_SELF_LOOP=0 이면 비활성(크론만 사용).
 */
export function startTelegramAutoAlertSelfScheduler(): void {
  if (String(process.env.TELEGRAM_AUTO_ALERT_SELF_LOOP || '1').trim() === '0') {
    console.info('[telegram-auto-alert] self-loop disabled (TELEGRAM_AUTO_ALERT_SELF_LOOP=0)');
    return;
  }
  const st = loopState();
  if (st.started) return;
  st.started = true;

  const ms = intervalMs();
  const boot = Number(process.env.TELEGRAM_AUTO_ALERT_BOOT_DELAY_MS || BOOT_DELAY_MS);
  const bootMs = Number.isFinite(boot) ? Math.max(10_000, Math.min(180_000, boot)) : BOOT_DELAY_MS;

  console.info('[telegram-auto-alert] self-loop armed', {
    intervalMs: ms,
    bootDelayMs: bootMs,
    note: '폭락존·SFP·기관밴드 · 앱 미접속',
  });

  const tick = () => {
    if (st.running) return;
    st.running = true;
    void runTelegramAutoAlertTick('self')
      .catch((e) => console.error('[telegram-auto-alert] self tick', e))
      .finally(() => {
        st.running = false;
      });
  };

  setTimeout(() => {
    tick();
    st.timer = setInterval(tick, ms);
    if (typeof st.timer.unref === 'function') st.timer.unref();
  }, bootMs);
}
