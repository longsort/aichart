/**
 * 통합 텔레그램 알림 HTML — 확정·타점·무효 + E/SL/TP + 터치전/후·현물%·선물.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import { escapeTelegramHtml, tgHighlight, tgSection, tgSide } from '@/lib/telegramFormatHtml';
import type { ConfirmNotifyKind } from '@/lib/tradeConfirmDesk';
import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import { tpHitLabel, type TelegramTpHitKind } from '@/lib/telegramServerTpHit';
import {
  buildTelegramSignalPlaybookHtml,
  telegramAlertKindToPhase,
} from '@/lib/telegramSignalPlaybook';
import { sanitizeTelegramPrice, sanitizeTelegramTradeLevels } from '@/lib/telegramSymbolPriceGuard';

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
  const u = p.unified;
  const pxRaw = p.currentPrice ?? desk.close;
  const px = sanitizeTelegramPrice(symbol, Number(pxRaw) || 0, pxRaw) ?? (Number(pxRaw) > 0 ? Number(pxRaw) : null);
  const anchor = px && px > 0 ? px : Number(desk.close) || 0;
  const scrubbed = sanitizeTelegramTradeLevels(symbol, anchor, {
    entry: u?.entry ?? desk.entryLow ?? desk.close,
    sl: u?.sl ?? desk.invalidPrice,
    tp1: u?.tp1 ?? desk.tp1,
    tp2: u?.tp2 ?? null,
    tp3: u?.tp3 ?? null,
    inv: u?.inv ?? desk.invalidPrice,
  });
  const entry = scrubbed.entry;
  const sl = scrubbed.sl;
  const tp1 = scrubbed.tp1;
  const tp2 = scrubbed.tp2;
  const tp3 = scrubbed.tp3;
  const invPx = scrubbed.inv;

  const lines: string[] = [];
  lines.push(tgHighlight(`${emoji} ${title} · ${symbol}`));
  lines.push(`${tgSide(dir)} · ${escapeTelegramHtml(timeframe)}${p.serverAuto ? ' · 서버 자동' : ''}`);
  lines.push('');
  lines.push(`<b>상태</b> ${escapeTelegramHtml(desk.phaseKo)}`);
  if (px != null) lines.push(`<b>현재</b> <code>${escapeTelegramHtml(fmtPx(px))}</code>`);
  lines.push(`<b>★ 타점</b> ${escapeTelegramHtml(desk.entryKo)}`);
  lines.push(`<b>🛡 방어</b> ${escapeTelegramHtml(desk.confirmKo)}`);
  lines.push('');
  lines.push(tgSection('진입·손절·목표'));
  lines.push(`<b>E</b>  <code>${escapeTelegramHtml(fmtPx(entry))}</code>`);
  lines.push(
    `<b>SL</b> <code>${escapeTelegramHtml(fmtPx(sl))}</code>${px && sl ? ` (${escapeTelegramHtml(pct(px, sl))})` : ''}`
  );
  if (tp1 != null) {
    lines.push(
      `<b>TP1</b> <code>${escapeTelegramHtml(fmtPx(tp1))}</code>${px ? ` (${escapeTelegramHtml(pct(px, tp1))})` : ''}`
    );
  }
  if (tp2 != null) lines.push(`<b>TP2</b> <code>${escapeTelegramHtml(fmtPx(tp2))}</code>`);
  if (tp3 != null) lines.push(`<b>TP3</b> <code>${escapeTelegramHtml(fmtPx(tp3))}</code>`);
  if (invPx != null) {
    lines.push(`<b>무효</b> <code>${escapeTelegramHtml(fmtPx(invPx))}</code> 이탈 시 재검토`);
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

  lines.push(
    '',
    buildTelegramSignalPlaybookHtml({
      side: dir,
      price: px ?? entry ?? 0,
      entry: entry ?? null,
      sl: sl ?? null,
      tp1: tp1 ?? null,
      tp2: tp2 ?? null,
      tp3: tp3 ?? null,
      phase: telegramAlertKindToPhase(kind),
      noteKo: desk.notifyBody?.slice(0, 200),
    })
  );

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
