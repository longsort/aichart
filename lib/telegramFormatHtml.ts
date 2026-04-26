/** `parse_mode: HTML` — 사용자·시세 문자열 이스케이프 (signal-capture / 서버 cron 공통) */
export function escapeTelegramHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
