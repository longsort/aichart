/**
 * PHASE 16 — Eagle1 통합데스크 Practical / Debug UI 필터 · Zone 클릭 상세(영문+한국어).
 * Pure helpers (no React). 고래 카드/HUD 패널 없음.
 */

import type { OverlayItem } from '@/types';
import { explainEagle1Label } from './labelLexicon';

export type Eagle1DeskUiMode = 'practical' | 'debug';
export type Eagle1DebugLayer = 'raw' | 'merged' | 'density' | 'strategy' | 'aplus' | 'all';

const ZONE_FACE_KINDS = new Set([
  'zone',
  'box',
  'supplyZone',
  'demandZone',
  'fvg',
  'ob',
  'reactionZone',
  'bprZone',
]);

/** Practical에서 항상 유지하는 오버레이 id 접두 */
export function isPracticalKeptOverlayId(id: string): boolean {
  const s = String(id || '');
  if (!s) return false;
  if (s.startsWith('eagle1-core-')) return true;
  if (s.startsWith('eagle1-aplus-')) return true;
  if (s.startsWith('eagle1-exec-')) return true;
  if (s.startsWith('eagle1-poc')) return true;
  if (s.startsWith('eagle1-cluster-')) return true;
  if (s.startsWith('eagle1-ai-zone--')) return true;
  if (s.startsWith('eagle1-entry-zone')) return true;
  if (s.startsWith('eagle1-eqh') || s.startsWith('eagle1-eql')) return true;
  if (s.startsWith('eagle1-zone--unified')) return true;
  if (s.startsWith('merged-desk-entry')) return true;
  if (s.startsWith('merged-desk-hq-')) return true;
  if (s.startsWith('merged-swing-')) return true;
  if (s.startsWith('merged-ares-mlsp-tv-')) return true;
  if (
    s.startsWith('merged-cp-cloud') ||
    s.startsWith('merged-unified-cloud') ||
    s.startsWith('merged-ares-st-cloud')
  ) {
    return true;
  }
  return false;
}

/** Practical에서 끄는 Mirage/레거시 개별 박스 */
export function isPracticalDroppedOverlayId(id: string, extraClass = ''): boolean {
  const s = String(id || '');
  const extra = String(extraClass || '');
  if (s.startsWith('merged-ares-zone-') || s.startsWith('merged-ares-key-') || s.startsWith('merged-ares-critical-')) {
    return true;
  }
  if (
    s.startsWith('merged-desk-core-sr') ||
    s.startsWith('merged-desk-hotzone') ||
    s.startsWith('merged-desk-adv-') ||
    s.startsWith('merged-desk-btccion-')
  ) {
    return true;
  }
  if (
    extra.includes('merged-ares-zone') ||
    extra.includes('merged-ares-key-zone') ||
    extra.includes('merged-ares-critical-zone')
  ) {
    return true;
  }
  return false;
}

function kindKeptViaCaller(kind: string | undefined): boolean {
  const k = String(kind || '');
  return k === 'trendLine' || k === 'channelBand';
}

function blobOf(o: OverlayItem): string {
  return `${o.id || ''} ${o.kind || ''} ${o.overlayZoneExtraClass || ''} ${o.label || ''} ${o.zoneFaceBase || ''} ${o.labelTooltip || ''}`.toLowerCase();
}

function overlayMatchesDebugLayer(o: OverlayItem, layer: Eagle1DebugLayer): boolean {
  if (layer === 'all') return true;
  const id = String(o.id || '');
  const blob = blobOf(o);
  switch (layer) {
    case 'raw':
      return (
        isPracticalDroppedOverlayId(id, String(o.overlayZoneExtraClass || '')) ||
        (id.startsWith('eagle1-') &&
          !id.startsWith('eagle1-core-') &&
          !id.startsWith('eagle1-aplus-') &&
          !id.startsWith('eagle1-exec-') &&
          !id.startsWith('eagle1-poc'))
      );
    case 'merged':
      return (
        id.startsWith('eagle1-core-') ||
        id.startsWith('merged-desk-entry') ||
        id.startsWith('merged-desk-hq-') ||
        id.startsWith('merged-ares-mlsp-tv-') ||
        id.startsWith('merged-swing-') ||
        /cloud/.test(id) ||
        kindKeptViaCaller(o.kind)
      );
    case 'density':
      return /density|hvn|lvn|\bpoc\b|vrvp|volume.?profile|peak.?band|eagle1-poc/.test(blob);
    case 'strategy':
      return (
        (/strategy|fusion|eagle1-cluster|breakout|reversal|compression|\btrend\b/.test(blob) ||
          id.startsWith('eagle1-cluster-')) &&
        !id.startsWith('eagle1-aplus-')
      );
    case 'aplus':
      return id.startsWith('eagle1-aplus-') || /\ba\+\b|aplus|a\+ 롱|a\+ 숏/.test(blob);
    default:
      return true;
  }
}

/**
 * Practical: Mirage 개별 박스 OFF · CORE/A+/진입·구조 유지.
 * Debug: Raw / Merged / Density / Strategy / A+ / 전부 레이어.
 * demoteLegacyZones 대체 — 이중 필터 금지.
 */
export function filterOverlaysForEagle1DeskUi(
  overlays: OverlayItem[],
  mode: Eagle1DeskUiMode,
  debugLayer: Eagle1DebugLayer = 'all'
): OverlayItem[] {
  const list = Array.isArray(overlays) ? overlays : [];
  if (mode === 'debug') {
    if (debugLayer === 'all') return list;
    return list.filter((o) => overlayMatchesDebugLayer(o, debugLayer));
  }

  return list.filter((o) => {
    const id = String(o.id || '');
    const extra = String(o.overlayZoneExtraClass || '');
    if (isPracticalKeptOverlayId(id)) return true;
    if (kindKeptViaCaller(o.kind)) return true;
    if (isPracticalDroppedOverlayId(id, extra)) return false;
    /** 레거시/미라지 존 면은 끄고, 선·마커·기타는 유지 */
    if (ZONE_FACE_KINDS.has(String(o.kind || ''))) {
      if (id.startsWith('eagle1-')) return isPracticalKeptOverlayId(id) || id.startsWith('eagle1-poc');
      return false;
    }
    return true;
  });
}

function detailFromLexicon(enKey: string, labelKoFallback: string): {
  labelEn: string;
  labelKo: string;
  detailKo: string;
} {
  const ex = explainEagle1Label(enKey);
  return {
    labelEn: ex.en || enKey,
    labelKo: labelKoFallback || ex.oneLineKo,
    detailKo: ex.detailKo || ex.oneLineKo,
  };
}

/**
 * Zone 클릭 상세 — 영문 라벨 + 한국어 설명(compact).
 * eagle1-* 및 zone 계열. 없으면 null.
 */
export function eagle1ZoneDetailFromOverlay(
  o: OverlayItem | null | undefined
): { labelEn: string; labelKo: string; detailKo: string } | null {
  if (!o) return null;
  const id = String(o.id || '');
  const kind = String(o.kind || '');
  const isEagle = id.startsWith('eagle1-');
  const isZoneFace =
    ZONE_FACE_KINDS.has(kind) ||
    /zone|hotzone|core|supply|demand|fvg|ob|aplus|entry/.test(`${id} ${kind}`.toLowerCase());
  if (!isEagle && !isZoneFace) return null;

  if (id.startsWith('eagle1-core-support') || /eagle1-core-support/.test(String(o.overlayZoneExtraClass || ''))) {
    return detailFromLexicon('CORE SUPPORT', 'CORE 지지');
  }
  if (id.startsWith('eagle1-core-resist') || /eagle1-core-resist/.test(String(o.overlayZoneExtraClass || ''))) {
    return detailFromLexicon('CORE RESISTANCE', 'CORE 저항');
  }
  if (id.startsWith('eagle1-aplus-long')) {
    return detailFromLexicon('A+ LONG', 'A+ 롱합의');
  }
  if (id.startsWith('eagle1-aplus-short')) {
    return detailFromLexicon('A+ SHORT', 'A+ 숏합의');
  }
  if (id.startsWith('eagle1-exec-') || id.includes('exec-entry')) {
    return detailFromLexicon('MAIN ENTRY', '메인 진입');
  }
  if (id.startsWith('eagle1-poc')) {
    return detailFromLexicon('POC', '최다거래가격');
  }

  const tip = String(o.labelTooltip || '');
  const tipEn = tip.split('·')[0]?.trim();
  const face = String(o.zoneFaceBase || o.label || '').trim();
  const rawKey = tipEn && /^[A-Z0-9+_\- ]+$/i.test(tipEn) ? tipEn : face || id;
  const ex = explainEagle1Label(rawKey);
  const labelEn =
    tipEn && /[A-Za-z]/.test(tipEn)
      ? tipEn
      : /[A-Za-z]/.test(face)
        ? face
        : ex.en || face || id;
  const labelKo = /[가-힣]/.test(face) ? face : ex.oneLineKo;
  return {
    labelEn,
    labelKo,
    detailKo: ex.detailKo || ex.oneLineKo,
  };
}

export function mergedDeskPracticalUiAcceptance(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const sample: OverlayItem[] = [
    { id: 'eagle1-core-support', kind: 'demandZone', label: 'CORE', x1: 0, y1: 0, x2: 1, y2: 1, confidence: 80 },
    { id: 'eagle1-aplus-long', kind: 'demandZone', label: 'A+', x1: 0, y1: 0, x2: 1, y2: 1, confidence: 80 },
    { id: 'eagle1-exec-entry', kind: 'demandZone', label: 'ENTRY', x1: 0, y1: 0, x2: 1, y2: 1, confidence: 80 },
    { id: 'merged-desk-entry-1', kind: 'demandZone', label: '진입', x1: 0, y1: 0, x2: 1, y2: 1, confidence: 70 },
    { id: 'merged-ares-zone-1', kind: 'supplyZone', label: '존', x1: 0, y1: 0, x2: 1, y2: 1, confidence: 60 },
    { id: 'merged-desk-hotzone-a', kind: 'zone', label: '핫', x1: 0, y1: 0, x2: 1, y2: 1, confidence: 60 },
    { id: 'merged-desk-btccion-x', kind: 'zone', label: 'btc', x1: 0, y1: 0, x2: 1, y2: 1, confidence: 60 },
    { id: 'merged-ares-mlsp-tv-bos', kind: 'bos', label: 'BOS', x1: 0, y1: 0, x2: 1, y2: 1, confidence: 70 },
    { id: 'line-1', kind: 'trendLine', label: 'TL', x1: 0, y1: 0, x2: 1, y2: 1, confidence: 50 },
  ];

  if (!isPracticalKeptOverlayId('eagle1-core-support')) notes.push('keep core');
  if (!isPracticalDroppedOverlayId('merged-ares-zone-1')) notes.push('drop ares zone');

  const practical = filterOverlaysForEagle1DeskUi(sample, 'practical', 'all');
  const ids = new Set(practical.map((o) => o.id));
  if (!ids.has('eagle1-core-support')) notes.push('practical missing CORE');
  if (!ids.has('eagle1-aplus-long')) notes.push('practical missing A+');
  if (!ids.has('eagle1-exec-entry')) notes.push('practical missing exec');
  if (!ids.has('merged-ares-mlsp-tv-bos')) notes.push('practical missing mlsp');
  if (!ids.has('line-1')) notes.push('practical missing trendLine');
  if (ids.has('merged-ares-zone-1')) notes.push('practical still has mirage zone');
  if (ids.has('merged-desk-hotzone-a')) notes.push('practical still has hotzone');
  if (ids.has('merged-desk-btccion-x')) notes.push('practical still has btccion');

  const raw = filterOverlaysForEagle1DeskUi(sample, 'debug', 'raw');
  if (!raw.some((o) => o.id === 'merged-ares-zone-1')) notes.push('debug raw missing ares zone');

  const aplus = filterOverlaysForEagle1DeskUi(sample, 'debug', 'aplus');
  if (aplus.length !== 1 || aplus[0]?.id !== 'eagle1-aplus-long') notes.push('debug aplus filter');

  const detail = eagle1ZoneDetailFromOverlay(sample[0]!);
  if (!detail || detail.labelEn !== 'CORE SUPPORT' || !/지지|CORE/.test(detail.labelKo)) {
    notes.push('zone detail CORE SUPPORT');
  }
  if (!detail?.detailKo) notes.push('zone detail missing detailKo');

  return { ok: notes.length === 0, notes };
}
