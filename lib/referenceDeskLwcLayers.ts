/**
 * 벤치마크 LWC — 구조·존·패턴·MTF 마커 레이어 (순서: structure → zones → patterns → mtf).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UserSettings } from '@/lib/settings';
import { applyAssetsChartDrawingConventions } from '@/lib/assetsChartDrawingConventions';

export type ReferenceDeskLwcLayer = 'structure' | 'zones' | 'patterns' | 'mtf';

export type ReferenceDeskLwcLayerFlags = {
  structure: boolean;
  zones: boolean;
  patterns: boolean;
  mtf: boolean;
};

const CLUTTER_PREFIXES = [
  'phz-',
  'hotzone-',
  'month-desk-',
  'whale-auto-',
  'smc-desk-',
  'smc-composite-',
  'smc-entry-playbook-',
  'candle-analysis-',
  'fusion-structure-',
  'parkf-',
  'cptc-',
  'ai-zone-',
  'bible-',
  'ls-plan-',
  'tailong-',
  'tap-',
  'beam-',
  'settlement-path-',
];

function isClutterId(id: string): boolean {
  return CLUTTER_PREFIXES.some((p) => id.startsWith(p));
}

export function referenceDeskLayerSettingKey(
  layer: ReferenceDeskLwcLayer
): keyof Pick<
  UserSettings,
  | 'chartReferenceDeskLayerStructure'
  | 'chartReferenceDeskLayerZones'
  | 'chartReferenceDeskLayerPatterns'
  | 'chartReferenceDeskLayerMtfMarkers'
> {
  switch (layer) {
    case 'structure':
      return 'chartReferenceDeskLayerStructure';
    case 'zones':
      return 'chartReferenceDeskLayerZones';
    case 'patterns':
      return 'chartReferenceDeskLayerPatterns';
    case 'mtf':
      return 'chartReferenceDeskLayerMtfMarkers';
  }
}

export function referenceDeskLayerPatch(layer: ReferenceDeskLwcLayer, on: boolean): Partial<UserSettings> {
  return { [referenceDeskLayerSettingKey(layer)]: on };
}

export function referenceDeskAllLayersPatch(on: boolean): Partial<UserSettings> {
  return {
    chartReferenceDeskLayerStructure: on,
    chartReferenceDeskLayerZones: on,
    chartReferenceDeskLayerPatterns: on,
    chartReferenceDeskLayerMtfMarkers: on,
  };
}

export function readReferenceDeskLayerFlags(settings: Pick<UserSettings, keyof UserSettings>): ReferenceDeskLwcLayerFlags {
  return {
    structure: settings.chartReferenceDeskLayerStructure !== false,
    zones: settings.chartReferenceDeskLayerZones !== false,
    patterns: settings.chartReferenceDeskLayerPatterns !== false,
    mtf: settings.chartReferenceDeskLayerMtfMarkers !== false,
  };
}

/** 실시간 검증 행 → LWC 레이어 */
export function auditRowToReferenceDeskLayer(rowId: string): ReferenceDeskLwcLayer | null {
  if (rowId === 'structure') return 'structure';
  if (rowId === 'zones') return 'zones';
  if (rowId === 'harmonic') return 'patterns';
  if (rowId === 'mtf') return 'mtf';
  return null;
}

export function isReferenceDeskStructureOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const kind = String(o.kind || '');
  const cat = String(o.category || '');
  if (isClutterId(id)) return false;
  if (id.startsWith('trade-atlas-') || id.startsWith('ref-desk-mtf-')) return false;
  if (kind === 'bos' || kind === 'choch') return true;
  if (
    id.startsWith('key-mustBreak-') ||
    id.startsWith('key-mustHold-') ||
    id.startsWith('key-invalidation-') ||
    id.startsWith('key-nextTarget-') ||
    id.startsWith('key-mustReclaim-') ||
    id === 'key-mustHold-close'
  ) {
    return true;
  }
  if (kind === 'supportLine' || kind === 'resistanceLine') return true;
  if (id === 'equilibrium' || id === 'strong-high' || id === 'strong-low') return true;
  if (kind === 'liquiditySweep' || kind === 'eqh' || kind === 'eql') return true;
  if (kind === 'trendLine' || (id.startsWith('diag-') && !id.startsWith('diag-parkf'))) return true;
  if (cat === 'trendlineEngine' || cat === 'autoTrendline') return true;
  return false;
}

export function isReferenceDeskZoneOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const kind = String(o.kind || '');
  const cat = String(o.category || '');
  if (isClutterId(id)) return false;
  if (id.startsWith('trade-atlas-') || id.startsWith('ref-desk-mtf-')) return false;
  if (['demandZone', 'supplyZone', 'fvg', 'ob', 'reactionZone', 'zone', 'bprZone', 'po3Phase'].includes(kind)) {
    return true;
  }
  if (cat === 'reactionZone' || cat === 'strongZone') return true;
  if (id.startsWith('reaction-zone-')) return true;
  if (/^major-support-\d+-zone$/.test(id) || /^major-resistance-\d+-zone$/.test(id)) return true;
  if (id.startsWith('settlement-zone-')) return true;
  if (id.startsWith('ref-assets-')) return true;
  return false;
}

export function isReferenceDeskPatternOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const kind = String(o.kind || '');
  const cat = String(o.category || '');
  if (isClutterId(id)) return false;
  if (id.startsWith('trade-atlas-') || id.startsWith('ref-desk-mtf-')) return false;
  if (kind === 'harmonic' || kind === 'harmonicLeg') return true;
  if (cat === 'harmonic' || cat === 'patternVision') return true;
  if (cat === 'candlePattern' || id.includes('-pattern-') || id.startsWith('pattern-')) return true;
  if (kind === 'rsiSignal' || kind === 'rsiDivergenceLine' || cat === 'rsi') return true;
  if (kind === 'fibLine' && (id.startsWith('fib-') || cat === 'fib')) return true;
  if (id.startsWith('ref-assets-')) return true;
  return false;
}

export function isReferenceDeskProtectedOverlay(
  o: OverlayItem,
  flags: ReferenceDeskLwcLayerFlags
): boolean {
  const id = String(o.id || '');
  if (id.startsWith('trade-atlas-')) return true;
  if (id.startsWith('ref-desk-mtf-') && flags.mtf) return true;
  if (id.startsWith('ref-assets-')) return true;
  if (flags.structure && isReferenceDeskStructureOverlay(o)) return true;
  if (flags.zones && isReferenceDeskZoneOverlay(o)) return true;
  if (flags.patterns && isReferenceDeskPatternOverlay(o)) return true;
  return false;
}

type MtfSignalLike = {
  tf: string;
  verdict: string;
  confidence?: number;
  signalTime?: number | null;
};

function tfLabel(tf: string): string {
  if (tf === '1w') return '1W';
  if (tf === '1M') return '1M';
  return tf;
}

/** MTF 보드 신호 → 캔들 위 핀 라벨 */
export function buildReferenceDeskMtfMarkerOverlays(
  candles: Candle[],
  mtfSignals: MtfSignalLike[],
  analysis: AnalyzeResponse | null,
  chartTf: string
): OverlayItem[] {
  if (!candles.length) return [];
  const out: OverlayItem[] = [];
  const last = candles[candles.length - 1];
  const tEnd = last.time as number;
  const normTf = (t: string) => (t === '1w' ? '1w' : t);

  const multi = (analysis as AnalyzeResponse & {
    multiTF?: { htf?: string; ltf?: string; htfLabel?: string; ltfLabel?: string; trend1M?: string };
  } | null)?.multiTF;

  if (multi?.htf || multi?.ltf || multi?.trend1M) {
    const parts: string[] = [];
    if (multi.trend1M) parts.push(`1M ${multi.trend1M}`);
    if (multi.htf) parts.push(`${multi.htfLabel ?? 'HTF'} ${multi.htf}`);
    if (multi.ltf) parts.push(`${multi.ltfLabel ?? 'LTF'} ${multi.ltf}`);
    out.push({
      id: 'ref-desk-mtf-summary',
      kind: 'label',
      label: `MTF ${parts.join(' · ')}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: Math.max(0, tEnd - 1),
      time2: tEnd,
      price1: last.high,
      price2: last.high,
      confidence: 88,
      color: 'rgba(56,189,248,0.95)',
      lineLabelColor: '#38bdf8',
      category: 'labels',
      overlayZoneExtraClass: 'overlay-zone--ref-desk-mtf-summary',
    });
  }

  for (const sig of mtfSignals) {
    const tf = normTf(String(sig.tf || ''));
    if (!tf) continue;
    let candle = last;
    if (sig.signalTime != null && Number.isFinite(sig.signalTime)) {
      const hit = candles.find((c) => Number(c.time) === Number(sig.signalTime));
      if (hit) candle = hit;
    }
    const isLong = sig.verdict === 'LONG';
    const isShort = sig.verdict === 'SHORT';
    const mark = isLong ? '▲L' : isShort ? '▼S' : '·';
    const conf = Number.isFinite(sig.confidence) ? ` ${Math.round(sig.confidence!)}%` : '';
    out.push({
      id: `ref-desk-mtf-${tf}`,
      kind: 'label',
      label: `${tfLabel(tf)} ${mark}${conf}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: candle.time as number,
      time2: tEnd,
      price1: isLong ? candle.low : isShort ? candle.high : candle.close,
      price2: isLong ? candle.low : isShort ? candle.high : candle.close,
      confidence: 85,
      color: isLong ? 'rgba(34,197,94,0.95)' : isShort ? 'rgba(239,68,68,0.95)' : 'rgba(148,163,184,0.92)',
      lineLabelColor: isLong ? '#4ade80' : isShort ? '#f87171' : '#cbd5e1',
      category: 'labels',
      overlayZoneExtraClass: `overlay-zone--ref-desk-mtf overlay-zone--ref-desk-mtf-${tf === chartTf ? 'active' : 'idle'}`,
      labelTooltip: `${tfLabel(tf)} ${sig.verdict}${conf} — MTF 참고(확정 아님)`,
    });
  }

  return out;
}

export function buildReferenceDeskLwcOverlayPack(input: {
  pool: OverlayItem[];
  analysis: AnalyzeResponse | null;
  candles: Candle[];
  timeframe: string;
  flags: ReferenceDeskLwcLayerFlags;
  mtfSignals?: MtfSignalLike[];
  strongZones?: OverlayItem[];
  assetsDrawingGuide?: boolean;
}): OverlayItem[] {
  const {
    pool,
    analysis,
    candles,
    timeframe,
    flags,
    mtfSignals = [],
    strongZones = [],
    assetsDrawingGuide = true,
  } = input;
  const picked: OverlayItem[] = [];

  if (flags.structure) {
    for (const o of pool) {
      if (isReferenceDeskStructureOverlay(o)) picked.push(o);
    }
  }

  if (flags.zones) {
    for (const o of pool) {
      if (isReferenceDeskZoneOverlay(o)) picked.push(o);
    }
    if (strongZones.length) {
      for (const o of strongZones) {
        if (isReferenceDeskZoneOverlay(o)) picked.push(o);
      }
    }
  }

  if (flags.patterns) {
    for (const o of pool) {
      if (isReferenceDeskPatternOverlay(o)) picked.push(o);
    }
  }

  if (flags.mtf) {
    picked.push(...buildReferenceDeskMtfMarkerOverlays(candles, mtfSignals, analysis, timeframe));
  }

  if (assetsDrawingGuide !== false) {
    return applyAssetsChartDrawingConventions(picked, {
      showPriceInLabel: true,
      smcZoneStateLabels: true,
    });
  }

  return picked;
}
