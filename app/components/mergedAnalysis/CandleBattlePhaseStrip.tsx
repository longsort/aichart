'use client';

import type { CandleBattlePack } from '@/lib/candleBattle';
import styles from './MergedAnalysisDesk.module.css';

const PHASE_ORDER = [
  { index: 1, fallback: '① 하락/상승추세' },
  { index: 2, fallback: '② 접근' },
  { index: 3, fallback: '③ 유동성 스윕/SFP' },
  { index: 4, fallback: '④ 흡수' },
  { index: 5, fallback: '⑤ 회복' },
  { index: 6, fallback: '⑥ 상승/하락' },
  { index: 7, fallback: '⑦ 조정/리테스트' },
  { index: 8, fallback: '⑧ 목표 구간' },
] as const;

type Props = {
  pack: CandleBattlePack | null;
};

export default function CandleBattlePhaseStrip({ pack }: Props) {
  if (!pack) return null;
  const byIdx = new Map(pack.phases.map((p) => [p.index, p]));
  const status = pack.decision.status;
  const statusTone =
    status.startsWith('CONFIRMED_LONG') || status === 'LONG_WATCH'
      ? styles.candleBattleStatusLong
      : status.startsWith('CONFIRMED_SHORT') || status === 'SHORT_WATCH'
        ? styles.candleBattleStatusShort
        : styles.candleBattleStatusWait;

  return (
    <div className={styles.candleBattlePhaseStrip} aria-label="실캔들 전투 8단계">
      <div className={styles.candleBattlePhaseHead}>
        <span className={styles.candleBattlePhaseTitle}>REAL CANDLE BATTLE</span>
        <span className={`${styles.candleBattleStatus} ${statusTone}`}>
          {status.replace(/_/g, ' ')}
          {pack.decision.gatePassed != null
            ? ` · ${pack.decision.gatePassed}/${pack.decision.gateTotal}`
            : ''}
        </span>
        <span className={styles.candleBattleQuality} title={pack.qualityNotes.join(' · ')}>
          {pack.quality}
          {pack.availability.replenishment === 'NOT_AVAILABLE' ? ' · REP N/A' : ''}
          {pack.availability.cvd === 'ESTIMATED' ? ' · CVD≈' : ''}
        </span>
      </div>
      <div className={styles.candleBattlePhaseRow}>
        {PHASE_ORDER.map((slot) => {
          const p = byIdx.get(slot.index);
          const active = Boolean(p?.active || p?.confirmed);
          const confirmed = Boolean(p?.confirmed);
          return (
            <div
              key={slot.index}
              className={`${styles.candleBattlePhaseChip}${active ? ` ${styles.candleBattlePhaseChipOn}` : ''}${
                confirmed ? ` ${styles.candleBattlePhaseChipOk}` : ''
              }`}
              title={p ? `${p.detailKo} · ${(p.evidence || []).join(' · ')}` : '미탐지(실데이터 조건 미충족)'}
            >
              <span className={styles.candleBattlePhaseIdx}>{slot.index}</span>
              <span className={styles.candleBattlePhaseLabel}>
                {p?.labelKo?.replace(/^[①-⑧]\s*/, '') || slot.fallback.replace(/^[①-⑧]\s*/, '')}
              </span>
            </div>
          );
        })}
      </div>
      {pack.summaryKo ? (
        <div className={styles.candleBattlePhaseSummary} title={pack.summaryKo}>
          {pack.summaryKo}
        </div>
      ) : null}
    </div>
  );
}
