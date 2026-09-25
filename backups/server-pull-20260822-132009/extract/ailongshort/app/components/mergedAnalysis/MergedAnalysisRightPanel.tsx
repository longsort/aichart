'use client';

import dynamic from 'next/dynamic';

import type { AnalyzeResponse, Candle } from '@/types';

import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';

import type { MergedAnalysisCardPanel, MergedAnalysisDeskHud, MergedTradeJudgment } from '@/lib/mergedAnalysisDeskEngine';

import type { MergedTradeSignal, MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';

import MergedAnalysisIntegratedHubSkeleton from './MergedAnalysisIntegratedHubSkeleton';

import styles from './MergedAnalysisDesk.module.css';

const MergedAnalysisIntegratedHub = dynamic(() => import('./MergedAnalysisIntegratedHub'), {
  ssr: false,
  loading: () => <MergedAnalysisIntegratedHubSkeleton />,
});

type Props = {
  symbol: string;

  timeframe: string;

  theme: 'dark' | 'light';

  analysis: AnalyzeResponse | null;

  strikeBundle: MonthDeskStrikeDeskBundle | null;

  cardPanel: MergedAnalysisCardPanel | null;

  tradeSignal: MergedTradeSignal | null;

  tradeJudgment: MergedTradeJudgment | null;

  deskHud: MergedAnalysisDeskHud | null;

  keyZones?: MergedKeyZone[] | null;

  directionConfirms?: MergedDirectionConfirm[] | null;

  criticalZones?: MergedCriticalZone[] | null;

  bounceScenarios?: MergedBounceScenario[] | null;

  smcLeading?: MergedSmcLeadingContext | null;

  vrvp?: MergedVrvpProfile | null;

  candleSourceKo?: string;

  fusionCandles?: Candle[] | null;

  /** false면 MTF 보드·허브 API 호출 없이 스켈레톤만 표시 */
  hubEnabled?: boolean;
  /** Bitget Vol ON + BTC — DNA 통계 카드 */
  bitgetDnaEnabled?: boolean;
};

export default function MergedAnalysisRightPanel({
  symbol,
  timeframe,
  theme,
  analysis,
  strikeBundle,
  cardPanel,
  tradeSignal,
  tradeJudgment,
  deskHud,
  keyZones,
  directionConfirms,
  criticalZones,
  bounceScenarios,
  smcLeading,
  vrvp,
  candleSourceKo,
  fusionCandles,
  hubEnabled = true,
  bitgetDnaEnabled = false,
}: Props) {
  return (
    <aside className={styles.rightPanel} data-theme={theme}>
      {hubEnabled ? (
        <MergedAnalysisIntegratedHub
          symbol={symbol}
          timeframe={timeframe}
          theme={theme}
          analysis={analysis}
          strikeBundle={strikeBundle}
          cardPanel={cardPanel}
          tradeSignal={tradeSignal}
          tradeJudgment={tradeJudgment}
          deskHud={deskHud}
          deskChart={{
            keyZones,
            directionConfirms,
            criticalZones,
            bounceScenarios,
            smcLeading,
            vrvp,
          }}
          candleSourceKo={candleSourceKo}
          fusionCandles={fusionCandles}
          hubEnabled
          bitgetDnaEnabled={bitgetDnaEnabled}
        />
      ) : (
        <MergedAnalysisIntegratedHubSkeleton />
      )}
    </aside>
  );
}
