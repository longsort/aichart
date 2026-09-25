/**
 * Doksuri-1 — 공개 엔트리: candles/analysis/whale/desk → pack.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { DumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import type { MergedDeskStructureVerdictPack } from '@/lib/mergedDeskStructureVerdict';
import type { Doksuri1Pack } from '@/lib/doksuri1/types';
import { buildDoksuri1Fact } from '@/lib/doksuri1/factBuilder';
import { buildDoksuri1StoryPack } from '@/lib/doksuri1/marketStory';
import type { DualPlanSwingLite } from '@/lib/doksuri1/dualPlanBuilder';
import type { HqEntryZonesPack } from '@/lib/mergedDeskHqEntryZones';
import { buildDoksuri1MergedDeskIntel } from '@/lib/doksuri1/mergedDeskIntel';

export type BuildDoksuri1PackInput = {
  symbol: string;
  timeframe: string;
  price: number;
  candles: Candle[];
  dumpZones?: MtfDumpZoneSpec[] | null;
  srPath?: DumpSupportResistPath | null;
  whale?: WhaleBeamIntelPack | null;
  structure?: MergedDeskStructureVerdictPack | null;
  swing?: DualPlanSwingLite | null;
  levels?: {
    entry?: number | null;
    sl?: number | null;
    tp1?: number | null;
    tp2?: number | null;
    tp3?: number | null;
  } | null;
  analysis?: AnalyzeResponse | null;
  trades?: AggTrade[] | null;
  histBullPct?: number | null;
  histBearPct?: number | null;
  histN?: number | null;
  /** OFF면 null */
  enabled?: boolean;
  /** OI/CVD CASE — 칩 OFF면 생략 */
  derivEnabled?: boolean;
  /** 오더플로 흡수 — 칩 OFF면 생략 */
  orderflowEnabled?: boolean;
  /** 리스크 사이징 — 미지정 시 1000USDT · 5% */
  accountUsdt?: number | null;
  riskPct?: number | null;
  hqEntryZones?: HqEntryZonesPack | null;
  deskHud?: Parameters<typeof buildDoksuri1MergedDeskIntel>[0]['deskHud'];
  masterGrade?: string | null;
  masterSide?: string | null;
};

export function buildDoksuri1Pack(input: BuildDoksuri1PackInput): Doksuri1Pack | null {
  if (input.enabled === false) return null;
  const fact = buildDoksuri1Fact({
    symbol: input.symbol,
    timeframe: input.timeframe,
    price: input.price,
    candles: input.candles ?? [],
    dumpZones: input.dumpZones,
    srPath: input.srPath,
    whale: input.whale,
    structure: input.structure,
    swing: input.swing,
    levels: input.levels,
    analysis: input.analysis,
    trades: input.trades,
    histBullPct: input.histBullPct,
    histBearPct: input.histBearPct,
    histN: input.histN,
    derivEnabled: input.derivEnabled,
    orderflowEnabled: input.orderflowEnabled,
    hqEntryZones: input.hqEntryZones,
    deskHud: input.deskHud,
    masterGrade: input.masterGrade,
    masterSide: input.masterSide,
  });
  const story = buildDoksuri1StoryPack(fact, {
    accountUsdt: input.accountUsdt ?? undefined,
    riskPct: input.riskPct ?? undefined,
  });
  return { fact, ...story };
}

/** 서버 고래빔 조회 — HTTP만 (클라이언트 안전). 로컬 CSV 폴백은 whaleFetchServer. */
export async function fetchDoksuri1WhaleBeamPack(params: {
  apiBase: string;
  symbol: string;
  timeframe: string;
  candles?: Candle[];
}): Promise<WhaleBeamIntelPack | null> {
  const base = (params.apiBase || '').replace(/\/$/, '');
  const symbol = String(params.symbol || '').toUpperCase();
  const tf = String(params.timeframe || '15m');
  if (!base || !symbol) return null;
  const tfs = Array.from(new Set([tf, '15m', '1h', '4h']));
  for (const tryTf of tfs) {
    try {
      const bq = new URLSearchParams({ symbol, timeframe: tryTf });
      const beamRes = await fetch(`${base}/api/bitget-whale-volume-beam-intel?${bq}`, {
        cache: 'no-store',
      });
      if (!beamRes.ok) continue;
      const beamData = (await beamRes.json()) as {
        ok?: boolean;
        intel?: WhaleBeamIntelPack | null;
      };
      if (beamData?.ok && beamData.intel) return beamData.intel;
    } catch {
      /* try next */
    }
  }
  return null;
}
