'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { MergedIntegratedHubSnapshotFull } from '@/lib/mergedAnalysisPrecisionEnrichment';
import type { MergedIntegratedMtfTfRow } from '@/lib/mergedIntegratedMtfBoard';
import type { MergedMtfConsensusResult } from '@/lib/mergedAnalysisMtfConsensus';

export type MergedIntegratedHubContextValue = {
  snapshot: MergedIntegratedHubSnapshotFull | null;
  consensus: MergedMtfConsensusResult | null;
  mtfBoard: MergedIntegratedMtfTfRow[];
  mtfLoading: boolean;
  settleLoading: boolean;
  isLive: boolean;
  lastRefreshAt: number;
  reloadAll: () => void;
  historyDashboard?: import('@/lib/mtfStatisticsHistoryStore').MtfStatisticsHistoryDashboard | null;
  historyLoading?: boolean;
  historyReload?: () => void;
};

const Ctx = createContext<MergedIntegratedHubContextValue | null>(null);

export function MergedIntegratedHubProvider({
  value,
  children,
}: {
  value: MergedIntegratedHubContextValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMergedIntegratedHubContext(): MergedIntegratedHubContextValue | null {
  return useContext(Ctx);
}
