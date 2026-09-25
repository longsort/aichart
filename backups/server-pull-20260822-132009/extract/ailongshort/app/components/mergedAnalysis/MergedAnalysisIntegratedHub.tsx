'use client';



import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AnalyzeResponse, Candle } from '@/types';

import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';

import type { MergedAnalysisCardPanel, MergedAnalysisDeskHud, MergedTradeJudgment } from '@/lib/mergedAnalysisDeskEngine';

import type { MergedTradeSignal, MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';

import { getMonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';

import { useMergedAnalysisIntegratedHub } from '@/lib/useMergedAnalysisIntegratedHub';

import { useMergedIntegratedNarrate } from '@/lib/useMergedIntegratedNarrate';

import { useMtfStatisticsHistory } from '@/lib/useMtfStatisticsHistory';

import MonthDeskStrikeDesk from '@/app/components/monthDesk/MonthDeskStrikeDesk';

import MergedAnalysisSidePanel from './MergedAnalysisSidePanel';

import MergedAnalysisBriefingStrip from './MergedAnalysisBriefingStrip';

import MergedAnalysisMtfConsensusCard from './MergedAnalysisMtfConsensusCard';

import MergedAnalysisPrecisionBriefingCard from './MergedAnalysisPrecisionBriefingCard';

import MergedAnalysisBriefingSyncStrip from './MergedAnalysisBriefingSyncStrip';

import MergedAnalysisIntegratedCommandStrip from './MergedAnalysisIntegratedCommandStrip';

import UnifiedChartFeatureStrip from './UnifiedChartFeatureStrip';

import MergedAnalysisIntegratedTradeCard from './MergedAnalysisIntegratedTradeCard';

import MergedAnalysisIntegratedHubSkeleton from './MergedAnalysisIntegratedHubSkeleton';

import BitgetWhaleDnaStatsCard from './BitgetWhaleDnaStatsCard';

import { useBitgetWhaleDnaStats } from '@/lib/useBitgetWhaleDnaStats';
import { analysisLinkPreferChartOverCards } from '@/lib/analysisModeLinkBus';

import { MergedIntegratedHubProvider } from './MergedIntegratedHubContext';

import styles from './MergedAnalysisDesk.module.css';



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

  deskChart?: {
    keyZones?: MergedKeyZone[] | null;
    directionConfirms?: MergedDirectionConfirm[] | null;
    criticalZones?: MergedCriticalZone[] | null;
    bounceScenarios?: MergedBounceScenario[] | null;
    smcLeading?: MergedSmcLeadingContext | null;
    vrvp?: MergedVrvpProfile | null;
  } | null;

  candleSourceKo?: string;

  fusionCandles?: Candle[] | null;

  /** false면 MTF 보드 fetch·폴링 비활성 */
  hubEnabled?: boolean;

  /** Bitget Vol ON — DNA 통계 카드 */
  bitgetDnaEnabled?: boolean;

};



type NavItem = {

  id: string;

  label: string;

  ref: React.RefObject<HTMLElement | null>;

};



export default function MergedAnalysisIntegratedHub({

  symbol,

  timeframe,

  theme,

  analysis,

  strikeBundle,

  cardPanel,

  tradeSignal,

  tradeJudgment,

  deskHud,

  deskChart,

  candleSourceKo,

  fusionCandles,

  hubEnabled = true,

  bitgetDnaEnabled = false,

}: Props) {

  const vt = getMonthDeskVisualTheme(theme);

  const scrollRef = useRef<HTMLDivElement>(null);

  const statsRef = useRef<HTMLDivElement>(null);

  const historyRef = useRef<HTMLDivElement>(null);

  const precisionRef = useRef<HTMLElement>(null);

  const mtfRef = useRef<HTMLElement>(null);

  const strikeRef = useRef<HTMLElement>(null);

  const tradeRef = useRef<HTMLElement>(null);

  const aiRef = useRef<HTMLElement>(null);

  const bitgetRef = useRef<HTMLElement>(null);

  const [activeNav, setActiveNav] = useState('정밀');



  const hub = useMergedAnalysisIntegratedHub({

    symbol,

    chartTf: timeframe,

    analysis,

    candles: fusionCandles ?? null,

    trade: tradeSignal,

    judgment: tradeJudgment,

    cardPanel,

    strikeBundle,

    deskHud,

    deskChart,

    enabled: hubEnabled,

  });



  const snap = hub.snapshot;



  const history = useMtfStatisticsHistory({

    symbol,

    chartTf: timeframe,

    currentPrice: snap?.currentPrice ?? null,

    stats: snap?.mtfStatistics ?? null,

    enabled: !!snap?.mtfStatistics,

  });



  const { llmNarrative, loading: llmLoading } = useMergedIntegratedNarrate(

    symbol,

    timeframe,

    snap,

    hub.mtfBoard

  );

  const bitgetStats = useBitgetWhaleDnaStats({

    symbol,

    timeframe,

    enabled: bitgetDnaEnabled,

  });



  const navItems: NavItem[] = useMemo(

    () => [

      { id: 'precision', label: '정밀', ref: precisionRef },

      ...(bitgetDnaEnabled ? [{ id: 'bitget', label: 'Bitget', ref: bitgetRef }] : []),

      { id: 'stats', label: '통계', ref: statsRef },

      { id: 'history', label: '누적', ref: historyRef },

      { id: 'mtf', label: 'MTF', ref: mtfRef },

      ...(strikeBundle ? [{ id: 'strike', label: 'Strike', ref: strikeRef }] : []),

      { id: 'trade', label: '트레이드', ref: tradeRef },

      { id: 'ai', label: 'AI · 상세', ref: aiRef },

    ],

    [strikeBundle, bitgetDnaEnabled]

  );



  const scrollTo = useCallback((ref: React.RefObject<HTMLElement | null>, label: string) => {

    setActiveNav(label);

    const container = scrollRef.current;

    const el = ref.current;

    if (!container || !el) return;

    const top = el.offsetTop - container.offsetTop - 6;

    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

  }, []);



  useEffect(() => {

    const container = scrollRef.current;

    if (!container) return;



    const onScroll = () => {

      const scrollTop = container.scrollTop + 56;

      let current = navItems[0]?.label ?? '정밀';

      for (const item of navItems) {

        const el = item.ref.current;

        if (!el) continue;

        const offset = el.offsetTop - container.offsetTop;

        if (offset <= scrollTop) current = item.label;

      }

      setActiveNav(current);

    };



    container.addEventListener('scroll', onScroll, { passive: true });

    onScroll();

    return () => container.removeEventListener('scroll', onScroll);

  }, [navItems, snap]);



  const ctxValue = {

    snapshot: snap,

    consensus: hub.consensus,

    mtfBoard: hub.mtfBoard,

    mtfLoading: hub.mtfLoading,

    settleLoading: hub.settleLoading,

    isLive: hub.isLive,

    lastRefreshAt: hub.lastRefreshAt,

    reloadAll: hub.reloadAll,

    historyDashboard: history.dashboard,

    historyLoading: history.loading,

    historyReload: history.reload,

  };



  return (

    <MergedIntegratedHubProvider value={ctxValue}>

      <div className={styles.integratedHub} data-theme={theme}>

        <header className={styles.integratedHubHeadCompact}>

          <div className={styles.integratedHubTopRow}>

            <div className={styles.integratedHubTitleBlock}>

              <span className={styles.integratedHubBadge}>ARES · 통합 연동</span>

              <span className={styles.integratedHubSymbol}>

                {symbol} · 차트 {timeframe}

              </span>

            </div>

            <div className={styles.integratedHubLiveRow}>

              <span

                className={`${styles.integratedLiveDot}${hub.isLive ? ` ${styles.integratedLiveDotOn}` : ''}`}

                title={hub.isLive ? '실시간 동기화' : '동기화 대기'}

              />

              <span className={styles.integratedLiveText}>

                {snap?.liveKo ?? '캔들·분석 동기화…'}

                {hub.mtfLoading ? ' · MTF' : ''}

                {hub.settleLoading ? ' · 마감' : ''}

              </span>

              <button type="button" className={styles.integratedRefreshBtn} onClick={hub.reloadAll}>

                ↻ 갱신

              </button>

            </div>

          </div>



          {snap ? (

            <MergedAnalysisIntegratedCommandStrip

              snapshot={snap}

              chartTf={timeframe}

              isLive={hub.isLive}

              mtfLoading={hub.mtfLoading}

              settleLoading={hub.settleLoading}

              historyDashboard={history.dashboard}

            />

          ) : null}

          {snap?.chartFeatures ? <UnifiedChartFeatureStrip features={snap.chartFeatures} /> : null}

        </header>



        <MergedAnalysisBriefingSyncStrip />



        <nav className={styles.integratedHubNav} aria-label="통합 카드 섹션">

          {navItems.map((item) => (

            <button

              key={item.id}

              type="button"

              className={`${styles.integratedNavBtn}${activeNav === item.label ? ` ${styles.integratedNavBtnActive}` : ''}`}

              onClick={() => scrollTo(item.ref, item.label)}

              aria-current={activeNav === item.label ? 'true' : undefined}

            >

              {item.label}

            </button>

          ))}

        </nav>



        <div ref={scrollRef} className={styles.integratedHubScroll}>

          <div className={styles.integratedHubSections}>

            <section ref={precisionRef} className={styles.integratedPrecisionAnchor}>

              {snap ? (

                <MergedAnalysisPrecisionBriefingCard

                  snapshot={snap}

                  chartTf={timeframe}

                  mtfBoard={hub.mtfBoard}

                  mtfLoading={hub.mtfLoading}

                  llmNarrative={llmNarrative}

                  llmLoading={llmLoading}

                  statsSectionRef={statsRef}

                  historySectionRef={historyRef}

                  historyBundle={{

                    dashboard: history.dashboard,

                    loading: history.loading,

                    reload: history.reload,

                  }}

                  analysis={analysis}

                />

              ) : (

                <MergedAnalysisIntegratedHubSkeleton />

              )}

            </section>



            {bitgetDnaEnabled && (

              <HubSection

                ref={bitgetRef}

                title="Bitget DNA · 통계 AI"

                subtitle="롱빔/숏빔 · +N봉 시나리오 · MTF · 유사 과거"

                badge={bitgetStats.dna?.beamKo ?? (bitgetStats.loading ? '…' : undefined)}

                badgeTone={

                  bitgetStats.dna?.verdictKo === '상승'

                    ? 'long'

                    : bitgetStats.dna?.verdictKo === '하락'

                      ? 'short'

                      : 'neutral'

                }

                defaultOpen

              >

                {bitgetStats.loading && !bitgetStats.dna ? (

                  <div className={styles.integratedSectionEmpty}>Bitget DNA 로딩…</div>

                ) : bitgetStats.dna && analysisLinkPreferChartOverCards() ? (

                  <div className={styles.integratedSectionEmpty}>
                    {bitgetStats.dna.beamKo ?? '빔'} · {bitgetStats.dna.verdictKo ?? '—'}
                    {' — '}
                    차트 ZONE·거래량 막대·빔 가격선에 연동 (카드 대신 LINE)
                    {bitgetStats.error ? ` · ${bitgetStats.error}` : ''}
                  </div>

                ) : bitgetStats.dna ? (

                  <BitgetWhaleDnaStatsCard

                    dna={bitgetStats.dna}

                    single={bitgetStats.single}

                    range={bitgetStats.range}

                    mtf={bitgetStats.mtf}

                    loading={bitgetStats.loading}

                    onReload={bitgetStats.reload}

                  />

                ) : (

                  <div className={styles.integratedSectionEmpty}>

                    {bitgetStats.error ?? 'Bitget Vol ON · BTC · CSV/카탈로그 필요'}

                  </div>

                )}

              </HubSection>

            )}



            <HubSection

              ref={mtfRef}

              title="MTF · 합의 상세"

              subtitle="1m~1M 가중치 · 확정 게이트 · 등급"

              badge={snap ? `${snap.consensus.alignedTfCount}/${snap.consensus.rows.length} TF` : undefined}

              defaultOpen

            >

              <MergedAnalysisMtfConsensusCard

                symbol={symbol}

                chartTf={timeframe}

                analysis={analysis}

                candles={fusionCandles ?? null}

                trade={tradeSignal}

                judgment={tradeJudgment}

                theme={theme}

                embedded

              />

            </HubSection>



            {strikeBundle && (

              <HubSection

                ref={strikeRef}

                title="Strike Zone"

                subtitle="타점·confluence · 차트 zone 연동"

                badge={strikeBundle.primary ?? undefined}

                badgeTone={

                  strikeBundle.primary === 'LONG'

                    ? 'long'

                    : strikeBundle.primary === 'SHORT'

                      ? 'short'

                      : 'neutral'

                }

              >

                <MonthDeskStrikeDesk bundle={strikeBundle} theme={vt} symbol={symbol} />

              </HubSection>

            )}



            <HubSection

              ref={tradeRef}

              title="트레이드 시그널"

              subtitle="진입·SL·TP · 차트 오버레이 동기"

              badge={tradeSignal?.primary ?? undefined}

              badgeTone={

                tradeSignal?.primary === 'LONG'

                  ? 'long'

                  : tradeSignal?.primary === 'SHORT'

                    ? 'short'

                    : 'neutral'

              }

            >

              {tradeSignal && snap ? (
                <MergedAnalysisIntegratedTradeCard
                  trade={{
                    ...tradeSignal,
                    primary:
                      snap.unifiedTradePlan.direction !== 'NEUTRAL'
                        ? snap.unifiedTradePlan.direction
                        : tradeSignal.primary,
                    entry: snap.unifiedTradePlan.entry || tradeSignal.entry,
                    stopLoss: snap.unifiedTradePlan.stopLoss || tradeSignal.stopLoss,
                    tp1: snap.unifiedTradePlan.tp1 || tradeSignal.tp1,
                    tp2: snap.unifiedTradePlan.tp2 || tradeSignal.tp2,
                    tp3: snap.unifiedTradePlan.tp3 || tradeSignal.tp3,
                    invalidationKo: snap.unifiedTradePlan.invalidationKo || tradeSignal.invalidationKo,
                  }}
                  judgment={tradeJudgment}
                  sourceKo={snap.unifiedTradePlan.sourceKo}
                />
              ) : tradeSignal ? (
                <MergedAnalysisIntegratedTradeCard trade={tradeSignal} judgment={tradeJudgment} />
              ) : (

                <div className={styles.integratedSectionEmpty}>트레이드 시그널 계산 중…</div>

              )}

            </HubSection>



            <HubSection

              ref={aiRef}

              title="AI 검토 · 통합 분석"

              subtitle="캔들·지표·구조·Mirage · 실시간 analysis"

              defaultOpen={false}

            >

              {analysis && <MergedAnalysisBriefingStrip analysis={analysis} theme={theme} />}

              {cardPanel && (

                <MergedAnalysisSidePanel

                  panel={cardPanel}

                  judgment={tradeJudgment}

                  symbol={symbol}

                  timeframe={timeframe}

                  theme={theme}

                  candleSourceKo={candleSourceKo}

                />

              )}

              {!analysis && !cardPanel ? (

                <div className={styles.integratedSectionEmpty}>분석 데이터 로딩 중…</div>

              ) : null}

            </HubSection>

          </div>



          <p className={styles.integratedDisclaimer}>

            차트 캔들·분석·MTF·Strike·트레이드 카드 실시간 연동 — 조건부 참고, SL 무효·검증 필수.

          </p>

        </div>

      </div>

    </MergedIntegratedHubProvider>

  );

}



function HubSection({

  title,

  subtitle,

  badge,

  badgeTone = 'info',

  children,

  ref,

  defaultOpen = true,

}: {

  title: string;

  subtitle: string;

  badge?: string;

  badgeTone?: 'long' | 'short' | 'neutral' | 'warn' | 'info';

  children: ReactNode;

  ref?: React.Ref<HTMLElement>;

  defaultOpen?: boolean;

}) {

  const [open, setOpen] = useState(defaultOpen);



  return (

    <section ref={ref} className={styles.integratedSection}>

      <button

        type="button"

        className={styles.integratedSectionHeadBtn}

        onClick={() => setOpen((v) => !v)}

        aria-expanded={open}

      >

        <div className={styles.integratedSectionHeadText}>

          <span className={styles.integratedSectionTitle}>{title}</span>

          <span className={styles.integratedSectionSub}>{subtitle}</span>

        </div>

        {badge ? (

          <span className={`${styles.integratedSectionBadge} ${styles[`integratedSubBadge_${badgeTone}`]}`}>

            {badge}

          </span>

        ) : null}

        <span className={styles.integratedSectionToggle} aria-hidden>

          {open ? '▾' : '▸'}

        </span>

      </button>

      {open ? <div className={styles.integratedSectionBody}>{children}</div> : null}

    </section>

  );

}


