/**
 * 마감·안착 — 프로 차트 작도 (clear 기본).
 * zone / line / label 역할 분리 · 점선·실선 통일 · 과밀 레이어 축소.
 */
import type { OverlayItem } from '@/types';
import {
  isMonthDeskClearEssentialOverlay,
  isMonthDeskClearNoiseOverlay,
} from '@/lib/monthDeskClearEssentials';

export type MonthDeskProDensity = 'clear' | 'rich';

const CORE_ZONE_IDS = new Set([
  'month-desk-core-money-long',
  'month-desk-core-money-short',
  'month-desk-core-money-entry',
]);

const PRO_LABEL_IDS = new Set([
  'month-desk-chart-deck',
  'month-desk-pin-confirmed',
  'month-desk-pin-candidate',
  'month-desk-pin-structure-bos',
  'month-desk-pin-structure-choch',
  'month-desk-pin-settle',
  'month-desk-plan-entry',
  'month-desk-plan-sl',
  'month-desk-plan-tp1',
]);

const PRO_LINE_IDS = new Set([
  'month-desk-plan-entry',
  'month-desk-plan-sl',
  'month-desk-plan-tp1',
  'month-desk-core-money-long-liq',
  'month-desk-core-money-short-liq',
  'month-desk-typeom-entry',
  'month-desk-typeom-sl',
  'trade-atlas-entry',
  'trade-atlas-sl',
  'trade-atlas-tp1',
  'trade-atlas-tp2',
  'trade-atlas-tp3',
]);

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
    cat === 'reactionZone' ||
    cat === 'zones'
  );
}

function appendClass(extra: string | undefined, cls: string): string {
  const base = String(extra || '').trim();
  return base.includes(cls) ? base : base ? `${base} ${cls}` : cls;
}

export type MonthDeskVisualRole =
  | 'core-long'
  | 'core-short'
  | 'history'
  | 'ob'
  | 'entry'
  | 'sl'
  | 'tp'
  | 'structure'
  | 'liq'
  | 'ref'
  | 'pin'
  | 'other';

export function resolveMonthDeskVisualRole(o: OverlayItem): MonthDeskVisualRole {
  const id = String(o.id || '');
  const kind = String(o.kind || '');
  if (CORE_ZONE_IDS.has(id) || id === 'month-desk-core-money-long' || id === 'month-desk-core-money-short') {
    return id.includes('short') || kind === 'supplyZone' ? 'core-short' : 'core-long';
  }
  if (id.startsWith('month-desk-history-money-')) {
    return id.includes('short') ? 'core-short' : 'core-long';
  }
  if (id.startsWith('ob-pre-beam')) return 'ob';
  if (id === 'month-desk-plan-entry' || id === 'month-desk-typeom-entry' || id === 'trade-atlas-entry') return 'entry';
  if (id === 'month-desk-plan-sl' || id === 'month-desk-typeom-sl' || id === 'trade-atlas-sl') return 'sl';
  if (id.startsWith('month-desk-plan-tp') || id.startsWith('trade-atlas-tp')) return 'tp';
  if (kind === 'bos' || kind === 'choch' || id.startsWith('month-desk-smc-')) return 'structure';
  if (id.endsWith('-liq')) return 'liq';
  if (id.startsWith('month-desk-pin-') || id === 'month-desk-chart-deck') return 'pin';
  if (id.startsWith('key-') || id.startsWith('month-desk-typeom-eq')) return 'ref';
  return 'other';
}

function roleZoneClass(role: MonthDeskVisualRole): string | null {
  switch (role) {
    case 'core-long':
      return 'overlay-zone--md-pro-core-long';
    case 'core-short':
      return 'overlay-zone--md-pro-core-short';
    case 'history':
      return 'overlay-zone--md-pro-history';
    case 'ob':
      return 'overlay-zone--md-pro-ob';
    default:
      return null;
  }
}

function roleLineClass(role: MonthDeskVisualRole): string | null {
  switch (role) {
    case 'entry':
      return 'overlay-line--md-pro-entry';
    case 'sl':
      return 'overlay-line--md-pro-sl';
    case 'tp':
      return 'overlay-line--md-pro-tp';
    case 'structure':
      return 'overlay-line--md-pro-structure';
    case 'liq':
      return 'overlay-line--md-pro-liq';
    case 'ref':
      return 'overlay-line--md-pro-ref';
    default:
      return null;
  }
}

function defaultDash(role: MonthDeskVisualRole, kind: string): string | undefined {
  if (role === 'entry') return undefined;
  if (role === 'sl') return '8 5';
  if (role === 'tp') return '4 6';
  if (role === 'structure') return '6 4';
  if (role === 'liq') return '6 4';
  if (role === 'ref') return '3 5';
  if (kind === 'fibLine') return '2 4';
  return undefined;
}

function proLineLabel(id: string, fallback: string): string {
  if (id === 'month-desk-plan-entry' || id === 'month-desk-typeom-entry' || id === 'trade-atlas-entry') return 'E';
  if (id === 'month-desk-plan-sl' || id === 'month-desk-typeom-sl' || id === 'trade-atlas-sl') return 'SL';
  if (id === 'month-desk-plan-tp1' || id === 'trade-atlas-tp1') return 'TP1';
  if (id === 'month-desk-plan-tp2' || id === 'trade-atlas-tp2') return 'TP2';
  if (id === 'month-desk-plan-tp3' || id === 'trade-atlas-tp3') return 'TP3';
  if (id === 'month-desk-core-long-entry') return 'E';
  if (id === 'month-desk-core-long-bounce') return '반등';
  if (id === 'month-desk-core-long-sl') return 'SL';
  if (id.startsWith('month-desk-smc-choch')) return 'CHOCH';
  if (id.startsWith('month-desk-smc-bos')) return 'BOS';
  const fb = String(fallback || '').trim();
  if (fb.length <= 6) return fb;
  return fb.slice(0, 6);
}

/** phz 눌림(초록 점선)·고래핫 등 — 핵심 롱/숏 $$$$와 별도 (기본 숨김) */
export function stripMonthDeskPhzAndHotzoneLayers(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => {
    const id = String(o.id || '');
    if (id.startsWith('phz-')) return false;
    if (id.startsWith('hotzone-')) return false;
    return true;
  });
}

/** clear: 핵심 타점·손익·Atlas·구조만 — 장식·중복 제거 */
export function filterMonthDeskProChartLayers(
  items: OverlayItem[],
  density: MonthDeskProDensity = 'clear'
): OverlayItem[] {
  const noPhz = stripMonthDeskPhzAndHotzoneLayers(items);
  if (density === 'rich') return noPhz;

  return noPhz.filter((o) => {
    if (isMonthDeskClearEssentialOverlay(o)) return true;
    if (isMonthDeskClearNoiseOverlay(o)) return false;

    const id = String(o.id || '');
    const kind = String(o.kind || '');

    if (kind === 'label' || kind === 'swingLabel' || kind === 'poi') {
      if (PRO_LABEL_IDS.has(id)) return true;
      if (id.startsWith('month-desk-core-money-') && id.endsWith('-sweep')) return true;
      if (id.startsWith('ob-pre-beam-pin-')) return true;
      if (id.startsWith('month-desk-pin-')) return true;
      return false;
    }

    if (isZoneLike(o)) {
      if (CORE_ZONE_IDS.has(id)) return true;
      if (id.startsWith('ob-pre-beam-zone')) return true;
      if (id === 'month-desk-core-long-spot') return true;
      if (id.startsWith('trade-atlas-') && (kind === 'supplyZone' || kind === 'demandZone' || kind === 'zone'))
        return true;
      return false;
    }

    if (isLineKindPro(kind)) {
      if (PRO_LINE_IDS.has(id)) return true;
      if (id.startsWith('month-desk-core-long-')) return true;
      if (id.startsWith('trade-atlas-')) return true;
      if (kind === 'bos' || kind === 'choch') return true;
      if (id.startsWith('month-desk-smc-')) return true;
      if (id === 'parkf-lr-base' || id === 'parkf-lr-lg-u' || id === 'parkf-lr-lg-d') return true;
      if (
        id === 'whale-alr-0-ch-mid' ||
        id === 'whale-alr-0-ch-top' ||
        id === 'whale-alr-0-ch-bot'
      )
        return true;
      if (id.startsWith('parkf-') || id.startsWith('whale-alr-') || id.startsWith('diag-')) return false;
      return false;
    }

    return false;
  });
}

function isLineKindPro(kind: string): boolean {
  return (
    kind === 'trendLine' ||
    kind === 'supportLine' ||
    kind === 'resistanceLine' ||
    kind === 'keyLevel' ||
    kind === 'bos' ||
    kind === 'choch' ||
    kind === 'fibLine' ||
    kind === 'scenario'
  );
}

export function applyMonthDeskProVisualRoles(items: OverlayItem[]): OverlayItem[] {
  return items.map((raw) => {
    const role = resolveMonthDeskVisualRole(raw);
    const kind = String(raw.kind || '');
    const id = String(raw.id || '');
    let o: OverlayItem = { ...raw };

    if (isZoneLike(o)) {
      const zc = roleZoneClass(role);
      if (zc) o = { ...o, overlayZoneExtraClass: appendClass(o.overlayZoneExtraClass, zc) };
    }

    if (isLineKindPro(kind)) {
      const lc = roleLineClass(role);
      if (lc) o = { ...o, overlayZoneExtraClass: appendClass(o.overlayZoneExtraClass, lc) };
      if (!o.lineDash) o = { ...o, lineDash: defaultDash(role, kind) };
      if (PRO_LINE_IDS.has(id) || id.startsWith('month-desk-smc-')) {
        const short = proLineLabel(id, String(o.label || ''));
        if (short) o = { ...o, label: short };
      }
    }

    if (id.startsWith('month-desk-pin-')) {
      o = {
        ...o,
        overlayZoneExtraClass: appendClass(o.overlayZoneExtraClass, 'overlay-pin--md-pro-signal'),
      };
    }

    return o;
  });
}

export function monthDeskProLineShowsLabel(id: string): boolean {
  const zid = String(id || '');
  /** E·SL·TP·Atlas·핵심롱 — 우측 밴드 라벨로만 표시(차트 중앙 중복 방지) */
  if (zid.startsWith('month-desk-plan-') || zid.startsWith('month-desk-core-long-')) return false;
  if (zid.startsWith('trade-atlas-')) return false;
  if (zid.startsWith('month-desk-typeom-entry') || zid.startsWith('month-desk-typeom-sl')) return false;
  return (
    PRO_LINE_IDS.has(zid) ||
    zid.startsWith('month-desk-smc-bos-') ||
    zid.startsWith('month-desk-smc-choch-') ||
    zid.startsWith('ob-pre-beam-')
  );
}

export function applyMonthDeskProChartLayout(
  items: OverlayItem[],
  density: MonthDeskProDensity = 'clear'
): OverlayItem[] {
  return applyMonthDeskProVisualRoles(filterMonthDeskProChartLayers(items, density));
}
