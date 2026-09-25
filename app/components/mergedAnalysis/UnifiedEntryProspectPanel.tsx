'use client';

import type { UnifiedEntryProspect } from '@/lib/unifiedEntryProspect';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  prospect: UnifiedEntryProspect | null | undefined;
};

function gradeColor(grade: string): string {
  if (grade === 'A') return '#4ade80';
  if (grade === 'B') return '#2dd4bf';
  if (grade === 'C') return '#fcd34d';
  return '#f87171';
}

export default function UnifiedEntryProspectPanel({ prospect: p }: Props) {
  if (!p) return null;

  return (
    <section className={styles.entryProspectPanel} aria-label="진입 참고 적중률">
      <header className={styles.entryProspectHead}>
        <div>
          <span className={styles.entryProspectTag}>진입 참고</span>
          <h4 className={styles.entryProspectTitle}>{p.headlineKo}</h4>
          <p className={styles.entryProspectSub}>{p.gradeLabelKo}</p>
        </div>
        <div className={styles.entryProspectRing} style={{ borderColor: `${gradeColor(p.grade)}55` }}>
          <span style={{ color: gradeColor(p.grade) }}>{p.grade}</span>
          <strong>{p.score}%</strong>
        </div>
      </header>

      <div className={styles.entryProspectAxisRow}>
        {p.pastKo ? (
          <div className={styles.entryProspectAxis}>
            <span>과거</span>
            <p>{p.pastKo}</p>
          </div>
        ) : null}
        {p.presentKo ? (
          <div className={styles.entryProspectAxis}>
            <span>현재</span>
            <p>{p.presentKo}</p>
          </div>
        ) : null}
        {p.futureKo ? (
          <div className={styles.entryProspectAxis}>
            <span>미래</span>
            <p>{p.futureKo}</p>
          </div>
        ) : null}
      </div>

      <div className={styles.entryProspectFactors}>
        {p.factors.map((f) => (
          <div key={f.key} className={styles.entryProspectFactor}>
            <div className={styles.entryProspectFactorTop}>
              <span>{f.labelKo}</span>
              <strong>{f.score}</strong>
            </div>
            <div className={styles.entryProspectFactorBar}>
              <div style={{ width: `${f.score}%` }} />
            </div>
            <p>{f.detailKo}</p>
          </div>
        ))}
      </div>

      <p className={styles.entryProspectDisclaimer}>{p.disclaimerKo}</p>
    </section>
  );
}
