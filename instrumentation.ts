/**
 * Next 서버 기동 — 텔레그램 + 실전 익절/진입 루프.
 * 익절·진입을 분리해 서버 CPU/Bitget 폭주 완화 (기능 삭제 없음).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;

  /** CRON/INTERNAL 없으면 APP_SESSION_SECRET으로 내부 루프 (미설정 시 진입·익절 전면 정지 방지) */
  const secret = String(
    process.env.TELEGRAM_MULTITF_CRON_SECRET ||
      process.env.INTERNAL_ANALYZE_SECRET ||
      process.env.APP_SESSION_SECRET ||
      ''
  )
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!secret) {
    console.warn('[instrumentation] self-loop skip: no cron secret');
    return;
  }

  const port = String(process.env.PORT || '3000');
  const base = String(process.env.INTERNAL_API_BASE_URL || `http://127.0.0.1:${port}`)
    .trim()
    .replace(/\/$/, '');

  const armFetch = async (path: string, timeoutMs: number, label: string) => {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeoutMs);
      const res = await fetch(`${base}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${secret}` },
        signal: ac.signal,
        cache: 'no-store',
      });
      clearTimeout(t);
      if (!res.ok) {
        const text = await res.text();
        console.warn(`[instrumentation] ${label}`, res.status, text.slice(0, 120));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[instrumentation] ${label} err`, msg);
    }
  };

  /** 익절·SL치유만 — 기본 35초 (진입 스캔 미포함) */
  if (String(process.env.MERGED_DESK_LIVE_EXIT_LOOP || '1').trim() !== '0') {
    const exitInterval = Math.max(
      20_000,
      Math.min(120_000, Number(process.env.MERGED_DESK_LIVE_EXIT_INTERVAL_MS || 35_000) || 35_000)
    );
    let exitRunning = false;
    const exitTick = async () => {
      if (exitRunning) return;
      exitRunning = true;
      try {
        await armFetch('/api/cron/merged-desk-live-exit', 60_000, 'live-exit');
      } finally {
        exitRunning = false;
      }
    };
    console.info('[instrumentation] live-exit loop', { intervalMs: exitInterval });
    setTimeout(() => {
      void exitTick();
      const id = setInterval(() => void exitTick(), exitInterval);
      if (typeof (id as NodeJS.Timeout).unref === 'function') (id as NodeJS.Timeout).unref();
    }, 30_000);

    /** 진입 스캔 — 기본 90초 (무거움 분리) */
    if (String(process.env.MERGED_DESK_ENTRY_LOOP || '1').trim() !== '0') {
      const entryInterval = Math.max(
        45_000,
        Math.min(
          300_000,
          Number(process.env.MERGED_DESK_ENTRY_INTERVAL_MS || 90_000) || 90_000
        )
      );
      let entryRunning = false;
      const entryTick = async () => {
        if (entryRunning) return;
        entryRunning = true;
        try {
          await armFetch('/api/cron/merged-desk-live-exit?entry=1', 120_000, 'live-entry');
        } finally {
          entryRunning = false;
        }
      };
      console.info('[instrumentation] live-entry loop', { intervalMs: entryInterval });
      setTimeout(() => {
        void entryTick();
        const id = setInterval(() => void entryTick(), entryInterval);
        if (typeof (id as NodeJS.Timeout).unref === 'function') (id as NodeJS.Timeout).unref();
      }, 55_000);
    }
  }

  if (String(process.env.TELEGRAM_AUTO_ALERT_SELF_LOOP || '1').trim() === '0') {
    console.info('[instrumentation] telegram self-loop disabled');
    return;
  }

  const interval = Math.max(
    90_000,
    Math.min(600_000, Number(process.env.TELEGRAM_AUTO_ALERT_INTERVAL_MS || 180_000) || 180_000)
  );
  const boot = Math.max(
    20_000,
    Math.min(180_000, Number(process.env.TELEGRAM_AUTO_ALERT_BOOT_DELAY_MS || 70_000) || 70_000)
  );

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await armFetch('/api/cron/telegram-auto-alert', 350_000, 'telegram');
    } finally {
      running = false;
    }
  };

  console.info('[instrumentation] telegram self-loop', { intervalMs: interval, bootDelayMs: boot });
  setTimeout(() => {
    void tick();
    const id = setInterval(() => void tick(), interval);
    if (typeof (id as NodeJS.Timeout).unref === 'function') (id as NodeJS.Timeout).unref();
  }, boot);
}
