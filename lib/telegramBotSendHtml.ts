import { escapeTelegramHtml } from './telegramFormatHtml';

function sanitizeEnvValue(v: string | undefined | null): string {
  return String(v ?? '').trim().replace(/^['"]+|['"]+$/g, '');
}

/**
 * `TELEGRAM_CHAT_ID` 단톡(또는 봇이 쓰는 환경 CHAT)으로 HTML 본문 1회 전송.
 * (signal-capture와 동일 봇·채팅 — `TELEGRAM_MULTITF_CRON_SECRET` 루트가 사용)
 */
export async function sendTelegramHtmlToEnvChat(
  rawText: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = sanitizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  const envChatId = sanitizeEnvValue(process.env.TELEGRAM_CHAT_ID);
  if (!token || !envChatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured' };
  }
  const text = escapeTelegramHtml(String(rawText || '').slice(0, 3900) || '차트 신호 알림');
  const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: envChatId, text, parse_mode: 'HTML' }),
  });
  if (!msgRes.ok) {
    const msgErr = await msgRes.text().catch(() => '');
    return { ok: false, error: `telegram ${msgRes.status}${msgErr ? `: ${msgErr}` : ''}` };
  }
  return { ok: true };
}
