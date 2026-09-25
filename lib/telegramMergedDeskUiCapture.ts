/**
 * 통합·분석 UI — Playwright headless 캡처 (앱 tv-frame 과 동일).
 * PNG는 메모리 Buffer만 — 디스크 저장 없음.
 *
 * Playwright는 createRequire로만 로드 — Turbopack이 .ttf 등 에셋을 번들하지 않게 함.
 */
import { createRequire } from 'module';
import path from 'path';

const CAPTURE_TIMEOUT_MS = 55_000;

type PlaywrightMod = {
  chromium: {
    launch: (opts?: Record<string, unknown>) => Promise<{
      newPage: (opts?: Record<string, unknown>) => Promise<{
        goto: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
        waitForSelector: (sel: string, opts?: Record<string, unknown>) => Promise<unknown>;
        waitForTimeout: (ms: number) => Promise<unknown>;
        locator: (sel: string) => {
          first: () => {
            waitFor: (opts?: Record<string, unknown>) => Promise<unknown>;
            screenshot: (opts?: Record<string, unknown>) => Promise<Buffer>;
          };
        };
      }>;
      close: () => Promise<void>;
    }>;
  };
};

function captureSecret(): string {
  return (
    process.env.TELEGRAM_MULTITF_CRON_SECRET ||
    process.env.INTERNAL_ANALYZE_SECRET ||
    process.env.TELEGRAM_SIGNAL_SECRET ||
    ''
  ).trim();
}

export function isTelegramMergedDeskUiCaptureAvailable(): boolean {
  return Boolean(captureSecret());
}

function loadPlaywright(): PlaywrightMod | null {
  try {
    const req = createRequire(path.join(process.cwd(), 'package.json'));
    return req('playwright') as PlaywrightMod;
  } catch {
    try {
      const req = createRequire(__filename);
      return req('playwright') as PlaywrightMod;
    } catch {
      return null;
    }
  }
}

/**
 * /telegram-merged-capture 페이지의 .tv-frame 스크린샷 → PNG Buffer.
 * Playwright 미설치·타임아웃 시 null (SVG 폴백).
 */
export async function captureMergedDeskUiPngBuffer(params: {
  baseUrl: string;
  symbol: string;
  timeframe: string;
}): Promise<Buffer | null> {
  const secret = captureSecret();
  if (!secret) return null;

  const playwright = loadPlaywright();
  if (!playwright) {
    console.warn('[telegram-ui-capture] playwright not installed — UI 캡처 스킵(SVG/본문)');
    return null;
  }

  const base = params.baseUrl.replace(/\/$/, '');
  const sym = String(params.symbol || '').trim().toUpperCase();
  const tf = String(params.timeframe || '15m').trim().toLowerCase();
  const url = `${base}/telegram-merged-capture?symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(tf)}&key=${encodeURIComponent(secret)}`;

  let browser: Awaited<ReturnType<PlaywrightMod['chromium']['launch']>> | null = null;
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({
      viewport: { width: 1360, height: 780 },
      deviceScaleFactor: 2,
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CAPTURE_TIMEOUT_MS });
    await page.waitForSelector('[data-telegram-capture-ready="1"]', { timeout: CAPTURE_TIMEOUT_MS });
    await page.waitForTimeout(900);
    const frame = page.locator('.tv-frame[data-telegram-capture-ready="1"], .tv-frame').first();
    await frame.waitFor({ state: 'visible', timeout: 12_000 });
    const png = await frame.screenshot({ type: 'png' });
    return Buffer.from(png);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[telegram-ui-capture] failed', { symbol: params.symbol, timeframe: params.timeframe, msg });
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
