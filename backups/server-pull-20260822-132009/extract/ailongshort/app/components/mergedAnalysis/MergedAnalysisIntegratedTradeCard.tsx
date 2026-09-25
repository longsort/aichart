'use client';

import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  trade: MergedTradeSignal;
  judgment: MergedTradeJudgment | null;
  sourceKo?: string;
};

function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 2 });
}

function dirColor(d: string): string {
  if (d === 'LONG') return '#22c55e';
  if (d === 'SHORT') return '#ef4444';
  return '#94a3b8';
}

export default function MergedAnalysisIntegratedTradeCard({ trade, judgment, sourceKo }: Props) {
  const dir = trade.primary;
  const rr =
    trade.entry && trade.stopLoss
      ? Math.abs((trade.tp1 - trade.entry) / (trade.entry - trade.stopLoss))
      : null;

  return (
    <div className={styles.integratedTradeCard} data-direction={dir}>
      <div className={styles.integratedTradeCardHero}>
        <div className={styles.integratedTradeCardDir}>
          {dir === 'LONG' ? '▲ 롱 시그널' : dir === 'SHORT' ? '▼ 숏 시그널' : '◆ 관망'}
        </div>
        {rr != null && Number.isFinite(rr) ? (
          <span className={styles.integratedTradeCardRr}>RR ~{rr.toFixed(2)}</span>
        ) : null}
      </div>

      <div className={styles.integratedTradeLevelGrid}>
        <div className={styles.integratedTradeLevelCell} data-kind="entry">
          <span>진입 E</span>
          <strong>{fmt(trade.entry)}</strong>
        </div>
        <div className={styles.integratedTradeLevelCell} data-kind="sl">
          <span>손절 SL</span>
          <strong>{fmt(trade.stopLoss)}</strong>
        </div>
        <div className={styles.integratedTradeLevelCell} data-kind="tp">
          <span>TP1</span>
          <strong>{fmt(trade.tp1)}</strong>
        </div>
        <div className={styles.integratedTradeLevelCell} data-kind="tp">
          <span>TP2</span>
          <strong>{fmt(trade.tp2)}</strong>
        </div>
        <div className={styles.integratedTradeLevelCell} data-kind="tp">
          <span>TP3</span>
          <strong>{fmt(trade.tp3)}</strong>
        </div>
      </div>

      <div className={styles.integratedTradeInvalid}>
        {trade.invalidationKo}
        {sourceKo ? ` · ${sourceKo}` : ''}
      </div>

      {judgment ? (
        <div className={styles.integratedTradeJudgment} style={{ color: dirColor(judgment.direction) }}>
          <span className={styles.integratedTradeJudgmentTag}>판단</span>
          {judgment.stanceKo} — {judgment.actionKo}
        </div>
      ) : null}
    </div>
  );
}
