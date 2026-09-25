'use client';

import { useState, type ReactNode, type Ref } from 'react';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: 'long' | 'short' | 'neutral' | 'warn' | 'info';
  defaultOpen?: boolean;
  sectionRef?: Ref<HTMLDivElement>;
  children: ReactNode;
};

export default function IntegratedHubCollapsibleBlock({
  title,
  subtitle,
  badge,
  badgeTone = 'info',
  defaultOpen = true,
  sectionRef,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div ref={sectionRef} className={styles.integratedSubBlock}>
      <button
        type="button"
        className={styles.integratedSubBlockHead}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className={styles.integratedSubBlockHeadText}>
          <span className={styles.integratedSubBlockTitle}>{title}</span>
          {subtitle ? <span className={styles.integratedSubBlockSub}>{subtitle}</span> : null}
        </div>
        {badge ? (
          <span className={`${styles.integratedSubBlockBadge} ${styles[`integratedSubBadge_${badgeTone}`]}`}>
            {badge}
          </span>
        ) : null}
        <span className={styles.integratedSubBlockToggle} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? <div className={styles.integratedSubBlockBody}>{children}</div> : null}
    </div>
  );
}
