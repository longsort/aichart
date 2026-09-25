'use client';

import type { AnalyzeResponse, Candle } from '@/types';
import type { UIMode } from '@/lib/settings';
import MonthDeskPracticalDesk from '@/app/components/monthDesk/MonthDeskPracticalDesk';
import MonthDeskBriefingSyncStrip from '@/app/components/monthDesk/MonthDeskBriefingSyncStrip';
import type { TradeConfirmAlert } from '@/app/components/useTradeConfirmNotifier';
import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import { useTradePracticalBundle } from '@/app/components/useTradePracticalBundle';

const MODE_KO: Partial<Record<UIMode, string>> = {
  AI_ZONE: 'AI분석',
  WHALE: '고래',
  UNIFIED_DESK: '합성',
  MONTH_START_DESK: '마감·안착',
  ZONE_LINE_PRO: '존·라인',
  FUSION_MODE: '융합',
  MAX_ANALYSIS: '최강분석',
  EXECUTION: '실행',
  SMART: '스마트',
  SMC_DESK: 'SMC',
  HOT_ZONE: '핫존',
  TAPPOINT: '타점',
};

type Props = {
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse | null;
  candles: Candle[] | null;
  theme?: 'dark' | 'light';
  uiMode?: UIMode;
  compact?: boolean;
  confirmDesk?: TradeConfirmDesk | null;
  lastAlert?: TradeConfirmAlert | null;
  onDismissAlert?: () => void;
  chartVerdictValidation?: import('@/lib/monthDeskClosingEngine').MonthDeskVerdictValidationSummary | null;
};

/** 전 모드 — 실전 커맨드 센터 */
export default function TradePracticalDesk({
  symbol,
  timeframe,
  analysis,
  candles,
  theme = 'dark',
  uiMode,
  compact,
  confirmDesk,
  lastAlert,
  onDismissAlert,
  chartVerdictValidation,
}: Props) {
  const { metrics, levels, whale } = useTradePracticalBundle(analysis, candles, symbol, timeframe);

  if (!analysis) {
    return (
      <div className="subtle" style={{ fontSize: 11, marginBottom: 12, padding: '10px 12px' }}>
        분석 로드 후 커맨드 센터가 표시됩니다.
      </div>
    );
  }

  const modeKo = uiMode ? MODE_KO[uiMode] ?? uiMode : null;

  return (
    <div style={{ marginBottom: compact ? 8 : 14 }}>
      {uiMode === 'MONTH_START_DESK' && (
        <MonthDeskBriefingSyncStrip
          symbol={symbol}
          timeframe={timeframe}
          analysis={analysis}
          candles={candles}
          chartVerdictValidation={chartVerdictValidation}
        />
      )}
      {modeKo && !compact && (
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, fontWeight: 800, letterSpacing: '0.06em' }}>
          {symbol} · {timeframe} · {modeKo}
        </div>
      )}
      <MonthDeskPracticalDesk
        metrics={metrics}
        levels={levels}
        whale={whale}
        analysis={analysis}
        theme={theme}
        compact={compact}
        uiMode={uiMode}
        confirmDesk={confirmDesk}
        lastAlert={lastAlert}
        onDismissAlert={onDismissAlert}
      />
    </div>
  );
}
