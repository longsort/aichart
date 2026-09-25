import type { OverlayItem } from '@/types';
import { isMonthDeskChartHtf, monthDeskHasEliteTradeDesk } from '@/lib/monthDeskChartTidy';
import { MONTH_DESK_CORE_MONEY_ENTRY_ID } from '@/lib/monthDeskMoneyZone';
import { normalizeChartTimeframe } from '@/lib/constants';

function isZoneLike(o: OverlayItem): boolean {
  const kind = String(o.kind || '');
  const cat = String((o as { category?: string }).category || '');
  return (
    kind === 'zone' ||
    kind === 'fvg' ||
    kind === 'ob' ||
    kind === 'supplyZone' ||
    kind === 'demandZone' ||
    kind === 'bprZone' ||
    kind === 'reactionZone' ||
    cat === 'reactionZone'
  );
}

/** rgba 문자열 알파만 배율 조정 — 레이어 제거 없이 배경·전경 구분 */
export function scaleRgbaAlpha(color: string | undefined, mult: number): string | undefined {
  if (!color || mult >= 0.999) return color;
  const m = String(color).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/i);
  if (!m) return color;
  const a0 = m[4] != null ? Number(m[4]) : 1;
  const a = Math.max(0.035, Math.min(0.42, a0 * mult));
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
}

function appendClass(extra: string | undefined, cls: string): string {
  const base = String(extra || '').trim();
  return base.includes(cls) ? base : base ? `${base} ${cls}` : cls;
}

function priceOf(o: OverlayItem | undefined): number | null {
  if (!o) return null;
  const p = Number(o.price1);
  return Number.isFinite(p) && p > 0 ? p : null;
}

function relDiff(a: number, b: number): number {
  const m = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / m;
}

function zoneAlphaMult(id: string): number {
  if (id.startsWith('hotzone-')) return 0.42;
  if (id.startsWith('phz-')) return 0.45;
  if (id.startsWith('month-desk-plan-')) return 0.7;
  if (id.startsWith('month-desk-unified')) return 0.48;
  if (id.startsWith('month-desk-typeom-fvg')) return 0.5;
  if (
    id === 'month-desk-core-money-entry' ||
    id === 'month-desk-core-money-long' ||
    id === 'month-desk-core-money-short'
  )
    return 0.38;
  if (id.startsWith('month-desk-history-money-')) return 0.38;
  if (id === 'month-desk-entry-unified') return 0.44;
  if (id.startsWith('month-desk-money-')) return 0.38;
  if (id.startsWith('month-desk-typeom-')) return 0.5;
  if (id.startsWith('whale-auto-bu-ob')) return 0.55;
  return 0.5;
}

/**
 * 마감·안착: 초록·빨강 존 면을 얇게 — 기능 유지, 캔들 가독 우선.
 */
export function softenMonthDeskZoneOverlays(items: OverlayItem[], chartTf?: string): OverlayItem[] {
  const htfThin = chartTf ? isMonthDeskChartHtf(normalizeChartTimeframe(chartTf)) : false;
  return items.map((raw) => {
    const id = String(raw.id || '');
    if (!isZoneLike(raw)) return raw;
    let mult = zoneAlphaMult(id);
    const extra = String(raw.overlayZoneExtraClass || '');
    if (extra.includes('overlay-zone--monthdesk-core-emphasis')) mult *= 1.22;
    if (extra.includes('overlay-zone--monthdesk-core-dim')) mult *= 0.52;
    if (htfThin) {
      if (id.startsWith('phz-') && !id.includes('-core')) mult *= 0.55;
      if (id.startsWith('hotzone-')) mult *= 0.5;
      if (id.startsWith('month-desk-typeom-')) mult *= 0.45;
    }
    let o: OverlayItem = {
      ...raw,
      color: scaleRgbaAlpha(raw.color as string | undefined, mult) ?? raw.color,
      zoneFillPreserve: true,
    };
    if (id.startsWith('phz-')) {
      o.overlayZoneExtraClass = appendClass(o.overlayZoneExtraClass, 'overlay-zone--monthdesk-context-phz');
      if (/-core$/.test(id) || id.endsWith('-core')) {
        o.overlayZoneExtraClass = appendClass(
          o.overlayZoneExtraClass,
          'overlay-zone--monthdesk-phz-core overlay-zone--core-pulse'
        );
      } else if (/-pull-\d+$/.test(id) || /-pull-/.test(id)) {
        o.overlayZoneExtraClass = appendClass(o.overlayZoneExtraClass, 'overlay-zone--monthdesk-phz-pull');
      } else if (/-supply$/.test(id)) {
        o.overlayZoneExtraClass = appendClass(o.overlayZoneExtraClass, 'overlay-zone--monthdesk-phz-supply');
      }
    }
    if (id.startsWith('hotzone-')) {
      o.overlayZoneExtraClass = appendClass(
        o.overlayZoneExtraClass,
        'overlay-zone--monthdesk-context-hotzone overlay-zone--monthdesk-hotzone-entry'
      );
    }
    if (id.startsWith('month-desk-typeom-')) {
      o.overlayZoneExtraClass = appendClass(o.overlayZoneExtraClass, 'overlay-zone--monthdesk-layer-typeom');
    }
    if (id.startsWith('month-desk-unified')) {
      o.overlayZoneExtraClass = appendClass(o.overlayZoneExtraClass, 'overlay-zone--monthdesk-layer-unified');
    }
    return o;
  });
}

/**
 * 마감·안착: 연합·타입옴·phz·HotZone 가격·라벨 정합 (면 알파는 soften에서 처리).
 */
export type HarmonizeMonthDeskOptions = {
  /** 필터 전 typeom 팩 — plan·unified 가격 앵커 */
  anchorItems?: OverlayItem[];
};

export function harmonizeMonthDeskOverlayStack(
  items: OverlayItem[],
  options?: HarmonizeMonthDeskOptions
): OverlayItem[] {
  const anchors = options?.anchorItems?.length ? options.anchorItems : items;
  const hasElite = monthDeskHasEliteTradeDesk(items) || monthDeskHasEliteTradeDesk(anchors);
  if (!hasElite) return items;

  const planEntry =
    anchors.find((o) => o.id === 'month-desk-plan-entry') ?? items.find((o) => o.id === 'month-desk-plan-entry');
  const planSl =
    anchors.find((o) => String(o.id) === 'month-desk-plan-sl') ??
    items.find((o) => String(o.id) === 'month-desk-plan-sl');
  const planTp1 =
    anchors.find((o) => o.id === 'month-desk-plan-tp1') ?? items.find((o) => o.id === 'month-desk-plan-tp1');
  const entryPx = priceOf(planEntry);
  const slPx = priceOf(planSl);
  const tp1Px = priceOf(planTp1);
  const unifiedZone =
    anchors.find((o) => o.id === 'month-desk-unified-zone') ??
    items.find((o) => o.id === 'month-desk-unified-zone');
  const zoneTop = unifiedZone ? Number(unifiedZone.price1) : null;
  const zoneBot = unifiedZone ? Number(unifiedZone.price2) : null;

  return items.map((raw) => {
    const id = String(raw.id || '');
    const kind = String(raw.kind || '');
    let o: OverlayItem = { ...raw };

    if (id === 'month-desk-plan-risk-zone' || id === 'month-desk-plan-reward-zone') {
      o.overlayZoneExtraClass = appendClass(o.overlayZoneExtraClass, 'overlay-zone--monthdesk-layer-plan');
    }

    if (slPx != null && /-supply$/.test(id) && isZoneLike(o)) {
      const top = Number(o.price1);
      const bot = Number(o.price2);
      if (Number.isFinite(top) && Number.isFinite(bot)) {
        const isShortCtx = entryPx != null && entryPx < slPx;
        if (isShortCtx && relDiff(top, slPx) < 0.025) {
          o = {
            ...o,
            price1: Math.max(top, slPx),
            labelTooltip: `${String(o.labelTooltip || o.label || '')}\n연합 SL ${slPx.toFixed(2)} 정합`.trim(),
          };
        }
        if (!isShortCtx && relDiff(bot, slPx) < 0.025) {
          o = {
            ...o,
            price2: Math.min(bot, slPx),
            labelTooltip: `${String(o.labelTooltip || o.label || '')}\n연합 SL ${slPx.toFixed(2)} 정합`.trim(),
          };
        }
      }
    }

    if (id === MONTH_DESK_CORE_MONEY_ENTRY_ID && entryPx != null) {
      o = {
        ...o,
        labelTooltip: `${String(o.labelTooltip || o.label || '')}\n연합 E ${entryPx.toFixed(2)} 정합`.trim(),
      };
    }

    if (
      entryPx != null &&
      /-core$/.test(id) &&
      zoneTop != null &&
      zoneBot != null &&
      relDiff(entryPx, (zoneTop + zoneBot) / 2) < 0.02
    ) {
      const half = Math.max((zoneTop - zoneBot) * 0.5, Math.abs(zoneTop - zoneBot) * 0.08);
      o = {
        ...o,
        price1: entryPx + half * 0.55,
        price2: entryPx - half * 0.55,
        labelTooltip: `${String(o.labelTooltip || o.label || '')}\n연합 E ${entryPx.toFixed(2)} 중심`.trim(),
      };
    }

    if (id === 'month-desk-typeom-entry' && entryPx != null) {
      o = { ...o, label: 'E·구조', lineStrokeWidth: Math.min(3, Number(o.lineStrokeWidth) || 3) };
    }
    if (id === 'month-desk-plan-entry') {
      o = {
        ...o,
        label: 'E·연합',
        lineStrokeWidth: Math.max(3, Number(o.lineStrokeWidth) || 3),
      };
    }
    if (/^phz-tp[123]-/.test(id) && tp1Px != null && priceOf(o) != null && relDiff(priceOf(o)!, tp1Px) < 0.008) {
      o = {
        ...o,
        label: `${o.label || 'TP'}·피보`,
        lineDash: '4 7',
        labelTooltip: `${String(o.labelTooltip || '')}\n연합 TP1 ${tp1Px.toFixed(2)} 근접 — 피보·파동 참고`.trim(),
      };
    }

    if (kind === 'keyLevel' && id.startsWith('phz-')) {
      o.lineStrokeWidth = Math.min(2, Number(o.lineStrokeWidth) || 2);
    }

    return o;
  });
}
