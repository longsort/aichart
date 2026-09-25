'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { MonthDeskUnifiedBriefingSnapshot } from '@/lib/monthDeskUnifiedPrecisionBriefing';

export type MonthDeskUnifiedBriefingContextValue = {
  snapshot: MonthDeskUnifiedBriefingSnapshot | null;
  llmNarrative: string;
  llmLoading: boolean;
  mtfLoading: boolean;
  reloadMtf: () => void;
};

const Ctx = createContext<MonthDeskUnifiedBriefingContextValue | null>(null);

export function MonthDeskUnifiedBriefingProvider({
  value,
  children,
}: {
  value: MonthDeskUnifiedBriefingContextValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMonthDeskUnifiedBriefing(): MonthDeskUnifiedBriefingContextValue | null {
  return useContext(Ctx);
}
