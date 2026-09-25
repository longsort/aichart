'use client';



import { useMemo, type Ref } from 'react';

import type { AnalyzeResponse } from '@/types';

import type { MergedIntegratedHubSnapshotFull } from '@/lib/mergedAnalysisPrecisionEnrichment';

import type { MergedIntegratedMtfTfRow } from '@/lib/mergedIntegratedMtfBoard';

import type { MtfStatisticsHistoryDashboard } from '@/lib/mtfStatisticsHistoryStore';

import MergedAnalysisMtfTfBoard from './MergedAnalysisMtfTfBoard';

import UnifiedMtfAnalysisStatisticsPanel from './UnifiedMtfAnalysisStatisticsPanel';

import UnifiedMtfStatisticsHistoryDashboard from './UnifiedMtfStatisticsHistoryDashboard';

import UnifiedPrecisionBriefingExtras from './UnifiedPrecisionBriefingExtras';

import UnifiedAnalysisFusionPanel from './UnifiedAnalysisFusionPanel';
import UnifiedEntryProspectPanel from './UnifiedEntryProspectPanel';
import TemporalComparePanel from '@/app/components/TemporalComparePanel';
import IntegratedHubCollapsibleBlock from './IntegratedHubCollapsibleBlock';
import { buildUnifiedEntryProspect } from '@/lib/unifiedEntryProspect';

import { useMtfStatisticsHistory } from '@/lib/useMtfStatisticsHistory';

import styles from './MergedAnalysisDesk.module.css';



type HistoryBundle = {

  dashboard: MtfStatisticsHistoryDashboard | null;

  loading: boolean;

  reload: () => void;

};



type Props = {

  snapshot: MergedIntegratedHubSnapshotFull;

  chartTf: string;

  mtfBoard: MergedIntegratedMtfTfRow[];

  mtfLoading?: boolean;

  llmNarrative?: string;

  llmLoading?: boolean;

  statsSectionRef?: Ref<HTMLDivElement>;

  historySectionRef?: Ref<HTMLDivElement>;

  /** 통합 허브에서 주입 시 중복 fetch 방지 */

  historyBundle?: HistoryBundle;

  analysis?: AnalyzeResponse | null;

};



function fmt(n: number): string {

  if (!Number.isFinite(n) || n === 0) return '—';

  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 2 });

}



function dirKo(d: string): string {

  if (d === 'LONG') return '롱';

  if (d === 'SHORT') return '숏';

  return '관망';

}



function RingGauge({

  label,

  value,

  accent,

  sub,

}: {

  label: string;

  value: number;

  accent: string;

  sub?: string;

}) {

  const dash = (Math.min(100, Math.max(0, value)) / 100) * 163;

  return (

    <div className={styles.precisionBriefGauge}>

      <svg width={54} height={54} viewBox="0 0 54 54" aria-hidden>

        <circle cx={27} cy={27} r={21} fill="none" stroke="rgba(51,65,85,0.55)" strokeWidth={5} />

        <circle

          cx={27}

          cy={27}

          r={21}

          fill="none"

          stroke={accent}

          strokeWidth={5}

          strokeLinecap="round"

          strokeDasharray={`${dash} 163`}

          transform="rotate(-90 27 27)"

        />

      </svg>

      <div className={styles.precisionBriefGaugeInner}>

        <span style={{ color: accent }}>{Math.round(value)}</span>

        {sub ? <em>{sub}</em> : null}

      </div>

      <div className={styles.precisionBriefGaugeLabel}>{label}</div>

    </div>

  );

}



export default function MergedAnalysisPrecisionBriefingCard({

  snapshot,

  chartTf,

  mtfBoard,

  mtfLoading,

  llmNarrative,

  llmLoading,

  statsSectionRef,

  historySectionRef,

  historyBundle,

  analysis,

}: Props) {

  const s = snapshot;

  const master = s.masterDirection;

  const longW = Math.max(6, Math.min(94, s.gauges.longPct));

  const shortW = Math.max(6, Math.min(94, s.gauges.shortPct));



  const internalHistory = useMtfStatisticsHistory({

    symbol: s.symbol,

    chartTf,

    currentPrice: s.currentPrice,

    stats: s.mtfStatistics,

    enabled: !historyBundle && !!s.mtfStatistics,

  });



  const history = historyBundle ?? internalHistory;

  const entryProspect = useMemo(
    () =>
      buildUnifiedEntryProspect({
        snapshot: s,
        analysis: analysis ?? null,
        plan: s.unifiedTradePlan,
        temporal: s.temporalDigest ?? null,
        mtfStatistics: s.mtfStatistics,
        historyDashboard: history.dashboard,
        chartFeatures: s.chartFeatures,
      }),
    [s, analysis, history.dashboard]
  );



  const statBadge = s.mtfStatistics

    ? `${dirKo(s.mtfStatistics.statisticalVerdict)} ${s.mtfStatistics.weightedLongPct}%`

    : undefined;



  const histBadge =

    history.dashboard && history.dashboard.closedCount > 0

      ? `승률 ${history.dashboard.winRate.toFixed(1)}%`

      : history.dashboard && history.dashboard.totalRecords > 0

        ? `${history.dashboard.totalRecords}건`

        : undefined;



  return (

    <section

      className={styles.precisionBriefCard}

      data-verdict={master}

      aria-label="통합 AI 정밀 브리핑"

    >

      <header className={styles.precisionBriefHead}>

        <div>

          <span className={styles.precisionBriefTag}>AI 정밀</span>

          <span className={styles.precisionBriefUltra}>통합분석</span>

          <h2 className={styles.precisionBriefTitle}>통합 AI 정밀 브리핑</h2>

          <p className={styles.precisionBriefSub}>

            {s.symbol} · 차트 {chartTf}

            {s.currentPrice ? ` · ${fmt(s.currentPrice)}` : ''} · 핵심보드 · Strike · Mirage · 트레이드 연동

          </p>

        </div>

        <div

          className={styles.precisionBriefVerdictPill}

          style={{

            color: master === 'LONG' ? '#4ade80' : master === 'SHORT' ? '#f87171' : '#fcd34d',

            borderColor:

              master === 'LONG'

                ? 'rgba(74,222,128,0.45)'

                : master === 'SHORT'

                  ? 'rgba(248,113,113,0.45)'

                  : 'rgba(252,211,77,0.35)',

          }}

        >

          {dirKo(master)} · {s.masterGrade} · {s.gauges.syncPct}%

        </div>

      </header>



      <div className={styles.precisionBriefSummary}>{s.summaryKo}</div>



      <IntegratedHubCollapsibleBlock

        title="심층 분석 융합"

        subtitle="구조·MTF·수급·게이트·외부 — 다차원 점수"

        badge={s.analysisFusion ? `${s.analysisFusion.depthGrade} ${s.analysisFusion.depthScore}pt` : undefined}

        badgeTone={

          s.analysisFusion?.depthGrade === 'A' || s.analysisFusion?.depthGrade === 'B'

            ? 'long'

            : s.analysisFusion?.depthGrade === 'C'

              ? 'neutral'

              : 'warn'

        }

        defaultOpen

      >

        {s.analysisFusion ? (
          <UnifiedAnalysisFusionPanel
            fusion={s.analysisFusion}
            tradeCalc={{
              masterDirection: master,
              entry: s.tradeLevels.entry,
              stopLoss: s.tradeLevels.stopLoss,
              tp1: s.tradeLevels.tp1,
              tp2: s.tradeLevels.tp2,
              tp3: s.tradeLevels.tp3,
              currentPrice: s.currentPrice,
              tradePlan: s.unifiedTradePlan,
            }}
          />
        ) : null}

      </IntegratedHubCollapsibleBlock>



      {analysis && s.temporalDigest ? (
        <IntegratedHubCollapsibleBlock
          title="과거 · 현재 · 미래"
          subtitle="유사 케이스 · 확定 게이트 · 경로/빔 — 타점 비교"
          badge={s.temporalDigest.glance.directionKo}
          badgeTone={
            s.temporalDigest.glance.direction === 'LONG'
              ? 'long'
              : s.temporalDigest.glance.direction === 'SHORT'
                ? 'short'
                : 'neutral'
          }
          defaultOpen
        >
          <div className={styles.temporalCompareEmbed}>
            <TemporalComparePanel
              analysis={analysis}
              symbol={s.symbol}
              timeframe={chartTf}
              compact
            />
          </div>
        </IntegratedHubCollapsibleBlock>
      ) : null}



      {entryProspect ? (
        <IntegratedHubCollapsibleBlock
          title="진입 참고 · 적중률"
          subtitle="과거·누적·6축·MTF tier 가중 — 조건부"
          badge={`${entryProspect.score}% ${entryProspect.grade}`}
          badgeTone={
            entryProspect.grade === 'A' || entryProspect.grade === 'B'
              ? 'long'
              : entryProspect.grade === 'C'
                ? 'neutral'
                : 'warn'
          }
          defaultOpen
        >
          <UnifiedEntryProspectPanel prospect={entryProspect} />
        </IntegratedHubCollapsibleBlock>
      ) : null}



      <IntegratedHubCollapsibleBlock

        title="AI · 구조 · 시나리오"

        subtitle="게이트 · HTF/LTF · 엔진 융합 · 외부 컨텍스트"

        badge={s.precision?.precisionGrade ?? s.masterGrade}

        badgeTone={master === 'LONG' ? 'long' : master === 'SHORT' ? 'short' : 'neutral'}

        defaultOpen

      >

        <UnifiedPrecisionBriefingExtras

          confirmHeadlineKo={s.confirmHeadlineKo}

          htfContextKo={s.htfContextKo}

          ltfContextKo={s.ltfContextKo}

          flowKo={s.flowKo}

          structurePathKo={s.structurePathKo}

          riskKo={s.riskKo}

          conflictModules={s.conflictModules}

          gatePartials={s.gatePartials}

          scenarios={s.scenarios}

          deterministicNarrativeKo={s.deterministicNarrativeKo}

          precisionGrade={s.precision?.precisionGrade ?? s.masterGrade}

          precisionFusionLabel={s.precision?.fusionLabel ?? null}

          external={s.external}

        />



        {(llmNarrative || llmLoading) && (

          <div className={styles.precisionBriefLlm}>

            <span className={styles.precisionBriefLlmTag}>AI 융합</span>

            {llmLoading && !llmNarrative ? '정밀 브리핑 생성 중…' : llmNarrative}

          </div>

        )}

      </IntegratedHubCollapsibleBlock>



      <IntegratedHubCollapsibleBlock

        title="게이지 · 모듈 합의"

        subtitle="롱/숏 · MTF · 확정 · AI정밀 점수"

        badge={`L${s.gauges.longPct}% S${s.gauges.shortPct}%`}

        defaultOpen

      >

        <div className={styles.precisionBriefGaugeRow}>

          <RingGauge

            label={master === 'SHORT' ? '숏 우세' : master === 'LONG' ? '롱 우세' : '롱'}

            value={s.gauges.longPct}

            accent="#4ade80"

            sub="%"

          />

          <RingGauge label="숏" value={s.gauges.shortPct} accent="#f87171" sub="%" />

          <RingGauge label="MTF" value={s.gauges.confidence} accent="#818cf8" sub="%" />

          <RingGauge label="정렬" value={s.gauges.mtfAlignPct} accent="#2dd4bf" sub="%" />

          <RingGauge label="확정" value={s.gauges.gatesPct} accent="#fbbf24" sub="%" />

          <RingGauge

            label="손익비"

            value={s.gauges.rr != null ? Math.min(100, s.gauges.rr * 35) : 0}

            accent="#38bdf8"

            sub={s.gauges.rr != null ? String(s.gauges.rr) : '—'}

          />

          <RingGauge label="AI정밀" value={s.gauges.precisionFusion} accent="#a78bfa" sub="pt" />

        </div>



        <div className={styles.precisionBriefBar}>

          <div className={styles.precisionBriefBarLong} style={{ width: `${longW}%` }} />

          <div className={styles.precisionBriefBarShort} style={{ width: `${shortW}%` }} />

        </div>



        <div className={styles.precisionBriefModules}>

          {s.modules.map((m) => (

            <span

              key={m.key}

              className={`${styles.precisionBriefModule}${m.aligned ? ` ${styles.precisionBriefModuleOk}` : ` ${styles.precisionBriefModuleWarn}`}`}

              title={m.detailKo}

            >

              {m.labelKo} · {dirKo(m.direction)}

            </span>

          ))}

        </div>

      </IntegratedHubCollapsibleBlock>



      <IntegratedHubCollapsibleBlock

        title="MTF 타임프레임 보드"

        subtitle="1m~1M · 차트 TF 강조"

        badge={`${mtfBoard.length} TF`}

        defaultOpen

      >

        <MergedAnalysisMtfTfBoard rows={mtfBoard} chartTf={chartTf} loading={mtfLoading} />

      </IntegratedHubCollapsibleBlock>



      {s.mtfStatistics ? (

        <IntegratedHubCollapsibleBlock

          title="MTF 통계 · 타점"

          subtitle="분·시·일·주·월 tier · E/SL/TP"

          badge={statBadge}

          badgeTone={

            s.mtfStatistics.statisticalVerdict === 'LONG'

              ? 'long'

              : s.mtfStatistics.statisticalVerdict === 'SHORT'

                ? 'short'

                : 'neutral'

          }

          sectionRef={statsSectionRef}

          defaultOpen

        >

          <UnifiedMtfAnalysisStatisticsPanel stats={s.mtfStatistics} loading={mtfLoading} />

        </IntegratedHubCollapsibleBlock>

      ) : null}



      <IntegratedHubCollapsibleBlock

        title="누적 검증 · 히스토리"

        subtitle="스냅샷 저장 · TP/SL 평가 · tier별 승률"

        badge={histBadge}

        badgeTone="info"

        sectionRef={historySectionRef}

        defaultOpen={false}

      >

        <UnifiedMtfStatisticsHistoryDashboard

          dashboard={history.dashboard}

          loading={history.loading}

          onReload={history.reload}

        />

      </IntegratedHubCollapsibleBlock>



      <IntegratedHubCollapsibleBlock

        title="타점 · 액션"

        subtitle="E/SL/TP · 판단 근거"

        badge={dirKo(master)}

        badgeTone={master === 'LONG' ? 'long' : master === 'SHORT' ? 'short' : 'neutral'}

        defaultOpen

      >

        <div className={styles.precisionBriefLevels}>

          <span>E {fmt(s.tradeLevels.entry)}</span>

          <span>SL {fmt(s.tradeLevels.stopLoss)}</span>

          <span>TP1 {fmt(s.tradeLevels.tp1)}</span>

          <span>TP2 {fmt(s.tradeLevels.tp2)}</span>

          <span>TP3 {fmt(s.tradeLevels.tp3)}</span>

        </div>

        {s.unifiedTradePlan?.sourceKo ? (
          <p className={styles.precisionBriefPlanSource}>{s.unifiedTradePlan.sourceKo}</p>
        ) : null}



        <div className={styles.precisionBriefAction}>{s.actionLine}</div>



        {s.reasonsKo.length > 0 && (

          <ul className={styles.precisionBriefReasons}>

            {s.reasonsKo.map((line) => (

              <li key={line}>{line}</li>

            ))}

          </ul>

        )}

      </IntegratedHubCollapsibleBlock>



      <p className={styles.precisionBriefFoot}>

        조건부 참고 — SL·무효 이탈 시 재검토. Strike · 트레이드 · AI 상세와 동일 데이터.

      </p>

    </section>

  );

}


