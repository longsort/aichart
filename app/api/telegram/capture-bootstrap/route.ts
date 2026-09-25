import { NextRequest, NextResponse } from 'next/server';
import { readUserSettings } from '@/lib/serverUserSettings';
import { mergeUserSettingsFromServerJson } from '@/lib/mergeUserSettingsFromServerJson';
import { buildTelegramBackgroundAnalyzeUrlWithSettings } from '@/lib/telegramBackgroundAnalyzeQuery';
import type { AnalyzeResponse } from '@/types';

export const dynamic = 'force-dynamic';

function captureSecret(): string {
  return (
    process.env.TELEGRAM_MULTITF_CRON_SECRET ||
    process.env.INTERNAL_ANALYZE_SECRET ||
    process.env.TELEGRAM_SIGNAL_SECRET ||
    ''
  ).trim();
}

function internalApiBaseUrl(): string {
  const b = (process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (b) return b.replace(/\/$/, '');
  const p = process.env.PORT || '3000';
  return `http://127.0.0.1:${p}`;
}

function assertKey(req: NextRequest): boolean {
  const secret = captureSecret();
  if (!secret) return false;
  const key = req.nextUrl.searchParams.get('key')?.trim() || req.headers.get('x-telegram-capture-key')?.trim() || '';
  return key === secret;
}

/** Playwright 캡처 페이지 — analyze JSON (디스크 저장 없음) */
export async function GET(req: NextRequest) {
  if (!assertKey(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const symbol = String(req.nextUrl.searchParams.get('symbol') || 'BTCUSDT').trim().toUpperCase();
  const timeframe = String(req.nextUrl.searchParams.get('timeframe') || '15m').trim().toLowerCase();
  const user = String(req.nextUrl.searchParams.get('user') || 'aichart1').trim();
  const base = internalApiBaseUrl();
  const analyzeSecret = captureSecret();

  const raw = await readUserSettings(user).catch(() => null);
  const settings = mergeUserSettingsFromServerJson(raw ?? {});

  const rel = buildTelegramBackgroundAnalyzeUrlWithSettings(
    settings,
    symbol,
    timeframe,
    'MERGED_ANALYSIS_DESK'
  );
  const url = new URL(rel, base).toString();

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: analyzeSecret ? { 'x-internal-analyze-secret': analyzeSecret } : undefined,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `analyze_${res.status}` }, { status: 502 });
    }
    const analysis = (await res.json()) as AnalyzeResponse;
    if (!analysis?.symbol) {
      return NextResponse.json({ ok: false, error: 'analyze_empty' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, symbol, timeframe, analysis, settings });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
