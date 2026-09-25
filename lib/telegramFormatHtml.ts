/** `parse_mode: HTML` — 사용자·시세 문자열 이스케이프 (signal-capture / 서버 cron 공통) */
export function escapeTelegramHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 텔레 HTML — 가격(모노·강조) */
export function tgPrice(text: string | number): string {
  return `<code>${escapeTelegramHtml(String(text))}</code>`;
}

/** 텔레 HTML — 방향 색 이모지 + 굵게 (텔레는 글자색 미지원 → 이모지) */
export function tgSide(side: 'LONG' | 'SHORT' | 'WAIT' | undefined): string {
  if (side === 'LONG') return '<b>🟢 롱</b>';
  if (side === 'SHORT') return '<b>🔴 숏</b>';
  return '<b>🟡 관찰</b>';
}

/** 텔레 HTML — 섹션 제목 */
export function tgSection(title: string): string {
  return `<b>▸ ${escapeTelegramHtml(title)}</b>`;
}

/** 텔레 HTML — 핵심 한 줄 강조 */
export function tgHighlight(text: string): string {
  return `<b><u>${escapeTelegramHtml(text)}</u></b>`;
}

/** 텔레 HTML — 경고·무효 */
export function tgWarn(text: string): string {
  return `<b>⚠️ ${escapeTelegramHtml(text)}</b>`;
}

/** 상승·롱 핵심 (초록 이모지) */
export function tgUp(text: string): string {
  return `<b>🟢 ${escapeTelegramHtml(text)}</b>`;
}

/** 하락·숏 핵심 (빨강 이모지) */
export function tgDown(text: string): string {
  return `<b>🔴 ${escapeTelegramHtml(text)}</b>`;
}

/** 체크·핵심 확인 */
export function tgCheck(text: string): string {
  return `<b>✅ ${escapeTelegramHtml(text)}</b>`;
}

/** 미리 만든 HTML 캡션 — 이스케이프하지 않음 (태그는 신뢰된 빌더만) */
export function trimTelegramHtmlCaption(html: string, max = 1024): string {
  const s = String(html || '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
