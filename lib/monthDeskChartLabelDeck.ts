import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MonthDeskUnifiedCoreMoney } from '@/lib/monthDeskUnifiedCoreMoney';
import { MONTH_DESK_TRAINER } from '@/lib/monthDeskChartTrainerTheme';

export const MONTH_DESK_CHART_DECK_ID = 'month-desk-chart-deck';

/** 차트 게이트·안착 요약 카드 — false면 오버레이 미표시(빌더는 유지) */
export const MONTH_DESK_CHART_DECK_VISIBLE = false;

const LEGACY_CHART_HUD_IDS = new Set([
  'month-desk-chart-verdict',
  'month-desk-chart-gates',
  'month-desk-chart-mtf',
  'month-desk-chart-closing-ref',
  'month-desk-chart-fusion-line',
  'month-desk-chart-alt-liq',
  'month-desk-chart-bos-tag',
  'month-desk-chart-choch-tag',
  'month-desk-chart-core-caption',
]);

const CLUTTER_LABEL_PREFIXES = [
  'hotzone-prob-',
  'phz-hot-dot-',
  'phz-hot-tag-',
  'phz-bullnum-',
  'phz-bearnum-',
  'phz-bullpath-',
  'phz-bearpath-',
];

function barStepMs(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 86_400_000;
  const d = Number(candles[n - 1]?.time) - Number(candles[n - 2]?.time);
  return Number.isFinite(d) && d > 0 ? d : 86_400_000;
}

function gateCount(cs: AnalyzeResponse['confirmedSignal']): number {
  if (!cs) return 0;
  return (
    cs.gatesPassCount ??
    [cs.structure, cs.rsi, cs.supportResistance, cs.close, cs.fvgZone].filter(Boolean).length
  );
}

export function buildMonthDeskChartDeckOverlay(input: {
  candles: Candle[];
  analysis?: AnalyzeResponse | null;
  ucm?: MonthDeskUnifiedCoreMoney | null;
  fusionHeadline?: string | null;
  fusionTooltip?: string | null;
  mtfSummaryKo?: string | null;
  closingRefKo?: string | null;
}): OverlayItem | null {
  const { candles, analysis, ucm, fusionHeadline, fusionTooltip, mtfSummaryKo, closingRefKo } = input;
  const n = candles.length;
  if (n < 4 || !analysis) return null;

  const last = candles[n - 1]!;
  const step = barStepMs(candles);
  /** 우측 빈 축(미래 구간) — 마지막 캔들 위를 가리지 않음 */
  const tHud = Number(last.time) + step * 8;

  const verdict = analysis.verdict;
  const conf = typeof analysis.confidence === 'number' ? Math.round(analysis.confidence) : null;
  const cs = analysis.confirmedSignal;
  const gates = gateCount(cs);
  const sz = analysis.settlementZone;
  const settleKo =
    sz && sz.state !== 'none'
      ? sz.state === 'confirmed'
        ? `안착✓${sz.grade}`
        : sz.state === 'failed'
          ? '안착✗'
          : `안착?${sz.grade}`
      : null;

  const dirKo = verdict === 'LONG' ? '롱' : verdict === 'SHORT' ? '숏' : '관망';
  const gateKo = cs?.confirmed
    ? `확정${gates}/5`
    : gates >= 4
      ? `후보${gates}/5`
      : `게이트${gates}/5`;

  const line1 = [dirKo, conf != null ? `${conf}%` : null].filter(Boolean).join(' ');
  const line2 = [gateKo, settleKo].filter(Boolean).join(' · ');
  const oneLine = line2 ? `${line1}\n${line2}` : line1;

  const tooltipLines = [
    `${dirKo}${conf != null ? ` · 신뢰 ${conf}%` : ''} · ${gateKo}`,
    settleKo && sz ? `안착 ${sz.state} ${sz.grade} · ${sz.direction} · ${sz.level ?? '–'}` : null,
    fusionHeadline ? `융합: ${fusionHeadline}` : null,
    mtfSummaryKo ? `MTF: ${mtfSummaryKo}` : null,
    closingRefKo ? closingRefKo : null,
    ucm?.tooltipKo ? `타점: ${ucm.tooltipKo}` : ucm?.labelKo ? `타점: ${ucm.labelKo}` : null,
    fusionTooltip || null,
    cs?.reasons?.length ? cs.reasons.slice(0, 3).join(' · ') : null,
  ].filter(Boolean) as string[];

  const accent =
    verdict === 'LONG'
      ? MONTH_DESK_TRAINER.long.border
      : verdict === 'SHORT'
        ? MONTH_DESK_TRAINER.short.border
        : MONTH_DESK_TRAINER.wait.entryLine;
  const statusBorder =
    sz?.state === 'failed'
      ? 'rgba(248,113,113,0.9)'
      : cs?.confirmed
        ? 'rgba(74,222,128,0.9)'
        : gates >= 4
          ? 'rgba(34,211,238,0.85)'
          : 'rgba(250,204,21,0.88)';

  return {
    id: MONTH_DESK_CHART_DECK_ID,
    kind: 'label',
    label: oneLine,
    x1: 0,
    y1: 0,
    time1: tHud,
    price1: Number(last.close),
    confidence: 99,
    color: accent,
    lineLabelColor: accent,
    labelBackgroundColor: 'rgba(8,12,28,0.96)',
    labelTextColor: '#f8fafc',
    category: 'scenario',
    labelTooltip: tooltipLines.join('\n'),
    overlayZoneExtraClass: 'overlay-zone--monthdesk-chart-hud overlay-pin--monthdesk-deck',
    noProject: true,
    labelBorderColor: statusBorder,
  } as OverlayItem & { labelBorderColor?: string };
}

export function filterMonthDeskChartHudDuplicates(items: OverlayItem[]): OverlayItem[] {
  const hasDeck = items.some((o) => o.id === MONTH_DESK_CHART_DECK_ID);
  const stripLegacyHud = hasDeck || !MONTH_DESK_CHART_DECK_VISIBLE;
  return items.filter((o) => {
    const id = String(o.id || '');
    const kind = String(o.kind || '');
    if (stripLegacyHud && LEGACY_CHART_HUD_IDS.has(id)) return false;
    if (CLUTTER_LABEL_PREFIXES.some((p) => id.startsWith(p))) return false;
    if (kind === 'label' && /참고 강도\(휴리스틱/i.test(String(o.label || ''))) return false;
    if (kind === 'label' && /구조돌파|추세전환|BOS|CHOCH/i.test(String(o.label || ''))) return false;
    return true;
  });
}
