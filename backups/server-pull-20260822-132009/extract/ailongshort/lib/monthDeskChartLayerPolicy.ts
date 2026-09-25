/**
 * 마감·안착 차트 — zone·line 레이어 밀도 정책 (Strike / Standard / Full).
 */
import type { OverlayItem } from '@/types';
import type { UserSettings } from '@/lib/settings';
import { isMonthDeskClearEssentialOverlay } from '@/lib/monthDeskClearEssentials';

export type MonthDeskChartLayerMode = 'strike' | 'standard' | 'full' | 'zoneLinePro';

const STRIKE_PREFIXES = [
  'month-desk-strike-',
  'month-desk-strike-ai-',
  'month-desk-signal-',
  'month-desk-click-precision-',
  'month-desk-core-money-',
  'month-desk-core-long-',
  'month-desk-core-short-',
  'key-mustHold-',
  'whale-auto-bu-ob',
] as const;

const STANDARD_EXTRA_PREFIXES = [
  'month-desk-plan-',
  'month-desk-unified-',
  'trade-atlas-',
  'month-desk-typeom-entry',
  'month-desk-typeom-inv',
  'month-desk-typeom-tp',
  'ob-pre-beam-',
] as const;

const NOISE_PREFIXES = [
  'phz-tp',
  'phz-ref-',
  'phz-bullpath-',
  'phz-bearpath-',
  'phz-bullnum-',
  'phz-bearnum-',
  'phz-hot-dot-',
  'phz-hot-tag-',
  'month-desk-smc-bos-',
  'month-desk-smc-choch-',
  'smc-entry-playbook-',
  'parkf-',
  'cptc-',
  'whale-alr-',
  'md-path-',
  'month-desk-chart-deck',
  'month-desk-history-money-',
  'hotzone-',
] as const;

/** 존·라인 개선 모드 — LinReg·CP·HotZone 유지 */
const ZONE_LINE_PRO_PREFIXES = [
  'parkf-',
  'cptc-',
  'hotzone-',
  'whale-auto-bu-ob',
  'month-desk-click-precision-',
] as const;

function idMatchesPrefixes(id: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => id.startsWith(p) || id.includes(p));
}

function isStrikeEssential(o: OverlayItem): boolean {
  const id = String(o.id || '');
  if (idMatchesPrefixes(id, STRIKE_PREFIXES)) return true;
  if (id === 'month-desk-plan-entry' || id === 'month-desk-plan-sl') return true;
  if (id.startsWith('month-desk-plan-tp')) return true;
  return false;
}

function isStandardEssential(o: OverlayItem): boolean {
  const id = String(o.id || '');
  if (isStrikeEssential(o)) return true;
  if (idMatchesPrefixes(id, STANDARD_EXTRA_PREFIXES)) return true;
  if (id === 'month-desk-typeom-pocket-zone' || id === 'month-desk-typeom-fvg-zone') return true;
  return false;
}

function isNoiseOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  return NOISE_PREFIXES.some((p) => id.startsWith(p) || id.includes(`-${p}`));
}

function isZoneLineProEssential(o: OverlayItem): boolean {
  const id = String(o.id || '');
  if (isStrikeEssential(o)) return true;
  if (idMatchesPrefixes(id, ZONE_LINE_PRO_PREFIXES)) return true;
  if (id.startsWith('month-desk-pin-')) return true;
  const kind = String(o.kind || '');
  if (
    (kind === 'channelBand' || kind === 'supplyZone' || kind === 'demandZone' || kind === 'trendline') &&
    (id.startsWith('cptc-') || id.startsWith('parkf-') || id.startsWith('hotzone-'))
  ) {
    return true;
  }
  return false;
}

export function resolveMonthDeskChartLayerMode(
  settings: Pick<UserSettings, 'chartMonthDeskLayerMode' | 'chartMonthDeskOverlayDensity'>,
  uiMode?: string
): MonthDeskChartLayerMode {
  if (uiMode === 'ZONE_LINE_PRO') return 'zoneLinePro';
  const explicit = settings.chartMonthDeskLayerMode;
  if (
    explicit === 'strike' ||
    explicit === 'standard' ||
    explicit === 'full' ||
    explicit === 'zoneLinePro'
  ) {
    return explicit;
  }
  return settings.chartMonthDeskOverlayDensity === 'rich' ? 'full' : 'strike';
}

/** 레이어 모드별 zone·line 필터 */
export function filterMonthDeskLayersByMode(
  items: OverlayItem[],
  mode: MonthDeskChartLayerMode
): OverlayItem[] {
  if (mode === 'full') return items;

  return items.filter((o) => {
    const id = String(o.id || '');

    if (mode === 'zoneLinePro') {
      if (isZoneLineProEssential(o)) return true;
      return false;
    }

    if (isNoiseOverlay(o)) return false;

    if (mode === 'strike') {
      if (isStrikeEssential(o)) return true;
      if (o.kind === 'label' && id.startsWith('month-desk-pin-')) return true;
      return false;
    }

    if (mode === 'standard') {
      if (isStandardEssential(o)) return true;
      if (isMonthDeskClearEssentialOverlay(o)) return true;
      const kind = String(o.kind || '');
      if (kind === 'keyLevel' || kind === 'entry' || kind === 'supplyZone' || kind === 'demandZone') {
        return id.startsWith('month-desk-') || id.startsWith('trade-atlas-');
      }
      return false;
    }

    return true;
  });
}

/** Strike E가 있으면 근접 중복 진입선 제거 */
export function dedupeStrikePriorityLines(items: OverlayItem[]): OverlayItem[] {
  const strikeLongE = items.find((o) => o.id === 'month-desk-strike-long-entry');
  const strikeShortE = items.find((o) => o.id === 'month-desk-strike-short-entry');
  const px = (o: OverlayItem | undefined) => {
    const p = Number(o?.price1);
    return Number.isFinite(p) ? p : null;
  };
  const longPx = px(strikeLongE);
  const shortPx = px(strikeShortE);
  const near = (a: number | null, b: number | null) =>
    a != null && b != null && Math.abs(a - b) / Math.max(Math.abs(a), 1e-9) < 0.006;

  return items.filter((o) => {
    const id = String(o.id || '');
    const p = px(o);
    if (longPx != null && (id === 'month-desk-plan-entry' || id === 'month-desk-typeom-entry' || id === 'month-desk-core-long-entry')) {
      if (near(p, longPx)) return false;
    }
    if (shortPx != null && (id === 'trade-atlas-entry' || id === 'month-desk-core-short-entry')) {
      if (near(p, shortPx)) return false;
    }
    return true;
  });
}
