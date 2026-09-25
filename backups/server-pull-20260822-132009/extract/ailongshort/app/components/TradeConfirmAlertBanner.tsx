'use client';

import type { TradeConfirmAlert } from '@/app/components/useTradeConfirmNotifier';
import styles from './MonthDeskAnalysisBoard.module.css';

const KIND_STYLE: Record<string, { border: string; bg: string; color: string }> = {
  candidate: { border: '#fcd34d88', bg: 'rgba(252,211,77,0.12)', color: '#fde68a' },
  confirmed: { border: '#4ade8088', bg: 'rgba(74,222,128,0.12)', color: '#86efac' },
  confirmed_full: { border: '#22d3ee88', bg: 'rgba(34,211,238,0.14)', color: '#a5f3fc' },
  at_entry: { border: '#a78bfa88', bg: 'rgba(167,139,250,0.14)', color: '#e9d5ff' },
  invalid: { border: '#f8717188', bg: 'rgba(248,113,113,0.14)', color: '#fca5a5' },
};

export default function TradeConfirmAlertBanner({
  alert,
  onDismiss,
}: {
  alert: TradeConfirmAlert | null;
  onDismiss: () => void;
}) {
  if (!alert) return null;
  const st = KIND_STYLE[alert.kind] ?? KIND_STYLE.confirmed;

  return (
    <div
      className={styles.confirmAlertBanner}
      style={{ borderColor: st.border, background: st.bg }}
      role="status"
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 13, color: st.color, marginBottom: 4 }}>{alert.title}</div>
        <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.45 }}>{alert.body}</div>
      </div>
      <button type="button" className="tool-chip tool-chip-button" style={{ flexShrink: 0, fontSize: 10 }} onClick={onDismiss}>
        닫기
      </button>
    </div>
  );
}
