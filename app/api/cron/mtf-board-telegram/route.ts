import { NextRequest, NextResponse } from 'next/server';
import { readAllUserSettingsMap } from '@/lib/serverUserSettings';
import { mergeUserSettingsFromServerJson } from '@/lib/mergeUserSettingsFromServerJson';
import { fetchMtfBoardDigestRowsForSymbol } from '@/lib/mtfBoardTelegramFetch';
import { mtfBoardHasCurrentOrPrevHot } from '@/lib/mtfBoardTelegramAlert';
import { buildMtfBoardSvg, mtfBoardSvgToPngBuffer } from '@/lib/mtfBoardTelegramImage';
import { telegramEventDedupServerTry } from '@/lib/telegramEventDedupServer';
import { sendTelegramHtmlToEnvChat, sendTelegramPhotoPngToEnvChat } from '@/lib/telegramBotSendHtml';
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
 * PM2/crontab — 앱 미실행 시에도 `telegramMtfBoardImageEnabled` 사용자에 대해
 * MTF 카드(15m~1M) PNG를 텔레로 전송.
 *
 * `Authorization: Bearer <TELEGRAM_MULTITF_CRON_SECRET>` (telegram-multi-tf 와 동일)
 */
export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}

async function runCron(_req: NextRequest) {
  const denied = assertTelegramCronSecret(_req);
  if (denied) return denied;

  const base = internalApiBaseUrl();
  const analyzeHeaderSecret = (process.env.INTERNAL_ANALYZE_SECRET || process.env.TELEGRAM_MULTITF_CRON_SECRET || '').trim();
  const all = await readAllUserSettingsMap();
  const stats = {
    users: 0,
    symbolRuns: 0,
    sentPhoto: 0,
    sentTextFallback: 0,
    noHot: 0,
    dedupGap: 0,
    fetchErr: 0,
    sendErr: 0,
  };

  for (const [user, raw] of Object.entries(all)) {
    if (!raw || typeof raw !== 'object') continue;
    const st = mergeUserSettingsFromServerJson(raw as Record<string, unknown>);
    if (!st.telegramMtfBoardImageEnabled) continue;
    stats.users += 1;
    const syms = st.telegramMultiTfSymbols?.length
      ? st.telegramMultiTfSymbols
      : [];
    const intervalMin = Math.max(5, Math.min(180, Math.floor(st.telegramMtfBoardMinIntervalMin ?? 15)));
    const intervalMs = intervalMin * 60 * 1000;

    for (const symbol of syms) {
      const sym = String(symbol || '').trim().toUpperCase();
      if (!sym) continue;
      stats.symbolRuns += 1;
      let rows: Awaited<ReturnType<typeof fetchMtfBoardDigestRowsForSymbol>>;
      try {
        rows = await fetchMtfBoardDigestRowsForSymbol({
          settings: st,
          symbol: sym,
          baseUrl: base,
          analyzeSecret: analyzeHeaderSecret || undefined,
        });
      } catch (e) {
        console.error('[cron/mtf-board-telegram] fetch rows', { user, sym, e });
        stats.fetchErr += 1;
        continue;
      }
      if (!mtfBoardHasCurrentOrPrevHot(rows)) {
        stats.noHot += 1;
        continue;
      }
      const gapOk = await telegramEventDedupServerTry(`mtfboard-gap:${user}:${sym}`, intervalMs);
      if (!gapOk) {
        stats.dedupGap += 1;
        continue;
      }

      const svg = buildMtfBoardSvg({ symbol: sym, rows });
      const png = await mtfBoardSvgToPngBuffer(svg);
      const caption = `<b>${sym}</b> MTF 신호 (15m→1M)\n<i>현·전 봉 기준 · 서버 자동 · 참고용</i>`;

      if (png && png.length > 0) {
        const send = await sendTelegramPhotoPngToEnvChat(caption, png);
        if (send.ok) {
          stats.sentPhoto += 1;
          console.info('[cron/mtf-board-telegram] sent photo', { user, sym });
        } else {
          stats.sendErr += 1;
          console.error('[cron/mtf-board-telegram] photo failed', send);
        }
      } else {
        const fb = await sendTelegramHtmlToEnvChat(
          `${caption}\n\n<code>PNG 생성 실패(sharp). 서버에 sharp 설치·재시도.</code>`
        );
        if (fb.ok) stats.sentTextFallback += 1;
        else stats.sendErr += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, base, ...stats });
}
