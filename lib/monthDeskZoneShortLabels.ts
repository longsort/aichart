/**
 * 마감·안착 차트 존 캡션 — 1~4글자 짧은 라벨 (상세는 labelTooltip).
 */
import type { OverlayItem } from '@/types';
import { MONTH_DESK_CORE_MONEY_ENTRY_ID, MONTH_DESK_MONEY_LABEL } from '@/lib/monthDeskMoneyZone';

const ZONE_KINDS = new Set([
  'zone',
  'fvg',
  'ob',
  'supplyZone',
  'demandZone',
  'bprZone',
  'reactionZone',
]);

/** 차트·우측 밴드에 **캡션 숨김** — 존 면(색)은 유지 */
export const MONTH_DESK_HIDE_ZONE_CAPTION_IDS = new Set([
  'month-desk-unified-zone',
  'month-desk-plan-risk-zone',
  'month-desk-plan-reward-zone',
]);

/** clear(간결)에서도 차트에 남는 존·OB 면은 짧은 캡션 표시 */
export function shouldShowMonthDeskZoneCaption(id: string | undefined): boolean {
  if (!id) return false;
  const zid = String(id);
  if (MONTH_DESK_HIDE_ZONE_CAPTION_IDS.has(zid)) return false;
  if (zid.startsWith('phz-') || zid.startsWith('hotzone-')) return false;
  if (zid.startsWith('month-desk-') || zid.startsWith('ob-pre-beam-zone')) return true;
  return false;
}

export function isMonthDeskZoneLike(o: OverlayItem): boolean {
  const kind = String(o.kind || '');
  const cat = String((o as { category?: string }).category || '');
  return ZONE_KINDS.has(kind) || cat === 'reactionZone' || cat === 'zones';
}

/** id·기존 라벨에서 차트 캡션용 짧은 이름 */
export function monthDeskZoneCaptionShort(id: string, fallbackLabel = '', kind?: string): string {
  const zid = String(id || '');
  const fb = String(fallbackLabel || '').trim();

  if (
    zid === MONTH_DESK_CORE_MONEY_ENTRY_ID ||
    zid === 'month-desk-core-money-entry' ||
    zid === 'month-desk-core-money-long'
  ) {
    return `★핵심롱`;
  }
  if (zid === 'month-desk-core-money-short') {
    return `★핵심숏`;
  }
  if (zid.startsWith('month-desk-history-money-')) {
    if (kind === 'supplyZone' || /숏/i.test(fb)) return `과거·${MONTH_DESK_MONEY_LABEL}·숏`;
    if (kind === 'demandZone' || /롱/i.test(fb)) return `과거·${MONTH_DESK_MONEY_LABEL}·롱`;
    return `과거·${MONTH_DESK_MONEY_LABEL}`;
  }
  if (zid.startsWith('ob-pre-beam-zone')) return 'OB';
  if (zid.startsWith('hotzone-')) {
    if (/롱|LONG/i.test(fb)) return '고래L';
    if (/숏|SHORT/i.test(fb)) return '고래S';
    return '고래';
  }
  if (zid.includes('phz-') && zid.includes('-core')) return '핵심';
  if (zid.includes('phz-') && zid.includes('-pull')) return '눌림';
  if (zid.includes('phz-') && zid.includes('-supply')) return '저항';
  if (zid === 'month-desk-unified-zone') {
    if (/롱|LONG/i.test(fb) && !/롱숏/i.test(fb)) return `연합·${MONTH_DESK_MONEY_LABEL}·롱`;
    if (/숏|SHORT/i.test(fb) && !/롱숏/i.test(fb)) return `연합·${MONTH_DESK_MONEY_LABEL}·숏`;
    if (kind === 'demandZone') return `연합·${MONTH_DESK_MONEY_LABEL}·롱`;
    if (kind === 'supplyZone') return `연합·${MONTH_DESK_MONEY_LABEL}·숏`;
    return `연합·${MONTH_DESK_MONEY_LABEL}`;
  }
  if (zid === 'month-desk-unified-core') return '코어';
  if (zid === 'month-desk-typeom-pocket-zone') return '스윙';
  if (zid === 'month-desk-typeom-pocket-core') return '스윙E';
  if (zid.includes('typeom-pocket')) return '스윙';
  if (zid.includes('typeom-fvg')) return 'FVG';
  if (zid === 'month-desk-plan-entry' || zid === 'month-desk-typeom-entry') return 'E';
  if (zid === 'month-desk-plan-sl') return 'SL';
  if (zid.startsWith('month-desk-plan-tp')) return 'TP';
  if (zid.includes('plan-risk')) return '위험';
  if (zid.includes('plan-reward')) return '수익';
  if (zid.startsWith('smc-entry-playbook-zone')) return 'SMC';
  if (zid === 'month-desk-core-long-spot') return '롱존';
  if (zid.startsWith('month-desk-core-long-')) return '롱핵';
  if (zid.startsWith('month-desk-smc-')) return 'SMC';

  if (/구조\s*OB|OB/i.test(fb)) return 'OB';
  if (/고래|HOT/i.test(fb)) {
    if (/롱|LONG/i.test(fb)) return '고래L';
    if (/숏|SHORT/i.test(fb)) return '고래S';
    return '고래';
  }
  if (/눌림|pull/i.test(fb)) return '눌림';
  if (/핵심|core/i.test(fb)) return '핵심';
  if (/연합|unified/i.test(fb)) return '연합';
  if (/저항|supply/i.test(fb)) return '저항';
  if (/FVG/i.test(fb)) return 'FVG';

  if (kind === 'demandZone') return '수요';
  if (kind === 'supplyZone') return '공급';

  if (fb.length <= 5) return fb;
  return fb.slice(0, 4);
}

/** 오버레이 배열 — 존 면 라벨만 짧게 (핀·선은 유지) */
export function simplifyMonthDeskZoneOverlayLabels(items: OverlayItem[]): OverlayItem[] {
  return items.map((raw) => {
    if (!isMonthDeskZoneLike(raw)) return raw;
    const id = String(raw.id || '');
    const short = monthDeskZoneCaptionShort(id, String(raw.label || ''), String(raw.kind || ''));
    if (!short || short === raw.label) return raw;
    const tip = String(raw.labelTooltip || raw.label || '').trim();
    const mergedTip = tip.includes(String(raw.label || ''))
      ? tip
      : [tip, raw.label].filter(Boolean).join('\n');
    return {
      ...raw,
      label: short,
      labelTooltip: mergedTip || tip,
    };
  });
}
