/**
 * Eagle1 analyze → merged desk chart zone overlays (Supply/Demand/OB/POC/구조선).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { Eagle1MainPlan } from './signalEngine';
import { buildStructureDeskOverlays } from './structureDeskDraw';
import { buildEagle1AiAnalysisZoneOverlays } from './aiAnalysisZoneOverlays';
import { eagle1ZonesToOverlays } from './zoneOverlays';
import type { Eagle1AiZonePack } from './aiZonePack';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import type { ZoneEngineResult } from './zoneEngine';
import type { StructureSnapshot } from './structureEngine';
import type { Eagle1SmartPath } from './smartPath';
import type { Eagle1ChartMode } from './chartUx';

export function buildEagle1ChartZoneOverlays(params: {
  analysis: AnalyzeResponse | null;
  candles: Candle[];
  enabled: boolean;
  /** true = AI ZONE v2 (통합·Hot·반응·플랜 confluence) */
  aiOnly?: boolean;
  aiZonePack?: Eagle1AiZonePack | null;
  hotZoneEntry?: MergedDeskHotZoneEntryPack | null;
}): OverlayItem[] {
  if (!params.enabled) return [];
  if (params.aiOnly) {
    return buildEagle1AiAnalysisZoneOverlays({
      analysis: params.analysis,
      candles: params.candles,
      enabled: true,
      pack: params.aiZonePack ?? null,
      hotZoneEntry: params.hotZoneEntry ?? null,
    });
  }
  if (!params.analysis) return [];
  const candles =
    params.candles.length >= 2
      ? params.candles
      : ((params.analysis.eagle1SparkCandles ?? []) as Candle[]);
  if (candles.length < 2) return [];

  const lastTime = Number(candles[candles.length - 1]?.time);
  if (!(lastTime > 0)) return [];

  const analysis = params.analysis;
  const plan = (analysis.eagle1MainPlan ?? null) as Eagle1MainPlan | null;
  const zones = analysis.eagle1Zones as ZoneEngineResult | null | undefined;
  const structure = analysis.eagle1Structure as StructureSnapshot | null | undefined;
  const smartPath = analysis.eagle1SmartPath as Eagle1SmartPath | null | undefined;
  const mode =
    ((analysis.eagle1ChartUx as { mode?: Eagle1ChartMode } | null | undefined)?.mode ??
      'practical') as Eagle1ChartMode;

  const zoneOvs = eagle1ZonesToOverlays({
    zones: zones?.zones,
    clusters: zones?.clusters,
    recommended: zones?.recommended,
    displaySupport: zones?.displaySupport,
    displayResist: zones?.displayResist,
    lastTime,
    mode,
    pocState: zones?.profile?.pocState,
    reaction: zones?.reaction,
  });

  const structOvs = buildStructureDeskOverlays({
    lastTime,
    candles,
    events: structure?.events,
    equalHighs: structure?.equalHighs,
    equalLows: structure?.equalLows,
    displaySupport: zones?.displaySupport,
    displayResist: zones?.displayResist,
    poc: zones?.profile?.poc ?? null,
    pocState: zones?.profile?.pocState,
    smartPath: smartPath ?? null,
    entryLow: plan?.entryLow ?? null,
    entryHigh: plan?.entryHigh ?? null,
    direction: plan?.direction ?? null,
    entryZoneState: plan?.status ?? null,
  });

  const seen = new Set<string>();
  return [...zoneOvs, ...structOvs].filter((o) => {
    const id = String(o.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
