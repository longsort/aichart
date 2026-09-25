'use client';

import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskTradeAction } from '@/lib/monthDeskTradeAction';
import styles from '../MonthDeskAnalysisBoard.module.css';

type Props = {
  metrics: MonthDeskBoardMetrics;
  ta: MonthDeskTradeAction;
  compact?: boolean;
};

export default function TradeCommandStrip({ metrics, ta, compact }: Props) {
  const v = metrics.verdict;
  const accent = v === 'LONG' ? '#4ade80' : v === 'SHORT' ? '#f87171' : '#fcd34d';
  const en = v === 'LONG' ? 'LONG' : v === 'SHORT' ? 'SHORT' : 'WAIT';

  return (
    <div className={`${styles.cmdStrip} ${compact ? styles.cmdStripCompact : ''}`}>
      <div className={styles.cmdVerdict} style={{ color: accent, borderColor: `${accent}55`, textShadow: `0 0 24px ${accent}44` }}>
        {en}
        {metrics.confidence != null && <span className={styles.cmdConf}>{metrics.confidence}%</span>}
      </div>
      <div className={styles.cmdKpis}>
        <div className={styles.cmdKpi}>
          <span className={styles.cmdKpiLabel}>롱</span>
          <span style={{ color: '#4ade80', fontWeight: 900 }}>{metrics.longPct}%</span>
        </div>
        <div className={styles.cmdKpi}>
          <span className={styles.cmdKpiLabel}>숏</span>
          <span style={{ color: '#f87171', fontWeight: 900 }}>{metrics.shortPct}%</span>
        </div>
        <div className={styles.cmdKpi}>
          <span className={styles.cmdKpiLabel}>확정</span>
          <span style={{ fontWeight: 900, color: metrics.gatesPassCount >= 4 ? '#4ade80' : '#94a3b8' }}>
            {metrics.gatesPassCount}/5
          </span>
        </div>
        {ta.whaleAligned === true && (
          <div className={styles.cmdKpi} style={{ color: '#5eead4' }}>
            고래✓
          </div>
        )}
        {ta.whaleAligned === false && (
          <div className={styles.cmdKpi} style={{ color: '#fca5a5' }}>
            고래✗
          </div>
        )}
      </div>
      {!compact && metrics.gates.length > 0 && (
        <div className={styles.cmdGates}>
          {metrics.gates.map((g) => (
            <span
              key={g.key}
              className={`${styles.cmdGate} ${g.pass ? styles.cmdGateOn : ''}`}
              title={g.label}
            >
              {g.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
