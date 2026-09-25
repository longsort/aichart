'use client';

import type { WhaleFlowStage } from '@/lib/monthDeskWhaleDesk';
import styles from '../MonthDeskAnalysisBoard.module.css';

const STEPS: { stage: WhaleFlowStage; ko: string; icon: string }[] = [
  { stage: 'incoming', ko: '들어온다', icon: '◎' },
  { stage: 'arrived', ko: '들어왔다', icon: '●' },
  { stage: 'defend', ko: '지키는 중', icon: '🛡' },
  { stage: 'distribute', ko: '분산·매도', icon: '▽' },
];

type Props = {
  activeStage: WhaleFlowStage;
  activeIndex: number;
  accent: string;
};

export default function MonthDeskWhaleFlowRail({ activeStage, activeIndex, accent }: Props) {
  return (
    <div className={styles.whaleFlowRail} aria-label="고래 흐름 단계">
      {STEPS.map((step, i) => {
        const active = activeIndex === i && activeStage !== 'idle';
        const done = activeIndex > i && activeStage !== 'idle';
        const pending = activeIndex < i || activeStage === 'idle';
        return (
          <div key={step.stage} className={styles.whaleFlowStepWrap}>
            {i > 0 && (
              <div
                className={`${styles.whaleFlowConnector} ${done || active ? styles.whaleFlowConnectorOn : ''}`}
                style={{ background: done || active ? accent : undefined }}
              />
            )}
            <div
              className={`${styles.whaleFlowStep} ${active ? styles.whaleFlowStepActive : ''} ${done ? styles.whaleFlowStepDone : ''} ${pending ? styles.whaleFlowStepPending : ''}`}
              style={
                active
                  ? {
                      borderColor: accent,
                      color: accent,
                      boxShadow: `0 0 28px ${accent}66`,
                    }
                  : done
                    ? { borderColor: `${accent}88`, color: accent }
                    : undefined
              }
            >
              <span className={styles.whaleFlowIcon}>{step.icon}</span>
              <span className={styles.whaleFlowKo}>{step.ko}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
