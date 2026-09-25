'use client';

import type { MonthDeskConfirmDisplay } from '@/lib/monthDeskConfirmDisplay';
import CountUpText from './CountUpText';
import styles from '../MonthDeskAnalysisBoard.module.css';

export default function MonthDeskVerdictOrb3d({
  verdict,
  accent,
  confidence,
  confirmDisplay,
  precisionGrade,
  ultra = false,
}: {
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  accent: string;
  confidence: number | null;
  confirmDisplay: MonthDeskConfirmDisplay;
  precisionGrade?: 'A' | 'B' | 'C' | 'D';
  ultra?: boolean;
}) {
  const tierA = precisionGrade === 'A';
  return (
    <div
      className={`${styles.orb3dScene} ${ultra ? styles.orb3dSceneUltra : ''} ${tierA ? styles.orb3dSceneTierA : ''}`}
      data-verdict={verdict}
      data-phase={confirmDisplay.phase}
      data-grade={precisionGrade}
    >
      {ultra && <div className={styles.orb3dHexRing} aria-hidden />}
      <div className={styles.orb3dOrbit} aria-hidden />
      <div className={styles.orb3dOrbit2} aria-hidden />
      <div className={styles.orb3dOrbit3} aria-hidden />
      <div className={styles.orb3dCore} style={{ color: accent, borderColor: `${accent}66` }}>
        <span className={styles.orb3dVerdict}>{verdict}</span>
        {confidence != null && (
          <span className={styles.orb3dConf}>
            <CountUpText value={confidence} suffix="%" />
          </span>
        )}
      </div>
      {tierA && (
        <span className={styles.orb3dGradeBadge} style={{ color: accent, borderColor: `${accent}88` }}>
          GRADE A
        </span>
      )}
      {confirmDisplay.isFullConfirm && <div className={styles.orb3dPulseRing} style={{ borderColor: accent }} aria-hidden />}
    </div>
  );
}
