'use client';

import MonthDeskCoreCockpit from './MonthDeskCoreCockpit';
import type { AnalyzeResponse, Candle } from '@/types';
import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import type { TradeConfirmAlert } from '@/app/components/useTradeConfirmNotifier';
import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';

type Props = {
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse | null;
  loading: boolean;
  candles: Candle[] | null;
  theme?: 'dark' | 'light';
  confirmDesk?: TradeConfirmDesk | null;
  lastAlert?: TradeConfirmAlert | null;
  onDismissAlert?: () => void;
  chartVerdictValidation?: MonthDeskVerdictValidationSummary | null;
  soundEnabled?: boolean;
};

/** 핵심만 — 롱/숏·타점·지지/저항 게이지·가격 맵 */
export default function MonthDeskVisualDashboard(props: Props) {
  return <MonthDeskCoreCockpit {...props} />;
}
