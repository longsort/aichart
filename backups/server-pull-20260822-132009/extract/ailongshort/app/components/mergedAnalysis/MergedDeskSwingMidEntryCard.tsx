'use client';

import type { SwingMidEntryPack } from '@/lib/mergedDeskSwingMidEntry';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  pack: SwingMidEntryPack | null | undefined;
};

function fmt(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '—';
  return p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.toFixed(1);
}

/** 스윙·중투 — 진입자리 1개만 크게 표시 (5~10배) */
export function MergedDeskSwingMidEntryCard({ pack }: Props) {
  if (!pack) return null;

  const go = pack.stance === 'ENTER_LONG' || pack.stance === 'ENTER_SHORT';
  const pull = pack.stance === 'WAIT_PULLBACK';
  const dirClass =
    pack.side === 'LONG'
      ? styles.swingMidLong
      : pack.side === 'SHORT'
        ? styles.swingMidShort
        : styles.swingMidWait;

  return (
    <div
      className={`${styles.swingMidCard} ${dirClass} ${go ? styles.swingMidGo : pull ? styles.swingMidPull : styles.swingMidIdle}`}
      aria-label="스윙 중투 진입자리"
    >
      <div className={styles.swingMidTop}>
        <span className={styles.swingMidBadge}>{go ? '★ 진입' : pull ? '대기' : '관망'}</span>
        <strong className={styles.swingMidHead}>{pack.headlineKo}</strong>
        <span className={styles.swingMidGrade} data-grade={pack.grade}>
          {pack.grade} · {pack.confluence}
        </span>
      </div>

      <div className={styles.swingMidWhere}>{pack.whereKo}</div>
      <div className={styles.swingMidAction}>{pack.actionKo}</div>
      {pack.settleGateKo && (
        <div
          className={styles.swingMidWaitTip}
          style={{
            color: pack.settleEnterAllowed ? '#86efac' : '#fbbf24',
            fontWeight: 800,
          }}
        >
          종가게이트 · {pack.settleGateKo}
          {pack.settleEnterAllowed === false ? ' — ENTER 차단(참고)' : ''}
        </div>
      )}
      {pack.waitForKo && <div className={styles.swingMidWaitTip}>{pack.waitForKo}</div>}

      {pack.entryMid > 0 && (
        <div className={styles.swingMidLevels}>
          <div>
            <em>E</em>
            <span>
              {fmt(pack.entryLow)}~{fmt(pack.entryHigh)}
            </span>
          </div>
          <div>
            <em>SL</em>
            <span>{fmt(pack.stopLoss)}</span>
          </div>
          <div>
            <em>TP1</em>
            <span>{fmt(pack.tp1)}</span>
          </div>
          <div>
            <em>RR</em>
            <span>{pack.rr > 0 ? `${pack.rr.toFixed(2)}R` : '—'}</span>
          </div>
          <div>
            <em>레버</em>
            <span>
              {pack.leverage.minX}~{pack.leverage.maxX}x
              <b> 권장 {pack.leverage.suggestX}x</b>
            </span>
          </div>
        </div>
      )}

      {pack.reasonsKo.length > 0 && (
        <ul className={styles.swingMidReasons}>
          {pack.reasonsKo.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {pack.invalidationKo && <div className={styles.swingMidInvalid}>{pack.invalidationKo}</div>}
      <div className={styles.swingMidFoot}>
        {pack.leverage.sizingKo} · 합류≠승률 · 참고용
      </div>
    </div>
  );
}
