'use client';

import type { MonthDeskGatePartial } from '@/lib/monthDeskPrecisionAnalysis';
import type { UnifiedPrecisionScenario } from '@/lib/unifiedPrecisionBriefingShared';
import type { UnifiedBriefingExternalContext } from '@/lib/unifiedBriefingExternalContext';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  confirmHeadlineKo?: string | null;
  htfContextKo?: string | null;
  ltfContextKo?: string | null;
  flowKo?: string | null;
  structurePathKo?: string | null;
  riskKo?: string | null;
  conflictModules?: string[];
  gatePartials?: MonthDeskGatePartial[];
  scenarios?: UnifiedPrecisionScenario[];
  deterministicNarrativeKo?: string | null;
  precisionGrade?: string | null;
  precisionFusionLabel?: string | null;
  external?: UnifiedBriefingExternalContext | null;
};

function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 2 });
}

export default function UnifiedPrecisionBriefingExtras({
  confirmHeadlineKo,
  htfContextKo,
  ltfContextKo,
  flowKo,
  structurePathKo,
  riskKo,
  conflictModules = [],
  gatePartials = [],
  scenarios = [],
  deterministicNarrativeKo,
  precisionGrade,
  precisionFusionLabel,
  external,
}: Props) {
  return (
    <>
      {(confirmHeadlineKo || precisionGrade) && (
        <div className={styles.precisionBriefConfirmRow}>
          {confirmHeadlineKo ? (
            <span className={styles.precisionBriefConfirmBadge}>{confirmHeadlineKo}</span>
          ) : null}
          {precisionGrade ? (
            <span className={styles.precisionBriefGradeBadge}>
              AI정밀 {precisionGrade}
              {precisionFusionLabel ? ` · ${precisionFusionLabel}` : ''}
            </span>
          ) : null}
        </div>
      )}

      {deterministicNarrativeKo ? (
        <div className={styles.precisionBriefEngine}>
          <span className={styles.precisionBriefEngineTag}>엔진 융합</span>
          {deterministicNarrativeKo}
        </div>
      ) : null}

      {(htfContextKo || ltfContextKo) && (
        <div className={styles.precisionBriefContextStrip}>
          {htfContextKo ? <span>{htfContextKo}</span> : null}
          {ltfContextKo ? <span>{ltfContextKo}</span> : null}
        </div>
      )}

      {(flowKo || structurePathKo) && (
        <div className={styles.precisionBriefFlowStrip}>
          {flowKo ? <span>수급 · {flowKo}</span> : null}
          {structurePathKo ? <span>구조 · {structurePathKo}</span> : null}
        </div>
      )}

      {conflictModules.length > 0 && (
        <div className={styles.precisionBriefConflict} role="status">
          모듈 엇갈림 · {conflictModules.join(' · ')} — 상위 TF·무효 우선
        </div>
      )}

      {gatePartials.length > 0 && (
        <div className={styles.precisionBriefGateGrid} aria-label="확정 게이트 부분점수">
          {gatePartials.map((g) => (
            <div
              key={g.key}
              className={`${styles.precisionBriefGateCell}${g.pass ? ` ${styles.precisionBriefGatePass}` : ''}`}
              title={g.detailKo}
            >
              <span className={styles.precisionBriefGateLabel}>{g.label}</span>
              <span className={styles.precisionBriefGateScore}>{Math.round(g.score)}</span>
              <div className={styles.precisionBriefGateBar}>
                <div
                  className={styles.precisionBriefGateFill}
                  style={{ width: `${Math.min(100, Math.max(0, g.score))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {scenarios.length > 0 && (
        <div className={styles.precisionBriefScenarios} aria-label="시나리오">
          {scenarios.map((sc) => (
            <div
              key={sc.key}
              className={`${styles.precisionBriefScenario}${sc.key === 'invalid' ? ` ${styles.precisionBriefScenarioInvalid}` : sc.key === 'bull' ? ` ${styles.precisionBriefScenarioBull}` : ` ${styles.precisionBriefScenarioBear}`}`}
            >
              <span className={styles.precisionBriefScenarioLabel}>{sc.labelKo}</span>
              <span className={styles.precisionBriefScenarioLine}>{sc.lineKo}</span>
              {sc.level != null && sc.level > 0 ? (
                <span className={styles.precisionBriefScenarioLevel}>
                  {sc.levelLabel ?? '레벨'} {fmt(sc.level)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {riskKo ? (
        <div className={styles.precisionBriefRisk}>
          <span className={styles.precisionBriefRiskTag}>리스크</span>
          {riskKo}
        </div>
      ) : null}

      {external?.news && (
        <div
          className={`${styles.precisionBriefExternalBlock}${external.news.level === 'HIGH' ? ` ${styles.precisionBriefExternalHigh}` : external.news.level === 'MID' ? ` ${styles.precisionBriefExternalMid}` : ''}`}
          aria-label="뉴스 이벤트"
        >
          <span className={styles.precisionBriefExternalTag}>뉴스·매크로</span>
          <div className={styles.precisionBriefExternalHead}>{external.news.headlineKo}</div>
          <ul className={styles.precisionBriefExternalList}>
            {external.news.upcoming.map((e) => (
              <li key={`${e.timeMs}-${e.title}`}>
                {e.whenKo} · {e.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {external?.whale && (
        <div className={styles.precisionBriefExternalBlock} aria-label="고래 메모리">
          <span className={styles.precisionBriefExternalTag}>고래존</span>
          <div className={styles.precisionBriefExternalHead}>
            {external.whale.headlineKo}
            {!external.whale.alignedWithMaster ? ' · 통합 방향과 엇갈림' : ''}
          </div>
          {external.whale.nearPriceKo ? (
            <div className={styles.precisionBriefExternalSub}>{external.whale.nearPriceKo}</div>
          ) : null}
          <div className={styles.precisionBriefWhaleZones}>
            {external.whale.zones.map((z) => (
              <span
                key={`${z.label}-${z.low}`}
                className={`${styles.precisionBriefWhaleChip}${z.inside ? ` ${styles.precisionBriefWhaleChipInside}` : ''}`}
              >
                {z.side === 'buy' ? '매수' : '매도'} · {z.label}
                {z.inside ? ' · 내부' : ` · ${z.distPct.toFixed(1)}%`}
              </span>
            ))}
          </div>
        </div>
      )}

      {external?.signalHistory && (
        <div className={styles.precisionBriefExternalBlock} aria-label="확정 시그널 히스토리">
          <span className={styles.precisionBriefExternalTag}>확정 히스토리</span>
          <div className={styles.precisionBriefExternalHead}>{external.signalHistory.compareKo}</div>
          <div className={styles.precisionBriefExternalSub}>
            전체 {external.signalHistory.totalCount}건 · {symbolScope(external.signalHistory)} · 최근{' '}
            {external.signalHistory.lastSignal
              ? `${external.signalHistory.lastSignal.direction === 'LONG' ? '롱' : '숏'} ${external.signalHistory.lastSignal.timeframe} E ${fmt(external.signalHistory.lastSignal.entry)}`
              : '—'}
          </div>
        </div>
      )}
    </>
  );
}

function symbolScope(h: NonNullable<import('@/lib/unifiedBriefingExternalContext').UnifiedBriefingExternalContext['signalHistory']>) {
  if (h.chartTfCount >= 2) return `동일 TF ${h.chartTfCount}건`;
  if (h.symbolCount >= 2) return `동일 심볼 ${h.symbolCount}건`;
  return '최근 기록';
}
