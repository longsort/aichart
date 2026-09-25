'use client';

import type { MasterFuturesDecision, MergedTradeJudgment } from '@/lib/mergedAnalysisDeskEngine';
import type { SuperStatsHubPack } from '@/lib/mergedDeskSuperStatsHub';
import { AI_SUPER_BIANSHEN_STATS_TAG } from '@/lib/eagle1/aiSuperBianShenStats';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  master?: MasterFuturesDecision | null;
  judgment?: MergedTradeJudgment | null;
  hub?: SuperStatsHubPack | null;
  theme?: 'dark' | 'light';
  onJournal?: () => void;
};

/** 통합분석 — 선물 마스터 + AI超级变身统计 연동 배너 (기능 유지·삭제 없음) */
export default function MergedAnalysisTradeJudgmentBanner({
  master,
  judgment,
  hub = null,
  theme = 'dark',
  onJournal,
}: Props) {
  if (!master && !judgment && !hub?.stats) return null;

  if (master) {
    const hubLong =
      hub?.stats?.verdict === 'CONFIRMED_LONG' || hub?.stats?.verdict === 'LONG_WATCH';
    const hubShort =
      hub?.stats?.verdict === 'CONFIRMED_SHORT' || hub?.stats?.verdict === 'SHORT_WATCH';
    const side = hubLong ? 'LONG' : hubShort ? 'SHORT' : master.side;
    const dirClass =
      side === 'LONG'
        ? styles.judgmentBannerLong
        : side === 'SHORT'
          ? styles.judgmentBannerShort
          : styles.judgmentBannerNeutral;
    const sideKo = side === 'LONG' ? '롱' : side === 'SHORT' ? '숏' : '관망';
    const entryAllowed = hub?.stats ? hub.stats.entryAllowed : master.entryAllowed;
    const lockKo = entryAllowed ? '진입가능' : '진입잠금';
    const head = hub?.stats?.verdictKo ?? master.verdictKo;
    const headline = hub?.stats?.headlineKo ?? master.reasonKo;
    const e = hub?.stats?.entry ?? master.entryPrice;
    const sl = hub?.stats?.stopLoss ?? master.stopPrice;
    const tp1 = hub?.stats?.tp1 ?? master.tp1;

    return (
      <div
        className={`${styles.judgmentBanner} ${styles.masterFuturesBanner} ${dirClass}`}
        data-theme={theme}
        data-bianshen={hub ? '1' : '0'}
        aria-label="선물 마스터 · AI超级变身统计"
      >
        <div className={styles.masterFuturesTop}>
          <div
            className={styles.masterFuturesBadge}
            style={{ color: master.color, borderColor: `${master.color}88` }}
          >
            {sideKo}
          </div>
          <div className={styles.masterFuturesMain}>
            <div className={styles.judgmentBannerHead}>
              {hub ? `${AI_SUPER_BIANSHEN_STATS_TAG} · ${head}` : head}
            </div>
            <div className={styles.judgmentBannerHeadline}>{headline}</div>
          </div>
          <div className={styles.masterFuturesMeta}>
            <span className={styles.masterGrade} data-grade={hub?.stats?.grade ?? master.grade}>
              {hub?.stats?.grade ?? master.grade}
            </span>
            <span>{hub?.stats?.strength ?? master.strength}점</span>
            <span>{lockKo}</span>
            {onJournal ? (
              <button type="button" className={styles.masterJournalBtn} onClick={onJournal}>
                저널
              </button>
            ) : null}
          </div>
        </div>
        <div className={styles.masterFuturesGrid}>
          <div>
            <span>E</span>
            <strong>{e != null && e > 0 ? e.toFixed(0) : '—'}</strong>
          </div>
          <div>
            <span>SL</span>
            <strong>{sl != null && sl > 0 ? sl.toFixed(0) : '—'}</strong>
          </div>
          <div>
            <span>TP1</span>
            <strong>{tp1 != null && tp1 > 0 ? tp1.toFixed(0) : '—'}</strong>
          </div>
          <div>
            <span>RR</span>
            <strong>{master.rr > 0 ? master.rr.toFixed(2) : '—'}</strong>
          </div>
        </div>
        <div className={styles.masterFuturesFoot}>
          {hub?.conflictKo || master.invalidationKo} · 참고·확정수익 아님
        </div>
      </div>
    );
  }

  const dir = judgment?.direction ?? 'NEUTRAL';
  const dirClass =
    dir === 'LONG'
      ? styles.judgmentBannerLong
      : dir === 'SHORT'
        ? styles.judgmentBannerShort
        : styles.judgmentBannerNeutral;

  return (
    <div className={`${styles.judgmentBanner} ${dirClass}`} data-theme={theme} aria-label="매매 판단">
      <div className={styles.judgmentBannerHead}>{judgment!.stanceKo}</div>
      <div className={styles.judgmentBannerHeadline}>{judgment!.headlineKo}</div>
      <div className={styles.judgmentBannerAction}>{judgment!.actionKo}</div>
    </div>
  );
}
