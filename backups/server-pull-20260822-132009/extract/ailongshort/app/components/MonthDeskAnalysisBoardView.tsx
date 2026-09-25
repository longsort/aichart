'use client';

import { useState, type ReactNode } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';
import TemporalComparePanel from '@/app/components/TemporalComparePanel';
import type { UIMode } from './UIModeSwitcher';
import UIModeSwitcher from './UIModeSwitcher';
import MonthStartDeskCard from './MonthStartDeskCard';
import MonthDeskVisualDashboard from './monthDesk/MonthDeskVisualDashboard';
import { TF_CLOSE_SETTLE_ORDER } from '@/lib/tfCloseSettleAssessment';
import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import type { TradeConfirmAlert } from '@/app/components/useTradeConfirmNotifier';
import MonthDeskChartPulseBridge from './monthDesk/MonthDeskChartPulseBridge';
import styles from './MonthDeskAnalysisBoard.module.css';

type ViewTab = 'board' | 'chart';

type Props = {
  uiMode: UIMode;
  onUiModeChange: (mode: UIMode) => void;
  symbol: string;
  timeframe: string;
  theme: 'dark' | 'light';
  analysis: AnalyzeResponse | null;
  loading: boolean;
  fusionCandles: Candle[] | null;
  chartVerdictValidation: MonthDeskVerdictValidationSummary | null;
  showTemporalCompare?: boolean;
  onRequestChartTf: (tf: string) => void;
  chartSlot?: () => ReactNode;
  confirmDesk?: TradeConfirmDesk | null;
  lastAlert?: TradeConfirmAlert | null;
  onDismissAlert?: () => void;
  soundEnabled?: boolean;
};

export default function MonthDeskAnalysisBoardView({
  uiMode,
  onUiModeChange,
  symbol,
  timeframe,
  analysis,
  loading,
  fusionCandles,
  chartVerdictValidation,
  showTemporalCompare = true,
  onRequestChartTf,
  chartSlot,
  theme,
  confirmDesk,
  lastAlert,
  onDismissAlert,
  soundEnabled = true,
}: Props) {
  const [viewTab, setViewTab] = useState<ViewTab>('board');
  const [showDetailTable, setShowDetailTable] = useState(false);

  return (
    <div className={styles.board} data-theme={theme}>
      <MonthDeskChartPulseBridge />
      <div className={styles.boardHeader}>
        <div>
          <div className={styles.boardTitle}>마감 · 안착</div>
          <div className={styles.boardSub}>
            {symbol} · {timeframe} — 롱/숏 · 타점 · 지지/저항
          </div>
        </div>
        <UIModeSwitcher uiMode={uiMode} setUiMode={onUiModeChange} />
      </div>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${viewTab === 'board' ? 'tool-chip-active' : ''}`}
          onClick={() => setViewTab('board')}
        >
          핵심 보드
        </button>
        {typeof chartSlot === 'function' && (
          <button
            type="button"
            className={`tool-chip tool-chip-button ${viewTab === 'chart' ? 'tool-chip-active' : ''}`}
            onClick={() => setViewTab('chart')}
          >
            차트
          </button>
        )}
        {TF_CLOSE_SETTLE_ORDER.map((tf) => (
          <button
            key={tf}
            type="button"
            className={`tool-chip tool-chip-button ${timeframe === tf ? 'tool-chip-active' : ''}`}
            style={{ fontSize: 10, padding: '4px 8px' }}
            onClick={() => onRequestChartTf(tf)}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className={styles.boardScroll}>
      {viewTab === 'board' ? (
        <>
          <MonthDeskVisualDashboard
            symbol={symbol}
            timeframe={timeframe}
            analysis={analysis}
            loading={loading}
            candles={fusionCandles}
            theme={theme}
            confirmDesk={confirmDesk}
            lastAlert={lastAlert}
            onDismissAlert={onDismissAlert}
            chartVerdictValidation={chartVerdictValidation}
            soundEnabled={soundEnabled}
          />
          {showTemporalCompare && analysis && (
            <TemporalComparePanel
              analysis={analysis}
              symbol={symbol}
              timeframe={timeframe}
              chartVerdictValidation={chartVerdictValidation}
            />
          )}
          <button
            type="button"
            className="tool-chip tool-chip-button"
            style={{ alignSelf: 'flex-start', fontSize: 10 }}
            onClick={() => setShowDetailTable((v) => !v)}
          >
            {showDetailTable ? '마감표 숨기 ▲' : '마감표 상세 ▼'}
          </button>
          {showDetailTable && (
            <MonthStartDeskCard
              symbol={symbol}
              chartTimeframe={timeframe}
              chartVerdictValidation={chartVerdictValidation}
              onRequestChartTf={onRequestChartTf}
              theme={theme}
            />
          )}
        </>
      ) : typeof chartSlot === 'function' ? (
        <div className={styles.chartSlot}>{chartSlot()}</div>
      ) : null}
      </div>
    </div>
  );
}
