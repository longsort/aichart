'use client';

import styles from './MergedAnalysisDesk.module.css';

export default function MergedAnalysisIntegratedHubSkeleton() {
  return (
    <div className={styles.integratedHubSkeleton} aria-label="통합 스냅샷 계산 중">
      <div className={`${styles.integratedSkelBar} ${styles.integratedSkelBarWide}`} />
      <div className={styles.integratedSkelRow}>
        <div className={styles.integratedSkelBar} />
        <div className={styles.integratedSkelBar} />
        <div className={styles.integratedSkelBar} />
      </div>
      <div className={`${styles.integratedSkelBar} ${styles.integratedSkelBarMid}`} />
      <div className={styles.integratedSkelGaugeRow}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.integratedSkelGauge} />
        ))}
      </div>
      <p className={styles.integratedSkelHint}>캔들 · MTF · Strike · 트레이드 동기화 중…</p>
    </div>
  );
}
