import { escapeTelegramHtml, tgHighlight, tgSection, tgSide } from '@/lib/telegramFormatHtml';
import type { ConfirmNotifyKind } from '@/lib/tradeConfirmDesk';
import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import {
  buildTelegramSignalPlaybookHtml,
  telegramAlertKindToPhase,
} from '@/lib/telegramSignalPlaybook';

const KIND_EMOJI: Record<ConfirmNotifyKind, string> = {
  candidate: '◐',
  confirmed: '●',
  confirmed_full: '✓',
  at_entry: '★',
  invalid: '⚠',
};

export function formatTelegramTradeConfirmHtml(params: {
  symbol: string;
  timeframe: string;
  desk: TradeConfirmDesk;
  taConfirmKo?: string;
  taInvalidKo?: string;
  uiModeKo?: string;
}): string {
  const { symbol, timeframe, desk, taConfirmKo, taInvalidKo, uiModeKo } = params;
  const kind = desk.notifyKind;
  if (!kind) return escapeTelegramHtml(`${symbol} ${timeframe}`);

  const emoji = KIND_EMOJI[kind];
  const dir = desk.direction === 'LONG' ? 'LONG' : desk.direction === 'SHORT' ? 'SHORT' : 'WAIT';
  const lines: string[] = [];

  lines.push(
    tgHighlight(
      `${emoji} ${desk.notifyTitle.replace(/^[✓●★◐⚠]\s*/, '')}`
    )
  );
  lines.push(
    `${tgSide(dir)} · <b>${escapeTelegramHtml(symbol)}</b> · ${escapeTelegramHtml(timeframe)}${
      uiModeKo ? ` · ${escapeTelegramHtml(uiModeKo)}` : ''
    }`
  );
  lines.push('');
  lines.push(`<b>상태</b> ${escapeTelegramHtml(desk.phaseKo)}`);
  lines.push(`<b>★ 타점</b> ${escapeTelegramHtml(desk.entryKo)}`);
  lines.push(`<b>🛡 확정·방어</b> ${escapeTelegramHtml(desk.confirmKo)}`);
  if (taConfirmKo) lines.push(`<b>확인</b> ${escapeTelegramHtml(taConfirmKo)}`);
  if (taInvalidKo) lines.push(`<b>무효</b> ${escapeTelegramHtml(taInvalidKo)}`);
  if (desk.invalidPrice != null) {
    const inv =
      desk.invalidPrice >= 1000
        ? desk.invalidPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : desk.invalidPrice.toFixed(2);
    lines.push(`<b>무효가</b> <code>${escapeTelegramHtml(inv)}</code>`);
  }
  if (desk.tp1 != null) {
    const tp =
      desk.tp1 >= 1000 ? desk.tp1.toLocaleString(undefined, { maximumFractionDigits: 2 }) : desk.tp1.toFixed(2);
    lines.push(`<b>TP1</b> <code>${escapeTelegramHtml(tp)}</code>`);
  }
  lines.push(
    `<b>확정</b> ${desk.gatesPassCount}/5${desk.isFullConfirm ? ' · MTF통과' : ''}${desk.mtfBlocked ? ' · MTF보류' : ''}`
  );

  lines.push(
    '',
    buildTelegramSignalPlaybookHtml({
      side: dir,
      price: desk.close ?? desk.entryLow ?? 0,
      entry: desk.entryLow ?? null,
      sl: desk.invalidPrice ?? null,
      tp1: desk.tp1 ?? null,
      phase: telegramAlertKindToPhase(kind),
      noteKo: desk.notifyBody?.slice(0, 180),
    })
  );

  lines.push('');
  lines.push(`<i>참고·교육용 — 확정 매매 아님</i>`);

  return lines.join('\n');
}
