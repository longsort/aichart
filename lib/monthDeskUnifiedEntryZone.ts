/**
 * 마감·안착 — **통합 $$$$ 핵심타점** 1개 (롱·숏 풀 병합).
 */
import type { Candle, OverlayItem } from '@/types';
import { MONTH_DESK_CORE_MONEY_ENTRY_ID, monthDeskMoneyDirectionHint } from '@/lib/monthDeskMoneyZone';
import type { MonthDeskSmcMoneyPackHud } from '@/lib/monthDeskSmcMoneyPack';
import type { MonthDeskUnifiedCoreMoney } from '@/lib/monthDeskUnifiedCoreMoney';
import { resolveMonthDeskUnifiedCoreMoney } from '@/lib/monthDeskUnifiedCoreMoney';
import { buildMonthDeskDualCoreMoneyOverlays } from '@/lib/monthDeskDualCoreEntry';

/** compact: 중복 포켓·FVG·플랜 면만 숨김 — 연합 zone은 clear에서 유지( money 없을 때 ) */
const COMPACT_HIDE_ZONE_IDS = new Set([
  'month-desk-typeom-pocket-zone',
  'month-desk-typeom-pocket-core',
  'month-desk-typeom-fvg-zone',
  'month-desk-plan-risk-zone',
  'month-desk-plan-reward-zone',
]);

const COMPACT_STRIP_LABEL_PREFIXES = [
  'month-desk-typeom-eq-mid',
  'month-desk-typeom-ob-',
  'month-desk-typeom-leg-',
  'month-desk-typeom-deep-',
  'month-desk-typeom-tp-zone',
  'month-desk-typeom-entry',
  'smc-entry-playbook-',
  'month-desk-money-',
  'month-desk-smc-',
];

const FUSION_ZONE_IDS = new Set([
  'month-desk-unified-zone',
  'month-desk-unified-core',
  'month-desk-typeom-pocket-zone',
  'month-desk-typeom-pocket-core',
]);

export type MonthDeskUnifiedEntryZoneOptions = {
  compactLabels?: boolean;
  fusionDirection?: 'LONG' | 'SHORT' | 'WAIT' | null;
  fusionScoreLong?: number;
  fusionScoreShort?: number;
  timeframe?: string;
};

function inferPreferSide(items: OverlayItem[]): 'LONG' | 'SHORT' | null {
  const u = items.find((o) => o.id === 'month-desk-unified-zone');
  if (!u) return null;
  const label = String(u.label || '');
  if (/롱|LONG/i.test(label) && !/숏|SHORT/i.test(label)) return 'LONG';
  if (/숏|SHORT/i.test(label) && !/롱|LONG/i.test(label)) return 'SHORT';
  const k = String(u.kind || '');
  if (k === 'demandZone') return 'LONG';
  if (k === 'supplyZone') return 'SHORT';
  return null;
}

function shouldStripLabelCompact(id: string): boolean {
  if (COMPACT_HIDE_ZONE_IDS.has(id)) return true;
  if (id.startsWith('month-desk-money-')) return true;
  if (id.startsWith('month-desk-entry-unified')) return true;
  return COMPACT_STRIP_LABEL_PREFIXES.some((p) => id.startsWith(p));
}

function appendTooltip(existing: string | undefined, extra: string): string {
  const base = String(existing || '').trim();
  if (!base) return extra;
  if (base.includes(extra.slice(0, 24))) return base;
  return `${base}\n${extra}`;
}

function enrichFusionZonesWithCoreMoney(
  items: OverlayItem[],
  ucm: MonthDeskUnifiedCoreMoney,
  fusionNote?: string
): OverlayItem[] {
  const cross = [ucm.labelKo, monthDeskMoneyDirectionHint(ucm.side), fusionNote ? `연합: ${fusionNote}` : '']
    .filter(Boolean)
    .join(' · ');

  return items.map((o) => {
    const id = String(o.id || '');
    if (!FUSION_ZONE_IDS.has(id)) return o;
    return {
      ...o,
      labelTooltip: appendTooltip(o.labelTooltip as string | undefined, `통합 $$$$: ${cross}`),
      overlayZoneExtraClass: String(o.overlayZoneExtraClass || '').includes('monthdesk-fusion-money-xref')
        ? o.overlayZoneExtraClass
        : `${String(o.overlayZoneExtraClass || '').trim()} overlay-zone--monthdesk-fusion-money-xref`.trim(),
    };
  });
}

function applyCompactLegacy(items: OverlayItem[], coreOverlays: OverlayItem[]): OverlayItem[] {
  const out: OverlayItem[] = [];
  for (const o of items) {
    const id = String(o.id || '');
    if (COMPACT_HIDE_ZONE_IDS.has(id)) continue;
    if (shouldStripLabelCompact(id)) {
      if (id.startsWith('month-desk-plan-')) {
        const keep =
          id === 'month-desk-plan-entry' ||
          id === 'month-desk-plan-sl' ||
          id.startsWith('month-desk-plan-tp');
        out.push(keep ? o : { ...o, label: '' });
        continue;
      }
      out.push({ ...o, label: '' });
      continue;
    }
    out.push(o);
  }
  return [...out, ...coreOverlays];
}

export function applyMonthDeskUnifiedEntryZone(
  items: OverlayItem[],
  hud: MonthDeskSmcMoneyPackHud | null,
  candles: Candle[] = [],
  options?: MonthDeskUnifiedEntryZoneOptions
): OverlayItem[] {
  if (!hud?.pools?.length || candles.length < 12) return items;

  const preferSide = inferPreferSide(items) ?? options?.fusionDirection ?? null;
  const close = Number(candles[candles.length - 1]?.close);
  const ucm = resolveMonthDeskUnifiedCoreMoney({
    pools: hud.pools,
    close,
    preferSide: preferSide === 'LONG' || preferSide === 'SHORT' ? preferSide : null,
    fusionDirection: options?.fusionDirection ?? null,
    fusionScoreLong: options?.fusionScoreLong,
    fusionScoreShort: options?.fusionScoreShort,
  });

  const fusionZone = items.find((o) => o.id === 'month-desk-unified-zone');
  const fusionNote = fusionZone ? String(fusionZone.label || '').trim() : undefined;

  const coreOverlays = buildMonthDeskDualCoreMoneyOverlays({
    pools: hud.pools,
    candles,
    timeframe: options?.timeframe,
    fusionNote,
  });
  if (!coreOverlays.length) return items;

  if (options?.compactLabels === true) {
    return applyCompactLegacy(items, coreOverlays);
  }

  const enriched = ucm ? enrichFusionZonesWithCoreMoney(items, ucm, fusionNote) : items;
  const withoutDupCore = enriched.filter(
    (o) =>
      !String(o.id || '').startsWith('month-desk-core-money-') ||
      o.id === 'month-desk-core-money-liq'
  );
  return [...withoutDupCore.filter((o) => o.id !== 'month-desk-core-money-liq'), ...coreOverlays];
}

export const applyMonthDeskCoreMoneyEntryZone = applyMonthDeskUnifiedEntryZone;
