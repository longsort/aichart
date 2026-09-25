/**
 * 통합·분석 차트 — 유로맵식 레이어 스타일 (ON/OFF · 색 · 농도).
 * 마감·고래·바이블 등 다른 모드 설정과 분리.
 */
import type { OverlayItem } from '@/types';
import type { UserSettings } from '@/lib/settings';

export type MergedDeskEuromapLayerStyle = {
  on?: boolean;
  hex?: string;
  /** 15~100. 낮을수록 면·선이 연함 */
  opacity?: number;
};

export type EuromapGroupId = 'zone' | 'channel' | 'line' | 'marker' | 'volume' | 'text';

export type EuromapLayerDef = {
  id: string;
  group: EuromapGroupId;
  label: string;
  hint?: string;
  defaultHex: string;
  /** 기존 UserSettings boolean */
  onKey?: keyof UserSettings;
  hexKey?: keyof UserSettings;
  opacityKey?: keyof UserSettings;
  idStarts?: readonly string[];
  idIncludes?: readonly string[];
};

export const EUROMAP_GROUPS: Array<{ id: EuromapGroupId; title: string }> = [
  { id: 'zone', title: '존 · 면' },
  { id: 'channel', title: '채널 · 띠 · 밴드' },
  { id: 'line', title: '선 · 타점' },
  { id: 'marker', title: '마커 · 로켓' },
  { id: 'volume', title: '거래량' },
  { id: 'text', title: '글자 · 라벨' },
];

export const MERGED_DESK_EUROMAP_LAYERS: readonly EuromapLayerDef[] = [
  {
    id: 'zone-supply',
    group: 'zone',
    label: '공급 · 저항 면',
    defaultHex: '#F87171',
    hexKey: 'zoneFillSupplyHex',
    idIncludes: ['supply', 'resist', 'critical-decline', 'smc-ob--supply'],
  },
  {
    id: 'zone-demand',
    group: 'zone',
    label: '수요 · 지지 면',
    defaultHex: '#4ADE80',
    hexKey: 'zoneFillDemandHex',
    idIncludes: ['demand', 'support', 'critical-rally', 'smc-ob--demand'],
  },
  {
    id: 'zone-neutral',
    group: 'zone',
    label: '중립 · 박스 면',
    defaultHex: '#94A3B8',
    hexKey: 'zoneFillNeutralHex',
    idIncludes: ['consolidation', 'range', '-box'],
  },
  {
    id: 'zone-warning',
    group: 'zone',
    label: '경고 · 주의 면',
    defaultHex: '#FBBF24',
    hexKey: 'zoneFillWarningHex',
    idIncludes: ['warning', 'hunt'],
  },
  {
    id: 'mirage-resist',
    group: 'zone',
    label: 'Mirage 저항',
    defaultHex: '#FB7185',
    idStarts: ['merged-ares-mlsp-tv-resist'],
  },
  {
    id: 'mirage-support',
    group: 'zone',
    label: 'Mirage 지지',
    defaultHex: '#2DD4BF',
    idStarts: ['merged-ares-mlsp-tv-major-support'],
  },
  {
    id: 'mirage-fvg',
    group: 'zone',
    label: 'FVG',
    defaultHex: '#67E8F9',
    idStarts: ['merged-ares-mlsp-tv-fvg'],
    idIncludes: ['-fvg-'],
  },
  {
    id: 'hotzone',
    group: 'zone',
    label: 'HotZone',
    hint: '형성봉→마지막봉 면 · 위1 저항 · 아래1 지지',
    defaultHex: '#F59E0B',
    idStarts: ['merged-desk-hotzone'],
  },
  {
    id: 'projected-support',
    group: 'zone',
    label: '선포착 하방지지',
    hint: '현재가 아래 사다리 최대 3 · 하락 전 미리 표시',
    defaultHex: '#2DD4BF',
    idStarts: ['merged-desk-projected-support'],
  },
  {
    id: 'hq-entry',
    group: 'zone',
    label: 'HQ 진입존',
    defaultHex: '#A78BFA',
    idStarts: ['merged-desk-hq'],
  },
  {
    id: 'core-sr',
    group: 'zone',
    label: '핵심 지지·저항',
    defaultHex: '#38BDF8',
    idStarts: ['merged-desk-core-sr'],
  },
  {
    id: 'ai-force',
    group: 'zone',
    label: 'AI 매수·매도·방어면',
    defaultHex: '#22D3EE',
    idStarts: ['merged-desk-ai-buy', 'merged-desk-ai-sell', 'merged-desk-ai-defense'],
  },
  {
    id: 'rb-core-break',
    group: 'zone',
    label: '핵심돌파',
    hint: '노란 알약 · 돌파면만',
    defaultHex: '#FACC15',
    idStarts: ['merged-desk-rb-core-break'],
  },
  {
    id: 'rb-core-settle',
    group: 'zone',
    label: '핵심안착',
    hint: '노란 알약 · 안착면만',
    defaultHex: '#4ADE80',
    idStarts: ['merged-desk-rb-core-settle'],
  },
  {
    id: 'rb-core-fail',
    group: 'zone',
    label: '핵심실패',
    hint: '복귀면만',
    defaultHex: '#94A3B8',
    idStarts: ['merged-desk-rb-core-fail'],
  },
  {
    id: 'rb-ai-face',
    group: 'zone',
    label: 'AI 채널면',
    defaultHex: '#F8FAFC',
    onKey: 'chartMergedDeskRbAiZoneFaceEnabled',
    idIncludes: ['rb-ai'],
  },
  {
    id: 'unified-cloud',
    group: 'zone',
    label: '통합구름',
    defaultHex: '#34D399',
    onKey: 'chartMergedDeskUnifiedCloudEnabled',
    idStarts: ['merged-cp-cloud', 'merged-unified-cloud', 'merged-ares-st-cloud'],
  },
  {
    id: 'wyckoff-face',
    group: 'zone',
    label: '와이코프 지지·저항면',
    defaultHex: '#86EFAC',
    onKey: 'chartMergedDeskCycleProgressEnabled',
    idStarts: ['merged-desk-wyckoff'],
  },
  {
    id: 'pattern',
    group: 'zone',
    label: '패턴 · 넥라인',
    defaultHex: '#C084FC',
    onKey: 'chartMergedDeskActionablePatternEnabled',
    idStarts: ['merged-desk-pattern'],
  },
  {
    id: 'asset-ai',
    group: 'zone',
    label: 'assets 자동존',
    defaultHex: '#5EEAD4',
    onKey: 'chartMergedDeskAssetsChartAiEnabled',
    idStarts: ['merged-desk-asset'],
  },
  {
    id: 'rb-short',
    group: 'channel',
    label: '단기 채널',
    defaultHex: '#22C55E',
    onKey: 'chartMergedDeskRbShowShort',
    hexKey: 'chartMergedDeskRbBullHex',
    opacityKey: 'chartMergedDeskRbFillOpacity',
    idIncludes: ['rb-short', 'rb-paint-bull'],
  },
  {
    id: 'rb-long',
    group: 'channel',
    label: '장기 채널',
    defaultHex: '#EF4444',
    onKey: 'chartMergedDeskRbShowLong',
    hexKey: 'chartMergedDeskRbBearHex',
    idIncludes: ['rb-long', 'rb-paint-bear'],
  },
  {
    id: 'rb-confluence',
    group: 'channel',
    label: '중착 복도',
    defaultHex: '#CA8A04',
    onKey: 'chartMergedDeskRbShowConfluence',
    hexKey: 'chartMergedDeskRbConfluenceHex',
    idIncludes: ['rb-confluence'],
  },
  {
    id: 'inst-band',
    group: 'channel',
    label: '기관밴드',
    defaultHex: '#14B8A6',
    onKey: 'chartMergedInstitutionalBandEnabled',
    hexKey: 'institutionalBandLongHex',
  },
  {
    id: 'fusion-band',
    group: 'channel',
    label: '연합밴드',
    defaultHex: '#818CF8',
    onKey: 'chartMonthDeskFusionDeskBandEnabled',
    idStarts: ['merged-tt-fusion'],
  },
  {
    id: 'swing-draw',
    group: 'channel',
    label: '스윙 채널 · 추세선',
    defaultHex: '#60A5FA',
    onKey: 'chartMergedDeskSwingDrawEnabled',
    idStarts: ['merged-swing', 'merged-desk-candle-trend'],
  },
  {
    id: 'estl-entry',
    group: 'line',
    label: '진입 E',
    defaultHex: '#38BDF8',
    idIncludes: ['entry', 'trade-rail', '-e-', '진입'],
  },
  {
    id: 'estl-sl',
    group: 'line',
    label: '손절 SL',
    defaultHex: '#F87171',
    idIncludes: ['stoploss', 'stop-loss', '-sl', '손절', '무효'],
  },
  {
    id: 'estl-tp',
    group: 'line',
    label: '익절 TP',
    defaultHex: '#4ADE80',
    idIncludes: ['takeprofit', '-tp', '익절', '목표'],
  },
  {
    id: 'close-settle',
    group: 'line',
    label: '종가 마감선',
    defaultHex: '#E2E8F0',
    onKey: 'chartTfCloseSettlementLines',
  },
  {
    id: 'btccion',
    group: 'line',
    label: 'btccion 반응·돌파·헌트',
    defaultHex: '#FB923C',
    onKey: 'chartMergedDeskBtccionDrawEnabled',
    idStarts: ['merged-desk-btccion'],
  },
  {
    id: 'news',
    group: 'line',
    label: '뉴스 이벤트 선',
    defaultHex: '#94A3B8',
    idStarts: ['merged-desk-news'],
  },
  {
    id: 'pullback',
    group: 'line',
    label: '눌림 타점 E/SL/TP',
    defaultHex: '#FDE68A',
    onKey: 'chartMergedDeskRbPullbackEntryEnabled',
  },
  {
    id: 'rocket',
    group: 'marker',
    label: '구조 로켓',
    defaultHex: '#FBBF24',
    onKey: 'chartMarkerLayerRocket',
  },
  {
    id: 'marker-ls',
    group: 'marker',
    label: 'L / S 마커',
    defaultHex: '#2DD4BF',
    onKey: 'chartMarkerLayerLs',
  },
  {
    id: 'marker-front',
    group: 'marker',
    label: '선행 마커',
    defaultHex: '#A78BFA',
    onKey: 'chartMarkerLayerFrontRun',
  },
  {
    id: 'band-touch',
    group: 'marker',
    label: '기관밴드 터치',
    defaultHex: '#14B8A6',
    onKey: 'institutionalBandTouchMarkers',
  },
  {
    id: 'vol-adv',
    group: 'volume',
    label: '선진거래량 스택',
    defaultHex: '#22C55E',
    onKey: 'chartMergedDeskAdvVolumeEnabled',
  },
  {
    id: 'vol-rvol',
    group: 'volume',
    label: 'RVOL · 수급 마커',
    defaultHex: '#38BDF8',
    onKey: 'chartVolumeIntelligence',
  },
  {
    id: 'vol-bitget',
    group: 'volume',
    label: 'Bitget 거래량',
    defaultHex: '#F59E0B',
    onKey: 'chartMonthDeskBitgetCandles',
  },
  {
    id: 'labels-master',
    group: 'text',
    label: '차트 글자 전체',
    hint: '면·선은 유지',
    defaultHex: '#F8FAFC',
    onKey: 'chartMergedDeskOverlayLabelsEnabled',
  },
  {
    id: 'rb-labels',
    group: 'text',
    label: '채널 라벨',
    defaultHex: '#E2E8F0',
    onKey: 'chartMergedDeskRbShowLabels',
  },
  {
    id: 'practice-cue',
    group: 'text',
    label: '실전연습 큐',
    defaultHex: '#86EFAC',
    onKey: 'chartMergedDeskLivePracticeCueEnabled',
    idStarts: ['merged-desk-live-practice'],
  },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = String(hex || '')
    .trim()
    .replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

function parseCssRgb(css: string): { r: number; g: number; b: number; a: number } | null {
  const s = String(css || '').trim();
  const hex = hexToRgb(s);
  if (hex) return { ...hex, a: 1 };
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] != null ? Number(m[4]) : 1,
  };
}

export function readEuromapMap(settings: UserSettings | null | undefined): Record<string, MergedDeskEuromapLayerStyle> {
  const raw = settings?.chartMergedDeskEuromap;
  return raw && typeof raw === 'object' ? raw : {};
}

export function getEuromapLayerStyle(
  settings: UserSettings | null | undefined,
  layer: EuromapLayerDef
): { on: boolean; hex: string; opacity: number } {
  const map = readEuromapMap(settings);
  const row = map[layer.id] || {};
  let on = true;
  if (layer.onKey && settings) {
    const v = settings[layer.onKey];
    on = v !== false;
  } else if (row.on === false) {
    on = false;
  }
  let hex = layer.defaultHex;
  if (layer.hexKey && settings) {
    const h = String(settings[layer.hexKey] || '');
    if (/^#[0-9A-Fa-f]{6}$/.test(h)) hex = h.toUpperCase();
  } else if (row.hex && /^#[0-9A-Fa-f]{6}$/.test(row.hex)) {
    hex = row.hex.toUpperCase();
  }
  let opacity = 100;
  if (layer.opacityKey && settings) {
    const n = Number(settings[layer.opacityKey]);
    if (Number.isFinite(n)) opacity = layer.opacityKey === 'chartMergedDeskRbFillOpacity' ? Math.round((n / 60) * 100) : n;
  } else if (typeof row.opacity === 'number' && Number.isFinite(row.opacity)) {
    opacity = row.opacity;
  }
  return { on, hex, opacity: Math.max(15, Math.min(100, Math.round(opacity))) };
}

export function matchEuromapLayerId(overlayId: string): string | null {
  const id = String(overlayId || '').toLowerCase();
  if (!id) return null;
  for (const layer of MERGED_DESK_EUROMAP_LAYERS) {
    if (layer.idStarts?.some((p) => id.startsWith(p.toLowerCase()))) return layer.id;
    if (layer.idIncludes?.some((p) => id.includes(p.toLowerCase()))) return layer.id;
  }
  return null;
}

export function isMergedDeskEuromapOverlayVisible(
  settings: UserSettings | null | undefined,
  overlay: Pick<OverlayItem, 'id' | 'kind'> | { id?: string; kind?: string }
): boolean {
  const id = String(overlay?.id || '');
  const layerId = matchEuromapLayerId(id);
  if (!layerId) return true;
  const def = MERGED_DESK_EUROMAP_LAYERS.find((l) => l.id === layerId);
  if (!def) return true;
  return getEuromapLayerStyle(settings, def).on;
}

export function isEuromapLayerOn(settings: UserSettings | null | undefined, layerId: string): boolean {
  const def = MERGED_DESK_EUROMAP_LAYERS.find((l) => l.id === layerId);
  if (!def) return true;
  return getEuromapLayerStyle(settings, def).on;
}

export function tintMergedDeskEuromapFill(
  css: string,
  settings: UserSettings | null | undefined,
  overlayId: string
): string {
  const layerId = matchEuromapLayerId(overlayId);
  if (!layerId) return css;
  const def = MERGED_DESK_EUROMAP_LAYERS.find((l) => l.id === layerId);
  if (!def) return css;
  const st = getEuromapLayerStyle(settings, def);
  const parsed = parseCssRgb(css);
  const rgb = hexToRgb(st.hex) || (parsed ? { r: parsed.r, g: parsed.g, b: parsed.b } : null);
  if (!rgb) return css;
  const baseA = parsed?.a ?? 0.28;
  const a = Math.max(0.04, Math.min(0.95, baseA * (st.opacity / 100)));
  return `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${a})`;
}
