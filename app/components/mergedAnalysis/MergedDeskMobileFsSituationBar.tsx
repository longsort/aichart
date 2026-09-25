'use client';

/**
 * 폰 차트 전체화면 — 하단 상황 바.
 * 캔들 위를 가리는 카드 HUD 대신, E/SL/TP·방향을 한 줄로 고정 표시.
 */
import type { SwingMidEntryPack } from '@/lib/mergedDeskSwingMidEntry';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { MergedDeskLivePracticeCue } from '@/lib/mergedDeskLivePracticeCue';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  swingMid: SwingMidEntryPack | null | undefined;
  master: MasterFuturesDecision | null | undefined;
  symbol: string;
  timeframe: string;
  price: number | null | undefined;
  practiceCue?: MergedDeskLivePracticeCue | null;
};

function fmt(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '—';
  return p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.toFixed(1);
}

export function MergedDeskMobileFsSituationBar({
  swingMid,
  master,
  symbol,
  timeframe,
  price,
  practiceCue,
}: Props) {
  const go =
    swingMid?.stance === 'ENTER_LONG' || swingMid?.stance === 'ENTER_SHORT';
  const side =
    swingMid?.side === 'LONG' || swingMid?.side === 'SHORT'
      ? swingMid.side
      : master?.side === 'LONG' || master?.side === 'SHORT'
        ? master.side
        : 'WAIT';
  const sideKo = side === 'LONG' ? '롱' : side === 'SHORT' ? '숏' : '관망';
  const stanceKo = go
    ? 'ENTER'
    : swingMid?.stance === 'WAIT_PULLBACK'
      ? '되돌림'
      : swingMid?.active
        ? '대기'
        : master?.entryAllowed
          ? '가능'
          : '잠금';

  const hasLevels = !!(swingMid && swingMid.entryMid > 0 && swingMid.stopLoss > 0);
  const accent =
    side === 'LONG' ? '#22d3ee' : side === 'SHORT' ? '#f87171' : '#fbbf24';

  return (
    <div
      className={styles.mobileFsSituation}
      data-side={side}
      data-go={go ? '1' : '0'}
      aria-label="차트 상황"
    >
      <div className={styles.mobileFsSituationMain}>
        <span className={styles.mobileFsSituationSide} style={{ color: accent }}>
          {sideKo}
        </span>
        <span className={styles.mobileFsSituationStance}>{stanceKo}</span>
        {swingMid?.grade && swingMid.grade !== 'X' ? (
          <span className={styles.mobileFsSituationGrade}>{swingMid.grade}</span>
        ) : null}
        <span className={styles.mobileFsSituationMeta}>
          {symbol} · {timeframe}
          {price != null && price > 0 ? ` · ${fmt(price)}` : ''}
        </span>
      </div>
      {hasLevels && swingMid ? (
        <div className={styles.mobileFsSituationLevels}>
          <span className={styles.mobileFsLvE}>
            E {fmt(swingMid.entryLow)}–{fmt(swingMid.entryHigh)}
          </span>
          <span className={styles.mobileFsLvSl}>SL {fmt(swingMid.stopLoss)}</span>
          <span className={styles.mobileFsLvTp}>TP1 {fmt(swingMid.tp1)}</span>
          {swingMid.rr > 0 ? (
            <span className={styles.mobileFsSituationRr}>R{swingMid.rr.toFixed(1)}</span>
          ) : null}
        </div>
      ) : (
        <div className={styles.mobileFsSituationHint}>
          {swingMid?.whereKo || master?.reasonKo || '합류·게이트 대기 — 참고용'}
        </div>
      )}
      {swingMid?.settleGateKo ? (
        <div className={styles.mobileFsSituationHint} style={{ opacity: 0.95 }}>
          {swingMid.settleEnterAllowed === false ? '종가HOLD · ' : '종가OK · '}
          {swingMid.settleGateKo}
        </div>
      ) : null}
      {practiceCue ? (
        <div className={styles.mobileFsSituationHint} data-mode={practiceCue.mode}>
          실전·{practiceCue.tagKo} · {practiceCue.lineKo}
        </div>
      ) : null}
    </div>
  );
}
