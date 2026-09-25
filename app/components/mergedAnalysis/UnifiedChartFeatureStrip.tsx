'use client';

import type { UnifiedChartFeatureContext } from '@/lib/unifiedChartFeatureContext';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  features: UnifiedChartFeatureContext | null | undefined;
};

export default function UnifiedChartFeatureStrip({ features }: Props) {
  if (!features?.chips.length) return null;

  return (
    <section className={styles.chartFeatureStrip} aria-label="차트 기능 융합">
      <header className={styles.chartFeatureHead}>
        <span className={styles.chartFeatureTag}>차트 6축</span>
        <strong>{features.compositeScore}pt</strong>
        <span className={styles.chartFeatureSub}>{features.summaryKo}</span>
      </header>
      <div className={styles.chartFeatureGrid}>
        {features.chips.map((chip) => (
          <div
            key={chip.key}
            className={`${styles.chartFeatureCell}${chip.active ? '' : ` ${styles.chartFeatureCellIdle}`}${
              chip.aligned && chip.active ? ` ${styles.chartFeatureCellAligned}` : ''
            }`}
            title={chip.detailKo}
          >
            <div className={styles.chartFeatureCellTop}>
              <span>{chip.labelKo}</span>
              <strong>{chip.score}</strong>
            </div>
            <p className={styles.chartFeatureDetail}>{chip.detailKo}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
