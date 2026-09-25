import { NextRequest, NextResponse } from 'next/server';
import { readAllUserSettingsMap } from '@/lib/serverUserSettings';
import { mergeUserSettingsFromServerJson } from '@/lib/mergeUserSettingsFromServerJson';
import { buildTelegramBackgroundAnalyzeUrlWithSettings } from '@/lib/telegramBackgroundAnalyzeQuery';
import {
  buildTelegramMultiTfPairListFromSettings,
  TELEGRAM_MULTITF_ALLOWED_TFS,
} from '@/lib/telegramMultiTfPairList';
import { evaluateBackgroundHtfTelegram } from '@/lib/telegramBackgroundHtfEval';
import { telegramEventDedupServerTry } from '@/lib/telegramEventDedupServer';
import { sendTelegramHtmlToEnvChat } from '@/lib/telegramBotSendHtml';
import type { AnalyzeResponse } from '@/types';
import { assertTelegramCronSecret } from '@/lib/cronRouteAuth';

export const dynamic = 'force-dynamic';

function internalApiBaseUrl(): string {
  const b = (process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (b) return b.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const p = process.env.PORT || '3000';
  return `http://127.0.0.1:${p}`;
}

/**
 * PM2/시스템 crontab에서 주기적으로 호출 — **앱 접속 없이** 서버가 `data/user-settings.json`에 동기화된
 * `telegramMultiTfEnabled`+심볼+TF로 분석·판정·텔레.
 *
 * `Authorization: Bearer <TELEGRAM_MULTITF_CRON_SECRET>` (필수) · 미설정 시 503
 */
export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}

async function runCron(req: NextRequest) {
  const denied = assertTelegramCronSecret(req);
  if (denied) return denied;

  const base = internalApiBaseUrl();
  const analyzeHeaderSecret = (process.env.INTERNAL_ANALYZE_SECRET || process.env.TELEGRAM_MULTITF_CRON_SECRET || '').trim();
  const all = await readAllUserSettingsMap();
  const stats = {
    users: 0,
    pairRuns: 0,
    skippedByTf: 0,
    sent: 0,
    evalNull: 0,
    dedupSkip: 0,
    fetchErr: 0,
    sendErr: 0 as number,
  };
  for (const [user, raw] of Object.entries(all)) {
    if (!raw || typeof raw !== 'object') continue;
    const st = mergeUserSettingsFromServerJson(raw as Record<string, unknown>);
    /** 진입존 텔레 ON이면 레거시 멀티TF 크론 스킵 */
    if (st.telegramHqZoneTouchEnabled !== false) continue;
    if (!st.telegramMultiTfEnabled) continue;
    stats.users += 1;
    const pairs = buildTelegramMultiTfPairListFromSettings(st);
    if (pairs.length === 0) continue;
    for (const [symbol, timeframe] of pairs) {
      const tf = String(timeframe || '').toLowerCase();
      if (!TELEGRAM_MULTITF_ALLOWED_TFS.has(tf)) {
        stats.skippedByTf += 1;
        continue;
      }
      stats.pairRuns += 1;
      const rel = buildTelegramBackgroundAnalyzeUrlWithSettings(st, symbol, timeframe, 'FUSION_MODE');
      const url = new URL(rel, base).toString();
      let analysis: AnalyzeResponse;
      try {
        const res = await fetch(url, {
          cache: 'no-store',
          headers: analyzeHeaderSecret
            ? { 'x-internal-analyze-secret': analyzeHeaderSecret }
            : undefined,
        });
        if (!res.ok) {
          stats.fetchErr += 1;
          continue;
        }
        analysis = (await res.json()) as AnalyzeResponse;
        if (!analysis?.symbol) {
          stats.fetchErr += 1;
          continue;
        }
      } catch {
        stats.fetchErr += 1;
        continue;
      }
      const ev = evaluateBackgroundHtfTelegram(analysis, symbol, timeframe, st);
      if (!ev) {
        stats.evalNull += 1;
        continue;
      }
      const gOk = await telegramEventDedupServerTry(ev.eventKey, ev.cooldownMs);
      if (!gOk) {
        stats.dedupSkip += 1;
        continue;
      }
      const send = await sendTelegramHtmlToEnvChat(ev.fullBrief);
      if (send.ok) {
        stats.sent += 1;
        console.info('[cron/telegram-multi-tf] sent', { user, symbol, timeframe, eventKey: ev.eventKey });
      } else {
        stats.sendErr += 1;
        console.error('[cron/telegram-multi-tf] send failed', { user, err: 'error' in send ? send.error : 'unknown' });
      }
    }
  }
  return NextResponse.json({ ok: true, base, ...stats, note: 'per-user; dedup is global by eventKey' });
}
