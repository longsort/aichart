'use client';

import type { Eagle1AiZoneClickDetail } from '@/lib/eagle1/aiZonePack';
import { formatAiZoneExecPrice } from '@/lib/eagle1/aiZonePack';
import styles from './Eagle1AiZoneClickCard.module.css';

type Props = {
  detail: Eagle1AiZoneClickDetail;
  onClose: () => void;
};

export default function Eagle1AiZoneClickCard({ detail, onClose }: Props) {
  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <article
        className={styles.card}
        data-eagle1-region="ai-zone-click-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div>
            <span className={styles.badge}>AI ZONE</span>
            <h3>{detail.titleKo}</h3>
            <p className={styles.side}>{detail.sideKo}</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <section className={styles.block}>
          <h4>겹친 분석</h4>
          <ul className={styles.chips}>
            {detail.overlaps.length ? (
              detail.overlaps.map((row) => (
                <li key={row}>{row}</li>
              ))
            ) : (
              <li className={styles.muted}>단일 신호 · 추가 겹침 없음</li>
            )}
          </ul>
        </section>

        <section className={styles.block}>
          <h4>증거 · 근거</h4>
          <ul className={styles.evidence}>
            {detail.evidence.length ? (
              detail.evidence.map((row) => (
                <li key={row.label} data-tone={row.tone ?? 'neutral'}>
                  {row.label}
                </li>
              ))
            ) : (
              <li className={styles.muted}>표본·구조 데이터 수집 중</li>
            )}
          </ul>
        </section>

        <section className={styles.stats}>
          <div>
            <span>Setup</span>
            <strong>{detail.setupScore ?? '—'}</strong>
          </div>
          <div>
            <span>n=</span>
            <strong>{detail.sampleN}</strong>
          </div>
          <div>
            <span>hold</span>
            <strong>{detail.holdPct != null ? `${detail.holdPct}%` : '—'}</strong>
          </div>
          <div data-side="long">
            <span>롱</span>
            <strong>{detail.longPct ?? '—'}</strong>
          </div>
          <div data-side="short">
            <span>숏</span>
            <strong>{detail.shortPct ?? '—'}</strong>
          </div>
        </section>

        {detail.spotMovePct != null ? (
          <section className={styles.spotMove}>{detail.spotMoveLabelKo}</section>
        ) : null}

        <section className={styles.exec}>
          <div>
            <span>E</span>
            <strong>{formatAiZoneExecPrice(detail.execution.entry)}</strong>
          </div>
          <div>
            <span>SL</span>
            <strong>{formatAiZoneExecPrice(detail.execution.sl)}</strong>
          </div>
          <div>
            <span>TP1</span>
            <strong>{formatAiZoneExecPrice(detail.execution.tp1)}</strong>
          </div>
        </section>

        <footer className={styles.footer}>
          <p>{detail.invalidationKo}</p>
          <p className={styles.disclaimer}>{detail.disclaimerKo}</p>
        </footer>
      </article>
    </div>
  );
}
