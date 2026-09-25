/**
 * 마감·안착 차트 — 트레이너 작도용 zone·line·라벨 색 (다크 차트·네온 대비).
 * 교육·참고 표시용 — 수익·승률과 무관.
 */
export type MonthDeskTrainerSideColors = {
  zoneFill: string;
  coreFill: string;
  border: string;
  line: string;
  lineLabel: string;
  entryLine: string;
  labelBg: string;
  labelText: string;
  caption: string;
};

export const MONTH_DESK_TRAINER = {
  long: {
    zoneFill: 'rgba(16,185,129,0.09)',
    coreFill: 'rgba(52,211,153,0.11)',
    border: 'rgba(34,211,238,0.92)',
    line: 'rgba(45,212,191,0.9)',
    lineLabel: '#99f6e4',
    entryLine: 'rgba(34,211,238,0.98)',
    labelBg: 'rgba(6,78,59,0.94)',
    labelText: '#ccfbf1',
    caption: '#5eead4',
  } satisfies MonthDeskTrainerSideColors,
  short: {
    zoneFill: 'rgba(244,63,94,0.08)',
    coreFill: 'rgba(251,113,133,0.1)',
    border: 'rgba(232,121,249,0.9)',
    line: 'rgba(251,113,133,0.9)',
    lineLabel: '#fda4af',
    entryLine: 'rgba(232,121,249,0.98)',
    labelBg: 'rgba(88,28,36,0.94)',
    labelText: '#ffe4e6',
    caption: '#fb7185',
  } satisfies MonthDeskTrainerSideColors,
  money: {
    fillLong: 'rgba(255,214,10,0.1)',
    fillShort: 'rgba(255,183,77,0.09)',
    borderLong: 'rgba(34,211,238,0.75)',
    borderShort: 'rgba(232,121,249,0.72)',
    borderGold: 'rgba(255,214,10,0.96)',
    line: 'rgba(253,224,71,0.95)',
    lineSoft: 'rgba(255,214,10,0.55)',
    labelBg: 'rgba(69,26,3,0.94)',
    labelText: '#fff9c4',
    markBg: 'rgba(15,23,42,0.92)',
  },
  wait: {
    zoneFill: 'rgba(234,179,8,0.2)',
    coreFill: 'rgba(250,204,21,0.28)',
    lineLabel: '#fde68a',
    entryLine: 'rgba(250,204,21,0.98)',
    caption: '#fcd34d',
  },
  plan: {
    sl: 'rgba(255,77,109,0.98)',
    slSoft: 'rgba(248,113,113,0.75)',
    tp: 'rgba(45,212,191,0.95)',
    tpSoft: 'rgba(52,211,153,0.72)',
    eLong: 'rgba(34,211,238,0.98)',
    eShort: 'rgba(232,121,249,0.98)',
  },
} as const;

export function monthDeskTrainerSideColors(isLong: boolean): MonthDeskTrainerSideColors {
  return isLong ? MONTH_DESK_TRAINER.long : MONTH_DESK_TRAINER.short;
}

export function monthDeskTrainerMoneyColors(isLong: boolean) {
  const t = MONTH_DESK_TRAINER.money;
  const side = monthDeskTrainerSideColors(isLong);
  return {
    fill: isLong ? t.fillLong : t.fillShort,
    border: isLong ? t.borderLong : t.borderShort,
    borderGold: t.borderGold,
    line: t.line,
    lineSoft: t.lineSoft,
    bg: t.labelBg,
    text: t.labelText,
    markBg: t.markBg,
    sideLine: side.line,
    sideCaption: side.caption,
  };
}
