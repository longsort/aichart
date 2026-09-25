'use client';



import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AnalyzeResponse, Candle } from '@/types';

import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';

import type { MergedAnalysisCardPanel, MergedAnalysisDeskHud } from '@/lib/mergedAnalysisDeskEngine';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedTradeSignal, MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';

import {

  buildMergedIntegratedHubSnapshot,

  type MergedIntegratedHubSnapshot,

} from '@/lib/mergedAnalysisIntegratedHub';

import {
  buildMergedIntegratedHubSnapshotFull,
  type MergedIntegratedHubSnapshotFull,
} from '@/lib/mergedAnalysisPrecisionEnrichment';

import {

  buildMergedIntegratedMtfBoard,

  mergeMtfAnalyzesWithChart,

  type MergedIntegratedMtfTfRow,

} from '@/lib/mergedIntegratedMtfBoard';

import type { MergedMtfConsensusResult } from '@/lib/mergedAnalysisMtfConsensus';

import { useUnifiedBriefingExternal } from '@/lib/useUnifiedBriefingExternal';

import { useTfCloseSettleBoard } from '@/lib/useTfCloseSettleBoard';



const MTF_POLL_MS = 30_000;

/** 허브 라이브 틱 — 기능 유지, 재계산 주기만 완화(렉) */
const LIVE_TICK_MS = 8_000;



type Params = {

  symbol: string;

  chartTf: string;

  analysis: AnalyzeResponse | null;

  candles: Candle[] | null;

  trade: MergedTradeSignal | null;

  judgment: MergedTradeJudgment | null;

  cardPanel: MergedAnalysisCardPanel | null;

  strikeBundle: MonthDeskStrikeDeskBundle | null;

  deskHud: MergedAnalysisDeskHud | null;

  deskChart?: {
    keyZones?: MergedKeyZone[] | null;
    directionConfirms?: MergedDirectionConfirm[] | null;
    criticalZones?: MergedCriticalZone[] | null;
    bounceScenarios?: MergedBounceScenario[] | null;
    smcLeading?: MergedSmcLeadingContext | null;
    vrvp?: MergedVrvpProfile | null;
  } | null;

  enabled?: boolean;

};



export function useMergedAnalysisIntegratedHub(params: Params) {

  const enabled = params.enabled !== false;

  const { board: settleBoard, loading: settleLoading, reload: reloadSettle } = useTfCloseSettleBoard(

    params.symbol,

    enabled

  );



  const [mtfRows, setMtfRows] = useState<Array<{ tf: string; analyze: AnalyzeResponse | null }>>([]);

  const [mtfLoading, setMtfLoading] = useState(false);

  const [lastMtfAt, setLastMtfAt] = useState(0);

  const [tick, setTick] = useState(0);

  const mtfGen = useRef(0);



  const fetchMtf = useCallback(

    async (bust = false) => {

      if (!enabled || !params.symbol) return;

      const gen = ++mtfGen.current;

      setMtfLoading(true);

      try {

        const q = new URLSearchParams({

          symbol: params.symbol,

          timeframe: params.chartTf,

        });

        if (bust) q.set('_', String(Date.now()));

        const res = await fetch(`/api/mtf-signal-board?${q.toString()}`, {

          credentials: 'same-origin',

          cache: 'no-store',

        });

        const j = (await res.json()) as { rows?: Array<{ tf: string; analyze: AnalyzeResponse }> };

        if (gen !== mtfGen.current) return;

        const rows = Array.isArray(j.rows)

          ? j.rows.map((row) => ({

              tf: row.tf,

              analyze: (row.analyze as AnalyzeResponse) ?? null,

            }))

          : [];

        setMtfRows(rows);

        setLastMtfAt(Date.now());

      } catch {

        if (gen === mtfGen.current) setMtfRows([]);

      } finally {

        if (gen === mtfGen.current) setMtfLoading(false);

      }

    },

    [enabled, params.symbol, params.chartTf]

  );



  useEffect(() => {

    void fetchMtf(true);

  }, [fetchMtf, params.analysis?.currentPrice, params.candles?.length]);



  useEffect(() => {

    if (!enabled) return;

    const id = window.setInterval(() => void fetchMtf(false), MTF_POLL_MS);

    return () => window.clearInterval(id);

  }, [enabled, fetchMtf]);



  useEffect(() => {

    if (!enabled) return;

    const id = window.setInterval(() => setTick((t) => t + 1), LIVE_TICK_MS);

    return () => window.clearInterval(id);

  }, [enabled]);



  const mergedMtfAnalyzes = useMemo(

    () => mergeMtfAnalyzesWithChart(params.chartTf, params.analysis, mtfRows),

    [params.chartTf, params.analysis, mtfRows]

  );



  const baseSnapshot: MergedIntegratedHubSnapshot | null = useMemo(() => {

    if (!enabled) return null;

    if (!params.analysis && !params.strikeBundle && mergedMtfAnalyzes.every((r) => !r.analyze)) return null;

    return buildMergedIntegratedHubSnapshot({

      symbol: params.symbol,

      chartTf: params.chartTf,

      analysis: params.analysis,

      candles: params.candles,

      settleBoard,

      mtfAnalyzes: mergedMtfAnalyzes,

      trade: params.trade,

      judgment: params.judgment,

      cardPanel: params.cardPanel,

      strikeBundle: params.strikeBundle,

      deskHud: params.deskHud,

      deskChart: params.deskChart ?? null,

      updatedAt: lastMtfAt || Date.now(),

    });

  }, [

    enabled,

    params.symbol,

    params.chartTf,

    params.analysis,

    params.candles,

    params.trade,

    params.judgment,

    params.cardPanel,

    params.strikeBundle,

    params.deskHud,

    params.deskChart,

    settleBoard,

    mergedMtfAnalyzes,

    lastMtfAt,

    tick,

  ]);



  const consensus: MergedMtfConsensusResult | null = baseSnapshot?.consensus ?? null;



  const externalHook = useUnifiedBriefingExternal({

    symbol: params.symbol,

    chartTf: params.chartTf,

    currentPrice: baseSnapshot?.currentPrice ?? params.analysis?.currentPrice ?? null,

    masterDirection: baseSnapshot?.masterDirection ?? 'NEUTRAL',

    enabled,

  });



  const mtfBoard: MergedIntegratedMtfTfRow[] = useMemo(

    () =>

      buildMergedIntegratedMtfBoard({

        chartTf: params.chartTf,

        chartAnalysis: params.analysis,

        consensus,

        mtfAnalyzes: mergedMtfAnalyzes,

      }),

    [params.chartTf, params.analysis, consensus, mergedMtfAnalyzes]

  );



  const snapshot: MergedIntegratedHubSnapshotFull | null = useMemo(() => {

    if (!baseSnapshot) return null;

    return buildMergedIntegratedHubSnapshotFull({

      snapshot: baseSnapshot,

      analysis: params.analysis,

      trade: params.trade,

      judgment: params.judgment,

      mtfBoard,

      external: externalHook.context,

      mtfAnalyzes: mergedMtfAnalyzes,

    });

  }, [

    baseSnapshot,

    params.analysis,

    params.trade,

    params.judgment,

    mtfBoard,

    externalHook.context,

  ]);



  const reloadAll = useCallback(() => {

    void fetchMtf(true);

    void reloadSettle(true);

    void externalHook.reload();

  }, [fetchMtf, reloadSettle, externalHook.reload]);



  const isLive = snapshot?.isLive ?? false;



  return {

    snapshot,

    consensus,

    mtfRows: mergedMtfAnalyzes,

    mtfBoard,

    mtfLoading,

    settleLoading,

    externalLoading: externalHook.loading,

    settleBoard,

    reloadAll,

    isLive,

    lastRefreshAt: lastMtfAt,

  };

}

