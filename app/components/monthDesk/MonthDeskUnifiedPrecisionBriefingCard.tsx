'use client';

import type { MonthDeskUnifiedBriefingSnapshot } from '@/lib/monthDeskUnifiedPrecisionBriefing';
import MergedAnalysisMtfTfBoard from '@/app/components/mergedAnalysis/MergedAnalysisMtfTfBoard';
import UnifiedMtfAnalysisStatisticsPanel from '@/app/components/mergedAnalysis/UnifiedMtfAnalysisStatisticsPanel';
import UnifiedMtfStatisticsHistoryDashboard from '@/app/components/mergedAnalysis/UnifiedMtfStatisticsHistoryDashboard';
import IntegratedTradePnLCalculator from '@/app/components/mergedAnalysis/IntegratedTradePnLCalculator';
import UnifiedPrecisionBriefingExtras from '@/app/components/mergedAnalysis/UnifiedPrecisionBriefingExtras';
import { useMtfStatisticsHistory } from '@/lib/useMtfStatisticsHistory';
import styles from '../MonthDeskAnalysisBoard.module.css';

type Props = {
  snapshot: MonthDeskUnifiedBriefingSnapshot;
  chartTf: string;
  mtfLoading?: boolean;
  llmNarrative?: string;
  llmLoading?: boolean;
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
    <div className={styles.unifiedBriefGauge}>
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
      <div className={styles.unifiedBriefGaugeInner}>
        <span style={{ color: accent }}>{Math.round(value)}</span>
        {sub ? <em>{sub}</em> : null}
      </div>
      <div className={styles.unifiedBriefGaugeLabel}>{label}</div>
    </div>
  );
}

export default function MonthDeskUnifiedPrecisionBriefingCard({
  snapshot,
  chartTf,
  mtfLoading,
  llmNarrative,
  llmLoading,
}: Props) {
  const s = snapshot;
  const master = s.masterDirection;
  const longW = Math.max(6, Math.min(94, s.gauges.longPct));
  const shortW = Math.max(6, Math.min(94, s.gauges.shortPct));

  const history = useMtfStatisticsHistory({
    symbol: s.symbol,
    chartTf,
    currentPrice: s.tradeLevels.entry > 0 ? s.tradeLevels.entry : null,
    stats: s.mtfStatistics,
    enabled: !!s.mtfStatistics,
  });

  return (
    <section
      className={`${styles.panel} ${styles.unifiedBriefCard}`}
      data-verdict={master}
      aria-label="통합 AI 정밀 브리핑"
    >
      <div className={styles.panelInner}>
        <header className={styles.unifiedBriefHead}>
          <div>
            <span className={styles.unifiedBriefTag}>AI 정밀</span>
            <span className={styles.unifiedBriefUltra}>통합</span>
            <h2 className={styles.unifiedBriefTitle}>통합 AI 정밀 브리핑</h2>
            <p className={styles.unifiedBriefSub}>
              {s.symbol} · 차트 {chartTf} · 핵심보드 · Strike · 마감·안착 · 트레이드 실시간 연동
            </p>
          </div>
          <div
            className={styles.unifiedBriefVerdictPill}
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

        <div className={styles.unifiedBriefSummary}>{s.summaryKo}</div>

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
          <div className={styles.unifiedBriefLlm}>
            <span className={styles.unifiedBriefLlmTag}>AI 융합</span>
            {llmLoading && !llmNarrative ? '정밀 브리핑 생성 중…' : llmNarrative}
          </div>
        )}

        <div className={styles.unifiedBriefGaugeRow}>
          <RingGauge label={master === 'SHORT' ? '숏 우세' : master === 'LONG' ? '롱 우세' : '롱'} value={s.gauges.longPct} accent="#4ade80" sub="%" />
          <RingGauge label="숏" value={s.gauges.shortPct} accent="#f87171" sub="%" />
          <RingGauge label="신뢰" value={s.gauges.confidence} accent="#818cf8" sub="%" />
          <RingGauge label="확정" value={s.gauges.gatesPct} accent="#fbbf24" sub="%" />
          <RingGauge label="손익비" value={s.gauges.rr != null ? Math.min(100, s.gauges.rr * 35) : 0} accent="#2dd4bf" sub={s.gauges.rr != null ? String(s.gauges.rr) : '—'} />
          <RingGauge label="AI정밀" value={s.gauges.precisionFusion} accent="#a78bfa" sub="pt" />
        </div>

        <div className={styles.unifiedBriefBar}>
          <div className={styles.unifiedBriefBarLong} style={{ width: `${longW}%` }} />
          <div className={styles.unifiedBriefBarShort} style={{ width: `${shortW}%` }} />
        </div>

        <div className={styles.unifiedBriefModules}>
          {s.modules.map((m) => (
            <span
              key={m.key}
              className={`${styles.unifiedBriefModule}${m.aligned ? ` ${styles.unifiedBriefModuleOk}` : ` ${styles.unifiedBriefModuleWarn}`}`}
              title={m.detailKo}
            >
              {m.labelKo} · {dirKo(m.direction)}
            </span>
          ))}
        </div>

        <MergedAnalysisMtfTfBoard rows={s.mtfBoard} chartTf={chartTf} loading={mtfLoading} />

        {s.mtfStatistics ? (
          <UnifiedMtfAnalysisStatisticsPanel stats={s.mtfStatistics} loading={mtfLoading} />
        ) : null}

        <UnifiedMtfStatisticsHistoryDashboard
          dashboard={history.dashboard}
          loading={history.loading}
          onReload={history.reload}
        />

        <div className={styles.unifiedBriefLevels}>
          <span>E {fmt(s.tradeLevels.entry)}</span>
          <span>SL {fmt(s.tradeLevels.stopLoss)}</span>
          <span>TP1 {fmt(s.tradeLevels.tp1)}</span>
          <span>TP2 {fmt(s.tradeLevels.tp2)}</span>
          <span>TP3 {fmt(s.tradeLevels.tp3)}</span>
        </div>

        <IntegratedTradePnLCalculator
          masterDirection={master}
          entry={s.tradeLevels.entry}
          stopLoss={s.tradeLevels.stopLoss}
          tp1={s.tradeLevels.tp1}
          tp2={s.tradeLevels.tp2}
          tp3={s.tradeLevels.tp3}
        />

        <div className={styles.unifiedBriefAction}>{s.actionLine}</div>

        {s.reasonsKo.length > 0 && (
          <ul className={styles.unifiedBriefReasons}>
            {s.reasonsKo.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        <p className={styles.unifiedBriefFoot}>조건부 참고 — SL·무효 이탈 시 재검토. 아래 Strike·핵심보드·트레이드와 동일 데이터.</p>
      </div>
    </section>
  );
}
