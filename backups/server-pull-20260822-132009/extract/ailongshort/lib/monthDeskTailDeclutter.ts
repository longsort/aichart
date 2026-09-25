/**
 * 마감·안착 — **마지막 캔들(우측 꼬리) 가독성** 정리.
 * 분석 레이어·선·존은 유지하고, 겹치는 HTML 라벨·우측 zone 면적만 정돈한다.
 */
import type { Candle, OverlayItem } from '@/types';
import { scaleRgbaAlpha } from '@/lib/monthDeskOverlayHarmonize';

export const MONTH_DESK_TAIL_QUIET_CLASS = 'overlay-zone--monthdesk-tail-quiet';

const CORE_TAIL_LABEL_IDS = new Set([
  'month-desk-core-money-entry',
  'month-desk-core-money-long',
  'month-desk-core-money-short',
  'month-desk-pin-confirmed',
  'month-desk-pin-candidate',
  'month-desk-pin-structure-bos',
  'month-desk-pin-structure-choch',
  'month-desk-pin-settle',
  'month-desk-plan-entry',
  'month-desk-chart-deck',
]);

const CORE_TAIL_LABEL_PREFIXES = ['ob-pre-beam-pin-'];

const ALWAYS_QUIET_LABEL_IDS = new Set([
  'month-desk-unified-zone',
  'month-desk-unified-core',
  'month-desk-typeom-pocket-zone',
  'month-desk-typeom-pocket-core',
  'month-desk-plan-risk-zone',
  'month-desk-plan-reward-zone',
]);

const ALWAYS_QUIET_LABEL_PREFIXES = [
  'month-desk-plan-tp',
  'month-desk-plan-sl',
  'month-desk-typeom-eq-mid',
  'month-desk-typeom-ob-',
  'month-desk-typeom-leg-',
  'month-desk-typeom-deep-',
  'month-desk-typeom-tp-zone',
  'month-desk-typeom-entry',
  'month-desk-typeom-fvg',
  'smc-entry-playbook-',
  'month-desk-money-',
  'hotzone-prob-',
  'month-desk-chart-verdict',
  'month-desk-chart-gates',
  'month-desk-chart-bos-tag',
  'month-desk-chart-choch-tag',
  'phz-hot-dot-',
  'phz-hot-tag-',
  'phz-bullnum-',
  'phz-bearnum-',
];

const TAIL_ZONE_CLIP_PREFIXES = [
  'month-desk-plan-risk',
  'month-desk-plan-reward',
  'month-desk-typeom-pocket',
  'month-desk-typeom-fvg',
  'month-desk-unified',
  'smc-entry-playbook-zone',
  'smc-entry-playbook-htf-poi',
  'smc-entry-playbook-ltf-poi',
  'smc-entry-playbook-ote',
  'smc-entry-playbook-ifvg',
  'hotzone-',
  'phz-',
];

function barStepMs(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 86_400_000;
  const a = Number(candles[n - 1]?.time);
  const b = Number(candles[n - 2]?.time);
  const d = a - b;
  return Number.isFinite(d) && d > 0 ? d : 86_400_000;
}

function overlayTimes(o: OverlayItem): { t1: number | null; t2: number | null } {
  const t1 = o.time1 != null ? Number(o.time1) : null;
  const t2 = o.time2 != null ? Number(o.time2) : o.time1 != null ? Number(o.time1) : null;
  return {
    t1: t1 != null && Number.isFinite(t1) ? t1 : null,
    t2: t2 != null && Number.isFinite(t2) ? t2 : null,
  };
}

function touchesTail(o: OverlayItem, tailStart: number, lastTime: number): boolean {
  const { t1, t2 } = overlayTimes(o);
  if (t1 != null && t1 >= tailStart) return true;
  if (t2 != null && t2 >= tailStart) return true;
  const kind = String(o.kind || '');
  if ((kind === 'label' || kind === 'swingLabel' || kind === 'poi') && t1 != null && t1 >= lastTime - 1) return true;
  return false;
}

function appendQuietClass(extra: string | undefined): string {
  const base = String(extra || '').trim();
  return base.includes(MONTH_DESK_TAIL_QUIET_CLASS)
    ? base
    : base
      ? `${base} ${MONTH_DESK_TAIL_QUIET_CLASS}`
      : MONTH_DESK_TAIL_QUIET_CLASS;
}

function shouldQuietLabel(id: string): boolean {
  if (CORE_TAIL_LABEL_IDS.has(id)) return false;
  if (CORE_TAIL_LABEL_PREFIXES.some((p) => id.startsWith(p))) return false;
  if (ALWAYS_QUIET_LABEL_IDS.has(id)) return true;
  return ALWAYS_QUIET_LABEL_PREFIXES.some((p) => id.startsWith(p));
}

function shouldClipZoneEnd(id: string): boolean {
  if (
    id === 'month-desk-core-money-entry' ||
    id === 'month-desk-core-money-long' ||
    id === 'month-desk-core-money-short'
  )
    return false;
  return TAIL_ZONE_CLIP_PREFIXES.some((p) => id.startsWith(p) || id === p);
}

function isZoneLike(o: OverlayItem): boolean {
  const kind = String(o.kind || '');
  const cat = String(o.category || '');
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

/** 우측 꼬리 구간 declutter — candles 최소 8개 */
export function declutterMonthDeskTailOverlays(items: OverlayItem[], candles: Candle[]): OverlayItem[] {
  const n = candles.length;
  if (n < 8) return items;

  const lastTime = Number(candles[n - 1]?.time);
  if (!Number.isFinite(lastTime)) return items;

  const step = barStepMs(candles);
  const tailBars = n >= 120 ? 12 : n >= 60 ? 10 : 8;
  const tailStart = lastTime - step * tailBars;
  const clipEnd = lastTime - step * 2;

  const seenLinePrice = new Map<string, string>();
  const refPx = Number(candles[n - 1]?.close) || 1;

  return items.map((raw) => {
    const id = String(raw.id || '');
    if (!touchesTail(raw, tailStart, lastTime)) return raw;

    let o: OverlayItem = { ...raw };

    if (shouldQuietLabel(id)) {
      const tip = String(o.labelTooltip || o.label || '').trim();
      o = {
        ...o,
        label: '',
        labelTooltip: tip || o.labelTooltip,
        overlayZoneExtraClass: appendQuietClass(o.overlayZoneExtraClass),
      };
    }

    if (id === 'smc-entry-playbook-phase') {
      const tip = [o.labelTooltip, o.label].filter(Boolean).join('\n');
      o = {
        ...o,
        label: '',
        time1: Math.min(Number(o.time1) || lastTime, lastTime - step * 6),
        labelTooltip: tip,
        overlayZoneExtraClass: appendQuietClass(o.overlayZoneExtraClass),
      };
    }

    if (id === 'smc-entry-playbook-checklist') {
      o = { ...o, label: '', overlayZoneExtraClass: appendQuietClass(o.overlayZoneExtraClass) };
    }

    if (isZoneLike(o) && shouldClipZoneEnd(id)) {
      const t2 = o.time2 != null ? Number(o.time2) : null;
      if (t2 != null && t2 >= lastTime - step) {
        o = {
          ...o,
          time2: Math.max(Number(o.time1) || clipEnd, clipEnd),
          color: scaleRgbaAlpha(o.color as string | undefined, 0.72) ?? o.color,
          overlayZoneExtraClass: appendQuietClass(o.overlayZoneExtraClass),
        };
      } else if (touchesTail(o, tailStart, lastTime)) {
        o = {
          ...o,
          color: scaleRgbaAlpha(o.color as string | undefined, 0.8) ?? o.color,
          overlayZoneExtraClass: appendQuietClass(o.overlayZoneExtraClass),
        };
      }
    }

    const kind = String(o.kind || '');
    if (kind === 'keyLevel' || kind === 'trendLine' || kind === 'supportLine' || kind === 'resistanceLine') {
      const px = Number(o.price1);
      const isCoreLinReg =
        id === 'parkf-lr-base' ||
        id === 'parkf-lr-lg-u' ||
        id === 'parkf-lr-lg-d' ||
        id.startsWith('whale-alr-0-ch-');
      if (Number.isFinite(px) && !isCoreLinReg) {
        const bucket = String(Math.round(px / Math.max(refPx * 0.0015, 1e-9)));
        const prev = seenLinePrice.get(bucket);
        if (prev && prev !== id && !CORE_TAIL_LABEL_IDS.has(id)) {
          o = { ...o, label: '', overlayZoneExtraClass: appendQuietClass(o.overlayZoneExtraClass) };
        } else {
          seenLinePrice.set(bucket, id);
        }
      }
      if (id.startsWith('month-desk-plan-tp') || id.startsWith('phz-tp')) {
        o = { ...o, label: '', overlayZoneExtraClass: appendQuietClass(o.overlayZoneExtraClass) };
      }
    }

    if (kind === 'label' && !CORE_TAIL_LABEL_IDS.has(id)) {
      o = { ...o, label: '', overlayZoneExtraClass: appendQuietClass(o.overlayZoneExtraClass) };
    }

    return o;
  });
}
