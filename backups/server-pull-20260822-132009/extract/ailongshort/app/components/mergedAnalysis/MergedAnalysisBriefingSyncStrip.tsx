'use client';

import { useMergedIntegratedHubContext } from './MergedIntegratedHubContext';
import styles from './MergedAnalysisDesk.module.css';

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

/** 통합분석 우측/하단 — 정밀 브리핑 실시간 연동 스트립 */
export default function MergedAnalysisBriefingSyncStrip() {
  const ctx = useMergedIntegratedHubContext();
  const snap = ctx?.snapshot;

  if (!snap) return null;

  return (
    <div className={styles.precisionBriefSyncStrip} aria-label="통합 AI 정밀 브리핑 연동">
      <span className={styles.precisionBriefSyncLive}>
        {ctx?.mtfLoading || ctx?.settleLoading ? '동기화…' : 'LIVE'}
      </span>
      <strong>
        통합 {dirKo(snap.masterDirection)} · {snap.masterGrade} · 연동 {snap.gauges.syncPct}%
      </strong>
      <span>
        L{snap.gauges.longPct}% S{snap.gauges.shortPct}% · 확정 {Math.round(snap.gauges.gatesPct)}% · AI정밀{' '}
        {snap.gauges.precisionFusion}
      </span>
      {snap.conflictModules.length > 0 ? (
        <span>엇갈림 {snap.conflictModules.join(', ')}</span>
      ) : null}
      {snap.external?.news?.level === 'HIGH' ? (
        <span className={styles.precisionBriefSyncHint}>⚠ 매크로 임박</span>
      ) : null}
      {snap.external?.whale && !snap.external.whale.alignedWithMaster ? (
        <span>고래존 주의</span>
      ) : null}
      {snap.mtfStatistics ? (
        <span>
          통계 {dirKo(snap.mtfStatistics.statisticalVerdict)} {snap.mtfStatistics.weightedLongPct}%
        </span>
      ) : null}
      {ctx?.historyDashboard && ctx.historyDashboard.closedCount > 0 ? (
        <span>누적 {ctx.historyDashboard.winRate.toFixed(1)}% (n={ctx.historyDashboard.closedCount})</span>
      ) : null}
      {snap.analysisFusion ? (
        <span>
          심층 {snap.analysisFusion.depthGrade} {snap.analysisFusion.depthScore}pt · 확인{' '}
          {snap.analysisFusion.confirmationPoints.filter((p) => p.met).length}/
          {snap.analysisFusion.confirmationPoints.length}
        </span>
      ) : null}
      <span className={styles.precisionBriefSyncHint}>↔ 패널 AI 정밀 브리핑 · MTF · Strike 동일</span>
    </div>
  );
}
