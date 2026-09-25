'use client';

import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import styles from '../MonthDeskAnalysisBoard.module.css';

const KIND_COLOR: Record<string, string> = {
  candidate: '#fcd34d',
  confirmed: '#4ade80',
  confirmed_full: '#22d3ee',
  at_entry: '#a78bfa',
  invalid: '#f87171',
};

type Props = {
  desk: TradeConfirmDesk;
};

export default function TradeConfirmZonesPanel({ desk }: Props) {
  const dirColor = desk.direction === 'LONG' ? '#4ade80' : desk.direction === 'SHORT' ? '#f87171' : '#94a3b8';
  const phaseColor =
    desk.phase === 'confirmed_full'
      ? '#22d3ee'
      : desk.phase === 'confirmed'
        ? '#4ade80'
        : desk.phase === 'candidate'
          ? '#fcd34d'
          : desk.phase === 'at_entry'
            ? '#a78bfa'
            : desk.phase === 'invalid'
              ? '#f87171'
              : '#94a3b8';

  return (
    <div className={styles.confirmZones}>
      <div className={styles.confirmPhaseBanner} style={{ borderColor: `${phaseColor}66`, background: `${phaseColor}14`, color: phaseColor }}>
        {desk.phaseKo}
      </div>

      <div className={styles.confirmStepRow}>
        {desk.steps.map((s) => (
          <div
            key={s.key}
            className={`${styles.confirmStep} ${s.done ? styles.confirmStepDone : ''} ${s.active ? styles.confirmStepActive : ''}`}
            style={
              s.active
                ? { borderColor: phaseColor, color: phaseColor }
                : s.done
                  ? { borderColor: '#4ade8055', color: '#86efac' }
                  : undefined
            }
          >
            {s.done ? '✓' : '○'} {s.label}
          </div>
        ))}
      </div>

      <div className={styles.confirmZoneGrid}>
        <div className={styles.confirmZoneBox} style={{ borderColor: `${dirColor}55`, background: `${dirColor}10` }}>
          <div className={styles.confirmZoneLabel} style={{ color: dirColor }}>
            ★ {desk.direction === 'LONG' ? '롱' : desk.direction === 'SHORT' ? '숏' : '—'} 타점
          </div>
          <div className={styles.confirmZonePrice}>{desk.entryKo}</div>
          <div className={styles.confirmZoneHint}>진입·되돌림 참고 구간</div>
        </div>
        <div className={styles.confirmZoneBox} style={{ borderColor: '#22d3ee55', background: 'rgba(34,211,238,0.08)' }}>
          <div className={styles.confirmZoneLabel} style={{ color: '#67e8f9' }}>
            🛡 확정·방어 자리
          </div>
          <div className={styles.confirmZonePrice}>
            {desk.confirmPrice != null
              ? desk.confirmPrice >= 1000
                ? desk.confirmPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : desk.confirmPrice.toFixed(2)
              : '—'}
          </div>
          <div className={styles.confirmZoneHint}>{desk.confirmKo}</div>
        </div>
      </div>

      {(desk.invalidPrice != null || desk.tp1 != null) && (
        <div className={styles.confirmMetaRow}>
          {desk.invalidPrice != null && (
            <span style={{ color: '#f87171' }}>
              무효 {desk.invalidPrice >= 1000 ? desk.invalidPrice.toLocaleString(undefined, { maximumFractionDigits: 0 }) : desk.invalidPrice.toFixed(2)}
            </span>
          )}
          {desk.tp1 != null && (
            <span style={{ color: '#38bdf8' }}>
              TP1 {desk.tp1 >= 1000 ? desk.tp1.toLocaleString(undefined, { maximumFractionDigits: 0 }) : desk.tp1.toFixed(2)}
            </span>
          )}
          {desk.isFullConfirm && <span style={{ color: '#22d3ee' }}>5/5 확정</span>}
          {desk.mtfBlocked && <span style={{ color: '#fb923c' }}>MTF 보류</span>}
        </div>
      )}
    </div>
  );
}
