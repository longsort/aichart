'use client';

import type { MergedIntegratedHubSnapshotFull } from '@/lib/mergedAnalysisPrecisionEnrichment';
import type { MtfStatisticsHistoryDashboard } from '@/lib/mtfStatisticsHistoryStore';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  snapshot: MergedIntegratedHubSnapshotFull;
  chartTf: string;
  isLive: boolean;
  mtfLoading: boolean;
  settleLoading: boolean;
  historyDashboard?: MtfStatisticsHistoryDashboard | null;
};

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 2 });
}

export default function MergedAnalysisIntegratedCommandStrip({
  snapshot: s,
  chartTf,
  isLive,
  mtfLoading,
  settleLoading,
  historyDashboard,
}: Props) {
  const master = s.masterDirection;
  const stat = s.mtfStatistics;
  const syncing = mtfLoading || settleLoading;

  return (
    <div className={styles.integratedCommandStrip} aria-label="통합모드 핵심 지표">
      <div
        className={`${styles.integratedCmdPill} ${styles[`integratedCmdPill_${master.toLowerCase()}`]}`}
        data-verdict={master}
      >
        <span className={styles.integratedCmdPillDir}>{dirKo(master)}</span>
        <span className={styles.integratedCmdPillGrade}>{s.masterGrade}</span>
      </div>

      <div className={styles.integratedCmdChip} title="현재가">
        <em>가격</em>
        <strong>{fmtPrice(s.currentPrice)}</strong>
      </div>

      <div className={styles.integratedCmdChip} title="차트 TF">
        <em>TF</em>
        <strong>{chartTf}</strong>
      </div>

      <div className={styles.integratedCmdChip} title="모듈 연동률">
        <em>연동</em>
        <strong>{s.gauges.syncPct}%</strong>
      </div>

      <div className={styles.integratedCmdChip} title="MTF 신뢰">
        <em>MTF</em>
        <strong>{Math.round(s.gauges.confidence)}%</strong>
      </div>

      <div className={styles.integratedCmdChip} title="확정 게이트">
        <em>확정</em>
        <strong>{Math.round(s.gauges.gatesPct)}%</strong>
      </div>

      {stat ? (
        <div
          className={`${styles.integratedCmdChip} ${styles[`integratedCmdChip_${stat.statisticalVerdict.toLowerCase()}`]}`}
          title="MTF 통계 판정"
        >
          <em>통계</em>
          <strong>
            {dirKo(stat.statisticalVerdict)} {stat.weightedLongPct}%
          </strong>
        </div>
      ) : null}

      {s.analysisFusion ? (
        <div className={styles.integratedCmdChip} title="심층 분석 깊이">
          <em>심층</em>
          <strong>
            {s.analysisFusion.depthGrade} {s.analysisFusion.depthScore}
          </strong>
        </div>
      ) : null}

      {historyDashboard && historyDashboard.closedCount > 0 ? (
        <div className={styles.integratedCmdChip} title="누적 승률 (조건부 참고)">
          <em>누적</em>
          <strong>{historyDashboard.winRate.toFixed(1)}%</strong>
        </div>
      ) : null}

      {s.gauges.rr != null ? (
        <div className={styles.integratedCmdChip} title="손익비">
          <em>RR</em>
          <strong>{s.gauges.rr}</strong>
        </div>
      ) : null}

      <div
        className={`${styles.integratedCmdLive}${isLive && !syncing ? ` ${styles.integratedCmdLiveOn}` : ''}${syncing ? ` ${styles.integratedCmdLiveSync}` : ''}`}
      >
        {syncing ? '동기화…' : isLive ? 'LIVE' : '대기'}
      </div>

      {s.conflictModules.length > 0 ? (
        <span className={styles.integratedCmdWarn} title={s.conflictModules.join(', ')}>
          엇갈림 {s.conflictModules.length}
        </span>
      ) : null}

      {s.external?.news?.level === 'HIGH' ? (
        <span className={styles.integratedCmdWarn}>⚠ 매크로</span>
      ) : null}
    </div>
  );
}
