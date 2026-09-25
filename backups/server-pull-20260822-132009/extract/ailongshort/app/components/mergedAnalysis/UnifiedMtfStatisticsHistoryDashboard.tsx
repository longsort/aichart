'use client';

import type { Ref } from 'react';
import type {
  MtfStatisticsHistoryDashboard,
  MtfStatisticsHistoryRecord,
  MtfStatisticsOutcomeStatus,
} from '@/lib/mtfStatisticsHistoryStore';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  dashboard: MtfStatisticsHistoryDashboard | null;
  loading?: boolean;
  onReload?: () => void;
  sectionRef?: Ref<HTMLDivElement>;
};

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtTime(at: number): string {
  return new Date(at).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function outcomeColor(status: MtfStatisticsOutcomeStatus): string {
  if (status === 'TP1' || status === 'TP2' || status === 'TP3') return '#4ade80';
  if (status === 'SL') return '#f87171';
  if (status === 'OPEN') return '#fcd34d';
  return '#94a3b8';
}

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

function RecentRow({ rec }: { rec: MtfStatisticsHistoryRecord }) {
  const oc = rec.outcome.status;
  return (
    <div className={styles.mtfHistRow}>
      <span className={styles.mtfHistRowTime}>{fmtTime(rec.at)}</span>
      <span
        className={styles.mtfHistRowDir}
        style={{
          color: rec.statisticalVerdict === 'LONG' ? '#4ade80' : rec.statisticalVerdict === 'SHORT' ? '#f87171' : '#94a3b8',
        }}
      >
        {dirKo(rec.statisticalVerdict)}
      </span>
      <span className={styles.mtfHistRowMeta}>
        L{rec.weightedLongPct}% · {rec.chartTf}
      </span>
      <span className={styles.mtfHistRowOutcome} style={{ color: outcomeColor(oc) }}>
        {oc}
        {rec.outcome.returnPct !== 0 ? ` ${rec.outcome.returnPct > 0 ? '+' : ''}${rec.outcome.returnPct.toFixed(2)}%` : ''}
      </span>
    </div>
  );
}

export default function UnifiedMtfStatisticsHistoryDashboard({
  dashboard,
  loading,
  onReload,
  sectionRef,
}: Props) {
  if (!dashboard) {
    return (
      <section ref={sectionRef} className={styles.mtfHistPanel} aria-label="MTF 통계 누적">
        <div className={styles.mtfHistEmpty}>
          {loading
            ? '누적 통계 불러오는 중…'
            : '통계 히스토리 수집 중… 스냅샷이 쌓이면 누적 승률이 표시됩니다.'}
        </div>
      </section>
    );
  }

  const d = dashboard;

  return (
    <section ref={sectionRef} className={styles.mtfHistPanel} aria-label="MTF 통계 누적 대시보드">
      <header className={styles.mtfHistHead}>
        <div>
          <span className={styles.mtfHistTag}>누적 검증</span>
          <h3 className={styles.mtfHistTitle}>MTF 통계 히스토리 · 누적 승률</h3>
          <p className={styles.mtfHistSub}>{d.summaryKo}{loading ? ' · 갱신…' : ''}</p>
        </div>
        {onReload ? (
          <button type="button" className={styles.mtfHistReload} onClick={onReload}>
            ↻
          </button>
        ) : null}
      </header>

      <div className={styles.mtfHistHero}>
        <div className={styles.mtfHistWinRing}>
          <span className={styles.mtfHistWinValue} style={{ color: d.winRate >= 50 ? '#4ade80' : '#fcd34d' }}>
            {d.closedCount > 0 ? fmtPct(d.winRate) : '—'}
          </span>
          <span className={styles.mtfHistWinLabel}>누적 승률</span>
          <span className={styles.mtfHistWinSub}>
            {d.winCount}W / {d.lossCount}L · 표본 {d.closedCount}
          </span>
        </div>
        <div className={styles.mtfHistKpiGrid}>
          <div className={styles.mtfHistKpi}>
            <span>롱 적중</span>
            <strong style={{ color: '#4ade80' }}>{d.longCalls ? fmtPct(d.longCallWinRate) : '—'}</strong>
            <em>{d.longCalls}건</em>
          </div>
          <div className={styles.mtfHistKpi}>
            <span>숏 적중</span>
            <strong style={{ color: '#f87171' }}>{d.shortCalls ? fmtPct(d.shortCallWinRate) : '—'}</strong>
            <em>{d.shortCalls}건</em>
          </div>
          <div className={styles.mtfHistKpi}>
            <span>TP1/2/3</span>
            <strong>{d.tp1Count}/{d.tp2Count}/{d.tp3Count}</strong>
          </div>
          <div className={styles.mtfHistKpi}>
            <span>SL · OPEN</span>
            <strong>
              {d.slCount} · {d.openCount}
            </strong>
          </div>
        </div>
      </div>

      {d.avgReturnPct !== 0 && d.closedCount > 0 ? (
        <div className={styles.mtfHistAvgReturn}>
          평균 수익률 {d.avgReturnPct > 0 ? '+' : ''}
          {d.avgReturnPct.toFixed(2)}% (종료 {d.closedCount}건)
        </div>
      ) : null}

      {d.cumulativeSeries.length > 1 && (
        <div className={styles.mtfHistCumulative} aria-label="누적 승률 추이">
          <span className={styles.mtfHistCumulativeLabel}>승률 추이</span>
          <div className={styles.mtfHistCumulativeBars}>
            {d.cumulativeSeries.slice(-24).map((pt) => (
              <div
                key={pt.at}
                className={styles.mtfHistCumulativeBar}
                style={{ height: `${Math.max(8, Math.min(100, pt.winRate))}%` }}
                title={`${fmtPct(pt.winRate)} · n=${pt.samples}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className={styles.mtfHistTierTable} aria-label="tier별 누적">
        <div className={styles.mtfHistTierHead}>
          <span>Tier</span>
          <span>표본</span>
          <span>승률</span>
          <span>롱</span>
          <span>숏</span>
        </div>
        {d.tierStats.map((t) => (
          <div key={t.tier} className={styles.mtfHistTierRow}>
            <span>{t.labelKo}</span>
            <span>
              {t.total} ({t.open}O)
            </span>
            <span style={{ color: t.winRate >= 50 ? '#4ade80' : '#94a3b8' }}>
              {t.total ? fmtPct(t.winRate) : '—'}
            </span>
            <span>
              {t.longCalls ? `${t.longWins}/${t.longCalls}` : '—'}
            </span>
            <span>
              {t.shortCalls ? `${t.shortWins}/${t.shortCalls}` : '—'}
            </span>
          </div>
        ))}
      </div>

      {d.recent.length > 0 && (
        <div className={styles.mtfHistRecent}>
          <span className={styles.mtfHistRecentLabel}>최근 스냅샷</span>
          {d.recent.map((rec) => (
            <RecentRow key={rec.id} rec={rec} />
          ))}
        </div>
      )}

      <p className={styles.mtfHistFoot}>
        통계 스냅샷 자동 저장 → 현재가 기준 TP/SL 도달 평가. 조건부 참고, 과거 성과가 미래를 보장하지 않음.
      </p>
    </section>
  );
}
