import type { OverlayItem } from '@/types';
import { MONTH_DESK_CORE_MONEY_ENTRY_ID } from '@/lib/monthDeskMoneyZone';
import { filterMonthDeskChartHudDuplicates } from '@/lib/monthDeskChartLabelDeck';
import { isMonthDeskHtfTimeframe } from '@/lib/monthDeskZonePrecision';
import {
  isMonthDeskClearDecorPhz,
  isMonthDeskClearEssentialOverlay,
} from '@/lib/monthDeskClearEssentials';

function isZoneLikeOverlay(o: OverlayItem): boolean {
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

/** clear 모드: 차트 면으로 그리는 존 — $$$$ 핵심 · 연합(보조) · OB */
const ESSENTIAL_ZONE_FACE_IDS = new Set([
  MONTH_DESK_CORE_MONEY_ENTRY_ID,
  'month-desk-core-money-entry',
  'month-desk-core-money-long',
  'month-desk-core-money-short',
  'month-desk-unified-zone',
  'month-desk-unified-core',
]);

function isEssentialMonthDeskZoneFace(o: OverlayItem): boolean {
  const id = String(o.id || '');
  if (ESSENTIAL_ZONE_FACE_IDS.has(id)) return true;
  if (id.startsWith('ob-pre-beam-zone')) return true;
  if (id.startsWith('month-desk-history-money-')) return true;
  return false;
}

/**
 * 마감·안착 clear(기본): 핵심 $$$$ · 스윙포켓 · 구조 OB 존만.
 * phz 눌림(초록 점선)·고래핫·연합·플랜 risk/reward 면·분석 ob 박스 등 제거.
 */
export function filterMonthDeskEssentialZonesOnly(
  items: OverlayItem[],
  density: 'clear' | 'rich' = 'clear'
): OverlayItem[] {
  if (density === 'rich') return items;
  const hasCoreMoney = items.some((o) => {
    const id = String(o.id || '');
    return (
      id === MONTH_DESK_CORE_MONEY_ENTRY_ID ||
      id === 'month-desk-core-money-long' ||
      id === 'month-desk-core-money-short'
    );
  });
  return items.filter((o) => {
    const id = String(o.id || '');
    if (isMonthDeskClearEssentialOverlay(o)) return true;
    if (id.startsWith('phz-')) return false;
    if (!isZoneLikeOverlay(o)) return true;
    const kind = String(o.kind || '');
    if (id === 'month-desk-typeom-pocket-zone' || id === 'month-desk-typeom-pocket-core') {
      return false;
    }
    if (hasCoreMoney && (id === 'month-desk-unified-zone' || id === 'month-desk-unified-core')) {
      return false;
    }
    if (isEssentialMonthDeskZoneFace(o)) return true;
    if (id.startsWith('phz-')) return false;
    if (id.startsWith('hotzone-')) return false;
    if (id.startsWith('month-desk-unified')) return false;
    if (id === 'month-desk-plan-risk-zone' || id === 'month-desk-plan-reward-zone') return true;
    if (id.startsWith('month-desk-typeom-fvg') || id.startsWith('month-desk-typeom-deep')) return false;
    if (id.startsWith('month-desk-typeom-leg') || id.startsWith('month-desk-typeom-ob-')) return false;
    if (id.startsWith('month-desk-money-') && id !== MONTH_DESK_CORE_MONEY_ENTRY_ID) return false;
    if (id.startsWith('smc-entry-playbook-') && isZoneLikeOverlay(o)) return false;
    if (id.startsWith('month-desk-smc-') && isZoneLikeOverlay(o)) return false;
    if ((id.startsWith('ob-') || id.startsWith('ob-early-')) && !id.startsWith('ob-pre-beam')) return false;
    if (kind === 'fvg' || kind === 'bprZone') return false;
    return false;
  });
}

/** 마감·안착 4h·1d·1w 등 — 차트 존·라벨 과밀 완화 */
export function isMonthDeskChartHtf(tf: string): boolean {
  return isMonthDeskHtfTimeframe(tf);
}

/**
 * 4h·주봉: 눌림 2·3차·공급·SMC 보조 존·머니풀 중복을 줄이고 핵심 타점·코어·1차 눌림·고래핫만 남김.
 */
export function filterMonthDeskHtfZoneClutter(items: OverlayItem[], tf: string): OverlayItem[] {
  if (!isMonthDeskChartHtf(tf)) return items;
  return items.filter((o) => {
    const id = String(o.id || '');
    const kind = String(o.kind || '');
    if (id.includes('phz-') && (id.includes('-supply') || id.includes('-pull-2') || id.includes('-pull-3'))) {
      return false;
    }
    if (id.startsWith('month-desk-typeom-deep-') || id.startsWith('month-desk-typeom-leg-')) return false;
    if (id.startsWith('month-desk-typeom-ob-') && id !== 'month-desk-typeom-entry') return false;
    if (id.startsWith('month-desk-typeom-tp-zone')) return false;
    if (id.startsWith('month-desk-money-') && id !== 'month-desk-core-money-entry') return false;
    if (id.startsWith('smc-entry-playbook-htf-poi') || id.startsWith('smc-entry-playbook-ltf-poi')) return false;
    if (id.startsWith('smc-entry-playbook-ote') || id.startsWith('smc-entry-playbook-ifvg')) return false;
    if (id === 'month-desk-plan-risk-zone' || id === 'month-desk-plan-reward-zone') return true;
    if (kind === 'label' && id.startsWith('month-desk-money-')) return false;
    if (kind === 'label' && /^phz-/.test(id)) return false;
    return true;
  });
}

/**
 * 마감·안착 + 눌림 핫존 병합 시: 타점 존이 눌림 존 위에 오도록, 라벨·경로는 맨 위로.
 * (배열 앞쪽이 먼저 그려지고 뒤가 위에 쌓이는 파이프라인 전제)
 */
export function organizeMonthStartDeskOverlays(items: OverlayItem[]): OverlayItem[] {
  const tier = (o: OverlayItem): number => {
    const id = String(o.id || '');
    const kind = String(o.kind || '');
    const z = isZoneLikeOverlay(o);
    if (kind === 'label' || kind === 'swingLabel' || kind === 'poi' || kind === 'entry' || kind === 'target' || kind === 'stop')
      return 88;
    if (id.startsWith('hotzone-') && !z) return 78;
    if (kind === 'trendLine' && id.startsWith('phz-')) return 72;
    if (kind === 'fibLine' && id.startsWith('phz-')) return 58;
    if ((kind === 'keyLevel' || kind === 'supportLine' || kind === 'resistanceLine') && id.startsWith('phz-')) return 56;
    if (id.startsWith('month-desk-plan-') && z) return 46;
    if (id.startsWith('month-desk-core-long-')) return 94;
    if (id.startsWith('ob-pre-beam-pin-') || id.startsWith('ob-pre-beam-zone-')) return 52;
    if (id === 'month-desk-chart-deck') return 99;
    if (id.startsWith('month-desk-chart-')) return 97;
    if (
      id === 'month-desk-entry-unified' ||
      id === 'month-desk-core-money-entry' ||
      id === 'month-desk-core-money-long' ||
      id === 'month-desk-core-money-short'
    )
      return 96;
    if (id.startsWith('month-desk-pin-')) return 98;
    if (id.startsWith('month-desk-money-') && kind === 'label') return 93;
    if (id.startsWith('month-desk-money-')) return 91;
    if (kind === 'bos' || kind === 'choch' || id.startsWith('month-desk-smc-')) return 82;
    if (id.startsWith('month-desk-smc-') && (kind === 'ob' || kind === 'fvg')) return 42;
    if (id.startsWith('smc-entry-playbook-') && z) return 50;
    if (id.startsWith('smc-entry-playbook-')) return 84;
    if (id.startsWith('month-desk-plan-entry') || id === 'month-desk-plan-sl') return 90;
    if (id.startsWith('month-desk-plan-tp')) return 86;
    if (id.startsWith('parkf-lr-') || id.startsWith('whale-alr-')) return 74;
    if (id.startsWith('cptc-')) return 72;
    if (id.startsWith('ai-auto-compression')) return 71;
    if (id.startsWith('parkf-pri-') || id.startsWith('parkf-sec-')) return 70;
    if (id.startsWith('md-path-')) return 76;
    if (id.startsWith('trade-atlas-')) return 95;
    if (id.startsWith('month-desk-unified-') && z) return 48;
    if (id.startsWith('month-desk-typeom-') && z) return 44;
    if (id.startsWith('phz-') && z) return 28;
    if (id.startsWith('hotzone-') && z) return 22;
    if (id.startsWith('whale-auto-bu-ob')) return 18;
    if (id.startsWith('key-mustHold-')) return 12;
    if (id.startsWith('month-desk-typeom-')) return 52;
    return 40;
  };
  return [...items].sort((a, b) => {
    const d = tier(a) - tier(b);
    if (d !== 0) return d;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * `clear`(기본): 마감 타점(TP·구조)과 겹치는 장식용 phz만 제거 — 존·피보·SL·클러스터는 유지.
 */
export function filterPhzOverlaysForMonthDeskClearDensity(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => {
    const id = String(o.id || '');
    if (!id.startsWith('phz-')) return true;
    if (isMonthDeskClearDecorPhz(id)) return false;
    /** 핵심 눌림·지지·클러스터는 간결 모드에서도 유지 */
    if (id.includes('-pull-1') || id.includes('-cluster-') || id.includes('-support')) return true;
    return true;
  });
}

/** 연합 데스크(타점+E/SL/TP) 활성 시 차트에 남길 레이어인지 */
export function monthDeskHasEliteTradeDesk(items: OverlayItem[]): boolean {
  return items.some((o) => {
    const id = String(o.id || '');
    return (
      id === 'month-desk-unified-zone' ||
      id === 'month-desk-plan-entry' ||
      id === MONTH_DESK_CORE_MONEY_ENTRY_ID
    );
  });
}

/** 마감·안착: 확률 라벨·phz 장식·HotZone 중복만 정리 — SMC·$$$$·타입옴·연합 분석은 유지 */
export function filterMonthDeskStreamlineOverlays(items: OverlayItem[]): OverlayItem[] {
  let list = filterMonthDeskChartHudDuplicates(items);
  const hotSeen = new Set<string>();
  return list.filter((o) => {
    const id = String(o.id || '');
    const kind = String(o.kind || '');
    if (kind === 'label' && id.startsWith('hotzone-prob-')) return false;
    if (id.startsWith('phz-bullnum-') || id.startsWith('phz-bearnum-')) return false;
    if (id.startsWith('phz-hot-dot-') || id.startsWith('phz-hot-tag-')) return false;
    if (id.startsWith('phz-bullpath-') || id.startsWith('phz-bearpath-')) return false;
    if (id.startsWith('hotzone-') && kind === 'zone') {
      const key = id.replace(/-l\d+$/, '');
      if (hotSeen.has(key)) return false;
      hotSeen.add(key);
    }
    return true;
  });
}
