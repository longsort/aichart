import type { OverlayItem } from '@/types';

/**
 * SMC 데스크 — 화면을 네 축으로 묶는 표현 모델 (엔진 출력은 그대로, **그리기 순서·역할만 통일**).
 *
 * - **zoneRect**: 수평 S/D·OB·FVG·핫존·핵심 S/R·강한 구간 등 면
 * - **trendRibbonBand**: 하이퍼 등 띠/스텝 존 (면)
 * - **channelCloud**: ChartPrime 채널 면 (channelBand)
 * - **trendStroke**: 추세·채널 경계선 (LinReg·CP·ParkF·diag 지그재그)
 * - **structureStroke**: BOS/CHOCH/스윕 등 구조 선
 * - **pivotGlyph**: 스윙·POI 핀
 * - **adaptiveSignal**: 스마트 적응 시그널
 * - **misc**: 기타 (중간 층)
 *
 * 캔들 이모티/마커는 `OverlayItem` 밖 → `SeriesMarkers`. **`buildSmcDeskMarkerPlan`** 으로 레이어별 ON 요약을 묶음.
 */
export type SmcDeskVisualPrimitive =
  | 'adaptiveSignal'
  | 'liquidityHeatZone'
  | 'supplyDemandZone'
  | 'macroContextZone'
  | 'trendRibbonBand'
  | 'channelCloud'
  | 'trendStroke'
  | 'structureStroke'
  | 'pivotGlyph'
  | 'liquidityToolkitZone'
  | 'misc';

export type SmcDeskVisualRow = {
  id: string;
  kind: string;
  primitive: SmcDeskVisualPrimitive;
  /** 낮을수록 먼저 그림(뒤). 배열 앞쪽 = 아래층. */
  tier: number;
};

export type SmcDeskVisualModel = {
  /** DOM/캔버스 페인트 순서: 뒤(존·구름) → 앞(선·핀) */
  paintOrdered: OverlayItem[];
  rows: SmcDeskVisualRow[];
};

/** SeriesMarkers 쪽 — 오버레이와 동일 “한 데스크”로 묶기 위한 레이어 요약 (실제 좌표는 ChartView) */
export type SmcDeskMarkerPlanLayer = {
  id: string;
  label: string;
  active: boolean;
  note?: string;
};

export type SmcDeskMarkerPlan = {
  layers: SmcDeskMarkerPlanLayer[];
};

/**
 * 캔들 마커 파이프라인과 동일 조건을 **플래그만**으로 요약 (디버그·문서·외부 번들용).
 * ChartView `useEffect`(마커) 분기와 맞춤.
 */
export function groupSmcDeskRowsByPrimitive(
  rows: SmcDeskVisualRow[]
): Partial<Record<SmcDeskVisualPrimitive, number>> {
  const out: Partial<Record<SmcDeskVisualPrimitive, number>> = {};
  for (const r of rows) {
    out[r.primitive] = (out[r.primitive] ?? 0) + 1;
  }
  return out;
}

export function buildSmcDeskMarkerPlan(p: {
  analysisMatches: boolean;
  unifiedMarkersOn: boolean;
  markerMetaAEffective: boolean;
  chartMarkerDensityC: boolean;
  chartMarkerLayerLs: boolean;
  chartMarkerLayerAux: boolean;
  chartMarkerLayerFrontRun: boolean;
  showHarmonic: boolean;
  showRsi: boolean;
  showTailongClose: boolean;
  showCandle: boolean;
  /** 통합작도에서만 RSI 극단 🔥·💧 */
  unifiedDeskMode: boolean;
  institutionalBandMarkersEnabled: boolean;
  /** 선확 마커 — ChartView SHOW_FRONT_RUN_ON_CHART */
  frontRunMarkersEnabled: boolean;
  /** 구조 로켓 — CHART_ROCKET_MARKERS_ALWAYS_ON */
  structureRocketMarkersEnabled: boolean;
}): SmcDeskMarkerPlan {
  const densityC = p.chartMarkerDensityC === true;
  const layerLs = !densityC || p.chartMarkerLayerLs !== false;
  const layerAux = !densityC || p.chartMarkerLayerAux !== false;
  const layerFr = !densityC || p.chartMarkerLayerFrontRun !== false;

  const layers: SmcDeskMarkerPlanLayer[] = [
    {
      id: 'ls-locked-rsi',
      label: 'L/S 확정·RSI-only',
      active: layerLs && p.analysisMatches,
      note: '밀도 C일 때 레이어 끔 가능',
    },
    {
      id: 'structure-rocket',
      label: '구조 로켓 🚀/📉',
      active: p.structureRocketMarkersEnabled && p.analysisMatches,
      note: 'CHART_ROCKET_MARKERS_ALWAYS_ON',
    },
    {
      id: 'rsi-extreme-unified',
      label: 'RSI 극단 🔥·💧',
      active: p.unifiedDeskMode && p.unifiedMarkersOn && p.analysisMatches && p.showRsi !== false,
      note: '통합작도 전용',
    },
    {
      id: 'candle-aux-meta',
      label: '캔들분석 보조 + 메타(A)',
      active: layerAux && p.unifiedMarkersOn && p.analysisMatches && p.markerMetaAEffective,
      note: 'SMC 데스크는 메타 기본 강제',
    },
    {
      id: 'candle-tailong-scores',
      label: '캔들·타이롱 점수',
      active:
        layerAux &&
        p.unifiedMarkersOn &&
        p.analysisMatches &&
        (p.showTailongClose || p.showCandle),
      note: 'buildCandleAnalysisMarkers',
    },
    {
      id: 'harmonic-pins',
      label: '하모닉 확정 핀',
      active: p.analysisMatches && p.showHarmonic,
    },
    {
      id: 'institutional-band-st',
      label: '기관 밴드 터치 ST',
      active: p.institutionalBandMarkersEnabled && p.analysisMatches,
    },
    {
      id: 'unified-ls-fusion',
      label: '통합 롱·숏 ⋈ (최신봉)',
      active: p.unifiedMarkersOn && p.analysisMatches,
    },
    {
      id: 'front-run',
      label: '선확(Front-run)',
      active: p.frontRunMarkersEnabled && layerFr && p.analysisMatches,
    },
  ];

  return { layers };
}

/** 오버레이 정렬 + 마커 플랜을 한 객체로 */
export type SmcDeskFullBundle = SmcDeskVisualModel & {
  markerPlan: SmcDeskMarkerPlan;
};

export function buildSmcDeskFullBundle(
  overlays: OverlayItem[],
  markerPlan: SmcDeskMarkerPlan
): SmcDeskFullBundle {
  const vm = buildSmcDeskVisualModel(overlays);
  return { ...vm, markerPlan };
}

function classifyPrimitive(item: OverlayItem): SmcDeskVisualPrimitive {
  const id = String(item.id || '');
  const k = String(item.kind || '');
  const cat = String(item.category || '');

  if (cat === 'smartAdaptive' || id.startsWith('smart-adaptive-')) return 'adaptiveSignal';
  if (id.startsWith('hotzone-')) return 'liquidityHeatZone';
  if (id.startsWith('hypertrend-')) return k === 'trendLine' ? 'trendStroke' : 'trendRibbonBand';
  if (k === 'channelBand' || (cat === 'chartPrimeTrendChannels' && k === 'channelBand')) return 'channelCloud';
  if (id.startsWith('whale-drs-') || id.startsWith('whale-lqb-')) return 'liquidityToolkitZone';
  if (['demandZone', 'supplyZone', 'ob', 'fvg'].includes(k)) return 'supplyDemandZone';
  if (k === 'zone') {
    if (/^major-(support|resistance)-/.test(id)) return 'macroContextZone';
    if (cat === 'strongZone') return 'macroContextZone';
    return 'supplyDemandZone';
  }
  if (cat === 'strongZone') return 'macroContextZone';
  if (k === 'swingLabel' || k === 'poi') return 'pivotGlyph';
  if (k === 'bos' || k === 'choch' || k === 'liquiditySweep') return 'structureStroke';
  if (k === 'trendLine') {
    if (cat === 'chartPrimeTrendChannels' || id.startsWith('cptc-')) return 'trendStroke';
    if (cat === 'trendlineEngine' || cat === 'autoTrendline' || id.startsWith('diag-') || id.startsWith('parkf-'))
      return 'trendStroke';
    return 'trendStroke';
  }
  if (k === 'supportLine' || k === 'resistanceLine' || k === 'eqh' || k === 'eql') return 'structureStroke';
  return 'misc';
}

/** 낮은 tier = 배열 앞 = 먼저 그려짐(일반적으로 아래층). */
function paintTier(item: OverlayItem): number {
  const id = String(item.id || '');
  const k = String(item.kind || '');
  const cat = String(item.category || '');
  const prim = classifyPrimitive(item);

  if (prim === 'adaptiveSignal') return 5;
  if (prim === 'liquidityHeatZone') return 10;
  if (prim === 'supplyDemandZone' || prim === 'macroContextZone') {
    if (id.startsWith('ai-auto-')) return 14;
    return 12;
  }
  if (prim === 'trendRibbonBand') return 18;
  if (id.startsWith('hypertrend-') && k === 'trendLine') return 28;
  if (prim === 'channelCloud') return 20;
  if (prim === 'liquidityToolkitZone') return 22;
  if (prim === 'trendStroke') {
    if (cat === 'chartPrimeTrendChannels' || id.startsWith('cptc-')) return 34;
    if (cat === 'trendlineEngine' || cat === 'autoTrendline' || id.startsWith('diag-') || id.startsWith('parkf-'))
      return 32;
    return 33;
  }
  if (prim === 'structureStroke') return 40;
  if (prim === 'pivotGlyph') return 75;
  if (k === 'label' && (cat === 'chartPrimeTrendChannels' || id.startsWith('cptc-'))) return 72;
  if (k === 'candlePattern' || cat === 'candle') return 78;
  if (prim === 'misc') return 45;
  return 50;
}

/**
 * SMC 데스크 오버레이를 **한 번에** 정렬해 존·구름 → 선 → 핀 순으로 쌓음.
 * (동일 tier 는 id 로 안정 정렬)
 */
export function buildSmcDeskVisualModel(overlays: OverlayItem[]): SmcDeskVisualModel {
  const rows: SmcDeskVisualRow[] = overlays.map((item) => ({
    id: String(item.id),
    kind: String(item.kind || ''),
    primitive: classifyPrimitive(item),
    tier: paintTier(item),
  }));

  const orderIndex = new Map(overlays.map((o, i) => [String(o.id), i]));
  const sorted = [...overlays].sort((a, b) => {
    const ta = paintTier(a);
    const tb = paintTier(b);
    if (ta !== tb) return ta - tb;
    const ia = orderIndex.get(String(a.id)) ?? 0;
    const ib = orderIndex.get(String(b.id)) ?? 0;
    return ia - ib;
  });

  return { paintOrdered: sorted, rows };
}
