/**
 * 통합 텔레그램 알림 HTML — 확정·타점·무효 + E/SL/TP + 시간축·학습.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import { escapeTelegramHtml } from '@/lib/telegramFormatHtml';
import type { ConfirmNotifyKind } from '@/lib/tradeConfirmDesk';
import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import { tpHitLabel, type TelegramTpHitKind } from '@/lib/telegramServerTpHit';

export type TelegramServerAlertKind = ConfirmNotifyKind | TelegramTpHitKind;

const CONFIRM_EMOJI: Record<ConfirmNotifyKind, string> = {
  candidate: '◐',
  confirmed: '●',
  confirmed_full: '✓',
  at_entry: '★',
  invalid: '⚠',
};

const CONFIRM_TITLE: Record<ConfirmNotifyKind, string> = {
  candidate: '후보',
  confirmed: '확정',
  confirmed_full: '돌파안착',
  at_entry: '타점 진입',
  invalid: '무효 이탈',
};

const TP_EMOJI: Record<TelegramTpHitKind, string> = {
  tp1: '🎯',
  tp2: '🎯',
  tp3: '✓',
};

function alertEmoji(kind: TelegramServerAlertKind): string {
  if (kind === 'tp1' || kind === 'tp2' || kind === 'tp3') return TP_EMOJI[kind];
  return CONFIRM_EMOJI[kind];
}

function alertTitle(kind: TelegramServerAlertKind): string {
  if (kind === 'tp1' || kind === 'tp2' || kind === 'tp3') return tpHitLabel(kind);
  return CONFIRM_TITLE[kind];
}

function fmtPx(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function pct(from: number, to: number): string {
  if (!from || !to) return '—';
  const p = ((to - from) / from) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

export type TelegramUnifiedAlertParams = {
  symbol: string;
  timeframe: string;
  kind: TelegramServerAlertKind;
  desk: TradeConfirmDesk;
  unified?: {
    entry: number | null;
    sl: number | null;
    tp1: number | null;
    tp2: number | null;
    tp3: number | null;
    inv?: number | null;
    sourceKo?: string;
  };
  temporalLine?: string | null;
  learningLine?: string | null;
  riskLine?: string | null;
  prospectScore?: number | null;
  prospectGrade?: string | null;
  currentPrice?: number | null;
  serverAuto?: boolean;
};

export function formatTelegramUnifiedAlertHtml(p: TelegramUnifiedAlertParams): string {
  const { symbol, timeframe, kind, desk } = p;
  const emoji = alertEmoji(kind);
  const title = alertTitle(kind);
  const dir = desk.direction === 'LONG' ? 'LONG' : desk.direction === 'SHORT' ? 'SHORT' : 'WAIT';
  const dirKo = dir === 'LONG' ? '롱' : dir === 'SHORT' ? '숏' : '관망';
  const u = p.unified;
  const entry = u?.entry ?? desk.entryLow ?? desk.close;
  const sl = u?.sl ?? desk.invalidPrice;
  const tp1 = u?.tp1 ?? desk.tp1;
  const tp2 = u?.tp2 ?? null;
  const tp3 = u?.tp3 ?? null;
  const px = p.currentPrice ?? desk.close;

  const lines: string[] = [];
  lines.push(`<b>${emoji} ${title} · ${dirKo} ${escapeTelegramHtml(symbol)}</b>`);
  lines.push(`${escapeTelegramHtml(timeframe)}${p.serverAuto ? ' · 서버 자동' : ''}`);
  lines.push('');
  lines.push(`<b>상태</b> ${escapeTelegramHtml(desk.phaseKo)}`);
  if (px != null) lines.push(`<b>현재</b> ${escapeTelegramHtml(fmtPx(px))}`);
  lines.push(`<b>★ 타점</b> ${escapeTelegramHtml(desk.entryKo)}`);
  lines.push(`<b>🛡 방어</b> ${escapeTelegramHtml(desk.confirmKo)}`);
  lines.push('');
  lines.push(`<b>E</b>  ${escapeTelegramHtml(fmtPx(entry))}`);
  lines.push(`<b>SL</b> ${escapeTelegramHtml(fmtPx(sl))}${px && sl ? ` (${escapeTelegramHtml(pct(px, sl))})` : ''}`);
  if (tp1 != null) {
    lines.push(`<b>TP1</b> ${escapeTelegramHtml(fmtPx(tp1))}${px ? ` (${escapeTelegramHtml(pct(px, tp1))})` : ''}`);
  }
  if (tp2 != null) lines.push(`<b>TP2</b> ${escapeTelegramHtml(fmtPx(tp2))}`);
  if (tp3 != null) lines.push(`<b>TP3</b> ${escapeTelegramHtml(fmtPx(tp3))}`);
  const invPx = u?.inv ?? desk.invalidPrice;
  if (invPx != null) {
    lines.push(`<b>무효</b> ${escapeTelegramHtml(fmtPx(invPx))} 이탈 시 재검토`);
  }
  if (p.riskLine) lines.push(`<b>사이즈</b> ${escapeTelegramHtml(p.riskLine.slice(0, 80))}`);
  lines.push('');
  lines.push(
    `<b>확정</b> ${desk.gatesPassCount}/5${desk.isFullConfirm ? ' · MTF통과' : ''}${desk.mtfBlocked ? ' · MTF보류' : ''}`
  );
  if (p.prospectScore != null && p.prospectGrade) {
    lines.push(`<b>진입 참고</b> ${p.prospectScore}% · ${escapeTelegramHtml(p.prospectGrade)} (조건부)`);
  }
  if (p.temporalLine) lines.push(`<b>시간축</b> ${escapeTelegramHtml(p.temporalLine.slice(0, 160))}`);
  if (p.learningLine) lines.push(`<b>학습</b> ${escapeTelegramHtml(p.learningLine.slice(0, 120))}`);
  if (u?.sourceKo) lines.push(`<b>출처</b> ${escapeTelegramHtml(u.sourceKo.slice(0, 80))}`);
  lines.push('');
  lines.push(`<i>${escapeTelegramHtml(desk.notifyBody.slice(0, 200))}</i>`);
  lines.push('');
  lines.push('<i>참고·교육용 — 확정 매매·수익 보장 아님</i>');

  return lines.join('\n');
}

/** PNG 캡션용 — HTML 태그 없음 (sendPhoto caption 이스케이프 호환). */
export function formatTelegramUnifiedAlertPlainCaption(p: TelegramUnifiedAlertParams): string {
  const html = formatTelegramUnifiedAlertHtml(p);
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .slice(0, 1024);
}
