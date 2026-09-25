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

/** HTML 태그가 포함된 본문 — 이스케이프하지 않음 (브리핑 빌더 전용) */
export async function sendTelegramHtmlCaptionToEnvChat(
  captionHtml: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = sanitizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  const envChatId = sanitizeEnvValue(process.env.TELEGRAM_CHAT_ID);
  if (!token || !envChatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured' };
  }
  const text = String(captionHtml || '').slice(0, 3900) || '차트 신호 알림';
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

/**
 * PNG + HTML 캡션 (태그는 호출측에서 이미 이스케이프·조립).
 * parse_mode HTML — 중요 구간 bold/code/u 지원.
 */
export async function sendTelegramPhotoPngHtmlCaption(
  captionHtml: string,
  png: Buffer
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = sanitizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  const envChatId = sanitizeEnvValue(process.env.TELEGRAM_CHAT_ID);
  if (!token || !envChatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured' };
  }
  const caption = String(captionHtml || '').slice(0, 1024);
  const form = new FormData();
  form.set('chat_id', envChatId);
  form.set('caption', caption);
  form.set('parse_mode', 'HTML');
  form.set('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'chart.png');

  const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  if (!msgRes.ok) {
    const msgErr = await msgRes.text().catch(() => '');
    return { ok: false, error: `telegram ${msgRes.status}${msgErr ? `: ${msgErr}` : ''}` };
  }
  return { ok: true };
}

/**
 * `TELEGRAM_CHAT_ID` 로 PNG 1장 전송 (MTF 보드 크론 등).
 * caption 은 HTML 이스케이프 후 `parse_mode: HTML` 로 전달합니다.
 */
export async function sendTelegramPhotoPngToEnvChat(
  captionHtml: string,
  png: Buffer
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = sanitizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  const envChatId = sanitizeEnvValue(process.env.TELEGRAM_CHAT_ID);
  if (!token || !envChatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured' };
  }
  const caption = escapeTelegramHtml(String(captionHtml || '').slice(0, 1024));
  const form = new FormData();
  form.set('chat_id', envChatId);
  form.set('caption', caption);
  form.set('parse_mode', 'HTML');
  form.set('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'mtf-board.png');

  const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  if (!msgRes.ok) {
    const msgErr = await msgRes.text().catch(() => '');
    return { ok: false, error: `telegram ${msgRes.status}${msgErr ? `: ${msgErr}` : ''}` };
  }
  return { ok: true };
}
