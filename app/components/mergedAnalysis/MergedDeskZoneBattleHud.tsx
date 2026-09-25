'use client';

import type { SmcZoneBattleVerdict } from '@/lib/assets353SmcZoneConflictIntel';
import type { MtfZoneBattlePack } from '@/lib/assets353SmcZoneBattleMtf';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  chartBattle: SmcZoneBattleVerdict | null;
  mtfPack: MtfZoneBattlePack | null;
  chartTf: string;
  loading?: boolean;
  onOpenDetail?: () => void;
  onHide?: () => void;
};

export function MergedDeskZoneBattleHud({
  chartBattle,
  mtfPack,
  chartTf,
  loading,
  onOpenDetail,
  onHide,
}: Props) {
  if (!chartBattle && !mtfPack && !loading) return null;

  const agg = mtfPack?.aggregate ?? chartBattle;
  if (!agg && loading) {
    return (
      <div className={styles.zoneBattleHud} aria-live="polite">
        <div className={styles.zoneBattleHudHead}>
          <div className={styles.zoneBattleHudTitle}>⚔ Zone Battle · MTF</div>
          {onHide && (
            <button
              type="button"
              className={styles.zoneBattleHudHide}
              onClick={onHide}
              title="카드 숨기기 — 툴바 ZoneAI 칩으로 다시 켤 수 있음"
            >
              숨김
            </button>
          )}
        </div>
        <div className={styles.zoneBattleHudSub}>1m~월봉 분석 중…</div>
      </div>
    );
  }
  if (!agg) return null;

  const domCls =
    agg.dominant === 'LONG'
      ? styles.zoneBattleHudDomLong
      : agg.dominant === 'SHORT'
        ? styles.zoneBattleHudDomShort
        : styles.zoneBattleHudDomNeutral;

  return (
    <div className={styles.zoneBattleHud} aria-live="polite">
      <div className={styles.zoneBattleHudHead}>
        <span className={styles.zoneBattleHudTitle}>⚔ Zone Battle AI</span>
        <div className={styles.zoneBattleHudHeadRight}>
          <span className={styles.zoneBattleHudTf}>{chartTf.toUpperCase()} + MTF 9TF</span>
          {onHide && (
            <button
              type="button"
              className={styles.zoneBattleHudHide}
              onClick={onHide}
              title="카드 숨기기 — 툴바 ZoneAI 칩으로 다시 켤 수 있음"
            >
              숨김
            </button>
          )}
        </div>
      </div>
      <div className={`${styles.zoneBattleHudPct} ${domCls}`}>
        <span>L {agg.longPct}%</span>
        <span className={styles.zoneBattleHudSep}>·</span>
        <span>S {agg.shortPct}%</span>
        <span className={styles.zoneBattleHudSep}>·</span>
        <span>돌파 {agg.breakoutPct}%</span>
      </div>
      <div className={styles.zoneBattleHudLine}>
        {agg.dominant === 'LONG' ? '▲' : agg.dominant === 'SHORT' ? '▼' : '◆'}{' '}
        {agg.buyStrength === 'strong' ? '매수강' : agg.buyStrength === 'medium' ? '매수보통' : '매수약'} /{' '}
        {agg.sellStrength === 'strong' ? '매도강' : agg.sellStrength === 'medium' ? '매도보통' : '매도약'}
      </div>
      {mtfPack && (
        <div className={styles.zoneBattleHudMtf}>
          {mtfPack.rows.map((row) => (
            <span
              key={row.tf}
              className={
                row.active
                  ? row.dominant === 'LONG'
                    ? styles.zoneBattleTfLong
                    : row.dominant === 'SHORT'
                      ? styles.zoneBattleTfShort
                      : styles.zoneBattleTfBattle
                  : styles.zoneBattleTfIdle
              }
              title={`${row.tf}: L${row.longPct}% S${row.shortPct}%`}
            >
              {row.tf}
            </span>
          ))}
        </div>
      )}
      {mtfPack?.summaryKo && <div className={styles.zoneBattleHudMeta}>{mtfPack.summaryKo}</div>}
      {onOpenDetail && (
        <button type="button" className={styles.zoneBattleHudBtn} onClick={onOpenDetail}>
          상세 breakdown
        </button>
      )}
      <div className={styles.zoneBattleHudFoot}>조건부 참고 · 확정 수익 아님</div>
    </div>
  );
}
