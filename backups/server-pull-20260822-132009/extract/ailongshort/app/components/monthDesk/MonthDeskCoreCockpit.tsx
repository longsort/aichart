'use client';



import { useMemo } from 'react';

import type { AnalyzeResponse, Candle } from '@/types';

import { useTradePracticalBundle } from '@/app/components/useTradePracticalBundle';

import { getMonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';

import { buildMonthDeskSettleBoardStats } from '@/lib/monthDeskSettleBoardStats';

import { computeMonthDeskRrGauge } from '@/lib/monthDeskRrGaugeExplain';

import { buildMonthDeskConfirmDisplay } from '@/lib/monthDeskConfirmDisplay';

import { buildMonthDeskTradeAction } from '@/lib/monthDeskTradeAction';

import { buildTradeConfirmDesk } from '@/lib/tradeConfirmDesk';

import { computeMonthDeskPrecisionAnalysis } from '@/lib/monthDeskPrecisionAnalysis';

import { buildMonthDeskUnifiedBriefingSnapshot, applyExternalToMonthDeskBriefing } from '@/lib/monthDeskUnifiedPrecisionBriefing';

import { useUnifiedBriefingExternal } from '@/lib/useUnifiedBriefingExternal';

import { useMonthDeskMtfAnalyzes } from '@/lib/useMonthDeskMtfAnalyzes';

import { useMonthDeskUnifiedBriefingNarrate } from '@/lib/useMonthDeskUnifiedBriefingNarrate';

import MonthDeskVisualHub from './MonthDeskVisualHub';

import MonthDeskReferenceZonesPanel from './MonthDeskReferenceZonesPanel';

import CandleTradeAtlasBoard from './CandleTradeAtlasBoard';

import MonthDeskPracticalDesk from './MonthDeskPracticalDesk';

import MonthDeskSettleStatsPanel from './MonthDeskSettleStatsPanel';

import MonthDeskStrikeDesk from './MonthDeskStrikeDesk';

import MonthDeskUnifiedPrecisionBriefingCard from './MonthDeskUnifiedPrecisionBriefingCard';

import { MonthDeskUnifiedBriefingProvider } from './MonthDeskUnifiedBriefingContext';

import { buildMonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';

import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';

import type { TradeConfirmAlert } from '@/app/components/useTradeConfirmNotifier';

import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';

import styles from '../MonthDeskAnalysisBoard.module.css';



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



export default function MonthDeskCoreCockpit({

  symbol,

  timeframe,

  analysis,

  loading,

  candles,

  theme = 'dark',

  confirmDesk,

  lastAlert,

  onDismissAlert,

  chartVerdictValidation,

  soundEnabled = true,

}: Props) {

  const vt = getMonthDeskVisualTheme(theme);

  const { metrics: m, levels, whale, board } = useTradePracticalBundle(analysis, candles, symbol, timeframe);

  const { rows: mtfRows, loading: mtfLoading, reload: reloadMtf } = useMonthDeskMtfAnalyzes(

    symbol,

    timeframe,

    analysis

  );



  const quickBoard = useMemo(() => {

    const close = levels.close;

    const targetRef =

      levels.targets[0] ??

      (m.verdict === 'LONG'

        ? (levels.resistance ?? null)

        : m.verdict === 'SHORT'

          ? (levels.support ?? null)

          : null);

    const invalidationRef = levels.invalidation ?? null;

    const entryMid = levels.entryMid ?? close ?? null;



    const longDom = Math.max(0, (m.longPct ?? 0) - (m.shortPct ?? 0));

    const shortDom = Math.max(0, (m.shortPct ?? 0) - (m.longPct ?? 0));

    const dominance = Math.abs((m.longPct ?? 0) - (m.shortPct ?? 0));

    const confidence = m.confidence ?? 0;

    const gates = Math.min(5, Math.max(0, m.gatesPassCount ?? 0));

    const mtfAlign = m.mtfAlignment ?? 50;

    const moneyPotentialRaw = confidence * 0.35 + gates * 20 * 0.25 + mtfAlign * 0.2 + dominance * 0.2;

    const moneyPotential = Math.max(0, Math.min(100, Math.round(moneyPotentialRaw)));



    let potentialLabel = '관망 우세';

    if (moneyPotential >= 78) potentialLabel = '고확률 구간';

    else if (moneyPotential >= 62) potentialLabel = '추적 가능';

    else if (moneyPotential >= 48) potentialLabel = '선별 추적';



    let rrGauge = computeMonthDeskRrGauge({

      metrics: m,

      levels,

      atr:

        analysis?.indicators?.atr?.length != null

          ? Number(analysis.indicators.atr[analysis.indicators.atr.length - 1])

          : null,

    });



    const rrPass = rrGauge.rrPass;

    const strongSide =

      m.longPct >= 66 && (m.confidence ?? 0) >= 70

        ? 'LONG+'

        : m.shortPct >= 66 && (m.confidence ?? 0) >= 70

          ? 'SHORT+'

          : m.verdict === 'LONG'

            ? 'LONG'

            : m.verdict === 'SHORT'

              ? 'SHORT'

              : 'WAIT';

    const conflictRisk =

      (m.mtfBlocked ? 1 : 0) +

      (m.gatesPassCount < 3 ? 1 : 0) +

      (Math.abs((m.longPct ?? 0) - (m.shortPct ?? 0)) < 10 ? 1 : 0);

    const flipRiskLabel = conflictRisk >= 2 ? '전환 주의' : conflictRisk === 1 ? '경계' : '안정';

    const priority =

      strongSide === 'LONG+' || strongSide === 'SHORT+'

        ? rrPass

          ? '즉시 후보'

          : '대기'

        : m.verdict === 'WAIT'

          ? '차단'

          : m.gatesPassCount >= 4

            ? '준비'

            : '대기';

    const actionLine =

      priority === '즉시 후보'

        ? strongSide.includes('LONG')

          ? 'LONG 실행 후보'

          : 'SHORT 실행 후보'

        : priority === '차단'

          ? 'WAIT · 신규 진입 차단'

          : priority === '준비'

            ? '조건 충족 대기 후 실행'

            : '신호 축적 대기';



    return {

      close,

      targetRef,

      invalidationRef,

      entryMid,

      longDom,

      shortDom,

      moneyPotential,

      potentialLabel,

      rrGauge,

      rrPass,

      strongSide,

      flipRiskLabel,

      priority,

      actionLine,

    };

  }, [levels, m, analysis]);



  const settleStats = useMemo(

    () =>

      buildMonthDeskSettleBoardStats({

        board,

        metrics: m,

        chartVerdictValidation: chartVerdictValidation ?? null,

        timeframe,

      }),

    [board, m, chartVerdictValidation, timeframe]

  );



  const ta = useMemo(

    () => buildMonthDeskTradeAction(m, levels, whale, analysis),

    [m, levels, whale, analysis]

  );

  const resolvedConfirmDesk = useMemo(

    () => confirmDesk ?? buildTradeConfirmDesk(analysis, m, levels, ta),

    [confirmDesk, analysis, m, levels, ta]

  );

  const confirmDisplay = useMemo(

    () => buildMonthDeskConfirmDisplay(resolvedConfirmDesk, m, analysis),

    [resolvedConfirmDesk, m, analysis]

  );

  const precision = useMemo(

    () => computeMonthDeskPrecisionAnalysis(analysis, m, levels, m.structure),

    [analysis, m, levels]

  );



  const strikeBundle = useMemo(() => {

    if (!candles || candles.length < 12) return null;

    return buildMonthDeskStrikeDeskBundle({

      candles,

      timeframe,

      swingPivot: 2,

      scenario: null,

      stCore: null,

      analyzeVerdict:

        analysis?.verdict === 'LONG' || analysis?.verdict === 'SHORT' ? analysis.verdict : null,

      analyzeFusion: analysis

        ? {

            currentPrice: analysis.currentPrice,

            atr: analysis.indicators?.atr?.[analysis.indicators.atr.length - 1],

            longScore: analysis.longScore,

            shortScore: analysis.shortScore,

            verdict: analysis.verdict,

          }

        : null,

      analysis,

    });

  }, [candles, timeframe, analysis, symbol]);



  const briefingBase = useMemo(

    () =>

      buildMonthDeskUnifiedBriefingSnapshot({

        symbol,

        chartTf: timeframe,

        analysis,

        metrics: m,

        levels,

        strikeBundle,

        settleBoard: board,

        settleStats,

        tradeAction: ta,

        confirmDisplay,

        precision,

        mtfAnalyzes: mtfRows,

        actionLine: quickBoard.actionLine,

      }),

    [

      symbol,

      timeframe,

      analysis,

      m,

      levels,

      strikeBundle,

      board,

      settleStats,

      ta,

      confirmDisplay,

      precision,

      mtfRows,

      quickBoard.actionLine,

    ]

  );



  const externalHook = useUnifiedBriefingExternal({

    symbol,

    chartTf: timeframe,

    currentPrice: levels.close ?? analysis?.currentPrice ?? null,

    masterDirection: briefingBase.masterDirection,

    enabled: !!analysis,

  });



  const briefingSnapshot = useMemo(

    () => applyExternalToMonthDeskBriefing(briefingBase, externalHook.context),

    [briefingBase, externalHook.context]

  );



  const { narrative: llmNarrative, loading: llmLoading } = useMonthDeskUnifiedBriefingNarrate(

    symbol,

    timeframe,

    briefingSnapshot

  );



  const briefingCtx = {

    snapshot: briefingSnapshot,

    llmNarrative,

    llmLoading,

    mtfLoading,

    reloadMtf,

  };



  const accent = m.verdict === 'LONG' ? vt.long : m.verdict === 'SHORT' ? vt.short : vt.wait;



  return (

    <MonthDeskUnifiedBriefingProvider value={briefingCtx}>

      <div className={`${styles.cockpit} ${loading && !analysis ? styles.loadingPulse : ''}`}>

        <MonthDeskUnifiedPrecisionBriefingCard

          snapshot={briefingSnapshot}

          chartTf={timeframe}

          mtfLoading={mtfLoading}

          llmNarrative={llmNarrative}

          llmLoading={llmLoading}

        />



        {strikeBundle && (

          <MonthDeskStrikeDesk bundle={strikeBundle} theme={vt} symbol={symbol} />

        )}

        <div className={styles.cockpitMetaBar} style={{ color: vt.textMuted }}>

          <span>

            {symbol} · {timeframe}

          </span>

          <span style={{ color: accent, fontWeight: 800 }}>{m.verdictLabel}</span>

          <span className={styles.unifiedBriefLinkedTag}>↔ 통합 브리핑 연동</span>

          {m.gatesPassCount > 0 && (

            <span style={{ color: m.gatesPassCount >= 4 ? vt.long : vt.textMuted }}>

              확정 {m.gatesPassCount}/5

            </span>

          )}

          {m.entryGrade !== '—' && (

            <span style={{ color: m.entryGrade === 'A' ? vt.long : vt.textMuted }}>타점 {m.entryGrade}</span>

          )}

        </div>



        <MonthDeskVisualHub

          metrics={m}

          levels={levels}

          whale={whale}

          analysis={analysis}

          theme={vt}

          quickBoard={quickBoard}

          confirmDisplay={confirmDisplay}

          precision={precision}

          soundEnabled={soundEnabled}

        />



        <CandleTradeAtlasBoard analysis={analysis} candles={candles} timeframe={timeframe} theme={vt} />



        <MonthDeskReferenceZonesPanel analysis={analysis} candles={candles} theme={vt} />



        <MonthDeskPracticalDesk

          metrics={m}

          levels={levels}

          whale={whale}

          analysis={analysis}

          theme={theme}

          uiMode="MONTH_START_DESK"

          confirmDesk={confirmDesk}

          lastAlert={lastAlert}

          onDismissAlert={onDismissAlert}

          visualFocus

        />



        {settleStats && board?.rows?.length ? (

          <MonthDeskSettleStatsPanel

            stats={settleStats}

            boardRows={board.rows}

            theme={vt}

            chartTf={timeframe}

          />

        ) : null}



        <p className={styles.footnote} style={{ color: vt.textMuted, textAlign: 'center', marginTop: 8 }}>

          참고·교육용 — 확정 매매 아님. 무효 이탈 시 시나리오 재검토.

        </p>

      </div>

    </MonthDeskUnifiedBriefingProvider>

  );

}

